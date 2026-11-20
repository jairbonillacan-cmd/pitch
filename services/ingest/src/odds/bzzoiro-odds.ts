/**
 * Adaptador `api_only` de momios de fútbol desde Bzzoiro Sports Data (`/api/v2/`).
 *
 * Por cada liga de fútbol activa lista los partidos por jugar (`/events/`) y baja los momios
 * prepartido de cada uno (`/odds/?event_id=`). Emite las mismas filas que The Odds API
 * (`1x2`, `totals`, `btts`, `ah` con línea canónica del local) para que la validación de
 * Parte 3 y el snapshot no cambien. La NFL no existe en Bzzoiro: sigue con The Odds API.
 */
import { normalizeLine, type OddsLineMovement, type OddsSnapshotRow } from "@pitchlab/spacetime";
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
  codere: "codere",
  betcris: "betcris",
  bwin: "bwin",
  "william-hill": "william_hill",
  williamhill: "william_hill",
  unibet: "unibet",
  betonline: "betonline",
  betonlineag: "betonline",
  draftkings: "draftkings",
  fanduel: "fanduel",
  betmgm: "betmgm",
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
  opening_odds?: unknown;
  opening_decimal_odds?: unknown;
  opening_price?: unknown;
  movement?: unknown;
  movement_direction?: unknown;
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

function mapYesNoMarket(baseMarket: string, outcome: string): MappedQuote | null {
  if (outcome === "yes" || outcome === "no") {
    return { market: baseMarket, line: null, selection: outcome };
  }
  if (outcome === "home_yes" || outcome === "home_no") {
    return {
      market: `${baseMarket}_home`,
      line: null,
      selection: outcome.endsWith("yes") ? "yes" : "no",
    };
  }
  if (outcome === "away_yes" || outcome === "away_no") {
    return {
      market: `${baseMarket}_away`,
      line: null,
      selection: outcome.endsWith("yes") ? "yes" : "no",
    };
  }
  return null;
}

