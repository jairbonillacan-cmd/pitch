/**
 * Registro legal y transporte HTTP honesto para captura de momios (`v3.2` · `DATOS-AUTO-1`).
 * Portado de los módulos auditados de la rama `web-scraping` (`scrapers/sources/registry.py` y `base.py`)
 * sin dependencias de Scrapling ni navegadores headless, integrado directamente con `mappings.ts`.
 */
import { createHash } from "node:crypto";
import type { OddsSnapshotRow } from "@pitchlab/spacetime";
import {
  GENERIC_LEAGUES,
  HISTORIC_TEAMS,
  resolveCanonicalTeam,
  type CanonicalLeague,
} from "../mappings.js";
import { slugifyTeamName } from "../team-slug.js";

export const TRANSPARENT_USER_AGENT =
  "PitchLab-Bot/1.0 (+https://pitchlab.mx; data-research)";

export type LegalStatus =
  | "public_allowed"
  | "api_only"
  | "blocked_pending_owner_decision";

export interface SourceMetadata {
  readonly sourceId: string;
  readonly displayName: string;
  readonly kind: "sharp" | "recreational" | "aggregator" | "public_consensus";
  readonly legalStatus: LegalStatus;
  readonly officialApi: boolean;
  readonly requiredEnvVars: readonly string[];
  readonly requiresAntibotEvasion: false;
  readonly rateLimitRps: number;
  readonly legalReason: string;
  readonly inspectedEndpoints: readonly string[];
}

export class OddsSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OddsSourceError";
  }
}

export class SourceBlockedError extends OddsSourceError {
  readonly sourceId: string;
  constructor(sourceId: string, reason: string) {
    super(`Fuente '${sourceId}' bloqueada por compuerta legal: ${reason}`);
    this.name = "SourceBlockedError";
    this.sourceId = sourceId;
  }
}

export class MissingCredentialsError extends OddsSourceError {
  readonly sourceId: string;
  readonly missingVars: readonly string[];
  constructor(sourceId: string, missingVars: readonly string[]) {
    super(
      `Fuente '${sourceId}' requiere credenciales ausentes: ${missingVars.join(", ")}.`,
    );
    this.name = "MissingCredentialsError";
    this.sourceId = sourceId;
    this.missingVars = missingVars;
  }
}

export class AntiBotChallengeError extends OddsSourceError {
  constructor(message: string) {
    super(message);
    this.name = "AntiBotChallengeError";
  }
}

export class RobotsDisallowedError extends OddsSourceError {
  constructor(url: string) {
    super(`Bloqueado por directiva robots.txt: ${url}`);
    this.name = "RobotsDisallowedError";
  }
}

