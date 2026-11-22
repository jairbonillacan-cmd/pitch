import { parseStrictFiniteNumber, sportHasDraw, sportScoringUnit } from "@pitchlab/contracts";
import { formatOddsValue } from "../../access-guard";
import type {
  OddsFormat,
  PlatformGame,
  PlatformMarketRow,
} from "../../types";
import type { CortexSectionView, CortexStatView } from "./CortexAnalysisCard";
import { localizeInjuryLabelEs } from "./pre-match-logic";

export interface CortexForecastLine {
  label: string;
  valueLabel: string;
  fairLabel?: string | null;
  marketLabel?: string | null;
}

export interface CortexWinOutcome {
  key: "home" | "draw" | "away";
  prefix: "1" | "X" | "2";
  name: string;
  slug?: string;
  logoUrl?: string;
  pct: number;
  fairLabel: string | null;
  isWinner: boolean;
}

export interface CortexForecastSummary {
  scoreLabel: string;
  totalLabel: string;
  homeScore: string;
  awayScore: string;
  totalValue: string;
  totalsRow: CortexForecastLine | null;
  marginText: string | null;
  handicapRow: CortexForecastLine | null;
  winOutcomes: CortexWinOutcome[];
  isThreeWay: boolean;
  isFinished: boolean;
  realScoreText: string | null;
}

export interface CortexEditorialItem {
  key: string;
  title: string;
  text: string;
  stats?: readonly CortexStatView[];
  isWatch?: boolean;
}

const NBSP = String.fromCharCode(160);
export const keepCortexUnits = (text: string): string =>
  text.replace(/(\d) (%)/g, `$1${NBSP}$2`);

function parseLineNumber(row: Pick<PlatformMarketRow, "line" | "selection" | "label" | "group">): number | null {
  if (typeof row.line === "number" && Number.isFinite(row.line)) return row.line;
  const fromSelection = /(?:over|under|home|away)_(-?\d+(?:\.\d+)?)/i.exec(row.selection)?.[1];
  if (fromSelection) return parseStrictFiniteNumber(fromSelection);
  const fromGroup = /(-?\d+(?:\.\d+)?)/.exec(row.group)?.[1];
  if (fromGroup) return parseStrictFiniteNumber(fromGroup);
  return null;
}

function formatSignedLine(line: number): string {
  return line > 0 ? `+${line}` : String(line);
}

function formatSpreadLabel(row: PlatformMarketRow, game: PlatformGame): string {
  const line = parseLineNumber(row);
  const isHockey = game.sport === "ice-hockey";
  const prefix = isHockey ? "Puck line" : "Hándicap";
  const sideCode = row.selection.startsWith("home")
    ? game.home.code
    : row.selection.startsWith("away")
      ? game.away.code
      : "";
  if (line !== null && sideCode) {
    return `${prefix} ${sideCode} ${formatSignedLine(line)}`;
  }
  const parenLine = /\(([+-]?\d+(?:\.\d+)?)\)/.exec(row.label)?.[1];
  const parsedParen = parenLine ? parseStrictFiniteNumber(parenLine) : null;
  if (parsedParen !== null && sideCode) {
    return `${prefix} ${sideCode} ${formatSignedLine(parsedParen)}`;
  }
  return row.label.trim();
}

