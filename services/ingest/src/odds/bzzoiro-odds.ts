/**
 * Adaptador `api_only` de momios de fútbol desde Bzzoiro Sports Data (`/api/v2/`).
 *
 * Por cada liga de fútbol activa lista los partidos por jugar (`/events/`) y baja los momios
 * prepartido de cada uno (`/odds/?event_id=`). Emite las mismas filas que The Odds API
 * (`1x2`, `totals`, `btts`, `ah` con línea canónica del local) para que la validación de
 * Parte 3 y el snapshot no cambien. La NFL no existe en Bzzoiro: sigue con The Odds API.
 */
import { normalizeLine, type OddsSnapshotRow } from "@pitchlab/spacetime";
import type { CanonicalLeague } from "../mappings.js";
import { BZZOIRO_LEAGUES } from "../providers/bzzoiro.js";
import { validateOddsTickBatch } from "../validation/snapshot-validator.js";
import {
  assertSourceLegallyAllowed,
  buildCanonicalOddsEventId,
  CleanHttpTransport,
  normalizeUtcIsoSeconds,
  SOURCE_LEGAL_REGISTRY,
  type OddsSourceAdapter,
} from "./legal-registry.js";

export const BZZOIRO_ODDS_BASE_URL_DEFAULT = "https://sports.bzzoiro.com/api/v2";

/** Ligas de PitchLab que Bzzoiro cubre (todas las de fútbol). */
export const BZZOIRO_ODDS_LEAGUES: readonly CanonicalLeague[] = [
  "liga-mx",
  "premier-league",
  "laliga",
  "bundesliga",
  "serie-a",
  "ligue-1",
];

/** `bookmaker_slug` de Bzzoiro → casa canónica permitida por el validador. */
const BZZOIRO_BOOK_MAP: Readonly<Record<string, string>> = {
  pinnacle: "pinnacle",
  bet365: "bet365",
  bwin: "bwin",
  "william-hill": "william_hill",
  unibet: "unibet",
  codere: "codere",
  betonline: "betonline",
  draftkings: "draftkings",
  fanduel: "fanduel",
};

/** Días hacia adelante que se consultan; más allá casi no hay casas con precio. */
const LOOKAHEAD_DAYS = 8;
const PAGE_LIMIT = 200;
const MAX_PAGES = 10;

export interface BzOddsEvent {
  id?: unknown;
  home_team?: unknown;
  away_team?: unknown;
  event_date?: unknown;
  status?: unknown;
}

export interface BzOddsRow {
  event_id?: unknown;
  market?: unknown;
  outcome?: unknown;
  line?: unknown;
  bookmaker_slug?: unknown;
  decimal_odds?: unknown;
  is_live?: unknown;
}

function teamName(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object" && "name" in raw) {
    return String((raw as { name?: unknown }).name ?? "").trim();
  }
  return "";
}

type MappedQuote = { market: string; line: number | null; selection: string };

function mapQuote(row: BzOddsRow): MappedQuote | null {
  const market = String(row.market ?? "").trim().toLowerCase();
  const outcome = String(row.outcome ?? "").trim().toLowerCase();

  if (market === "1x2") {
    if (outcome === "home" || outcome === "draw" || outcome === "away") {
      return { market: "1x2", line: null, selection: outcome };
    }
    return null;
  }
  if (/^over_under_\d+$/.test(market)) {
    const line = normalizeLine(Number(row.line));
    if (line === null || (outcome !== "over" && outcome !== "under")) return null;
    return { market: "totals", line, selection: outcome };
  }
  if (market === "btts") {
    return outcome === "yes" || outcome === "no"
      ? { market: "btts", line: null, selection: outcome }
      : null;
  }
  if (market === "asian_handicap") {
    // Bzzoiro ya publica la línea del local para ambos lados («Home -1.25» / «Away +1.25»).
    const line = normalizeLine(Number(row.line));
    if (line === null || (outcome !== "home" && outcome !== "away")) return null;
    return { market: "ah", line, selection: outcome };
  }
  return null;
}

/**
 * Convierte los partidos y momios de Bzzoiro a filas canónicas validadas.
 * Descarta momios en vivo, casas no autorizadas, mercados que no usamos y equipos sin mapeo.
 */
