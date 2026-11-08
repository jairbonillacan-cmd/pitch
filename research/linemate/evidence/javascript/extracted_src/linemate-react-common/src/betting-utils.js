import { groupBy } from "lodash";
import { HOME_AWAY_SPLIT, TIMEFRAME_FILTER, BETTING_LEADERBOARD_TIMEFRAMES,
         BET_TYPE_FILTER, MIN_ODDS_FILTER, OVER_UNDER_FILTER, PLAYER_BET_TYPE_ID_TO_NAME,
         PLAYER_BET_TYPES_REVERSE_MAPPING, GAME_TOTAL_MARKET_NAME, SPREAD_MARKET_NAME,
         SPREAD_MARKET_ID, GAME_TOTAL_MARKET_ID, getPlayerPropInfo, getSituationalProps, TEAM_BETS, DEFAULT_MARKET_TEXT, TEAM_BET_TYPE_REVERSE_MAPPING, ALL_BETS_MARKET_NAME, GAMES_FILTER, ALL_GAMES_FILTER_OPTION, 
         SCREENER_ONLY_PROPS,
         OUTCOME_TYPE_COVER_YES,
         OUTCOME_TYPE_OVER_UNDER,
         GAME_BET_TYPE,
         TEAM_BET_TYPE,
         NARRATIVES,
         SUPPORTED_LEAGUES,
         OUTCOME_TYPE_YES_NO} from "./constants";
import { buildQueryParams, decimalPrecision, getDictionaryValue, isDictEmpty, getBookEntryBasedOnPrecedence,
         getPreferredFormat, getFormattedLineValue, getFormattedOddValue, orderListByField, getPlayerName, getPlayerId, capitalizeFirstLetter, containsNumber, isSoccer, 
         getLineOutcomeFromCard, getFilterQueryParameter,
         getPreferredOdds,
         getMultiFieldValueWithPrecision,
         jsonOrDefault,
         getBookEntryBasedOnBestOdds,
         getMarketOdds,
         getSignalIds} from "./util";
import { FILTER_KEYS, SIGNAL_OPTION_KEYS, SUPPORTED_SIGNALS } from "./filter-config";

export function getBaseWorkstationQueryParams(currentSeason, opponent, filters) {
    var queryParams = {};

    const splitsFilter = filters[FILTER_KEYS.SPLITS];
    const splitQueryValue = splitsFilter?.options?.[splitsFilter?.selectedValue];
    if (splitQueryValue && splitQueryValue !== "ALL") {
        queryParams['split'] = splitQueryValue;
    }

    const timeframeFilter = filters[FILTER_KEYS.TIMEFRAME];
    const timeframe = timeframeFilter?.selectedValue;
    const normalizedTimeframe = timeframe?.toLowerCase?.() || "";
    const withFilter = !(FILTER_KEYS.WITH in filters) ? null : getFilterQueryParameter(filters[FILTER_KEYS.WITH]);
    const withoutFilter = !(FILTER_KEYS.WITHOUT in filters) ? null : getFilterQueryParameter(filters[FILTER_KEYS.WITHOUT]);

    if (normalizedTimeframe === "season") {
        queryParams['timeframe'] = timeframeFilter.options[timeframe];
        queryParams['limit'] = 500;
    } else if (normalizedTimeframe === "matchup" || normalizedTimeframe === "head to head" || normalizedTimeframe === 'headtohead') {
        queryParams['opponent'] = opponent;
        queryParams['timeframe'] = `RANGE_${currentSeason - 2}_${currentSeason}`;
    } else if (normalizedTimeframe.startsWith("last")) {
        queryParams['timeframe'] = timeframeFilter.options[timeframe];
    } else if (normalizedTimeframe === 'playoffs') {
        queryParams['timeframe'] = 'PLAYOFF';
    }

    if (!opponent && FILTER_KEYS.OPPONENT in filters) {
        const opponentFilterSelection = getFilterQueryParameter(filters[FILTER_KEYS.OPPONENT]);
        if (opponentFilterSelection?.toLowerCase() !== 'all') {
            queryParams['opponent'] = filters[FILTER_KEYS.OPPONENT].options[filters[FILTER_KEYS.OPPONENT].selectedValue];
        }
    }

    if (withFilter && withFilter.toLowerCase() !== 'all') {
        queryParams['withPlayerIds'] = withFilter;
    } else if (withoutFilter && withoutFilter.toLowerCase() !== 'none') {
        queryParams['withoutPlayerIds'] = withoutFilter;
    }

    return queryParams;
}

export function getTeamWorkstationGames(host, league, currentSeason, teamId, opponent, filters) {
    var queryParams = getBaseWorkstationQueryParams(currentSeason, opponent, filters);
    return fetch(`${host}/api/${league}/v4/teams/${teamId}/games?${buildQueryParams(queryParams)}`);
}

export function getPlayerWorkstationGames(host, league, currentSeason, opponent, filters, playerId) {
    var queryParams = getBaseWorkstationQueryParams(currentSeason, opponent, filters);
    return fetch(`${host}/api/${league}/v4/players/${playerId}/games?${buildQueryParams(queryParams)}`);
}

export function getPlayerWorkstationRecord(host, league, currentSeason, opponent, filters, playerId) {
    var queryParams = getBaseWorkstationQueryParams(currentSeason, opponent, filters);
    return fetch(`${host}/api/${league}/v4/players/${playerId}/record?${buildQueryParams(queryParams)}`);
}

export function getPlayerSeasonGames(host, league, playerId) {
    return fetch(`${host}/api/${league}/v4/players/${playerId}/games`).then(response => jsonOrDefault(response, []))
}

export function getGameLineValue(league, type, game, betType) {
    if (type === "team") {
        const betId = TEAM_BET_TYPE_REVERSE_MAPPING[league][betType];
        return TEAM_BETS[league][betId].gameValueFunction(game);
    } else {
        const propID = PLAYER_BET_TYPES_REVERSE_MAPPING[league][betType];
        const statFields = getPlayerPropInfo[league](propID).fields;
        var value = 0;
        statFields.map((field) => {
            value += getDictionaryValue(game, `cumulativeStats.${field}`);
        })
        return value;
    }
}

export function getGameLineValueById(league, type, game, betType) {
    if (type === "team") {
        return TEAM_BETS[league][betType].gameValueFunction(game);
    } else {
        const statFields = getPlayerPropInfo[league](betType).fields;
        var value = 0;
        statFields.map((field) => {
            value += getDictionaryValue(game, `cumulativeStats.${field}`);
        })
        return value;
    }
}

export function buildTrendsData(league, type, games, betType, lineValue, marketId) {
    var hits = 0;
    var push = 0;
    var total = 0;
    var homeTotal = 0;
    var awayTotal = 0;
    var homeGames = 0;
    var awayGames = 0;
    games.forEach((game) => {
        const gameValue = typeof marketId === "undefined" ? getGameLineValue(league, type, game, betType) : getGameLineValueById(league, type, game, marketId);
        total += gameValue;
        if (game.isHome) {
            homeGames++;
            homeTotal += gameValue;
        } else {
            awayGames++;
            awayTotal += gameValue;
        }
        // It's less than idea but since right now spread is the only bet type we have that requires it to be 'under' for the cover to hit
        // If we implement more bet types that work in a similar way we should look into a better solution here
        if (gameValue === lineValue) {
            push++;
        } else if (typeof marketId === "undefined" && 
                    ((gameValue > lineValue && !betType.endsWith(SPREAD_MARKET_NAME)) || 
                    (betType.endsWith(SPREAD_MARKET_NAME) && gameValue < lineValue))) {
            hits++;
        } else if (typeof marketId !== "undefined" && 
                    ((gameValue > lineValue && !marketId.startsWith(SPREAD_MARKET_ID)) || 
                    (marketId.startsWith(SPREAD_MARKET_ID) && gameValue < lineValue))) {
            hits++;
        }
    });

    var result = {
        hits: hits,
        push: push
    }
    if (games.length > 0) {
        result['resultAverage'] = decimalPrecision(total / games.length, 1);
        result['hitPercentage'] = decimalPrecision(hits/games.length * 100, 1);
        result['missPercentage'] = decimalPrecision((games.length - hits - push)/games.length * 100, 1);
    } else {
        result['resultAverage'] = 0;
        result['hitPercentage'] = 0;
        result['missPercentage'] = 0;
    }
    if (homeGames > 0) {
        result['resultHomeAverage'] = decimalPrecision(homeTotal / homeGames, 1);
    } else {
        result['resultHomeAverage'] = 0;
    }
    if (awayGames > 0) {
        result['resultAwayAverage'] = decimalPrecision(awayTotal / awayGames, 1);
    } else {
        result['resultAwayAverage'] = 0;
    }
    
    return result;
}

// Once we add dynamic markets this could be used as a game-level lines method and the spread one could be used as a team-level
//    Both will likely have to support EVENT and OVER_UNDER types along with the presence or lack of line value
export function addTotalLines(game, inputLines, timeframe, userAttributes, groupedData) {
    if (!game.markets || isDictEmpty(game.markets) || !game.markets[GAME_TOTAL_MARKET_ID]) {
        return;
    }
    const book = getBookEntryBasedOnPrecedence(game.markets[GAME_TOTAL_MARKET_ID].books);
    if (isDictEmpty(book)) {
        return;
    }
    const gameID = game.id;
    const homeTeamData = game.homeTeamData
    const awayTeamData = game.awayTeamData;
    const lineFormat = getPreferredFormat(userAttributes);
    const pregameHitRecords = game.markets[GAME_TOTAL_MARKET_ID].pregameHitRecords;
    var entries = {};
    ['over', 'under'].forEach((outcome) => {
        if (book[outcome] && (book[outcome].current || book[outcome].opening)) {
            // Seeing the current/opening to each other in case we are missing one. A case where both are missing should have already been checked above
            book[outcome].current = book[outcome].current || book[outcome].opening;
            book[outcome].opening = book[outcome].opening || book[outcome].current;
            const outcomeEntry = {
                isCombined: true,
                gameID: gameID,
                team: homeTeamData.info.code,
                opponent: awayTeamData.info.code,
                homeTeam: homeTeamData.info.code,
                awayTeam: awayTeamData.info.code,
                "bet type": GAME_TOTAL_MARKET_NAME
            }

            // A bit of a hack because of a difference in how the number is populated at the source with a whole number in a floating point field 
            // being displayed with a decimal point with a value of 0 and how javascript treats it without the decimal places
            // This way we add a decimal place of 0 if it's an integer value to match how it's being populated at the source
            const hitRecordKey = getLineHitRecordKey(book[outcome].current.value);
            const hitRecord = pregameHitRecords[hitRecordKey][timeframe].all;

            // Current section
            outcomeEntry.line = book[outcome].current.value;
            outcomeEntry.formattedLine = `${outcome.charAt(0)}${book[outcome].current.value}`;
            outcomeEntry.odds = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, book[outcome].current.odds));
            outcomeEntry[`${outcome}Odds`] = outcomeEntry.odds;
            outcomeEntry.games = hitRecord.games;
            outcomeEntry.pushes = hitRecord.pushes;
            // Because we only calculate and save the hit rate of the over we need to calculate the opposite for the under
            if (outcome === 'over') {
                outcomeEntry.hits = hitRecord.hits;
                outcomeEntry.misses = hitRecord.misses;
            } else {
                outcomeEntry.hits = hitRecord.misses;
                outcomeEntry.misses = hitRecord.hits;
            }
            if (outcomeEntry.games === 0) {
                outcomeEntry.hitPercentage = 0;
            } else {
                outcomeEntry.hitPercentage = (outcomeEntry.hits / outcomeEntry.games) * 100;
            }
            outcomeEntry.hitRate = `${outcomeEntry.hits}/${outcomeEntry.games}`;

            // Opening section
            outcomeEntry.openingFormattedLine = `${outcome.charAt(0)}${book[outcome].opening.value}`;
            outcomeEntry.openingOdds = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, book[outcome].opening.odds));

            // Line movement section
            const lineDifference = book[outcome].current.value - book[outcome].opening.value
            outcomeEntry.lineMovement = `${lineDifference > 0 ? "+" : ""}${lineDifference}`;

            entries[outcome] = outcomeEntry;
        }
    })
    // Copying each outcome's odds to the other one so that both are present if we select one of them
    if (entries.over && entries.under) {
        entries.over.underOdds = entries.under.underOdds;
        entries.under.overOdds = entries.over.overOdds;
    }

    groupedData[gameID][homeTeamData.info.code][GAME_TOTAL_MARKET_NAME] = {};
    groupedData[gameID][awayTeamData.info.code][GAME_TOTAL_MARKET_NAME] = {};
    Object.keys(entries).forEach((outcome) => {
        inputLines.push(entries[outcome]);
        groupedData[gameID][homeTeamData.info.code][GAME_TOTAL_MARKET_NAME][outcome] = entries[outcome];
        groupedData[gameID][awayTeamData.info.code][GAME_TOTAL_MARKET_NAME][outcome] = entries[outcome];
    });
    // inputLines.push(outcomeEntry);
}
  
