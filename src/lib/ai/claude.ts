import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@/lib/logger';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const SONNET = 'claude-sonnet-4-6';
export const HAIKU = 'claude-haiku-4-5-20251001';

export interface CallResult<T> {
  result: T;
  inputTokens: number;
  outputTokens: number;
}

export async function callClaudeVision<T>(params: {
  model: string;
  system: string;
  imageBase64: string;
  userText: string;
  toolName: string;
  toolSchema: Anthropic.Tool['input_schema'];
  maxTokens?: number;
  jobId?: string;
}): Promise<CallResult<T>> {
  const { model, system, imageBase64, userText, toolName, toolSchema, maxTokens = 4096, jobId } = params;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        tools: [{ name: toolName, description: 'Output structured result', input_schema: toolSchema }],
        tool_choice: { type: 'tool', name: toolName },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
              { type: 'text', text: userText },
            ],
          },
        ],
      });

      const block = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (!block) throw new Error('No tool_use block in Claude vision response');

      logger.info({ model, toolName, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, jobId, attempt }, 'claude vision call');

      return { result: block.input as T, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn({ error: lastError.message, attempt, toolName }, 'claude vision call failed');
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw lastError ?? new Error('Claude vision call failed after 3 attempts');
}

export async function callClaudeStructured<T>(params: {
  model: string;
  system: string;
  user: string;
  toolName: string;
  toolSchema: Anthropic.Tool['input_schema'];
  maxTokens?: number;
  jobId?: string;
}): Promise<CallResult<T>> {
  const { model, system, user, toolName, toolSchema, maxTokens = 4096, jobId } = params;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        tools: [{ name: toolName, description: 'Output structured result', input_schema: toolSchema }],
        tool_choice: { type: 'tool', name: toolName },
        messages: [{ role: 'user', content: user }],
      });

      const block = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (!block) throw new Error('No tool_use block in Claude response');

      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      logger.info({ model, toolName, inputTokens, outputTokens, jobId, attempt }, 'claude call');

      return { result: block.input as T, inputTokens, outputTokens };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn({ error: lastError.message, attempt, toolName }, 'claude call failed');
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw lastError ?? new Error('Claude call failed after 3 attempts');
}
