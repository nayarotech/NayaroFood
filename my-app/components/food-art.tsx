/**
 * Designed artwork for a restaurant or dish that has no uploaded photo.
 *
 * Restaurants upload real images in production, but the fallback has to look
 * deliberate rather than like a missing asset — so this composes a deterministic
 * gradient field with a bold geometric glyph drawn from the category name.
 * The same name always produces the same artwork.
 */

type Glyph = 'momo' | 'pizza' | 'burger' | 'thali' | 'drink' | 'noodle' | 'default';

/** Warm food hues that still sit comfortably beside the nayaro blue. */
const PALETTES: { from: string; to: string; ink: string }[] = [
  { from: '#1f5eff', to: '#9dbcff', ink: '#1440c4' },
  { from: '#0ea5a5', to: '#a5e6e2', ink: '#0b7272' },
  { from: '#f97316', to: '#ffd0ab', ink: '#c2410c' },
  { from: '#7c3aed', to: '#cdbaff', ink: '#5b21b6' },
  { from: '#e11d48', to: '#ffbccb', ink: '#9f1239' },
  { from: '#16a34a', to: '#a9e9c0', ink: '#15803d' },
];

function hash(input: string): number {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = (value * 31 + input.charCodeAt(i)) >>> 0;
  }
  return value;
}

function glyphFor(category: string): Glyph {
  const key = category.toLowerCase();
  if (key.includes('momo') || key.includes('dumpl')) return 'momo';
  if (key.includes('pizza')) return 'pizza';
  if (key.includes('burger') || key.includes('side')) return 'burger';
  if (key.includes('thali') || key.includes('set') || key.includes('rice')) return 'thali';
  if (key.includes('drink') || key.includes('shake') || key.includes('tea') || key.includes('coffee'))
    return 'drink';
  if (key.includes('chow') || key.includes('noodle') || key.includes('pasta')) return 'noodle';
  return 'default';
}

/** Simple geometric forms — they read cleanly at any size and never look sketchy. */
function GlyphShape({ glyph, color }: { glyph: Glyph; color: string }) {
  const common = { fill: 'none', stroke: color, strokeWidth: 2.5, strokeLinecap: 'round' as const };
  switch (glyph) {
    case 'momo':
      return (
        <g {...common}>
          <circle cx="24" cy="26" r="9" />
          <circle cx="44" cy="26" r="9" />
          <circle cx="34" cy="42" r="9" />
          <path d="M18 20c4-5 8-5 12 0M38 20c4-5 8-5 12 0M28 36c4-5 8-5 12 0" />
        </g>
      );
    case 'pizza':
      return (
        <g {...common}>
          <path d="M34 12 54 50a44 44 0 0 1-40 0Z" />
          <circle cx="30" cy="34" r="3" />
          <circle cx="40" cy="38" r="3" />
          <circle cx="34" cy="45" r="3" />
        </g>
      );
    case 'burger':
      return (
        <g {...common}>
          <path d="M14 26a20 12 0 0 1 40 0Z" />
          <path d="M14 33h40M14 40h40" />
          <path d="M14 46a20 10 0 0 0 40 0Z" />
        </g>
      );
    case 'thali':
      return (
        <g {...common}>
          <circle cx="34" cy="34" r="22" />
          <circle cx="34" cy="34" r="9" />
          <circle cx="34" cy="17" r="4" />
          <circle cx="51" cy="34" r="4" />
          <circle cx="34" cy="51" r="4" />
          <circle cx="17" cy="34" r="4" />
        </g>
      );
    case 'drink':
      return (
        <g {...common}>
          <path d="M22 18h24l-4 34H26Z" />
          <path d="M20 26h28" />
          <path d="M40 18 46 8" />
        </g>
      );
    case 'noodle':
      return (
        <g {...common}>
          <path d="M14 34a20 20 0 0 0 40 0Z" />
          <path d="M22 26c3-8 8-12 12-14M30 24c2-7 6-11 10-13M38 25c2-6 6-9 9-11" />
        </g>
      );
    default:
      return (
        <g {...common}>
          <circle cx="34" cy="34" r="20" />
          <path d="M34 20v28M20 34h28" />
        </g>
      );
  }
}

export function FoodArt({
  seed,
  category,
  className = '',
  label,
  variant = 'tile',
}: {
  seed: string;
  category: string;
  className?: string;
  label?: string;
  /**
   * `banner` uses a much wider viewBox. A tile's 1.6:1 box, sliced into a
   * page-wide banner, scales the glyph until it is unrecognisably cropped.
   */
  variant?: 'tile' | 'banner';
}) {
  const banner = variant === 'banner';
  const vbWidth = banner ? 560 : 160;
  const palette = PALETTES[hash(seed) % PALETTES.length]!;
  const glyph = glyphFor(category);
  const id = `art-${hash(seed + category).toString(36)}`;
  // Nudge the blobs around per seed so no two tiles read as identical.
  const offsetX = (hash(seed) % 30) - 15;
  const offsetY = (hash(category + seed) % 24) - 12;

  return (
    <svg
      viewBox={`0 0 ${vbWidth} 100`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.from} stopOpacity="0.14" />
          <stop offset="100%" stopColor={palette.to} stopOpacity="0.4" />
        </linearGradient>
        <radialGradient id={`${id}-blob`}>
          <stop offset="0%" stopColor={palette.to} stopOpacity="0.7" />
          <stop offset="100%" stopColor={palette.to} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width={vbWidth} height="100" fill={`url(#${id}-bg)`} />
      <circle
        cx={vbWidth * 0.78 + offsetX}
        cy={20 + offsetY}
        r={banner ? 90 : 52}
        fill={`url(#${id}-blob)`}
      />
      <circle
        cx={vbWidth * 0.15 - offsetX}
        cy={88 - offsetY}
        r={banner ? 76 : 44}
        fill={`url(#${id}-blob)`}
        opacity="0.7"
      />

      {banner ? (
        // Repeat the glyph across the strip instead of magnifying one of them.
        [0.16, 0.42, 0.68, 0.9].map((fraction, index) => (
          <g
            key={fraction}
            transform={`translate(${vbWidth * fraction - 34} ${index % 2 === 0 ? 14 : 26}) scale(0.78)`}
            opacity={index % 2 === 0 ? 0.42 : 0.3}
          >
            <GlyphShape glyph={glyph} color={palette.ink} />
          </g>
        ))
      ) : (
        <g transform="translate(46 16)" opacity="0.62">
          <GlyphShape glyph={glyph} color={palette.ink} />
        </g>
      )}
    </svg>
  );
}
