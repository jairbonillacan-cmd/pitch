/**
 * Mi récord: estadísticas de los picks sellados y su privacidad.
 *
 * Módulo puro (sin "use client"): lo usan la pantalla de Mi récord, el perfil público que
 * arma el servidor y, después, los rankings y las insignias. Todo se calcula en unidades;
 * los pesos solo se muestran al propio socio y nunca salen en la vista pública.
 */

export interface RecordEntry {
  status: "pending" | "won" | "lost";
  units: number;
  userDecimal: number;
  fairDecimal: number;
  clvPct: number;
  leagueLabel: string;
  pickLabel: string;
  origin: string;
  sealedAtIso?: string;
  settledAtIso?: string | null;
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
  /** Día AAAA-MM-DD. */
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
  /** Rendimiento sobre las unidades jugadas, en %. */
  yieldPct: number | null;
  /** Rendimiento sobre la banca inicial, en %; requiere banca inicial. */
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

export const PARLAY_ORIGIN_LABEL = "Parlay Combinado";

/** Tipo de mercado legible a partir de la etiqueta del pick. */
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

/**
 * Estadísticas del récord. Las rachas y la curva siguen el orden de cierre (o de sello si
 * no hay fecha de cierre). `startingUnits` es la banca inicial convertida a unidades.
 */
export function computeRecordStats(entries: ReadonlyArray<RecordEntry>, startingUnits: number | null = null): RecordStats {
  const settledEntries = entries
    .filter((e) => e.status !== "pending")
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
  const clvAll = entries.length > 0 ? entries.reduce((s, e) => s + e.clvPct, 0) / entries.length : null;
  const monthRows: MonthResult[] = Array.from(months.entries()).map(([key, value]) => ({
    key,
    label: `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
    netUnits: round2(value),
  }));
  const sortedMonths = [...monthRows].sort((a, b) => b.netUnits - a.netUnits);

  return {
    settled,
    won,
    lost: settled - won,
    open: entries.length - settled,
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

// ── Privacidad por bloque y por dato ──────────────────────────────────────────────────────

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
      roi: "ROI sobre tu banca",
      clv: "CLV promedio",
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

/** Normaliza lo que llega de la base o del cliente: cualquier dato ausente toma su valor por defecto. */
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

/** Lo que otros ven de tu récord: solo lo que activaste. Nunca pesos ni picks abiertos. */
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
  return {
    wonLost: on("record", "wonLost") ? { won: stats.won, lost: stats.lost, settled: stats.settled } : null,
    hitRatePct: on("record", "hitRate") ? stats.hitRatePct : null,
    byLeague: on("record", "byLeague") ? stats.byLeague : null,
    byMarket: on("record", "byMarket") ? stats.byMarket : null,
    streaks: on("record", "streaks") ? { current: stats.currentStreak, bestWin: stats.bestWinStreak } : null,
    yieldPct: on("performance", "yield") ? stats.yieldPct : null,
    roiPct: on("performance", "roi") ? stats.roiPct : null,
    avgClvPct: on("performance", "clv") ? stats.avgClvPct : null,
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
