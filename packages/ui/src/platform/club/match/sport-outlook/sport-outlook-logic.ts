/**
 * Lógica pura del «Panorama por deporte»: valida lo que manda el motor y lo traduce a
 * texto claro. Sin React, sin datos inventados y sin nombres de fórmulas ni proveedores
 * (FD-16): las etiquetas técnicas de `MultiSportDriver.label` nunca llegan a la UI.
 */
import type {
  ConfirmationKind,
  ConfirmationStatus,
  OutlookSport,
  SportConfirmation,
  SportOutlookDriver,
  SportOutlookInput,
  SportOutlookLine,
  SportRestInfo,
  TeamSide,
} from "./sport-outlook-types";

export const SPORT_LABEL: Record<OutlookSport, string> = {
  nhl: "Hockey · NHL",
  mlb: "Béisbol · MLB",
  nba: "Basquetbol · NBA",
  ncaaf: "Futbol americano colegial",
};

const UNIT: Record<OutlookSport, { one: string; many: string }> = {
  nhl: { one: "gol", many: "goles" },
  mlb: { one: "carrera", many: "carreras" },
  nba: { one: "punto", many: "puntos" },
  ncaaf: { one: "punto", many: "puntos" },
};

/** Debajo de este margen esperado un factor se lee como «sin ventaja clara». */
const NEUTRAL_UNITS: Record<OutlookSport, number> = {
  nhl: 0.05,
  mlb: 0.05,
  nba: 0.3,
  ncaaf: 0.3,
};

/** Nombres claros de cada factor de los motores multideporte. */
export const DRIVER_COPY: Readonly<Record<string, string>> = {
  even_strength_xg_possession: "Calidad de sus tiros a 5 contra 5",
  starting_goalie_matchup: "Duelo de porteros",
  skater_injuries: "Bajas",
  home_ice_and_altitude: "Localía y altura",
  fip_woba_pythag_structure: "Pitcheo y bateo de la temporada",
  starting_pitcher_matchup: "Duelo de abridores",
  park_barometric_and_weather: "Estadio y clima",
  roster_injuries: "Bajas en lineup y bullpen",
  net_rtg_srs_four_factors: "Nivel de juego en la temporada",
  nba_hca_and_altitude: "Localía y altura",
  rotation_injuries: "Bajas en la rotación",
  fpi_srs_sos_ypp_power: "Nivel del equipo y dificultad de su calendario",
  cfb_hfa_and_altitude_shock: "Localía y altura",
  open_meteo_wind_precip: "Viento y lluvia",
  cfb_roster_injuries: "Bajas (incluido el quarterback)",
};

const FALLBACK_DRIVER = "Otro factor del modelo";

export function unitWord(sport: OutlookSport, value: number): string {
  return Math.abs(value) === 1 ? UNIT[sport].one : UNIT[sport].many;
}

/** «55.8 %» con espacio, como pide el sistema de diseño. */
export function pctText(p: number, decimals = 1): string {
  return `${(p * 100).toFixed(decimals)} %`;
}