export function addSpreadLines(teamData, opposingTeamData, inputLines, gameID, timeframe, userAttributes, groupedData) {
    if (!teamData.markets || isDictEmpty(teamData.markets) || !teamData.markets[SPREAD_MARKET_ID]) {
        return;
    }
    const book = getBookEntryBasedOnPrecedence(teamData.markets[SPREAD_MARKET_ID].books);
    if (isDictEmpty(book)) {
        return;
    }
    const lineFormat = getPreferredFormat(userAttributes);
    const pregameHitRecords = teamData.markets[SPREAD_MARKET_ID].pregameHitRecords;
    const outcome = 'cover';
    if (book[outcome] && (book[outcome].current || book[outcome].opening)) {
        // Seeing the current/opening to each other in case we are missing one. A case where both are missing should have already been checked above
        book[outcome].current = book[outcome].current || book[outcome].opening;
        book[outcome].opening = book[outcome].opening || book[outcome].current;
        const spreadCoverEntry = {
            gameID: gameID,
            team: teamData.info.code,
            opponent: opposingTeamData.info.code,
            "bet type": SPREAD_MARKET_NAME
        }

        // A bit of a hack because of a difference in how the number is populated at the source with a whole number in a floating point field 
        // being displayed with a decimal point with a value of 0 and how javascript treats it without the decimal places
        // This way we add a decimal place of 0 if it's an integer value to match how it's being populated at the source
        const hitRecordKey = getLineHitRecordKey(book[outcome].current.value);
        const hitRecord = pregameHitRecords[hitRecordKey][timeframe].all;

        // Current section
        spreadCoverEntry.line = book[outcome].current.value;
        spreadCoverEntry.formattedLine = `${book[outcome].current.value > 0 ? "+" : ""}${book[outcome].current.value}`;
        spreadCoverEntry.odds = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, book[outcome].current.odds));
        // Copying it into overOdds to simplify the use of the entry later on
        spreadCoverEntry.overOdds = spreadCoverEntry.odds;
        spreadCoverEntry.underOdds = null;
        spreadCoverEntry.hits = hitRecord.hits;
        spreadCoverEntry.misses = hitRecord.misses;
        spreadCoverEntry.pushes = hitRecord.pushes;
        spreadCoverEntry.games = hitRecord.games;
        spreadCoverEntry.hitPercentage = hitRecord.hitRate;
        spreadCoverEntry.hitRate = `${hitRecord.hits}/${hitRecord.games}`;

        // Opening section
        spreadCoverEntry.openingFormattedLine = `${book[outcome].opening.value > 0 ? "+" : ""}${book[outcome].opening.value}`;
        spreadCoverEntry.openingOdds = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, book[outcome].opening.odds));

        // Line movement section
        const lineDifference = book[outcome].current.value - book[outcome].opening.value
        spreadCoverEntry.lineMovement = `${lineDifference > 0 ? "+" : ""}${lineDifference}`;

        inputLines.push(spreadCoverEntry);
        groupedData[gameID][teamData.info.code][SPREAD_MARKET_NAME] = {
            over: spreadCoverEntry
        };
    }
}

export function buildTeamLeaderboard(games, filters, userAttributes, league) {
    var groupedData = {};
    var result = [];
    const timeframeFilter = BETTING_LEADERBOARD_TIMEFRAMES[filters[FILTER_KEYS.TIMEFRAME].selectedValue];
    const betTypeFilter = filters[FILTER_KEYS.BET_TYPE]?.selectedValues || [filters[FILTER_KEYS.BET_TYPE].selectedValue];
    const selectedGames = filters[GAMES_FILTER]?.selectedValues || filters[GAMES_FILTER]?.selectedValue;
    // Build a dictionary swapping the key and value of the filter options which will allow us to use the 'in' operator to check for presence rather than iterating a list
    const gamesFilter = Object.fromEntries(selectedGames.map(x => [filters[GAMES_FILTER].options[x], x]))
    for (const game of games) {
        if (!(ALL_GAMES_FILTER_OPTION in gamesFilter) && !(game.id in gamesFilter)) {
            continue;
        }
        const homeTeamData = game.homeTeamData;
        const awayTeamData = game.awayTeamData;

        // This will actually crash the values on every iteration of the timeframe but that's fine because we only need it for the odds right now and 
        groupedData[game.id] = {}
        groupedData[game.id][homeTeamData.info.code] = {};
        groupedData[game.id][awayTeamData.info.code] = {};
        
        betTypeFilter.forEach((marketName) => {
            addTeamBets(game, result, timeframeFilter, marketName, userAttributes, groupedData, league)
        })
    }
    orderListByField(result, 'hitPercentage', 'desc');
    return {
        leaderboard: result,
        groups: groupedData
    };
}

export function buildTeamLeaderboardFromMarkets(markets, filters, userAttributes, league, preferredProviders) {
    var groupedData = {};
    var result = [];
    const timeframeFilter = BETTING_LEADERBOARD_TIMEFRAMES[filters[FILTER_KEYS.TIMEFRAME].selectedValue];
    const betTypeFilter = filters[FILTER_KEYS.BET_TYPE]?.selectedValues || [filters[FILTER_KEYS.BET_TYPE].selectedValue];
    const selectedGames = filters[GAMES_FILTER]?.selectedValues || filters[GAMES_FILTER]?.selectedValue;
    // Build a dictionary swapping the key and value of the filter options which will allow us to use the 'in' operator to check for presence rather than iterating a list
    const gamesFilter = Object.fromEntries(selectedGames.map(x => [filters[GAMES_FILTER].options[x], x]))
    const betTypeFilterSet = new Set(betTypeFilter)
    for (const market of markets) {
        if (!(market.level === 'team' || market.level === 'game')) {
            continue;
        }
        const marketName = getMarketNameFromId(league, 'team', market.name)
        if (!(betTypeFilterSet.has(marketName) || betTypeFilterSet.has(ALL_BETS_MARKET_NAME))) {
            continue;
        }
        const gameId = market.gameId;
        if (!(ALL_GAMES_FILTER_OPTION in gamesFilter || gameId in gamesFilter)) {
            continue;
        }
        if (!(gameId in groupedData)) {
            groupedData[gameId] = {}
        }
        const teamCode = market.team.code;
        if (!(teamCode in groupedData[gameId])) {
            groupedData[gameId][teamCode] = {}
        }
        const opposingTeamCode = market.opposingTeam.code;
        if (!(opposingTeamCode in groupedData[gameId])) {
            groupedData[gameId][opposingTeamCode] = {}
        }
        if (market.level === 'team') {
            addTeamMarket(league, groupedData, result, timeframeFilter, market, gameId, userAttributes, preferredProviders)
        }
        if (market.level === 'game') {
            addGameMarket(league, groupedData, result, timeframeFilter, market, gameId, userAttributes, preferredProviders)
        }
    }
    orderListByField(result, 'hitPercentage', 'desc');
    return {
        leaderboard: result,
        groups: groupedData
    };
}

// Relying on presence of over/under/cover outcomes for all cases
// Currently supported cases: 
// - over/under for game bets (ex: game total)
// - over/under for team bets (ex: team total)
// - cover + line for team bets (ex: spread)
// - cover without line (ex: moneyline)
// TODO: see if anything can be refactored to reduce duplication between game and team markets
export function addTeamBets(game, inputLines, timeframe, betType, userAttributes, groupedData, league) {
    const teamBets = TEAM_BETS[league];
    const betId = betType === ALL_BETS_MARKET_NAME ? ALL_BETS_MARKET_NAME : TEAM_BET_TYPE_REVERSE_MAPPING[league][betType];
    if ("markets" in game && game.markets && !isDictEmpty(game.markets)) {
        for (const market in game.markets) {
            if (betId != ALL_BETS_MARKET_NAME && betId !== market) {
                continue;
            }
            // TODO: test this
            if (!(market in teamBets) || !("books" in game.markets[market]) || isDictEmpty(game.markets[market].books)) {
                continue;
            }
            const book = getBookEntryBasedOnPrecedence(game.markets[market].books);
            if (isDictEmpty(book)) {
                continue;
            }
            const marketDisplayName = teamBets[market].displayName;
            const entries = {};
            const pregameHitRecords = game.markets[market].pregameHitRecords;
            ["over", "under"].forEach((outcome) => {
                if (outcome in book && book[outcome] && (book[outcome].current || book[outcome].opening)) {
                    entries[outcome] = buildTeamOverUnderEntry(outcome, book, timeframe, pregameHitRecords, true, game, teamBets[market].displayName, userAttributes, true);
                }
            })
            // Copying each outcome's odds to the other one so that both are present if we select one of them
            if (entries.over && entries.under) {
                entries.over.underOdds = entries.under.underOdds;
                entries.under.overOdds = entries.over.overOdds;
            }
            var outcome = "cover";
            if (outcome in book && book[outcome] && (book[outcome].current || book[outcome].opening)) {
                entries[outcome] = buildTeamCoverEntry(book, timeframe, pregameHitRecords, game, teamBets[market].displayName, userAttributes, true, true);
            }
            // Setting on both home and away since it's a shared game-level market that applies to both
            groupedData[game.id][game.homeTeamData.info.code][marketDisplayName] = {};
            groupedData[game.id][game.awayTeamData.info.code][marketDisplayName] = {};
            Object.keys(entries).forEach((outcome) => {
                inputLines.push(entries[outcome]);
                groupedData[game.id][game.homeTeamData.info.code][marketDisplayName][outcome] = entries[outcome];
                groupedData[game.id][game.awayTeamData.info.code][marketDisplayName][outcome] = entries[outcome];
            });
        }
    }

    for (const teamSplit of ["homeTeamData", "awayTeamData"]) {
        if (!(teamSplit in game) || !game[teamSplit] || isDictEmpty(game[teamSplit]) || 
            !("markets" in game[teamSplit]) || !game[teamSplit].markets || isDictEmpty(game[teamSplit].markets)) {
            continue;
        }
        for (const market in game[teamSplit].markets) {
            if (betId != ALL_BETS_MARKET_NAME && betId !== market) {
                continue;
            }
            // TODO: test this
            if (!(market in teamBets) || !("books" in game[teamSplit].markets[market]) || isDictEmpty(game[teamSplit].markets[market].books)) {
                continue;
            }
            const book = getBookEntryBasedOnPrecedence(game[teamSplit].markets[market].books);
            if (isDictEmpty(book)) {
                continue;
            }
            const marketDisplayName = teamBets[market].displayName;
            const entries = {};
            const pregameHitRecords = game[teamSplit].markets[market].pregameHitRecords;
            ["over", "under"].forEach((outcome) => {
                if (outcome in book && book[outcome] && (book[outcome].current || book[outcome].opening)) {
                    entries[outcome] = buildTeamOverUnderEntry(outcome, book, timeframe, pregameHitRecords, false, game, teamBets[market].displayName, userAttributes, teamSplit === "homeTeamData");
                }
            })
            // Copying each outcome's odds to the other one so that both are present if we select one of them
            if (entries.over && entries.under) {
                entries.over.underOdds = entries.under.underOdds;
                entries.under.overOdds = entries.over.overOdds;
            }
            var outcome = "cover";
            if (outcome in book && book[outcome] && (book[outcome].current || book[outcome].opening)) {
                entries[outcome] = buildTeamCoverEntry(book, timeframe, pregameHitRecords, game, teamBets[market].displayName, userAttributes, teamSplit === "homeTeamData", false);
            }
            groupedData[game.id][game[teamSplit].info.code][marketDisplayName] = {}
            Object.keys(entries).forEach((outcome) => {
                inputLines.push(entries[outcome]);
                groupedData[game.id][game[teamSplit].info.code][marketDisplayName][outcome] = entries[outcome];
            });
        }
    }
    
}

