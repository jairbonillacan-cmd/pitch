import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  and,
  checkHandleFormat,
  createDb,
  desc,
  eq,
  getUserPreferences,
  inArray,
  isNotNull,
  sealedPicks,
  sql,
  users,
  type Db,
} from "@pitchlab/db";
import {
  computeRecordStats,
  normalizeRecordPrivacy,
  publicRecordView,
  type CurvePoint,
  type MonthResult,
  type PublicRecordPayload,
  type RateRow,
  type RecordEntry,
  type RecordStats,
} from "@pitchlab/ui/record-stats";

let recordDb: Db | undefined;

const MAX_PUBLIC_RECORD_PICKS = 40;
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
const MARKET_LABELS: Readonly<Record<string, string>> = {
  parlay: "Parlays",
  btts: "Ambos anotan",
  score: "Marcador exacto",
  totals: "Goles y puntos",
  handicap: "Hándicap",
  result: "Resultado",
};

const round2 = (v: number): number => Math.round(v * 100) / 100;

function parseMetricNumber(raw: unknown): number {
  const parsed = parseStrictFiniteNumber(raw);
  return parsed ?? 0;
}

function clampPublicRecordLimit(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return MAX_PUBLIC_RECORD_PICKS;
  return Math.min(MAX_PUBLIC_RECORD_PICKS, Math.max(1, Math.trunc(raw)));
}

export type { PublicRecordPayload };

