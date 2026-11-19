import type {
  FrozenMainPickSnapshot,
  LineupAbsenceItem,
  MatchPick,
  PlatformGame,
  PreGameIntel,
  VerifiedMatchLineups,
} from "../../types";

/** El pick principal y su probabilidad se congelan exactamente 60 minutos antes del saque inicial. */
export const PRE_MATCH_FREEZE_WINDOW_MS = 60 * 60_000;

/** Ventana destacada previa al partido (24 h antes del saque inicial). */
export const PRE_MATCH_ACTIVE_HOURS_MS = 24 * 60 * 60_000;

export const DEFAULT_PRE_MATCH_TIMEZONE = "America/Mexico_City";

export const HONEST_NO_ABSENCES_COPY = "Sin bajas reportadas en nuestras fuentes";

export const CONFIRMED_LINEUP_OFF_BADGE = "Apagado";
export const CONFIRMED_LINEUP_OFF_COPY =
  "Se activa únicamente cuando exista una fuente oficial verificada. Nunca mostramos alineaciones probables.";

const CLIENT_FROZEN_STORAGE_KEY = "pl-frozen-picks-v1";
const ISO_NO_OFFSET_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

export type PreMatchFreezePhase = "before_freeze" | "frozen" | "match_started";

export interface PreMatchDisplayPick {
  pickId: string;
  label: string;
  categoryLabel: string;
  marketGroup: string;
  selectionKey: string;
  p: number;
  fairDecimal: number;
  fairAmerican: number;
}

export interface PreMatchFreezeResolution {
  phase: PreMatchFreezePhase;
  isFrozen: boolean;
  matchStarted: boolean;
  /** `true` cuando faltan 24 h o menos para el inicio (o durante la ventana congelada previa). */
  isWithinMatchdayHours: boolean;
  minutesUntilKickoff: number | null;
  minutesUntilFreeze: number | null;
  kickoffUtc: string;
  freezeAtUtc: string;
  freezeTimeLabel: string;
  kickoffTimeLabel: string;
  /** Sello visible: «Se congela a las 18:00» o «Congelado a las 18:00». */
  sealLabel: string;
  /** Pick principal vigente (si está congelado, proviene siempre del snapshot congelado). */
  pick: PreMatchDisplayPick | null;
  /** Snapshot inmutable que debe persistirse cuando `isFrozen` es `true`. */
  snapshotToPersist: FrozenMainPickSnapshot | null;
}

export interface ResolvePreMatchFreezeInput {
  game: Pick<PlatformGame, "id" | "kickoffUtc" | "status" | "picks">;
  now: Date | number;
  existingFrozen?: FrozenMainPickSnapshot | null;
  timeZone?: string;
}

export interface PreMatchAbsencesResolution {
  state: "locked" | "no_absences" | "with_absences";
  items: readonly LineupAbsenceItem[];
  honestEmptyLabel: string | null;
}

export interface ConfirmedLineupSlotResolution {
  enabled: boolean;
  statusBadge: string;
  helperText: string;
  lineups: VerifiedMatchLineups | null;
}

/**
 * Convierte una fecha ISO de inicio a milisegundos UTC de forma determinista.
 * Si el texto carece de sufijo `Z` u offset horario, se interpreta explícitamente como UTC.
 */
export function parseKickoffUtcMs(kickoffUtc: string): number {
  const trimmed = kickoffUtc.trim();
  if (!trimmed) return Number.NaN;
  const normalized = ISO_NO_OFFSET_RE.test(trimmed) ? `${trimmed}Z` : trimmed;
  return Date.parse(normalized);
}

/** Formatea una marca UTC en formato 24 h (`HH:mm`, ej. `"18:00"`) en la zona horaria dada. */
export function formatClockHour24(
  utcMs: number,
  timeZone: string = DEFAULT_PRE_MATCH_TIMEZONE,
): string {
  if (!Number.isFinite(utcMs)) return "--:--";
  const formatWithTz = (tz: string): string => {
    const parts = new Intl.DateTimeFormat("es-MX", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utcMs));
    const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  };
  try {
    return formatWithTz(timeZone || DEFAULT_PRE_MATCH_TIMEZONE);
  } catch (err) {
    void err;
    return formatWithTz(DEFAULT_PRE_MATCH_TIMEZONE);
  }
}

function toDisplayPickFromMatchPick(pick: MatchPick | undefined): PreMatchDisplayPick | null {
  if (!pick || pick.isRedacted || !(pick.p > 0 && pick.p < 1)) {
    return null;
  }
  return {
    pickId: pick.id,
    label: pick.label,
    categoryLabel: pick.categoryLabel,
    marketGroup: pick.marketGroup,
    selectionKey: pick.selectionKey,
    p: pick.p,
    fairDecimal: pick.fairDecimal,
    fairAmerican: pick.fairAmerican,
  };
}

