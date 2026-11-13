import {
  asMarketKey,
  type AnalysisMarketGroup,
  type AnalysisMarketRow,
  type MatchAnalysis,
} from "@pitchlab/contracts";
import type { MatchOutlook, MarketOutlook } from "@pitchlab/spacetime";
import liveSnapshotJson from "@pitchlab/spacetime/data/live_matchday_v3_snapshot.json";
import type { MatchOutlookSummary, PlatformMarketRow, SpacetimeSignal } from "@pitchlab/ui";
import { LEAGUE_TO_V3, teamScore } from "./spacetime";

/**
 * Panorama por mercado del motor v3.2 (`MatchOutlook`) para la ficha del partido.
 *
 * Reglas de v3.2 (SYNC_NOTES §5): solo probabilidad y momio justo (1 / p); cero stake,
 * Kelly o EV; la cuota de casa solo existe con captura real de menos de 72 h. El snapshot
 * de hoy no trae ninguna (`market: null`), así que la columna «Casa» queda vacía.
 */

interface OutlookSnapshot {
  outlooks_meta?: { generated_at_utc?: string };
  outlooks?: MatchOutlook[];
}

const snapshot = liveSnapshotJson as unknown as OutlookSnapshot;

/** Grupo visible y clave de mercado para la tabla de la ficha (los filtros leen ambos). */
const MARKET_GROUPS: Readonly<Record<string, { group: string; market: string }>> = {
  "1x2": { group: "Resultado 1X2", market: "1x2" },
  moneyline: { group: "Ganador", market: "moneyline" },
  double_chance: { group: "Doble oportunidad", market: "double_chance" },
  totals_1_5: { group: "Total de goles", market: "totals" },
  totals_2_5: { group: "Total de goles", market: "totals" },
  totals_3_5: { group: "Total de goles", market: "totals" },
  btts: { group: "Ambos anotan", market: "btts" },
  dnb: { group: "Empate no acción", market: "dnb" },
  "ah_-1_0": { group: "Hándicap asiático", market: "handicap" },
  "ah_-0_5": { group: "Hándicap asiático", market: "handicap" },
  ah_0_5: { group: "Hándicap asiático", market: "handicap" },
  ah_1_0: { group: "Hándicap asiático", market: "handicap" },
  spread: { group: "Hándicap", market: "spread" },
  totals: { group: "Total de puntos", market: "totals" },
};

interface TeamNames {
  league: string;
  home: { name: string };
  away: { name: string };
}

let byLeague: Map<string, MatchOutlook[]> | null = null;

function outlooksByLeague(): Map<string, MatchOutlook[]> {
  if (byLeague) return byLeague;
  byLeague = new Map();
  for (const o of snapshot.outlooks ?? []) {
    const list = byLeague.get(o.league) ?? [];
    list.push(o);
    byLeague.set(o.league, list);
  }
  return byLeague;
}

/** Panorama del partido, emparejado por liga y nombres de equipo; `null` si no está. */
export function findOutlook(game: TeamNames): MatchOutlook | null {
  const league = LEAGUE_TO_V3[game.league] ?? game.league;
  let top: MatchOutlook | null = null;
  let topScore = 0;
  for (const o of outlooksByLeague().get(league) ?? []) {
    const home = teamScore(o.homeTeam, game.home.name);
    const away = teamScore(o.awayTeam, game.away.name);
    const score = home > 0 && away > 0 ? home + away : 0;
    if (score > topScore) {
      top = o;
      topScore = score;
    }
  }
  return top;
}

/** Cambia los nombres de equipo del motor por los de la app en una etiqueta. */
function relabel(label: string, o: MatchOutlook, game: TeamNames): string {
  return label.split(o.homeTeam).join(game.home.name).split(o.awayTeam).join(game.away.name);
}

function rowsOf(m: MarketOutlook, o: MatchOutlook, game: TeamNames): PlatformMarketRow[] {
  const meta = MARKET_GROUPS[m.marketKey];
  if (!meta) return [];
  return m.selections.map((s) => ({
    group: meta.group,
    market: meta.market,
    selection: s.selection,
    label: relabel(s.label, o, game),
    p: s.p,
    fairDecimal: s.fairOdds.decimal,
    fairAmerican: s.fairOdds.american,
    openDecimal: null,
    // MarketQuoteContext no trae precio por selección: sin cuota de casa por fila.
    currentDecimal: null,
    edgePts: null,
  }));
}

