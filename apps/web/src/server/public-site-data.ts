import { asLeagueId, type LeagueId } from "@pitchlab/contracts";
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
import { buildServerRawPlatformDataset, withoutGameDetail } from "./platform-data";

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

interface PublicSiteMemo {
  readonly rawRef: ReturnType<typeof buildServerRawPlatformDataset>;
  redacted: ReturnType<typeof buildServerRawPlatformDataset> | null;
  finished: ReturnType<typeof buildServerRawPlatformDataset>["games"] | null;
  heroCards: LandingHeroLeagueCard[] | null;
  allFinishedResults: LandingFinishedResultItem[] | null;
  parlayDemo: LandingParlayDemoData | null;
  featuredPick: LandingFeaturedCommunityPick | null;
}

let publicSiteMemo: PublicSiteMemo | null = null;

function getPublicSiteMemo(): PublicSiteMemo {
  const raw = buildServerRawPlatformDataset();
  if (!publicSiteMemo || publicSiteMemo.rawRef !== raw) {
    publicSiteMemo = {
      rawRef: raw,
      redacted: null,
      finished: null,
      heroCards: null,
      allFinishedResults: null,
      parlayDemo: null,
      featuredPick: null,
    };
  }
  return publicSiteMemo;
}

function getPublicRedactedDataset(memo: PublicSiteMemo) {
  if (!memo.redacted) {
    memo.redacted = redactDatasetForVisitor(memo.rawRef);
  }
  return memo.redacted;
}

function getPublicFinishedGames(memo: PublicSiteMemo) {
  if (!memo.finished) {
    const dataset = getPublicRedactedDataset(memo);
    memo.finished = withoutGameDetail({
      ...dataset,
      games: dataset.games.filter((g) => g.status === "FT"),
    }).games;
  }
  return memo.finished;
}

function getPublicHeroCards(memo: PublicSiteMemo): LandingHeroLeagueCard[] {
  if (!memo.heroCards) {
    memo.heroCards = buildHeroLeagueCards(memo.rawRef.games, memo.rawRef.leagues);
  }
  return memo.heroCards;
}

function getPublicAllFinishedResults(memo: PublicSiteMemo): LandingFinishedResultItem[] {
  if (!memo.allFinishedResults) {
    memo.allFinishedResults = buildFinishedResultItems(getPublicFinishedGames(memo));
  }
  return memo.allFinishedResults;
}

function getPublicParlayDemo(memo: PublicSiteMemo): LandingParlayDemoData {
  if (!memo.parlayDemo) {
    memo.parlayDemo = buildParlayDemoData(getPublicRedactedDataset(memo).games);
  }
  return memo.parlayDemo;
}

function getPublicFeaturedPick(memo: PublicSiteMemo): LandingFeaturedCommunityPick {
  if (!memo.featuredPick) {
    const dataset = getPublicRedactedDataset(memo);
    memo.featuredPick = buildFeaturedCommunityPick(dataset.games, dataset.tipsterWeeklyPickId);
  }
  return memo.featuredPick;
}

export async function loadLandingViewProps(): Promise<{
  heroCards: LandingHeroLeagueCard[];
  recentResults: LandingFinishedResultItem[];
  parlayDemo: LandingParlayDemoData;
  featuredPick: LandingFeaturedCommunityPick;
}> {
  const memo = getPublicSiteMemo();
  const allHeroCards = getPublicHeroCards(memo);
  const heroCards = selectHeroMainCards(allHeroCards);
  const recentResults = getPublicAllFinishedResults(memo).slice(0, 4);
  const parlayDemo = getPublicParlayDemo(memo);
  const featuredPick = getPublicFeaturedPick(memo);

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
  const memo = getPublicSiteMemo();
  return {
    heroCards: getPublicHeroCards(memo),
  };
}

export async function loadResultadosViewProps(): Promise<{
  results: LandingFinishedResultItem[];
}> {
  const memo = getPublicSiteMemo();
  return {
    results: getPublicAllFinishedResults(memo),
  };
}

export interface ResultadosPageData {
  readonly results: readonly LandingFinishedResultItem[];
  readonly totalCount: number;
  readonly hasMore: boolean;
}

export async function loadResultadosPageData(options?: {
  readonly limit?: number;
  readonly offset?: number;
  readonly league?: string;
}): Promise<ResultadosPageData> {
  const memo = getPublicSiteMemo();
  const all = getPublicAllFinishedResults(memo);
  const leagueFilter = options?.league?.trim().toLowerCase();
  const filtered =
    leagueFilter && leagueFilter !== "all"
      ? all.filter((item) => item.league.toLowerCase() === leagueFilter)
      : all;
  const offset =
    typeof options?.offset === "number" && Number.isFinite(options.offset) && options.offset >= 0
      ? Math.floor(options.offset)
      : 0;
  const limit =
    typeof options?.limit === "number" && Number.isFinite(options.limit) && options.limit >= 1
      ? Math.floor(options.limit)
      : 85;
  const slice = filtered.slice(offset, offset + limit);
  return {
    results: slice,
    totalCount: filtered.length,
    hasMore: offset + slice.length < filtered.length,
  };
}

export async function loadParlaysViewProps(): Promise<{
  parlayDemo: LandingParlayDemoData;
}> {
  const memo = getPublicSiteMemo();
  return {
    parlayDemo: getPublicParlayDemo(memo),
  };
}

export async function loadComunidadViewProps(): Promise<{
  featuredPick: LandingFeaturedCommunityPick;
}> {
  const memo = getPublicSiteMemo();
  return {
    featuredPick: getPublicFeaturedPick(memo),
  };
}

export interface LoginPreviewData {
  primaryCard: LandingHeroLeagueCard | null;
  secondaryCard: LandingHeroLeagueCard | null;
}

export async function loadLoginPreviewData(): Promise<LoginPreviewData> {
  const memo = getPublicSiteMemo();
  const dataset = getPublicRedactedDataset(memo);
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
