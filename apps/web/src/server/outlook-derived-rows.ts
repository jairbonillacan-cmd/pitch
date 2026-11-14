import type { MatchOutlook } from "@pitchlab/spacetime";
import {
  deriveFootballExtraMarkets,
  deriveNflExtraMarkets,
} from "@pitchlab/spacetime";
import type {
  MarketCardCategory,
  MatchOutlookSummary,
  PlatformMarketRow,
} from "@pitchlab/ui";

interface GameProjectionLike {
  readonly home?: number;
  readonly away?: number;
  readonly total?: number;
}

interface TeamNamesWithProjection {
  readonly home: { readonly name: string };
  readonly away: { readonly name: string };
  readonly projection?: GameProjectionLike | null;
}

function formatSignedLine(line: number): string {
  return line > 0 ? `+${line}` : `${line}`;
}

/**
 * Clasifica una fila publicada del panorama v3.2 en las categorías visuales de «Mercados».
 */
export function classifyPublishedMarketKey(
  marketKey: string,
  line: number | null,
): { readonly cardCategory: MarketCardCategory; readonly cardTitle: string } {
  if (marketKey === "1x2") {
    return { cardCategory: "resultado", cardTitle: "Resultado 1X2" };
  }
  if (marketKey === "moneyline") {
    return { cardCategory: "resultado", cardTitle: "Ganador" };
  }
  if (marketKey === "double_chance") {
    return { cardCategory: "resultado", cardTitle: "Doble oportunidad" };
  }
  if (marketKey === "dnb") {
    return { cardCategory: "resultado", cardTitle: "Empate no acción" };
  }
  if (marketKey === "btts") {
    return { cardCategory: "goles", cardTitle: "Ambos anotan" };
  }
  if (
    marketKey === "totals_1_5" ||
    marketKey === "totals_2_5" ||
    marketKey === "totals_3_5"
  ) {
    return {
      cardCategory: "goles",
      cardTitle: line != null ? `Total de goles (${line})` : "Total de goles",
    };
  }
  if (marketKey === "totals") {
    return {
      cardCategory: "goles",
      cardTitle: line != null ? `Total de puntos (${line})` : "Total de puntos",
    };
  }
  if (marketKey === "spread") {
    return {
      cardCategory: "handicap",
      cardTitle:
        line != null ? `Hándicap (${formatSignedLine(line)})` : "Hándicap",
    };
  }
  return {
    cardCategory: "handicap",
    cardTitle:
      line != null
        ? `Hándicap asiático (${formatSignedLine(line)})`
        : "Hándicap asiático",
  };
}

/**
 * Marca las filas ya publicadas por v3.2 con su categoría visual y cuál es la más probable.
 */
export function annotatePublishedRows(
  marketKey: string,
  line: number | null,
  mostLikelySelection: string,
  rows: readonly PlatformMarketRow[],
): PlatformMarketRow[] {
  const { cardCategory, cardTitle } = classifyPublishedMarketKey(marketKey, line);
  return rows.map((row) => ({
    ...row,
    isDerived: false,
    cardCategory,
    cardTitle,
    isMostLikely: row.selection === mostLikelySelection,
  }));
}

function makeDerivedRow(input: {
  readonly group: string;
  readonly market: string;
  readonly selection: string;
  readonly label: string;
  readonly p: number;
  readonly fairDecimal: number;
  readonly fairAmerican: number;
  readonly cardCategory: MarketCardCategory;
  readonly cardTitle: string;
  readonly isMostLikely: boolean;
}): PlatformMarketRow {
  return {
    group: input.group,
    market: input.market,
    selection: input.selection,
    label: input.label,
    p: input.p,
    fairDecimal: input.fairDecimal,
    fairAmerican: input.fairAmerican,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: true,
    cardCategory: input.cardCategory,
    cardTitle: input.cardTitle,
    isMostLikely: input.isMostLikely,
  };
}

/**
 * Construye los mercados derivados adicionales (fútbol y NFL) desde el `MatchOutlook` v3.2.
 * Mantiene lenguaje simple en español de México y evita cualquier jerga interna del modelo.
 */
