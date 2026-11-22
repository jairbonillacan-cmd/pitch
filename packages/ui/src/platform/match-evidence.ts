/**
 * Motor puro de Evidencia Histórica y Agrupación de Picks por Mercado (ADR-054).
 * Calcula tasas reales verificables (`X/5`, `X/N H2H`, ritmo proyectado, árbitro y conteos reales)
 * estrictamente a partir de datos presentes en el partido — cero números inventados.
 */
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import type {
  MatchIntelligenceV5View,
  MatchPick,
  PlatformGame,
  PlatformMarketRow,
} from "./types";

type HeadToHeadView = PlatformGame["headToHead"][number];

export type MatchPickMarketGroupKey =
  | "resultado"
  | "goles"
  | "ambos"
  | "conteos"
  | "otros";

export const MATCH_PICK_GROUP_LABELS: Readonly<Record<MatchPickMarketGroupKey, string>> = {
  resultado: "Resultado del partido",
  goles: "Goles y totales",
  ambos: "Ambos anotan y portería",
  conteos: "Córners, faltas y tarjetas",
  otros: "Hándicaps y especiales",
};

export const MATCH_PICK_GROUP_ORDER: readonly MatchPickMarketGroupKey[] = [
  "resultado",
  "goles",
  "ambos",
  "conteos",
  "otros",
];

export type EvidenceTone = "high" | "mid" | "low" | "neutral";

export interface PickEvidenceBullet {
  readonly label: string;
  readonly ratePct: number | null;
  readonly tone: EvidenceTone;
}

export interface EnrichedMatchPick {
  readonly id: string;
  readonly pick: MatchPick;
  readonly groupKey: MatchPickMarketGroupKey;
  readonly groupLabel: string;
  readonly isPrimaryModelPick: boolean;
  readonly evidence: readonly PickEvidenceBullet[];
  readonly evidenceAvgPct: number | null;
  readonly houseDecimal: number | null;
  readonly houseBookLabel: string | null;
  /** Valor esperado implícito frente a la cuota de casa: `(p * cuotaCasa - 1) * 100`. */
  readonly valuePct: number | null;
  /** Ventaja en puntos de probabilidad frente a la casa: `(p - 1 / cuotaCasa) * 100`. */
  readonly edgePts: number | null;
}

function toneForRate(pct: number): EvidenceTone {
  if (pct >= 70) return "high";
  if (pct >= 45) return "mid";
  return "low";
}

function parseFormLetters(raw: string | undefined): Array<"G" | "E" | "P"> {
  if (!raw) return [];
  const head = raw.split("·")[0] ?? raw;
  return head
    .toUpperCase()
    .replace(/[^GEPWLD]/g, "")
    .split("")
    .slice(0, 5)
    .map((ch) => (ch === "W" || ch === "G" ? "G" : ch === "D" || ch === "E" ? "E" : "P"));
}

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function classifyPickGroup(pick: Pick<MatchPick, "market" | "marketGroup" | "label">): MatchPickMarketGroupKey {
  const hay = norm(`${pick.market ?? ""} ${pick.marketGroup} ${pick.label}`);
  if (
    hay.includes("corner") ||
    hay.includes("tarjeta") ||
    hay.includes("amarilla") ||
    hay.includes("falta") ||
    hay.includes("foul") ||
    hay.includes("yellow") ||
    hay.includes("tiros")
  ) {
    return "conteos";
  }
  if (hay.includes("ambos") || hay.includes("btts") || hay.includes("porteria a cero") || hay.includes("clean_sheet")) {
    return "ambos";
  }
  if (
    hay.includes("handicap") ||
    hay.includes("spread") ||
    hay.includes("puck") ||
    hay.includes("marcador exacto") ||
    hay.includes("exact_score")
  ) {
    return "otros";
  }
  if (
    hay.includes("total") ||
    hay.includes("goles") ||
    hay.includes("puntos") ||
    hay.includes("mas de") ||
    hay.includes("menos de") ||
    hay.includes("over_") ||
    hay.includes("under_")
  ) {
    return "goles";
  }
  return "resultado";
}

