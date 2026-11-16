import type { Span } from './parser';

export interface Window { start: number; end: number }

/** Intersect sorted spans with disjoint viewport windows; never duplicates overlaps. */
export function visibleSpans(spans: readonly Span[], windows: readonly Window[]): Span[] {
  const merged: Window[] = [];
  for (const window of [...windows].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && window.start <= last.end) last.end = Math.max(last.end, window.end);
    else merged.push({ ...window });
  }
  const result: Span[] = [];
  for (const window of merged) {
    for (const span of spans) {
      if (span.start >= window.end) break;
      if (span.end <= window.start) continue;
      result.push({ start: Math.max(span.start, window.start),
        end: Math.min(span.end, window.end), style: span.style });
    }
  }
  return result;
}