/** Números con signo tipográfico real: «−1.5», «+1.5». */
export function signedText(value: number, decimals = 1): string {
  const abs = Math.abs(value).toFixed(decimals);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

const isProb = (p: unknown): p is number =>
  typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1;

const SUM_TOLERANCE = 0.02;

/**
 * `true` si el panorama se puede mostrar: probabilidades entre 0 y 1 que suman 1,
 * marcador esperado finito y no negativo. Si no, la tarjeta muestra su estado vacío.
 */
export function isValidOutlook(input: SportOutlookInput): boolean {
  if (!isProb(input.pHome) || !isProb(input.pAway)) return false;
  if (Math.abs(input.pHome + input.pAway - 1) > SUM_TOLERANCE) return false;
  if (!Number.isFinite(input.expectedHome) || input.expectedHome < 0) return false;
  if (!Number.isFinite(input.expectedAway) || input.expectedAway < 0) return false;
  if (!input.homeTeam.trim() || !input.awayTeam.trim()) return false;
  return true;
}

export interface WinnerSegment {
  readonly label: string;
  readonly p: number;
}

/**
 * Segmentos de la barra de ganador. En NHL, si el motor manda el reparto en tiempo
 * regular, son tres: local en regular · tiempo extra o penales · visita en regular.
 */
export function winnerSegments(input: SportOutlookInput): WinnerSegment[] {
  const { pHomeReg, pOtReg, pAwayReg } = input;
  if (
    input.sport === "nhl" &&
    isProb(pHomeReg) &&
    isProb(pOtReg) &&
    isProb(pAwayReg) &&
    Math.abs(pHomeReg + pOtReg + pAwayReg - 1) <= SUM_TOLERANCE
  ) {
    return [
      { label: `${input.homeTeam} en tiempo regular`, p: pHomeReg },
      { label: "Tiempo extra o penales", p: pOtReg },
      { label: `${input.awayTeam} en tiempo regular`, p: pAwayReg },
    ];
  }
  return [
    { label: input.homeTeam, p: input.pHome },
    { label: input.awayTeam, p: input.pAway },
  ];
}

export function favoriteOf(input: SportOutlookInput): {
  side: TeamSide;
  team: string;
  p: number;
} {
  return input.pHome >= input.pAway
    ? { side: "home", team: input.homeTeam, p: input.pHome }
    : { side: "away", team: input.awayTeam, p: input.pAway };
}

/** Marcador esperado: un decimal en NHL y MLB, enteros en NBA y NCAAF. */
export function projectedScore(input: SportOutlookInput): {
  home: string;
  away: string;
} {
  const decimals = input.sport === "nhl" || input.sport === "mlb" ? 1 : 0;
  return {
    home: input.expectedHome.toFixed(decimals),
    away: input.expectedAway.toFixed(decimals),
  };
}

/** «Edmonton por 0.4 goles» o «Partido parejo» si la diferencia es mínima. */
export function marginText(input: SportOutlookInput): string {
  const margin = input.expectedHome - input.expectedAway;
  if (Math.abs(margin) < NEUTRAL_UNITS[input.sport]) return "Partido parejo";
  const team = margin > 0 ? input.homeTeam : input.awayTeam;
  const value = Math.abs(margin);
  return `${team} por ${value.toFixed(1)} ${unitWord(input.sport, value)}`;
}

export function totalText(input: SportOutlookInput): string {
  const total = input.expectedHome + input.expectedAway;
  const decimals = input.sport === "nhl" || input.sport === "mlb" ? 1 : 0;
  return `${total.toFixed(decimals)} ${UNIT[input.sport].many} en total`;
}

export interface DriverView {
  readonly factor: string;
  readonly label: string;
  /** `null` cuando el factor no inclina el partido. */
  readonly favors: TeamSide | null;
  readonly text: string;
}

/** Los factores que más pesan, en lenguaje claro, ordenados por impacto. */
export function topDrivers(input: SportOutlookInput, limit = 3): DriverView[] {
  return [...input.drivers]
    .filter(
      (d: SportOutlookDriver) =>
        Number.isFinite(d.impactLogit) && Number.isFinite(d.impactUnits),
    )
    .sort((a, b) => Math.abs(b.impactLogit) - Math.abs(a.impactLogit))
    .slice(0, limit)
    .map((d) => {
      const label = DRIVER_COPY[d.factor] ?? FALLBACK_DRIVER;
      const units = Math.abs(d.impactUnits);
      if (units < NEUTRAL_UNITS[input.sport]) {
        return { factor: d.factor, label, favors: null, text: "Sin ventaja clara" };
      }
      const favors: TeamSide = d.impactUnits > 0 ? "home" : "away";
      const team = favors === "home" ? input.homeTeam : input.awayTeam;
      return {
        factor: d.factor,
        label,
        favors,
        text: `${team} · ${signedText(units)} ${unitWord(input.sport, units)}`,
      };
    });
}

export interface LineOption {
  readonly label: string;
  readonly p: number;
}

export interface LineView {
  readonly kind: SportOutlookLine["kind"];
  readonly title: string;
  readonly options: readonly LineOption[];
}

function lineTitle(sport: OutlookSport, kind: SportOutlookLine["kind"]): string {
  switch (kind) {
    case "total":
      return `Total de ${UNIT[sport].many}`;
    case "spread":
      return "Hándicap";
    case "first5_winner":
      return "Primeras 5 entradas · ganador";
    case "first5_total":
      return "Primeras 5 entradas · carreras";
  }
}

/**
 * Convierte las líneas del motor en opciones legibles. Descarta las que no tienen
 * sentido para el deporte (primeras 5 entradas fuera de MLB) o con probabilidad inválida.
 */
export function lineViews(input: SportOutlookInput): LineView[] {
  const lines = input.lines ?? [];
  const views: LineView[] = [];
  for (const line of lines) {
    if (!isProb(line.p) || !Number.isFinite(line.line)) continue;
    const isFirst5 = line.kind === "first5_total" || line.kind === "first5_winner";
    if (isFirst5 && input.sport !== "mlb") continue;

    const title = lineTitle(input.sport, line.kind);
    const lineAbs = Math.abs(line.line).toFixed(1);
    const unit = UNIT[input.sport].many;
    let options: LineOption[];
    switch (line.kind) {
      case "total":
        options = [
          { label: `Más de ${lineAbs} ${unit}`, p: line.p },
          { label: `Menos de ${lineAbs} ${unit}`, p: 1 - line.p },
        ];
        break;
      case "first5_total":
        options = [
          { label: `Más de ${lineAbs} carreras`, p: line.p },
          { label: `Menos de ${lineAbs} carreras`, p: 1 - line.p },
        ];
        break;
      case "spread":
        options = [
          { label: `${input.homeTeam} ${signedText(line.line)}`, p: line.p },
          { label: `${input.awayTeam} ${signedText(-line.line)}`, p: 1 - line.p },
        ];
        break;
      case "first5_winner":
        options = [
          { label: input.homeTeam, p: line.p },
          { label: input.awayTeam, p: 1 - line.p },
        ];
        break;
    }
    views.push({ kind: line.kind, title, options });
  }
  return views;
}

export type ConfirmationTone = "ok" | "info" | "muted" | "warning" | "danger";

export interface ConfirmationView {
  readonly key: string;
  readonly team: TeamSide;
  readonly title: string;
  readonly detail: string | null;
  readonly tone: ConfirmationTone;
}

const KIND_NOUN: Record<Exclude<ConfirmationKind, "key_player">, string> = {
  goalie: "Portero",
  starting_pitcher: "Abridor",
  lineup: "Lineup",
};

/** Cuándo suele confirmarse cada dato, para el estado «por confirmar». */
const PENDING_HINT: Record<ConfirmationKind, string> = {
  goalie: "Suele confirmarse la mañana del partido",
  starting_pitcher: "Suele anunciarse uno o dos días antes",
  lineup: "Suele publicarse una hora antes",
  key_player: "Su estatus se actualiza antes del partido",
};

const STATUS_TONE: Record<ConfirmationStatus, ConfirmationTone> = {
  confirmed: "ok",
  probable: "info",
  pending: "muted",
  questionable: "warning",
  out: "danger",
};

function statusWord(kind: ConfirmationKind, status: ConfirmationStatus): string {
  // Portero, Abridor y Lineup son masculinos: no hace falta concordancia de género.
  switch (status) {
    case "confirmed":
      return kind === "key_player" ? "Juega" : "confirmado";
    case "probable":
      return kind === "key_player" ? "Probable" : "probable";
    case "pending":
      return kind === "key_player" ? "Por confirmar" : "por confirmar";
    case "questionable":
      return "En duda";
    case "out":
      return "Fuera";
  }
}

export function confirmationViews(input: SportOutlookInput): ConfirmationView[] {
  return (input.confirmations ?? []).map((c: SportConfirmation, i) => {
    const team = c.team === "home" ? input.homeTeam : input.awayTeam;
    const name = c.playerName?.trim();
    let title: string;
    if (c.kind === "key_player") {
      title = name ? `${name} · ${statusWord(c.kind, c.status)}` : statusWord(c.kind, c.status);
    } else if (c.status === "questionable" || c.status === "out") {
      title = `${KIND_NOUN[c.kind]}: ${statusWord(c.kind, c.status).toLowerCase()}`;
    } else {
      title = `${KIND_NOUN[c.kind]} ${statusWord(c.kind, c.status)}`;
      if (name && c.status !== "pending") title += `: ${name}`;
    }
    const detail = c.status === "pending" ? PENDING_HINT[c.kind] : team;
    return {
      key: `${c.kind}-${c.team}-${i}`,
      team: c.team,
      title,
      detail: c.status === "pending" ? `${team} · ${detail}` : detail,
      tone: STATUS_TONE[c.status],
    };
  });
}

/** Avisos de descanso: segundo juego en dos noches o días sin jugar. */
export function restNotes(input: SportOutlookInput): string[] {
  const notes: string[] = [];
  const sides: TeamSide[] = ["home", "away"];
  for (const side of sides) {
    const info: SportRestInfo | undefined = input.rest?.[side];
    if (!info) continue;
    const team = side === "home" ? input.homeTeam : input.awayTeam;
    if (info.backToBack) {
      notes.push(`${team} juega su segundo partido en dos noches`);
    } else if (typeof info.restDays === "number" && info.restDays >= 3) {
      notes.push(`${team} llega con ${info.restDays} días de descanso`);
    }
  }
  return notes;
}
