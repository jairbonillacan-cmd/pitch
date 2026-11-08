import React from 'react'

import './TrendsWorkstation.scss'
import '../pages/Trends.scss'
import './App.scss'
import GlobalContext from './GlobalContext'

import {
  capitalizeFirstLetter,
  fetchPlayerRecord,
  getBookEntryBasedOnBestOdds,
  getDictionaryValue,
  getGameResultText,
  getPlayerId,
  getPlayerName,
  getPlayerPosition,
  getPreferredOdds,
  getTeamGameResultText,
  hasPremiumAccess,
  isDictEmpty,
  jsonOrDefault,
  noOpPromise,
  parseDateFromString,
  safe
} from '../linemate-react-common/src/util'
import { API_HOST } from '../react-web-constants'
import {
  getLocalizedMarketNameFromId,
  getMarketDescription,
  buildMarketData,
  buildPositionalSupportingStatsRankings,
  buildSupportingStatsRankings,
  buildTrendsData,
  getBetslipLegKey,
  getCardKey,
  getMarketIdFromName,
  getMarketNameFromId,
  getOutcomeTypeByBetType,
  getPlayerWorkstationGames,
  getTeamWorkstationGames,
  isMarketSupported
} from '../linemate-react-common/src/betting-utils'
import Button from './Button'
import { buildGraphData, getTeamIdByCode, getTeamLogoPath, teamLogoPathOnErrorFallback } from '../react-web-utils'
import {
  BET_TYPE_FILTER,
  DEFAULT_SITUATIONS,
  FILTER_QUERY_PARAMETER_LOCATION_VALUE,
  getGamelogSupportingStats,
  getPlayerPositionalBetTypes,
  getPlayerPropInfo,
  OPPONENT_FILTER,
  OUTCOME_TYPE_COVER,
  OUTCOME_TYPE_COVER_YES,
  OUTCOME_TYPE_OVER_UNDER,
  PLAYER_BET_TYPE_ID_TO_NAME,
  PLAYER_BET_TYPES_REVERSE_MAPPING,
  SCREENER_ONLY_PROPS,
  SCREENER_TEAM_SCORING_STATS,
  SITUATIONS,
  TEAM_BET_TYPE_REVERSE_MAPPING,
  TEAM_BETS,
  TIMEFRAME_FILTER,
  WITH_FILTER,
  WITHOUT_FILTER
} from '../linemate-react-common/src/constants'
import InputSelection from './InputSelection'
import HitRateChart from './HitRateChart'
import HitRateChartInfo from './HitRateChartInfo'
import _, { spread } from 'lodash'
import Table from './Table'
import { swapDictionaryKeyValue } from '../linemate-react-common/src/core-utils.js'
import SupportingStats from './SupportingStats.jsx'
import MyPicksWithOffers from './MyPicksWithOffers.jsx'
import WorkstationInjuries from './WorkstationInjuries.jsx'
import QuickPicksSection from './QuickPicksSection.jsx'
import QuickpicksLeg from './QuickpicksLeg.jsx'
import DetailPageTabs from './DetailPageTabs.jsx'
import GamelogDetails from './GamelogDetails.jsx'
import Footer from './Footer.jsx'
import { FILTER_KEYS, FILTER_LABELS } from '../linemate-react-common/src/filter-config'
import { withTranslation } from 'react-i18next'

const FILTER_KEY_BY_LABEL = Object.fromEntries(
  Object.entries(FILTER_LABELS).map(([key, label]) => [label, key])
)

// TODO: extract this and re-use between this and app
//  The swapDictionaryKeyValue is a bit of laziness copied from app code since the filters work backwards here and in app for options
const baseFilters = (currentSeason, hasOpponent, configurationTeamsFilter) => {
  var filters = {}

  filters[FILTER_KEYS.TIMEFRAME] = {
    options: swapDictionaryKeyValue({
      Season: `SEASON_${currentSeason}`,
      'Head to Head': 'N/A',
      'Last 5': 'LAST_5',
      'Last 10': 'LAST_10',
      'Last 20': 'LAST_20',
      'Last 30': 'LAST_30'
    }),
    selectedValue: 'LAST_10',
    filterType: 'single',
    affectsQuery: true
  }

  filters[FILTER_KEYS.SPLITS] = {
    options: swapDictionaryKeyValue({
      'Home+Away': 'ALL',
      Home: 'HOME',
      Away: 'AWAY'
    }),
    selectedValue: 'ALL',
    filterType: 'single',
    affectsQuery: true
  }

  if (!hasOpponent) {
    delete filters[FILTER_KEYS.TIMEFRAME].options['N/A']

    const swappedTeamsFilter = _.cloneDeep(configurationTeamsFilter)
    swappedTeamsFilter.options = swapDictionaryKeyValue(swappedTeamsFilter.options)

    filters[FILTER_KEYS.OPPONENT] = swappedTeamsFilter
    filters[FILTER_KEYS.OPPONENT].selectedValue = Object.keys(swappedTeamsFilter.options)[0]
    filters[FILTER_KEYS.OPPONENT].affectsQuery = true
    filters[FILTER_KEYS.OPPONENT].queryParameterLocation = FILTER_QUERY_PARAMETER_LOCATION_VALUE
  }

  filters[FILTER_KEYS.WITH] = {
    options: {
      all: 'All'
    },
    selectedValue: 'all',
    filterType: 'single',
    affectsQuery: true,
    queryParameterLocation: FILTER_QUERY_PARAMETER_LOCATION_VALUE,
    premium: true
  }

  filters[FILTER_KEYS.WITHOUT] = {
    options: {
      none: 'None'
    },
    selectedValue: 'none',
    filterType: 'single',
    affectsQuery: true,
    queryParameterLocation: FILTER_QUERY_PARAMETER_LOCATION_VALUE,
    premium: true
  }

  return filters
}

const defaultFilters = {
  team: (currentSeason, league, hasOpponent, configurationTeamsFilter) => {
    var teamFilters = {}
    const betTypes = Object.keys(TEAM_BET_TYPE_REVERSE_MAPPING[league])

    teamFilters[FILTER_KEYS.BET_TYPE] = {
      options: Object.fromEntries(betTypes.map((x) => [x, x])),
      selectedValue: betTypes[0],
      filterType: 'single',
      affectsQuery: false
    }

    return Object.assign(
      {},
      teamFilters,
      baseFilters(currentSeason, hasOpponent, configurationTeamsFilter)
    )
  },

  player: (league, currentSeason, playerPosition, hasOpponent, configurationTeamsFilter) => {
    var playerFilters = {}
    const betTypes = getPlayerPositionalBetTypes[league](playerPosition).filter(
      (prop) => !SCREENER_ONLY_PROPS[league].includes(prop)
    )

    playerFilters[FILTER_KEYS.BET_TYPE] = {
      options: Object.fromEntries(betTypes.map((x) => [x, x])),
      selectedValue: betTypes[0],
      filterType: 'single',
      affectsQuery: false
    }

    return Object.assign(
      {},
      playerFilters,
      baseFilters(currentSeason, hasOpponent, configurationTeamsFilter)
    )
  }
}

