import React from 'react';

import './GamelogDetails.scss'
import './App.scss'
import GlobalContext from './GlobalContext';
import SegmentedControl from './SegmentedControl';
import Table from './Table';
import { decimalPrecision, getPlayerId, jsonOrDefault, getTeamDisplayName, hasPremiumAccess, addOrdinalNumberSuffix, getDictionaryValueRawResult, getPlayerName, getBookEntryBasedOnBestOdds, getOddsFromCard, getParlayBestEligibleProvider, parseDateFromString, getGameResultText, getTeamGameResultText, getDictionaryValue } from '../linemate-react-common/src/util'
import { getGamelogSupportingStats, getPlayerPropInfo, getTeamMarketGamelogStats, PLAYER_BET_TYPE_ID_TO_NAME, SCREENER_TEAM_SCORING_STATS, TEAM_BETS } from '../linemate-react-common/src/constants';
import { API_HOST } from '../react-web-constants';
import { buildTrendsData, getBetslipLegKey, getGameLineValueById, getLocalizedMarketNameFromId, getMarketDescription } from '../linemate-react-common/src/betting-utils';
import { getTeamIdByCode, getTeamLogoPath, teamLogoPathOnErrorFallback } from '../react-web-utils';
import { groupBy } from 'lodash';
import GameLogDetailsTrends from './GameLogDetailsTrends';
import HomeSidebar from './HomeSidebar';
import BorderlessTable from './BorderlessTable';
import MyPicksWithOffers from './MyPicksWithOffers';
import QuickpicksLeg from './QuickpicksLeg';
import QuickPicksSection from './QuickPicksSection';
import Footer from './Footer';
import Loader from './Loader';
import i18n from '../i18n';

const TREND_DETAILS_TYPE_PARLAY = "parlay";
const TREND_DETAILS_TYPE_STRAIGHT = "straight";

const getPlayerIdsFromLegs = (legs) => {
    return [...new Set(legs.filter(x => x.type === "player").map(x => getPlayerId(x.player)))]
}

const getTeamCodesFromLegs = (legs) => {
    return [...new Set(legs.filter(x => x.type === "team").map(x => x.team.code))]
}

const formatSignalRecord = (description, suffix = '') => {
    const numbers = description?.match(/\d+/g) || []

    if (numbers.length < 2) {
        return description || ''
    }

    return `${numbers[0]}/L${numbers[1]}${suffix}`
}

/**
 * Props:
 * - parlay|trend: {}
 * - without: {}?
 */
class GamelogDetails extends React.Component {

    static contextType = GlobalContext;

    constructor(props, context) {
        super(props, context);

        this.getTableColumnHeaderTitle = this.getTableColumnHeaderTitle.bind(this);
        this.segmentChanged = this.segmentChanged.bind(this);
        this.chipSelected = this.chipSelected.bind(this);
        this.loadParlayTrends = this.loadParlayTrends.bind(this);

        this.type = 'parlay' in props ? TREND_DETAILS_TYPE_PARLAY : TREND_DETAILS_TYPE_STRAIGHT;
        this.crossGameParlay = props?.parlay?.crossGame
        this.crossTeamParlay = props?.parlay?.crossTeam
        this.sameTeamParlay = this.type === TREND_DETAILS_TYPE_PARLAY && !this.crossGameParlay && !this.crossTeamParlay

        this.chipsListOptions = {}
        let legSelection = null;

        this.segmentOptions = {
            'all': i18n.t('trends.details.labels.all'),
            'LAST_10': i18n.t('trends.analysis.gamelog.chips.last10'),
            'MATCHUP': i18n.t('trends.analysis.gamelog.chips.headToHead')
        }

        if (this.crossGameParlay) {
            this.segmentOptions = {
                'all': i18n.t('trends.details.labels.all'),
                'LAST_10': i18n.t('trends.analysis.gamelog.chips.last10'),
            }
        }

        if (this.type === TREND_DETAILS_TYPE_PARLAY) {
            // This only works as long as we have a parlay that is same-team
            if (props.parlay.legs[0].home) {
                this.segmentOptions['HOME_SPLITS'] = i18n.t('trends.analysis.gamelog.chips.homeSplits')
            } else {
                this.segmentOptions['AWAY_SPLITS'] = i18n.t('trends.analysis.gamelog.chips.awaySplits')
            }

            // Build leg selector options for cross-game, same-team, and cross-team parlays
            if (this.crossGameParlay || this.sameTeamParlay || this.crossTeamParlay) {
                props.parlay.legs.forEach((leg, index) => {
                    if (index === 0) {
                        legSelection = { ...leg }
                    }
                    var key = ""
                    var value = ""
                    if (leg.type === 'player') {
                        key = getPlayerName(leg.player)
                        value = getPlayerId(leg.player)
                    } else if (leg.type === 'team') {
                        key = leg.team.code
                        value = leg.team.code
                    }
                    this.chipsListOptions[key] = value
                })
            }
        } else if (this.type === TREND_DETAILS_TYPE_STRAIGHT) {
            if (props.trend.home) {
                this.segmentOptions['HOME_SPLITS'] = i18n.t('trends.analysis.gamelog.chips.homeSplits')
            } else {
                this.segmentOptions['AWAY_SPLITS'] = i18n.t('trends.analysis.gamelog.chips.awaySplits')
            }
        }

        this.state = {
            chipSelection: Object.keys(this.chipsListOptions)[0],
            // Optional, only for cross-game parlays where the chip represents a leg
            legSelection: legSelection,
            // For same-team parlay leg selector: use index so multiple legs (e.g. same team) are unique
            selectedLegIndex: (this.type === TREND_DETAILS_TYPE_PARLAY && this.props.parlay?.legs?.length > 1) ? 0 : undefined,
            parlayTrends: [],
            parlayTrendLoading: this.type === TREND_DETAILS_TYPE_PARLAY,
            parlayRecordsLoading: this.type === TREND_DETAILS_TYPE_PARLAY,
            segmentSelection: Object.keys(this.segmentOptions)[0],
            width: typeof window !== 'undefined' ? window.innerWidth : 1280,
            parlay: {
                initialGameRecords: {},
                filteredGameRecords: {}
            },
            straight: {
                initialGameRecords: [],
                filteredGameRecords: []
            },
        }
        this.headerRef = React.createRef()
        this.tableSentinelRef = React.createRef()
        this.gamelogTableWrapperRef = React.createRef()
        this.gamelogTableDrag = {
            isDragging: false,
            startX: 0,
            scrollLeft: 0
        }
        this.scrollRaf = null
    }