// TODO: is this still usable if we want to do best odds?
function getOutcomeOdds(market, outcome, line, timeframe, userAttributes) {
    var outcomeBook = null
    for(let bookId of Object.keys(market.books)) {
        if (market.books[bookId]?.[outcome]) {
            outcomeBook = bookId
            break
        }
    }
    if (!outcomeBook) {
        return null
    }
    const hitRecordKey = getHitRecordKey(market.books[outcomeBook], outcome)
    if (!market.pregameHitRecords?.[hitRecordKey]?.[timeframe].all) {
        return null
    }
    return getMarketOdds(market, line, outcome, userAttributes)
}

export function addTeamMarket(league, groupedData, inputLines, timeframe, market, gameId, userAttributes, preferredProviders) {
    const teamBets = TEAM_BETS[league];
    const marketId = market.name;
    if (!(marketId in teamBets) || !("books" in market) || isDictEmpty(market.books)) {
        return;
    }
    const line = getMainLineBasedOnOccurrences(market, preferredProviders)
    const marketDisplayName = teamBets[marketId].displayName;
    const entries = {};
    const pregameHitRecords = market.pregameHitRecords;
    for(let outcome of ['over', 'under']) {
        const marketOdds = getOutcomeOdds(market, outcome, line, timeframe, userAttributes)
        if (!marketOdds) {
            continue
        }
        entries[outcome] = buildTeamOverUnderEntryFromMarket(league, market, outcome, timeframe, pregameHitRecords, false, gameId, teamBets[marketId].displayName, marketOdds, getBookEntryBasedOnBestOdds(market.books, outcome, line, preferredProviders, false));
    }
    // Copying each outcome's odds to the other one so that both are present if we select one of them
    if (entries.over && entries.under) {
        entries.over.underOdds = entries.under.underOdds;
        entries.under.overOdds = entries.over.overOdds;
    }
    var outcome = "cover";
    const marketOdds = getOutcomeOdds(market, outcome, line, timeframe, userAttributes)
    if (marketOdds) {
        entries[outcome] = buildTeamCoverEntryFromMarket(league, market, timeframe, pregameHitRecords, gameId, teamBets[marketId].displayName, false, marketOdds, getBookEntryBasedOnBestOdds(market.books, outcome, line, preferredProviders, false));
    }
    groupedData[gameId][market.team.code][marketDisplayName] = {}
    Object.keys(entries).forEach((outcome) => {
        inputLines.push(entries[outcome]);
        groupedData[gameId][market.team.code][marketDisplayName][outcome] = entries[outcome];
    });
}

// TODO: instead of checking all the outcomes we can probably just look at the config to see what type of market it is
export function addGameMarket(league, groupedData, inputLines, timeframe, market, gameId, userAttributes, preferredProviders) {
    const teamBets = TEAM_BETS[league];
    const marketId = market.name;
    if (!(marketId in teamBets) || !("books" in market) || isDictEmpty(market.books)) {
        return;
    }
    const line = getMainLineBasedOnOccurrences(market, preferredProviders)
    const marketDisplayName = teamBets[marketId].displayName;
    const entries = {};
    const pregameHitRecords = market.pregameHitRecords;
    for(let outcome of ['over', 'under']) {
        const marketOdds = getOutcomeOdds(market, outcome, line, timeframe, userAttributes)
        if (!marketOdds) {
            continue
        }
        entries[outcome] = buildTeamOverUnderEntryFromMarket(league, market, outcome, timeframe, pregameHitRecords, true, gameId, teamBets[marketId].displayName, marketOdds, getBookEntryBasedOnBestOdds(market.books, outcome, line, preferredProviders, false));
    }

    for(let outcome of ['yes', 'no']) {
        const marketOdds = getOutcomeOdds(market, outcome, line, timeframe, userAttributes)
        if (!marketOdds) {
            continue
        }
        entries[outcome] = buildTeamYesNoEntryFromMarket(league, market, outcome, timeframe, pregameHitRecords, true, gameId, teamBets[marketId].displayName, marketOdds, getBookEntryBasedOnBestOdds(market.books, outcome, line, preferredProviders, false));
    }

    // Copying each outcome's odds to the other one so that both are present if we select one of them
    if (entries.over && entries.under) {
        entries.over.underOdds = entries.under.underOdds;
        entries.under.overOdds = entries.over.overOdds;
    }
    var outcome = "cover";
    const marketOdds = getOutcomeOdds(market, outcome, line, timeframe, userAttributes)
    if (marketOdds) {
        entries[outcome] = buildTeamCoverEntryFromMarket(league, market, timeframe, pregameHitRecords, gameId, teamBets[marketId].displayName, true, marketOdds, getBookEntryBasedOnBestOdds(market.books, outcome, line, preferredProviders, false));
    }
    // Setting on both home and away since it's a shared game-level market that applies to both
    groupedData[gameId][market.team.code][marketDisplayName] = {};
    groupedData[gameId][market.opposingTeam.code][marketDisplayName] = {};
    Object.keys(entries).forEach((outcome) => {
        inputLines.push(entries[outcome]);
        groupedData[gameId][market.team.code][marketDisplayName][outcome] = entries[outcome];
        groupedData[gameId][market.opposingTeam.code][marketDisplayName][outcome] = entries[outcome];
    });
}

export function buildTeamOverUnderEntry(outcome, book, timeframe, pregameHitRecords, isCombined, game, betTypeDisplayName, userAttributes, isHome) {
    const lineFormat = getPreferredFormat(userAttributes);
    const homeTeamData = game.homeTeamData;
    const awayTeamData = game.awayTeamData
    book[outcome].current = book[outcome].current || book[outcome].opening;
    book[outcome].opening = book[outcome].opening || book[outcome].current;

    const outcomeEntry = {
        isCombined: isCombined,
        game: game,
        gameID: game.id,
        home: isHome,
        team: isHome ? homeTeamData.info.code : awayTeamData.info.code,
        opponent: isHome ? awayTeamData.info.code : homeTeamData.info.code,
        homeTeam: homeTeamData.info.code,
        awayTeam: awayTeamData.info.code
    }

    outcomeEntry[BET_TYPE_FILTER] = betTypeDisplayName;

    // A bit of a hack because of a difference in how the number is populated at the source with a whole number in a floating point field 
    // being displayed with a decimal point with a value of 0 and how javascript treats it without the decimal places
    // This way we add a decimal place of 0 if it's an integer value to match how it's being populated at the source

    const hitRecordKey = getLineHitRecordKey(book[outcome].current.value);
    // Not significantly better since it will show "incorrect" data but at least won't crash
    var hitRecord = {
        hits: 0,
        misses: 0,
        games: 0,
        pushes: 0
    }
    if (hitRecordKey in pregameHitRecords) {
        hitRecord = pregameHitRecords[hitRecordKey][timeframe].all;
    }

    outcomeEntry.line = book[outcome].current.value;
    outcomeEntry.formattedLine = `${outcome.charAt(0)}${book[outcome].current.value}`;
    outcomeEntry.odds = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, book[outcome].current.odds));
    outcomeEntry[`${outcome}Odds`] = outcomeEntry.odds;
    outcomeEntry.description = `${capitalizeFirstLetter(outcome)} ${outcomeEntry.line} ${betTypeDisplayName} | ${outcomeEntry.odds}`;
    outcomeEntry.games = hitRecord.games;
    outcomeEntry.pushes = hitRecord.pushes;

    // Because we only calculate and save the hit rate of the over we need to calculate the opposite for the under
    // The cover ones will be covered elsewhere
    if (outcome === 'over') {
        outcomeEntry.hits = hitRecord.hits;
        outcomeEntry.misses = hitRecord.misses;
    } else if (outcome === 'under') {
        outcomeEntry.hits = hitRecord.misses;
        outcomeEntry.misses = hitRecord.hits;
    }
    if (outcomeEntry.games === 0) {
        outcomeEntry.hitPercentage = 0;
    } else {
        outcomeEntry.hitPercentage = (outcomeEntry.hits / outcomeEntry.games) * 100;
    }
    outcomeEntry.hitRate = `${outcomeEntry.hits}/${outcomeEntry.games}`;

    // Opening section
    outcomeEntry.openingFormattedLine = `${outcome.charAt(0)}${book[outcome].opening.value}`;
    outcomeEntry.openingOdds = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, book[outcome].opening.odds));

    // Line movement section
    const lineDifference = book[outcome].current.value - book[outcome].opening.value
    outcomeEntry.lineMovement = `${lineDifference > 0 ? "+" : ""}${lineDifference}`;

    return outcomeEntry;
}

