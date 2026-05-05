import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });

  const { jobId } = await params;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { tender: { select: { userId: true } } },
  });

  if (!job) return new Response('Not found', { status: 404 });
  if (job.tender?.userId !== session.user.id) return new Response('Forbidden', { status: 403 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let done = false;
      while (!done) {
        const current = await prisma.job.findUnique({ where: { id: jobId } });
        if (!current) {
          send({ status: 'FAILED', error: 'Job not found' });
          break;
        }

        send({
          status: current.status,
          progress: current.progress,
          progressMessage: current.progressMessage,
          error: current.error,
          result: current.result,
        });

        if (current.status === 'DONE' || current.status === 'FAILED') {
          done = true;
        } else {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
