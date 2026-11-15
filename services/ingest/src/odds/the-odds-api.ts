/**
 * Adaptador legal `api_only` para The Odds API v4 (`https://api.the-odds-api.com/v4/`).
 * Portado de `web-scraping:scrapers/sources/the_odds_api.py` e integrado con `mappings.ts`,
 * presupuesto mensual para plan gratuito y el validador común de Parte 3.
 *
 * Presupuesto de créditos (plan gratuito Starter = 500 créditos/mes):
 * - Cada llamada a `/odds` cuesta `n_mercados × n_regiones` créditos por liga. `/events` es gratis.
 * - Por defecto pide `regions=eu` y `markets=h2h`: 1 crédito por liga consultada.
 * - Variables opcionales: `THE_ODDS_API_MONTHLY_CREDITS` (`500`; `0` = sin tope),
 *   `THE_ODDS_API_RESERVE_CREDITS` (`25`), `THE_ODDS_API_MIN_INTERVAL_MINUTES` (`180`),
 *   `THE_ODDS_API_LOOKAHEAD_HOURS` (`48`), `THE_ODDS_API_REGIONS` (`eu`),
 *   `THE_ODDS_API_MARKETS` (`h2h`) y `THE_ODDS_API_LEAGUES` (CSV).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { normalizeLine, type OddsSnapshotRow } from "@pitchlab/spacetime";
import type { CanonicalLeague } from "../mappings.js";
import { validateOddsTickBatch } from "../validation/snapshot-validator.js";
import {
  assertSourceLegallyAllowed,
  buildCanonicalOddsEventId,
  CleanHttpTransport,
  normalizeUtcIsoSeconds,
  resolveOddsTeamSlug,
  sha256Hex,
  SOURCE_LEGAL_REGISTRY,
  type OddsSourceAdapter,
} from "./legal-registry.js";

export const THE_ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4";
export const DEFAULT_THE_ODDS_API_REGIONS = "eu";
export const DEFAULT_THE_ODDS_API_MARKETS = "h2h";
export const THE_ODDS_API_BUDGET_FILENAME = "the_odds_api_budget.json";

export const LEAGUE_TO_THE_ODDS_SPORT_KEY: Readonly<Record<CanonicalLeague, string>> = {
  "liga-mx": "soccer_mexico_ligamx",
  "premier-league": "soccer_epl",
  laliga: "soccer_spain_la_liga",
  bundesliga: "soccer_germany_bundesliga",
  "serie-a": "soccer_italy_serie_a",
  "ligue-1": "soccer_france_ligue_one",
  nfl: "americanfootball_nfl",
};

const BOOKMAKER_KEY_MAP: Readonly<Record<string, string>> = {
  // Casas sharp
  pinnacle: "pinnacle",
  smarkets: "smarkets",
  betfair_ex_eu: "betfair_exchange",
  betfair_ex_uk: "betfair_exchange",
  betfair_ex_au: "betfair_exchange",
  // Casas recreativas autorizadas vía API oficial
  bet365: "bet365",
  draftkings: "draftkings",
  fanduel: "fanduel",
  betmgm: "betmgm",
  betrivers: "betrivers",
  bwin: "bwin",
  williamhill: "william_hill",
  williamhill_us: "william_hill",
  codere_it: "codere",
  unibet_eu: "unibet",
  betonlineag: "betonline",
};

interface RawOutcome {
  name?: unknown;
  price?: unknown;
  point?: unknown;
}

interface RawMarket {
  key?: unknown;
  outcomes?: unknown;
}

interface RawBookmaker {
  key?: unknown;
  markets?: unknown;
}

interface RawOddsEvent {
  home_team?: unknown;
  away_team?: unknown;
  commence_time?: unknown;
  bookmakers?: unknown;
}

export function parseTheOddsApiEvents(params: {
  eventsPayload: readonly unknown[];
  appLeague: CanonicalLeague;
  capturedAtIso: string;
  rawSha256: string;
  nowMs?: number;
}): OddsSnapshotRow[] {
  const capturedIso = normalizeUtcIsoSeconds(params.capturedAtIso);
  const candidates: OddsSnapshotRow[] = [];

  for (const rawEv of params.eventsPayload) {
    if (!rawEv || typeof rawEv !== "object") continue;
    const ev = rawEv as RawOddsEvent;
    const homeRaw = String(ev.home_team ?? "").trim();
    const awayRaw = String(ev.away_team ?? "").trim();
    const commenceRaw = String(ev.commence_time ?? "").trim();
    if (!homeRaw || !awayRaw || !commenceRaw) continue;

    let resolvedEvent: ReturnType<typeof buildCanonicalOddsEventId>;
    try {
      resolvedEvent = buildCanonicalOddsEventId({
        appLeague: params.appLeague,
        commenceTimeIso: commenceRaw,
        homeTeamRaw: homeRaw,
        awayTeamRaw: awayRaw,
      });
    } catch (err) {
      void err;
      continue;
    }
    if (!resolvedEvent) continue;

    const bookmakers = Array.isArray(ev.bookmakers) ? ev.bookmakers : [];
    for (const rawBm of bookmakers) {
      if (!rawBm || typeof rawBm !== "object") continue;
      const bm = rawBm as RawBookmaker;
      const bmKey = String(bm.key ?? "").trim().toLowerCase();
      const canonBook = BOOKMAKER_KEY_MAP[bmKey];
      if (!canonBook) continue;

      const markets = Array.isArray(bm.markets) ? bm.markets : [];
      for (const rawMkt of markets) {
        if (!rawMkt || typeof rawMkt !== "object") continue;
        const mkt = rawMkt as RawMarket;
        const mKey = String(mkt.key ?? "").trim().toLowerCase();
        const outcomes = (Array.isArray(mkt.outcomes) ? mkt.outcomes : []).filter(
          (o): o is RawOutcome => Boolean(o && typeof o === "object"),
        );
        if (outcomes.length === 0) continue;

        if (mKey === "h2h") {
          const hasDraw = outcomes.some((o) => {
            const n = String(o.name ?? "").trim().toLowerCase();
            return n === "draw" || n === "tie";
          });
          const canonMkt =
            hasDraw || resolvedEvent.sport === "football" ? "1x2" : "moneyline";

          for (const out of outcomes) {
            const oName = String(out.name ?? "").trim();
            const oLow = oName.toLowerCase();
            let sel: string | null = null;
            if (oLow === "draw" || oLow === "tie") {
              if (canonMkt !== "1x2") continue;
              sel = "draw";
            } else {
              const oSlug = resolveOddsTeamSlug(params.appLeague, oName);
              if (oSlug === resolvedEvent.homeSlug) sel = "home";
              else if (oSlug === resolvedEvent.awaySlug) sel = "away";
            }
            if (!sel) continue;

            candidates.push({
              event_id: resolvedEvent.eventId,
              sport: resolvedEvent.sport,
              league: resolvedEvent.leagueCode,
              market: canonMkt,
              line: null,
              selection: sel,
              book: canonBook,
              price_decimal: Number(out.price),
              ts_captured: capturedIso,
              ts_event_start: resolvedEvent.tsEventStart,
              source: "scraped_ws",
            });
          }
        } else if (mKey === "spreads") {
          const canonMkt = resolvedEvent.sport === "football" ? "ah" : "spread";
          const mappedSides: Array<{ sel: string; price: number }> = [];
          let homeLine: number | null = null;

          for (const out of outcomes) {
            const oName = String(out.name ?? "").trim();
            const oSlug = resolveOddsTeamSlug(params.appLeague, oName);
            const pt = normalizeLine(Number(out.point));
            if (oSlug === resolvedEvent.homeSlug) {
              if (pt !== null) homeLine = pt;
              mappedSides.push({ sel: "home", price: Number(out.price) });
            } else if (oSlug === resolvedEvent.awaySlug) {
              if (homeLine === null && pt !== null) homeLine = normalizeLine(-pt);
              mappedSides.push({ sel: "away", price: Number(out.price) });
            }
          }
          if (homeLine === null) continue;
          for (const side of mappedSides) {
            candidates.push({
              event_id: resolvedEvent.eventId,
              sport: resolvedEvent.sport,
              league: resolvedEvent.leagueCode,
              market: canonMkt,
              line: homeLine,
              selection: side.sel,
              book: canonBook,
              price_decimal: side.price,
              ts_captured: capturedIso,
              ts_event_start: resolvedEvent.tsEventStart,
              source: "scraped_ws",
            });
          }
        } else if (mKey === "totals") {
          for (const out of outcomes) {
            const oLow = String(out.name ?? "").trim().toLowerCase();
            if (oLow !== "over" && oLow !== "under") continue;
            const pt = normalizeLine(Number(out.point));
            if (pt === null) continue;
            candidates.push({
              event_id: resolvedEvent.eventId,
              sport: resolvedEvent.sport,
              league: resolvedEvent.leagueCode,
              market: "totals",
              line: pt,
              selection: oLow,
              book: canonBook,
              price_decimal: Number(out.price),
              ts_captured: capturedIso,
              ts_event_start: resolvedEvent.tsEventStart,
              source: "scraped_ws",
            });
          }
        } else if (mKey === "btts" && resolvedEvent.sport === "football") {
          for (const out of outcomes) {
            const oLow = String(out.name ?? "").trim().toLowerCase();
            if (oLow !== "yes" && oLow !== "no") continue;
            candidates.push({
              event_id: resolvedEvent.eventId,
              sport: resolvedEvent.sport,
              league: resolvedEvent.leagueCode,
              market: "btts",
              line: null,
              selection: oLow,
              book: canonBook,
              price_decimal: Number(out.price),
              ts_captured: capturedIso,
              ts_event_start: resolvedEvent.tsEventStart,
              source: "scraped_ws",
            });
          }
        }
      }
    }
  }

  return validateOddsTickBatch(candidates, { nowMs: params.nowMs }).acceptedRows;
}

export interface OddsApiBudgetConfig {
  /** Créditos mensuales; `null` desactiva el tope (planes de pago). */
  monthlyCredits: number | null;
  reserveCredits: number;
  minIntervalMinutes: number;
  lookaheadHours: number;
}