export function buildDerivedOutlookExtras(
  outlook: MatchOutlook,
  game: TeamNamesWithProjection,
): {
  readonly rows: PlatformMarketRow[];
  readonly scorelines: MatchOutlookSummary["scorelines"];
} {
  const homeName = game.home.name;
  const awayName = game.away.name;

  if (outlook.sport === "football" && outlook.dixonColesParams) {
    const dc = outlook.dixonColesParams;
    const derived = deriveFootballExtraMarkets({
      homeTeam: homeName,
      awayTeam: awayName,
      lamHome: dc.lamHome,
      lamAway: dc.lamAway,
      rho: dc.rho,
      maxGoals: dc.maxGoals,
    });

    const rows: PlatformMarketRow[] = [];

    for (const line of derived.homeTeamGoals) {
      const cardTitle = `Goles ${homeName} (${line.line})`;
      const group = `Goles · ${homeName}`;
      rows.push(
        makeDerivedRow({
          group,
          market: "team_goals_home",
          selection: `home_over_${line.line}`,
          label: `${homeName} · Más de ${line.line} goles`,
          p: line.pOver,
          fairDecimal: line.fairOver.decimal,
          fairAmerican: line.fairOver.american,
          cardCategory: "goles",
          cardTitle,
          isMostLikely: line.mostLikely === "over",
        }),
        makeDerivedRow({
          group,
          market: "team_goals_home",
          selection: `home_under_${line.line}`,
          label: `${homeName} · Menos de ${line.line} goles`,
          p: line.pUnder,
          fairDecimal: line.fairUnder.decimal,
          fairAmerican: line.fairUnder.american,
          cardCategory: "goles",
          cardTitle,
          isMostLikely: line.mostLikely === "under",
        }),
      );
    }

    for (const line of derived.awayTeamGoals) {
      const cardTitle = `Goles ${awayName} (${line.line})`;
      const group = `Goles · ${awayName}`;
      rows.push(
        makeDerivedRow({
          group,
          market: "team_goals_away",
          selection: `away_over_${line.line}`,
          label: `${awayName} · Más de ${line.line} goles`,
          p: line.pOver,
          fairDecimal: line.fairOver.decimal,
          fairAmerican: line.fairOver.american,
          cardCategory: "goles",
          cardTitle,
          isMostLikely: line.mostLikely === "over",
        }),
        makeDerivedRow({
          group,
          market: "team_goals_away",
          selection: `away_under_${line.line}`,
          label: `${awayName} · Menos de ${line.line} goles`,
          p: line.pUnder,
          fairDecimal: line.fairUnder.decimal,
          fairAmerican: line.fairUnder.american,
          cardCategory: "goles",
          cardTitle,
          isMostLikely: line.mostLikely === "under",
        }),
      );
    }

    rows.push(
      makeDerivedRow({
        group: "1er tiempo · Resultado",
        market: "ht_1x2",
        selection: "ht_home",
        label: `1T · Gana ${homeName}`,
        p: derived.firstHalf1X2.pHome,
        fairDecimal: derived.firstHalf1X2.fairHome.decimal,
        fairAmerican: derived.firstHalf1X2.fairHome.american,
        cardCategory: "primer_tiempo",
        cardTitle: "1er tiempo · Resultado 1X2",
        isMostLikely: derived.firstHalf1X2.mostLikely === "home",
      }),
      makeDerivedRow({
        group: "1er tiempo · Resultado",
        market: "ht_1x2",
        selection: "ht_draw",
        label: "1T · Empate",
        p: derived.firstHalf1X2.pDraw,
        fairDecimal: derived.firstHalf1X2.fairDraw.decimal,
        fairAmerican: derived.firstHalf1X2.fairDraw.american,
        cardCategory: "primer_tiempo",
        cardTitle: "1er tiempo · Resultado 1X2",
        isMostLikely: derived.firstHalf1X2.mostLikely === "draw",
      }),
      makeDerivedRow({
        group: "1er tiempo · Resultado",
        market: "ht_1x2",
        selection: "ht_away",
        label: `1T · Gana ${awayName}`,
        p: derived.firstHalf1X2.pAway,
        fairDecimal: derived.firstHalf1X2.fairAway.decimal,
        fairAmerican: derived.firstHalf1X2.fairAway.american,
        cardCategory: "primer_tiempo",
        cardTitle: "1er tiempo · Resultado 1X2",
        isMostLikely: derived.firstHalf1X2.mostLikely === "away",
      }),
    );

    for (const line of derived.firstHalfTotals) {
      const cardTitle = `1er tiempo · Total (${line.line})`;
      rows.push(
        makeDerivedRow({
          group: "1er tiempo · Goles",
          market: "ht_totals",
          selection: `ht_over_${line.line}`,
          label: `1T · Más de ${line.line} goles`,
          p: line.pOver,
          fairDecimal: line.fairOver.decimal,
          fairAmerican: line.fairOver.american,
          cardCategory: "primer_tiempo",
          cardTitle,
          isMostLikely: line.mostLikely === "over",
        }),
        makeDerivedRow({
          group: "1er tiempo · Goles",
          market: "ht_totals",
          selection: `ht_under_${line.line}`,
          label: `1T · Menos de ${line.line} goles`,
          p: line.pUnder,
          fairDecimal: line.fairUnder.decimal,
          fairAmerican: line.fairUnder.american,
          cardCategory: "primer_tiempo",
          cardTitle,
          isMostLikely: line.mostLikely === "under",
        }),
      );
    }

    for (const score of derived.topScorelines) {
      rows.push(
        makeDerivedRow({
          group: "Marcador exacto",
          market: "correct_score",
          selection: score.score,
          label: `Marcador ${score.score}`,
          p: score.p,
          fairDecimal: score.fairOdds.decimal,
          fairAmerican: score.fairOdds.american,
          cardCategory: "marcador",
          cardTitle: "Marcador exacto · Top 6",
          isMostLikely: score.isMostLikely,
        }),
      );
    }

    return {
      rows,
      scorelines: derived.topScorelines.map((s) => ({
        home: s.homeGoals,
        away: s.awayGoals,
        p: s.p,
        fairDecimal: s.fairOdds.decimal,
      })),
    };
  }

  if (outlook.sport === "nfl") {
    const moneyline = outlook.marketsByKey.moneyline;
    const pHome = moneyline?.selections.find((s) => s.selection === "home")?.p;
    if (typeof pHome !== "number" || !Number.isFinite(pHome)) {
      return { rows: [], scorelines: [] };
    }
    const derived = deriveNflExtraMarkets({
      homeTeam: homeName,
      awayTeam: awayName,
      pHome,
      expectedTotal:
        typeof game.projection?.total === "number" && game.projection.total > 0
          ? game.projection.total
          : null,
    });

    const rows: PlatformMarketRow[] = [];
    if (!outlook.marketsByKey.spread) {
      for (const sp of derived.spreads) {
        const awayLine = -sp.homeLine;
        const cardTitle = `Hándicap (${formatSignedLine(sp.homeLine)})`;
        rows.push(
          makeDerivedRow({
            group: "Hándicap",
            market: "spread",
            selection: `home_${formatSignedLine(sp.homeLine)}`,
            label: `${homeName} (${formatSignedLine(sp.homeLine)})`,
            p: sp.pHome,
            fairDecimal: sp.fairHome.decimal,
            fairAmerican: sp.fairHome.american,
            cardCategory: "handicap",
            cardTitle,
            isMostLikely: sp.mostLikely === "home",
          }),
          makeDerivedRow({
            group: "Hándicap",
            market: "spread",
            selection: `away_${formatSignedLine(awayLine)}`,
            label: `${awayName} (${formatSignedLine(awayLine)})`,
            p: sp.pAway,
            fairDecimal: sp.fairAway.decimal,
            fairAmerican: sp.fairAway.american,
            cardCategory: "handicap",
            cardTitle,
            isMostLikely: sp.mostLikely === "away",
          }),
        );
      }
    }

    if (!outlook.marketsByKey.totals) {
      for (const tot of derived.totals) {
        const cardTitle = `Total de puntos (${tot.line})`;
        rows.push(
          makeDerivedRow({
            group: "Total de puntos",
            market: "totals",
            selection: `over_${tot.line}`,
            label: `Más de ${tot.line} pts`,
            p: tot.pOver,
            fairDecimal: tot.fairOver.decimal,
            fairAmerican: tot.fairOver.american,
            cardCategory: "goles",
            cardTitle,
            isMostLikely: tot.mostLikely === "over",
          }),
          makeDerivedRow({
            group: "Total de puntos",
            market: "totals",
            selection: `under_${tot.line}`,
            label: `Menos de ${tot.line} pts`,
            p: tot.pUnder,
            fairDecimal: tot.fairUnder.decimal,
            fairAmerican: tot.fairUnder.american,
            cardCategory: "goles",
            cardTitle,
            isMostLikely: tot.mostLikely === "under",
          }),
        );
      }
    }

    return { rows, scorelines: [] };
  }

  return {
    rows: [],
    scorelines: outlook.topScorelines.slice(0, 6).map((s) => ({
      home: s.homeGoals,
      away: s.awayGoals,
      p: s.p,
      fairDecimal: s.fairOdds.decimal,
    })),
  };
}