    getEffectiveLeague(item = null) {
        return (
            item?.league ||
            this.props.leagueOverride ||
            this.props.trend?.league ||
            this.state?.legSelection?.league ||
            this.context.league
        )
    }

    componentDidMount() {
        const currentSeason = this.context.configuration.leagues[this.context.league].currentSeason;
        this._scrollHandler = () => {
            if (this.scrollRaf) return
            this.scrollRaf = requestAnimationFrame(() => {
                this.scrollRaf = null
            })
        }
        window.addEventListener('scroll', this._scrollHandler, { passive: true })
        window.addEventListener('resize', this.handleResize)
        document.addEventListener('mousemove', this.handleGameLogTableMouseMove)
        document.addEventListener('mouseup', this.handleGameLogTableMouseUp)
        this._removeScroll = () => window.removeEventListener('scroll', this._scrollHandler)
        /*if (this.sameTeamParlay) {
            // Set for unique values
            const playerIds = getPlayerIdsFromLegs(this.props.parlay.legs)
            const teamCodes = getTeamCodesFromLegs(this.props.parlay.legs)
            fetch(`${API_HOST}/api/${this.context.league}/v1/games/with?playerIds=${playerIds.join(",")}&teamCodes=${teamCodes.join(",")}&sortingOrder=DESC&timeframe=RANGE_${currentSeason - 2}_${currentSeason}`)
            .then((result) => result.json())
            .then((result) => this.setState({
                loading: false,
                parlay: {
                    initialGameRecords: result,
                    filteredGameRecords: result
                }
            }))
            .catch((error) => {
                console.log(error)
                this.setState({loading: false})
            })
        } else */if (this.sameTeamParlay || this.crossGameParlay || this.crossTeamParlay) {
            // Assumes player-only legs for cross-game
            this.loadParlayTrends();

            Promise.all(
                this.props.parlay.legs.map(leg => {
                    // Using last 20 here since we don't have the need for stuff like h2h
                    if (leg.type === 'player') {
                        return fetch(`${API_HOST}/api/${this.context.league}/v4/players/${getPlayerId(leg.player)}/games?sortingOrder=DESC&timeframe=RANGE_${currentSeason - 2}_${currentSeason}`).then(response => jsonOrDefault(response, [])).catch(console.error)
                    } else {
                        return fetch(`${API_HOST}/api/${this.context.league}/v3/teams/${leg.team.code}/games?sortingOrder=DESC&timeframe=RANGE_${currentSeason - 2}_${currentSeason}`).then(response => jsonOrDefault(response, [])).catch(console.error)
                    }
                })
            ).then(results => {
                // Initialize the grouped records with an empty list per player id
                const groupedRecords = Object.fromEntries(this.props.parlay.legs.map((leg) => [this.getLegDataKey(leg), []]))
                results.forEach((records) => {
                    if (records && records.length > 0) {
                        if ('info' in records[0]) {
                            groupedRecords[getPlayerId(records[0].info)] = records
                        } else {
                            groupedRecords[records[0].code] = records
                        }
                    }
                })
                this.setState({
                    loading: false,
                    parlayRecordsLoading: false,
                    parlay: {
                        initialGameRecords: groupedRecords,
                        filteredGameRecords: groupedRecords
                    }
                })
            }).catch((error) => {
                console.log(error)
                this.setState({
                    loading: false,
                    parlayRecordsLoading: false
                })
            })
        } /*else if (this.crossTeamParlay) {
           // We don't have an API that supports getting games together cross-team so for now we'll do two calls, one for each side and them combine them
            // If/when we start supporting that we can remove the flattening + extra grouping here and just use the result
            const splits = groupBy(this.props.parlay.legs, leg => leg.home)
            const promises = Object.keys(splits).map(split => {
                const legs = splits[split]
                const playerIds = getPlayerIdsFromLegs(legs)
                const teamCodes = getTeamCodesFromLegs(legs)
                const opponent = legs[0]?.opposingTeam?.code
                return fetch(`${API_HOST}/api/${this.context.league}/v1/games/with?playerIds=${playerIds.join(",")}&teamCodes=${teamCodes.join(",")}&sortingOrder=DESC&timeframe=RANGE_${currentSeason - 2}_${currentSeason}&opponent=${opponent}`).then(response => jsonOrDefault(response, {})).catch(console.error)
            })
            Promise.all(promises)
            .then(responses => {
                const combinedResults = Object.assign({}, responses[0], responses[1])
                const allRecords = Object.values(combinedResults).flat()
                const groupedRecords = groupBy(allRecords, record => record.gameID)
                // Using participants count instead of legs count because we can have parlays with the same player multiple times
                const participantsCount = new Set(this.props.parlay.legs.map(this.getLegDataKey)).size
                const gamesToKeepGrouping = Object.keys(groupedRecords).filter(x => groupedRecords[x].length === participantsCount).map(x => groupedRecords[x])
                const finalGrouping = groupBy(gamesToKeepGrouping.flat(), record => {
                    // Only player has info
                    if ('info' in record) {
                        // Player
                        return getPlayerId(record.info)
                    } else {
                        // Team
                        return record.code
                    }
                })
                this.setState({
                    loading: false,
                    parlay: {
                        initialGameRecords: finalGrouping,
                        filteredGameRecords: finalGrouping
                    }
                })
            })

        }*/ else if (this.type === TREND_DETAILS_TYPE_STRAIGHT) {
                const effectiveLeague = this.getEffectiveLeague(this.props.trend)
                const currentSeason = this.context.configuration.leagues[effectiveLeague].currentSeason

                let endpoint = ""

                if (this.props.trend.type === "player") {
                    endpoint = `v4/players/${getPlayerId(this.props.trend.player)}/games?sortingOrder=DESC&timeframe=RANGE_${currentSeason - 2}_${currentSeason}`
                } else if (this.props.trend.type === "team") {
                    endpoint = `v3/teams/${this.props.trend.team.code}/games?sortingOrder=DESC&timeframe=RANGE_${currentSeason - 2}_${currentSeason}`
                } else {
                    return
                }

                if (this.props.without) {
                    endpoint += `&withoutPlayerIds=${this.props.without.id}`
                }

                fetch(`${API_HOST}/api/${effectiveLeague}/${endpoint}`)
                    .then((result) => result.json())
                    .then((result) => this.setState({
                        loading: false,
                        straight: {
                            initialGameRecords: result,
                            filteredGameRecords: result
                        }
                    }))
                    .catch((error) => {
                        console.error(error)
                        this.setState({ loading: false })
                    })
            }
        }

