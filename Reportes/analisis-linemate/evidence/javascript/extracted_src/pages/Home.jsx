import React from 'react';
import { Buffer } from "buffer";
import { withTranslation } from "react-i18next";
import './Home.scss'
import '../components/App.scss'
import { buildQueryParams, buildTeamsMap, getLocationAffiliates, hasPremiumAccess, isWeeklyCompetition, jsonOrDefault, parseDate } from '../linemate-react-common/src/util';
import {
  BET_TYPE_FILTER,
  LINE_TYPE_FILTER,
  OPPONENT_RANK_TREND_OPTION,
  PLAYER_BET_TYPE_ID_TO_NAME,
  TEAM_BETS,
  TRENDS_FILTER,
} from "../linemate-react-common/src/constants";
import { getAllTeams, getGamedaySchedule } from '../linemate-react-common/src/gameday-utils';
import { API_HOST } from '../react-web-constants';
import { getLeagueLogoPath } from "../react-web-utils";

import Footer from '../components/Footer';
import GlobalContext from '../components/GlobalContext';
import { SCHEDULE_FORMAT_WEEKLY, SUPPORTED_LEAGUES } from '../linemate-react-common/src/constants';
import { getMarketDescriptionFromTrend, getMarketNameFromId, supportedCrossGameParlayFilter, supportedSameGameParlayFilter, supportedTrendFilter } from '../linemate-react-common/src/betting-utils';
// TODO: don't cleanup this import, it's needed for some styling. Should address this bug though
import { TeamAndPlayerProps } from '../components/HomePage/TeamAndPlayerProps';
import { AdvancedToolsSection } from "../components/HomePage/AdvancedToolsSection/AdvancedToolsSection";
import { ParlaysSection } from "../components/HomePage/ParlaysSection/ParlaysSection";
import { HundredPerCentClubSection } from '../components/HomePage/HundredPerCentClubSection';
import Button from '../components/Button';
import BasicDialog from '../components/BasicDialog';
import PricingPopup from '../components/PricingPopup';
import NewMatchupCard from '../components/NewMatchupCard';
import HomeSidebar from '../components/HomeSidebar';
import { TrendingTodaySection } from '../components/HomePage/TrendingTodaySection/TrendingTodaySection';
import { HomeOffersSection } from '../components/HomePage/HomeOffersSection/HomeOffersSection';
import Loader from '../components/Loader';
import HomeAffiliateBanner from '../components/HomePage/HomeAffiliateBanner';

const MAX_PREVIEW_TRENDS = 3;

const buildAdvancedToolTrendsHref = (league, title, signal, extraFeed = {}) => {
  const feed = {
    title,
    includeFilters: false,
    highlightedSignalType: signal,
    queryParams: {
      signals: signal,
    },
    ...extraFeed,
  };

  return `/${league}/trends?feed=${encodeURIComponent(
    Buffer.from(JSON.stringify(feed)).toString("base64")
  )}&tabs=${encodeURIComponent(JSON.stringify(["player"]))}&tab=player`;
};

const buildAdvancedToolHomeConfig = (t) => ({
  starting_lineups: {
    display: t("startingLineups.title"),
    signal: "STARTER",
    href: (league) =>
      buildAdvancedToolTrendsHref(league, t("startingLineups.title"), "STARTER"),
  },
  starting_pitchers: {
    display: t("startingPitchers.title"),
    signal: "VERSUS_STARTING_PITCHER",
    href: (league) =>
      buildAdvancedToolTrendsHref(
        league,
        t("startingPitchers.title"),
        "VERSUS_STARTING_PITCHER"
      ),
  },
  injury_impact: {
    display: t("injuryImpact.title"),
    signal: "INJURY_IMPACT",
    href: (league) =>
      buildAdvancedToolTrendsHref(league, t("injuryImpact.title"), "INJURY_IMPACT"),
  },
  opponent_rank: {
    display: t("opponentRank.title"),
    signal: "OPPONENT_RANK",
    href: (league) =>
      buildAdvancedToolTrendsHref(league, t("opponentRank.title"), "OPPONENT_RANK"),
  },
  weather_report: {
    display: t("weatherReport.title"),
    signal: "WEATHER",
    href: (league) =>
      buildAdvancedToolTrendsHref(league, t("weatherReport.title"), "WEATHER"),
  },
});

class Home extends React.Component {

  static contextType = GlobalContext;