function extractLineNumber(pick: Pick<MatchPick, "line" | "label" | "selectionKey">): number | null {
  if (typeof pick.line === "number" && Number.isFinite(pick.line)) return pick.line;
  const m = /(\d+(?:\.\d+)?)/.exec(`${pick.label} ${pick.selectionKey}`);
  if (!m) return null;
  return parseStrictFiniteNumber(m[1]);
}

function evaluateH2hForPick(
  h2h: readonly HeadToHeadView[],
  pick: MatchPick,
  game: PlatformGame,
): PickEvidenceBullet | null {
  if (h2h.length === 0) return null;
  const recent = h2h.slice(0, 5);
  const label = norm(pick.label);
  const sel = norm(pick.selectionKey);
  const homeNorm = norm(game.home.shortName || game.home.name);
  const awayNorm = norm(game.away.shortName || game.away.name);

  let hits = 0;
  let evaluated = 0;

  for (const row of recent) {
    const total = row.homeGoals + row.awayGoals;
    const hName = norm(row.home);
    const homeWon = row.homeGoals > row.awayGoals;
    const awayWon = row.awayGoals > row.homeGoals;
    const drew = row.homeGoals === row.awayGoals;
    const currentHomeWasRowHome = hName.includes(homeNorm) || homeNorm.includes(hName);

    const group = classifyPickGroup(pick);
    if (group === "goles") {
      const line = extractLineNumber(pick);
      if (line === null) continue;
      evaluated += 1;
      const isOver = label.includes("mas de") || sel.includes("over");
      const isUnder = label.includes("menos de") || sel.includes("under");
      if ((isOver && total > line) || (isUnder && total < line)) hits += 1;
    } else if (group === "ambos") {
      evaluated += 1;
      const bothScored = row.homeGoals > 0 && row.awayGoals > 0;
      const isNo = /\bno\b/.test(label) || /\bno\b/.test(sel);
      if (isNo ? !bothScored : bothScored) hits += 1;
    } else if (group === "resultado") {
      const targetHome = sel.includes("home") || label.includes(homeNorm);
      const targetAway = sel.includes("away") || label.includes(awayNorm);
      const isDoubleChance = label.includes("o empate") || sel.includes("1x") || sel.includes("x2");
      const isDrawOnly = (sel === "draw" || label === "empate") && !isDoubleChance;

      if (isDrawOnly) {
        evaluated += 1;
        if (drew) hits += 1;
      } else if (targetHome && !targetAway) {
        evaluated += 1;
        const currHomeWon = currentHomeWasRowHome ? homeWon : awayWon;
        if (isDoubleChance ? currHomeWon || drew : currHomeWon) hits += 1;
      } else if (targetAway && !targetHome) {
        evaluated += 1;
        const currAwayWon = currentHomeWasRowHome ? awayWon : homeWon;
        if (isDoubleChance ? currAwayWon || drew : currAwayWon) hits += 1;
      }
    }
  }

  if (evaluated < 2) return null;
  const pct = Math.round((hits / evaluated) * 100);
  return {
    label: `${hits}/${evaluated} · últimos enfrentamientos H2H`,
    ratePct: pct,
    tone: toneForRate(pct),
  };
}

