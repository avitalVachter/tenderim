import { z } from 'zod';
import { callClaudeStructured, SONNET } from '@/lib/ai/claude';
import { SEGMENT_SYSTEM, SEGMENT_USER } from '@/lib/ai/prompts';

const AnnexSchema = z.object({
  code: z.string(),
  title: z.string(),
  startPage: z.number().int().positive(),
  endPage: z.number().int().positive(),
});

export type AnnexSegment = z.infer<typeof AnnexSchema>;

const SegmentResultSchema = z.object({
  annexes: z.array(AnnexSchema),
});

export async function segmentAnnexes(
  pageExcerpts: Array<{ page: number; text: string }>,
  jobId?: string
): Promise<AnnexSegment[]> {
  const { result } = await callClaudeStructured<{ annexes: unknown[] }>({
    model: SONNET,
    system: SEGMENT_SYSTEM,
    user: SEGMENT_USER(pageExcerpts),
    toolName: 'segment_annexes',
    toolSchema: {
      type: 'object',
      properties: {
        annexes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'Annex code, e.g. "נספח א\'"' },
              title: { type: 'string', description: 'Full annex title in Hebrew' },
              startPage: { type: 'integer', description: '1-indexed page number' },
              endPage: { type: 'integer', description: '1-indexed page number' },
            },
            required: ['code', 'title', 'startPage', 'endPage'],
          },
        },
      },
      required: ['annexes'],
    },
    maxTokens: 2048,
    jobId,
  });

  return SegmentResultSchema.parse(result).annexes;
}
