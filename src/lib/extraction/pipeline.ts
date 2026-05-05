import { readFile } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { getAbsolutePath } from '@/lib/storage';
import { classifyFiles } from './passes/classify';
import { segmentAnnexes } from './passes/segment';
import { extractMetadata } from './passes/metadata';
import { extractFieldsForAnnex } from './passes/extract-fields';
import { deduplicateFields } from './passes/dedup';
import { isPdfServiceAvailable } from '@/lib/pdf/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer, opts?: unknown) => Promise<{ text: string; numpages: number }>;

async function updateJobProgress(jobId: string, progress: number, message: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: { progress, progressMessage: message },
  });
}

async function extractPageTexts(filePath: string): Promise<string[]> {
  const buffer = await readFile(filePath);
  const pages: string[] = [];

  await pdfParse(buffer, {
    pagerender: async (pageData: { getTextContent: () => Promise<{ items: unknown[] }> }) => {
      const content = await pageData.getTextContent();
      const text = (content.items as Array<{ str?: string }>)
        .map((item) => item.str ?? '')
        .join(' ');
      pages.push(text);
      return text;
    },
  });

  return pages;
}

export async function runExtractionPipeline(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const tenderId = job.tenderId!;

  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'RUNNING', startedAt: new Date() },
  });
  await prisma.tender.update({
    where: { id: tenderId },
    data: { status: 'EXTRACTING', errorMessage: null },
  });

  try {
    // ── Pass 1: File classification ────────────────────────────────────────
    await updateJobProgress(jobId, 3, 'מסווג קבצים...');
    logger.info({ tenderId, jobId }, 'pass 1: classify');

    const files = await prisma.tenderFile.findMany({ where: { tenderId } });

    const fileInfos = await Promise.all(
      files.map(async (f) => {
        const absPath = getAbsolutePath(f.filePath);
        let firstPagesText: string | undefined;
        let pageCount: number | undefined;

        if (f.fileType === 'pdf') {
          try {
            const pages = await extractPageTexts(absPath);
            pageCount = pages.length;
            firstPagesText = pages.slice(0, 5).join('\n\n');
          } catch {
            logger.warn({ file: f.filename }, 'failed to extract text for classify');
          }
        }

        return { filename: f.filename, fileType: f.fileType, pageCount, firstPagesText };
      })
    );

    const classifications = await classifyFiles(fileInfos, jobId);

    await Promise.all(
      files.map(async (f) => {
        const cls = classifications[f.filename];
        await prisma.tenderFile.update({
          where: { id: f.id },
          data: { isMain: cls === 'MAIN_TENDER' },
        });
      })
    );

    const mainFile = files.find((f) => classifications[f.filename] === 'MAIN_TENDER');
    if (!mainFile) throw new Error('No MAIN_TENDER file found in classification');

    // ── Pass 2: Annex segmentation ─────────────────────────────────────────
    await updateJobProgress(jobId, 15, 'מזהה נספחים...');
    logger.info({ tenderId, jobId }, 'pass 2: segment');

    const mainAbsPath = getAbsolutePath(mainFile.filePath);
    const pageTexts = await extractPageTexts(mainAbsPath);

    const pageExcerpts = pageTexts.map((text, i) => ({ page: i + 1, text }));
    const annexSegments = await segmentAnnexes(pageExcerpts, jobId);

    // Remove old annexes (re-run safe)
    await prisma.annex.deleteMany({ where: { tenderId } });

    await prisma.annex.createMany({
      data: annexSegments.map((a) => ({
        tenderId,
        fileId: mainFile.id,
        code: a.code,
        title: a.title,
        startPage: a.startPage,
        endPage: a.endPage,
        status: 'PENDING',
      })),
    });

    // Update page count on main file
    await prisma.tenderFile.update({
      where: { id: mainFile.id },
      data: { pageCount: pageTexts.length },
    });

    await updateJobProgress(jobId, 25, 'נספחים זוהו');

    // ── Pass 3: Tender metadata + milestones ───────────────────────────────
    await updateJobProgress(jobId, 32, 'מחלץ מטא-נתונים...');
    logger.info({ tenderId, jobId }, 'pass 3: metadata');

    // Use first 60 pages of text
    const metadataText = pageTexts.slice(0, 60).join('\n\n');
    const metadata = await extractMetadata(metadataText, jobId);

    // Preserve scrape-time values when present (sourceUrl pages have authoritative deadlines)
    const existing = await prisma.tender.findUniqueOrThrow({ where: { id: tenderId } });

    await prisma.tender.update({
      where: { id: tenderId },
      data: {
        title: existing.title?.startsWith('מכרז פומבי') || !existing.title ? metadata.title : existing.title,
        publisher: existing.publisher ?? metadata.publisher,
        tenderNumber: existing.tenderNumber ?? metadata.tenderNumber,
        deadline: existing.deadline ?? (metadata.deadline ? new Date(metadata.deadline) : null),
        ervutAmount: metadata.ervutAmount ?? null,
        contactName: metadata.contactName,
        contactEmail: metadata.contactEmail,
        contactPhone: metadata.contactPhone,
        submissionMethod: metadata.submissionMethod,
      },
    });

    // Remove old milestones, insert new
    await prisma.milestone.deleteMany({ where: { tenderId } });

    if (metadata.milestones.length > 0) {
      await prisma.milestone.createMany({
        data: metadata.milestones.map((m, i) => ({
          tenderId,
          title: m.title,
          description: m.description,
          date: new Date(m.date),
          category: m.category,
          isDeadline: m.isDeadline,
          order: i,
        })),
      });
    }

    // ── Pass 4: Field extraction per annex (vision) ────────────────────────
    const pdfServiceUp = await isPdfServiceAvailable();

    if (!pdfServiceUp) {
      logger.warn({ tenderId }, 'pdf-service not available — skipping field extraction (passes 4-5)');
      await updateJobProgress(jobId, 70, 'pdf-service לא זמין — מדלג על חילוץ שדות');
    } else {
      await updateJobProgress(jobId, 45, 'מחלץ שדות מנספחים...');
      logger.info({ tenderId, jobId }, 'pass 4: extract fields');

      const annexes = await prisma.annex.findMany({
        where: { tenderId },
        orderBy: { startPage: 'asc' },
      });

      let totalFieldsExtracted = 0;
      for (let i = 0; i < annexes.length; i++) {
        const annex = annexes[i];
        const annexBasePct = 45 + Math.round((i / annexes.length) * 40);
        const annexEndPct = 45 + Math.round(((i + 1) / annexes.length) * 40);

        try {
          const count = await extractFieldsForAnnex(
            annex.id,
            mainAbsPath,
            pageTexts,
            jobId,
            async (pageInAnnex, totalInAnnex) => {
              const within = totalInAnnex > 0 ? pageInAnnex / totalInAnnex : 1;
              const pct = Math.round(annexBasePct + within * (annexEndPct - annexBasePct));
              await updateJobProgress(
                jobId,
                pct,
                `${annex.code} · עמוד ${pageInAnnex}/${totalInAnnex} (${i + 1}/${annexes.length} נספחים)`
              );
            }
          );
          totalFieldsExtracted += count;
        } catch (err) {
          logger.warn({ annexId: annex.id, annexCode: annex.code, err }, 'field extraction failed for annex, continuing');
        }
      }

      // ── Pass 5: Deduplication into Questions ──────────────────────────────
      await updateJobProgress(jobId, 88, 'מבצע דה-דופליקציה...');
      logger.info({ tenderId, jobId }, 'pass 5: dedup');

      const questionCount = await deduplicateFields(tenderId, jobId);

      await updateJobProgress(jobId, 95, 'בונה סיכום...');

      logger.info({ tenderId, jobId, totalFieldsExtracted, questionCount }, 'passes 4-5 done');
    }

    // ── Done ───────────────────────────────────────────────────────────────
    await updateJobProgress(jobId, 100, 'ניתוח הושלם');

    const finalAnnexCount = await prisma.annex.count({ where: { tenderId } });
    const finalQuestionCount = await prisma.question.count({ where: { tenderId } });

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'DONE',
        finishedAt: new Date(),
        result: {
          annexCount: finalAnnexCount,
          milestoneCount: metadata.milestones.length,
          questionCount: finalQuestionCount,
        },
      },
    });

    await prisma.tender.update({
      where: { id: tenderId },
      data: { status: 'READY' },
    });

    logger.info({ tenderId, jobId, annexCount: finalAnnexCount }, 'extraction pipeline done');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ tenderId, jobId, error: message }, 'extraction pipeline failed');

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'FAILED', error: message, finishedAt: new Date() },
    });
    await prisma.tender.update({
      where: { id: tenderId },
      data: { status: 'ERROR', errorMessage: message },
    });

    throw error;
  }
}
