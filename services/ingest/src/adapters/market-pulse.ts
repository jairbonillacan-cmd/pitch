/**
 * Volumen por resultado en mercados de predicción con API pública y sin clave (FD-20).
 *
 * - Fútbol: Polymarket (Gamma API). Cada partido trae un mercado sí/no por resultado (local,
 *   empate, visitante) con su volumen en USD.
 * - NFL: Kalshi. Cada partido trae un contrato sí/no por equipo con su volumen en contratos.
 *
 * Solo se leen endpoints públicos documentados; nada de casas de apuestas ni scraping.
 */
import { z } from "zod";
import type { GameDTO, MarketPulseEntry, MarketPulseSide } from "@pitchlab/contracts";
import { nameSimilarity } from "./football-data-merge.js";

export const POLYMARKET_TAGS: Record<string, string> = {
  "premier-league": "premier-league",
  "liga-mx": "mex",
  laliga: "la-liga",
  bundesliga: "bundesliga",
  "serie-a": "sea",
  "ligue-1": "ligue-1",
};

const POLYMARKET_EVENTS_URL = "https://gamma-api.polymarket.com/events";
const KALSHI_EVENTS_URL = "https://api.elections.kalshi.com/trade-api/v2/events";

/** Ventana para emparejar la hora del mercado con la del partido. */
const KICKOFF_WINDOW_MS = 36 * 60 * 60 * 1000;
const MIN_NAME_SIMILARITY = 0.5;

const numeric = z.union([z.number(), z.string()]).transform((v) => Number(v));

const PolymarketMarketSchema = z.object({
  groupItemTitle: z.string().nullish(),
  question: z.string().nullish(),
  volume: numeric.nullish(),
  outcomePrices: z.string().nullish(),
  sportsMarketType: z.string().nullish(),
  gameStartTime: z.string().nullish(),
});

const PolymarketEventSchema = z.object({
  title: z.string(),
  endDate: z.string().nullish(),
  markets: z.array(PolymarketMarketSchema).default([]),
});
export type PolymarketEvent = z.infer<typeof PolymarketEventSchema>;

const KalshiMarketSchema = z.object({
  ticker: z.string(),
  volume_fp: numeric.nullish(),
  volume: numeric.nullish(),
  last_price_dollars: numeric.nullish(),
});

const KalshiEventSchema = z.object({
  event_ticker: z.string(),
  markets: z.array(KalshiMarketSchema).default([]),
});
export type KalshiEvent = z.infer<typeof KalshiEventSchema>;

/** Códigos de Kalshi que difieren de los nuestros (nflverse). */
const KALSHI_CODE_ALIASES: Record<string, string> = { JAC: "JAX" };

function yesPrice(outcomePrices: string | null | undefined): number | null {
  if (!outcomePrices) return null;
  try {
    const parsed = JSON.parse(outcomePrices) as unknown;
    if (!Array.isArray(parsed)) return null;
    const p = Number(parsed[0]);
    return Number.isFinite(p) && p >= 0 && p <= 1 ? p : null;
  } catch {
    return null;
  }
}

function kickoffMs(game: GameDTO): number {
  // nflverse da la hora sin zona: se lee como UTC; la ventana de 36 h absorbe el desfase.
  const raw = /[zZ]|[+-]\d\d:?\d\d$/.test(game.startTime) ? game.startTime : `${game.startTime}Z`;
  return Date.parse(raw);
}

/** Empareja eventos de Polymarket (fútbol) con los partidos del snapshot. */
export function matchPolymarketEvents(
  events: readonly PolymarketEvent[],
  games: readonly GameDTO[],
  observedAt: string,
): MarketPulseEntry[] {
  const entries: MarketPulseEntry[] = [];
  const used = new Set<string>();

  for (const event of events) {
    const moneyline = event.markets.filter((m) => m.sportsMarketType === "moneyline");
    if (moneyline.length !== 3) continue;
    const [homeTitle, awayTitle] = event.title.split(/\s+vs\.?\s+/i);
    if (!homeTitle || !awayTitle) continue;
    const startRaw = moneyline[0]?.gameStartTime ?? event.endDate;
    const start = startRaw ? Date.parse(startRaw.replace(" ", "T").replace(/\+00$/, "Z")) : NaN;

    const game = games.find(
      (g) =>
        !used.has(g.id) &&
        nameSimilarity(g.home.name, homeTitle) >= MIN_NAME_SIMILARITY &&
        nameSimilarity(g.away.name, awayTitle) >= MIN_NAME_SIMILARITY &&
        (!Number.isFinite(start) || Math.abs(kickoffMs(g) - start) <= KICKOFF_WINDOW_MS),
    );
    if (!game) continue;

    const outcomes: MarketPulseEntry["outcomes"] = [];
    for (const m of moneyline) {
      const title = m.groupItemTitle ?? m.question ?? "";
      let side: MarketPulseSide;
      if (/^draw\b/i.test(title)) side = "draw";
      else side = nameSimilarity(title, homeTitle) >= nameSimilarity(title, awayTitle) ? "home" : "away";
      if (outcomes.some((o) => o.side === side)) continue;
      outcomes.push({ side, volume: m.volume ?? 0, price: yesPrice(m.outcomePrices) });
    }
    if (outcomes.length !== 3) continue;

    used.add(game.id);
    entries.push({ gameId: game.id, source: "polymarket", unit: "usd", observedAt, outcomes });
  }
  return entries;
}

