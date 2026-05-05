export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { getBoss, QUEUE_EXTRACT, QUEUE_GENERATE } = await import('./lib/queue/boss');
  const { registerExtractWorker } = await import('./lib/queue/workers/extract-tender');
  const { registerGenerateWorker } = await import('./lib/queue/workers/generate-tender');

  const boss = await getBoss();
  // pg-boss v10: queues must be created explicitly before send/work
  await boss.createQueue(QUEUE_EXTRACT);
  await boss.createQueue(QUEUE_GENERATE);
  await registerExtractWorker(boss);
  await registerGenerateWorker(boss);
}