function pickPrimaryTotalsRow(
  markets: readonly PlatformMarketRow[],
  game: PlatformGame,
  oddsFormat: OddsFormat,
): { row: CortexForecastLine; line: number; p: number; fair: string | null } | null {
  const unit = sportScoringUnit(game.sport);
  const overs = markets.filter(
    (m) =>
      m.market === "totals" &&
      (/^over/i.test(m.selection) || /^más/i.test(m.label)),
  );
  if (overs.length > 0) {
    const sorted = [...overs].sort(
      (a, b) => Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5),
    );
    const chosen = sorted[0]!;
    const line = parseLineNumber(chosen);
    const label =
      line !== null
        ? `Más de ${line} ${unit.plural}`
        : `${chosen.label} (${unit.plural})`;
    const fair = chosen.fairDecimal > 1 ? formatOddsValue(chosen.fairDecimal, oddsFormat) : null;
    const marketLabel =
      chosen.currentDecimal !== null && chosen.currentDecimal > 1
        ? `${chosen.quoteBookLabel?.split(" · ")[0] ?? "Casa"} ${formatOddsValue(chosen.currentDecimal, oddsFormat)}`
        : null;
    return {
      line: line ?? game.projection?.total ?? 0,
      p: chosen.p,
      fair,
      row: {
        label,
        valueLabel: `${Math.round(chosen.p * 100)}${NBSP}%`,
        fairLabel: fair ? `justo ${fair}` : null,
        marketLabel,
      },
    };
  }
  if (game.goalLine) {
    const fairDec = game.goalLine.pOver > 0 ? 1 / game.goalLine.pOver : null;
    const fair = fairDec && fairDec > 1 ? formatOddsValue(fairDec, oddsFormat) : null;
    return {
      line: game.goalLine.line,
      p: game.goalLine.pOver,
      fair,
      row: {
        label: `Más de ${game.goalLine.line} ${unit.plural}`,
        valueLabel: `${Math.round(game.goalLine.pOver * 100)}${NBSP}%`,
        fairLabel: fair ? `justo ${fair}` : null,
        marketLabel: null,
      },
    };
  }
  return null;
}

function pickPrimaryHandicapRow(
  markets: readonly PlatformMarketRow[],
  game: PlatformGame,
  oddsFormat: OddsFormat,
): { row: CortexForecastLine; source: PlatformMarketRow } | null {
  const spreads = markets.filter(
    (m) =>
      m.market === "spreads" ||
      m.market === "spread" ||
      m.market === "handicap" ||
      /^(spread|puck line|hándicap)/i.test(m.group),
  );
  if (spreads.length > 0) {
    // Preferir línea principal (`selection === "home" | "away"`) sobre alternativas.
    const primary = spreads.filter((m) => m.selection === "home" || m.selection === "away");
    const pool = primary.length > 0 ? primary : spreads;
    const chosen = [...pool].sort((a, b) => {
      // Para empate cercano al 50 %, priorizar al equipo local o favorito con línea negativa.
      const diffA = Math.abs(a.p - 0.5);
      const diffB = Math.abs(b.p - 0.5);
      if (Math.abs(diffA - diffB) < 0.03 && a.selection !== b.selection) {
        return a.selection === "home" ? -1 : 1;
      }
      return diffA - diffB;
    })[0]!;
    const fair = chosen.fairDecimal > 1 ? formatOddsValue(chosen.fairDecimal, oddsFormat) : null;
    const marketLabel =
      chosen.currentDecimal !== null && chosen.currentDecimal > 1
        ? `${chosen.quoteBookLabel?.split(" · ")[0] ?? "Casa"} ${formatOddsValue(chosen.currentDecimal, oddsFormat)}`
        : null;
    return {
      source: chosen,
      row: {
        label: formatSpreadLabel(chosen, game),
        valueLabel: `${Math.round(chosen.p * 100)}${NBSP}%`,
        fairLabel: fair ? `justo ${fair}` : null,
        marketLabel,
      },
    };
  }

  // En fútbol sin spread asiático, destacamos "Ambos anotan (Sí)" o la doble oportunidad base.
  const bttsYes = markets.find(
    (m) => m.market === "btts" && /^(yes|sí|si)$/i.test(m.selection || m.label),
  );
  if (bttsYes) {
    const fair = bttsYes.fairDecimal > 1 ? formatOddsValue(bttsYes.fairDecimal, oddsFormat) : null;
    return {
      source: bttsYes,
      row: {
        label: "Ambos anotan · Sí",
        valueLabel: `${Math.round(bttsYes.p * 100)}${NBSP}%`,
        fairLabel: fair ? `justo ${fair}` : null,
        marketLabel: null,
      },
    };
  }

  const dbl = markets.find((m) => m.market === "double_chance");
  if (dbl) {
    const fair = dbl.fairDecimal > 1 ? formatOddsValue(dbl.fairDecimal, oddsFormat) : null;
    return {
      source: dbl,
      row: {
        label: dbl.label,
        valueLabel: `${Math.round(dbl.p * 100)}${NBSP}%`,
        fairLabel: fair ? `justo ${fair}` : null,
        marketLabel: null,
      },
    };
  }
  return null;
}

