import { cx } from './ui';

/** Small leaf glyph used in dividers and list bullets. */
export function Leaf({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M20.5 3.5C12 3.2 5.6 6.8 4.2 13.6c-.4 2 0 3.9 1 5.4C7.4 13.5 11 10 15.8 7.6 11.4 10.6 8.3 14.3 6.6 19.6c1.4.9 3.2 1.2 5 .8 6.4-1.4 9.4-8.4 8.9-16.9z" />
    </svg>
  );
}

/** ───── ❦ ───── section divider in brass with a leaf at the centre. */
export function VineDivider({ className }: { className?: string }) {
  return (
    <div className={cx('vine-divider', className)} aria-hidden>
      <Leaf className="size-5 -scale-x-100 text-leaf" />
      <svg viewBox="0 0 24 24" className="size-3 text-vine-400" fill="currentColor">
        <circle cx="8" cy="9" r="4" />
        <circle cx="16" cy="9" r="4" />
        <circle cx="12" cy="16" r="4" />
      </svg>
      <Leaf className="size-5 text-leaf" />
    </div>
  );
}

/**
 * Decorative climbing vine with leaves and grape clusters (pure SVG, no assets).
 * Gently sways; respects reduced-motion via the global rule in index.css.
 */
export function VineFlourish({ className, flip }: { className?: string; flip?: boolean }) {
  const leaves: [number, number, number][] = [
    [62, 70, -30],
    [118, 128, 25],
    [70, 190, -40],
    [126, 252, 30],
    [74, 318, -25],
    [118, 380, 35],
  ];
  return (
    <svg
      viewBox="0 0 200 440"
      className={cx('pointer-events-none origin-top animate-sway', flip && '-scale-x-100', className)}
      aria-hidden
      fill="none"
    >
      <defs>
        <linearGradient id="vf-stem" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9e3ad" />
          <stop offset="1" stopColor="#8fbf6c" />
        </linearGradient>
        <radialGradient id="vf-grape" cx=".35" cy=".35" r=".7">
          <stop offset="0" stopColor="#c0567d" />
          <stop offset="1" stopColor="#5c1730" />
        </radialGradient>
      </defs>
      <path
        d="M100 0 C60 50 140 90 100 140 S60 230 100 280 S140 370 100 440"
        stroke="url(#vf-stem)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M100 140 c18-4 30 4 34 18 M100 280 c-18-6-32 2-36 16" stroke="#8fbf6c" strokeOpacity=".7" strokeWidth="1.6" strokeLinecap="round" />
      {leaves.map(([x, y, r], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
          <path d="M0 0 C10 -16 32 -18 40 -4 C30 8 12 10 0 0 Z" fill={i % 2 ? '#2b6a4e' : '#8fbf6c'} fillOpacity=".9" />
          <path d="M0 0 C14 -6 26 -8 38 -5" stroke="#0f2a1f" strokeOpacity=".35" strokeWidth="1" />
        </g>
      ))}
      {[
        [138, 168],
        [58, 300],
      ].map(([cx, cy], i) => (
        <g key={i} fill="url(#vf-grape)">
          {[
            [0, 0],
            [10, 0],
            [20, 0],
            [5, 9],
            [15, 9],
            [10, 18],
          ].map(([dx, dy], j) => (
            <circle key={j} cx={cx + dx} cy={cy + dy} r="5.5" />
          ))}
        </g>
      ))}
    </svg>
  );
}
