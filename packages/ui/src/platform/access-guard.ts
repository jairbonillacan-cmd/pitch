import type {
  MatchPick,
  OddsFormat,
  PlatformDataset,
  PlatformGame,
  ViewerRole,
} from "./types";
import { profileRecord } from "./profile-stats";

/**
 * Regla Cero-Fuga (Q1, Q9, Q12):
 * Un visitante sin suscripción activa solo puede ver:
 * 1) Partidos finalizados auditables (FT)
 * 2) El único Pick Abierto promocional del día (isDailyOpenPromo)
 * 3) El único Pick Abierto Semanal del Tipster (isTipsterWeeklyOpen)
 */
export function isPickUnlocked(
  pick: Pick<MatchPick, "isDailyOpenPromo" | "isTipsterWeeklyOpen" | "isRedacted">,
  gameStatus: "NS" | "FT" | "LIVE",
  viewerRole: ViewerRole,
): boolean {
  if (pick.isRedacted) {
    return false;
  }
  if (gameStatus === "FT") {
    return true;
  }
  if (viewerRole !== "visitor") {
    return true;
  }
  return Boolean(pick.isDailyOpenPromo || pick.isTipsterWeeklyOpen);
}

/**
 * ¿Puede ver la radiografía previa Cortex IA y el pulso de dinero de un juego por jugarse?
 */
export function isPreGameIntelUnlocked(
  game: Pick<PlatformGame, "status" | "picks" | "preGame">,
  viewerRole: ViewerRole,
): boolean {
  if (game.preGame.isRedacted) {
    return false;
  }
  if (game.status === "FT") {
    return true;
  }
  if (viewerRole !== "visitor") {
    return true;
  }
  return game.picks.some((p) => p.isDailyOpenPromo || p.isTipsterWeeklyOpen);
}

/**
 * Regla Q12: Sellado de Share Card antes del inicio del partido.
 * - Un suscriptor regular que comparte un pick antes de iniciar (NS / LIVE) genera
 *   un boleto con la selección exacta sellada para evitar reventa en grupos externos.
 * - Un partido finalizado (FT) o el boleto semanal oficial de un Tipster sí muestra la selección.
 */
export function canRevealPickOnShare(
  gameStatus: "NS" | "FT" | "LIVE",
  viewerRole: ViewerRole,
  isTipsterPromoShare: boolean,
): boolean {
  if (gameStatus === "FT") {
    return true;
  }
  if (isTipsterPromoShare && (viewerRole === "tipster" || viewerRole === "admin")) {
    return true;
  }
  return false;
}

function pickVisitorHeroShowcaseIds(games: readonly PlatformGame[]): Set<string> {
  const byLeague = new Map<string, PlatformGame[]>();
  for (const g of games) {
    const bucket = byLeague.get(g.league);
    if (bucket) bucket.push(g);
    else byLeague.set(g.league, [g]);
  }
  const ids = new Set<string>();
  for (const [league, leagueGames] of byLeague) {
    const upcoming = leagueGames.filter((g) => g.status !== "FT");
    const pool = upcoming.length > 0 ? upcoming : leagueGames;
    let chosen: PlatformGame | undefined;
    if (league === "liga-mx") {
      chosen = pool.find(
        (g) =>
          (g.home.slug.includes("queretaro") || g.home.name.includes("Querétaro")) &&
          (g.away.slug.includes("monterrey") || g.away.name.includes("Monterrey")),
      );
    } else if (league === "nfl") {
      chosen = pool.find(
        (g) =>
          (g.home.slug.includes("giants") || g.home.name.includes("Giants")) &&
          (g.away.slug.includes("commanders") ||
            g.away.slug.includes("washington") ||
            g.away.name.includes("Washington")),
      );
    }
    chosen ??= pool[0];
    if (chosen) ids.add(chosen.id);
  }
  return ids;
}

/**
 * Redacta en servidor (o en modo Visitante) todos los picks y radiografías bloqueados
 * para que ningún dato sensible (probabilidad, momio justo/mercado, ventaja, lado o señal
 * interna de Spacetime) llegue al DOM ni al payload RSC/HTML público.
 */
