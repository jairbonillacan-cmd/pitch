import {
  isLivePhaseActive,
  parseStrictFiniteNumber,
  type LeagueId,
  type LiveScoreboardEntry,
} from "@pitchlab/contracts";
import { formatKickoffByTimezone } from "../account/account-helpers";
import type { PlatformGame, RiskBand } from "../../types";
import { addDays, dayNumber, shortWeekday } from "./home-model";

export type MatchStatusFilter = "all" | "live" | "upcoming" | "finished";
export type ModelSignalFilter = "all" | "high_confidence" | "value";
export type HomeBoardView = "all" | "favorites" | "competitions";

export interface HomeFilterModalOptionLeague {
  readonly id: LeagueId;
  readonly label: string;
  readonly region: string;
  readonly logoUrl?: string;
  readonly count: number;
}

export const RISKS: ReadonlyArray<{ id: RiskBand; label: string; hint: string }> = [
  { id: "conservador", label: "Conservador", hint: "Las selecciones más probables, con menos momio." },
  { id: "medio", label: "Medio", hint: "Equilibrio entre probabilidad y momio." },
  { id: "arriesgado", label: "Arriesgado", hint: "Más momio a cambio de menos probabilidad." },
];

export const FULL_MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

export const CAL_WEEKDAYS_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
export const CAL_WEEKDAYS_FULL_ES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

export interface CalendarDayCell {
  readonly dayNum: number;
  readonly iso: string;
}

const SHORT_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
const LONG_WEEKDAYS_LOWER = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

const LEAGUE_REGION_LABELS: Readonly<Record<string, string>> = {
  nfl: "Estados Unidos",
  nba: "Estados Unidos",
  nhl: "Estados Unidos y Canadá",
  mlb: "Estados Unidos",
  "liga-mx": "México",
  "premier-league": "Inglaterra",
  laliga: "España",
  "la-liga": "España",
  bundesliga: "Alemania",
  "serie-a": "Italia",
  "ligue-1": "Francia",
  "champions-league": "Europa",
  "fifa-world-cup": "Internacional",
  "world-cup-qualifiers": "Internacional",
  "fifa-friendlies": "Internacional",
  "copa-america": "Sudamérica",
  "uefa-euro": "Europa",
  "uefa-nations-league": "Europa",
  "concacaf-nations-league": "Norte y Centroamérica",
  "concacaf-gold-cup": "Norte y Centroamérica",
  afcon: "África",
  "afc-asian-cup": "Asia",
};

export const ALL_KNOWN_COUNTRIES: readonly string[] = [
  "México",
  "Inglaterra",
  "España",
  "Alemania",
  "Italia",
  "Francia",
  "Estados Unidos",
  "Estados Unidos y Canadá",
  "Europa",
  "Sudamérica",
  "Norte y Centroamérica",
  "África",
  "Asia",
  "Internacional",
];

export function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatGameKickoffTime(
  game: Pick<PlatformGame, "kickoffUtc" | "kickoffLocal">,
  timeZone?: string | null,
): string {
  return formatKickoffByTimezone(
    game.kickoffUtc,
    game.kickoffLocal,
    timeZone?.trim() || "America/Mexico_City",
  );
}

export function teamCode(team: PlatformGame["home"]): string {
  const code = team.code?.trim();
  if (code) return code;
  return team.shortName.slice(0, 3).toUpperCase();
}

export function isEffectiveLiveGame(
  game: Pick<PlatformGame, "dayId" | "status">,
  today: string,
  entry?: LiveScoreboardEntry,
): boolean {
  if (game.dayId < today) return false;
  return (entry ? isLivePhaseActive(entry.phase) : false) || String(game.status) === "LIVE";
}

export function formatLiveChipPhase(entry?: LiveScoreboardEntry): string {
  if (!entry) return "En vivo";
  if (entry.phase === "halftime") return "Descanso";
  if (entry.phase === "penalties") return "Penales";
  const clk = entry.clock?.trim();
  if (clk) {
    return clk.endsWith("'") ? clk : `${clk}'`;
  }
  return "En vivo";
}

export function parseIsoYearMonth(isoDay: string): { year: number; monthIndex: number } {
  const m = /^(\d{4})-(\d{2})/.exec(isoDay);
  if (!m) return { year: 2026, monthIndex: 10 };
  const year = parseStrictFiniteNumber(m[1]);
  const month = parseStrictFiniteNumber(m[2]);
  if (year === null || month === null) return { year: 2026, monthIndex: 10 };
  return {
    year,
    monthIndex: Math.max(0, Math.min(11, month - 1)),
  };
}

