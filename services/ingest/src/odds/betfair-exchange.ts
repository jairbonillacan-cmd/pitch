/**
 * Adaptador legal `api_only` para Betfair Exchange API-NG (`https://api.betfair.com/exchange/betting/rest/v1.0/`).
 * Portado de `web-scraping:scrapers/sources/betfair.py` e integrado con `mappings.ts` y el validador común.
 * Jamás realiza scraping web sobre `www.betfair.com`: solo consume la API-NG oficial con credenciales.
 */
import type { OddsSnapshotRow } from "@pitchlab/spacetime";
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
  type LegalStatus,
  type OddsSourceAdapter,
} from "./legal-registry.js";
import { BzzoiroOddsAdapter, BZZOIRO_ODDS_LEAGUES } from "./bzzoiro-odds.js";
import { TheOddsApiAdapter } from "./the-odds-api.js";

export const BETFAIR_API_NG_BASE = "https://api.betfair.com/exchange/betting/rest/v1.0";

const COMPETITION_TO_LEAGUE: ReadonlyArray<{ pattern: RegExp; league: CanonicalLeague }> = [
  { pattern: /liga\s*mx|mexico\s+primera/i, league: "liga-mx" },
  { pattern: /english\s+premier\s+league|premier\s+league/i, league: "premier-league" },
  { pattern: /spanish\s+la\s+liga|primera\s+division/i, league: "laliga" },
  { pattern: /german\s+bundesliga|1\.\s*bundesliga/i, league: "bundesliga" },
  { pattern: /italian\s+serie\s+a|serie\s+a/i, league: "serie-a" },
  { pattern: /french\s+ligue\s+1|ligue\s+1/i, league: "ligue-1" },
  { pattern: /\bnfl\b/i, league: "nfl" },
];

const OU_LINE_RE = /^OVER_UNDER_(\d)(\d)$/;

function parseEventTeams(eventName: string): { home: string; away: string } | null {
  for (const sep of [" v ", " vs ", " @ "]) {
    const idx = eventName.indexOf(sep);
    if (idx > 0) {
      const left = eventName.slice(0, idx).trim();
      const right = eventName.slice(idx + sep.length).trim();
      if (left && right) {
        return sep === " @ " ? { home: right, away: left } : { home: left, away: right };
      }
    }
  }
  return null;
}

function inferBetfairLeague(competitionName: string, sport: "football" | "nfl"): CanonicalLeague | null {
  if (sport === "nfl") return "nfl";
  for (const item of COMPETITION_TO_LEAGUE) {
    if (item.pattern.test(competitionName)) return item.league;
  }
  return null;
}

