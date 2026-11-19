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

function buildFootballDerivedRows(params: {
  readonly homeName: string;
  readonly awayName: string;
  readonly lamHome: number;
  readonly lamAway: number;
  readonly rho?: number;
  readonly maxGoals?: number;
  readonly includeScorelines?: boolean;
}): {
  readonly rows: PlatformMarketRow[];
  readonly scorelines: MatchOutlookSummary["scorelines"];
} {
  const { homeName, awayName, includeScorelines = true } = params;
  const derived = deriveFootballExtraMarkets({
    homeTeam: homeName,
    awayTeam: awayName,
    lamHome: params.lamHome,
    lamAway: params.lamAway,
    ...(params.rho !== undefined ? { rho: params.rho } : {}),
    ...(params.maxGoals !== undefined ? { maxGoals: params.maxGoals } : {}),
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

  if (includeScorelines) {
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

/**
 * Deriva mercados adicionales de fútbol desde la proyección del snapshot cuando no existe entrada
 * en `live_matchday_v3_snapshot` (por ejemplo competencias de selecciones internacionales).
 */
export function buildDerivedFootballFallbackRows(
  game: TeamNamesWithProjection,
  includeScorelines = false,
): PlatformMarketRow[] {
  const lamHome = game.projection?.home;
  const lamAway = game.projection?.away;
  if (
    typeof lamHome !== "number" ||
    typeof lamAway !== "number" ||
    !Number.isFinite(lamHome) ||
    !Number.isFinite(lamAway) ||
    lamHome <= 0 ||
    lamAway <= 0
  ) {
    return [];
  }
  return buildFootballDerivedRows({
    homeName: game.home.name,
    awayName: game.away.name,
    lamHome,
    lamAway,
    includeScorelines,
  }).rows;
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
    return buildFootballDerivedRows({
      homeName,
      awayName,
      lamHome: dc.lamHome,
      lamAway: dc.lamAway,
      rho: dc.rho,
      maxGoals: dc.maxGoals,
      includeScorelines: true,
    });
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

function erfApprox(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t) *
      Math.exp(-ax * ax);
  return sign * y;
}

function normalCdf(z: number): number {
  return 0.5 * (1 + erfApprox(z / Math.SQRT2));
}

function clampProb(p: number): number {
  return Math.max(0.02, Math.min(0.98, Math.round(p * 10_000) / 10_000));
}

function fairFromProb(p: number): { decimal: number; american: number } {
  const dec = Math.round((1 / p) * 100) / 100;
  const american = p >= 0.5 ? Math.round((-p / (1 - p)) * 100) : Math.round(((1 - p) / p) * 100);
  return { decimal: Math.max(1.01, dec), american };
}

function roundToHalf(n: number): number {
  return Math.round(n - 0.5) + 0.5;
}

/**
 * Paridad de mercados derivados para deportes de EE. UU. (NBA, NHL y MLB) a partir de las
 * proyecciones calibradas del snapshot (`projection.home`, `projection.away`, `projection.total`).
 * Todas las filas se marcan `isDerived: true` («Derivado del motor») con etiqueta honesta.
 */
export function buildDerivedUsSportRows(
  game: TeamNamesWithProjection & {
    readonly sport: string;
    readonly existingMarkets?: readonly Pick<PlatformMarketRow, "market" | "selection">[];
  },
): PlatformMarketRow[] {
  const homeMean = game.projection?.home;
  const awayMean = game.projection?.away;
  if (
    typeof homeMean !== "number" ||
    typeof awayMean !== "number" ||
    !(homeMean > 0) ||
    !(awayMean > 0)
  ) {
    return [];
  }

  const totalMean =
    typeof game.projection?.total === "number" && game.projection.total > 0
      ? game.projection.total
      : homeMean + awayMean;
  const marginMean = homeMean - awayMean;
  const existingKeys = new Set(
    (game.existingMarkets ?? []).map((r) => `${r.market}|${r.selection}`),
  );
  const rows: PlatformMarketRow[] = [];

  const pushPair = (input: {
    group: string;
    market: string;
    cardCategory: MarketCardCategory;
    cardTitle: string;
    aSel: string;
    aLabel: string;
    bSel: string;
    bLabel: string;
    pA: number;
  }) => {
    if (
      existingKeys.has(`${input.market}|${input.aSel}`) ||
      existingKeys.has(`${input.market}|${input.bSel}`)
    ) {
      return;
    }
    const pA = clampProb(input.pA);
    const pB = clampProb(1 - pA);
    const fairA = fairFromProb(pA);
    const fairB = fairFromProb(pB);
    rows.push(
      makeDerivedRow({
        group: input.group,
        market: input.market,
        selection: input.aSel,
        label: input.aLabel,
        p: pA,
        fairDecimal: fairA.decimal,
        fairAmerican: fairA.american,
        cardCategory: input.cardCategory,
        cardTitle: input.cardTitle,
        isMostLikely: pA >= pB,
      }),
      makeDerivedRow({
        group: input.group,
        market: input.market,
        selection: input.bSel,
        label: input.bLabel,
        p: pB,
        fairDecimal: fairB.decimal,
        fairAmerican: fairB.american,
        cardCategory: input.cardCategory,
        cardTitle: input.cardTitle,
        isMostLikely: pB > pA,
      }),
    );
  };

  const homeName = game.home.name;
  const awayName = game.away.name;

  if (game.sport === "basketball") {
    const sigmaMargin = 12.2;
    const sigmaTotal = 17.5;
    const sigmaTeam = 11.4;
    const centerSpread = roundToHalf(-marginMean);
    const spreadLines = Array.from(new Set([centerSpread - 3, centerSpread, centerSpread + 3]));
    for (const homeLine of spreadLines) {
      const pHomeCover = 1 - normalCdf((-homeLine - marginMean) / sigmaMargin);
      const awayLine = -homeLine;
      pushPair({
        group: "Hándicap alternativo",
        market: "spread",
        cardCategory: "handicap",
        cardTitle: `Hándicap (${formatSignedLine(homeLine)})`,
        aSel: `home_${formatSignedLine(homeLine)}`,
        aLabel: `${homeName} (${formatSignedLine(homeLine)})`,
        bSel: `away_${formatSignedLine(awayLine)}`,
        bLabel: `${awayName} (${formatSignedLine(awayLine)})`,
        pA: pHomeCover,
      });
    }
    const centerTot = roundToHalf(totalMean);
    for (const totLine of [centerTot - 5, centerTot, centerTot + 5]) {
      if (totLine < 160) continue;
      const pOver = 1 - normalCdf((totLine - totalMean) / sigmaTotal);
      pushPair({
        group: "Totales alternativos",
        market: "totals",
        cardCategory: "goles",
        cardTitle: `Total de puntos (${totLine})`,
        aSel: `over_${totLine}`,
        aLabel: `Más de ${totLine} pts`,
        bSel: `under_${totLine}`,
        bLabel: `Menos de ${totLine} pts`,
        pA: pOver,
      });
    }
    const homeLine = roundToHalf(homeMean);
    const awayLine = roundToHalf(awayMean);
    pushPair({
      group: `Puntos · ${homeName}`,
      market: "team_totals_home",
      cardCategory: "goles",
      cardTitle: `Puntos ${homeName} (${homeLine})`,
      aSel: `home_over_${homeLine}`,
      aLabel: `${homeName} · Más de ${homeLine} pts`,
      bSel: `home_under_${homeLine}`,
      bLabel: `${homeName} · Menos de ${homeLine} pts`,
      pA: 1 - normalCdf((homeLine - homeMean) / sigmaTeam),
    });
    pushPair({
      group: `Puntos · ${awayName}`,
      market: "team_totals_away",
      cardCategory: "goles",
      cardTitle: `Puntos ${awayName} (${awayLine})`,
      aSel: `away_over_${awayLine}`,
      aLabel: `${awayName} · Más de ${awayLine} pts`,
      bSel: `away_under_${awayLine}`,
      bLabel: `${awayName} · Menos de ${awayLine} pts`,
      pA: 1 - normalCdf((awayLine - awayMean) / sigmaTeam),
    });
    const firstHalfTot = roundToHalf(totalMean * 0.495);
    pushPair({
      group: "1.ª mitad · Total",
      market: "first_half_totals",
      cardCategory: "primer_tiempo",
      cardTitle: `1.ª mitad (${firstHalfTot} pts)`,
      aSel: `1h_over_${firstHalfTot}`,
      aLabel: `1.ª mitad · Más de ${firstHalfTot} pts`,
      bSel: `1h_under_${firstHalfTot}`,
      bLabel: `1.ª mitad · Menos de ${firstHalfTot} pts`,
      pA: 1 - normalCdf((firstHalfTot - totalMean * 0.495) / (sigmaTotal * 0.72)),
    });
    return rows;
  }

  if (game.sport === "ice-hockey") {
    const sigmaMargin = 2.15;
    const sigmaTotal = 2.25;
    const sigmaTeam = 1.6;
    const favIsHome = marginMean >= 0;
    const puckHomeLine = favIsHome ? -1.5 : 1.5;
    const puckAwayLine = -puckHomeLine;
    pushPair({
      group: "Puck line",
      market: "spread",
      cardCategory: "handicap",
      cardTitle: `Puck line (${formatSignedLine(puckHomeLine)})`,
      aSel: `home_${formatSignedLine(puckHomeLine)}`,
      aLabel: `${homeName} (${formatSignedLine(puckHomeLine)})`,
      bSel: `away_${formatSignedLine(puckAwayLine)}`,
      bLabel: `${awayName} (${formatSignedLine(puckAwayLine)})`,
      pA: 1 - normalCdf((-puckHomeLine - marginMean) / sigmaMargin),
    });
    for (const totLine of [5.5, 6.5]) {
      pushPair({
        group: "Total de goles",
        market: "totals",
        cardCategory: "goles",
        cardTitle: `Total de goles (${totLine})`,
        aSel: `over_${totLine}`,
        aLabel: `Más de ${totLine} goles`,
        bSel: `under_${totLine}`,
        bLabel: `Menos de ${totLine} goles`,
        pA: 1 - normalCdf((totLine - totalMean) / sigmaTotal),
      });
    }
    for (const side of [
      { key: "home", name: homeName, mean: homeMean },
      { key: "away", name: awayName, mean: awayMean },
    ] as const) {
      const tLine = side.mean >= 3.2 ? 3.5 : 2.5;
      pushPair({
        group: `Goles · ${side.name}`,
        market: `team_totals_${side.key}`,
        cardCategory: "goles",
        cardTitle: `Goles ${side.name} (${tLine})`,
        aSel: `${side.key}_over_${tLine}`,
        aLabel: `${side.name} · Más de ${tLine} goles`,
        bSel: `${side.key}_under_${tLine}`,
        bLabel: `${side.name} · Menos de ${tLine} goles`,
        pA: 1 - normalCdf((tLine - side.mean) / sigmaTeam),
      });
    }
    pushPair({
      group: "1er periodo · Goles",
      market: "first_period_totals",
      cardCategory: "primer_tiempo",
      cardTitle: "1er periodo (1.5 goles)",
      aSel: "1p_over_1.5",
      aLabel: "1er periodo · Más de 1.5 goles",
      bSel: "1p_under_1.5",
      bLabel: "1er periodo · Menos de 1.5 goles",
      pA: 1 - normalCdf((1.5 - totalMean * 0.31) / 1.25),
    });
    return rows;
  }

  if (game.sport === "baseball") {
    const sigmaMargin = 3.6;
    const sigmaTotal = 4.1;
    const sigmaTeam = 2.75;
    const runHomeLine = marginMean >= 0 ? -1.5 : 1.5;
    const runAwayLine = -runHomeLine;
    pushPair({
      group: "Run line",
      market: "spread",
      cardCategory: "handicap",
      cardTitle: `Run line (${formatSignedLine(runHomeLine)})`,
      aSel: `home_${formatSignedLine(runHomeLine)}`,
      aLabel: `${homeName} (${formatSignedLine(runHomeLine)})`,
      bSel: `away_${formatSignedLine(runAwayLine)}`,
      bLabel: `${awayName} (${formatSignedLine(runAwayLine)})`,
      pA: 1 - normalCdf((-runHomeLine - marginMean) / sigmaMargin),
    });
    const centerRuns = roundToHalf(totalMean);
    const runLines = Array.from(new Set([centerRuns - 1, centerRuns, centerRuns + 1])).filter(
      (l) => l >= 5.5 && l <= 13.5,
    );
    for (const totLine of runLines) {
      pushPair({
        group: "Total de carreras",
        market: "totals",
        cardCategory: "goles",
        cardTitle: `Total de carreras (${totLine})`,
        aSel: `over_${totLine}`,
        aLabel: `Más de ${totLine} carreras`,
        bSel: `under_${totLine}`,
        bLabel: `Menos de ${totLine} carreras`,
        pA: 1 - normalCdf((totLine - totalMean) / sigmaTotal),
      });
    }
    for (const side of [
      { key: "home", name: homeName, mean: homeMean },
      { key: "away", name: awayName, mean: awayMean },
    ] as const) {
      const tLine = roundToHalf(side.mean);
      pushPair({
        group: `Carreras · ${side.name}`,
        market: `team_totals_${side.key}`,
        cardCategory: "goles",
        cardTitle: `Carreras ${side.name} (${tLine})`,
        aSel: `${side.key}_over_${tLine}`,
        aLabel: `${side.name} · Más de ${tLine} carreras`,
        bSel: `${side.key}_under_${tLine}`,
        bLabel: `${side.name} · Menos de ${tLine} carreras`,
        pA: 1 - normalCdf((tLine - side.mean) / sigmaTeam),
      });
    }
    const f5Mean = totalMean * 0.56;
    const f5Line = roundToHalf(f5Mean);
    pushPair({
      group: "Primeras 5 entradas (F5)",
      market: "f5_totals",
      cardCategory: "primer_tiempo",
      cardTitle: `F5 · Total de carreras (${f5Line})`,
      aSel: `f5_over_${f5Line}`,
      aLabel: `F5 · Más de ${f5Line} carreras`,
      bSel: `f5_under_${f5Line}`,
      bLabel: `F5 · Menos de ${f5Line} carreras`,
      pA: 1 - normalCdf((f5Line - f5Mean) / (sigmaTotal * 0.74)),
    });
    pushPair({
      group: "Primeras 5 entradas (F5)",
      market: "f5_moneyline",
      cardCategory: "primer_tiempo",
      cardTitle: "F5 · Ganador (5 entradas)",
      aSel: "f5_home",
      aLabel: `F5 · ${homeName}`,
      bSel: "f5_away",
      bLabel: `F5 · ${awayName}`,
      pA: 1 - normalCdf((-marginMean * 0.56) / (sigmaMargin * 0.74)),
    });
    return rows;
  }

  return rows;
}