export const UNLIMITED_ODDS_API_BUDGET: OddsApiBudgetConfig = {
  monthlyCredits: null,
  reserveCredits: 0,
  minIntervalMinutes: 0,
  lookaheadHours: 48,
};

export interface OddsApiBudgetReport {
  creditsPerCall: number;
  regions: string;
  markets: string;
  leaguesFetched: string[];
  leaguesSkipped: Record<string, string>;
  monthCreditsUsed: number;
  todayCreditsUsed: number;
  todayAllowance: number | null;
  remainingHeader: number | null;
}

function readEnvNumber(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} debe ser numérico; se recibió '${raw}'.`);
  }
  return parsed;
}

function csvCount(value: string): number {
  return value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean).length;
}

function parseIntHeader(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function utcMonthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function utcDayKey(ms: number): string {
  const d = new Date(ms);
  return `${utcMonthKey(ms)}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Construye la configuración de presupuesto mensual de The Odds API desde el entorno. */
export function resolveOddsApiBudgetConfig(
  env: Readonly<Record<string, string | undefined>>,
): OddsApiBudgetConfig {
  const monthly = Math.trunc(readEnvNumber(env, "THE_ODDS_API_MONTHLY_CREDITS", 500));
  return {
    monthlyCredits: monthly > 0 ? monthly : null,
    reserveCredits: Math.trunc(readEnvNumber(env, "THE_ODDS_API_RESERVE_CREDITS", 25)),
    minIntervalMinutes: readEnvNumber(env, "THE_ODDS_API_MIN_INTERVAL_MINUTES", 180),
    lookaheadHours: readEnvNumber(env, "THE_ODDS_API_LOOKAHEAD_HOURS", 48),
  };
}