  constructor(props, context) {
    super(props);
    
    this.contentRef = React.createRef();
    const { t } = props;

    const advancedToolConfig = buildAdvancedToolHomeConfig(t);

    this.enabledAdvancedTools = (SUPPORTED_LEAGUES[context.league]?.advancedTools || [])
      .map((key) =>
        advancedToolConfig[key]
          ? { key, ...advancedToolConfig[key] }
          : null
      )
      .filter(Boolean);

    this.crossGameParlayChipsListOptions = Object.fromEntries(
      (SUPPORTED_LEAGUES[context.league]?.supportedCrossGameParlays || []).map(parlay => {
        const marketName = getMarketNameFromId(context.league, parlay.type, parlay.marketId)
        return [marketName, parlay.marketId]
      })
    )

    // this.supportedHundredPercentClubs = HUNDRED_PERCENT_CLUB.filter(trend => !('render' in trend) || trend.render(context.league))

    this.availableCrossGameParlays = []
    this.crossGameParlayIndex = -1
    this.straightTrendsChipsListOptions = {
      'Safer': {
        endpoint: 'cards',
        queryParams: {
          cardGroup: 'SAFE'
        },
        initialFilters: {},
        filtersToExclude: [],
        trendsCustomQueryParams: {
          cardGroup: 'SAFE'
        }
      },
      'Riskier': {
        endpoint: 'cards',
        queryParams: {
          cardGroup: 'RISKY'
        },
        initialFilters: {},
        filtersToExclude: [],
        trendsCustomQueryParams: {
          cardGroup: 'RISKY'
        }
      },
    };

    // 100% club
    this.supportedHundredPercentClubs = HUNDRED_PERCENT_CLUB.filter(trend => !('render' in trend) || trend.render(context.league))
    this.supportedFeaturedHundredPercentClubs = this.supportedHundredPercentClubs.filter(x => x.featuredTitle)
    this.featuredHundredPercentClubIndex = Math.floor(Math.random() * this.supportedFeaturedHundredPercentClubs.length)
    if (SUPPORTED_LEAGUES[context.league]?.supportsQuarterProps) {
      const initialFilters = {}
      const teamMarkets = Object.keys(TEAM_BETS[context.league]).filter(x => x.endsWith('_1Q')).map(x => getMarketNameFromId(context.league, "team", x))
      const playerMarkets = Object.keys(PLAYER_BET_TYPE_ID_TO_NAME[context.league]).filter(x => x.endsWith('_1Q')).map(x => getMarketNameFromId(context.league, "player", x))
      initialFilters[BET_TYPE_FILTER] = teamMarkets.concat(playerMarkets)
      this.straightTrendsChipsListOptions['1st Quarter'] = {
        endpoint: 'cards',
        queryParams: {
          cardGroup: 'FIRST_QUARTER'
        },
        initialFilters: initialFilters,
        filtersToExclude: [BET_TYPE_FILTER]
      }
    } else if (SUPPORTED_LEAGUES[context.league]?.supportsHalfProps) {
      const initialFilters = {}
      const teamMarkets = Object.keys(TEAM_BETS[context.league]).filter(x => x.endsWith('_1H')).map(x => getMarketNameFromId(context.league, "team", x))
      const playerMarkets = Object.keys(PLAYER_BET_TYPE_ID_TO_NAME[context.league]).filter(x => x.endsWith('_1H')).map(x => getMarketNameFromId(context.league, "player", x))
      initialFilters[BET_TYPE_FILTER] = teamMarkets.concat(playerMarkets)
      const tabs = []
      if (playerMarkets.length > 0) {
        tabs.push('player')
      }
      if (teamMarkets.length > 0) {
        tabs.push('team')
      }
      this.straightTrendsChipsListOptions['1st Half'] = {
        endpoint: 'cards',
        queryParams: {
          cardGroup: 'FIRST_HALF'
        },
        initialFilters: initialFilters,
        filtersToExclude: [BET_TYPE_FILTER],
        tabs: tabs
      }
    }
    const initialFiltersAlt = {}
    initialFiltersAlt[LINE_TYPE_FILTER] = "Alternate Lines"
    this.straightTrendsChipsListOptions['Alternate Lines'] = {
      endpoint: 'cards',
      queryParams: {
        cardGroup: 'PERFECT_HIT_RATE_ALTERNATES'
      },
      initialFilters: initialFiltersAlt,
      filtersToExclude: [LINE_TYPE_FILTER]
    }
    const initialFiltersDef = {}
    initialFiltersDef[TRENDS_FILTER] = OPPONENT_RANK_TREND_OPTION
    // filter for narrative = opponent rank
    /* Temporarily removed since it's not in the app either, and is the only one that isn't cardGroup, will revisit later */
    // this.straightTrendsChipsListOptions['DEF matchup'] = {
    //   endpoint: 'cards',
    //   queryParams: {
    //     narratives: getNarrativeIds(OPPONENT_RANK_TREND_OPTION)[0]
    //   },
    //   initialFilters: initialFiltersDef,
    //   filtersToExclude: [TRENDS_FILTER]
    // }

    this.state = {
      loaded: false,
      sameGameParlays: {},
      sameGameParlayChipsListOptions: {},
      crossGameParlays: {},
      straightTrendsPreview: Object.fromEntries(Object.keys(this.straightTrendsChipsListOptions).map(x => [x, []])),
      openPricingModal: false,
      pricingModalVariant: 'plays',
      showAll: false,
      width: typeof window !== 'undefined' ? window.innerWidth: 1280,
      trendingToday: {},
      cheatsheetPreviews: {},
      advancedToolsPreview: {},
    }
  }

