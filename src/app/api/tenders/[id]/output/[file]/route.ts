import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { getTenderDir } from '@/lib/storage';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; file: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tenderId, file } = await params;
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (tender.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const decoded = decodeURIComponent(file);
  // Path traversal guard: filename must not contain separators
  if (decoded.includes('/') || decoded.includes('\\') || decoded.includes('..')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const outputDir = path.join(getTenderDir(tenderId), 'output');
  const fullPath = path.join(outputDir, decoded);

  // Verify resolved path is still inside outputDir (defense in depth)
  const resolvedDir = path.resolve(outputDir);
  const resolvedFile = path.resolve(fullPath);
  if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    await stat(resolvedFile);
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const data = await readFile(resolvedFile);
  const isZip = decoded.toLowerCase().endsWith('.zip');
  const isPdf = decoded.toLowerCase().endsWith('.pdf');
  const isTxt = decoded.toLowerCase().endsWith('.txt');
  const contentType = isZip
    ? 'application/zip'
    : isPdf
    ? 'application/pdf'
    : isTxt
    ? 'text/plain; charset=utf-8'
    : 'application/octet-stream';

  return new NextResponse(data, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(data.length),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(decoded)}`,
    },
  });
}