export function dayNumOfIso(isoDay: string): number {
  const m = /^\d{4}-\d{2}-(\d{2})$/.exec(isoDay);
  if (!m) return 1;
  const parsed = parseStrictFiniteNumber(m[1]);
  if (parsed === null) return 1;
  return Math.max(1, Math.min(31, Math.trunc(parsed)));
}

export function clampIsoToMonth(year: number, monthIndex: number, preferredDayNum: number): string {
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.max(1, Math.min(daysInMonth, Math.trunc(preferredDayNum)));
  const mm = String(monthIndex + 1).padStart(2, "0");
  return `${year}-${mm}-${String(clampedDay).padStart(2, "0")}`;
}

export function formatMonthHeading(year: number, monthIndex: number): string {
  const rawMonth = FULL_MONTHS_ES[monthIndex] ?? FULL_MONTHS_ES[0];
  return `${rawMonth.charAt(0).toUpperCase()}${rawMonth.slice(1)} ${year}`;
}

export function buildCalendarMonthCells(
  year: number,
  monthIndex: number,
): Array<CalendarDayCell | null> {
  const firstDow = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const mm = String(monthIndex + 1).padStart(2, "0");
  const cells: Array<CalendarDayCell | null> = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({
      dayNum: d,
      iso: `${year}-${mm}-${String(d).padStart(2, "0")}`,
    });
  }
  return cells;
}

export function buildCalendarMonthWeeks(
  year: number,
  monthIndex: number,
): ReadonlyArray<ReadonlyArray<CalendarDayCell | null>> {
  const flat = buildCalendarMonthCells(year, monthIndex);
  const remainder = flat.length % 7;
  if (remainder !== 0) {
    for (let i = remainder; i < 7; i += 1) {
      flat.push(null);
    }
  }
  const weeks: Array<Array<CalendarDayCell | null>> = [];
  for (let i = 0; i < flat.length; i += 7) {
    weeks.push(flat.slice(i, i + 7));
  }
  return weeks;
}

export function formatCenterDayParts(day: string, today: string): { top: string; sub: string } {
  const shortLabel = `${shortWeekday(day).toLowerCase()} ${dayNumber(day)}`;
  if (day === today) return { top: "Hoy", sub: shortLabel };
  if (day === addDays(today, 1)) return { top: "Mañana", sub: shortLabel };
  const d = new Date(`${day}T12:00:00Z`);
  return { top: shortLabel, sub: SHORT_MONTHS[d.getUTCMonth()] ?? "" };
}

export function formatJumpDayLabel(dayId: string, today: string): string {
  if (dayId === today) return "Ir a hoy";
  const d = new Date(`${dayId}T12:00:00Z`);
  const wd = LONG_WEEKDAYS_LOWER[d.getUTCDay()] ?? shortWeekday(dayId).toLowerCase();
  return `Ir al ${wd} ${dayNumber(dayId)}`;
}

export function leagueLabelOf(games: readonly PlatformGame[], league: LeagueId): string {
  return games.find((g) => g.league === league)?.leagueLabel ?? league;
}

export function leagueLogoOf(games: readonly PlatformGame[], league: LeagueId): string | undefined {
  return games.find((g) => g.league === league)?.leagueLogoUrl;
}

export function leagueRegionOf(league: string): string {
  return LEAGUE_REGION_LABELS[league] ?? "Internacional";
}

export function riskToneColor(tone: "success" | "info" | "warning" | "danger"): string {
  if (tone === "success") return "var(--pl-success)";
  if (tone === "warning") return "var(--pl-warning)";
  if (tone === "danger") return "var(--pl-danger)";
  return "var(--pl-brand)";
}

export function scrollToMatchCard(gameId: string): void {
  if (typeof document === "undefined") return;
  const escaped =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(gameId)
      : gameId.replace(/"/g, '\\"');
  const card = document.querySelector<HTMLElement>(`[data-game-card="${escaped}"]`);
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
  if (card) {
    card.scrollIntoView({ behavior, block: "center" });
    card
      .querySelector<HTMLElement>("a[data-card-open], a.pl-mlist-matchup, a[href*='/g/'], a[href*='/games/']")
      ?.focus({ preventScroll: true });
    return;
  }
  document.querySelector<HTMLElement>(".pl-home-cards, .pl-mlist")?.scrollIntoView({ behavior, block: "start" });
}