export async function loadPublicRecord(
  rawHandle: string,
  customDb?: Db,
  maxPicks: number = MAX_PUBLIC_RECORD_PICKS,
): Promise<PublicRecordPayload | null> {
  const check = checkHandleFormat(rawHandle);
  if (!check.ok) return null;
  let db = customDb;
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) return null;
    recordDb ??= createDb(url);
    db = recordDb;
  }
  const [user] = await db
    .select({ id: users.id, publicProfile: users.publicProfile })
    .from(users)
    .where(and(eq(users.handle, check.handle), isNotNull(users.authUserId), eq(users.isAdult, true)))
    .limit(1);
  if (!user) return null;
  if (!user.publicProfile) return { hidden: true };
  const prefs = await getUserPreferences(db, user.id);
  if (!prefs.publicRecordVisible) return { hidden: true };

  const safeMaxPicks = clampPublicRecordLimit(maxPicks);
  const settledStatuses = ["won", "lost"] as const;
  const settledDayExpr = sql<string>`to_char(coalesce(${sealedPicks.settledAt}, ${sealedPicks.sealedAt}) at time zone 'UTC', 'YYYY-MM-DD')`;
  const settledMonthExpr = sql<string>`to_char(coalesce(${sealedPicks.settledAt}, ${sealedPicks.sealedAt}) at time zone 'UTC', 'YYYY-MM')`;
  const netCaseSql = sql`case when ${sealedPicks.status} = 'won' then (${sealedPicks.units} * (${sealedPicks.userDecimal} - 1)) when ${sealedPicks.status} = 'lost' then -${sealedPicks.units} else 0 end`;
  const marketKeyExpr = sql<string>`case when ${sealedPicks.origin} = 'Parlay Combinado' then 'parlay' when lower(${sealedPicks.pickLabel}) like '%ambos anotan%' then 'btts' when lower(${sealedPicks.pickLabel}) ~ '\\ymarcador\\y' or lower(${sealedPicks.pickLabel}) ~ '^[0-9]+\\s*[–-]\\s*[0-9]+$' then 'score' when lower(${sealedPicks.pickLabel}) like '%más de%' or lower(${sealedPicks.pickLabel}) like '%menos de%' or lower(${sealedPicks.pickLabel}) like 'más %' or lower(${sealedPicks.pickLabel}) like 'menos %' then 'totals' when ${sealedPicks.pickLabel} ~ '[+-][0-9]+(\\.[0-9]+)?\\y' or lower(${sealedPicks.pickLabel}) like '%hándicap%' or lower(${sealedPicks.pickLabel}) like '%cubre%' then 'handicap' else 'result' end`;

  const [summaryRows, leagueRows, marketRows, dailyRows, monthlyRows, recentRows] = await Promise.all([
    db
      .select({
        totalValid: sql<number>`count(*)::int`,
        settled: sql<number>`coalesce(sum(case when ${sealedPicks.status} in ('won', 'lost') then 1 else 0 end), 0)::int`,
        won: sql<number>`coalesce(sum(case when ${sealedPicks.status} = 'won' then 1 else 0 end), 0)::int`,
        lost: sql<number>`coalesce(sum(case when ${sealedPicks.status} = 'lost' then 1 else 0 end), 0)::int`,
        open: sql<number>`coalesce(sum(case when ${sealedPicks.status} = 'pending' then 1 else 0 end), 0)::int`,
        netUnits: sql<string>`coalesce(sum(${netCaseSql}), 0)::text`,
        stakedUnits: sql<string>`coalesce(sum(case when ${sealedPicks.status} in ('won', 'lost') then ${sealedPicks.units} else 0 end), 0)::text`,
        oddsSum: sql<string>`coalesce(sum(case when ${sealedPicks.status} in ('won', 'lost') then ${sealedPicks.userDecimal} else 0 end), 0)::text`,
        clvSum: sql<string>`coalesce(sum(coalesce(${sealedPicks.clvPct}, 0)), 0)::text`,
      })
      .from(sealedPicks)
      .where(and(eq(sealedPicks.userId, user.id), inArray(sealedPicks.status, ["won", "lost", "pending", "void"]))),
    db
      .select({
        leagueLabel: sealedPicks.leagueLabel,
        won: sql<number>`coalesce(sum(case when ${sealedPicks.status} = 'won' then 1 else 0 end), 0)::int`,
        total: sql<number>`count(*)::int`,
        netUnits: sql<string>`coalesce(sum(${netCaseSql}), 0)::text`,
      })
      .from(sealedPicks)
      .where(and(eq(sealedPicks.userId, user.id), inArray(sealedPicks.status, [...settledStatuses])))
      .groupBy(sealedPicks.leagueLabel)
      .orderBy(desc(sql`count(*)`), sealedPicks.leagueLabel)
      .limit(MAX_PUBLIC_RECORD_PICKS),
    db
      .select({
        marketKey: marketKeyExpr,
        won: sql<number>`coalesce(sum(case when ${sealedPicks.status} = 'won' then 1 else 0 end), 0)::int`,
        total: sql<number>`count(*)::int`,
        netUnits: sql<string>`coalesce(sum(${netCaseSql}), 0)::text`,
      })
      .from(sealedPicks)
      .where(and(eq(sealedPicks.userId, user.id), inArray(sealedPicks.status, [...settledStatuses])))
      .groupBy(marketKeyExpr)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
    db
      .select({
        day: settledDayExpr,
        netUnits: sql<string>`coalesce(sum(${netCaseSql}), 0)::text`,
      })
      .from(sealedPicks)
      .where(and(eq(sealedPicks.userId, user.id), inArray(sealedPicks.status, [...settledStatuses])))
      .groupBy(settledDayExpr)
      .orderBy(desc(settledDayExpr))
      .limit(MAX_PUBLIC_RECORD_PICKS),
    db
      .select({
        monthKey: settledMonthExpr,
        netUnits: sql<string>`coalesce(sum(${netCaseSql}), 0)::text`,
      })
      .from(sealedPicks)
      .where(and(eq(sealedPicks.userId, user.id), inArray(sealedPicks.status, [...settledStatuses])))
      .groupBy(settledMonthExpr)
      .orderBy(desc(settledMonthExpr))
      .limit(MAX_PUBLIC_RECORD_PICKS),
    db
      .select({
        status: sealedPicks.status,
        units: sealedPicks.units,
        userDecimal: sealedPicks.userDecimal,
        fairDecimal: sealedPicks.fairDecimal,
        clvPct: sealedPicks.clvPct,
        leagueLabel: sealedPicks.leagueLabel,
        pickLabel: sealedPicks.pickLabel,
        origin: sealedPicks.origin,
        sealedAt: sealedPicks.sealedAt,
        settledAt: sealedPicks.settledAt,
      })
      .from(sealedPicks)
      .where(and(eq(sealedPicks.userId, user.id), inArray(sealedPicks.status, ["won", "lost", "void"])))
      .orderBy(desc(sealedPicks.sealedAt), desc(sealedPicks.id))
      .limit(safeMaxPicks),
  ]);

  const newestFirst: RecordEntry[] = recentRows
    .filter((r) => r.status === "won" || r.status === "lost" || r.status === "void")
    .map((r) => ({
      status: r.status as RecordEntry["status"],
      units: parseMetricNumber(r.units),
      userDecimal: parseMetricNumber(r.userDecimal),
      fairDecimal: parseMetricNumber(r.fairDecimal),
      clvPct: r.clvPct === null ? 0 : parseMetricNumber(r.clvPct),
      leagueLabel: r.leagueLabel,
      pickLabel: r.pickLabel,
      origin: r.origin,
      sealedAtIso: r.sealedAt.toISOString(),
      settledAtIso: r.settledAt ? r.settledAt.toISOString() : null,
    }));

  const startingUnits =
    prefs.bankrollStartMxnCentavos && prefs.unitMxnCentavos > 0
      ? prefs.bankrollStartMxnCentavos / prefs.unitMxnCentavos
      : null;

  const recentStats = computeRecordStats([...newestFirst].reverse(), startingUnits);
  const summary = summaryRows[0];
  const totalValid = summary?.totalValid ?? 0;
  const settled = summary?.settled ?? 0;
  const won = summary?.won ?? 0;
  const lost = summary?.lost ?? 0;
  const open = summary?.open ?? 0;
  const net = parseMetricNumber(summary?.netUnits);
  const staked = parseMetricNumber(summary?.stakedUnits);
  const oddsSum = parseMetricNumber(summary?.oddsSum);
  const clvSum = parseMetricNumber(summary?.clvSum);

  const byLeague: RateRow[] = leagueRows.map((r) => ({
    key: r.leagueLabel,
    label: r.leagueLabel,
    won: r.won,
    total: r.total,
    netUnits: round2(parseMetricNumber(r.netUnits)),
  }));

  const byMarket: RateRow[] = marketRows.map((r) => ({
    key: r.marketKey,
    label: MARKET_LABELS[r.marketKey] ?? r.marketKey,
    won: r.won,
    total: r.total,
    netUnits: round2(parseMetricNumber(r.netUnits)),
  }));

  const dailyChronological = [...dailyRows].reverse();
  const windowNet = dailyChronological.reduce((acc, r) => acc + parseMetricNumber(r.netUnits), 0);
  let runningBalance = (startingUnits ?? 0) + (net - windowNet);
  const curve: CurvePoint[] = dailyChronological.map((r) => {
    runningBalance += parseMetricNumber(r.netUnits);
    return { day: r.day, balance: round2(runningBalance) };
  });

  const monthRows: MonthResult[] = monthlyRows.map((r) => {
    const monthIndex = Number.parseInt(r.monthKey.slice(5, 7), 10) - 1;
    const monthLabel = MONTHS[monthIndex] ?? r.monthKey.slice(5, 7);
    return {
      key: r.monthKey,
      label: `${monthLabel} ${r.monthKey.slice(0, 4)}`,
      netUnits: round2(parseMetricNumber(r.netUnits)),
    };
  });
  const sortedMonths = [...monthRows].sort((a, b) => b.netUnits - a.netUnits);

  const stats: RecordStats = {
    settled,
    won,
    lost,
    open,
    hitRatePct: settled > 0 ? (won / settled) * 100 : null,
    netUnits: round2(net),
    stakedUnits: round2(staked),
    yieldPct: staked > 0 ? (net / staked) * 100 : null,
    roiPct: startingUnits && startingUnits > 0 && settled > 0 ? (net / startingUnits) * 100 : null,
    avgClvPct: totalValid > 0 ? clvSum / totalValid : null,
    avgOddsDecimal: settled > 0 ? oddsSum / settled : null,
    currentStreak: recentStats.currentStreak,
    bestWinStreak: recentStats.bestWinStreak,
    curve,
    byLeague,
    byMarket,
    byType: recentStats.byType,
    bestMonth: sortedMonths.length >= 2 ? sortedMonths[0]! : null,
    worstMonth: sortedMonths.length >= 2 ? sortedMonths[sortedMonths.length - 1]! : null,
  };

  return {
    hidden: false,
    settled: stats.settled,
    view: publicRecordView(stats, newestFirst, normalizeRecordPrivacy(prefs.recordPrivacy), safeMaxPicks),
  };
}