function mapQuote(row: BzOddsRow): MappedQuote | null {
  const market = String(row.market ?? "").trim().toLowerCase();
  const outcome = String(row.outcome ?? "").trim().toLowerCase();

  if (market === "1x2") {
    if (outcome === "home" || outcome === "draw" || outcome === "away") {
      return { market: "1x2", line: null, selection: outcome };
    }
    return null;
  }
  if (market === "double_chance") {
    if (outcome === "1x" || outcome === "home_or_draw") return { market: "double_chance", line: null, selection: "1X" };
    if (outcome === "12" || outcome === "home_or_away") return { market: "double_chance", line: null, selection: "12" };
    if (outcome === "x2" || outcome === "away_or_draw") return { market: "double_chance", line: null, selection: "X2" };
    return null;
  }
  if (market === "draw_no_bet" || market === "dnb") {
    if (outcome === "home" || outcome === "away") return { market: "dnb", line: null, selection: outcome };
    return null;
  }
  if (market === "total_corners" || market === "corners_over_under" || /^total_corners_\d+$/.test(market)) {
    const line = normalizeLine(Number(row.line));
    if (line === null || (outcome !== "over" && outcome !== "under")) return null;
    return { market: "corners_total", line, selection: outcome };
  }
  if (/^over_under_\d+$/.test(market) || market === "over_under") {
    const line = normalizeLine(Number(row.line));
    if (line === null || (outcome !== "over" && outcome !== "under")) return null;
    return { market: "totals", line, selection: outcome };
  }
  if (market === "btts") {
    return outcome === "yes" || outcome === "no"
      ? { market: "btts", line: null, selection: outcome }
      : null;
  }
  if (market === "clean_sheet" || market === "clean_sheet_home" || market === "clean_sheet_away") {
    return market === "clean_sheet"
      ? mapYesNoMarket("clean_sheet", outcome)
      : outcome === "yes" || outcome === "no"
        ? { market, line: null, selection: outcome }
        : null;
  }
  if (market === "win_to_nil" || market === "win_to_nil_home" || market === "win_to_nil_away") {
    return market === "win_to_nil"
      ? mapYesNoMarket("win_to_nil", outcome)
      : outcome === "yes" || outcome === "no"
        ? { market, line: null, selection: outcome }
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

function resolveOpeningAndMovement(
  row: BzOddsRow,
  currentDecimal: number,
): { openingPrice?: number; movementDirection?: OddsLineMovement } {
  const rawOpen = row.opening_odds ?? row.opening_decimal_odds ?? row.opening_price;
  const openNum = Number(rawOpen);
  const openingPrice =
    Number.isFinite(openNum) && openNum >= 1.01 && openNum <= 1000
      ? Math.round(openNum * 1000) / 1000
      : undefined;

  const rawDir = String(row.movement ?? row.movement_direction ?? "")
    .trim()
    .toUpperCase();
  let movementDirection: OddsLineMovement | undefined;
  if (rawDir === "SHORTENING" || rawDir === "DOWN") movementDirection = "shortening";
  else if (rawDir === "DRIFTING" || rawDir === "UP") movementDirection = "drifting";
  else if (rawDir === "STABLE" || rawDir === "FLAT") movementDirection = "stable";
  else if (openingPrice !== undefined && Number.isFinite(currentDecimal)) {
    const delta = currentDecimal - openingPrice;
    if (delta <= -0.02) movementDirection = "shortening";
    else if (delta >= 0.02) movementDirection = "drifting";
    else movementDirection = "stable";
  }

  return {
    ...(openingPrice !== undefined ? { openingPrice } : {}),
    ...(movementDirection !== undefined ? { movementDirection } : {}),
  };
}

/** Marca `is_best_odds: true` en la mejor cuota disponible por evento, mercado, línea y selección. */
export function annotateBestOddsBySelection(rows: readonly OddsSnapshotRow[]): OddsSnapshotRow[] {
  const bestByKey = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.event_id}\u001f${r.market}\u001f${r.line ?? "null"}\u001f${r.selection}`;
    const prev = bestByKey.get(k);
    if (prev === undefined || r.price_decimal > prev) {
      bestByKey.set(k, r.price_decimal);
    }
  }
  return rows.map((r) => {
    const k = `${r.event_id}\u001f${r.market}\u001f${r.line ?? "null"}\u001f${r.selection}`;
    const best = bestByKey.get(k);
    return best !== undefined && Math.abs(r.price_decimal - best) < 1e-6
      ? { ...r, is_best_odds: true }
      : r;
  });
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
      const currentDecimal = Number(row.decimal_odds);
      const { openingPrice, movementDirection } = resolveOpeningAndMovement(row, currentDecimal);
      candidates.push({
        event_id: resolved.eventId,
        sport: resolved.sport,
        league: resolved.leagueCode,
        market: quote.market,
        line: quote.line,
        selection: quote.selection,
        book,
        price_decimal: currentDecimal,
        ...(openingPrice !== undefined ? { opening_price: openingPrice } : {}),
        ...(movementDirection !== undefined ? { movement_direction: movementDirection } : {}),
        ts_captured: capturedIso,
        ts_event_start: resolved.tsEventStart,
        source: "scraped_ws",
      });
    }
  }

  const accepted = validateOddsTickBatch(candidates, { nowMs: params.nowMs }).acceptedRows;
  return annotateBestOddsBySelection(accepted);
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

  /** Consulta `/odds/best/?market=` para conocer el mejor precio vigente sin exponer un feed crudo. */
  async fetchBestOddsByMarket(market: string = "1x2"): Promise<BzOddsRow[]> {
    assertSourceLegallyAllowed(this.metadata.sourceId, this.env);
    return this.getAll<BzOddsRow>("/odds/best/", { market });
  }

  /** Consulta `/events/{id}/odds/comparison/` para comparar casas en un partido concreto. */
  async fetchEventOddsComparison(providerEventId: number): Promise<BzOddsRow[]> {
    assertSourceLegallyAllowed(this.metadata.sourceId, this.env);
    return this.getAll<BzOddsRow>(`/events/${providerEventId}/odds/comparison/`, {});
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
          const evOdds = await this.getAll<BzOddsRow>("/odds/", { event_id: String(id) });
          oddsByEvent.set(id, evOdds);
        }

        allRows.push(
          ...parseBzzoiroOdds({ events, oddsByEvent, appLeague: league, capturedAtIso, nowMs }),
        );
      }
    }
    return allRows;
  }
}
