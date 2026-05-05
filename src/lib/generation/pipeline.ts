import { readFile, writeFile, mkdir } from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import archiver from 'archiver';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { getAbsolutePath, getTenderDir } from '@/lib/storage';
import { generateFilledAnnex, FillField, FillFieldType } from '@/lib/pdf/generate';
import { isPdfServiceAvailable } from '@/lib/pdf/render';

const HUMAN_ONLY_TYPES = new Set(['SIGNATURE', 'STAMP', 'LAWYER_BLOCK']);

function fieldTypeToFillType(t: string): FillFieldType | null {
  if (t === 'CHECKBOX') return 'checkbox';
  if (t === 'NUMBER' || t === 'CURRENCY') return 'number';
  if (t === 'DATE') return 'date';
  if (HUMAN_ONLY_TYPES.has(t) || t === 'RADIO') return null;
  return 'text';
}

function safeFilename(s: string): string {
  return s.replace(/[^֐-׿a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'file';
}

function valueToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  return String(v);
}

async function updateProgress(jobId: string, progress: number, message: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: { progress, progressMessage: message },
  });
}

interface GeneratedFile {
  annexCode: string;
  title: string;
  filename: string;
  needsSignature: boolean;
  needsStamp: boolean;
  needsLawyer: boolean;
  filledFieldCount: number;
}