function updateSelectedValues(filters) {
  const updatedFilters = {}

  Object.keys(filters).forEach((key) => {
    updatedFilters[key] = _.cloneDeep(filters[key])
    updatedFilters[key].options = swapDictionaryKeyValue(updatedFilters[key].options)
    updatedFilters[key].selectedValue = filters[key].options[filters[key].selectedValue]
  })

  return updatedFilters
}

/**
 * Builds the label for the "Trend" tab when detailTrend is set (profile only).
 * @param {Object} card - trend or parlay card from list selection
 * @param {string} league - context.league
 * @returns {string}
 */
function getDetailTabLabel(card, league, t) {
  if (!card) return t('workstation.tabs.trend')
  if (card.legs) return card.crossGame ? t('trends.tabs.parlay') : t('trends.tabs.sgp')

  const marketDescription = getMarketDescription(
    league,
    card.type,
    card.line,
    card.outcome,
    card.market,
    card.alternate,
    t
  )

  return `${card.type === 'player' ? `${card.player.firstName[0]}. ${card.player.lastName}` : card.team.code}: ${marketDescription}` || t('workstation.tabs.trend')
}

/**
 * NOTE:
 * This was originally designed integrated with the trends page where we base the selection on cards
 * All the info from the card is passed in at the same level as props so assigning the props as card
 *  is the quickest solution without having to re-factor a bunch of code
 */
/**
 * Props:
 * - type:string
 * - gameId:string
 * - home:bool
 * - team:{}
 * - opposingTeam:{}
 * - player:{}?
 * - initialMarket:string?
 * - backAction:fn()?
 * - detailTrend: {}?
 * - without: bool?
 */
export class TrendsWorkstation extends React.Component {
  static contextType = GlobalContext

  // TODO: move the trends page styling related to this out here
  constructor(props, context) {
    super(props, context)

    this.filterOptionSelected = this.filterOptionSelected.bind(this)
    this.increaseLine = this.increaseLine.bind(this)
    this.decreaseLine = this.decreaseLine.bind(this)
    this.lineInputChanged = this.lineInputChanged.bind(this)
    this.fetchData = this.fetchData.bind(this)

    this.gamelogTableWrapperRef = React.createRef()
    // Async response guard: each load captures this counter. Changing matchups
    // or unmounting increments it so pending responses cannot update stale state.
    this.matchupVersion = 0
    this.gamelogTableDrag = {
      isDragging: false,
      startX: 0,
      scrollLeft: 0
    }

    const initialLeague = props.leagueOverride || props.league || context.league

    this.state = {
      selectedCard: props,
      filters: {},
      marketLines: {},
      markets: {},
      hitRateLine: props.initialLine || 0,
      filteredGames: [],
      graphData: [],
      // TODO: once we swap the filters we don't need that, we can use the filters selected value
      graphBetType: '',
      gamelogPage: 0,
      teams: [],
      player: null,
      opposingTeam: null,
      opposingPlayer: null,
      supportingStatsRankings: {},
      positionalStatsRankings: {},
      currentSupportingStatsSituation: DEFAULT_SITUATIONS[initialLeague],
      comparableSupportingStatsSituation: DEFAULT_SITUATIONS[initialLeague],
      positionalSituation: 'all',
      currentWidth: document.documentElement.clientWidth,
      activeTab: 'workstation'
    }
  }

  getEffectiveLeague(card = this.state?.selectedCard || this.props) {
    return card?.league || this.props.leagueOverride || this.context.league
  }

  getWorkstationCard() {
    const card = this.props
    if (card.opposingTeam?.code || card.opposingTeam?.teamId || card.opposingTeam?.id) {
      return card
    }

    // Profiles don't pass matchup data. Resolve it from the current gameday,
    // keeping an explicit game selection and league separate from other games.
    const game = this.getEffectiveLeague(card) === this.context.league
      ? this.context.currentGames?.find((game) =>
          (!card.gameId || game.id === card.gameId) &&
          [game.homeTeamData?.info, game.awayTeamData?.info].some(
            (team) => team?.code === card.team.code
          )
        )
      : null
    const home = game?.homeTeamData?.info?.code === card.team.code
    const opposingTeam = game && (home ? game.awayTeamData?.info : game.homeTeamData?.info)

    return {
      ...card,
      ...(opposingTeam ? { gameId: game.id, home } : {}),
      opposingTeam: opposingTeam || null
    }
  }

  getConfigurationTeamsFilter(effectiveLeague) {
    const configuredFilter =
      this.context.configuration?.leaderboard?.[effectiveLeague]?.filterGroups?.player?.team
    return {
      ...configuredFilter,
      // v3 uses null for the localized "All" option. Keep a stable UI selection key.
      options: Object.fromEntries(
        Object.entries(configuredFilter?.options || { 'All Opponents': null })
          .map(([label, teamId]) => [label, teamId ?? 'ALL'])
      ),
      filterType: 'single'
    }
  }

  getFilterDisplayName(filter) {
    return (
      this.props.t(`common.filters.titles.${filter}`, { defaultValue: '' }) ||
      this.props.t(`workstation.filters.${filter}`, { defaultValue: '' }) ||
      FILTER_LABELS[filter] ||
      capitalizeFirstLetter(filter)
    )
  }

  getWorkstationTableColumnLabel(columnName) {
    if (columnName === 'DATE') return this.props.t('trends.analysis.gamelog.headers.date')
    if (columnName === 'OPPONENT') return this.props.t('workstation.headers.opponent')
    if (columnName === 'RESULT') return this.props.t('trends.analysis.gamelog.headers.result')

    return this.props.t(`common.statHeaders.${columnName}`, { defaultValue: columnName })
  }

