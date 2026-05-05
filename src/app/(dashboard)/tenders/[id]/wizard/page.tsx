import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

export default async function WizardRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { id } = await params;

  const progress = await prisma.wizardProgress.findUnique({ where: { tenderId: id } });
  const step = progress?.currentStep ?? 1;

  redirect(`/tenders/${id}/wizard/${step}`);
}
