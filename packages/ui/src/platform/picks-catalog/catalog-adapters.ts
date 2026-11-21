import type { PlatformSport } from "@pitchlab/contracts";
import type {
  EvidenceWindowItem,
  EvidenceWindowPillKey,
  EvidenceWindowTone,
} from "../club/picks/EvidenceWindowPills";
import type { MatchPickMarketGroupKey } from "../match-evidence";
import type {
  EngineKey,
  MatchPick,
  PickCategory,
  PlatformGame,
  RiskBand,
} from "../types";
import type {
  CatalogCategoryKey,
  CatalogPickEvidence,
  CatalogPickItem,
  EvidenceWindowKey,
} from "./catalog-types";

export type LegacyScreenerMarketFilter =
  | "resultado"
  | "goles"
  | "ambos"
  | "handicap"
  | "conteos"
  | "props"
  | "nba"
  | "mlb"
  | "nhl"
  | "nfl";

function resolveEngineKey(engineName: string): EngineKey {
  const lower = engineName.toLowerCase();
  if (lower.includes("singularity")) return "singularity";
  if (lower.includes("minkowski")) return "minkowski";
  if (lower.includes("geodesic")) return "geodesic";
  if (lower.includes("cortex")) return "cortex";
  return "tachyon";
}

function resolvePickCategory(item: CatalogPickItem): PickCategory {
  if (item.isPrimaryModelPick) return "principal";
  if (item.pricing.hasPositiveValue) return "valor";
  if (item.category === "goles_totales") return "totales";
  if (item.pricing.p >= 0.7) return "conservador";
  return "tactico";
}

function resolveRiskBand(p: number): RiskBand {
  if (p >= 0.7) return "conservador";
  if (p >= 0.55) return "medio";
  return "arriesgado";
}

function resolveRationale(item: CatalogPickItem): string {
  if (item.isRedacted) return "";
  const firstBullet = item.evidence.bullets[0]?.label?.trim();
  if (firstBullet) return firstBullet;
  const xgSummary = item.evidence.xgSignal?.summary?.trim();
  if (xgSummary) return xgSummary;
  return `${item.familyLabel} · probabilidad calibrada ${(item.pricing.p * 100).toFixed(1)} %.`;
}

export function catalogPickItemToMatchPick(
  item: CatalogPickItem,
  game?: PlatformGame | null,
  slotIndex = 0,
): MatchPick {
  if (item.isRedacted) {
    return {
      id: item.id,
      gameId: item.gameId,
      league: item.league,
      leagueLabel: item.leagueLabel,
      matchLabel: item.matchLabel,
      kickoffLocal: item.kickoffLocal,
      gameStatus: item.gameStatus,
      slotIndex,
      category: "tactico",
      categoryLabel: item.familyLabel,
      risk: "medio",
      engineKey: "singularity",
      engineName: item.engineName,
      marketGroup: "locked",
      selectionKey: "locked",
      market: item.family,
      line: null,
      conflictGroup: "independent",
      label: item.label,
      rationale: "",
      p: 0,
      fairDecimal: 0,
      fairAmerican: 0,
      marketDecimal: null,
      marketAmerican: null,
      marketBookLabel: null,
      marketCapturedAtUtc: null,
      edgePts: null,
      confidenceScore: null,
      suggestedUnits: 0,
      result: null,
      isDailyOpenPromo: false,
      isTipsterWeeklyOpen: false,
      isRedacted: true,
    };
  }

  const result: MatchPick["result"] =
    item.settlement === "hit" ? "hit" : item.settlement === "miss" ? "miss" : null;

  return {
    id: item.id,
    gameId: item.gameId,
    league: item.league,
    leagueLabel: item.leagueLabel,
    matchLabel: item.matchLabel,
    kickoffLocal: item.kickoffLocal,
    gameStatus: item.gameStatus,
    slotIndex,
    category: resolvePickCategory(item),
    categoryLabel: item.familyLabel,
    risk: resolveRiskBand(item.pricing.p),
    engineKey: resolveEngineKey(item.engineName),
    engineName: item.engineName,
    marketGroup: item.familyLabel,
    selectionKey: item.selectionKey,
    market: item.family,
    ...(item.line !== null ? { line: item.line } : {}),
    conflictGroup: item.conflictGroup,
    label: item.label,
    rationale: resolveRationale(item),
    p: item.pricing.p,
    fairDecimal: item.pricing.fairOdds,
    fairAmerican: item.pricing.fairAmerican,
    marketDecimal: item.pricing.marketDecimal,
    marketAmerican: item.pricing.marketAmerican,
    marketBookLabel: item.pricing.marketBookLabel,
    marketCapturedAtUtc: item.pricing.marketCapturedAtUtc,
    ...(item.bookQuotes && item.bookQuotes.length > 0 ? { bookQuotes: item.bookQuotes } : {}),
    edgePts: item.pricing.edgePts,
    confidenceScore: game?.confidenceScore ?? null,
    suggestedUnits: item.pricing.hasPositiveValue ? 1.5 : 1.0,
    result,
    ...(item.isDailyOpenPromo ? { isDailyOpenPromo: true } : {}),
    ...(item.isTipsterWeeklyOpen ? { isTipsterWeeklyOpen: true } : {}),
    isRedacted: false,
  };
}

