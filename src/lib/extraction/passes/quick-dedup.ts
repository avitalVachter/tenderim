import { z } from 'zod';
import { QuestionCategory, FieldType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { callClaudeStructured, HAIKU } from '@/lib/ai/claude';
import { QUICK_DEDUP_SYSTEM, QUICK_DEDUP_USER } from '@/lib/ai/prompts';
import { logger } from '@/lib/logger';

/**
 * Pass 4.5 — quick-start dedup. Runs after the first annex completes Pass 4
 * to give the user a draft wizard within ~3 minutes of upload, instead of
 * waiting 25–40 min for full Pass 5. Maps fields to a fixed set of 8
 * universal questions every tender asks. Cheap (Haiku, ~$0.02 per call).
 *
 * Idempotent: re-running creates no duplicate Question rows. Pass 5 later
 * preserves these Questions (matched by canonical label) and merges in
 * everything else.
 */

interface UniversalQuestion {
  canonical: string;
  category: QuestionCategory;
  fieldType: FieldType;
  order: number;
}

const UNIVERSALS: UniversalQuestion[] = [
  { canonical: 'שם החברה', category: 'COMPANY_INFO', fieldType: 'SHORT_TEXT', order: 1 },
  { canonical: 'ח.פ.', category: 'COMPANY_INFO', fieldType: 'COMPANY_ID', order: 2 },
  { canonical: 'כתובת', category: 'COMPANY_INFO', fieldType: 'ADDRESS', order: 3 },
  { canonical: 'טלפון', category: 'COMPANY_INFO', fieldType: 'PHONE', order: 4 },
  { canonical: 'אימייל', category: 'COMPANY_INFO', fieldType: 'EMAIL', order: 5 },
  { canonical: 'שם החותם', category: 'SIGNATORY_INFO', fieldType: 'SHORT_TEXT', order: 10 },
  { canonical: 'ת.ז. החותם', category: 'SIGNATORY_INFO', fieldType: 'ID_NUMBER', order: 11 },
  { canonical: 'תפקיד', category: 'SIGNATORY_INFO', fieldType: 'SHORT_TEXT', order: 12 },
];

const MIN_CONFIDENCE = 0.85;
const MAX_FIELDS_PER_CALL = 120; // first annex fields, capped

const MappingsSchema = z.object({
  mappings: z.array(
    z.object({
      fieldId: z.string(),
      canonical: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    })
  ),
});

export async function runQuickDedup(tenderId: string): Promise<number> {
  // Source: only EXTRACTED annexes' fields, only ones not yet linked to a question.
  // Excludes human-only types.
  const fields = await prisma.field.findMany({
    where: {
      annex: { tenderId, status: 'EXTRACTED' },
      fieldType: { notIn: ['SIGNATURE', 'STAMP', 'LAWYER_BLOCK'] },
      questionId: null,
    },
    select: { id: true, label: true, fieldType: true },
    take: MAX_FIELDS_PER_CALL,
  });

  if (fields.length === 0) {
    logger.info({ tenderId }, 'quick-dedup: no eligible fields yet, skipping');
    return 0;
  }

  const universals = UNIVERSALS.map((u) => u.canonical);
  const { result: raw } = await callClaudeStructured<{ mappings: unknown[] }>({
    model: HAIKU,
    system: QUICK_DEDUP_SYSTEM,
    user: QUICK_DEDUP_USER(fields, universals),
    toolName: 'quick_dedup_map',
    toolSchema: {
      type: 'object',
      properties: {
        mappings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fieldId: { type: 'string' },
              canonical: { type: ['string', 'null'] },
              confidence: { type: 'number' },
            },
            required: ['fieldId', 'canonical', 'confidence'],
          },
        },
      },
      required: ['mappings'],
    },
    maxTokens: 4096,
  });

  const parsed = MappingsSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn({ tenderId, error: parsed.error.message }, 'quick-dedup parse error');
    return 0;
  }

  // Group field IDs by canonical (only above threshold)
  const fieldsByCanonical = new Map<string, string[]>();
  for (const m of parsed.data.mappings) {
    if (!m.canonical || m.confidence < MIN_CONFIDENCE) continue;
    if (!UNIVERSALS.some((u) => u.canonical === m.canonical)) continue; // ignore hallucinations
    const list = fieldsByCanonical.get(m.canonical) ?? [];
    list.push(m.fieldId);
    fieldsByCanonical.set(m.canonical, list);
  }

  let created = 0;
  let linkedFields = 0;

  for (const u of UNIVERSALS) {
    const matchingFieldIds = fieldsByCanonical.get(u.canonical) ?? [];
    if (matchingFieldIds.length === 0) continue;

    // Idempotent upsert by (tenderId, label) — Pass 5 reconciliation will use
    // the same canonical_label key to preserve these Question rows.
    const existing = await prisma.question.findFirst({
      where: { tenderId, label: u.canonical },
    });

    let questionId: string;
    if (existing) {
      questionId = existing.id;
    } else {
      const annexCodes = await prisma.field.findMany({
        where: { id: { in: matchingFieldIds } },
        select: { annex: { select: { code: true } } },
      });
      const uniqueCodes = [...new Set(annexCodes.map((f) => f.annex.code))];

      const q = await prisma.question.create({
        data: {
          tenderId,
          category: u.category,
          label: u.canonical,
          fieldType: u.fieldType,
          required: true,
          order: u.order,
          appearsInAnnexes: uniqueCodes,
        },
      });
      questionId = q.id;
      created++;
    }

    const updated = await prisma.field.updateMany({
      where: { id: { in: matchingFieldIds }, questionId: null },
      data: { questionId },
    });
    linkedFields += updated.count;
  }

  logger.info(
    { tenderId, created, linkedFields, fieldsConsidered: fields.length },
    'quick-dedup complete'
  );
  return created;
}
