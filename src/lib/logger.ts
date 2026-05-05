import pino from 'pino';

// pino-pretty's thread-stream transport doesn't work reliably when loaded through
// webpack (instrumentation context). Plain pino JSON logs are used instead.
// To get pretty output in dev: pipe to pino-pretty → `npm run dev | pino-pretty`
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});
