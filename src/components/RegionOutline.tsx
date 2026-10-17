// Outline of Cambridgeshire and Peterborough (ONS Combined Authority E47000008),
// from layers.regions: the outer edge only (gaps under 100 m closed), British
// National Grid, simplified to 250 m, scaled to
// hundreds of metres from easting 501000 / northing 318000 (y down).
// Regenerate with the query in DECISIONS.md (D58) if the region changes.
const OUTLINE =
  "M 9 182 l 11 -19 0 -12 6 -5 -2 -11 -10 -5 -4 -8 6 -7 6 1 0 -4 15 -1 1 -5 21 8 11 -2 8 -7 31 -11 7 -6 1 -7 31 5 20 20 24 -16 12 -3 10 17 8 -9 26 9 26 -24 10 6 16 -10 22 11 1 4 35 -5 18 -19 -4 -36 12 -15 17 4 7 -8 10 0 13 -11 25 -1 -9 36 0 28 21 5 0 24 -9 6 15 18 19 13 -5 5 4 3 -8 4 -2 9 -6 3 5 20 11 3 2 8 -8 8 8 5 -2 5 -6 2 0 8 7 -2 -6 6 5 6 -4 6 9 4 4 -4 3 5 -5 8 -9 2 18 13 2 -2 6 9 6 -8 36 -7 5 0 2 6 8 -2 10 8 11 3 4 -3 10 24 7 4 8 11 18 12 -3 1 4 19 -2 7 -34 24 24 52 8 4 1 7 5 -2 11 5 -4 17 -8 5 5 14 18 0 4 8 29 24 -5 7 2 8 -50 21 -15 -21 -13 -9 -2 -11 -3 2 -12 -7 -1 10 -5 7 3 4 -10 13 15 20 -12 9 19 16 9 -8 7 3 12 -11 5 1 -4 -9 9 -7 11 12 8 -6 19 16 8 -8 14 14 0 15 -7 7 0 12 -9 29 3 6 -10 -2 -4 5 -5 -8 -8 -3 -5 3 0 7 -4 -1 -2 7 -12 0 1 29 -6 0 -3 5 3 6 -8 2 1 4 -6 2 -4 17 9 6 -3 8 8 7 -1 10 5 3 -2 8 -9 4 -7 12 7 14 -12 0 -6 -8 -12 -5 -16 -26 -27 -18 -7 -2 -16 18 -12 -14 -21 -3 -6 19 -8 3 5 14 -2 4 -12 3 -1 7 -12 -4 -15 6 -6 -14 -9 0 -3 24 -14 35 -7 2 -7 -9 -14 -42 -25 3 -16 -14 -11 5 -13 15 -36 21 -9 10 -4 -2 3 -9 -7 -18 -16 -8 5 -19 -8 -11 6 -13 2 -52 -7 -7 -12 6 -43 -5 11 -16 -30 -19 8 -9 4 1 1 -7 -16 -17 1 -4 -20 2 -3 -3 -2 -11 8 -19 -33 -5 -6 1 2 12 -11 -4 -12 2 -6 -42 6 -3 -2 -7 -12 -2 -4 4 -5 -10 -10 3 -10 -13 -1 -19 -20 -9 -2 -17 -11 -3 4 -9 -15 -12 0 -8 7 -7 -4 -9 16 1 11 -6 7 2 7 -14 11 -8 0 -10 35 -24 -5 -5 5 -15 14 -19 -12 -25 3 -17 -16 -5 -10 -10 -15 -7 8 -14 -1 -11 -9 -3 -3 -9 9 -5 -6 -7 -1 -10 -7 -3 -35 10 z";

// Approximate town positions, in the same units.
const TOWNS: { name: string; x: number; y: number }[] = [
  { name: "Peterborough", x: 180, y: 195 },
  { name: "Wisbech", x: 450, y: 85 },
  { name: "March", x: 407, y: 215 },
  { name: "Huntingdon", x: 230, y: 465 },
  { name: "Ely", x: 530, y: 380 },
  { name: "St Neots", x: 175, y: 580 },
  { name: "Cambridge", x: 440, y: 595 },
];

export function RegionOutline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-20 -20 750 860"
      role="img"
      aria-labelledby="region-outline-title"
      className={className}
    >
      <title id="region-outline-title">Outline of Cambridgeshire and Peterborough, the area this prototype covers</title>
      <path d={OUTLINE} fill="var(--color-moss-tint)" stroke="var(--color-moss)" strokeWidth={4} strokeDasharray="14 8" strokeLinejoin="round" />
      {TOWNS.map((t) => (
        <g key={t.name}>
          <circle cx={t.x} cy={t.y} r={7} fill="var(--color-ink)" />
          <text x={t.x + 14} y={t.y + 9} fontSize={30} fill="var(--color-ink)" fontWeight={600}>
            {t.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