/** Libro de gasto mensual persistido en JSON para no agotar créditos del plan gratuito. */
export class OddsApiBudget {
  month = "";
  creditsUsed = 0;
  byDay: Record<string, number> = {};
  lastCallByLeague: Record<string, string> = {};
  remainingHeader: number | null = null;

  constructor(
    readonly config: OddsApiBudgetConfig,
    readonly path: string | null = null,
  ) {}

  static load(config: OddsApiBudgetConfig, path: string | null = null): OddsApiBudget {
    const budget = new OddsApiBudget(config, path);
    if (path && existsSync(path)) {
      const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      budget.month = typeof raw.month === "string" ? raw.month : "";
      budget.creditsUsed = Number(raw.credits_used ?? 0) || 0;
      if (raw.by_day && typeof raw.by_day === "object") {
        for (const [k, v] of Object.entries(raw.by_day as Record<string, unknown>)) {
          const n = Number(v);
          if (Number.isFinite(n)) budget.byDay[k] = n;
        }
      }
      if (raw.last_call_by_league && typeof raw.last_call_by_league === "object") {
        for (const [k, v] of Object.entries(raw.last_call_by_league as Record<string, unknown>)) {
          if (typeof v === "string") budget.lastCallByLeague[k] = v;
        }
      }
      if (raw.remaining_header !== null && raw.remaining_header !== undefined) {
        const rem = Number(raw.remaining_header);
        budget.remainingHeader = Number.isFinite(rem) ? Math.trunc(rem) : null;
      }
    }
    return budget;
  }

  private rollMonth(nowMs: number): void {
    const m = utcMonthKey(nowMs);
    if (this.month !== m) {
      this.month = m;
      this.creditsUsed = 0;
      this.byDay = {};
    }
  }

