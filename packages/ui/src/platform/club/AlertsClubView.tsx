"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import {
  COMPETITION_BY_ID,
  LEAGUE_CAPABILITY_LIST,
  getLeagueCapability,
  isSafePublicLabel,
  parsePositiveDecimalOdds,
  parseStrictFiniteNumber,
  type MarketFamilyId,
} from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreFilterBar,
  SofascoreKpiStrip,
  SofascoreTable,
  SofascoreTabs,
  type SofascoreKpiItem,
  type SofascoreTabItem,
  type SofascoreTableColumn,
} from "../../components/ui/primitives";
import { useAbortableJson } from "../hooks";
import { useOptionalPlatformActions, useOptionalPlatformCore } from "../platform-provider";
import { BOOKMAKER_OPTIONS, formatCanonicalBookLabel } from "../bookmakers";
import { MARKET_FAMILIES } from "../picks-catalog";
import { ConfirmActionDialog } from "../components/PlatformOverlays";
import { MaestroIcon } from "../components/MaestroPrimitives";

export type MarketAlertTrigger =
  | "market_opened"
  | "sharp_steam"
  | "stale_line_ev"
  | "lineup_confirmed"
  | "schedule_change";

export type MarketAlertDirection = "any" | "over" | "under" | "home" | "away" | "draw";
export type MarketAlertChannel = "push" | "in_app" | "both";
export type CopilotResolutionSource =
  | "deterministic"
  | "copilot_llm"
  | "deterministic_fallback"
  | "local_preview";