export const SOURCE_LEGAL_REGISTRY: Readonly<Record<string, SourceMetadata>> = Object.freeze({
  the_odds_api: {
    sourceId: "the_odds_api",
    displayName: "The Odds API (v4 Official REST)",
    kind: "aggregator",
    legalStatus: "api_only",
    officialApi: true,
    requiredEnvVars: ["THE_ODDS_API_KEY"],
    requiresAntibotEvasion: false,
    rateLimitRps: 1.0,
    legalReason:
      "API REST oficial documentada que autoriza ingesta programática de cuotas sharp y recreativas.",
    inspectedEndpoints: ["https://api.the-odds-api.com/v4/sports/"],
  },
  bzzoiro_odds: {
    sourceId: "bzzoiro_odds",
    displayName: "Bzzoiro Sports Data (API v2)",
    kind: "aggregator",
    legalStatus: "api_only",
    officialApi: true,
    requiredEnvVars: ["BZZOIRO_API_KEY"],
    requiresAntibotEvasion: false,
    rateLimitRps: 5.0,
    legalReason:
      "API REST con token y licencia v4.0 (sports.bzzoiro.com/docs/api-license/): permite mostrar momios en la app; prohíbe revenderlos como feed.",
    inspectedEndpoints: [
      "https://sports.bzzoiro.com/api/v2/events/",
      "https://sports.bzzoiro.com/api/v2/odds/",
    ],
  },
  betfair_exchange: {
    sourceId: "betfair_exchange",
    displayName: "Betfair Exchange API-NG",
    kind: "sharp",
    legalStatus: "api_only",
    officialApi: true,
    requiredEnvVars: ["BETFAIR_APP_KEY", "BETFAIR_SESSION_TOKEN"],
    requiresAntibotEvasion: false,
    rateLimitRps: 2.0,
    legalReason:
      "Betfair Exchange API-NG oficial documentada (docs.developer.betfair.com). Scraping web prohibido.",
    inspectedEndpoints: [
      "https://api.betfair.com/exchange/betting/rest/v1.0/listMarketCatalogue/",
      "https://api.betfair.com/exchange/betting/rest/v1.0/listMarketBook/",
    ],
  },
  pinnacle: {
    sourceId: "pinnacle",
    displayName: "Pinnacle (Web / Arcadia Guest API)",
    kind: "sharp",
    legalStatus: "blocked_pending_owner_decision",
    officialApi: false,
    requiredEnvVars: ["PINNACLE_B2B_API_KEY"],
    requiresAntibotEvasion: false,
    rateLimitRps: 0.5,
    legalReason:
      "ToS de Pinnacle prohíben scraping automatizado de www.pinnacle.com y Arcadia Guest API sin acuerdo B2B.",
    inspectedEndpoints: ["https://www.pinnacle.com/robots.txt"],
  },
  smarkets: {
    sourceId: "smarkets",
    displayName: "Smarkets Exchange API v3",
    kind: "sharp",
    legalStatus: "blocked_pending_owner_decision",
    officialApi: true,
    requiredEnvVars: ["SMARKETS_SESSION_TOKEN"],
    requiresAntibotEvasion: false,
    rateLimitRps: 1.0,
    legalReason:
      "api.smarkets.com/v3/events/ responde HTTP 403 con CF-Mitigated: challenge sin sesión aprobada.",
    inspectedEndpoints: ["https://api.smarkets.com/v3/events/"],
  },
  caliente: {
    sourceId: "caliente",
    displayName: "Caliente.mx Sportsbook",
    kind: "recreational",
    legalStatus: "blocked_pending_owner_decision",
    officialApi: false,
    requiredEnvVars: [],
    requiresAntibotEvasion: false,
    rateLimitRps: 0.2,
    legalReason:
      "sports.caliente.mx responde HTTP 403 con reto Cloudflare y sus ToS prohíben extracción automatizada.",
    inspectedEndpoints: ["https://sports.caliente.mx/robots.txt"],
  },
  codere: {
    sourceId: "codere",
    displayName: "Codere México (apuestas.codere.mx)",
    kind: "recreational",
    legalStatus: "blocked_pending_owner_decision",
    officialApi: false,
    requiredEnvVars: [],
    requiresAntibotEvasion: false,
    rateLimitRps: 0.2,
    legalReason:
      "apuestas.codere.mx/robots.txt declara 'User-agent: * / Disallow: /' prohibiendo todo rastreo directo.",
    inspectedEndpoints: ["https://apuestas.codere.mx/robots.txt"],
  },
  action_network: {
    sourceId: "action_network",
    displayName: "Action Network",
    kind: "public_consensus",
    legalStatus: "blocked_pending_owner_decision",
    officialApi: false,
    requiredEnvVars: [],
    requiresAntibotEvasion: false,
    rateLimitRps: 0.2,
    legalReason:
      "robots.txt bloquea /api/ y sus ToS prohíben scraping automatizado sin licencia comercial.",
    inspectedEndpoints: ["https://www.actionnetwork.com/robots.txt"],
  },
});

export function credentialsPresent(
  meta: SourceMetadata,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (meta.requiredEnvVars.length === 0) return false;
  return meta.requiredEnvVars.every((key) => Boolean(env[key]?.trim()));
}

export function assertSourceLegallyAllowed(
  sourceId: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): SourceMetadata {
  const meta = SOURCE_LEGAL_REGISTRY[sourceId];
  if (!meta) {
    throw new SourceBlockedError(
      sourceId,
      `Fuente '${sourceId}' no auditada en docs/architecture/LEGAL_FUENTES_CUOTAS.md.`,
    );
  }
  if (meta.legalStatus === "blocked_pending_owner_decision") {
    throw new SourceBlockedError(sourceId, meta.legalReason);
  }
  if (meta.legalStatus === "api_only") {
    const missing = meta.requiredEnvVars.filter((k) => !env[k]?.trim());
    if (missing.length > 0) {
      throw new MissingCredentialsError(sourceId, missing);
    }
  }
  return meta;
}

export function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

const ANTIBOT_MARKERS = [
  "just a moment...",
  "cf-browser-verification",
  "challenge-platform",
  "enable javascript and cookies to continue",
  "attention required! | cloudflare",
  "_cf_chl_opt",
];

