import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tenderId } = await params;
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (tender.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json()) as { questionId?: string; value?: unknown };
  const { questionId, value } = body;
  if (!questionId || value === undefined) {
    return NextResponse.json({ error: 'חסרים שדות חובה' }, { status: 400 });
  }

  const jsonValue = (value ?? Prisma.JsonNull) as Prisma.InputJsonValue;
  const answer = await prisma.answer.upsert({
    where: { questionId },
    create: { tenderId, questionId, value: jsonValue },
    update: { value: jsonValue },
  });

  if (tender.status === 'READY') {
    await prisma.tender.update({ where: { id: tenderId }, data: { status: 'FILLING' } });
  }

  return NextResponse.json(answer);
}
