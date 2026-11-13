import {
  asMarketKey,
  selectionHolds,
  type AnalysisMarketRow,
  type LeagueId,
  type MatchAnalysis,
  type StandingRow,
} from "@pitchlab/contracts";
import { decimalToAmericanInt } from "./access-guard";
import type {
  EngineKey,
  LineupAbsenceItem,
  MatchPick,
  PickConflictGroup,
  PlatformDataset,
  PlatformGame,
  PlatformLeagueSummary,
  PlatformMarketRow,
  PlayerPropItem,
  PreGameIntel,
  SpacetimeSignal,
} from "./types";
import { buildGoalModel, buildPointsModel, derivedMarketProbability } from "./spacetime-markets";

export interface RawLeagueInput {
  league: LeagueId;
  leagueLabel: string;
  sport: "football" | "american-football";
  season: string;
  roundLabel: string;
  generatedAt: string;
  games: MatchAnalysis[];
  standings?: StandingRow[];
  /** Señales de Spacetime v3.0 por id de partido (calculadas en servidor). */
  spacetime?: Readonly<Record<string, SpacetimeSignal>>;
}

/** Momio decimal justo; sin recortar la probabilidad (una cota mínima evita dividir entre 0). */
function fairOddsOf(p: number): number {
  return 1 / Math.max(p, 0.001);
}

function classifyConflictGroup(
  market: string,
  selection: string,
  label: string,
): PickConflictGroup {
  const m = market.toLowerCase();
  const s = selection.toLowerCase();
  const l = label.toLowerCase();

  if (m.includes("btts") || l.includes("ambos anotan")) {
    if (s.includes("no") || l.includes("no")) return "btts_no";
    return "btts_yes";
  }
  if (
    m.includes("total") ||
    m.includes("ou") ||
    l.includes("más de") ||
    l.includes("menos de") ||
    l.includes("over") ||
    l.includes("under")
  ) {
    if (s.includes("under") || l.includes("menos de")) return "under_total";
    return "over_total";
  }
  if (s === "draw" || l === "empate") {
    return "draw_side";
  }
  if (s.includes("home") || s === "1x" || s === "1") {
    return "home_side";
  }
  if (s.includes("away") || s === "x2" || s === "2") {
    return "away_side";
  }
  return "independent";
}

function gradePick(
  market: string,
  selection: string,
  line: number | undefined,
  conflictGroup: PickConflictGroup,
  score: { home: number; away: number } | undefined,
): "hit" | "miss" | null {
  if (!score) return null;
  try {
    const holds = selectionHolds(
      {
        market: asMarketKey(market),
        selection,
        line,
      },
      score.home,
      score.away,
    );
    if (holds !== null) {
      return holds ? "hit" : "miss";
    }
  } catch (err) {
    void err;
  }

  const total = score.home + score.away;
  if (conflictGroup === "home_side") {
    if (selection === "1x" || selection === "home_or_draw") {
      return score.home >= score.away ? "hit" : "miss";
    }
    return score.home > score.away ? "hit" : "miss";
  }
  if (conflictGroup === "away_side") {
    if (selection === "x2" || selection === "away_or_draw") {
      return score.away >= score.home ? "hit" : "miss";
    }
    return score.away > score.home ? "hit" : "miss";
  }
  if (conflictGroup === "draw_side") {
    return score.home === score.away ? "hit" : "miss";
  }
  if (conflictGroup === "over_total") {
    const threshold = line ?? 2.5;
    return total > threshold ? "hit" : "miss";
  }
  if (conflictGroup === "under_total") {
    const threshold = line ?? 2.5;
    return total < threshold ? "hit" : "miss";
  }
  if (conflictGroup === "btts_yes") {
    return score.home > 0 && score.away > 0 ? "hit" : "miss";
  }
  if (conflictGroup === "btts_no") {
    return score.home === 0 || score.away === 0 ? "hit" : "miss";
  }
  return score.home >= score.away ? "hit" : "miss";
}

function flattenMarketRows(
  match: MatchAnalysis,
): Array<{ group: string; row: AnalysisMarketRow }> {
  const out: Array<{ group: string; row: AnalysisMarketRow }> = [];
  for (const grp of match.marketGroups ?? []) {
    for (const row of grp.rows) {
      out.push({ group: grp.group, row });
    }
  }
  return out;
}

