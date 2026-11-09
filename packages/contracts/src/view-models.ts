import type { MarketPulseView } from "./market-pulse.js";
import { asMarketKey, type LeagueId } from "./ids.js";
import type {
  AnalysisConfidence,
  AnalysisMarketGroup,
  AnalysisPick,
  LeagueSnapshot,
  MostLikelyScore,
} from "./analysis.js";

export interface HeadToHeadView {
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
}
import { decimalToAmerican } from "./odds.js";

export interface FairOdds {
  decimal: number;
  american: number;
}

export interface OutcomeMarket {
  key: "home" | "draw" | "away" | "over" | "under" | "btts_yes" | "btts_no" | string;
  label: string;
  probability: number;
  fairOdds?: FairOdds;
}

export interface FactorItem {
  label: string;
  detail: string;
  impact: string;
  value?: string;
  sub?: string;
}

export interface CalcStep {
  step: string;
  value: string;
}

export interface MatchAnalysis {
  id: string;
  league: LeagueId;
  leagueLabel: string;
  sport: "football" | "american-football";
  round: string;
  day: string;
  dayLabel: string;
  kickoffUtc: string;
  kickoffLocal: string;
  venue: string;
  status: "NS" | "FT" | "LIVE";
  score?: {
    home: number;
    away: number;
  };
  home: {
    slug: string;
    name: string;
    shortName: string;
    code?: string;
    record: string;
  };
  away: {
    slug: string;
    name: string;
    shortName: string;
    code?: string;
    record: string;
  };
  projection?: {
    home: number;
    away: number;
    total: number;
    margin?: number;
  };
  x12?: [number, number, number];
  marketGroups?: AnalysisMarketGroup[];
  mostLikelyScore?: MostLikelyScore;
  steps?: string[];
  updatedAt?: string;
  publicationLabel?: string;
  outcomes: OutcomeMarket[];
  factors: FactorItem[];
  trace: CalcStep[];
  picks?: AnalysisPick[];
  confidence?: AnalysisConfidence;
  projectedScore?: MostLikelyScore;
  why?: string[];
  headToHead?: HeadToHeadView[];
  restDays?: { home?: number; away?: number };
  /** Volumen por resultado en mercados de predicción (FD-20). Se adjunta en el servidor. */
  marketPulse?: MarketPulseView;
}

export function probabilityToFairOdds(p: number): FairOdds {
  const clamped = Math.min(0.99, Math.max(0.01, p));
  const decimal = Math.round((1 / clamped) * 100) / 100;
  const american = decimalToAmerican(decimal);
  return { decimal, american };
}

export function formatPercent(p: number, decimals: number = 1): string {
  return (
    (p * 100).toLocaleString("es-MX", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) + " %"
  );
}

export function formatDecimal(d: number): string {
  return d.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatAmerican(a: number): string {
  return a > 0 ? `+${a}` : `${a}`;
}

export function formatFreshnessEs(
  generatedAtIso: string,
  now: Date = new Date(),
): { label: string; isStale: boolean } {
  const genMs = new Date(generatedAtIso).getTime();
  const diffMin = Math.max(0, Math.round((now.getTime() - genMs) / 60_000));
  const formattedCut = new Date(generatedAtIso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return {
    label: `Actualizado ${formattedCut}`,
    isStale: diffMin > 24 * 60,
  };
}

const WEEKDAY_MAP: Record<number, { id: string; short: string; long: string }> = {
  0: { id: "dom", short: "Dom", long: "domingo" },
  1: { id: "lun", short: "Lun", long: "lunes" },
  2: { id: "mar", short: "Mar", long: "martes" },
  3: { id: "mie", short: "Mié", long: "miércoles" },
  4: { id: "jue", short: "Jue", long: "jueves" },
  5: { id: "vie", short: "Vie", long: "viernes" },
  6: { id: "sab", short: "Sáb", long: "sábado" },
};

const MONTHS_LONG = [
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
];

const analysisDateFormat = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Mexico_City",
});