  getWorkstationFilterOptions(filter, options, effectiveLeague, selectedCard) {
    if (filter === FILTER_KEYS.BET_TYPE) {
      return Object.fromEntries(
        Object.entries(options).map(([key, label]) => {
          const betTypeId = getMarketIdFromName(effectiveLeague, selectedCard.type, key)
          return [key, this.props.t(`betTypes.${betTypeId}`, { defaultValue: label })]
        })
      )
    }

    if (filter === FILTER_KEYS.TIMEFRAME) {
      return Object.fromEntries(
        Object.entries(options).map(([key, label]) => {
          const labelKeyByValue = {
            [`SEASON_${this.context.configuration.leagues[effectiveLeague].currentSeason}`]: 'season',
            'N/A': 'headToHead',
            LAST_5: 'last5',
            LAST_10: 'last10',
            LAST_20: 'last20',
            LAST_30: 'last30',
          }

          const labelKey = labelKeyByValue[key]
          return [
            key,
            labelKey
              ? this.props.t(`common.filters.options.timeframe.${labelKey}`, { defaultValue: label })
              : label,
          ]
        })
      )
    }

    if (filter === FILTER_KEYS.SPLITS) {
      return Object.fromEntries(
        Object.entries(options).map(([key, label]) => {
          const labelKeyByValue = {
            ALL: 'all',
            HOME: 'home',
            AWAY: 'away',
          }

          const labelKey = labelKeyByValue[key]
          return [
            key,
            labelKey
              ? this.props.t(`common.filters.options.splits.${labelKey}`, { defaultValue: label })
              : label,
          ]
        })
      )
    }

    if (filter === FILTER_KEYS.WITH) {
      return Object.fromEntries(
        Object.entries(options).map(([key, label]) => [
          key,
          key === 'all' ? this.props.t('workstation.filters.all') : label,
        ])
      )
    }

    if (filter === FILTER_KEYS.WITHOUT) {
      return Object.fromEntries(
        Object.entries(options).map(([key, label]) => [
          key,
          key === 'none' ? this.props.t('workstation.filters.none') : label,
        ])
      )
    }

    return options
  }

  componentDidMount() {
    // Workaround when porting the trends workstation as a generic component
    // This was originally designed integrated with the trends page where we base the selection on cards
    // All the info from the card is passed in at the same level as props so doing this is the quickest solution without having to re-factor a bunch of code
    const card = this.getWorkstationCard()
    const effectiveLeague = this.getEffectiveLeague(card)
    const currentSeason = this.context.configuration.leagues[effectiveLeague].currentSeason
    const hasOpponent = Boolean(card.opposingTeam)
    const configurationTeamsFilter = this.getConfigurationTeamsFilter(effectiveLeague)

    var filters = {}
    if (card.type === 'team') {
      filters = defaultFilters[card.type](
        currentSeason,
        effectiveLeague,
        hasOpponent,
        configurationTeamsFilter
      )
      if (this.props.initialMarket && this.props.initialMarket in TEAM_BETS[effectiveLeague]) {
        filters[FILTER_KEYS.BET_TYPE].selectedValue =
          TEAM_BETS[effectiveLeague][this.props.initialMarket].displayName
      }
    } else if (card.type === 'player') {
      filters = defaultFilters[card.type](
        effectiveLeague,
        currentSeason,
        card.player.position,
        hasOpponent,
        configurationTeamsFilter
      )
      if (
        this.props.initialMarket &&
        this.props.initialMarket in PLAYER_BET_TYPE_ID_TO_NAME[effectiveLeague]
      ) {
        filters[FILTER_KEYS.BET_TYPE].selectedValue =
          PLAYER_BET_TYPE_ID_TO_NAME[effectiveLeague][this.props.initialMarket]
      }
    }

    window.addEventListener('resize', this.onResize)
    document.addEventListener('mousemove', this.handleGameLogTableMouseMove)
    document.addEventListener('mouseup', this.handleGameLogTableMouseUp)
    
    const promises = []
    promises.push(
      fetch(`${API_HOST}/api/${effectiveLeague}/v3/teams/${card.team.code}/roster`).then(
        (data) => data.json()
      )
    )
    this.setState(
      {
        selectedCard: card,
        filteredGames: [],
        gamelogPage: 0,
        filters: filters
      },
      () => {
        Promise.all(promises)
          .then((data) => {
            const tempState = this.state
            const roster = data[0]
            roster.forEach((player) => {
              tempState.filters[FILTER_KEYS.WITH].options[getPlayerId(player.info)] = getPlayerName(
                player.info
              )
              tempState.filters[FILTER_KEYS.WITHOUT].options[getPlayerId(player.info)] = getPlayerName(
                player.info
              )
            })
            if (
              this.props.without &&
              this.props.without.id &&
              this.props.without.id in tempState.filters[FILTER_KEYS.WITHOUT].options
            ) {
              tempState.filters[FILTER_KEYS.WITHOUT].selectedValue = this.props.without.id
            }
            if (this.props.filtersToExclude) {
              this.props.filtersToExclude.forEach((filter) => {
                const normalizedFilter = FILTER_KEY_BY_LABEL[filter] || filter
                if (normalizedFilter in tempState.filters) {
                  delete tempState.filters[normalizedFilter]
                }
              })
            }
            this.setState(tempState, () => this.fetchData(tempState, true))
          })
          .catch((err) => {
            console.log(err)
          })
      }
    )
  }

  componentDidUpdate(prevProps) {
    const { detailTrend } = this.props
    if (detailTrend && detailTrend !== prevProps.detailTrend) {
      this.setState({ activeTab: 'trend' })
    }

    const card = this.getWorkstationCard()
    const previousCard = this.state.selectedCard
    if (
      card.gameId !== previousCard.gameId ||
      card.home !== previousCard.home ||
      card.opposingTeam?.code !== previousCard.opposingTeam?.code ||
      card.opposingTeam?.teamId !== previousCard.opposingTeam?.teamId ||
      card.opposingTeam?.id !== previousCard.opposingTeam?.id
    ) {
      const effectiveLeague = this.getEffectiveLeague(card)
      const matchupFilters = baseFilters(
        this.context.configuration.leagues[effectiveLeague].currentSeason,
        Boolean(card.opposingTeam),
        this.getConfigurationTeamsFilter(effectiveLeague)
      )
      const filters = _.cloneDeep(this.state.filters)
      const timeframe = filters[FILTER_KEYS.TIMEFRAME]
      if (timeframe) {
        timeframe.options = matchupFilters[FILTER_KEYS.TIMEFRAME].options
        if (!(timeframe.selectedValue in timeframe.options)) {
          timeframe.selectedValue = 'LAST_10'
        }
      }
      delete filters[FILTER_KEYS.OPPONENT]
      if (matchupFilters[FILTER_KEYS.OPPONENT]) {
        filters[FILTER_KEYS.OPPONENT] = matchupFilters[FILTER_KEYS.OPPONENT]
      }
      for (const filter of this.props.filtersToExclude || []) {
        delete filters[FILTER_KEY_BY_LABEL[filter] || filter]
      }

      // Invalidate responses for the previous matchup before loading the new one.
      this.matchupVersion += 1
      this.setState({
        selectedCard: card,
        filters,
        opposingTeam: null,
        opposingPlayer: null,
        gamelogPage: 0
      }, () => this.fetchData(this.state, true))
    }
  }

  componentWillUnmount() {
    // Invalidate pending loads so they cannot call setState after unmounting.
    this.matchupVersion += 1
    window.removeEventListener('resize', this.onResize)
    document.removeEventListener('mousemove', this.handleGameLogTableMouseMove)
    document.removeEventListener('mouseup', this.handleGameLogTableMouseUp)
  }

  onResize = () => {
    this.setState({currentWidth: document.documentElement.clientWidth})
  }

