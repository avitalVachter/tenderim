import { TenderStatus } from '@prisma/client';
import Link from 'next/link';
import { Eyebrow } from '@/components/ui/eyebrow';

const STATUS_LABEL: Record<TenderStatus, string> = {
  UPLOADED: 'ממתין',
  EXTRACTING: 'מנתח',
  READY: 'מוכן',
  FILLING: 'ממלא',
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

type Tender = {
  id: string;
  title: string;
  publisher: string | null;
  tenderNumber: string | null;
  deadline: Date | null;
  status: TenderStatus;
  updatedAt: Date;
  files: { filename: string }[];
  _count?: { questions?: number; answers?: number };
};

function CountdownCell({ deadline }: { deadline: Date | null }) {
  if (!deadline) return <span className="text-xs text-slate-400">—</span>;
  const now = Date.now();
  const days = Math.ceil((deadline.getTime() - now) / 86400000);
  if (days < 0) return <span className="text-xs font-medium text-slate-500">עבר המועד</span>;
  if (days === 0) return <span className="text-sm font-bold text-rose-600">היום</span>;
  if (days === 1) return <span className="text-sm font-bold text-rose-600">מחר</span>;
  const isUrgent = days <= 2;
  return (
    <span className={`text-sm font-bold tabular-nums ${isUrgent ? 'text-rose-600' : 'text-slate-900'}`}>
      {days} ימים
    </span>
  );
}

export function TenderTable({ tenders }: { tenders: Tender[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm" dir="rtl">
        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
          <tr>
            <Th>שם המכרז</Th>
            <Th>מפרסם</Th>
            <Th>סטטוס</Th>
            <Th>מועד הגשה</Th>
            <Th>שאלות</Th>
            <Th>עודכן</Th>
          </tr>
        </thead>
        <tbody>
          {tenders.map((t, i) => {
            const answered = t._count?.answers ?? 0;
            const total = t._count?.questions ?? 0;
            return (
              <tr
                key={t.id}
                className={`border-b border-slate-200 last:border-0 hover:bg-slate-50/60 transition-colors ${
                  i % 2 === 1 ? 'bg-slate-50/30' : ''
                }`}
              >
                <td className="px-5 py-4">
                  <Link
                    href={`/tenders/${t.id}`}
                    className="font-medium text-slate-900 hover:underline line-clamp-1"
                  >
                    {t.title}
                  </Link>
                  {t.tenderNumber && (
                    <div className="text-xs text-slate-500 tabular-nums mt-0.5">{t.tenderNumber}</div>
                  )}
                </td>
                <td className="px-5 py-4 text-slate-700">
                  {t.publisher ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full ${STATUS_COLOR[t.status]}`}
                  >
                    {STATUS_LABEL[t.status]}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <CountdownCell deadline={t.deadline} />
                </td>
                <td className="px-5 py-4 text-slate-700 tabular-nums">
                  {total > 0 ? `${answered}/${total}` : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-5 py-4 text-slate-500 text-xs tabular-nums">
                  {new Date(t.updatedAt).toLocaleDateString('he-IL')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-right">
      <Eyebrow>{children}</Eyebrow>
    </th>
  );
}
