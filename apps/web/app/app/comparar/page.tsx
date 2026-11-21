import "../../atomic-kit.css";
import "../../momios-compare.css";
import type { Metadata } from "next";
import { asLeagueId } from "@pitchlab/contracts";
import {
  CompareHubView,
  type CompareAttackDefensePayload,
  type CompareMode,
  type TeamComparisonPayload,
} from "@pitchlab/ui/compare";
import {
  buildCompareLeagueCatalog,
  listComparePlayersForLeague,
  loadPlayerComparison,
  loadTeamComparison,
} from "../../../src/server/compare";
import {
  getTeamAttackDefenseComparison,
  type TeamAttackDefenseBlock,
} from "../../../src/server/standings-brackets";
import { getViewerAccess } from "../../../src/server/viewer-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Comparador H2H | PitchLab",
  description:
    "Compara equipos cara a cara con rangos de ataque y defensa, historial directo real o estadísticas de jugadores por temporada.",
};

function toCompareAttackDefensePayload(
  block: TeamAttackDefenseBlock | null,
  canonicalSlugA?: string,
  canonicalSlugB?: string,
): CompareAttackDefensePayload | null {
  if (!block || !block.teamB) return null;
  return {
    league: asLeagueId(block.league),
    leagueLabel: block.leagueLabel,
    leagueSize: block.leagueSize,
    teamASlug: canonicalSlugA || block.teamA.teamSlug,
    teamBSlug: canonicalSlugB || block.teamB.teamSlug,
    teamAAttackRank: block.teamA.attackRank,
    teamADefenseRank: block.teamA.defenseRank,
    teamAOverallRank: block.teamA.overallRank,
    teamBAttackRank: block.teamB.attackRank,
    teamBDefenseRank: block.teamB.defenseRank,
    teamBOverallRank: block.teamB.overallRank,
    attackMetrics: block.attackMetrics.map((m) => ({
      key: m.key,
      category: m.category,
      label: m.label,
      valueA: m.valueA,
      valueB: m.valueB,
      leagueAverage: m.leagueAverage,
      rankA: m.rankA,
      rankB: m.rankB,
      leagueSize: m.leagueSize,
      lowerIsBetter: m.lowerIsBetter,
      digits: m.digits,
      pct: m.pct,
    })),
    defenseMetrics: block.defenseMetrics.map((m) => ({
      key: m.key,
      category: m.category,
      label: m.label,
      valueA: m.valueA,
      valueB: m.valueB,
      leagueAverage: m.leagueAverage,
      rankA: m.rankA,
      rankB: m.rankB,
      leagueSize: m.leagueSize,
      lowerIsBetter: m.lowerIsBetter,
      digits: m.digits,
      pct: m.pct,
    })),
  };
}

function enrichTeamComparisonRanks(
  comparison: TeamComparisonPayload | null,
  attackDefense: CompareAttackDefensePayload | null,
): TeamComparisonPayload | null {
  if (!comparison || !attackDefense) return comparison;
  const byKey = new Map(
    [...attackDefense.attackMetrics, ...attackDefense.defenseMetrics].map((m) => [m.key, m]),
  );
  return {
    ...comparison,
    metrics: comparison.metrics.map((row) => {
      const lookupKey =
        row.id === "for-avg"
          ? "goals_for_pg"
          : row.id === "against-avg"
            ? "goals_against_pg"
            : row.id === "clean-sheets"
              ? "clean_sheets"
              : null;
      const matched = lookupKey ? byKey.get(lookupKey) : undefined;
      if (!matched) return row;
      return {
        ...row,
        rankA: row.rankA ?? matched.rankA,
        rankB: row.rankB ?? matched.rankB,
      };
    }),
  };
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pickParam = (k: string): string => {
    const v = sp[k];
    return typeof v === "string" ? v.trim() : Array.isArray(v) ? (v[0] ?? "").trim() : "";
  };

  const mode: CompareMode = pickParam("modo") === "jugadores" ? "jugadores" : "equipos";
  const catalog = buildCompareLeagueCatalog();
  const requestedLeague = pickParam("liga").toLowerCase();
  const activeEntry =
    catalog.find((c) => c.league === requestedLeague) ??
    catalog.find((c) => c.league === "liga-mx") ??
    catalog[0];

  const activeLeague = activeEntry?.league ?? asLeagueId("liga-mx");
  const access = await getViewerAccess();
  const opts = { fullAccess: access.fullAccess };

  const reqA = pickParam("a");
  const reqB = pickParam("b");

  const defaultTeamA = activeEntry?.teams[0]?.slug ?? "";
  const defaultTeamB = activeEntry?.teams[1]?.slug ?? "";
  const teamA = mode === "equipos" && reqA ? reqA : defaultTeamA;
  const teamB =
    mode === "equipos" && reqB && reqB !== teamA
      ? reqB
      : (activeEntry?.teams.find((t) => t.slug !== teamA)?.slug ?? defaultTeamB);

  const rawTeamComparison =
    teamA && teamB ? loadTeamComparison(activeLeague, teamA, teamB, opts) : null;

  const initialAttackDefense =
    rawTeamComparison && teamA && teamB && teamA !== teamB
      ? toCompareAttackDefensePayload(
          getTeamAttackDefenseComparison(
            activeLeague,
            rawTeamComparison.teamA.slug,
            rawTeamComparison.teamB.slug,
          ),
          rawTeamComparison.teamA.slug,
          rawTeamComparison.teamB.slug,
        )
      : null;

  const initialTeamComparison = enrichTeamComparisonRanks(
    rawTeamComparison,
    initialAttackDefense,
  );

  const initialPlayerOptions = listComparePlayersForLeague(activeLeague);
  const playerA =
    mode === "jugadores" && reqA ? reqA : (initialPlayerOptions[0]?.ref ?? "");
  const playerB =
    mode === "jugadores" && reqB && reqB !== playerA
      ? reqB
      : (initialPlayerOptions.find((p) => p.ref !== playerA)?.ref ?? "");

  const initialPlayerComparison =
    mode === "jugadores" && playerA && playerB
      ? await loadPlayerComparison(activeLeague, playerA, playerB, opts)
      : null;

  return (
    <CompareHubView
      initialMode={mode}
      initialLeague={activeLeague}
      catalog={catalog}
      initialTeamComparison={initialTeamComparison}
      initialPlayerOptions={initialPlayerOptions}
      initialPlayerComparison={initialPlayerComparison}
      initialAttackDefense={initialAttackDefense}
    />
  );
}
