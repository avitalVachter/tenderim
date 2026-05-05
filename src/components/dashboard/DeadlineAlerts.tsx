'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Alert = {
  id: string;
  title: string;
  daysLeft: number;
};

const STORAGE_KEY = 'tenderim:dismissed-deadlines';

export function DeadlineAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  // Load dismissed set from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) setDismissed(new Set(JSON.parse(stored) as string[]));
    } catch {
      // ignore
    }
  }, []);

  // Fetch upcoming-deadline tenders once on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/tenders');
        if (!res.ok) return;
        const tenders = (await res.json()) as Array<{
          id: string;
          title: string;
          deadline: string | null;
          status: string;
        }>;
        const now = Date.now();
        const upcoming: Alert[] = [];
        for (const t of tenders) {
          if (!t.deadline) continue;
          if (t.status === 'GENERATED') continue;
          const days = Math.ceil((new Date(t.deadline).getTime() - now) / 86400000);
          if (days >= 0 && days <= 7) {
            upcoming.push({ id: t.id, title: t.title, daysLeft: days });
          }
        }
        upcoming.sort((a, b) => a.daysLeft - b.daysLeft);
        if (!cancelled) setAlerts(upcoming);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // ignore
    }
  }

  if (!loaded) return null;
  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="fixed top-4 left-4 z-40 flex flex-col gap-2 max-w-sm">
      {visible.map((a) => {
        const urgent = a.daysLeft <= 2;
        return (
          <div
            key={a.id}
            className={`bg-card border rounded-lg p-3 shadow-lg ${
              urgent ? 'border-destructive/50' : 'border-yellow-300'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg shrink-0" aria-hidden>{urgent ? '🔴' : '⏰'}</span>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    urgent ? 'text-destructive' : 'text-yellow-700'
                  }`}
                >
                  {a.daysLeft === 0
                    ? 'מועד הגשה היום!'
                    : a.daysLeft === 1
                    ? 'מועד הגשה מחר'
                    : `נותרו ${a.daysLeft} ימים`}
                </p>
                <Link
                  href={`/tenders/${a.id}`}
                  className="text-xs text-foreground hover:underline line-clamp-1 block"
                >
                  {a.title}
                </Link>
              </div>
              <button
                onClick={() => dismiss(a.id)}
                className="text-muted-foreground hover:text-foreground text-sm shrink-0 px-1"
                aria-label="סגור התראה"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