type Side = "home" | "draw" | "away";

const ENGINE_NAMES = {
  tachyon: "PitchLab Tachyon v3.0",
  minkowski: "PitchLab Minkowski v3.0",
  singularity: "PitchLab Singularity v3.0",
  geodesic: "PitchLab Geodesic v2.0",
} as const;

/** Lado 1X2 / moneyline de una fila de mercado; `null` si no es mercado de ganador. */
function moneylineSide(market: string, selection: string): Side | null {
  const m = market.toLowerCase();
  if (m !== "h2h" && m !== "1x2" && m !== "moneyline" && m !== "ml") return null;
  const s = selection.toLowerCase();
  if (s === "home" || s === "1") return "home";
  if (s === "draw" || s === "x") return "draw";
  if (s === "away" || s === "2") return "away";
  return null;
}

/** Momio real de casa para un lado; `null` si no hay mercado verificado. */
function realOdds(signal: SpacetimeSignal | null, side: Side | null): number | null {
  if (!signal?.market || !side) return null;
  const odds = signal.market.odds[side];
  return typeof odds === "number" && odds > 1 ? Math.round(odds * 100) / 100 : null;
}

function edgeAgainst(p: number, decimal: number | null): number | null {
  if (decimal === null) return null;
  return Math.round((p - 1 / decimal) * 1000) / 10;
}


/**
 * Filas de mercado del partido con 1X2 y doble oportunidad alineados a la probabilidad
 * final de Spacetime v3.0 cuando existe. Totales, ambos anotan y marcadores quedan del
 * modelo de goles del snapshot.
 */
function rowsWithSpacetime(
  match: MatchAnalysis,
  signal: SpacetimeSignal | null,
): Array<{ group: string; row: AnalysisMarketRow }> {
  const rows = flattenMarketRows(match);
  // Con panorama v3.2 los mercados ya traen la probabilidad publicada: no se recalculan.
  if (!signal || signal.outlookDriven) return rows;
  const { home, draw, away } = signal.probs;
  const doubleChance: Record<string, number> = { "1x": home + draw, x2: draw + away, "12": home + away };
  const isNfl = match.sport === "american-football" || match.league === "nfl";
  const model =
    signal.expectedTotal !== null && signal.expectedMargin !== null
      ? isNfl
        ? buildPointsModel(signal.expectedTotal, signal.expectedMargin, home)
        : buildGoalModel(signal.expectedTotal, signal.expectedMargin)
      : null;
  return rows.map(({ group, row }) => {
    const side = moneylineSide(row.market, row.selection);
    let p: number | null | undefined;
    if (side) p = signal.probs[side];
    else if (row.market === "double_chance") p = doubleChance[row.selection.toLowerCase()];
    else if (model) p = derivedMarketProbability(model, row.market, row.selection, row.line);
    if (p === undefined || p === null || !Number.isFinite(p)) return { group, row };
    return { group, row: { ...row, p, fairOdds: fairOddsOf(p) } };
  });
}

/** Proyección de marcador: la de Spacetime v3.0 si existe; si no, la del snapshot. */
function projectionFor(
  match: MatchAnalysis,
  signal: SpacetimeSignal | null,
): { home: number; away: number; total: number } | undefined {
  if (signal && signal.expectedTotal !== null && signal.expectedMargin !== null) {
    const home = (signal.expectedTotal + signal.expectedMargin) / 2;
    const away = (signal.expectedTotal - signal.expectedMargin) / 2;
    if (home > 0 && away > 0) return { home, away, total: signal.expectedTotal };
  }
  return match.projection ?? undefined;
}

/** Etiqueta que se entiende sola: «Sí»/«No» de ambos anotan llevan el mercado delante. */
function pickLabelOf(group: string, row: AnalysisMarketRow): string {
  if (row.market === "btts") return `Ambos anotan: ${row.label}`;
  if (row.market === "correct_score") return `Marcador exacto ${row.label}`;
  if (/^(sí|si|no|más|menos)$/i.test(row.label.trim())) return `${group}: ${row.label}`;
  return row.label;
}

