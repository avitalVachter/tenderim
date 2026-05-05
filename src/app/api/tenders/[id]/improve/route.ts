import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tenderId } = await params;
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (tender.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json()) as { questionId?: string };
  const { questionId } = body;
  if (!questionId) return NextResponse.json({ error: 'חסרים שדות חובה' }, { status: 400 });

  const answer = await prisma.answer.findUnique({ where: { questionId } });
  if (!answer) return NextResponse.json({ error: 'תשובה לא נמצאה' }, { status: 404 });

  const originalText = String(answer.value);
  if (!originalText.trim()) return NextResponse.json({ error: 'אין טקסט לשיפור' }, { status: 400 });

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `אתה עוזר המסייע להכין הצעות למכרזים ממשלתיים ישראלים.
שפר את הטקסט הבא להיות מקצועי, ברור ובעל טון מכובד המתאים להצעה לגוף ממשלתי.
החזר רק את הטקסט המשופר, ללא הסברים נוספים.`,
      },
      { role: 'user', content: originalText },
    ],
    max_tokens: 1000,
  });

  const improvedText = completion.choices[0]?.message?.content ?? originalText;

  const originalToStore = answer.aiImproved ? answer.originalValue : answer.value;
  const updated = await prisma.answer.update({
    where: { questionId },
    data: {
      value: improvedText,
      aiImproved: true,
      originalValue: (originalToStore ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ value: updated.value, original: updated.originalValue });
}
