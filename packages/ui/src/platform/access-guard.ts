import type {
  MatchPick,
  OddsFormat,
  PlatformDataset,
  PlatformGame,
  ViewerRole,
} from "./types";

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "yopmail.com",
  "trashmail.com",
  "sharklasers.com",
  "throwawaymail.com",
  "getnada.com",
  "temp-mail.org",
]);

const EXTERNAL_LINK_PATTERNS: readonly RegExp[] = [
  /https?:\/\//i,
  /\bwww\./i,
  /\bt\.me\b/i,
  /\bwa\.me\b/i,
  /\btelegram\b/i,
  /\bdiscord\.gg\b/i,
  /\bbit\.ly\b/i,
  /\bwhatsapp\.com\b/i,
];

/**
 * Regla Cero-Fuga (Q1, Q9, Q12):
 * Un visitante sin suscripción activa solo puede ver:
 * 1) Partidos finalizados auditables (FT)
 * 2) El único Pick Abierto promocional del día (isDailyOpenPromo)
 * 3) El único Pick Abierto Semanal del Tipstar (isTipstarWeeklyOpen)
 */
export function isPickUnlocked(
  pick: Pick<MatchPick, "isDailyOpenPromo" | "isTipstarWeeklyOpen" | "isRedacted">,
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
  return Boolean(pick.isDailyOpenPromo || pick.isTipstarWeeklyOpen);
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
  return game.picks.some((p) => p.isDailyOpenPromo || p.isTipstarWeeklyOpen);
}

/**
 * Regla Q12: Sellado de Share Card antes del inicio del partido.
 * - Un suscriptor regular que comparte un pick antes de iniciar (NS / LIVE) genera
 *   un boleto con la selección exacta sellada para evitar reventa en grupos externos.
 * - Un partido finalizado (FT) o el boleto semanal oficial de un Tipstar sí muestra la selección.
 */
export function canRevealPickOnShare(
  gameStatus: "NS" | "FT" | "LIVE",
  viewerRole: ViewerRole,
  isTipstarPromoShare: boolean,
): boolean {
  if (gameStatus === "FT") {
    return true;
  }
  if (isTipstarPromoShare && (viewerRole === "tipstar" || viewerRole === "admin")) {
    return true;
  }
  return false;
}

/**
 * Redacta en servidor (o en modo Visitante) todos los picks y radiografías bloqueados
 * para que ningún texto sensible llegue siquiera al DOM o al payload HTML público.
 */
export function redactDatasetForVisitor(
  dataset: PlatformDataset,
  extraUnlockedPickIds: ReadonlySet<string> = new Set(),
): PlatformDataset {
  const games: PlatformGame[] = dataset.games.map((game) => {
    if (game.status === "FT") {
      return game;
    }
    const hasOpenPick = game.picks.some(
      (p) => p.isDailyOpenPromo || p.isTipstarWeeklyOpen || extraUnlockedPickIds.has(p.id),
    );
    return {
      ...game,
      picks: game.picks.map((pick) => {
        const open =
          Boolean(pick.isDailyOpenPromo) ||
          Boolean(pick.isTipstarWeeklyOpen) ||
          extraUnlockedPickIds.has(pick.id);
        if (open) {
          return pick;
        }
        return {
          ...pick,
          selectionKey: "locked",
          label: "Selección reservada Pase PitchLab Ultra",
          rationale: "Activa tu prueba gratis de Pase PitchLab Ultra para desbloquear todos los picks del partido.",
          isRedacted: true,
        };
      }),
      preGame: hasOpenPick
        ? game.preGame
        : {
            ...game.preGame,
            cortexSynthesis:
              "Radiografía ejecutiva de PitchLab Cortex IA y reporte de bajas 60m reservados para socios con Pase PitchLab Ultra activo.",
            tacticalKeys: [
              "Síntesis cuantitativa bloqueada en vista visitante",
              "Reporte de convocatoria 60m protegido",
            ],
            absences: [],
            isRedacted: true,
          },
      markets: hasOpenPick ? game.markets.slice(0, 3) : [],
    };
  });

  return {
    ...dataset,
    games,
    isServerRedactedForVisitor: true,
  };
}

export function getSessionWatermark(
  viewerRole: ViewerRole,
  handle: string = "socio_pl",
): string {
  if (viewerRole === "visitor") {
    return "PITCHLAB · VISTA PREVIA";
  }
  if (viewerRole === "tipstar") {
    return `@sofia_nfl · TIPSTAR-8842`;
  }
  if (viewerRole === "admin") {
    return `@founder · ADMIN-0001`;
  }
  return `@${handle} · PL-8842`;
}

export function containsExternalLink(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  return EXTERNAL_LINK_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Normalización anti-abuso $0 MXN (Q8 / Q15):
 * - Elimina alias `+tag` y puntos en cuentas Gmail / Googlemail para impedir multicuentas.
 */
export function normalizeTrialEmail(rawEmail: string): string {
  const clean = rawEmail.trim().toLowerCase();
  const atIdx = clean.indexOf("@");
  if (atIdx <= 0) return clean;
  let local = clean.slice(0, atIdx);
  let domain = clean.slice(atIdx + 1);
  if (domain === "googlemail.com") {
    domain = "gmail.com";
  }
  const plusIdx = local.indexOf("+");
  if (plusIdx >= 0) {
    local = local.slice(0, plusIdx);
  }
  if (domain === "gmail.com") {
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

export function isDisposableEmailDomain(rawEmail: string): boolean {
  const clean = rawEmail.trim().toLowerCase();
  const atIdx = clean.indexOf("@");
  if (atIdx <= 0) return false;
  const domain = clean.slice(atIdx + 1);
  return DISPOSABLE_DOMAINS.has(domain);
}

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
  const settled = journal.filter((j) => j.status !== "pending");
  const netUnits = settled.reduce(
    (sum, j) => sum + (j.status === "won" ? j.units * (j.userDecimal - 1) : -j.units),
    0,
  );
  const avgClvPct =
    journal.length > 0 ? journal.reduce((s, j) => s + j.clvPct, 0) / journal.length : null;
  const units = `${netUnits >= 0 ? "+" : ""}${netUnits.toFixed(1)}u`;
  return {
    settled: settled.length,
    netUnits,
    avgClvPct,
    label: settled.length === 0 ? "Sin picks liquidados" : `${units} · ${settled.length} picks`,
  };
}
