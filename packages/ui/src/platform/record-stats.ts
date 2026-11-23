export interface RecordEntry {
  status: "pending" | "won" | "lost" | "void";
  units: number;
  userDecimal: number;
  fairDecimal: number;
  clvPct?: number;
  leagueLabel: string;
  pickLabel: string;
  origin: string;
  sealedAtIso?: string;
  settledAtIso?: string | null;
  isParlay?: boolean;
  pickKind?: "single" | "parlay";
  parlayLegs?: ReadonlyArray<unknown>;
  pickId?: string;
}

export const PARLAY_ORIGIN_LABEL = "Parlay Combinado";

export const MAX_CREDIBLE_SINGLE_CLV_PCT = 25;
export const MAX_CREDIBLE_PARLAY_CLV_PCT = 50;
export const MIN_CREDIBLE_CLV_PCT = -60;

export interface ParlayClassifiableEntry {
  readonly isParlay?: boolean;
  readonly pickKind?: "single" | "parlay" | string;
  readonly origin?: string | null;
  readonly parlayLegs?: ReadonlyArray<unknown> | null;
  readonly pickId?: string | null;
}

export function isParlayClvEntry(entry: ParlayClassifiableEntry): boolean {
  return Boolean(
    entry.isParlay ||
      entry.pickKind === "parlay" ||
      entry.origin === PARLAY_ORIGIN_LABEL ||
      (Array.isArray(entry.parlayLegs) && entry.parlayLegs.length > 1) ||
      (typeof entry.pickId === "string" && entry.pickId.startsWith("parlay:")),
  );
}

export function isCredibleClvPct(
  clvPct: number | null | undefined,
  isParlay: boolean = false,
): clvPct is number {
  if (typeof clvPct !== "number" || !Number.isFinite(clvPct)) {
    return false;
  }
  const maxCredible = isParlay ? MAX_CREDIBLE_PARLAY_CLV_PCT : MAX_CREDIBLE_SINGLE_CLV_PCT;
  return clvPct <= maxCredible && clvPct >= MIN_CREDIBLE_CLV_PCT;
}

export interface RateRow {
  key: string;
  label: string;
  won: number;
  total: number;
  netUnits: number;
}

export interface MonthResult {
  key: string;
  label: string;
  netUnits: number;
}

export interface CurvePoint {
  day: string;
  balance: number;
}