function toDisplayPickFromFrozen(frozen: FrozenMainPickSnapshot): PreMatchDisplayPick {
  return {
    pickId: frozen.pickId,
    label: frozen.label,
    categoryLabel: frozen.categoryLabel,
    marketGroup: frozen.marketGroup,
    selectionKey: frozen.selectionKey,
    p: frozen.p,
    fairDecimal: frozen.fairDecimal,
    fairAmerican: frozen.fairAmerican,
  };
}

export function isValidFrozenSnapshot(
  value: unknown,
  expectedGameId?: string,
): value is FrozenMainPickSnapshot {
  const s = value as Partial<FrozenMainPickSnapshot> | null;
  if (!s || typeof s !== "object") return false;
  if (typeof s.gameId !== "string" || !s.gameId) return false;
  if (expectedGameId !== undefined && s.gameId !== expectedGameId) return false;
  return (
    typeof s.pickId === "string" &&
    s.pickId.length > 0 &&
    typeof s.label === "string" &&
    s.label.length > 0 &&
    typeof s.categoryLabel === "string" &&
    typeof s.marketGroup === "string" &&
    typeof s.selectionKey === "string" &&
    typeof s.p === "number" &&
    Number.isFinite(s.p) &&
    s.p > 0 &&
    s.p < 1 &&
    typeof s.fairDecimal === "number" &&
    Number.isFinite(s.fairDecimal) &&
    s.fairDecimal > 1 &&
    typeof s.fairAmerican === "number" &&
    Number.isFinite(s.fairAmerican) &&
    typeof s.kickoffUtc === "string" &&
    typeof s.freezeAtUtc === "string"
  );
}

/** Construye un snapshot congelado determinista a partir del pick principal del partido. */
export function createFrozenMainPickSnapshot(
  game: Pick<PlatformGame, "id" | "kickoffUtc" | "picks">,
): FrozenMainPickSnapshot | null {
  const kickoffMs = parseKickoffUtcMs(game.kickoffUtc);
  if (!Number.isFinite(kickoffMs)) return null;
  const main = toDisplayPickFromMatchPick(game.picks[0]);
  if (!main) return null;
  const freezeAtMs = kickoffMs - PRE_MATCH_FREEZE_WINDOW_MS;
  return {
    gameId: game.id,
    pickId: main.pickId,
    label: main.label,
    categoryLabel: main.categoryLabel,
    marketGroup: main.marketGroup,
    selectionKey: main.selectionKey,
    p: main.p,
    fairDecimal: main.fairDecimal,
    fairAmerican: main.fairAmerican,
    kickoffUtc: new Date(kickoffMs).toISOString(),
    freezeAtUtc: new Date(freezeAtMs).toISOString(),
  };
}

/**
 * Resuelve de manera pura y determinista el estado del pick principal antes, durante
 * y después de la ventana de congelado (60 min previos al saque inicial).
 *
 * Si `existingFrozen` existe para el partido y el reloj ya alcanzó `kickoff - 60 min`,
 * devuelve SIEMPRE los datos de `existingFrozen`, aunque `game.picks[0]` haya cambiado
 * por un recálculo posterior del motor.
 */
