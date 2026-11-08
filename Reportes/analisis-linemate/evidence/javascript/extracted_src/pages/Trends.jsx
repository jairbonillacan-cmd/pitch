import React from 'react'

import './Trends.scss'
import '../components/App.scss'

import GlobalContext from '../components/GlobalContext'
import { buildQueryParams, filtersToQueryParamsDict, getBetTypeOptionsForAPI, getGamesFilterForAPI, getGameTitle, getLineTypeFilterForAPI, getMultipleBetTypeFilterForAPI, getPlayerId, getPlayerName, getSignalsFilterForAPI, getStraightTrendTypeFilterForAPI, hasPremiumAccess, jsonOrDefault, noOpPromise, parseDateFromString } from '../linemate-react-common/src/util';
import { OUTCOME_OPTION_KEYS, OVER_UNDER_OPTION_LABELS, SIGNAL_OPTION_KEYS, SIGNAL_OPTION_LABELS, TREND_OPTION_KEYS, TREND_OPTION_LABELS } from '../linemate-react-common/src/filter-config';
import { API_HOST } from '../react-web-constants';
import {
    getCardKey,
    supportedCrossGameParlayFilter,
    supportedSameGameParlayFilter,
    supportedTrendFilter
} from '../linemate-react-common/src/betting-utils';
import TrendContent from '../components/TrendContent';
import Button from '../components/Button';
import _ from 'lodash';
import { Buffer } from 'buffer';
import TrendDetails from '../components/TrendDetails';
import TrendCard from '../components/HomePage/TrendCard';
import Loader from '../components/Loader';
import ListComponent from '../components/ListComponent';
import { FILTER_KEYS } from '../linemate-react-common/src/filter-config';
import i18n from '../i18n'

const endpoints = {
    player: (league) => `${API_HOST}/api/${league}/v1/trends/straights`,
    team: (league) => `${API_HOST}/api/${league}/v1/trends/straights`,
    sameGameParlay: (league) => `${API_HOST}/api/${league}/v1/trends/parlays`,
    crossGameParlay: (league) => `${API_HOST}/api/${league}/v1/trends/parlays`
}

export const ENDPOINTS = endpoints

const PARLAY_TYPE_QUERY_PARAM = {
    player: null,
    team: null,
    crossGameParlay: 'CROSS_GAME',
    sameGameParlay: 'SAME_GAME'
}

const filterFunctions = {
    player: supportedTrendFilter,
    team: supportedTrendFilter,
    crossGameParlay: supportedCrossGameParlayFilter,
    sameGameParlay: supportedSameGameParlayFilter
}
export const FILTER_FUNCTIONS = filterFunctions

function getTrendsFilterForAPI(league) {
    const signalFilter = getSignalsFilterForAPI(league);

    const options = { ...signalFilter.options };
    delete options[SIGNAL_OPTION_KEYS.ALL];

    return {
        ...signalFilter,
        options: {
            [TREND_OPTION_KEYS.ALL]: null,
            ...options,
        },
        optionLabels: {
            [TREND_OPTION_KEYS.ALL]: TREND_OPTION_LABELS[TREND_OPTION_KEYS.ALL],
            ...Object.fromEntries(
                Object.keys(options).map((key) => [key, TREND_OPTION_LABELS[key] || SIGNAL_OPTION_LABELS[key] || key])
            ),
        },
        selectedValue: TREND_OPTION_KEYS.ALL,
    };
}

function getOverUnderFilterForAPI() {
    return {
        isActive: false,
        options: {
            [OUTCOME_OPTION_KEYS.ALL]: null,
            [OUTCOME_OPTION_KEYS.OVER]: "OVER,YES,COVER",
            [OUTCOME_OPTION_KEYS.UNDER]: "UNDER,NO"
        },
        optionLabels: OVER_UNDER_OPTION_LABELS,
        selectedValue: OUTCOME_OPTION_KEYS.ALL,
        queryParamField: 'outcomes',
        filterType: "single"
    };
}

// TODO: review loading more trends on alt, sample on nfl team in a specific game didn't work
class Trends extends React.Component {
  static contextType = GlobalContext