export interface OutlookDetail {
  markets: PlatformMarketRow[];
  outlook: MatchOutlookSummary;
}

/** Filas de mercado y resumen del panorama v3.2 para la ficha, o `null` si no hay. */
export function outlookDetailFor(game: TeamNames): OutlookDetail | null {
  const o = findOutlook(game);
  if (!o) return null;
  const markets = o.markets.flatMap((m) => rowsOf(m, o, game));
  if (markets.length === 0) return null;

  const result = o.marketsByKey["1x2"] ?? o.marketsByKey.moneyline ?? null;
  return {
    markets,
    outlook: {
      generatedAtUtc: snapshot.outlooks_meta?.generated_at_utc ?? o.tsDecision,
      mostLikely: result
        ? {
            label:
              result.headline.selection === "home"
                ? `Gana ${game.home.name}`
                : result.headline.selection === "away"
                  ? `Gana ${game.away.name}`
                  : "Empate",
            p: result.headline.p,
            fairDecimal: result.headline.fairOdds.decimal,
          }
        : null,
      scorelines: o.topScorelines.slice(0, 3).map((s) => ({
        home: s.homeGoals,
        away: s.awayGoals,
        p: s.p,
        fairDecimal: s.fairOdds.decimal,
      })),
      quality: {
        flag: o.dataQuality.flag,
        coveragePct: Math.round(o.dataQuality.coverageRatio * 100),
      },
      hasRecentQuote: o.markets.some((m) => m.market !== null),
    },
  };
}

// ── Dataset del Club (Inicio, Picks, landing) sobre el panorama v3.2 ─────────────────────

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

/** Momio justo (1 / p) en decimal y americano, redondeado como en el resto del Club. */
function fairOddsOf(p: number): { decimal: number; american: number } {
  const decimal = Math.round((1 / p) * 100) / 100;
  const american = decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
  return { decimal, american };
}

function row(
  market: string,
  selection: string,
  label: string,
  p: number,
  fairOdds: number,
  line?: number,
): AnalysisMarketRow {
  return {
    market: asMarketKey(market),
    selection,
    label,
    ...(line !== undefined ? { line } : {}),
    p,
    fairOdds,
  };
}

/** Selección de un mercado del panorama, o `undefined` si no está. */
function sel(o: MatchOutlook, key: string, selection: string) {
  return o.marketsByKey[key as keyof MatchOutlook["marketsByKey"]]?.selections.find(
    (s) => s.selection === selection,
  );
}

/**
 * Grupos de mercado del partido desde el panorama v3.2, con las mismas claves que el
 * snapshot (`h2h`, `double_chance`, `totals`, `btts`, `correct_score`) para que el armado de
 * picks, el parlay y la calificación sigan funcionando igual. Hándicap asiático y empate no
 * acción solo viven en la ficha (`outlookDetailFor`): su liquidación tiene reembolsos.
 */
