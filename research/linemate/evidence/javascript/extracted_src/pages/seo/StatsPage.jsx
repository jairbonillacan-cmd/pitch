import React from 'react';

import './StatsPage.scss'
import '../../components/App.scss'

import { withRouter } from "react-router";
import { decimalPrecision, fetchPlayerRecord, formatOdds, getDictionaryValue, getFormattedLineValue, getGameResultText, getPlayerName, getTeamGameResultText, hasPremiumAccess, jsonOrDefault, noOpPromise, parseDateFromString } from '../../linemate-react-common/src/util';
import { API_HOST } from '../../react-web-constants';
import GlobalContext from '../../components/GlobalContext';
import { getLeagueLogoPath, getTeamIdByCode, getTeamLogoPath, getTheme, teamLogoPathOnErrorFallback } from '../../react-web-utils';
import { getMarketDescription, getMarketNameFromId, getPlayerSeasonGames } from '../../linemate-react-common/src/betting-utils';
import { getGamelogSupportingStats, getPlayerPropInfo, POSITIONAL_SHOWCASE_MARKETS, SCREENER_TEAM_SCORING_STATS, SUPPORTED_LEAGUES } from '../../linemate-react-common/src/constants';
import Table from '../../components/Table';
import Button from '../../components/Button';
import TrendCard from '../../components/HomePage/TrendCard';
import PaginationButtons from '../../components/PaginationButtons';
import SegmentedControl from '../../components/SegmentedControl';
import SearchField from '../../components/SearchField';
import { getAllTeams } from '../../linemate-react-common/src/gameday-utils';

const sameGameParlayKey = 'sameGameParlays';
const crossGameParlayKey = 'crossGameParlays'

class StatsPage extends React.Component {

    static contextType = GlobalContext

    constructor(props, context) {
        super(props, context);

        this.splitSegmentChanged = this.splitSegmentChanged.bind(this)
        this.submitSearch = this.submitSearch.bind(this)

        this.searchRef = React.createRef();

        this.splitSegmentOptions = {}
        if (this.props.type === "player") {
            this.splitSegmentOptions = {
                'season': 'Season',
                'home': 'Home',
                'away': 'Away'
            }
        }

        // Picking a random active legue to show in the suggested section
        const configLeagues = context.configuration.leagues
        const eligibleLeagues = Object.keys(configLeagues).filter(league => league !== context.league && configLeagues[league]?.active);
        const randomIndex = Math.floor(Math.random() * eligibleLeagues.length);
        this.suggestedTrendsLeague = eligibleLeagues[randomIndex]
        this.suggestedTrendsLeagueTitle = SUPPORTED_LEAGUES[this.suggestedTrendsLeague].title
        this.leagueTitle = SUPPORTED_LEAGUES[this.context.league].title

        this.oddsFormat = context.userAttributes?.preferredOddsFormat || 'american'

        this.state = {
            participantRecord: null,
            unfilteredGames: [],
            games: [],
            trends: [],
            sameGameParlays: [],
            crossGameParlays: [],
            suggestedTrends: [],
            parlaySelection: sameGameParlayKey,
            tablePage: 0,
            splitSegmentSelection: Object.keys(this.splitSegmentOptions)?.[0],
            teams: [],
            hitRates: []
        }
    }