export interface HttpResponseSnapshot {
  readonly url: string;
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyText: string;
  readonly sha256: string;
}

export function detectAntiBotChallenge(resp: HttpResponseSnapshot): string | null {
  const cfMitigated = (resp.headers["cf-mitigated"] ?? "").trim().toLowerCase();
  if (cfMitigated === "challenge") {
    return `Cabecera CF-Mitigated=challenge en ${resp.url} (HTTP ${resp.status})`;
  }
  if (resp.status === 403 || resp.status === 503) {
    const snippet = resp.bodyText.slice(0, 4096).toLowerCase();
    for (const marker of ANTIBOT_MARKERS) {
      if (snippet.includes(marker)) {
        return `Reto anti-bot detectado (${marker}) en ${resp.url} (HTTP ${resp.status})`;
      }
    }
  }
  return null;
}

export class RobotsTxtPolicy {
  private readonly rules: Array<{ specificity: number; allow: boolean; regex: RegExp }> = [];

  constructor(robotsTxtBody: string, userAgentToken = "pitchlab-bot") {
    const uaToken = userAgentToken.toLowerCase();
    let currentAgents: string[] = [];
    let sawRuleInGroup = false;
    const specificRules: typeof this.rules = [];
    const wildcardRules: typeof this.rules = [];

    for (const rawLine of robotsTxtBody.split(/\r?\n/)) {
      const line = rawLine.split("\u0023", 1)[0]!.trim();
      if (!line || !line.includes(":")) continue;
      const idx = line.indexOf(":");
      const field = line.slice(0, idx).trim().toLowerCase();
      const val = line.slice(idx + 1).trim();

      if (field === "user-agent") {
        if (sawRuleInGroup) {
          currentAgents = [];
          sawRuleInGroup = false;
        }
        currentAgents.push(val.toLowerCase());
      } else if (field === "allow" || field === "disallow") {
        sawRuleInGroup = true;
        if (!val) continue;
        const escaped = val
          .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
          .replace(/\*/g, ".*");
        const pattern = escaped.endsWith("\\$")
          ? `^${escaped.slice(0, -2)}$`
          : `^${escaped}`;
        const rule = {
          specificity: val.length,
          allow: field === "allow",
          regex: new RegExp(pattern),
        };
        if (currentAgents.some((ag) => ag !== "*" && ag.includes(uaToken))) {
          specificRules.push(rule);
        } else if (currentAgents.includes("*")) {
          wildcardRules.push(rule);
        }
      }
    }

    this.rules = specificRules.length > 0 ? specificRules : wildcardRules;
  }

  isAllowed(urlOrPath: string): boolean {
    let path = urlOrPath;
    if (path.includes("://")) {
      const afterScheme = path.split("://")[1] ?? "";
      const slashIdx = afterScheme.indexOf("/");
      path = slashIdx >= 0 ? afterScheme.slice(slashIdx) : "/";
    }
    if (!path.startsWith("/")) path = `/${path}`;

    const matched = this.rules.filter((r) => r.regex.test(path));
    if (matched.length === 0) return true;
    matched.sort((a, b) => {
      if (b.specificity !== a.specificity) return b.specificity - a.specificity;
      return (b.allow ? 1 : 0) - (a.allow ? 1 : 0);
    });
    return matched[0]!.allow;
  }
}

export class PerSourceRateLimiter {
  private lastRequestMs: number | null = null;
  readonly minIntervalMs: number;

  constructor(
    maxRequestsPerSecond: number,
    private readonly nowFn: () => number = () => Date.now(),
    private readonly sleepFn: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    if (!Number.isFinite(maxRequestsPerSecond) || maxRequestsPerSecond <= 0) {
      throw new Error(`maxRequestsPerSecond inválido: ${maxRequestsPerSecond}`);
    }
    this.minIntervalMs = 1000 / maxRequestsPerSecond;
  }

  async acquire(): Promise<void> {
    const now = this.nowFn();
    if (this.lastRequestMs !== null) {
      const waitMs = this.minIntervalMs - (now - this.lastRequestMs);
      if (waitMs > 0) {
        await this.sleepFn(waitMs);
      }
    }
    this.lastRequestMs = this.nowFn();
  }
}

export type HttpRequesterFn = (input: {
  method: "GET" | "POST";
  url: string;
  headers: Readonly<Record<string, string>>;
  body?: string;
  timeoutMs: number;
}) => Promise<HttpResponseSnapshot>;

