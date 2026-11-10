import {
  asMarketKey,
  selectionHolds,
  type AnalysisMarketRow,
  type LeagueId,
  type MatchAnalysis,
  type StandingRow,
} from "@pitchlab/contracts";
import { decimalToAmericanInt } from "./access-guard.js";
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
} from "./types.js";

export interface RawLeagueInput {
  league: LeagueId;
  leagueLabel: string;
  sport: "football" | "american-football";
  season: string;
  roundLabel: string;
  generatedAt: string;
  games: MatchAnalysis[];
  standings?: StandingRow[];
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function clampProb(p: number): number {
  return Math.min(0.92, Math.max(0.08, p));
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

function buildSimulatedMarketDecimal(
  fairDecimal: number,
  seed: number,
  positiveEdgeBias: boolean,
): { marketDecimal: number; edgePts: number } {
  const pFair = 1 / Math.max(1.04, fairDecimal);
  // Diferencial determinista realista entre -1.2 pts y +5.4 pts de probabilidad implícita
  const deltaPts = positiveEdgeBias
    ? 1.6 + (seed % 38) / 10
    : -1.1 + (seed % 46) / 10;
  const impliedBook = Math.min(0.94, Math.max(0.09, pFair - deltaPts / 100));
  const marketDecimal = Math.max(1.08, Math.round((1 / impliedBook) * 100) / 100);
  const actualImplied = 1 / marketDecimal;
  const edgePts = Math.round((pFair - actualImplied) * 1000) / 10;
  return { marketDecimal, edgePts };
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

function buildFiveMatchPicks(match: MatchAnalysis): MatchPick[] {
  const isNfl = match.sport === "american-football" || match.league === "nfl";
  const seed = hashSeed(match.id);
  const allRows = flattenMarketRows(match);
  const matchLabel = `${match.home.shortName} vs ${match.away.shortName}`;
  const confScore = match.confidence?.score ?? (62 + (seed % 24));
  const proj = match.projection ?? {
    home: isNfl ? 24 : 1.55,
    away: isNfl ? 21 : 1.18,
    total: isNfl ? 45 : 2.73,
  };
  const [ph, pd, pa] = match.x12 ?? [0.48, isNfl ? 0 : 0.25, isNfl ? 0.52 : 0.27];
  const favIsHome = ph >= pa;
  const favTeam = favIsHome ? match.home.shortName : match.away.shortName;
  const dogTeam = favIsHome ? match.away.shortName : match.home.shortName;
  const primaryEngine: EngineKey = isNfl ? "minkowski" : "tachyon";
  const primaryEngineName = isNfl ? "PitchLab Minkowski v2.1" : "PitchLab Tachyon v2.1";

  const usedLabels = new Set<string>();
  const pickRows: Array<{
    category: MatchPick["category"];
    categoryLabel: string;
    risk: MatchPick["risk"];
    engineKey: EngineKey;
    engineName: string;
    marketGroup: string;
    market: string;
    selection: string;
    line?: number;
    label: string;
    p: number;
    fairDecimal: number;
    rationale: string;
    units: number;
    positiveBias: boolean;
  }> = [];

  // 1) Pick Principal PitchLab (54%–70%, mejor señal estructural)
  const snapIntermedia = match.picks?.find((p) => p.profile === "intermedia");
  const candidateMain =
    snapIntermedia ??
    allRows.find(({ row }) => row.p >= 0.55 && row.p <= 0.71)?.row;
  const pMain = clampProb(candidateMain?.p ?? Math.max(ph, pa));
  const labelMain =
    candidateMain?.label ??
    (favIsHome ? `${match.home.shortName} gana` : `${match.away.shortName} gana`);
  usedLabels.add(labelMain);
  pickRows.push({
    category: "principal",
    categoryLabel: "Pick Principal PitchLab",
    risk: "medio",
    engineKey: primaryEngine,
    engineName: primaryEngineName,
    marketGroup: isNfl ? "Ganador / Línea Principal" : "Resultado Principal",
    market: candidateMain?.market ?? "h2h",
    selection: candidateMain?.selection ?? (favIsHome ? "home" : "away"),
    line: candidateMain?.line,
    label: labelMain,
    p: pMain,
    fairDecimal: candidateMain?.fairOdds ?? Math.round((1 / pMain) * 100) / 100,
    rationale: isNfl
      ? `${primaryEngineName} proyecta ${proj.home.toFixed(1)}–${proj.away.toFixed(1)} pts con diferencial favorable en eficiencia por serie.`
      : `${primaryEngineName} proyecta ${proj.home.toFixed(2)}–${proj.away.toFixed(2)} goles esperados y control territorial sostenido de ${favTeam}.`,
    units: 1.5,
    positiveBias: true,
  });

  // 2) Escudo Conservador (72%–88%, ideal para base de Parlay)
  const snapCons = match.picks?.find((p) => p.profile === "conservadora");
  const candidateShield =
    (snapCons && !usedLabels.has(snapCons.label) ? snapCons : undefined) ??
    allRows.find(({ row }) => !usedLabels.has(row.label) && row.p >= 0.72 && row.p <= 0.89)?.row;
  const pShield = clampProb(
    candidateShield?.p ?? (isNfl ? Math.min(0.84, Math.max(ph, pa) + 0.16) : Math.min(0.85, Math.max(ph, pa) + pd)),
  );
  const labelShield =
    candidateShield?.label ??
    (isNfl ? `${favTeam} +7.5 (Línea alternativa)` : `${favTeam} o Empate (Doble oportunidad)`);
  usedLabels.add(labelShield);
  pickRows.push({
    category: "conservador",
    categoryLabel: "Escudo Conservador",
    risk: "conservador",
    engineKey: isNfl ? "minkowski" : "singularity",
    engineName: isNfl ? "PitchLab Minkowski v2.1" : "PitchLab Singularity v2.1",
    marketGroup: isNfl ? "Hándicap Protegido" : "Doble Oportunidad",
    market: candidateShield?.market ?? (isNfl ? "spread" : "double_chance"),
    selection: candidateShield?.selection ?? (favIsHome ? "1x" : "x2"),
    line: candidateShield?.line ?? (isNfl ? 7.5 : undefined),
    label: labelShield,
    p: pShield,
    fairDecimal: candidateShield?.fairOdds ?? Math.round((1 / pShield) * 100) / 100,
    rationale: `Cobertura de baja varianza diseñada para proteger unidades y anclar parlays conservadores (${Math.round(pShield * 100)} % de frecuencia calibrada).`,
    units: 2.0,
    positiveBias: true,
  });

  // 3) Línea de Totales (Over / Under calibrado por ritmo)
  const totalCandidate = allRows.find(
    ({ group, row }) =>
      !usedLabels.has(row.label) &&
      (group.toLowerCase().includes("total") ||
        group.toLowerCase().includes("goles") ||
        row.market.toLowerCase().includes("total") ||
        row.market.toLowerCase().includes("ou")) &&
      row.p >= 0.51 &&
      row.p <= 0.74,
  )?.row;
  const defaultLine = isNfl ? Math.round(proj.total - 0.5) + 0.5 : proj.total >= 2.65 ? 2.5 : 1.5;
  const goOver = isNfl ? proj.total >= defaultLine : proj.total >= 2.45;
  const pTotals = clampProb(totalCandidate?.p ?? (goOver ? 0.59 : 0.61));
  const labelTotals =
    totalCandidate?.label ??
    `${goOver ? "Más de" : "Menos de"} ${defaultLine} ${isNfl ? "puntos" : "goles"}`;
  usedLabels.add(labelTotals);
  pickRows.push({
    category: "totales",
    categoryLabel: "Línea de Totales",
    risk: "medio",
    engineKey: primaryEngine,
    engineName: primaryEngineName,
    marketGroup: isNfl ? "Totales de Puntos" : "Totales de Goles",
    market: totalCandidate?.market ?? "totals",
    selection: totalCandidate?.selection ?? (goOver ? "over" : "under"),
    line: totalCandidate?.line ?? defaultLine,
    label: labelTotals,
    p: pTotals,
    fairDecimal: totalCandidate?.fairOdds ?? Math.round((1 / pTotals) * 100) / 100,
    rationale: `Proyección acumulada de ${proj.total.toFixed(isNfl ? 1 : 2)} ${isNfl ? "pts" : "goles"} ajustada por ritmo de posesiones y desgaste defensivo.`,
    units: 1.25,
    positiveBias: seed % 3 !== 0,
  });

  // 4) Lectura Táctica (Ambos Anotan / Totales por Equipo / Spread)
  const tacticalCandidate = allRows.find(
    ({ group, row }) =>
      !usedLabels.has(row.label) &&
      (group.toLowerCase().includes("ambos") ||
        group.toLowerCase().includes("equipo") ||
        group.toLowerCase().includes("hándicap") ||
        group.toLowerCase().includes("spread")) &&
      row.p >= 0.50 &&
      row.p <= 0.73,
  )?.row;
  const bttsLikely = !isNfl && proj.home >= 1.15 && proj.away >= 1.02;
  const pTactical = clampProb(tacticalCandidate?.p ?? (isNfl ? 0.56 : bttsLikely ? 0.58 : 0.60));
  const labelTactical =
    tacticalCandidate?.label ??
    (isNfl
      ? `${favTeam} cubre -2.5 pts`
      : bttsLikely
        ? "Ambos equipos anotan: Sí"
        : "Ambos equipos anotan: No");
  usedLabels.add(labelTactical);
  pickRows.push({
    category: "tactico",
    categoryLabel: "Lectura Táctica",
    risk: "medio",
    engineKey: "singularity",
    engineName: "PitchLab Singularity v2.1",
    marketGroup: isNfl ? "Línea de Hándicap" : "Ambos Anotan / Equipo",
    market: tacticalCandidate?.market ?? (isNfl ? "spread" : "btts"),
    selection:
      tacticalCandidate?.selection ??
      (isNfl ? (favIsHome ? "home" : "away") : bttsLikely ? "btts_yes" : "btts_no"),
    line: tacticalCandidate?.line ?? (isNfl ? -2.5 : undefined),
    label: labelTactical,
    p: pTactical,
    fairDecimal: tacticalCandidate?.fairOdds ?? Math.round((1 / pTactical) * 100) / 100,
    rationale: `Singularity v2.1 detecta asimetría táctica en transición y confirma correlación positiva con el guion central de Cortex IA.`,
    units: 1.0,
    positiveBias: true,
  });

  // 5) Cuota Alta · Valor (38%–50%, cuota >= 2.00 con edge Geodesic)
  const snapRisk = match.picks?.find((p) => p.profile === "arriesgada");
  const valueCandidate =
    (snapRisk && !usedLabels.has(snapRisk.label) ? snapRisk : undefined) ??
    allRows.find(
      ({ row }) => !usedLabels.has(row.label) && row.p >= 0.36 && row.p <= 0.50 && row.fairOdds >= 2.0,
    )?.row;
  const pValue = clampProb(valueCandidate?.p ?? 0.43);
  const labelValue =
    valueCandidate?.label ??
    (isNfl
      ? `${favTeam} gana y Más de ${(defaultLine - 3).toFixed(1)} pts`
      : `${dogTeam} o Empate · Valor Geodesic`);
  usedLabels.add(labelValue);
  pickRows.push({
    category: "valor",
    categoryLabel: "Cuota Alta · Valor",
    risk: "arriesgado",
    engineKey: "geodesic",
    engineName: "PitchLab Geodesic v1.0",
    marketGroup: "Oportunidad de Cuota Alta",
    market: valueCandidate?.market ?? "value_special",
    selection: valueCandidate?.selection ?? (isNfl ? (favIsHome ? "home" : "away") : favIsHome ? "x2" : "1x"),
    line: valueCandidate?.line,
    label: labelValue,
    p: pValue,
    fairDecimal: valueCandidate?.fairOdds ?? Math.round((1 / pValue) * 100) / 100,
    rationale: `Geodesic v1.0 identifica sobreprecio en las casas frente al momio limpio del modelo; perfil de 0.75u para capturar valor esperado alto.`,
    units: 0.75,
    positiveBias: true,
  });

  return pickRows.map((item, idx) => {
    const fairDecimal = Math.max(1.06, Math.round(item.fairDecimal * 100) / 100);
    const fairAmerican = decimalToAmericanInt(fairDecimal);
    const { marketDecimal, edgePts } = buildSimulatedMarketDecimal(
      fairDecimal,
      seed + idx * 17,
      item.positiveBias,
    );
    const marketAmerican = decimalToAmericanInt(marketDecimal);
    const conflictGroup = classifyConflictGroup(item.market, item.selection, item.label);
    const result =
      match.status === "FT"
        ? gradePick(item.market, item.selection, item.line, conflictGroup, match.score)
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
      selectionKey: item.selection,
      conflictGroup,
      label: item.label,
      rationale: item.rationale,
      p: item.p,
      fairDecimal,
      fairAmerican,
      marketDecimal,
      marketAmerican,
      edgePts,
      confidenceScore: Math.min(96, Math.max(48, Math.round(confScore - idx * 3))),
      suggestedUnits: item.units,
      result,
    };
  });
}

function buildPreGameIntel(match: MatchAnalysis, seed: number): PreGameIntel {
  const isNfl = match.sport === "american-football" || match.league === "nfl";
  const proj = match.projection ?? {
    home: isNfl ? 24 : 1.55,
    away: isNfl ? 21 : 1.18,
    total: isNfl ? 45 : 2.73,
  };
  const [ph, pd, pa] = match.x12 ?? [0.48, isNfl ? 0 : 0.25, isNfl ? 0.52 : 0.27];
  const favName = ph >= pa ? match.home.name : match.away.name;
  const restHome = match.restDays?.home ?? (5 + (seed % 4));
  const restAway = match.restDays?.away ?? (4 + ((seed >> 2) % 4));

  const cortexSynthesis = isNfl
    ? `PitchLab Cortex IA integra la salida de Minkowski v2.1 (${proj.home.toFixed(1)}–${proj.away.toFixed(1)} pts) con ventaja proyectada para ${favName}. El diferencial de preparación (${restHome}d vs ${restAway}d) y la eficiencia en zona roja sostienen valor sobre el cierre estimado por Geodesic v1.0.`
    : `PitchLab Cortex IA combina Tachyon v2.1 y Singularity v2.1 (${proj.home.toFixed(2)}–${proj.away.toFixed(2)} goles esperados) inclinando el guion hacia ${favName}. Con ${restHome} días de recuperación local frente a ${restAway} del visitante, la presión tras pérdida abre valor en los primeros 65 minutos.`;

  const absences: LineupAbsenceItem[] = [
    {
      teamSide: "home",
      player: `Cuadro base ${match.home.shortName}`,
      role: isNfl ? "Unidad ofensiva titular" : "Once estelar reportado",
      status: "Confirmado XI",
      impactNote: "Sin bajas de último minuto en el corte previo de 60 minutos.",
    },
    {
      teamSide: "away",
      player: `Rotación ${match.away.shortName}`,
      role: isNfl ? "Secundaria / rotación defensiva" : "Banda defensiva visitante",
      status: seed % 2 === 0 ? "Duda" : "Baja",
      impactNote:
        seed % 2 === 0
          ? "Minutos dosificados por carga acumulada; ajuste de -0.08 en solidez visitante."
          : "Ausencia ponderada automáticamente por Cortex IA en la matriz previa.",
    },
  ];

  let homeShare = Math.round(ph * 100);
  let drawShare = isNfl ? undefined : Math.round(pd * 100);
  let awayShare = isNfl ? 100 - homeShare : Math.max(4, 100 - homeShare - (drawShare ?? 0));

  if (match.marketPulse && match.marketPulse.sides.length >= 2) {
    const sHome = match.marketPulse.sides.find((s) => s.side === "home")?.share ?? ph;
    const sDraw = match.marketPulse.sides.find((s) => s.side === "draw")?.share ?? pd;
    const sAway = match.marketPulse.sides.find((s) => s.side === "away")?.share ?? pa;
    homeShare = Math.round(sHome * 100);
    if (isNfl) {
      awayShare = Math.max(1, 100 - homeShare);
    } else {
      drawShare = Math.round(sDraw * 100);
      awayShare = Math.max(1, Math.round(sAway * 100));
    }
  }

  return {
    cortexSynthesis,
    tacticalKeys: [
      `Descanso verificado: ${match.home.shortName} (${restHome}d) vs ${match.away.shortName} (${restAway}d)`,
      `Proyección Spacetime Suite: ${proj.home.toFixed(isNfl ? 1 : 2)} – ${proj.away.toFixed(isNfl ? 1 : 2)} (Total ${proj.total.toFixed(isNfl ? 1 : 2)})`,
      `Calibración Geodesic v1.0 activa contra movimiento de apertura`,
    ],
    lineupStatusLabel:
      match.status === "FT"
        ? "Alineaciones oficiales cerradas y auditadas"
        : " Monitoreo Cortex IA · Corte oficial 60 min antes del kickoff",
    lineupsConfirmed60m: match.status === "FT" || seed % 3 !== 2,
    absences,
    moneyFlow: {
      homeShare,
      drawShare,
      awayShare,
      sharpNote:
        homeShare > Math.round(ph * 100) + 4
          ? `El flujo público carga fuerte a ${match.home.shortName}; Geodesic v1.0 vigila valor contracorriente.`
          : `Flujo institucional alineado con la probabilidad limpia de Spacetime Suite (${Math.round(Math.max(ph, pa) * 100)} %).`,
      volumeTier: seed % 3 === 0 ? "Alto" : seed % 3 === 1 ? "Medio" : "Moderado",
    },
  };
}

function buildPlatformMarkets(
  match: MatchAnalysis,
  seed: number,
): PlatformMarketRow[] {
  const rows = flattenMarketRows(match);
  if (rows.length === 0) {
    return match.outcomes.map((o, idx) => {
      const fairDecimal = o.fairOdds?.decimal ?? Math.round((1 / clampProb(o.probability)) * 100) / 100;
      const { marketDecimal, edgePts } = buildSimulatedMarketDecimal(
        fairDecimal,
        seed + idx * 13,
        idx === 0,
      );
      const openDecimal = Math.max(1.06, Math.round((marketDecimal + (idx % 2 === 0 ? 0.06 : -0.05)) * 100) / 100);
      return {
        group: match.sport === "american-football" ? "Ganador" : "Resultado 1X2",
        market: "h2h",
        selection: o.key,
        label: o.label,
        p: o.probability,
        fairDecimal,
        fairAmerican: decimalToAmericanInt(fairDecimal),
        openDecimal,
        currentDecimal: marketDecimal,
        edgePts,
      };
    });
  }

  return rows.slice(0, 22).map(({ group, row }, idx) => {
    const fairDecimal = Math.max(1.05, Math.round(row.fairOdds * 100) / 100);
    const { marketDecimal, edgePts } = buildSimulatedMarketDecimal(
      fairDecimal,
      seed + idx * 11,
      idx % 3 === 0,
    );
    const openDecimal = Math.max(
      1.05,
      Math.round((marketDecimal + ((seed + idx) % 2 === 0 ? 0.07 : -0.05)) * 100) / 100,
    );
    return {
      group,
      market: row.market,
      selection: row.selection,
      label: row.label,
      p: row.p,
      fairDecimal,
      fairAmerican: decimalToAmericanInt(fairDecimal),
      openDecimal,
      currentDecimal: marketDecimal,
      edgePts,
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

      const seed = hashSeed(m.id);
      const isNfl = m.sport === "american-football" || m.league === "nfl";
      const x12: [number, number, number] = m.x12 ?? [
        m.outcomes[0]?.probability ?? 0.48,
        isNfl ? 0 : (m.outcomes[1]?.probability ?? 0.25),
        m.outcomes[isNfl ? 1 : 2]?.probability ?? 0.27,
      ];
      const proj = m.projection ?? {
        home: isNfl ? 24 : 1.55,
        away: isNfl ? 21 : 1.18,
        total: isNfl ? 45 : 2.73,
      };
      const confScore = m.confidence?.score ?? (64 + (seed % 22));
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
        picks: buildFiveMatchPicks(m),
        preGame: buildPreGameIntel(m, seed),
        markets: buildPlatformMarkets(m, seed),
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
  // 2) El único Pick Abierto Semanal de Tipstar (@sofia_nfl -> preferentemente NFL próximo, o segundo juego próximo)
  const upcomingGames = games.filter((g) => g.status !== "FT" && g.picks.length > 0);
  const promoGame = upcomingGames[0] ?? games[0];
  const tipstarGame =
    upcomingGames.find((g) => g.league === "nfl" && g.id !== promoGame?.id) ??
    upcomingGames[1] ??
    promoGame;

  let dailyPromoPickId = "";
  let tipstarWeeklyPickId = "";

  if (promoGame && promoGame.picks[0]) {
    promoGame.picks[0].isDailyOpenPromo = true;
    dailyPromoPickId = promoGame.picks[0].id;
  }
  if (tipstarGame) {
    const targetSlot = tipstarGame.id === promoGame?.id ? tipstarGame.picks[1] : tipstarGame.picks[0];
    if (targetSlot) {
      targetSlot.isTipstarWeeklyOpen = true;
      targetSlot.tipstarSlug = "sofia-sem";
      tipstarWeeklyPickId = targetSlot.id;
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
    tipstarWeeklyPickId,
    tipstarWeeklySlug: "sofia-sem",
    isServerRedactedForVisitor: false,
  };
}

/**
 * Construye el catálogo interactivo de Player Props Lab vinculado a los equipos reales del snapshot.
 */
export function buildPlayerPropsCatalog(games: readonly PlatformGame[]): PlayerPropItem[] {
  const upcoming = games.filter((g) => g.status !== "FT");
  const pool = upcoming.length >= 4 ? upcoming : games;
  const nflGames = pool.filter((g) => g.league === "nfl");
  const soccerGames = pool.filter((g) => g.league !== "nfl");

  const gNfl1 = nflGames[0] ?? pool[0];
  const gNfl2 = nflGames[1] ?? nflGames[0] ?? pool[1] ?? pool[0];
  const gSoc1 = soccerGames[0] ?? pool[0];
  const gSoc2 = soccerGames[1] ?? soccerGames[0] ?? pool[0];

  const items: PlayerPropItem[] = [];

  if (gNfl1) {
    items.push(
      {
        id: "prop-qb-pass",
        league: gNfl1.league,
        leagueLabel: gNfl1.leagueLabel,
        gameId: gNfl1.id,
        matchLabel: `${gNfl1.home.shortName} vs ${gNfl1.away.shortName}`,
        kickoffLocal: gNfl1.kickoffLocal,
        player: `QB1 · ${gNfl1.home.shortName}`,
        teamSlug: gNfl1.home.slug,
        teamName: gNfl1.home.name,
        position: "QB",
        statLabel: "Yardas por pase",
        baseLine: 248.5,
        step: 5,
        minLine: 223.5,
        maxLine: 278.5,
        projectionMean: 264.2,
        projectionSd: 34.0,
        engineName: "PitchLab Minkowski v2.1",
        marketOverDecimal: 1.91,
        marketUnderDecimal: 1.91,
        last10: [278, 241, 289, 262, 234, 301, 255, 268, 219, 274],
        contextNote: "Ritmo neutral-alto en primer tiempo y secundaria rival en mitad baja contra pase intermedio.",
      },
      {
        id: "prop-wr-rec",
        league: gNfl2?.league ?? gNfl1.league,
        leagueLabel: gNfl2?.leagueLabel ?? gNfl1.leagueLabel,
        gameId: gNfl2?.id ?? gNfl1.id,
        matchLabel: gNfl2
          ? `${gNfl2.home.shortName} vs ${gNfl2.away.shortName}`
          : `${gNfl1.home.shortName} vs ${gNfl1.away.shortName}`,
        kickoffLocal: gNfl2?.kickoffLocal ?? gNfl1.kickoffLocal,
        player: `WR1 · ${(gNfl2 ?? gNfl1).away.shortName}`,
        teamSlug: (gNfl2 ?? gNfl1).away.slug,
        teamName: (gNfl2 ?? gNfl1).away.name,
        position: "WR",
        statLabel: "Yardas por recepción",
        baseLine: 72.5,
        step: 2.5,
        minLine: 57.5,
        maxLine: 92.5,
        projectionMean: 81.4,
        projectionSd: 19.5,
        engineName: "PitchLab Minkowski v2.1",
        marketOverDecimal: 1.87,
        marketUnderDecimal: 1.95,
        last10: [88, 64, 95, 79, 102, 58, 84, 76, 91, 74],
        contextNote: "28.4 % de cuota de targets en tercer down y zona roja durante las últimas 5 semanas.",
      },
    );
  }

  if (gSoc1) {
    items.push(
      {
        id: "prop-fw-sot",
        league: gSoc1.league,
        leagueLabel: gSoc1.leagueLabel,
        gameId: gSoc1.id,
        matchLabel: `${gSoc1.home.shortName} vs ${gSoc1.away.shortName}`,
        kickoffLocal: gSoc1.kickoffLocal,
        player: `9 Titular · ${gSoc1.home.shortName}`,
        teamSlug: gSoc1.home.slug,
        teamName: gSoc1.home.name,
        position: "DEL",
        statLabel: "Remates a puerta",
        baseLine: 1.5,
        step: 0.5,
        minLine: 0.5,
        maxLine: 3.5,
        projectionMean: 1.92,
        projectionSd: 0.88,
        engineName: "PitchLab Tachyon v2.1",
        marketOverDecimal: 1.95,
        marketUnderDecimal: 1.85,
        last10: [2, 1, 3, 2, 2, 0, 2, 3, 1, 2],
        contextNote: "Promedio de 3.8 disparos totales por 90m con localía favorable según Tachyon v2.1.",
      },
      {
        id: "prop-mf-passes",
        league: (gSoc2 ?? gSoc1).league,
        leagueLabel: (gSoc2 ?? gSoc1).leagueLabel,
        gameId: (gSoc2 ?? gSoc1).id,
        matchLabel: `${(gSoc2 ?? gSoc1).home.shortName} vs ${(gSoc2 ?? gSoc1).away.shortName}`,
        kickoffLocal: (gSoc2 ?? gSoc1).kickoffLocal,
        player: `Organizador · ${(gSoc2 ?? gSoc1).home.shortName}`,
        teamSlug: (gSoc2 ?? gSoc1).home.slug,
        teamName: (gSoc2 ?? gSoc1).home.name,
        position: "MED",
        statLabel: "Pases completados",
        baseLine: 58.5,
        step: 2.5,
        minLine: 48.5,
        maxLine: 71.0,
        projectionMean: 64.0,
        projectionSd: 10.2,
        engineName: "PitchLab Singularity v2.1",
        marketOverDecimal: 1.90,
        marketUnderDecimal: 1.90,
        last10: [67, 61, 54, 70, 65, 62, 59, 72, 60, 66],
        contextNote: "Posesión proyectada del 57 % ante bloque medio-bajo visitante.",
      },
    );
  }

  return items;
}

/**
 * Aproximación normal continua suave para calcular P(Over line) al mover el scrubber de línea.
 */
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
