'use client';

type AutofillState = '3a' | '3b' | '3c';

type Props = {
  state: AutofillState;
  sourceLabel: string;
  sourceStep: number;
  pendingValue?: string; // only used in 3c
  onChange?: () => void; // 3a — "שנה" button
  onConfirm?: () => void; // 3c — "כן, מלא אוטומטית"
  onReject?: () => void; // 3c — "לא, אמלא בעצמי"
};

const STEP_LABEL_HE: Record<number, string> = {
  1: 'פרטי החברה',
  2: 'מורשי חתימה',
  3: 'ניסיון',
  4: 'הצהרות',
  5: 'תוכן הצעה',
};

/**
 * Pattern 3 visual variants — see DESIGN_HANDOFF.md and mockup-03-autofill-pattern.html.
 * Only renders the explanatory chrome around an input; the input itself is rendered
 * separately by QuestionInput. The wrapper does background/accent-bar styling.
 */
export function AutofillBanner3a({ sourceLabel, sourceStep, onChange }: Pick<Props, 'sourceLabel' | 'sourceStep' | 'onChange'>) {
  return (
    <div className="mt-3 pt-3 border-t border-dashed border-slate-200 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs text-emerald-700 leading-snug">
        <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>
          מילאנו עבורך מתוך התשובה ל<strong className="font-medium">&quot;{sourceLabel}&quot;</strong>
          {' '}בשלב {sourceStep}{STEP_LABEL_HE[sourceStep] ? ` (${STEP_LABEL_HE[sourceStep]})` : ''}
        </span>
      </div>
      {onChange && (
        <button
          type="button"
          onClick={onChange}
          className="text-xs font-medium px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 hover:border-slate-500 shrink-0 transition-colors"
        >
          שנה
        </button>
      )}
    </div>
  );
}

export function AutofillBadge3b({ sourceLabel, sourceStep }: Pick<Props, 'sourceLabel' | 'sourceStep'>) {
  return (
    <span
      className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 text-[11px] font-medium px-2.5 py-0.5 rounded-full cursor-help"
      title={`מתוך "${sourceLabel}" בשלב ${sourceStep}`}
    >
      <svg className="w-2.5 h-2.5 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      זוהה אוטומטית
    </span>
  );
}

export function AutofillConfirm3c({
  sourceLabel,
  pendingValue,
  onConfirm,
  onReject,
}: Pick<Props, 'sourceLabel' | 'pendingValue' | 'onConfirm' | 'onReject'>) {
  return (
    <div className="mt-2">
      <p className="text-sm text-slate-700 leading-relaxed mb-4">
        זיהינו שדה שייתכן שזהה ל
        <strong className="font-medium text-slate-900">&quot;{sourceLabel}&quot;</strong>.
        האם למלא אותו עם <strong className="font-medium text-slate-900">&quot;{pendingValue}&quot;</strong>?
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 bg-amber-500 text-white text-[13px] font-medium px-3.5 py-2.5 rounded-lg border border-amber-500 hover:bg-amber-700 hover:border-amber-700 transition-colors"
        >
          כן, מלא אוטומטית
        </button>
        <button
          type="button"
          onClick={onReject}
          className="flex-1 bg-white text-slate-900 text-[13px] font-medium px-3.5 py-2.5 rounded-lg border border-slate-300 hover:bg-slate-50 hover:border-slate-500 transition-colors"
        >
          לא, אמלא בעצמי
        </button>
      </div>
    </div>
  );
}
