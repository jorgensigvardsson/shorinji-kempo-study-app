import type { CurrentWeekAnchor } from "../persistence/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export function toLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolveCurrentWeekNumber(
  anchor: CurrentWeekAnchor | null,
  totalWeeks: number,
  todayKey = toLocalDateKey()
): number {
  if (totalWeeks <= 0) {
    return 1;
  }

  if (!anchor || !Number.isFinite(anchor.week)) {
    return 1;
  }

  const normalizedAnchorWeek = positiveMod(Math.floor(anchor.week) - 1, totalWeeks);
  const safeAnchorDate = isDateKey(anchor.anchorDate) ? anchor.anchorDate : todayKey;
  const elapsedDays = daysBetweenDateKeys(safeAnchorDate, todayKey);
  const elapsedWeeks = Math.floor(elapsedDays / 7);
  return positiveMod(normalizedAnchorWeek + elapsedWeeks, totalWeeks) + 1;
}

function daysBetweenDateKeys(fromKey: string, toKey: string): number {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  if (!from || !to) {
    return 0;
  }

  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function parseDateKey(value: string): Date | null {
  if (!isDateKey(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function positiveMod(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}
