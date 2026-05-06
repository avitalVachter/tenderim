import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

/**
 * "המשך עם N הנספחים שנותחו" — flips PARTIAL_ERROR → READY,
 * marks all still-PENDING annexes as HUMAN_ONLY (the user fills them
 * manually before submission).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tenderId } = await params;
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (tender.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (tender.status !== 'PARTIAL_ERROR') {
    return NextResponse.json({ error: 'מצב לא תקין' }, { status: 400 });
  }

  // Mark all still-PENDING annexes as HUMAN_ONLY so they don't get re-tried
  // and the wizard knows to flag them for manual fill.
  const updated = await prisma.annex.updateMany({
    where: { tenderId, status: 'PENDING' },
    data: { status: 'HUMAN_ONLY' },
  });

  await prisma.tender.update({
    where: { id: tenderId },
    data: { status: 'READY', errorMessage: null },
  });

  logger.info({ tenderId, humanOnlyCount: updated.count }, 'partial-error continued');

  return NextResponse.json({ ok: true, humanOnlyCount: updated.count });
}
