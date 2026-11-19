import type { Metadata } from "next";
import { CompareHubView, type CompareMode } from "@pitchlab/ui/compare";
import {
  buildCompareLeagueCatalog,
  listComparePlayersForLeague,
  loadPlayerComparison,
  loadTeamComparison,
} from "../../../src/server/compare";
import { getViewerAccess } from "../../../src/server/viewer-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Comparador H2H | PitchLab",
  description:
    "Compara equipos cara a cara con historial directo real o contrasta estadísticas de jugadores por temporada.",
};

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

  const activeLeague = activeEntry?.league ?? ("liga-mx" as const);
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

  const initialTeamComparison =
    teamA && teamB ? loadTeamComparison(activeLeague, teamA, teamB, opts) : null;

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
    />
  );
}