function formatDayAndHour(startTime: string): {
  dayId: string;
  dayChipLabel: string;
  dayFullLabel: string;
  kickoffLocal: string;
} {
  const hasExplicitTz = /([Zz]|[+-]\d{2}:\d{2})$/.test(startTime);
  const normalized =
    startTime.length === 10
      ? `${startTime}T15:00:00Z`
      : hasExplicitTz
        ? startTime
        : `${startTime}Z`;
  const rawDate = new Date(normalized);
  // Si el timestamp viene en UTC (+00:00 / Z), convertir a hora del centro de México (UTC-6)
  const isUtcOffset = /([Zz]|\+00:00)$/.test(startTime);
  const dateObj = isUtcOffset
    ? new Date(rawDate.getTime() - 6 * 3600_000)
    : rawDate;

  const w = WEEKDAY_MAP[dateObj.getUTCDay()] ?? {
    id: "sab",
    short: "Sáb",
    long: "sábado",
  };
  const dayNum = dateObj.getUTCDate();
  const monthLong = MONTHS_LONG[dateObj.getUTCMonth()] ?? "noviembre";
  const yyyy = dateObj.getUTCFullYear();
  const mmDate = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const ddDate = String(dayNum).padStart(2, "0");
  const hh = String(dateObj.getUTCHours()).padStart(2, "0");
  const mm = String(dateObj.getUTCMinutes()).padStart(2, "0");
  const fullDay = `${w.long}, ${dayNum} de ${monthLong}`;

  return {
    dayId: `${yyyy}-${mmDate}-${ddDate}`,
    dayChipLabel: fullDay,
    dayFullLabel: fullDay,
    kickoffLocal: `${hh}:${mm}`,
  };
}

