import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import type {
  PlatformGame,
  PlatformGameDetail,
  PlatformMarketRow,
} from "../../../types";
import type {
  OutlookSport,
  SportConfirmation,
  SportOutlookDriver,
  SportOutlookInput,
  SportOutlookLine,
  SportOutlookNflSpecials,
  SportRestInfo,
  TeamSide,
} from "./sport-outlook-types";
import {
  DRIVER_COPY,
  isSafeDriverLabel,
  isValidOutlook,
} from "./sport-outlook-logic";

const OUTLOOK_LEAGUE_TO_SPORT: Record<string, OutlookSport | undefined> = {
  nba: "nba",
  nhl: "nhl",
  mlb: "mlb",
  nfl: "nfl",
  ncaaf: "ncaaf",
};

const TOTAL_MARKETS = new Set([
  "totals",
  "total",
  "nba_totals",
  "nfl_totals",
  "nhl_totals",
  "mlb_totals",
]);

const SPREAD_MARKETS = new Set([
  "spreads",
  "spread",
  "nhl_puckline",
  "nhl_puck_line",
  "mlb_runline",
  "mlb_run_line",
  "nba_spread",
  "nfl_spread",
]);

const SPORT_PRIORITY_SPREAD_MARKETS: Readonly<
  Partial<Record<OutlookSport, ReadonlySet<string>>>
> = {
  nhl: new Set(["nhl_puckline", "nhl_puck_line"]),
  mlb: new Set(["mlb_runline", "mlb_run_line"]),
};

const F5_TOTAL_MARKETS = new Set(["f5_totals", "mlb_f5_totals"]);

const SPORT_LABEL_TO_FACTOR: Readonly<
  Partial<Record<OutlookSport, Readonly<Record<string, string>>>>
> = {
  nhl: { "localía y altura": "home_ice_and_altitude" },
  nba: { "localía y altura": "nba_hca_and_altitude" },
  ncaaf: { "localía y altura": "cfb_hfa_and_altitude_shock" },
  nfl: { "localía y altura": "stadium_altitude_physics" },
};

const EXTRA_LABEL_TO_FACTOR: Readonly<Record<string, string>> = {
  "lesiones (qb y titulares)": "injuries_qb_depth",
  "fuerza estructural y xg": "clubelo_and_xg_elo",
};

const LABEL_TO_FACTOR: Readonly<Record<string, string>> = (() => {
  const table: Record<string, string> = { ...EXTRA_LABEL_TO_FACTOR };
  for (const [factor, copy] of Object.entries(DRIVER_COPY)) {
    table[copy.trim().toLowerCase()] = factor;
  }
  return table;
})();

const UNDERSCORE_DECIMAL_RE = /^[+-]?\d+_\d+$/;
const UNDEFINED_PLAYER_RE =
  /^(?:por\s+definir|por\s+confirmar|tbd|sin\s+confirmar|pendiente|-+)$/i;
const PACE_LABEL_RE = /\b(?:ritmo|pace|posesiones)\b/i;
const PACE_NUMBER_RE = /(\d{2,3}(?:\.\d+)?)/;

function parseValidProb(raw: unknown): number | null {
  const value = parseStrictFiniteNumber(raw);
  if (value === null || value < 0 || value > 1) return null;
  return value;
}

function readOptionalFiniteField(
  source: object | null | undefined,
  key: string,
): number | null {
  if (!source) return null;
  for (const [entryKey, entryValue] of Object.entries(source)) {
    if (entryKey === key) {
      return parseStrictFiniteNumber(entryValue);
    }
  }
  return null;
}

