/* Display formatting helpers shared across the console. */

const INT_FORMAT = new Intl.NumberFormat("en-US");

/** Grouped integer with fixed en-US separators ("382250" → "382,250").
    Pinned locale — the browser default can insert narrow no-break spaces
    before the grouping comma (or swap it entirely) depending on settings. */
export function formatInt(value: number | undefined | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return INT_FORMAT.format(Math.round(value));
}
