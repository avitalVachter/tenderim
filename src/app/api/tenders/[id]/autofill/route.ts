import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

/**
 * Pattern 3c — user response to a low-confidence autofill suggestion.
 *
 * Body: { questionId: string, action: 'confirm' | 'reject' }
 *   confirm: keep the autofilled answer, mark autofillConfirmed=true
 *   reject:  delete the answer (user fills manually); the wizard then
 *            renders an empty input.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tenderId } = await params;
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (tender.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json()) as { questionId?: string; action?: 'confirm' | 'reject' };
  const { questionId, action } = body;
  if (!questionId || (action !== 'confirm' && action !== 'reject')) {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  const answer = await prisma.answer.findUnique({ where: { questionId } });
  if (!answer || answer.tenderId !== tenderId) {
    return NextResponse.json({ error: 'תשובה לא נמצאה' }, { status: 404 });
  }

  if (action === 'confirm') {
    const updated = await prisma.answer.update({
      where: { questionId },
      data: { autofillConfirmed: true },
    });
    return NextResponse.json({ ok: true, value: updated.value });
  }

  // reject — drop the autofill answer entirely; the user will fill manually
  await prisma.answer.delete({ where: { questionId } });
  return NextResponse.json({ ok: true, deleted: true });
}
