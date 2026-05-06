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

const CATEGORY_STEP: Record<QuestionCategory, number> = {
  COMPANY_INFO: 1,
  SIGNATORY_INFO: 2,
  EXPERIENCE: 3,
  DECLARATIONS: 4,
  NARRATIVE: 5,
  REVIEW: 6,
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
  const wizardProgress = await prisma.wizardProgress.findUnique({ where: { tenderId } });

  const questionsRaw = await prisma.question.findMany({
    where: isReview ? { tenderId } : { tenderId, category: STEP_CATEGORY[step] },
    orderBy: { order: 'asc' },
    include: { answer: true },
  });

  // Fetch source-question labels for any autofilled answers (one query, batch)
  const sourceIds = questionsRaw
    .map((q) => q.answer?.autofillSource)
    .filter((s): s is string => !!s);
  const sourceQuestions = sourceIds.length
    ? await prisma.question.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, label: true, category: true },
      })
    : [];
  const sourceMap = new Map(sourceQuestions.map((s) => [s.id, s]));

  const questions = questionsRaw.map((q) => {
    const sourceInfo = q.answer?.autofillSource ? sourceMap.get(q.answer.autofillSource) ?? null : null;
    return {
      id: q.id,
      label: q.label,
      helpText: q.helpText,
      fieldType: q.fieldType,
      required: q.required,
      options: q.options,
      category: q.category,
      appearsInAnnexes: (q.appearsInAnnexes as string[]) ?? [],
      answer: q.answer
        ? {
            value: q.answer.value,
            aiImproved: q.answer.aiImproved,
            originalValue: q.answer.originalValue,
            autofillSource: q.answer.autofillSource,
            autofillConfirmed: q.answer.autofillConfirmed,
            autofillConfidence: q.answer.autofillConfidence,
            autofillSourceLabel: sourceInfo?.label ?? null,
            autofillSourceStep: sourceInfo ? CATEGORY_STEP[sourceInfo.category] : null,
          }
        : null,
    };
  });

  return (
    <WizardStep
      tenderId={tenderId}
      tenderTitle={tender.title}
      step={step}
      totalSteps={TOTAL_STEPS}
      questions={questions}
      isReview={isReview}
      isNarrative={!isReview && step === 5}
      autofillsSeenCount={wizardProgress?.autofillsSeenCount ?? 0}
    />
  );
}
