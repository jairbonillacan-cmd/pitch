import { getMainLineBasedOnOccurrences } from './betting-utils.js';
import { SCHEDULE_FORMAT_DAILY } from './constants.js';
import { orderListByField, getPreferredFormat, getFormattedLineValue, getFormattedOddValue, getBookEntryBasedOnBestOdds } from './util.js';

export function getGamedaySchedule(host, league, recordType, reduced, format = SCHEDULE_FORMAT_DAILY) {
  return [
    getCurrentGamedaySchedule(host, league, recordType, reduced, format),
    fetch(`${host}/api/${league}/v3/games/upcoming?recordType=${recordType}&format=${format}`).then(data => data.json())
  ]
}

export function getCurrentGamedaySchedule(host, league, recordType, reduced, format = SCHEDULE_FORMAT_DAILY) {
  return fetch(`${host}/api/${league}/v3/games/current?recordType=${recordType}&format=${format}`).then(data => data.json());
}

// This could probably go out of the gameday specifically
export function getAllTeams(host, league) {
  return fetch(`${host}/api/${league}/v3/teams`).then(data => data.json());
}

export function buildStandings(teams) {
  const normalizedTeams = Array.isArray(teams)
    ? teams.filter((team) => team?.standings)
    : [];

  if (normalizedTeams.length === 0) {
    return {};
  }

  teams = normalizedTeams;
  var standings = {};

  if ("division" in teams[0].standings && teams[0].standings.division !== null) {
    var divisionalRankings = {};
    // Build the grouping of divisions
    for (var team of teams) {
      const division = team.standings.division;
      if (!(division in divisionalRankings)) {
        divisionalRankings[division] = [];
      }
      divisionalRankings[division].push(team);
    }
    // Sort the divisions based on the divisionalRank
    for (var division in divisionalRankings) {
      orderListByField(divisionalRankings[division], "standings.divisionRank", "asc");
    };
    standings["division"] = divisionalRankings;
  }
  if ("conference" in teams[0].standings && teams[0].standings.conference !== null) {
    var conferenceRankings = {};
    // Build the grouping of conferences
    for (var conferenceTeam of teams) {
      const conference = conferenceTeam.standings.conference;
      if (!(conference in conferenceRankings)) {
        conferenceRankings[conference] = [];
      }
      conferenceRankings[conference].push(conferenceTeam);
    }
    // Sort the conferences based on the conferenceRank
    for (var conference in conferenceRankings) {
      orderListByField(conferenceRankings[conference], "standings.conferenceRank", "asc");
    }
    standings["conference"] = conferenceRankings;
  } 
  if ("league" in teams[0].standings && teams[0].standings.league !== null) {
    // This is for MLB
    var leagueRankings = {};
    // Build the grouping of leagues
    for (var leagueTeam of teams) {
      const league = leagueTeam.standings.league;
      if (!(league in leagueRankings)) {
        leagueRankings[league] = [];
      }
      leagueRankings[league].push(leagueTeam);
    }
    // Sort the leagues based on the leagueRank
    for (var league in leagueRankings) {
      orderListByField(leagueRankings[league], "standings.leagueRank", "asc");
    }
    standings["league"] = leagueRankings;
  } 
  if ("group" in teams[0].standings && teams[0].standings.group !== null) {
    var groupRankings = {};
    // Build the grouping of group
    for (var team of teams) {
      const group = team.standings.group;
      if (!(group in groupRankings)) {
        groupRankings[group] = [];
      }
      groupRankings[group].push(team);
    }
    // Sort the group based on the groupRank
    for (var group in groupRankings) {
      orderListByField(groupRankings[group], "standings.groupRank", "asc");
    };
    standings["group"] = groupRankings;
  }
  
  // TODO: review if doing this without creating a new list screws up any existing one (mainly for MLB right now)  
  if (Object.keys(standings).length < 2) {
    if ("overallRank" in teams[0].standings) {
      orderListByField(teams, "standings.overallRank", "asc");
      standings["overall"] = {"Overall": teams};
    } else if ("rank" in teams[0].standings) {
      orderListByField(teams, "standings.rank", "asc");
      standings["overall"] = {"Overall": teams};
    }
  }
  return standings;
}