function buildFiveMatchPicks(match: MatchAnalysis, signal: SpacetimeSignal | null): MatchPick[] {
  const isNfl = match.sport === "american-football" || match.league === "nfl";
  const allRows = rowsWithSpacetime(match, signal);
  const matchLabel = `${match.home.shortName} vs ${match.away.shortName}`;
  const confScore = match.confidence?.score ?? 60;
  const proj = projectionFor(match, signal);
  const primaryEngine: EngineKey = isNfl ? "minkowski" : "tachyon";
  const primaryEngineName = signal?.sportsEngineName ?? ENGINE_NAMES[primaryEngine];
  const finalEngineName = signal?.engineName ?? primaryEngineName;

  const usedLabels = new Set<string>();
  const pickRows: Array<{
    category: MatchPick["category"];
    categoryLabel: string;
    risk: MatchPick["risk"];
    engineKey: EngineKey;
    engineName: string;
    marketGroup: string;
    row: AnalysisMarketRow;
    rationale: string;
    units: number;
    marketDecimal?: number | null;
  }> = [];

  const take = (
    predicate: (entry: { group: string; row: AnalysisMarketRow }) => boolean,
  ): { group: string; row: AnalysisMarketRow } | undefined => {
    const found = allRows.find((entry) => !usedLabels.has(entry.row.label) && predicate(entry));
    if (found) usedLabels.add(found.row.label);
    return found;
  };
  const fromSnapshotPick = (profile: string) => {
    const snap = match.picks?.find((p) => p.profile === profile);
    if (!snap || usedLabels.has(snap.label)) return undefined;
    return take(({ row }) => row.market === snap.market && row.selection === snap.selection);
  };
  const groupHas = (group: string, ...needles: string[]) =>
    needles.some((n) => group.toLowerCase().includes(n));

  // 1) Pick Principal: la señal estructural más clara entre 54 % y 71 %.
  const main =
    fromSnapshotPick("intermedia") ?? take(({ row }) => row.p >= 0.54 && row.p <= 0.71);
  if (main) {
    pickRows.push({
      category: "principal",
      categoryLabel: "Pick principal",
      risk: "medio",
      engineKey: primaryEngine,
      engineName: finalEngineName,
      marketGroup: main.group,
      row: main.row,
      rationale: proj
        ? `El modelo proyecta ${proj.home.toFixed(isNfl ? 1 : 2)}–${proj.away.toFixed(isNfl ? 1 : 2)} y ${Math.round(main.row.p * 100)} % para esta selección.`
        : `El modelo da ${Math.round(main.row.p * 100)} % a esta selección.`,
      units: 1.5,
    });
  }

  // 2) Escudo Conservador: frecuencia alta (72 %–89 %), base de parlays.
  const shield =
    fromSnapshotPick("conservadora") ?? take(({ row }) => row.p >= 0.72 && row.p <= 0.89);
  if (shield) {
    pickRows.push({
      category: "conservador",
      categoryLabel: "Muy probable",
      risk: "conservador",
      engineKey: isNfl ? "minkowski" : "singularity",
      engineName: finalEngineName,
      marketGroup: shield.group,
      row: shield.row,
      rationale: `La opción más probable: ${Math.round(shield.row.p * 100)} %. Buena base para un parlay.`,
      units: 2.0,
    });
  }

  // 3) Línea de Totales.
  const totals = take(
    ({ group, row }) =>
      (groupHas(group, "total", "goles", "puntos") || row.market.toLowerCase().includes("total")) &&
      row.market !== "team_totals" &&
      row.p >= 0.51 &&
      row.p <= 0.74,
  );
  if (totals) {
    pickRows.push({
      category: "totales",
      categoryLabel: isNfl ? "Puntos totales" : "Goles totales",
      risk: "medio",
      engineKey: primaryEngine,
      engineName: primaryEngineName,
      marketGroup: totals.group,
      row: totals.row,
      rationale: proj
        ? `Total proyectado de ${proj.total.toFixed(isNfl ? 1 : 2)} ${isNfl ? "puntos" : "goles"}.`
        : `Probabilidad calibrada de ${Math.round(totals.row.p * 100)} %.`,
      units: 1.25,
    });
  }

  // 4) Lectura Táctica: ambos anotan, totales por equipo o hándicap.
  const tactical =
    fromSnapshotPick("arriesgada") ??
    take(
      ({ group, row }) =>
        (groupHas(group, "ambos", "equipo", "hándicap", "spread") ||
          row.market === "btts" ||
          row.market === "team_totals") &&
        row.p >= 0.5 &&
        row.p <= 0.73,
    );
  if (tactical) {
    pickRows.push({
      category: "tactico",
      categoryLabel: "Lectura del partido",
      risk: "medio",
      engineKey: primaryEngine,
      engineName: primaryEngineName,
      marketGroup: tactical.group,
      row: tactical.row,
      rationale: `Cómo se espera que se juegue: ${Math.round(tactical.row.p * 100)} % de probabilidad.`,
      units: 1.0,
    });
  }

  // 5) Cuota Alta · Valor: solo si Geodesic v2.0 encuentra valor ejecutable contra un momio real.
  const bestValue = (signal?.value ?? [])
    .filter((v) => v.stake > 0 && !v.vetoed && v.decimalOdds >= 1.9)
    .sort((a, b) => b.ev - a.ev)[0];
  if (bestValue) {
    const valueRow = allRows.find(
      ({ row }) => moneylineSide(row.market, row.selection) === bestValue.side,
    );
    if (valueRow && !usedLabels.has(valueRow.row.label)) {
      usedLabels.add(valueRow.row.label);
      pickRows.push({
        category: "valor",
        categoryLabel: "Valor contra la casa",
        risk: "arriesgado",
        engineKey: "geodesic",
        engineName: ENGINE_NAMES.geodesic,
        marketGroup: valueRow.group,
        row: { ...valueRow.row, p: bestValue.prob, fairOdds: fairOddsOf(bestValue.prob) },
        rationale: `${ENGINE_NAMES.geodesic}: ventaja de ${(bestValue.edge * 100).toFixed(1)} pts contra el momio de ${signal?.market?.bookLabel ?? "la casa"}${bestValue.institutionalConfirmation ? ", confirmada por dinero institucional" : ""}.`,
        units: 0.75,
        marketDecimal: Math.round(bestValue.decimalOdds * 100) / 100,
      });
    }
  }

  return pickRows.map((item, idx) => {
    const { row } = item;
    const p = row.p;
    const fairDecimal = Math.max(1.01, Math.round((row.fairOdds ?? 1 / p) * 100) / 100);
    const marketDecimal =
      item.marketDecimal !== undefined
        ? item.marketDecimal
        : realOdds(signal, moneylineSide(row.market, row.selection));
    const conflictGroup = classifyConflictGroup(row.market, row.selection, row.label);
    const result =
      match.status === "FT"
        ? gradePick(row.market, row.selection, row.line, conflictGroup, match.score)
        : null;

    return {
      id: `${match.id}__p${idx + 1}`,
      gameId: match.id,
      league: match.league,
      leagueLabel: match.leagueLabel,
      matchLabel,
      kickoffLocal: match.kickoffLocal,
      gameStatus: match.status,
      slotIndex: idx + 1,
      category: item.category,
      categoryLabel: item.categoryLabel,
      risk: item.risk,
      engineKey: item.engineKey,
      engineName: item.engineName,
      marketGroup: item.marketGroup,
      selectionKey: row.selection,
      conflictGroup,
      label: pickLabelOf(item.marketGroup, row),
      rationale: item.rationale,
      p,
      fairDecimal,
      fairAmerican: decimalToAmericanInt(fairDecimal),
      marketDecimal,
      marketAmerican: marketDecimal === null ? null : decimalToAmericanInt(marketDecimal),
      edgePts: edgeAgainst(p, marketDecimal),
      confidenceScore: Math.min(96, Math.max(48, Math.round(confScore - idx * 3))),
      suggestedUnits: item.units,
      result,
    };
  });
}