    componentWillUnmount() {
        if (this._removeScroll) this._removeScroll()
        if (this.scrollRaf) cancelAnimationFrame(this.scrollRaf)
        window.removeEventListener('resize', this.handleResize)
        document.removeEventListener('mousemove', this.handleGameLogTableMouseMove)
        document.removeEventListener('mouseup', this.handleGameLogTableMouseUp)
    }

    handleResize = () => {
        this.setState({ width: window.innerWidth })
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

        if (!actualWrapper || actualWrapper.scrollWidth <= actualWrapper.clientWidth) {
            return
        }

        this.gamelogTableDrag = {
            isDragging: true,
            startX: event.clientX,
            scrollLeft: actualWrapper.scrollLeft
        }

        tableWrapper.classList.add('parlay-workstation-content-table-wrapper--dragging')
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
        this.gamelogTableWrapperRef.current?.classList.remove('parlay-workstation-content-table-wrapper--dragging')
    }

    handleGameLogTableMouseLeave = () => {
        this.gamelogTableDrag.isDragging = false
        this.gamelogTableWrapperRef.current?.classList.remove('parlay-workstation-content-table-wrapper--dragging')
    }

    getTableColumnHeaderTitle(leg) {
        const effectiveLeague = this.getEffectiveLeague(leg)

        if (leg.type === 'player') {
            return `${getPlayerName(leg.player)} \u2022 ${PLAYER_BET_TYPE_ID_TO_NAME[effectiveLeague][leg.market.name]}`
        }

        return `${leg.team.code} \u2022 ${TEAM_BETS[effectiveLeague][leg.market.name].displayName}`;
    }

    getLegDataKey(leg) {
        return leg.type === "player" ? getPlayerId(leg.player) : leg.team.code;
    }

    getLegChipKey(leg) {
        return leg.type === "player" ? getPlayerName(leg.player) : leg.team.code;
    }

    getResolvedLegTrendId(leg) {
        return leg?.trendId || (Array.isArray(leg?.trendIds) && leg.trendIds.length > 0 ? leg.trendIds[0] : null)
    }

    loadParlayTrends() {
        Promise.all(
            this.props.parlay.legs.map((leg) => {
                const resolvedTrendId = this.getResolvedLegTrendId(leg)

                return !resolvedTrendId
                    ? Promise.resolve({
                        ...leg,
                        signals: leg.signals || [],
                        impactingInjuries: leg.impactingInjuries || []
                    })
                    : fetch(`${API_HOST}/api/${leg.league || this.context.league}/v1/trends/straights/${resolvedTrendId}`)
                        .then((response) => jsonOrDefault(response, null))
                        .then((trendResponse) =>
                            trendResponse
                                ? {
                                    ...trendResponse,
                                    ...leg,
                                    market: leg.market || trendResponse.market,
                                    team: leg.team || trendResponse.team,
                                    opposingTeam: leg.opposingTeam || trendResponse.opposingTeam,
                                    player: leg.player || trendResponse.player,
                                    line: leg.line ?? trendResponse.line,
                                    outcome: leg.outcome ?? trendResponse.outcome,
                                    home: leg.home ?? trendResponse.home,
                                    gameId: leg.gameId ?? trendResponse.gameId,
                                    type: leg.type || trendResponse.type,
                                    alternate: leg.alternate ?? trendResponse.alternate,
                                    book: leg.book || trendResponse.book
                                }
                                : {
                                    ...leg,
                                    signals: leg.signals || [],
                                    impactingInjuries: leg.impactingInjuries || []
                                }
                        )
                        .catch(() => ({
                            ...leg,
                            signals: leg.signals || [],
                            impactingInjuries: leg.impactingInjuries || []
                        }))
            })
        ).then((parlayTrends) => {
            const initialLegIndex =
                typeof this.state.selectedLegIndex === 'number'
                    ? this.state.selectedLegIndex
                    : 0;

            const selectedTrend = parlayTrends[initialLegIndex] || parlayTrends[0] || null;

            this.setState({
                parlayTrends,
                legSelection: selectedTrend,
                parlayTrendLoading: false
            });
        }).catch((error) => {
            console.log(error)
            this.setState({ parlayTrendLoading: false })
        });
    }

    filterParlayGameRecords(initialGameRecords, segmentSelection, team1, team2) {
        if (segmentSelection === 'all') {
            return initialGameRecords;
        }
        const filteredGameRecords = {};
        Object.keys(initialGameRecords).forEach((key) => {
            if (segmentSelection === 'LAST_10') {
                filteredGameRecords[key] = initialGameRecords[key].slice(0, 10)
            }
            if (segmentSelection === 'MATCHUP') {
                filteredGameRecords[key] = (team1 && team2)
                    ? initialGameRecords[key].filter(x => (x.currentTeam === team1 && x.opposingTeam === team2) || (x.currentTeam === team2 && x.opposingTeam === team1))
                    : initialGameRecords[key]
            }
            if (segmentSelection === 'HOME_SPLITS') {
                filteredGameRecords[key] = initialGameRecords[key].filter(x => x.home)
            }
            if (segmentSelection === 'AWAY_SPLITS') {
                filteredGameRecords[key] = initialGameRecords[key].filter(x => !x.home)
            }
        })
        return filteredGameRecords;
    }

