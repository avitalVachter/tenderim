export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { getBoss, QUEUE_EXTRACT, QUEUE_GENERATE, QUEUE_QUICK_DEDUP, QUEUE_STEP_READY } = await import('./lib/queue/boss');
  const { registerExtractWorker } = await import('./lib/queue/workers/extract-tender');
  const { registerGenerateWorker } = await import('./lib/queue/workers/generate-tender');
  const { registerQuickDedupWorker } = await import('./lib/queue/workers/quick-dedup');
  const { registerStepReadyWorker } = await import('./lib/queue/workers/step-ready-email');

  const boss = await getBoss();
  // pg-boss v10: queues must be created explicitly before send/work
  await boss.createQueue(QUEUE_EXTRACT);
  await boss.createQueue(QUEUE_GENERATE);
  await boss.createQueue(QUEUE_QUICK_DEDUP);
  await boss.createQueue(QUEUE_STEP_READY);
  await registerExtractWorker(boss);
  await registerGenerateWorker(boss);
  await registerQuickDedupWorker(boss);
  await registerStepReadyWorker(boss);
}