export function parseBzzoiroOdds(params: {
  events: readonly BzOddsEvent[];
  oddsByEvent: ReadonlyMap<number, readonly BzOddsRow[]>;
  appLeague: CanonicalLeague;
  capturedAtIso: string;
  nowMs?: number;
}): OddsSnapshotRow[] {
  const capturedIso = normalizeUtcIsoSeconds(params.capturedAtIso);
  const candidates: OddsSnapshotRow[] = [];

  for (const ev of params.events) {
    const bzId = Number(ev.id);
    const rows = params.oddsByEvent.get(bzId);
    if (!rows || rows.length === 0) continue;
    const home = teamName(ev.home_team);
    const away = teamName(ev.away_team);
    const kickoff = String(ev.event_date ?? "").trim();
    if (!home || !away || !kickoff) continue;

    let resolved: ReturnType<typeof buildCanonicalOddsEventId>;
    try {
      resolved = buildCanonicalOddsEventId({
        appLeague: params.appLeague,
        commenceTimeIso: kickoff,
        homeTeamRaw: home,
        awayTeamRaw: away,
      });
    } catch (err) {
      void err;
      continue;
    }
    if (!resolved) continue;

    for (const row of rows) {
      if (row.is_live === true) continue;
      const book = BZZOIRO_BOOK_MAP[String(row.bookmaker_slug ?? "").trim().toLowerCase()];
      if (!book) continue;
      const quote = mapQuote(row);
      if (!quote) continue;
      candidates.push({
        event_id: resolved.eventId,
        sport: resolved.sport,
        league: resolved.leagueCode,
        market: quote.market,
        line: quote.line,
        selection: quote.selection,
        book,
        price_decimal: Number(row.decimal_odds),
        ts_captured: capturedIso,
        ts_event_start: resolved.tsEventStart,
        source: "scraped_ws",
      });
    }
  }

  return validateOddsTickBatch(candidates, { nowMs: params.nowMs }).acceptedRows;
}

interface BzPageBody<T> {
  results?: T[];
  next?: string | null;
}

export class BzzoiroOddsAdapter implements OddsSourceAdapter {
  readonly metadata = SOURCE_LEGAL_REGISTRY.bzzoiro_odds!;
  private readonly transport: CleanHttpTransport;
  requestCount = 0;

  constructor(
    private readonly options: {
      env?: Readonly<Record<string, string | undefined>>;
      transport?: CleanHttpTransport;
    } = {},
  ) {
    this.transport =
      options.transport ?? new CleanHttpTransport({ rateLimitRps: this.metadata.rateLimitRps });
  }

  private get env(): Readonly<Record<string, string | undefined>> {
    return this.options.env ?? process.env;
  }

  private async getAll<T>(path: string, query: Record<string, string>): Promise<T[]> {
    const base = (this.env.BZZOIRO_API_BASE_URL?.trim() || BZZOIRO_ODDS_BASE_URL_DEFAULT).replace(/\/+$/, "");
    const token = this.env.BZZOIRO_API_KEY!.trim();
    const out: T[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const resp = await this.transport.request({
        method: "GET",
        url: `${base}${path}`,
        headers: { authorization: `Token ${token}` },
        query: { ...query, limit: String(PAGE_LIMIT), offset: String(page * PAGE_LIMIT) },
      });
      this.requestCount += 1;
      if (resp.status < 200 || resp.status >= 300) {
        throw new Error(`Bzzoiro respondió ${resp.status} en ${path}`);
      }
      const body = JSON.parse(resp.bodyText) as BzPageBody<T>;
      out.push(...(body.results ?? []));
      if (!body.next) break;
    }
    return out;
  }

  async fetchSnapshots(
    params: { activeLeagues?: readonly CanonicalLeague[]; capturedAtIso?: string } = {},
  ): Promise<OddsSnapshotRow[]> {
    assertSourceLegallyAllowed(this.metadata.sourceId, this.env);
    const capturedAtIso = normalizeUtcIsoSeconds(params.capturedAtIso ?? new Date().toISOString());
    const nowMs = Date.parse(capturedAtIso);
    const dateFrom = capturedAtIso.slice(0, 10);
    const dateTo = new Date(nowMs + LOOKAHEAD_DAYS * 86_400_000).toISOString().slice(0, 10);

    const leagues = (params.activeLeagues ?? BZZOIRO_ODDS_LEAGUES).filter((l) =>
      BZZOIRO_ODDS_LEAGUES.includes(l),
    );

    const allRows: OddsSnapshotRow[] = [];
    for (const league of leagues) {
      const bzLeagueIds = BZZOIRO_LEAGUES[league as keyof typeof BZZOIRO_LEAGUES] ?? [];
      for (const leagueId of bzLeagueIds) {
        const events = (
          await this.getAll<BzOddsEvent>("/events/", {
            league_id: String(leagueId),
            date_from: dateFrom,
            date_to: dateTo,
          })
        ).filter((e) => {
          const ko = Date.parse(String(e.event_date ?? ""));
          return Number.isFinite(ko) && ko > nowMs && String(e.status ?? "") === "notstarted";
        });

        const oddsByEvent = new Map<number, BzOddsRow[]>();
        for (const ev of events) {
          const id = Number(ev.id);
          if (!Number.isFinite(id)) continue;
          oddsByEvent.set(id, await this.getAll<BzOddsRow>("/odds/", { event_id: String(id) }));
        }

        allRows.push(
          ...parseBzzoiroOdds({ events, oddsByEvent, appLeague: league, capturedAtIso, nowMs }),
        );
      }
    }
    return allRows;
  }
}
