import { NextRequest, NextResponse } from 'next/server';
import { stat } from 'fs/promises';
import path from 'path';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { getTenderDir } from '@/lib/storage';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tenderId } = await params;
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (tender.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const latestJob = await prisma.job.findFirst({
    where: { tenderId, type: 'generate', status: 'DONE' },
    orderBy: { finishedAt: 'desc' },
  });

  if (!latestJob || !latestJob.result) {
    return NextResponse.json({ files: [], hasZip: false });
  }

  const result = latestJob.result as {
    fileCount?: number;
    files?: Array<{ annexCode: string; title: string; filename: string; needsSignature: boolean; needsStamp: boolean; needsLawyer: boolean }>;
  };

  const outputDir = path.join(getTenderDir(tenderId), 'output');
  let hasZip = false;
  try {
    await stat(path.join(outputDir, 'submission.zip'));
    hasZip = true;
  } catch {
    hasZip = false;
  }

  return NextResponse.json({
    files: result.files ?? [],
    hasZip,
    finishedAt: latestJob.finishedAt,
  });
}
