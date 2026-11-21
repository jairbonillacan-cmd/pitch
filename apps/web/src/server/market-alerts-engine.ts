import { createHash } from "node:crypto";
import { z } from "zod";
import {
  COMPETITION_CATALOG,
  containsForbiddenFd16Term,
  FOOTBALL_MARKET_FAMILY_IDS,
  getLeagueCapability,
  isSafePublicLabel,
  MARKET_FAMILY_IDS,
  MLB_MARKET_FAMILY_IDS,
  NBA_MARKET_FAMILY_IDS,
  NFL_MARKET_FAMILY_IDS,
  NHL_MARKET_FAMILY_IDS,
  type MarketFamilyId,
  type PlatformSport,
  type ProductLeagueKey,
} from "@pitchlab/contracts";
import type {
  CreateMarketAlertInput,
  MarketAlertChannel,
  MarketAlertDirection,
  MarketAlertRow,
  MarketAlertTrigger,
} from "@pitchlab/db/market-alerts";
import { PRODUCT_LEAGUES } from "./snapshots";

export const ALERT_TRIGGERS = [
  "market_opened",
  "sharp_steam",
  "stale_line_ev",
  "lineup_confirmed",
  "schedule_change",
] as const;

export const ALERT_DIRECTIONS = [
  "any",
  "over",
  "under",
  "home",
  "away",
  "draw",
] as const;

export const ALERT_CHANNELS = ["push", "in_app", "both"] as const;

export const ALERT_PLAYER_STAT_KEYS = [
  "shots",
  "shots_on_target",
  "goal_or_assist",
  "fouls",
  "cards",
  "PTS",
  "REB",
  "AST",
  "3PM",
] as const;

export type AlertPlayerStatKey = (typeof ALERT_PLAYER_STAT_KEYS)[number];

export const ALERT_REJECT_CODES = [
  "invalid_prompt",
  "prompt_injection",
  "forbidden_fd16",
  "forbidden_betting_or_execution",
  "unsupported_sport",
  "unsupported_league",
  "unsupported_market_family",
] as const;

export type AlertRejectCode = (typeof ALERT_REJECT_CODES)[number];

const MARKET_FAMILY_TUPLE = [
  ...FOOTBALL_MARKET_FAMILY_IDS,
  ...NBA_MARKET_FAMILY_IDS,
  ...MLB_MARKET_FAMILY_IDS,
  ...NHL_MARKET_FAMILY_IDS,
  ...NFL_MARKET_FAMILY_IDS,
] as const;

const PRODUCT_LEAGUE_SET: ReadonlySet<string> = new Set(PRODUCT_LEAGUES);
const MARKET_FAMILY_SET: ReadonlySet<string> = new Set(MARKET_FAMILY_IDS);

export function isProductLeagueId(value: string): value is ProductLeagueKey {
  return PRODUCT_LEAGUE_SET.has(value);
}

export function isCanonicalMarketFamily(value: string): value is MarketFamilyId {
  return MARKET_FAMILY_SET.has(value);
}

export const AlertTriggerSchema = z.enum(ALERT_TRIGGERS);
export const AlertDirectionSchema = z.enum(ALERT_DIRECTIONS);
export const AlertChannelSchema = z.enum(ALERT_CHANNELS);
export const AlertMarketFamilySchema = z.enum(MARKET_FAMILY_TUPLE);
export const AlertPlayerStatKeySchema = z.enum(ALERT_PLAYER_STAT_KEYS);
export const AlertRejectCodeSchema = z.enum(ALERT_REJECT_CODES);
export const AlertCooldownMinutesSchema = z.number().int().min(5).max(1440);
export const AlertSportSchema = z.enum([
  "football",
  "american-football",
  "basketball",
  "ice-hockey",
  "baseball",
]);
export const AlertLeagueSchema = z
  .string()
  .trim()
  .refine(isProductLeagueId, "Liga fuera del catálogo de PitchLab")
  .transform((value): ProductLeagueKey => {
    const matched = PRODUCT_LEAGUES.find((item) => item === value);
    return matched ?? "liga-mx";
  });

