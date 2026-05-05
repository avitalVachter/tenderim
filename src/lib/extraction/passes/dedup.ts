import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { callClaudeStructured, SONNET } from '@/lib/ai/claude';
import { DEDUP_SYSTEM, DEDUP_USER } from '@/lib/ai/prompts';
import { logger } from '@/lib/logger';

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
});

const DedupResultSchema = z.object({
  questions: z.array(CanonicalQuestionSchema),
});

export async function deduplicateFields(tenderId: string, jobId?: string): Promise<number> {
  // Get all fields except human-only types
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

  const questions = parsed.data.questions;

  // Remove old questions (re-run safe)
  await prisma.question.deleteMany({ where: { tenderId } });

  // Build annex code lookup for appearsInAnnexes
  const fieldToAnnexCode = new Map(fields.map((f) => [f.id, f.annex.code]));

  for (const q of questions) {
    const annexCodes = [...new Set(q.fieldIds.map((id) => fieldToAnnexCode.get(id) ?? '').filter(Boolean))];

    const question = await prisma.question.create({
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

    // Link fields to this question
    if (q.fieldIds.length > 0) {
      await prisma.field.updateMany({
        where: { id: { in: q.fieldIds } },
        data: { questionId: question.id },
      });
    }
  }

  logger.info({ tenderId, questionCount: questions.length, fieldCount: fields.length }, 'dedup complete');
  return questions.length;
}