export const defaultFetchRequester: HttpRequesterFn = async ({
  method,
  url,
  headers,
  body,
  timeoutMs,
}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const bodyText = await res.text();
    const hdrs: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      hdrs[k.toLowerCase()] = v;
    });
    return {
      url,
      status: res.status,
      headers: hdrs,
      bodyText,
      sha256: sha256Hex(bodyText),
    };
  } finally {
    clearTimeout(timer);
  }
};

export class CleanHttpTransport {
  private readonly limiter: PerSourceRateLimiter;

  constructor(
    private readonly options: {
      rateLimitRps?: number;
      maxRetries?: number;
      baseDelayMs?: number;
      timeoutMs?: number;
      robotsPolicy?: RobotsTxtPolicy;
      requester?: HttpRequesterFn;
      sleepFn?: (ms: number) => Promise<void>;
    } = {},
  ) {
    this.limiter = new PerSourceRateLimiter(
      options.rateLimitRps ?? 1.0,
      () => Date.now(),
      options.sleepFn,
    );
  }

  async request(params: {
    method: "GET" | "POST";
    url: string;
    headers?: Readonly<Record<string, string>>;
    query?: Readonly<Record<string, string | undefined>>;
    jsonBody?: unknown;
  }): Promise<HttpResponseSnapshot> {
    let fullUrl = params.url;
    if (params.query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params.query)) {
        if (v !== undefined) qs.set(k, v);
      }
      const encoded = qs.toString();
      if (encoded) fullUrl += (fullUrl.includes("?") ? "&" : "?") + encoded;
    }

    if (this.options.robotsPolicy && !this.options.robotsPolicy.isAllowed(fullUrl)) {
      throw new RobotsDisallowedError(fullUrl);
    }

    const headers: Record<string, string> = {
      "user-agent": TRANSPARENT_USER_AGENT,
      accept: "application/json",
      ...(params.jsonBody !== undefined ? { "content-type": "application/json" } : {}),
      ...(params.headers ?? {}),
    };

    const requester = this.options.requester ?? defaultFetchRequester;
    const maxRetries = this.options.maxRetries ?? 2;
    const baseDelayMs = this.options.baseDelayMs ?? 1200;
    const sleep =
      this.options.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

    let attempt = 0;
    while (true) {
      await this.limiter.acquire();
      const resp = await requester({
        method: params.method,
        url: fullUrl,
        headers,
        body: params.jsonBody !== undefined ? JSON.stringify(params.jsonBody) : undefined,
        timeoutMs: this.options.timeoutMs ?? 15_000,
      });

      const challenge = detectAntiBotChallenge(resp);
      if (challenge) {
        throw new AntiBotChallengeError(challenge);
      }

      if (resp.status >= 200 && resp.status < 300) {
        return resp;
      }

      if ((resp.status === 429 || resp.status >= 500) && attempt < maxRetries) {
        const retryAfterSec = Number(resp.headers["retry-after"] ?? "");
        const delayMs =
          Number.isFinite(retryAfterSec) && retryAfterSec > 0
            ? Math.min(30_000, retryAfterSec * 1000)
            : Math.min(30_000, baseDelayMs * 2 ** attempt);
        attempt += 1;
        await sleep(delayMs);
        continue;
      }

      throw new OddsSourceError(
        `Respuesta HTTP ${resp.status} no recuperable desde ${params.url}.`,
      );
    }
  }
}

export const APP_LEAGUE_TO_ODDS_CODE: Readonly<Record<CanonicalLeague, { sport: "football" | "nfl"; code: string }>> = {
  "liga-mx": { sport: "football", code: "MEX" },
  "premier-league": { sport: "football", code: "E0" },
  laliga: { sport: "football", code: "SP1" },
  bundesliga: { sport: "football", code: "D1" },
  "serie-a": { sport: "football", code: "I1" },
  "ligue-1": { sport: "football", code: "F1" },
  nfl: { sport: "nfl", code: "NFL" },
};

export const ODDS_CODE_TO_APP_LEAGUE: Readonly<Record<string, CanonicalLeague>> = {
  MEX: "liga-mx",
  E0: "premier-league",
  SP1: "laliga",
  D1: "bundesliga",
  I1: "serie-a",
  F1: "ligue-1",
  NFL: "nfl",
};

