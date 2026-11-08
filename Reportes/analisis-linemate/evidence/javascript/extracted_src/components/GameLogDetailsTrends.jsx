import React from 'react'

import './GameLogDetailsTrends.scss'
import { decimalPrecision, TREND_NARRATIVE_INFO, getPlayerId, jsonOrDefault, getTeamDisplayName, hasPremiumAccess, addOrdinalNumberSuffix, getDictionaryValueRawResult, getPlayerName } from '../linemate-react-common/src/util'
import { API_HOST, TREND_ASSET_MAPPING } from '../react-web-constants'
import MyPicksWithOffers from './MyPicksWithOffers'
import GlobalContext from './GlobalContext'
import { buildGraphData } from '../react-web-utils'
import { PLAYER_BET_TYPE_ID_TO_NAME, TEAM_BETS, getPlayerPropInfo, SUPPORTED_LEAGUES } from '../linemate-react-common/src/constants'
import HitRateChart from './HitRateChart'
import BorderlessTable from './BorderlessTable'
import Button from './Button'
import SegmentedControl from './SegmentedControl'
import { FieldWeatherGraphic, getConditionLabel, getDescription, getTemperatureLabel } from '../pages/WeatherReport'
import i18n from '../i18n'

const MM_SS_REGEX = /^\d{1,}:\d{1,2}$/
function parseMmSsToSeconds(str) {
  if (typeof str !== 'string' || !MM_SS_REGEX.test(str.trim())) return null
  const [m, s] = str.trim().split(':').map(Number)
  if (Number.isNaN(m) || Number.isNaN(s)) return null
  return m * 60 + s
}
function formatSecondsToMmSs(seconds) {
  const s = Math.round(seconds) % 60
  const m = Math.floor(Math.round(seconds) / 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
function isMmSsString(val) {
  return typeof val === 'string' && MM_SS_REGEX.test(val.trim())
}
function formatStatDisplay(val, isTimeString) {
  if (isTimeString || (typeof val === 'string' && isMmSsString(val))) return val
  if (typeof val === 'number' && !Number.isNaN(val)) return Number(val.toFixed(2))
  return val
}
const supportsStartingLineups = (league) => {
  return (SUPPORTED_LEAGUES?.[league]?.advancedTools || []).includes('starting_lineups')
}

function getSummaryCardLabel(signalType) {
  if (signalType === "HEAD_TO_HEAD") return i18n.t('trends.analysis.summaryCards.headToHead')
  if (signalType === "RECENT_FORM") return i18n.t('trends.analysis.summaryCards.recentForm')
  if (signalType === "HOME_SPLIT") return i18n.t('trends.analysis.summaryCards.homeSplit')
  if (signalType === "AWAY_SPLIT") return i18n.t('trends.analysis.summaryCards.awaySplit')

  return signalType
}

const LOCKED_ADVANCED_TOOL_PREVIEW_MAP = {
  starting_lineups: {
    labelKey: 'trends.analysis.sections.startingLineup',
    icon: '/assets/trend-signals/star.svg',
    previewTextKey: 'trends.analysis.preview.recordPlaceholder',
  },
  starting_pitchers: {
    labelKey: 'common.advancedTools.startingPitchers',
    icon: '/assets/trend-signals/target.svg',
    previewText: '9/L9',
  },
  injury_impact: {
    labelKey: 'trends.analysis.preview.injuryImpact',
    icon: '/assets/trend-signals/injury.svg',
    previewTextKey: 'trends.analysis.preview.recordPlaceholder',
  },
  opponent_rank: {
    labelKey: 'trends.analysis.preview.opponentRank',
    icon: '/assets/trend-signals/trophy.svg',
    previewTextKey: 'trends.analysis.preview.opponentRankPlaceholder',
  },
  weather_report: {
    labelKey: 'common.advancedTools.weatherReport',
    icon: '/assets/trend-signals/weather.svg',
    previewTextKey: 'trends.analysis.preview.weatherPlaceholder',
  },
}

function getLockedAdvancedToolPreviewItems(league) {
  return (SUPPORTED_LEAGUES?.[league]?.advancedTools || [])
    .map((toolKey) => LOCKED_ADVANCED_TOOL_PREVIEW_MAP[toolKey])
    .filter(Boolean)
    .map((item) => ({
      ...item,
      label: i18n.t(item.labelKey),
      previewText: item.previewTextKey ? i18n.t(item.previewTextKey) : item.previewText,
    }))
}

function getShortPlayerName(player) {
  const firstInitial = player?.firstName?.[0] || player?.info?.firstName?.[0] || ''
  const lastName = player?.lastName || player?.info?.lastName || ''

  if (firstInitial && lastName) {
    return `${firstInitial}. ${lastName}`
  }

  return getPlayerName(player) || 'TBD'
}

const isBaseballLeague = (league) => {
  return SUPPORTED_LEAGUES[league]?.layout?.lineupMode === 'baseball'
}

const getLineupStatusLabel = (teamData, league) => {
  const isConfirmed = isBaseballLeague(league)
    ? teamData?.startingPitcher?.confirmed
    : teamData?.lineup?.confirmed

  return isConfirmed ? i18n.t('trends.analysis.labels.confirmed') : i18n.t('trends.analysis.labels.expected')
}

const buildStartingLineupPlayers = (teamData, league) => {
  if (!teamData) {
    return []
  }

  if (isBaseballLeague(league)) {
    const players = []
    const startingPitcher = teamData?.startingPitcher

    if (startingPitcher) {
      players.push({
        ...startingPitcher,
        position: startingPitcher?.position || startingPitcher?.info?.position || 'P',
      })
    }

    if (Array.isArray(teamData?.hittingLineup)) {
      players.push(...teamData.hittingLineup)
    }

    return players
  }

  return Array.isArray(teamData?.lineup?.players) ? teamData.lineup.players : []
}

const getGameTeamDataByCode = (game, teamCode) => {
  if (!game || !teamCode) {
    return null
  }

  return [game?.awayTeamData, game?.homeTeamData].find(
    (teamData) => teamData?.info?.code === teamCode
  ) || null
}

const getLineupPlayerPosition = (player) => {
  return player?.info?.position || player?.position || ''
}

/**
 * Props:
 * - trend: {}
 * - initialGameRecords: []
 * - legs: []
 * - statHeaders: []
 * - statColumns: {}
 */
class GameLogDetailsTrends extends React.Component {
  static contextType = GlobalContext;

  constructor(props) {
    super(props)
    this.handleHitRateCardClick = this.handleHitRateCardClick.bind(this)
    this.handleStatSelectionChange = this.handleStatSelectionChange.bind(this)
    this.statSelection = {'averageStats': i18n.t('trends.details.labels.perGame'), 'cumulativeStats': i18n.t('common.filters.options.qualifier.cumulativeStats')}

    const { defaultCumulative } = this.getStatTableMetadata(props)


    this.state = {
      filteredGameRecords: [],
      selectedCard: "RECENT_FORM",
      selectedStat: Object.keys(this.statSelection)[0],
      cumulativeRecords: defaultCumulative,
      seasonRecords: {},
      width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    }
  }

  getStatTableMetadata(props = this.props) {
    const statTableStats = []
    const defaultCumulative = { averageStats: {}, cumulativeStats: {} }

    ;(props.statHeaders || []).forEach((header) => {
      const path = props.statColumns?.[header]
      if (!path) return

      statTableStats.push({ header, path })
      defaultCumulative.averageStats[path] = 0
      defaultCumulative.cumulativeStats[path] = 0
    })

    return { statTableStats, defaultCumulative }
  }

  getInitialGameRecordsArray() {
    const { trend, initialGameRecords } = this.props
    let arr = []
    if (Array.isArray(initialGameRecords)) arr = initialGameRecords
    else if (initialGameRecords && typeof initialGameRecords === 'object') {
      const key = trend?.type === 'player' ? getPlayerId(trend.player) : trend?.team?.code
      arr = initialGameRecords[key] ?? []
    }
    return Array.isArray(arr) ? arr.filter((r) => r != null) : []
  }

  getSelectedStatPath(path) {
    return path.replace(/^cumulativeStats/, this.state.selectedStat)
  }

  getValueAtPath(source, path) {
    return getDictionaryValueRawResult(source, path)
  }

  computeCumulativeFromFiltered(filtered) {
    const { defaultCumulative } = this.getStatTableMetadata()

    const tempCumulativeStats = {
      averageStats: { ...defaultCumulative.averageStats },
      cumulativeStats: { ...defaultCumulative.cumulativeStats }
    }
    const timeSecondsSum = {}
    Object.keys(tempCumulativeStats.cumulativeStats).forEach(path => {
      tempCumulativeStats.cumulativeStats[path] = 0
      tempCumulativeStats.averageStats[path] = 0
    })
    filtered.forEach(record => {
      Object.keys(tempCumulativeStats.cumulativeStats).forEach(path => {
        const val = this.getValueAtPath(record, path) ?? 0
        const seconds = parseMmSsToSeconds(val)
        if (seconds !== null) {
          timeSecondsSum[path] = (timeSecondsSum[path] || 0) + seconds
        } else {
          const num = typeof val === 'number' ? val : +val || 0
          tempCumulativeStats.cumulativeStats[path] += num
        }
      })
    })

    Object.keys(tempCumulativeStats.cumulativeStats).forEach(path => {
      const finalChunk = path.split('.').pop()
      const isPercentage = finalChunk.toLowerCase().includes('percentage')
      if (timeSecondsSum[path] !== undefined) {
        const totalSeconds = timeSecondsSum[path]
        tempCumulativeStats.cumulativeStats[path] = formatSecondsToMmSs(totalSeconds)
        tempCumulativeStats.averageStats[path] = formatSecondsToMmSs(totalSeconds / filtered.length)
      } else if (isPercentage) {
        const avg = tempCumulativeStats.cumulativeStats[path] / filtered.length
        const rounded = +(avg.toFixed(2))
        tempCumulativeStats.cumulativeStats[path] = rounded
        tempCumulativeStats.averageStats[path] = rounded
      } else {
        const cum = tempCumulativeStats.cumulativeStats[path]
        tempCumulativeStats.cumulativeStats[path] = typeof cum === 'number' ? +(cum.toFixed(2)) : cum
        tempCumulativeStats.averageStats[path] =
          typeof cum === 'number' ? +((cum / filtered.length).toFixed(2)) : cum
      }
    })

    return tempCumulativeStats
  }

  getHitRateCards(rawTrend) {
    const splitSignalType = rawTrend?.home ? "HOME_SPLIT" : "AWAY_SPLIT"

    return [
      (rawTrend?.signals || []).find((signal) => signal.type === "RECENT_FORM"),
      (rawTrend?.signals || []).find((signal) => signal.type === "HEAD_TO_HEAD"),
      (rawTrend?.signals || []).find((signal) => signal.type === splitSignalType),
    ]
  }

  getSignalDisplayName(signalType, rawTrend) {
    if (signalType === "RECENT_FORM") {
      return i18n.t('trends.analysis.summaryCards.recentForm')
    }
    if (signalType === "HEAD_TO_HEAD") {
      return i18n.t('trends.analysis.summaryCards.headToHead')
    }
    if (signalType === "HOME_SPLIT") {
      return i18n.t('common.filters.options.splits.home')
    }
    if (signalType === "AWAY_SPLIT") {
      return i18n.t('common.filters.options.splits.away')
    }
    return signalType
      .toLowerCase()
      .split("_")
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" ")
  }

  handleResize = () => {
    this.setState({ width: window.innerWidth })
  }

  getHitRateSignalIcon(signalType) {
    if (signalType === "HEAD_TO_HEAD") {
      return "/assets/trend-signals/shield.svg"
    }
    if (signalType === "HOME_SPLIT" || signalType === "AWAY_SPLIT") {
      return "/assets/trend-signals/location-filled.svg"
    }
    return `assets/badges/${TREND_ASSET_MAPPING[signalType]}-no-background.svg`
  }

  filterRecordsForSignal(signalType, gameCount, opposingTeam) {
    const gameRecords = this.getInitialGameRecordsArray()

    if (signalType === "RECENT_FORM") {
      return gameRecords.slice(0, gameCount)
    }
    if (signalType === "HEAD_TO_HEAD") {
      return gameRecords.filter((x) => x.opposingTeam === opposingTeam).slice(0, gameCount)
    }
    if (signalType === "AWAY_SPLIT") {
      return gameRecords.filter((x) => !x.home).slice(0, gameCount)
    }
    if (signalType === "HOME_SPLIT") {
      return gameRecords.filter((x) => x.home).slice(0, gameCount)
    }

    return gameRecords.slice(0, gameCount)
  }

  handleHitRateCardClick(signalType, gameCount, opposingTeam) {
    const filtered = this.filterRecordsForSignal(signalType, gameCount, opposingTeam)
    const cumulativeRecords = filtered.length
      ? this.computeCumulativeFromFiltered(filtered)
      : this.state.cumulativeRecords

    this.setState({
      filteredGameRecords: filtered,
      selectedCard: signalType,
      cumulativeRecords
    })
  }

  handleStatSelectionChange(selection) {
    if (this.state && this.state.selectedStat === selection) {
      return;
    }
    this.setState({selectedStat: selection})
  }

  getEffectiveLeague(trend = this.props.trend) {
    return trend?.league || this.props.leagueOverride || this.context.league
  }

  getTrendSeasonRecordsUrl(trend) {
    if (!trend?.type) return null

    const id = trend.type === 'player' ? getPlayerId(trend.player) : trend?.team?.code
    const league = this.getEffectiveLeague(trend)
    const endpoint = trend.type === 'player' ? `v4/players/${id}` : `v3/teams/${id}`

    return id ? `${API_HOST}/api/${league}/${endpoint}` : null
  }

  fetchSeasonRecordsForTrend(trend) {
    const url = this.getTrendSeasonRecordsUrl(trend)
    if (!url) return
    fetch(url).then((response) => jsonOrDefault(response, [])).then((data) => {
      this.setState({ seasonRecords: data })
    })
  }

  componentDidMount() {
    window.addEventListener('resize', this.handleResize)

    if (this.props.trend) this.fetchSeasonRecordsForTrend(this.props.trend)

    const recordsArray = this.getInitialGameRecordsArray()
    const recordsReady = recordsArray.length > 0

    if (recordsReady) {
      const rawTrend = this.props.trend?.legs ? this.props.trend.legs[0] : this.props.trend
      const hitRateCards = this.getHitRateCards(rawTrend)
      const availableHitRateCards = hitRateCards.filter(Boolean)

      if (availableHitRateCards.length === 0) {
        return
      }

      const selectedSignalType = availableHitRateCards.some((signal) => signal.type === this.state.selectedCard)
        ? this.state.selectedCard
        : availableHitRateCards[0].type

      const selectedSignal = availableHitRateCards.find((signal) => signal.type === selectedSignalType)
      const gameCount = selectedSignal?.hitRecord?.games ?? 0
      const opposingTeam = rawTrend?.opposingTeam?.code
      const filtered = this.filterRecordsForSignal(selectedSignalType, gameCount, opposingTeam)
      const cumulativeRecords = filtered.length
        ? this.computeCumulativeFromFiltered(filtered)
        : this.state.cumulativeRecords

      this.setState({
        filteredGameRecords: filtered,
        selectedCard: selectedSignalType,
        cumulativeRecords
      })
    }
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.handleResize)
  }

  componentDidUpdate(prevProps) {
    if (!this.props.trend) return

    const statConfigChanged =
      prevProps.statHeaders !== this.props.statHeaders ||
      prevProps.statColumns !== this.props.statColumns
    const trendSeasonKey = this.getTrendSeasonRecordsUrl(this.props.trend)
    const prevTrendSeasonKey = this.getTrendSeasonRecordsUrl(prevProps.trend)
    if (trendSeasonKey && trendSeasonKey !== prevTrendSeasonKey) {
      this.fetchSeasonRecordsForTrend(this.props.trend)
    }

    const recordsArray = this.getInitialGameRecordsArray()
    const recordsReady = recordsArray.length > 0
    const recordsChanged = prevProps.initialGameRecords !== this.props.initialGameRecords
    const trendChanged = prevProps.trend !== this.props.trend

    if (recordsReady && (recordsChanged || trendChanged || statConfigChanged)) {
      const rawTrend = this.props.trend?.legs ? this.props.trend.legs[0] : this.props.trend
      const hitRateCards = this.getHitRateCards(rawTrend)
      const availableHitRateCards = hitRateCards.filter(Boolean)

      if (availableHitRateCards.length === 0) {
        return
      }

      const selectedSignalType = trendChanged
        ? availableHitRateCards[0].type
        : (
            availableHitRateCards.some((signal) => signal.type === this.state.selectedCard)
              ? this.state.selectedCard
              : availableHitRateCards[0].type
          )

      const selectedSignal = availableHitRateCards.find((signal) => signal.type === selectedSignalType)
      const gameCount = selectedSignal?.hitRecord?.games ?? 0
      const opposingTeam = rawTrend?.opposingTeam?.code
      const filtered = this.filterRecordsForSignal(selectedSignalType, gameCount, opposingTeam)
      const cumulativeRecords = filtered.length
        ? this.computeCumulativeFromFiltered(filtered)
        : this.state.cumulativeRecords

      this.setState({
        filteredGameRecords: filtered,
        selectedCard: selectedSignalType,
        cumulativeRecords
      })
    }
  }

  getSignalHitRate(signal) {
    return {
      hitPercentage: Math.round(signal?.hitRecord?.hitRate ?? 0),
      hits: signal?.hitRecord?.hits ?? 0,
      games: signal?.hitRecord?.games ?? 0
    }
  }

  render() {
    const rawTrend = this.props.trend
    const effectiveLeague = this.getEffectiveLeague(rawTrend)
    const hitRateCards = this.getHitRateCards(rawTrend)

    if (!rawTrend || hitRateCards.every((signal) => !signal)) {
      return null
    }

    const visibleRankRows = (rawTrend?.signals || [])
      .filter((signal) => signal.type === 'OPPONENT_RANK')
      .filter((signal) => {
        if (signal?.positional && !rawTrend?.player?.position) {
          return false
        }

        return Boolean(
          signal?.rankDescription ||
          signal?.impact ||
          signal?.rank != null
        )
      })
      .slice(0, 2)

    let betType = ""
    if (rawTrend.type === 'player') {
      betType = PLAYER_BET_TYPE_ID_TO_NAME[effectiveLeague][rawTrend.market.name]
    } else {
      betType = TEAM_BETS[effectiveLeague][rawTrend.market.name].displayName;
    }
    const { statTableStats } = this.getStatTableMetadata()
    const statTableHeaders = [
      i18n.t('common.filters.titles.timeframe'),
      i18n.t('common.statHeaders.GP'),
      ...this.props.statHeaders.map((header) => i18n.t(`common.statHeaders.${header}`, { defaultValue: header }))
    ]
    const isFreeUser = !hasPremiumAccess(this.context.userAttributes)
    const advancedToolsForLeague = SUPPORTED_LEAGUES?.[effectiveLeague]?.advancedTools || []

    const lockedAdvancedToolPreviewItems = getLockedAdvancedToolPreviewItems(effectiveLeague)

    const shouldShowOpponentRankSection = !isFreeUser && visibleRankRows.length > 0

    const weatherSignal = (rawTrend?.signals || []).find(
      (signal) => signal.type === 'WEATHER'
    )

    const hitRateCardSources = hitRateCards.filter(Boolean)
    const currentGame = rawTrend?.gameId ? (this.context.currentGames || []).find((game) => game.id === rawTrend.gameId) : null

    const selectedTeamData = currentGame ? getGameTeamDataByCode(currentGame, rawTrend?.team?.code) : null

    const opposingTeamData = currentGame ? getGameTeamDataByCode(currentGame, rawTrend?.opposingTeam?.code) : null

    const selectedLineupPlayers = buildStartingLineupPlayers(selectedTeamData, effectiveLeague)
    const opposingLineupPlayers = buildStartingLineupPlayers(opposingTeamData, effectiveLeague)

    const selectedTeamName = getTeamDisplayName(effectiveLeague, selectedTeamData?.info || rawTrend?.team) || rawTrend?.team?.code || ''

    const opposingTeamName = getTeamDisplayName(effectiveLeague, opposingTeamData?.info || rawTrend?.opposingTeam) || rawTrend?.opposingTeam?.code || ''

    const shouldShowStartingLineups =
      supportsStartingLineups(effectiveLeague) &&
      rawTrend?.team?.code &&
      rawTrend?.opposingTeam?.code &&
      currentGame &&
      (selectedLineupPlayers.length > 0 || opposingLineupPlayers.length > 0)

    const startingLineupsRowCount = Math.max(
      selectedLineupPlayers.length,
      opposingLineupPlayers.length,
      1
    )

    const shouldShowStartingLineupsSection = !isFreeUser && shouldShowStartingLineups

    const starterSignal = (rawTrend?.signals || []).find(
      (signal) => signal.type === 'STARTER'
    )

    const shouldShowStarterImpactRow =
      rawTrend?.type === 'player' && shouldShowStartingLineups && starterSignal

    const starterImpactPlayerName =
      rawTrend?.type === 'player' ? getShortPlayerName(rawTrend.player) : ''

    const starterImpactStatus =
      starterSignal?.lineupStatus ||
      getLineupStatusLabel(selectedTeamData, effectiveLeague)

    const starterImpactRate =
      starterSignal?.annotation ||
      `${Math.round(starterSignal?.hitRecord?.hitRate ?? 0)}%`

    const starterImpactText = starterSignal
      ? `${starterImpactRate} ⋅ ${starterSignal?.hitRecord?.hits ?? 0} of last ${starterSignal?.hitRecord?.games ?? 0} games`
      : ''

    const startingPitcherSignal = (rawTrend?.signals || []).find(
      (signal) => signal.type === 'VERSUS_STARTING_PITCHER'
    )

    const playerProp = rawTrend?.type === 'player'
      ? getPlayerPropInfo[effectiveLeague]?.(rawTrend?.market?.name, null)
      : null

    const paramFieldName = playerProp?.fields?.[0]?.split('.').pop() || ''
    const startingPitcherValue =
      paramFieldName && startingPitcherSignal?.batterStats
        ? startingPitcherSignal.batterStats[paramFieldName]
        : null

    const startingPitcherImpactText =
      startingPitcherValue != null && startingPitcherSignal?.batterStats?.atBats != null
        ? i18n.t('trends.analysis.labels.atBatsSummary', { value: startingPitcherValue, stat: betType, atBats: startingPitcherSignal.batterStats.atBats })
        : ''

    const shouldShowStartingPitcherSection =
      !isFreeUser &&
      rawTrend?.type === 'player' &&
      advancedToolsForLeague.includes('starting_pitchers') &&
      startingPitcherSignal?.pitcher &&
      startingPitcherImpactText

    const shouldShowWeatherSection = !isFreeUser && Boolean(weatherSignal?.weatherConditions)

    const weatherGame = shouldShowWeatherSection
      ? {
          timestamp: rawTrend?.timestamp,
          venue: currentGame?.venue,
          weather: {
            forecast: weatherSignal.weatherConditions
          }
        }
      : null

    const weatherConditionLabel = weatherGame ? getConditionLabel(weatherGame, i18n.t.bind(i18n)) : ''
    const weatherTemperatureLabel = weatherGame ? getTemperatureLabel(weatherGame, i18n.language) : ''
    const weatherDescription = weatherGame ? getDescription(weatherGame, i18n.t.bind(i18n)) : ''
    const isMlbWeatherLayout = effectiveLeague === 'mlb'
    const isMobileView = this.state.width <= 1000
    const sectionHeaderClassName = isMobileView ? 'text-style-h-4-medium' : 'text-style-h-3-medium'
    
    return (
      <div className="statistics-section">
        <div className="statistics-grid">
          <p className={`${sectionHeaderClassName} trends-title`}>{i18n.t('trends.details.labels.hitRates')}</p>
          <div className='statistics-row'>
            {
              hitRateCardSources.map((signal) => {
                const signalType = signal.type
                const signalInfo = this.getSignalHitRate(signal)
                const displayName = this.getSignalDisplayName(signalType, rawTrend)

                if (
                  signalType === "RECENT_FORM" ||
                  signalType === "HEAD_TO_HEAD" ||
                  signalType === "AWAY_SPLIT" ||
                  signalType === "HOME_SPLIT"
                ) {
                  return (
                    <div
                      key={signalType}
                      className={`stat-item ${this.state.selectedCard === signalType ? "stat-item-selected" : ""}`}
                      onClick={() =>
                        this.handleHitRateCardClick(
                          signalType,
                          signalInfo.games,
                          rawTrend.opposingTeam?.code
                        )
                      }
                    >
                      <div className="stat-label">
                        <img src={this.getHitRateSignalIcon(signalType)} alt={signalType} />
                        {displayName}
                      </div>
                      <div className="stat-value-row">
                        <div className="text-style-h-4-medium">{`${signalInfo.hitPercentage}%`}</div>
                        <div className="text-style-caption-medium">
                          {signalType === "HEAD_TO_HEAD"
                            ? i18n.t('trends.analysis.summaryCards.recordVs', { record: `${signalInfo.hits}/L${signalInfo.games}`, opponent: rawTrend.opposingTeam?.code || "" }).trim()
                            : signalType === "RECENT_FORM"
                            ? i18n.t('trends.analysis.summaryCards.recordGames', { record: `${signalInfo.hits}/L${signalInfo.games}` })
                            : signalType === "HOME_SPLIT"
                            ? i18n.t('trends.analysis.summaryCards.recordAtHome', { record: `${signalInfo.hits}/L${signalInfo.games}` })
                            : signalType === "AWAY_SPLIT"
                            ? i18n.t('trends.analysis.summaryCards.recordAway', { record: `${signalInfo.hits}/L${signalInfo.games}` })
                            : `${signalInfo.hits}/L${signalInfo.games}`}
                        </div>
                      </div>
                    </div>
                  )
                }

                return null
              })
            }
          </div>
          <div style={{height: "320px"}}>
              <HitRateChart
                line={rawTrend.line}
                graphData={buildGraphData(effectiveLeague, rawTrend.type, betType, rawTrend.team.code, this.state.filteredGameRecords.length > 0 ? this.state.filteredGameRecords.slice().reverse() : this.getInitialGameRecordsArray().slice().reverse(), rawTrend.line)}
                graphLegendKeys={[betType]}
              />
          </div>
          {this.props.trend.market.name != 'GAME_TOTAL' &&
          <div className='game-log-table-section'>
            <div className='game-log-table-header-stats'>
              <p className={sectionHeaderClassName}>{i18n.t('stats.title')}</p>
              <SegmentedControl
                options={this.statSelection}
                selection={this.state.selectedStat}
                selectionHandler={this.handleStatSelectionChange}
              />
            </div>
            {this.state.seasonRecords[this.state.selectedStat] &&
              <BorderlessTable 
                columns={statTableHeaders}
                rowCount={2}
                columnStyling={(columnIndex, columnName) => {
                  if (columnIndex === 0) {
                    return ({textAlign: 'left'})
                  } else {
                    return ({width: 117, textAlign: 'right'})
                  }
                }}
                dataExtractor={(rowIndex, columnIndex, columnName) => {
                  if (columnIndex === 0 && rowIndex === 0) {
                    return <div><p>{getSummaryCardLabel(this.state.selectedCard)}</p></div>
                  }
                  if (columnIndex === 0 && rowIndex === 1) {
                    return <div><p>{i18n.t('trends.stats.picker.season')}</p></div>
                  }
                  if (rowIndex === 0 && columnIndex === 1) {
                    return <div><p>{this.state.filteredGameRecords.length}</p></div>
                  }
                  if (rowIndex === 1 && columnIndex === 1) {
                    return <div><p>{this.state.seasonRecords.gamesPlayed}</p></div>
                  }
                  if (columnIndex >= 2 && rowIndex === 0) {
                    const statPath = statTableStats[columnIndex - 2]?.path
                    return <div><p>{this.state.cumulativeRecords[this.state.selectedStat][statPath]}</p></div>
                  }
                  if (columnIndex >= 2 && rowIndex === 1) {
                    const statPath = statTableStats[columnIndex - 2]?.path
                    const selectedPath = this.getSelectedStatPath(statPath)
                    const v = this.getValueAtPath(this.state.seasonRecords, selectedPath)
                    return <div><p>{formatStatDisplay(v)}</p></div>
                  }
                }}
              />
            }
          </div>
          }
          {shouldShowStartingLineupsSection &&
          <div className='game-log-table-section'>
            <div className='game-log-table-header-with-icon'>
              <div className='game-log-table-header-logo-header'>
                <p className={sectionHeaderClassName}>{i18n.t('startingLineups.title')}</p>
              </div>
            </div>

            {shouldShowStarterImpactRow && (
              <BorderlessTable
                columns={[
                  i18n.t('common.labels.player'),
                  i18n.t('trends.analysis.labels.status'),
                  'STARTER_IMPACT'
                ]}
                rowCount={1}
                columnStyling={(columnIndex) => {
                  if (columnIndex === 0) {
                    return { textAlign: 'left' }
                  }
                  if (columnIndex === 1) {
                    return { maxWidth: 120, textAlign: 'left' }
                  }
                  return { maxWidth: 240, textAlign: 'right' }
                }}
                headerExtractor={(columnIndex, columnName) => {
                  if (columnName === 'STARTER_IMPACT') {
                    return (
                      <div className='game-log-starting-lineups-impact-header'>
                        <img src='assets/trend-signals/star.svg' alt='' />
                        <p>{i18n.t('trends.analysis.labels.asStarter')}</p>
                      </div>
                    )
                  }

                  return columnName
                }}
                dataExtractor={(rowIndex, columnIndex) => {
                  if (columnIndex === 0) {
                    return <div><p>{starterImpactPlayerName}</p></div>
                  }
                  if (columnIndex === 1) {
                    return <div><p>{starterImpactStatus}</p></div>
                  }
                  return <div><p>{starterImpactText}</p></div>
                }}
              />
            )}
            <div className='game-log-starting-lineups-table'>
              <div className='game-log-starting-lineups-header-row'>
                <div className='game-log-starting-lineups-team-header'>
                  <p className='text-style-label-medium color-fig-default'>
                    {selectedTeamName}
                  </p>
                  {selectedTeamData && (
                    <div className='game-log-starting-lineups-status-badge'>
                      <p className='text-style-caption-medium color-fig-subtle'>
                        {getLineupStatusLabel(selectedTeamData, effectiveLeague)}
                      </p>
                    </div>
                  )}
                </div>

                <div className='game-log-starting-lineups-team-header game-log-starting-lineups-team-header--right'>
                  {opposingTeamData && (
                    <div className='game-log-starting-lineups-status-badge'>
                      <p className='text-style-caption-medium color-fig-subtle'>
                        {getLineupStatusLabel(opposingTeamData, effectiveLeague)}
                      </p>
                    </div>
                  )}
                  <p className='text-style-label-medium color-fig-default'>
                    {opposingTeamName}
                  </p>
                </div>
              </div>

              {Array.from({ length: startingLineupsRowCount }).map((_, rowIndex) => {
                const selectedPlayer = selectedLineupPlayers[rowIndex]
                const opposingPlayer = opposingLineupPlayers[rowIndex]
                const isLastRow = rowIndex === startingLineupsRowCount - 1

                return (
                  <div
                    key={`starting-lineups-row-${rowIndex}`}
                    className={`game-log-starting-lineups-player-row${isLastRow ? ' game-log-starting-lineups-player-row--last' : ''}`}
                  >
                    <div className='game-log-starting-lineups-player-cell'>
                      {selectedPlayer ? (
                        <>
                          <p className='text-style-caption-uppercase-medium color-fig-subtle game-log-starting-lineups-player-position'>
                            {getLineupPlayerPosition(selectedPlayer)}
                          </p>
                          <p className='text-style-label-normal color-fig-default game-log-starting-lineups-player-name'>
                            {getPlayerName(selectedPlayer) || 'TBD'}
                          </p>
                        </>
                      ) : rowIndex === 0 ? (
                        <p className='text-style-caption-medium color-fig-disabled game-log-starting-lineups-empty-copy'>
                          {i18n.t('startingLineups.labels.noLineupAvailable')}
                        </p>
                      ) : null}
                    </div>

                    <div className='game-log-starting-lineups-player-cell game-log-starting-lineups-player-cell--right'>
                      {opposingPlayer ? (
                        <>
                          <p className='text-style-label-normal color-fig-default game-log-starting-lineups-player-name game-log-starting-lineups-player-name--right'>
                            {getPlayerName(opposingPlayer) || 'TBD'}
                          </p>
                          <p className='text-style-caption-uppercase-medium color-fig-subtle game-log-starting-lineups-player-position game-log-starting-lineups-player-position--right'>
                            {getLineupPlayerPosition(opposingPlayer)}
                          </p>
                        </>
                      ) : rowIndex === 0 ? (
                        <p className='text-style-caption-medium color-fig-disabled game-log-starting-lineups-empty-copy game-log-starting-lineups-empty-copy--right'>
                          {i18n.t('startingLineups.labels.noLineupAvailable')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          }
          {isFreeUser && lockedAdvancedToolPreviewItems.length > 0 && (
            <div className='game-log-locked-advanced-tools'>
              <div className='game-log-locked-advanced-tools-header'>
                <div className='game-log-locked-advanced-tools-header-left'>
                  <div className='game-log-locked-advanced-tools-header-left-with-badge'>
                    <img src='/assets/lock.svg' alt='' />
                    <p className={sectionHeaderClassName}>
                      {i18n.t('trends.analysis.paywall.title')}
                    </p>
                    <div className='free-user-linemate-badge'>
                      <p className='text-style-caption-semibold'>Linemate+</p>
                    </div>
                  </div>
                  <p className='text-style-body-medium color-fig-subtle'>
                    {i18n.t('trends.analysis.paywall.body')}
                  </p>
                </div>
              </div>

              <div className='game-log-locked-advanced-tools-table'>
                {lockedAdvancedToolPreviewItems.map((item, index) => (
                  <div
                    key={item.label}
                    className={`game-log-locked-advanced-tools-row${
                      index === lockedAdvancedToolPreviewItems.length - 1
                        ? ' game-log-locked-advanced-tools-row--last'
                        : ''
                    }`}
                  >
                    <div className='game-log-locked-advanced-tools-label'>
                      <img src={item.icon} alt='' />
                      <p className='text-style-label-medium color-fig-default'>{item.label}</p>
                    </div>

                    <div className='game-log-locked-advanced-tools-preview'>
                      <p className='text-style-label-medium game-log-locked-advanced-tools-preview-text'>
                        {item.previewText}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className='game-log-upgrade-cta-button-wrapper'>
                <Button
                  text={i18n.t('web.navigation.startFreeTrial')}
                  typography='md'
                  type='secondary'
                  enabled={true}
                  onClick={() => { window.location.href = `/signup?origin=/pricing` }}
                />
              </div>
            </div>
          )}
          {shouldShowOpponentRankSection &&
          <div className='game-log-table-section' style={{...(!weatherSignal?.weatherConditions && {
            borderBottom: 'none',
            paddingBottom: '0'
          })}}>
            <div className='game-log-table-header-with-icon'>
              <div className='game-log-table-header-logo-header'>
                <p className={`${sectionHeaderClassName} color-fig-default`} style={{gap: '8px', display: 'flex', flexDirection: 'row'}}>
                  <span>{i18n.t('trends.analysis.preview.opponentRank')}</span><span className='color-fig-subtle'>{`${betType} ${i18n.t('trends.details.labels.against')}`}</span>
                </p>
              </div>
            </div>

            {!isFreeUser && (
              <BorderlessTable
                columns={[i18n.t('stats.filters.titles.type'), i18n.t('trends.details.labels.rank'), 'OPPONENT_RANK_IMPACT']}
                rowCount={visibleRankRows.length}
                columnStyling={(columnIndex) => {
                  if (columnIndex === 0) {
                    return { textAlign: 'left' }
                  }
                  if (columnIndex === 1) {
                    return { maxWidth: 235, textAlign: 'right' }
                  }
                  return { maxWidth: 235, textAlign: 'right' }
                }}
                headerExtractor={(columnIndex, columnName) => {
                  if (columnName === 'OPPONENT_RANK_IMPACT') {
                    return (
                      <div className='game-log-opponent-rank-impact-header'>
                        <img src='assets/trend-signals/trophy.svg' alt='' />
                        <p>{i18n.t('trends.analysis.labels.impactOn', { target: rawTrend?.type === 'player' ? `${rawTrend?.player?.firstName?.[0]}. ${rawTrend?.player?.lastName}` : rawTrend?.team?.code })}</p>
                      </div>
                    )
                  }

                  return columnName
                }}
                dataExtractor={(rowIndex, columnIndex) => {
                  const rank = visibleRankRows[rowIndex]

                  if (columnIndex === 0) {
                    return (
                      <div>
                        <p>{rank?.positional ? i18n.t('trends.analysis.labels.rankVsPosition', { position: rawTrend.player.position }) : i18n.t('trends.analysis.labels.overallRank')}</p>
                      </div>
                    )
                  }

                  if (columnIndex === 1) {
                    return (
                      <div>
                        <p>{rank?.rankDescription || ''}</p>
                      </div>
                    )
                  }

                  return (
                    <div>
                      <p>{rank?.impact ? rank.impact.charAt(0).toUpperCase() + rank.impact.slice(1) : ''}</p>
                    </div>
                  )
                }}
              />
            )}
          </div>
          }
          {shouldShowStartingPitcherSection &&
          <div className='game-log-table-section'>
            <div className='game-log-table-header-with-icon'>
              <div className='game-log-table-header-logo-header'>
                <p className={sectionHeaderClassName}>{i18n.t('trends.analysis.sections.startingPitcher')}</p>
              </div>
            </div>

            <BorderlessTable
              columns={[i18n.t('trends.details.labels.pitcher'), i18n.t('trends.details.labels.handedness'), i18n.t('trends.analysis.labels.status'), 'STARTING_PITCHER_IMPACT']}
              rowCount={1}
              columnStyling={(columnIndex) => {
                if (columnIndex === 0) {
                  return { width: 176, textAlign: 'left' }
                }
                if (columnIndex === 1) {
                  return { width: 176}
                }
                if (columnIndex === 2) {
                  return { width: 176 }
                }
                return { width: 176, textAlign: 'right' }
              }}
              headerExtractor={(columnIndex, columnName) => {
                if (columnName === 'STARTING_PITCHER_IMPACT') {
                  return (
                    <div className='game-log-opponent-rank-impact-header'>
                      <img src='assets/trend-signals/star.svg' alt='' />
                      <p>{`${getShortPlayerName(rawTrend.player)} vs ${getPlayerName(startingPitcherSignal.pitcher)}`}</p>
                    </div>
                  )
                }

                return columnName
              }}
              dataExtractor={(rowIndex, columnIndex) => {
                if (columnIndex === 0) {
                  return (
                    <div>
                      <p>{getPlayerName(startingPitcherSignal.pitcher) || 'TBD'}</p>
                    </div>
                  )
                }

                if (columnIndex === 1) {
                  return (
                    <div>
                      <p>{startingPitcherSignal?.pitcher?.handedness || 'N/A'}</p>
                    </div>
                  )
                }

                if (columnIndex === 2) {
                  return (
                    <div>
                      <p>{startingPitcherSignal?.pitcher?.confirmed ? i18n.t('trends.analysis.labels.confirmed') : i18n.t('trends.analysis.labels.expected')}</p>
                    </div>
                  )
                }

                return (
                  <div>
                    <p>{startingPitcherImpactText}</p>
                  </div>
                )
              }}
            />
          </div>
          }
          {shouldShowWeatherSection &&
          <div className='game-log-table-section' style={{ borderBottom: 'none', paddingBottom: '0' }}>
            <div className='game-log-table-header-with-icon'>
              <div className='game-log-table-header-logo-header'>
                <p className={sectionHeaderClassName}>{i18n.t('trends.analysis.sections.weather')}</p>
              </div>
            </div>

            <div className={`game-log-weather-content${isMlbWeatherLayout ? ' game-log-weather-content--mlb' : ''}`}>
              <div className='game-log-weather-copy'>
                <div className='game-log-weather-summary'>
                  <img src='assets/trend-signals/weather.svg' alt='' />
                  <p className='text-style-label-medium color-fig-default'>
                    {weatherTemperatureLabel
                      ? `${weatherConditionLabel} • ${weatherTemperatureLabel}`
                      : weatherConditionLabel}
                  </p>
                </div>

                <p className='text-style-label-normal color-fig-subtle game-log-weather-description'>
                  {weatherDescription}
                </p>
              </div>

              {isMlbWeatherLayout && weatherGame && (
                <div className='game-log-weather-graphic'>
                  <FieldWeatherGraphic game={weatherGame} t={i18n.t.bind(i18n)} locale={i18n.language} />
                </div>
              )}
            </div>
          </div>
          }
        </div>
        
        {/* <div className='statistics-grid'>
          {
            opponentDefensiveRankInsights.map((insight, index) => {
              return (
                <div className='stat-item'>
                  {
                    index === 0 && (<h3 className="defensive-ranking">{i18n.t('trends.details.labels.defensiveRanking')}</h3>)
                  }
                  <div className="stat-label">
                    {insight.description}
                  </div>
                </div>
              )
            })
          }
        </div> */}
      </div>
    )
  }
}

export default GameLogDetailsTrends
