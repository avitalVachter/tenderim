'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { QuestionInput } from './QuestionInput';

type Question = {
  id: string;
  label: string;
  helpText: string | null;
  fieldType: string;
  required: boolean;
  options: unknown;
  category: string;
  answer: { value: unknown; aiImproved: boolean; originalValue: unknown } | null;
};

type WizardStepProps = {
  tenderId: string;
  tenderTitle: string;
  step: number;
  totalSteps: number;
  questions: Question[];
  isReview: boolean;
  isNarrative: boolean;
};

const STEP_LABELS: Record<number, string> = {
  1: 'פרטי החברה',
  2: 'מורשי חתימה',
  3: 'ניסיון',
  4: 'הצהרות',
  5: 'תוכן הצעה',
  6: 'סקירה',
};

const CATEGORY_LABELS: Record<string, string> = {
  COMPANY_INFO: 'פרטי החברה',
  SIGNATORY_INFO: 'מורשי חתימה',
  EXPERIENCE: 'ניסיון',
  DECLARATIONS: 'הצהרות',
  NARRATIVE: 'תוכן הצעה',
  REVIEW: 'סקירה',
};

function valueToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

export function WizardStep({
  tenderId,
  tenderTitle,
  step,
  totalSteps,
  questions,
  isReview,
  isNarrative,
}: WizardStepProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const q of questions) {
      init[q.id] = valueToString(q.answer?.value);
    }
    return init;
  });
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const savedTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const [improvingId, setImprovingId] = useState<string | null>(null);
  const [originals, setOriginals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const q of questions) {
      if (q.answer?.aiImproved && q.answer.originalValue !== null && q.answer.originalValue !== undefined) {
        init[q.id] = valueToString(q.answer.originalValue);
      }
    }
    return init;
  });
  const [generating, setGenerating] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);
  const debounceRef = useRef<Record<string, NodeJS.Timeout>>({});

  const saveAnswer = useCallback(
    async (questionId: string, value: string) => {
      setSavingIds((prev) => new Set(prev).add(questionId));
      try {
        const res = await fetch(`/api/tenders/${tenderId}/answers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId, value }),
        });
        if (!res.ok) throw new Error('שמירה נכשלה');
        // Show "saved" briefly
        setSavedIds((prev) => new Set(prev).add(questionId));
        if (savedTimers.current[questionId]) clearTimeout(savedTimers.current[questionId]);
        savedTimers.current[questionId] = setTimeout(() => {
          setSavedIds((prev) => {
            const next = new Set(prev);
            next.delete(questionId);
            return next;
          });
        }, 1500);
      } catch {
        // silent for autosave
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(questionId);
          return next;
        });
      }
    },
    [tenderId]
  );

  const handleChange = useCallback(
    (questionId: string, value: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
      // Debounce save 500ms
      if (debounceRef.current[questionId]) clearTimeout(debounceRef.current[questionId]);
      debounceRef.current[questionId] = setTimeout(() => {
        saveAnswer(questionId, value);
      }, 500);
    },
    [saveAnswer]
  );

  // Cleanup pending saves + saved indicators on unmount
  useEffect(() => {
    const timers = debounceRef.current;
    const savedT = savedTimers.current;
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t);
      for (const t of Object.values(savedT)) clearTimeout(t);
    };
  }, []);

  const saveStep = useCallback(
    async (newStep: number) => {
      try {
        await fetch(`/api/wizard/${tenderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentStep: newStep }),
        });
      } catch {
        // non-critical
      }
    },
    [tenderId]
  );

  const goNext = async () => {
    setNavError(null);
    // Flush any pending saves
    const pending = Object.entries(debounceRef.current);
    for (const [, t] of pending) clearTimeout(t);
    await Promise.all(
      questions.map((q) => {
        const current = answers[q.id] ?? '';
        const original = valueToString(q.answer?.value);
        if (current !== original) return saveAnswer(q.id, current);
        return Promise.resolve();
      })
    );

    const next = step + 1;
    await saveStep(next);
    router.push(`/tenders/${tenderId}/wizard/${next}`);
  };

  const goPrev = async () => {
    const prev = step - 1;
    if (prev < 1) {
      router.push(`/tenders/${tenderId}`);
      return;
    }
    await saveStep(prev);
    router.push(`/tenders/${tenderId}/wizard/${prev}`);
  };

  const handleImprove = async (questionId: string) => {
    setImprovingId(questionId);
    setNavError(null);
    try {
      // Make sure latest text is saved first
      if (debounceRef.current[questionId]) clearTimeout(debounceRef.current[questionId]);
      await saveAnswer(questionId, answers[questionId] ?? '');

      const res = await fetch(`/api/tenders/${tenderId}/improve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'שיפור נכשל');
      }
      const { value, original } = (await res.json()) as { value: string; original: string };
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
      setOriginals((prev) => ({ ...prev, [questionId]: original }));
    } catch (err) {
      setNavError(err instanceof Error ? err.message : 'שגיאה לא צפויה');
    } finally {
      setImprovingId(null);
    }
  };

  const handleRevert = (questionId: string) => {
    const orig = originals[questionId];
    if (orig === undefined) return;
    setAnswers((prev) => ({ ...prev, [questionId]: orig }));
    saveAnswer(questionId, orig);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setNavError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/generate`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'יצירה נכשלה');
      }
      // Generation is async — tender page polls and shows progress
      router.push(`/tenders/${tenderId}`);
    } catch (err) {
      setNavError(err instanceof Error ? err.message : 'שגיאה לא צפויה');
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link href={`/tenders/${tenderId}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← חזור למכרז
          </Link>
          <h1 className="text-lg font-bold flex-1 line-clamp-1">{tenderTitle}</h1>
        </div>
      </header>

      {/* Step indicator */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            {Array.from({ length: totalSteps }).map((_, i) => {
              const n = i + 1;
              const active = n === step;
              const done = n < step;
              return (
                <div key={n} className="flex-1 flex items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                      active
                        ? 'bg-primary text-primary-foreground'
                        : done
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {done ? '✓' : n}
                  </div>
                  {n < totalSteps && (
                    <div className={`flex-1 h-0.5 ${done ? 'bg-primary/40' : 'bg-border'}`} />
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground text-center mt-2">
            שלב {step} מתוך {totalSteps} · {STEP_LABELS[step]}
          </p>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {isReview ? (
          <ReviewView
            questions={questions}
            answers={answers}
            onJump={async (s) => {
              await saveStep(s);
              router.push(`/tenders/${tenderId}/wizard/${s}`);
            }}
          />
        ) : questions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            אין שאלות בשלב זה. ניתן להמשיך לשלב הבא.
          </p>
        ) : (
          <div className="space-y-6">
            {questions.map((q) => {
              const isAiImproved = !!originals[q.id];
              return (
                <div key={q.id} className="bg-card border border-border rounded-lg p-5">
                  <div className="flex items-start justify-end gap-3 mb-3 min-h-[20px]">
                    {savingIds.has(q.id) && <span className="text-xs text-muted-foreground">שומר...</span>}
                    {!savingIds.has(q.id) && savedIds.has(q.id) && (
                      <span className="text-xs text-green-600">✓ נשמר</span>
                    )}
                    {isAiImproved && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">שופר ע״י AI</span>
                    )}
                  </div>
                  <QuestionInput
                    questionId={q.id}
                    label={q.label}
                    helpText={q.helpText}
                    fieldType={q.fieldType}
                    required={q.required}
                    options={q.options}
                    value={answers[q.id] ?? ''}
                    onChange={(v) => handleChange(q.id, v)}
                    disabled={improvingId === q.id}
                  />
                  {isNarrative && (q.fieldType === 'LONG_TEXT' || q.fieldType === 'SHORT_TEXT') && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleImprove(q.id)}
                        disabled={improvingId === q.id || !(answers[q.id] ?? '').trim()}
                        className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {improvingId === q.id ? 'משפר...' : '✨ שפר עם AI'}
                      </button>
                      {isAiImproved && (
                        <button
                          type="button"
                          onClick={() => handleRevert(q.id)}
                          disabled={improvingId === q.id}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          ↩ החזר טקסט מקורי
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {navError && (
          <p className="text-destructive text-sm mt-4">{navError}</p>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goPrev}
            className="px-4 py-2 rounded-md text-sm border border-border hover:bg-muted transition-colors"
          >
            {step === 1 ? '← חזור למכרז' : '→ הקודם'}
          </button>

          {isReview ? (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="bg-primary text-primary-foreground px-6 py-2 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {generating ? 'מייצר...' : 'צור מסמכים ←'}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="bg-primary text-primary-foreground px-6 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              הבא ←
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function ReviewView({
  questions,
  answers,
  onJump,
}: {
  questions: Question[];
  answers: Record<string, string>;
  onJump: (step: number) => void;
}) {
  const STEP_FOR_CATEGORY: Record<string, number> = {
    COMPANY_INFO: 1,
    SIGNATORY_INFO: 2,
    EXPERIENCE: 3,
    DECLARATIONS: 4,
    NARRATIVE: 5,
  };

  const grouped = new Map<string, Question[]>();
  for (const q of questions) {
    if (!grouped.has(q.category)) grouped.set(q.category, []);
    grouped.get(q.category)!.push(q);
  }

  if (questions.length === 0) {
    return <p className="text-muted-foreground text-sm">אין שאלות לסקירה.</p>;
  }

  const orderedCats = ['COMPANY_INFO', 'SIGNATORY_INFO', 'EXPERIENCE', 'DECLARATIONS', 'NARRATIVE'].filter((c) =>
    grouped.has(c)
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">סקור את התשובות לפני יצירת המסמכים. ניתן לחזור לכל שלב לעריכה.</p>
      {orderedCats.map((cat) => (
        <div key={cat} className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base">{CATEGORY_LABELS[cat] ?? cat}</h2>
            <button
              type="button"
              onClick={() => onJump(STEP_FOR_CATEGORY[cat])}
              className="text-xs text-primary hover:underline"
            >
              עריכה
            </button>
          </div>
          <dl className="space-y-3">
            {grouped.get(cat)!.map((q) => {
              const v = answers[q.id] ?? '';
              const empty = !v.trim();
              return (
                <div key={q.id} className="flex flex-col sm:flex-row sm:gap-4 sm:items-baseline border-b border-border last:border-0 pb-2 last:pb-0">
                  <dt className="text-sm text-muted-foreground sm:w-1/3 shrink-0">{q.label}</dt>
                  <dd className={`text-sm flex-1 ${empty ? 'text-muted-foreground italic' : 'font-medium'} whitespace-pre-wrap`}>
                    {empty ? '—' : v}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}
