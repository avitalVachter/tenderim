'use client';

import { Eyebrow } from '@/components/ui/eyebrow';

type Question = {
  id: string;
  label: string;
  appearsInAnnexes?: string[];
};

/**
 * Recessive (slate-50) sidebar showing where each question on the current
 * wizard step appears in the original tender. Placeholder thumbnails until
 * pdf-service exposes a /thumbnail endpoint (post-v1).
 *
 * 280px fixed width on desktop; hidden on mobile.
 */
export function ContextSidebar({ questions }: { questions: Question[] }) {
  // Aggregate annex codes across all questions on this step (with counts)
  const annexCounts = new Map<string, number>();
  for (const q of questions) {
    for (const code of q.appearsInAnnexes ?? []) {
      annexCounts.set(code, (annexCounts.get(code) ?? 0) + 1);
    }
  }
  const annexes = [...annexCounts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <aside className="hidden lg:flex flex-col w-[280px] shrink-0 bg-slate-50 rounded-xl p-5 self-start sticky top-6">
      <Eyebrow className="mb-3">איפה זה במכרז</Eyebrow>

      {annexes.length === 0 ? (
        <p className="text-xs text-slate-500 leading-relaxed">
          השאלות בשלב זה לא מקושרות לנספח ספציפי.
        </p>
      ) : (
        <ul className="space-y-3">
          {annexes.map(([code, count]) => (
            <li key={code} className="space-y-2">
              {/* Thumbnail placeholder — pure CSS, no asset dependency.
                  When pdf-service exposes /thumbnail we swap for an <img>. */}
              <div className="aspect-[4/5] bg-slate-100 rounded-md border border-slate-200 flex items-center justify-center">
                <span className="text-[11px] font-mono font-medium text-slate-400">{code}</span>
              </div>
              <div>
                <div className="text-[13px] font-medium text-slate-900">{code}</div>
                <div className="text-[11px] text-slate-500">
                  {count} {count === 1 ? 'שאלה' : 'שאלות'} בשלב הזה
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 pt-4 border-t border-slate-200 text-[11px] text-slate-400 leading-relaxed">
        הכפתור &quot;צפה במכרז&quot; ייחשף בגרסה הבאה — בינתיים פתח את המסמך המקורי
        בכרטיסייה נפרדת אם תרצה לוודא ניסוח.
      </p>
    </aside>
  );
}