  constructor(props, context) {
    // https://github.com/facebook/react/issues/13944
    // Looks like this API is being deprecated but it doesn't look like there is any official way of doing it in the new API
    super(props, context)

    this.pickerToggled = this.pickerToggled.bind(this)
    this.cardSelected = this.cardSelected.bind(this)
    this.sameGameParlaySelected = this.sameGameParlaySelected.bind(this);
    this.crossGameParlaySelected = this.crossGameParlaySelected.bind(this);
    this.handleAddAllImportedLegsToMyPicks = this.handleAddAllImportedLegsToMyPicks.bind(this)
    this.listRef = React.createRef()

    this.workstationResizeObserver = null

    const searchParams = new URLSearchParams(window.location.search)
    this.customFeed = searchParams.has('feed') ? JSON.parse(Buffer.from(searchParams.get('feed'), 'base64').toString('utf-8')) : null
    if (this.customFeed?.importedTrendsKey) {
        try {
            const storedImportedTrends = sessionStorage.getItem(this.customFeed.importedTrendsKey)

            if (storedImportedTrends) {
                const parsedImportedTrends = JSON.parse(storedImportedTrends)

                if (Array.isArray(parsedImportedTrends) && parsedImportedTrends.length > 0) {
                    this.customFeed.cards = parsedImportedTrends
                }
            }
        } catch (error) {
            console.error(error)
        }
    }

    // Dummy workaround to not require the long feed param if we just want to get a player profile
    // We can do a similar workaround for team if necessary
    if (!this.customFeed && this.props.teamCode) {
        this.customFeed = this.props
    }
    if (!hasPremiumAccess(context.userAttributes) && this.customFeed && this.customFeed.without) {
      // If it's a free user but has somehow gotten a link for without
      this.customFeed = null
    }

    this.pickerOptions = {
      player: 'Player',
      team: 'Team',
      parlay: 'Parlay'
    }

    this.profile = (searchParams.has('profile') && Boolean(searchParams.get('profile'))) || this.props.profile
    this.pickerOptions = {
        "player": "Player",
        "team": "Team",
        "crossGameParlay": "Parlay",
        "sameGameParlay": "SGP",
    }
    
    const tabs = searchParams.get('tabs');
    if (tabs) {
        try {
            const parsedTabs = JSON.parse(decodeURIComponent(tabs))
            this.pickerOptions = Object.fromEntries(Object.keys(this.pickerOptions).filter(x => parsedTabs.includes(x)).map(x => [x, this.pickerOptions[x]]))
        } catch (err) {
            console.log(err)
        }
    }
    this.tabs = Object.keys(this.pickerOptions)

    var listFilters = {
        player: {},
        team: {},
        sameGameParlay: {},
        crossGameParlay: {},
        trends: {}
    };

    const games = context.currentGames && context.currentGames.length > 0 ? context.currentGames : (context.upcomingGames || [])
    const gameTitleToGameIdDict = Object.fromEntries(games.map(x => [getGameTitle(context.league, x), x.id]))
    const gameTitleToAnnotationDict = Object.fromEntries(games.map(x => {
        const parsedDate = parseDateFromString(x.timestamp);
        return [getGameTitle(context.league, x), `${parsedDate.dayOfWeekShort} ${parsedDate.formattedTime}`]
    }))
    // If it's a profile, don't include filters
    const includeFilters = (!this.customFeed || !('includeFilters' in this.customFeed) || Boolean(this.customFeed.includeFilters)) && !this.profile
    if (includeFilters) {
        Object.keys(this.pickerOptions).forEach((option) => {
            listFilters[option][FILTER_KEYS.LINE_TYPE] = getLineTypeFilterForAPI();
            listFilters[option][FILTER_KEYS.GAMES] = getGamesFilterForAPI(gameTitleToGameIdDict, gameTitleToAnnotationDict);
            listFilters[option][FILTER_KEYS.OVER_UNDER] = getOverUnderFilterForAPI();
            listFilters[option][FILTER_KEYS.TRENDS] = getTrendsFilterForAPI(context.league);

            if (option === "sameGameParlay") {
                listFilters[option][FILTER_KEYS.TRENDS].options = Object.fromEntries(
                    Object.keys(listFilters[option][FILTER_KEYS.TRENDS].options)
                        .filter((key) => key !== SIGNAL_OPTION_KEYS.OPPONENT_RANK)
                        .map((key) => [key, listFilters[option][FILTER_KEYS.TRENDS].options[key]])
                );

                if (listFilters[option][FILTER_KEYS.TRENDS].optionLabels) {
                    listFilters[option][FILTER_KEYS.TRENDS].optionLabels = Object.fromEntries(
                        Object.keys(listFilters[option][FILTER_KEYS.TRENDS].optionLabels)
                            .filter((key) => key !== SIGNAL_OPTION_KEYS.OPPONENT_RANK)
                            .map((key) => [key, listFilters[option][FILTER_KEYS.TRENDS].optionLabels[key]])
                    );
                }
            }

            listFilters[option][FILTER_KEYS.BET_TYPE] = getMultipleBetTypeFilterForAPI(getBetTypeOptionsForAPI(context.league, option));

            if (!option.toLowerCase().includes("parlay")) {
                listFilters[option][FILTER_KEYS.TREND_TYPE] = getStraightTrendTypeFilterForAPI(option)
            }

            Object.keys(this.customFeed?.initialFilters || {}).forEach((filter) => {
                listFilters[option][filter] = this.customFeed.initialFilters[filter]
            })

            Object.keys(listFilters[option]).forEach((filter) => {
                if (this.customFeed && this.customFeed.filtersToExclude && this.customFeed.filtersToExclude.includes(filter)) {
                    listFilters[option][filter].hidden = true
                }
            })
        })
    }

    this.startingIndex = searchParams.get('index') || 0

        if (this.profile) {
            if (this.customFeed.player) {
                this.pickerOptions = {
                    'player': 'Player'
                }
            } else {
                this.pickerOptions = {
                    'team': 'Team'
                }
            }
            this.pickerOptions['crossGameParlay'] = 'Parlay'
            this.pickerOptions['sameGameParlay'] = 'SGP'
        }
        const selectedTab = searchParams.get('tab');
        const pickerSelection = selectedTab && this.pickerOptions?.[selectedTab] ? selectedTab : Object.keys(this.pickerOptions)[0]
        this.state = {
            tabs: {
                player: {
                    trends: [], 
                    offset: 0, 
                    loadingBatch: false,
                    initialLoadInProgress: true,
                    endReached: false,
                    lastFetchTime: new Date().getTime()
                },
                team: {
                    trends: [], 
                    offset: 0, 
                    loadingBatch: false,
                    initialLoadInProgress: true,
                    endReached: false,
                    lastFetchTime: new Date().getTime()
                },
                sameGameParlay: {
                    trends: [], 
                    offset: 0, 
                    loadingBatch: false,
                    initialLoadInProgress: true,
                    endReached: false,
                    lastFetchTime: new Date().getTime()
                },
                crossGameParlay: {
                    trends: [], 
                    offset: 0, 
                    loadingBatch: false,
                    initialLoadInProgress: true,
                    endReached: false,
                    lastFetchTime: new Date().getTime()
                },
            },
            pickerSelection: pickerSelection,
            cardSelectionLoading: false,
            selectedCard: null,
            selectedCardMarkets: null,
            detailTabCard: null,
            listFilters: _.cloneDeep(listFilters),
            // Dictates if we need to show the details view if set to true, otherwise show the list view
            mobileCardSelected: false,
            profileMobileView: 'workstation',
            width: typeof window !== 'undefined' ? window.innerWidth : 1280,
            initialCardSelection: true,
            selectedParlayIndexes: {
                sameGameParlay: null,
                crossGameParlay: null,
            },
            selectedParlayTab: null,
        }
    }