function footballGroups(o: MatchOutlook, match: MatchAnalysis): AnalysisMarketGroup[] {
  const groups: AnalysisMarketGroup[] = [];
  const home = sel(o, "1x2", "home");
  const draw = sel(o, "1x2", "draw");
  const away = sel(o, "1x2", "away");
  if (home && draw && away) {
    groups.push({
      group: "Resultado",
      rows: [
        row("h2h", "home", `${match.home.name} gana`, home.p, home.fairOdds.decimal),
        row("h2h", "draw", "Empate", draw.p, draw.fairOdds.decimal),
        row("h2h", "away", `${match.away.name} gana`, away.p, away.fairOdds.decimal),
      ],
    });
  }
  const dc = [
    ["1X", "1x", `${match.home.name} o empate`],
    ["X2", "x2", `${match.away.name} o empate`],
    ["12", "12", "Sin empate"],
  ] as const;
  const dcRows = dc.flatMap(([key, selection, label]) => {
    const s = sel(o, "double_chance", key);
    return s ? [row("double_chance", selection, label, s.p, s.fairOdds.decimal)] : [];
  });
  if (dcRows.length > 0) groups.push({ group: "Doble oportunidad", rows: dcRows });

  const totals = (["1_5", "2_5", "3_5"] as const).flatMap((k) => {
    const line = Number(k.replace("_", "."));
    const over = sel(o, `totals_${k}`, "over");
    const under = sel(o, `totals_${k}`, "under");
    return [
      ...(over ? [row("totals", `over_${line}`, `Más de ${line}`, over.p, over.fairOdds.decimal, line)] : []),
      ...(under ? [row("totals", `under_${line}`, `Menos de ${line}`, under.p, under.fairOdds.decimal, line)] : []),
    ];
  });
  if (totals.length > 0) groups.push({ group: "Goles totales", rows: totals });

  const yes = sel(o, "btts", "yes");
  const no = sel(o, "btts", "no");
  if (yes && no) {
    groups.push({
      group: "Ambos anotan",
      rows: [
        row("btts", "yes", "Sí", yes.p, yes.fairOdds.decimal),
        row("btts", "no", "No", no.p, no.fairOdds.decimal),
      ],
    });
  }

  if (o.topScorelines.length > 0) {
    groups.push({
      group: "Marcador exacto (más probables)",
      rows: o.topScorelines.map((s) =>
        row(
          "correct_score",
          `${s.homeGoals}-${s.awayGoals}`,
          `${s.homeGoals}–${s.awayGoals}`,
          s.p,
          s.fairOdds.decimal,
        ),
      ),
    });
  }
  return groups;
}

const CONF_ALTA = 62;
const CONF_MEDIA = 45;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const gamesPlayed = (record: string) => Number(/(\d+)\s*PJ/i.exec(record)?.[1] ?? NaN);

/**
 * Confianza sobre el panorama v3.2, explicable por factor:
 * - qué tan claro es el favorito (50 %), con la misma escala que el índice del snapshot;
 * - qué parte de los datos del modelo hay para este partido (30 %, `dataQuality.coverageRatio`);
 * - cuántos partidos lleva el equipo con menos juegos esta temporada (20 %, tope en 10).
 */
export function outlookConfidence(
  o: MatchOutlook,
  match: MatchAnalysis,
  favorite: number,
): NonNullable<MatchAnalysis["confidence"]> {
  const isNfl = o.sport === "nfl";
  const floor = isNfl ? 0.5 : 0.34;
  const ceil = isNfl ? 0.85 : 0.75;
  const fav = clamp01((favorite - floor) / (ceil - floor));
  const coverage = clamp01(o.dataQuality.coverageRatio);
  const minGames = Math.min(gamesPlayed(match.home.record), gamesPlayed(match.away.record));
  const sample = Number.isFinite(minGames) ? clamp01(minGames / 10) : 0.5;
  const score = Math.round(100 * (0.5 * fav + 0.3 * coverage + 0.2 * sample));
  const level = score >= CONF_ALTA ? "alta" : score >= CONF_MEDIA ? "media" : "baja";
  const pct = (v: number) => `${Math.round(v * 100)} %`;

  const reasons: string[] = [];
  if (fav >= 0.6) reasons.push("Favorito claro");
  else if (fav <= 0.2) reasons.push("Partido parejo");
  if (o.dataQuality.flag === "fallback_base_rate") reasons.push("Sin datos del partido: base histórica de la liga");
  else if (coverage < 0.5) reasons.push(`Datos parciales (${pct(coverage)} del modelo)`);
  else reasons.push("Datos casi completos");
  if (sample < 0.5) reasons.push("Poca muestra esta temporada");

  return {
    score,
    level,
    reasons: reasons.slice(0, 3),
    factors: [
      {
        key: "favorite",
        label: "Favorito",
        value: fav,
        weight: 0.5,
        detail: `El resultado más probable tiene ${pct(favorite)}. Entre más se separa del resto, más claro es el partido.`,
      },
      {
        key: "coverage",
        label: "Datos disponibles",
        value: coverage,
        weight: 0.3,
        detail: `El modelo tiene ${pct(coverage)} de los datos que usa (alineaciones, bajas, forma, mercado).`,
      },
      {
        key: "sample",
        label: "Partidos jugados",
        value: sample,
        weight: 0.2,
        detail: Number.isFinite(minGames)
          ? `El equipo con menos juegos lleva ${minGames} esta temporada; con 10 o más la muestra es suficiente.`
          : "No hay registro de partidos jugados esta temporada.",
      },
    ],
  };
}