  handleGameLogTableMouseDown = (event) => {
    if (!event.target.closest('.table-component-wrapper')) {
      return
    }

    const tableWrapper = this.gamelogTableWrapperRef.current

    if (!tableWrapper) {
      return
    }

    const actualWrapper = tableWrapper.querySelector('.table-component-wrapper')
    console.log({
      scrollWidth: actualWrapper?.scrollWidth,
      clientWidth: actualWrapper?.clientWidth,
      target: event.target,
      wrapper: actualWrapper
    })
    if (!actualWrapper || actualWrapper.scrollWidth <= actualWrapper.clientWidth) {
      return
    }

    this.gamelogTableDrag = {
      isDragging: true,
      startX: event.clientX,
      scrollLeft: actualWrapper.scrollLeft
    }

    tableWrapper.classList.add('trends-page-game-log-table--dragging')
    event.preventDefault()
    event.stopPropagation()
  }

  handleGameLogTableMouseMove = (event) => {
    if (!this.gamelogTableDrag.isDragging) {
      return
    }

    const tableWrapper = this.gamelogTableWrapperRef.current

    if (!tableWrapper) {
      return
    }

    const actualWrapper = tableWrapper.querySelector('.table-component-wrapper')

    if (!actualWrapper) {
      return
    }

    const walk = event.clientX - this.gamelogTableDrag.startX
    actualWrapper.scrollLeft = this.gamelogTableDrag.scrollLeft - walk
    event.preventDefault()
  }

  handleGameLogTableMouseUp = () => {
    this.gamelogTableDrag.isDragging = false
    this.gamelogTableWrapperRef.current?.classList.remove('trends-page-game-log-table--dragging')
  }

  handleGameLogTableMouseLeave = () => {
    this.gamelogTableDrag.isDragging = false
    this.gamelogTableWrapperRef.current?.classList.remove('trends-page-game-log-table--dragging')
  }

  increaseLine() {
    this.setState((previousState) => {
      const effectiveLeague = this.getEffectiveLeague(previousState.selectedCard)
      const newLine = previousState.hitRateLine + 0.5
      return {
        hitRateLine: newLine,
        graphData: buildGraphData(effectiveLeague, previousState.selectedCard.type, previousState.filters[FILTER_KEYS.BET_TYPE].selectedValue, previousState.selectedCard.team.code, previousState.filteredGames, newLine),
        trends: buildTrendsData(
          effectiveLeague,
          previousState.selectedCard.type,
          previousState.filteredGames,
          previousState.filters[FILTER_KEYS.BET_TYPE].selectedValue,
          newLine
        )
      }
    })
  }

  decreaseLine() {
    this.setState((previousState) => {
      const effectiveLeague = this.getEffectiveLeague(previousState.selectedCard)
      const newLine = previousState.hitRateLine - 0.5
      return {
        hitRateLine: newLine,
        graphData: buildGraphData(effectiveLeague, previousState.selectedCard.type, previousState.filters[FILTER_KEYS.BET_TYPE].selectedValue, previousState.selectedCard.team.code, previousState.filteredGames, newLine),
        trends: buildTrendsData(
          effectiveLeague,
          previousState.selectedCard.type,
          previousState.filteredGames,
          previousState.filters[FILTER_KEYS.BET_TYPE].selectedValue,
          newLine
        )
      }
    })
  }

  lineInputChanged(event) {
    this.setState((previousState) => {
      const effectiveLeague = this.getEffectiveLeague(previousState.selectedCard)
      const newLine = parseFloat(event.target.value)
      return {
        hitRateLine: newLine,
        graphData: buildGraphData(effectiveLeague, previousState.selectedCard.type, previousState.filters[FILTER_KEYS.BET_TYPE].selectedValue, previousState.selectedCard.team.code, previousState.filteredGames, newLine),
        trends: buildTrendsData(
          effectiveLeague,
          previousState.selectedCard.type,
          previousState.filteredGames,
          previousState.filters[FILTER_KEYS.BET_TYPE].selectedValue,
          newLine
        )
      }
    })
  }

  filterOptionSelected(filter, value) {
    // If it's the same that's already selected don't do anything
    if (this.state.filters[filter].selectedValue === value) {
      return
    }
    var tempState = this.state
    const effectiveLeague = this.getEffectiveLeague(tempState.selectedCard)
    tempState.filters[filter].selectedValue = value
    // Only one between with/without can be active at once, resetting the opposite if one is selected
    if (filter === FILTER_KEYS.WITH) {
      tempState.filters[FILTER_KEYS.WITHOUT].selectedValue = Object.keys(
        tempState.filters[FILTER_KEYS.WITHOUT].options
      )[0]
    }
    if (filter === FILTER_KEYS.WITHOUT) {
      tempState.filters[FILTER_KEYS.WITH].selectedValue = Object.keys(
        tempState.filters[FILTER_KEYS.WITH].options
      )[0]
    }
    if (filter === FILTER_KEYS.BET_TYPE) {
      const betType = tempState.filters[FILTER_KEYS.BET_TYPE].selectedValue
      const selectedMarketId = getMarketIdFromName(
        effectiveLeague,
        tempState.selectedCard.type,
        betType
      )
      tempState.hitRateLine = tempState.marketLines[selectedMarketId]?.mainLine || 0
    }
    if (this.state.filters[filter].affectsQuery) {
      this.fetchData(tempState)
    } else {
      tempState.trends = buildTrendsData(
        effectiveLeague,
        tempState.selectedCard.type,
        tempState.filteredGames,
        tempState.filters[FILTER_KEYS.BET_TYPE].selectedValue,
        tempState.hitRateLine
      )
      tempState.graphData = buildGraphData(
        effectiveLeague,
        tempState.selectedCard.type,
        tempState.filters[FILTER_KEYS.BET_TYPE].selectedValue,
        tempState.selectedCard.team.code,
        tempState.filteredGames,
        tempState.hitRateLine
      )
      tempState.graphBetType = tempState.filters[FILTER_KEYS.BET_TYPE].selectedValue
      this.setState(tempState)
    }
  }