function mapWindowKey(windowKey: EvidenceWindowKey): EvidenceWindowPillKey {
  if (windowKey === "L5") return "l5";
  if (windowKey === "L10") return "l10";
  if (windowKey === "L20") return "l20";
  if (windowKey === "home_away") return "home_away";
  return "h2h";
}

function shortWindowLabel(windowKey: EvidenceWindowKey, rawLabel: string): string {
  if (windowKey === "L5" || windowKey === "L10" || windowKey === "L20") {
    return windowKey;
  }
  if (windowKey === "h2h") {
    return "H2H";
  }
  const lower = rawLabel.toLowerCase();
  if (lower.includes("visita")) return "Visita";
  if (lower.includes("local")) return "Local";
  return "Sede";
}

export function catalogEvidenceToWindowItems(
  evidence: CatalogPickEvidence,
  sport?: PlatformSport,
): EvidenceWindowItem[] {
  const items: EvidenceWindowItem[] = [];

  for (const stat of evidence.windows) {
    const effectiveSample = Math.max(1, stat.sample - stat.pushes);
    const detail = stat.label.includes("(")
      ? stat.label
      : `${stat.label} (${stat.hits}/${effectiveSample})`;
    items.push({
      key: mapWindowKey(stat.window),
      label: shortWindowLabel(stat.window, stat.label),
      value: `${stat.ratePct} %`,
      ratePct: stat.ratePct,
      tone: stat.tone,
      detail,
    });
  }

  if (evidence.xgSignal) {
    const isFootball = sport === undefined || sport === "football";
    items.push({
      key: "xg",
      label: isFootball ? "xG" : "Proy.",
      value: isFootball
        ? evidence.xgSignal.totalXg.toFixed(2)
        : evidence.xgSignal.totalXg.toFixed(1),
      tone: "info",
      detail: evidence.xgSignal.summary,
    });
  }

  if (evidence.refereeSignal) {
    const mult = evidence.refereeSignal.cardsMultiplier;
    const tone: EvidenceWindowTone =
      mult >= 1.12 ? "high" : mult <= 0.88 ? "low" : "neutral";
    items.push({
      key: "ref",
      label: "Árb.",
      value: `×${mult.toFixed(2)}`,
      tone,
      detail: evidence.refereeSignal.summary,
    });
  }

  return items;
}

export function catalogCategoryToLegacyFilter(
  category: CatalogCategoryKey,
  sport?: PlatformSport,
): LegacyScreenerMarketFilter {
  if (category === "player_props") return "props";
  if (category === "conteos_arbitro") return "conteos";
  if (category === "ambos_porteria") return "ambos";
  if (category === "handicap_combos") return "handicap";
  if (category === "goles_totales") return "goles";
  if (sport === "basketball") return "nba";
  if (sport === "baseball") return "mlb";
  if (sport === "ice-hockey") return "nhl";
  if (sport === "american-football") return "nfl";
  return "resultado";
}

export function catalogCategoryToEvidenceGroup(
  category: CatalogCategoryKey,
): MatchPickMarketGroupKey {
  if (category === "resultado") return "resultado";
  if (category === "goles_totales") return "goles";
  if (category === "ambos_porteria") return "ambos";
  if (category === "conteos_arbitro") return "conteos";
  return "otros";
}
