import { asLeagueId, type LeagueId } from "@pitchlab/contracts";
// Importación por archivo: el barril `@pitchlab/ui/platform` mete toda la librería (Club,
// cuenta, tarjeta 3D) en el JavaScript de las páginas públicas.
import { redactDatasetForVisitor } from "@pitchlab/ui/access-guard";
import {
  buildFeaturedCommunityPick,
  buildFinishedResultItems,
  buildHeroLeagueCards,
  buildParlayDemoData,
  type LandingFeaturedCommunityPick,
  type LandingFinishedResultItem,
  type LandingHeroLeagueCard,
  type LandingParlayDemoData,
} from "@pitchlab/ui/public-sections";
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
  const raw = buildServerRawPlatformDataset();
  const dataset = redactDatasetForVisitor(raw);
  // Las tarjetas del hero publican solo el 1X2 y 3 mercados: se arman con los mercados reales
  // (panorama v3.2) en vez de aproximarlos desde x12. Lo demás sigue redactado.
  const allHeroCards = buildHeroLeagueCards(raw.games, raw.leagues);
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
  const raw = buildServerRawPlatformDataset();
  return {
    heroCards: buildHeroLeagueCards(raw.games, raw.leagues),
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