export const MarketAlertRuleSchema = z
  .object({
    trigger: AlertTriggerSchema,
    sport: AlertSportSchema,
    league: AlertLeagueSchema,
    marketFamily: AlertMarketFamilySchema.nullable(),
    teamQuery: z.string().trim().min(1).max(80).nullable(),
    playerQuery: z.string().trim().min(1).max(80).nullable(),
    playerStatKey: AlertPlayerStatKeySchema.nullable().optional(),
    direction: AlertDirectionSchema.nullable(),
    line: z.number().finite().min(-100).max(500).nullable(),
    minEvPct: z.number().finite().min(0).max(200).nullable(),
    minDeltaNoVigPp: z.number().finite().min(0.1).max(50).nullable(),
    preferredBook: z.string().trim().min(2).max(40).nullable(),
    recurring: z.boolean(),
    minDecimal: z.number().finite().gt(1).lte(1000).nullable().optional(),
    maxDecimal: z.number().finite().gt(1).lte(1000).nullable().optional(),
    cooldownMinutes: AlertCooldownMinutesSchema.optional(),
    channel: AlertChannelSchema.optional(),
    name: z.string().trim().min(2).max(120).optional(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    const capability = getLeagueCapability(rule.league);
    if (!capability) {
      ctx.addIssue({
        code: "custom",
        message: "Liga no soportada",
        path: ["league"],
      });
      return;
    }
    if (capability.sport !== rule.sport) {
      ctx.addIssue({
        code: "custom",
        message: "El deporte no coincide con la liga",
        path: ["sport"],
      });
    }
    if (rule.marketFamily !== null && !capability.supportedMarketFamilies.includes(rule.marketFamily)) {
      ctx.addIssue({
        code: "custom",
        message: "Familia de mercado no disponible para la liga",
        path: ["marketFamily"],
      });
    }
    if (rule.trigger !== "schedule_change" && rule.marketFamily === null) {
      ctx.addIssue({
        code: "custom",
        message: "Se requiere una familia de mercado válida",
        path: ["marketFamily"],
      });
    }
    if (
      rule.minDecimal !== undefined &&
      rule.minDecimal !== null &&
      rule.maxDecimal !== undefined &&
      rule.maxDecimal !== null &&
      rule.minDecimal > rule.maxDecimal
    ) {
      ctx.addIssue({
        code: "custom",
        message: "El momio mínimo no puede superar al máximo",
        path: ["minDecimal"],
      });
    }
    const textFields = [rule.teamQuery, rule.playerQuery, rule.preferredBook, rule.name];
    for (const field of textFields) {
      if (field && !isSafePublicLabel(field)) {
        ctx.addIssue({
          code: "custom",
          message: "Texto no permitido en la alerta",
        });
      }
    }
  });

export interface MarketAlertRule {
  readonly trigger: MarketAlertTrigger;
  readonly sport: PlatformSport;
  readonly league: ProductLeagueKey;
  readonly marketFamily: MarketFamilyId | null;
  readonly teamQuery: string | null;
  readonly playerQuery: string | null;
  readonly playerStatKey?: AlertPlayerStatKey | null;
  readonly direction: MarketAlertDirection | null;
  readonly line: number | null;
  readonly minEvPct: number | null;
  readonly minDeltaNoVigPp: number | null;
  readonly preferredBook: string | null;
  readonly recurring: boolean;
  readonly minDecimal?: number | null;
  readonly maxDecimal?: number | null;
  readonly cooldownMinutes?: number;
  readonly channel?: MarketAlertChannel;
  readonly name?: string;
}

export type ParseAlertPromptResult =
  | { readonly outcome: "accept"; readonly rule: MarketAlertRule }
  | {
      readonly outcome: "reject";
      readonly rejectCode: AlertRejectCode;
      readonly message: string;
    };

export type ScheduleChangeKind =
  | "time_changed"
  | "venue_changed"
  | "postponed"
  | "canceled"
  | "rescheduled";

export interface MarketAlertCandidateEvent {
  readonly trigger: MarketAlertTrigger;
  readonly gameId: string;
  readonly league: string;
  readonly sport?: PlatformSport;
  readonly matchLabel?: string;
  readonly marketFamily?: MarketFamilyId | null;
  readonly teamNames?: readonly string[];
  readonly playerName?: string | null;
  readonly playerStatKey?: AlertPlayerStatKey | null;
  readonly direction?: MarketAlertDirection | null;
  readonly line?: number | null;
  readonly bookmaker?: string | null;
  readonly bookDecimal?: number | null;
  readonly fairDecimal?: number | null;
  readonly sharpFairDecimal?: number | null;
  readonly modelProb?: number | null;
  readonly evPct?: number | null;
  readonly deltaNoVigPp?: number | null;
  readonly marketOpened?: boolean;
  readonly isStaleBook?: boolean;
  readonly lineupStatus?: "confirmed" | "probable" | "unknown" | null;
  readonly isStarter?: boolean;
  readonly scheduleChangeKind?: ScheduleChangeKind | null;
  readonly previousKickoffIso?: string | null;
  readonly nextKickoffIso?: string | null;
  readonly previousVenue?: string | null;
  readonly nextVenue?: string | null;
  readonly occurredAtIso?: string;
}

export interface MarketAlertEvaluatableRule {
  readonly id?: string;
  readonly name?: string;
  readonly trigger: MarketAlertTrigger;
  readonly league: string | null;
  readonly marketFamily: MarketFamilyId | null;
  readonly teamQuery?: string | null;
  readonly playerQuery?: string | null;
  readonly playerStatKey?: AlertPlayerStatKey | null;
  readonly selection?: string | null;
  readonly direction?: MarketAlertDirection | null;
  readonly line?: number | null;
  readonly minEvPct?: number | null;
  readonly thresholdEvPct?: number | null;
  readonly minDeltaNoVigPp?: number | null;
  readonly preferredBook?: string | null;
  readonly bookmaker?: string | null;
  readonly minDecimal?: number | null;
  readonly maxDecimal?: number | null;
  readonly cooldownMinutes?: number;
  readonly active?: boolean;
  readonly lastFiredAtIso?: string | null;
  readonly lastFiredHash?: string | null;
}

export interface MarketAlertFiredPayload {
  readonly title: string;
  readonly body: string;
  readonly gameId: string;
  readonly league: string;
  readonly trigger: MarketAlertTrigger;
  readonly marketFamily: MarketFamilyId | null;
  readonly dedupeHash: string;
  readonly occurredAtIso: string;
  readonly metrics: {
    readonly evPct: number | null;
    readonly deltaNoVigPp: number | null;
    readonly bookDecimal: number | null;
    readonly fairDecimal: number | null;
    readonly line: number | null;
  };
}

export interface EvaluateMarketAlertResult {
  readonly matched: boolean;
  readonly reason: string;
  readonly dedupeHash: string;
  readonly payload?: MarketAlertFiredPayload;
}

const DIACRITICS_RE = /[\u0300-\u036f]/g;
const PROMPT_INJECTION_RE =
  /<\/?(?:solicitud_socio|system|instructions?)\b|\b(?:ignore\s+(?:all\s+)?previous(?:\s+instructions)?|disregard\s+(?:all\s+)?instructions|ignora\s+(?:todas?\s+|todo\s+lo\s+)?(?:las?\s+|tus?\s+)?(?:instrucciones|reglas|anterior(?:es)?)|olvida\s+(?:todas?\s+|todo\s+lo\s+)?(?:las?\s+|tus?\s+)?(?:reglas|instrucciones|anterior(?:es)?)|override\s+system|jailbreak|revela\s+tus\s+instrucciones|muestra\s+el\s+prompt)\b|\b(?:system|assistant|developer)\s*:/i;

const FORBIDDEN_BETTING_RE =
  /\b(?:apuestas?\s+seguras?|garantizad[oa]s?|sin\s+riesgo|risk[\s-]?free|sure\s*bets?|ganancias?\s+seguras?|100\s*%\s*segur[oa]s?|no\s+(?:puede|va\s+a)\s+fallar|metele\s+\d+|coloc(?:a|ar)\s+(?:una\s+|las?\s+)?apuestas?|ejecut(?:a|ar)\s+(?:una\s+|las?\s+)?apuestas?|apuestas?\s+automatic[oa]?s?|apostar\s+automatic[a-z]*|auto[\s-]?bets?|automaticamente\s+en\s+mi\s+casa|stake|unidades\s+de\s+stake|all[\s-]?in)\b/i;

const UNSUPPORTED_SPORT_RE =
  /\b(?:formula\s*1|f1|gran\s+premio|motogp|nascar|tenis|atp|wta|grand\s+slam|wimbledon|roland\s+garros|ufc|mma|boxeo|boxing|golf|pga|ciclismo|tour\s+de\s+francia|cricket|rugby|esports|league\s+of\s+legends|valorant|cs2|dardos|snooker|voleibol|balonmano|handball|padel|caballos|galgos)\b/i;

const UNSUPPORTED_LEAGUE_RE =
  /\b(?:ncaaf|ncaa\s+football|ncaab|ncaa\s+basketball|wnba|khl|npb|liga\s+de\s+expansion|tercera\s+division|liga\s+marciana|superliga\s+china|xfl|ufl|cfl|liga\s+mx\s+femenil|femenil|femenina|g[\s-]?league|premier\s+league\s+2|youth\s+league|euroliga|euroleague|liga\s+acb|serie\s+c|mls\s+next\s+pro)\b/i;

const UNSUPPORTED_MARKET_RE =
  /\b(?:saques?\s+de\s+banda|throw[\s-]?ins?|minuto\s+exacto\s+del\s+primer\s+gol|minuto\s+del\s+primer\s+gol|primer\s+saque\s+de\s+centro|autogol|penalti\s+fallado|revision\s+var|tiempo\s+anadido|fueras?\s+de\s+lugar|offsides?|expulsion\s+de\s+entrenador|vuelta\s+rapida|pole\s+position|triple\s+doble|doble\s+doble|primer\s+canasta|marcador\s+exacto\s+al\s+minuto)\b/i;

const SCHEDULE_CHANGE_TRIGGER_RE =
  /\b(?:cambio\s+de\s+horario|cambio\s+de\s+sede|horario,\s*sede|aplazamiento|pospuesto|reprogramad[oa]|suspendid[oa]|cambio\s+de\s+fecha)\b/i;

const LINEUP_CONFIRMED_TRIGGER_RE =
  /\b(?:confirmad[oa]\s+como\s+titular|salga\s+(?:confirmad[oa]\s+)?(?:como\s+)?titular|titular\s+confirmad[oa]|alineaci[oó]n\s+confirmada|xi\s+confirmad[oa]|once\s+inicial\s+confirmado)\b/i;

const STALE_LINE_TRIGGER_RE =
  /\b(?:rezagad[oa]|l[ií]nea\s+rezagada|cuota\s+rezagada|desfasad[oa]|stale\s*line|lenta\s+en\s+ajustar)\b/i;

const SHARP_STEAM_TRIGGER_RE =
  /\b(?:movimiento\s+sharp|steam\s+sharp|\bsteam\b|\bsharp\b|puntos\s+porcentuales\s+no[\s-]?vig|se\s+mueve\s+\d+(?:[.,]\d+)?\s*(?:puntos\s+porcentuales|pp)\b)\b/i;

const MARKET_OPENED_TRIGGER_RE =
  /\b(?:abran|abra|al\s+abrir|cuando\s+salga|en\s+cuanto\s+salga|salga\s+el\s+mercado|publiquen|publique|apertura\s+de\s+l[ií]neas?|salgan\s+las\s+l[ií]neas?)\b/i;

const RECURRING_RE =
  /\b(?:recurrente|cada\s+jornada|cada\s+partido|cada\s+semana|siempre\s+que|todos\s+los\s+partidos)\b/i;

interface BookAlias {
  readonly key: string;
  readonly pattern: RegExp;
}

const BOOK_ALIASES: readonly BookAlias[] = [
  { key: "pinnacle", pattern: /\bpinnacle\b/i },
  { key: "bet365", pattern: /\bbet\s*365\b/i },
  { key: "caliente", pattern: /\bcaliente(?:\.mx|\s+mx)?\b/i },
  { key: "codere", pattern: /\bcodere\b/i },
  { key: "betano", pattern: /\bbetano\b/i },
  { key: "draftkings", pattern: /\bdraft\s*kings\b/i },
  { key: "fanduel", pattern: /\bfan\s*duel\b/i },
  { key: "betmgm", pattern: /\bbet\s*mgm\b/i },
  { key: "caesars", pattern: /\bcaesars\b/i },
  { key: "1xbet", pattern: /\b1xbet\b/i },
  { key: "betway", pattern: /\bbetway\b/i },
  { key: "strendus", pattern: /\bstrendus\b/i },
  { key: "playdoit", pattern: /\bplaydoit\b/i },
  { key: "novibet", pattern: /\bnovibet\b/i },
  { key: "winpot", pattern: /\bwinpot\b/i },
  { key: "betcris", pattern: /\bbetcris\b/i },
  { key: "bwin", pattern: /\bbwin\b/i },
  { key: "unibet", pattern: /\bunibet\b/i },
  { key: "betsson", pattern: /\bbetsson\b/i },
];

interface LeagueAlias {
  readonly league: ProductLeagueKey;
  readonly aliasFolded: string;
  readonly regex: RegExp;
}

function foldText(raw: string): string {
  return raw.normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase();
}

export function hasExplicitUnsupportedLeague(promptEs: string): boolean {
  if (typeof promptEs !== "string") return false;
  return UNSUPPORTED_LEAGUE_RE.test(foldText(promptEs));
}

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLeagueAliases(): readonly LeagueAlias[] {
  const rawPairs: Array<[ProductLeagueKey, string]> = [
    ["liga-mx", "liga bbva mx"],
    ["liga-mx", "liga mx"],
    ["liga-mx", "ligamx"],
    ["premier-league", "premier league"],
    ["premier-league", "epl"],
    ["premier-league", "premier"],
    ["laliga", "la liga"],
    ["laliga", "laliga"],
    ["laliga", "liga espanola"],
    ["bundesliga-2", "2. bundesliga"],
    ["bundesliga-2", "bundesliga 2"],
    ["bundesliga", "bundesliga"],
    ["serie-b", "serie b italia"],
    ["serie-b", "serie b"],
    ["serie-a", "serie a"],
    ["ligue-2", "ligue 2"],
    ["ligue-1", "ligue 1"],
    ["concacaf-champions", "concacaf champions cup"],
    ["concacaf-champions", "concacaf champions"],
    ["concacaf-champions", "concachampions"],
    ["caf-champions", "caf champions league"],
    ["caf-champions", "caf champions"],
    ["champions-league", "uefa champions league"],
    ["champions-league", "champions league"],
    ["champions-league", "champions"],
    ["europa-league", "uefa europa league"],
    ["europa-league", "europa league"],
    ["conference-league", "uefa conference league"],
    ["conference-league", "conference league"],
    ["libertadores", "copa libertadores"],
    ["libertadores", "libertadores"],
    ["sudamericana", "copa sudamericana"],
    ["sudamericana", "sudamericana"],
    ["mls", "major league soccer"],
    ["mls", "mls"],
    ["leagues-cup", "leagues cup"],
    ["nfl", "nfl"],
    ["nba", "nba"],
    ["mlb", "grandes ligas"],
    ["mlb", "mlb"],
    ["nhl", "nhl"],
  ];

  for (const meta of COMPETITION_CATALOG) {
    if (!isProductLeagueId(meta.id)) continue;
    rawPairs.push([meta.id, meta.label]);
    if (foldText(meta.shortLabel).trim() !== foldText(meta.country).trim()) {
      rawPairs.push([meta.id, meta.shortLabel]);
    }
    rawPairs.push([meta.id, meta.id.replace(/-/g, " ")]);
    rawPairs.push([meta.id, meta.id]);
  }

  const deduped = new Map<string, LeagueAlias>();
  for (const [league, label] of rawPairs) {
    const aliasFolded = foldText(label).replace(/\s+/g, " ").trim();
    if (aliasFolded.length < 3) continue;
    const key = `${league}:${aliasFolded}`;
    if (deduped.has(key)) continue;
    deduped.set(key, {
      league,
      aliasFolded,
      regex: new RegExp(`(?<![a-z0-9])${escapeRegExp(aliasFolded)}(?![a-z0-9])`, "i"),
    });
  }

  return Array.from(deduped.values()).sort((a, b) => b.aliasFolded.length - a.aliasFolded.length);
}

const LEAGUE_ALIASES = buildLeagueAliases();

function parseNumberLiteral(raw: string | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.trim().replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function detectLeague(promptEs: string): {
  readonly league: ProductLeagueKey | null;
  readonly matchedFolded: string | null;
} {
  const folded = foldText(promptEs);
  for (const entry of LEAGUE_ALIASES) {
    if (entry.regex.test(folded)) {
      return { league: entry.league, matchedFolded: entry.aliasFolded };
    }
  }
  return { league: null, matchedFolded: null };
}

function detectBookmaker(promptEs: string): {
  readonly book: string | null;
  readonly pattern: RegExp | null;
} {
  for (const entry of BOOK_ALIASES) {
    if (entry.pattern.test(promptEs)) {
      return { book: entry.key, pattern: entry.pattern };
    }
  }
  return { book: null, pattern: null };
}

function detectTrigger(promptEs: string, minDeltaNoVigPp: number | null): MarketAlertTrigger {
  if (SCHEDULE_CHANGE_TRIGGER_RE.test(promptEs)) return "schedule_change";
  if (LINEUP_CONFIRMED_TRIGGER_RE.test(promptEs)) return "lineup_confirmed";
  if (STALE_LINE_TRIGGER_RE.test(promptEs)) return "stale_line_ev";
  if (SHARP_STEAM_TRIGGER_RE.test(promptEs) || minDeltaNoVigPp !== null) return "sharp_steam";
  if (MARKET_OPENED_TRIGGER_RE.test(promptEs)) return "market_opened";
  return "market_opened";
}

function detectMinDeltaNoVigPp(promptEs: string): number | null {
  const match =
    /(?:al\s+menos\s+|de\s+|mueve\s+|mayor\s+(?:a|de)\s+)?(\d+(?:[.,]\d+)?)\s*(?:puntos\s+porcentuales|pp)\b/i.exec(
      promptEs,
    );
  return parseNumberLiteral(match?.[1]);
}

function detectMinEvPct(promptEs: string): number | null {
  const suffixMatch =
    /(?:\+\s*)?(\d+(?:[.,]\d+)?)\s*%\s*(?:de\s+)?(?:ev|valor(?:\s+esperado)?|ventaja)\b/i.exec(
      promptEs,
    );
  if (suffixMatch?.[1]) {
    return parseNumberLiteral(suffixMatch[1]);
  }
  const prefixMatch =
    /(?:valor(?:\s+esperado)?|ev|ventaja)\s+(?:m[ií]nim[oa]\s+de\s+|de\s+al\s+menos\s+|al\s+menos\s+|mayor\s+(?:a|de)\s+|de\s+)?(?:\+\s*)?(\d+(?:[.,]\d+)?)\s*%/i.exec(
      promptEs,
    );
  if (prefixMatch?.[1]) {
    return parseNumberLiteral(prefixMatch[1]);
  }
  return null;
}

function detectDirectionAndLine(promptEs: string): {
  readonly direction: MarketAlertDirection | null;
  readonly line: number | null;
} {
  const overMatch =
    /(?:m[aá]s\s+de|over|arriba\s+de|encima\s+de)\s+(\d+(?:[.,]\d+)?)(?!\d|[.,]\d)(?!\s*(?:%|puntos\s+porcentuales|pp\b))/i.exec(
      promptEs,
    );
  if (overMatch?.[1]) {
    return { direction: "over", line: parseNumberLiteral(overMatch[1]) };
  }
  const underMatch =
    /(?:menos\s+de|under|debajo\s+de|abajo\s+de)\s+(\d+(?:[.,]\d+)?)(?!\d|[.,]\d)(?!\s*(?:%|puntos\s+porcentuales|pp\b))/i.exec(
      promptEs,
    );
  if (underMatch?.[1]) {
    return { direction: "under", line: parseNumberLiteral(underMatch[1]) };
  }
  return { direction: null, line: null };
}

function detectMarketFamilyAndStat(
  promptEs: string,
  sport: PlatformSport,
  trigger: MarketAlertTrigger,
): {
  readonly marketFamily: MarketFamilyId | null;
  readonly playerStatKey?: AlertPlayerStatKey;
} {
  const folded = foldText(promptEs);

  if (trigger === "schedule_change") {
    const hasExplicitMarket =
      /\b(?:1x2|corners?|tarjetas?|goles|btts|ambos\s+anotan|spread|totales|moneyline|prop|f5|handicap)\b/i.test(
        folded,
      );
    if (!hasExplicitMarket) {
      return { marketFamily: null };
    }
  }

  if (sport === "basketball") {
    if (/\btotales?\s+de\s+puntos\b|\btotal\s+de\s+puntos\b|\baltas\/bajas\b|\bover\/under\b/i.test(folded)) {
      return { marketFamily: "nba_totals" };
    }
    if (/\b(?:prop|triples|3pm|rebotes|asistencias)\b/i.test(folded)) {
      let playerStatKey: AlertPlayerStatKey = "PTS";
      if (/\b(?:triples|3pm|tiros\s+de\s+3)\b/i.test(folded)) playerStatKey = "3PM";
      else if (/\b(?:rebotes|reb)\b/i.test(folded)) playerStatKey = "REB";
      else if (/\b(?:asistencias|ast)\b/i.test(folded)) playerStatKey = "AST";
      return { marketFamily: "nba_player_props", playerStatKey };
    }
    if (/\b(?:spread|handicap|diferencia\s+de\s+puntos)\b/i.test(folded)) {
      return { marketFamily: "nba_spread" };
    }
    if (/\b(?:totales?|puntos)\b/i.test(folded)) {
      return { marketFamily: "nba_totals" };
    }
    if (/\b(?:moneyline|ganador|a\s+ganar|\bml\b)\b/i.test(folded)) {
      return { marketFamily: "nba_moneyline" };
    }
    return { marketFamily: null };
  }

  if (sport === "american-football") {
    if (/\b(?:spread|handicap|linea\s+de\s+puntos)\b/i.test(folded)) {
      return { marketFamily: "nfl_spread" };
    }
    if (/\b(?:totales?|puntos\s+totales|over\/under|altas\/bajas)\b/i.test(folded)) {
      return { marketFamily: "nfl_totals" };
    }
    if (/\b(?:moneyline|ganador|a\s+ganar|\bml\b)\b/i.test(folded)) {
      return { marketFamily: "nfl_moneyline" };
    }
    return { marketFamily: null };
  }

  if (sport === "baseball") {
    if (/\b(?:f5|primeras?\s+5\s+entradas|5\s+entradas|first\s+5)\b/i.test(folded)) {
      return { marketFamily: "mlb_f5" };
    }
    if (/\b(?:run\s*line|handicap|linea\s+de\s+carreras)\b/i.test(folded)) {
      return { marketFamily: "mlb_run_line" };
    }
    if (/\b(?:totales?|carreras\s+totales|over\/under|altas\/bajas)\b/i.test(folded)) {
      return { marketFamily: "mlb_totals" };
    }
    if (/\b(?:moneyline|ganador|a\s+ganar|\bml\b)\b/i.test(folded)) {
      return { marketFamily: "mlb_moneyline" };
    }
    return { marketFamily: null };
  }

  if (sport === "ice-hockey") {
    if (/\b(?:puck\s*line|handicap)\b/i.test(folded)) {
      return { marketFamily: "nhl_puck_line" };
    }
    if (/\b(?:totales?|goles\s+totales|over\/under|altas\/bajas)\b/i.test(folded)) {
      return { marketFamily: "nhl_totals" };
    }
    if (/\b(?:moneyline|ganador|a\s+ganar|\bml\b)\b/i.test(folded)) {
      return { marketFamily: "nhl_moneyline" };
    }
    return { marketFamily: null };
  }

  if (/\b(?:prop|su\s+prop|jugador)\b/i.test(folded) || trigger === "lineup_confirmed") {
    let playerStatKey: AlertPlayerStatKey | undefined;
    if (/\b(?:remates?\s+a\s+puerta|tiros?\s+a\s+puerta|al\s+arco|\bsot\b)\b/i.test(folded)) {
      playerStatKey = "shots_on_target";
    } else if (/\b(?:gol\s+o\s+asistencia|goles?\s+o\s+asistencia|anota|asistencia)\b/i.test(folded)) {
      playerStatKey = "goal_or_assist";
    } else if (/\b(?:remates?|tiros?)\b/i.test(folded)) {
      playerStatKey = "shots";
    } else if (/\b(?:faltas?)\b/i.test(folded)) {
      playerStatKey = "fouls";
    } else if (/\b(?:tarjetas?|amonest)\b/i.test(folded)) {
      playerStatKey = "cards";
    }
    if (playerStatKey || /\bprop\b/i.test(folded)) {
      return {
        marketFamily: "player_props_football",
        ...(playerStatKey ? { playerStatKey } : {}),
      };
    }
  }

  if (/\b(?:corners?|tiros?\s+de\s+esquina)\s+(?:por\s+equipo|de\s+equipo|individuales?)\b/i.test(folded)) {
    return { marketFamily: "corners_team" };
  }
  if (/\b(?:corners?|tiros?\s+de\s+esquina)\b/i.test(folded)) {
    return { marketFamily: "corners_total" };
  }
  if (/\b(?:tarjetas?(?:\s+amarillas?)?|amonestaciones)\b/i.test(folded)) {
    return { marketFamily: "cards_total" };
  }
  if (/\bfaltas?\b/i.test(folded)) {
    return { marketFamily: "fouls_total" };
  }
  if (/\b(?:remates?\s+a\s+puerta|tiros?\s+a\s+puerta|tiros?\s+al\s+arco)\b/i.test(folded)) {
    return { marketFamily: "shots_on_target" };
  }
  if (/\b(?:remates?\s+totales|tiros?\s+totales)\b/i.test(folded)) {
    return { marketFamily: "shots_total" };
  }
  if (/\b(?:1x2\s*\+\s*(?:btts|ambos)|gana\s+y\s+ambos\s+anotan)\b/i.test(folded)) {
    return { marketFamily: "combo_1x2_btts" };
  }
  if (/\b(?:1x2\s*\+\s*(?:over|mas)|gana\s+y\s+mas\s+de)\b/i.test(folded)) {
    return { marketFamily: "combo_1x2_over" };
  }
  if (/\b(?:ambos\s+anotan|ambos\s+equipos\s+anotan|\bbtts\b|ambos\s+marcan)\b/i.test(folded)) {
    return { marketFamily: "btts" };
  }
  if (/\b(?:porteria\s+a\s+cero|arco\s+en\s+cero|clean\s+sheet)\b/i.test(folded)) {
    return { marketFamily: "clean_sheet" };
  }
  if (/\b(?:gana\s+a\s+cero|victoria\s+a\s+cero|win\s+to\s+nil)\b/i.test(folded)) {
    return { marketFamily: "win_to_nil" };
  }
  if (/\b(?:handicap\s+asiatico|asian\s+handicap|\bhandicap\b)\b/i.test(folded)) {
    return { marketFamily: "asian_handicap" };
  }
  if (/\b(?:doble\s+oportunidad|double\s+chance|\b1x\b|\bx2\b)\b/i.test(folded)) {
    return { marketFamily: "double_chance" };
  }
  if (/\b(?:empate\s+no\s+accion|apuesta\s+sin\s+empate|draw\s+no\s+bet|\bdnb\b)\b/i.test(folded)) {
    return { marketFamily: "dnb" };
  }
  if (/\b(?:primer\s+tiempo|resultado\s+al\s+descanso|\b1t\b|half\s*time)\b/i.test(folded)) {
    return { marketFamily: "half_time_result" };
  }
  if (/\b(?:segundo\s+tiempo|segunda\s+mitad|\b2t\b)\b/i.test(folded)) {
    return { marketFamily: "second_half_result" };
  }
  if (/\b(?:goles?\s+(?:por|de)\s+equipo|totales?\s+de\s+equipo)\b/i.test(folded)) {
    return { marketFamily: "team_totals" };
  }
  if (/\b(?:goles?|totales?\s+de\s+goles|over\/under|altas\/bajas)\b/i.test(folded)) {
    return { marketFamily: "totals" };
  }
  if (/\b(?:1x2|resultado\s+final|ganador(?:\s+del\s+partido)?|moneyline|\bml\b)\b/i.test(folded)) {
    return { marketFamily: "1x2" };
  }

  return { marketFamily: null };
}

function maskSpanInPrompt(promptEs: string, regex: RegExp): string {
  const globalFlags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  return promptEs.replace(new RegExp(regex.source, globalFlags), " | ");
}

function buildMaskedPromptForEntities(
  promptEs: string,
  leagueFolded: string | null,
  bookPattern: RegExp | null,
): string {
  let masked = promptEs;
  if (bookPattern) {
    masked = maskSpanInPrompt(masked, bookPattern);
  }
  if (leagueFolded) {
    const chars = Array.from(leagueFolded).map((ch) => {
      if (ch === "a") return "[aá]";
      if (ch === "e") return "[eé]";
      if (ch === "i") return "[ií]";
      if (ch === "o") return "[oó]";
      if (ch === "u") return "[uúü]";
      if (ch === "n") return "[nñ]";
      if (ch === " ") return "\\s+";
      return escapeRegExp(ch);
    });
    const leagueRe = new RegExp(`(?<![a-zA-Z0-9áéíóúñÁÉÍÓÚÑ])${chars.join("")}(?![a-zA-Z0-9áéíóúñÁÉÍÓÚÑ])`, "gi");
    masked = masked.replace(leagueRe, " | ");
  }
  return masked;
}

const ENTITY_STOP_WORDS = new Set([
  "ev",
  "f5",
  "1x2",
  "mas",
  "menos",
  "ambos",
  "over",
  "under",
  "prop",
  "alerta",
  "cada",
  "cuando",
  "siempre",
]);

function isValidEntityName(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (trimmed.length < 2 || trimmed.length > 64) return false;
  const folded = foldText(trimmed);
  if (ENTITY_STOP_WORDS.has(folded)) return false;
  if (/^\d+(?:[.,]\d+)?$/.test(trimmed)) return false;
  return isSafePublicLabel(trimmed);
}

const CAP_ENTITY_PATTERN =
  "([A-ZÁÉÍÓÚÑ][a-zA-Záéíóúñ'-]+(?:\\s+[A-ZÁÉÍÓÚÑ][a-zA-Záéíóúñ'-]+){0,3})";

function normalizeExtractedEntity(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/[.,;:!?]+$/g, "").trim();
  return isValidEntityName(cleaned) ? cleaned : null;
}

function extractPlayerQuery(maskedPrompt: string): string | null {
  const lineupPattern = new RegExp(
    `\\b(?:que|cuando|si)\\s+${CAP_ENTITY_PATTERN}\\s+(?:salga|sea|este|esté|figure|inicie)`,
    "u",
  );
  const lineupMatch = lineupPattern.exec(maskedPrompt);
  const lineupEntity = normalizeExtractedEntity(lineupMatch?.[1]);
  if (lineupEntity) {
    return lineupEntity;
  }

  const propPattern = new RegExp(
    `\\b(?:de|para)\\s+${CAP_ENTITY_PATTERN}(?=\\s*(?:\\||,|\\.|\\ben\\b|\\bcon\\b|\\bsi\\b|\\bpara\\b|\\bcuando\\b|$))`,
    "gu",
  );
  let lastValid: string | null = null;
  for (const match of maskedPrompt.matchAll(propPattern)) {
    const candidate = normalizeExtractedEntity(match[1]);
    if (candidate) {
      lastValid = candidate;
    }
  }
  return lastValid;
}

function extractTeamQuery(maskedPrompt: string): string | null {
  const matchContextPattern = new RegExp(
    `\\b(?:partidos?\\s+(?:del|de\\s+los|de\\s+las|de)|equipo\\s+(?:del|de))\\s+${CAP_ENTITY_PATTERN}(?=\\s*(?:\\||,|\\.|\\ben\\b|\\bcon\\b|\\bsi\\b|\\bse\\b|\\bpara\\b|\\bcuando\\b|$))`,
    "u",
  );
  const ctxMatch = matchContextPattern.exec(maskedPrompt);
  const ctxEntity = normalizeExtractedEntity(ctxMatch?.[1]);
  if (ctxEntity) {
    return ctxEntity;
  }

  const genericPattern = new RegExp(
    `\\b(?:del|de\\s+los|de\\s+las|de)\\s+${CAP_ENTITY_PATTERN}(?=\\s*(?:\\||,|\\.|\\ben\\b|\\bcon\\b|\\bsi\\b|\\bse\\b|\\bpara\\b|\\bcuando\\b|$))`,
    "gu",
  );
  for (const match of maskedPrompt.matchAll(genericPattern)) {
    const candidate = normalizeExtractedEntity(match[1]);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function rejectResult(rejectCode: AlertRejectCode, message: string): ParseAlertPromptResult {
  return { outcome: "reject", rejectCode, message };
}

export function parseSpanishAlertPromptDeterministic(promptEs: string): ParseAlertPromptResult {
  if (typeof promptEs !== "string") {
    return rejectResult("invalid_prompt", "Escribe una solicitud de alerta válida en español.");
  }
  const cleanPrompt = promptEs.trim().replace(/\s+/g, " ");
  if (cleanPrompt.length < 8 || cleanPrompt.length > 400) {
    return rejectResult(
      "invalid_prompt",
      "La solicitud debe tener entre 8 y 400 caracteres.",
    );
  }
  const foldedPrompt = foldText(cleanPrompt);
  if (PROMPT_INJECTION_RE.test(foldedPrompt)) {
    return rejectResult(
      "prompt_injection",
      "Solicitud rechazada: solo se aceptan reglas de alertas de mercado.",
    );
  }
  if (containsForbiddenFd16Term(cleanPrompt)) {
    return rejectResult(
      "forbidden_fd16",
      "Solicitud rechazada: contiene referencias internas, URLs o identificadores no permitidos.",
    );
  }
  if (FORBIDDEN_BETTING_RE.test(foldedPrompt)) {
    return rejectResult(
      "forbidden_betting_or_execution",
      "PitchLab no ofrece apuestas seguras garantizadas ni ejecuta apuestas automáticamente.",
    );
  }
  if (UNSUPPORTED_SPORT_RE.test(foldedPrompt)) {
    return rejectResult(
      "unsupported_sport",
      "Deporte fuera del catálogo de PitchLab (Fútbol, NBA, NFL, MLB y NHL).",
    );
  }
  if (UNSUPPORTED_LEAGUE_RE.test(foldedPrompt)) {
    return rejectResult(
      "unsupported_league",
      "Competición fuera del catálogo activo de PitchLab.",
    );
  }
  if (UNSUPPORTED_MARKET_RE.test(foldedPrompt)) {
    return rejectResult(
      "unsupported_market_family",
      "Mercado fuera de las 34 familias soportadas por PitchLab.",
    );
  }

  const { league, matchedFolded } = detectLeague(cleanPrompt);
  if (!league) {
    return rejectResult(
      "unsupported_league",
      "Especifica una liga del catálogo activo de PitchLab (ej. Liga MX, Premier League, NBA, NFL, MLB).",
    );
  }

  const capability = getLeagueCapability(league);
  if (!capability) {
    return rejectResult("unsupported_league", "Liga no disponible en el catálogo activo.");
  }

  const minDeltaNoVigPp = detectMinDeltaNoVigPp(cleanPrompt);
  const minEvPct = detectMinEvPct(cleanPrompt);
  const trigger = detectTrigger(cleanPrompt, minDeltaNoVigPp);
  const recurring = RECURRING_RE.test(cleanPrompt);
  const { book: preferredBook, pattern: bookPattern } = detectBookmaker(cleanPrompt);
  const { marketFamily, playerStatKey } = detectMarketFamilyAndStat(
    cleanPrompt,
    capability.sport,
    trigger,
  );

  if (trigger !== "schedule_change" && marketFamily === null) {
    return rejectResult(
      "unsupported_market_family",
      "No se reconoció una familia de mercado válida del catálogo de 34 familias.",
    );
  }
  if (marketFamily !== null && !capability.supportedMarketFamilies.includes(marketFamily)) {
    return rejectResult(
      "unsupported_market_family",
      "Ese mercado no está habilitado para la competición solicitada.",
    );
  }

  const isPlayerProp =
    marketFamily === "nba_player_props" || marketFamily === "player_props_football";
  const maskedPrompt = buildMaskedPromptForEntities(cleanPrompt, matchedFolded, bookPattern);
  const playerQuery = isPlayerProp ? extractPlayerQuery(maskedPrompt) : null;
  const teamQuery = isPlayerProp ? null : extractTeamQuery(maskedPrompt);

  const detectedDirLine = detectDirectionAndLine(cleanPrompt);
  const direction: MarketAlertDirection | null =
    detectedDirLine.direction ?? (isPlayerProp ? "over" : null);
  const line = detectedDirLine.line;

  const candidateRule: MarketAlertRule = {
    trigger,
    sport: capability.sport,
    league,
    marketFamily,
    teamQuery,
    playerQuery,
    ...(playerStatKey !== undefined ? { playerStatKey } : {}),
    direction,
    line,
    minEvPct,
    minDeltaNoVigPp,
    preferredBook,
    recurring,
  };

  const validated = MarketAlertRuleSchema.safeParse(candidateRule);
  if (!validated.success) {
    return rejectResult(
      "unsupported_market_family",
      "No se pudo construir una regla de alerta válida dentro del catálogo.",
    );
  }

  return { outcome: "accept", rule: candidateRule };
}

const TRIGGER_LABELS_ES: Readonly<Record<MarketAlertTrigger, string>> = {
  market_opened: "Apertura de línea",
  sharp_steam: "Movimiento sharp",
  stale_line_ev: "Línea rezagada EV+",
  lineup_confirmed: "Titular confirmado",
  schedule_change: "Cambio de calendario",
};

export function buildMarketAlertNameEs(rule: MarketAlertRule): string {
  if (rule.name && isSafePublicLabel(rule.name)) {
    return rule.name.slice(0, 120);
  }
  const parts: string[] = [TRIGGER_LABELS_ES[rule.trigger]];
  if (rule.marketFamily) parts.push(rule.marketFamily);
  if (rule.playerQuery) parts.push(rule.playerQuery);
  else if (rule.teamQuery) parts.push(rule.teamQuery);
  parts.push(rule.league);
  if (rule.minEvPct !== null) parts.push(`+${rule.minEvPct}% EV`);
  else if (rule.minDeltaNoVigPp !== null) parts.push(`${rule.minDeltaNoVigPp} pp`);
  return parts.join(" · ").slice(0, 120);
}

export function buildMarketAlertSelectionLabel(rule: MarketAlertRule): string | null {
  const tokens: string[] = [];
  if (rule.playerQuery) tokens.push(rule.playerQuery);
  else if (rule.teamQuery) tokens.push(rule.teamQuery);
  if (rule.playerStatKey) tokens.push(rule.playerStatKey);
  if (rule.direction && rule.line !== null) {
    tokens.push(`${rule.direction} ${rule.line}`);
  } else if (rule.line !== null) {
    tokens.push(String(rule.line));
  }
  const combined = tokens.join(" · ").trim();
  return combined.length > 0 ? combined.slice(0, 160) : null;
}

const PLAYER_STAT_KEY_SET: ReadonlySet<string> = new Set(ALERT_PLAYER_STAT_KEYS);
const SELECTION_DIRECTION_LINE_RE =
  /^(over|under|home|away|draw|any)\s+([+-]?\d+(?:\.\d+)?)$/i;
const SELECTION_NUMERIC_LINE_RE = /^[+-]?\d+(?:\.\d+)?$/;

function parseSelectionMetadata(
  selection: string | null,
  marketFamily: MarketFamilyId | null,
): {
  readonly teamQuery: string | null;
  readonly playerQuery: string | null;
  readonly playerStatKey: AlertPlayerStatKey | null;
  readonly direction: MarketAlertDirection | null;
  readonly line: number | null;
} {
  if (!selection) {
    return {
      teamQuery: null,
      playerQuery: null,
      playerStatKey: null,
      direction: null,
      line: null,
    };
  }
  const parts = selection
    .split(" · ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const isPlayerMarket =
    marketFamily === "player_props_football" || marketFamily === "nba_player_props";

  let teamQuery: string | null = null;
  let playerQuery: string | null = null;
  let playerStatKey: AlertPlayerStatKey | null = null;
  let parsedDirection: MarketAlertDirection | null = null;
  let line: number | null = null;

  for (const part of parts) {
    if (playerStatKey === null && PLAYER_STAT_KEY_SET.has(part)) {
      const matchedStat = ALERT_PLAYER_STAT_KEYS.find((key) => key === part) ?? null;
      if (matchedStat) {
        playerStatKey = matchedStat;
        continue;
      }
    }
    const dirLineMatch = SELECTION_DIRECTION_LINE_RE.exec(part);
    if (dirLineMatch) {
      const dirToken = dirLineMatch[1]?.toLowerCase();
      const matchedDir = ALERT_DIRECTIONS.find((item) => item === dirToken) ?? null;
      const parsedNum = parseNumberLiteral(dirLineMatch[2]);
      if (parsedDirection === null && matchedDir) {
        parsedDirection = matchedDir;
      }
      if (line === null && parsedNum !== null) {
        line = parsedNum;
      }
      continue;
    }
    if (line === null && SELECTION_NUMERIC_LINE_RE.test(part)) {
      const parsedNum = parseNumberLiteral(part);
      if (parsedNum !== null) {
        line = parsedNum;
        continue;
      }
    }
    if (isPlayerMarket) {
      if (playerQuery === null) {
        playerQuery = part;
      }
    } else if (teamQuery === null) {
      teamQuery = part;
    }
  }

  return {
    teamQuery,
    playerQuery,
    playerStatKey,
    direction: parsedDirection,
    line,
  };
}

export function alertRuleToDbCreateInput(
  rule: MarketAlertRule,
  overrides: {
    readonly name?: string;
    readonly cooldownMinutes?: number;
    readonly channel?: MarketAlertChannel;
    readonly minDecimal?: number | null;
    readonly maxDecimal?: number | null;
    readonly active?: boolean;
  } = {},
): CreateMarketAlertInput {
  const trimmedOverrideName = overrides.name?.trim();
  const safeName =
    trimmedOverrideName &&
    trimmedOverrideName.length >= 2 &&
    isSafePublicLabel(trimmedOverrideName)
      ? trimmedOverrideName.slice(0, 120)
      : buildMarketAlertNameEs(rule);
  return {
    name: safeName,
    trigger: rule.trigger,
    league: rule.league,
    marketFamily: rule.marketFamily,
    selection: buildMarketAlertSelectionLabel(rule),
    thresholdEvPct: rule.minEvPct ?? rule.minDeltaNoVigPp,
    minDecimal:
      overrides.minDecimal !== undefined ? overrides.minDecimal : (rule.minDecimal ?? null),
    maxDecimal:
      overrides.maxDecimal !== undefined ? overrides.maxDecimal : (rule.maxDecimal ?? null),
    direction: rule.direction,
    bookmaker: rule.preferredBook,
    cooldownMinutes: overrides.cooldownMinutes ?? rule.cooldownMinutes ?? 60,
    channel: overrides.channel ?? rule.channel ?? "push",
    active: overrides.active ?? true,
  };
}

export function dbRowToEvaluatableRule(row: MarketAlertRow): MarketAlertEvaluatableRule {
  const trigger: MarketAlertTrigger =
    ALERT_TRIGGERS.find((item) => item === row.trigger) ?? "market_opened";
  const marketFamily: MarketFamilyId | null =
    row.marketFamily && isCanonicalMarketFamily(row.marketFamily) ? row.marketFamily : null;
  const parsedSelection = parseSelectionMetadata(row.selection, marketFamily);
  const direction: MarketAlertDirection | null = row.direction
    ? (ALERT_DIRECTIONS.find((item) => item === row.direction) ?? parsedSelection.direction)
    : parsedSelection.direction;

  return {
    id: row.id,
    name: row.name,
    trigger,
    league: row.league,
    marketFamily,
    teamQuery: parsedSelection.teamQuery,
    playerQuery: parsedSelection.playerQuery,
    playerStatKey: parsedSelection.playerStatKey,
    selection: row.selection,
    direction,
    line: parsedSelection.line,
    thresholdEvPct: row.thresholdEvPct,
    minEvPct: trigger === "sharp_steam" ? null : row.thresholdEvPct,
    minDeltaNoVigPp: trigger === "sharp_steam" ? row.thresholdEvPct : null,
    bookmaker: row.bookmaker,
    preferredBook: row.bookmaker,
    minDecimal: row.minDecimal,
    maxDecimal: row.maxDecimal,
    cooldownMinutes: row.cooldownMinutes,
    active: row.active,
    lastFiredAtIso: row.lastFiredAt ? row.lastFiredAt.toISOString() : null,
    lastFiredHash: row.lastFiredHash,
  };
}

function normalizeBookKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const folded = foldText(raw).replace(/[^a-z0-9]+/g, "");
  return folded.length > 0 ? folded : null;
}

export function computeMarketAlertDedupeHash(event: MarketAlertCandidateEvent): string {
  const normalized = {
    trigger: event.trigger,
    gameId: event.gameId.trim(),
    league: event.league.trim().toLowerCase(),
    marketFamily: event.marketFamily ?? null,
    bookmaker: normalizeBookKey(event.bookmaker),
    direction: event.direction ?? null,
    line: event.line ?? null,
    playerName: event.playerName ? foldText(event.playerName).trim() : null,
    playerStatKey: event.playerStatKey ?? null,
    scheduleChangeKind: event.scheduleChangeKind ?? null,
    nextKickoffIso: event.nextKickoffIso ?? null,
    nextVenue: event.nextVenue ? foldText(event.nextVenue).trim() : null,
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 24);
}

function resolveEventEvPct(event: MarketAlertCandidateEvent): number | null {
  if (typeof event.evPct === "number" && Number.isFinite(event.evPct)) {
    return event.evPct;
  }
  if (
    typeof event.modelProb === "number" &&
    Number.isFinite(event.modelProb) &&
    event.modelProb > 0.001 &&
    event.modelProb < 0.999 &&
    typeof event.bookDecimal === "number" &&
    Number.isFinite(event.bookDecimal) &&
    event.bookDecimal > 1
  ) {
    return Math.round((event.modelProb * event.bookDecimal - 1) * 1000) / 10;
  }
  return null;
}

function resolveFairDecimal(event: MarketAlertCandidateEvent): number | null {
  if (typeof event.fairDecimal === "number" && Number.isFinite(event.fairDecimal) && event.fairDecimal > 1) {
    return event.fairDecimal;
  }
  if (
    typeof event.modelProb === "number" &&
    Number.isFinite(event.modelProb) &&
    event.modelProb > 0.001 &&
    event.modelProb < 0.999
  ) {
    return Math.round((1 / event.modelProb) * 1000) / 1000;
  }
  return null;
}

function matchesEntityNeedle(needle: string, candidates: readonly string[]): boolean {
  const foldedNeedle = foldText(needle).trim();
  if (!foldedNeedle) return true;
  return candidates.some((candidate) => foldText(candidate).includes(foldedNeedle));
}

export function evaluateMarketAlertTrigger(
  rule: MarketAlertEvaluatableRule,
  event: MarketAlertCandidateEvent,
  nowMs: number = Date.now(),
): EvaluateMarketAlertResult {
  const dedupeHash = computeMarketAlertDedupeHash(event);

  if (rule.active === false) {
    return { matched: false, reason: "rule_inactive", dedupeHash };
  }
  if (rule.trigger !== event.trigger) {
    return { matched: false, reason: "trigger_mismatch", dedupeHash };
  }
  if (rule.lastFiredHash && rule.lastFiredHash === dedupeHash) {
    return { matched: false, reason: "duplicate_event", dedupeHash };
  }
  if (rule.lastFiredAtIso) {
    const lastFiredMs = Date.parse(rule.lastFiredAtIso);
    const cooldownMs = (rule.cooldownMinutes ?? 60) * 60_000;
    if (Number.isFinite(lastFiredMs) && nowMs - lastFiredMs < cooldownMs) {
      return { matched: false, reason: "cooldown_active", dedupeHash };
    }
  }

  if (rule.league && rule.league !== event.league) {
    return { matched: false, reason: "league_mismatch", dedupeHash };
  }
  if (rule.marketFamily && event.marketFamily !== rule.marketFamily) {
    return { matched: false, reason: "market_family_mismatch", dedupeHash };
  }

  const ruleBook = normalizeBookKey(rule.preferredBook ?? rule.bookmaker);
  const eventBook = normalizeBookKey(event.bookmaker);
  if (ruleBook && ruleBook !== eventBook) {
    return { matched: false, reason: "bookmaker_mismatch", dedupeHash };
  }

  if (rule.teamQuery) {
    const teamCandidates = [
      ...(event.teamNames ?? []),
      ...(event.matchLabel ? [event.matchLabel] : []),
    ];
    if (teamCandidates.length === 0 || !matchesEntityNeedle(rule.teamQuery, teamCandidates)) {
      return { matched: false, reason: "team_mismatch", dedupeHash };
    }
  }

  if (rule.playerQuery) {
    if (!event.playerName || !matchesEntityNeedle(rule.playerQuery, [event.playerName])) {
      return { matched: false, reason: "player_mismatch", dedupeHash };
    }
  }

  if (rule.playerStatKey) {
    if (!event.playerStatKey || rule.playerStatKey !== event.playerStatKey) {
      return { matched: false, reason: "player_stat_mismatch", dedupeHash };
    }
  }

  if (rule.direction && rule.direction !== "any") {
    if (!event.direction || rule.direction !== event.direction) {
      return { matched: false, reason: "direction_mismatch", dedupeHash };
    }
  }

  if (rule.line !== undefined && rule.line !== null) {
    if (event.line === undefined || event.line === null || !Number.isFinite(event.line)) {
      return { matched: false, reason: "line_missing", dedupeHash };
    }
    if (Math.abs(event.line - rule.line) > 0.001) {
      return { matched: false, reason: "line_mismatch", dedupeHash };
    }
  }

  if (
    (rule.minDecimal !== undefined && rule.minDecimal !== null) ||
    (rule.maxDecimal !== undefined && rule.maxDecimal !== null)
  ) {
    if (typeof event.bookDecimal !== "number" || !Number.isFinite(event.bookDecimal)) {
      return { matched: false, reason: "decimal_odds_missing", dedupeHash };
    }
    if (rule.minDecimal !== undefined && rule.minDecimal !== null && event.bookDecimal < rule.minDecimal) {
      return { matched: false, reason: "decimal_odds_out_of_range", dedupeHash };
    }
    if (rule.maxDecimal !== undefined && rule.maxDecimal !== null && event.bookDecimal > rule.maxDecimal) {
      return { matched: false, reason: "decimal_odds_out_of_range", dedupeHash };
    }
  }

  const evPct = resolveEventEvPct(event);
  const fairDecimal = resolveFairDecimal(event);
  const minEvThreshold = rule.minEvPct ?? (rule.trigger !== "sharp_steam" ? rule.thresholdEvPct ?? null : null);
  const minSteamThreshold =
    rule.minDeltaNoVigPp ?? (rule.trigger === "sharp_steam" ? rule.thresholdEvPct ?? 3.0 : null);

  if (event.trigger === "market_opened") {
    if (event.marketOpened === false) {
      return { matched: false, reason: "market_not_opened", dedupeHash };
    }
    if (minEvThreshold !== null) {
      if (fairDecimal === null || evPct === null || evPct < minEvThreshold) {
        return { matched: false, reason: "ev_below_threshold", dedupeHash };
      }
    }
  } else if (event.trigger === "sharp_steam") {
    const delta = event.deltaNoVigPp;
    const threshold = minSteamThreshold ?? 3.0;
    if (typeof delta !== "number" || !Number.isFinite(delta) || Math.abs(delta) < threshold) {
      return { matched: false, reason: "steam_below_threshold", dedupeHash };
    }
  } else if (event.trigger === "stale_line_ev") {
    const threshold = minEvThreshold ?? 3.0;
    if (event.isStaleBook === false) {
      return { matched: false, reason: "book_not_stale", dedupeHash };
    }
    if (fairDecimal === null || evPct === null || evPct < threshold) {
      return { matched: false, reason: "ev_below_threshold", dedupeHash };
    }
    if (
      typeof event.sharpFairDecimal === "number" &&
      Number.isFinite(event.sharpFairDecimal) &&
      typeof event.bookDecimal === "number" &&
      Number.isFinite(event.bookDecimal) &&
      event.bookDecimal <= event.sharpFairDecimal
    ) {
      return { matched: false, reason: "book_not_stale", dedupeHash };
    }
  } else if (event.trigger === "lineup_confirmed") {
    if (event.lineupStatus !== "confirmed" || event.isStarter === false) {
      return { matched: false, reason: "lineup_not_confirmed", dedupeHash };
    }
  } else if (event.trigger === "schedule_change") {
    const hasKind = Boolean(event.scheduleChangeKind);
    const kickoffChanged =
      Boolean(event.previousKickoffIso) &&
      Boolean(event.nextKickoffIso) &&
      event.previousKickoffIso !== event.nextKickoffIso;
    const venueChanged =
      Boolean(event.previousVenue) &&
      Boolean(event.nextVenue) &&
      foldText(event.previousVenue ?? "") !== foldText(event.nextVenue ?? "");
    if (!hasKind && !kickoffChanged && !venueChanged) {
      return { matched: false, reason: "no_schedule_change", dedupeHash };
    }
  }

  const rawTitle = rule.name && isSafePublicLabel(rule.name)
    ? rule.name
    : `${TRIGGER_LABELS_ES[event.trigger]} · ${event.league}`;
  const detailParts: string[] = [];
  if (event.matchLabel && isSafePublicLabel(event.matchLabel)) {
    detailParts.push(event.matchLabel);
  }
  if (event.playerName && isSafePublicLabel(event.playerName)) {
    detailParts.push(event.playerName);
  }
  if (evPct !== null) {
    detailParts.push(`EV +${evPct.toFixed(1)} %`);
  }
  if (typeof event.deltaNoVigPp === "number" && Number.isFinite(event.deltaNoVigPp)) {
    detailParts.push(`Δ ${Math.abs(event.deltaNoVigPp).toFixed(1)} pp`);
  }
  if (event.scheduleChangeKind) {
    detailParts.push(event.scheduleChangeKind);
  }
  const safeBody = detailParts.length > 0 ? detailParts.join(" · ") : TRIGGER_LABELS_ES[event.trigger];

  return {
    matched: true,
    reason: "matched",
    dedupeHash,
    payload: {
      title: rawTitle,
      body: isSafePublicLabel(safeBody) ? safeBody : TRIGGER_LABELS_ES[event.trigger],
      gameId: event.gameId,
      league: event.league,
      trigger: event.trigger,
      marketFamily: event.marketFamily ?? null,
      dedupeHash,
      occurredAtIso: event.occurredAtIso ?? new Date(nowMs).toISOString(),
      metrics: {
        evPct,
        deltaNoVigPp: event.deltaNoVigPp ?? null,
        bookDecimal: event.bookDecimal ?? null,
        fairDecimal,
        line: event.line ?? null,
      },
    },
  };
}