export function buildTeamOverUnderEntryFromMarket(league, market, outcome, timeframe, pregameHitRecords, isCombined, gameId, betTypeDisplayName, odds, bookId) {
    const isHome = market.isHome;
    const book = market.books[bookId]
    book[outcome].current = book[outcome].current || book[outcome].opening;
    book[outcome].opening = book[outcome].opening || book[outcome].current;

    const outcomeEntry = {
        isCombined: isCombined,
        game: {},
        gameID: gameId,
        home: isHome,
        team: market.team.code,
        opponent: market.opposingTeam.code,
        homeTeam: isHome ? market.team.code : market.opposingTeam.code,
        awayTeam: isHome ? market.opposingTeam.code : market.team.code,
    }

    outcomeEntry[BET_TYPE_FILTER] = betTypeDisplayName;

    // A bit of a hack because of a difference in how the number is populated at the source with a whole number in a floating point field 
    // being displayed with a decimal point with a value of 0 and how javascript treats it without the decimal places
    // This way we add a decimal place of 0 if it's an integer value to match how it's being populated at the source

    const hitRecordKey = getLineHitRecordKey(book[outcome].current.value);
    // Not significantly better since it will show "incorrect" data but at least won't crash
    var hitRecord = {
        hits: 0,
        misses: 0,
        games: 0,
        pushes: 0
    }
    if (hitRecordKey in pregameHitRecords) {
        hitRecord = pregameHitRecords[hitRecordKey][timeframe].all;
    }

    outcomeEntry.line = book[outcome].current.value;
    outcomeEntry.formattedLine = `${outcome.charAt(0)}${book[outcome].current.value}`;
    // outcomeEntry.odds = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, book[outcome].current.odds));
    outcomeEntry.odds = odds
    outcomeEntry.bookId = bookId
    outcomeEntry[`${outcome}Odds`] = outcomeEntry.odds;
    outcomeEntry.description = getMarketDescription(league, 'team', outcomeEntry.line, outcome, market, false)
    outcomeEntry.games = hitRecord.games;
    outcomeEntry.pushes = hitRecord.pushes;

    // Because we only calculate and save the hit rate of the over we need to calculate the opposite for the under
    // The cover ones will be covered elsewhere
    if (outcome === 'over') {
        outcomeEntry.hits = hitRecord.hits;
        outcomeEntry.misses = hitRecord.misses;
    } else if (outcome === 'under') {
        outcomeEntry.hits = hitRecord.misses;
        outcomeEntry.misses = hitRecord.hits;
    }
    if (outcomeEntry.games === 0) {
        outcomeEntry.hitPercentage = 0;
    } else {
        outcomeEntry.hitPercentage = (outcomeEntry.hits / outcomeEntry.games) * 100;
    }
    outcomeEntry.hitRate = `${outcomeEntry.hits}/${outcomeEntry.games}`;

    // Opening section
    // outcomeEntry.openingFormattedLine = `${outcome.charAt(0)}${book[outcome].opening.value}`;
    // outcomeEntry.openingOdds = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, book[outcome].opening.odds));

    // Line movement section
    const lineDifference = book[outcome].current.value - book[outcome].opening.value
    outcomeEntry.lineMovement = `${lineDifference > 0 ? "+" : ""}${lineDifference}`;

    return outcomeEntry;
}

// TODO: review MLB RFI, looks like it's not working
export function buildTeamYesNoEntryFromMarket(league, market, outcome, timeframe, pregameHitRecords, isCombined, gameId, betTypeDisplayName, odds, bookId) {
    const isHome = market.isHome;
    const book = market.books[bookId]
    book[outcome].current = book[outcome].current || book[outcome].opening;
    book[outcome].opening = book[outcome].opening || book[outcome].current;

    const outcomeEntry = {
        isCombined: isCombined,
        game: {},
        gameID: gameId,
        home: isHome,
        team: market.team.code,
        opponent: market.opposingTeam.code,
        homeTeam: isHome ? market.team.code : market.opposingTeam.code,
        awayTeam: isHome ? market.opposingTeam.code : market.team.code,
    }

    outcomeEntry[BET_TYPE_FILTER] = betTypeDisplayName;

    // A bit of a hack because of a difference in how the number is populated at the source with a whole number in a floating point field 
    // being displayed with a decimal point with a value of 0 and how javascript treats it without the decimal places
    // This way we add a decimal place of 0 if it's an integer value to match how it's being populated at the source

    const hitRecordKey = 'yes';
    // Not significantly better since it will show "incorrect" data but at least won't crash
    var hitRecord = {
        hits: 0,
        misses: 0,
        games: 0,
        pushes: 0
    }
    if (hitRecordKey in pregameHitRecords) {
        hitRecord = pregameHitRecords[hitRecordKey][timeframe].all;
    }

    outcomeEntry.line = 0;
    outcomeEntry.formattedLine = DEFAULT_MARKET_TEXT
    // outcomeEntry.odds = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, book[outcome].current.odds));
    outcomeEntry.odds = odds;
    outcomeEntry.bookId = bookId
    outcomeEntry[`${outcome}Odds`] = outcomeEntry.odds;
    outcomeEntry.description = getMarketDescription(league, 'team', 0, outcome, market, false)
    outcomeEntry.games = hitRecord.games;
    outcomeEntry.pushes = hitRecord.pushes;

    // Because we only calculate and save the hit rate of the over we need to calculate the opposite for the under
    // The cover ones will be covered elsewhere
    if (outcome === 'yes') {
        outcomeEntry.hits = hitRecord.hits;
        outcomeEntry.misses = hitRecord.misses;
    } else if (outcome === 'no') {
        outcomeEntry.hits = hitRecord.misses;
        outcomeEntry.misses = hitRecord.hits;
    }
    if (outcomeEntry.games === 0) {
        outcomeEntry.hitPercentage = 0;
    } else {
        outcomeEntry.hitPercentage = (outcomeEntry.hits / outcomeEntry.games) * 100;
    }
    outcomeEntry.hitRate = `${outcomeEntry.hits}/${outcomeEntry.games}`;

    // Opening section
    // outcomeEntry.openingFormattedLine = DEFAULT_MARKET_TEXT
    // outcomeEntry.openingOdds = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, book[outcome].opening.odds));

    // Line movement section
    // const lineDifference = book[outcome].current.value - book[outcome].opening.value
    // outcomeEntry.lineMovement = `${lineDifference > 0 ? "+" : ""}${lineDifference}`;

    return outcomeEntry;
}

// TODO: maybe do a try catch here with this whole value shit just to be safe
export function buildTeamCoverEntry(book, timeframe, pregameHitRecords, game, betTypeDisplayName, userAttributes, isHome, isCombined) {
    const outcome = 'cover';
    const lineFormat = getPreferredFormat(userAttributes);
    const homeTeamData = game.homeTeamData;
    const awayTeamData = game.awayTeamData
    const teamData = isHome ? homeTeamData : awayTeamData;
    const opposingTeamData = isHome ? awayTeamData : homeTeamData;
    book[outcome].current = book[outcome].current || book[outcome].opening;
    book[outcome].opening = book[outcome].opening || book[outcome].current;
    const coverEntry = {
        game: game,
        isCombined: isCombined,
        gameID: game.id,
        home: isHome,
        team: teamData.info.code,
        opponent: opposingTeamData.info.code,
        homeTeam: homeTeamData.info.code,
        awayTeam: awayTeamData.info.code
    }
    coverEntry[BET_TYPE_FILTER] = betTypeDisplayName

    const hasValue = ("value" in book[outcome].current && book[outcome].current.value != null && book[outcome].current.value != 0);

    // A bit of a hack because of a difference in how the number is populated at the source with a whole number in a floating point field 
    // being displayed with a decimal point with a value of 0 and how javascript treats it without the decimal places
    // This way we add a decimal place of 0 if it's an integer value to match how it's being populated at the source
    const hitRecordKey = hasValue ? getLineHitRecordKey(book[outcome].current.value) : outcome;
    const hitRecord = pregameHitRecords[hitRecordKey][timeframe].all;

    // Current section
    coverEntry.odds = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, book[outcome].current.odds));
    // Copying it into overOdds to simplify the use of the entry later on
    coverEntry.overOdds = coverEntry.odds;
    coverEntry.underOdds = null;
    coverEntry.hits = hitRecord.hits;
    coverEntry.misses = hitRecord.misses;
    coverEntry.pushes = hitRecord.pushes;
    coverEntry.games = hitRecord.games;
    coverEntry.hitPercentage = hitRecord.hitRate;
    coverEntry.hitRate = `${hitRecord.hits}/${hitRecord.games}`;

    // Opening section
    coverEntry.openingOdds = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, book[outcome].opening.odds));

    if (hasValue) {
        // Current section
        coverEntry.line = book[outcome].current.value;
        coverEntry.formattedLine = `${book[outcome].current.value > 0 ? "+" : ""}${book[outcome].current.value}`;
        // Opening section
        coverEntry.openingFormattedLine = `${book[outcome].opening.value > 0 ? "+" : ""}${book[outcome].opening.value}`;
        // Line movement section
        const lineDifference = book[outcome].current.value - book[outcome].opening.value
        coverEntry.lineMovement = `${lineDifference > 0 ? "+" : ""}${lineDifference}`;
        // User friendly text
        coverEntry.description = `${coverEntry.formattedLine} ${betTypeDisplayName} | ${coverEntry.odds}`
    } else {
        // Current section
        coverEntry.line = 0;
        coverEntry.formattedLine = DEFAULT_MARKET_TEXT;
        // Opening section
        coverEntry.openingFormattedLine = DEFAULT_MARKET_TEXT;
        // Line movement section
        coverEntry.lineMovement = DEFAULT_MARKET_TEXT;
        // User friendly text
        coverEntry.description = `${betTypeDisplayName} | ${coverEntry.odds}`
    }

    return coverEntry;
}

