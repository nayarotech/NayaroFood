/** A single ranking component, shown with its weight so the maths is visible. */
export function ScoreBar({
  label,
  score,
  weight,
  hint,
}: {
  label: string;
  score: number;
  weight: number;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-ink-hi">{label}</span>
        <span className="text-ink-label">
          <span className="font-mono tabular-nums text-ink">{score.toFixed(0)}</span>
          <span className="text-xs"> / 100 · {Math.round(weight * 100)}% weight</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-ny-pill bg-surface-inset">
        <div
          className="h-full rounded-ny-pill bg-accent transition-[width] duration-500"
          style={{ width: `${Math.max(2, score)}%` }}
        />
      </div>
      {hint && <p className="mt-1 text-xs text-ink-label">{hint}</p>}
    </div>
  );
}