export function parseBetfairCatalogueAndBooks(params: {
  catalogue: readonly Record<string, unknown>[];
  marketBooks: readonly Record<string, unknown>[];
  sport: "football" | "nfl";
  capturedAtIso: string;
  rawSha256: string;
  nowMs?: number;
}): OddsSnapshotRow[] {
  const capturedIso = normalizeUtcIsoSeconds(params.capturedAtIso);
  const catByMarketId = new Map<string, Record<string, unknown>>();
  for (const item of params.catalogue) {
    const mid = String(item.marketId ?? "").trim();
    if (mid) catByMarketId.set(mid, item);
  }

  const candidates: OddsSnapshotRow[] = [];
  for (const book of params.marketBooks) {
    const mid = String(book.marketId ?? "").trim();
    const cat = catByMarketId.get(mid);
    if (!cat) continue;
    if (String(book.status ?? "OPEN").toUpperCase() !== "OPEN") continue;

    const ev = (cat.event ?? {}) as Record<string, unknown>;
    const comp = (cat.competition ?? {}) as Record<string, unknown>;
    const desc = (cat.description ?? {}) as Record<string, unknown>;
    const evName = String(ev.name ?? "").trim();
    const openDate = String(ev.openDate ?? "").trim();
    const compName = String(comp.name ?? "").trim();
    const marketType = String(desc.marketType ?? cat.marketName ?? "").trim().toUpperCase();

    const parsedTeams = parseEventTeams(evName);
    const appLeague = inferBetfairLeague(compName, params.sport);
    if (!parsedTeams || !appLeague || !openDate) continue;

    let resolvedEvent: ReturnType<typeof buildCanonicalOddsEventId>;
    try {
      resolvedEvent = buildCanonicalOddsEventId({
        appLeague,
        commenceTimeIso: openDate,
        homeTeamRaw: parsedTeams.home,
        awayTeamRaw: parsedTeams.away,
      });
    } catch (err) {
      void err;
      continue;
    }
    if (!resolvedEvent) continue;

    const runnerNames = new Map<number, string>();
    for (const r of Array.isArray(cat.runners) ? cat.runners : []) {
      if (r && typeof r === "object") {
        const ro = r as Record<string, unknown>;
        const sid = Number(ro.selectionId);
        if (Number.isFinite(sid)) {
          runnerNames.set(sid, String(ro.runnerName ?? "").trim());
        }
      }
    }

    let canonMkt: string | null = null;
    let lineVal: number | null = null;
    if (marketType === "MATCH_ODDS") {
      canonMkt = resolvedEvent.sport === "football" ? "1x2" : "moneyline";
    } else if (marketType === "MONEY_LINE") {
      canonMkt = "moneyline";
    } else if (marketType === "BOTH_TEAMS_TO_SCORE" && resolvedEvent.sport === "football") {
      canonMkt = "btts";
    } else {
      const mOu = OU_LINE_RE.exec(marketType);
      if (mOu) {
        canonMkt = "totals";
        lineVal = Number(`${mOu[1]}.${mOu[2]}`);
      }
    }
    if (!canonMkt) continue;

    for (const rawRunner of Array.isArray(book.runners) ? book.runners : []) {
      if (!rawRunner || typeof rawRunner !== "object") continue;
      const runner = rawRunner as Record<string, unknown>;
      if (String(runner.status ?? "ACTIVE").toUpperCase() !== "ACTIVE") continue;
      const sid = Number(runner.selectionId);
      const rName = runnerNames.get(sid) ?? "";
      const rLow = rName.toLowerCase();
      const ex = (runner.ex ?? {}) as Record<string, unknown>;
      const backPrices = Array.isArray(ex.availableToBack) ? ex.availableToBack : [];
      if (backPrices.length === 0 || !backPrices[0] || typeof backPrices[0] !== "object") {
        continue;
      }
      const bestBack = Number((backPrices[0] as Record<string, unknown>).price);

      let sel: string | null = null;
      if (canonMkt === "1x2" || canonMkt === "moneyline") {
        if (rLow.includes("draw")) {
          if (canonMkt !== "1x2") continue;
          sel = "draw";
        } else {
          const rSlug = resolveOddsTeamSlug(appLeague, rName);
          if (rSlug === resolvedEvent.homeSlug) sel = "home";
          else if (rSlug === resolvedEvent.awaySlug) sel = "away";
        }
      } else if (canonMkt === "totals") {
        if (rLow.startsWith("over")) sel = "over";
        else if (rLow.startsWith("under")) sel = "under";
      } else if (canonMkt === "btts") {
        if (rLow === "yes") sel = "yes";
        else if (rLow === "no") sel = "no";
      }
      if (!sel) continue;

      candidates.push({
        event_id: resolvedEvent.eventId,
        sport: resolvedEvent.sport,
        league: resolvedEvent.leagueCode,
        market: canonMkt,
        line: lineVal,
        selection: sel,
        book: "betfair_exchange",
        price_decimal: bestBack,
        ts_captured: capturedIso,
        ts_event_start: resolvedEvent.tsEventStart,
        source: "scraped_ws",
      });
    }
  }

  return validateOddsTickBatch(candidates, { nowMs: params.nowMs }).acceptedRows;
}

export class BetfairExchangeAdapter implements OddsSourceAdapter {
  readonly metadata = SOURCE_LEGAL_REGISTRY.betfair_exchange!;
  private readonly transport: CleanHttpTransport;

  constructor(
    private readonly options: {
      env?: Readonly<Record<string, string | undefined>>;
      transport?: CleanHttpTransport;
    } = {},
  ) {
    this.transport =
      options.transport ??
      new CleanHttpTransport({ rateLimitRps: this.metadata.rateLimitRps });
  }

