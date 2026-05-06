import { z } from 'zod';
import { Prisma, Question, Answer, QuestionCategory } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { callClaudeStructured, SONNET } from '@/lib/ai/claude';
import { DEDUP_SYSTEM, DEDUP_USER } from '@/lib/ai/prompts';
import { logger } from '@/lib/logger';
import { getBoss, QUEUE_STEP_READY, SEND_OPTS_STEP_READY } from '@/lib/queue/boss';

const CATEGORY_STEP: Record<QuestionCategory, number | null> = {
  COMPANY_INFO: 1,
  SIGNATORY_INFO: 2,
  EXPERIENCE: 3,
  DECLARATIONS: 4,
  NARRATIVE: 5,
  REVIEW: null, // handoff Pattern 1 — REVIEW step is suppressed
};

type QuestionWithAnswer = Question & { answer: Answer | null };

const QuestionCategoryEnum = z.enum([
  'COMPANY_INFO', 'SIGNATORY_INFO', 'EXPERIENCE', 'DECLARATIONS', 'NARRATIVE', 'REVIEW',
]);

const FieldTypeEnum = z.enum([
  'SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'CURRENCY', 'DATE',
  'CHECKBOX', 'RADIO', 'SELECT', 'ID_NUMBER', 'COMPANY_ID',
  'PHONE', 'EMAIL', 'ADDRESS', 'SIGNATURE', 'STAMP', 'LAWYER_BLOCK',
]);

const CanonicalQuestionSchema = z.object({
  tempId: z.string(),
  category: QuestionCategoryEnum,
  label: z.string(),
  helpText: z.string().nullable().optional(),
  fieldType: FieldTypeEnum,
  required: z.boolean(),
  order: z.number().int(),
  fieldIds: z.array(z.string()),
  // Pass 5 confidence (0–1) — used for Pattern 3 autofill threshold
  confidence: z.number().min(0).max(1).optional().default(1.0),
});

const DedupResultSchema = z.object({
  questions: z.array(CanonicalQuestionSchema),
});

const AUTOFILL_THRESHOLD = parseFloat(process.env.AUTOFILL_CONFIDENCE_THRESHOLD ?? '0.85');

/**
 * Pass 5 — full dedup with reconciliation. Replaces the older "deleteMany +
 * insert" pattern with a merge that preserves Question rows created by
 * Pass 4.5 (quick-dedup) and any Answer rows the user has already filled in.
 *
 * Match key: canonical label (Question.label). Pass 4.5 creates universal
 * Questions like "שם החברה"; Pass 5 will return "שם החברה" for the matching
 * cluster and we merge into the existing row.
 *
 * Also handles Pattern 3 within-tender auto-fill: when a newly-created
 * Question has the same canonical label as a Question the user already
 * answered (or Claude-marked high-confidence match), copy the answer.
 */