export function buildTeamCoverEntryFromMarket(league, market, timeframe, pregameHitRecords, gameId, betTypeDisplayName, isCombined, odds, bookId) {
    const outcome = 'cover';
    const isHome = market.isHome;
    const book = market.books[bookId]
    book[outcome].current = book[outcome].current || book[outcome].opening;
    book[outcome].opening = book[outcome].opening || book[outcome].current;
    const coverEntry = {
        game: {},
        isCombined: isCombined,
        gameID: gameId,
        home: isHome,
        team: market.team.code,
        opponent: market.opposingTeam.code,
        homeTeam: isHome ? market.team.code : market.opposingTeam.code,
        awayTeam: isHome ? market.opposingTeam.code : market.team.code,
    }
    coverEntry[BET_TYPE_FILTER] = betTypeDisplayName

    const hasValue = ("value" in book[outcome].current && book[outcome].current.value != null && book[outcome].current.value != 0);

    // A bit of a hack because of a difference in how the number is populated at the source with a whole number in a floating point field 
    // being displayed with a decimal point with a value of 0 and how javascript treats it without the decimal places
    // This way we add a decimal place of 0 if it's an integer value to match how it's being populated at the source
    const hitRecordKey = hasValue ? getLineHitRecordKey(book[outcome].current.value) : outcome;
    const hitRecord = pregameHitRecords[hitRecordKey][timeframe].all;

    // Current section
    // coverEntry.odds = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, book[outcome].current.odds));
    coverEntry.odds = odds
    coverEntry.bookId = bookId
    // Copying it into overOdds to simplify the use of the entry later on
    coverEntry.overOdds = coverEntry.odds;
    coverEntry.underOdds = null;
    coverEntry.hits = hitRecord.hits;
    coverEntry.misses = hitRecord.misses;
    coverEntry.pushes = hitRecord.pushes;
    coverEntry.games = hitRecord.games;
    coverEntry.hitPercentage = hitRecord.hitRate;
    coverEntry.hitRate = `${hitRecord.hits}/${hitRecord.games}`;

    // Opening section
    // coverEntry.openingOdds = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, book[outcome].opening.odds));

    if (hasValue) {
        // Current section
        coverEntry.line = book[outcome].current.value;
        coverEntry.formattedLine = `${book[outcome].current.value > 0 ? "+" : ""}${book[outcome].current.value}`;
        // Opening section
        coverEntry.openingFormattedLine = `${book[outcome].opening.value > 0 ? "+" : ""}${book[outcome].opening.value}`;
        // Line movement section
        const lineDifference = book[outcome].current.value - book[outcome].opening.value
        coverEntry.lineMovement = `${lineDifference > 0 ? "+" : ""}${lineDifference}`;
    } else {
        // Current section
        coverEntry.line = 0;
        coverEntry.formattedLine = DEFAULT_MARKET_TEXT;
        // Opening section
        coverEntry.openingFormattedLine = DEFAULT_MARKET_TEXT;
        // Line movement section
        coverEntry.lineMovement = DEFAULT_MARKET_TEXT;
    }
    coverEntry.description = getMarketDescription(league, 'team', coverEntry.line, outcome, market, false)

    return coverEntry;
}
  
  
// TODO: if there's a number in the prop don't show the line, and maybe the O/U
// Will need to check for the prop type once we have the EVENT ones
// TODO: need to get rid of this disgusting piece of code and re-do this logic
export function addPlayerProps(playerPregameRecord, game, teamSplit, opposingTeamSplit, isHome, inputProps, gameID, fieldMapping, betTypeFilter, minimumOdds, lineType, playerBetTypeMappings, playerBetTypeReverseMappings, teamPropRankings, userAttributes, groupedData, league) {
    const teamData = game[teamSplit];
    const opposingTeamData = game[opposingTeamSplit];
    Object.keys(playerPregameRecord.props).map((prop) => {
        const propName = playerBetTypeMappings[prop];
        // Make sure we only add the props we know about. This is mostly for the app to make sure it doesn't display props from the back-end that aren't configured
        if (propName) {
            groupedData[gameID][getPlayerId(playerPregameRecord.info)][propName] = {};
            if (playerBetTypeReverseMappings[betTypeFilter] === prop || betTypeFilter.toUpperCase().startsWith("ALL")) {
                if (playerPregameRecord.props[prop].type === "OVER_UNDER" || playerPregameRecord.props[prop].type === "EVENT_OVER"){
                    const book = getBookEntryBasedOnPrecedence(playerPregameRecord.props[prop].books);
                    if (!isDictEmpty(book)) {
                        var currentLineValue = !isDictEmpty(book.over) ? book.over.current.value : (!isDictEmpty(book.under) ? book.under.current.value : null);
                        currentLineValue = getLineHitRecordKey(currentLineValue)
                        if (currentLineValue != null && Number(currentLineValue) !== 0 && 
                            !isDictEmpty(playerPregameRecord.props[prop].pregameHitRecords) &&
                            `${currentLineValue}` in playerPregameRecord.props[prop].pregameHitRecords &&
                            fieldMapping in playerPregameRecord.props[prop].pregameHitRecords[`${currentLineValue}`] &&
                            !isDictEmpty(playerPregameRecord.props[prop].pregameHitRecords[`${currentLineValue}`][fieldMapping])) {
                            //TODO: fractional min odds using the lineFormat to check for fractional -- can't just use Number(minimumOdds) for fractional
                            // Re-checking the format to make sure we have the latest info
                            const lineFormat = getPreferredFormat(userAttributes);
                            const overHitRates = playerPregameRecord.props[prop].pregameHitRecords[`${currentLineValue}`][fieldMapping].all;
                            if (book.over && lineType.toLowerCase() !== "under") {
                                const overOdds = getFormattedOddValue(userAttributes, book.over.current.odds);
                                // This just sets the decimal places for decimal odds and sets the + sign in front of the american ones if applicable
                                const odds = getFormattedLineValue(lineFormat, overOdds);
                                // Temporary hack to exclude 0 value odds until we fix the data
                                const zeroOdds = (odds === "" || odds === "0/0" || parseFloat(odds) === 0);
                                if ((minimumOdds.toUpperCase().startsWith("ALL") || overOdds >= Number(minimumOdds)) && !zeroOdds) {
                                    const entry = {
                                        game: game,
                                        gameID: gameID,
                                        SRGUID: getPlayerId(playerPregameRecord.info),
                                        team: teamData.info.code,
                                        playerName: getPlayerName(playerPregameRecord),
                                        position: playerPregameRecord.info.position,
                                        line: currentLineValue,
                                        lineType: 'over',
                                        formattedLine: `o${currentLineValue}`,
                                        odds: odds,
                                        hits: overHitRates.hits,
                                        misses: overHitRates.misses,
                                        pushes: overHitRates.pushes,
                                        games: overHitRates.games,
                                        hitPercentage: overHitRates.hitRate,
                                        hitRate: `${overHitRates.hits}/${overHitRates.games}`,
                                        home: isHome,
                                        opponent: opposingTeamData.info.code,
                                        // The first time this runs for the individual games page we don't have the rankings built
                                        opponentRank: teamPropRankings[prop] ? teamPropRankings[prop][opposingTeamData.info.code] : "--",
                                        // For now will only consider soccer with all the 1-5+ props as not showing the line
                                        // description: `${containsNumber(propName) && isSoccer(league) ? "" : `Over ${currentLineValue}`} ${propName} | ${odds}`
                                        description: getMarketDescription(league, 'player', currentLineValue, 'over', playerPregameRecord.props[prop], false)
                                    }
                                    entry[BET_TYPE_FILTER] = propName;
                                    groupedData[gameID][getPlayerId(playerPregameRecord.info)][propName]['over'] = entry;
                                    inputProps.push(entry);
                                }
                            }
                            if (book.under && lineType.toLowerCase() !== "over") {
                                const underOdds = getFormattedOddValue(userAttributes, book.under.current.odds);
                                // This just sets the decimal places for decimal odds and sets the + sign in front of the american ones if applicable
                                const odds = getFormattedLineValue(lineFormat, underOdds);
                                // Temporary hack to exclude 0 value odds until we fix the data
                                const zeroOdds = (odds === "" || odds === "0/0" || parseFloat(odds) === 0);
                                if ((minimumOdds.toUpperCase().startsWith("ALL") || underOdds >= Number(minimumOdds)) && !zeroOdds) {
                                    const entry = {
                                        game: game,
                                        gameID: gameID,
                                        SRGUID: getPlayerId(playerPregameRecord.info),
                                        team: teamData.info.code,
                                        playerName: getPlayerName(playerPregameRecord),
                                        position: playerPregameRecord.info.position,
                                        "bet type": propName,
                                        line: currentLineValue,
                                        lineType: 'under',
                                        formattedLine: `u${currentLineValue}`,
                                        odds: odds,
                                        hits: overHitRates.misses,
                                        misses: overHitRates.hits,
                                        pushes: overHitRates.pushes,
                                        games: overHitRates.games,
                                        hitPercentage: overHitRates.games === 0 ? 0 : (overHitRates.misses / overHitRates.games) * 100,
                                        hitRate: `${overHitRates.misses}/${overHitRates.games}`,
                                        home: isHome,
                                        opponent: opposingTeamData.info.code,
                                        // The first time this runs for the individual games page we don't have the rankings built
                                        opponentRank: teamPropRankings[prop] ? teamPropRankings[prop][opposingTeamData.info.code] : "--",
                                        // The prop with a number shouldn't happen for under but will do this anyway
                                        // For now will only consider soccer with all the 1-5+ props as not showing the line
                                        // description: `${containsNumber(propName) && isSoccer(league) ? "" : `Under ${currentLineValue}`} ${propName} | ${odds}`
                                        description: getMarketDescription(league, 'player', currentLineValue, 'under', playerPregameRecord.props[prop], false)
                                    }
                                    entry[BET_TYPE_FILTER] = propName;
                                    groupedData[gameID][getPlayerId(playerPregameRecord.info)][propName]['under'] = entry;
                                    inputProps.push(entry);
                                }
                            }
                        }
                    }
                }
            }
        }
    })
}
  
export function buildPlayerBettingLeaderboard(games, filters, league, teamPropRankings, userAttributes) {
    var groupedData = {};
    var result = [];
    const timeframeFilter = BETTING_LEADERBOARD_TIMEFRAMES[filters[FILTER_KEYS.TIMEFRAME].selectedValue];
    const selectedGames = filters[GAMES_FILTER]?.selectedValues || filters[GAMES_FILTER]?.selectedValue;
    const selectedBetTypes = filters[FILTER_KEYS.BET_TYPE]?.selectedValues || [filters[FILTER_KEYS.BET_TYPE].selectedValue]
    // Build a dictionary swapping the key and value of the filter options which will allow us to use the 'in' operator to check for presence rather than iterating a list
    const gamesFilter = Object.fromEntries(selectedGames.map(x => [filters[GAMES_FILTER].options[x], x]))
    for (const game of games) {
        if (!(ALL_GAMES_FILTER_OPTION in gamesFilter) && !(game.id in gamesFilter)) {
            continue;
        }
        const homePlayers = game.homeTeamData.players || [];
        const awayPlayers = game.awayTeamData.players || [];
        // This will actually crash the values on every iteration of the timeframe but that's fine because we only need it for the odds right now and 
        groupedData[game.id] = {};
        homePlayers.forEach((player) => {
            groupedData[game.id][getPlayerId(player.info)] = {};
            selectedBetTypes.map((marketName) => {
                addPlayerProps(player, game, 'homeTeamData', 'awayTeamData', true, result, game.id, timeframeFilter, marketName, filters[FILTER_KEYS.MIN_ODDS].selectedValue, filters[FILTER_KEYS.OUTCOME].selectedValue, PLAYER_BET_TYPE_ID_TO_NAME[league], PLAYER_BET_TYPES_REVERSE_MAPPING[league], teamPropRankings, userAttributes, groupedData, league);
            })
        })
        awayPlayers.forEach((player) => {
            groupedData[game.id][getPlayerId(player.info)] = {};
            selectedBetTypes.map((marketName) => {
                addPlayerProps(player, game, 'awayTeamData', 'homeTeamData', false, result, game.id, timeframeFilter, marketName, filters[FILTER_KEYS.MIN_ODDS].selectedValue, filters[FILTER_KEYS.OUTCOME].selectedValue, PLAYER_BET_TYPE_ID_TO_NAME[league], PLAYER_BET_TYPES_REVERSE_MAPPING[league], teamPropRankings, userAttributes, groupedData, league);
            })
        })
    }
    orderListByField(result, 'hitPercentage', 'desc');
    return {
        leaderboard: result,
        groups: groupedData
    };
}

export function buildPlayerBettingLeaderboardFromMarkets(markets, filters, league, teamPropRankings, userAttributes, preferredProviders) {
    var groupedData = {};
    var result = [];
    const timeframeFilter = BETTING_LEADERBOARD_TIMEFRAMES[filters[FILTER_KEYS.TIMEFRAME].selectedValue];
    const selectedGames = filters[GAMES_FILTER]?.selectedValues || filters[GAMES_FILTER]?.selectedValue;
    const selectedBetTypes = filters[FILTER_KEYS.BET_TYPE]?.selectedValues || [filters[FILTER_KEYS.BET_TYPE].selectedValue]
    // Build a dictionary swapping the key and value of the filter options which will allow us to use the 'in' operator to check for presence rather than iterating a list
    const gamesFilter = Object.fromEntries(selectedGames.map(x => [filters[GAMES_FILTER].options[x], x]))
    const betTypeFilterSet = new Set(selectedBetTypes)
    const selectedOutcome = filters[FILTER_KEYS.OUTCOME].selectedValue.toLowerCase()
    const minimumOddsSelection = filters[FILTER_KEYS.MIN_ODDS].selectedValue
    for (const market of markets) {
        if (market.level !== 'player') {
            continue;
        }
        const gameId = market.gameId;
        if (!(ALL_GAMES_FILTER_OPTION in gamesFilter || gameId in gamesFilter)) {
            continue;
        }
        const marketName = getMarketNameFromId(league, 'player', market.name)
        if (!(betTypeFilterSet.has(marketName) || betTypeFilterSet.has(ALL_BETS_MARKET_NAME))) {
            continue;
        }
        if (!(gameId in groupedData)) {
            groupedData[gameId] = {}
        }
        const playerId = getPlayerId(market.player)
        if (!(playerId in groupedData[gameId])) {
            groupedData[gameId][playerId] = {}
        }
        
        var propInfo = null
        if (selectedOutcome !== 'under') {
            propInfo = getPlayerPropInfoFromMarket(league, market, timeframeFilter, 'over', minimumOddsSelection, userAttributes, preferredProviders)
            if (propInfo) {
                result.push(propInfo)
            }
        }
        if (selectedOutcome !== 'over') {
            propInfo = getPlayerPropInfoFromMarket(league, market, timeframeFilter, 'under', minimumOddsSelection, userAttributes, preferredProviders)
            if (propInfo) {
                result.push(propInfo)
            }
        }
    }
    orderListByField(result, 'hitPercentage', 'desc');
    return {
        leaderboard: result,
        groups: groupedData
    };
}

