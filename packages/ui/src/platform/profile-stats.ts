import type { JournalEntry } from "./types";

/** Lo mínimo que necesita el récord de un pick. */
export interface RecordablePick {
  status: "pending" | "won" | "lost";
  units: number;
  userDecimal: number;
  clvPct: number;
}

export interface ProfileRecord {
  settled: number;
  won: number;
  /** Porcentaje 0–100 de cumplidos sobre cerrados; `null` sin picks cerrados. */
  hitRatePct: number | null;
  netUnits: number;
  /** Ventaja media contra el cierre, en %; `null` sin picks. */
  avgClvPct: number | null;
  open: number;
}

/** Saldo de un pick cerrado (+ cumplido, − no cumplido) o `null` si sigue abierto. */
export function pickSettlementUnits(entry: RecordablePick): number | null {
  if (entry.status === "won") return entry.units * (entry.userDecimal - 1);
  if (entry.status === "lost") return -entry.units;
  return null;
}

export function profileRecord(entries: ReadonlyArray<RecordablePick>): ProfileRecord {
  let settled = 0;
  let won = 0;
  let netUnits = 0;
  let clvSum = 0;
  for (const entry of entries) {
    clvSum += entry.clvPct;
    const units = pickSettlementUnits(entry);
    if (units === null) continue;
    settled += 1;
    if (entry.status === "won") won += 1;
    netUnits += units;
  }
  return {
    settled,
    won,
    hitRatePct: settled > 0 ? (won / settled) * 100 : null,
    netUnits,
    avgClvPct: entries.length > 0 ? clvSum / entries.length : null,
    open: entries.length - settled,
  };
}

/** Fecha del registro del pick, si se conoce. */
export function entryDate(entry: Pick<JournalEntry, "sealedAtIso">): Date | null {
  if (!entry.sealedAtIso) return null;
  const d = new Date(entry.sealedAtIso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MONTH_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] as const;
const MONTH_LONG = [
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

export function monthShortLabel(monthIndex: number): string {
  return MONTH_SHORT[((monthIndex % 12) + 12) % 12]!;
}

export function monthLongLabel(monthIndex: number): string {
  return MONTH_LONG[((monthIndex % 12) + 12) % 12]!;
}

export interface MonthlyNet {
  /** `AAAA-MM`. */
  month: string;
  label: string;
  net: number;
  settled: number;
}

/** Saldo por mes (mes del registro) de los últimos `months`, con meses vacíos en 0. */
export function monthlyNetUnits(
  entries: ReadonlyArray<JournalEntry>,
  months = 6,
  today: Date = new Date(),
): MonthlyNet[] {
  const buckets: MonthlyNet[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    buckets.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: monthShortLabel(d.getMonth()),
      net: 0,
      settled: 0,
    });
  }
  const index = new Map(buckets.map((b, i) => [b.month, i]));
  for (const entry of entries) {
    const units = pickSettlementUnits(entry);
    const date = entryDate(entry);
    if (units === null || !date) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const i = index.get(key);
    if (i === undefined) continue;
    buckets[i]!.net += units;
    buckets[i]!.settled += 1;
  }
  return buckets.map((b) => ({ ...b, net: Math.round(b.net * 10) / 10 }));
}

export interface LeagueHitRate {
  leagueLabel: string;
  won: number;
  settled: number;
  pct: number;
}

export function hitRateByLeague(entries: ReadonlyArray<JournalEntry>): LeagueHitRate[] {
  const map = new Map<string, { won: number; settled: number }>();
  for (const entry of entries) {
    if (entry.status === "pending") continue;
    const row = map.get(entry.leagueLabel) ?? { won: 0, settled: 0 };
    row.settled += 1;
    if (entry.status === "won") row.won += 1;
    map.set(entry.leagueLabel, row);
  }
  return [...map.entries()]
    .map(([leagueLabel, r]) => ({
      leagueLabel,
      won: r.won,
      settled: r.settled,
      pct: Math.round((r.won / r.settled) * 100),
    }))
    .sort((a, b) => b.settled - a.settled || a.leagueLabel.localeCompare(b.leagueLabel));
}

export interface CalibrationBucket {
  range: string;
  expectedMidPct: number;
  won: number;
  settled: number;
  realPct: number;
}

const CALIBRATION_RANGES: ReadonlyArray<{ range: string; min: number; max: number; mid: number }> = [
  { range: "50–60 %", min: 0.5, max: 0.6, mid: 55 },
  { range: "60–70 %", min: 0.6, max: 0.7, mid: 65 },
  { range: "70 % o más", min: 0.7, max: 1.01, mid: 75 },
];