function buildPreGameIntel(match: MatchAnalysis, signal: SpacetimeSignal | null): PreGameIntel {
  const isNfl = match.sport === "american-football" || match.league === "nfl";
  const [ph, pd, pa] = signal
    ? [signal.probs.home, signal.probs.draw, signal.probs.away]
    : (match.x12 ?? [0, 0, 0]);
  const favName = ph >= pa ? match.home.shortName : match.away.shortName;
  const favP = Math.round(Math.max(ph, pa) * 100);
  const proj = projectionFor(match, signal);

  const topDrivers = (signal?.drivers ?? [])
    .filter((d) => Math.abs(d.impactLogit) >= 0.01)
    .sort((a, b) => Math.abs(b.impactLogit) - Math.abs(a.impactLogit))
    .slice(0, 3);

  const synthesisParts = [
    `El modelo da ${favP} % a ${favName}${!isNfl && pd > 0 ? ` y ${Math.round(pd * 100)} % al empate` : ""}.`,
  ];
  if (topDrivers.length > 0) {
    synthesisParts.push(`Factores con más peso: ${topDrivers.map((d) => d.label.toLowerCase()).join(", ")}.`);
  }
  if (signal?.market) {
    const marketFav = signal.market.noVig.home >= signal.market.noVig.away ? "home" : "away";
    const marketP = Math.round(signal.market.noVig[marketFav] * 100);
    synthesisParts.push(
      `El mercado (${signal.market.bookLabel}, sin margen) da ${marketP} % a ${marketFav === "home" ? match.home.shortName : match.away.shortName}.`,
    );
  } else {
    synthesisParts.push("Sin momios verificados para este partido: no se calcula valor.");
  }

  const tacticalKeys: string[] = [];
  if (match.restDays?.home !== undefined && match.restDays?.away !== undefined) {
    tacticalKeys.push(
      `Descanso: ${match.home.shortName} ${match.restDays.home}d vs ${match.away.shortName} ${match.restDays.away}d`,
    );
  }
  if (proj) {
    const digits = isNfl ? 1 : 2;
    tacticalKeys.push(
      `Proyección: ${proj.home.toFixed(digits)} – ${proj.away.toFixed(digits)} (total ${proj.total.toFixed(digits)})`,
    );
  }
  if (signal?.stadium.name && signal.stadium.elevationM !== null && signal.stadium.elevationM >= 1000) {
    tacticalKeys.push(`${signal.stadium.name} a ${Math.round(signal.stadium.elevationM)} m de altura`);
  }

  const absences: LineupAbsenceItem[] = [];
  const avail = signal?.availability;
  const pushAbsence = (side: "home" | "away", injured: number | null, missingPct: number | null) => {
    if (injured === null || injured <= 0) return;
    const team = side === "home" ? match.home.shortName : match.away.shortName;
    absences.push({
      teamSide: side,
      player: `${injured} ${injured === 1 ? "lesionado" : "lesionados"} · ${team}`,
      role: "Reporte de disponibilidad",
      status: "Baja",
      impactNote:
        missingPct !== null && missingPct > 0
          ? `Ausencias equivalentes al ${missingPct.toFixed(1)} % del valor de la plantilla.`
          : "Impacto incluido en la probabilidad del motor.",
    });
  };
  if (avail) {
    pushAbsence("home", avail.homeInjured, avail.homeMissingValuePct);
    pushAbsence("away", avail.awayInjured, avail.awayMissingValuePct);
  }

  let moneyFlow: PreGameIntel["moneyFlow"] = null;
  if (match.marketPulse && match.marketPulse.sides.length >= 2) {
    const share = (side: "home" | "draw" | "away") =>
      match.marketPulse?.sides.find((s) => s.side === side)?.share;
    const sHome = share("home");
    const sAway = share("away");
    if (sHome !== undefined && sAway !== undefined) {
      const sDraw = share("draw");
      moneyFlow = {
        homeShare: Math.round(sHome * 100),
        drawShare: isNfl || sDraw === undefined ? undefined : Math.round(sDraw * 100),
        awayShare: Math.round(sAway * 100),
        sharpNote: "Reparto del dinero según el último corte de mercado.",
      };
    }
  } else if (signal?.market) {
    moneyFlow = {
      homeShare: Math.round(signal.market.noVig.home * 100),
      drawShare: isNfl ? undefined : Math.round(signal.market.noVig.draw * 100),
      awayShare: Math.round(signal.market.noVig.away * 100),
      sharpNote: `Probabilidad implícita del mercado (${signal.market.bookLabel}) sin margen de la casa.`,
    };
  }

  return {
    cortexSynthesis: synthesisParts.join(" "),
    tacticalKeys,
    lineupStatusLabel:
      match.status === "FT" ? "Partido finalizado" : "Alineaciones oficiales pendientes",
    lineupsConfirmed60m: false,
    absences,
    moneyFlow,
  };
}