export interface OutlookApplied {
  match: MatchAnalysis;
  signal: SpacetimeSignal | null;
}

/**
 * Pasa un partido por jugar al panorama v3.2: probabilidades 1X2, mercados, marcador más
 * probable y proyección (lambdas de Dixon-Coles). Los picks del snapshot se descartan para
 * que el armador elija sobre los mercados v3.2. En NFL el panorama solo trae ganador: se
 * reemplaza ese mercado y el resto (spread, totales) sigue del snapshot.
 * Sin panorama, o con el partido terminado, todo queda igual.
 */
export function applyOutlook(match: MatchAnalysis, signal: SpacetimeSignal | null): OutlookApplied {
  if (match.status === "FT") return { match, signal };
  const o = findOutlook(match);
  if (!o) return { match, signal };

  const isNfl = match.sport === "american-football" || match.league === "nfl";
  if (isNfl) {
    const home = sel(o, "moneyline", "home");
    const away = sel(o, "moneyline", "away");
    if (!home || !away) return { match, signal };
    const total = home.p + away.p;
    const pHome = home.p / total;
    const pAway = away.p / total;
    const marketGroups = (match.marketGroups ?? []).map((g) =>
      g.rows.some((r) => r.market === "h2h")
        ? {
            ...g,
            rows: g.rows.map((r) =>
              r.market !== "h2h"
                ? r
                : r.selection === "home"
                  ? { ...r, p: pHome, fairOdds: 1 / pHome }
                  : r.selection === "away"
                    ? { ...r, p: pAway, fairOdds: 1 / pAway }
                    : r,
            ),
          }
        : g,
    );
    return {
      match: {
        ...match,
        x12: [round4(pHome), 0, round4(pAway)],
        marketGroups,
        confidence: outlookConfidence(o, match, Math.max(pHome, pAway)),
        outcomes: match.outcomes.map((oc) =>
          oc.key === "home" ? { ...oc, probability: pHome } : oc.key === "away" ? { ...oc, probability: pAway } : oc,
        ),
      },
      signal: signal
        ? { ...signal, probs: { home: pHome, draw: 0, away: pAway }, market: null, value: [] }
        : null,
    };
  }

  const home = sel(o, "1x2", "home");
  const draw = sel(o, "1x2", "draw");
  const away = sel(o, "1x2", "away");
  if (!home || !draw || !away) return { match, signal };

  const dc = o.dixonColesParams;
  const projection = dc
    ? { home: dc.lamHome, away: dc.lamAway, total: dc.lamHome + dc.lamAway, margin: dc.lamHome - dc.lamAway }
    : match.projection;
  const top = o.topScorelines[0];
  const probs = { home: home.p, draw: draw.p, away: away.p };
  const outcomeP: Record<string, number> = probs;

  return {
    match: {
      ...match,
      x12: [round4(home.p), round4(draw.p), round4(away.p)],
      marketGroups: footballGroups(o, match),
      mostLikelyScore: top ? { home: top.homeGoals, away: top.awayGoals, p: top.p } : match.mostLikelyScore,
      projection,
      picks: [],
      confidence: outlookConfidence(o, match, Math.max(home.p, draw.p, away.p)),
      outcomes: match.outcomes.map((oc) =>
        outcomeP[oc.key] !== undefined
          ? {
              ...oc,
              probability: outcomeP[oc.key]!,
              fairOdds: fairOddsOf(outcomeP[oc.key]!),
            }
          : oc,
      ),
    },
    signal: signal
      ? {
          ...signal,
          outlookDriven: true,
          probs,
          // v3.2: sin cuotas de fuentes no autorizadas ni evaluación de valor sobre ellas.
          market: null,
          value: [],
          expectedTotal: projection?.total ?? signal.expectedTotal,
          expectedMargin: projection ? projection.home - projection.away : signal.expectedMargin,
        }
      : null,
  };
}