  dailyAllowance(nowMs: number): number | null {
    if (this.config.monthlyCredits === null) return null;
    this.rollMonth(nowMs);
    const today = utcDayKey(nowMs);
    const usedToday = this.byDay[today] ?? 0;
    const available =
      this.config.monthlyCredits - this.config.reserveCredits - (this.creditsUsed - usedToday);
    const d = new Date(nowMs);
    const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const daysLeft = Math.max(1, daysInMonth - d.getUTCDate() + 1);
    return Math.max(0, available / daysLeft);
  }

  check(sportKey: string, cost: number, nowMs: number): string | null {
    this.rollMonth(nowMs);
    const lastIso = this.lastCallByLeague[sportKey];
    if (lastIso && this.config.minIntervalMinutes > 0) {
      const lastMs = Date.parse(lastIso);
      if (Number.isFinite(lastMs) && nowMs - lastMs < this.config.minIntervalMinutes * 60_000) {
        return "intervalo_minimo";
      }
    }
    if (this.config.monthlyCredits === null) return null;
    if (
      this.remainingHeader !== null &&
      this.remainingHeader - cost < this.config.reserveCredits
    ) {
      return "reserva_mensual";
    }
    const allowance = this.dailyAllowance(nowMs);
    const usedToday = this.byDay[utcDayKey(nowMs)] ?? 0;
    if (allowance !== null && usedToday + cost > allowance) {
      return "tope_diario";
    }
    return null;
  }

  record(sportKey: string, cost: number, nowMs: number, remaining: number | null): void {
    this.rollMonth(nowMs);
    const today = utcDayKey(nowMs);
    this.creditsUsed += cost;
    this.byDay[today] = (this.byDay[today] ?? 0) + cost;
    this.lastCallByLeague[sportKey] = normalizeUtcIsoSeconds(new Date(nowMs).toISOString());
    if (remaining !== null && Number.isFinite(remaining)) {
      this.remainingHeader = Math.trunc(remaining);
    }
  }

  save(): void {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const payload = {
      month: this.month,
      credits_used: this.creditsUsed,
      by_day: this.byDay,
      last_call_by_league: this.lastCallByLeague,
      remaining_header: this.remainingHeader,
      monthly_credits: this.config.monthlyCredits,
      reserve_credits: this.config.reserveCredits,
    };
    writeFileSync(this.path, JSON.stringify(payload, null, 2) + "\n", "utf8");
  }
}

export class TheOddsApiAdapter implements OddsSourceAdapter {
  readonly metadata = SOURCE_LEGAL_REGISTRY.the_odds_api!;
  readonly lastQuotaHeaders: Record<string, string> = {};
  lastBudgetReport: OddsApiBudgetReport | null = null;
  private readonly transport: CleanHttpTransport;
  private readonly regions: string;
  private readonly markets: string;
  private readonly budgetConfig: OddsApiBudgetConfig;
  private readonly budgetPath: string | null;
  private readonly precheckEvents: boolean;
  private readonly leagueFilter: Set<string> | null;
  private memoryBudget: OddsApiBudget | null = null;

  constructor(
    private readonly options: {
      env?: Readonly<Record<string, string | undefined>>;
      transport?: CleanHttpTransport;
      regions?: string;
      markets?: string;
      /** Ligas que cubre otra fuente y no se piden aquí (ahorra cuota). */
      excludeLeagues?: readonly CanonicalLeague[];
      budget?: OddsApiBudgetConfig;
      budgetPath?: string | null;
      precheckEvents?: boolean;
    } = {},
  ) {
    const env = options.env ?? process.env;
    this.transport =
      options.transport ??
      new CleanHttpTransport({ rateLimitRps: this.metadata.rateLimitRps });
    this.regions =
      options.regions?.trim() ||
      env.THE_ODDS_API_REGIONS?.trim() ||
      DEFAULT_THE_ODDS_API_REGIONS;
    this.markets =
      options.markets?.trim() ||
      env.THE_ODDS_API_MARKETS?.trim() ||
      DEFAULT_THE_ODDS_API_MARKETS;
    this.budgetConfig = options.budget ?? resolveOddsApiBudgetConfig(env);
    this.budgetPath = options.budgetPath ?? null;
    this.precheckEvents = options.precheckEvents ?? true;
    const rawFilter = env.THE_ODDS_API_LEAGUES?.trim();
    this.leagueFilter = rawFilter
      ? new Set(rawFilter.split(",").map((p) => p.trim()).filter(Boolean))
      : null;
  }

  get creditsPerCall(): number {
    return Math.max(1, csvCount(this.markets)) * Math.max(1, csvCount(this.regions));
  }

