import { redirect, notFound } from 'next/navigation';
import { QuestionCategory } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { WizardStep } from '@/components/wizard/WizardStep';

const STEP_CATEGORY: Record<number, QuestionCategory> = {
  1: 'COMPANY_INFO',
  2: 'SIGNATORY_INFO',
  3: 'EXPERIENCE',
  4: 'DECLARATIONS',
  5: 'NARRATIVE',
};

const TOTAL_STEPS = 6;

export default async function WizardStepPage({
  params,
}: {
  params: Promise<{ id: string; step: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { id: tenderId, step: stepStr } = await params;
  const step = parseInt(stepStr, 10);
  if (isNaN(step) || step < 1 || step > TOTAL_STEPS) notFound();

  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    select: { id: true, title: true, userId: true, status: true },
  });
  if (!tender || tender.userId !== session.user.id) notFound();

  const isReview = step === TOTAL_STEPS;

  if (isReview) {
    // Fetch all questions + answers for review
    const questions = await prisma.question.findMany({
      where: { tenderId },
      orderBy: { order: 'asc' },
      include: { answer: true },
    });
    return (
      <WizardStep
        tenderId={tenderId}
        tenderTitle={tender.title}
        step={step}
        totalSteps={TOTAL_STEPS}
        questions={questions.map((q) => ({
          id: q.id,
          label: q.label,
          helpText: q.helpText,
          fieldType: q.fieldType,
          required: q.required,
          options: q.options,
          category: q.category,
          answer: q.answer ? { value: q.answer.value, aiImproved: q.answer.aiImproved, originalValue: q.answer.originalValue } : null,
        }))}
        isReview
        isNarrative={false}
      />
    );
  }

  const category = STEP_CATEGORY[step];
  const questions = await prisma.question.findMany({
    where: { tenderId, category },
    orderBy: { order: 'asc' },
    include: { answer: true },
  });

  return (
    <WizardStep
      tenderId={tenderId}
      tenderTitle={tender.title}
      step={step}
      totalSteps={TOTAL_STEPS}
      questions={questions.map((q) => ({
        id: q.id,
        label: q.label,
        helpText: q.helpText,
        fieldType: q.fieldType,
        required: q.required,
        options: q.options,
        category: q.category,
        answer: q.answer ? { value: q.answer.value, aiImproved: q.answer.aiImproved, originalValue: q.answer.originalValue } : null,
      }))}
      isReview={false}
      isNarrative={step === 5}
    />
  );
}