  handleShowAll = () => {
    this.setState(prev => ({showAll: !prev.showAll}))
  }

  // TODO: we could fetch upcoming only if there are no current
  componentDidMount() {
    document.title = `${this.props.t("tabs.home")} - Linemate`;
    if (this.contentRef.current) {
      this.contentRef.current.scrollTop = 0;
    }
    const preferredProviders = this.context.resolvedPreferredProviders
    const straightTrendsPreviewQueryParams = {
      premium: hasPremiumAccess(this.context.userAttributes),
      preferredProviders: preferredProviders,
      limit: MAX_PREVIEW_TRENDS + 1,
      groups: [],
      narratives: []
    }
    Object.values(this.straightTrendsChipsListOptions).forEach(category => {
      const queryParams = category.queryParams
      if ('cardGroup' in queryParams) {
        straightTrendsPreviewQueryParams.groups.push(queryParams.cardGroup)
      }
      if ('narratives' in queryParams) {
        straightTrendsPreviewQueryParams.narratives.push(queryParams.narratives)
      }
    })
    const promises = [
      // SGP [0]
      fetch(`${API_HOST}/api/${this.context.league}/v1/trends/parlays/preview?parlayType=SAME_GAME&limit=${MAX_PREVIEW_TRENDS + 1}&preferredProviders=${preferredProviders}`)
        .then((response) => jsonOrDefault(response, {}))
        .then((response) => {
          const games = response?.games || {}
          return Object.fromEntries(
            Object.keys(games).map(gameId => {
              const parlays = games[gameId]
              return [gameId, parlays.filter(x => supportedSameGameParlayFilter(this.context.league, x))]
            })
          )
        })
        .catch(console.log),
      // CGP [1]
      fetch(`${API_HOST}/api/${this.context.league}/v1/trends/parlays/preview?parlayType=CROSS_GAME&markets=${Object.values(this.crossGameParlayChipsListOptions).join(',')}&limit=${MAX_PREVIEW_TRENDS + 1}&preferredProviders=${preferredProviders}`)
      .then((response) => jsonOrDefault(response, {}))
      .then((response) => {
        const markets = response?.markets || {}
        return Object.fromEntries(
          Object.keys(markets).map(marketId => {
            const parlays = markets[marketId]
            return [marketId, parlays.filter(x => supportedCrossGameParlayFilter(this.context.league, x))]
          })
        )
      })
      .catch(console.error),

      // Straights preview [2]
      fetch(`${API_HOST}/api/${this.context.league}/v1/discovery/preview/straights?${buildQueryParams(straightTrendsPreviewQueryParams)}`)
      .then((response) => jsonOrDefault(response, {}))
      .catch(console.error),

      // Trending Today [3]
      fetch(`${API_HOST}/api/${this.context.league}/v1/trends/straights/trending?preferredProviders=${preferredProviders}`)
      .then((response) => jsonOrDefault(response, {}))
      .then((response) =>
        Object.fromEntries(
          Object.entries(response || {}).map(([key, trends]) => [
            key,
            (trends || []).filter((trend) => supportedTrendFilter(this.context.league, trend))
          ])
        )
      )
      .catch(console.error)
    ]
    Promise.all(promises)
    .then((result) => {
      const currentGames = this.context.currentGames;
      const sameGameParlayPreviews = result[0];
      const crossGameParlaysPreview = result[1];
      const straightTrendsPreview = result[2];
      const trendingToday = result[3];

      const tempSameGameParlayChipsListOptions = {};
      if (currentGames.length > 0) {
        currentGames.forEach(game => {
          tempSameGameParlayChipsListOptions[`${game.awayTeamData.info.code} @ ${game.homeTeamData.info.code}`] = game.id
        })
      };

      // Only keep options for which we have previews
      const finalSameGameParlayChipsListOptions = Object.fromEntries(
        Object.entries(tempSameGameParlayChipsListOptions)
          .filter(([, gameId]) => gameId in sameGameParlayPreviews)
          .sort(
            ([, leftGameId], [, rightGameId]) =>
              (sameGameParlayPreviews?.[rightGameId]?.length || 0) -
              (sameGameParlayPreviews?.[leftGameId]?.length || 0)
          )
          .slice(0, 3)
      )

      // straight
      const straightTrendsPreviewTemp = {}
      Object.keys(this.straightTrendsChipsListOptions).forEach((key) => {
        const category = this.straightTrendsChipsListOptions[key]
        if ('cardGroup' in category.queryParams) {
          straightTrendsPreviewTemp[key] = straightTrendsPreview?.groups?.[category.queryParams.cardGroup]?.filter(trend => supportedTrendFilter(this.context.league, trend)) || []
        } else if ('narratives' in category.queryParams) {
          straightTrendsPreviewTemp[key] = straightTrendsPreview?.narratives?.[category.queryParams.narratives]?.filter(trend => supportedTrendFilter(this.context.league, trend)) || []
        }
      })

      this.straightTrendsChipsListOptions = Object.fromEntries(
        Object.keys(this.straightTrendsChipsListOptions)
        .filter(x => x in straightTrendsPreviewTemp && straightTrendsPreviewTemp[x].length > 0)
        .map(x => [x, this.straightTrendsChipsListOptions[x]])
      )

      const crossGameParlays = {}
      Object.keys(crossGameParlaysPreview).forEach((marketId) => {
        const marketParlays = crossGameParlaysPreview[marketId]
        if (marketParlays?.length > 0) {
          crossGameParlays[getMarketNameFromId(this.context.league, marketParlays[0].legs[0].type, marketId)] = marketParlays
        }
      });

      this.crossGameParlayChipsListOptions = Object.fromEntries(
        Object.entries(this.crossGameParlayChipsListOptions)
          .filter(([label]) => label in crossGameParlays && crossGameParlays[label].length > 0)
          .sort(
            ([leftLabel], [rightLabel]) =>
              (crossGameParlays?.[rightLabel]?.length || 0) -
              (crossGameParlays?.[leftLabel]?.length || 0)
          )
          .slice(0, 3)
      )

      this.availableCrossGameParlays = (SUPPORTED_LEAGUES[this.context.league]?.supportedCrossGameParlays || []).filter(parlay => {
        const marketName = getMarketNameFromId(this.context.league, parlay.type, parlay.marketId)
        return marketName in this.crossGameParlayChipsListOptions
      })
      this.crossGameParlayIndex = Math.floor(Math.random() * this.availableCrossGameParlays.length)

      const filteredTrendingToday = Object.fromEntries(
        Object.entries(trendingToday || {}).filter(([, trends]) => trends.length > 0)
      )

      this.setState({
        loaded: true,
        sameGameParlays: sameGameParlayPreviews,
        sameGameParlayChipsListOptions: finalSameGameParlayChipsListOptions,
        straightTrendsPreview: straightTrendsPreviewTemp,
        crossGameParlays,
        trendingToday: filteredTrendingToday,
      })

      const onResize = () => this.setState({ width: window.innerWidth });
      window.addEventListener('resize', onResize);
      this._removeResize = () => window.removeEventListener('resize', onResize);
    });

    Promise.all(
      this.supportedHundredPercentClubs.map((entry) => {
        const queryParams = entry.buildPreviewQueryParams?.({
          league: this.context.league,
          resolvedPreferredProviders: this.context.resolvedPreferredProviders,
        });

        if (!queryParams) {
          return Promise.resolve([entry.id, []]);
        }

        return fetch(`${API_HOST}/api/${this.context.league}/v1/trends/straights?${queryParams}`)
          .then((response) => jsonOrDefault(response, []))
          .then((response) => {
            const previewTrends = (response || [])
              .filter((trend) => supportedTrendFilter(this.context.league, trend))
              .map((trend) => {
                const signalType = entry.resolvePreviewSignalType
                  ? entry.resolvePreviewSignalType(trend)
                  : entry.previewSignalType;

                const previewSignal = (trend.signals || []).find(
                  (signal) => signal.summary && signal.type === signalType && signal.hitRecord
                );

                if (!previewSignal) {
                  return null;
                }

                const previewTrend = {
                  ...trend,
                  previewSignal,
                };

                const marketDescription = getMarketDescriptionFromTrend(
                  this.context.league,
                  previewTrend,
                  this.context.resolvedPreferredProviders
                );

                return marketDescription && marketDescription.trim() !== ""
                  ? previewTrend
                  : null;
              })
              .filter(Boolean)
              .slice(0, 5);
            return [entry.id, previewTrends];
          })
          .catch((error) => {
            console.error(error);
            return [entry.id, []];
          });
      })
    ).then((results) => {
      this.setState({
        cheatsheetPreviews: Object.fromEntries(results),
      });
    });

    Promise.all(
      this.enabledAdvancedTools.map((tool) => {
        const queryParams = buildQueryParams({
          limit: MAX_PREVIEW_TRENDS + 1,
          preferredProviders: this.context.resolvedPreferredProviders,
          signals: [tool.signal],
          preview: true,
        });

        return fetch(
          `${API_HOST}/api/${this.context.league}/v1/trends/straights?${queryParams}`
        )
          .then((response) => jsonOrDefault(response, []))
          .then((response) => [
            tool.key,
            (response || []).filter((trend) =>
              supportedTrendFilter(this.context.league, trend)
            ),
          ])
          .catch((error) => {
            console.error(error);
            return [tool.key, []];
          });
      })
    ).then((results) => {
      this.setState({
        advancedToolsPreview: Object.fromEntries(results),
      });
    });
  }

