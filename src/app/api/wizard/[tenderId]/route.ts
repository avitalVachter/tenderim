import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { touchUserLastSeen } from '@/lib/auth-heartbeat';

async function getTender(tenderId: string, userId: string) {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender) return null;
  if (tender.userId !== userId) return null;
  return tender;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ tenderId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { tenderId } = await params;
  if (!await getTender(tenderId, session.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const progress = await prisma.wizardProgress.findUnique({ where: { tenderId } });
  return NextResponse.json({ currentStep: progress?.currentStep ?? 1 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tenderId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  void touchUserLastSeen(session.user.id);

  const { tenderId } = await params;
  if (!await getTender(tenderId, session.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await req.json()) as { currentStep?: number; autofillsSeenIncrement?: number };
  const { currentStep, autofillsSeenIncrement } = body;

  // Allow either step navigation or autofill counter increment (or both)
  if (
    (currentStep === undefined || currentStep === null) &&
    (autofillsSeenIncrement === undefined || autofillsSeenIncrement === null)
  ) {
    return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 });
  }
  if (currentStep !== undefined && (currentStep < 1 || currentStep > 6)) {
    return NextResponse.json({ error: 'שלב לא תקין' }, { status: 400 });
  }

  const existing = await prisma.wizardProgress.findUnique({ where: { tenderId } });
  const incrementBy = Math.max(0, Math.min(autofillsSeenIncrement ?? 0, 5));
  const newSeenCount = (existing?.autofillsSeenCount ?? 0) + incrementBy;

  const progress = await prisma.wizardProgress.upsert({
    where: { tenderId },
    create: {
      tenderId,
      currentStep: currentStep ?? 1,
      autofillsSeenCount: incrementBy,
    },
    update: {
      ...(currentStep !== undefined && { currentStep }),
      ...(incrementBy > 0 && { autofillsSeenCount: newSeenCount }),
    },
  });

  return NextResponse.json(progress);
}