function evaluateFormForPick(
  game: PlatformGame,
  pick: MatchPick,
): PickEvidenceBullet | null {
  const group = classifyPickGroup(pick);
  if (group !== "resultado") return null;

  const homeFactor = game.factors.find((f) => /local/i.test(f.label));
  const awayFactor = game.factors.find((f) => /visit/i.test(f.label));
  const homeForm = parseFormLetters(homeFactor?.value);
  const awayForm = parseFormLetters(awayFactor?.value);

  const label = norm(pick.label);
  const sel = norm(pick.selectionKey);
  const homeNorm = norm(game.home.shortName || game.home.name);
  const awayNorm = norm(game.away.shortName || game.away.name);
  const isDoubleChance = label.includes("o empate") || sel.includes("1x") || sel.includes("x2");

  const picksHome = (sel.includes("home") || label.includes(homeNorm)) && !label.includes(awayNorm);
  const picksAway = (sel.includes("away") || label.includes(awayNorm)) && !label.includes(homeNorm);

  if (picksHome && homeForm.length >= 3) {
    const hits = homeForm.filter((r) => (isDoubleChance ? r === "G" || r === "E" : r === "G")).length;
    const pct = Math.round((hits / homeForm.length) * 100);
    return {
      label: `${hits}/${homeForm.length} · racha reciente de ${game.home.shortName}`,
      ratePct: pct,
      tone: toneForRate(pct),
    };
  }
  if (picksAway && awayForm.length >= 3) {
    const hits = awayForm.filter((r) => (isDoubleChance ? r === "G" || r === "E" : r === "G")).length;
    const pct = Math.round((hits / awayForm.length) * 100);
    return {
      label: `${hits}/${awayForm.length} · racha reciente de ${game.away.shortName}`,
      ratePct: pct,
      tone: toneForRate(pct),
    };
  }
  return null;
}

function evaluateModelContextBullets(
  game: PlatformGame,
  pick: MatchPick,
  v5?: MatchIntelligenceV5View | null,
): PickEvidenceBullet[] {
  const bullets: PickEvidenceBullet[] = [];
  const group = classifyPickGroup(pick);

  if (group === "goles" && game.projection) {
    const line = extractLineNumber(pick);
    bullets.push({
      label:
        line !== null
          ? `Proyección ${game.projection.total.toFixed(2)} vs línea ${line}`
          : `Total esperado: ${game.projection.total.toFixed(2)}`,
      ratePct: null,
      tone: "neutral",
    });
  }

  if (group === "conteos") {
    const hay = norm(`${pick.market ?? ""} ${pick.label}`);
    if (hay.includes("corner") && game.counts?.corners) {
      const c = game.counts.corners;
      bullets.push({
        label: `Media proyectada ${c.total.toFixed(1)} córners (${c.home.toFixed(1)} + ${c.away.toFixed(1)})`,
        ratePct: null,
        tone: "neutral",
      });
    } else if ((hay.includes("amarilla") || hay.includes("tarjeta") || hay.includes("yellow")) && (v5?.microCounts?.refereeProfile || game.counts?.yellow)) {
      const ref = v5?.microCounts?.refereeProfile;
      if (ref) {
        bullets.push({
          label: `Árbitro ${ref.name} · ×${ref.cardsMultiplier.toFixed(2)} tarjetas (${ref.games} PJ)`,
          ratePct: null,
          tone: "neutral",
        });
      } else if (game.counts?.yellow) {
        bullets.push({
          label: `Proyección ${game.counts.yellow.total.toFixed(1)} amarillas en el encuentro`,
          ratePct: null,
          tone: "neutral",
        });
      }
    } else if ((hay.includes("falta") || hay.includes("foul")) && game.counts?.fouls) {
      bullets.push({
        label: `Proyección ${game.counts.fouls.total.toFixed(1)} faltas combinadas`,
        ratePct: null,
        tone: "neutral",
      });
    }
  }

  if (bullets.length === 0 && pick.rationale) {
    bullets.push({
      label: pick.rationale.length > 88 ? `${pick.rationale.slice(0, 85)}…` : pick.rationale,
      ratePct: null,
      tone: "neutral",
    });
  }

  return bullets;
}

