/**
 * Adaptador legal `api_only` para The Odds API v4 (`https://api.the-odds-api.com/v4/`).
 * Portado de `web-scraping:scrapers/sources/the_odds_api.py` e integrado con `mappings.ts`
 * y el validador común de Parte 3.
 */
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

export class TheOddsApiAdapter implements OddsSourceAdapter {
  readonly metadata = SOURCE_LEGAL_REGISTRY.the_odds_api!;
  readonly lastQuotaHeaders: Record<string, string> = {};
  private readonly transport: CleanHttpTransport;

  constructor(
    private readonly options: {
      env?: Readonly<Record<string, string | undefined>>;
      transport?: CleanHttpTransport;
      regions?: string;
      markets?: string;
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
    const apiKey = env.THE_ODDS_API_KEY!.trim();
    const capturedAtIso = normalizeUtcIsoSeconds(
      params.capturedAtIso ?? new Date().toISOString(),
    );

    const targetLeagues: readonly CanonicalLeague[] =
      params.activeLeagues ??
      (Object.keys(LEAGUE_TO_THE_ODDS_SPORT_KEY) as CanonicalLeague[]);

    const allRows: OddsSnapshotRow[] = [];
    for (const league of targetLeagues) {
      const sportKey = LEAGUE_TO_THE_ODDS_SPORT_KEY[league];
      if (!sportKey) continue;
      const resp = await this.transport.request({
        method: "GET",
        url: `${THE_ODDS_API_BASE_URL}/sports/${sportKey}/odds`,
        query: {
          apiKey,
          regions: this.options.regions ?? "eu,uk,us",
          markets: this.options.markets ?? "h2h,spreads,totals",
          oddsFormat: "decimal",
          dateFormat: "iso",
        },
      });

      for (const qk of ["x-requests-remaining", "x-requests-used", "x-requests-last"]) {
        if (resp.headers[qk]) {
          this.lastQuotaHeaders[qk] = resp.headers[qk]!;
        }
      }

      const payload = JSON.parse(resp.bodyText) as unknown;
      if (Array.isArray(payload)) {
        const rows = parseTheOddsApiEvents({
          eventsPayload: payload,
          appLeague: league,
          capturedAtIso,
          rawSha256: resp.sha256 || sha256Hex(resp.bodyText),
          nowMs: Date.parse(capturedAtIso),
        });
        allRows.push(...rows);
      }
    }

    return allRows;
  }
}
