'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

type Mode = 'file' | 'url';

export function UploadModal() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('file');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function reset() {
    setError(null);
    setProgress(null);
    setBusy(false);
  }

  async function handleFileSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    const name = nameRef.current?.value.trim();
    if (!file || !name) return;

    reset();
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('name', name);
      const res = await fetch('/api/tenders', { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'שגיאה בהעלאה');
      }
      const { tenderId } = (await res.json()) as { tenderId: string };
      setOpen(false);
      router.push(`/tenders/${tenderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה לא צפויה');
    } finally {
      setBusy(false);
    }
  }

  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = urlRef.current?.value.trim();
    if (!url) return;

    reset();
    setBusy(true);
    setProgress('סורק את הדף ומוריד קבצים...');
    try {
      const res = await fetch('/api/tenders/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'שגיאה בייבוא');
      }
      const { tenderId } = (await res.json()) as { tenderId: string };
      setOpen(false);
      router.push(`/tenders/${tenderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה לא צפויה');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        + מכרז חדש
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-card rounded-lg border border-border w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">העלאת מכרז חדש</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground text-xl leading-none"
                aria-label="סגור"
              >
                ✕
              </button>
            </div>

            <div className="flex border-b border-border mb-4">
              <button
                onClick={() => {
                  setMode('file');
                  reset();
                }}
                className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                  mode === 'file' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                העלה קובץ
              </button>
              <button
                onClick={() => {
                  setMode('url');
                  reset();
                }}
                className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                  mode === 'url' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                ייבא מקישור
              </button>
            </div>

            {mode === 'file' ? (
              <form onSubmit={handleFileSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">שם המכרז</label>
                  <input
                    ref={nameRef}
                    type="text"
                    required
                    placeholder="למשל: מכרז משטרה 29/2026"
                    className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">קובץ PDF</label>
                  <input
                    ref={fileRef}
                    type="file"
                    required
                    accept=".pdf"
                    className="w-full text-sm file:ml-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:text-xs file:font-medium cursor-pointer"
                  />
                </div>
                {error && <p className="text-destructive text-sm">{error}</p>}
                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="px-4 py-2 rounded-md text-sm border border-border hover:bg-muted transition-colors"
                  >
                    ביטול
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {busy ? 'מעלה...' : 'העלאה והתחל ניתוח'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleUrlSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">כתובת דף המכרז</label>
                  <input
                    ref={urlRef}
                    type="url"
                    required
                    placeholder="https://www.mr.gov.il/..."
                    dir="ltr"
                    className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    נוריד אוטומטית את כל ה-PDF/Excel/Doc מהדף ונפעיל ניתוח.
                  </p>
                </div>
                {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
                {error && <p className="text-destructive text-sm">{error}</p>}
                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="px-4 py-2 rounded-md text-sm border border-border hover:bg-muted transition-colors"
                  >
                    ביטול
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {busy ? 'מייבא...' : 'ייבא והתחל ניתוח'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
