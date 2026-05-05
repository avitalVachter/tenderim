'use client';

type QuestionInputProps = {
  questionId: string;
  label: string;
  helpText: string | null | undefined;
  fieldType: string;
  required: boolean;
  options: unknown;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function QuestionInput({
  label,
  helpText,
  fieldType,
  required,
  options,
  value,
  onChange,
  disabled,
}: QuestionInputProps) {
  const inputClass =
    'w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background disabled:opacity-60';

  const opts = Array.isArray(options) ? (options as string[]) : [];

  const renderInput = () => {
    switch (fieldType) {
      case 'SHORT_TEXT':
      case 'ID_NUMBER':
      case 'COMPANY_ID':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled}
            className={inputClass}
            dir="rtl"
          />
        );

      case 'PHONE':
        return (
          <input
            type="tel"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled}
            className={inputClass}
            dir="ltr"
          />
        );

      case 'EMAIL':
        return (
          <input
            type="email"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled}
            className={inputClass}
            dir="ltr"
          />
        );

      case 'NUMBER':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled}
            className={inputClass}
            dir="ltr"
          />
        );

      case 'CURRENCY':
        return (
          <div className="relative">
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₪</span>
            <input
              type="number"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              required={required}
              disabled={disabled}
              className={`${inputClass} pr-7`}
              dir="ltr"
            />
          </div>
        );

      case 'DATE':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled}
            className={inputClass}
            dir="ltr"
          />
        );

      case 'LONG_TEXT':
      case 'ADDRESS':
        return (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled}
            rows={4}
            className={`${inputClass} resize-y`}
            dir="rtl"
          />
        );

      case 'CHECKBOX':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value === 'true'}
              onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
              required={required}
              disabled={disabled}
              className="w-4 h-4 rounded border-input accent-primary"
            />
            <span className="text-sm">{label}</span>
          </label>
        );

      case 'RADIO':
        return (
          <div className="space-y-2">
            {opts.map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`radio-${label}`}
                  value={opt}
                  checked={value === opt}
                  onChange={() => onChange(opt)}
                  disabled={disabled}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm">{opt}</span>
              </label>
            ))}
          </div>
        );

      case 'SELECT':
        return (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled}
            className={inputClass}
            dir="rtl"
          >
            <option value="">בחר...</option>
            {opts.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled}
            className={inputClass}
            dir="rtl"
          />
        );
    }
  };

  // CHECKBOX renders its own label inline
  if (fieldType === 'CHECKBOX') {
    return (
      <div className="space-y-1">
        {renderInput()}
        {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">
        {label}
        {required && <span className="text-destructive mr-1">*</span>}
      </label>
      {helpText && <p className="text-xs text-muted-foreground mb-1">{helpText}</p>}
      {renderInput()}
    </div>
  );
}
