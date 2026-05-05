import PgBoss from 'pg-boss';
import { logger } from '@/lib/logger';
import { runExtractionPipeline } from '@/lib/extraction/pipeline';
import { QUEUE_EXTRACT } from '@/lib/queue/boss';

type ExtractPayload = { jobId: string };

export async function registerExtractWorker(boss: PgBoss): Promise<void> {
  await boss.work<ExtractPayload>(QUEUE_EXTRACT, async (jobs) => {
    for (const job of jobs) {
      const { jobId } = job.data;
      logger.info({ pgBossJobId: job.id, jobId }, 'extract worker received job');
      await runExtractionPipeline(jobId);
    }
  });
  logger.info({ queue: QUEUE_EXTRACT }, 'extract worker registered');
}