function buildMarginText(game: PlatformGame): {
  text: string | null;
  diff: number | null;
  favName: string | null;
  absDiff: number | null;
} {
  const unit = sportScoringUnit(game.sport);
  const diff =
    game.spacetime?.expectedMargin ??
    (game.projection ? game.projection.home - game.projection.away : null);
  if (diff === null || !Number.isFinite(diff)) {
    return { text: null, diff: null, favName: null, absDiff: null };
  }
  const absDiff = Math.abs(diff);
  const flatThreshold = unit.decimals >= 2 ? 0.05 : 0.15;
  if (absDiff < flatThreshold) {
    return {
      text: `Partido parejo (±${absDiff.toFixed(unit.decimals)})`,
      diff,
      favName: null,
      absDiff,
    };
  }
  const fav = diff >= 0 ? game.home : game.away;
  return {
    text: `${fav.name} por ${absDiff.toFixed(unit.decimals)}`,
    diff,
    favName: fav.name,
    absDiff,
  };
}

export function buildCortexForecastSummary(
  game: PlatformGame,
  oddsFormat: OddsFormat,
): CortexForecastSummary | null {
  if (game.hasForecast === false || (!game.projection && !game.x12)) {
    return null;
  }
  const unit = sportScoringUnit(game.sport);
  const isGoalSport = game.sport === "football" || game.sport === "ice-hockey";
  const scoreLabel = isGoalSport ? "Goles esperados" : "Puntos esperados";
  const totalLabel = isGoalSport ? "Total de goles" : "Total de puntos";
  const decimals = unit.decimals;

  const homeScore = game.projection ? game.projection.home.toFixed(decimals) : "—";
  const awayScore = game.projection ? game.projection.away.toFixed(decimals) : "—";
  const totalValue = game.projection ? game.projection.total.toFixed(decimals) : "—";

  const totals = pickPrimaryTotalsRow(game.markets, game, oddsFormat);
  const margin = buildMarginText(game);
  const handicap = pickPrimaryHandicapRow(game.markets, game, oddsFormat);

  const isThreeWay = sportHasDraw(game.sport);
  const [ph, pd, pa] = game.x12 ??
    (game.spacetime ? [game.spacetime.probs.home, game.spacetime.probs.draw, game.spacetime.probs.away] : [0.5, 0, 0.5]);

  const isFinished = game.status === "FT" && game.score !== undefined;
  const realScoreText =
    isFinished && game.score ? `${game.score.home}–${game.score.away}` : null;

  const fairFor = (p: number): string | null =>
    p > 0.005 ? `Justo ${formatOddsValue(1 / p, oddsFormat)}` : null;

  const winOutcomes: CortexWinOutcome[] = [
    {
      key: "home",
      prefix: "1",
      name: game.home.name,
      slug: game.home.slug,
      logoUrl: game.home.logoUrl,
      pct: Math.round(ph * 100),
      fairLabel: fairFor(ph),
      isWinner: Boolean(isFinished && game.score && game.score.home > game.score.away),
    },
    ...(isThreeWay
      ? [
          {
            key: "draw" as const,
            prefix: "X" as const,
            name: "Empate",
            pct: Math.round(pd * 100),
            fairLabel: fairFor(pd),
            isWinner: Boolean(isFinished && game.score && game.score.home === game.score.away),
          },
        ]
      : []),
    {
      key: "away",
      prefix: "2",
      name: game.away.name,
      slug: game.away.slug,
      logoUrl: game.away.logoUrl,
      pct: Math.round(pa * 100),
      fairLabel: fairFor(pa),
      isWinner: Boolean(isFinished && game.score && game.score.away > game.score.home),
    },
  ];

  return {
    scoreLabel,
    totalLabel,
    homeScore,
    awayScore,
    totalValue,
    totalsRow: totals ? totals.row : null,
    marginText: margin.text,
    handicapRow: handicap ? handicap.row : null,
    winOutcomes,
    isThreeWay,
    isFinished,
    realScoreText,
  };
}