    filterStraightGameRecords(initialGameRecords, segmentSelection, opposingTeam) {
        if (segmentSelection === 'all') {
            return initialGameRecords;
        }
        if (segmentSelection === 'LAST_10') {
            return initialGameRecords.slice(0, 10)
        }
        if (segmentSelection === 'MATCHUP') {
            return initialGameRecords.filter(x => x.opposingTeam === opposingTeam)
        }
        if (segmentSelection === 'HOME_SPLITS') {
            return initialGameRecords.filter(x => x.home)
        }
        if (segmentSelection === 'AWAY_SPLITS') {
            return initialGameRecords.filter(x => !x.home)
        }
    }

    segmentChanged(selection) {
        if (this.state.segmentSelection === selection) {
            return;
        }
        if (this.type === TREND_DETAILS_TYPE_PARLAY) {
            this.setState({
                segmentSelection: selection,
                parlay: {
                    initialGameRecords: this.state.parlay.initialGameRecords,
                    filteredGameRecords: this.filterParlayGameRecords(this.state.parlay.initialGameRecords, selection, this.props.parlay.homeTeam?.code, this.props.parlay.awayTeam?.code)
                }
            })
        } else if (this.type === TREND_DETAILS_TYPE_STRAIGHT) {
            this.setState({
                segmentSelection: selection,
                straight: {
                    initialGameRecords: this.state.straight.initialGameRecords,
                    filteredGameRecords: this.filterStraightGameRecords(this.state.straight.initialGameRecords, selection, this.props.trend.opposingTeam.code)
                }
            })
        }
    }

    chipSelected(selection) {
        // Same-team parlay: selection is leg index (number) so each leg is unique
        if (typeof selection === 'number') {
            if (this.state.selectedLegIndex === selection) return;
            const legToReturn = this.state.parlayTrends[selection] || this.props.parlay.legs[selection];
            this.setState({ selectedLegIndex: selection, legSelection: legToReturn });
            return;
        }
        if (this.state.chipSelection === selection) {
            return;
        }
        const legIndex = this.props.parlay.legs.findIndex(
            leg => this.chipsListOptions[selection] === this.getLegDataKey(leg)
        );
        const legToReturn =
            this.state.parlayTrends[legIndex] ||
            this.props.parlay.legs[legIndex];

        this.setState({
            chipSelection: selection,
            legSelection: legToReturn
        });
    }

    getParlayQuickPickProviders() {
      if (this.type !== TREND_DETAILS_TYPE_PARLAY || !this.props.parlay) {
        return this.context.resolvedPreferredProviders
      }

      const bestEligibleProvider = getParlayBestEligibleProvider(
        this.props.parlay,
        this.context.resolvedPreferredProviders
      )

      return bestEligibleProvider
        ? [bestEligibleProvider]
        : this.context.resolvedPreferredProviders
    }

    getQuickPickBookForLeg(leg) {
      return getBookEntryBasedOnBestOdds(
        leg?.market?.books,
        leg?.outcome,
        leg?.line,
        this.getParlayQuickPickProviders(),
        leg?.alternate
      ) ?? ''
    }

    buildBetslipLeg(leg) {
        const marketData = leg.market
        if (!marketData) {
            return null
        }

        const resolvedBook = leg.book || this.getQuickPickBookForLeg(leg)
        const effectiveLeague = this.getEffectiveLeague(leg)

        return {
            league: effectiveLeague,
            line: leg.line,
            market: marketData,
            book: resolvedBook,
            team: leg.team,
            opposingTeam: leg.opposingTeam,
            player: leg.player,
            gameId: leg.gameId,
            home: leg.home,
            outcome: leg.outcome,
            type: leg.type,
            alternate: leg.alternate
        }
    }

    addPick(legInput) {
        const leg = this.buildBetslipLeg(legInput)
        const key = getBetslipLegKey(leg.league, leg)

        if (key in this.context.betslip.legs) {
            this.context.removeLegsFromBetslip([leg])
        } else {
            this.context.addLegsToBetslip([leg])
        }
    }

    addAllPicks(legsInput) {
        const legs = legsInput || []
        const builtLegs = legs.map((leg) => this.buildBetslipLeg(leg)).filter(Boolean)
        const keys = builtLegs.map((leg) => getBetslipLegKey(leg.league, leg))
        const allSelected = keys.length > 0 && keys.every((key) => key in this.context.betslip.legs)

        if (allSelected) {
            this.context.removeLegsFromBetslip(builtLegs)
        } else {
            legs.forEach((leg) => {
                const built = this.buildBetslipLeg(leg)
                if (built && !(getBetslipLegKey(built.league, built) in this.context.betslip.legs)) {
                    this.addPick(leg)
                }
            })
        }
    }

    getParlayAddButtonText(legsInput) {
        const legs = legsInput || []
        const builtLegs = legs.map((leg) => this.buildBetslipLeg(leg)).filter(Boolean)
        const keys = builtLegs.map((leg) => getBetslipLegKey(leg.league, leg))
        const allSelected = keys.length > 0 && keys.every((key) => key in this.context.betslip.legs)

        return allSelected ? i18n.t('trends.details.actions.removeAll') : i18n.t('trends.details.actions.addAllPicksAsParlay')
    }