export function getPlayerPropInfoFromMarket(league, market, timeframe, outcome, minimumOdds, userAttributes, preferredProviders) {
    const line = getMainLineBasedOnOccurrences(market, preferredProviders)
    var outcomeFound = false
    for(let bookId of Object.keys(market.books)) {
        if (market.books[bookId]?.[outcome]) {
            outcomeFound = true
            break
        }
    }
    // To make sure we don't show things for which we have no odds for a particular outcome
    // Mainly applies for cases where you have an even_over type prop (such as double double) where you would typically only have an over
    // Making sure we don't show an under hit rate
    if (!outcomeFound) {
        return null
    }
    const hitRecordKey = getLineHitRecordKey(line);
    if (!market.pregameHitRecords?.[hitRecordKey]?.[timeframe].all) {
        return null
    }
    const marketOdds = getMarketOdds(market, line, outcome, userAttributes)
    if (!marketOdds) {
        return null
    }
    if (!(minimumOdds.toUpperCase().startsWith("ALL") || parseFloat(marketOdds) >= parseFloat(minimumOdds))) {
        return null;
    }
    const hitRecord = market.pregameHitRecords[hitRecordKey][timeframe].all;
    const currentTeamData = {
        info: market.team
    }
    const opposingTeamData = {
        info: market.opposingTeam
    }
    return {
        // TODO: switch from playerName to subject wherever possible, adding the same thing on the team side
        subject: getPlayerName(market.player),
        playerName: getPlayerName(market.player),
        description: getMarketDescription(league, 'player', line, outcome, market, false),
        team: market.team.code,
        opponent: market.opposingTeam.code,
        isCombined: false,
        home: market.isHome,
        // TODO: remove usage of bet type and switch to marketName wherever it's still used
        'Bet Type': getMarketNameFromId(league, 'player', market.name),
        marketName: getMarketNameFromId(league, 'player', market.name),
        game: {
            homeTeamData: market.isHome ? currentTeamData : opposingTeamData,
            awayTeamData: market.isHome ? opposingTeamData : currentTeamData
        },
        // TODO: remove usage of SRGUID and switch to playerId wherever it's still used
        SRGUID: getPlayerId(market.player),
        playerId: getPlayerId(market.player),
        position: market.player.position, 
        hitPercentage: outcome === "over" ? hitRecord.hitRate : hitRecord.games === 0 ? 0 : (hitRecord.misses / hitRecord.games) * 100,
        hitRate: outcome === "over" ? `${hitRecord.hits}/${hitRecord.games}` : `${hitRecord.misses}/${hitRecord.games}`,
        odds: marketOdds,
        // Ideally we get this from the process of getting the odds instead of repeating it
        bookId: getBookEntryBasedOnBestOdds(market.books, outcome, line, preferredProviders, false)
    }
}

export function getHitRateInfo(league, marketOutcomeHitRate, userAttributes, t) {
    const level = marketOutcomeHitRate.level
    const type = level === 'player' ? 'player' : 'team'
    const info = {
        description: getMarketDescription(
            league,
            type,
            marketOutcomeHitRate.line,
            marketOutcomeHitRate.outcome,
            {name: marketOutcomeHitRate.marketId},
            false,
            t
        ),
        team: marketOutcomeHitRate.team.code,
        opponent: marketOutcomeHitRate.opposingTeam.code,
        opponentTeamId: marketOutcomeHitRate.opposingTeam.teamId,
        isCombined: level === 'game',
        // home: market.isHome,
        home: marketOutcomeHitRate.home,
        marketName: getLocalizedMarketNameFromId(t, league, type, marketOutcomeHitRate.marketId),
        game: {
            homeTeamData: marketOutcomeHitRate.home ? {info: marketOutcomeHitRate.team} : {info: marketOutcomeHitRate.opposingTeam},
            awayTeamData: marketOutcomeHitRate.home ? {info: marketOutcomeHitRate.opposingTeam} : {info: marketOutcomeHitRate.team}
        },
        // New back-end implementation already flips the hit rate for us for unders so we don't have to manipulate it here
        hitPercentage: marketOutcomeHitRate.hitRecord.hitRate,
        hitRate: `${marketOutcomeHitRate.hitRecord.hits}/${marketOutcomeHitRate.hitRecord.games}`,
        odds: getFormattedLineValue(getPreferredFormat(userAttributes), getFormattedOddValue(userAttributes, marketOutcomeHitRate.odds)),
        bookId: marketOutcomeHitRate.bookId
    }

    const normalizedBookId = marketOutcomeHitRate.bookId?.toLowerCase?.();

    info.betslipLeg = {
        league,
        line: marketOutcomeHitRate.line,
        market: {
            type: "OVER_UNDER",
            level: marketOutcomeHitRate.level,
            name: marketOutcomeHitRate.marketId,
            id: marketOutcomeHitRate.marketId,
            team: marketOutcomeHitRate.team,
            opposingTeam: marketOutcomeHitRate.opposingTeam,
            player: marketOutcomeHitRate.player,
            gameId: marketOutcomeHitRate.gameId,
            isHome: marketOutcomeHitRate.home,
            books: normalizedBookId ? {
                [normalizedBookId]: {
                    [marketOutcomeHitRate.outcome]: {
                        current: {
                            value: marketOutcomeHitRate.line,
                            odds: marketOutcomeHitRate.odds
                        },
                        opening: null,
                        alternates: null
                    }
                }
            } : {}
        },
        book: normalizedBookId,
        team: marketOutcomeHitRate.team,
        opposingTeam: marketOutcomeHitRate.opposingTeam,
        player: marketOutcomeHitRate.player,
        gameId: marketOutcomeHitRate.gameId, // TODO: i dont think this is actually populated in backend
        home: marketOutcomeHitRate.home,
        outcome: marketOutcomeHitRate.outcome,
        type,
        alternate: false
    }

    if (type === 'player') {
        info.subject = getPlayerName(marketOutcomeHitRate.player)
        info.playerName = getPlayerName(marketOutcomeHitRate.player)
        info.playerId = getPlayerId(marketOutcomeHitRate.player)
        info.position = marketOutcomeHitRate.player.position
    } else {

    }

    return info;
}

export function determineOpposingFieldSelection(league, selectedPlayer, opposingTeamData) {
    if (league !== "mlb" || isDictEmpty(selectedPlayer)) {
        return {fieldSelection: "team", opposingPlayerId: null};
    }
    if (selectedPlayer.info.position === "P" || selectedPlayer.info.position === "SP" || selectedPlayer.info.position === "RP" || !opposingTeamData.startingPitcher) {
        return {fieldSelection: "team", opposingPlayerId: null};
    } else {
        return {fieldSelection: "player", opposingPlayerId: opposingTeamData.startingPitcher.SRGUID};
    }
}

// TODO: We really should extract this as an offline exercise and get it from the API
//  We should also look into ranking each stat only once. 
//  There are opposing supporting stats which are the same across multiple props and right now we re-rank each stat for each prop when we could re-use the rank
// TODO: this probably belongs more in general util than in betting-utils
export function buildSupportingStatsRankings(league, teams, situations) {
  var result = {};

  Object.keys(situations).map((situation) => {
      var situationalResult = {};
      const props = getSituationalProps[league](situation);
      Object.keys(props).map((prop) => {
          var propsResult = {};
          const supportingStats = props[prop].opposingSupportingStats;
          Object.keys(supportingStats).map((stat) => {
              const value = supportingStats[stat];
              const fields = value.teamFields;
              var teamRankMapping = buildTeamRankMapping(teams, fields, value.ranked, value.sortingOrder)
              propsResult[stat] = teamRankMapping;
          });
          situationalResult[prop] = propsResult;
      })
      result[situation] = situationalResult;
  })
  return result;
}

// TODO: We really should extract this as an offline exercise and get it from the API
//  We should also look into ranking each stat only once. 
//  There are opposing supporting stats which are the same across multiple props and right now we re-rank each stat for each prop when we could re-use the rank
export function buildPositionalSupportingStatsRankings(league, teams) {
    var result = {};

    const positionSet = new Set()
    teams.forEach((team) => Object.keys(team?.positionalStats || {}).forEach(position => positionSet.add(position)))

    const props = getSituationalProps[league](null);
    Object.keys(props).map((prop) => {
        var propsResult = {};
        const supportingStats = props[prop].opposingPositionalSupportingStats || props[prop].opposingSupportingStats;
        Object.keys(supportingStats).map((stat) => {
            const value = supportingStats[stat];
            if ('positionalTeamFields' in value) {
                propsResult[stat] = {};
                positionSet.forEach((position) => {
                    const fields = value.positionalTeamFields && value.positionalTeamFields(position);
                    var teamRankMapping = buildTeamRankMapping(teams, fields, value.ranked, value.sortingOrder)
                    propsResult[stat][position] = teamRankMapping;
                })
            }
        });
        // Only add the ranking entry if we have a positional team field
        if (!isDictEmpty(propsResult)) {
            result[prop] = propsResult;
        }
    })
    return result;
}

export function buildTeamRankMapping(teams, fields, ranked, sortingOrder) {
    // Creating a local copy of the teams list
    var localTeams = teams.map(a => ({...a}));
    // stat -> teamRankMapping
    // teamRankMapping: team -> rank
    var teamRankMapping = {};
    if (ranked) {
        // Need to iterate to build the value since we have props with multiple fields
        localTeams.map((team) => {
            // Adding a new field to track the final value based on which we're going to sort
            // Precision of 3 to try and avoid some of the rounding causing multiple teams to be ranked the same and giving a different ranking than the back-end
            // The value of 3 is arbitrarily picked
            team.statValue = getMultiFieldValueWithPrecision(team, fields, 3);
        })
        orderListByField(localTeams, 'statValue', sortingOrder);
        localTeams.map((team, index) => {
            teamRankMapping[team.code] = index + 1;
        })
    } else {
        // For ease of use we will keep the original value if it's not to be ranked and add it as-is
        localTeams.map((team) => {
            // Adding a new field to track the final value based on which we're going to sort
            // The precision of 3 probably not necessary here but will leave it unless it causes any problems
            teamRankMapping[team.code] = getMultiFieldValueWithPrecision(team, fields, 3);
        })
    }
    return teamRankMapping
}

function getLocalizedOutcomeName(t, outcomeName) {
    const defaultValue = capitalizeFirstLetter(outcomeName);

    if (typeof t !== "function") {
        return defaultValue;
    }

    return t(`common.filters.options.outcome.${outcomeName}`, {
        defaultValue,
    });
}