    loadCustomFeedCards() {
        const tab = Object.keys(this.pickerOptions)[0]
        const cards = this.customFeed?.cards || []

        if (!Array.isArray(cards) || cards.length === 0) {
            return
        }

        let presetIndex = Number(this.startingIndex) || 0
        if (presetIndex >= cards.length) {
            presetIndex = 0
        }

        const updatedTabs = {
            ...this.state.tabs,
            [tab]: {
                trends: cards,
                offset: 0,
                loadingBatch: false,
                initialLoadInProgress: false,
                endReached: true,
                lastFetchTime: new Date().getTime()
            }
        }

        const selectedCard = cards.length > presetIndex ? cards[presetIndex] : null

        this.setState(
            {
                tabs: updatedTabs,
                selectedCard
            },
            () => {
                if (this.customFeed?.importedTrendsKey) {
                    sessionStorage.removeItem(this.customFeed.importedTrendsKey)
                }

                if (selectedCard) {
                    if (tab === 'crossGameParlay') {
                        this.crossGameParlaySelected(selectedCard, true, presetIndex)
                    } else if (tab === 'sameGameParlay') {
                        this.sameGameParlaySelected(selectedCard, true, presetIndex)
                    } else {
                        this.cardSelected(selectedCard, true, this.context.currentGames)
                    }
                }
            }
        )
    }

    handleResize = () => {
        this.setState({ width: window.innerWidth })
    }

