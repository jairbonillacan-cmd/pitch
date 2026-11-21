import { FORBIDDEN_PROVIDER_TOKENS } from "@pitchlab/contracts";
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
  nfl: "Futbol americano · NFL",
  ncaaf: "Futbol americano colegial",
};

const UNIT: Record<OutlookSport, { one: string; many: string }> = {
  nhl: { one: "gol", many: "goles" },
  mlb: { one: "carrera", many: "carreras" },
  nba: { one: "punto", many: "puntos" },
  nfl: { one: "punto", many: "puntos" },
  ncaaf: { one: "punto", many: "puntos" },
};

const NEUTRAL_MARGIN: Record<OutlookSport, number> = {
  nhl: 0.05,
  mlb: 0.05,
  nba: 0.3,
  nfl: 0.3,
  ncaaf: 0.3,
};

const NEUTRAL_LOGIT = 0.03;

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
  sumersports_epa_success: "Eficiencia por jugada",
  injuries_qb_depth: "Lesiones en quarterback y titulares",
  referee_penalties: "Disciplina y arbitraje",
  weather_stadium_physics: "Clima y estadio",
  clubelo_and_xg_elo: "Fuerza estructural del equipo",
  lineup_availability_delta: "Disponibilidad de la plantilla",
  stadium_altitude_physics: "Altitud del estadio",
  fpi_srs_sos_ypp_power: "Nivel del equipo y dificultad de su calendario",
  cfb_hfa_and_altitude_shock: "Localía y altura",
  open_meteo_wind_precip: "Viento y lluvia",
  cfb_roster_injuries: "Bajas (incluido el quarterback)",
};

const FALLBACK_DRIVER = "Otro factor del modelo";

const TECHNICAL_JARGON_RE =
  /Corsi|Fenwick|Pythag|FIP|wOBA|SRS|Four Factors|Open-Meteo|Log5|xG%|SumerSports|Ourlads|NFLPenalties|\bEPA\b|\bClubElo\b/i;

export function isSafeDriverLabel(raw: string | undefined): raw is string {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes("_")) return false;
  if (TECHNICAL_JARGON_RE.test(trimmed)) return false;
  const lowered = trimmed.toLowerCase();
  for (const token of FORBIDDEN_PROVIDER_TOKENS) {
    if (lowered.includes(token)) return false;
  }
  return true;
}

export function unitWord(sport: OutlookSport, value: number): string {
  return Math.abs(value) === 1 ? UNIT[sport].one : UNIT[sport].many;
}

export function pctText(p: number, decimals = 1): string {
  return `${(p * 100).toFixed(decimals)} %`;
}

export function signedText(value: number, decimals = 1): string {
  const abs = Math.abs(value).toFixed(decimals);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

const isProb = (p: unknown): p is number =>
  typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1;

const SUM_TOLERANCE = 0.02;

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

export function marginText(input: SportOutlookInput): string {
  const margin = input.expectedHome - input.expectedAway;
  if (Math.abs(margin) < NEUTRAL_MARGIN[input.sport]) return "Partido parejo";
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
  readonly favors: TeamSide | null;
  readonly text: string;
}

export function topDrivers(input: SportOutlookInput, limit = 3): DriverView[] {
  return [...input.drivers]
    .filter(
      (d: SportOutlookDriver) =>
        Number.isFinite(d.impactLogit) &&
        (d.impactUnits === undefined || Number.isFinite(d.impactUnits)),
    )
    .sort((a, b) => Math.abs(b.impactLogit) - Math.abs(a.impactLogit))
    .slice(0, limit)
    .map((d) => {
      const label =
        DRIVER_COPY[d.factor] ?? (isSafeDriverLabel(d.label) ? d.label.trim() : FALLBACK_DRIVER);
      if (typeof d.impactUnits === "number") {
        const units = Math.abs(d.impactUnits);
        if (units < NEUTRAL_MARGIN[input.sport]) {
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
      }
      if (Math.abs(d.impactLogit) < NEUTRAL_LOGIT) {
        return { factor: d.factor, label, favors: null, text: "Sin ventaja clara" };
      }
      const favors: TeamSide = d.impactLogit > 0 ? "home" : "away";
      const team = favors === "home" ? input.homeTeam : input.awayTeam;
      return {
        factor: d.factor,
        label,
        favors,
        text: `Favorece a ${team}`,
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
        if (
          isProb(line.pTie) &&
          isProb(line.pAway) &&
          line.pTie > 0.001 &&
          Math.abs(line.p + line.pTie + line.pAway - 1) <= SUM_TOLERANCE
        ) {
          options = [
            { label: input.homeTeam, p: line.p },
            { label: "Empate", p: line.pTie },
            { label: input.awayTeam, p: line.pAway },
          ];
        } else {
          options = [
            { label: input.homeTeam, p: line.p },
            { label: input.awayTeam, p: 1 - line.p },
          ];
        }
        break;
    }
    views.push({ kind: line.kind, title, options });
  }
  return views;
}

export interface NflSpecialView {
  readonly key: "overtime" | "key_margin_3" | "key_margin_7";
  readonly title: string;
  readonly subtitle: string;
  readonly p: number;
  readonly fairDecimal: number | null;
}

export function nflSpecialViews(input: SportOutlookInput): NflSpecialView[] {
  if (input.sport !== "nfl" || !input.nflSpecials) return [];
  const specials = input.nflSpecials;
  const views: NflSpecialView[] = [];

  if (isProb(specials.pOvertime)) {
    const fairDecimal =
      typeof specials.fairOvertimeDecimal === "number" &&
      Number.isFinite(specials.fairOvertimeDecimal) &&
      specials.fairOvertimeDecimal > 1
        ? specials.fairOvertimeDecimal
        : 1 / Math.max(specials.pOvertime, 0.01);
    views.push({
      key: "overtime",
      title: "Tiempo extra (OT)",
      subtitle: "El partido se define en tiempo extra",
      p: specials.pOvertime,
      fairDecimal,
    });
  }

  if (isProb(specials.pExactPlus3) && isProb(specials.pExactMinus3)) {
    const combined = Math.min(1, specials.pExactPlus3 + specials.pExactMinus3);
    views.push({
      key: "key_margin_3",
      title: "Margen clave ±3 puntos",
      subtitle: `+3 (${pctText(specials.pExactPlus3)}) · −3 (${pctText(specials.pExactMinus3)})`,
      p: combined,
      fairDecimal: null,
    });
  }

  if (isProb(specials.pExactPlus7) && isProb(specials.pExactMinus7)) {
    const combined = Math.min(1, specials.pExactPlus7 + specials.pExactMinus7);
    views.push({
      key: "key_margin_7",
      title: "Margen clave ±7 puntos",
      subtitle: `+7 (${pctText(specials.pExactPlus7)}) · −7 (${pctText(specials.pExactMinus7)})`,
      p: combined,
      fairDecimal: null,
    });
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
