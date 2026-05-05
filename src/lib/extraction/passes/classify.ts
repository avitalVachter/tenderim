import { z } from 'zod';
import { callClaudeStructured, HAIKU } from '@/lib/ai/claude';
import { CLASSIFY_SYSTEM, CLASSIFY_USER } from '@/lib/ai/prompts';

const FileClassification = z.enum([
  'MAIN_TENDER',
  'ANNEX_FORM',
  'SPEC',
  'CONTRACT',
  'REFERENCE_DATA',
  'PRICE_SHEET',
  'OTHER',
]);

export type FileClassificationType = z.infer<typeof FileClassification>;

const ClassifySchema = z.record(z.string(), FileClassification);

export interface FileInfo {
  filename: string;
  fileType: string;
  pageCount?: number | null;
  firstPagesText?: string;
}

export async function classifyFiles(
  files: FileInfo[],
  jobId?: string
): Promise<Record<string, FileClassificationType>> {
  const { result } = await callClaudeStructured<Record<string, string>>({
    model: HAIKU,
    system: CLASSIFY_SYSTEM,
    user: CLASSIFY_USER(files),
    toolName: 'classify_files',
    toolSchema: {
      type: 'object',
      description: 'Map of filename to classification string',
      properties: {
        classifications: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Filename → classification',
        },
      },
      required: ['classifications'],
    },
    maxTokens: 512,
    jobId,
  });

  const raw = (result as { classifications?: Record<string, string> }).classifications ?? result;
  return ClassifySchema.parse(raw);
}
