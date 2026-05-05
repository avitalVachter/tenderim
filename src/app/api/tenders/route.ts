import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { ensureTenderDir, makeRelativePath } from '@/lib/storage';
import { getBoss, QUEUE_EXTRACT } from '@/lib/queue/boss';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenders = await prisma.tender.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: { files: { select: { filename: true, fileType: true, isMain: true } } },
  });

  return NextResponse.json(tenders);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const title = (form.get('name') as string | null)?.trim();

  if (!file || !title) return NextResponse.json({ error: 'חסרים שדות חובה' }, { status: 400 });
  if (file.type !== 'application/pdf')
    return NextResponse.json({ error: 'יש להעלות קובץ PDF בלבד' }, { status: 400 });
  if (file.size > 100 * 1024 * 1024)
    return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 100MB)' }, { status: 400 });

  const tender = await prisma.tender.create({
    data: { userId: session.user.id, title },
  });

  const tenderDir = await ensureTenderDir(tender.id);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-￿-]/g, '_');
  const absPath = path.join(tenderDir, safeName);
  const bytes = await file.arrayBuffer();
  await writeFile(absPath, Buffer.from(bytes));

  const relPath = makeRelativePath(tender.id, safeName);
  const ext = path.extname(safeName).slice(1).toLowerCase() || 'pdf';

  const tenderFile = await prisma.tenderFile.create({
    data: {
      tenderId: tender.id,
      filename: file.name,
      fileType: ext,
      filePath: relPath,
      sizeBytes: file.size,
      isMain: ext === 'pdf',
    },
  });

  // Create a Job record and enqueue extraction
  const job = await prisma.job.create({
    data: { tenderId: tender.id, type: 'extract', status: 'PENDING' },
  });

  const boss = await getBoss();
  await boss.send(QUEUE_EXTRACT, { jobId: job.id });

  logger.info({ tenderId: tender.id, jobId: job.id, fileId: tenderFile.id }, 'tender uploaded, extraction enqueued');

  return NextResponse.json({ tenderId: tender.id, jobId: job.id }, { status: 201 });
}