export interface RecordStats {
  settled: number;
  won: number;
  lost: number;
  open: number;
  hitRatePct: number | null;
  netUnits: number;
  stakedUnits: number;
  yieldPct: number | null;
  roiPct: number | null;
  avgClvPct: number | null;
  avgOddsDecimal: number | null;
  currentStreak: { kind: "won" | "lost" | null; length: number };
  bestWinStreak: number;
  curve: CurvePoint[];
  byLeague: RateRow[];
  byMarket: RateRow[];
  byType: RateRow[];
  bestMonth: MonthResult | null;
  worstMonth: MonthResult | null;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

export function marketKindOf(entry: Pick<RecordEntry, "pickLabel" | "origin">): { key: string; label: string } {
  if (entry.origin === PARLAY_ORIGIN_LABEL) return { key: "parlay", label: "Parlays" };
  const l = entry.pickLabel.toLowerCase();
  if (l.includes("ambos anotan")) return { key: "btts", label: "Ambos anotan" };
  if (/\bmarcador\b|^\d+\s*[–-]\s*\d+$/.test(l)) return { key: "score", label: "Marcador exacto" };
  if (l.includes("más de") || l.includes("menos de") || l.startsWith("más ") || l.startsWith("menos ")) {
    return { key: "totals", label: "Goles y puntos" };
  }
  if (/[+-]\d+(\.\d+)?\b/.test(entry.pickLabel) || l.includes("hándicap") || l.includes("cubre")) {
    return { key: "handicap", label: "Hándicap" };
  }
  return { key: "result", label: "Resultado" };
}

const ORIGIN_LABELS: Record<string, string> = {
  "Spacetime Suite": "Picks del modelo",
  [PARLAY_ORIGIN_LABEL]: "Parlays",
  "Player Prop": "Props",
  Propio: "Picks propios",
};

function settlementUnits(e: RecordEntry): number | null {
  if (e.status === "won") return e.units * (e.userDecimal - 1);
  if (e.status === "lost") return -e.units;
  return null;
}

function dayOf(e: RecordEntry): string | null {
  const iso = e.settledAtIso ?? e.sealedAtIso;
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

function addRate(map: Map<string, RateRow>, key: string, label: string, won: boolean, units: number): void {
  const row = map.get(key) ?? { key, label, won: 0, total: 0, netUnits: 0 };
  row.total += 1;
  if (won) row.won += 1;
  row.netUnits += units;
  map.set(key, row);
}

const byTotal = (m: Map<string, RateRow>) =>
  Array.from(m.values())
    .map((r) => ({ ...r, netUnits: Math.round(r.netUnits * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
const round2 = (v: number) => Math.round(v * 100) / 100;

export function computeRecordStats(entries: ReadonlyArray<RecordEntry>, startingUnits: number | null = null): RecordStats {
  const settledEntries = entries
    .filter((e) => e.status === "won" || e.status === "lost")
    .map((e, i) => ({ e, i, day: dayOf(e) }))
    .sort((a, b) => (a.day ?? "").localeCompare(b.day ?? "") || a.i - b.i);

  const leagues = new Map<string, RateRow>();
  const markets = new Map<string, RateRow>();
  const types = new Map<string, RateRow>();
  const months = new Map<string, number>();
  let won = 0;
  let net = 0;
  let staked = 0;
  let oddsSum = 0;
  let curStreak: RecordStats["currentStreak"] = { kind: null, length: 0 };
  let bestWin = 0;
  let runWin = 0;
  const base = startingUnits ?? 0;
  const curve: CurvePoint[] = [];

  for (const { e, day } of settledEntries) {
    const units = settlementUnits(e)!;
    const isWon = e.status === "won";
    if (isWon) won += 1;
    net += units;
    staked += e.units;
    oddsSum += e.userDecimal;
    addRate(leagues, e.leagueLabel, e.leagueLabel, isWon, units);
    const market = marketKindOf(e);
    addRate(markets, market.key, market.label, isWon, units);
    addRate(types, e.origin, ORIGIN_LABELS[e.origin] ?? e.origin, isWon, units);
    if (day) {
      const mk = day.slice(0, 7);
      months.set(mk, (months.get(mk) ?? 0) + units);
      const last = curve[curve.length - 1];
      if (last && last.day === day) last.balance = round2(base + net);
      else curve.push({ day, balance: round2(base + net) });
    }
    const kind = isWon ? "won" : "lost";
    curStreak = curStreak.kind === kind ? { kind, length: curStreak.length + 1 } : { kind, length: 1 };
    runWin = isWon ? runWin + 1 : 0;
    bestWin = Math.max(bestWin, runWin);
  }

  const settled = settledEntries.length;
  const open = entries.filter((e) => e.status === "pending").length;
  let clvSum = 0;
  let clvCount = 0;
  for (const e of entries) {
    const rawClv = e.clvPct;
    if (isCredibleClvPct(rawClv, isParlayClvEntry(e))) {
      clvSum += rawClv;
      clvCount += 1;
    }
  }
  const clvAll = clvCount > 0 ? clvSum / clvCount : null;
  const monthRows: MonthResult[] = Array.from(months.entries()).map(([key, value]) => {
    const monthIndex = Number.parseInt(key.slice(5, 7), 10) - 1;
    return {
      key,
      label: `${MONTHS[monthIndex] ?? key.slice(5, 7)} ${key.slice(0, 4)}`,
      netUnits: round2(value),
    };
  });
  const sortedMonths = [...monthRows].sort((a, b) => b.netUnits - a.netUnits);

  return {
    settled,
    won,
    lost: settled - won,
    open,
    hitRatePct: settled > 0 ? (won / settled) * 100 : null,
    netUnits: round2(net),
    stakedUnits: round2(staked),
    yieldPct: staked > 0 ? (net / staked) * 100 : null,
    roiPct: startingUnits && startingUnits > 0 && settled > 0 ? (net / startingUnits) * 100 : null,
    avgClvPct: clvAll,
    avgOddsDecimal: settled > 0 ? oddsSum / settled : null,
    currentStreak: curStreak,
    bestWinStreak: bestWin,
    curve,
    byLeague: byTotal(leagues),
    byMarket: byTotal(markets),
    byType: byTotal(types),
    bestMonth: sortedMonths.length >= 2 ? sortedMonths[0]! : null,
    worstMonth: sortedMonths.length >= 2 ? sortedMonths[sortedMonths.length - 1]! : null,
  };
}

export const RECORD_PRIVACY_BLOCKS = {
  record: {
    label: "Récord",
    hint: "Ganados, perdidos y en qué aciertas.",
    fields: {
      wonLost: "Ganados y perdidos",
      hitRate: "Porcentaje de acierto",
      byLeague: "Acierto por liga",
      byMarket: "Acierto por mercado",
      streaks: "Rachas",
    },
  },
  performance: {
    label: "Rendimiento",
    hint: "Qué tan bien rinden tus unidades.",
    fields: {
      yield: "Rendimiento sobre unidades jugadas",
      roi: "Retorno sobre tu banca",
      clv: "Ventaja promedio contra el momio justo",
      avgOdds: "Momio promedio",
      months: "Mejor y peor mes",
    },
  },
  bank: {
    label: "Saldo y curva",
    hint: "Tu saldo en unidades. Los montos en pesos nunca son públicos.",
    fields: {
      netUnits: "Saldo en unidades",
      curve: "Curva de saldo",
    },
  },
  history: {
    label: "Historial de picks",
    hint: "Tus picks ya cerrados. Los abiertos nunca se muestran.",
    fields: {
      settledPicks: "Picks cerrados",
    },
  },
} as const;

export type RecordPrivacyBlock = keyof typeof RECORD_PRIVACY_BLOCKS;
export type RecordPrivacy = {
  [B in RecordPrivacyBlock]: { enabled: boolean; fields: { [F in keyof (typeof RECORD_PRIVACY_BLOCKS)[B]["fields"]]: boolean } };
};

export const DEFAULT_RECORD_PRIVACY: RecordPrivacy = {
  record: { enabled: true, fields: { wonLost: true, hitRate: true, byLeague: true, byMarket: true, streaks: true } },
  performance: { enabled: true, fields: { yield: true, roi: false, clv: true, avgOdds: true, months: true } },
  bank: { enabled: false, fields: { netUnits: true, curve: true } },
  history: { enabled: true, fields: { settledPicks: true } },
};

export function normalizeRecordPrivacy(raw: unknown): RecordPrivacy {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, { enabled?: unknown; fields?: Record<string, unknown> }>;
  const out = structuredClone(DEFAULT_RECORD_PRIVACY) as RecordPrivacy;
  for (const block of Object.keys(RECORD_PRIVACY_BLOCKS) as RecordPrivacyBlock[]) {
    const b = src[block];
    if (!b) continue;
    if (typeof b.enabled === "boolean") out[block].enabled = b.enabled;
    const fields = out[block].fields as Record<string, boolean>;
    for (const f of Object.keys(fields)) {
      const v = b.fields?.[f];
      if (typeof v === "boolean") fields[f] = v;
    }
  }
  return out;
}

export function isShared<B extends RecordPrivacyBlock>(
  privacy: RecordPrivacy,
  block: B,
  field: keyof RecordPrivacy[B]["fields"],
): boolean {
  return privacy[block].enabled && Boolean((privacy[block].fields as Record<string, boolean>)[field as string]);
}

export interface PublicRecordView {
  wonLost: { won: number; lost: number; settled: number } | null;
  hitRatePct: number | null;
  byLeague: RateRow[] | null;
  byMarket: RateRow[] | null;
  streaks: { current: RecordStats["currentStreak"]; bestWin: number } | null;
  yieldPct: number | null;
  roiPct: number | null;
  avgClvPct: number | null;
  avgOddsDecimal: number | null;
  months: { best: MonthResult | null; worst: MonthResult | null } | null;
  netUnits: number | null;
  curve: CurvePoint[] | null;
  settledPicks: Array<Pick<RecordEntry, "leagueLabel" | "pickLabel" | "status" | "userDecimal" | "units"> & { day: string | null }> | null;
}

export type PublicRecordPayload =
  | { hidden: true }
  | { hidden: false; settled: number; view: PublicRecordView };

export function publicRecordView(
  stats: RecordStats,
  entries: ReadonlyArray<RecordEntry>,
  privacy: RecordPrivacy,
  maxPicks = 50,
): PublicRecordView {
  const on = <B extends RecordPrivacyBlock>(b: B, f: keyof RecordPrivacy[B]["fields"]) => isShared(privacy, b, f);
  const hasCredibleParlayClv = entries.some(
    (e) => isParlayClvEntry(e) && isCredibleClvPct(e.clvPct, true),
  );
  return {
    wonLost: on("record", "wonLost") ? { won: stats.won, lost: stats.lost, settled: stats.settled } : null,
    hitRatePct: on("record", "hitRate") ? stats.hitRatePct : null,
    byLeague: on("record", "byLeague") ? stats.byLeague : null,
    byMarket: on("record", "byMarket") ? stats.byMarket : null,
    streaks: on("record", "streaks") ? { current: stats.currentStreak, bestWin: stats.bestWinStreak } : null,
    yieldPct: on("performance", "yield") ? stats.yieldPct : null,
    roiPct: on("performance", "roi") ? stats.roiPct : null,
    avgClvPct:
      on("performance", "clv") && isCredibleClvPct(stats.avgClvPct, hasCredibleParlayClv)
        ? stats.avgClvPct
        : null,
    avgOddsDecimal: on("performance", "avgOdds") ? stats.avgOddsDecimal : null,
    months: on("performance", "months") ? { best: stats.bestMonth, worst: stats.worstMonth } : null,
    netUnits: on("bank", "netUnits") ? stats.netUnits : null,
    curve: on("bank", "curve") ? stats.curve : null,
    settledPicks: on("history", "settledPicks")
      ? entries
          .filter((e) => e.status !== "pending")
          .slice(0, maxPicks)
          .map((e) => ({
            leagueLabel: e.leagueLabel,
            pickLabel: e.pickLabel,
            status: e.status,
            userDecimal: e.userDecimal,
            units: e.units,
            day: dayOf(e),
          }))
      : null,
  };
}

export interface DailyCalendarEntryItem {
  readonly id: string;
  readonly label: string;
  readonly subtitle: string;
  readonly status: "won" | "lost" | "pending" | "void";
  readonly netUnits: number | null;
  readonly href?: string;
}

export interface DailyCalendarCell {
  readonly dateIso: string;
  readonly dayNumber: number;
  readonly inMonth: boolean;
  readonly isToday: boolean;
  readonly settledCount: number;
  readonly wonCount: number;
  readonly lostCount: number;
  readonly openCount: number;
  readonly netUnits: number;
  readonly items: readonly DailyCalendarEntryItem[];
}

export interface MonthlyCalendarGrid {
  readonly yearMonth: string;
  readonly monthLabel: string;
  readonly weeks: ReadonlyArray<ReadonlyArray<DailyCalendarCell>>;
  readonly summary: {
    readonly settledCount: number;
    readonly wonCount: number;
    readonly lostCount: number;
    readonly openCount: number;
    readonly netUnits: number;
    readonly activeDays: number;
  };
}

const FULL_MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export function formatCalendarDayIso(
  iso: string | null | undefined,
  timeZone: string = "America/Mexico_City",
): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return iso.trim();
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (y && m && day) return `${y}-${m}-${day}`;
  } catch (err) {
    void err;
  }
  return d.toISOString().slice(0, 10);
}

function addUtcDays(dateIso: string, deltaDays: number): string {
  const parts = dateIso.split("-");
  const y = Number.parseInt(parts[0] ?? "", 10);
  const m = Number.parseInt(parts[1] ?? "", 10);
  const d = Number.parseInt(parts[2] ?? "", 10);
  const dt = new Date(
    Date.UTC(
      Number.isFinite(y) ? y : 2026,
      (Number.isFinite(m) ? m : 1) - 1,
      (Number.isFinite(d) ? d : 1) + deltaDays,
    ),
  );
  return dt.toISOString().slice(0, 10);
}

export function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const parts = yearMonth.split("-");
  const rawY = Number.parseInt(parts[0] ?? "", 10);
  const rawM = Number.parseInt(parts[1] ?? "", 10);
  const baseY = Number.isFinite(rawY) ? rawY : 2026;
  const baseM = Number.isFinite(rawM) ? rawM : 1;
  const dt = new Date(Date.UTC(baseY, baseM - 1 + deltaMonths, 1));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function buildEmptyGridShell(
  yearMonth: string,
  todayIso: string,
  bucketMap: ReadonlyMap<
    string,
    {
      settledCount: number;
      wonCount: number;
      lostCount: number;
      openCount: number;
      netUnits: number;
      items: DailyCalendarEntryItem[];
    }
  >,
): MonthlyCalendarGrid {
  const parts = yearMonth.split("-");
  const rawY = Number.parseInt(parts[0] ?? "", 10);
  const rawM = Number.parseInt(parts[1] ?? "", 10);
  const year = Number.isFinite(rawY) ? rawY : Number.parseInt(todayIso.slice(0, 4), 10);
  const month =
    Number.isFinite(rawM) && rawM >= 1 && rawM <= 12
      ? rawM
      : Number.parseInt(todayIso.slice(5, 7), 10);
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const firstIso = `${ym}-01`;
  const firstUtc = new Date(Date.UTC(year, month - 1, 1));
  const mondayOffset = (firstUtc.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
  const startIso = addUtcDays(firstIso, -mondayOffset);

  const weeks: DailyCalendarCell[][] = [];
  let settledCount = 0;
  let wonCount = 0;
  let lostCount = 0;
  let openCount = 0;
  let netUnits = 0;
  let activeDays = 0;

  for (let i = 0; i < totalCells; i += 1) {
    const cellIso = addUtcDays(startIso, i);
    const inMonth = cellIso.slice(0, 7) === ym;
    const dayNumber = Number.parseInt(cellIso.slice(8, 10), 10);
    const bucket = bucketMap.get(cellIso);
    const cell: DailyCalendarCell = {
      dateIso: cellIso,
      dayNumber,
      inMonth,
      isToday: cellIso === todayIso,
      settledCount: bucket?.settledCount ?? 0,
      wonCount: bucket?.wonCount ?? 0,
      lostCount: bucket?.lostCount ?? 0,
      openCount: bucket?.openCount ?? 0,
      netUnits: round2(bucket?.netUnits ?? 0),
      items: bucket?.items ?? [],
    };
    if (inMonth && bucket) {
      settledCount += cell.settledCount;
      wonCount += cell.wonCount;
      lostCount += cell.lostCount;
      openCount += cell.openCount;
      netUnits += bucket.netUnits;
      if (cell.settledCount > 0 || cell.openCount > 0) activeDays += 1;
    }
    const weekIdx = Math.floor(i / 7);
    if (!weeks[weekIdx]) weeks[weekIdx] = [];
    weeks[weekIdx]!.push(cell);
  }

  return {
    yearMonth: ym,
    monthLabel: `${FULL_MONTHS_ES[month - 1]} ${year}`,
    weeks,
    summary: {
      settledCount,
      wonCount,
      lostCount,
      openCount,
      netUnits: round2(netUnits),
      activeDays,
    },
  };
}

export interface CalendarRecordInputEntry extends RecordEntry {
  readonly id?: string;
  readonly matchLabel?: string;
  readonly day?: string | null;
}

export function buildMonthlyRecordCalendar(
  entries: ReadonlyArray<CalendarRecordInputEntry>,
  yearMonth?: string,
  options: {
    readonly timeZone?: string;
    readonly nowIso?: string;
    readonly includeNetUnits?: boolean;
  } = {},
): MonthlyCalendarGrid {
  const timeZone = options.timeZone ?? "America/Mexico_City";
  const includeNetUnits = options.includeNetUnits ?? true;
  const todayIso =
    formatCalendarDayIso(options.nowIso ?? new Date().toISOString(), timeZone) ??
    new Date().toISOString().slice(0, 10);

  const buckets = new Map<
    string,
    {
      settledCount: number;
      wonCount: number;
      lostCount: number;
      openCount: number;
      netUnits: number;
      items: DailyCalendarEntryItem[];
    }
  >();

  let latestMonth: string | null = null;

  entries.forEach((e, idx) => {
    const dateIso =
      e.day && /^\d{4}-\d{2}-\d{2}$/.test(e.day)
        ? e.day
        : formatCalendarDayIso(e.settledAtIso ?? e.sealedAtIso ?? null, timeZone);
    if (!dateIso) return;
    const ym = dateIso.slice(0, 7);
    if (!latestMonth || ym > latestMonth) latestMonth = ym;

    const b = buckets.get(dateIso) ?? {
      settledCount: 0,
      wonCount: 0,
      lostCount: 0,
      openCount: 0,
      netUnits: 0,
      items: [],
    };
    const delta = settlementUnits(e);
    if (e.status === "won") {
      b.settledCount += 1;
      b.wonCount += 1;
      if (includeNetUnits && delta !== null) b.netUnits += delta;
    } else if (e.status === "lost") {
      b.settledCount += 1;
      b.lostCount += 1;
      if (includeNetUnits && delta !== null) b.netUnits += delta;
    } else if (e.status === "pending") {
      b.openCount += 1;
    }
    b.items.push({
      id: e.id ?? `rec-${idx}`,
      label: e.pickLabel,
      subtitle: e.matchLabel ? `${e.leagueLabel} · ${e.matchLabel}` : e.leagueLabel,
      status: e.status,
      netUnits: includeNetUnits && delta !== null ? round2(delta) : null,
    });
    buckets.set(dateIso, b);
  });

  const targetYm = yearMonth ?? latestMonth ?? todayIso.slice(0, 7);
  return buildEmptyGridShell(targetYm, todayIso, buckets);
}

export interface ModelDailyResultInput {
  readonly id: string;
  readonly kickoffUtc: string;
  readonly label: string;
  readonly subtitle: string;
  readonly hit: boolean;
  readonly href?: string;
}

export function buildModelDailyCalendar(
  items: ReadonlyArray<ModelDailyResultInput>,
  yearMonth?: string,
  options: {
    readonly timeZone?: string;
    readonly nowIso?: string;
  } = {},
): MonthlyCalendarGrid {
  const timeZone = options.timeZone ?? "America/Mexico_City";
  const todayIso =
    formatCalendarDayIso(options.nowIso ?? new Date().toISOString(), timeZone) ??
    new Date().toISOString().slice(0, 10);

  const buckets = new Map<
    string,
    {
      settledCount: number;
      wonCount: number;
      lostCount: number;
      openCount: number;
      netUnits: number;
      items: DailyCalendarEntryItem[];
    }
  >();

  let latestMonth: string | null = null;
  for (const item of items) {
    const dateIso = formatCalendarDayIso(item.kickoffUtc, timeZone);
    if (!dateIso) continue;
    const ym = dateIso.slice(0, 7);
    if (!latestMonth || ym > latestMonth) latestMonth = ym;
    const b = buckets.get(dateIso) ?? {
      settledCount: 0,
      wonCount: 0,
      lostCount: 0,
      openCount: 0,
      netUnits: 0,
      items: [],
    };
    b.settledCount += 1;
    if (item.hit) b.wonCount += 1;
    else b.lostCount += 1;
    b.items.push({
      id: item.id,
      label: item.label,
      subtitle: item.subtitle,
      status: item.hit ? "won" : "lost",
      netUnits: null,
      ...(item.href ? { href: item.href } : {}),
    });
    buckets.set(dateIso, b);
  }

  const targetYm = yearMonth ?? latestMonth ?? todayIso.slice(0, 7);
  return buildEmptyGridShell(targetYm, todayIso, buckets);
}
