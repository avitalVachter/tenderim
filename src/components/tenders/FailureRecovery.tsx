'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eyebrow } from '@/components/ui/eyebrow';

type FailedAnnex = {
  code: string;
  title: string;
  pageCount: number;
  reason: string;
  attempt: number;
};

type FailureRecoveryProps = {
  tenderId: string;
  progressAtStall: number; // 0-100
  annexesDone: number;
  annexesTotal: number;
  questionsReady: number;
  rawFields: number;
  failedAnnexes: FailedAnnex[];
};

/**
 * Pattern 2 from DESIGN_HANDOFF.md — shown when Tender.status === 'PARTIAL_ERROR'.
 * Honest summary, three success metrics, asymmetric CTAs (primary 2× wider).
 * Forbidden phrases: "Sorry", "Please try again", error codes, full-page error icons.
 */
export function FailureRecovery(props: FailureRecoveryProps) {
  const {
    tenderId,
    progressAtStall,
    annexesDone,
    annexesTotal,
    questionsReady,
    rawFields,
    failedAnnexes,
  } = props;
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<'continue' | 'retry' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setBusyAction('continue');
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/continue-partial`, { method: 'POST' });
      if (!res.ok) throw new Error('בעיה בהמשך');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא צפויה');
      setBusyAction(null);
    }
  }

  async function handleRetry() {
    setBusyAction('retry');
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/retry-incomplete`, { method: 'POST' });
      if (!res.ok) throw new Error('בעיה בניסיון מחדש');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא צפויה');
      setBusyAction(null);
    }
  }

  const failedNames = failedAnnexes.map((a) => a.code).join(' ו');

  return (
    <div className="max-w-[880px] mx-auto px-6 py-10">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Banner */}
        <div className="flex">
          <div className="w-1 bg-amber-500" aria-hidden />
          <div className="flex-1 bg-amber-50 px-7 py-6">
            <Eyebrow className="text-amber-700 mb-2">
              הניתוח נעצר · {progressAtStall}%
            </Eyebrow>
            <h1 className="text-2xl font-bold text-slate-900 mb-2 leading-tight tracking-tight">
              סיימנו את רוב העבודה
            </h1>
            <p className="text-sm text-slate-700 leading-relaxed max-w-[600px]">
              {annexesDone} מתוך {annexesTotal} נספחים נותחו במלואם.{' '}
              {failedAnnexes.length === 1 ? 'נספח אחד נכשל' : `${failedAnnexes.length} נספחים נכשלו`}.
              אפשר להמשיך עם מה שיש או לנסות שוב את החסרים.
            </p>
          </div>
        </div>

        {/* Stats — three success metrics, hero-number weight */}
        <div className="grid grid-cols-3 gap-6 bg-slate-50 px-7 py-7 border-y border-slate-200">
          <Stat label="נספחים" value={annexesDone} total={annexesTotal} />
          <Stat label="שאלות מוכנות" value={questionsReady} />
          <Stat label="שדות במקור" value={rawFields} />
        </div>

        {/* Failed annexes */}
        {failedAnnexes.length > 0 && (
          <div className="px-7 py-6">
            <Eyebrow className="mb-4">נספחים שנכשלו</Eyebrow>
            <ul className="divide-y divide-slate-200">
              {failedAnnexes.map((a) => (
                <li key={a.code} className="flex items-center justify-between py-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <svg
                      className="w-[18px] h-[18px] text-amber-700 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {a.code} — {a.title}
                    </span>
                    <span className="text-xs text-slate-500 shrink-0">{a.pageCount} עמודים</span>
                  </div>
                  <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md shrink-0">
                    {a.reason} · ניסיון {a.attempt} מתוך 3
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions — asymmetric (primary 2× wider) */}
        <div className="flex gap-2.5 bg-slate-50 px-7 py-6 border-t border-slate-200">
          <button
            type="button"
            onClick={handleContinue}
            disabled={busyAction !== null}
            className="flex-[2] bg-slate-900 text-white text-sm font-medium px-5 py-3.5 rounded-[10px] hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            {busyAction === 'continue' ? 'ממשיך…' : `המשך עם ${annexesDone} הנספחים שנותחו ←`}
          </button>
          <button
            type="button"
            onClick={handleRetry}
            disabled={busyAction !== null}
            className="flex-1 bg-white text-slate-900 text-sm font-medium px-5 py-3.5 rounded-[10px] border border-slate-300 hover:bg-slate-50 hover:border-slate-500 transition-colors disabled:opacity-50"
          >
            {busyAction === 'retry' ? 'מנסה…' : 'נסה שוב את החסרים'}
          </button>
        </div>
      </div>

      {/* Info note — explains what "continue" actually does */}
      <div className="mt-4 bg-sky-50 accent-r-sky rounded-[10px] px-4 py-3.5 flex gap-3 items-start">
        <svg
          className="w-[18px] h-[18px] text-sky-700 shrink-0 mt-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <p className="text-[13px] text-slate-700 leading-relaxed">
          אם תמשיך עם מה שיש — נספחים <strong className="font-medium text-slate-900">{failedNames}</strong>{' '}
          יסומנו ל<strong className="font-medium text-slate-900">מילוי ידני</strong>.
          תוכל למלא אותם בעצמך לפני ההגשה, או לנסות לנתח אותם שוב מאוחר יותר.
        </p>
      </div>

      {error && <p className="mt-4 text-sm text-rose-600 text-center">{error}</p>}

      <div className="mt-6 text-center text-xs text-slate-400">
        עדיין נתקעת?{' '}
        <a href="mailto:support@viraly-ai.com" className="text-slate-500 underline">
          דבר איתנו
        </a>
      </div>
    </div>
  );
}

function Stat({ label, value, total }: { label: string; value: number; total?: number }) {
  return (
    <div>
      <Eyebrow className="mb-2">{label}</Eyebrow>
      <div className="hero-number tracking-tight">
        {value}
        {total !== undefined && (
          <span className="text-lg font-normal text-slate-400 mr-1"> / {total}</span>
        )}
      </div>
    </div>
  );
}