export function redactDatasetForVisitor(
  dataset: PlatformDataset,
  extraUnlockedPickIds: ReadonlySet<string> = new Set(),
  extraTipsterSlugsByPickId?: ReadonlyMap<string, string>,
): PlatformDataset {
  const heroShowcaseIds = pickVisitorHeroShowcaseIds(dataset.games);
  const games: PlatformGame[] = dataset.games.map((game) => {
    if (game.status === "FT") {
      return game;
    }
    const hasPromoOpenPick = game.picks.some(
      (p) => Boolean(p.isDailyOpenPromo) || Boolean(p.isTipsterWeeklyOpen),
    );
    const keepHeroProjection = hasPromoOpenPick || heroShowcaseIds.has(game.id);
    return {
      id: game.id,
      league: game.league,
      leagueLabel: game.leagueLabel,
      sport: game.sport,
      round: game.round,
      dayId: game.dayId,
      dayLabel: game.dayLabel,
      kickoffUtc: game.kickoffUtc,
      kickoffLocal: game.kickoffLocal,
      venue: game.venue,
      status: game.status,
      ...(game.score ? { score: game.score } : {}),
      home: game.home,
      away: game.away,
      x12: game.x12,
      projection: keepHeroProjection
        ? game.projection
        : { home: 0, away: 0, total: 0 },
      confidenceScore: hasPromoOpenPick ? game.confidenceScore : 0,
      confidenceLevel: hasPromoOpenPick ? game.confidenceLevel : "media",
      picks: game.picks.map((pick) => {
        const extraSlug = extraTipsterSlugsByPickId?.get(pick.id);
        const open =
          Boolean(pick.isDailyOpenPromo) ||
          Boolean(pick.isTipsterWeeklyOpen) ||
          extraUnlockedPickIds.has(pick.id);
        if (open) {
          return extraSlug
            ? { ...pick, isTipsterWeeklyOpen: true, tipsterSlug: extraSlug, isRedacted: false }
            : pick;
        }
        return {
          id: pick.id,
          gameId: pick.gameId,
          league: pick.league,
          leagueLabel: pick.leagueLabel,
          matchLabel: pick.matchLabel,
          kickoffLocal: pick.kickoffLocal,
          gameStatus: pick.gameStatus,
          slotIndex: pick.slotIndex,
          category: pick.category,
          categoryLabel: pick.categoryLabel,
          risk: "medio",
          engineKey: "singularity",
          engineName: "PitchLab Spacetime Suite",
          marketGroup: "locked",
          selectionKey: "locked",
          conflictGroup: "independent",
          label: "Selección reservada Pase PitchLab Ultra",
          rationale:
            "Activa tu prueba gratis de Pase PitchLab Ultra para desbloquear todos los picks del partido.",
          p: 0,
          fairDecimal: 0,
          fairAmerican: 0,
          marketDecimal: null,
          marketAmerican: null,
          edgePts: null,
          confidenceScore: 0,
          suggestedUnits: 0,
          result: null,
          isDailyOpenPromo: false,
          isTipsterWeeklyOpen: false,
          isRedacted: true,
        };
      }),
      preGame: hasPromoOpenPick
        ? {
            cortexSynthesis: game.preGame.cortexSynthesis,
            tacticalKeys: game.preGame.tacticalKeys,
            lineupStatusLabel: game.preGame.lineupStatusLabel,
            lineupsConfirmed60m: false,
            absences: [],
            moneyFlow: null,
            isRedacted: false,
          }
        : {
            cortexSynthesis:
              "Radiografía ejecutiva de PitchLab Cortex IA y reporte de bajas 60m reservados para socios con Pase PitchLab Ultra activo.",
            tacticalKeys: [
              "Síntesis cuantitativa bloqueada en vista visitante",
              "Reporte de convocatoria 60m protegido",
            ],
            lineupStatusLabel: "Convocatoria 60m reservada",
            lineupsConfirmed60m: false,
            absences: [],
            moneyFlow: null,
            isRedacted: true,
          },
      markets: [],
      factors: [],
      headToHead: game.headToHead,
      ...(game.restDays ? { restDays: game.restDays } : {}),
      updatedAtLabel: game.updatedAtLabel,
      spacetime: null,
    };
  });

  return {
    generatedAt: dataset.generatedAt,
    leagues: dataset.leagues,
    games,
    dailyPromoPickId: dataset.dailyPromoPickId,
    tipsterWeeklyPickId: dataset.tipsterWeeklyPickId,
    tipsterWeeklySlug: dataset.tipsterWeeklySlug,
    isServerRedactedForVisitor: true,
  };
}

