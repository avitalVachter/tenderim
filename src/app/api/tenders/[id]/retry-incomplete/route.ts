import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { getBoss, QUEUE_EXTRACT, SEND_OPTS_EXTRACT } from '@/lib/queue/boss';

/**
 * "נסה שוב את החסרים" — re-enqueue the extract pipeline. Per-annex
 * resumability ensures only PENDING annexes are re-processed; EXTRACTED
 * ones are skipped (no Claude calls, near-zero cost).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tenderId } = await params;
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (tender.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (tender.status !== 'PARTIAL_ERROR' && tender.status !== 'ERROR') {
    return NextResponse.json({ error: 'מצב לא תקין' }, { status: 400 });
  }

  await prisma.tender.update({
    where: { id: tenderId },
    data: { status: 'EXTRACTING', errorMessage: null },
  });

  const job = await prisma.job.create({
    data: { tenderId, type: 'extract', status: 'PENDING' },
  });

  const boss = await getBoss();
  await boss.send(QUEUE_EXTRACT, { jobId: job.id }, SEND_OPTS_EXTRACT);

  logger.info({ tenderId, jobId: job.id }, 'retry-incomplete enqueued');

  return NextResponse.json({ jobId: job.id }, { status: 201 });
}