export function getMarketDescriptionInfo(league, type, line, outcomeName, market, isAlternate, t) {
    if (!market?.name) {
        return {description: '', line: 0, displayLine: 0};
    }

    const outcomeDisplayName = getLocalizedOutcomeName(t, outcomeName);

    if (type === "team") {
        const teamBet = TEAM_BETS[league][market.name];
        if (isDictEmpty(teamBet)) {
            return {description: '', line: 0, displayLine: 0};
        }

        const marketDisplayName = getLocalizedMarketNameFromId(t, league, "team", market.name);

        // TODO: need to figure out a better way of handling this. For RFI the yes/no works but won't be the case for some other markets
        //  May need to have configurable bet type display name per outcome
        if (teamBet.outcomeType === OUTCOME_TYPE_YES_NO) {
            if (outcomeName === "yes") {
                return {description: `${outcomeDisplayName} - ${marketDisplayName}`, line: 0.5, displayLine: 0}
            }
            if (outcomeName === "no") {
                return {description: `${outcomeDisplayName} - ${marketDisplayName}`, line: 0.5, displayLine: 0}
            }
        }
        if ((outcomeName === "over" || outcomeName === "under") && !isAlternate) {
            return {description: `${outcomeDisplayName} ${line} ${marketDisplayName}`, line: line, displayLine: line}
        } else if (outcomeName === "over" && isAlternate) {
            // Only overs have a milestone style (line+ instead of decimal line)
            return {description: `${line + 0.5}+ ${marketDisplayName}`, line: line, displayLine: `${line + 0.5}+`}
        } else if (outcomeName === "under" && isAlternate)  {
            return {description: `${outcomeDisplayName} ${line} ${marketDisplayName}`, line: line, displayLine: line}
        } else if (outcomeName === "cover") {
            const hasValue = line != null && line != 0;
            if (hasValue) {
                return {description: `${line > 0 ? "+" : ""}${line} ${marketDisplayName}`, line: line, displayLine: line}
            } else {
                return {description: marketDisplayName, line: line, displayLine: line}
            }
        }
        // Not going to cover draw for now
        return {description: '', line: 0, displayLine: 0};
    } else if (type === "player") {
        const propName = PLAYER_BET_TYPE_ID_TO_NAME[league][market.name];
        if (!propName) {
            return {description: '', line: 0, displayLine: 0};
        }

        const propDisplayName = getLocalizedMarketNameFromId(t, league, "player", market.name);

        // Soccer props that have the number in them already have the milestone so no extra info
        if (containsNumber(propName) && isSoccer(league)) {
            return {description: propDisplayName, line: line, displayLine: line}
        }
        // Long term should have some configuration to indicate which props are events without a line but for now will just do anytime* props
        if (propName.toLowerCase().includes('anytime')) {
            return {description: propDisplayName, line: line, displayLine: null}
        }
        // Only overs have a milestone style (line+ instead of decimal line
        if (outcomeName === "over" && isAlternate) {
            return {description: `${line + 0.5}+ ${propDisplayName}`, line: line, displayLine: `${line + 0.5}+`}
        }
        return {description: `${outcomeDisplayName} ${line} ${propDisplayName}`, line: line, displayLine: line}
    } else {
        return {description: '', line: 0, displayLine: 0};
    }
}

export function getMarketDescription(league, type, line, outcomeName, market, isAlternate, t) {
    return getMarketDescriptionInfo(league, type, line, outcomeName, market, isAlternate, t).description
}

// Type = player|team
// Market should be the market object that we get from the API
export function getMarketDescriptionFromTrend(league, trend, preferredProviders, t) {
    const type = trend.type;
    const market = trend.market;
    const outcomeName = trend.outcome;

    if (!market || !market.books) {
        return "";
    }

    const bookName = getBookEntryBasedOnBestOdds(
        market.books,
        trend.outcome,
        trend.line,
        preferredProviders,
        trend.alternate
    );

    if (!bookName || !market.books[bookName] || !(outcomeName in market.books[bookName])) {
        return "";
    }

    const lineOutcome = getLineOutcomeFromCard(trend, preferredProviders);
    return getMarketDescription(
        league,
        type,
        lineOutcome?.value || 0,
        outcomeName,
        market,
        trend?.alternate,
        t
    );
}

// Formats the line for checking the hit record
// A bit of a hack because of a difference in how the number is populated at the source with a whole number in a floating point field 
// being displayed with a decimal point with a value of 0 and how javascript treats it without the decimal places
// This way we add a decimal place of 0 if it's an integer value to match how it's being populated at the source
export function getLineHitRecordKey(line) {
    if (line == null || line == undefined) {
        return line;
    }
    // Note: here we could also use 'line % 1' instead of Number.isInteger
    return Number.isInteger(line) ? `${line}.0` : line;
}

export function getHitRecordKey(bookEntry, outcome) {
    const outcomeEntry = bookEntry?.[outcome]
    const hasValue = outcomeEntry?.current?.value && outcomeEntry?.current?.value != 0
    // We're always going to base it off the yes for the yes/no type markets. 
    // The same thing applies for over/under and cover however cover is on its own or has a line and over/under always has a line as the key
    // The yes/no is a bit of unique case
    return hasValue ? getLineHitRecordKey(outcomeEntry.current.value) : (outcome === 'no' ? 'yes' : outcome);
}

export function supportedParlayLeg(league, leg) {
    return supportedMarketFilter(league, leg)
}

export function supportedNarrativesFilter(trend) {
    return trend.narratives && trend.narratives.length > 0 && trend.narratives.every(narrative => narrative in NARRATIVES)
}

export function supportedSignalsFilter(trend) {
    if (!Array.isArray(trend?.signals)) {
        return false;
    }

    trend.signals = trend.signals.filter(signal => SUPPORTED_SIGNALS.has(signal?.type));
    return trend.signals.some(signal => signal.summary === true);
}

// This is also being used for parlay legs which should have a similar enough structure to be covered
export function supportedMarketFilter(league, trend) {
    return trend.market && isMarketSupported(league, trend.type, trend.market.name);
}

export function isMarketSupported(league, type, market) {
    if (type === "player") {
        return market in PLAYER_BET_TYPE_ID_TO_NAME[league]
    } else if (type === "team") {
        return market in TEAM_BETS[league]
    }
    return false;
}

// TODO: instead of discarding whole trends with unknown types we just filter down the list of signals and then if no signals are left then we remove the trend
//  instead of being a predicate function with just the filter condition probably should create a new function to filter the whole list which would also take care of filtering the signals first
// Used for straight trends (also originally called discovery cards)
export function supportedTrendFilter(league, trend) {
    return supportedSignalsFilter(trend) && supportedMarketFilter(league, trend)
}

// Used for same game parlay trends
export function supportedSameGameParlayFilter(league, parlay) {
    // Checks to make sure all signals are supported
    // Checks to make sure all legs are individually supported in terms of markets
    // Checks to make sure either the gameId is set at the parlay level or all legs are within the same game
    return supportedSignalsFilter(parlay) && parlay.legs && parlay.legs.length > 0 && parlay.legs.every(x => supportedParlayLeg(league, x)) && (parlay?.gameId || new Set(parlay.legs.map(x => x?.gameId)).size === 1)
}

// All narratives are supported
// Checks to make sure all legs are individually supported in terms of markets
// Markets of all legs must be the same market
export function supportedCrossGameParlayFilter(league, parlay) {
    return supportedSignalsFilter(parlay) && 
            // Each leg is supported 
            parlay.legs && parlay.legs.length > 0 && 
            parlay.legs.every(x => supportedParlayLeg(league, x)) && 
            // All legs must have the same market
            new Set(parlay.legs.map(x => x?.market?.name)).size === 1 &&
            // We already checked that all the markets are the same above, here we're checking one of them to make sure it's a supported cross-game market
            SUPPORTED_LEAGUES[league]?.supportedCrossGameParlays?.some(config => config.type === parlay.legs[0]?.type && config.marketId === parlay.legs[0]?.market?.name)
}

export function getOutcomeValueFromBook(book, outcome) {
    // Assumption is if there's an outcome entry, at the very least the 'current' should be populated, hence skipping check for presence of 'current'
    if (isDictEmpty(book) || !(outcome in book) || !book[outcome] || !('value' in book[outcome].current) || !book[outcome].current.value) {
        return 0;
    } else {
        return book[outcome].current.value;
    }
}

// To be used with the game object where the bet has to be looked up
export function getBetTypeLineValue(league, type, game, betType, teamCode, playerId) {
    var teamPath = "";
    if (game.awayTeamData.info.code === teamCode) {
        teamPath = "awayTeamData";
    } else {
        teamPath = "homeTeamData";
    }
    if (type === "team") {
        const betId = TEAM_BET_TYPE_REVERSE_MAPPING[league][betType];
        if (!(betId in TEAM_BETS[league])) {
            return 0;
        }
        const betDetails = TEAM_BETS[league][betId]
        if (betDetails.outcomeType === OUTCOME_TYPE_COVER_YES || betDetails.outcomeType === OUTCOME_TYPE_YES_NO) {
            // Internally still going to use 0.5 for yes/no for now
            return 0.5;
        }
        const outcome = betDetails.outcomeType === OUTCOME_TYPE_OVER_UNDER ? 'over' : 'cover';
        if (betDetails.type === GAME_BET_TYPE && 'markets' in game && game.markets && betId in game.markets) {
            const book = getBookEntryBasedOnPrecedence(game.markets[betId].books);
            return getOutcomeValueFromBook(book, outcome);
        } else if (betDetails.type === TEAM_BET_TYPE && 'markets' in game[teamPath] && game[teamPath].markets && betId in game[teamPath].markets) {
            const book = getBookEntryBasedOnPrecedence(game[teamPath].markets[betId].books);
            return getOutcomeValueFromBook(book, outcome);
        } else {
            return 0;
        }
    } else if (type === "player") {
        const propName = betType;
        if (!propName || propName == null || propName === "") {
            return 0;
        }
        const playerRecord = game[teamPath].players.find(x => getPlayerId(x.info) === playerId);
        if (!playerRecord) {
            return 0;
        }
        const playerBetTypeReverseMappings = Object.fromEntries(Object.entries(PLAYER_BET_TYPES_REVERSE_MAPPING[league]).filter(([key]) => !SCREENER_ONLY_PROPS[league].includes(key)));
        const propID = playerBetTypeReverseMappings[propName];
        const playerProp = playerRecord.props[propID];
        if (playerProp) {
            const book = getBookEntryBasedOnPrecedence(playerProp.books);
            if (isDictEmpty(book)) {
                return 0;
            } else {
                return book.over.current.value;
            }
        } else {
            return 0;
        }
    }
}

// Meant to be used with the markets from active game info where everything is present and flattened 
//  but in theory can be used with any implementation where the markets are available
export function getMarketLineValue(league, type, markets, betType) {
    if (!markets) {
        return 0;
    }
    if (type === "team") {
        const betId = TEAM_BET_TYPE_REVERSE_MAPPING[league][betType];
        if (!(betId in TEAM_BETS[league])) {
            return 0;
        }
        const betDetails = TEAM_BETS[league][betId]
        if (betDetails.outcomeType === OUTCOME_TYPE_COVER_YES || betDetails.outcomeType === OUTCOME_TYPE_YES_NO) {
            // Internally still going to use 0.5 for yes/no for now
            return 0.5;
        }
        const outcome = betDetails.outcomeType === OUTCOME_TYPE_OVER_UNDER ? 'over' : 'cover';
        if (betId in markets) {
            const book = getBookEntryBasedOnPrecedence(markets[betId].books);
            return getOutcomeValueFromBook(book, outcome);
        } else {
            return 0;
        }
    } else if (type === "player") {
        const propName = betType;
        if (!propName || propName == null || propName === "") {
            return 0;
        }
        const playerBetTypeReverseMappings = Object.fromEntries(Object.entries(PLAYER_BET_TYPES_REVERSE_MAPPING[league]).filter(([key]) => !SCREENER_ONLY_PROPS[league].includes(key)));
        const propID = playerBetTypeReverseMappings[propName];
        const playerProp = markets[propID];
        if (playerProp) {
            const book = getBookEntryBasedOnPrecedence(playerProp.books);
            if (isDictEmpty(book)) {
                return 0;
            } else {
                return book.over.current.value;
            }
        } else {
            return 0;
        }
    }
}
// NOTE: not sure if the 'alternate' field needs to be in the key
    //  Presumably the 'line' should be enough regardless of if it's an alt
