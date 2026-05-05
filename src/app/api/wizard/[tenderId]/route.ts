import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

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

  const { tenderId } = await params;
  if (!await getTender(tenderId, session.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await req.json()) as { currentStep?: number };
  const { currentStep } = body;
  if (!currentStep || currentStep < 1 || currentStep > 6) {
    return NextResponse.json({ error: 'שלב לא תקין' }, { status: 400 });
  }

  const progress = await prisma.wizardProgress.upsert({
    where: { tenderId },
    create: { tenderId, currentStep },
    update: { currentStep },
  });

  return NextResponse.json(progress);
}