  private async hasEventsInWindow(
    apiKey: string,
    sportKey: string,
    nowMs: number,
  ): Promise<boolean> {
    const fromIso = normalizeUtcIsoSeconds(new Date(nowMs).toISOString());
    const toIso = normalizeUtcIsoSeconds(
      new Date(nowMs + this.budgetConfig.lookaheadHours * 3600_000).toISOString(),
    );
    const resp = await this.transport.request({
      method: "GET",
      url: `${THE_ODDS_API_BASE_URL}/sports/${sportKey}/events`,
      query: {
        apiKey,
        dateFormat: "iso",
        commenceTimeFrom: fromIso,
        commenceTimeTo: toIso,
      },
    });
    const payload = JSON.parse(resp.bodyText) as unknown;
    return Array.isArray(payload) && payload.length > 0;
  }

  async fetchSnapshots(
    params: {
      activeLeagues?: readonly CanonicalLeague[];
      capturedAtIso?: string;
    } = {},
  ): Promise<OddsSnapshotRow[]> {
    const env = this.options.env ?? process.env;
    assertSourceLegallyAllowed(this.metadata.sourceId, env);
    const apiKey = env.THE_ODDS_API_KEY!.trim();
    const capturedAtIso = normalizeUtcIsoSeconds(
      params.capturedAtIso ?? new Date().toISOString(),
    );
    const nowMs = Date.parse(capturedAtIso);

    if (this.budgetPath !== null || this.memoryBudget === null) {
      this.memoryBudget = OddsApiBudget.load(this.budgetConfig, this.budgetPath);
    }
    const budget = this.memoryBudget;
    const cost = this.creditsPerCall;
    const fetched: string[] = [];
    const skipped: Record<string, string> = {};

    const targetLeagues: readonly CanonicalLeague[] =
      params.activeLeagues ??
      (Object.keys(LEAGUE_TO_THE_ODDS_SPORT_KEY) as CanonicalLeague[]);

    const allRows: OddsSnapshotRow[] = [];
    for (const league of targetLeagues) {
      if (this.options.excludeLeagues?.includes(league)) continue;
      const sportKey = LEAGUE_TO_THE_ODDS_SPORT_KEY[league];
      if (!sportKey) continue;
      if (this.leagueFilter && !this.leagueFilter.has(sportKey) && !this.leagueFilter.has(league)) {
        continue;
      }

      let skipReason = budget.check(sportKey, cost, nowMs);
      if (skipReason === null && this.precheckEvents) {
        const hasUpcoming = await this.hasEventsInWindow(apiKey, sportKey, nowMs);
        if (!hasUpcoming) {
          skipReason = "sin_partidos_en_ventana";
        }
      }
      if (skipReason !== null) {
        skipped[sportKey] = skipReason;
        continue;
      }

      const resp = await this.transport.request({
        method: "GET",
        url: `${THE_ODDS_API_BASE_URL}/sports/${sportKey}/odds`,
        query: {
          apiKey,
          regions: this.regions,
          markets: this.markets,
          oddsFormat: "decimal",
          dateFormat: "iso",
        },
      });

      for (const qk of ["x-requests-remaining", "x-requests-used", "x-requests-last"]) {
        if (resp.headers[qk]) {
          this.lastQuotaHeaders[qk] = resp.headers[qk]!;
        }
      }
      const actualCost = parseIntHeader(resp.headers["x-requests-last"]) ?? cost;
      const remaining = parseIntHeader(resp.headers["x-requests-remaining"]);
      budget.record(sportKey, actualCost, nowMs, remaining);
      fetched.push(sportKey);

      const payload = JSON.parse(resp.bodyText) as unknown;
      if (Array.isArray(payload)) {
        const rows = parseTheOddsApiEvents({
          eventsPayload: payload,
          appLeague: league,
          capturedAtIso,
          rawSha256: resp.sha256 || sha256Hex(resp.bodyText),
          nowMs,
        });
        allRows.push(...rows);
      }
    }

    budget.save();
    const allowance = budget.dailyAllowance(nowMs);
    this.lastBudgetReport = {
      creditsPerCall: cost,
      regions: this.regions,
      markets: this.markets,
      leaguesFetched: fetched,
      leaguesSkipped: skipped,
      monthCreditsUsed: budget.creditsUsed,
      todayCreditsUsed: budget.byDay[utcDayKey(nowMs)] ?? 0,
      todayAllowance: allowance === null ? null : Math.round(allowance * 100) / 100,
      remainingHeader: budget.remainingHeader,
    };

    return allRows;
  }
}