  fetchData(state, initialLoad) {
    const effectiveLeague = this.getEffectiveLeague(state.selectedCard)
    if (!state.selectedCard) {
      return
    }
    // Capture the matchup this load belongs to, including any follow-up pitcher fetch.
    const matchupVersion = this.matchupVersion
    const type = state.selectedCard.type
    const teamCode = state.selectedCard.team.code
    const teamId =
      state.selectedCard.team.teamId ||
      state.selectedCard.team.id ||
      getTeamIdByCode(this.context.teams, teamCode)
    const opposingTeamCode = state.selectedCard.opposingTeam?.code || null
    const opposingTeamId =
      state.selectedCard.opposingTeam?.teamId ||
      state.selectedCard.opposingTeam?.id ||
      getTeamIdByCode(this.context.teams, opposingTeamCode)
    const playerId = type === 'player' ? getPlayerId(state.selectedCard.player) : ''
    const updatedSelectedFilters = updateSelectedValues(state.filters)
    const currentSeason =
      this.context.configuration.leagues[effectiveLeague].currentSeason
    const fetchSupportingStats = type === 'player' && opposingTeamCode
    // 0 = historical games
    // 1 = team or player record (if initial load)
    // 2 = markets (if initial load)
    // 3 = all teams (if applicable)
    // 4 = current game (if applicable)
    // Wherever we have noOpPromises it's just to maintain the indexes the same all the time
    var promises = [
      type === 'team'
        ? teamId
          ? getTeamWorkstationGames(
              API_HOST,
              effectiveLeague,
              currentSeason,
              teamId,
              opposingTeamId,
              updatedSelectedFilters
            ).then((response) => response.json())
          : noOpPromise([])
        : getPlayerWorkstationGames(
            API_HOST,
            effectiveLeague,
            currentSeason,
            opposingTeamId,
            updatedSelectedFilters,
            playerId
          ).then((response) => response.json())
    ]
    if (initialLoad) {
      if (type === 'team') {
        promises.push(
          fetch(`${API_HOST}/api/${effectiveLeague}/v3/teams/${teamCode}`).then((response) =>
            response.json()
          )
        )
        promises.push(
          fetch(
            `${API_HOST}/api/${effectiveLeague}/v3/teams/${teamCode}/markets?includeGameLevelMarkets=true`
          )
            .then((response) => jsonOrDefault(response, []))
            .then((markets) =>
              markets.filter((market) =>
                isMarketSupported(effectiveLeague, 'team', market.name)
              )
            )
        )
      } else {
        promises.push(fetchPlayerRecord(API_HOST, effectiveLeague, playerId, false))
        promises.push(
          fetch(`${API_HOST}/api/${effectiveLeague}/v4/players/${playerId}/markets`)
            .then((response) => jsonOrDefault(response, []))
            .then((markets) =>
              markets.filter((market) =>
                isMarketSupported(effectiveLeague, 'player', market.name)
              )
            )
        )
      }
    } else {
      promises.push(noOpPromise({}))
      promises.push(noOpPromise({}))
    }
    if (fetchSupportingStats && initialLoad) {
      // Note: the reason we get all the teams here as opposed to just getting the opposing team's record is because we need all the teams to build the stats ranking
      // Ideally we would process the ranking daily and save it to the team record so we don't have to do this but right now that's what we have
      // For the individual team record we then get it from the list by filtering it down based on opposing team code
      promises.push(
        fetch(`${API_HOST}/api/${effectiveLeague}/v3/teams`).then((data) => data.json())
      )
    } else {
      promises.push(noOpPromise(state.teams))
    }
    const getGame =
      initialLoad &&
      effectiveLeague === 'mlb' &&
      type === 'player' &&
      !['P', 'SP', 'RP'].includes(state.selectedCard.player.position) &&
      state.selectedCard.gameId
    if (getGame) {
      // Get the game data for mlb when the subject is a player and is not a pitcher
      // This allows us to check the opposing team's starting pitcher if we have it
      promises.push(
        fetch(`${API_HOST}/api/${effectiveLeague}/v3/games/${state.selectedCard.gameId}`).then(
          (data) => data.json()
        )
      )
    } else {
      promises.push(noOpPromise({}))
    }
    safe(Promise.all(promises)).then((responses) => {
      // Ignore results if the matchup changed or the workstation was unmounted.
      if (matchupVersion !== this.matchupVersion) return
      const games = Array.isArray(responses[0]) ? responses[0] : []
      const betType = updatedSelectedFilters[FILTER_KEYS.BET_TYPE].selectedValue
      state.filteredGames = games
      state.graphBetType = betType
      if (initialLoad) {
        const markets = Object.fromEntries(responses[2].map((market) => [market.name, market]))
        state.markets = markets
        const subject = responses[1]
        const marketLines = {}
        Object.keys(markets).forEach((marketId) => {
          marketLines[marketId] = buildMarketData(
            effectiveLeague,
            this.context.userAttributes,
            type,
            markets,
            marketId,
            this.context.resolvedPreferredProviders
          )
          if (marketId === this.props.initialMarket && this.props.initialLine) {
            marketLines[marketId].mainLine = this.props.initialLine
          }
        })
        state.marketLines = marketLines
        if (type === 'player') {
          state.player = subject
        }
        const selectedMarketId = getMarketIdFromName(effectiveLeague, type, betType)
        state.hitRateLine = state.marketLines[selectedMarketId]?.mainLine || 0
      }
      state.graphData = buildGraphData(effectiveLeague, type, betType, teamCode, games, state.hitRateLine)
      if (fetchSupportingStats && initialLoad && !isDictEmpty(responses[1])) {
        const teams = responses[3]
        state.teams = teams
        state.opposingTeam = teams.find((team) => team.code === opposingTeamCode || team.teamId === opposingTeamId || team.id === opposingTeamId)
        state.supportingStatsRankings = buildSupportingStatsRankings(
          effectiveLeague,
          teams,
          SITUATIONS[effectiveLeague]
        )
        state.positionalStatsRankings = buildPositionalSupportingStatsRankings(
          effectiveLeague,
          teams
        )
      } else if (fetchSupportingStats) {
        state.opposingTeam = state.teams.find((team) => team.code === opposingTeamCode || team.teamId === opposingTeamId || team.id === opposingTeamId)
        state.supportingStatsRankings = buildSupportingStatsRankings(
          effectiveLeague,
          state.teams,
          SITUATIONS[effectiveLeague]
        )
        state.positionalStatsRankings = buildPositionalSupportingStatsRankings(
          effectiveLeague,
          state.teams
        )
      }
      state.trends = buildTrendsData(effectiveLeague, type, games, betType, state.hitRateLine)
      this.setState(state, () => {
        if (getGame) {
          const game = responses[4]
          const opposingTeamData = [game.homeTeamData, game.awayTeamData].find(
            (x) => x && x.info && x.info.code !== teamCode
          )
          if (opposingTeamData?.startingPitcher) {
            fetchPlayerRecord(
              API_HOST,
              effectiveLeague,
              opposingTeamData.startingPitcher.SRGUID,
              false
            ).then((players) => {
              // The matchup may also change while the opposing pitcher is loading.
              if (matchupVersion !== this.matchupVersion) return
              this.setState({ opposingPlayer: players })
            })
          }
        }
      })
    })
  }

