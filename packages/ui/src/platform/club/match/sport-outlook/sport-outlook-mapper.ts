import type {
  PlatformGame,
  PlatformGameDetail,
  PlatformMarketRow,
} from "../../../types";
import type {
  OutlookSport,
  SportConfirmation,
  SportOutlookInput,
  SportOutlookLine,
  SportRestInfo,
} from "./sport-outlook-types";
import { isValidOutlook } from "./sport-outlook-logic";

const OUTLOOK_LEAGUE_TO_SPORT: Record<string, OutlookSport | undefined> = {
  nba: "nba",
  nhl: "nhl",
  mlb: "mlb",
};

function mapRestSide(days: number | undefined): SportRestInfo | undefined {
  if (typeof days !== "number" || !Number.isFinite(days) || days < 0) return undefined;
  return days === 0 ? { restDays: 0, backToBack: true } : { restDays: days };
}

function mapLines(markets: readonly PlatformMarketRow[]): SportOutlookLine[] {
  const lines: SportOutlookLine[] = [];

  const totalRow = markets.find(
    (m) =>
      m.market === "totals" &&
      m.selection === "over" &&
      typeof m.line === "number" &&
      Number.isFinite(m.line) &&
      Number.isFinite(m.p),
  );
  if (totalRow && typeof totalRow.line === "number") {
    lines.push({ kind: "total", line: totalRow.line, p: totalRow.p });
  }

  const spreadRow = markets.find(
    (m) =>
      m.market === "spreads" &&
      m.selection === "home" &&
      typeof m.line === "number" &&
      Number.isFinite(m.line) &&
      Number.isFinite(m.p),
  );
  if (spreadRow && typeof spreadRow.line === "number") {
    lines.push({ kind: "spread", line: spreadRow.line, p: spreadRow.p });
  }

  return lines;
}

function mapConfirmations(game: PlatformGame): SportConfirmation[] {
  const out: SportConfirmation[] = [];
  for (const item of game.preGame.absences) {
    if (!item.player?.trim()) continue;
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

/**
 * Convierte un `PlatformGame` multideporte (NBA/NHL) al contrato estricto `SportOutlookInput`
 * sin inventar valores ausentes (Cero-Fuga / ADR-027). Devuelve `null` para fútbol/NFL o si
 * el partido todavía no tiene proyección o probabilidades válidas en el snapshot.
 */
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
    if (Number.isFinite(home) && Number.isFinite(away) && Math.abs(home + away - 1) <= 0.02) {
      pHome = home;
      pAway = away;
    }
  }

  const activeMarkets =
    detail && detail.markets.length > 0 ? detail.markets : game.markets;
  const lines = mapLines(activeMarkets);
  const confirmations = mapConfirmations(game);
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
    drivers: [],
    ...(lines.length > 0 ? { lines } : {}),
    ...(confirmations.length > 0 ? { confirmations } : {}),
    ...(rest ? { rest } : {}),
    generatedAtUtc:
      detail?.outlook?.generatedAtUtc ?? game.spacetime?.market?.asOfUtc ?? "",
  };

  return isValidOutlook(candidate) ? candidate : null;
}