    componentDidMount() {       
        if (this.props.type === "player") {
            const id = this.props.match.params.id
            Promise.all([
                fetchPlayerRecord(API_HOST, this.context.league, id, false),
                getPlayerSeasonGames(API_HOST, this.context.league, id),
                fetch(`${API_HOST}/api/${this.context.league}/v1/discovery/players/${id}/cards?premium=${true}`).then(data => jsonOrDefault(data, [])),
                fetch(`${API_HOST}/api/${this.suggestedTrendsLeague}/v1/discovery/trends?limit=3&premium=${true}`).then(data => jsonOrDefault(data, [])),
                fetch(`${API_HOST}/api/${this.context.league}/v3/players/${id}/trends/parlays?parlayType=SAME_GAME`).then(data => jsonOrDefault(data, [])),
                fetch(`${API_HOST}/api/${this.context.league}/v3/players/${id}/trends/parlays?parlayType=CROSS_GAME`).then(data => jsonOrDefault(data, []))
            ])
            .then(results => {
                const participant = results[0].info.fullName
                document.title = `${participant} stats - Linemate`;
                const state = {
                    participantRecord: results[0],
                    unfilteredGames: results[1],
                    games: results[1],
                    trends: results[2].slice(0, 3),
                    suggestedTrends: results[3].map(trend => ({...trend, league: this.suggestedTrendsLeague})),
                    sameGameParlays: results[4].slice(0, 2),
                    crossGameParlays: results[5].slice(0, 2),
                    parlaySelection: sameGameParlayKey
                }
                if (state.sameGameParlays.length === 0 && state.crossGameParlays.length > 0) {
                    state.parlaySelection = crossGameParlayKey
                }
                this.setState(state)
            })
            .catch(console.error)
        } else if (this.props.type === 'league' || this.props.type === 'odds') {
            document.title = this.props.type === 'league' ? `${this.leagueTitle} Stats` : `${this.leagueTitle} Odds`
            Promise.all([
                fetch(`${API_HOST}/api/${this.context.league}/v1/discovery/trends?limit=3&premium=${true}`).then(data => jsonOrDefault(data, [])),
                fetch(`${API_HOST}/api/${this.suggestedTrendsLeague}/v1/discovery/trends?limit=3&premium=${true}`).then(data => jsonOrDefault(data, [])),
                fetch(`${API_HOST}/api/${this.context.league}/v1/trends/parlays?parlayType=SAME_GAME&limit=2`).then(data => jsonOrDefault(data, [])),
                fetch(`${API_HOST}/api/${this.context.league}/v1/trends/parlays?parlayType=CROSS_GAME&limit=2`).then(data => jsonOrDefault(data, [])),
                this.props.type === 'league' ? getAllTeams(API_HOST, this.context.league) : noOpPromise([]),
                // Here the odds format could be region-specific
                // Arbitrarily capped at 100
                this.props.type === 'odds' ? fetch(`${API_HOST}/api/${this.context.league}/v3/markets/hitRates?timeframe=LAST_10&limit=100&outcomes=OVER,COVER,YES&oddsFormat=${this.oddsFormat}`).then(response => jsonOrDefault(response, [])) : noOpPromise([])
            ])
            .then(results => {
                const state = {
                    trends: results[0],
                    suggestedTrends: results[1].map(trend => ({...trend, league: this.suggestedTrendsLeague})),
                    sameGameParlays: results[2],
                    crossGameParlays: results[3],
                    parlaySelection: sameGameParlayKey,
                    teams: results[4],
                    hitRates: results[5]
                }
                if (state.sameGameParlays.length === 0 && state.crossGameParlays.length > 0) {
                    state.parlaySelection = crossGameParlayKey
                }
                this.setState(state)
            })
            .catch(console.error)
        }
    }

    splitSegmentChanged(value) {
        const filteredGames = this.state.unfilteredGames.filter(x => value === 'season' || (value === 'home' && x.home) || (value === 'away' && !x.home))
        this.setState({splitSegmentSelection: value, games: filteredGames, tablePage: 0})            
    }

    submitSearch(event) {
        event?.preventDefault?.();
        const searchValue = this.searchRef.current.value;
        window.location.href = `/${this.context.league}?search=${searchValue}`
    }

