import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { callClaudeVision, SONNET } from '@/lib/ai/claude';
import { FIELD_EXTRACT_SYSTEM, FIELD_EXTRACT_USER } from '@/lib/ai/prompts';
import { renderPage } from '@/lib/pdf/render';
import { imageToPdfBbox, isValidBbox } from '@/lib/pdf/coords';
import { logger } from '@/lib/logger';

const FieldTypeEnum = z.enum([
  'SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'CURRENCY', 'DATE',
  'CHECKBOX', 'RADIO', 'SELECT', 'ID_NUMBER', 'COMPANY_ID',
  'PHONE', 'EMAIL', 'ADDRESS', 'SIGNATURE', 'STAMP', 'LAWYER_BLOCK',
]);

const RawFieldSchema = z.object({
  label: z.string(),
  fieldType: FieldTypeEnum,
  bbox: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  required: z.boolean().default(true),
  maxLength: z.number().nullable().default(null),
});

const RawFieldsSchema = z.object({
  fields: z.array(RawFieldSchema),
});

export async function extractFieldsForAnnex(
  annexId: string,
  pdfPath: string,
  pageTexts: string[],
  jobId?: string,
  onPageDone?: (pageInAnnex: number, totalInAnnex: number) => Promise<void>
): Promise<number> {
  const annex = await prisma.annex.findUniqueOrThrow({ where: { id: annexId } });
  const startPage = annex.startPage ?? 1;
  const endPage = annex.endPage ?? startPage;
  const totalInAnnex = endPage - startPage + 1;

  // Remove old fields (re-run safe)
  await prisma.field.deleteMany({ where: { annexId } });

  let totalFields = 0;

  for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
    const pageInAnnex = pageNum - startPage + 1;
    logger.info({ annexId, annexCode: annex.code, pageNum, pageInAnnex, totalInAnnex }, 'extracting fields from page');

    let rendered;
    try {
      rendered = await renderPage(pdfPath, pageNum);
    } catch (err) {
      logger.warn({ pageNum, err }, 'failed to render page, skipping');
      continue;
    }

    const pageText = pageTexts[pageNum - 1] ?? '';

    const { result: raw } = await callClaudeVision<{ fields: unknown[] }>({
      model: SONNET,
      system: FIELD_EXTRACT_SYSTEM,
      imageBase64: rendered.imageBase64,
      userText: FIELD_EXTRACT_USER({
        pageNum,
        annexCode: annex.code,
        widthPx: rendered.widthPx,
        heightPx: rendered.heightPx,
        pageText,
      }),
      toolName: 'extract_fields',
      toolSchema: {
        type: 'object',
        properties: {
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                fieldType: { type: 'string' },
                bbox: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    width: { type: 'number' },
                    height: { type: 'number' },
                  },
                  required: ['x', 'y', 'width', 'height'],
                },
                required: { type: 'boolean' },
                maxLength: { type: 'number' },
              },
              required: ['label', 'fieldType', 'bbox'],
            },
          },
        },
        required: ['fields'],
      },
      maxTokens: 4096,
      jobId,
    });

    const parsed = RawFieldsSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn({ error: parsed.error.message, pageNum }, 'field parse error, skipping page');
      continue;
    }

    const fields = parsed.data.fields;
    if (fields.length === 0) continue;

    const fieldData = fields
      .map((f) => {
        const pdfBbox = imageToPdfBbox(
          f.bbox,
          rendered.widthPx,
          rendered.heightPx,
          rendered.widthPts,
          rendered.heightPts
        );

        if (!isValidBbox(pdfBbox, rendered.widthPts, rendered.heightPts)) {
          logger.warn({ label: f.label, pdfBbox }, 'field bbox out of bounds, skipping');
          return null;
        }

        return {
          annexId,
          label: f.label,
          fieldType: f.fieldType,
          page: pageNum,
          bbox: pdfBbox as object,  // Prisma Json field
          required: f.required,
          maxLength: f.maxLength ?? null,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    if (fieldData.length > 0) {
      await prisma.field.createMany({ data: fieldData });
      totalFields += fieldData.length;
    }

    logger.info({ pageNum, fieldsFound: fieldData.length }, 'page field extraction complete');

    if (onPageDone) await onPageDone(pageInAnnex, totalInAnnex);
  }

  await prisma.annex.update({
    where: { id: annexId },
    data: { status: 'EXTRACTED' },
  });

  return totalFields;
}
