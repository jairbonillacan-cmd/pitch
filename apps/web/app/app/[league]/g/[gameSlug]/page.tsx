import "../../../../live.css";
import "../../../../pre-match.css";
import "../../../../sport-outlook.css";
import "../../../../picks-screener.css";
import "../../../../atomic-kit.css";
import "../../../../match-deep-panels.css";
import React, { Suspense } from "react";
import { notFound } from "next/navigation";
import { asLeagueId, resolveGameBySlugOrId } from "@pitchlab/contracts";
import { PlatformGamesSupplement } from "@pitchlab/ui/games-supplement";
import { MatchStudioClubView } from "@pitchlab/ui/match-studio";
import { normalizeMatchTab } from "@pitchlab/ui/match-tab";
import { MatchDetailSkeleton } from "@pitchlab/ui/route-skeletons";
import { yieldForStreamFlush } from "../../../../../src/server/club-shell-viewer";
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

type ResolvedMatchTab = ReturnType<typeof normalizeMatchTab>;

async function CanonicalMatchStreamContent({
  league,
  gameId,
  initialTab,
}: {
  league: ProductLeague;
  gameId: string;
  initialTab: ResolvedMatchTab;
}): Promise<React.JSX.Element> {
  await yieldForStreamFlush();
  const writeup = loadCortexWriteup(league, gameId);
  const [access, detail, summary, leagueStandings] = await Promise.all([
    writeup ? getViewerAccess() : Promise.resolve(null),
    loadGameDetail(gameId),
    loadGameSummary(gameId),
    Promise.resolve().then(() => loadLeagueStandings(league)),
  ]);
  const showCortex = Boolean(writeup && access?.fullAccess);
  const cortexSections = showCortex && writeup ? writeup.sections : null;
  const cortexHeadline = showCortex && writeup ? writeup.headline : null;

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

  return (
    <Suspense fallback={<MatchDetailSkeleton />}>
      <CanonicalMatchStreamContent
        league={league}
        gameId={gameId}
        initialTab={initialTab}
      />
    </Suspense>
  );
}