  componentWillUnmount() {
    if (this._removeResize) this._removeResize();
  }

  render() {
    const date = parseDate(new Date());
    const { t } = this.props;
    // The !this.state.loaded is just so that we default to 'today/this week' while loading
    const currentGames = this.context.currentGames.length > 0 || !this.state.loaded;
    const games = currentGames ? this.context.currentGames : this.context.upcomingGames;
    var title = "";
    if (currentGames) {
      title =
        SUPPORTED_LEAGUES[this.context.league].scheduleFormat === SCHEDULE_FORMAT_WEEKLY
          ? t("home.matchups.thisWeek")
          : t("home.matchups.today");
    } else {
      title = t("home.matchups.upcoming");
    }
    // TODO: for ncaaf games have bowl titles during the playoffs and each game is different so having the same title doesn't work here 
    const timeframe = isWeeklyCompetition(this.context.league) && games && games.length > 0 && games[0].title ? games[0].title : date.formattedDayMonthShort;

    // Need to keep this on render rather than pre-loading in case of changes to the user's account preferences
    const location = this.context.location.region.code;
    const country = this.context.location.country.code;
    const affiliates = this.context.configuration.affiliateOffers;
    const partners = []
    const userAttributes = this.context.userAttributes;
    const affiliateOrder = this.context.configuration.affiliateOrder;

    const locationAffiliates = getLocationAffiliates(location, country, affiliates, partners, userAttributes?.confirmedProviders || [], userAttributes?.preferredProviders || [], affiliateOrder || [], []);
    const offersByOperator = locationAffiliates?.offersByOperator || {};
    const rawAffiliates = locationAffiliates?.affiliates || {};
    const premiumUser = hasPremiumAccess(this.context.userAttributes);

    if (!this.state.loaded) {
      return (
        <div className='page-container'>
          <div className='home-page-loader'>
            <Loader />
          </div>
        </div>
      );
    }
    return (
      
      <div className='page-container'>
        <BasicDialog 
          open={this.state.openPricingModal}
          onOpenChange={(open) => this.setState({openPricingModal: open})}
          content={
            <PricingPopup
              variant={this.state.pricingModalVariant || 'plays'}
              onOpenChange={(open) => this.setState({openPricingModal: open})}
            />
          }
          additionalClassName={"pricing-popup-dialog"}
        />
        <div className='home-page-container'>
          <div className='home-page-content' ref={this.contentRef}>
            {/* TODO: bring back when we have the banners setup in affiliate portal */}
            {/* <HomeAffiliateBanner /> */}
            {/* Matchups */}
            {
              games && games.length > 0 && (
                <div className='home-page-padding'>
                      <div className='home-page-title'>
                        <div className='home-page-title-date'>
                          <img
                            className='home-page-title-league-logo'
                            src={getLeagueLogoPath(this.context.league)}
                            alt={this.context.league}
                          />

                          <p className='text-style-h-3-semibold home-page-title-text-desktop' style={{marginRight: '8px'}}>
                            {title}
                          </p>
                          <p className='text-style-h-3-semibold home-page-title-text-mobile'>
                            {title}
                          </p>

                          {
                            currentGames && (
                              <>
                                <p className='text-style-h-3-medium home-page-title-date-desktop' style={{marginRight: '8px'}}>
                                  {timeframe}
                                </p>
                                <p className='text-style-h-3-medium home-page-title-date-mobile'>
                                  {timeframe}
                                </p>
                              </>
                            )
                          }
                        </div>
                        {
                          games.length > 9 && (
                            <>
                              <Button text={this.state.showAll ? t("home.actions.showLess") : t("home.actions.showMore")} typography="md" type="invisible" enabled={true} onClick={() => this.handleShowAll()} className="home-page-show-more-games home-page-show-more-games-top"/>
                            </>
                          )
                        }
                      </div>
                  
                  <div className='home-page-matchup-wrapper'>
                    {(this.state.showAll ? games : games.slice(0, 9)).map((game) =>
                      <NewMatchupCard key={game.id} game={game} awayTeam={game.awayTeamCode} homeTeam={game.homeTeamCode} gameTime={game.timestamp} gameId={game.id}/>
                    )}
                  </div>

                  {
                    games.length > 9 && (
                      <Button text={this.state.showAll ? t("home.actions.showLess") : t("home.actions.showMore")} typography="md" type="invisible" enabled={true} onClick={() => this.handleShowAll()} className="home-page-show-more-games home-page-show-more-games-bottom"/>
                    )
                  }
                </div>
              )
            }
            {/* Trending Today */}
            <TrendingTodaySection
              crossGameParlays={this.state.crossGameParlays}
              league={this.context.league}
            />
            {/* Offers */}
            <HomeOffersSection offersByOperator={offersByOperator} rawAffiliates={rawAffiliates}/>

            {/* 100% club */}
            <HundredPerCentClubSection
              supportedHundredPercentClubs={this.supportedHundredPercentClubs}
              cheatsheetPreviews={this.state.cheatsheetPreviews}
            />

            <AdvancedToolsSection
              advancedTools={this.enabledAdvancedTools}
              advancedToolsPreview={this.state.advancedToolsPreview}
              maxPreviewTrends={MAX_PREVIEW_TRENDS}
              league={this.context.league}
              hasPremiumAccess={premiumUser}
              onToolClick={(toolKey, trend, href) => {
                if (!premiumUser) {
                  this.setState({
                    openPricingModal: true,
                    pricingModalVariant: toolKey,
                  });
                  return;
                }

                window.location.href = href;
              }}
              onViewAllClick={(toolKey, href) => {
                if (!premiumUser) {
                  this.setState({
                    openPricingModal: true,
                    pricingModalVariant: toolKey,
                  });
                  return;
                }

                window.location.href = href;
              }}
            />

            <ParlaysSection
              sameGameParlays={this.state.sameGameParlays}
              sameGameParlayChipsListOptions={this.state.sameGameParlayChipsListOptions}
              crossGameParlays={this.state.crossGameParlays}
              crossGameParlayChipsListOptions={this.crossGameParlayChipsListOptions}
              maxPreviewTrends={MAX_PREVIEW_TRENDS}
            />
            {/*Team and player props */}
            {/* <TeamAndPlayerProps
              straightParlays={this.state.straightTrendsPreview}
              straightParlayChipsListOptions={this.straightTrendsChipsListOptions}
              maxPreviewTrends={MAX_PREVIEW_TRENDS}
            /> */}
            {this.state.width && this.state.width <= 1280 &&
            <div className='global-sidebar-column'>
              <HomeSidebar trendingToday={this.state.trendingToday} />
            </div>
            }
            <Footer />
          </div>
          {/* 
            Note: this has a similar problem as we had in the trends page where that column goes too far down lower than the middle column content
            Not going to bother fixing it for now since we shouldn't have that many book offers that would cause it
            However in the case where it is needed, refer to the Trends page where the height is dynamically set based on the middle column
          */}
          {this.state.width && this.state.width > 1280 &&
          <div className='global-sidebar-column'>
            <div style={{position: 'relative', width: '100%'}}>
              <HomeSidebar trendingToday={this.state.trendingToday} />
            </div>
          </div>
          }
        </div>
      </div>
    );
  }
}

