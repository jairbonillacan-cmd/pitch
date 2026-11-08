import React, {useState, useEffect, useContext, useCallback, useRef} from "react";
import { useParams } from "react-router-dom";
import { isDictEmpty } from "../linemate-react-common/src/util";
import "./GameSummary.scss";
import "../components/TrendDetails.scss"
import ListComponent from "../components/ListComponent";
import { hasPremiumAccess, getGameTitle, filtersToQueryParamsDict, buildQueryParams, parseDateFromString, getLineTypeFilterForAPI, getGamesFilterForAPI, getSignalsFilterForAPI, getMultipleBetTypeFilterForAPI, getBetTypeOptionsForAPI, getStraightTrendTypeFilterForAPI, jsonOrDefault, getPlayerId, getTeamRecord, getRankDisplayName, getTeamDisplayName, getRankWithStandingType, getTeamRecordFromGames, addOrdinalNumberSuffix, orderListByField, getLocationAffiliates, isFreeUser, isPaidUser } from "../linemate-react-common/src/util";
import { OUTCOME_OPTION_KEYS, OVER_UNDER_OPTION_LABELS, SIGNAL_OPTION_KEYS, SIGNAL_OPTION_LABELS, TREND_OPTION_KEYS, TREND_OPTION_LABELS } from "../linemate-react-common/src/filter-config";
import { getTeamLogoPath, getTheme, teamLogoPathOnErrorFallback, shouldUseRoundTeamLogoBackground } from "../react-web-utils";
import { API_HOST } from '../react-web-constants';
import { getBetslipLegKey, getCardKey, getMarketDescription, isMarketSupported, supportedCrossGameParlayFilter, supportedSameGameParlayFilter, supportedTrendFilter } from '../linemate-react-common/src/betting-utils';
import TrendCard from "../components/HomePage/TrendCard";
import TrendContent from "../components/TrendContent";
import Loader from "../components/Loader";
import GlobalContext from "../components/GlobalContext";
import { GAME_SUMMARY_STATS_TEMPLATES, SUPPORTED_LEAGUES } from "../linemate-react-common/src/constants";
import _, { initial } from "lodash";
import SegmentedControl from "../components/SegmentedControl";
import Footer from "../components/Footer";
import InputSelection from "../components/InputSelection";
import NewHorizontalComparisonBar from "../components/NewHorizontalComparisonBar";
import Last5GamesCard from "../components/Last5GamesCard";
import { Buffer } from 'buffer';
import { getGameMarketInfo, getTeamMarketInfo } from "../linemate-react-common/src/gameday-utils";
import QuickPicksSection from "../components/QuickPicksSection";
import QuickPicksLine from "../components/QuickPicksLine";
import MyPicksWithOffers from "../components/MyPicksWithOffers";
import GamelogDetails from "../components/GamelogDetails";
import { FILTER_KEYS } from "../linemate-react-common/src/filter-config";
import { useTranslation } from "react-i18next";
import Button from "../components/Button";

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

function getStandingRankLabel(team, t) {
    const rankInfo = getRankWithStandingType(team);
    const standingTypeKey = (rankInfo.term || "overall").trim().toLowerCase();
    const standingTypeLabel = t(`gameSummary.standingTypes.${standingTypeKey}`, {
        defaultValue: rankInfo.term?.trim() || "",
    });

    return `${standingTypeLabel ? `${standingTypeLabel} ` : ""}${t("gameSummary.labels.rank")}:`;
}

function capitalizeLocalizedDate(value) {
    return value ? value.charAt(0).toLocaleUpperCase() + value.slice(1) : value;
}

function getRankingSideLabel(side, t) {
    return t(`gameSummary.rankingSides.${side}`, { defaultValue: side });
}

function getGameSummaryStatLabel(label, t) {
    return t(`gameSummary.statAbbreviations.${label}`, { defaultValue: label });
}

