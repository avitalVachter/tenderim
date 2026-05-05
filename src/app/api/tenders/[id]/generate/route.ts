import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { getBoss, QUEUE_GENERATE } from '@/lib/queue/boss';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tenderId } = await params;
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (tender.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const job = await prisma.job.create({
    data: { tenderId, type: 'generate', status: 'PENDING' },
  });

  const boss = await getBoss();
  await boss.send(QUEUE_GENERATE, { jobId: job.id });

  logger.info({ tenderId, jobId: job.id }, 'generate job enqueued');

  return NextResponse.json({ jobId: job.id }, { status: 201 });
}