export async function runGenerationPipeline(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const tenderId = job.tenderId;
  if (!tenderId) throw new Error('Job has no tenderId');

  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'RUNNING', startedAt: new Date(), progress: 0 },
  });

  try {
    if (!(await isPdfServiceAvailable())) {
      throw new Error('שירות ה-PDF לא זמין');
    }

    const tender = await prisma.tender.findUniqueOrThrow({ where: { id: tenderId } });

    const mainFile = await prisma.tenderFile.findFirst({
      where: { tenderId, isMain: true },
    });
    if (!mainFile) throw new Error('Main PDF file not found');

    const sourceAbsPath = getAbsolutePath(mainFile.filePath);
    const sourceBytes = await readFile(sourceAbsPath);

    const annexes = await prisma.annex.findMany({
      where: { tenderId },
      orderBy: { startPage: 'asc' },
      include: {
        fields: {
          include: { question: { include: { answer: true } } },
        },
      },
    });

    if (annexes.length === 0) throw new Error('אין נספחים ליצירה');

    const tenderDir = getTenderDir(tenderId);
    const outputDir = path.join(tenderDir, 'output');
    await mkdir(outputDir, { recursive: true });

    await updateProgress(jobId, 5, 'מתחיל יצירת מסמכים...');

    const generated: GeneratedFile[] = [];

    for (let i = 0; i < annexes.length; i++) {
      const annex = annexes[i];
      const progressPct = 5 + Math.round(((i + 1) / annexes.length) * 80);
      await updateProgress(jobId, progressPct, `יוצר ${annex.code}...`);

      const startPage = annex.startPage ?? 1;
      const endPage = annex.endPage ?? startPage;

      const fillFields: FillField[] = [];
      let needsSignature = false;
      let needsStamp = false;
      let needsLawyer = false;

      for (const f of annex.fields) {
        if (f.fieldType === 'SIGNATURE') {
          needsSignature = true;
          continue;
        }
        if (f.fieldType === 'STAMP') {
          needsStamp = true;
          continue;
        }
        if (f.fieldType === 'LAWYER_BLOCK') {
          needsLawyer = true;
          continue;
        }

        const fillType = fieldTypeToFillType(f.fieldType);
        if (!fillType) continue;

        const answerValue = f.question?.answer?.value;
        const value = valueToString(answerValue);
        if (!value && fillType !== 'checkbox') continue;
        if (fillType === 'checkbox') {
          const checked = ['true', '1', 'yes', 'כן'].includes(value.toLowerCase().trim());
          if (!checked) continue; // unchecked — skip
        }

        const bbox = f.bbox as { x: number; y: number; width: number; height: number };
        if (
          typeof bbox?.x !== 'number' ||
          typeof bbox?.y !== 'number' ||
          typeof bbox?.width !== 'number' ||
          typeof bbox?.height !== 'number'
        ) {
          continue;
        }

        fillFields.push({
          sourcePage: f.page,
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height,
          value,
          fieldType: fillType,
        });
      }

      let filledBytes: Buffer;
      try {
        filledBytes = await generateFilledAnnex(sourceBytes, startPage, endPage, fillFields);
      } catch (err) {
        logger.warn({ annexCode: annex.code, err }, 'annex generation failed, skipping');
        continue;
      }

      const filename = `${safeFilename(annex.code)}_${safeFilename(annex.title)}.pdf`;
      const outputPath = path.join(outputDir, filename);
      await writeFile(outputPath, filledBytes);

      generated.push({
        annexCode: annex.code,
        title: annex.title,
        filename,
        needsSignature,
        needsStamp,
        needsLawyer,
        filledFieldCount: fillFields.length,
      });

      await prisma.annex.update({
        where: { id: annex.id },
        data: {
          status: needsSignature || needsStamp || needsLawyer ? 'HUMAN_ONLY' : 'FILLED',
        },
      });
    }

    if (generated.length === 0) throw new Error('לא נוצרו מסמכים');

    // Cover sheet
    await updateProgress(jobId, 90, 'בונה גיליון כיסוי...');
    const coverLines: string[] = [];
    coverLines.push(tender.title);
    if (tender.publisher) coverLines.push(`מפרסם: ${tender.publisher}`);
    if (tender.tenderNumber) coverLines.push(`מספר מכרז: ${tender.tenderNumber}`);
    if (tender.deadline) coverLines.push(`מועד הגשה: ${tender.deadline.toLocaleDateString('he-IL')}`);
    coverLines.push('', `נוצר: ${new Date().toLocaleString('he-IL')}`, '', 'נספחים בחבילה:', '');
    for (const g of generated) {
      const flags = [
        g.needsSignature ? 'דרושה חתימה' : '',
        g.needsStamp ? 'דרושה חותמת' : '',
        g.needsLawyer ? 'דרוש אישור עו"ד' : '',
      ]
        .filter(Boolean)
        .join(', ');
      coverLines.push(`- ${g.annexCode}: ${g.title}`);
      coverLines.push(`  קובץ: ${g.filename}`);
      coverLines.push(`  שדות שמולאו: ${g.filledFieldCount}${flags ? ` · ${flags}` : ''}`);
      coverLines.push('');
    }

    const coverPath = path.join(outputDir, 'README.txt');
    // BOM so Hebrew renders correctly when opened in Notepad on Windows
    await writeFile(coverPath, '﻿' + coverLines.join('\r\n'), 'utf8');

    // ZIP
    await updateProgress(jobId, 95, 'אורז קובץ ZIP...');
    const zipPath = path.join(outputDir, 'submission.zip');
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 6 } });
      out.on('close', () => resolve());
      archive.on('error', reject);
      archive.pipe(out);
      archive.file(coverPath, { name: 'README.txt' });
      for (const g of generated) {
        archive.file(path.join(outputDir, g.filename), { name: g.filename });
      }
      archive.finalize();
    });

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'DONE',
        progress: 100,
        progressMessage: 'הושלם',
        finishedAt: new Date(),
        result: {
          fileCount: generated.length,
          files: generated.map((g) => ({
            annexCode: g.annexCode,
            title: g.title,
            filename: g.filename,
            needsSignature: g.needsSignature,
            needsStamp: g.needsStamp,
            needsLawyer: g.needsLawyer,
          })),
        } as Prisma.InputJsonValue,
      },
    });

    await prisma.tender.update({
      where: { id: tenderId },
      data: { status: 'GENERATED' },
    });

    logger.info({ tenderId, jobId, fileCount: generated.length }, 'generation pipeline complete');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ tenderId, jobId, error: message }, 'generation pipeline failed');

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'FAILED', error: message, finishedAt: new Date() },
    });

    throw error;
  }
}
