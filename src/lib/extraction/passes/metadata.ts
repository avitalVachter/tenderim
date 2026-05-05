import { z } from 'zod';
import { callClaudeStructured, SONNET } from '@/lib/ai/claude';
import { METADATA_SYSTEM, METADATA_USER } from '@/lib/ai/prompts';

const MilestoneSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  date: z.string(),
  category: z.enum(['DATE', 'DOCUMENT', 'GUARANTEE', 'SIGNATURE', 'PHYSICAL_ACTION']),
  isDeadline: z.boolean(),
});

const MetadataSchema = z.object({
  title: z.string(),
  publisher: z.string().nullable(),
  tenderNumber: z.string().nullable(),
  deadline: z.string().nullable(),
  ervutAmount: z.number().nullable(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  submissionMethod: z.string().nullable(),
  milestones: z.array(MilestoneSchema),
});

export type TenderMetadata = z.infer<typeof MetadataSchema>;

export async function extractMetadata(text: string, jobId?: string): Promise<TenderMetadata> {
  const { result } = await callClaudeStructured<unknown>({
    model: SONNET,
    system: METADATA_SYSTEM,
    user: METADATA_USER(text),
    toolName: 'extract_metadata',
    toolSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        publisher: { type: 'string' },
        tenderNumber: { type: 'string' },
        deadline: { type: 'string', description: 'ISO 8601 datetime string or null' },
        ervutAmount: { type: 'number', description: 'Guarantee amount in NIS or null' },
        contactName: { type: 'string' },
        contactEmail: { type: 'string' },
        contactPhone: { type: 'string' },
        submissionMethod: { type: 'string' },
        milestones: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              date: { type: 'string', description: 'ISO 8601 datetime string' },
              category: {
                type: 'string',
                enum: ['DATE', 'DOCUMENT', 'GUARANTEE', 'SIGNATURE', 'PHYSICAL_ACTION'],
              },
              isDeadline: { type: 'boolean' },
            },
            required: ['title', 'date', 'category', 'isDeadline'],
          },
        },
      },
      required: ['title', 'milestones'],
    },
    maxTokens: 4096,
    jobId,
  });

  return MetadataSchema.parse(result);
}