    componentDidMount() {
        window.addEventListener('resize', this.handleResize)
        document.title = `${i18n.t(this.profile ? 'preferences.items.profile' : 'trends.title')} - Linemate`

        if (Array.isArray(this.customFeed?.cards) && this.customFeed.cards.length > 0) {
            this.loadCustomFeedCards();
        } else if (this.profile && this.customFeed) {
            this.fetchProfileTabs();
        }
        
        this.workstationResizeObserver = new ResizeObserver((entries) => {
            // Sync list height to details panel so when segment changes (e.g. All → Last 10) and the table shrinks,
            // the details panel shrinks (align-self: flex-start) and the list shrinks too, keeping sticky headers and avoiding excess white space.
            // Apply at all breakpoints so the list keeps overflow: auto and does not expand (fixes small viewports e.g. ≤1023px).
            // When switching from a tab with no trends to one with trends, details can briefly be 0 (no selectedCard yet); avoid collapsing the list.
            // const detailsHeight = entries[0].contentRect.height;
            // const currentTab = this.state.tabs[this.state.pickerSelection];
            // const hasCardsInCurrentTab = currentTab && currentTab.trends && currentTab.trends.length > 0;
            // const minHeight = detailsHeight === 0 && hasCardsInCurrentTab ? '70vh' : `${detailsHeight}px`;
            // if (this.listRef.current) {
            //     this.listRef.current.style.height = minHeight;
            // }
            if (this.listRef.current && window.screen.width >= 1024) {
                this.listRef.current.style.height = `${entries[0].contentRect.height}px`;
            }
        });
            this.workstationResizeObserver.observe(document.getElementsByClassName("trends-page-details")[0]);
        // const detailsEl = document.getElementsByClassName("trends-page-details")[0];
        // if (detailsEl) this.workstationResizeObserver.observe(detailsEl);
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.handleResize)
        if (this.workstationResizeObserver) {
            this.workstationResizeObserver.disconnect();
        }
    }
    
    fetchBatch = (tab, offset, reset, initialLoad, filtersOverride) => {
        if (this.customFeed?.endpoint) {
            return
        }

        const dataLimitIncrement = 20
        const filtersForTab = (filtersOverride && filtersOverride[tab]) ? filtersOverride[tab] : this.state.listFilters[tab]

        const apiFilters = {
            offset: offset,
            limit: dataLimitIncrement,
            preferredProviders: this.context.resolvedPreferredProviders,
            parlayType: PARLAY_TYPE_QUERY_PARAM[tab],
            ...filtersToQueryParamsDict(filtersForTab),
            ...this.customFeed?.queryParams
        }

        const queryParams = buildQueryParams(apiFilters)
        const currentTrendsLength = this.state.tabs[tab].trends.length
        const requestUrl = `${endpoints[tab](this.context.league)}?${queryParams}`

        fetch(requestUrl)
            .then((response) => jsonOrDefault(response, []))
            .then((trendsResponse) => {

                const filteredTrends = trendsResponse

                    .filter((trend) => filterFunctions[tab](this.context.league, trend))
                    .filter((trend) => {
                        if (
                            this.customFeed?.highlightedSignalType !== "VERSUS_STARTING_PITCHER" ||
                            !this.customFeed?.signalPitcherId
                        ) {
                            return true;
                        }

                        const startingPitcherSignal = (trend.signals || []).find(
                            (signal) => signal.type === "VERSUS_STARTING_PITCHER"
                        );

                        if (!startingPitcherSignal?.pitcher) {
                            return false;
                        }

                        return String(getPlayerId(startingPitcherSignal.pitcher)) === String(this.customFeed.signalPitcherId);
                    })
                    .filter((trend) => {
                        if (
                            this.customFeed?.highlightedSignalType !== "INJURY_IMPACT" ||
                            !this.customFeed?.without?.id
                        ) {
                            return true;
                        }

                        return (trend.impactingInjuries || []).some(
                            (injury) =>
                                String(getPlayerId(injury?.injuryReport || injury)) === String(this.customFeed.without.id)
                        );
                    });

                const newTrends = filteredTrends

                const updatedTabData = {
                    trends: reset ? newTrends : this.state.tabs[tab].trends.concat(newTrends),
                    offset: offset + dataLimitIncrement,
                    loadingBatch: false,
                    initialLoadInProgress: false,
                    endReached: trendsResponse.length < dataLimitIncrement,
                    lastFetchTime: new Date().getTime()
                }

                const updatedState = {
                    tabs: { ...this.state.tabs, [tab]: updatedTabData }
                }

                if (initialLoad) {
                    let presetIndex = Number(this.startingIndex) || 0

                    const selectedTrendId = this.customFeed?.selectedTrendId
                    if (selectedTrendId) {
                        const matchedIndex = updatedTabData.trends.findIndex(
                            (trend) =>
                                String(trend?.trendId || trend?.id || "") === String(selectedTrendId)
                        )

                        if (matchedIndex >= 0) {
                            presetIndex = matchedIndex
                        }
                    }

                    const selectedParlayId = this.customFeed?.selectedParlayId
                    if (selectedParlayId && (tab === 'sameGameParlay' || tab === 'crossGameParlay')) {
                        const matchedParlayIndex = updatedTabData.trends.findIndex(
                            (parlay) => String(parlay?.id || "") === String(selectedParlayId)
                        )

                        if (matchedParlayIndex >= 0) {
                            presetIndex = matchedParlayIndex
                        }
                    }

                    if (presetIndex >= updatedTabData.trends.length) {
                        presetIndex = 0
                    }

                    updatedState.selectedCard =
                        updatedTabData.trends.length > presetIndex
                            ? updatedTabData.trends[presetIndex]
                            : null

                    if (tab === 'player' || tab === 'team') {
                        this.setState(updatedState, () => this.cardSelected(updatedState.selectedCard, true, this.context.currentGames))
                    } else if (tab === 'sameGameParlay') {
                        this.setState(updatedState, () => this.sameGameParlaySelected(updatedState.selectedCard, true, presetIndex))
                    } else if (tab === 'crossGameParlay') {
                        this.setState(updatedState, () => this.crossGameParlaySelected(updatedState.selectedCard, true, presetIndex))
                    }
                } else if (!reset) {
                    this.setState(updatedState, () => {
                        const items = document.getElementsByClassName('trends-page-list-items-item')
                        if (currentTrendsLength > 0) {
                            const previousLastItem = items[currentTrendsLength - 1]
                            if (previousLastItem) {
                                previousLastItem.scrollIntoView({ behavior: 'auto', block: 'end' })
                            }
                        }
                    })
                } else {
                    this.setState(updatedState)
                }
            })
            .catch((err) => {
                console.error(err)
                const updatedState = {
                    tabs: {
                        ...this.state.tabs,
                        [tab]: {
                            ...this.state.tabs[tab],
                            loadingBatch: false,
                            initialLoadInProgress: false
                        }
                    }
                }
                this.setState(updatedState)
            })
    }

    pickerToggled(event) {
        window.scrollTo({top: 0, behavior: 'smooth'});
        const selection = event.currentTarget.dataset.selection;
        this.setState({pickerSelection: selection})
    }

    cardSelected(card, initialLoad, games) {
      if (!initialLoad) {
          window.scrollTo({top: 0, behavior: 'smooth'});
      }
      if (card && this.state.selectedCard && getCardKey(card) === getCardKey(this.state.selectedCard)) {
          return this.setState({mobileCardSelected: !initialLoad, initialCardSelection: initialLoad});
      }
      if (!card) {
          return this.setState({
              mobileCardSelected: false,
              selectedCard: null,
              initialCardSelection: initialLoad
          })
      }
      if (this.state.cardSelectionLoading) {
          return;
      }

      var selectedCardMarkets = {}
      var cardGame
      if (games) {
        cardGame = games.find((x) => x.id === card.gameId)
      } else {
        cardGame = this.context.currentGames.find((x) => x.id === card.gameId)
      }
      if (cardGame) {
        var teamPath = ''
        if (cardGame.awayTeamData.info.code === card.team.code) {
          teamPath = 'awayTeamData'
        } else {
          teamPath = 'homeTeamData'
        }

        if (card.type === 'team') {
          selectedCardMarkets = Object.assign({}, cardGame.markets, cardGame[teamPath].markets)
        } else if (card.type === 'player' && cardGame[teamPath].players) {
          const playerRecord = cardGame[teamPath].players.find(
            (x) => getPlayerId(x.info) === getPlayerId(card.player)
          )
          selectedCardMarkets = playerRecord.props
        }
      }

      const finishSelection = (selectedTrend) => {
        this.setState({
          cardSelectionLoading: false,
          selectedCard: selectedTrend,
          mobileCardSelected: !initialLoad,
          initialCardSelection: initialLoad,
          selectedCardMarkets: selectedCardMarkets
        })
      }

      const resolvedTrendId =
        card?.trendId ||
        (Array.isArray(card?.trendIds) && card.trendIds.length > 0 ? card.trendIds[0] : null)

      if (!resolvedTrendId) {
        finishSelection(card)
        return
      }

      const effectiveLeague = card?.league || this.context.league

      fetch(`${API_HOST}/api/${effectiveLeague}/v1/trends/straights/${resolvedTrendId}`)
        .then((response) => jsonOrDefault(response, null))
        .then((trendResponse) => {
          if (!trendResponse) {
            finishSelection(card)
            return
          }

          const hydratedCard = {
            ...trendResponse,
            ...card,
            market: card.market || trendResponse.market,
            team: card.team || trendResponse.team,
            opposingTeam: card.opposingTeam || trendResponse.opposingTeam,
            player: card.player || trendResponse.player,
            line: card.line ?? trendResponse.line,
            outcome: card.outcome ?? trendResponse.outcome,
            home: card.home ?? trendResponse.home,
            gameId: card.gameId ?? trendResponse.gameId,
            type: card.type || trendResponse.type,
            alternate: card.alternate ?? trendResponse.alternate,
            book: card.book || trendResponse.book,
            signals: trendResponse.signals || card.signals || [],
            impactingInjuries: trendResponse.impactingInjuries || card.impactingInjuries || []
          }

          finishSelection(hydratedCard)
        })
        .catch((error) => {
          console.error(error)
          finishSelection(card)
        })
    }

    selectParlayCard(parlayTab, parlay, initialLoad, selectedParlayIndex = null) {
      if (!initialLoad) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      const currentTabIndex = this.state.selectedParlayIndexes?.[parlayTab]
      const isSameTab = this.state.selectedParlayTab === parlayTab
      const isSameCard =
        parlay &&
        this.state.selectedCard &&
        getCardKey(parlay) === getCardKey(this.state.selectedCard)

      if (
        parlay &&
        selectedParlayIndex !== null &&
        isSameTab &&
        currentTabIndex === selectedParlayIndex &&
        isSameCard
      ) {
        return this.setState({
          mobileCardSelected: !initialLoad,
          initialCardSelection: initialLoad
        });
      }

      if (!parlay) {
        return this.setState({
          mobileCardSelected: false,
          selectedCard: null,
          initialCardSelection: initialLoad
        });
      }

      if (this.state.cardSelectionLoading) {
        return;
      }

      this.setState((previousState) => ({
        cardSelectionLoading: false,
        mobileCardSelected: !initialLoad,
        initialCardSelection: initialLoad,
        selectedCard: parlay,
        selectedCardMarkets: {},
        selectedParlayTab: parlayTab,
        selectedParlayIndexes: {
          ...previousState.selectedParlayIndexes,
          [parlayTab]: selectedParlayIndex
        }
      }));
    }

    sameGameParlaySelected(parlay, initialLoad, selectedParlayIndex = null) {
      this.selectParlayCard('sameGameParlay', parlay, initialLoad, selectedParlayIndex)
    }

    crossGameParlaySelected(parlay, initialLoad, selectedParlayIndex = null) {
      this.selectParlayCard('crossGameParlay', parlay, initialLoad, selectedParlayIndex)
    }

  parlaySelected(parlay, initialLoad) {
    if (!initialLoad) {
      // Scroll to top of page for mobile, otherwise the user ends up at the bottom of the workstation
      window.scrollTo(0, 0)
    }
    if (
      parlay &&
      this.state.selectedCard &&
      getCardKey(parlay) === getCardKey(this.state.selectedCard)
    ) {
      return this.setState({ mobileCardSelected: !initialLoad, initialCardSelection: initialLoad })
    }
    if (!parlay) {
      return this.setState({ mobileCardSelected: true })
    }
    // This is to make sure you can't start spam clicking cards while a card is loading which would trigger a bunch of fetches
    if (this.state.cardSelectionLoading) {
      return
    }
    this.setState({
      cardSelectionLoading: false,
      mobileCardSelected: !initialLoad,
      initialCardSelection: initialLoad,
      selectedCard: parlay,
      selectedCardMarkets: {}
    })
  }

  setPickerSelection = (value) => {
    this.setState({
        pickerSelection: value
    })
  }

  setListFilters = (next) => {
    this.setState({ listFilters: next })
  }

    fetchProfileTabs() {
    const userHasPremiumAccess = hasPremiumAccess(this.context.userAttributes);
    const preferencesQueryParams = buildQueryParams({
      preferredProviders: this.context.resolvedPreferredProviders
    });

    let trendsPromise;
    let sameGameParlayPromise;
    let crossGameParlayPromise;

    if (this.customFeed.player) {
      const playerId = getPlayerId(this.customFeed.player);

      trendsPromise = fetch(
        `${API_HOST}/api/${this.context.league}/v4/players/${playerId}/trends/straights?${preferencesQueryParams}`
      ).then((data) => jsonOrDefault(data, []));

      sameGameParlayPromise = userHasPremiumAccess
        ? fetch(
            `${API_HOST}/api/${this.context.league}/v4/players/${playerId}/trends/parlays?parlayType=SAME_GAME&${preferencesQueryParams}`
          ).then((data) => jsonOrDefault(data, []))
        : noOpPromise([]);

      crossGameParlayPromise = userHasPremiumAccess
        ? fetch(
            `${API_HOST}/api/${this.context.league}/v4/players/${playerId}/trends/parlays?parlayType=CROSS_GAME&${preferencesQueryParams}`
          ).then((data) => jsonOrDefault(data, []))
        : noOpPromise([]);
    } else {
      const teamCode = this.customFeed.teamCode;

      trendsPromise = fetch(
        `${API_HOST}/api/${this.context.league}/v3/teams/${teamCode}/trends/straights?${preferencesQueryParams}`
      ).then((data) => jsonOrDefault(data, []));

      sameGameParlayPromise = userHasPremiumAccess
        ? fetch(
            `${API_HOST}/api/${this.context.league}/v3/teams/${teamCode}/trends/parlays?parlayType=SAME_GAME&${preferencesQueryParams}`
          ).then((data) => jsonOrDefault(data, []))
        : noOpPromise([]);

      crossGameParlayPromise = userHasPremiumAccess
        ? fetch(
            `${API_HOST}/api/${this.context.league}/v3/teams/${teamCode}/trends/parlays?parlayType=CROSS_GAME&${preferencesQueryParams}`
          ).then((data) => jsonOrDefault(data, []))
        : noOpPromise([]);
    }

    Promise.all([trendsPromise, crossGameParlayPromise, sameGameParlayPromise])
      .then(([cards, crossGameParlays, sameGameParlays]) => {
        const profileType = this.customFeed.player ? "player" : "team";

        const trends = cards.filter((card) =>
          supportedTrendFilter(this.context.league, card)
        );

        const sameGameParlayTrends = sameGameParlays.filter((parlay) =>
          supportedSameGameParlayFilter(this.context.league, parlay)
        );

        const crossGameParlayTrends = crossGameParlays.filter((parlay) =>
          supportedCrossGameParlayFilter(this.context.league, parlay)
        );

        const updatedTabs = {
          ...this.state.tabs,
          [profileType]: {
            trends,
            offset: 0,
            loadingBatch: false,
            initialLoadInProgress: false,
            endReached: true,
            lastFetchTime: new Date().getTime()
          },
          sameGameParlay: {
            trends: sameGameParlayTrends,
            offset: 0,
            loadingBatch: false,
            initialLoadInProgress: false,
            endReached: true,
            lastFetchTime: new Date().getTime()
          },
          crossGameParlay: {
            trends: crossGameParlayTrends,
            offset: 0,
            loadingBatch: false,
            initialLoadInProgress: false,
            endReached: true,
            lastFetchTime: new Date().getTime()
          }
        };

        let selectedCard = null;

        if (!this.profile) {
          let presetIndex = this.startingIndex || 0;
          if (presetIndex >= updatedTabs[this.state.pickerSelection].trends.length) {
            presetIndex = 0;
          }

          selectedCard =
            updatedTabs[this.state.pickerSelection].trends.length > presetIndex
              ? updatedTabs[this.state.pickerSelection].trends[presetIndex]
              : null;
        }

        this.setState(
          {
            tabs: updatedTabs,
            selectedCard
          },
          () => {
            if (!this.profile && selectedCard) {
                if (this.state.pickerSelection === "player" || this.state.pickerSelection === "team") {
                    this.cardSelected(selectedCard, true, this.context.currentGames);
                } else if (this.state.pickerSelection === "sameGameParlay") {
                    const selectedIndex = updatedTabs.sameGameParlay.trends.findIndex(
                    (card) => getCardKey(card) === getCardKey(selectedCard)
                    )
                    this.sameGameParlaySelected(selectedCard, true, selectedIndex >= 0 ? selectedIndex : null);
                } else if (this.state.pickerSelection === "crossGameParlay") {
                    const selectedIndex = updatedTabs.crossGameParlay.trends.findIndex(
                    (card) => getCardKey(card) === getCardKey(selectedCard)
                    )
                    this.crossGameParlaySelected(selectedCard, true, selectedIndex >= 0 ? selectedIndex : null);
                }
            }
          }
        );
      })
      .catch(console.error);
  }

  handleAddAllImportedLegsToMyPicks() {
    const importedLegs = this.state.tabs?.[this.state.pickerSelection]?.trends || []

    if (importedLegs.length === 0) {
      return
    }

    this.context.addLegsToBetslip(importedLegs)
  }

  render() {
    const trendsTitle = i18n.t('trends.title')
    const profileTitle = i18n.t('preferences.items.profile')
    const customFeedTitle = this.customFeed?.titleKey
      ? i18n.t(this.customFeed.titleKey, this.customFeed.titleValues || {})
      : this.customFeed?.title
    const customFeedSubtitle = this.customFeed?.subtitleKey
      ? i18n.t(this.customFeed.subtitleKey, this.customFeed.subtitleValues || {})
      : this.customFeed?.subtitle
    const hasCustomFeedTitle = Boolean(customFeedTitle)
    const title = this.customFeed ? customFeedTitle : trendsTitle
    var subtitle = this.customFeed ? customFeedSubtitle : null
    // subtitle date next to list, not sure if necessary but can uncomment if needed
    // if (!this.profile && !subtitle && this.context.currentGames.length > 0) {
    //   switch(SUPPORTED_LEAGUES[this.context.league].scheduleFormat) {
    //     case SCHEDULE_FORMAT_DAILY:
    //       const date = parseDateFromString(this.context.currentGames[0].timestamp)
    //       subtitle = date.formattedDayMonthShort
    //       break;
    //     case SCHEDULE_FORMAT_WEEKLY:
    //       subtitle = this.context.currentGames[0]?.title || null
    //       break;
    //     default:break;
    //   }
    // }
    const annotation = this.customFeed ? this.customFeed.annotation : null
    const without = this.customFeed ? this.customFeed.without : null
    var selectedCard = this.state.selectedCard
    var cardType = 'straight'
    if (selectedCard && !('type' in selectedCard)) {
      cardType = 'parlay'
    }

    const haveCards = this.state.tabs[this.state.pickerSelection].trends.length > 0
    const isMobileView = this.state.width <= 1000
    const profileDisplayName = this.customFeed?.player
        ? getPlayerName(this.customFeed.player)
        : (this.customFeed?.team?.name || this.customFeed?.teamCode || profileTitle)
    const listTitle = this.profile && isMobileView
        ? (
            <button
                type="button"
                className="trends-page-profile-list-title-button"
                onClick={() => this.setState({ profileMobileView: 'workstation' })}
            >
                <p className="text-style-h-4-semibold color-fig-default">{profileDisplayName}</p>
            </button>
        )
        : (this.profile ? profileTitle : (hasCustomFeedTitle ? title : (this?.customFeed?.chipSelectionName ? this?.customFeed?.chipSelectionName : trendsTitle)))
    const profileMobileModeClassName = this.profile ? ` trends-page-main-page-profile-${this.state.profileMobileView}` : ''

    return (
      <div className={`trends-page-container${!haveCards && !this.profile ? ' trends-page-container--no-plays' : ''}`}>
        <div className={`trends-page-main-page ${this.state.mobileCardSelected ? "trends-page-main-page-mobile-detail-active" : ""}${profileMobileModeClassName}`}>
            <div style={{borderLeft: '1px solid var(--color-border-default)'}} className='game-summary-list-column trends-page-list-column'>
                <ListComponent 
                    title={listTitle}
                    subtitle={this.profile ? '' : (hasCustomFeedTitle ? (subtitle || '') : (this?.customFeed?.chipSelectionName ? trendsTitle : ''))}
                    showGamesFilter={true}
                    emptyStateMode='trends'
                    fetchBatch={this.fetchBatch}
                    setListFilters={this.setListFilters}
                    customFeed={this.customFeed}
                    profile={this.profile}
                    pickerOptions={this.pickerOptions}
                    tabs={this.state.tabs}
                    pickerSelection={this.state.pickerSelection}
                    setPickerSelection={this.setPickerSelection}
                    haveCards={haveCards}
                    listFilters={this.state.listFilters}
                    listRef={this.listRef}
                    cardSelected={this.cardSelected}
                    renderList={(state) => {
                        return (
                            <>
                            <div key={`${state.pickerSelection}-${state.tabs[state.pickerSelection].lastFetchTime}`} className='trends-page-list-items'>
                                    {/* Show list of trends if it's not parlay (available to everyone) or for parlay if it's a premium account only */}
                                    {
                                        (
                                            state.tabs[state.pickerSelection].trends.map((card, index) => {
                                                const item = card;
                                                const cardKey = getCardKey(item);
                                                if (state.pickerSelection === "crossGameParlay" || state.pickerSelection === "sameGameParlay") {
                                                    const isSelectedParlayCard =
                                                        this.state.selectedParlayTab === state.pickerSelection &&
                                                        this.state.selectedParlayIndexes?.[state.pickerSelection] === index &&
                                                        this.state.selectedCard &&
                                                        getCardKey(this.state.selectedCard) === cardKey

                                                    return (
                                                        <div
                                                            key={`${cardKey}-${index}`}
                                                            className={`${isSelectedParlayCard ? "trends-page-list-items-item-selected" : "trends-page-list-items-item"}`}
                                                            data-initialSelection={state.initialCardSelection}
                                                            onClick={() => {
                                                                if (this.profile) {
                                                                    this.setState((previousState) => ({
                                                                        detailTabCard: card,
                                                                        selectedCard: card,
                                                                        profileMobileView: 'detail',
                                                                        selectedParlayTab: state.pickerSelection,
                                                                        selectedParlayIndexes: {
                                                                            ...previousState.selectedParlayIndexes,
                                                                            [state.pickerSelection]: index
                                                                        }
                                                                    }))
                                                                    return
                                                                }

                                                                if (state.pickerSelection === "sameGameParlay") {
                                                                    this.sameGameParlaySelected(card, false, index)
                                                                } else {
                                                                    this.crossGameParlaySelected(card, false, index)
                                                                }
                                                            }}
                                                        >
                                                            <TrendCard card={card} parlay={true} />
                                                        </div>
                                                    )
                                                }
                                                const userHasPremiumAccess = hasPremiumAccess(this.context.userAttributes);
                                                return (
                                                    <div key={`${cardKey}-${card.freePreview && !userHasPremiumAccess ? item.iteration : ""}`} 
                                                            className={`${(this.profile ? this.state.detailTabCard : selectedCard) && cardKey === getCardKey(this.profile ? this.state.detailTabCard : selectedCard) ? "trends-page-list-items-item-selected" : "trends-page-list-items-item"}`}
                                                            data-initialSelection={state.initialCardSelection}
                                                            data-freePreview={item.freePreview && !userHasPremiumAccess}
                                                            onClick={() => {
                                                                if (item.freePreview && !userHasPremiumAccess) {
                                                                    window.location.href = '/pricing'
                                                                    return
                                                                }
                                                                if (this.profile) {
                                                                    this.setState({
                                                                        detailTabCard: card,
                                                                        selectedCard: card,
                                                                        profileMobileView: 'detail'
                                                                    })
                                                                    return
                                                                }
                                                                this.cardSelected(card, false, null)
                                                            }}
                                                    >
                                                        {
                                                            item.freePreview && !userHasPremiumAccess && (
                                                                <div className='trends-page-list-items-item-free-preview'>
                                                                    <div className='trends-page-list-items-item-free-preview-left'>
                                                                        <p className='text-style-caption-semibold'>{i18n.t('trends.list.preview.comboTrendPreview')}</p>
                                                                    </div>
                                                                    <div className='trends-page-list-items-item-free-preview-right'>
                                                                        <div>
                                                                            <img src='assets/lock-open.svg' alt='unlocked'/>
                                                                        </div>
                                                                        <p className='text-style-caption-semibold'>{i18n.t('trends.list.preview.tryLinematePlus')}</p>
                                                                    </div>
                                                                </div>
                                                            )
                                                        }
                                                        <TrendContent card={card} league={card.league || this.context.league} highlightedSignalType={this.customFeed?.highlightedSignalType} showNoSignalsFallback={Boolean(this.customFeed?.importedAnalysis || this.customFeed?.importedTrendsKey)}/>
                                                    </div>
                                                )
                                            })
                                        )
                                    }
                                </div>
                                {
                                    this.customFeed?.importedAnalysis &&
                                    !this.customFeed?.isInjuryImpactFeed && (
                                        <div className='trends-page-imported-picks-actions'>
                                            <Button
                                                text={i18n.t('trends.list.actions.addAllLegsToMyPicks')}
                                                typography='md'
                                                type='secondary'
                                                enabled={true}
                                                onClick={this.handleAddAllImportedLegsToMyPicks}
                                            />
                                        </div>
                                    )
                                }
                                {
                                    !state.tabs[state.pickerSelection].endReached && (
                                        <div className='trends-page-list-items-loader'>
                                            <Loader />
                                        </div>
                                    )
                                }
                            </>
                        )
                    }} 
                />
                </div>
                <div className={`trends-page-details ${this.state.mobileCardSelected ? "trends-page-details-mobile-active" : ""}`}>
                    {(selectedCard || this.profile) &&
                        (!this.profile || !isMobileView || this.state.profileMobileView !== 'list') && (
                            <TrendDetails
                                key={this.profile && !isMobileView
                                    ? 'profile'
                                    : this.profile && this.state.profileMobileView === 'detail' && selectedCard
                                        ? `profile-detail-${getCardKey(selectedCard)}`
                                        : this.profile ? 'profile' : getCardKey(selectedCard)}
                                trend={this.profile
                                    ? (!isMobileView || this.state.profileMobileView !== 'detail' ? null : selectedCard)
                                    : selectedCard}
                                detailTrend={this.profile && !isMobileView ? selectedCard : null}
                                workstationSeedTrend={this.profile ? null : selectedCard}
                                source={this.profile
                                    ? (!isMobileView || this.state.profileMobileView !== 'detail' ? 'profile' : 'trends')
                                    : 'trends'}
                                type={this.profile && (!isMobileView || this.state.profileMobileView !== 'detail')
                                    ? 'straight'
                                    : cardType}
                                without={without}
                                customFeed={this.customFeed}
                                crossGame={this.state.pickerSelection === 'crossGameParlay'}
                                hideNestedFooter={false}
                                onMobileClose={() => this.profile
                                    ? this.setState({ profileMobileView: 'list' })
                                    : this.setState({ mobileCardSelected: false })}
                            />
                        )}
                </div>
        </div>
      </div>
    )
  }
}

export default Trends
