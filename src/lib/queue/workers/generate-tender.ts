import PgBoss from 'pg-boss';
import { logger } from '@/lib/logger';
import { runGenerationPipeline } from '@/lib/generation/pipeline';
import { QUEUE_GENERATE } from '@/lib/queue/boss';

type GeneratePayload = { jobId: string };

export async function registerGenerateWorker(boss: PgBoss): Promise<void> {
  await boss.work<GeneratePayload>(QUEUE_GENERATE, async (jobs) => {
    for (const job of jobs) {
      const { jobId } = job.data;
      logger.info({ pgBossJobId: job.id, jobId }, 'generate worker received job');
      await runGenerationPipeline(jobId);
    }
  });
  logger.info({ queue: QUEUE_GENERATE }, 'generate worker registered');
}