export interface MarketAlertItem {
  readonly id: string;
  readonly name: string;
  readonly trigger: MarketAlertTrigger;
  readonly league: string | null;
  readonly marketFamily: MarketFamilyId | null;
  readonly selection: string | null;
  readonly thresholdEvPct: number | null;
  readonly minDecimal: number | null;
  readonly maxDecimal: number | null;
  readonly direction: MarketAlertDirection | null;
  readonly bookmaker: string | null;
  readonly cooldownMinutes: number;
  readonly channel: MarketAlertChannel;
  readonly active: boolean;
  readonly lastFiredAtIso: string | null;
  readonly lastFiredHash: string | null;
  readonly firedCount: number;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export interface AlertsClubViewProps {
  readonly title?: string;
  readonly initialAlerts?: readonly MarketAlertItem[];
  readonly maxActiveAlerts?: number;
  readonly accountReady?: boolean;
  readonly hasActivePass?: boolean;
  readonly defaultLeague?: string;
  readonly className?: string;
}

interface AlertsListResponse {
  readonly ok: boolean;
  readonly alerts?: readonly MarketAlertItem[];
  readonly maxActiveAlerts?: number;
}

interface CopilotDraftServerPayload {
  readonly name?: string;
  readonly trigger?: MarketAlertTrigger;
  readonly league?: string | null;
  readonly marketFamily?: MarketFamilyId | null;
  readonly selection?: string | null;
  readonly thresholdEvPct?: number | null;
  readonly minDecimal?: number | null;
  readonly maxDecimal?: number | null;
  readonly direction?: MarketAlertDirection | null;
  readonly bookmaker?: string | null;
  readonly cooldownMinutes?: number;
  readonly channel?: MarketAlertChannel;
  readonly active?: boolean;
}

interface CopilotResponsePayload {
  readonly ok: boolean;
  readonly outcome?: "accept" | "reject";
  readonly rejectCode?: string;
  readonly message?: string;
  readonly error?: string;
  readonly source?: CopilotResolutionSource;
  readonly draft?: CopilotDraftServerPayload;
  readonly alert?: MarketAlertItem;
}

interface SingleAlertMutationResponse {
  readonly ok: boolean;
  readonly alert?: MarketAlertItem;
  readonly deletedId?: string;
  readonly error?: string;
}

interface BatchMutationItem {
  readonly op: "create" | "update" | "pause" | "resume" | "delete";
  readonly alert?: MarketAlertItem;
  readonly deletedId?: string;
}

interface BatchMutationResponse {
  readonly ok: boolean;
  readonly applied?: number;
  readonly results?: readonly BatchMutationItem[];
  readonly error?: string;
}

interface AlertDraftForm {
  readonly name: string;
  readonly trigger: MarketAlertTrigger;
  readonly league: string;
  readonly marketFamily: MarketFamilyId | "";
  readonly selection: string;
  readonly direction: MarketAlertDirection | "";
  readonly thresholdEvPct: string;
  readonly minDecimal: string;
  readonly maxDecimal: string;
  readonly bookmaker: string;
  readonly cooldownMinutes: string;
  readonly channel: MarketAlertChannel;
  readonly active: boolean;
}

type DraftFieldKey = keyof AlertDraftForm;
type StatusTabKey = "all" | "active" | "paused";

type PendingDeleteTarget =
  | { readonly kind: "single"; readonly alert: MarketAlertItem }
  | { readonly kind: "batch"; readonly ids: readonly string[] };

const MAX_BATCH_OPS = 10;
const PAGE_SIZE = 20;
const COOLDOWN_PRESETS: readonly number[] = [15, 30, 60, 180];

const TRIGGER_META: Readonly<
  Record<MarketAlertTrigger, { readonly label: string; readonly shortLabel: string; readonly hint: string }>
> = {
  market_opened: {
    label: "Apertura de línea",
    shortLabel: "Apertura",
    hint: "Avisa en cuanto se publica la cuota del mercado",
  },
  sharp_steam: {
    label: "Movimiento sharp",
    shortLabel: "Steam",
    hint: "Detecta desplazamientos de probabilidad sin margen (pp)",
  },
  stale_line_ev: {
    label: "Línea rezagada EV+",
    shortLabel: "Rezagada EV+",
    hint: "Detecta casas lentas con valor esperado positivo",
  },
  lineup_confirmed: {
    label: "Titular confirmado",
    shortLabel: "Titularidad",
    hint: "Dispara cuando se confirma el once o alineación inicial",
  },
  schedule_change: {
    label: "Cambio de calendario",
    shortLabel: "Calendario",
    hint: "Notifica cambios de horario, sede o reprogramación",
  },
};

const TRIGGER_ORDER: readonly MarketAlertTrigger[] = [
  "market_opened",
  "sharp_steam",
  "stale_line_ev",
  "lineup_confirmed",
  "schedule_change",
];

const DIRECTION_LABELS: Readonly<Record<MarketAlertDirection, string>> = {
  any: "Cualquier dirección",
  over: "Más de (Over)",
  under: "Menos de (Under)",
  home: "Local",
  away: "Visitante",
  draw: "Empate",
};

const DIRECTION_ORDER: readonly MarketAlertDirection[] = [
  "any",
  "over",
  "under",
  "home",
  "away",
  "draw",
];

const CHANNEL_LABELS: Readonly<Record<MarketAlertChannel, string>> = {
  push: "Push",
  in_app: "En la app",
  both: "Push + App",
};

const CHANNEL_ORDER: readonly MarketAlertChannel[] = ["push", "in_app", "both"];

const SOURCE_LABELS: Readonly<Record<CopilotResolutionSource, string>> = {
  copilot_llm: "Copiloto IA",
  deterministic: "Motor determinista",
  deterministic_fallback: "Respaldo determinista",
  local_preview: "Vista previa local",
};

const COPILOT_EXAMPLES: readonly string[] = [
  "Avísame al abrir 1X2 del América en Liga MX con +4% EV",
  "Alerta de movimiento sharp de 3.5 pp en totales de puntos NBA",
  "Línea rezagada en Caliente para córners en Premier League con +5% EV",
  "Avísame por cambio de horario en partidos de MLB",
];

const ALL_LEAGUE_OPTIONS: ReadonlyArray<{ readonly id: string; readonly label: string }> =
  LEAGUE_CAPABILITY_LIST.map((cap) => ({
    id: cap.id,
    label: COMPETITION_BY_ID[cap.id]?.label ?? cap.id,
  }));

const DRAFT_FIELD_KEYS: readonly DraftFieldKey[] = [
  "name",
  "trigger",
  "league",
  "marketFamily",
  "selection",
  "direction",
  "thresholdEvPct",
  "minDecimal",
  "maxDecimal",
  "bookmaker",
  "cooldownMinutes",
  "channel",
  "active",
];

function isDraftFieldKey(value: string): value is DraftFieldKey {
  return DRAFT_FIELD_KEYS.some((item) => item === value);
}

function isMarketAlertTrigger(value: string): value is MarketAlertTrigger {
  return TRIGGER_ORDER.some((item) => item === value);
}

function isMarketAlertDirection(value: string): value is MarketAlertDirection {
  return DIRECTION_ORDER.some((item) => item === value);
}

function isMarketAlertChannel(value: string): value is MarketAlertChannel {
  return CHANNEL_ORDER.some((item) => item === value);
}

function isMarketFamilyId(value: string): value is MarketFamilyId {
  return Object.prototype.hasOwnProperty.call(MARKET_FAMILIES, value);
}

function normalizeBookValue(raw: string | null | undefined): string {
  if (!raw) return "";
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  return cleaned;
}

function leagueLabelOf(leagueId: string | null): string {
  if (!leagueId) return "Todas las ligas";
  return COMPETITION_BY_ID[leagueId]?.label ?? leagueId;
}

function marketFamilyLabelOf(familyId: MarketFamilyId | null): string {
  if (!familyId) return "Cualquier mercado";
  return MARKET_FAMILIES[familyId]?.shortLabel ?? familyId;
}

function formatIsoShort(iso: string | null): string {
  if (!iso) return "Sin disparos";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "Sin disparos";
  try {
    return new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch (err) {
    void err;
    return iso.slice(0, 10);
  }
}

function supportedFamiliesForLeague(leagueId: string): readonly MarketFamilyId[] {
  if (!leagueId) {
    return Object.keys(MARKET_FAMILIES).filter(isMarketFamilyId);
  }
  const cap = getLeagueCapability(leagueId);
  return cap ? cap.supportedMarketFamilies : [];
}

function buildEmptyDraft(defaultLeague = "liga-mx"): AlertDraftForm {
  const safeLeague = getLeagueCapability(defaultLeague) ? defaultLeague : "liga-mx";
  return {
    name: "",
    trigger: "stale_line_ev",
    league: safeLeague,
    marketFamily: "1x2",
    selection: "",
    direction: "",
    thresholdEvPct: "3.5",
    minDecimal: "",
    maxDecimal: "",
    bookmaker: "",
    cooldownMinutes: "60",
    channel: "push",
    active: true,
  };
}

function alertToDraft(alert: MarketAlertItem): AlertDraftForm {
  return {
    name: alert.name,
    trigger: alert.trigger,
    league: alert.league ?? "",
    marketFamily: alert.marketFamily ?? "",
    selection: alert.selection ?? "",
    direction: alert.direction ?? "",
    thresholdEvPct:
      alert.thresholdEvPct !== null && Number.isFinite(alert.thresholdEvPct)
        ? String(alert.thresholdEvPct)
        : "",
    minDecimal:
      alert.minDecimal !== null && Number.isFinite(alert.minDecimal)
        ? String(alert.minDecimal)
        : "",
    maxDecimal:
      alert.maxDecimal !== null && Number.isFinite(alert.maxDecimal)
        ? String(alert.maxDecimal)
        : "",
    bookmaker: alert.bookmaker ?? "",
    cooldownMinutes: String(alert.cooldownMinutes),
    channel: alert.channel,
    active: alert.active,
  };
}

function serverDraftToForm(incoming: CopilotDraftServerPayload): AlertDraftForm {
  const league = incoming.league ?? "liga-mx";
  const supported = supportedFamiliesForLeague(league);
  const marketFamily =
    incoming.marketFamily && supported.includes(incoming.marketFamily)
      ? incoming.marketFamily
      : "";
  return {
    name: incoming.name ?? "",
    trigger: incoming.trigger ?? "market_opened",
    league,
    marketFamily,
    selection: incoming.selection ?? "",
    direction: incoming.direction ?? "",
    thresholdEvPct:
      typeof incoming.thresholdEvPct === "number" && Number.isFinite(incoming.thresholdEvPct)
        ? String(incoming.thresholdEvPct)
        : "",
    minDecimal:
      typeof incoming.minDecimal === "number" && Number.isFinite(incoming.minDecimal)
        ? String(incoming.minDecimal)
        : "",
    maxDecimal:
      typeof incoming.maxDecimal === "number" && Number.isFinite(incoming.maxDecimal)
        ? String(incoming.maxDecimal)
        : "",
    bookmaker: normalizeBookValue(incoming.bookmaker),
    cooldownMinutes:
      typeof incoming.cooldownMinutes === "number" && Number.isFinite(incoming.cooldownMinutes)
        ? String(incoming.cooldownMinutes)
        : "60",
    channel: incoming.channel ?? "push",
    active: incoming.active ?? true,
  };
}

function parseLocalPreviewPrompt(promptEs: string, defaultLeague: string): AlertDraftForm {
  const folded = promptEs
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  let league = getLeagueCapability(defaultLeague) ? defaultLeague : "liga-mx";
  if (/\bpremier\b|\bepl\b/.test(folded)) league = "premier-league";
  else if (/\bla\s*liga\b/.test(folded)) league = "laliga";
  else if (/\bbundesliga\b/.test(folded)) league = "bundesliga";
  else if (/\bserie\s*a\b/.test(folded)) league = "serie-a";
  else if (/\bligue\s*1\b/.test(folded)) league = "ligue-1";
  else if (/\bchampions\b/.test(folded)) league = "champions-league";
  else if (/\blibertadores\b/.test(folded)) league = "libertadores";
  else if (/\bnba\b/.test(folded)) league = "nba";
  else if (/\bnfl\b/.test(folded)) league = "nfl";
  else if (/\bmlb\b/.test(folded)) league = "mlb";
  else if (/\bnhl\b/.test(folded)) league = "nhl";
  else if (/\bliga\s*mx\b/.test(folded)) league = "liga-mx";

  let trigger: MarketAlertTrigger = "market_opened";
  if (/cambio\s+de\s+horario|sede|aplaz|pospuesto|reprogram/.test(folded)) {
    trigger = "schedule_change";
  } else if (/titular|alineacion|once\s+inicial/.test(folded)) {
    trigger = "lineup_confirmed";
  } else if (/rezagad|stale|desfasad/.test(folded)) {
    trigger = "stale_line_ev";
  } else if (/sharp|steam|pp\b|puntos\s+porcentuales|baja\s+de|sube\s+de/.test(folded)) {
    trigger = "sharp_steam";
  }

  const cap = getLeagueCapability(league);
  let marketFamily: MarketFamilyId | "" =
    trigger === "schedule_change" ? "" : (cap?.supportedMarketFamilies[0] ?? "1x2");
  if (cap?.sport === "basketball") {
    if (/puntos|totales/.test(folded)) marketFamily = "nba_totals";
    else if (/spread|handicap/.test(folded)) marketFamily = "nba_spread";
    else if (/prop|rebotes|asistencias|triples/.test(folded)) marketFamily = "nba_player_props";
    else if (trigger !== "schedule_change") marketFamily = "nba_moneyline";
  } else if (cap?.sport === "baseball") {
    if (/\bf5\b|5\s+entradas/.test(folded)) marketFamily = "mlb_f5";
    else if (/run\s*line/.test(folded)) marketFamily = "mlb_run_line";
    else if (/carreras|totales/.test(folded)) marketFamily = "mlb_totals";
    else if (trigger !== "schedule_change") marketFamily = "mlb_moneyline";
  } else if (cap?.sport === "football") {
    if (/corners?|esquina/.test(folded)) marketFamily = "corners_total";
    else if (/tarjetas?|amarill/.test(folded)) marketFamily = "cards_total";
    else if (/ambos\s+anotan|\bbtts\b/.test(folded)) marketFamily = "btts";
    else if (/goles|over|under|mas\s+de|menos\s+de/.test(folded)) marketFamily = "totals";
    else if (/handicap/.test(folded)) marketFamily = "asian_handicap";
    else if (/prop|remates|tiros/.test(folded)) marketFamily = "player_props_football";
    else if (trigger !== "schedule_change") marketFamily = "1x2";
  }

  const evMatch = /(?:\+\s*)?(\d+(?:[.,]\d+)?)\s*%/.exec(promptEs);
  const ppMatch = /(\d+(?:[.,]\d+)?)\s*(?:pp|puntos\s+porcentuales)/i.exec(promptEs);
  const belowOddsMatch = /(?:baja\s+de|debajo\s+de|menor\s+a)\s+(\d+(?:[.,]\d+)?)/i.exec(promptEs);
  const aboveOddsMatch = /(?:sube\s+de|arriba\s+de|mayor\s+a|encima\s+de)\s+(\d+(?:[.,]\d+)?)/i.exec(promptEs);
  const thresholdRaw = (evMatch?.[1] ?? ppMatch?.[1] ?? "").replace(",", ".");
  const maxDecRaw = (belowOddsMatch?.[1] ?? "").replace(",", ".");
  const minDecRaw = (aboveOddsMatch?.[1] ?? "").replace(",", ".");

  let bookmaker = "";
  for (const option of BOOKMAKER_OPTIONS) {
    const shortKey = option.id.replace("_mx", "");
    if (folded.includes(shortKey)) {
      bookmaker = option.id;
      break;
    }
  }

  const entityMatch =
    /\b(?:del?|el|la|los|las|para|sobre)\s+([A-ZÁÉÍÓÚÑ][a-zA-Záéíóúñ'-]+(?:\s+[A-ZÁÉÍÓÚÑ][a-zA-Záéíóúñ'-]+){0,2})/u.exec(
      promptEs,
    );
  const rawEntity = entityMatch?.[1]?.trim() ?? "";
  const isLeaguePhrase = /^(?:Liga\s+MX|Premier\s+League|La\s*Liga|Serie\s+A|Ligue\s+1|Champions|Libertadores|NBA|NFL|MLB|NHL)$/i.test(
    rawEntity,
  );
  const extractedSelection =
    rawEntity.length >= 2 && !isLeaguePhrase && isSafePublicLabel(rawEntity) ? rawEntity : "";

  const nameParts = [TRIGGER_META[trigger].shortLabel];
  if (extractedSelection) nameParts.push(extractedSelection);
  nameParts.push(leagueLabelOf(league));
  const draftName = nameParts.join(" · ").slice(0, 120);

  return {
    name: draftName,
    trigger,
    league,
    marketFamily,
    selection: extractedSelection,
    direction: "",
    thresholdEvPct: thresholdRaw,
    minDecimal: minDecRaw,
    maxDecimal: maxDecRaw,
    bookmaker,
    cooldownMinutes: "60",
    channel: "push",
    active: true,
  };
}

function mergeDraftPreservingEdits(
  current: AlertDraftForm | null,
  incoming: AlertDraftForm,
  touched: ReadonlySet<DraftFieldKey>,
): AlertDraftForm {
  if (!current || touched.size === 0) {
    return incoming;
  }
  const mergedLeague = touched.has("league") ? current.league : incoming.league;
  const candidateFamily = touched.has("marketFamily")
    ? current.marketFamily
    : incoming.marketFamily;
  const supported = supportedFamiliesForLeague(mergedLeague);
  const validFamily =
    candidateFamily && supported.includes(candidateFamily) ? candidateFamily : "";

  return {
    name: touched.has("name") ? current.name : incoming.name,
    trigger: touched.has("trigger") ? current.trigger : incoming.trigger,
    league: mergedLeague,
    marketFamily: validFamily,
    selection: touched.has("selection") ? current.selection : incoming.selection,
    direction: touched.has("direction") ? current.direction : incoming.direction,
    thresholdEvPct: touched.has("thresholdEvPct")
      ? current.thresholdEvPct
      : incoming.thresholdEvPct,
    minDecimal: touched.has("minDecimal") ? current.minDecimal : incoming.minDecimal,
    maxDecimal: touched.has("maxDecimal") ? current.maxDecimal : incoming.maxDecimal,
    bookmaker: touched.has("bookmaker") ? current.bookmaker : incoming.bookmaker,
    cooldownMinutes: touched.has("cooldownMinutes")
      ? current.cooldownMinutes
      : incoming.cooldownMinutes,
    channel: touched.has("channel") ? current.channel : incoming.channel,
    active: touched.has("active") ? current.active : incoming.active,
  };
}

function buildValidatedMutationBody(draft: AlertDraftForm):
  | {
      readonly ok: true;
      readonly body: {
        readonly name: string;
        readonly trigger: MarketAlertTrigger;
        readonly league: string | null;
        readonly marketFamily: MarketFamilyId | null;
        readonly selection: string | null;
        readonly thresholdEvPct: number | null;
        readonly minDecimal: number | null;
        readonly maxDecimal: number | null;
        readonly direction: MarketAlertDirection | null;
        readonly bookmaker: string | null;
        readonly cooldownMinutes: number;
        readonly channel: MarketAlertChannel;
        readonly active: boolean;
      };
    }
  | { readonly ok: false; readonly error: string } {
  const cleanName = draft.name.trim();
  if (cleanName.length < 2 || cleanName.length > 120) {
    return { ok: false, error: "Escribe un nombre de alerta entre 2 y 120 caracteres." };
  }
  if (!isSafePublicLabel(cleanName)) {
    return { ok: false, error: "El nombre de la alerta contiene términos no permitidos." };
  }

  const cleanSelection = draft.selection.trim();
  if (cleanSelection.length > 160) {
    return { ok: false, error: "La selección no puede exceder 160 caracteres." };
  }
  if (cleanSelection.length > 0 && !isSafePublicLabel(cleanSelection)) {
    return { ok: false, error: "La selección contiene términos no permitidos." };
  }

  const cleanLeague = draft.league.trim() || null;
  const cleanFamily = draft.marketFamily || null;
  if (cleanLeague && cleanFamily) {
    const cap = getLeagueCapability(cleanLeague);
    if (!cap || !cap.supportedMarketFamilies.includes(cleanFamily)) {
      return {
        ok: false,
        error: "La familia de mercado elegida no aplica para la liga seleccionada.",
      };
    }
  }

  let thresholdEvPct: number | null = null;
  const rawThreshold = draft.thresholdEvPct.trim().replace(",", ".");
  if (rawThreshold.length > 0) {
    const parsed = parseStrictFiniteNumber(rawThreshold);
    if (parsed === null || parsed < -50 || parsed > 500) {
      return { ok: false, error: "El umbral EV% / pp debe ser un número entre -50 y 500." };
    }
    thresholdEvPct = parsed;
  }

  let minDecimal: number | null = null;
  const rawMin = draft.minDecimal.trim().replace(",", ".");
  if (rawMin.length > 0) {
    const parsed = parsePositiveDecimalOdds(rawMin);
    if (parsed === null) {
      return { ok: false, error: "El momio mínimo debe ser decimal mayor a 1.00." };
    }
    minDecimal = parsed;
  }

  let maxDecimal: number | null = null;
  const rawMax = draft.maxDecimal.trim().replace(",", ".");
  if (rawMax.length > 0) {
    const parsed = parsePositiveDecimalOdds(rawMax);
    if (parsed === null) {
      return { ok: false, error: "El momio máximo debe ser decimal mayor a 1.00." };
    }
    maxDecimal = parsed;
  }

  if (minDecimal !== null && maxDecimal !== null && minDecimal > maxDecimal) {
    return { ok: false, error: "El momio mínimo no puede ser mayor que el momio máximo." };
  }

  const parsedCooldown = parseStrictFiniteNumber(draft.cooldownMinutes.trim());
  const cooldownMinutes =
    parsedCooldown !== null ? Math.round(parsedCooldown) : 60;
  if (cooldownMinutes < 5 || cooldownMinutes > 1440) {
    return { ok: false, error: "El enfriamiento debe estar entre 5 y 1440 minutos." };
  }

  const cleanBook = normalizeBookValue(draft.bookmaker) || null;
  if (cleanBook && (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(cleanBook) || !isSafePublicLabel(cleanBook))) {
    return { ok: false, error: "La casa de referencia no es válida." };
  }

  const cleanDirection: MarketAlertDirection | null =
    draft.direction && isMarketAlertDirection(draft.direction) ? draft.direction : null;

  return {
    ok: true,
    body: {
      name: cleanName,
      trigger: draft.trigger,
      league: cleanLeague,
      marketFamily: cleanFamily,
      selection: cleanSelection.length > 0 ? cleanSelection : null,
      thresholdEvPct,
      minDecimal,
      maxDecimal,
      direction: cleanDirection,
      bookmaker: cleanBook,
      cooldownMinutes,
      channel: draft.channel,
      active: draft.active,
    },
  };
}

function describeCondition(row: MarketAlertItem): string {
  const parts: string[] = [];
  if (row.thresholdEvPct !== null && Number.isFinite(row.thresholdEvPct)) {
    if (row.trigger === "sharp_steam") {
      parts.push(`Δ >= ${row.thresholdEvPct.toFixed(1)} pp`);
    } else {
      const sign = row.thresholdEvPct > 0 ? "+" : "";
      parts.push(`EV ${sign}${row.thresholdEvPct.toFixed(1)}%`);
    }
  }
  if (row.minDecimal !== null && row.maxDecimal !== null) {
    parts.push(`${row.minDecimal.toFixed(2)}–${row.maxDecimal.toFixed(2)}`);
  } else if (row.minDecimal !== null) {
    parts.push(`>= ${row.minDecimal.toFixed(2)}`);
  } else if (row.maxDecimal !== null) {
    parts.push(`<= ${row.maxDecimal.toFixed(2)}`);
  }
  if (row.direction && row.direction !== "any") {
    parts.push(DIRECTION_LABELS[row.direction]);
  }
  if (row.bookmaker) {
    parts.push(formatCanonicalBookLabel(row.bookmaker));
  }
  return parts.length > 0 ? parts.join(" · ") : "Sin filtro adicional";
}

export function AlertsClubView({
  title = "Alertas de mercado",
  initialAlerts,
  maxActiveAlerts: initialMaxActive = 40,
  accountReady,
  hasActivePass,
  defaultLeague = "liga-mx",
  className,
}: AlertsClubViewProps = {}): React.JSX.Element {
  const platformCore = useOptionalPlatformCore();
  const platformActions = useOptionalPlatformActions();

  const resolvedAccountReady =
    accountReady ?? Boolean(platformCore?.hasAccountSessionAuth);
  const resolvedHasActivePass =
    hasActivePass ??
    (resolvedAccountReady && platformCore?.viewerRole !== "visitor");
  const canMutateServer = resolvedAccountReady && resolvedHasActivePass;

  const initialServerData: AlertsListResponse | null = initialAlerts
    ? { ok: true, alerts: initialAlerts, maxActiveAlerts: initialMaxActive }
    : null;

  const remoteAlerts = useAbortableJson<AlertsListResponse>("/api/alerts", {
    enabled: resolvedAccountReady && initialAlerts === undefined,
    initialData: initialServerData,
  });

  const [mutatedAlerts, setMutatedAlerts] = useState<readonly MarketAlertItem[] | null>(null);
  const [statusTab, setStatusTab] = useState<StatusTabKey>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [triggerFilter, setTriggerFilter] = useState<string>("all");
  const [leagueFilter, setLeagueFilter] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  const [copilotPrompt, setCopilotPrompt] = useState<string>("");
  const [copilotBusy, setCopilotBusy] = useState<boolean>(false);
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const [copilotSource, setCopilotSource] = useState<CopilotResolutionSource | null>(null);
  const [lastRawCopilotDraft, setLastRawCopilotDraft] = useState<AlertDraftForm | null>(null);

  const [draft, setDraft] = useState<AlertDraftForm | null>(null);
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);
  const [manualEditedFields, setManualEditedFields] = useState<ReadonlySet<DraftFieldKey>>(
    () => new Set(),
  );
  const [draftError, setDraftError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState<boolean>(false);

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    readonly tone: "success" | "danger" | "info";
    readonly text: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteTarget | null>(null);

  const copilotInputId = useId();
  const draftNameId = useId();
  const draftTriggerId = useId();
  const draftLeagueId = useId();
  const draftMarketId = useId();
  const draftSelectionId = useId();
  const draftDirectionId = useId();
  const draftThresholdId = useId();
  const draftMinOddsId = useId();
  const draftMaxOddsId = useId();
  const draftBookId = useId();
  const draftCooldownId = useId();
  const draftChannelId = useId();
  const filterTriggerId = useId();
  const filterLeagueId = useId();

  const alerts: readonly MarketAlertItem[] = useMemo(() => {
    if (mutatedAlerts !== null) return mutatedAlerts;
    return remoteAlerts.data?.alerts ?? initialAlerts ?? [];
  }, [mutatedAlerts, remoteAlerts.data?.alerts, initialAlerts]);

  const maxActiveAlerts = remoteAlerts.data?.maxActiveAlerts ?? initialMaxActive;

  const activeCount = useMemo(
    () => alerts.filter((item) => item.active).length,
    [alerts],
  );
  const pausedCount = alerts.length - activeCount;
  const totalFired = useMemo(
    () => alerts.reduce((sum, item) => sum + item.firedCount, 0),
    [alerts],
  );

  const kpiItems: readonly SofascoreKpiItem[] = useMemo(
    () => [
      {
        id: "active",
        label: "Alertas activas",
        value: `${activeCount} / ${maxActiveAlerts}`,
        tone: activeCount > 0 ? "brand" : "default",
      },
      {
        id: "paused",
        label: "Pausadas",
        value: String(pausedCount),
        tone: "default",
      },
      {
        id: "fired",
        label: "Disparos registrados",
        value: String(totalFired),
        tone: totalFired > 0 ? "positive" : "default",
      },
      {
        id: "coverage",
        label: "Cobertura",
        value: "5 disparadores · 34 mercados",
        tone: "default",
      },
    ],
    [activeCount, maxActiveAlerts, pausedCount, totalFired],
  );

  const statusTabs: readonly SofascoreTabItem[] = useMemo(
    () => [
      { id: "all", label: "Todas", count: alerts.length },
      { id: "active", label: "Activas", count: activeCount },
      { id: "paused", label: "Pausadas", count: pausedCount },
    ],
    [alerts.length, activeCount, pausedCount],
  );

  const filteredAlerts = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return alerts.filter((item) => {
      if (statusTab === "active" && !item.active) return false;
      if (statusTab === "paused" && item.active) return false;
      if (triggerFilter !== "all" && item.trigger !== triggerFilter) return false;
      if (leagueFilter !== "all" && item.league !== leagueFilter) return false;
      if (!needle) return true;
      const haystack = [
        item.name,
        item.selection ?? "",
        leagueLabelOf(item.league),
        marketFamilyLabelOf(item.marketFamily),
        TRIGGER_META[item.trigger].label,
        item.bookmaker ? formatCanonicalBookLabel(item.bookmaker) : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [alerts, statusTab, triggerFilter, leagueFilter, searchQuery]);

  const visibleAlerts = useMemo(
    () => filteredAlerts.slice(0, visibleCount),
    [filteredAlerts, visibleCount],
  );

  const availableLeagueFilterIds = useMemo(() => {
    const present = new Set<string>();
    for (const item of alerts) {
      if (item.league) present.add(item.league);
    }
    return Array.from(present);
  }, [alerts]);

  const notify = useCallback(
    (text: string, tone: "success" | "danger" | "info" = "info") => {
      setFeedbackMessage({ tone, text });
      platformActions?.pushToast(
        text,
        tone === "danger" ? "danger" : tone === "success" ? "success" : "default",
      );
    },
    [platformActions],
  );

  const navigateSafe = useCallback(
    (href: string) => {
      if (platformActions) {
        platformActions.navigateTo(href);
        return;
      }
      if (typeof window !== "undefined") {
        window.location.assign(href);
      }
    },
    [platformActions],
  );

  const patchDraft = useCallback((patch: Partial<AlertDraftForm>) => {
    const touchedKeys = Object.keys(patch).filter(isDraftFieldKey);
    setDraft((prev) => {
      if (!prev) return prev;
      const next: AlertDraftForm = { ...prev, ...patch };
      if (patch.league !== undefined) {
        const supported = supportedFamiliesForLeague(next.league);
        if (next.marketFamily && !supported.includes(next.marketFamily)) {
          return { ...next, marketFamily: "" };
        }
      }
      return next;
    });
    if (touchedKeys.length > 0) {
      setManualEditedFields((prev) => {
        const next = new Set(prev);
        for (const key of touchedKeys) {
          next.add(key);
        }
        return next;
      });
    }
    setDraftError(null);
  }, []);

  const handleOpenManualDraft = useCallback(() => {
    setEditingAlertId(null);
    setCopilotSource(null);
    setCopilotError(null);
    setLastRawCopilotDraft(null);
    setManualEditedFields(new Set());
    setDraftError(null);
    setDraft(buildEmptyDraft(defaultLeague));
  }, [defaultLeague]);

  const handleEditAlert = useCallback((row: MarketAlertItem) => {
    setEditingAlertId(row.id);
    setCopilotSource(null);
    setCopilotError(null);
    setLastRawCopilotDraft(null);
    setManualEditedFields(new Set());
    setDraftError(null);
    setDraft(alertToDraft(row));
  }, []);

  const handleCloseDraft = useCallback(() => {
    setDraft(null);
    setEditingAlertId(null);
    setManualEditedFields(new Set());
    setDraftError(null);
    setLastRawCopilotDraft(null);
  }, []);

  const handleResetManualEdits = useCallback(() => {
    if (!lastRawCopilotDraft) return;
    setDraft(lastRawCopilotDraft);
    setManualEditedFields(new Set());
    setDraftError(null);
  }, [lastRawCopilotDraft]);

  const submitCopilotPrompt = useCallback(async () => {
    const clean = copilotPrompt.trim();
    if (clean.length < 5) {
      setCopilotError("Escribe al menos 5 caracteres describiendo tu regla en español.");
      return;
    }
    setCopilotError(null);
    setDraftError(null);

    if (!canMutateServer) {
      const previewDraft = parseLocalPreviewPrompt(clean, defaultLeague);
      setLastRawCopilotDraft(previewDraft);
      setCopilotSource("local_preview");
      setEditingAlertId(null);
      setDraft((prev) => mergeDraftPreservingEdits(prev, previewDraft, manualEditedFields));
      return;
    }

    setCopilotBusy(true);
    try {
      const response = await fetch("/api/alerts/copilot", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ promptEs: clean, save: false }),
      });
      const payload = (await response.json().catch(() => null)) as CopilotResponsePayload | null;
      if (response.status === 401 || response.status === 403) {
        const previewDraft = parseLocalPreviewPrompt(clean, defaultLeague);
        setLastRawCopilotDraft(previewDraft);
        setCopilotSource("local_preview");
        setEditingAlertId(null);
        setDraft((prev) => mergeDraftPreservingEdits(prev, previewDraft, manualEditedFields));
        setCopilotError(
          "Inicia sesión con tu Pase Ultra activo para usar el Copiloto con guardado en cuenta.",
        );
        return;
      }
      if (!response.ok || !payload || !payload.ok || !payload.draft) {
        setCopilotError(
          payload?.message ??
            payload?.error ??
            "No pudimos interpretar la instrucción. Ajusta la liga o el mercado e intenta de nuevo.",
        );
        return;
      }
      const nextDraft = serverDraftToForm(payload.draft);
      setLastRawCopilotDraft(nextDraft);
      setCopilotSource(payload.source ?? "deterministic");
      setEditingAlertId(null);
      setDraft((prev) => mergeDraftPreservingEdits(prev, nextDraft, manualEditedFields));
    } catch (err) {
      void err;
      setCopilotError("Error de conexión al consultar el Copiloto de alertas.");
    } finally {
      setCopilotBusy(false);
    }
  }, [copilotPrompt, canMutateServer, defaultLeague, manualEditedFields]);

