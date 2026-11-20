import "../../../../live.css";
import "../../../../pre-match.css";
import "../../../../sport-outlook.css";
import "../../../../picks-screener.css";
import "../../../../atomic-sofascore.css";
import React from "react";
import { notFound } from "next/navigation";
import { asLeagueId, resolveGameBySlugOrId } from "@pitchlab/contracts";
import { PlatformGamesSupplement } from "@pitchlab/ui/games-supplement";
import { MatchStudioClubView } from "@pitchlab/ui/match-studio";
import { normalizeMatchTab } from "@pitchlab/ui/match-tab";
import {
  loadGameDetail,
  loadGameSummary,
  loadLeagueStandings,
} from "../../../../../src/server/platform-data";
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

/** Ruta canónica corta de partido: `/app/<league>/g/<home>-vs-<away>-<hash6>` (ADR-042). */
export default async function CanonicalMatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string; gameSlug: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
}): Promise<React.JSX.Element> {
  const [{ league, gameSlug }, resolvedSearch] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ tab?: string | string[] }>({}),
  ]);
  const initialTab = normalizeMatchTab(resolvedSearch.tab);
  if (!isProductLeague(league)) {
    notFound();
  }

  const envelope = loadLeagueSnapshotEnvelope(league);
  const resolvedGame = envelope.data ? resolveGameBySlugOrId(envelope.data.games, gameSlug) : null;
  if (!resolvedGame) {
    notFound();
  }

  const gameId = resolvedGame.id;
  const writeup = loadCortexWriteup(league, gameId);
  const showCortex = writeup ? (await getViewerAccess()).fullAccess : false;
  const cortexSections = showCortex ? writeup!.sections : null;
  const cortexHeadline = showCortex ? writeup!.headline : null;

  const [detail, summary] = await Promise.all([loadGameDetail(gameId), loadGameSummary(gameId)]);
  const leagueStandings = loadLeagueStandings(league);

  return (
    <PlatformGamesSupplement games={summary ? [summary] : []}>
      <MatchStudioClubView
        leagueId={asLeagueId(league)}
        gameId={gameId}
        cortexSections={cortexSections}
        cortexHeadline={cortexHeadline}
        detail={detail}
        leagueStandings={leagueStandings}
        initialTab={initialTab}
      />
    </PlatformGamesSupplement>
  );
}
