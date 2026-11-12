import type { MarketPulseView } from "./market-pulse";
import { asMarketKey, type LeagueId } from "./ids";
import type {
  AnalysisConfidence,
  AnalysisMarketGroup,
  AnalysisPick,
  LeagueSnapshot,
  MostLikelyScore,
} from "./analysis";

export interface HeadToHeadView {
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
}
import { decimalToAmerican } from "./odds";
import type { GameDTO } from "./sports/index";

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
  scheduleStatus?: GameDTO["status"];
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

const NY_PARTS_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const CDMX_PARTS_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function readFormatterParts(
  ms: number,
  fmt: Intl.DateTimeFormat,
): Record<"year" | "month" | "day" | "hour" | "minute" | "second", number> {
  const parts = fmt.formatToParts(new Date(ms));
  const out = { year: 0, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
  for (const part of parts) {
    if (part.type === "year" || part.type === "month" || part.type === "day" || part.type === "hour" || part.type === "minute" || part.type === "second") {
      const n = Number(part.value);
      out[part.type] = part.type === "hour" && n === 24 ? 0 : n;
    }
  }
  return out;
}

/**
 * Convierte fecha y hora local de `America/New_York` (como publica nflverse) a ISO UTC exacto,
 * respetando EDT (-04:00) y EST (-05:00) sin depender de la zona horaria del servidor.
 */
export function easternWallTimeToUtcIso(gameday: string, gametime?: string | null): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(gameday.trim());
  if (!dateMatch) {
    const parsed = Date.parse(gameday);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : gameday;
  }
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec((gametime ?? "").trim());
  const hour = timeMatch ? Number(timeMatch[1]) : 13;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;
  const second = timeMatch && timeMatch[3] ? Number(timeMatch[3]) : 0;

  const targetWallMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = targetWallMs + 5 * 3600_000;
  for (let i = 0; i < 2; i += 1) {
    const p = readFormatterParts(guess, NY_PARTS_FMT);
    const observedWallMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += targetWallMs - observedWallMs;
  }
  return new Date(guess).toISOString();
}

/**
 * Normaliza el timestamp de un partido a ISO UTC. Si viene sin sufijo de zona horaria
 * (`YYYY-MM-DDTHH:mm:ss`) y pertenece a `nfl`, lo interpreta en `America/New_York`.
 */
export function normalizeGameStartTimeUtc(startTime: string, league?: string): string {
  const trimmed = startTime.trim();
  if (/([Zz]|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
    const ms = Date.parse(trimmed);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : trimmed;
  }
  if (trimmed.length === 10) {
    return league === "nfl" ? easternWallTimeToUtcIso(trimmed, "13:00") : `${trimmed}T15:00:00.000Z`;
  }
  if (league === "nfl") {
    const [datePart, timePart] = trimmed.split("T");
    return easternWallTimeToUtcIso(datePart ?? trimmed, timePart);
  }
  const utcMs = Date.parse(`${trimmed}Z`);
  return Number.isFinite(utcMs) ? new Date(utcMs).toISOString() : trimmed;
}

function formatDayAndHour(isoUtc: string): {
  dayId: string;
  dayChipLabel: string;
  dayFullLabel: string;
  kickoffLocal: string;
} {
  const ms = Date.parse(isoUtc);
  const safeMs = Number.isFinite(ms) ? ms : Date.now();
  const p = readFormatterParts(safeMs, CDMX_PARTS_FMT);
  const weekdayIndex = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  const w = WEEKDAY_MAP[weekdayIndex] ?? {
    id: "sab",
    short: "Sáb",
    long: "sábado",
  };
  const monthLong = MONTHS_LONG[p.month - 1] ?? "noviembre";
  const yyyy = String(p.year).padStart(4, "0");
  const mmDate = String(p.month).padStart(2, "0");
  const ddDate = String(p.day).padStart(2, "0");
  const hh = String(p.hour).padStart(2, "0");
  const mm = String(p.minute).padStart(2, "0");
  const fullDay = `${w.long}, ${p.day} de ${monthLong}`;

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

    const normalizedUtc = normalizeGameStartTimeUtc(g.startTime, snapshot.league);
    const { dayId, dayChipLabel, dayFullLabel, kickoffLocal } = formatDayAndHour(
      normalizedUtc,
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
      kickoffUtc: normalizedUtc,
      kickoffLocal,
      venue: g.venue ?? (isNfl ? "Estadio NFL" : "Estadio"),
      status: g.status === "final" ? "FT" : g.status === "in_progress" ? "LIVE" : "NS",
      scheduleStatus: g.status,
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