export function resolvePreMatchFreezeState(
  input: ResolvePreMatchFreezeInput,
): PreMatchFreezeResolution {
  const tz = input.timeZone || DEFAULT_PRE_MATCH_TIMEZONE;
  const nowMs = typeof input.now === "number" ? input.now : input.now.getTime();
  const kickoffMs = parseKickoffUtcMs(input.game.kickoffUtc);

  if (!Number.isFinite(kickoffMs)) {
    const livePick = toDisplayPickFromMatchPick(input.game.picks[0]);
    return {
      phase: input.game.status === "NS" ? "before_freeze" : "match_started",
      isFrozen: input.game.status !== "NS",
      matchStarted: input.game.status !== "NS",
      isWithinMatchdayHours: false,
      minutesUntilKickoff: null,
      minutesUntilFreeze: null,
      kickoffUtc: input.game.kickoffUtc,
      freezeAtUtc: input.game.kickoffUtc,
      freezeTimeLabel: "--:--",
      kickoffTimeLabel: "--:--",
      sealLabel: input.game.status === "NS" ? "Se congela a las --:--" : "Congelado a las --:--",
      pick: livePick,
      snapshotToPersist: null,
    };
  }

  const freezeAtMs = kickoffMs - PRE_MATCH_FREEZE_WINDOW_MS;
  const kickoffUtc = new Date(kickoffMs).toISOString();
  const freezeAtUtc = new Date(freezeAtMs).toISOString();
  const freezeTimeLabel = formatClockHour24(freezeAtMs, tz);
  const kickoffTimeLabel = formatClockHour24(kickoffMs, tz);

  const matchStarted = input.game.status !== "NS" || nowMs >= kickoffMs;
  const isFrozen = matchStarted || nowMs >= freezeAtMs;
  const phase: PreMatchFreezePhase = matchStarted
    ? "match_started"
    : isFrozen
      ? "frozen"
      : "before_freeze";

  const msToKickoff = kickoffMs - nowMs;
  const msToFreeze = freezeAtMs - nowMs;
  const minutesUntilKickoff = matchStarted ? 0 : Math.max(0, Math.ceil(msToKickoff / 60_000));
  const minutesUntilFreeze = isFrozen ? 0 : Math.max(0, Math.ceil(msToFreeze / 60_000));
  const isWithinMatchdayHours = !matchStarted && msToKickoff <= PRE_MATCH_ACTIVE_HOURS_MS;

  if (!isFrozen) {
    return {
      phase,
      isFrozen: false,
      matchStarted: false,
      isWithinMatchdayHours,
      minutesUntilKickoff,
      minutesUntilFreeze,
      kickoffUtc,
      freezeAtUtc,
      freezeTimeLabel,
      kickoffTimeLabel,
      sealLabel: `Se congela a las ${freezeTimeLabel}`,
      pick: toDisplayPickFromMatchPick(input.game.picks[0]),
      snapshotToPersist: null,
    };
  }

  const preserved = isValidFrozenSnapshot(input.existingFrozen, input.game.id)
    ? input.existingFrozen
    : createFrozenMainPickSnapshot(input.game);

  return {
    phase,
    isFrozen: true,
    matchStarted,
    isWithinMatchdayHours,
    minutesUntilKickoff,
    minutesUntilFreeze: 0,
    kickoffUtc,
    freezeAtUtc,
    freezeTimeLabel,
    kickoffTimeLabel,
    sealLabel: `Congelado a las ${freezeTimeLabel}`,
    pick: preserved ? toDisplayPickFromFrozen(preserved) : null,
    snapshotToPersist: preserved,
  };
}

/** Resuelve las bajas reportadas sin inventar nunca ausencias cuando no hay datos. */
export function resolvePreMatchAbsencesState(
  game: Pick<PlatformGame, "preGame">,
  intelUnlocked: boolean,
): PreMatchAbsencesResolution {
  if (!intelUnlocked || game.preGame.isRedacted) {
    return {
      state: "locked",
      items: [],
      honestEmptyLabel: null,
    };
  }
  const reported = game.preGame.absences.filter(
    (item) => Boolean(item.player.trim()) && item.status !== "Confirmado XI",
  );
  if (reported.length === 0) {
    return {
      state: "no_absences",
      items: [],
      honestEmptyLabel: HONEST_NO_ABSENCES_COPY,
    };
  }
  return {
    state: "with_absences",
    items: reported,
    honestEmptyLabel: null,
  };
}

/**
 * Ranura «Alineación confirmada»: permanece APAGADA salvo que exista una fuente
 * real y verificada con once titular completo para ambos equipos.
 */
export function resolveConfirmedLineupSlotState(
  preGame: PreGameIntel,
  intelUnlocked: boolean,
): ConfirmedLineupSlotResolution {
  const verified = preGame.confirmedLineups ?? null;
  const hasRealVerifiedSource =
    intelUnlocked &&
    !preGame.isRedacted &&
    preGame.lineupsConfirmed60m === true &&
    verified !== null &&
    Boolean(verified.sourceLabel.trim()) &&
    Boolean(verified.verifiedAtUtc.trim()) &&
    Number.isFinite(Date.parse(verified.verifiedAtUtc)) &&
    verified.homeStarters.length >= 11 &&
    verified.awayStarters.length >= 11;

  if (!hasRealVerifiedSource || !verified) {
    return {
      enabled: false,
      statusBadge: CONFIRMED_LINEUP_OFF_BADGE,
      helperText: CONFIRMED_LINEUP_OFF_COPY,
      lineups: null,
    };
  }

  return {
    enabled: true,
    statusBadge: `Verificada · ${verified.sourceLabel.trim()}`,
    helperText: "Once titular oficial verificado antes del saque inicial.",
    lineups: verified,
  };
}

export interface ProbableLineupSlotResolution {
  readonly available: boolean;
  readonly statusBadge: string;
  readonly helperText: string;
  readonly lineups: VerifiedMatchLineups | null;
}

/**
 * Once estimado cuando aún falta la confirmación oficial 60 min antes.
 * Se oculta automáticamente en cuanto entra la alineación oficial o si el acceso está bloqueado.
 */
