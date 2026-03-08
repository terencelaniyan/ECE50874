/**
 * Slot labels and colors for arsenal display (Grid View / HTML prototype).
 * Slot is assigned by position: first ball in bag = slot 1, etc.
 * Index 0 unused; slots 1–5 map to role labels.
 */

export const BAG_CAPACITY = 6;

/** Max games per ball for "Coverstock Health" percentage (100% = 0 games, 0% = maxGames). */
export const MAX_GAMES = 87;

/** Slot index (1–5) to role label. */
export const SLOT_LABELS: Record<number, string> = {
  1: "Heavy Oil",
  2: "Med-Heavy",
  3: "Benchmark",
  4: "Med-Light",
  5: "Spare",
};

/** Slot index (1–5) to CSS color (hex). */
export const SLOT_COLORS: Record<number, string> = {
  1: "#ff5c38",
  2: "#ff9c38",
  3: "#e8ff3c",
  4: "#38c9ff",
  5: "#b838ff",
};

export function getSlotLabel(slot: number): string {
  return SLOT_LABELS[slot] ?? "";
}

export function getSlotColor(slot: number): string {
  return SLOT_COLORS[slot] ?? "#6a6a8a";
}