function GameSummary() {
    const { t, i18n } = useTranslation();
    const context = useContext(GlobalContext)
    const listRef = useRef(null)
    const listScrollContainerRef = useRef(null)
    let workstationResizeObserver = null
    const [gameData, setGameData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [matchTime, setMatchTime] = useState([]);
    const [teamAway, setTeamAway] = useState({});
    const [teamHome, setTeamHome] = useState({});
    const [recordSelection, setRecordSelection] = useState("season");
    const [awayRecords, setAwayRecords] = useState({})
    const [homeRecords, setHomeRecords] = useState({})
    const [teamAwayGames, setTeamAwayGames] = useState([])
    const [teamHomeGames, setTeamHomeGames] = useState([])
    const [teamAwayLast5Games, setTeamAwayLast5Games] = useState([])
    const [teamHomeLast5Games, setTeamHomeLast5Games] = useState([])
    const [headToHeadAwayGames, setHeadToHeadAwayGames] = useState([])
    const [headToHeadHomeGames, setHeadToHeadHomeGames] = useState([])
    const [headToHeadFilterDates, setHeadToHeadFilterDates] = useState({})
    const [headToHeadFilterSelection, setHeadToHeadFilterSelection] = useState({})
    const [headToHeadCurrentGameAway, setHeadToHeadCurrentGameAway] = useState({})
    const [headToHeadCurrentGameHome, setHeadToHeadCurrentGameHome] = useState({})
    const [allTeams, setAllTeams] = useState([])
    const [awayRankings, setAwayRankings] = useState({})
    const [homeRankings, setHomeRankings] = useState({})
    const [currentWidth, setCurrentWidth] = useState(window.innerWidth);

    const [gameMarket, setGameMarket] = useState([])
    const [awayTeamMarketInfo, setAwayTeamMarketInfo] = useState({})
    const [homeTeamMarketInfo, setHomeTeamMarketInfo] = useState({})
    const [gameMarketInfo, setGameMarketInfo] = useState({})
    const [headerTab, setHeaderTab] = useState('gameSummary')
    const [trendTabRevealed, setTrendTabRevealed] = useState(false)
    const [gameSummaryMobileView, setGameSummaryMobileView] = useState('summary')

    const betslipSize = Object.values(context.betslip.groupedLegs).flatMap(league => Object.values(league)).reduce((sum, arr) => sum + arr.length, 0)
    const isWide = () => currentWidth > 1100;

    const searchParams = new URLSearchParams(window.location.search)
    const customFeed = searchParams.has('feed')
      ? JSON.parse(Buffer.from(searchParams.get('feed'), 'base64').toString('utf-8'))
      : null
    if (!hasPremiumAccess(context.userAttributes) && customFeed && customFeed.without) {
      // If it's a free user but has somehow gotten a link for without
      customFeed = null
    }
    const { statsTemplate = [], categorizedStatsTemplate = [], } = GAME_SUMMARY_STATS_TEMPLATES[context.league] || {};

    let { gameID } = useParams();
    if (!gameID) {
        if (context.currentGames?.[0]?.id) {
            gameID = context.currentGames?.[0]?.id
        }
        else {
            window.location.href = `/${context.league}`
        }
    }

    const awayCode = gameID.split('-')[1]
    const homeCode = gameID.split('-')[2]
    const awayTeamId = gameData?.awayTeamData?.info?.teamId || teamAway?.teamId
    const homeTeamId = gameData?.homeTeamData?.info?.teamId || teamHome?.teamId
    const affiliates = getLocationAffiliates(context.location?.region?.code, context.location?.country?.code, context.configuration.affiliateOffers, [], context.userAttributes?.confirmedProviders || [], context.userAttributes?.preferredProviders || [], [], context.configuration.advertising?.location?.trends?.tiers || []).affiliates

    useEffect(() => {
        document.title = `${t("trends.navigation.gameSummary")} - Linemate`;
        const onResize = () => setCurrentWidth(window.innerWidth)
        window.addEventListener("resize", onResize)
        
        setLoading(true)

        Promise.all([
            fetch(`${API_HOST}/api/${context.league}/v3/games/${gameID}`).then(data => {return data.json();}),
            fetch(`${API_HOST}/api/${context.league}/v3/teams/${awayCode}/games?sortingOrder=DESC`).then((response) => jsonOrDefault(response, [])),
            fetch(`${API_HOST}/api/${context.league}/v3/teams/${homeCode}/games?sortingOrder=DESC`).then((response) => jsonOrDefault(response, [])),
            fetch(`${API_HOST}/api/${context.league}/v3/teams/${awayCode}/games?sortingOrder=DESC&timeframe=LAST_5`).then((response) => jsonOrDefault(response, [])),
            fetch(`${API_HOST}/api/${context.league}/v3/teams/${homeCode}/games?sortingOrder=DESC&timeframe=LAST_5`).then((response) => jsonOrDefault(response, [])),
            fetch(`${API_HOST}/api/${context.league}/v3/teams/${awayCode}`).then((response) => jsonOrDefault(response, [])),
            fetch(`${API_HOST}/api/${context.league}/v3/teams/${homeCode}`).then((response) => jsonOrDefault(response, [])),
            fetch(`${API_HOST}/api/${context.league}/v3/teams/${awayCode}/games?timeframe=MATCHUP&opponent=${homeCode}&sortingOrder=DESC`).then((response) => jsonOrDefault(response, [])),
            fetch(`${API_HOST}/api/${context.league}/v3/teams/${homeCode}/games?timeframe=MATCHUP&opponent=${awayCode}&sortingOrder=DESC`).then((response) => jsonOrDefault(response, [])),
            fetch(`${API_HOST}/api/${context.league}/v3/teams`).then((response) => jsonOrDefault(response, [])),
            fetch(`${API_HOST}/api/${context.league}/v3/games/${gameID}/markets?levelsToInclude=game,team`).then((response) => jsonOrDefault(response, []))
        ])
        .then((results) => {
            const gameSelected = results[0]
            if (gameSelected.code === 404) {
                if (context.currentGames?.[0]) {
                    setGameData(context.currentGames[0])
                }
                else {
                    window.location.href = `/${context.league}`
                }
            } else {
                setGameData(results[0])
            }
            
            const awayGames = Array.isArray(results[1]) ? results[1] : [];
            const homeGames = Array.isArray(results[2]) ? results[2] : [];
            const awayLast5Games = Array.isArray(results[3]) ? results[3] : [];
            const homeLast5Games = Array.isArray(results[4]) ? results[4] : [];

            setTeamAwayGames(awayGames)
            setTeamHomeGames(homeGames)
            setTeamAwayLast5Games(awayLast5Games)
            setTeamHomeLast5Games(homeLast5Games)
            const dateTimestamp = new Date(results[0].timestamp)
            const matchDateString = capitalizeLocalizedDate(
                dateTimestamp.toLocaleDateString(i18n.language || undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                }).replace(',', '')
            );
            const matchTimeString = dateTimestamp.toLocaleTimeString(i18n.language || undefined, {
                hour: 'numeric',
                minute: '2-digit'
            })
            setMatchTime([matchDateString, matchTimeString])
            setTeamAway(results[5])
            setTeamHome(results[6])

            setAwayRecords({
                overall: getTeamRecordFromGames(results[1], context.league),
                home: getTeamRecordFromGames(results[1].filter(gameSelected => gameSelected.isHome), context.league),
                away: getTeamRecordFromGames(results[1].filter(gameSelected => !gameSelected.isHome), context.league)
            })
            setHomeRecords({
                overall: getTeamRecordFromGames(results[2], context.league),
                home: getTeamRecordFromGames(results[2].filter(gameSelected => gameSelected.isHome), context.league),
                away: getTeamRecordFromGames(results[2].filter(gameSelected => !gameSelected.isHome), context.league)
            })
            setHeadToHeadAwayGames(results[7]);
            setHeadToHeadHomeGames(results[8]);

            let objectOfDates = {}
            if (results[7].length != 0) {
                for (const game of results[7]) {
                    const gameTimestamp = new Date(game.timestamp)
                    const gameDateString = gameTimestamp.toLocaleDateString('en-US', {
                        month: '2-digit',
                        day: '2-digit',
                        year: '2-digit'
                    })
                    objectOfDates[gameDateString] = gameDateString
                }
                setHeadToHeadFilterDates(objectOfDates)
                setHeadToHeadFilterSelection(objectOfDates[new Date(results[7][0].timestamp).toLocaleDateString('en-US', {
                        month: '2-digit',
                        day: '2-digit',
                        year: '2-digit'
                    })]
                )

                let headToHeadCurrentAwayObject = {}
                let headToHeadCurrentHomeObject = {}

                for (const field of statsTemplate) {
                    headToHeadCurrentAwayObject[field.value] = Math.round(getByPath(results[7][0].cumulativeStats, field.value) * 100)/100
                    headToHeadCurrentHomeObject[field.value] = Math.round(getByPath(results[8][0].cumulativeStats, field.value) * 100)/100
                }

                setHeadToHeadCurrentGameAway(headToHeadCurrentAwayObject)
                setHeadToHeadCurrentGameHome(headToHeadCurrentHomeObject)
            }

            setAllTeams(results[9])
            
            let rankingsAwayObject = {}
            let rankingsHomeObject = {}

            for (const field of categorizedStatsTemplate) {
                rankingsAwayObject[field.label] = {rank: addOrdinalNumberSuffix(orderAndFindPosition(results[9], awayCode, `averageStats.${field.value.for.field}`, field.value.for.sortingOrder)), position: "FOR"}
                rankingsHomeObject[field.label] = {rank: addOrdinalNumberSuffix(orderAndFindPosition(results[9], homeCode, `averageStats.${field.value.against.field}`, field.value.against.sortingOrder)), position: "AGAINST"}
            }
            setAwayRankings(rankingsAwayObject)
            setHomeRankings(rankingsHomeObject)

            let game = {}
            let listOfMarkets = results[10].filter(line => line.team.code === awayCode)
            let marketObject = {}
            for (const market of listOfMarkets) {
                marketObject[market.name] = market
            }
            game.away = {}
            game.home = {}
            game.away.markets = marketObject
            listOfMarkets = results[10].filter(line => line.team.code === homeCode)
            marketObject = {}
            for (const market of listOfMarkets) {
                marketObject[market.name] = market
            }
            game.home.markets = marketObject
            marketObject = {}
            listOfMarkets = results[10]
            for (const market of listOfMarkets) {
                marketObject[market.name] = market
            }
            game.markets = marketObject
            setGameMarket(game)
            setGameMarketInfo(getGameMarketInfo(game, context.userAttributes || {}, true, context.resolvedPreferredProviders))
            setAwayTeamMarketInfo(getTeamMarketInfo(game.away, context.userAttributes || {}, context.resolvedPreferredProviders))
            setHomeTeamMarketInfo(getTeamMarketInfo(game.home, context.userAttributes || {}, context.resolvedPreferredProviders))
        })
        .finally(() => {
            setLoading(false)
        })
        const combinedGames = [...context.currentGames, ...context.upcomingGames]

        workstationResizeObserver = new ResizeObserver((entries) => {
            // This solution is not ideal, I would have preferred to have this done via css but couldn't figure out how to do it
            // The screen width check is so that it doesn't happen on mobile
            // This was previously in componentDidUpdate when the workstation was here, 
            //  but since it's now a separate component this is the easiest way to watch for a layout change
            if (listRef.current && window.screen.width >= 1024) {
                listRef.current.style.height = `${entries[0].contentRect.height}px`;
            }
        })
        if (!loading) {
            workstationResizeObserver.observe(document.getElementsByClassName("trends-page-details")[0]);
        }
        
        return () => {
            window.removeEventListener("resize", onResize)
        }
    }, [])

    const handleRemoveLine = (lineToRemove) => {
        context.removeLegsFromBetslip([lineToRemove])
    }

    const commonLegVars = (type, awayOrHome) => {
        let line = ""
        let market = {}
        let outcome = "cover"
        let book = ""
        switch (type) {
            case "SPREAD":
                const teamMarketInfo = getTeamMarketInfo(gameMarket[awayOrHome], context.userAttributes || {}, context.resolvedPreferredProviders).spread
                line = teamMarketInfo.line
                market = gameMarket[awayOrHome].markets.SPREAD
                book = teamMarketInfo.book
                break;
            case "GAME_TOTAL":
                if (awayOrHome === "away") {
                    const marketInfo = (getGameMarketInfo(gameMarket, context.userAttributes, false, context.resolvedPreferredProviders).awayTeamData)
                    line = marketInfo.line.split(" ")[1]
                    book = marketInfo.book
                    outcome = marketInfo.line.split(" ")[0].toLowerCase()
                } else {
                    const marketInfo = (getGameMarketInfo(gameMarket, context.userAttributes, false, context.resolvedPreferredProviders).homeTeamData)
                    line = marketInfo.line.split(" ")[1]
                    book = marketInfo.book
                    outcome = marketInfo.line.split(" ")[0].toLowerCase()
                }
                market = gameMarket.markets.GAME_TOTAL
                break;
            default:
                const moneylineTeamMarketInfo = getTeamMarketInfo(gameMarket[awayOrHome], context.userAttributes || {}, context.resolvedPreferredProviders).moneyline
                market = gameMarket[awayOrHome].markets.MONEY_LINE
                line = 0;
                book = moneylineTeamMarketInfo.book
        }
        return {line: line, market: market, outcome: outcome, book: book}
    }

    const checkIfLegExists = (type, awayOrHome) => {
        const legVars = commonLegVars(type, awayOrHome)
        let teamCode = awayOrHome === 'away' ? awayCode : homeCode
        if (type === "GAME_TOTAL") {
            teamCode = homeCode
        }
        const key = `${context.league}-${gameID}-${teamCode}-${type}-${legVars.line}-${legVars.outcome}`
        return key in context.betslip.legs
    }

    const handleAddToBetslip = (type, awayOrHome) => {
        //setExpandedPicks(true)
        const legVars = commonLegVars(type, awayOrHome)
        const legToAdd = {
            league: context.league,
            line: legVars.line,
            market: legVars.market,
            book: legVars.book,
            team: legVars.market.team,
            opposingTeam: legVars.market.opposingTeam,
            player: legVars.market.player,
            gameId: legVars.market.gameId,
            home: legVars.market.isHome,
            outcome: legVars.outcome,
            type: legVars.market.level === 'player' ? 'player' : 'team',
            alternate: false
        }
        const key = getBetslipLegKey(context.league, legToAdd)
        if (key in context.betslip.legs) {
            context.removeLegsFromBetslip([legToAdd])
        } else {
            context.addLegsToBetslip([legToAdd])
        }
    }

    const orderAndFindPosition = (leagueStandings, teamCode, fieldPath, order) => {
            orderListByField(leagueStandings, fieldPath, order);
            var position = 1;
            for (let standing of leagueStandings) {
                if (standing.code === teamCode) {
                    return position;
                }
                position += 1;
            }
            return position;
        }

    const handleHeadToHeadFilterSelection = (dateSelected) => {
        setHeadToHeadFilterSelection(dateSelected)
        const awayTeamStats = headToHeadAwayGames.find(game => {
            const currentGameDate = new Date(game.timestamp)

            const formattedDate = currentGameDate.toLocaleDateString("en-US", {
                month: "2-digit",
                day: "2-digit",
                year: "2-digit"
            });

            return formattedDate === dateSelected
        })
        const homeTeamStats = headToHeadHomeGames.find(game => {
            const currentGameDate = new Date(game.timestamp)

            const formattedDate = currentGameDate.toLocaleDateString("en-US", {
                month: "2-digit",
                day: "2-digit",
                year: "2-digit"
            });

            return formattedDate === dateSelected
        })

        let headToHeadCurrentAwayObject = {}
        let headToHeadCurrentHomeObject = {}

        for (const field of statsTemplate) {
            headToHeadCurrentAwayObject[field.value] = Math.round(getByPath(awayTeamStats.cumulativeStats, field.value) * 100)/100
            headToHeadCurrentHomeObject[field.value] = Math.round(getByPath(homeTeamStats.cumulativeStats, field.value) * 100)/100
        }

        setHeadToHeadCurrentGameAway(headToHeadCurrentAwayObject)
        setHeadToHeadCurrentGameHome(headToHeadCurrentHomeObject)
        
    }

    const getByPath = (obj, path) =>
        path.split('.').reduce((acc, key) => acc?.[key], obj);

    const handleRecordSelection = (recordTabSelected) => {
        setRecordSelection(recordTabSelected);
        let gamesToFilterAway = teamAwayGames;
        let gamesToFilterHome = teamHomeGames;
        if (recordTabSelected == 'last5') {
            gamesToFilterAway = teamAwayLast5Games.slice(0, 5);
            gamesToFilterHome = teamHomeLast5Games.slice(0, 5);
        }
        else if (recordTabSelected == 'headToHead') {
            gamesToFilterAway = headToHeadAwayGames;
            gamesToFilterHome = headToHeadHomeGames;
        }
        setAwayRecords({
            overall: getTeamRecordFromGames(gamesToFilterAway, context.league),
            home: getTeamRecordFromGames(gamesToFilterAway.filter(gameSelected => gameSelected.isHome), context.league),
            away: getTeamRecordFromGames(gamesToFilterAway.filter(gameSelected => !gameSelected.isHome), context.league)
        })
        setHomeRecords({
            overall: getTeamRecordFromGames(gamesToFilterHome, context.league),
            home: getTeamRecordFromGames(gamesToFilterHome.filter(gameSelected => gameSelected.isHome), context.league),
            away: getTeamRecordFromGames(gamesToFilterHome.filter(gameSelected => !gameSelected.isHome), context.league)
        })
    }

    const handleRankingsSwap = () => {
        let rankingsAwayObject = {}
        let rankingsHomeObject = {}

        if (awayRankings[categorizedStatsTemplate[0].label].position === "FOR") {
            for (const field of categorizedStatsTemplate) {
                rankingsAwayObject[field.label] = {rank: addOrdinalNumberSuffix(orderAndFindPosition(allTeams, awayCode, `averageStats.${field.value.against.field}`, field.value.against.sortingOrder)), position: "AGAINST"}
                rankingsHomeObject[field.label] = {rank: addOrdinalNumberSuffix(orderAndFindPosition(allTeams, homeCode, `averageStats.${field.value.for.field}`, field.value.for.sortingOrder)), position: "FOR"}
            }
        } else {
            for (const field of categorizedStatsTemplate) {
                rankingsAwayObject[field.label] = {rank: addOrdinalNumberSuffix(orderAndFindPosition(allTeams, awayCode, `averageStats.${field.value.for.field}`, field.value.for.sortingOrder)), position: "FOR"}
                rankingsHomeObject[field.label] = {rank: addOrdinalNumberSuffix(orderAndFindPosition(allTeams, homeCode, `averageStats.${field.value.against.field}`, field.value.against.sortingOrder)), position: "AGAINST"}
            }
        }
        
        setAwayRankings(rankingsAwayObject)
        setHomeRankings(rankingsHomeObject)
    }

    let recordPickerOptions = {
        "season": t("trends.stats.picker.season"),
        "last5": t("trends.stats.picker.last5"),
        "headToHead": t("trends.stats.picker.headToHead")
    }

    let pickerOptionsInit = {
        "player": t("trends.tabs.player"),
        "team": t("trends.tabs.team"),
        "sameGameParlay": t("trends.tabs.sgp"),
    }

    const profile = searchParams.has('profile') && Boolean(searchParams.get('profile'))
    pickerOptionsInit = {
        "player": "Player",
        "team": "Team",
        "sameGameParlay": "SGP",
    }

    const tabsInit = searchParams.get('tabs');
    if (tabsInit) {
        try {
            const parsedTabs = JSON.parse(decodeURIComponent(tabsInit))
            pickerOptionsInit = Object.fromEntries(Object.keys(pickerOptionsInit).filter(x => parsedTabs.includes(x)).map(x => [x, pickerOptionsInit[x]]))
        } catch (err) {
            console.log(err)
        }
    }
    const tabsNotInit = Object.keys(pickerOptionsInit)

    var listFiltersInit = {
        player: {},
        team: {},
        sameGameParlay: {},
        crossGameParlay: {},
        trends: {}
    };

    const games = context.currentGames
    const gameTitleToGameIdDict = Object.fromEntries(games.map(x => [getGameTitle(context.league, x), x.id]))
    const gameTitleToAnnotationDict = Object.fromEntries(games.map(x => {
        const parsedDate = parseDateFromString(x.timestamp);
        return [getGameTitle(context.league, x), `${parsedDate.dayOfWeekShort} ${parsedDate.formattedTime}`]
    }))

    // If it's a profile, don't include filters
    const includeFilters = (!customFeed || !('includeFilters' in customFeed) || Boolean(customFeed.includeFilters)) && !profile
    if (includeFilters) {
        Object.keys(pickerOptionsInit).forEach((option) => {
            listFiltersInit[option][FILTER_KEYS.LINE_TYPE] = getLineTypeFilterForAPI();
            listFiltersInit[option][FILTER_KEYS.OVER_UNDER] = getOverUnderFilterForAPI();
            listFiltersInit[option][FILTER_KEYS.TRENDS] = getTrendsFilterForAPI(context.league);

            if (option === "sameGameParlay") {
                listFiltersInit[option][FILTER_KEYS.TRENDS].options = Object.fromEntries(
                    Object.keys(listFiltersInit[option][FILTER_KEYS.TRENDS].options)
                        .filter((key) => key !== SIGNAL_OPTION_KEYS.OPPONENT_RANK)
                        .map((key) => [key, listFiltersInit[option][FILTER_KEYS.TRENDS].options[key]])
                );

                if (listFiltersInit[option][FILTER_KEYS.TRENDS].optionLabels) {
                    listFiltersInit[option][FILTER_KEYS.TRENDS].optionLabels = Object.fromEntries(
                        Object.keys(listFiltersInit[option][FILTER_KEYS.TRENDS].optionLabels)
                            .filter((key) => key !== SIGNAL_OPTION_KEYS.OPPONENT_RANK)
                            .map((key) => [key, listFiltersInit[option][FILTER_KEYS.TRENDS].optionLabels[key]])
                    );
                }
            }

            listFiltersInit[option][FILTER_KEYS.BET_TYPE] = getMultipleBetTypeFilterForAPI(getBetTypeOptionsForAPI(context.league, option));

            if (!option.toLowerCase().includes("parlay")) {
                listFiltersInit[option][FILTER_KEYS.TREND_TYPE] = getStraightTrendTypeFilterForAPI(option)
            }

            Object.keys(customFeed?.initialFilters || {}).forEach((filter) => {
                listFiltersInit[option][filter] = customFeed.initialFilters[filter]
            })

            Object.keys(listFiltersInit[option]).forEach((filter) => {
                if (customFeed && customFeed.filtersToExclude && customFeed.filtersToExclude.includes(filter)) {
                    listFiltersInit[option][filter].hidden = true
                }
            })
        })
    }

    const startingIndex = searchParams.get('index') || 0

    if (profile) {
        if (customFeed.player) {
            pickerOptionsInit = {
                'player': t("trends.tabs.player")
            }
        } else {
            pickerOptionsInit = {
                'team': t("trends.tabs.team")
            }
        }
        pickerOptionsInit['crossGameParlay'] = t("trends.tabs.parlay")
        pickerOptionsInit['sameGameParlay'] = t("trends.tabs.sgp")
    }
    const selectedTab = searchParams.get('tab');
    const pickerSelectionInit = selectedTab && pickerOptionsInit?.[selectedTab] ? selectedTab : Object.keys(pickerOptionsInit)[0]

    const [tabs, setTabs] = useState({
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
    })
    const [pickerSelection, setPickerSelection] = useState(pickerSelectionInit)
    const [cardSelectionLoading, setCardSelectionLoading] = useState(false)
    const [selectedCard, setSelectedCard] = useState(null)
    const [selectedCardMarkets, setSelectedCardMarkets] = useState(null)
    const [listFilters, setListFiltersState] = useState(_.cloneDeep(listFiltersInit))
    const setListFilters = (next) => {
        setListFiltersState(next)
    }
    const [mobileCardSelected, setMobileCardSelected] = useState(false)
    const [initialCardSelection, setInitialCardSelection] = useState(true)
    /*const [conditionalTab, setConditionalTab] = useState(null)
    const [callbackTrigger, setCallbackTrigger] = useState(false)*/

    const fetchBatch = (tab, offset, reset, initialLoad, filtersOverride) => {
        if (customFeed?.endpoint) {
            return
        }

        const filtersToUse = (filtersOverride && filtersOverride[tab]) ? filtersOverride[tab] : listFilters[tab]
        const dataLimitIncrement = 20

        const apiFilters = {
            offset: offset,
            limit: dataLimitIncrement,
            preferredProviders: context.resolvedPreferredProviders,
            parlayType: PARLAY_TYPE_QUERY_PARAM[tab],
            ...filtersToQueryParamsDict(filtersToUse),
            ...customFeed?.queryParams,
            gameIds: gameID
        }

        const queryParams = buildQueryParams(apiFilters)
        const currentTrendsLength = tabs[tab].trends.length

        fetch(`${endpoints[tab](context.league)}?${queryParams}`)
            .then((response) => jsonOrDefault(response, []))
            .then((trendsResponse) => {
                const filteredTrends = trendsResponse.filter((trend) => filterFunctions[tab](context.league, trend))
                const newTrends = filteredTrends

                setTabs((prevTabs) => {
                    const newTabData = {
                        trends: reset ? newTrends : (prevTabs[tab]?.trends ?? []).concat(newTrends),
                        offset: offset + dataLimitIncrement,
                        loadingBatch: false,
                        initialLoadInProgress: false,
                        endReached: trendsResponse.length < dataLimitIncrement,
                        lastFetchTime: new Date().getTime()
                    }
                    const updatedTabs = { ...prevTabs, [tab]: newTabData }

                    if (initialLoad) {
                        setSelectedCard(null)
                        if (tab === 'player' || tab === 'team') cardSelected(null, true, context.currentGames)
                        else if (tab === 'sameGameParlay' || tab === 'crossGameParlay') sameGameParlaySelected(null, true, context.currentGames)
                    }

                    if (!reset && currentTrendsLength > 0) {
                        const container = document.querySelector('.trends-page-list-items')
                        if (container) {
                            const items = container.querySelectorAll('.trends-page-list-items-item, .trends-page-list-items-item-selected')
                            if (items[currentTrendsLength - 1]) {
                                items[currentTrendsLength - 1].scrollIntoView(false, { behavior: 'auto', block: 'end' })
                            }
                        }
                    }

                    return updatedTabs
                })
            })
            .catch((err) => {
                console.error(err)
                setTabs((prevTabs) => ({
                    ...prevTabs,
                    [tab]: {
                        ...(prevTabs[tab] || {}),
                        loadingBatch: false,
                        initialLoadInProgress: false
                    }
                }))
            })
    }

    const cardSelected = (card, initialLoad, games) => {
        if (!initialLoad) {
            if (isWide()) listScrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            else window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        if (card && selectedCard && getCardKey(card) === getCardKey(selectedCard)) {
            setMobileCardSelected(!initialLoad)
            setInitialCardSelection(initialLoad)
            if (!isWide() && !initialLoad) {
                setGameSummaryMobileView('detail')
            }
            return
        }
        if (!card) {
            setMobileCardSelected(true)
            return
        }
        // This is to make sure you can't start spam clicking cards while a card is loading which would trigger a bunch of fetches
        if (cardSelectionLoading) {
            return;
        }

        setTrendTabRevealed(true)
        if (isWide() && headerTab === 'gameSummary') {
            setHeaderTab('trend')
        }
        if (!isWide() && !initialLoad) {
            setGameSummaryMobileView('detail')
        }

        var selectedCardMarketsInit = {}
        var cardGame
        if (games) {
            cardGame = games.find((x) => x.id === card.gameId)
        } else {
            cardGame = context.currentGames.find((x) => x.id === card.gameId)
        }
        if (cardGame) {
            var teamPath = ''
            if (cardGame.awayTeamData.info.code === card.team.code) {
                teamPath = 'awayTeamData'
            } else {
                teamPath = 'homeTeamData'
            }

            if (card.type === 'team') {
                selectedCardMarketsInit = Object.assign({}, cardGame.markets, cardGame[teamPath].markets)
            } else if (card.type === 'player' && cardGame[teamPath].players) {
                const playerRecord = cardGame[teamPath].players.find(
                (x) => getPlayerId(x.info) === getPlayerId(card.player)
                )
                selectedCardMarketsInit = playerRecord.props
            }
        }

        setCardSelectionLoading(false)
        setSelectedCard(card)
        setMobileCardSelected(!initialLoad)
        setInitialCardSelection(initialLoad)
        setSelectedCardMarkets(selectedCardMarketsInit)
    }

    const sameGameParlaySelected = (parlay, initialLoad) => {
        if (!initialLoad) {
            if (isWide()) listScrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            else window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        if (parlay && selectedCard && getCardKey(parlay) === getCardKey(selectedCard)) {
            setMobileCardSelected(!initialLoad)
            setInitialCardSelection(initialLoad)
            if (!isWide() && !initialLoad) {
                setGameSummaryMobileView('detail')
            }
            return
        }
        if (!parlay) {
            setMobileCardSelected(true)
            return
        }
        // This is to make sure you can't start spam clicking cards while a card is loading which would trigger a bunch of fetches
        if (cardSelectionLoading) {
            return;
        }
        setTrendTabRevealed(true)
        if (isWide() && headerTab === 'gameSummary') {
            setHeaderTab('trend')
        }
        if (!isWide() && !initialLoad) {
            setGameSummaryMobileView('detail')
        }
        setCardSelectionLoading(false)
        setSelectedCard(parlay)
        setMobileCardSelected(!initialLoad)
        setInitialCardSelection(initialLoad)
        setSelectedCardMarkets({})
    }

    const haveCards = tabs[pickerSelection].trends.length > 0
    const awayTeamInjuries = Array.isArray(gameData?.awayTeamData?.injuries) ? gameData.awayTeamData.injuries : []
    const homeTeamInjuries = Array.isArray(gameData?.homeTeamData?.injuries) ? gameData.homeTeamData.injuries : []
    const selectedTrendTabLabel = selectedCard && !selectedCard.legs
        ? `${selectedCard.type === 'player' ? `${selectedCard.player.firstName[0]}. ${selectedCard.player.lastName}` : selectedCard.team.code}: ${getMarketDescription(
            context.league,
            selectedCard.type,
            selectedCard.line,
            selectedCard.outcome,
            selectedCard.market,
            selectedCard.alternate,
            t
        )}`
        : '';
    const useRoundBackground = shouldUseRoundTeamLogoBackground(context.league);
    const isMobileView = currentWidth <= 1100;
    const gameSummaryMobileModeClassName = isMobileView ? ` game-summary-page-container-mobile-${gameSummaryMobileView}` : '';
    const gameSummaryTitle = `${getTeamDisplayName(context.league, teamAway)} @ ${getTeamDisplayName(context.league, teamHome)}`;
    const gameSummaryListTitle = isMobileView
        ? (
            <button
                type="button"
                className="game-summary-mobile-list-title-button"
                onClick={() => {
                    setGameSummaryMobileView('summary')
                    setSelectedCard(null)
                    setHeaderTab('gameSummary')
                }}
            >
                <p className="text-style-h-4-semibold color-fig-default">{gameSummaryTitle}</p>
            </button>
        )
        : t("trends.navigation.gameSummary");

    return (
        <div className="game-summary-root">
            <div className="game-summary-page-wrapper">
            <div className={`game-summary-page-container${gameSummaryMobileModeClassName}`}>
                <div className="game-summary-trends-list-column">
                    <ListComponent 
                        title={gameSummaryListTitle}
                        showGamesFilter={false}
                        fetchBatch={fetchBatch}
                        emptyStateMode='trends'
                        setListFilters={setListFilters}
                        customFeed={customFeed}
                        profile={profile}
                        pickerOptions={pickerOptionsInit}
                        tabs={tabs}
                        pickerSelection={pickerSelection}
                        setPickerSelection={setPickerSelection}
                        haveCards={haveCards}
                        listFilters={listFilters}
                        listRef={listRef}
                        listScrollContainerRef={listScrollContainerRef}
                        cardSelected={cardSelected}
                        renderList={useCallback((state) => {
                            return (
                            <>
                                <div key={`${state.pickerSelection}-${state.tabs[state.pickerSelection].lastFetchTime}`} className='trends-page-list-items'>
                                    {/* Show list of trends if it's not parlay (available to everyone) or for parlay if it's a premium account only */}
                                    {
                                        (
                                            state.tabs[state.pickerSelection].trends.map((card) => {
                                                const item = card;
                                                const cardKey = getCardKey(item);
                                                if (state.pickerSelection === "crossGameParlay" || state.pickerSelection === "sameGameParlay") {
                                                    return (
                                                        <div key={cardKey} 
                                                            className={`${selectedCard && cardKey === getCardKey(selectedCard) ? "trends-page-list-items-item-selected" : "trends-page-list-items-item"}`}
                                                            data-initialSelection={state.initialCardSelection}
                                                            onClick={() => sameGameParlaySelected(card)}
                                                        >
                                                            <TrendCard card={card} parlay={true}/>
                                                        </div>
                                                    )
                                                }
                                                const userHasPremiumAccess = hasPremiumAccess(context.userAttributes);
                                                return (
                                                    <div key={`${cardKey}-${card.freePreview && !userHasPremiumAccess ? item.iteration : ""}`} 
                                                            className={`${selectedCard && cardKey === getCardKey(selectedCard) ? "trends-page-list-items-item-selected" : "trends-page-list-items-item"}`}
                                                            data-initialSelection={state.initialCardSelection}
                                                            data-freePreview={item.freePreview && !userHasPremiumAccess}
                                                            onClick={() => item.freePreview && !userHasPremiumAccess ? window.location.href = '/pricing' : cardSelected(card, false, null)}
                                                    >
                                                        {
                                                            item.freePreview && !userHasPremiumAccess && (
                                                                <div className='trends-page-list-items-item-free-preview'>
                                                                    <div className='trends-page-list-items-item-free-preview-left'>
                                                                        <p className='text-style-caption-semibold'>{t("trends.list.preview.comboTrendPreview")}</p>
                                                                    </div>
                                                                    <div className='trends-page-list-items-item-free-preview-right'>
                                                                        <div>
                                                                            <img src='assets/lock-open.svg' alt='unlocked'/>
                                                                        </div>
                                                                        <p className='text-style-caption-semibold'>{t("trends.list.preview.tryLinematePlus")}</p>
                                                                    </div>
                                                                </div>
                                                            )
                                                        }
                                                        <TrendContent card={card}/>
                                                    </div>
                                                )
                                            })
                                        )
                                    }
                                </div>
                                {
                                    !state.tabs[state.pickerSelection].endReached && (
                                        <div className='trends-page-list-items-loader'>
                                            <Loader />
                                        </div>
                                    )
                                }
                            </>
                        )
                        }, [selectedCard, headerTab])} 
                    />
                </div>
                {!loading ? (<>
                    {/* Page middle content */}
                    <div className="game-summary-main-wrapper" style={{color: "var(--color-fig-default)"}}>
                        <div className="game-summary-header-with-secondary">
                            <div className="game-summary-header-content-desktop">
                                    <div className="game-summary-header">
                                        <div className="game-summary-header-logo-with-match">
                                            <div className="game-summary-header-logos-left">
                                                <div className={`game-summary-logo-container game-summary-logo-with-border${
                                                    useRoundBackground ? "" : " game-summary-logo-container--flat"
                                                    }`}
                                                    style={{
                                                        backgroundColor: useRoundBackground
                                                            ? SUPPORTED_LEAGUES[context.league]?.teams?.colors?.[getTheme()]?.[awayCode.toLowerCase()]
                                                            : "transparent",
                                                    }}
                                                >
                                                    <img src={getTeamLogoPath(context.league, awayTeamId)} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, context.league)} />
                                                </div>
                                                <div className={`game-summary-logo-container game-summary-logo-with-border${
                                                    useRoundBackground ? "" : " game-summary-logo-container--flat"
                                                    }`}
                                                    style={{
                                                        backgroundColor: useRoundBackground
                                                            ? SUPPORTED_LEAGUES[context.league]?.teams?.colors?.[getTheme()]?.[homeCode.toLowerCase()]
                                                            : "transparent",
                                                    }}
                                                >
                                                    <img src={getTeamLogoPath(context.league, homeTeamId)} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, context.league)}/>
                                                </div>
                                            </div>
                                            <p className="text-style-h-2-semibold game-summary-header-title">{gameSummaryTitle}</p>
                                        </div>

                                        {isMobileView && gameSummaryMobileView === 'summary' && (
                                            <div className="game-summary-mobile-trends-button">
                                                <Button
                                                    text={t("trends.title")}
                                                    typography="sm"
                                                    type="invisible"
                                                    enabled={true}
                                                    onClick={() => setGameSummaryMobileView('list')}
                                                />
                                            </div>
                                        )}

                                        {isMobileView && gameSummaryMobileView === 'detail' && (
                                            <div className="game-summary-mobile-close">
                                                <Button
                                                    icon="assets/close-icon.svg"
                                                    typography="sm"
                                                    type="invisible"
                                                    enabled={true}
                                                    onClick={() => {
                                                        setGameSummaryMobileView('list')
                                                        setSelectedCard(null)
                                                        setHeaderTab('gameSummary')
                                                    }}
                                                />
                                            </div>
                                        )}

                                        <div className="game-summary-blur-logos">
                                            <div>
                                                <img src={getTeamLogoPath(context.league, awayTeamId)} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, context.league)} />
                                            </div>
                                            <div>
                                                <img src={getTeamLogoPath(context.league, homeTeamId)} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, context.league)} />
                                            </div>
                                            <div className="game-summary-blur-logos-background" style={{background: SUPPORTED_LEAGUES[context.league]?.teams?.colors?.[getTheme()]?.[homeCode.toLowerCase()]}}></div>
                                            <div className="game-summary-blur-logos-background" style={{right: '184px', background: SUPPORTED_LEAGUES[context.league]?.teams?.colors?.[getTheme()]?.[awayCode.toLowerCase()]}}></div>
                                        </div>
                                    </div>
                            </div>
                            {!isMobileView && (
                                <div className="game-summary-secondary-header-desktop">
                                    <div className="game-summary-tabs">
                                        <button
                                            type="button"
                                            className={`game-summary-tab ${headerTab === 'gameSummary' ? 'game-summary-tab-active' : ''}`}
                                            onClick={() => setHeaderTab('gameSummary')}
                                        >
                                            {t("trends.navigation.gameSummary")}
                                        </button>
                                        {trendTabRevealed && (
                                            <button
                                                type="button"
                                                className={`game-summary-tab ${headerTab === 'trend' ? 'game-summary-tab-active' : ''}`}
                                                onClick={() => setHeaderTab('trend')}
                                            >
                                                {selectedCard
                                                    ? (selectedCard.legs ? 'SGP' : selectedTrendTabLabel)
                                                    : t("gameSummary.labels.trend")}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="game-summary-main-scroll">
                        {/* Page content, minus header */}
                        {(isMobileView ? gameSummaryMobileView === 'summary' : headerTab === 'gameSummary') && (
                        <div className="game-summary-main-content">
                            
                            <div className="game-summary-data-section">
                                {/*  Matchup Information */}
                                <div className="game-summary-information-section">
                                    <p className="text-style-h-3-medium game-summary-information-headers">{t("gameSummary.sections.matchupInformation")}</p>
                                    <div className="game-summary-matchup-record">
                                        <div className="game-summary-matchup-teams">
                                            <div className="game-summary-matchup-header">
                                                <div className={`game-summary-logo-container game-summary-logo-with-border${
                                                    useRoundBackground ? "" : " game-summary-logo-container--flat"
                                                    }`}
                                                    style={{
                                                        backgroundColor: useRoundBackground
                                                            ? SUPPORTED_LEAGUES[context.league]?.teams?.colors?.[getTheme()]?.[awayCode.toLowerCase()]
                                                            : "transparent",
                                                    }}
                                                >
                                                    <img src={getTeamLogoPath(context.league, awayTeamId)} className="game-summary-matchup-header-logo-image" onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, context.league)}/>
                                                </div>
                                                <p className="text-style-label-medium">{getTeamDisplayName(context.league, teamAway)}</p>
                                            </div>
                                            <p className="text-style-label-normal"><span className="game-summary-matchup-label">{t("gameSummary.labels.record")}:</span> {getTeamRecord(teamAway, context.league)}</p>
                                            <p className="text-style-label-normal"><span className="game-summary-matchup-label">{getStandingRankLabel(teamAway, t)}</span> {getRankWithStandingType(teamAway).position}</p>
                                        </div>
                                        <div className="game-summary-matchup-teams">
                                            <div className="game-summary-matchup-header">
                                                <div className={`game-summary-logo-container game-summary-logo-with-border${
                                                    useRoundBackground ? "" : " game-summary-logo-container--flat"
                                                    }`}
                                                    style={{
                                                        backgroundColor: useRoundBackground
                                                            ? SUPPORTED_LEAGUES[context.league]?.teams?.colors?.[getTheme()]?.[homeCode.toLowerCase()]
                                                            : "transparent",
                                                    }}
                                                >
                                                    <img src={getTeamLogoPath(context.league, homeTeamId)} className="game-summary-matchup-header-logo-image" onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, context.league)}/>
                                                </div>
                                                <p className="text-style-label-medium">{getTeamDisplayName(context.league, teamHome)}</p>
                                            </div>
                                            <p className="text-style-label-normal"><span className="game-summary-matchup-label">{t("gameSummary.labels.record")}:</span> {getTeamRecord(teamHome, context.league)}</p>
                                            <p className="text-style-label-normal"><span className="game-summary-matchup-label">{getStandingRankLabel(teamHome, t)}</span> {getRankWithStandingType(teamHome).position}</p>
                                        </div>
                                    </div>
                                    <div className="game-summary-matchup-date game-summary-header-with-icon">
                                        <img src="/assets/calendar.svg" style={{filter: "var(--color-fig-subtle-filter)"}}></img>
                                        <p className="text-style-label-normal">{`${matchTime[0]}・${matchTime[1]}`}</p>
                                    </div>
                                    <div className="game-summary-matchup-location">
                                        {(gameData.venue && (gameData.venue.name || gameData.venue.city)) &&
                                            <div className="game-summary-header-with-icon">
                                                <img src="/assets/stadium.svg" style={{filter: "var(--color-fig-subtle-filter)"}}></img>
                                                <p className="text-style-label-normal">{`${gameData.venue.name}, ${gameData.venue.city}`}</p>
                                            </div>
                                        }
                                        {gameData.weather &&
                                            <p className="text-style-label-normal" style={{color:"var(--color-fig-subtle)"}}>{gameData.weather.forecast.description}</p>
                                        }
                                    </div>
                                </div>

                                {/* Records */}
                                <div className="game-summary-information-section">
                                    <div className="game-summary-header-with-component">
                                        <p className="text-style-h-3-medium game-summary-information-headers">{t("trends.stats.sections.records")}</p>
                                        <SegmentedControl
                                            fillWidth={false}
                                            options={recordPickerOptions}
                                            selection={recordSelection}
                                            selectionHandler={(selectedOption) => handleRecordSelection(selectedOption)}  
                                        />
                                    </div>
                                    <table className="game-summary-records-table">
                                        <thead>
                                            <tr className="text-style-label-medium">
                                                <th className="game-summary-records-table-header"><span>{getTeamDisplayName(context.league, teamAway)}</span></th>
                                                <th className="game-summary-records-table-header"><span>{t("gameSummary.labels.type")}</span></th>
                                                <th className="game-summary-records-table-header"><span>{getTeamDisplayName(context.league, teamHome)}</span></th>
                                            </tr>
                                        </thead>
                                        <tr className="text-style-label-normal game-summary-records-table-data">
                                            <td><span>{awayRecords.overall}</span></td>
                                            <td><span>{t("trends.stats.rows.overall")}</span></td>
                                            <td><span>{homeRecords.overall}</span></td>
                                        </tr>
                                        <tr className="text-style-label-normal game-summary-records-table-data">
                                            <td><span>{awayRecords.home}</span></td>
                                            <td><span>{t("trends.stats.rows.home")}</span></td>
                                            <td><span>{homeRecords.home}</span></td>
                                        </tr>
                                        <tr className="text-style-label-normal game-summary-records-table-data">
                                            <td><span>{awayRecords.away}</span></td>
                                            <td><span>{t("trends.stats.rows.away")}</span></td>
                                            <td><span>{homeRecords.away}</span></td>
                                        </tr>
                                    </table>
                                </div>

                                {/* Head to head */}
                                {!isDictEmpty(headToHeadFilterDates) && !isDictEmpty(headToHeadFilterSelection) && !isDictEmpty(headToHeadCurrentGameAway) && !isDictEmpty(headToHeadCurrentGameHome) &&
                                    <div className="game-summary-information-section">
                                        <div className="game-summary-header-with-component">
                                            <p className="text-style-h-3-medium game-summary-information-headers">{t("trends.stats.sections.headToHead")}</p>
                                            <div className="game-summary-head-to-head-filter text-style-label-medium">
                                                <p>{t("gameSummary.labels.filterByGame")}</p>
                                                <InputSelection 
                                                    enabled={true}
                                                    type="single"
                                                    typography="sm"
                                                    options={headToHeadFilterDates}
                                                    selection={headToHeadFilterSelection}
                                                    selectionHandler={(dateSelected) => handleHeadToHeadFilterSelection(dateSelected)}
                                                />
                                            </div>
                                        </div>
                                        <div className="game-summary-head-to-head-content">
                                            <div className="text-style-label-medium" style={{display: 'flex', justifyContent: "space-between", width: "100%"}}>
                                                <p>{getTeamDisplayName(context.league, teamAway)}</p>
                                                <p>{getTeamDisplayName(context.league, teamHome)}</p>
                                            </div>
                                            {Object.keys(headToHeadCurrentGameAway || {}).length > 0 && Object.keys(headToHeadCurrentGameHome || {}).length > 0 && statsTemplate.map((statSelected, index) => (
                                                <div key={index} className={`game-summary-head-to-head-horizontal-bar-entry ${index === statsTemplate.length - 1 ? "game-summary-head-to-head-horizontal-bar-entry-last" : ""}`}>
                                                    <NewHorizontalComparisonBar 
                                                        leftValueRaw={headToHeadCurrentGameAway[statSelected.value]}
                                                        rightValueRaw={headToHeadCurrentGameHome[statSelected.value]}
                                                        leftColorHex={SUPPORTED_LEAGUES[context.league]?.teams?.colors?.[getTheme()]?.[awayCode.toLowerCase()]}
                                                        rightColorHex={SUPPORTED_LEAGUES[context.league]?.teams?.colors?.[getTheme()]?.[homeCode.toLowerCase()]}
                                                        text={getGameSummaryStatLabel(statSelected.label, t)}
                                                        showPercentage={false}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                }

                                {/* Last 5 games */}
                                <div className="game-summary-information-section">
                                    <p className="text-style-h-3-medium game-summary-information-headers">{t("trends.stats.sections.last5Games")}</p>
                                    <div className="game-summary-last-5-games-team">
                                        <p className="text-style-label-medium">{getTeamDisplayName(context.league, teamAway)}</p>
                                        <div className="game-summary-last-5-games-team-cards">
                                            {
                                                teamAwayLast5Games && teamAwayLast5Games.slice(0, 5).map(gameAway => (
                                                    <Last5GamesCard league={context.league} game={{...gameAway, opposingTeamId: gameAway.opposingTeamId || allTeams.find((team) => team.code === gameAway.opposingTeam)?.teamId}} />
                                                ))
                                            }
                                        </div>
                                    </div>
                                    
                                    
                                    <div className="game-summary-last-5-games-team">
                                        <p className="text-style-label-medium">{getTeamDisplayName(context.league, teamHome)}</p>
                                        <div className="game-summary-last-5-games-team-cards">
                                            {
                                                teamHomeLast5Games && teamHomeLast5Games.slice(0, 5).map(gameHome => (
                                                    <Last5GamesCard league={context.league} game={{...gameHome, opposingTeamId: gameHome.opposingTeamId || allTeams.find((team) => team.code === gameHome.opposingTeam)?.teamId}} />
                                                ))
                                            }
                                        </div>
                                    </div>
                                </div>

                                {/* Rankings */}
                                {(awayRankings?.[categorizedStatsTemplate?.[0]?.label] && homeRankings?.[categorizedStatsTemplate?.[0]?.label]) &&
                                    <div className="game-summary-information-section">
                                        <p className="text-style-h-3-medium game-summary-information-headers">{t("gameSummary.sections.rankings")}</p>
                                        <table className="game-summary-records-table">
                                            <thead>
                                                <tr className="text-style-label-medium">
                                                    <th className="game-summary-records-table-header">
                                                        {/* Height set to 24px to align itself with stat column header, required due to swap button height being 28px */}
                                                        <div className="game-summary-rankings-header game-summary-rankings-header--left">
                                                            <p style={{paddingBottom: '4px'}}>{getTeamDisplayName(context.league, teamAway)}</p>
                                                            <p className="text-style-caption-uppercase-medium" style={{color: "var(--color-fig-subtle)", height: '24px'}}>{getRankingSideLabel(awayRankings[categorizedStatsTemplate[0].label].position, t)}</p>
                                                        </div>
                                                    </th>
                                                    <th className="game-summary-records-table-header">
                                                        <div className="game-summary-rankings-header game-summary-rankings-header--stat">
                                                            <p>{t("gameSummary.labels.stat")}</p>
                                                            <button type="button" className="game-summary-rankings-swap-icon-wrapper" onClick={() => handleRankingsSwap()}>
                                                                <img src="assets/playbook/icon-swap.svg" className="game-summary-rankings-swap-icon" alt="" />
                                                            </button>
                                                        </div>
                                                    </th>
                                                    <th className="game-summary-records-table-header">
                                                        {/* Height set to 24px to align itself with stat column header, required due to swap button height being 28px */}
                                                        <div className="game-summary-rankings-header game-summary-rankings-header--right">
                                                            <p style={{paddingBottom: '4px'}}>{getTeamDisplayName(context.league, teamHome)}</p>
                                                            <p className="text-style-caption-uppercase-medium" style={{color: "var(--color-fig-subtle)", height: '24px'}}>{getRankingSideLabel(homeRankings[categorizedStatsTemplate[0].label].position, t)}</p>
                                                        </div>
                                                    </th>
                                                </tr>
                                            </thead>
                                            {categorizedStatsTemplate.map((currentStat, index) => (
                                                <tr key={index} className={`text-style-label-normal game-summary-rankings-table-data ${index === categorizedStatsTemplate.length - 1 ? "game-summary-rankings-table-data-last" : ""}`}>
                                                    <td><span>{awayRankings[currentStat.label].rank}</span></td>
                                                    <td><span>{getGameSummaryStatLabel(currentStat.label, t)}</span></td>
                                                    <td><span>{homeRankings[currentStat.label].rank}</span></td>
                                                </tr>
                                            ))}
                                        </table>
                                    </div>
                                }

                                {/* Injuries */}
                                {gameData.awayTeamData && gameData.homeTeamData && (awayTeamInjuries.length > 0 || homeTeamInjuries.length > 0) &&
                                    <div className="game-summary-information-section">
                                        <p className="text-style-h-3-medium game-summary-information-headers">{t("trends.stats.sections.injuries")}</p>
                                        {awayTeamInjuries.length > 0 &&
                                            <table className="game-summary-injuries-table text-style-label-normal">
                                                <colgroup>
                                                    <col />
                                                    <col />
                                                    <col />
                                                    <col />
                                                </colgroup>
                                                <thead className="text-style-label-medium game-summary-injuries-table-headers">
                                                    <tr>
                                                        <th><span>{getTeamDisplayName(context.league, teamAway)}</span></th>
                                                        <th><span>{t("gameSummary.labels.position")}</span></th>
                                                        <th><span>{t("gameSummary.labels.injury")}</span></th>
                                                        <th><span>{t("gameSummary.labels.status")}</span></th>
                                                    </tr>
                                                </thead>
                                                {
                                                    awayTeamInjuries.map(injuredPlayer => (
                                                        <tr className="game-summary-injuries-table-data-rows">
                                                            <td><span>{injuredPlayer.fullName}</span></td>
                                                            <td><span>{injuredPlayer.position}</span></td>
                                                            <td><span>{injuredPlayer.injury}</span></td>
                                                            <td><span>{injuredPlayer.status}</span></td>
                                                        </tr>
                                                    ))
                                                }
                                            </table>
                                        }
                                        {homeTeamInjuries.length > 0 &&
                                            <table className="game-summary-injuries-table text-style-label-normal">
                                                <colgroup>
                                                    <col />
                                                    <col />
                                                    <col />
                                                    <col />
                                                </colgroup>
                                                <thead className="text-style-label-medium game-summary-injuries-table-headers">
                                                    <tr>
                                                        <th><span>{getTeamDisplayName(context.league, teamHome)}</span></th>
                                                        <th><span>{t("gameSummary.labels.position")}</span></th>
                                                        <th><span>{t("gameSummary.labels.injury")}</span></th>
                                                        <th><span>{t("gameSummary.labels.status")}</span></th>
                                                    </tr>
                                                </thead>
                                                {
                                                    homeTeamInjuries.map(injuredPlayer => (
                                                        <tr className="game-summary-injuries-table-data-rows">
                                                            <td><span>{injuredPlayer.fullName}</span></td>
                                                            <td><span>{injuredPlayer.position}</span></td>
                                                            <td><span>{injuredPlayer.injury}</span></td>
                                                            <td><span>{injuredPlayer.status}</span></td>
                                                        </tr>
                                                    ))
                                                }
                                            </table>
                                        }
                                    </div>
                                }

                                {!isWide() &&
                                    <div className="game-summary-mypicks" style={{width: '100%'}}>
                                    <MyPicksWithOffers
                                        myPicksContent={(gameMarket.away && gameMarket.home && !isDictEmpty(gameMarket.away.markets) && !isDictEmpty(gameMarket.home.markets)) &&
                                            <div style={{width: '100%'}}>
                                                <div className="my-picks-quickPicks-header">
                                                    <p className="text-style-label-medium">{t("trends.analysis.addToMyPicks")}</p>
                                                </div>
                                                {/* Moneyline */}
                                                {awayTeamMarketInfo.moneyline && awayTeamMarketInfo.moneyline.odds != "--" && awayTeamMarketInfo.moneyline.book != "" && homeTeamMarketInfo.moneyline && homeTeamMarketInfo.moneyline.odds != "--" && homeTeamMarketInfo.moneyline.book != "" &&
                                                    <QuickPicksSection
                                                        title={t("gameSummary.quickPicks.moneyline").toUpperCase()}
                                                        arrayOfContent={[
                                                            <QuickPicksLine preexisting={checkIfLegExists("MONEY_LINE", "away")} header={awayCode} value={awayTeamMarketInfo.moneyline.odds} clickFunction={() => {handleAddToBetslip("MONEY_LINE", "away")}} book={awayTeamMarketInfo.moneyline.book}/>, 
                                                            <QuickPicksLine preexisting={checkIfLegExists("MONEY_LINE", "home")} header={homeCode} value={homeTeamMarketInfo.moneyline.odds} clickFunction={() => {handleAddToBetslip("MONEY_LINE", "home")}} book={homeTeamMarketInfo.moneyline.book}/>
                                                        ]}
                                                    />
                                                }
                                                {/* Spread */}
                                                {awayTeamMarketInfo.spread && awayTeamMarketInfo.spread.line != "--" && awayTeamMarketInfo.spread.odds != "--" && homeTeamMarketInfo.spread && homeTeamMarketInfo.spread.line != "--" && homeTeamMarketInfo.spread.odds != "--" &&
                                                    <QuickPicksSection 
                                                        title={t("gameSummary.quickPicks.spread").toUpperCase()}
                                                        arrayOfContent={[
                                                            <QuickPicksLine preexisting={checkIfLegExists("SPREAD", "away")} header={`${awayCode} ${awayTeamMarketInfo.spread.line}`} value={awayTeamMarketInfo.spread.odds} clickFunction={() => {handleAddToBetslip("SPREAD", "away")}} book={awayTeamMarketInfo.spread.book}/>,
                                                            <QuickPicksLine preexisting={checkIfLegExists("SPREAD", "home")} header={`${homeCode} ${homeTeamMarketInfo.spread.line}`} value={homeTeamMarketInfo.spread.odds} clickFunction={() => {handleAddToBetslip("SPREAD", "home")}} book={homeTeamMarketInfo.spread.book}/>
                                                        ]}
                                                    />
                                                }
                                                {/* Total */}
                                                {gameMarketInfo && gameMarketInfo.awayTeamData && gameMarketInfo.homeTeamData && gameMarketInfo.awayTeamData.line != "--" && gameMarketInfo.awayTeamData.odds != "--" && gameMarketInfo.homeTeamData.line != "--" && gameMarketInfo.homeTeamData.odds != "--" && 
                                                    <QuickPicksSection 
                                                        title={t("gameSummary.quickPicks.total").toUpperCase()}
                                                        arrayOfContent={[
                                                            <QuickPicksLine preexisting={checkIfLegExists("GAME_TOTAL", "away")} header={gameMarketInfo.awayTeamData.line} value={gameMarketInfo.awayTeamData.odds} clickFunction={() => {handleAddToBetslip("GAME_TOTAL", "away")}} book={gameMarketInfo.awayTeamData.book}/>,
                                                            <QuickPicksLine preexisting={checkIfLegExists("GAME_TOTAL", "home")} header={gameMarketInfo.homeTeamData.line} value={gameMarketInfo.homeTeamData.odds} clickFunction={() => {handleAddToBetslip("GAME_TOTAL", "home")}} book={gameMarketInfo.homeTeamData.book}/>
                                                        ]}
                                                    />
                                                }
                                            </div>
                                        }
                                    />
                                </div>
                                }
                            </div>
                            {isWide() &&
                                <div className="game-summary-mypicks">
                                    <MyPicksWithOffers
                                        myPicksContent={(gameMarket.away && gameMarket.home && !isDictEmpty(gameMarket.away.markets) && !isDictEmpty(gameMarket.home.markets)) &&
                                            <div style={{width: '100%'}}>
                                                <div className="my-picks-quickPicks-header">
                                                    <p className="text-style-label-medium">{t("trends.analysis.addToMyPicks")}</p>
                                                </div>
                                                {/* Moneyline */}
                                                {awayTeamMarketInfo.moneyline && awayTeamMarketInfo.moneyline.odds != "--" && awayTeamMarketInfo.moneyline.book != "" && homeTeamMarketInfo.moneyline && homeTeamMarketInfo.moneyline.odds != "--" && homeTeamMarketInfo.moneyline.book != "" &&
                                                    <QuickPicksSection
                                                        title={t("gameSummary.quickPicks.moneyline").toUpperCase()}
                                                        arrayOfContent={[
                                                            <QuickPicksLine preexisting={checkIfLegExists("MONEY_LINE", "away")} header={awayCode} value={awayTeamMarketInfo.moneyline.odds} clickFunction={() => {handleAddToBetslip("MONEY_LINE", "away")}} book={awayTeamMarketInfo.moneyline.book}/>, 
                                                            <QuickPicksLine preexisting={checkIfLegExists("MONEY_LINE", "home")} header={homeCode} value={homeTeamMarketInfo.moneyline.odds} clickFunction={() => {handleAddToBetslip("MONEY_LINE", "home")}} book={homeTeamMarketInfo.moneyline.book}/>
                                                        ]}
                                                    />
                                                }
                                                {/* Spread */}
                                                {awayTeamMarketInfo.spread && awayTeamMarketInfo.spread.line != "--" && awayTeamMarketInfo.spread.odds != "--" && homeTeamMarketInfo.spread && homeTeamMarketInfo.spread.line != "--" && homeTeamMarketInfo.spread.odds != "--" &&
                                                    <QuickPicksSection 
                                                        title={t("gameSummary.quickPicks.spread").toUpperCase()}
                                                        arrayOfContent={[
                                                            <QuickPicksLine preexisting={checkIfLegExists("SPREAD", "away")} header={`${awayCode} ${awayTeamMarketInfo.spread.line}`} value={awayTeamMarketInfo.spread.odds} clickFunction={() => {handleAddToBetslip("SPREAD", "away")}} book={awayTeamMarketInfo.spread.book}/>,
                                                            <QuickPicksLine preexisting={checkIfLegExists("SPREAD", "home")} header={`${homeCode} ${homeTeamMarketInfo.spread.line}`} value={homeTeamMarketInfo.spread.odds} clickFunction={() => {handleAddToBetslip("SPREAD", "home")}} book={homeTeamMarketInfo.spread.book}/>
                                                        ]}
                                                    />
                                                }
                                                {/* Total */}
                                                {gameMarketInfo && gameMarketInfo.awayTeamData && gameMarketInfo.homeTeamData && gameMarketInfo.awayTeamData.line != "--" && gameMarketInfo.awayTeamData.odds != "--" && gameMarketInfo.homeTeamData.line != "--" && gameMarketInfo.homeTeamData.odds != "--" && 
                                                    <QuickPicksSection 
                                                        title={t("gameSummary.quickPicks.total").toUpperCase()}
                                                        arrayOfContent={[
                                                            <QuickPicksLine preexisting={checkIfLegExists("GAME_TOTAL", "away")} header={gameMarketInfo.awayTeamData.line} value={gameMarketInfo.awayTeamData.odds} clickFunction={() => {handleAddToBetslip("GAME_TOTAL", "away")}} book={gameMarketInfo.awayTeamData.book}/>,
                                                            <QuickPicksLine preexisting={checkIfLegExists("GAME_TOTAL", "home")} header={gameMarketInfo.homeTeamData.line} value={gameMarketInfo.homeTeamData.odds} clickFunction={() => {handleAddToBetslip("GAME_TOTAL", "home")}} book={gameMarketInfo.homeTeamData.book}/>
                                                        ]}
                                                    />
                                                }
                                            </div>
                                        }
                                    />
                                </div>
                            }
                        </div>
                            )}
                        {(isMobileView ? gameSummaryMobileView === 'detail' : headerTab === 'trend') && selectedCard && (
                            selectedCard.legs ? (<GamelogDetails key={getCardKey(selectedCard)} parlay={selectedCard}/>) : (<GamelogDetails key={getCardKey(selectedCard)} trend={selectedCard}/>)
                        )}
                        {(isMobileView ? gameSummaryMobileView === 'summary' : headerTab === 'gameSummary') &&
                            <Footer />
                        }
                    </div>
                </div>
                </>) : (
                    <div className="game-summary-loading-state">
                        <Loader />
                    </div>
                )
                }
            </div>
            </div>
        </div>
    )
}

export default GameSummary;
