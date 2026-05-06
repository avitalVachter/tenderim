import { prisma } from '@/lib/db/prisma';

/**
 * Update User.lastSeenAt — used by step-ready email worker to suppress
 * notifications for users currently active in the app. Call from
 * frequent-traffic Node API routes (answer save, wizard PATCH, SSE stream).
 *
 * Cheap (one UPDATE), wrapped in try/catch so it never blocks the request.
 */
export async function touchUserLastSeen(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    });
  } catch {
    // non-critical
  }
}
