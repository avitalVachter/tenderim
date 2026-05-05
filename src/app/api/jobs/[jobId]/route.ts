import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { jobId } = await params;
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { tender: { select: { userId: true } } },
  });

  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (job.tender?.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    progressMessage: job.progressMessage,
    error: job.error,
    result: job.result,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  });
}