function readOptionalStringField(
  source: object | null | undefined,
  key: string,
): string | null {
  if (!source) return null;
  for (const [entryKey, entryValue] of Object.entries(source)) {
    if (entryKey === key && typeof entryValue === "string") {
      const trimmed = entryValue.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
  }
  return null;
}

function parseLineToken(rawToken: string): number | null {
  const direct = parseStrictFiniteNumber(rawToken);
  if (direct !== null) return direct;
  if (UNDERSCORE_DECIMAL_RE.test(rawToken)) {
    return parseStrictFiniteNumber(rawToken.replace("_", "."));
  }
  return null;
}

function resolveMarketLine(
  row: PlatformMarketRow,
  exactSelections: readonly string[],
  prefixes: readonly string[],
): number | null {
  const selection = row.selection.trim().toLowerCase();
  const matchesExact = exactSelections.includes(selection);
  let suffix: string | null = null;
  if (!matchesExact) {
    for (const prefix of prefixes) {
      if (selection.startsWith(prefix)) {
        suffix = selection.slice(prefix.length);
        break;
      }
    }
    if (suffix === null) return null;
  }

  const fromField = parseStrictFiniteNumber(row.line);
  if (fromField !== null) return fromField;
  if (suffix !== null) {
    return parseLineToken(suffix);
  }
  return null;
}

interface RankedLineCandidate {
  readonly line: number;
  readonly p: number;
  readonly tier: number;
  readonly balance: number;
}

function isBetterCandidate(
  next: RankedLineCandidate,
  current: RankedLineCandidate | null,
): boolean {
  if (!current) return true;
  if (next.tier !== current.tier) return next.tier < current.tier;
  return next.balance < current.balance - 1e-6;
}

function mapFirst5Winner(
  markets: readonly PlatformMarketRow[],
): SportOutlookLine | null {
  let bestMoneyline: { p: number; derived: boolean } | null = null;
  let mlbF5Home: { p: number; derived: boolean } | null = null;
  let mlbF5Tie: number | null = null;
  let mlbF5Away: number | null = null;

  for (const row of markets) {
    const market = row.market.trim().toLowerCase();
    const selection = row.selection.trim().toLowerCase();
    const p = parseValidProb(row.p);
    if (p === null) continue;

    if (market === "f5_moneyline" && (selection === "f5_home" || selection === "home")) {
      const derived = row.isDerived === true;
      if (!bestMoneyline || (bestMoneyline.derived && !derived)) {
        bestMoneyline = { p, derived };
      }
      continue;
    }

    if (market === "mlb_f5") {
      if (selection === "home" || selection === "f5_home") {
        const derived = row.isDerived === true;
        if (!mlbF5Home || (mlbF5Home.derived && !derived)) {
          mlbF5Home = { p, derived };
        }
      } else if (selection === "tie" || selection === "draw") {
        mlbF5Tie = p;
      } else if (selection === "away" || selection === "f5_away") {
        mlbF5Away = p;
      }
    }
  }

  if (bestMoneyline && !bestMoneyline.derived) {
    return { kind: "first5_winner", line: 0, p: bestMoneyline.p };
  }

  if (mlbF5Home) {
    if (
      mlbF5Tie !== null &&
      mlbF5Away !== null &&
      mlbF5Tie > 0.001 &&
      Math.abs(mlbF5Home.p + mlbF5Tie + mlbF5Away - 1) <= 0.02
    ) {
      return {
        kind: "first5_winner",
        line: 0,
        p: mlbF5Home.p,
        pTie: mlbF5Tie,
        pAway: mlbF5Away,
      };
    }
    return {
      kind: "first5_winner",
      line: 0,
      p: mlbF5Home.p,
    };
  }

  if (bestMoneyline) {
    return { kind: "first5_winner", line: 0, p: bestMoneyline.p };
  }

  return null;
}

function mapLines(
  markets: readonly PlatformMarketRow[],
  sport: OutlookSport,
): SportOutlookLine[] {
  const lines: SportOutlookLine[] = [];
  let bestTotal: RankedLineCandidate | null = null;
  let bestSpread: RankedLineCandidate | null = null;
  let bestF5Total: RankedLineCandidate | null = null;
  const prioritySpreads = SPORT_PRIORITY_SPREAD_MARKETS[sport];

  for (const row of markets) {
    const market = row.market.trim().toLowerCase();
    const p = parseValidProb(row.p);
    if (p === null) continue;

    if (TOTAL_MARKETS.has(market)) {
      const line = resolveMarketLine(row, ["over"], ["over_"]);
      if (line !== null && line > 0) {
        const candidate: RankedLineCandidate = {
          line,
          p,
          tier: row.isDerived === true ? 1 : 0,
          balance: Math.abs(p - 0.5),
        };
        if (isBetterCandidate(candidate, bestTotal)) {
          bestTotal = candidate;
        }
      }
      continue;
    }

    if (SPREAD_MARKETS.has(market)) {
      const line = resolveMarketLine(row, ["home"], ["home_"]);
      if (line !== null) {
        const tier =
          row.isDerived !== true ? 0 : prioritySpreads?.has(market) ? 1 : 2;
        const candidate: RankedLineCandidate = {
          line,
          p,
          tier,
          balance: Math.abs(p - 0.5),
        };
        if (isBetterCandidate(candidate, bestSpread)) {
          bestSpread = candidate;
        }
      }
      continue;
    }

    if (sport === "mlb" && F5_TOTAL_MARKETS.has(market)) {
      const line = resolveMarketLine(
        row,
        ["over", "f5_over"],
        ["f5_over_", "over_"],
      );
      if (line !== null && line > 0) {
        const candidate: RankedLineCandidate = {
          line,
          p,
          tier: row.isDerived === true ? 1 : 0,
          balance: Math.abs(p - 0.5),
        };
        if (isBetterCandidate(candidate, bestF5Total)) {
          bestF5Total = candidate;
        }
      }
    }
  }

  if (bestTotal) {
    lines.push({ kind: "total", line: bestTotal.line, p: bestTotal.p });
  }
  if (bestSpread) {
    lines.push({ kind: "spread", line: bestSpread.line, p: bestSpread.p });
  }
  if (sport === "mlb") {
    const f5Winner = mapFirst5Winner(markets);
    if (f5Winner) {
      lines.push(f5Winner);
    }
    if (bestF5Total) {
      lines.push({
        kind: "first5_total",
        line: bestF5Total.line,
        p: bestF5Total.p,
      });
    }
  }

  return lines;
}

function mapRestSide(days: number | undefined): SportRestInfo | undefined {
  const parsed = parseStrictFiniteNumber(days);
  if (parsed === null || parsed < 0) return undefined;
  return parsed === 0 ? { restDays: 0, backToBack: true } : { restDays: parsed };
}

function isGoalieRole(role: string | undefined): boolean {
  if (!role) return false;
  const normalized = role.trim().toLowerCase();
  return (
    normalized === "g" ||
    normalized === "gk" ||
    normalized === "goalie" ||
    normalized === "goaltender" ||
    normalized.includes("portero") ||
    normalized.includes("goalie")
  );
}

function findLineupGoalie(
  lineups: PlatformGame["preGame"]["confirmedLineups"],
  side: TeamSide,
): { name: string; updatedAtUtc?: string } | null {
  if (!lineups) return null;
  const starters = side === "home" ? lineups.homeStarters : lineups.awayStarters;
  const match = starters.find(
    (player) => isGoalieRole(player.position) && player.name.trim().length > 0,
  );
  if (!match) return null;
  return {
    name: match.name.trim(),
    ...(lineups.verifiedAtUtc ? { updatedAtUtc: lineups.verifiedAtUtc } : {}),
  };
}

function parseStarterFromFactorText(raw: string | undefined): string | null {
  if (!raw) return null;
  const colonIdx = raw.indexOf(":");
  const candidate = (colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw).trim();
  if (!candidate || UNDEFINED_PLAYER_RE.test(candidate)) return null;
  return candidate;
}

function mapConfirmations(
  game: PlatformGame,
  sport: OutlookSport,
  detail?: PlatformGameDetail | null,
): SportConfirmation[] {
  if (game.preGame.isRedacted) return [];
  const out: SportConfirmation[] = [];
  const sides: readonly TeamSide[] = ["home", "away"];

  if (sport === "mlb") {
    const probablePitchers = game.preGame.matchContext?.probablePitchers;
    let homeStarter = probablePitchers?.home?.name?.trim() || null;
    let awayStarter = probablePitchers?.away?.name?.trim() || null;

    if (!homeStarter && !awayStarter) {
      const factors =
        detail && detail.factors.length > 0 ? detail.factors : game.factors;
      const pitchersFactor = factors.find(
        (factor) => factor.label.trim().toLowerCase() === "abridores",
      );
      if (pitchersFactor) {
        homeStarter = parseStarterFromFactorText(pitchersFactor.value);
        awayStarter = parseStarterFromFactorText(pitchersFactor.sub);
      }
    }

    const starters: ReadonlyArray<{ side: TeamSide; name: string | null }> = [
      { side: "home", name: homeStarter },
      { side: "away", name: awayStarter },
    ];
    for (const item of starters) {
      if (item.name) {
        out.push({
          kind: "starting_pitcher",
          team: item.side,
          status: "probable",
          playerName: item.name,
        });
      } else {
        out.push({
          kind: "starting_pitcher",
          team: item.side,
          status: "pending",
        });
      }
    }
  }

  if (sport === "nhl") {
    const handledSides = new Set<TeamSide>();
    for (const side of sides) {
      const confirmed = findLineupGoalie(game.preGame.confirmedLineups, side);
      if (confirmed) {
        out.push({
          kind: "goalie",
          team: side,
          status: "confirmed",
          playerName: confirmed.name,
          ...(confirmed.updatedAtUtc ? { updatedAtUtc: confirmed.updatedAtUtc } : {}),
        });
        handledSides.add(side);
      }
    }

    for (const item of game.preGame.absences) {
      if (!item.player?.trim() || !isGoalieRole(item.role)) continue;
      if (handledSides.has(item.teamSide)) continue;
      const status =
        item.status === "Confirmado XI"
          ? "confirmed"
          : item.status === "Baja"
            ? "out"
            : "questionable";
      out.push({
        kind: "goalie",
        team: item.teamSide,
        status,
        playerName: item.player.trim(),
      });
      handledSides.add(item.teamSide);
    }

    for (const side of sides) {
      if (handledSides.has(side)) continue;
      const probable = findLineupGoalie(game.preGame.probableLineups, side);
      if (probable) {
        out.push({
          kind: "goalie",
          team: side,
          status: "probable",
          playerName: probable.name,
          ...(probable.updatedAtUtc ? { updatedAtUtc: probable.updatedAtUtc } : {}),
        });
        handledSides.add(side);
      }
    }

    for (const side of sides) {
      if (handledSides.has(side)) continue;
      out.push({
        kind: "goalie",
        team: side,
        status: "pending",
      });
    }
  }

  for (const item of game.preGame.absences) {
    if (!item.player?.trim()) continue;
    if (sport === "nhl" && isGoalieRole(item.role)) continue;
    const status =
      item.status === "Confirmado XI"
        ? "confirmed"
        : item.status === "Baja"
          ? "out"
          : "questionable";
    out.push({
      kind: "key_player",
      team: item.teamSide,
      status,
      playerName: item.player.trim(),
    });
  }

  return out;
}

function mapDrivers(
  game: PlatformGame,
  sport: OutlookSport,
): SportOutlookDriver[] {
  const rawDrivers = game.spacetime?.drivers;
  if (!rawDrivers || rawDrivers.length === 0) return [];
  const byFactor = new Map<string, SportOutlookDriver>();
  const sportLabelOverrides = SPORT_LABEL_TO_FACTOR[sport];

  for (let idx = 0; idx < rawDrivers.length; idx += 1) {
    const entry = rawDrivers[idx]!;
    const impactLogit = parseStrictFiniteNumber(entry.impactLogit);
    if (impactLogit === null) continue;
    const rawLabel = typeof entry.label === "string" ? entry.label.trim() : "";
    const loweredLabel = rawLabel.toLowerCase();
    const rawFactor = readOptionalStringField(entry, "factor");
    const rawImpactUnits = readOptionalFiniteField(entry, "impactUnits");

    let factor: string;
    let customLabel: string | undefined;

    if (rawFactor && DRIVER_COPY[rawFactor]) {
      factor = rawFactor;
    } else if (rawLabel && DRIVER_COPY[rawLabel]) {
      factor = rawLabel;
    } else if (loweredLabel && sportLabelOverrides?.[loweredLabel]) {
      factor = sportLabelOverrides[loweredLabel]!;
    } else if (loweredLabel && LABEL_TO_FACTOR[loweredLabel]) {
      factor = LABEL_TO_FACTOR[loweredLabel]!;
    } else if (isSafeDriverLabel(rawLabel)) {
      factor = `custom_driver_${idx}`;
      customLabel = rawLabel;
    } else {
      factor = `model_factor_${idx}`;
    }

    const candidate: SportOutlookDriver = {
      factor,
      impactLogit,
      ...(rawImpactUnits !== null ? { impactUnits: rawImpactUnits } : {}),
      ...(customLabel ? { label: customLabel } : {}),
    };

    const existing = byFactor.get(factor);
    if (!existing || Math.abs(candidate.impactLogit) > Math.abs(existing.impactLogit)) {
      byFactor.set(factor, candidate);
    }
  }

  return [...byFactor.values()];
}

function parseBoundedNbaPace(raw: unknown): number | null {
  const direct = parseStrictFiniteNumber(raw);
  if (direct !== null) {
    return direct >= 75 && direct <= 130 ? direct : null;
  }
  if (typeof raw === "string") {
    const match = PACE_NUMBER_RE.exec(raw);
    if (!match?.[1]) return null;
    const extracted = parseStrictFiniteNumber(match[1]);
    return extracted !== null && extracted >= 75 && extracted <= 130
      ? extracted
      : null;
  }
  return null;
}

function mapExpectedPace(
  game: PlatformGame,
  sport: OutlookSport,
  detail?: PlatformGameDetail | null,
): number | undefined {
  if (sport !== "nba") return undefined;

  const directSources: ReadonlyArray<object | null | undefined> = [
    game.spacetime,
    game.projection,
    detail?.v5?.multisportSpecials,
  ];
  for (const source of directSources) {
    for (const key of ["expectedPace", "projectedPace", "pace"]) {
      const value = parseBoundedNbaPace(readOptionalFiniteField(source, key));
      if (value !== null) return value;
    }
  }

  const highlights = detail?.v5?.multisportSpecials?.highlights ?? [];
  for (const item of highlights) {
    if (PACE_LABEL_RE.test(item.label) || PACE_LABEL_RE.test(item.value)) {
      const value = parseBoundedNbaPace(item.value);
      if (value !== null) return value;
    }
    if (item.sub && PACE_LABEL_RE.test(item.sub)) {
      const value = parseBoundedNbaPace(item.sub);
      if (value !== null) return value;
    }
  }

  const factors =
    detail && detail.factors.length > 0 ? detail.factors : game.factors;
  for (const factor of factors) {
    if (PACE_LABEL_RE.test(factor.label) || PACE_LABEL_RE.test(factor.value)) {
      const value = parseBoundedNbaPace(factor.value);
      if (value !== null) return value;
    }
    if (factor.sub && PACE_LABEL_RE.test(factor.sub)) {
      const value = parseBoundedNbaPace(factor.sub);
      if (value !== null) return value;
    }
  }

  return undefined;
}

function mapNflSpecials(
  sport: OutlookSport,
  activeMarkets: readonly PlatformMarketRow[],
  detail?: PlatformGameDetail | null,
): SportOutlookNflSpecials | undefined {
  if (sport !== "nfl") return undefined;
  const raw = detail?.v5?.nflSpecials;
  const expectedMargin = raw ? parseStrictFiniteNumber(raw.expectedMargin) : null;
  let pOvertime = raw ? parseValidProb(raw.pOvertime) : null;
  let fairOvertimeDecimal = raw
    ? parseStrictFiniteNumber(raw.fairOvertimeDecimal)
    : null;
  const pExactPlus3 = raw ? parseValidProb(raw.pExactPlus3) : null;
  const pExactMinus3 = raw ? parseValidProb(raw.pExactMinus3) : null;
  const pExactPlus7 = raw
    ? parseValidProb(readOptionalFiniteField(raw, "pExactPlus7"))
    : null;
  const pExactMinus7 = raw
    ? parseValidProb(readOptionalFiniteField(raw, "pExactMinus7"))
    : null;

  if (pOvertime === null) {
    const otRow = activeMarkets.find(
      (row) =>
        row.market.trim().toLowerCase() === "nfl_ot" &&
        row.selection.trim().toLowerCase() === "yes",
    );
    if (otRow) {
      pOvertime = parseValidProb(otRow.p);
      if (pOvertime !== null) {
        const rowFair = parseStrictFiniteNumber(otRow.fairDecimal);
        if (rowFair !== null && rowFair > 1) {
          fairOvertimeDecimal = rowFair;
        }
      }
    }
  }

  if (fairOvertimeDecimal !== null && fairOvertimeDecimal <= 1) {
    fairOvertimeDecimal = null;
  }

  const hasAny =
    pOvertime !== null ||
    (pExactPlus3 !== null && pExactMinus3 !== null) ||
    (pExactPlus7 !== null && pExactMinus7 !== null);
  if (!hasAny) return undefined;

  return {
    ...(expectedMargin !== null ? { expectedMargin } : {}),
    ...(pOvertime !== null ? { pOvertime } : {}),
    ...(fairOvertimeDecimal !== null ? { fairOvertimeDecimal } : {}),
    ...(pExactPlus3 !== null && pExactMinus3 !== null
      ? { pExactPlus3, pExactMinus3 }
      : {}),
    ...(pExactPlus7 !== null && pExactMinus7 !== null
      ? { pExactPlus7, pExactMinus7 }
      : {}),
  };
}

export function platformGameToSportOutlook(
  game: PlatformGame,
  detail?: PlatformGameDetail | null,
): SportOutlookInput | null {
  const sport = OUTLOOK_LEAGUE_TO_SPORT[String(game.league)];
  if (!sport || game.hasForecast === false || !game.projection || !game.x12) {
    return null;
  }

  const [rawHome, rawDrawOrOt, rawAway] = game.x12;
  if (
    !Number.isFinite(rawHome) ||
    !Number.isFinite(rawDrawOrOt) ||
    !Number.isFinite(rawAway)
  ) {
    return null;
  }

  let pHome = rawHome;
  let pAway = rawAway;
  let regSplit: { pHomeReg?: number; pOtReg?: number; pAwayReg?: number } = {};

  if (sport === "nhl" && rawDrawOrOt > 0.001) {
    regSplit = {
      pHomeReg: rawHome,
      pOtReg: rawDrawOrOt,
      pAwayReg: rawAway,
    };
    const probs = game.spacetime?.probs;
    if (
      probs &&
      Number.isFinite(probs.home) &&
      Number.isFinite(probs.away) &&
      Math.abs(probs.home + probs.away - 1) <= 0.02
    ) {
      pHome = probs.home;
      pAway = probs.away;
    } else {
      pHome = rawHome + rawDrawOrOt * 0.5;
      pAway = rawAway + rawDrawOrOt * 0.5;
    }
  } else if (game.spacetime?.probs) {
    const { home, away } = game.spacetime.probs;
    if (
      Number.isFinite(home) &&
      Number.isFinite(away) &&
      Math.abs(home + away - 1) <= 0.02
    ) {
      pHome = home;
      pAway = away;
    }
  }

  const activeMarkets =
    detail && detail.markets.length > 0 ? detail.markets : game.markets;
  const lines = mapLines(activeMarkets, sport);
  const confirmations = mapConfirmations(game, sport, detail);
  const drivers = mapDrivers(game, sport);
  const expectedPace = mapExpectedPace(game, sport, detail);
  const nflSpecials = mapNflSpecials(sport, activeMarkets, detail);
  const restHome = mapRestSide(game.restDays?.home);
  const restAway = mapRestSide(game.restDays?.away);
  const rest =
    restHome || restAway
      ? {
          ...(restHome ? { home: restHome } : {}),
          ...(restAway ? { away: restAway } : {}),
        }
      : undefined;

  const candidate: SportOutlookInput = {
    sport,
    homeTeam: game.home.name,
    awayTeam: game.away.name,
    pHome,
    pAway,
    ...regSplit,
    expectedHome: game.projection.home,
    expectedAway: game.projection.away,
    ...(expectedPace !== undefined ? { expectedPace } : {}),
    ...(nflSpecials ? { nflSpecials } : {}),
    drivers,
    ...(lines.length > 0 ? { lines } : {}),
    ...(confirmations.length > 0 ? { confirmations } : {}),
    ...(rest ? { rest } : {}),
    generatedAtUtc:
      detail?.outlook?.generatedAtUtc ?? game.spacetime?.market?.asOfUtc ?? "",
  };

  return isValidOutlook(candidate) ? candidate : null;
}