export function resolveProbableLineupSlotState(
  preGame: PreGameIntel,
  intelUnlocked: boolean,
): ProbableLineupSlotResolution | null {
  const confirmed = resolveConfirmedLineupSlotState(preGame, intelUnlocked);
  if (confirmed.enabled) return null;
  const probable = preGame.probableLineups ?? null;
  const hasProbable =
    intelUnlocked &&
    !preGame.isRedacted &&
    probable !== null &&
    Boolean(probable.sourceLabel.trim()) &&
    probable.homeStarters.length >= 11 &&
    probable.awayStarters.length >= 11;

  if (!hasProbable || !probable) return null;
  const confText =
    probable.confidence != null ? ` · Confianza ${Math.round(probable.confidence)} %` : "";
  return {
    available: true,
    statusBadge: `Once estimado${confText}`,
    helperText: `${probable.sourceLabel.trim()} · Sujeto a confirmación oficial 60 min antes.`,
    lineups: probable,
  };
}

/** Lee un pick congelado guardado localmente en el navegador para este partido (respaldo cliente). */
export function readClientFrozenPick(gameId: string): FrozenMainPickSnapshot | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(CLIENT_FROZEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = (parsed as Record<string, unknown>)[gameId];
    return isValidFrozenSnapshot(candidate, gameId) ? candidate : null;
  } catch (err) {
    void err;
    return null;
  }
}

/** Guarda en el navegador el pick congelado la primera vez que se cruza `T - 60 min` (nunca sobreescribe). */
export function saveClientFrozenPick(snapshot: FrozenMainPickSnapshot): FrozenMainPickSnapshot {
  try {
    if (typeof window === "undefined") return snapshot;
    const raw = window.localStorage.getItem(CLIENT_FROZEN_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    const map: Record<string, FrozenMainPickSnapshot> =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? { ...(parsed as Record<string, FrozenMainPickSnapshot>) }
        : {};
    const existing = map[snapshot.gameId];
    if (isValidFrozenSnapshot(existing, snapshot.gameId)) {
      return existing;
    }
    const keys = Object.keys(map);
    if (keys.length >= 80) {
      for (const oldKey of keys.slice(0, keys.length - 79)) {
        delete map[oldKey];
      }
    }
    map[snapshot.gameId] = snapshot;
    window.localStorage.setItem(CLIENT_FROZEN_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    void err;
  }
  return snapshot;
}

const INJURY_ES_MAP: Readonly<Record<string, string>> = {
  "hip injury": "Lesión de cadera",
  "cruciate ligament injury": "Lesión de ligamento cruzado",
  "cruciate ligament tear": "Rotura de ligamento cruzado",
  "acl injury": "Lesión de ligamento cruzado (LCA)",
  "hamstring injury": "Lesión de isquiotibiales",
  "knee injury": "Lesión de rodilla",
  "sprained knee": "Esguince de rodilla",
  "sprained ankle": "Esguince de tobillo",
  "ankle injury": "Lesión de tobillo",
  "muscle injury": "Lesión muscular",
  "muscular problems": "Molestias musculares",
  "thigh injury": "Lesión de muslo",
  "calf injury": "Lesión de gemelo",
  "groin injury": "Lesión inguinal",
  "adductor problems": "Molestias en aductor",
  "back injury": "Lesión de espalda",
  "shoulder injury": "Lesión de hombro",
  "foot injury": "Lesión de pie",
  "achilles tendon injury": "Lesión del tendón de Aquiles",
  "meniscus injury": "Lesión de menisco",
  "broken leg": "Fractura de pierna",
  "broken foot": "Fractura de pie",
  "broken toe": "Fractura en dedo del pie",
  "broken nose": "Fractura nasal",
  "concussion": "Conmoción cerebral",
  "illness": "Enfermedad",
  "unknown injury": "Lesión no especificada",
  "knock": "Golpe / contusión",
  "suspended": "Suspendido",
  "red card suspension": "Suspensión por roja",
  "yellow card suspension": "Acumulación de amarillas",
  "inactive": "Inactivo",
  "doubtful": "En duda",
  "questionable": "En duda",
  "out": "Baja confirmada",
};

/** Traduce descripciones médicas frecuentes en inglés a español limpio para la UI. */
export function localizeInjuryLabelEs(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const exact = INJURY_ES_MAP[trimmed.toLowerCase()];
  if (exact) return exact;
  return trimmed
    .replace(/\bSprained\s+Knee\b/gi, "Esguince de rodilla")
    .replace(/\bSprained\s+Ankle\b/gi, "Esguince de tobillo")
    .replace(/\bKnee\s+Injury\b/gi, "Lesión de rodilla")
    .replace(/\bAnkle\s+Injury\b/gi, "Lesión de tobillo")
    .replace(/\bInjury\b/gi, "lesión")
    .replace(/\bSuspended\b/gi, "Suspendido")
    .replace(/\bIllness\b/gi, "Enfermedad");
}
