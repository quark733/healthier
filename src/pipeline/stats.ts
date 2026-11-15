/** Plain statistics with no language in them, so both the app and the server can use them. */

export interface Stats {
  n: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  sd: number;
  /** Median absolute deviation — robust to the one 17,915-step day. */
  mad: number;
  sum: number;
  first: number;
  last: number;
}

export function stats(input: number[]): Stats | null {
  const v = input.filter((x) => Number.isFinite(x));
  if (!v.length) return null;
  const sorted = [...v].sort((a, b) => a - b);
  const n = v.length;
  const sum = v.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = quantile(sorted, 0.5);
  const variance = v.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const mad = quantile([...v.map((x) => Math.abs(x - median))].sort((a, b) => a - b), 0.5);
  return {
    n,
    mean,
    median,
    min: sorted[0],
    max: sorted[n - 1],
    sd: Math.sqrt(variance),
    mad,
    sum,
    first: v[0],
    last: v[n - 1],
  };
}

export function quantile(sortedAsc: number[], q: number): number {
  if (!sortedAsc.length) return NaN;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sortedAsc[lo] : sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

/** Theil–Sen slope: the median of all pairwise slopes. Robust for sparse manual logs. */
export function theilSen(points: { x: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].x - points[i].x;
      if (dx !== 0) slopes.push((points[j].y - points[i].y) / dx);
    }
  }
  return stats(slopes)?.median ?? null;
}