function buildPlatformMarkets(
  match: MatchAnalysis,
  signal: SpacetimeSignal | null,
): PlatformMarketRow[] {
  const rows = rowsWithSpacetime(match, signal);
  const source =
    rows.length > 0
      ? rows.slice(0, 22)
      : match.outcomes.map((o) => ({
          group: match.sport === "american-football" ? "Ganador" : "Resultado 1X2",
          row: {
            market: "h2h",
            selection: o.key,
            label: o.label,
            p: o.probability,
            fairOdds: fairOddsOf(o.probability),
          } as AnalysisMarketRow,
        }));

  return source.map(({ group, row }) => {
    const fairDecimal = Math.max(1.01, Math.round(row.fairOdds * 100) / 100);
    const currentDecimal = realOdds(signal, moneylineSide(row.market, row.selection));
    return {
      group,
      market: row.market,
      selection: row.selection,
      label: row.label,
      p: row.p,
      fairDecimal,
      fairAmerican: decimalToAmericanInt(fairDecimal),
      openDecimal: null,
      currentDecimal,
      edgePts: edgeAgainst(row.p, currentDecimal),
    };
  });
}

export function buildPlatformDataset(inputs: readonly RawLeagueInput[]): PlatformDataset {
  const leagues: PlatformLeagueSummary[] = [];
  const games: PlatformGame[] = [];

  for (const leagueInput of inputs) {
    const standings = leagueInput.standings ?? [];
    const leader = standings[0];
    let upcomingCount = 0;
    let finishedCount = 0;

    for (const m of leagueInput.games) {
      if (m.scheduleStatus === "canceled") continue;
      if (m.status === "FT") finishedCount += 1;
      else upcomingCount += 1;

      const signal = leagueInput.spacetime?.[m.id] ?? null;
      const isNfl = m.sport === "american-football" || m.league === "nfl";
      const x12: [number, number, number] = signal
        ? [signal.probs.home, signal.probs.draw, signal.probs.away]
        : m.x12 ?? [
        m.outcomes[0]?.probability ?? 0.48,
        isNfl ? 0 : (m.outcomes[1]?.probability ?? 0.25),
        m.outcomes[isNfl ? 1 : 2]?.probability ?? 0.27,
      ];
      const proj = projectionFor(m, signal) ?? {
        home: isNfl ? 24 : 1.55,
        away: isNfl ? 21 : 1.18,
        total: isNfl ? 45 : 2.73,
      };
      const confScore = m.confidence?.score ?? 60;
      const confLevel =
        m.confidence?.level ?? (confScore >= 72 ? "alta" : confScore >= 58 ? "media" : "baja");

      games.push({
        id: m.id,
        league: m.league,
        leagueLabel: m.leagueLabel,
        sport: m.sport,
        round: m.round,
        dayId: m.day,
        dayLabel: m.dayLabel,
        kickoffUtc: m.kickoffUtc,
        kickoffLocal: m.kickoffLocal,
        venue: m.venue,
        neutralSite: m.neutralSite,
        status: m.status,
        score: m.score,
        home: {
          slug: m.home.slug,
          name: m.home.name,
          shortName: m.home.shortName || m.home.name,
          code: m.home.code ?? m.home.shortName.slice(0, 3).toUpperCase(),
          record: m.home.record,
        },
        away: {
          slug: m.away.slug,
          name: m.away.name,
          shortName: m.away.shortName || m.away.name,
          code: m.away.code ?? m.away.shortName.slice(0, 3).toUpperCase(),
          record: m.away.record,
        },
        x12,
        projection: {
          home: proj.home,
          away: proj.away,
          total: proj.total,
        },
        confidenceScore: confScore,
        confidenceLevel: confLevel,
        confidenceDetail: {
          reasons: m.confidence?.reasons ?? [],
          factors: m.confidence?.factors ?? [],
        },
        picks: buildFiveMatchPicks(m, signal),
        preGame: buildPreGameIntel(m, signal),
        markets: buildPlatformMarkets(m, signal),
        factors:
          m.factors.length > 0
            ? m.factors.map((f) => ({
                label: f.label,
                value: f.value ?? f.impact,
                sub: f.sub || f.detail,
              }))
            : [
                {
                  label: "Forma local",
                  value: m.home.record,
                  sub: "Rendimiento reciente verificado",
                },
                {
                  label: "Forma visitante",
                  value: m.away.record,
                  sub: "Rendimiento reciente verificado",
                },
              ],
        headToHead: m.headToHead ?? [],
        restDays: m.restDays,
        updatedAtLabel: m.updatedAt ?? "Corte reciente Spacetime Suite",
        spacetime: signal,
      });
    }

    leagues.push({
      league: leagueInput.league,
      label: leagueInput.leagueLabel,
      sport: leagueInput.sport,
      season: leagueInput.season,
      roundLabel: leagueInput.roundLabel,
      generatedAt: leagueInput.generatedAt,
      totalGames: upcomingCount + finishedCount,
      upcomingCount,
      finishedCount,
      leaderName: leader?.name,
      leaderPoints: leader?.points,
      standings,
    });
  }

  // Seleccionar determinísticamente:
  // 1) El único Pick Abierto del Día (primer juego próximo de alta confianza)
  // 2) El único Pick Abierto Semanal de Tipster (@sofia_nfl -> preferentemente NFL próximo, o segundo juego próximo)
  const upcomingGames = games.filter((g) => g.status !== "FT" && g.picks.length > 0);
  const promoGame = upcomingGames[0] ?? games[0];
  const tipsterGame =
    upcomingGames.find((g) => g.league === "nfl" && g.id !== promoGame?.id) ??
    upcomingGames[1] ??
    promoGame;

  let dailyPromoPickId = "";
  let tipsterWeeklyPickId = "";

  if (promoGame && promoGame.picks[0]) {
    promoGame.picks[0].isDailyOpenPromo = true;
    dailyPromoPickId = promoGame.picks[0].id;
  }
  if (tipsterGame) {
    const targetSlot = tipsterGame.id === promoGame?.id ? tipsterGame.picks[1] : tipsterGame.picks[0];
    if (targetSlot) {
      targetSlot.isTipsterWeeklyOpen = true;
      targetSlot.tipsterSlug = "sofia-sem";
      tipsterWeeklyPickId = targetSlot.id;
    }
  }

  const latestGen =
    inputs
      .map((i) => i.generatedAt)
      .sort()
      .at(-1) ?? new Date().toISOString();

  return {
    generatedAt: latestGen,
    leagues,
    games,
    dailyPromoPickId,
    tipsterWeeklyPickId,
    tipsterWeeklySlug: "sofia-sem",
    isServerRedactedForVisitor: false,
  };
}

/**
 * Catálogo de Player Props Lab. Spacetime v3.0 todavía no proyecta estadísticas por jugador,
 * así que no hay props: la vista muestra un estado "próximamente" en lugar de líneas inventadas.
 */
export function buildPlayerPropsCatalog(_games: readonly PlatformGame[]): PlayerPropItem[] {
  return [];
}

export function evaluatePropLineProbability(
  mean: number,
  sd: number,
  line: number,
): { pOver: number; pUnder: number; fairOverDecimal: number; fairUnderDecimal: number } {
  const z = (line - mean) / Math.max(0.25, sd);
  // Aproximación logística calibrada a la CDF normal: Phi(z) ≈ 1 / (1 + exp(-1.702 * z))
  const cdf = 1 / (1 + Math.exp(-1.702 * z));
  const pOver = Math.min(0.92, Math.max(0.08, 1 - cdf));
  const pUnder = Math.min(0.92, Math.max(0.08, 1 - pOver));
  return {
    pOver,
    pUnder,
    fairOverDecimal: Math.round((1 / pOver) * 100) / 100,
    fairUnderDecimal: Math.round((1 / pUnder) * 100) / 100,
  };
}
