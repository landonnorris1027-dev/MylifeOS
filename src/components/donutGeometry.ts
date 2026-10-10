const TAU = Math.PI * 2;
const OUTER = 88;
const INNER = 64;

const point = (radius: number, angle: number) =>
  [100 + radius * Math.cos(angle), 100 + radius * Math.sin(angle)]
    .map((value) => value.toFixed(5))
    .join(' ');

/** A rounded annular sector; gaps stay inside its true angular allocation. */
export function donutSegmentPath(start: number, proportion: number): string {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(proportion) ||
    proportion <= 0
  )
    return '';
  if (proportion >= 1) {
    // Two arcs per circle avoid the SVG zero-length full-circle special case.
    return `M 100 12 A 88 88 0 1 1 100 188 A 88 88 0 1 1 100 12
      M 100 36 A 64 64 0 1 0 100 164 A 64 64 0 1 0 100 36 Z`;
  }
  const span = proportion * TAU;
  // Tiny slices retain most of their angular share instead of growing round caps.
  const inset = Math.min(0.018, span * 0.1);
  const from = start * TAU - Math.PI / 2 + inset;
  const to = from + span - inset * 2;
  const corner = Math.min(3, ((to - from) * INNER) / 4);
  const outerCorner = corner / OUTER;
  const innerCorner = corner / INNER;
  const outerLarge = to - from - outerCorner * 2 > Math.PI ? 1 : 0;
  const innerLarge = to - from - innerCorner * 2 > Math.PI ? 1 : 0;
  return `M ${point(OUTER, from + outerCorner)}
    A ${OUTER} ${OUTER} 0 ${outerLarge} 1 ${point(OUTER, to - outerCorner)}
    Q ${point(OUTER, to)} ${point(OUTER - corner, to)}
    L ${point(INNER + corner, to)}
    Q ${point(INNER, to)} ${point(INNER, to - innerCorner)}
    A ${INNER} ${INNER} 0 ${innerLarge} 0 ${point(INNER, from + innerCorner)}
    Q ${point(INNER, from)} ${point(INNER + corner, from)}
    L ${point(OUTER - corner, from)}
    Q ${point(OUTER, from)} ${point(OUTER, from + outerCorner)} Z`;
}