export function getCardKey(card) {
    if (!card) {
        return null;
    }

    if (Array.isArray(card.legs) && card.legs.length > 0) {
        const parlayType = card.crossGame
            ? 'crossGame'
            : card.crossTeam
                ? 'crossTeam'
                : 'sameGame';

        const matchupKey =
            card.gameId ||
            `${card.awayTeam?.code || ''}-${card.homeTeam?.code || ''}`;

        const legsKey = card.legs
            .map((leg, index) =>
                [
                    index,
                    leg.gameId || '',
                    leg.type || '',
                    leg.player != null ? getPlayerId(leg.player) : '',
                    leg.team?.code || '',
                    leg.market?.name || '',
                    leg.line ?? '',
                    leg.alternate ?? '',
                    leg.outcome || ''
                ].join(':')
            )
            .join('|');

        return `${card.id || 'no-id'}-${parlayType}-${matchupKey}-${legsKey}`;
    }

    if ('id' in card && card.id) {
    return card.id;
}

if ('trendId' in card && card.trendId) {
    return card.trendId;
}

return `${card.gameId}-${card.type}-${card.player != null ? getPlayerId(card.player) : ""}-${card.team.code}-${card.market.name}-${card.book}-${card.line}-${card.alternate}-${card.outcome}-${card.combined}-${card.hasCombinedEquivalent}-${(card.narratives || []).join('-')}`
}

export function getHitRateKey(hitRate) {
    if (!hitRate) {
        return null;
    }
    if (hitRate.id) {
        return hitRate.id
    }
    // TODO: does alternate matter? Similar to the comment in getCardKey
    return `${hitRate.gameId}-${hitRate.level}-${hitRate.player != null ? getPlayerId(hitRate.player) : ""}-${hitRate.team.code}-${hitRate.marketId}-${hitRate.bookId}-${hitRate.line}-${hitRate.outcome}`
}

export function getBetslipLegKey(league, leg) {
    return `${getBetslipCanonicalLegKey(league, leg)}-${leg.line}-${leg.outcome}`
}

// The reason we need a version of the key with line/outcome and one without is to be able to tell specifically if a trend is already added at a line vs not, where the latter gets replaced but the former you show a different text
export function getBetslipCanonicalLegKey(league, leg) {
    return `${league}-${leg.gameId}-${leg.player != null ? getPlayerId(leg.player): leg.team.code}-${leg.market.name}`
}

export function getMarketNameFromId(league, type, marketId) {
    if (!isMarketSupported(league, type, marketId)) {
        return ""
    }
    if (type === "team") {
        return TEAM_BETS[league][marketId].displayName
    }
    if (type === "player" && marketId in PLAYER_BET_TYPE_ID_TO_NAME[league]) {
        return PLAYER_BET_TYPE_ID_TO_NAME[league][marketId]
    }
    return ""
}

export function getLocalizedMarketNameFromId(t, league, type, marketId) {
    const defaultValue = getMarketNameFromId(league, type, marketId)

    if (typeof t !== "function") {
        return defaultValue
    }

    if (type) {
        const scopedValue = t(`betTypes.${type}.${marketId}`, {
            defaultValue: "",
        })

        if (scopedValue) {
            return scopedValue
        }
    }

    return t(`betTypes.${marketId}`, {
        defaultValue,
    })
}

export function getMarketIdFromName(league, type, marketName) {
    if (type === "team" && marketName in TEAM_BET_TYPE_REVERSE_MAPPING[league]) {
        return TEAM_BET_TYPE_REVERSE_MAPPING[league][marketName]
    }
    if (type === "player" && marketName in PLAYER_BET_TYPES_REVERSE_MAPPING[league]) {
        return PLAYER_BET_TYPES_REVERSE_MAPPING[league][marketName]
    }
    return ""
}

function setMarketDataLine(userAttributes, lineKey, marketData, outcomeName, outcome, book, alternate) {
    if (!(`${lineKey}` in marketData.lines)) {
        marketData.lines[`${lineKey}`] = {
            cover: null,
            over: null,
            under: null,
            yes: null,
            no: null
        }
    }
    marketData.lines[`${lineKey}`][outcomeName] = {
        odds: getPreferredOdds(userAttributes, outcome.odds, true),
        book: book,
        alternate: alternate
    }
}

// Determines the main line to use in the case where we have multiple
// This is done by getting the line which is seen in the most books
// TODO: fallback to country prefs
export function getMainLineBasedOnOccurrences(market, preferredProviders) {
    const bookMainLines = {}
    if (!market) {
        return null;
    }
    if (!market.books) {
        return null
    }
    Object.keys(market.books).forEach(bookId => {
        if (preferredProviders?.length === 0 || (preferredProviders?.length > 0 && preferredProviders.includes(bookId))) {
            for (const outcome of Object.keys(market.books[bookId] || {})) {
                if (!market.books[bookId]?.[outcome]) {
                    continue
                }
                bookMainLines[bookId] = market.books[bookId][outcome].current?.value
                break
            }
        }
    })
    if (isDictEmpty(bookMainLines)) {
        // console.log(JSON.stringify(market))
        // console.log(preferredProviders)
        return null
    }
    // Accessing these indexes should be safe since for them to get grouped up in the first place there should at least be 1 element at each step
    return Object.values(groupBy(Object.values(bookMainLines), x => x)).sort((a, b) => b.length - a.length)[0][0]
}

export function buildMarketData(league, userAttributes, type, markets, marketId, preferredProviders) {
    var marketOutcomeType = OUTCOME_TYPE_OVER_UNDER;
    if (type === "team" && marketId in TEAM_BETS[league]) {
        const market = TEAM_BETS[league][marketId]; 
        marketOutcomeType = market.outcomeType;
    }

    const marketData = {
        marketOutcomeType: marketOutcomeType,
        mainLine: 0,
        lines: {}
    }
    
    if (!(marketId in markets)) {
        return marketData
    }

    // TODO: ideally main line is based on the books available in that region but TBD
    // Main line is determined by the one with the highest number of books having it
    //  for that, iterate through all the book entries and all the outcomes
    //  breaking out at the first line that is found per book because we assume all the outcomes have the same line
    //  pick the main line that has the most occurrences 
    //  after the main line is determined we can set it in the market data (which is literally all we want it for unfortunately)
    const outcomesToCheck = ['cover', 'over', 'under', 'yes', 'no']
    // TODO: should we add a field in back-end for all the available lines to make all this easier?
    //  We could also use the lines under pregameHitRecords but it's less reliable and still need to convert the key if it's not a number into a line number (such as cover)
    const lines = new Set()
    // const bookMainLines = {}
    Object.keys(markets[marketId].books).forEach(bookId => {
        for (const outcome of outcomesToCheck) {
            // go through all books for that market (more reliable)
            // build a set of lines by going through (current + alt)?.value
            // iterate through the set of lines 
            
            if (!markets[marketId].books[bookId]?.[outcome]) {
                continue;
            }

            const mainLine = markets[marketId].books[bookId][outcome].current?.value //|| 0.5
            lines.add(mainLine)
            Object.values(markets[marketId].books[bookId][outcome]?.alternates || {}).map(x => x?.value || 0.5).forEach(x => lines.add(x))

            // if (!bookMainLines?.[bookId]) {
            //     bookMainLines[bookId] = mainLine
            // }

            break
        }
    })
    

    const mainLine = getMainLineBasedOnOccurrences(markets[marketId], preferredProviders)
    if (!mainLine) {
        return marketData;
    }
    // Accessing these indexes should be safe since for them to get grouped up in the first place there should at least be 1 element at each step
    // const mainLine = Object.values(groupBy(Object.values(bookMainLines), x => x)).sort((a, b) => b.length - a.length)[0][0]
    // // Need to make sure to fall back on 0.5 for event-type markets. Only doing it at the point where we set it
    // marketData.mainLine = mainLine || 0.5
    // Need to make sure to fall back on 0.5 for event-type markets. Only doing it at the point where we set it
    marketData.mainLine = mainLine || 0.5

    lines.forEach(line => {
        for (const outcome of outcomesToCheck) {
            const book = getBookEntryBasedOnBestOdds(markets[marketId].books, outcome, line, preferredProviders, null)
            if (!book) {
                continue
            }
            if (markets[marketId].books[book][outcome]?.current?.value === line) {
                // Need to make sure to fall back on 0.5 for event-type markets. Only doing it at the point where we add it to the list of lines for later comparison
                setMarketDataLine(userAttributes, line || 0.5, marketData, outcome, markets[marketId].books[book][outcome].current, book, false)
            } else {
                const outcomeEntry = Object.values(markets[marketId].books[book][outcome]?.alternates || {}).find(x => x?.value === line)
                if (outcomeEntry) {
                    setMarketDataLine(userAttributes, line, marketData, outcome, outcomeEntry, book, true)
                }
            }
        }
    })
    
    return marketData;
}

// TODO: specify which markets to request in an attempt to reduce the payload!
//  new v3 api will support markets and gameIds!
// TODO: add preferred providers!
export function getMarketsPromise(host, league, levels) {
    return fetch(`${host}/api/${league}/v3/markets?levelsToInclude=${levels.join(',')}`)
    .then(response => jsonOrDefault(response, []))
    .then(markets => markets.filter(market => isMarketSupported(league, market.level === 'player' ? 'player' : 'team', market.name)))
    .catch(console.error)
}

// Used for putting back the markets in the game objects to avoid too many front-end changes for the time being
export function assignGameMarkets(markets, games) {
    // console.log(markets)
    const groupedMarkets = groupBy(markets, (market) => market.gameId)
    for (let game of games) {
        if (!(game.id in groupedMarkets)) {
            continue;
        }
        game.markets = {}
        if (!game?.homeTeamData) {
            game.homeTeamData = {};
        }
        if (!game?.awayTeamData) {
            game.awayTeamData = {}
        }
        game.homeTeamData.markets = {}
        game.awayTeamData.markets = {}
        groupedMarkets[game.id].forEach((market) => {
            if (market.level === 'game') {
                game.markets[market.name] = market
            }
            if (market.level === 'team' && market.isHome) {
                game.homeTeamData.markets[market.name] = market
            }
            if (market.level === 'team' && !market.isHome) {
                game.awayTeamData.markets[market.name] = market
            }
        })
    }
}


export function getOutcomeTypeByBetType(league, betType, type) {
    if (type === 'player') {
        return 'OVER_UNDER'
    }
    return TEAM_BETS?.[league]?.[betType]?.outcomeType
}

export function getMarketLevel(league, betType, type) {
    if (type === 'player') {
        return 'player'
    }
    return TEAM_BETS?.[league]?.[betType]?.type
}
