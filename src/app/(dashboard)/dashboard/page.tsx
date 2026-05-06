import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { redirect } from 'next/navigation';
import { TenderCard } from '@/components/dashboard/TenderCard';
import { TenderTable } from '@/components/dashboard/TenderTable';
import { UploadModal } from '@/components/dashboard/UploadModal';
import { DeadlineAlerts } from '@/components/dashboard/DeadlineAlerts';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const tenders = await prisma.tender.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: 'desc' },
    include: {
      files: { select: { filename: true } },
      _count: { select: { questions: true, answers: true } },
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <DeadlineAlerts />
      <header className="border-b border-border bg-card px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold">מנתח המכרזים</h1>
        <span className="text-xs sm:text-sm text-muted-foreground truncate">{session.user.email}</span>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center justify-between mb-6 gap-3">
          <h2 className="text-base sm:text-lg font-semibold">המכרזים שלי</h2>
          <UploadModal />
        </div>

        {tenders.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg mb-2">אין עדיין מכרזים</p>
            <p className="text-sm">העלה קובץ PDF של מכרז כדי להתחיל</p>
          </div>
        ) : (
          <>
            {/* Desktop: zebra-striped table per design handoff */}
            <div className="hidden sm:block">
              <TenderTable tenders={tenders} />
            </div>
            {/* Mobile: keep card grid */}
            <div className="grid gap-4 sm:hidden">
              {tenders.map((tender) => (
                <TenderCard key={tender.id} tender={{ ...tender, deadline: tender.deadline }} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