/** Fecha del ticker de Kalshi («KXNFLGAME-26NOV09BUFMIN» → 2026-11-09). */
function kalshiTickerDate(eventTicker: string): number {
  const m = /-(\d{2})([A-Z]{3})(\d{2})/.exec(eventTicker);
  if (!m) return NaN;
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const month = months.indexOf(m[2]!);
  if (month < 0) return NaN;
  return Date.UTC(2000 + Number(m[1]), month, Number(m[3]), 12);
}

/** Empareja eventos de Kalshi (NFL) con los partidos del snapshot por código de equipo. */
export function matchKalshiEvents(
  events: readonly KalshiEvent[],
  games: readonly GameDTO[],
  observedAt: string,
): MarketPulseEntry[] {
  const entries: MarketPulseEntry[] = [];
  for (const event of events) {
    const byCode = new Map<string, { volume: number; price: number | null }>();
    for (const m of event.markets) {
      const raw = m.ticker.slice(m.ticker.lastIndexOf("-") + 1);
      const code = KALSHI_CODE_ALIASES[raw] ?? raw;
      const volume = m.volume_fp ?? m.volume ?? 0;
      const price = m.last_price_dollars ?? null;
      byCode.set(code, {
        volume: Number.isFinite(volume) ? volume : 0,
        price: price !== null && Number.isFinite(price) && price >= 0 && price <= 1 ? price : null,
      });
    }
    const date = kalshiTickerDate(event.event_ticker);
    const game = games.find(
      (g) =>
        g.home.code !== undefined &&
        g.away.code !== undefined &&
        byCode.has(g.home.code) &&
        byCode.has(g.away.code) &&
        (!Number.isFinite(date) || Math.abs(kickoffMs(g) - date) <= KICKOFF_WINDOW_MS),
    );
    if (!game || !game.home.code || !game.away.code) continue;
    const home = byCode.get(game.home.code)!;
    const away = byCode.get(game.away.code)!;
    entries.push({
      gameId: game.id,
      source: "kalshi",
      unit: "contracts",
      observedAt,
      outcomes: [
        { side: "home", ...home },
        { side: "away", ...away },
      ],
    });
  }
  return entries;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "PitchLab-ingest/1.0" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} · ${url}`);
  return res.json();
}

export async function fetchPolymarketEvents(tag: string): Promise<PolymarketEvent[]> {
  const url = `${POLYMARKET_EVENTS_URL}?tag_slug=${encodeURIComponent(tag)}&closed=false&limit=200`;
  return z.array(PolymarketEventSchema).parse(await getJson(url));
}

export async function fetchKalshiNflEvents(): Promise<KalshiEvent[]> {
  const out: KalshiEvent[] = [];
  let cursor = "";
  for (let page = 0; page < 5; page += 1) {
    const url =
      `${KALSHI_EVENTS_URL}?series_ticker=KXNFLGAME&status=open&limit=200&with_nested_markets=true` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const body = z
      .object({ events: z.array(KalshiEventSchema), cursor: z.string().nullish() })
      .parse(await getJson(url));
    out.push(...body.events);
    if (!body.cursor) break;
    cursor = body.cursor;
  }
  return out;
}

/**
 * Une las lecturas nuevas con las anteriores: un partido que ya no aparece abierto (empezó o
 * terminó) conserva su última lectura previa al inicio.
 */
export function mergeMarketPulse(
  previous: readonly MarketPulseEntry[],
  fresh: readonly MarketPulseEntry[],
  gameIds: ReadonlySet<string>,
): MarketPulseEntry[] {
  const byId = new Map<string, MarketPulseEntry>();
  for (const e of previous) if (gameIds.has(e.gameId)) byId.set(e.gameId, e);
  for (const e of fresh) byId.set(e.gameId, e);
  return [...byId.values()].sort((a, b) => a.gameId.localeCompare(b.gameId));
}