  const handleCopilotFormSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submitCopilotPrompt();
    },
    [submitCopilotPrompt],
  );

  const handleCopilotKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        event.preventDefault();
      }
    },
    [],
  );

  const handleSaveDraft = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!draft) return;

      const validated = buildValidatedMutationBody(draft);
      if (!validated.ok) {
        setDraftError(validated.error);
        return;
      }

      if (!canMutateServer) {
        setDraftError(
          "Inicia sesión con tu cuenta y Pase Ultra vigente para guardar alertas activas.",
        );
        return;
      }

      setSavingDraft(true);
      setDraftError(null);
      try {
        const isUpdate = editingAlertId !== null;
        const response = await fetch("/api/alerts", {
          method: isUpdate ? "PATCH" : "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify(
            isUpdate ? { id: editingAlertId, ...validated.body } : validated.body,
          ),
        });
        const payload = (await response.json().catch(() => null)) as
          | SingleAlertMutationResponse
          | null;
        if (!response.ok || !payload?.ok || !payload.alert) {
          setDraftError(payload?.error ?? "No se pudo guardar la alerta.");
          return;
        }
        const saved = payload.alert;
        setMutatedAlerts((prev) => {
          const base = prev ?? alerts;
          if (isUpdate) {
            return base.map((row) => (row.id === saved.id ? saved : row));
          }
          return [saved, ...base];
        });
        notify(
          isUpdate ? "Alerta actualizada." : "Alerta creada y activa.",
          "success",
        );
        handleCloseDraft();
      } catch (err) {
        void err;
        setDraftError("Error de red al guardar la alerta.");
      } finally {
        setSavingDraft(false);
      }
    },
    [draft, canMutateServer, editingAlertId, alerts, notify, handleCloseDraft],
  );

  const handleToggleAlertActive = useCallback(
    async (row: MarketAlertItem) => {
      if (!canMutateServer) {
        notify("Inicia sesión con Pase Ultra para pausar o activar alertas.", "info");
        return;
      }
      setRowBusyId(row.id);
      try {
        const response = await fetch("/api/alerts", {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({ id: row.id, active: !row.active }),
        });
        const payload = (await response.json().catch(() => null)) as
          | SingleAlertMutationResponse
          | null;
        if (!response.ok || !payload?.ok || !payload.alert) {
          notify(payload?.error ?? "No se pudo cambiar el estado de la alerta.", "danger");
          return;
        }
        const updated = payload.alert;
        setMutatedAlerts((prev) => (prev ?? alerts).map((item) => (item.id === updated.id ? updated : item)));
        notify(updated.active ? "Alerta activada." : "Alerta pausada.", "success");
      } catch (err) {
        void err;
        notify("Error de red al actualizar la alerta.", "danger");
      } finally {
        setRowBusyId(null);
      }
    },
    [canMutateServer, alerts, notify],
  );

  const executeBatch = useCallback(
    async (op: "pause" | "resume" | "delete", ids: readonly string[]) => {
      if (!canMutateServer || ids.length === 0) return;
      const boundedIds = ids.slice(0, MAX_BATCH_OPS);
      setBatchBusy(true);
      try {
        const response = await fetch("/api/alerts/batch", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            operations: boundedIds.map((id) => ({ op, id })),
          }),
        });
        const payload = (await response.json().catch(() => null)) as BatchMutationResponse | null;
        if (!response.ok || !payload?.ok || !payload.results) {
          notify(payload?.error ?? "No se pudo aplicar el lote de alertas.", "danger");
          return;
        }
        const updatedMap = new Map<string, MarketAlertItem>();
        const deletedSet = new Set<string>();
        for (const item of payload.results) {
          if (item.op === "delete" && item.deletedId) {
            deletedSet.add(item.deletedId);
          } else if (item.alert) {
            updatedMap.set(item.alert.id, item.alert);
          }
        }
        setMutatedAlerts((prev) =>
          (prev ?? alerts)
            .filter((row) => !deletedSet.has(row.id))
            .map((row) => updatedMap.get(row.id) ?? row),
        );
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of boundedIds) next.delete(id);
          return next;
        });
        const label =
          op === "delete"
            ? `${deletedSet.size} alerta(s) eliminadas.`
            : op === "pause"
              ? `${updatedMap.size} alerta(s) pausadas.`
              : `${updatedMap.size} alerta(s) activadas.`;
        notify(label, "success");
      } catch (err) {
        void err;
        notify("Error de red al aplicar la acción en lote.", "danger");
      } finally {
        setBatchBusy(false);
      }
    },
    [canMutateServer, alerts, notify],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "batch") {
      await executeBatch("delete", pendingDelete.ids);
      return;
    }
    const target = pendingDelete.alert;
    if (!canMutateServer) return;
    setRowBusyId(target.id);
    try {
      const response = await fetch(`/api/alerts?id=${encodeURIComponent(target.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as
        | SingleAlertMutationResponse
        | null;
      if (!response.ok || !payload?.ok) {
        notify(payload?.error ?? "No se pudo eliminar la alerta.", "danger");
        return;
      }
      setMutatedAlerts((prev) => (prev ?? alerts).filter((item) => item.id !== target.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      if (editingAlertId === target.id) {
        handleCloseDraft();
      }
      notify("Alerta eliminada.", "success");
    } catch (err) {
      void err;
      notify("Error de red al eliminar la alerta.", "danger");
    } finally {
      setRowBusyId(null);
    }
  }, [pendingDelete, executeBatch, canMutateServer, alerts, editingAlertId, handleCloseDraft, notify]);

  const toggleSelectRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_BATCH_OPS) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectedVisibleIds = useMemo(
    () => Array.from(selectedIds).filter((id) => alerts.some((row) => row.id === id)),
    [selectedIds, alerts],
  );

  const draftSupportedFamilies = useMemo(
    () => (draft ? supportedFamiliesForLeague(draft.league) : []),
    [draft],
  );

  const bookmakerOptionsForDraft = useMemo(() => {
    const base = BOOKMAKER_OPTIONS.map((item) => ({ id: item.id, label: item.label }));
    if (draft?.bookmaker && !base.some((item) => item.id === draft.bookmaker)) {
      return [
        { id: draft.bookmaker, label: formatCanonicalBookLabel(draft.bookmaker) },
        ...base,
      ];
    }
    return base;
  }, [draft?.bookmaker]);

  const columns: readonly SofascoreTableColumn<MarketAlertItem>[] = useMemo(
    () => [
      {
        key: "select",
        header: "Sel.",
        render: (row) => (
          <label className="pl-al-check-label" aria-label={`Seleccionar alerta ${row.name}`}>
            <input
              type="checkbox"
              className="pl-al-checkbox"
              checked={selectedIds.has(row.id)}
              disabled={!selectedIds.has(row.id) && selectedVisibleIds.length >= MAX_BATCH_OPS}
              onChange={() => toggleSelectRow(row.id)}
            />
          </label>
        ),
      },
      {
        key: "name",
        header: "Alerta",
        sticky: true,
        render: (row) => (
          <div className="pl-al-cell-main">
            <strong className="pl-al-cell-name">{row.name}</strong>
            <span className="pl-al-cell-sub">
              {leagueLabelOf(row.league)}
              {row.selection ? ` · ${row.selection}` : ""}
            </span>
          </div>
        ),
      },
      {
        key: "trigger",
        header: "Disparador",
        render: (row) => (
          <span className={`pl-al-trigger-pill is-${row.trigger}`}>
            {TRIGGER_META[row.trigger].shortLabel}
          </span>
        ),
      },
      {
        key: "market",
        header: "Mercado",
        render: (row) => (
          <span className="pl-al-cell-text">{marketFamilyLabelOf(row.marketFamily)}</span>
        ),
      },
      {
        key: "condition",
        header: "Condición",
        numeric: true,
        render: (row) => <span className="pl-al-cell-cond num">{describeCondition(row)}</span>,
      },
      {
        key: "delivery",
        header: "Entrega",
        render: (row) => (
          <div className="pl-al-cell-delivery num">
            <span>{CHANNEL_LABELS[row.channel]}</span>
            <small>{row.cooldownMinutes} min</small>
          </div>
        ),
      },
      {
        key: "status",
        header: "Estado",
        render: (row) => (
          <div className="pl-al-cell-status">
            <span className={`pl-al-status-badge ${row.active ? "is-active" : "is-paused"}`}>
              {row.active ? "Activa" : "Pausada"}
            </span>
            <small className="num">
              {row.firedCount > 0
                ? `${row.firedCount}× · ${formatIsoShort(row.lastFiredAtIso)}`
                : "Sin disparos"}
            </small>
          </div>
        ),
      },
      {
        key: "actions",
        header: "Acciones",
        align: "end",
        render: (row) => {
          const busy = rowBusyId === row.id || batchBusy;
          return (
            <div className="pl-al-row-actions">
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void handleToggleAlertActive(row)}
              >
                {row.active ? "Pausar" : "Activar"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => handleEditAlert(row)}
              >
                Editar
              </Button>
              <Button
                variant="ghost"
                tone="danger"
                size="sm"
                disabled={busy}
                aria-label={`Eliminar alerta ${row.name}`}
                onClick={() => setPendingDelete({ kind: "single", alert: row })}
              >
                Eliminar
              </Button>
            </div>
          );
        },
      },
    ],
    [
      selectedIds,
      selectedVisibleIds.length,
      toggleSelectRow,
      rowBusyId,
      batchBusy,
      handleToggleAlertActive,
      handleEditAlert,
    ],
  );

  return (
    <div className={["pl-al-root", className].filter(Boolean).join(" ")} data-alerts-view="">
      <header className="pl-al-header">
        <div className="pl-al-header-copy">
          <h1 className="pl-al-title">{title}</h1>
          <p className="pl-al-subtitle">
            Reglas deterministas y Copiloto en español sobre 57 ligas y 34 familias de mercado.
          </p>
        </div>
        <div className="pl-al-header-actions">
          {resolvedAccountReady ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={remoteAlerts.loading}
              onClick={() => {
                setMutatedAlerts(null);
                remoteAlerts.reload();
              }}
            >
              Actualizar
            </Button>
          ) : null}
          <Button variant="primary" size="sm" onClick={handleOpenManualDraft}>
            <MaestroIcon name="plus" size={14} />
            <span>Nueva regla</span>
          </Button>
        </div>
      </header>

      {!canMutateServer ? (
        <SofascoreCard density="compact" className="pl-al-gate-card">
          <div className="pl-al-gate-row">
            <div className="pl-al-gate-copy">
              <strong>
                {resolvedAccountReady
                  ? "Activa tu Pase Ultra para guardar alertas"
                  : "Vista previa de alertas de mercado"}
              </strong>
              <p>
                {resolvedAccountReady
                  ? "Puedes probar el Copiloto y editar borradores; para guardar alertas y recibir avisos push necesitas Pase Ultra vigente."
                  : "Puedes redactar y ajustar reglas con el Copiloto en vista previa. Inicia sesión con cuenta y Pase Ultra para guardarlas y recibir notificaciones."}
              </p>
            </div>
            <div className="pl-al-gate-actions">
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  navigateSafe(resolvedAccountReady ? "/app/account?tab=plan" : "/login?next=%2Fapp%2Falertas")
                }
              >
                {resolvedAccountReady ? "Ver mi plan" : "Iniciar sesión"}
              </Button>
            </div>
          </div>
        </SofascoreCard>
      ) : null}

      <SofascoreKpiStrip items={kpiItems} />

      <SofascoreCard
        title="Copiloto de alertas en español"
        meta={
          copilotSource ? (
            <span className="pl-al-source-pill">{SOURCE_LABELS[copilotSource]}</span>
          ) : (
            <span>5 disparadores</span>
          )
        }
      >
        <form className="pl-al-copilot-form" onSubmit={handleCopilotFormSubmit}>
          <label htmlFor={copilotInputId} className="sr-only">
            Describe tu regla de alerta en español
          </label>
          <div className="pl-al-copilot-row">
            <input
              id={copilotInputId}
              type="text"
              value={copilotPrompt}
              maxLength={400}
              enterKeyHint="send"
              onChange={(event) => {
                setCopilotPrompt(event.target.value);
                if (copilotError) setCopilotError(null);
              }}
              onKeyDown={handleCopilotKeyDown}
              placeholder="Ej. Avísame al abrir 1X2 del América en Liga MX con +4% EV"
              className="pl-al-input pl-al-copilot-input"
              aria-describedby={copilotError ? `${copilotInputId}-err` : undefined}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={copilotBusy}
              className="pl-al-copilot-submit"
            >
              <MaestroIcon name="sparkles" size={14} />
              <span>{copilotBusy ? "Analizando…" : "Interpretar regla"}</span>
            </Button>
          </div>

          <div className="pl-al-examples" role="group" aria-label="Ejemplos rápidos de alertas">
            {COPILOT_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className="pl-al-example-chip"
                onClick={() => {
                  setCopilotPrompt(example);
                  setCopilotError(null);
                }}
              >
                {example}
              </button>
            ))}
          </div>

          {copilotError ? (
            <div id={`${copilotInputId}-err`} className="pl-al-inline-alert is-danger" role="alert">
              <span>{copilotError}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const fallback = parseLocalPreviewPrompt(copilotPrompt, defaultLeague);
                  setEditingAlertId(null);
                  setCopilotSource("local_preview");
                  setLastRawCopilotDraft(fallback);
                  setDraft((prev) => mergeDraftPreservingEdits(prev, fallback, manualEditedFields));
                  setCopilotError(null);
                }}
              >
                Editar como borrador manual
              </Button>
            </div>
          ) : null}
        </form>

        {draft ? (
          <form
            className="pl-al-draft-card"
            data-alert-draft-card=""
            onSubmit={(event) => void handleSaveDraft(event)}
          >
            <div className="pl-al-draft-head">
              <div className="pl-al-draft-title-wrap">
                <h3 className="pl-al-draft-title">
                  {editingAlertId ? "Editar alerta existente" : "Borrador estructurado"}
                </h3>
                {manualEditedFields.size > 0 ? (
                  <span className="pl-al-manual-badge num">
                    {manualEditedFields.size}{" "}
                    {manualEditedFields.size === 1 ? "ajuste manual" : "ajustes manuales"}
                  </span>
                ) : null}
              </div>
              <div className="pl-al-draft-head-actions">
                {lastRawCopilotDraft && manualEditedFields.size > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetManualEdits}
                  >
                    Restablecer sugerencia
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={handleCloseDraft}>
                  Cerrar
                </Button>
              </div>
            </div>

            <div className="pl-al-draft-pills" aria-label="Resumen editable del borrador">
              <span className="pl-al-summary-pill">{TRIGGER_META[draft.trigger].label}</span>
              <span className="pl-al-summary-pill">{leagueLabelOf(draft.league || null)}</span>
              <span className="pl-al-summary-pill">
                {marketFamilyLabelOf(draft.marketFamily || null)}
              </span>
              {draft.thresholdEvPct ? (
                <span className="pl-al-summary-pill num">
                  {draft.trigger === "sharp_steam"
                    ? `Δ ${draft.thresholdEvPct} pp`
                    : `EV +${draft.thresholdEvPct}%`}
                </span>
              ) : null}
              {draft.minDecimal || draft.maxDecimal ? (
                <span className="pl-al-summary-pill num">
                  Momio {draft.minDecimal || "1.01"}–{draft.maxDecimal || "∞"}
                </span>
              ) : null}
            </div>

            <div className="pl-al-draft-grid">
              <div className="pl-al-field pl-al-field--wide">
                <label htmlFor={draftNameId} className="pl-al-label">
                  Nombre de la alerta
                </label>
                <input
                  id={draftNameId}
                  type="text"
                  required
                  maxLength={120}
                  value={draft.name}
                  onChange={(event) => patchDraft({ name: event.target.value })}
                  placeholder="Ej. América 1X2 EV+ en Liga MX"
                  className="pl-al-input"
                />
              </div>

              <div className="pl-al-field">
                <label htmlFor={draftTriggerId} className="pl-al-label">
                  Disparador
                </label>
                <select
                  id={draftTriggerId}
                  value={draft.trigger}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (isMarketAlertTrigger(next)) {
                      patchDraft({ trigger: next });
                    }
                  }}
                  className="pl-al-select"
                >
                  {TRIGGER_ORDER.map((item) => (
                    <option key={item} value={item}>
                      {TRIGGER_META[item].label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pl-al-field">
                <label htmlFor={draftLeagueId} className="pl-al-label">
                  Liga
                </label>
                <select
                  id={draftLeagueId}
                  value={draft.league}
                  onChange={(event) => patchDraft({ league: event.target.value })}
                  className="pl-al-select"
                >
                  <option value="">Todas las ligas</option>
                  {ALL_LEAGUE_OPTIONS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pl-al-field">
                <label htmlFor={draftMarketId} className="pl-al-label">
                  Familia de mercado
                </label>
                <select
                  id={draftMarketId}
                  value={draft.marketFamily}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next === "") {
                      patchDraft({ marketFamily: "" });
                    } else if (isMarketFamilyId(next)) {
                      patchDraft({ marketFamily: next });
                    }
                  }}
                  className="pl-al-select"
                >
                  <option value="">Cualquier mercado</option>
                  {draftSupportedFamilies.map((familyId) => (
                    <option key={familyId} value={familyId}>
                      {MARKET_FAMILIES[familyId].label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pl-al-field">
                <label htmlFor={draftSelectionId} className="pl-al-label">
                  Equipo, jugador o línea
                </label>
                <input
                  id={draftSelectionId}
                  type="text"
                  maxLength={160}
                  value={draft.selection}
                  onChange={(event) => patchDraft({ selection: event.target.value })}
                  placeholder="Ej. América · over 2.5"
                  className="pl-al-input"
                />
              </div>

              <div className="pl-al-field">
                <label htmlFor={draftDirectionId} className="pl-al-label">
                  Dirección
                </label>
                <select
                  id={draftDirectionId}
                  value={draft.direction}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next === "") {
                      patchDraft({ direction: "" });
                    } else if (isMarketAlertDirection(next)) {
                      patchDraft({ direction: next });
                    }
                  }}
                  className="pl-al-select"
                >
                  <option value="">Sin especificar</option>
                  {DIRECTION_ORDER.map((dir) => (
                    <option key={dir} value={dir}>
                      {DIRECTION_LABELS[dir]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pl-al-field">
                <label htmlFor={draftThresholdId} className="pl-al-label">
                  {draft.trigger === "sharp_steam" ? "Umbral Δ no-vig (pp)" : "Umbral EV mínimo (%)"}
                </label>
                <input
                  id={draftThresholdId}
                  type="text"
                  inputMode="decimal"
                  value={draft.thresholdEvPct}
                  onChange={(event) => patchDraft({ thresholdEvPct: event.target.value })}
                  placeholder={draft.trigger === "sharp_steam" ? "3.0" : "3.5"}
                  className="pl-al-input num"
                />
              </div>

              <div className="pl-al-field">
                <label htmlFor={draftMinOddsId} className="pl-al-label">
                  Momio mínimo (decimal)
                </label>
                <input
                  id={draftMinOddsId}
                  type="text"
                  inputMode="decimal"
                  value={draft.minDecimal}
                  onChange={(event) => patchDraft({ minDecimal: event.target.value })}
                  placeholder="1.50"
                  className="pl-al-input num"
                />
              </div>

              <div className="pl-al-field">
                <label htmlFor={draftMaxOddsId} className="pl-al-label">
                  Momio máximo (decimal)
                </label>
                <input
                  id={draftMaxOddsId}
                  type="text"
                  inputMode="decimal"
                  value={draft.maxDecimal}
                  onChange={(event) => patchDraft({ maxDecimal: event.target.value })}
                  placeholder="2.40"
                  className="pl-al-input num"
                />
              </div>

              <div className="pl-al-field">
                <label htmlFor={draftBookId} className="pl-al-label">
                  Casa de referencia
                </label>
                <select
                  id={draftBookId}
                  value={draft.bookmaker}
                  onChange={(event) => patchDraft({ bookmaker: event.target.value })}
                  className="pl-al-select"
                >
                  <option value="">Cualquier casa</option>
                  {bookmakerOptionsForDraft.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pl-al-field">
                <label htmlFor={draftCooldownId} className="pl-al-label">
                  Enfriamiento (minutos)
                </label>
                <div className="pl-al-cooldown-wrap">
                  <input
                    id={draftCooldownId}
                    type="text"
                    inputMode="numeric"
                    value={draft.cooldownMinutes}
                    onChange={(event) => patchDraft({ cooldownMinutes: event.target.value })}
                    className="pl-al-input num"
                  />
                  <div className="pl-al-cooldown-presets" role="group" aria-label="Enfriamientos rápidos">
                    {COOLDOWN_PRESETS.map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        className={`pl-al-preset-btn num ${
                          draft.cooldownMinutes === String(minutes) ? "is-active" : ""
                        }`}
                        onClick={() => patchDraft({ cooldownMinutes: String(minutes) })}
                      >
                        {minutes}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pl-al-field">
                <label htmlFor={draftChannelId} className="pl-al-label">
                  Canal de aviso
                </label>
                <select
                  id={draftChannelId}
                  value={draft.channel}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (isMarketAlertChannel(next)) {
                      patchDraft({ channel: next });
                    }
                  }}
                  className="pl-al-select"
                >
                  {CHANNEL_ORDER.map((ch) => (
                    <option key={ch} value={ch}>
                      {CHANNEL_LABELS[ch]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {draftError ? (
              <p className="pl-al-inline-alert is-danger" role="alert">
                {draftError}
              </p>
            ) : null}

            <div className="pl-al-draft-footer">
              <span className="pl-al-draft-hint">{TRIGGER_META[draft.trigger].hint}</span>
              <div className="pl-al-draft-actions">
                <Button variant="secondary" size="sm" onClick={handleCloseDraft}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={savingDraft}
                  data-save-alert-btn=""
                >
                  {savingDraft
                    ? "Guardando…"
                    : editingAlertId
                      ? "Guardar cambios"
                      : "Guardar alerta"}
                </Button>
              </div>
            </div>
          </form>
        ) : null}
      </SofascoreCard>

      {feedbackMessage ? (
        <div
          className={`pl-al-inline-alert is-${feedbackMessage.tone}`}
          role={feedbackMessage.tone === "danger" ? "alert" : "status"}
        >
          <span>{feedbackMessage.text}</span>
          <Button variant="ghost" size="sm" onClick={() => setFeedbackMessage(null)}>
            Ocultar
          </Button>
        </div>
      ) : null}

      <section className="pl-al-list-section" aria-label="Alertas guardadas">
        <div className="pl-al-list-toolbar">
          <SofascoreTabs
            items={statusTabs}
            value={statusTab}
            onChange={(next) => {
              if (next === "all" || next === "active" || next === "paused") {
                setStatusTab(next);
                setVisibleCount(PAGE_SIZE);
              }
            }}
            variant="segmented"
            ariaLabel="Filtrar alertas por estado"
          />
        </div>

        <SofascoreFilterBar
          searchValue={searchQuery}
          onSearchChange={(next) => {
            setSearchQuery(next);
            setVisibleCount(PAGE_SIZE);
          }}
          searchPlaceholder="Buscar por nombre, liga o selección…"
          resultCount={filteredAlerts.length}
        >
          <label htmlFor={filterTriggerId} className="sr-only">
            Filtrar por disparador
          </label>
          <select
            id={filterTriggerId}
            value={triggerFilter}
            onChange={(event) => {
              setTriggerFilter(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            className="pl-al-select pl-al-filter-select"
          >
            <option value="all">Todos los disparadores</option>
            {TRIGGER_ORDER.map((trigger) => (
              <option key={trigger} value={trigger}>
                {TRIGGER_META[trigger].label}
              </option>
            ))}
          </select>

          {availableLeagueFilterIds.length > 0 ? (
            <>
              <label htmlFor={filterLeagueId} className="sr-only">
                Filtrar por liga
              </label>
              <select
                id={filterLeagueId}
                value={leagueFilter}
                onChange={(event) => {
                  setLeagueFilter(event.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                className="pl-al-select pl-al-filter-select"
              >
                <option value="all">Todas las ligas</option>
                {availableLeagueFilterIds.map((leagueId) => (
                  <option key={leagueId} value={leagueId}>
                    {leagueLabelOf(leagueId)}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </SofascoreFilterBar>

        {selectedVisibleIds.length > 0 ? (
          <div className="pl-al-batch-bar" role="region" aria-label="Acciones en lote">
            <span className="pl-al-batch-count num">
              {selectedVisibleIds.length} seleccionada(s) (máx. {MAX_BATCH_OPS})
            </span>
            <div className="pl-al-batch-actions">
              <Button
                variant="secondary"
                size="sm"
                disabled={batchBusy}
                onClick={() => void executeBatch("pause", selectedVisibleIds)}
              >
                Pausar lote
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={batchBusy}
                onClick={() => void executeBatch("resume", selectedVisibleIds)}
              >
                Activar lote
              </Button>
              <Button
                variant="secondary"
                tone="danger"
                size="sm"
                disabled={batchBusy}
                onClick={() =>
                  setPendingDelete({ kind: "batch", ids: selectedVisibleIds })
                }
              >
                Eliminar lote
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={batchBusy}
                onClick={() => setSelectedIds(new Set())}
              >
                Limpiar
              </Button>
            </div>
          </div>
        ) : null}

        {remoteAlerts.error && resolvedAccountReady ? (
          <div className="pl-al-inline-alert is-danger" role="alert">
            <span>{remoteAlerts.error}</span>
            <Button variant="secondary" size="sm" onClick={remoteAlerts.reload}>
              Reintentar
            </Button>
          </div>
        ) : null}

        <SofascoreTable
          caption="Lista de alertas de mercado configuradas"
          columns={columns}
          rows={visibleAlerts}
          rowKey={(row) => row.id}
          emptyState={
            <SofascoreEmptyState
              title={
                alerts.length === 0
                  ? "Sin alertas guardadas todavía"
                  : "Ninguna alerta coincide con tus filtros"
              }
              description={
                alerts.length === 0
                  ? "Usa el Copiloto en español o crea una regla manual para monitorear aperturas, steam sharp y líneas con valor esperado."
                  : "Prueba limpiando la búsqueda o seleccionando otro disparador."
              }
              actionLabel={alerts.length === 0 ? "Crear primera regla" : "Limpiar filtros"}
              onAction={
                alerts.length === 0
                  ? handleOpenManualDraft
                  : () => {
                      setSearchQuery("");
                      setTriggerFilter("all");
                      setLeagueFilter("all");
                      setStatusTab("all");
                    }
              }
            />
          }
        />

        {filteredAlerts.length > visibleCount ? (
          <div className="pl-al-pagination">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            >
              Mostrar más ({filteredAlerts.length - visibleCount} restantes)
            </Button>
          </div>
        ) : null}
      </section>

      <ConfirmActionDialog
        open={pendingDelete !== null}
        title={
          pendingDelete?.kind === "batch"
            ? `¿Eliminar ${pendingDelete.ids.length} alertas seleccionadas?`
            : `¿Eliminar «${pendingDelete?.alert.name ?? ""}»?`
        }
        description="Esta acción elimina las reglas seleccionadas de forma permanente y dejarás de recibir sus notificaciones."
        confirmLabel={pendingDelete?.kind === "batch" ? "Eliminar lote" : "Eliminar alerta"}
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
