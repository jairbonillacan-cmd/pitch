import React from "react";
import { notFound } from "next/navigation";
import { asLeagueId } from "@pitchlab/contracts";
import { PlatformGamesSupplement } from "@pitchlab/ui/games-supplement";
import { MatchStudioClubView } from "@pitchlab/ui/match-studio";
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
}: {
  params: Promise<{ league: string; gameId: string }>;
}): Promise<React.JSX.Element> {
  const { league, gameId } = await params;
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
  const cortexSections = writeup && (await getViewerAccess()).fullAccess ? writeup.sections : null;

  // El layout solo trae partidos por jugar: si este ya terminó, se agrega aquí.
  const [detail, summary] = await Promise.all([loadGameDetail(gameId), loadGameSummary(gameId)]);

  return (
    <PlatformGamesSupplement games={summary ? [summary] : []}>
      <MatchStudioClubView
        leagueId={asLeagueId(league)}
        gameId={gameId}
        cortexSections={cortexSections}
        detail={detail}
      />
    </PlatformGamesSupplement>
  );
}