/** Quién ve la pantalla, para la marca contra filtraciones. */
export interface WatermarkIdentity {
  handle: string;
  /** Código único del socio (su código de invitación); sirve de huella. */
  referralCode?: string | null;
}

/**
 * Marca de la sesión: `@usuario · CÓDIGO` con cuenta. Con el PIN de la beta no hay
 * identidad, así que la marca solo dice que es una vista de socio.
 */
export function getSessionWatermark(
  viewerRole: ViewerRole,
  identity: WatermarkIdentity | null = null,
): string {
  if (viewerRole === "visitor") return "PITCHLAB · VISTA PREVIA";
  if (identity) {
    const code = identity.referralCode?.trim();
    return code ? `@${identity.handle} · ${code}` : `@${identity.handle}`;
  }
  return "PITCHLAB · SOCIO BETA";
}

const ZW_ZERO = "​";
const ZW_ONE = "‌";
const ZW_EDGE = "⁠";

/**
 * Huella invisible: el texto en binario con caracteres de ancho cero, entre dos separadores.
 * Viaja con el texto copiado aunque se borre la línea visible de atribución.
 */
export function encodeForensicTag(text: string): string {
  const bits = Array.from(new TextEncoder().encode(text))
    .map((b) => b.toString(2).padStart(8, "0"))
    .join("");
  return ZW_EDGE + bits.replace(/0/g, ZW_ZERO).replace(/1/g, ZW_ONE) + ZW_EDGE;
}

/** Recupera la huella de un texto copiado (o `null` si no trae). */
export function decodeForensicTag(text: string): string | null {
  const m = new RegExp(`${ZW_EDGE}([${ZW_ZERO}${ZW_ONE}]+)${ZW_EDGE}`).exec(text);
  if (!m || m[1]!.length % 8 !== 0) return null;
  const bits = m[1]!.replace(new RegExp(ZW_ZERO, "g"), "0").replace(new RegExp(ZW_ONE, "g"), "1");
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return new TextDecoder().decode(bytes);
}

export { containsExternalLink, isDisposableEmailDomain, normalizeTrialEmail } from "@pitchlab/contracts";

export function formatOddsValue(
  decimalOdds: number,
  format: OddsFormat,
): string {
  const safeDec = Math.max(1.02, decimalOdds);
  if (format === "decimal") {
    return safeDec.toFixed(2);
  }
  if (safeDec >= 2.0) {
    const am = Math.round((safeDec - 1) * 100);
    return `+${am}`;
  }
  const am = Math.round(-100 / (safeDec - 1));
  return `${am}`;
}

export function decimalToAmericanInt(decimalOdds: number): number {
  const safeDec = Math.max(1.02, decimalOdds);
  if (safeDec >= 2.0) {
    return Math.round((safeDec - 1) * 100);
  }
  return Math.round(-100 / (safeDec - 1));
}

/**
 * Momio de referencia de un pick: el real de casa si existe; si no, el momio justo del modelo.
 * Sirve para cálculos (parlays, bitácora); en pantalla se debe distinguir con `hasBookOdds`.
 */
export function pickReferenceDecimal(pick: {
  marketDecimal: number | null;
  fairDecimal: number;
}): number {
  return pick.marketDecimal ?? pick.fairDecimal;
}

export function hasBookOdds(pick: { marketDecimal: number | null }): boolean {
  return pick.marketDecimal !== null;
}

/** Texto de ventaja en puntos o "Sin momio" cuando no hay mercado verificado. */
export function formatEdgePts(edgePts: number | null): string {
  if (edgePts === null) return "Sin momio";
  return `${edgePts >= 0 ? "+" : ""}${edgePts.toFixed(1)} pts`;
}

/** Récord real de la Bitácora: unidades netas y picks liquidados. */
export function journalRecord(
  journal: ReadonlyArray<{ status: "pending" | "won" | "lost"; units: number; userDecimal: number; clvPct: number }>,
): { settled: number; netUnits: number; avgClvPct: number | null; label: string } {
  const { settled, netUnits, avgClvPct } = profileRecord(journal);
  const units = `${netUnits >= 0 ? "+" : ""}${netUnits.toFixed(1)}u`;
  return {
    settled,
    netUnits,
    avgClvPct,
    label: settled === 0 ? "Sin picks liquidados" : `${units} · ${settled} picks`,
  };
}
