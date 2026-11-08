import type { LeagueId } from "./ids.js";
import type { LeagueSnapshot } from "./analysis.js";
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
    record: string;
  };
  away: {
    slug: string;
    name: string;
    shortName: string;
    record: string;
  };
  outcomes: OutcomeMarket[];
  factors: FactorItem[];
  trace: CalcStep[];
}

export function probabilityToFairOdds(p: number): FairOdds {
  const clamped = Math.min(0.99, Math.max(0.01, p));
  const decimal = Math.round((1 / clamped) * 100) / 100;
  const american = decimalToAmerican(decimal);
  return { decimal, american };
}

export function formatPercent(p: number, decimals: number = 1): string {
  return `${(p * 100).toFixed(decimals)}%`;
}

export function formatDecimal(d: number): string {
  return d.toFixed(2);
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
  if (diffMin < 60) {
    return {
      label: `Actualizado hace ${Math.max(1, diffMin)} min`,
      isStale: false,
    };
  }
  const diffHours = Math.round(diffMin / 60);
  if (diffHours <= 24) {
    return {
      label: `Actualizado hace ${diffHours} h`,
      isStale: false,
    };
  }
  return {
    label: `Corte reciente`,
    isStale: true,
  };
}

const WEEKDAY_MAP: Record<number, { id: string; short: string }> = {
  0: { id: "dom", short: "Dom" },
  1: { id: "lun", short: "Lun" },
  2: { id: "mar", short: "Mar" },
  3: { id: "mie", short: "Mié" },
  4: { id: "jue", short: "Jue" },
  5: { id: "vie", short: "Vie" },
  6: { id: "sab", short: "Sáb" },
};

const MONTHS_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function formatDayAndHour(startTime: string): {
  dayId: string;
  dayChipLabel: string;
  dayFullLabel: string;
  kickoffLocal: string;
} {
  const normalized = startTime.length === 10 ? `${startTime}T15:00:00Z` : startTime;
  const dateObj = new Date(normalized);
  const w = WEEKDAY_MAP[dateObj.getUTCDay()] ?? { id: "sab", short: "Sáb" };
  const dayNum = dateObj.getUTCDate();
  const monthStr = MONTHS_SHORT[dateObj.getUTCMonth()] ?? "nov";
  const hh = String(dateObj.getUTCHours()).padStart(2, "0");
  const mm = String(dateObj.getUTCMinutes()).padStart(2, "0");

  return {
    dayId: `${w.id}-${dayNum}`,
    dayChipLabel: `${w.short} ${dayNum}`,
    dayFullLabel: `${w.short} ${dayNum} ${monthStr}`,
    kickoffLocal: `${hh}:${mm}`,
  };
}

export function snapshotToMatchAnalyses(snapshot: LeagueSnapshot): {
  days: Array<{ id: string; label: string }>;
  matches: MatchAnalysis[];
} {
  const dayMap = new Map<string, string>();
  dayMap.set("all", "Todos");

  const leagueLabel =
    snapshot.league === "liga-mx"
      ? "Liga MX"
      : snapshot.league === "premier-league"
        ? "Premier League"
        : "NFL";
  const isNfl = snapshot.league === "nfl";

  const matches: MatchAnalysis[] = snapshot.games.map((g) => {
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

    const x12 = analysis?.x12 ?? [0.45, isNfl ? 0 : 0.25, isNfl ? 0.55 : 0.3];
    const outcomes: OutcomeMarket[] = isNfl
      ? [
          {
            key: "home",
            label: g.home.shortName,
            probability: x12[0],
            fairOdds: probabilityToFairOdds(x12[0]),
          },
          {
            key: "away",
            label: g.away.shortName,
            probability: x12[2],
            fairOdds: probabilityToFairOdds(x12[2]),
          },
        ]
      : [
          {
            key: "home",
            label: g.home.shortName,
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
            label: g.away.shortName,
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
    }));

    const trace: CalcStep[] = (analysis?.steps ?? []).map((stepText, idx) => ({
      step: `Paso ${idx + 1}`,
      value: stepText,
    }));

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
        record: homeRec,
      },
      away: {
        slug: awaySlug,
        name: g.away.name,
        shortName: g.away.shortName,
        record: awayRec,
      },
      outcomes,
      factors,
      trace,
    };
  });

  const days = Array.from(dayMap.entries()).map(([id, label]) => ({ id, label }));
  return { days, matches };
}
