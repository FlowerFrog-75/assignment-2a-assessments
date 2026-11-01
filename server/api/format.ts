// Small helpers that turn database values into what the screens display.
import { SKILLS, type SkillKey } from "../db/constants";

export const TIME_ZONE = "Australia/Brisbane";

/** Short names used on charts (match the prototype screens). */
export const SKILL_SHORT: Record<SkillKey, string> = {
  "analytical-thinking": "Analytical",
  research: "Research",
  "critical-thinking": "Critical",
  creativity: "Creativity",
  "decision-making": "Decision",
  collaboration: "Collab.",
  adaptability: "Adaptability",
};

/** Keys used by the Class Results table. */
export const SKILL_TABLE_KEY: Record<SkillKey, string> = {
  "analytical-thinking": "analytical",
  research: "research",
  "critical-thinking": "critical",
  creativity: "creativity",
  "decision-making": "decision",
  collaboration: "collab",
  adaptability: "adaptability",
};

export const skillName = (key: SkillKey) => SKILLS.find((s) => s.key === key)?.label ?? key;

/** Skill level 1–5 from a percentage. */
export function skillLevel(percent: number): number {
  if (percent >= 90) return 5;
  if (percent >= 75) return 4;
  if (percent >= 55) return 3;
  if (percent >= 35) return 2;
  return 1;
}

export function levelLabel(percent: number): "Advanced" | "Proficient" | "Developing" | "Beginning" {
  if (percent >= 90) return "Advanced";
  if (percent >= 75) return "Proficient";
  if (percent >= 50) return "Developing";
  return "Beginning";
}

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
export const percent = (score: number, max: number) => (max > 0 ? Math.round((score / max) * 100) : 0);
export const average = (values: number[]) =>
  values.length > 0 ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : 0;
export const initials = (name: string) => name.split(" ").map((part) => part[0]).join("").toUpperCase();

/** "14 Oct 2026" */
export const formatDate = (date?: Date | null) =>
  date ? date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE }) : "-";

/** "14 Oct" */
export const formatShortDate = (date?: Date | null) =>
  date ? date.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: TIME_ZONE }) : "-";

/** "Wednesday, 16 October" */
export const formatLongDay = (date: Date) =>
  date.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: TIME_ZONE });

/** "2026-10-16 14:23:11" (Brisbane time) */
export function formatTimestamp(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/** "Due tomorrow", "Due in 3 days", "Overdue" */
export function dueLabel(due?: Date | null): string {
  if (!due) return "No due date";
  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "Overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

/** "Today", "3 days ago", "2 weeks ago", "Never" */
export function agoLabel(date?: Date | null): string {
  if (!date) return "Never";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

/** "+5" / "-2" / "+0" */
export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
