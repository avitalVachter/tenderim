'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FailureRecovery } from '@/components/tenders/FailureRecovery';

type Annex = { id: string; code: string; title: string; startPage: number | null; endPage: number | null; status: string; _count?: { fields: number } };
type Milestone = { id: string; title: string; description: string | null; date: string; category: string; isDeadline: boolean; done: boolean };
type Job = { id: string; type: string; status: string; progress: number; progressMessage: string | null; error: string | null };

type Tender = {
  id: string;
  title: string;
  publisher: string | null;
  tenderNumber: string | null;
  deadline: string | null;
  ervutAmount: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  submissionMethod: string | null;
  status: string;
  annexes: Annex[];
  milestones: Milestone[];
  jobs: Job[];
  _count: { questions: number; answers: number };
};

type Tab = 'summary' | 'forms' | 'timeline';

const MILESTONE_ICON: Record<string, string> = {
  DATE: '📅',
  DOCUMENT: '📄',
  GUARANTEE: '🏦',
  SIGNATURE: '✍️',
  PHYSICAL_ACTION: '🏢',
};

export default function TenderPage() {
  const { id } = useParams<{ id: string }>();
  const [tender, setTender] = useState<Tender | null>(null);
  const [tab, setTab] = useState<Tab>('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTender = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenders/${id}`);
      if (!res.ok) throw new Error('שגיאה בטעינת המכרז');
      setTender(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא צפויה');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTender();
  }, [fetchTender]);

  // Poll while extracting or generating
  useEffect(() => {
    if (!tender) return;
    const isProcessing =
      tender.status === 'EXTRACTING' ||
      tender.status === 'UPLOADED' ||
      tender.jobs.some((j) => j.status === 'RUNNING' || j.status === 'PENDING');
    if (!isProcessing) return;

    const interval = setInterval(fetchTender, 2000);
    return () => clearInterval(interval);
  }, [tender, fetchTender]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">טוען...</div>;
  if (error || !tender) return <div className="min-h-screen flex items-center justify-center text-destructive">{error ?? 'מכרז לא נמצא'}</div>;

  const activeJob = tender.jobs.find((j) => j.status === 'RUNNING' || j.status === 'PENDING');
  const deadline = tender.deadline ? new Date(tender.deadline) : null;
  const daysLeft = deadline ? Math.ceil((deadline.getTime() - Date.now()) / 86400000) : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground shrink-0">
            ← חזור
          </Link>
          <h1 className="text-base sm:text-lg font-bold flex-1 min-w-0 line-clamp-1">{tender.title}</h1>
          <StatusBadge status={tender.status} />
          {(tender.status === 'READY' || tender.status === 'FILLING') && (
            <Link
              href={`/tenders/${tender.id}/wizard`}
              className="bg-primary text-primary-foreground px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
            >
              {tender.status === 'FILLING' ? 'המשך מילוי' : 'התחל מילוי'}
            </Link>
          )}
          {/* Pass 4.5 hybrid dedup — quick-start wizard appears as a draft
              while full extraction continues in the background. */}
          {tender.status === 'EXTRACTING' && tender._count.questions > 0 && (
            <Link
              href={`/tenders/${tender.id}/wizard`}
              className="bg-primary text-primary-foreground px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium hover:bg-primary/90 transition-colors shrink-0 inline-flex items-center gap-2"
            >
              התחל מילוי
              <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full">טיוטה</span>
            </Link>
          )}
          {tender.status === 'GENERATED' && (
            <>
              <Link
                href={`/tenders/${tender.id}/wizard`}
                className="bg-muted text-foreground px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium hover:bg-muted/70 transition-colors shrink-0"
              >
                ערוך תשובות
              </Link>
              <Link
                href={`/tenders/${tender.id}/output`}
                className="bg-primary text-primary-foreground px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
              >
                צפה במסמכים
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero strip — deadline countdown is the heaviest thing on the screen.
          Per DESIGN_HANDOFF.md "Where to apply this design language next" #2. */}
      {(tender.status === 'READY' || tender.status === 'FILLING' || tender.status === 'GENERATED' || tender.status === 'PARTIAL_ERROR') && (
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-5xl mx-auto px-6 py-7 flex items-end justify-between gap-8 flex-wrap">
            <div>
              <div className="eyebrow mb-2">מועד הגשה</div>
              {deadline && daysLeft !== null ? (
                <>
                  <div className={`hero-number ${daysLeft <= 2 ? 'text-rose-600' : ''}`}>
                    {daysLeft <= 0 ? 'עבר המועד' : daysLeft === 1 ? 'מחר' : `${daysLeft} ימים`}
                  </div>
                  <div className="text-sm text-slate-500 mt-1.5">
                    {deadline.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </>
              ) : (
                <div className="text-2xl font-medium text-slate-500">לא צוין</div>
              )}
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              {tender.publisher && (
                <div>
                  <div className="eyebrow mb-1">מפרסם</div>
                  <div className="font-medium text-slate-900">{tender.publisher}</div>
                </div>
              )}
              {tender.tenderNumber && (
                <div>
                  <div className="eyebrow mb-1">מספר מכרז</div>
                  <div className="font-medium text-slate-900 tabular-nums">{tender.tenderNumber}</div>
                </div>
              )}
              {tender.ervutAmount && (
                <div>
                  <div className="eyebrow mb-1">ערבות הצעה</div>
                  <div className="font-medium text-slate-900 tabular-nums">
                    ₪{Number(tender.ervutAmount).toLocaleString('he-IL')}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Processing banner */}
      {activeJob && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-3 text-sm text-blue-800">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <div className="h-2 flex-1 bg-blue-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-500"
                style={{ width: `${activeJob.progress}%` }}
              />
            </div>
            <span>{activeJob.progressMessage ?? 'מעבד...'}</span>
            <span className="text-blue-600 font-medium">{activeJob.progress}%</span>
          </div>
        </div>
      )}

      {tender.status === 'ERROR' && (
        <div className="bg-rose-50 border-b border-rose-600/20 px-6 py-3 text-sm text-rose-600">
          <div className="max-w-4xl mx-auto">
            הניתוח נכשל. נסה לייבא מחדש או צור קשר אם הבעיה חוזרת.
          </div>
        </div>
      )}

      {tender.status === 'PARTIAL_ERROR' ? (
        <FailureRecovery
          tenderId={tender.id}
          progressAtStall={tender.jobs[0]?.progress ?? 0}
          annexesDone={tender.annexes.filter((a) => a.status === 'EXTRACTED').length}
          annexesTotal={tender.annexes.length}
          questionsReady={tender._count.questions}
          rawFields={tender.annexes.reduce((s, a) => s + (a._count?.fields ?? 0), 0)}
          failedAnnexes={tender.annexes
            .filter((a) => a.status === 'PENDING')
            .map((a) => ({
              code: a.code,
              title: a.title,
              pageCount: a.startPage && a.endPage ? a.endPage - a.startPage + 1 : 0,
              reason: 'שגיאת זמן תגובה',
              attempt: 1,
            }))}
        />
      ) : (
        <>
          {/* Tabs */}
          <div className="border-b border-border bg-card">
            <div className="max-w-4xl mx-auto flex">
              {(['summary', 'forms', 'timeline'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'summary' ? 'סיכום' : t === 'forms' ? 'טפסים' : 'ציר זמן'}
                </button>
              ))}
            </div>
          </div>

          <main className="max-w-4xl mx-auto px-6 py-8">
            {tab === 'summary' && <SummaryTab tender={tender} />}
            {tab === 'forms' && <FormsTab annexes={tender.annexes} />}
            {tab === 'timeline' && <TimelineTab milestones={tender.milestones} />}
          </main>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    UPLOADED: 'bg-slate-100 text-slate-600',
    EXTRACTING: 'bg-amber-50 text-amber-700',
    READY: 'bg-emerald-50 text-emerald-700',
    FILLING: 'bg-amber-50 text-amber-700',
    GENERATED: 'bg-emerald-100 text-emerald-800',
    ERROR: 'bg-rose-50 text-rose-600',
    PARTIAL_ERROR: 'bg-amber-50 text-amber-700',
  };
  const label: Record<string, string> = {
    UPLOADED: 'ממתין',
    EXTRACTING: 'מנתח',
    READY: 'מוכן',
    FILLING: 'ממלא',
    GENERATED: 'הושלם',
    ERROR: 'שגיאה',
    PARTIAL_ERROR: 'הושלם חלקית',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? 'bg-muted text-muted-foreground'}`}>
      {label[status] ?? status}
    </span>
  );
}

function SummaryTab({ tender }: { tender: Tender }) {
  if (tender.status === 'UPLOADED') {
    return <p className="text-muted-foreground text-sm">הניתוח טרם החל. המכרז עומד בתור לעיבוד.</p>;
  }
  if (tender.status === 'EXTRACTING') {
    return <ExtractionProgress annexes={tender.annexes} />;
  }

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <InfoCard label="מפרסם" value={tender.publisher} />
        <InfoCard label="מספר מכרז" value={tender.tenderNumber} />
        <InfoCard
          label="מועד הגשה"
          value={tender.deadline ? new Date(tender.deadline).toLocaleDateString('he-IL') : null}
        />
        <InfoCard
          label="ערבות הצעה"
          value={tender.ervutAmount ? `₪${Number(tender.ervutAmount).toLocaleString('he-IL')}` : null}
        />
        <InfoCard label="אופן הגשה" value={tender.submissionMethod} />
      </div>

      {(tender.contactName || tender.contactEmail || tender.contactPhone) && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium text-sm mb-3">איש קשר</h3>
          <div className="space-y-1 text-sm text-muted-foreground">
            {tender.contactName && <p>{tender.contactName}</p>}
            {tender.contactEmail && <p>{tender.contactEmail}</p>}
            {tender.contactPhone && <p>{tender.contactPhone}</p>}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium text-sm mb-2">נספחים שזוהו</h3>
        <p className="text-2xl font-bold text-primary">{tender.annexes.length}</p>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function FormsTab({ annexes }: { annexes: Annex[] }) {
  if (annexes.length === 0) {
    return <p className="text-muted-foreground text-sm">הנספחים יופיעו כאן לאחר ניתוח המכרז.</p>;
  }

  return (
    <div className="space-y-3">
      {annexes.map((annex) => (
        <div key={annex.id} className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded ml-2">{annex.code}</span>
              <span className="text-sm font-medium">{annex.title}</span>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              עמ׳ {annex.startPage}–{annex.endPage}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineTab({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) {
    return <p className="text-muted-foreground text-sm">אבני הדרך יופיעו כאן לאחר ניתוח המכרז.</p>;
  }

  return (
    <div className="relative pr-6">
      <div className="absolute right-2 top-0 bottom-0 w-0.5 bg-border" />
      <div className="space-y-6">
        {milestones.map((m) => {
          const date = new Date(m.date);
          const isPast = date < new Date();
          return (
            <div key={m.id} className="relative">
              <div
                className={`absolute right-[-1.25rem] top-1 w-3 h-3 rounded-full border-2 ${
                  m.isDeadline ? 'bg-destructive border-destructive' : isPast ? 'bg-muted border-border' : 'bg-primary border-primary'
                }`}
              />
              <div className={`bg-card border rounded-lg p-4 ${m.isDeadline ? 'border-destructive/40' : 'border-border'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="ml-2">{MILESTONE_ICON[m.category] ?? '📌'}</span>
                    <span className="text-sm font-medium">{m.title}</span>
                    {m.isDeadline && (
                      <span className="mr-2 text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">מועד אחרון</span>
                    )}
                  </div>
                  <span className={`text-xs font-medium ${isPast ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {date.toLocaleDateString('he-IL')}
                  </span>
                </div>
                {m.description && <p className="text-xs text-muted-foreground mt-1 mr-6">{m.description}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExtractionProgress({ annexes }: { annexes: Annex[] }) {
  if (annexes.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        מנתח את המכרז... הדף יתרענן אוטומטית.
      </p>
    );
  }

  const totalFields = annexes.reduce((sum, a) => sum + (a._count?.fields ?? 0), 0);
  const doneCount = annexes.filter((a) => a.status === 'EXTRACTED').length;

  // Active annex: first one that's still PENDING with fields > 0 (mid-extraction),
  // else first PENDING after the last EXTRACTED.
  const lastDoneIdx = annexes.map((a, i) => (a.status === 'EXTRACTED' ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  const activeIdx = annexes.findIndex((a, i) => i > lastDoneIdx && a.status === 'PENDING');

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <p className="font-medium mb-1">מחלץ שדות מטפסי המכרז…</p>
        <p className="text-xs text-blue-800">
          נספחים שהושלמו: {doneCount}/{annexes.length} · שדות שזוהו עד כה: {totalFields}
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <h3 className="text-sm font-medium px-4 py-2 border-b border-border bg-muted/50">
          התקדמות לפי נספח
        </h3>
        <ul className="divide-y divide-border">
          {annexes.map((a, i) => {
            const fields = a._count?.fields ?? 0;
            const pages = a.startPage && a.endPage ? a.endPage - a.startPage + 1 : 0;
            const isDone = a.status === 'EXTRACTED';
            const isActive = i === activeIdx;
            return (
              <li
                key={a.id}
                className={`px-4 py-2 flex items-center gap-3 text-sm ${isActive ? 'bg-blue-50/50' : ''}`}
              >
                <span className="shrink-0" aria-hidden>
                  {isDone ? '✓' : isActive ? '⏳' : '◯'}
                </span>
                <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{a.code}</span>
                <span className="flex-1 truncate">{a.title}</span>
                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                  {pages} עמ׳
                </span>
                <span
                  className={`text-xs shrink-0 tabular-nums ${
                    isDone ? 'text-green-700' : isActive ? 'text-blue-700' : 'text-muted-foreground'
                  }`}
                >
                  {fields} שדות
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                    isDone
                      ? 'bg-green-100 text-green-800'
                      : isActive
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isDone ? 'הושלם' : isActive ? 'מחלץ…' : 'ממתין'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