function marketRowToPick(game: PlatformGame, row: PlatformMarketRow, idx: number): MatchPick {
  const isOver = row.selection.includes("over") || norm(row.label).includes("mas de");
  const isUnder = row.selection.includes("under") || norm(row.label).includes("menos de");
  return {
    id: `${game.id}__ev__${row.market ?? "mkt"}__${row.selection}__${row.line ?? idx}`,
    gameId: game.id,
    league: game.league,
    leagueLabel: game.leagueLabel,
    matchLabel: `${game.home.shortName} vs ${game.away.shortName}`,
    kickoffLocal: game.kickoffLocal,
    gameStatus: game.status,
    slotIndex: idx + 10,
    category: "tactico",
    categoryLabel: row.group,
    risk: row.p >= 0.68 ? "conservador" : row.p >= 0.54 ? "medio" : "arriesgado",
    engineKey: "geodesic",
    engineName: "Motor Spacetime",
    marketGroup: row.group,
    selectionKey: row.selection,
    market: row.market,
    ...(typeof row.line === "number" ? { line: row.line } : {}),
    conflictGroup: isOver ? "over_total" : isUnder ? "under_total" : "independent",
    label: row.label,
    rationale: `${row.group} · probabilidad calibrada ${(row.p * 100).toFixed(1)} %.`,
    p: row.p,
    fairDecimal: row.fairDecimal,
    fairAmerican: row.fairAmerican,
    marketDecimal: row.currentDecimal,
    marketAmerican: null,
    marketBookLabel: row.quoteBookLabel ?? null,
    marketCapturedAtUtc: row.quoteCapturedAtUtc ?? null,
    bookQuotes: row.bookQuotes,
    edgePts: row.edgePts,
    confidenceScore: game.confidenceScore,
    suggestedUnits: 1.0,
  };
}

/**
 * Combina los picks principales del partido con los mejores mercados adicionales (p >= 45 %),
 * deduplica por etiqueta y adjunta evidencia real verificable + cálculo de valor vs casa.
 */
export function buildEnrichedMatchPicks(
  game: PlatformGame,
  markets: readonly PlatformMarketRow[],
  v5?: MatchIntelligenceV5View | null,
): EnrichedMatchPick[] {
  const seenLabels = new Set<string>();
  const combined: Array<{ pick: MatchPick; primary: boolean }> = [];

  for (const pk of game.picks) {
    const key = pk.isRedacted ? pk.id : norm(pk.label);
    if (seenLabels.has(key)) continue;
    seenLabels.add(key);
    combined.push({ pick: pk, primary: true });
  }

  // Añadir mercados adicionales con probabilidad accionable (>= 44 %) o con valor positivo real
  const extraMarkets = markets
    .filter((m) => m.p >= 0.44 || (m.edgePts !== null && m.edgePts > 0))
    .slice()
    .sort((a, b) => (b.edgePts ?? -99) - (a.edgePts ?? -99) || b.p - a.p);

  for (let i = 0; i < extraMarkets.length && combined.length < 18; i += 1) {
    const row = extraMarkets[i]!;
    const key = norm(row.label);
    if (seenLabels.has(key)) continue;
    seenLabels.add(key);
    combined.push({ pick: marketRowToPick(game, row, i), primary: false });
  }

  return combined.map(({ pick, primary }) => {
    const groupKey = classifyPickGroup(pick);
    const evidence: PickEvidenceBullet[] = [];
    const formBullet = evaluateFormForPick(game, pick);
    if (formBullet) evidence.push(formBullet);
    const h2hBullet = evaluateH2hForPick(game.headToHead, pick, game);
    if (h2hBullet) evidence.push(h2hBullet);
    for (const ctx of evaluateModelContextBullets(game, pick, v5)) {
      if (evidence.length < 3) evidence.push(ctx);
    }

    const numericRates = evidence
      .map((e) => e.ratePct)
      .filter((r): r is number => r !== null && Number.isFinite(r));
    const evidenceAvgPct =
      numericRates.length > 0
        ? Math.round(numericRates.reduce((s, n) => s + n, 0) / numericRates.length)
        : null;

    const houseDecimal =
      pick.marketDecimal !== null && pick.marketDecimal > 1 ? pick.marketDecimal : null;
    const valuePct =
      houseDecimal !== null
        ? Math.round((pick.p * houseDecimal - 1) * 1000) / 10
        : null;
    const edgePts =
      houseDecimal !== null
        ? Math.round((pick.p - 1 / houseDecimal) * 1000) / 10
        : pick.edgePts;

    return {
      id: pick.id,
      pick,
      groupKey,
      groupLabel: MATCH_PICK_GROUP_LABELS[groupKey],
      isPrimaryModelPick: primary,
      evidence,
      evidenceAvgPct,
      houseDecimal,
      houseBookLabel: pick.marketBookLabel ?? null,
      valuePct,
      edgePts,
    };
  });
}