    render() {
        var tableHeaderText = "";
        const sectionHeaderClassName = this.state.width <= 1000 ? 'text-style-h-4-medium' : 'text-style-h-3-medium'
        var dataColumnHeaders = []
        // Straight-only
        var statColumns = {}
        var currentTrend = this.props.trend || this.state.legSelection
        var currentPropLabel = ''
        const effectiveLeague = this.getEffectiveLeague(currentTrend)
        const injuryRows = (currentTrend?.signals || []).filter(
            (signal) => signal.type === 'INJURY_IMPACT'
        )
        const isFreeUser = !hasPremiumAccess(this.context.userAttributes)
        const shouldShowInjuriesSection = !isFreeUser && injuryRows.length > 0
        if (currentTrend) {
            currentPropLabel = getMarketDescription(
                effectiveLeague,
                currentTrend.type,
                currentTrend.line,
                currentTrend.outcome,
                currentTrend.market,
                currentTrend.alternate,
                i18n.t.bind(i18n)
            );
        }
        //var currentPropLabel = currentTrend.market
        if (this.type === TREND_DETAILS_TYPE_PARLAY) {
            tableHeaderText = i18n.t('trends.analysis.gamelog.title')
            const selectedLeg = this.state.legSelection
            if (selectedLeg) {
                if (selectedLeg.type === "player") {
                    const playerPropInfo = getPlayerPropInfo[this.context.league](selectedLeg.market.name, null);
                    statColumns = getGamelogSupportingStats[this.context.league](playerPropInfo)
                    dataColumnHeaders = Object.keys(statColumns);
                } else if (selectedLeg.type === "team") {
                    statColumns = getTeamMarketGamelogStats(this.context.league, selectedLeg.market.name, "cumulativeStats", "offensive")
                    dataColumnHeaders = Object.keys(statColumns)
                }
            }
        } else if (this.type === TREND_DETAILS_TYPE_STRAIGHT) {
            tableHeaderText = this.props.without
                ? i18n.t('trends.analysis.gamelog.titleWithout', { name: this.props.without.name })
                : i18n.t('trends.analysis.gamelog.title')

            if (this.props.trend.type === "player") {
                const playerPropInfo = getPlayerPropInfo[effectiveLeague](this.props.trend.market.name, null);
                statColumns = getGamelogSupportingStats[effectiveLeague](playerPropInfo)
                dataColumnHeaders = Object.keys(statColumns);
            } else if (this.props.trend.type === "team") {
                statColumns = SCREENER_TEAM_SCORING_STATS(effectiveLeague, "cumulativeStats", "offensive")
                dataColumnHeaders = Object.keys(statColumns)
            }
        }
        var staticColumns = [i18n.t('trends.analysis.gamelog.headers.date'), i18n.t('trends.analysis.gamelog.headers.versus'), i18n.t('trends.analysis.gamelog.headers.result'), i18n.t('trends.analysis.gamelog.headers.hit')]
        const gamelogColumns = staticColumns.concat(
            dataColumnHeaders.map((header) => i18n.t(`common.statHeaders.${header}`, { defaultValue: header }))
        )
        const currentTrendLegs = currentTrend ? [currentTrend] : []
        const myPicksContentEl = (
            <div style={{width: '100%'}}>
                {currentTrendLegs.length <= 1 &&
                <div className="my-picks-quickPicks-header">
                    <p className="text-style-label-medium">{i18n.t('trends.analysis.addToMyPicks')}</p>
                </div>
                }
                {currentTrendLegs.length > 1 &&
                <div className='my-picks-add-parlay text-style-label-medium' onClick={() => this.addAllPicks(currentTrendLegs)}>
                    <p>{this.getParlayAddButtonText(currentTrendLegs)}</p>
                </div>
                }
                <QuickPicksSection
                title={currentTrendLegs.length > 1 ? i18n.t('trends.details.labels.straights') : ''}
                arrayOfContent={currentTrendLegs.map((leg) => {
                    const quickPickProviders = this.getParlayQuickPickProviders()
                    const book = getBookEntryBasedOnBestOdds(
                        leg.market.books,
                        leg.outcome,
                        leg.line,
                        quickPickProviders,
                        leg.alternate
                    ) ?? ''

                    const odds = book
                        ? getOddsFromCard(leg, this.context.userAttributes, quickPickProviders) ?? ''
                        : ''
                    const displayLine =
                    leg?.market?.name?.includes("MONEY_LINE")
                        ? ""
                        : leg?.market?.name?.includes("SPREAD") && leg?.outcome === "cover"
                        ? `${leg.line > 0 ? "+" : ""}${leg.line}`
                        : `${leg.line}`;
                    const builtLeg = this.buildBetslipLeg(leg)

                    return (
                        <QuickpicksLeg
                            key={`${leg.league || effectiveLeague}-${leg.outcome}-${leg.market?.name}-${leg.line}`}
                            label={leg.outcome !== 'cover' ? i18n.t(`common.filters.options.outcome.${leg.outcome}`, { defaultValue: leg.outcome[0].toUpperCase() + leg.outcome.slice(1) }) : ''}
                            hitRateLine={displayLine}
                            betTypeLabel={getLocalizedMarketNameFromId(i18n.t.bind(i18n), leg.league || effectiveLeague, leg.type, leg.market.name)}
                            bookName={book}
                            disabled={!book}
                            onClick={() => this.addPick(leg)}
                            selected={book && builtLeg && (getBetslipLegKey(builtLeg.league, builtLeg) in this.context.betslip.legs)}
                            formattedOdds={odds}
                            header={leg.market.name.includes('GAME_TOTAL') ? (leg.home ? `${leg.team.code} vs ${leg.opposingTeam.code}` : `${leg.team.code} @ ${leg.opposingTeam.code}` ) : leg.type === 'team' ? leg.team.code : `${leg.player.firstName[0].toUpperCase()}. ${leg.player.lastName}`}
                        />
                    )
                })}
                />
            </div>
        )
        const hasLegSelection = this.props.parlay && this.props.parlay.legs && this.props.parlay.legs.length > 1
        const parlayDetailsLoading =
            this.type === TREND_DETAILS_TYPE_PARLAY &&
            (this.state.parlayTrendLoading || this.state.parlayRecordsLoading)

        return (
            <div className={`parlay-workstation-page-wrapper ${hasLegSelection ? 'parlay-workstation-page-wrapper--with-leg-selection' : ''}`}>
                {hasLegSelection && (
                    <div className='parlay-leg-selection text-style-label-medium'>
                        <p>{i18n.t('trends.details.labels.trendsInThisParlay')}</p>
                        <div className='parlay-leg-selection-chips'>
                            {this.props.parlay.legs.map((leg, index) => {
                                const chipKey = this.getLegChipKey(leg);
                                const isSelected = this.sameTeamParlay
                                    ? this.state.selectedLegIndex === index
                                    : chipKey === this.state.chipSelection;
                                const label = getMarketDescription(
                                    leg.league || effectiveLeague,
                                    leg.type,
                                    leg.line,
                                    leg.outcome,
                                    leg.market,
                                    leg.alternate,
                                    i18n.t.bind(i18n)
                                );

                                return (
                                    <div key={index} className={`gamelog-leg-selector ${isSelected ? 'gamelog-leg-selector-selected' : ''}`} onClick={() => this.chipSelected(this.sameTeamParlay ? index : chipKey)}>
                                        <p>{chipKey}: {label}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                <div className='parlay-workstation-wrapper'>
                    {parlayDetailsLoading ? (
                        <div
                            style={{
                                display: 'flex',
                                width: '100%',
                                minHeight: '320px',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '40px 0'
                            }}
                        >
                            <Loader />
                        </div>
                    ) : (
                        <>
                            <div className='parlay-workstation-top-section'>
                                <GameLogDetailsTrends
                                    trend={this.props.trend || this.state.legSelection}
                                    initialGameRecords={this.props.trend ? this.state.straight.initialGameRecords : this.state.parlay.initialGameRecords}
                                    legs={this.props.trend ? [this.props.trend] : this.props.parlay.legs}
                                    statHeaders={dataColumnHeaders.slice(0, 4)}
                                    statColumns={statColumns}
                                    leagueOverride={effectiveLeague}
                                />
                                <div className="gamelog-mypicks-desktop" style={{minWidth: '272px', width: '272px', paddingBottom: '40px'}}>
                                    <MyPicksWithOffers
                                        myPicksContent={myPicksContentEl}
                                        priceComparison={{
                                            market: currentTrend?.market,
                                            line: currentTrend?.line,
                                            outcome: currentTrend?.outcome
                                        }}
                                    />
                                </div>
                            </div>
                            {currentTrend && shouldShowInjuriesSection &&
                                <div className='game-log-table-section'>
                                    <div className='game-log-table-header-with-icon'>
                                        <div className='game-log-table-header-logo-header'>
                                            {!hasPremiumAccess(this.context.userAttributes) && <img src='assets/lock.svg' alt="" />}
                                            <p className='text-style-h-3-medium'>{i18n.t('trends.analysis.sections.injuries')}</p>
                                        </div>
                                        {!hasPremiumAccess(this.context.userAttributes) && <div className='free-user-linemate-badge'><p className='text-style-caption-semibold'>Linemate+</p></div>}
                                    </div>

                                    {hasPremiumAccess(this.context.userAttributes) && (
                                        <BorderlessTable
                                            columns={[
                                                getTeamDisplayName(effectiveLeague, currentTrend.team) || currentTrend.team.code,
                                                i18n.t('stats.filters.titles.position'),
                                                i18n.t('trends.analysis.sections.injuries'),
                                                i18n.t('trends.analysis.labels.status'),
                                                i18n.t('common.filters.titles.betType'),
                                                'WITHOUT_PLAYER'
                                            ]}
                                            rowCount={injuryRows.length}
                                            headerExtractor={(columnIndex, columnName) => {
                                                if (columnName === 'WITHOUT_PLAYER') {
                                                    return (
                                                        <div style={{display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px'}}>
                                                            <img
                                                                src='/assets/trend-signals/injury.svg'
                                                                alt=''
                                                                style={{width: '16px', height: '16px', filter: 'var(--color-fig-subtle-filter)'}}
                                                            />
                                                            <span>{i18n.t('trends.analysis.labels.withoutPlayer', { player: i18n.t('common.labels.player') })}</span>
                                                        </div>
                                                    )
                                                }

                                                return columnName
                                            }}
                                            columnStyling={(columnIndex) => {
                                                if (columnIndex === 0 || columnIndex === 4) {
                                                    return { width: 200, textAlign: 'left' }
                                                }
                                                if (columnIndex === 1) {
                                                    return { width: 64, textAlign: 'left' }
                                                }
                                                if (columnIndex === 2) {
                                                    return { width: 136, textAlign: 'left' }
                                                }
                                                if (columnIndex === 3) {
                                                    return { width: 88, textAlign: 'left' }
                                                }
                                                if (columnIndex === 5) {
                                                    return { width: 220, textAlign: 'right' }
                                                }
                                            }}
                                            dataExtractor={(rowIndex, columnIndex) => {
                                                const injuryEntry = injuryRows[rowIndex]
                                                const shortName = `${injuryEntry?.injuryReport?.firstName?.[0] || ''}. ${injuryEntry?.injuryReport?.lastName || ''}`.trim()

                                                if (columnIndex === 0) {
                                                    return <div><p>{shortName}</p></div>
                                                }
                                                if (columnIndex === 1) {
                                                    return <div><p>{injuryEntry?.injuryReport?.position}</p></div>
                                                }
                                                if (columnIndex === 2) {
                                                    return <div><p>{injuryEntry?.injuryReport?.injury}</p></div>
                                                }
                                                if (columnIndex === 3) {
                                                    return <div><p>{injuryEntry?.injuryReport?.status}</p></div>
                                                }
                                                if (columnIndex === 4) {
                                                    return <div><p>{currentPropLabel}</p></div>
                                                }
                                                if (columnIndex === 5) {
                                                    return (
                                                        <div>
                                                            <p>{`${injuryEntry?.annotation} ⋅ ${formatSignalRecord(injuryEntry?.description)}${i18n.t('trends.analysis.labels.gamesSuffix')}`}</p>
                                                        </div>
                                                    )
                                                }
                                            }}
                                        />
                                    )}
                                </div>
                            }
                            <div className="gamelog-mypicks-mobile">
                                <MyPicksWithOffers
                                    myPicksContent={myPicksContentEl}
                                    priceComparison={{
                                        market: currentTrend?.market,
                                        line: currentTrend?.line,
                                        outcome: currentTrend?.outcome
                                    }}
                                />
                            </div>
                            <div className="parlay-workstation-game-log-section">
                                <div ref={this.headerRef} className='parlay-workstation-header'>
                                    <p className={`${sectionHeaderClassName} color-fig-default`}>{tableHeaderText}</p>
                                    <div className='parlay-workstation-header-segment-control-desktop'>
                                        <SegmentedControl options={this.segmentOptions} selection={this.state.segmentSelection} selectionHandler={this.segmentChanged}/>
                                    </div>
                                    <div className='parlay-workstation-header-segment-control-mobile'>
                                        <SegmentedControl options={this.segmentOptions} selection={this.state.segmentSelection} selectionHandler={this.segmentChanged} fillWidth={true}/>
                                    </div>
                                </div>
                            <div className='parlay-workstation-content'>
                                <div ref={this.tableSentinelRef} className='parlay-workstation-content-table-sentinel' aria-hidden="true" />
                                <div
                                    className='parlay-workstation-content-table-wrapper'
                                    ref={this.gamelogTableWrapperRef}
                                    onMouseDown={this.handleGameLogTableMouseDown}
                                    onMouseLeave={this.handleGameLogTableMouseLeave}
                                >
                                {/* {
                                    this.type === TREND_DETAILS_TYPE_PARLAY && !this.crossGameParlay && (
                                        <Table 
                                            className='trends-page-game-log-table-mobile'
                                            columns={staticColumns.concat(dataColumnHeaders)}
                                            rowCount={Object.values(this.state.parlay.filteredGameRecords).length > 0 ? Object.values(this.state.parlay.filteredGameRecords)[0].length : 0}
                                            columnStyling={(columnIndex, columnName) => {
                                                if (columnIndex === 0) {
                                                    return {width: 104, textAlign: 'left', padding: '0px 12px'}
                                                }
                                                if (columnIndex === 1) {
                                                    return {width: 158, textAlign: 'left', padding: '0px 8px'};
                                                }
                                                if (columnIndex === 2) {
                                                    return {width: 158, textAlign: 'left', padding: '0px 8px'};
                                                }
                                                if (columnIndex === 3) {
                                                    return {width: 158, textAlign: 'center', padding: '0px 8px'};
                                                }
                                                return {textAlign: 'right', padding: '0px 12px'}
                                            }}
                                            dataExtractor={(rowIndex, columnIndex, columnName) => {
                                                // The data for the first few columns should be the same regardless of who's game record we use
                                                const firstValues = Object.values(this.state.parlay.filteredGameRecords)[0]
                                                const genericRecord = firstValues?.[rowIndex]
                                                if (!genericRecord) return '—'
                                                if (columnIndex === 0) {
                                                    const gameDate = parseDateFromString(genericRecord.timestamp);
                                                    return `${String(gameDate.month).padStart(2, '0')}/${String(gameDate.day).padStart(2, '0')}/${gameDate.yearShort}`
                                                }
                                                if (columnIndex === 1) {
                                                    const teamCode = genericRecord.opposingTeam;
                                                    return (
                                                        // Wrapping the content of the cell in a div allows us to then use flex inside
                                                        <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8}}>
                                                            <img src={getTeamLogoPath(this.context.league, genericRecord.opposingTeamId || getTeamIdByCode(this.context.teams, teamCode))} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, this.context.league)} height={24} width={24} alt={teamCode}/>
                                                            <p className="text-style-label-medium">{teamCode}</p>
                                                        </div>
                                                    )
                                                }
                                                if (columnIndex === 2) {
                                                    // Only the player game record has 'info'
                                                    return 'info' in genericRecord ? getGameResultText(this.context.league, genericRecord) : getTeamGameResultText(this.context.league, genericRecord);
                                                }
                                                if (columnIndex === 3) {
                                                    const legRecords = this.props.parlay.legs.map(x => this.state.parlay.filteredGameRecords[this.getLegDataKey(x)]?.[rowIndex]).filter(Boolean)
                                                    const parlayHit = legRecords.length === this.props.parlay.legs.length &&
                                                        this.props.parlay.legs.map((x, i) => buildTrendsData(this.context.league, x.type, [legRecords[i]], null, x.line, x.market.name)).every(x => x.hits === 1)
                                                    const assetName = parlayHit ? 'check-circle' : 'cancel-circle'
                                                    return (
                                                        <img className='parlay-workstation-content-parlay-column' data-hit={parlayHit} src={`assets/${assetName}.svg`} alt={assetName}/>
                                                    )
                                                }
                                                // If we change the static column layout the number we subtract may have to change
                                                const leg = this.props.parlay.legs[columnIndex - 4]
                                                const dataKey = this.getLegDataKey(leg);
                                                const participantRecord = this.state.parlay.filteredGameRecords[dataKey]?.[rowIndex]
                                                if (!participantRecord) return '—'
                                                return getGameLineValueById(this.context.league, leg.type, participantRecord, leg.market.name)
                                            }}
                                        />
                                    )
                                } */}
                                {
                                    this.type === TREND_DETAILS_TYPE_PARLAY  && (
                                        <Table 
                                            className='trends-page-game-log-table-mobile trends-page-game-log-stats-table'
                                            columns={gamelogColumns}
                                            rowCount={(() => {
                                                const participantId = (this.crossGameParlay || this.crossTeamParlay)
                                                    ? this.chipsListOptions[this.state.chipSelection]
                                                    : (this.props.parlay.legs[this.state.selectedLegIndex] && this.getLegDataKey(this.props.parlay.legs[this.state.selectedLegIndex]));
                                                const records = participantId ? this.state.parlay.filteredGameRecords[participantId] : [];
                                                return records?.length ?? 0;
                                            })()}
                                            columnStyling={(columnIndex, columnName) => {
                                                if (columnIndex === 0) {
                                                    return {width: 104, textAlign: 'left', padding: '0px 12px'}
                                                }
                                                if (columnIndex === 1) {
                                                    return {width: 158, textAlign: 'left', padding: '0px 8px'};
                                                }
                                                // if (columnIndex === 2) {
                                                //     return {width: 158, textAlign: 'left', padding: '0px 8px'};
                                                // }
                                                if (columnIndex === 2) {
                                                    return {width: 104, textAlign: 'center', padding: '0px 8px'};
                                                }
                                                return {textAlign: 'right', padding: '0px 12px'}
                                            }}
                                            dataExtractor={(rowIndex, columnIndex, columnName) => {
                                                const participantId = (this.crossGameParlay || this.crossTeamParlay)
                                                    ? this.chipsListOptions[this.state.chipSelection]
                                                    : (this.props.parlay.legs[this.state.selectedLegIndex] && this.getLegDataKey(this.props.parlay.legs[this.state.selectedLegIndex]));
                                                const record = this.state.parlay.filteredGameRecords[participantId]?.[rowIndex]
                                                if (!record) return '—'
                                                if (columnIndex === 0) {
                                                    const gameDate = parseDateFromString(record.timestamp);
                                                    return `${String(gameDate.month).padStart(2, '0')}/${String(gameDate.day).padStart(2, '0')}/${gameDate.yearShort}`
                                                }
                                                if (columnIndex === 1) {
                                                    const teamCode = record.opposingTeam;
                                                    return (
                                                        // Wrapping the content of the cell in a div allows us to then use flex inside
                                                        <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8}}>
                                                            <img src={getTeamLogoPath(this.context.league, record.opposingTeamId || getTeamIdByCode(this.context.teams, teamCode))} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, this.context.league)} height={32} width={32} alt={teamCode}/>
                                                            <p className="text-style-label-medium">{teamCode}</p>
                                                        </div>
                                                    )
                                                }
                                                if (columnIndex === 2) {
                                                    return 'info' in record ? getGameResultText(this.context.league, record) : getTeamGameResultText(this.context.league, record);
                                                }
                                                if (columnIndex === 3) {
                                                    // if (this.sameTeamParlay || this.crossTeamParlay) {
                                                    //     const gameId = record.id ?? record.gameID;
                                                    //     const legRecords = this.props.parlay.legs.map(leg =>
                                                    //         this.state.parlay.filteredGameRecords[this.getLegDataKey(leg)]?.find(r => (r.id ?? r.gameID) === gameId)
                                                    //     ).filter(Boolean);
                                                    //     parlayHit = legRecords.length === this.props.parlay.legs.length &&
                                                    //         this.props.parlay.legs.every((leg, i) => buildTrendsData(this.context.league, leg.type, [legRecords[i]], null, leg.line, leg.market.name).hits === 1);
                                                    // } else {
                                                    //     parlayHit = this.props.parlay.legs.map(x => buildTrendsData(this.context.league, x.type, [record], null, x.line, x.market.name)).every(x => x.hits === 1);
                                                    // }
                                                    const trendData = buildTrendsData(this.context.league, this.state.legSelection.type, [record], null, this.state.legSelection.line, this.state.legSelection.market.name)
                                                    const hit = this.state.legSelection.outcome === "under" ? trendData.hits === 0 && trendData.push === 0 : trendData.hits === 1
                                                    const assetName = hit ? 'check-circle' : 'cancel-circle'
                                                    return (
                                                        <img className='parlay-workstation-content-parlay-column' data-hit={hit} src={`assets/${assetName}.svg`} alt={assetName}/>
                                                    )
                                                }
                                                const rawColumnName = dataColumnHeaders[columnIndex - staticColumns.length]
                                                return getDictionaryValue(record, statColumns[rawColumnName]);
                                            }}
                                        />
                                    )
                                }
                                {
                                    this.type === TREND_DETAILS_TYPE_STRAIGHT && (
                                        <Table 
                                            className='trends-page-game-log-table-mobile trends-page-game-log-stats-table'
                                            columns={gamelogColumns}
                                            rowCount={this.state.straight.filteredGameRecords.length}
                                            columnStyling={(columnIndex, columnName) => {
                                                if (columnIndex === 0) {
                                                    return {width: 104, textAlign: 'left', padding: '0px 12px'}
                                                }
                                                if (columnIndex === 1) {
                                                    return {width: 158, textAlign: 'left', padding: '0px 8px'};
                                                }
                                                if (columnIndex === 2) {
                                                    return {width: 104, textAlign: 'left', padding: '0px 8px'};
                                                }
                                                if (columnIndex === 3) {
                                                    return {width: 104, textAlign: 'center', padding: '0px 8px'};
                                                }
                                                return {textAlign: 'right', padding: '0px 12px'}
                                            }}
                                            dataExtractor={(rowIndex, columnIndex, columnName) => {
                                                // The data for the first few columns should be the same regardless of who's game record we use
                                                const record = this.state.straight.filteredGameRecords[rowIndex]
                                                if (!record) {
                                                    return null;
                                                }
                                                if (columnIndex === 0) {
                                                    const gameDate = parseDateFromString(record.timestamp);
                                                    return `${String(gameDate.month).padStart(2, '0')}/${String(gameDate.day).padStart(2, '0')}/${gameDate.yearShort}`
                                                }
                                                if (columnIndex === 1) {
                                                    const teamCode = record.opposingTeam;
                                                    return (
                                                        // Wrapping the content of the cell in a div allows us to then use flex inside
                                                        <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8}}>
                                                            <img src={getTeamLogoPath(effectiveLeague, record.opposingTeamId || getTeamIdByCode(this.context.teams, teamCode))} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, effectiveLeague)} height={32} width={32} alt={teamCode}/>
                                                            <p className="text-style-label-medium">{teamCode}</p>
                                                        </div>
                                                    )
                                                }
                                                if (columnIndex === 2) {
                                                    // Only the player game record has 'info'
                                                    return 'info' in record ? getGameResultText(effectiveLeague, record) : getTeamGameResultText(effectiveLeague, record);
                                                }
                                                if (columnIndex === 3) {
                                                    const trendData = buildTrendsData(effectiveLeague, this.props.trend.type, [record], null, this.props.trend.line, this.props.trend.market.name)
                                                    const hit = this.props.trend.outcome === "under" ? trendData.hits === 0 && trendData.push === 0 : trendData.hits === 1
                                                    const assetName = hit ? 'check-circle' : 'cancel-circle'
                                                    return (
                                                        <img className='parlay-workstation-content-parlay-column' data-hit={hit} src={`assets/${assetName}.svg`} alt={assetName}/>
                                                    )
                                                }
                                                const rawColumnName = dataColumnHeaders[columnIndex - staticColumns.length]
                                                return getDictionaryValue(record, statColumns[rawColumnName]);
                                            }}
                                        />
                                    )
                                }
                                </div>
                            </div>
                            </div>
                        </>
                    )}
                </div>
                {!this.props.hideFooter && <Footer />}
            </div>
        );
    }
}

export default GamelogDetails;
