import PgBoss from 'pg-boss';
import { logger } from '@/lib/logger';

let boss: PgBoss | null = null;
let startPromise: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;

  if (startPromise) return startPromise;

  startPromise = (async () => {
    const instance = new PgBoss({
      connectionString: process.env.DATABASE_URL!,
      schema: process.env.PGBOSS_SCHEMA ?? 'pgboss',
    });
    instance.on('error', (err) => logger.error({ err }, 'pg-boss error'));
    await instance.start();
    boss = instance;
    logger.info('pg-boss started');
    return instance;
  })();

  return startPromise;
}

export async function stopBoss(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = null;
    startPromise = null;
    logger.info('pg-boss stopped');
  }
}

export const QUEUE_EXTRACT = 'tender.extract';
export const QUEUE_GENERATE = 'tender.generate';
export const QUEUE_QUICK_DEDUP = 'tender.quick-dedup';
export const QUEUE_STEP_READY = 'email.step-ready';

// Retry on transient failures (DNS, rate limits, timeouts). The extract
// pipeline is per-annex resumable so retries are cheap; previously-EXTRACTED
// annexes are skipped and only PENDING ones are re-processed.
export const SEND_OPTS_EXTRACT = {
  retryLimit: 3,
  retryDelay: 60, // seconds
  retryBackoff: true,
} as const;

export const SEND_OPTS_GENERATE = {
  retryLimit: 2,
  retryDelay: 30,
  retryBackoff: true,
} as const;

export const SEND_OPTS_QUICK_DEDUP = {
  retryLimit: 2,
  retryDelay: 15,
  retryBackoff: true,
} as const;

// Email step-ready uses a 90s startAfter for batching: multiple steps that
// complete within the window are coalesced by the worker into one email.
export const SEND_OPTS_STEP_READY = {
  startAfter: 90, // seconds — batch window
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
} as const;