export async function deduplicateFields(tenderId: string, jobId?: string): Promise<number> {
  // All non-human fields, with their annex codes for the prompt
  const fields = await prisma.field.findMany({
    where: {
      annex: { tenderId },
      fieldType: { notIn: ['SIGNATURE', 'STAMP', 'LAWYER_BLOCK'] },
    },
    include: { annex: { select: { code: true } } },
  });

  if (fields.length === 0) {
    logger.info({ tenderId }, 'no fields to dedup');
    return 0;
  }

  // Existing questions (from Pass 4.5 + previous Pass 5 runs) keyed by label
  const existingQuestions = await prisma.question.findMany({
    where: { tenderId },
    include: { answer: true },
  });
  const byLabel = new Map(existingQuestions.map((q) => [q.label, q]));

  const fieldInput = fields.map((f) => ({
    id: f.id,
    label: f.label,
    fieldType: f.fieldType,
    annexCode: f.annex.code,
  }));

  const { result: raw } = await callClaudeStructured<{ questions: unknown[] }>({
    model: SONNET,
    system: DEDUP_SYSTEM,
    user: DEDUP_USER(fieldInput),
    toolName: 'dedup_fields',
    toolSchema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tempId: { type: 'string' },
              category: { type: 'string' },
              label: { type: 'string' },
              helpText: { type: 'string' },
              fieldType: { type: 'string' },
              required: { type: 'boolean' },
              order: { type: 'integer' },
              fieldIds: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'number' },
            },
            required: ['tempId', 'category', 'label', 'fieldType', 'required', 'order', 'fieldIds'],
          },
        },
      },
      required: ['questions'],
    },
    maxTokens: 8192,
    jobId,
  });

  const parsed = DedupResultSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Dedup parse failed: ${parsed.error.message}`);

  const incoming = parsed.data.questions;
  const fieldToAnnexCode = new Map(fields.map((f) => [f.id, f.annex.code]));

  // Track which existing question labels were "seen" by Pass 5 — leftover
  // ones may be quick-dedup questions Pass 5 didn't return; keep them.
  const seenLabels = new Set<string>();
  // For autofill: list of Questions that already have answers (the source pool)
  const answeredQuestions = existingQuestions.filter((q) => q.answer);

  let preserved = 0;
  let created = 0;
  let autofillCreated = 0;

  for (const q of incoming) {
    const annexCodes = [...new Set(q.fieldIds.map((id) => fieldToAnnexCode.get(id) ?? '').filter(Boolean))];
    const existing = byLabel.get(q.label);
    seenLabels.add(q.label);

    let questionId: string;
    let isNewQuestion = false;

    if (existing) {
      // MERGE: preserve Question.id (and its Answer), update non-identity fields
      preserved++;
      await prisma.question.update({
        where: { id: existing.id },
        data: {
          category: q.category,
          fieldType: q.fieldType,
          helpText: q.helpText ?? null,
          required: q.required,
          order: q.order,
          appearsInAnnexes: annexCodes,
        },
      });
      questionId = existing.id;
    } else {
      // CREATE: new question. Candidate for auto-fill if its label matches
      // a question the user already answered.
      const newQ = await prisma.question.create({
        data: {
          tenderId,
          category: q.category,
          label: q.label,
          helpText: q.helpText ?? null,
          fieldType: q.fieldType,
          required: q.required,
          order: q.order,
          appearsInAnnexes: annexCodes,
        },
      });
      questionId = newQ.id;
      created++;
      isNewQuestion = true;
    }

    // Re-link the cluster's fields to this question
    if (q.fieldIds.length > 0) {
      await prisma.field.updateMany({
        where: { id: { in: q.fieldIds } },
        data: { questionId },
      });
    }

    // Pattern 3 — within-tender auto-fill on newly-created questions only.
    // (Existing questions with answers are themselves the source pool, not targets.)
    if (isNewQuestion) {
      const sourceMatch = findAutofillSource(q.label, q.fieldType, answeredQuestions);
      if (sourceMatch) {
        const isHighConfidence = sourceMatch.confidence >= AUTOFILL_THRESHOLD;
        await prisma.answer.create({
          data: {
            tenderId,
            questionId,
            value: sourceMatch.source.answer!.value as Prisma.InputJsonValue,
            autofillSource: sourceMatch.source.id,
            autofillConfirmed: isHighConfidence,
            autofillConfidence: sourceMatch.confidence,
          },
        });
        autofillCreated++;
      }
    }
  }

  logger.info(
    { tenderId, preserved, created, autofillCreated, totalIncoming: incoming.length, leftoverDrafts: existingQuestions.length - preserved },
    'dedup merge complete'
  );

  // Step-ready emails: enqueue once for the set of steps that have NEW questions
  // (categories that didn't exist before this dedup run, or had zero questions).
  await enqueueStepReadyForNewSteps(tenderId, existingQuestions, incoming);

  return preserved + created;
}

async function enqueueStepReadyForNewSteps(
  tenderId: string,
  beforeQuestions: QuestionWithAnswer[],
  incomingQuestions: Array<{ category: QuestionCategory }>
): Promise<void> {
  // Steps that had ≥1 question BEFORE the merge — don't re-notify
  const previouslyHadStep = new Set<number>();
  for (const q of beforeQuestions) {
    const s = CATEGORY_STEP[q.category];
    if (s !== null) previouslyHadStep.add(s);
  }

  // Steps the new dedup result populates (post-merge, by category)
  const nowHasStep = new Set<number>();
  for (const q of incomingQuestions) {
    const s = CATEGORY_STEP[q.category];
    if (s !== null) nowHasStep.add(s);
  }

  // Steps that became "ready" only now
  const triggeredSteps = [...nowHasStep].filter((s) => !previouslyHadStep.has(s));
  if (triggeredSteps.length === 0) return;

  try {
    const boss = await getBoss();
    await boss.send(QUEUE_STEP_READY, { tenderId, triggeredSteps }, SEND_OPTS_STEP_READY);
    logger.info({ tenderId, triggeredSteps }, 'step-ready email enqueued (90s batch window)');
  } catch (err) {
    logger.warn({ tenderId, err }, 'failed to enqueue step-ready email');
  }
}

/**
 * Find an answered Question whose label is a strong semantic match for the
 * given new question. Currently uses exact-label match (Pass 4.5 universals)
 * which gives confidence 1.0. Future: incorporate per-mapping confidence
 * scores from Claude when the prompt is extended.
 */
function findAutofillSource(
  newLabel: string,
  newFieldType: string,
  answered: QuestionWithAnswer[]
): { source: QuestionWithAnswer; confidence: number } | null {
  // Exact label match — Pass 4.5 universals carry over cleanly
  const exact = answered.find((q) => q.label === newLabel && q.fieldType === newFieldType);
  if (exact) return { source: exact, confidence: 1.0 };
  return null;
}