export function snapshotToMatchAnalyses(snapshot: LeagueSnapshot): {
  days: Array<{ id: string; label: string }>;
  matches: MatchAnalysis[];
} {
  const dayMap = new Map<string, string>();
  const isNfl = snapshot.league === "nfl";
  dayMap.set("all", `Toda la ${isNfl ? "semana" : "jornada"}`);

  const LEAGUE_NAMES: Record<string, string> = {
    "liga-mx": "Liga MX",
    "premier-league": "Premier League",
    laliga: "LaLiga",
    bundesliga: "Bundesliga",
    "serie-a": "Serie A",
    "ligue-1": "Ligue 1",
    nfl: "NFL",
  };
  const leagueLabel = LEAGUE_NAMES[snapshot.league] ?? snapshot.league;

  const names = new Map<string, string>();
  for (const g of snapshot.games) {
    names.set(g.home.id, g.home.shortName);
    names.set(g.away.id, g.away.shortName);
  }
  for (const [id, rate] of Object.entries(snapshot.teamRates)) {
    if (!names.has(id)) names.set(id, rate.shortName);
  }
  const teamName = (id: string): string => {
    const known = names.get(id);
    if (known) return known;
    const slug = id.includes(".") ? id.split(".")[1]! : id;
    return slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  const sortedGames = snapshot.games
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const updatedAt = Date.parse(snapshot.updatedAt);
  const updatedCut = Number.isFinite(updatedAt)
    ? analysisDateFormat.format(updatedAt)
    : undefined;

  const matches: MatchAnalysis[] = sortedGames.map((g) => {
    const analysis = snapshot.analyses[g.id];
    const homeRate = snapshot.teamRates[g.home.id];
    const awayRate = snapshot.teamRates[g.away.id];
    const homeSlug = g.home.id.includes(".") ? g.home.id.split(".")[1]! : g.home.id;
    const awaySlug = g.away.id.includes(".") ? g.away.id.split(".")[1]! : g.away.id;

    const { dayId, dayChipLabel, dayFullLabel, kickoffLocal } = formatDayAndHour(
      g.startTime,
    );
    if (!dayMap.has(dayId)) {
      dayMap.set(dayId, dayChipLabel);
    }

    const x12: [number, number, number] = analysis?.x12 ?? [
      0.45,
      isNfl ? 0 : 0.25,
      isNfl ? 0.55 : 0.3,
    ];
    const outcomes: OutcomeMarket[] = isNfl
      ? [
          {
            key: "home",
            label: `${g.home.shortName} gana`,
            probability: x12[0],
            fairOdds: probabilityToFairOdds(x12[0]),
          },
          {
            key: "away",
            label: `${g.away.shortName} gana`,
            probability: x12[2],
            fairOdds: probabilityToFairOdds(x12[2]),
          },
        ]
      : [
          {
            key: "home",
            label: `${g.home.shortName} gana`,
            probability: x12[0],
            fairOdds: probabilityToFairOdds(x12[0]),
          },
          {
            key: "draw",
            label: "Empate",
            probability: x12[1],
            fairOdds: probabilityToFairOdds(x12[1]),
          },
          {
            key: "away",
            label: `${g.away.shortName} gana`,
            probability: x12[2],
            fairOdds: probabilityToFairOdds(x12[2]),
          },
        ];

    const unit = isNfl ? "pts" : "goles";
    const homeRec = homeRate
      ? `${homeRate.gamesPlayed} PJ · ${homeRate.forPerGame.toFixed(1)} ${unit}/p`
      : g.home.code;
    const awayRec = awayRate
      ? `${awayRate.gamesPlayed} PJ · ${awayRate.forPerGame.toFixed(1)} ${unit}/p`
      : g.away.code;

    const factors: FactorItem[] = (analysis?.factors ?? []).map((f) => ({
      label: f.label,
      detail: f.detail ? `${f.value} (${f.detail})` : f.value,
      impact: f.value,
      value: f.value,
      sub: f.detail ?? "",
    }));

    const steps = analysis?.steps ?? [];
    const trace: CalcStep[] = steps.map((stepText, idx) => ({
      step: `Paso ${idx + 1}`,
      value: stepText,
    }));

    const defaultMarketGroups: AnalysisMarketGroup[] = [
      {
        group: isNfl ? "Ganador" : "Resultado",
        rows: outcomes.map((o) => ({
          market: asMarketKey("h2h"),
          selection: o.key,
          label: o.label,
          p: o.probability,
          fairOdds: o.fairOdds?.decimal ?? probabilityToFairOdds(o.probability).decimal,
        })),
      },
    ];

    const publishedAt = Date.parse(analysis?.publishedAt ?? "");

    return {
      id: g.id,
      league: snapshot.league,
      leagueLabel,
      sport: isNfl ? "american-football" : "football",
      round: g.round ?? snapshot.periodLabel,
      day: dayId,
      dayLabel: dayFullLabel,
      kickoffUtc: g.startTime,
      kickoffLocal,
      venue: g.venue ?? (isNfl ? "Estadio NFL" : "Estadio"),
      status: g.status === "final" ? "FT" : g.status === "in_progress" ? "LIVE" : "NS",
      score: g.result ? { home: g.result.home, away: g.result.away } : undefined,
      home: {
        slug: homeSlug,
        name: g.home.name,
        shortName: g.home.shortName,
        code: g.home.code,
        record: homeRec,
      },
      away: {
        slug: awaySlug,
        name: g.away.name,
        shortName: g.away.shortName,
        code: g.away.code,
        record: awayRec,
      },
      projection: analysis?.projection ?? {
        home: isNfl ? 24 : 1.5,
        away: isNfl ? 21 : 1.2,
        total: isNfl ? 45 : 2.7,
      },
      x12,
      marketGroups: analysis?.marketGroups ?? defaultMarketGroups,
      mostLikelyScore: analysis?.mostLikelyScore,
      steps,
      updatedAt: updatedCut,
      publicationLabel: Number.isFinite(publishedAt)
        ? analysisDateFormat.format(publishedAt)
        : undefined,
      outcomes,
      factors,
      trace,
      picks: analysis?.picks,
      confidence: analysis?.confidence,
      projectedScore: analysis?.projectedScore,
      why: analysis?.insights?.why,
      headToHead: analysis?.insights?.headToHead?.map((h) => ({
        date: h.date,
        home: teamName(h.homeTeamId),
        away: teamName(h.awayTeamId),
        homeGoals: h.homeGoals,
        awayGoals: h.awayGoals,
      })),
      restDays: analysis?.insights?.restDays,
    };
  });

  const days = Array.from(dayMap.entries()).map(([id, label]) => ({ id, label }));
  return { days, matches };
}
