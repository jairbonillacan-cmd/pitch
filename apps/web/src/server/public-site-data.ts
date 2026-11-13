import { asLeagueId, type LeagueId } from "@pitchlab/contracts";
import {
  buildFeaturedCommunityPick,
  buildFinishedResultItems,
  buildHeroLeagueCards,
  buildParlayDemoData,
  redactDatasetForVisitor,
  type LandingFeaturedCommunityPick,
  type LandingFinishedResultItem,
  type LandingHeroLeagueCard,
  type LandingParlayDemoData,
} from "@pitchlab/ui/platform";
import { buildServerRawPlatformDataset, loadFinishedGames } from "./platform-data";

export type { LandingFeaturedCommunityPick };

const HERO_MAIN_LEAGUE_ORDER: readonly LeagueId[] = [
  asLeagueId("liga-mx"),
  asLeagueId("nfl"),
  asLeagueId("premier-league"),
  asLeagueId("laliga"),
];

export function selectHeroMainCards(
  allCards: readonly LandingHeroLeagueCard[],
): LandingHeroLeagueCard[] {
  const picked: LandingHeroLeagueCard[] = [];
  const seen = new Set<LeagueId>();

  for (const league of HERO_MAIN_LEAGUE_ORDER) {
    const found = allCards.find((card) => card.league === league);
    if (found) {
      picked.push(found);
      seen.add(found.league);
    }
  }

  if (picked.length < 4) {
    for (const card of allCards) {
      if (!seen.has(card.league)) {
        picked.push(card);
        seen.add(card.league);
        if (picked.length >= 4) break;
      }
    }
  }

  return picked;
}

export async function loadLandingViewProps(): Promise<{
  heroCards: LandingHeroLeagueCard[];
  recentResults: LandingFinishedResultItem[];
  parlayDemo: LandingParlayDemoData;
  featuredPick: LandingFeaturedCommunityPick;
}> {
  const dataset = redactDatasetForVisitor(buildServerRawPlatformDataset());
  const allHeroCards = buildHeroLeagueCards(dataset.games, dataset.leagues);
  const heroCards = selectHeroMainCards(allHeroCards);
  const finished = await loadFinishedGames();
  const recentResults = buildFinishedResultItems(finished, 4).slice(0, 4);
  const parlayDemo = buildParlayDemoData(dataset.games);
  const featuredPick = buildFeaturedCommunityPick(
    dataset.games,
    dataset.tipsterWeeklyPickId,
  );

  return {
    heroCards,
    recentResults,
    parlayDemo,
    featuredPick,
  };
}

export async function loadComoFuncionaViewProps(): Promise<{
  heroCards: LandingHeroLeagueCard[];
}> {
  const dataset = redactDatasetForVisitor(buildServerRawPlatformDataset());
  return {
    heroCards: buildHeroLeagueCards(dataset.games, dataset.leagues),
  };
}

export async function loadResultadosViewProps(): Promise<{
  results: LandingFinishedResultItem[];
}> {
  const finished = await loadFinishedGames();
  return {
    results: buildFinishedResultItems(finished),
  };
}

export async function loadParlaysViewProps(): Promise<{
  parlayDemo: LandingParlayDemoData;
}> {
  const dataset = redactDatasetForVisitor(buildServerRawPlatformDataset());
  return {
    parlayDemo: buildParlayDemoData(dataset.games),
  };
}

export async function loadComunidadViewProps(): Promise<{
  featuredPick: LandingFeaturedCommunityPick;
}> {
  const dataset = redactDatasetForVisitor(buildServerRawPlatformDataset());
  return {
    featuredPick: buildFeaturedCommunityPick(
      dataset.games,
      dataset.tipsterWeeklyPickId,
    ),
  };
}

export interface LoginPreviewData {
  primaryCard: LandingHeroLeagueCard | null;
  secondaryCard: LandingHeroLeagueCard | null;
}

export async function loadLoginPreviewData(): Promise<LoginPreviewData> {
  const dataset = redactDatasetForVisitor(buildServerRawPlatformDataset());
  if (dataset.games.length === 0) {
    return { primaryCard: null, secondaryCard: null };
  }

  const allHeroCards = buildHeroLeagueCards(dataset.games, dataset.leagues);
  const mainCards = selectHeroMainCards(allHeroCards);
  const primaryCard = mainCards[0] ?? null;
  const secondaryCard = primaryCard
    ? (mainCards.find((card) => card.league !== primaryCard.league) ??
      allHeroCards.find((card) => card.league !== primaryCard.league) ??
      null)
    : null;

  return {
    primaryCard,
    secondaryCard,
  };
}