export const CALIBRATION_MIN_PICKS = 5;

/** «Cuando dijo X %, ¿se cumplió?»: rangos con al menos 5 picks cerrados. */
export function calibrationBuckets(entries: ReadonlyArray<JournalEntry>): CalibrationBucket[] {
  const out: CalibrationBucket[] = [];
  for (const r of CALIBRATION_RANGES) {
    let won = 0;
    let settled = 0;
    for (const entry of entries) {
      if (entry.status === "pending") continue;
      const p = 1 / Math.max(1.0001, entry.fairDecimal);
      if (p < r.min || p >= r.max) continue;
      settled += 1;
      if (entry.status === "won") won += 1;
    }
    if (settled < CALIBRATION_MIN_PICKS) continue;
    out.push({
      range: r.range,
      expectedMidPct: r.mid,
      won,
      settled,
      realPct: Math.round((won / settled) * 100),
    });
  }
  return out;
}

/* ---------------------------------------------------------------------------
   Leaderboard compartido (Comunidad y Perfil)
   ------------------------------------------------------------------------- */

export interface LeaderboardAnalyst {
  handle: string;
  name: string;
  roleLabel: "Tipstar" | "Socio";
  specialty: string;
  avatarInitials: string;
  avatarGradVar: string;
  isTipstar: boolean;
  isVerified: boolean;
  isExample: boolean;
  journal: ReadonlyArray<JournalEntry>;
}

export type LeaderboardWindow = "30d" | "season";
export type LeaderboardSort = "units" | "clv" | "hits";

export interface RankedAnalyst extends LeaderboardAnalyst {
  rank: number;
  record: ProfileRecord;
}

export const LEADERBOARD_MIN_SETTLED = 20;
const WINDOW_DAYS = 30;

/** Picks dentro de la ventana; «Temporada» los toma todos. */
export function entriesInWindow(
  entries: ReadonlyArray<JournalEntry>,
  window: LeaderboardWindow,
  today: Date = new Date(),
): JournalEntry[] {
  if (window === "season") return [...entries];
  const from = today.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return entries.filter((e) => {
    const d = entryDate(e);
    return d !== null && d.getTime() >= from && d.getTime() <= today.getTime();
  });
}

function sortValue(record: ProfileRecord, sort: LeaderboardSort): number {
  if (sort === "clv") return record.avgClvPct ?? Number.NEGATIVE_INFINITY;
  if (sort === "hits") return record.hitRatePct ?? Number.NEGATIVE_INFINITY;
  return record.netUnits;
}

/**
 * Ordena analistas por saldo, ventaja contra el cierre o cumplidos en una
 * ventana real (por fecha de registro). Solo entran quienes tienen al menos
 * `minSettled` picks cerrados en esa ventana.
 */
export function rankAnalysts(
  rows: ReadonlyArray<LeaderboardAnalyst>,
  {
    window,
    sort,
    today = new Date(),
    minSettled = LEADERBOARD_MIN_SETTLED,
  }: { window: LeaderboardWindow; sort: LeaderboardSort; today?: Date; minSettled?: number },
): RankedAnalyst[] {
  return rows
    .map((row) => ({ row, record: profileRecord(entriesInWindow(row.journal, window, today)) }))
    .filter(({ record }) => record.settled >= minSettled)
    .sort(
      (a, b) =>
        sortValue(b.record, sort) - sortValue(a.record, sort) ||
        b.record.settled - a.record.settled ||
        a.row.handle.localeCompare(b.row.handle),
    )
    .map(({ row, record }, i) => ({ ...row, rank: i + 1, record }));
}

/** Puesto en Comunidad del mes (30 días, por saldo) o `null` si no aparece. */
export function analystRank(
  handle: string,
  rows: ReadonlyArray<LeaderboardAnalyst>,
  today: Date = new Date(),
): RankedAnalyst | null {
  const ranked = rankAnalysts(rows, { window: "30d", sort: "units", today });
  return ranked.find((r) => r.handle === handle) ?? null;
}

/** «+18.4u» / «−1.0u». */
export function formatUnits(units: number): string {
  const rounded = Math.round(units * 10) / 10;
  if (rounded === 0) return "0.0u";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}u`;
}

/** «+4.2 %» / «−0.8 %». */
export function formatSignedPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0.0 %";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)} %`;
}
