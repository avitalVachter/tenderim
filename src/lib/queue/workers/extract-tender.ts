import PgBoss from 'pg-boss';
import { logger } from '@/lib/logger';
import { runExtractionPipeline } from '@/lib/extraction/pipeline';
import { QUEUE_EXTRACT } from '@/lib/queue/boss';

type ExtractPayload = { jobId: string };

export async function registerExtractWorker(boss: PgBoss): Promise<void> {
  // Note: pg-boss retry config is set on send(), not on work(). The worker
  // just needs to throw on transient failure — pg-boss will re-deliver the
  // job per the retryLimit/retryDelay configured at enqueue time. The pipeline
  // is per-annex resumable, so retries are cheap.
  await boss.work<ExtractPayload>(QUEUE_EXTRACT, async (jobs) => {
    for (const job of jobs) {
      const { jobId } = job.data;
      logger.info({ pgBossJobId: job.id, jobId }, 'extract worker received job');
      await runExtractionPipeline(jobId);
    }
  });
  logger.info({ queue: QUEUE_EXTRACT }, 'extract worker registered');
}