    render() {
        if (this.props.type === "player" && !this.state.participantRecord) {
            return <></>
        }
        if (this.props.type === 'league' && this.state.teams.length === 0) {
            return <></>
        }
        if (this.props.type === 'odds' && this.state.hitRates.length === 0) {
            return <></>
        }
        const participant = this.state.participantRecord
        var subject = ""
        var subjectShort = ''
        var tableColumns = {}
        var profileHref = '/'
        var trialStartHref = '/'
        var pricingHref = '/'
        var teamColor = 'rgba(1, 51, 105, 1)'
        var textHighlightColor = ''
        var showcaseImage = <></>
        var tableTitle = ''
        var tableAnnotation = ''
        var tableContent = []
        var tableActionText = ''
        var headlineSubjectSuffix = ''

        if (this.context.user) {
            // Already logged in
            if (hasPremiumAccess(this.context.userAttributes)) {
                // Already LM+
                trialStartHref = `/${this.context.league}`
                pricingHref = `/${this.context.league}`
            } else {
                trialStartHref = '/pricing'
                pricingHref = '/pricing'
            }
        } else {
            trialStartHref = '/signup?origin=/pricing'
            pricingHref = '/pricing'
        }

        if (this.props.type === "player") {
            const teamCode = participant.teamCode
            const teamId = participant.teamId || participant.info?.teamId || getTeamIdByCode(this.context.teams, teamCode)
            subject = participant.info.fullName
            headlineSubjectSuffix = 'Stats'
            subjectShort = getPlayerName(participant)
            const marketId = POSITIONAL_SHOWCASE_MARKETS[this.context.league](participant.info.position)
            const playerPropInfo = getPlayerPropInfo[this.context.league](marketId, null)
            tableColumns = getGamelogSupportingStats[this.context.league](playerPropInfo)
            profileHref = `/${this.context.league}/players/${this.props.match.params.id}/profile`
            teamColor = SUPPORTED_LEAGUES[this.context.league]?.teams?.colors?.[getTheme()]?.[teamCode.toLowerCase()]
            textHighlightColor = teamColor
            showcaseImage = <img src={getTeamLogoPath(this.context.league, teamId)} alt={teamCode}/>
            tableTitle = 'Gamelog'
            tableAnnotation = subject
            tableContent = this.state.games
            tableActionText = `View ${subject}'s profile`
        }
        if (this.props.type === 'league' || this.props.type === 'odds') {
            subject = this.leagueTitle
            subjectShort = this.leagueTitle
            showcaseImage = <img src={getLeagueLogoPath(this.context.league)} alt={this.context.league}/>
            textHighlightColor = 'var(--color-stats-text-highlight)'
            tableActionText = 'View all'
        }
        if (this.props.type === 'league') {
            tableTitle = `${this.leagueTitle} Stats`
            headlineSubjectSuffix = 'Stats'
            tableColumns = SCREENER_TEAM_SCORING_STATS(this.context.league, "cumulativeStats", "offensive")
            tableContent = this.state.teams
            profileHref = `/${this.context.league}/leaderboard`
        }
        if (this.props.type === 'odds') {
            tableTitle = `${this.leagueTitle} Odds`
            headlineSubjectSuffix = 'Odds'
            tableColumns = {}
            tableContent = this.state.hitRates
            profileHref = `/${this.context.league}/props`
        }
        return (
            <div className='stats-page-container'>
                {/* Ellipsis color */}
                <div className='stats-page-ellipsis-color' style={{backgroundColor: teamColor}}></div>
                {/* Headline */}
                <div className='stats-page-headline'>
                    <div className='stats-page-headline-title'>
                        <p className='color-fig-default'>Analyze</p>
                        <div className='stats-page-headline-title-subject'>
                            {showcaseImage}
                            <h1 className='color-fig-default'><span style={{color: textHighlightColor}}>{subject}</span> {headlineSubjectSuffix}</h1>
                        </div>
                    </div>
                    <div className='stats-page-headline-subtitle'>
                        <p className='text-style-h-3-normal color-fig-subtle'>Turn data into decisions — research trends, find your edge, and place your bet seamlessly on Linemate.</p>
                    </div>
                </div>
                {/* Gamelog/data table */}
                <div className='stats-page-gamelog stats-page-section-padding'>
                    <div className='stats-page-gamelog-header'>
                        <h2 className='text-style-h-3-medium color-fig-default'>{tableTitle} &nbsp;<span className='color-fig-subtle'>{tableAnnotation}</span></h2>
                        <div className='stats-page-gamelog-segmented-header-control'>
                            {
                                Object.keys(this.splitSegmentOptions).length > 1 && (
                                    <SegmentedControl options={this.splitSegmentOptions} selection={this.state.splitSegmentSelection} selectionHandler={this.splitSegmentChanged}/>
                                )
                            }
                        </div>
                    </div>
                    {
                        this.props.type === 'player' && (
                            <Table
                                className=""
                                columns={['DATE', 'VERSUS', 'RESULT'].concat(Object.keys(tableColumns))}
                                rowCount={Math.min(5, this.state.games.length)}
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
                                    const offset = this.state.tablePage * 5
                                    const gameIndex = offset + rowIndex
                                    if (gameIndex >= this.state.games.length) {
                                        return ''
                                    }
                                    const game = this.state.games.slice().reverse()[gameIndex]
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
                                                }}
                                            >
                                                <img
                                                    src={getTeamLogoPath(this.context.league, game.opposingTeamId || getTeamIdByCode(this.context.teams, teamCode))}
                                                    onError={({ currentTarget }) => teamLogoPathOnErrorFallback(currentTarget, this.context.league)}
                                                    height={32}
                                                    width={32}
                                                    alt={teamCode}
                                                />
                                                <p className="text-style-label-medium">{teamCode}</p>
                                            </div>
                                        )
                                    }
                                    if (columnIndex === 2) {
                                        return this.props.type === 'player'
                                            ? getGameResultText(this.context.league, game)
                                            : getTeamGameResultText(this.context.league, game)
                                    }
                                    return getDictionaryValue(game, tableColumns[columnName])
                                }}
                            />
                        )
                    }
                    {
                        this.props.type === 'league' && (
                            <Table
                                // Capping at 10 as an arbitrary number so we don't have to re-define a new list of stats
                                columns={['Rank', 'Name', 'GP'].concat(Object.keys(tableColumns).slice(0, 10))}
                                rowCount={5} 
                                columnStyling={(columnIndex, columnName) => {
                                    if (columnIndex === 0) {
                                        return { width: 60, textAlign: 'center', padding: '0px 12px' }
                                    }
                                    if (columnIndex === 1) {
                                        return { width: 91, textAlign: 'left', padding: '0px 8px' }
                                    }
                                    return { textAlign: 'right', padding: '0px 12px' }
                                }}
                                dataExtractor={(rowIndex, columnIndex, columnName) => {
                                    const offset = this.state.tablePage * 5
                                    const finalIndex = offset + rowIndex
                                    if (finalIndex >= this.state.teams.length) {
                                        return ''
                                    }
                                    if (columnIndex === 0) {
                                        return finalIndex + 1
                                    }
                                    const team = this.state.teams[finalIndex]
                                    if (columnIndex === 1) {
                                        const teamCode = team.code
                                        return (
                                            // Wrapping the content of the cell in a div allows us to then use flex inside
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    gap: 8
                                                }}
                                            >
                                                <img
                                                    src={getTeamLogoPath(this.context.league, team.teamId || team.id)}
                                                    onError={({ currentTarget }) => teamLogoPathOnErrorFallback(currentTarget, this.context.league)}
                                                    height={32}
                                                    width={32}
                                                    alt={teamCode}
                                                />
                                                <p className="text-style-label-medium">{teamCode}</p>
                                            </div>
                                        )
                                    }
                                    if (columnIndex === 2) {
                                        return team.gamesPlayed
                                    }
                                    return getDictionaryValue(team, tableColumns[columnName])
                                }}
                            />
                        )
                    }
                    {
                        this.props.type === 'odds' && (
                            <Table
                                columns={['Rank', 'Name', 'Bet Type', 'Line', 'Odds', 'Hit Rate', 'Hit %']}
                                rowCount={5} 
                                columnStyling={(columnIndex, columnName) => {
                                    if (columnIndex === 0) {
                                        return { width: 60, textAlign: 'center', padding: '0px 12px' }
                                    }
                                    if (columnIndex === 1 || columnIndex === 2) {
                                        return { width: 150, textAlign: 'left', padding: '0px 8px' }
                                    }
                                    return { textAlign: 'right', padding: '0px 12px' }
                                }}
                                dataExtractor={(rowIndex, columnIndex, columnName) => {
                                    const offset = this.state.tablePage * 5
                                    const finalIndex = offset + rowIndex
                                    if (finalIndex >= this.state.hitRates.length) {
                                        return ''
                                    }
                                    if (columnIndex === 0) {
                                        return finalIndex + 1
                                    }
                                    const hitRate = this.state.hitRates[finalIndex]
                                    const participantName = hitRate.level === 'player' ? getPlayerName(hitRate.player) : hitRate.team.code
                                    if (columnIndex === 1) {
                                        const teamCode = hitRate.team.code
                                        return (
                                            // Wrapping the content of the cell in a div allows us to then use flex inside
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    gap: 8
                                                }}
                                            >
                                                <img
                                                    src={getTeamLogoPath(this.context.league, hitRate.team)}
                                                    onError={({ currentTarget }) => teamLogoPathOnErrorFallback(currentTarget, this.context.league)}
                                                    height={32}
                                                    width={32}
                                                    alt={teamCode}
                                                />
                                                <p className="text-style-label-medium">{participantName}</p>
                                            </div>
                                        )
                                    }
                                    const type = hitRate.level === 'player' ? 'player' : 'team'
                                    if (columnIndex === 2) {
                                        // bet type
                                        return getMarketNameFromId(this.context.league, type, hitRate.marketId)
                                    }
                                    if (columnIndex === 3) {
                                        // line
                                        // positive spread edge case
                                        if (hitRate.marketId.includes('SPREAD') && hitRate.line > 0) {
                                            return `+ ${hitRate.line}`
                                        }
                                        return hitRate.line || '--'
                                    }
                                    if (columnIndex === 4) {
                                        // odds
                                        return formatOdds(this.oddsFormat, hitRate.odds[this.oddsFormat])
                                    }
                                    if (columnIndex === 5) {
                                        // hit rate
                                        return `${hitRate.hitRecord.hits}/${hitRate.hitRecord.games}`
                                    }
                                    if (columnIndex === 6) {
                                        // hit %
                                        return decimalPrecision(hitRate.hitRecord.hitRate, 0)
                                    }
                                    return ''
                                }}
                            />
                        )
                    }
                    <div className='stats-page-gamelog-actions'>
                        <div className='stats-page-gamelog-actions-left'>
                            <Button text={tableActionText} typography="md" type="primary" enabled={true} href={profileHref}/>
                            <Button text='Get the app' typography="md" type="secondary" enabled={true} href={`/download`}/>
                        </div>
                        <div className='stats-page-gamelog-actions-right'>
                            <PaginationButtons page={this.state.tablePage} increment={5} max={tableContent.length} onUpdate={(newPage) => this.setState({tablePage: newPage})}/>
                        </div>
                    </div>
                </div>
                {/* Subject trends */}
                {
                    this.state.trends.length > 0 && (
                        <div className='stats-page-trends stats-page-section-padding'>
                            <div className='stats-page-trends-header'>
                                <h2 className='text-style-h-2-semibold color-fig-default'>Top Trends for {subject}</h2>
                                <Button text={'View all'} typography='lg' type='invisible' enabled={true} href={profileHref}/>
                            </div>
                            <div className='stats-page-trends-list'>
                                {
                                    this.state.trends.map(trend => {
                                        return (
                                            <div className='stats-page-trends-list-item'>
                                                <TrendCard card={trend} parlay={false} subject={''}/>
                                            </div>
                                        )
                                    })
                                }
                            </div>
                        </div>
                    )
                }
                {/* Parlays */}
                {
                    (this.state.crossGameParlays.length > 0 || this.state.sameGameParlays.length) && (
                        <div className='stats-page-parlays'>
                            <div className='stats-page-parlays-paywall-cta stats-page-section-padding'>
                                <div className='stats-page-parlays-paywall-cta-text'>
                                    <p className='text-style-h-2-semibold color-fig-default'>Complete your <span style={{color: textHighlightColor}}>{subjectShort}</span> parlay with Linemate+</p>
                                    <p className='text-style-h-4-normal color-fig-subtle'>Exclusive parlay access — from same-game to multi-game — powered by advanced insights that highlight the strongest connections.</p>
                                </div>
                                <div className='stats-page-parlays-paywall-cta-buttons'>
                                    <Button text='Start your free trial' typography='lg' type='primary' enabled={true} href={trialStartHref}/>
                                    <Button text='See pricing' typography='lg' type='invisible' enabled={true} href={pricingHref}/>
                                </div>
                            </div>
                            <div className='stats-page-parlays-showcase'>
                                {
                                    this.state.crossGameParlays.length > 0 && this.state.sameGameParlays.length > 0 && (
                                        <div className='stats-page-parlays-showcase-selector'>
                                            <div className={this.state.parlaySelection === sameGameParlayKey ? 'stats-page-parlays-showcase-selector-selected' : ''} onClick={() => this.setState({parlaySelection: sameGameParlayKey})}>
                                                <p className={`text-style-label-medium color-fig-${this.state.parlaySelection === sameGameParlayKey ? 'default' : 'subtle'}`}>Same-Game Parlay</p>
                                            </div>
                                            <div className={this.state.parlaySelection === crossGameParlayKey ? 'stats-page-parlays-showcase-selector-selected' : ''} onClick={() => this.setState({parlaySelection: crossGameParlayKey})}>
                                                <p className={`text-style-label-medium color-fig-${this.state.parlaySelection === crossGameParlayKey ? 'default' : 'subtle'}`}>Parlay</p>
                                            </div>
                                        </div>
                                    )
                                }
                                <div className='stats-page-parlays-showcase-content'>
                                {
                                    this.state[this.state.parlaySelection].map(parlay => 
                                        <div className='stats-page-parlays-showcase-content-item'>
                                            <TrendCard card={parlay} parlay={true} subject={getMarketNameFromId(this.context.league, parlay.legs[0].type, parlay.legs[0].market.name)}/>
                                        </div>
                                    )
                                }
                                </div>
                                {/* Gradient */}
                                <div className='stats-page-parlays-showcase-content-gradient'></div>
                            </div>
                        </div>
                    )
                }
                {/* Search */}
                <div className='stats-page-search stats-page-section-padding'>
                    <div className='stats-page-search-text'>
                        <h2 className='text-style-h-1-semibold color-fig-default'>Search players. Discover insights.</h2>
                        <p className='text-style-h-4-normal color-fig-subtle'>Search any player to instantly see data-backed trends and insights across 14+ major leagues</p>
                    </div>
                    <form className='stats-page-search-action' onSubmit={this.submitSearch}>
                        <SearchField inputRef={this.searchRef} placeholder='Search for a player or team...'/>
                        <Button className='stats-page-search-action-button' text='Search' typography='lg' type='secondary' enabled={true} onClick={this.submitSearch}/>
                    </form>
                </div>
                {/* Suggested trends */}
                {
                    this.state.suggestedTrends.length > 0 && (
                        <div className='stats-page-trends stats-page-section-padding'>
                            <div className='stats-page-trends-header'>
                                <h2 className='text-style-h-2-semibold color-fig-default'>Top {this.suggestedTrendsLeagueTitle} trends</h2>
                                <Button text={'View all'} typography='lg' type='invisible' enabled={true} href={`/${this.suggestedTrendsLeague}/trends`}/>
                            </div>
                            <div className='stats-page-trends-list'>
                                {
                                    this.state.suggestedTrends.map(trend => {
                                        return (
                                            <div className='stats-page-trends-list-item'>
                                                <TrendCard card={trend} parlay={false} subject={''} league={this.suggestedTrendsLeague}/>
                                            </div>
                                        )
                                    })
                                }
                            </div>
                        </div>
                    )
                }
                {/* Reviews */}
                <div className='stats-page-reviews'>
                    <div className='stats-page-reviews-section'>
                        <p className='text-style-h-3-semibold color-fig-default'>10K+</p>
                        <p className='text-style-label-normal color-fig-subtle'>5 star reviews</p>
                    </div>
                    <div className='stats-page-reviews-section'>
                        <p className='text-style-h-3-semibold color-fig-default'>500K+</p>
                        <p className='text-style-label-normal color-fig-subtle'>Trusted by sports bettors of all levels</p>
                    </div>
                    <div className='stats-page-reviews-section'>
                        <p className='text-style-h-3-semibold color-fig-default'>10+</p>
                        <p className='text-style-label-normal color-fig-subtle'>Featured on sports betting outlets </p>
                    </div>
                </div>
                {/* Footer with CTA */}
                <div className='stats-page-footer stats-page-section-padding'>
                    <p className='text-style-h-1-semibold color-fig-default'>Turn your research into results with Linemate</p>
                    <div className='stats-page-footer-buttons'>
                        <Button text='Find trends' typography='lg' type='primary' enabled={true} href={`/${this.context.league}/trends`}/>
                        <Button text='Get the app' typography='lg' type='secondary' enabled={true} href='/download'/>
                    </div>
                </div>
            </div>
        )
    }

}

export default withRouter(StatsPage);
