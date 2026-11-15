import React from "react";
import { notFound } from "next/navigation";
import { asLeagueId } from "@pitchlab/contracts";
import { PlatformGamesSupplement } from "@pitchlab/ui/games-supplement";
import { MatchStudioClubView } from "@pitchlab/ui/match-studio";
import { normalizeMatchTab } from "@pitchlab/ui/match-tab";
import { loadGameDetail, loadGameSummary } from "../../../../../src/server/platform-data";
import {
  loadCortexWriteup,
  loadLeagueSnapshotEnvelope,
  PRODUCT_LEAGUES,
  type ProductLeague,
} from "../../../../../src/server/snapshots";
import { getViewerAccess } from "../../../../../src/server/viewer-access";

function isProductLeague(val: string): val is ProductLeague {
  return (PRODUCT_LEAGUES as readonly string[]).includes(val);
}

export default async function ClubMatchStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string; gameId: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
}): Promise<React.JSX.Element> {
  const [{ league, gameId }, resolvedSearch] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ tab?: string | string[] }>({}),
  ]);
  const initialTab = normalizeMatchTab(resolvedSearch.tab);
  if (!isProductLeague(league)) {
    notFound();
  }

  const envelope = loadLeagueSnapshotEnvelope(league);
  const exists = envelope.data?.games.some((g) => g.id === gameId) ?? false;
  if (!exists) {
    notFound();
  }

  // Cortex IA: el corte lo redacta una vez por partido y viaja en el snapshot; aquí no se llama
  // al modelo. Solo socios con acceso completo (la inteligencia previa es de Pase PitchLab Ultra).
  const writeup = loadCortexWriteup(league, gameId);
  const showCortex = writeup ? (await getViewerAccess()).fullAccess : false;
  const cortexSections = showCortex ? writeup!.sections : null;
  const cortexHeadline = showCortex ? writeup!.headline : null;

  // El layout solo trae partidos por jugar: si este ya terminó, se agrega aquí.
  const [detail, summary] = await Promise.all([loadGameDetail(gameId), loadGameSummary(gameId)]);

  return (
    <PlatformGamesSupplement games={summary ? [summary] : []}>
      <MatchStudioClubView
        leagueId={asLeagueId(league)}
        gameId={gameId}
        cortexSections={cortexSections}
        cortexHeadline={cortexHeadline}
        detail={detail}
        initialTab={initialTab}
      />
    </PlatformGamesSupplement>
  );
}
