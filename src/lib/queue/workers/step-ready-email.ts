import PgBoss from 'pg-boss';
import { render } from '@react-email/render';
import { QuestionCategory } from '@prisma/client';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db/prisma';
import { sendEmail } from '@/lib/email/client';
import { StepReadyEmail, stepReadySubject, stepReadyBatchSubject } from '@/lib/emails/step-ready';
import { QUEUE_STEP_READY } from '@/lib/queue/boss';

type Payload = {
  tenderId: string;
  // Steps for which questions newly became available since the last email
  triggeredSteps: number[];
};

const STEP_CATEGORY: Record<number, QuestionCategory> = {
  1: 'COMPANY_INFO',
  2: 'SIGNATORY_INFO',
  3: 'EXPERIENCE',
  4: 'DECLARATIONS',
  5: 'NARRATIVE',
};

const STEP_NAME: Record<number, string> = {
  1: 'פרטי החברה',
  2: 'מורשי חתימה',
  3: 'ניסיון',
  4: 'הצהרות',
  5: 'תוכן הצעה',
};

const ACTIVE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes — handoff Pattern 1

export async function registerStepReadyWorker(boss: PgBoss): Promise<void> {
  await boss.work<Payload>(QUEUE_STEP_READY, async (jobs) => {
    for (const job of jobs) {
      try {
        await processStepReadyJob(job.data);
      } catch (err) {
        logger.warn({ err, payload: job.data }, 'step-ready worker error');
      }
    }
  });
  logger.info({ queue: QUEUE_STEP_READY }, 'step-ready worker registered');
}

async function processStepReadyJob({ tenderId, triggeredSteps }: Payload): Promise<void> {
  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    include: { user: true },
  });
  if (!tender) return;

  // Suppression — user is actively in the app
  if (tender.user.lastSeenAt && Date.now() - tender.user.lastSeenAt.getTime() < ACTIVE_THRESHOLD_MS) {
    logger.info({ tenderId, lastSeenAt: tender.user.lastSeenAt }, 'step-ready: user is active, suppressing');
    return;
  }

  // For each triggered step, count how many questions exist in that step's category.
  // If 0, skip that step (the dedup might have changed assignments).
  const candidateSteps: number[] = [];
  for (const step of triggeredSteps) {
    const cat = STEP_CATEGORY[step];
    if (!cat) continue;
    const count = await prisma.question.count({ where: { tenderId, category: cat } });
    if (count > 0) candidateSteps.push(step);
  }

  if (candidateSteps.length === 0) {
    logger.info({ tenderId }, 'step-ready: no eligible steps after recheck');
    return;
  }

  candidateSteps.sort((a, b) => a - b);
  const lowest = candidateSteps[0];
  const highest = candidateSteps[candidateSteps.length - 1];

  const totalNewQuestions = await prisma.question.count({
    where: {
      tenderId,
      category: { in: candidateSteps.map((s) => STEP_CATEGORY[s]) },
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const ctaUrl = `${baseUrl}/tenders/${tenderId}/wizard/${lowest}`;

  const subject =
    candidateSteps.length === 1
      ? stepReadySubject(lowest, tender.tenderNumber)
      : stepReadyBatchSubject({ from: lowest, to: highest }, tender.tenderNumber);

  const html = await render(
    StepReadyEmail({
      tenderTitle: tender.title,
      tenderNumber: tender.tenderNumber,
      stepNumber: lowest,
      stepName: STEP_NAME[lowest] ?? '',
      stepNumberRange: candidateSteps.length > 1 ? { from: lowest, to: highest } : undefined,
      newQuestionCount: totalNewQuestions,
      ctaUrl,
    })
  );

  const id = await sendEmail({
    to: tender.user.email,
    subject,
    html,
  });

  if (id) {
    await prisma.tender.update({
      where: { id: tenderId },
      data: { lastEmailSentAt: new Date() },
    });
  }
}