/** Alias comunes en casas internacionales para resolver al nombre exacto de `mappings.ts`. */
const BOOKMAKER_TEAM_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "premier-league": {
    "brighton and hove albion": "Brighton & Hove Albion",
    "man united": "Manchester United",
    "man city": "Manchester City",
    "nottm forest": "Nottingham Forest",
    spurs: "Tottenham Hotspur",
    ipswich: "Ipswich Town",
    leeds: "Leeds United",
    coventry: "Coventry City",
    hull: "Hull City",
  },
  "liga-mx": {
    "cf america": "Club América",
    "club america": "Club América",
    "guadalajara chivas": "Guadalajara",
    "chivas guadalajara": "Guadalajara",
    "unam pumas": "Pumas UNAM",
    "pumas unam": "Pumas UNAM",
    "tigres uanl": "Tigres UANL",
    "atletico san luis": "Atlético San Luis",
    "queretaro fc": "Querétaro",
    "fc juarez": "FC Juárez",
    "santos laguna": "Santos Laguna",
    "xolos de tijuana": "Club Tijuana",
    "club tijuana": "Club Tijuana",
  },
  laliga: {
    "atletico madrid": "Atlético de Madrid",
    "athletic bilbao": "Athletic Club",
    "celta vigo": "Celta de Vigo",
    "deportivo la coruna": "Deportivo La Coruña",
    "alaves": "Deportivo Alavés",
    "racing santander": "Racing de Santander",
  },
  nfl: {
    "la rams": "Los Angeles Rams",
    "la chargers": "Los Angeles Chargers",
    "ny giants": "New York Giants",
    "ny jets": "New York Jets",
  },
};

function normalizeLookupKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeUtcIsoSeconds(rawIso: string): string {
  const ms = Date.parse(rawIso);
  if (!Number.isFinite(ms)) {
    throw new Error(`Timestamp UTC inválido: '${rawIso}'`);
  }
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function resolveOddsTeamSlug(appLeague: CanonicalLeague, rawTeamName: string): string | null {
  const cleaned = rawTeamName.trim();
  if (!cleaned) return null;

  // Bloquea clubes históricos/descendidos en eventos en vivo
  const historic = HISTORIC_TEAMS[appLeague];
  if (historic) {
    if (historic[cleaned]) return null;
    const norm = normalizeLookupKey(cleaned);
    for (const [alias, canon] of Object.entries(historic)) {
      if (normalizeLookupKey(alias) === norm || normalizeLookupKey(canon) === norm) {
        return null;
      }
    }
  }

  const aliasTable = BOOKMAKER_TEAM_ALIASES[appLeague];
  const candidate = aliasTable?.[normalizeLookupKey(cleaned)] ?? cleaned;

  try {
    const team = resolveCanonicalTeam(appLeague, candidate);
    const slug = team.id.split(".")[1];
    return slug ? slug.replace(/-/g, "_") : null;
  } catch (err) {
    void err;
    if (GENERIC_LEAGUES.has(appLeague)) {
      const slug = slugifyTeamName(cleaned);
      return slug ? slug.replace(/-/g, "_") : null;
    }
    return null;
  }
}

export function buildCanonicalOddsEventId(params: {
  appLeague: CanonicalLeague;
  commenceTimeIso: string;
  homeTeamRaw: string;
  awayTeamRaw: string;
}): {
  eventId: string;
  sport: "football" | "nfl";
  leagueCode: string;
  homeSlug: string;
  awaySlug: string;
  tsEventStart: string;
} | null {
  const mapping = APP_LEAGUE_TO_ODDS_CODE[params.appLeague];
  if (!mapping) return null;
  const tsEventStart = normalizeUtcIsoSeconds(params.commenceTimeIso);
  const ymd = tsEventStart.slice(0, 10).replace(/-/g, "");
  const homeSlug = resolveOddsTeamSlug(params.appLeague, params.homeTeamRaw);
  const awaySlug = resolveOddsTeamSlug(params.appLeague, params.awayTeamRaw);
  if (!homeSlug || !awaySlug || homeSlug === awaySlug) return null;

  return {
    eventId: `ws:${mapping.sport}:${mapping.code}:${ymd}:${homeSlug}:${awaySlug}`,
    sport: mapping.sport,
    leagueCode: mapping.code,
    homeSlug,
    awaySlug,
    tsEventStart,
  };
}

export interface OddsSourceAdapter {
  readonly metadata: SourceMetadata;
  fetchSnapshots(options?: {
    activeLeagues?: readonly CanonicalLeague[];
    capturedAtIso?: string;
  }): Promise<OddsSnapshotRow[]>;
}
