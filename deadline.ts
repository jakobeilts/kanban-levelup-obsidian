// ─── Deadlines ────────────────────────────────────────────────────────────────
//
// A card's deadline is a calendar day ("YYYY-MM-DD", no time, no time zone), so a
// card due "2026-10-03" is due on that day wherever the vault is opened. All
// comparisons use the local calendar day, never UTC.
//
// Colours: the day before → yellow, the day itself and every day after → red.

import { setIcon } from "obsidian";
import { dateLocale, t } from "./i18n";

export type DueState = "later" | "tomorrow" | "today" | "overdue";

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local calendar day as "YYYY-MM-DD". */
export function localDateKey(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayNumber(key: string): number | null {
  const m = DATE_KEY.exec(key);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(ms) ? null : Math.round(ms / 86400000);
}

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && dayNumber(value) !== null;
}

/** Days from today until the deadline: 0 = today, 1 = tomorrow, negative = overdue. */
export function daysUntil(due: string, today: string = localDateKey()): number | null {
  const a = dayNumber(due), b = dayNumber(today);
  return a === null || b === null ? null : a - b;
}

export function dueState(due: string | undefined, today?: string): DueState | null {
  if (!isDateKey(due)) return null;
  const n = daysUntil(due, today);
  if (n === null) return null;
  return n < 0 ? "overdue" : n === 0 ? "today" : n === 1 ? "tomorrow" : "later";
}

/** Red = due today or overdue. */
export function isRed(state: DueState | null): boolean {
  return state === "today" || state === "overdue";
}

/** CSS class for the card background, or "" when the deadline is further away. */
export function dueClass(state: DueState | null): string {
  if (state === "tomorrow") return "is-due-soon";
  if (isRed(state)) return "is-due-red";
  return "";
}

/** "3 Oct" / "3. Okt." — with the year only when it is not the current one. */
export function formatDue(due: string): string {
  const m = DATE_KEY.exec(due);
  if (!m) return due;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (date.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return date.toLocaleDateString(dateLocale(), opts);
}

export function dueLabel(due: string, state: DueState): string {
  switch (state) {
    case "today": return t("due.today");
    case "tomorrow": return t("due.tomorrow");
    case "overdue": return t("due.overdue", { date: formatDue(due) });
    default: return t("due.on", { date: formatDue(due) });
  }
}

/**
 * Small deadline chip with a calendar icon. In done columns (`muted`) it only shows
 * the date, without warning colours — finished work needs no alarm.
 */
export function renderDueChip(parent: HTMLElement, due: string | undefined, muted = false): void {
  const state = dueState(due);
  if (!state || !due) return;
  const cls = "kanban-due-chip" + (muted ? "" : state === "tomorrow" ? " is-soon" : isRed(state) ? " is-red" : "");
  const chip = parent.createSpan({ cls, attr: { title: t("due.title", { date: formatDue(due) }) } });
  const icon = chip.createSpan({ cls: "kanban-due-icon" });
  setIcon(icon, "calendar");
  chip.createSpan({ text: muted ? formatDue(due) : dueLabel(due, state) });
}

/** Cards due today or overdue first, everything else after; order within each group is kept. */
export function redFirst<T extends { dueDate?: string }>(cards: T[], today?: string): T[] {
  const red = cards.filter((c) => isRed(dueState(c.dueDate, today)));
  if (!red.length) return cards;
  return red.concat(cards.filter((c) => !red.includes(c)));
}
