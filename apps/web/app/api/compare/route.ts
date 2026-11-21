import { NextResponse } from "next/server";
import { asLeagueId } from "@pitchlab/contracts";
import type {
  CompareAttackDefensePayload,
  TeamComparisonPayload,
} from "@pitchlab/ui/compare";
import { withSessionRead } from "../../../src/server/api-guards";
import {
  listComparePlayersForLeague,
  loadPlayerComparison,
  loadTeamComparison,
} from "../../../src/server/compare";
import { PRODUCT_LEAGUES, type ProductLeague } from "../../../src/server/snapshots";
import {
  getTeamAttackDefenseComparison,
  type TeamAttackDefenseBlock,
} from "../../../src/server/standings-brackets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isProductLeague(value: string): value is ProductLeague {
  return (PRODUCT_LEAGUES as readonly string[]).includes(value);
}

function toCompareAttackDefensePayload(
  block: TeamAttackDefenseBlock | null,
  canonicalSlugA: string,
  canonicalSlugB: string,
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

export const GET = withSessionRead(
  {
    bucket: "compare",
    allowBetaPin: true,
    watermark: true,
    resourceKey: ({ request }) => new URL(request.url).search,
    cacheControl: "private, no-store",
  },
  async ({ request, access }) => {
    const url = new URL(request.url);
    const mode = url.searchParams.get("modo") === "jugadores" ? "jugadores" : "equipos";
    const league = (url.searchParams.get("liga") ?? "liga-mx").trim().toLowerCase();
    if (!isProductLeague(league)) {
      return NextResponse.json({ error: "Liga no válida" }, { status: 400 });
    }
    const a = (url.searchParams.get("a") ?? "").trim();
    const b = (url.searchParams.get("b") ?? "").trim();

    const opts = { fullAccess: access.fullAccess };

    if (mode === "jugadores") {
      const playerOptions = listComparePlayersForLeague(league);
      const refA = a || playerOptions[0]?.ref || "";
      const refB =
        b && b !== refA
          ? b
          : (playerOptions.find((p) => p.ref !== refA)?.ref ?? "");
      const playerComparison =
        refA && refB ? await loadPlayerComparison(league, refA, refB, opts) : null;
      return NextResponse.json({ playerOptions, playerComparison });
    }

    const rawTeamComparison = a && b ? loadTeamComparison(league, a, b, opts) : null;
    const attackDefense =
      rawTeamComparison && a !== b
        ? toCompareAttackDefensePayload(
            getTeamAttackDefenseComparison(
              league,
              rawTeamComparison.teamA.slug,
              rawTeamComparison.teamB.slug,
            ),
            rawTeamComparison.teamA.slug,
            rawTeamComparison.teamB.slug,
          )
        : null;
    const teamComparison = enrichTeamComparisonRanks(rawTeamComparison, attackDefense);
    return NextResponse.json({ teamComparison, attackDefense });
  },
);