  buildBetslipLeg(outcome, book) {
    const effectiveLeague = this.getEffectiveLeague(this.state.selectedCard)
    const marketData = this.state.markets[
      getMarketIdFromName(
        effectiveLeague,
        this.state.selectedCard.type,
        this.state.filters[FILTER_KEYS.BET_TYPE]?.selectedValue
      )
    ]

    if (marketData) {
      return {
        league: effectiveLeague,
        line: this.state.hitRateLine,
        market: marketData,
        book: book,
        team: marketData.team,
        opposingTeam: marketData.opposingTeam,
        player: marketData.player,
        gameId: marketData.gameId,
        home: marketData.isHome,
        outcome: outcome,
        type: marketData.level === 'player' ? 'player' : 'team',
        alternate:
          this.state.hitRateLine !==
          this.state.marketLines[
            getMarketIdFromName(
              effectiveLeague,
              this.state.selectedCard.type,
              this.state.filters[FILTER_KEYS.BET_TYPE]?.selectedValue
            )
          ]?.mainLine
      }
    }
  }

  addPick(outcome, book){
    if (outcome === 'cover_yes') outcome = 'cover'
    const leg = this.buildBetslipLeg(outcome, book)
    const key = getBetslipLegKey(leg.league, leg)
    if (key in this.context.betslip.legs) {
      this.context.removeLegsFromBetslip([leg])
    } else {
      this.context.addLegsToBetslip([leg])
    }
  }

  buildQuickPicksLegs({includeLineData, legs}) {
    const hitRateLine = this.state.hitRateLine
    const betTypeLabel = this.state.filters[FILTER_KEYS.BET_TYPE]?.selectedValue

    return legs.filter(Boolean).map(({ key, label, book, bookName, odds }) => (
      <QuickpicksLeg 
        key={key}
        label={label}
        {...(includeLineData ? { hitRateLine, betTypeLabel } : {})}
        disabled={!book}
        selected={
          book && (() => {
            const builtLeg = this.buildBetslipLeg(key, bookName)
            return builtLeg && (getBetslipLegKey(builtLeg.league, builtLeg) in this.context.betslip.legs)
          })()
        }
        onClick={() => this.addPick(key, bookName)}
        formattedOdds={getPreferredOdds(this.context.userAttributes, odds, true)}
        bookName={book ? bookName : null}
      />
    ))
  }

