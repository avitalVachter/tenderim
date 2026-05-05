'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

type OutputFile = {
  annexCode: string;
  title: string;
  filename: string;
  needsSignature: boolean;
  needsStamp: boolean;
  needsLawyer: boolean;
};

type OutputData = {
  files: OutputFile[];
  hasZip: boolean;
  finishedAt: string | null;
};

export default function OutputPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<OutputData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/tenders/${id}/output`);
        if (!res.ok) throw new Error('שגיאה בטעינת הקבצים');
        const json = (await res.json()) as OutputData;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'שגיאה לא צפויה');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">טוען...</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center text-destructive">{error}</div>;
  if (!data) return null;

  const anyHumanAction = data.files.some((f) => f.needsSignature || f.needsStamp || f.needsLawyer);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link href={`/tenders/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← חזור למכרז
          </Link>
          <h1 className="text-lg font-bold flex-1">המסמכים שנוצרו</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {data.files.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground text-sm">עדיין לא נוצרו מסמכים. חזור לאשף ולחץ על &quot;צור מסמכים&quot;.</p>
            <Link
              href={`/tenders/${id}/wizard`}
              className="inline-block mt-4 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              פתיחת האשף
            </Link>
          </div>
        ) : (
          <>
            {data.hasZip && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-semibold text-base">חבילת ההגשה המלאה</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      קובץ ZIP עם כל הנספחים הממולאים + גיליון כיסוי
                    </p>
                  </div>
                  <a
                    href={`/api/tenders/${id}/output/submission.zip`}
                    download
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
                  >
                    הורד ZIP
                  </a>
                </div>
              </div>
            )}

            {anyHumanAction && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm">
                <p className="font-medium text-yellow-900 mb-1">⚠ פעולות אנושיות נדרשות</p>
                <p className="text-yellow-800">
                  חלק מהנספחים דורשים חתימה, חותמת או אישור עו&quot;ד. סמנים מופיעים ליד כל קובץ רלוונטי בהמשך.
                </p>
              </div>
            )}

            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <h2 className="font-semibold text-base px-5 py-3 border-b border-border">קבצים בודדים ({data.files.length})</h2>
              <ul className="divide-y divide-border">
                {data.files.map((f) => (
                  <li key={f.filename} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{f.annexCode}</span>
                        <span className="text-sm font-medium line-clamp-1">{f.title}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {f.needsSignature && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">חתימה ידנית</span>
                        )}
                        {f.needsStamp && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">חותמת</span>
                        )}
                        {f.needsLawyer && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">אישור עו&quot;ד</span>
                        )}
                      </div>
                    </div>
                    <a
                      href={`/api/tenders/${id}/output/${encodeURIComponent(f.filename)}`}
                      download
                      className="text-sm text-primary hover:underline shrink-0"
                    >
                      הורדה
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {data.finishedAt && (
              <p className="text-xs text-muted-foreground text-center">
                נוצר ב-{new Date(data.finishedAt).toLocaleString('he-IL')}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
