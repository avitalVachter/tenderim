import PgBoss from 'pg-boss';
import { logger } from '@/lib/logger';
import { runQuickDedup } from '@/lib/extraction/passes/quick-dedup';
import { QUEUE_QUICK_DEDUP } from '@/lib/queue/boss';

type QuickDedupPayload = { tenderId: string };

export async function registerQuickDedupWorker(boss: PgBoss): Promise<void> {
  await boss.work<QuickDedupPayload>(QUEUE_QUICK_DEDUP, async (jobs) => {
    for (const job of jobs) {
      const { tenderId } = job.data;
      logger.info({ pgBossJobId: job.id, tenderId }, 'quick-dedup worker received job');
      await runQuickDedup(tenderId);
    }
  });
  logger.info({ queue: QUEUE_QUICK_DEDUP }, 'quick-dedup worker registered');
}
