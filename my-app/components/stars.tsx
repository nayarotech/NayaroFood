import { Star } from 'lucide-react';

/** Read-only star rating, e.g. 4.3 → four full stars and one partial. */
export function Stars({ value, size = 14, className = '' }: { value: number; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <span key={n} className="relative inline-block" style={{ width: size, height: size }} aria-hidden>
            <Star className="absolute inset-0 text-line-strong" style={{ width: size, height: size }} strokeWidth={1.5} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="fill-[#f5a524] text-[#f5a524]" style={{ width: size, height: size }} strokeWidth={1.5} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** "4.3 ★ (27)" chip for listings. Only the average is ever public. */
export function RatingChip({ rating }: { rating: { average: number; count: number } | null }) {
  if (!rating) return <span className="text-xs text-ink-label">New</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-hi">
      <Star aria-hidden className="size-3.5 fill-[#f5a524] text-[#f5a524]" strokeWidth={1.5} />
      {rating.average.toFixed(1)}
      <span className="font-normal text-ink-label">({rating.count})</span>
    </span>
  );
}