// TODO: some of the endpoints here are inefficient where they get all cards and filter down after
// TODO: for the team-only we could add something in the back-end to specify team or player only in straights
// TODO: for alt lines get a way to only get alt lines from back-end
// TODO: actually do something with the initial filters
const HUNDRED_PERCENT_CLUB = [
  {
    id: "recent-form",
    icon: "bolt",
    featuredTitle: "100% Recent Form",
    cheatsheetTitleKey: "home.cheatsheets.recentForm",
    image: "recentForm",
    type: "player",
    previewSignalType: "RECENT_FORM",
    buildPreviewQueryParams: (context) =>
      buildQueryParams({
        limit: 5,
        preferredProviders: context.resolvedPreferredProviders || [],
        lineTypes: ["MAIN"],
        outcomes: ["OVER", "YES", "COVER"],
        signals: ["RECENT_FORM"],
        trendTypes: ["PLAYER"],
        sortBySignals: ["RECENT_FORM"],
      }),
    action: (history, context) => {
      window.location.href = `${context.league}/cheatsheets/recent-form`;
    },
  },
  {
    id: "versus-opponent",
    icon: "shield",
    featuredTitle: "100% Versus Opponent",
    cheatsheetTitleKey: "home.cheatsheets.versusOpponent",
    image: "opponent",
    type: "player",
    previewSignalType: "HEAD_TO_HEAD",
    buildPreviewQueryParams: (context) =>
      buildQueryParams({
        limit: 5,
        preferredProviders: context.resolvedPreferredProviders || [],
        lineTypes: ["MAIN"],
        outcomes: ["OVER", "YES", "COVER"],
        signals: ["HEAD_TO_HEAD"],
        trendTypes: ["PLAYER"],
        sortBySignals: ["HEAD_TO_HEAD"],
      }),
    action: (history, context) => {
      window.location.href = `${context.league}/cheatsheets/versus-opponent`;
    },
  },
  {
    id: "alternate-lines",
    icon: "alternate",
    featuredTitle: "100% Alternate Lines",
    cheatsheetTitleKey: "home.cheatsheets.alternateLines",
    image: "alternate",
    type: "player",
    previewSignalType: "RECENT_FORM",
    render: (league) => SUPPORTED_LEAGUES[league].hasAltLines,
    buildPreviewQueryParams: (context) =>
      buildQueryParams({
        limit: 5,
        preferredProviders: context.resolvedPreferredProviders || [],
        lineTypes: ["ALTERNATE"],
        outcomes: ["OVER", "YES", "COVER"],
        trendTypes: ["PLAYER"],
        signals: ["RECENT_FORM"],
        sortBySignals: ["RECENT_FORM"],
      }),
    action: (history, context) => {
      window.location.href = `${context.league}/cheatsheets/alternate-lines`;
    },
  },
  {
    id: "first-quarter",
    icon: "quarter",
    featuredTitle: "100% 1st Quarter",
    cheatsheetTitleKey: "home.cheatsheets.firstQuarter",
    image: "quarter",
    type: "player",
    previewSignalType: "RECENT_FORM",
    render: (league) => SUPPORTED_LEAGUES[league]?.supportsQuarterProps,
    buildPreviewQueryParams: (context) => {
      if (!SUPPORTED_LEAGUES[context.league]?.supportsQuarterProps) {
        return "";
      }

      const playerMarkets = Object.keys(PLAYER_BET_TYPE_ID_TO_NAME[context.league] || {})
        .filter((marketId) => marketId.endsWith("_1Q"));

      const teamMarkets = Object.keys(TEAM_BETS[context.league] || {})
        .filter((marketId) => marketId.endsWith("_1Q"));

      return buildQueryParams({
        limit: 5,
        preferredProviders: context.resolvedPreferredProviders || [],
        lineTypes: ["MAIN"],
        outcomes: ["OVER", "YES", "COVER"],
        markets: teamMarkets.concat(playerMarkets),
        signals: ["RECENT_FORM"],
        trendTypes: ["PLAYER"],
        sortBySignals: ["RECENT_FORM"],
      });
    },
    action: (history, context) => {
      window.location.href = `${context.league}/cheatsheets/first-quarter`;
    },
  },
  {
    id: "first-half",
    icon: "half",
    featuredTitle: "100% 1st Half",
    cheatsheetTitleKey: "home.cheatsheets.firstHalf",
    image: "quarter",
    type: "player",
    previewSignalType: "RECENT_FORM",
    render: (league) => SUPPORTED_LEAGUES[league]?.supportsHalfProps,
    buildPreviewQueryParams: (context) => {
      if (!SUPPORTED_LEAGUES[context.league]?.supportsHalfProps) {
        return "";
      }

      const playerMarkets = Object.keys(PLAYER_BET_TYPE_ID_TO_NAME[context.league] || {})
        .filter((marketId) => marketId.endsWith("_1H"));

      const teamMarkets = Object.keys(TEAM_BETS[context.league] || {})
        .filter((marketId) => marketId.endsWith("_1H"));

      return buildQueryParams({
        limit: 5,
        preferredProviders: context.resolvedPreferredProviders || [],
        lineTypes: ["MAIN"],
        outcomes: ["OVER", "YES", "COVER"],
        markets: teamMarkets.concat(playerMarkets),
        signals: ["RECENT_FORM"],
        trendTypes: ["PLAYER"],
        sortBySignals: ["RECENT_FORM"],
      });
    },
    action: (history, context) => {
      window.location.href = `${context.league}/cheatsheets/first-half`;
    },
  },
  {
    id: "home-away-games",
    icon: "location-filled",
    featuredTitle: "100% Home/Away",
    cheatsheetTitleKey: "home.cheatsheets.homeAwayGames",
    image: "splits",
    type: "player",
    resolvePreviewSignalType: (trend) => (trend.home ? "HOME_SPLIT" : "AWAY_SPLIT"),
    buildPreviewQueryParams: (context) =>
      buildQueryParams({
        limit: 5,
        preferredProviders: context.resolvedPreferredProviders || [],
        lineTypes: ["MAIN"],
        outcomes: ["OVER", "YES", "COVER"],
        signals: ["HOME_SPLIT", "AWAY_SPLIT", "SPLITS"],
        trendTypes: ["PLAYER"],
        sortBySignals: ["HOME_SPLIT", "AWAY_SPLIT", "SPLITS"],
      }),
    action: (history, context) => {
      window.location.href = `${context.league}/cheatsheets/home-away-games`;
    },
  },
  {
    id: "team-form",
    icon: "group-outline",
    featuredTitle: "100% Team Form",
    cheatsheetTitleKey: "home.cheatsheets.teamForm",
    image: "teams",
    type: "team",
    previewSignalType: "RECENT_FORM",
    buildPreviewQueryParams: (context) =>
      buildQueryParams({
        limit: 5,
        preferredProviders: context.resolvedPreferredProviders || [],
        lineTypes: ["MAIN"],
        trendTypes: ["TEAM"],
        signals: ["RECENT_FORM"],
        sortBySignals: ["RECENT_FORM"],
      }),
    action: (history, context) => {
      window.location.href = `${context.league}/cheatsheets/team-form`;
    },
  },
  {
    id: "unders-only",
    icon: "under",
    featuredTitle: "100% Unders Only",
    cheatsheetTitleKey: "home.cheatsheets.undersOnly",
    image: "unders",
    type: "player",
    previewSignalType: "RECENT_FORM",
    buildPreviewQueryParams: (context) =>
      buildQueryParams({
        limit: 5,
        preferredProviders: context.resolvedPreferredProviders || [],
        lineTypes: ["MAIN"],
        outcomes: ["UNDER", "NO"],
        signals: ["RECENT_FORM"],
        trendTypes: ["PLAYER"],
        sortBySignals: ["RECENT_FORM"],
      }),
    action: (history, context) => {
      window.location.href = `${context.league}/cheatsheets/unders-only`;
    },
  },
];


export default withTranslation()(Home);
