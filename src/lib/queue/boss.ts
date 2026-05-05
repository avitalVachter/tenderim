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
