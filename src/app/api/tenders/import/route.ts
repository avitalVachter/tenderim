import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { ensureTenderDir, makeRelativePath } from '@/lib/storage';
import { getBoss, QUEUE_EXTRACT } from '@/lib/queue/boss';
import { scrapeTenderPage, downloadFile } from '@/lib/scraper/mr-gov';

const MAX_FILES = 30;
const MAX_TOTAL_BYTES = 250 * 1024 * 1024;

function sanitizeFilename(name: string): string {
  return (name.replace(/[^֐-׿a-zA-Z0-9._-]/g, '_').slice(0, 120)) || 'file';
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { url?: string };
  const sourceUrl = body.url?.trim();
  if (!sourceUrl) return NextResponse.json({ error: 'יש לספק כתובת' }, { status: 400 });

  let scraped;
  try {
    scraped = await scrapeTenderPage(sourceUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  if (scraped.files.length === 0) {
    return NextResponse.json({ error: 'לא נמצאו קבצים להורדה בדף זה' }, { status: 422 });
  }

  const files = scraped.files.slice(0, MAX_FILES);

  const tender = await prisma.tender.create({
    data: {
      userId: session.user.id,
      title: scraped.title,
      publisher: scraped.publisher,
      tenderNumber: scraped.tenderNumber,
      deadline: scraped.deadline,
      sourceUrl,
    },
  });

  const tenderDir = await ensureTenderDir(tender.id);
  const usedNames = new Set<string>();
  let totalBytes = 0;
  let savedCount = 0;

  for (const f of files) {
    if (totalBytes >= MAX_TOTAL_BYTES) {
      logger.warn({ tenderId: tender.id, totalBytes }, 'import size cap reached');
      break;
    }
    try {
      const { data, filename } = await downloadFile(f.url);
      let safe = sanitizeFilename(filename || f.filename);
      // Disambiguate duplicate filenames
      if (usedNames.has(safe)) {
        const ext = path.extname(safe);
        const stem = safe.slice(0, safe.length - ext.length);
        let n = 2;
        while (usedNames.has(`${stem}_${n}${ext}`)) n++;
        safe = `${stem}_${n}${ext}`;
      }
      usedNames.add(safe);

      const absPath = path.join(tenderDir, safe);
      await writeFile(absPath, data);
      totalBytes += data.length;
      savedCount++;

      const ext = (path.extname(safe).slice(1) || f.fileType).toLowerCase();
      await prisma.tenderFile.create({
        data: {
          tenderId: tender.id,
          filename: filename || f.filename,
          fileType: ext,
          filePath: makeRelativePath(tender.id, safe),
          sizeBytes: data.length,
          isMain: false,
        },
      });
    } catch (err) {
      logger.warn({ url: f.url, err }, 'failed to download tender file');
    }
  }

  if (savedCount === 0) {
    await prisma.tender.delete({ where: { id: tender.id } });
    return NextResponse.json({ error: 'לא הצלחנו להוריד אף קובץ' }, { status: 422 });
  }

  const job = await prisma.job.create({
    data: { tenderId: tender.id, type: 'extract', status: 'PENDING' },
  });

  const boss = await getBoss();
  await boss.send(QUEUE_EXTRACT, { jobId: job.id });

  logger.info(
    { tenderId: tender.id, jobId: job.id, fileCount: savedCount, totalBytes },
    'tender imported from URL, extraction enqueued'
  );

  return NextResponse.json({ tenderId: tender.id, jobId: job.id }, { status: 201 });
}
