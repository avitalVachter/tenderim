import { TenderStatus } from '@prisma/client';
import Link from 'next/link';

const STATUS_LABEL: Record<TenderStatus, string> = {
  UPLOADED: 'ממתין לעיבוד',
  EXTRACTING: 'מנתח...',
  READY: 'מוכן למילוי',
  FILLING: 'ממלא מסמכים...',
  GENERATED: 'הושלם',
  ERROR: 'שגיאה',
  PARTIAL_ERROR: 'הושלם חלקית',
};

const STATUS_COLOR: Record<TenderStatus, string> = {
  UPLOADED: 'bg-slate-100 text-slate-600',
  EXTRACTING: 'bg-amber-50 text-amber-700',
  READY: 'bg-emerald-50 text-emerald-700',
  FILLING: 'bg-amber-50 text-amber-700',
  GENERATED: 'bg-emerald-100 text-emerald-800',
  ERROR: 'bg-rose-50 text-rose-600',
  PARTIAL_ERROR: 'bg-amber-50 text-amber-700',
};

interface Props {
  tender: {
    id: string;
    title: string;
    publisher: string | null;
    tenderNumber: string | null;
    deadline: Date | null;
    status: TenderStatus;
    createdAt: Date;
    files: { filename: string }[];
  };
}

function DeadlineCountdown({ deadline }: { deadline: Date | null }) {
  if (!deadline) return null;
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return <span className="text-xs text-destructive font-medium">עבר המועד</span>;
  if (days === 0) return <span className="text-xs text-destructive font-semibold">היום!</span>;
  const isUrgent = days <= 2;
  return (
    <span className={`text-xs font-medium ${isUrgent ? 'text-destructive' : 'text-muted-foreground'}`}>
      עוד {days} ימים
    </span>
  );
}

export function TenderCard({ tender }: Props) {
  return (
    <Link
      href={`/tenders/${tender.id}`}
      className="block bg-card border border-border rounded-lg p-5 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-medium text-sm leading-snug line-clamp-2">{tender.title}</h3>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[tender.status]}`}>
          {STATUS_LABEL[tender.status]}
        </span>
      </div>

      {(tender.publisher || tender.tenderNumber) && (
        <p className="text-xs text-muted-foreground mb-2">
          {tender.publisher}
          {tender.publisher && tender.tenderNumber && ' · '}
          {tender.tenderNumber}
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{new Date(tender.createdAt).toLocaleDateString('he-IL')}</p>
        <DeadlineCountdown deadline={tender.deadline} />
      </div>
    </Link>
  );
}