// shortDescription -> boolean to indicate whether or not to use the shorter version of bets/lines, such as o/u versus over/under
export function getGameMarketInfo(game, userAttributes, shortDescription, preferredProviders = []) {
  const lineFormat = getPreferredFormat(userAttributes);
  const gameMarkets = game.markets || {};
  const gameTotalMarket = gameMarkets["GAME_TOTAL"] || {};
  const mainLine = getMainLineBasedOnOccurrences(gameTotalMarket, preferredProviders)
  const mainBookOver = getBookEntryBasedOnBestOdds(gameTotalMarket.books, "over", mainLine, preferredProviders)
  const mainBookUnder = getBookEntryBasedOnBestOdds(gameTotalMarket.books, "under", mainLine, preferredProviders)
  const gameTotalBookOver = gameTotalMarket.books?.[mainBookOver]
  const gameTotalBookUnder = gameTotalMarket.books?.[mainBookUnder]
  
  const defaultMarketText = "--";
  var totalOverLineText = defaultMarketText;
  var totalOverOddsText = defaultMarketText;
  var totalUnderLineText = defaultMarketText;
  var totalUnderOddsText = defaultMarketText;
  // TODO extract this as function to do it based on outcome as a utility for over/under + value
  //  We could also extract a function for cover and cover + value
  if (gameTotalBookOver && gameTotalBookOver.over && gameTotalBookOver.over.current) {
    if (gameTotalBookOver.over.current.value) {
      totalOverLineText = `${shortDescription ? "o" : "Over "}${gameTotalBookOver.over.current.value}`
    }
    if (gameTotalBookOver.over.current.odds) {
      totalOverOddsText = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, gameTotalBookOver.over.current.odds));
    }
  }
  if (gameTotalBookUnder && gameTotalBookUnder.under && gameTotalBookUnder.under.current) {
    if (gameTotalBookUnder.under.current.value) {
      totalUnderLineText = `${shortDescription ? "u" : "Under "}${gameTotalBookUnder.under.current.value}`
    }
    if (gameTotalBookUnder.under.current.odds) {
      totalUnderOddsText = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, gameTotalBookUnder.under.current.odds));
    }
  }
  return {
    awayTeamData: {
      line: totalOverLineText,
      odds: totalOverOddsText,
      book: mainBookOver
    },
    homeTeamData: {
      line: totalUnderLineText,
      odds: totalUnderOddsText,
      book: mainBookUnder
    }
  }
}

export function getTeamMarketInfo(teamSplit, userAttributes, preferredProviders = []) {
  const lineFormat = getPreferredFormat(userAttributes);
  const teamMarkets = teamSplit.markets || {};
  const moneyMarket = teamMarkets["MONEY_LINE"] || {};
  const mainMoneyline = getMainLineBasedOnOccurrences(moneyMarket, preferredProviders)
  const bestMoneyBook = getBookEntryBasedOnBestOdds(moneyMarket.books, "cover", mainMoneyline, preferredProviders)
  const moneyBook = moneyMarket.books?.[bestMoneyBook]
  

  const defaultMarketText = "--";
  var moneyText = defaultMarketText;
  if (moneyBook && moneyBook.cover && moneyBook.cover.current && moneyBook.cover.current.odds) {
    moneyText = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, moneyBook.cover.current.odds));
  }

  const spreadMarket = teamMarkets["HANDICAP"] || teamMarkets["SPREAD"] || {};
  const mainSpreadLine = getMainLineBasedOnOccurrences(spreadMarket, preferredProviders)
  const bestSpreadBook = getBookEntryBasedOnBestOdds(spreadMarket.books, "cover", mainSpreadLine, preferredProviders)
  const spreadBook = spreadMarket.books?.[bestSpreadBook]
  var spreadLineText = defaultMarketText;
  var spreadOddsText = defaultMarketText;
  if (spreadBook && spreadBook.cover && spreadBook.cover.current) {
    if (spreadBook.cover.current.value) {
      spreadLineText = `${spreadBook.cover.current.value > 0 ? "+" : ""}${spreadBook.cover.current.value}`
    }
    if (spreadBook.cover.current.odds) {
      spreadOddsText = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, spreadBook.cover.current.odds));
    }
  }
  return {
    spread: {
      line: spreadLineText,
      odds: spreadOddsText,
      book: bestSpreadBook
    },
    moneyline: {
      odds: moneyText,
      book: bestMoneyBook
    }
  }
}

export const CURRENT_MATCHUPS = 'current';
export const UPCOMING_MATCHUPS = 'upcoming';