export function buildCortexEditorialSections(
  game: PlatformGame,
  synthesis: string,
  existingSections: readonly CortexSectionView[] | null | undefined,
  oddsFormat: OddsFormat,
): CortexEditorialItem[] {
  if (existingSections && existingSections.length > 0) {
    return existingSections.map((sec) => ({
      key: sec.key,
      title: sec.key === "lectura" ? "Resumen" : sec.title,
      text: keepCortexUnits(sec.text),
      stats: sec.stats,
      isWatch: sec.key === "cambia",
    }));
  }

  const unit = sportScoringUnit(game.sport);
  const isGoalSport = game.sport === "football" || game.sport === "ice-hockey";
  const hasDraw = sportHasDraw(game.sport);
  const decimals = unit.decimals;

  const [ph, pd, pa] = game.x12 ??
    (game.spacetime ? [game.spacetime.probs.home, game.spacetime.probs.draw, game.spacetime.probs.away] : [0.5, 0, 0.5]);
  const homePct = Math.round(ph * 100);
  const drawPct = Math.round(pd * 100);
  const awayPct = Math.round(pa * 100);

  const favSide = ph >= pa ? game.home : game.away;
  const favPct = ph >= pa ? homePct : awayPct;
  const dogSide = ph >= pa ? game.away : game.home;
  const dogPct = ph >= pa ? awayPct : homePct;
  const gapPts = Math.abs(homePct - awayPct);

  // 1) Resumen
  const customSynthesis = synthesis.trim();
  const isAutoTemplateSynthesis = /^El modelo da \d+ % a /.test(customSynthesis);
  let summaryText = "";
  if (customSynthesis && !isAutoTemplateSynthesis) {
    summaryText = customSynthesis;
  } else {
    const gapNote =
      gapPts <= 8
        ? "El cruce llega muy cerrado, por lo que cualquier ajuste táctico o balón dividido puede inclinar el cierre."
        : gapPts <= 22
          ? `${favSide.shortName} parte un paso adelante por consistencia, aunque el margen todavía deja espacio para pelea.`
          : `La ventaja estadística favorece con claridad a ${favSide.shortName} según su producción reciente y balance del plantel.`;
    const drawClause =
      hasDraw && drawPct > 0 ? ` y ${drawPct} % al empate` : "";
    const marketClause = game.spacetime?.market
      ? (() => {
          const nv = game.spacetime.market.noVig;
          const mFav = nv.home >= nv.away ? game.home.shortName : game.away.shortName;
          const mPct = Math.round(Math.max(nv.home, nv.away) * 100);
          return ` En comparación, el mercado sin margen (${game.spacetime.market.bookLabel}) asigna ${mPct} % a ${mFav}.`;
        })()
      : "";
    summaryText = `${favSide.name} concentra ${favPct} % de probabilidad de victoria frente a ${dogPct} % de ${dogSide.name}${drawClause}. ${gapNote}${marketClause}`;
  }

  const items: CortexEditorialItem[] = [
    {
      key: "resumen",
      title: "Resumen",
      text: keepCortexUnits(summaryText),
    },
  ];

  // 2) Puntos / Goles
  if (game.projection) {
    const hVal = game.projection.home.toFixed(decimals);
    const aVal = game.projection.away.toFixed(decimals);
    const tVal = game.projection.total.toFixed(decimals);

    const overRows = game.markets
      .filter((m) => m.market === "totals" && (/^over/i.test(m.selection) || /^más/i.test(m.label)))
      .map((m) => ({ row: m, line: parseLineNumber(m) }))
      .filter((x): x is { row: PlatformMarketRow; line: number } => x.line !== null)
      .sort((a, b) => a.line - b.line);

    let totalsSentence = "";
    if (overRows.length >= 2) {
      const r1 = overRows[0]!;
      const r2 = overRows[1]!;
      totalsSentence = ` Con esa cifra, superar ${r1.line} ${unit.plural} registra ${Math.round(r1.row.p * 100)} % y superar ${r2.line} queda en ${Math.round(r2.row.p * 100)} %.`;
    } else if (overRows.length === 1) {
      const r1 = overRows[0]!;
      const fair = r1.row.fairDecimal > 1 ? ` (justo ${formatOddsValue(r1.row.fairDecimal, oddsFormat)})` : "";
      totalsSentence = ` Superar la línea de ${r1.line} ${unit.plural} marca ${Math.round(r1.row.p * 100)} % de probabilidad${fair}.`;
    } else if (game.goalLine) {
      totalsSentence = ` La línea de ${game.goalLine.line} ${unit.plural} ubica el Más en ${Math.round(game.goalLine.pOver * 100)} %.`;
    }

    const bttsRow = game.markets.find(
      (m) => m.market === "btts" && /^(yes|sí|si)$/i.test(m.selection || m.label),
    );
    const bttsClause = bttsRow
      ? ` El escenario de ambos equipos anotando alcanza ${Math.round(bttsRow.p * 100)} %.`
      : "";

    const countsParts: string[] = [];
    if (game.counts?.corners) {
      countsParts.push(`${game.counts.corners.total.toFixed(1)} córners`);
    }
    if (game.counts?.yellow) {
      countsParts.push(`${game.counts.yellow.total.toFixed(1)} tarjetas amarillas`);
    }
    const countsClause =
      countsParts.length > 0 ? ` En ritmo del juego se proyectan ${countsParts.join(" y ")}.` : "";

    items.push({
      key: "totales",
      title: isGoalSport ? "Goles y ritmo" : "Puntos",
      text: keepCortexUnits(
        `Se proyectan ${hVal} ${unit.plural} para ${game.home.shortName} y ${aVal} para ${game.away.shortName}, con un total esperado de ${tVal}.${totalsSentence}${bttsClause}${countsClause}`,
      ),
      stats: [
        {
          label: isGoalSport ? "Goles esperados" : "Puntos esperados",
          home: parseStrictFiniteNumber(hVal) ?? game.projection.home,
          away: parseStrictFiniteNumber(aVal) ?? game.projection.away,
        },
      ],
    });
  }

  // 3) Margen y hándicap / doble oportunidad
  const marginInfo = buildMarginText(game);
  const spreadRows = game.markets.filter(
    (m) =>
      m.market === "spreads" ||
      m.market === "spread" ||
      m.market === "handicap" ||
      /^(spread|puck line|hándicap)/i.test(m.group),
  );
  const doubleChanceRows = game.markets.filter((m) => m.market === "double_chance");
  const intervalFactor = game.factors.find((f) => /rango 90|intervalo 90/i.test(f.label));

  if (marginInfo.text || spreadRows.length > 0 || doubleChanceRows.length > 0) {
    const parts: string[] = [];
    if (marginInfo.absDiff !== null && marginInfo.favName) {
      parts.push(
        `El margen esperado apunta a ${marginInfo.favName} por ${marginInfo.absDiff.toFixed(decimals)} ${marginInfo.absDiff === 1 ? unit.singular : unit.plural}.`,
      );
    } else if (marginInfo.text) {
      parts.push("El margen esperado es prácticamente neutro entre ambos equipos.");
    }

    if (spreadRows.length > 0) {
      const sampleSpreads = spreadRows
        .filter((m) => m.selection === "home" || m.selection === "away" || m.p >= 0.45)
        .slice(0, 2);
      if (sampleSpreads.length > 0) {
        const desc = sampleSpreads
          .map((m) => `${formatSpreadLabel(m, game)} tiene ${Math.round(m.p * 100)} %`)
          .join(" y ");
        parts.push(`En líneas de ventaja, ${desc}.`);
      }
    } else if (doubleChanceRows.length > 0) {
      const desc = doubleChanceRows
        .slice(0, 2)
        .map((m) => `${m.label} (${Math.round(m.p * 100)} %)`)
        .join(" y ");
      parts.push(`En cobertura de marcador, las opciones de doble oportunidad registran ${desc}.`);
    }

    if (intervalFactor) {
      parts.push(`${intervalFactor.label}: ${intervalFactor.value}.`);
    }

    if (parts.length > 0) {
      items.push({
        key: "margen",
        title: hasDraw && spreadRows.length === 0 ? "Margen y cobertura" : "Margen y hándicap",
        text: keepCortexUnits(parts.join(" ")),
      });
    }
  }

  // 4) Plantel, bajas y forma reciente (strictly grounded in game.preGame.absences + factors)
  {
    const formHome = game.factors.find((f) => /forma local/i.test(f.label));
    const formAway = game.factors.find((f) => /forma visitante/i.test(f.label));
    const posHome = game.factors.find((f) => /posición local/i.test(f.label));
    const posAway = game.factors.find((f) => /posición visitante/i.test(f.label));
    const absences = game.preGame.absences;

    const parts: string[] = [];
    if (absences.length > 0) {
      const listed = absences.slice(0, 3).map((a) => {
        const localizedNote = localizeInjuryLabelEs(a.impactNote);
        const note = localizedNote ? `, ${localizedNote}` : "";
        return `${a.player} (${a.role} · ${a.status}${note})`;
      });
      parts.push(
        `Reporte de disponibilidad con ${absences.length} ${absences.length === 1 ? "novedad" : "novedades"}: ${listed.join("; ")}${absences.length > 3 ? ` y ${absences.length - 3} más` : ""}.`,
      );
    } else {
      parts.push("Sin bajas oficiales confirmadas cargadas en el corte previo de este encuentro.");
    }

    if (formHome && formAway) {
      parts.push(
        `Forma reciente: ${game.home.shortName} llega con ${formHome.value} y ${game.away.shortName} con ${formAway.value}.`,
      );
    }
    if (posHome && posAway) {
      parts.push(
        `Ubicación en tabla: ${game.home.shortName} (${posHome.value}) frente a ${game.away.shortName} (${posAway.value}).`,
      );
    }

    const hasInjuryKeywords = absences.some((a) => /\b(QB|POR|GK|PG|C)\b/i.test(a.role));
    const sectionTitle =
      absences.length > 0 && hasInjuryKeywords && game.sport === "american-football"
        ? "Titulares, bajas y forma"
        : absences.length > 0
          ? "Bajas, plantel y forma"
          : "Forma reciente y disponibilidad";

    items.push({
      key: "bajas",
      title: sectionTitle,
      text: keepCortexUnits(parts.join(" ")),
    });
  }

  // 5) A tener en cuenta
  {
    const watchParts: string[] = [];
    if (game.venue) {
      const elev =
        game.spacetime?.stadium.elevationM !== null &&
        game.spacetime?.stadium.elevationM !== undefined &&
        game.spacetime.stadium.elevationM >= 1000
          ? ` (a ${Math.round(game.spacetime.stadium.elevationM)} m de altitud)`
          : "";
      watchParts.push(
        `Se disputa en ${game.venue}${game.neutralSite ? " en sede neutral" : ""}${elev}.`,
      );
    }
    if (game.restDays?.home !== undefined && game.restDays?.away !== undefined) {
      const diffRest = Math.abs(game.restDays.home - game.restDays.away);
      const restEdge =
        diffRest >= 2
          ? `, ventaja de descanso para ${game.restDays.home > game.restDays.away ? game.home.shortName : game.away.shortName}`
          : "";
      watchParts.push(
        `Días de descanso: ${game.restDays.home} para ${game.home.shortName} y ${game.restDays.away} para ${game.away.shortName}${restEdge}.`,
      );
    }
    if (game.headToHead.length > 0) {
      const last = game.headToHead[0]!;
      watchParts.push(
        `Último antecedente directo (${last.date}): ${last.home} ${last.homeGoals}–${last.awayGoals} ${last.away}.`,
      );
    }
    const otFactor = game.factors.find((f) => /tiempo extra/i.test(f.label));
    if (otFactor) {
      watchParts.push(`${otFactor.label}: ${otFactor.value}${otFactor.sub ? ` (${otFactor.sub})` : ""}.`);
    }
    if (!game.spacetime?.market && game.status !== "FT") {
      watchParts.push(
        "Sin momios de casa capturados en ventana vigente; todas las cuotas mostradas son momios justos del modelo.",
      );
    }
    if (watchParts.length === 0) {
      watchParts.push(
        "Las alineaciones oficiales pueden ajustar el margen proyectado cuando se acerque el saque inicial.",
      );
    }

    items.push({
      key: "cambia",
      title: "A tener en cuenta",
      text: keepCortexUnits(watchParts.join(" ")),
      isWatch: true,
    });
  }

  return items;
}