  async fetchSnapshots(
    params: {
      activeLeagues?: readonly CanonicalLeague[];
      capturedAtIso?: string;
    } = {},
  ): Promise<OddsSnapshotRow[]> {
    const env = this.options.env ?? process.env;
    assertSourceLegallyAllowed(this.metadata.sourceId, env);
    const appKey = env.BETFAIR_APP_KEY!.trim();
    const sessionToken = env.BETFAIR_SESSION_TOKEN!.trim();
    const capturedAtIso = normalizeUtcIsoSeconds(
      params.capturedAtIso ?? new Date().toISOString(),
    );

    const active = params.activeLeagues ?? [
      "liga-mx",
      "premier-league",
      "laliga",
      "bundesliga",
      "serie-a",
      "ligue-1",
      "nfl",
    ];
    const sports = new Set<"football" | "nfl">();
    for (const lg of active) {
      sports.add(lg === "nfl" ? "nfl" : "football");
    }

    const authHeaders = {
      "x-application": appKey,
      "x-authentication": sessionToken,
    };

    const allRows: OddsSnapshotRow[] = [];
    for (const sport of sports) {
      const eventTypeId = sport === "nfl" ? "6423" : "1";
      const catResp = await this.transport.request({
        method: "POST",
        url: `${BETFAIR_API_NG_BASE}/listMarketCatalogue/`,
        headers: authHeaders,
        jsonBody: {
          filter: {
            eventTypeIds: [eventTypeId],
            marketTypeCodes: [
              "MATCH_ODDS",
              "OVER_UNDER_25",
              "BOTH_TEAMS_TO_SCORE",
              "MONEY_LINE",
            ],
          },
          maxResults: "200",
          marketProjection: ["COMPETITION", "EVENT", "RUNNER_DESCRIPTION", "MARKET_DESCRIPTION"],
        },
      });

      const catalogue = JSON.parse(catResp.bodyText) as unknown;
      if (!Array.isArray(catalogue) || catalogue.length === 0) continue;

      const marketIds = catalogue
        .map((c) =>
          c && typeof c === "object" ? String((c as Record<string, unknown>).marketId ?? "") : "",
        )
        .filter(Boolean)
        .slice(0, 40);
      if (marketIds.length === 0) continue;

      const bookResp = await this.transport.request({
        method: "POST",
        url: `${BETFAIR_API_NG_BASE}/listMarketBook/`,
        headers: authHeaders,
        jsonBody: {
          marketIds,
          priceProjection: { priceData: ["EX_BEST_OFFERS"] },
        },
      });

      const books = JSON.parse(bookResp.bodyText) as unknown;
      if (!Array.isArray(books)) continue;

      allRows.push(
        ...parseBetfairCatalogueAndBooks({
          catalogue: catalogue as Record<string, unknown>[],
          marketBooks: books as Record<string, unknown>[],
          sport,
          capturedAtIso,
          rawSha256: sha256Hex(catResp.bodyText + bookResp.bodyText),
          nowMs: Date.parse(capturedAtIso),
        }),
      );
    }

    return allRows;
  }
}

export function buildPermittedActiveOddsAdapters(
  env: Readonly<Record<string, string | undefined>> = process.env,
  options: { theOddsApiBudgetPath?: string | null } = {},
): {
  adapters: OddsSourceAdapter[];
  skipped: Array<{ sourceId: string; status: LegalStatus; reason: string }>;
} {
  const adapters: OddsSourceAdapter[] = [];
  const skipped: Array<{ sourceId: string; status: LegalStatus; reason: string }> = [];

  for (const meta of Object.values(SOURCE_LEGAL_REGISTRY)) {
    if (meta.legalStatus === "blocked_pending_owner_decision") {
      skipped.push({
        sourceId: meta.sourceId,
        status: meta.legalStatus,
        reason: meta.legalReason,
      });
      continue;
    }
    const missing = meta.requiredEnvVars.filter((k) => !env[k]?.trim());
    if (missing.length > 0) {
      skipped.push({
        sourceId: meta.sourceId,
        status: meta.legalStatus,
        reason: `Credenciales pendientes: ${missing.join(", ")}`,
      });
      continue;
    }
    if (meta.sourceId === "the_odds_api") {
      // Con Bzzoiro activo, el fútbol sale de ahí (sin cuota); The Odds API queda para la NFL.
      const bzzoiroActive = Boolean(env.BZZOIRO_API_KEY?.trim());
      adapters.push(
        new TheOddsApiAdapter({
          env,
          excludeLeagues: bzzoiroActive ? BZZOIRO_ODDS_LEAGUES : undefined,
          budgetPath: options.theOddsApiBudgetPath,
        }),
      );
    } else if (meta.sourceId === "bzzoiro_odds") {
      adapters.push(new BzzoiroOddsAdapter({ env }));
    } else if (meta.sourceId === "betfair_exchange") {
      adapters.push(new BetfairExchangeAdapter({ env }));
    }
  }

  return { adapters, skipped };
}
