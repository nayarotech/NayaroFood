export function AuthField({
  label,
  name,
  type = 'text',
  error,
  hint,
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
  error?: string | undefined;
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = `field-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink-hi">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`w-full rounded-ny border bg-surface px-3.5 py-2.5 text-sm text-ink transition-colors placeholder:text-ink-label focus:outline-none ${
          error ? 'border-danger focus:border-danger' : 'border-line focus:border-accent'
        }`}
        {...rest}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-label">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