  // TODO: for the pricing page redirect, set proper origin
  // TODO: average for player
  render() {
    const userHasPremiumAccess = hasPremiumAccess(this.context.userAttributes)
    const selectedCard = this.state.selectedCard
    const effectiveLeague = this.getEffectiveLeague(selectedCard)
    const marketName = this.state.filters[FILTER_KEYS.BET_TYPE]
      ? this.state.filters[FILTER_KEYS.BET_TYPE].selectedValue
      : null
    var betOutcomeType = OUTCOME_TYPE_OVER_UNDER
    if (marketName && selectedCard && selectedCard.type === 'team') {
      const marketId = TEAM_BET_TYPE_REVERSE_MAPPING[effectiveLeague][marketName]
      const betDetails = TEAM_BETS[effectiveLeague][marketId]
      betOutcomeType = betDetails.outcomeType
    }
    const isCoverOutcome =
      betOutcomeType === OUTCOME_TYPE_COVER || betOutcomeType === OUTCOME_TYPE_COVER_YES

    var gamelogSupportingStats = {}
    var playerSupportingStats = {}
    var opposingSupportingStats = {}
    var supportingStatsRankings = {}
    var supportingStatsPositionalRankings = {}
    if (marketName && selectedCard && selectedCard.type === 'player') {
      const marketId = PLAYER_BET_TYPES_REVERSE_MAPPING[effectiveLeague][marketName]
      const playerPropInfo = getPlayerPropInfo[effectiveLeague](
        marketId,
        this.state.currentSupportingStatsSituation
      )
      gamelogSupportingStats = getGamelogSupportingStats[effectiveLeague](playerPropInfo)
      playerSupportingStats = playerPropInfo.supportingStats
      const comparablePlayerPropInfo = getPlayerPropInfo[effectiveLeague](
        marketId,
        this.state.comparableSupportingStatsSituation
      )
      opposingSupportingStats =
        this.state.positionalSituation === 'all'
          ? comparablePlayerPropInfo?.opposingSupportingStats
          : comparablePlayerPropInfo?.opposingPositionalSupportingStats ||
            comparablePlayerPropInfo?.opposingSupportingStats
      if (this.state.comparableSupportingStatsSituation in this.state.supportingStatsRankings) {
        supportingStatsRankings =
          this.state.supportingStatsRankings[this.state.comparableSupportingStatsSituation][
            marketId
          ]
      }
      supportingStatsPositionalRankings = this.state.positionalStatsRankings?.[marketId]
    } else {
      gamelogSupportingStats = SCREENER_TEAM_SCORING_STATS(
        effectiveLeague,
        'cumulativeStats',
        'offensive'
      )
    }

    const selectedBetType = getMarketIdFromName(
        effectiveLeague,
        this.state.selectedCard.type,
        this.state.filters[FILTER_KEYS.BET_TYPE]?.selectedValue
      )

    const selectedBetTypeMarket = this.state.markets[selectedBetType];
    const alternate = this.state.hitRateLine !== this.state.marketLines[getMarketIdFromName(effectiveLeague, this.state.selectedCard.type, this.state.filters[FILTER_KEYS.BET_TYPE]?.selectedValue)]?.mainLine;
    
    const overBookName = this.state.marketLines[selectedBetType]?.lines[this.state.hitRateLine]?.["over"]?.book?.toLowerCase()
    const underBookName = this.state.marketLines[selectedBetType]?.lines[this.state.hitRateLine]?.["under"]?.book?.toLowerCase()
    const spreadBookName = this.state.marketLines?.[selectedBetType]?.lines?.[this.state.hitRateLine]?.["cover"]?.book?.toLowerCase()
    const yesNoCoverBookName = getBookEntryBasedOnBestOdds(this?.state?.markets?.[selectedBetType]?.books, 'cover', 0, this.context.resolvedPreferredProviders, false)
    let overBook = selectedBetTypeMarket?.books[overBookName]
    let underBook = selectedBetTypeMarket?.books[underBookName]
    let spreadBook = selectedBetTypeMarket?.books[spreadBookName]
    let yesNoCoverBook = selectedBetTypeMarket?.books?.[yesNoCoverBookName]

    if (overBook) overBook.bookName = overBookName
    if (underBook) underBook.bookName = underBookName
    if (spreadBook) spreadBook.bookName = spreadBookName
    if (yesNoCoverBook) yesNoCoverBook.bookName = yesNoCoverBookName

    const overOdds = overBook?.over.current.value === this.state.hitRateLine ? overBook?.over.current.odds : overBook?.over.alternates[this.state.hitRateLine].odds;
    const underOdds = underBook?.under.current.value === this.state.hitRateLine ? underBook?.under.current.odds : underBook?.under.alternates[this.state.hitRateLine].odds;
    const spreadOdds = spreadBook?.cover.current.value === this.state.hitRateLine ? spreadBook?.cover.current.odds : spreadBook?.cover?.alternates?.[this.state.hitRateLine]?.odds;
    const yesNoCoverOdds = this.state.markets[selectedBetType]?.books?.[yesNoCoverBookName]?.cover?.current?.odds
    
    let quickPickLegs = []
    const selectedMarketOutcomeType = getOutcomeTypeByBetType(effectiveLeague, selectedBetType, this.props.type)
    if (selectedMarketOutcomeType === 'COVER') {
        quickPickLegs = this.buildQuickPicksLegs({
          includeLineData: false,
          legs: [
            { key: "cover", label: this.props.t("common.filters.options.outcome.cover"), book: spreadBook, bookName: spreadBookName, odds: spreadOdds }
          ]
        })
    } else if (selectedMarketOutcomeType === 'COVER_YES') {
        quickPickLegs = this.buildQuickPicksLegs({
          includeLineData: false,
          legs: [
            { key: 'cover_yes', label: getLocalizedMarketNameFromId(this.props.t, effectiveLeague, 'team', selectedBetType), book: yesNoCoverBook, bookName: yesNoCoverBookName, odds: yesNoCoverOdds }
          ]
        })
    } else if (selectedMarketOutcomeType === 'OVER_UNDER') {
      quickPickLegs = this.buildQuickPicksLegs({
        includeLineData: true,
        legs: [
          { key: "over", label: this.props.t("common.filters.options.outcome.over"), book: overBook, bookName: overBookName, odds: overOdds },
          { key: "under", label: this.props.t("common.filters.options.outcome.under"), book: underBook, bookName: underBookName, odds: underOdds },
        ]
      })
    }

    const detailTrend = this.props.detailTrend
    const detailTabKey = 'trend'
    const trendTabLabel = detailTrend ? getDetailTabLabel(detailTrend, effectiveLeague, this.props.t) : null
    const tabs = [
      {
        key: 'workstation',
        label: this.props.t('workstation.tabs.workstation'),
      },
      ...(trendTabLabel ? [{ key: detailTabKey, label: trendTabLabel }] : []),
    ]
    const injuriesCard = this.props.detailTrend || this.state.selectedCard

    return (
      <>
        <DetailPageTabs 
          tabs={tabs}
          activeTab={this.state.activeTab}
          onTabClick={(tab) => this.setState({ activeTab: tab })}
        />
        {this.state.activeTab === 'workstation' && (
          <>
        <div className="trends-page-details-filters">
          <div className="trends-page-details-filters-wrapper">
            {Object.keys(this.state.filters).map((filter) => (
              <div
                key={filter}
                className="trends-page-details-filters-wrapper-filter"
                style={{ '--filters-count': Object.keys(this.state.filters).length }}>
                <div className="trends-page-details-filters-wrapper-filter-header">
                  <p className="text-style-label-medium">{this.getFilterDisplayName(filter)}</p>
                  {this.state.filters[filter].premium && !userHasPremiumAccess && (
                    <img src="assets/lock.svg" height={16} width={16} alt="lock" />
                  )}
                </div>
                <div className="trends-page-details-filters-wrapper-filter-input-selection">
                  <InputSelection
                    enabled={!this.state.filters[filter].premium || userHasPremiumAccess}
                    type="single"
                    typography="md"
                    options={this.getWorkstationFilterOptions(
                      filter,
                      this.state.filters[filter].options,
                      effectiveLeague,
                      selectedCard
                    )}
                    selection={this.state.filters[filter].selectedValue}
                    selectionHandler={(selection) => this.filterOptionSelected(filter, selection)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Charts Workstation */}
        <div className='trends-page-details-with-table-wrapper'>
        <div className='trends-page-details-main-content'>
          <div className="trends-page-details-hit-rate">
            <p className="text-style-h-3-medium">{this.props.t('workstation.headers.hitRate')}</p>
            <div className="trends-page-details-hit-rate-wrapper">
              {/* Over Under Line bar */}
              <HitRateChartInfo
                leagueOverride={effectiveLeague}
                hitRateLine={this.state.hitRateLine}
                lineInputChanged={this.lineInputChanged}
                decreaseLine={this.decreaseLine}
                increaseLine={this.increaseLine}
                trends={this.state.trends}
                filteredGames={this.state.filteredGames}
                isCoverOutcome={isCoverOutcome}
                selectedCard={selectedCard}
                resultAverage={this.state.trends?.resultAverage}
                marketOutcomeType={this.state?.marketLines?.[selectedBetType]?.marketOutcomeType}
              />

              <div>
                <HitRateChart
                  line={this.state.hitRateLine}
                  graphData={this.state.graphData}
                  graphLegendKeys={[this.state.graphBetType]}
                />
              </div>
            </div>
            {selectedCard.type === 'player' && this.state.player && this.state.opposingTeam && (
              <>
              
              <SupportingStats
                leagueOverride={effectiveLeague}
                supportingStats={playerSupportingStats}
                teamId={this.state.selectedCard.team.teamId}
                playerRecord={this.state.player}
                opposingSupportingStats={opposingSupportingStats}
                opponentType={this.state.opposingPlayer ? 'player' : 'team'}
                opponent={this.state.opposingPlayer || this.state.opposingTeam}
                opposingTeamCode={this.state.opposingTeam?.code || ''}
                opposingTeamId={this.state.opposingTeam?.teamId}
                displaySituations={
                  !isDictEmpty(SITUATIONS[effectiveLeague]) &&
                  Object.keys(SITUATIONS[effectiveLeague]).length > 1
                }
                situations={SITUATIONS[effectiveLeague]}
                supportingStatsRankings={supportingStatsRankings}
                supportingStatsPositionalRankings={
                  !this.state.opposingPlayer &&
                  this.state.opposingTeam?.positionalStats?.[getPlayerPosition(this.state.player)] &&
                  supportingStatsPositionalRankings
                }
                positionalSituation={this.state.positionalSituation}
                positionalSituationSelected={(situation) =>
                  this.setState({ positionalSituation: situation })
                }
                currentSelectedSituation={this.state.currentSupportingStatsSituation}
                comparableSelectedSituation={this.state.comparableSupportingStatsSituation}
                currentSituationSelected={(situation) =>
                  this.setState({ currentSupportingStatsSituation: situation })
                }
                comparableSituationSelected={(situation) =>
                  this.setState({ comparableSupportingStatsSituation: situation })
                }
              />
              </>
            )}
              <WorkstationInjuries leagueOverride={effectiveLeague} teamCode={injuriesCard?.team?.code} opposingTeamCode={injuriesCard?.opposingTeam?.code} />          
          </div>
          {this.state.currentWidth > 1100 &&
          <div className='trend-workstation-my-picks-wrapper'>
            <MyPicksWithOffers
              priceComparison={{
                market: selectedBetTypeMarket,
                line: this.state.hitRateLine,
                outcomeType: selectedMarketOutcomeType
              }}
              myPicksContent={
              <>
              {selectedMarketOutcomeType && selectedMarketOutcomeType != 'COVER_YES' &&
              <div style={{padding: '8px', width: '100%'}}>
                <div className="my-picks-details-line">
                    <div className="my-picks-details-line-value text-style-label-medium">
                      <label htmlFor="line-input">{this.props.t('workstation.headers.line')}</label>
                      <input id='line-input' type="number" value={this.state?.hitRateLine} onChange={this.lineInputChanged} />
                    </div>
                    <div className="my-picks-details-line-decrease" onClick={this.decreaseLine}>
                      <img src="assets/icon-minus.svg" alt="decrease" />
                    </div>
                    <div className="my-picks-details-line-increase" onClick={this.increaseLine}>
                      <img src="assets/icon-plus.svg" alt="increase" />
                    </div>
                </div>
              </div>
              }
                <div className="my-picks-quickPicks-header">
                    <p className="text-style-label-medium">{this.props.t('trends.analysis.addToMyPicks')}</p>
                </div>
                <QuickPicksSection 
                        arrayOfContent={quickPickLegs}
                      />
              </>
            } />
          </div>
          }
        </div>          
        {/* <SupportingStats /> Workstation */}
        <div className="trends-page-game-log">
          <p className="text-style-h-3-medium">{this.props.t('workstation.sections.gamelog')}</p>
           <div
            className="trends-page-game-log-table"
            ref={this.gamelogTableWrapperRef}
            onMouseDown={this.handleGameLogTableMouseDown}
            onMouseLeave={this.handleGameLogTableMouseLeave}
          >
            <Table
              className="trends-page-game-log-table-mobile"
              columns={['DATE', 'OPPONENT', 'RESULT'].concat(Object.keys(gamelogSupportingStats))}
              columnLabelFormatter={(columnName) => this.getWorkstationTableColumnLabel(columnName)}
              rowCount={Math.min(5, this.state.filteredGames.length)}
              columnStyling={(columnIndex, columnName) => {
                if (columnIndex === 0) {
                  return { width: 90, textAlign: 'left', padding: '0px 12px' }
                }
                if (columnIndex === 1) {
                  return { width: 100, textAlign: 'left', padding: '0px 8px' }
                }
                if (columnIndex === 2) {
                  return { width: 105, textAlign: 'left', padding: '0px 8px' }
                }
                return { textAlign: 'right', padding: '0px 12px' }
              }}
              dataExtractor={(rowIndex, columnIndex, columnName) => {
                const offset = this.state.gamelogPage * 5
                const gameIndex = offset + rowIndex
                if (gameIndex >= this.state.filteredGames.length) {
                  return ''
                }
                const game = this.state.filteredGames.slice().reverse()[gameIndex]
                if (columnIndex === 0) {
                  const gameDate = parseDateFromString(game.timestamp)
                  return `${String(gameDate.month).padStart(2, '0')}/${String(gameDate.day).padStart(2, '0')}/${gameDate.yearShort}`
                }
                if (columnIndex === 1) {
                  const teamCode = game.opposingTeam
                  return (
                    // Wrapping the content of the cell in a div allows us to then use flex inside
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8
                      }}>
                      <img
                        src={getTeamLogoPath(effectiveLeague, game.opposingTeamId || getTeamIdByCode(this.state.teams, teamCode))}
                        onError={({ currentTarget }) =>
                          teamLogoPathOnErrorFallback(currentTarget, effectiveLeague)
                        }
                        height={32}
                        width={32}
                        alt={teamCode}
                      />
                      <p className="text-style-label-medium">{teamCode}</p>
                    </div>
                  )
                }
                if (columnIndex === 2) {
                  return selectedCard.type === 'player'
                    ? getGameResultText(effectiveLeague, game)
                    : getTeamGameResultText(effectiveLeague, game)
                }
                return getDictionaryValue(game, gamelogSupportingStats[columnName])
              }}
            />
          </div>
          <div className="trends-page-game-log-pagination">
            <div className="trends-page-game-log-pagination-button">
              <Button
                icon="assets/chevron-left.svg"
                type="secondary"
                enabled={this.state.gamelogPage > 0}
                onClick={() =>
                  this.setState((previousState) => ({
                    gamelogPage: Math.max(0, previousState.gamelogPage - 1)
                  }))
                }
              />
            </div>
            <div className="trends-page-game-log-pagination-button">
              <Button
                icon="assets/chevron-right.svg"
                type="secondary"
                enabled={this.state.gamelogPage < this.state.filteredGames.length / 5 - 1}
                onClick={() =>
                  this.setState((previousState) => ({
                    gamelogPage: Math.min(
                      previousState.gamelogPage + 1,
                      Math.floor(this.state.filteredGames.length / 5)
                    )
                  }))
                }
              />
            </div>
          </div>
        </div>
        {this.state.currentWidth <= 1100 &&
          <div className='trend-workstation-my-picks-wrapper trend-workstation-my-picks-wrapper-mobile'>
            <MyPicksWithOffers
              priceComparison={{
                market: selectedBetTypeMarket,
                line: this.state.hitRateLine,
                outcomeType: selectedMarketOutcomeType
              }}
              myPicksContent={
              <>
              {selectedMarketOutcomeType && selectedMarketOutcomeType != 'COVER_YES' &&
              <div style={{padding: '8px', width: '100%'}}>
                <div className="my-picks-details-line">
                    <div className="my-picks-details-line-value text-style-label-medium">
                      <label htmlFor="line-input">{this.props.t('workstation.headers.line')}</label>
                      <input id='line-input' type="number" value={this.state?.hitRateLine} onChange={this.lineInputChanged} />
                    </div>
                    <div className="my-picks-details-line-decrease" onClick={this.decreaseLine}>
                      <img src="assets/icon-minus.svg" alt="decrease" />
                    </div>
                    <div className="my-picks-details-line-increase" onClick={this.increaseLine}>
                      <img src="assets/icon-plus.svg" alt="increase" />
                    </div>
                </div>
              </div>
            }
                <div className="my-picks-quickPicks-header">
                    <p className="text-style-label-medium">{this.props.t('trends.analysis.addToMyPicks')}</p>
                </div>
                <QuickPicksSection 
                  arrayOfContent={quickPickLegs}
                />
              </>
            } />
          </div>
        }
        {!this.props.hideFooter && <Footer />}
        </div>
        </>
        )}
        {trendTabLabel && this.state.activeTab === detailTabKey && detailTrend && (
          <GamelogDetails
            key={getCardKey(detailTrend)}
            {...(detailTrend.legs
              ? { parlay: detailTrend }
              : { trend: detailTrend }
            )}
            without={this.props.without}
            hideFooter={this.props.hideFooter}
          />
        )}
      </>
    )
  }
}

export default withTranslation()(TrendsWorkstation)
