import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { touchUserLastSeen } from '@/lib/auth-heartbeat';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  void touchUserLastSeen(session.user.id);

  const { id } = await params;

  const tender = await prisma.tender.findUnique({
    where: { id },
    include: {
      files: true,
      annexes: {
        orderBy: { startPage: 'asc' },
        include: { _count: { select: { fields: true } } },
      },
      milestones: { orderBy: { order: 'asc' } },
      jobs: { orderBy: { createdAt: 'desc' }, take: 5 },
      _count: { select: { questions: true, answers: true } },
    },
  });

  if (!tender) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (tender.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json(tender);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const tender = await prisma.tender.findUnique({ where: { id } });
  if (!tender) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (tender.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await prisma.tender.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
