import { getBetslipCanonicalLegKey, getBetslipLegKey } from './betting-utils.js';
import { DEFAULT_LINE_FORMAT, AVAILABLE_LINE_FORMATS,
         ACCESS_LEVEL_SUPERUSER, ACCESS_LEVEL_FREE, ACCESS_LEVEL_TRIAL, ACCESS_LEVEL_PAID,
         FIELD_DECIMAL_PRECISION,
         PLAYER_BET_TYPE_ID_TO_NAME,
         getPlayerPropDefensiveTeamStatPath, 
         DEFAULT_MARKET_TEXT,
         DEFAULT_HIT_RECORD_ENTRY,
         SOCCER_LEAGUES,
         ALL_GAMES_FILTER_OPTION,
         ALL_BETS_MARKET_NAME,
         ALL_TRENDS_OPTION,
         RECENT_FORM_TREND_OPTION,
         HEAD_TO_HEAD_TREND_OPTION,
         HOME_AWAY_SPLIT_TREND_OPTION,
         OPPONENT_RANK_TREND_OPTION,
         PLAYER_BET_TYPES_REVERSE_MAPPING,
         SCREENER_ONLY_PROPS,
         TEAM_BET_TYPE_REVERSE_MAPPING,
         OVER_UNDER_FILTER,
         BET_TYPE_FILTER,
         TRENDS_FILTER,
         GAMES_FILTER,
         SCHEDULE_FORMAT_WEEKLY,
         FILTER_QUERY_PARAMETER_LOCATION_VALUE,
         SUPPORTED_LEAGUES,
         PARLAY_LEGS_COUNT_FILTER,
         PARLAY_LEGS_TYPE_FILTER,
         ALL_LEG_COUNTS_OPTION,
         CROSS_GAME_PARLAY,
         TEAM_BETS,
         INJURY_IMPACT_TREND_OPTION,
         STARTER_TREND_OPTION,
         BETTING_LEADERBOARD_TIMEFRAMES,
         SPORTSBOOKS_CONFIG,
         RECENT_FORM_SIGNAL_OPTION,
         HEAD_TO_HEAD_SIGNAL_OPTION,
         HOME_AWAY_SPLIT_SIGNAL_OPTION,
         OPPONENT_RANK_SIGNAL_OPTION,
         INJURY_IMPACT_SIGNAL_OPTION,
         STARTER_SIGNAL_OPTION,
         WEATHER_SIGNAL_OPTION,
         STARTING_PITCHER_SIGNAL_OPTION,
        } from './constants.js';
import {
    FILTER_KEYS,
    TREND_OPTION_KEYS,
    TREND_OPTION_LABELS,
    SIGNAL_OPTION_KEYS,
    SIGNAL_OPTION_LABELS,
    PARLAY_OPTION_KEYS,
    PARLAY_OPTION_LABELS,
    OUTCOME_OPTION_KEYS,
    OVER_UNDER_OPTION_LABELS,
    LINE_TYPE_OPTION_KEYS,
    LINE_TYPE_OPTION_LABELS,
    STRAIGHT_TREND_TYPE_OPTION_KEYS,
} from './filter-config.js';
import * as CoreUtils from './core-utils.js';
import { Buffer } from 'buffer';
import _, { groupBy } from 'lodash';

export function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// sleep time expects milliseconds
export function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

export function formatDate(date) {
  const parsedDate = parseDate(date);
  const day = String(parsedDate.day).padStart(2, '0');
  const month = String(parsedDate.month).padStart(2, '0');
  const year = parsedDate.year;
  const formattedDate = `${year}-${month}-${day}-${parsedDate.formattedTime}`;
  return formattedDate;
}

// TODO: review if the same can be used on native
export function getLocale() {
  return (new Intl.DateTimeFormat()).resolvedOptions().locale
}

// TODO: review if any of the individual formatting entries are needed, if we can instead rely on DateTimeFormat outputs all the time
// TODO: when we get to localizing app, review what is used where and try to reduce usage to format results of DateTimeFormat
export function parseDate(date) {
  const hours = ((date.getHours() + 11) % 12 + 1);
  const timePeriod = date.getHours() >= 12 ? "PM":"AM";
  const locale = getLocale();
  // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat#date-time_component_options
  //  for options
  const formattedTimeFormat = new Intl.DateTimeFormat(locale, {timeStyle: 'short'})
  const dayOfWeekShortFormat = new Intl.DateTimeFormat(locale, {weekday: 'short'})
  const dayOfWeekLongFormat = new Intl.DateTimeFormat(locale, {weekday: 'long'})
  return {
    date: date,
    seconds: date.getSeconds(),
    minutes: date.getMinutes(),
    hour: hours, // is this used anywhere?
    day: date.getDate(),
    month: date.getMonth() + 1, //January is 0!
    year: date.getFullYear(),
    yearShort: date.getFullYear() % 100,
    timePeriod: timePeriod, // TODO: is this used anywhere?
    formattedTime: formattedTimeFormat.format(date),
    formattedDayMonthShort: date.toLocaleString('defaut', {month: 'short'}) + " " + date.getDate(),
    formattedDayMonthLong: date.toLocaleString('defaut', {month: 'long'}) + " " + date.getDate(),
    formattedMonthShort: date.toLocaleString('defaut', {month: 'short'}),
    formattedMonthLong: date.toLocaleString('defaut', {month: 'long'}),
    dayOfWeek: date.getDay(),
    dayOfWeekShort: dayOfWeekShortFormat.format(date),
    dayOfWeekLong: dayOfWeekLongFormat.format(date),
    formattedLong: (new Intl.DateTimeFormat(locale, {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'})).format(date)
  }
}

export function parseDateFromString(dateString) {
  const date = new Date(dateString);
  return parseDate(date)
}

// Input is list of team objects from the API's /teams/ endpoint
export function buildTeamsMap(teamList) {
  var result = {};
  for (var team of teamList) {
    result[team.code] = team;
  }
  return result;
}

function formatRecordFromFields(record, fields) {
  return fields.map((field) => record?.[field] ?? 0).join('-');
}

function buildResultPrefix(gameRecord, drawField, drawLabel) {
  if (gameRecord.win === 1) {
    return 'W';
  }
  if (gameRecord.loss === 1) {
    return 'L';
  }
  if (drawField && gameRecord[drawField] === 1) {
    return drawLabel;
  }
  return 'L';
}

// Uses the team object from the API's /teams/ endpoint
export function getTeamRecord(team, league) {
  return buildStandingsRecordString(league, team?.standings)
}

export function getTeamRecordFromGames(games, league) {
  const config = SUPPORTED_LEAGUES[league]?.recordConfig;
  const drawsEnabled = !!config?.gameRecordDrawField;

  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const game of games) {
    if (game.win === 1) {
      wins++;
    } else if (game.loss === 1) {
      losses++;
    } else if (drawsEnabled && game[config.gameRecordDrawField] === 1) {
      draws++;
    }
  }

  return drawsEnabled ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
}

function toFixed(num, fixed) {
  var re = new RegExp('^-?\\d+(?:\.\\d{0,' + (fixed || -1) + '})?');
  return num.toString().match(re)[0];
}

// Will use a fixed number of decimal digits precision only if the original number is a decimal point number
// Integers will remain whole
export function decimalPrecision(number, decimalPlaces) {
  if (typeof number !== 'number') {
    return number;
  }
  if (number % 1 === 0) {
    //Integer
    return number;
  } else {
    //Floating point
    return number.toFixed(decimalPlaces);
    // return toFixed(number, decimalPlaces);
  }
}

export function decimalPrecisionWithPadding(number, decimalPlaces, keepTrailingZeros, keepLeadingZero) {
  if (number % 1 === 0) {
    //Integer, return as-is
    return number;
  }
  var result = decimalPrecision(number, decimalPlaces);
  if (!keepLeadingZero && result < 1) {
    result = result.toString().substr(1);
  }
  if (keepTrailingZeros) {
    result = result.toString().padEnd(3, "0");
  }
  return result;
}

export function getDictionaryValueWithPrecision(dict, key, defaultPrecision) {
  const { result, finalChunk } = getDictionaryValueRaw(dict, key);

  // It's not a number type but it could be cast as one, such as a string containing a number
  // Need to make an exception for things prefixed with a '+' for american odds to be kept as-is in string format for display purpose
  if (result != null && typeof result !== 'number' && isNum(result) && !result.startsWith("+")) {
    return Number(result);
  }

  // If the output is not a number don't bother with checking the precision.
  //  We have a check for that under decimalPrecision but that one can be used outside of here
  if (typeof result !== 'number') {
    return result;
  }

  var precision = defaultPrecision;
  if (finalChunk in FIELD_DECIMAL_PRECISION) {
    precision = FIELD_DECIMAL_PRECISION[finalChunk];
  }

  if (precision > 1) {
    // By default we'll say that if we want more precision points than 1 we should pad it up to that amount
    // For now will keep the leading zero, TBD if we want to remove it
    return decimalPrecisionWithPadding(result, precision, true, true);
  } else {
    return decimalPrecision(result, precision);
  }
}

export function getDictionaryValue(dict, key) {
  // Default to to 1 decimal point, this means anything that needs 1 decimal point doesn't need to be defined
  return getDictionaryValueWithPrecision(dict, key, 1)
}

// TODO: support the key being a list and then iterate through it
export function  getDictionaryValueRaw(dict, key) {
  return CoreUtils.getDictionaryValueRaw(dict, key)
}

export function getDictionaryValueRawResult(dict, key) {
  return CoreUtils.getDictionaryValueRawResult(dict, key);
}

export function base64Encode(data) {
  return Buffer.from(data).toString("base64");
}

// TODO: here an integer value of 0 doesn't get set which we should fix
// Need to differentiate between 0 and null/undefined
export function buildQueryParams(dict) {
  // The null check is a bit of a hack/workaround from the back-end giving a null value for a filter, meaning don't specify any input for that field
  return Object.keys(dict).filter(key => dict[key] && dict[key] !== "null").map((key) => key + "=" + encodeURIComponent(dict[key])).join("&")
  //return Buffer.from(JSON.stringify(dict)).toString("base64");
}

// Sorts a list of object by the value of one of the members
// list: the original list of objects to sort
// field: the field name within the object where the data is to be compared
//        this can be a composite field which 'getDictionaryValue' can find
// order: asc/desc string value to indicate the order
export function orderListByField(list, field, order) {
  //console.log(`Ordering list: {list: ${list}, field: ${field}, order: ${order}}`);
  list.sort(
    function (a, b) {
      if (order.toLowerCase() === "asc") {
        return getDictionaryValue(a, field) - getDictionaryValue(b, field);
      }
      if (order.toLowerCase() === "desc") {
        return getDictionaryValue(b, field) - getDictionaryValue(a, field);
      }
    }
  );
  return list;
}

export function isDictEmpty(dict) {
  return dict === null || typeof dict === 'undefined' || Object.keys(dict).length === 0;
}


export function validateEmail(email) {
  const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(email).toLowerCase());
}


export function isAlphaNumeric(str) {
  var code, i, len;

  for (i = 0, len = str.length; i < len; i++) {
    code = str.charCodeAt(i);
    if (!(code > 47 && code < 58) && // numeric (0-9)
        !(code > 64 && code < 91) && // upper alpha (A-Z)
        !(code > 96 && code < 123)) { // lower alpha (a-z)
      return false;
    }
  }
  return true;
}

export function containsUppercase(str) {
  var code, i, len;

  for (i = 0, len = str.length; i < len; i++) {
    code = str.charCodeAt(i);
    // upper alpha (A-Z))
    if (code > 64 && code < 91) {
      return true;
    }
  }
  return false;
}

export function containsLowercase(str) {
  var code, i, len;

  for (i = 0, len = str.length; i < len; i++) {
    code = str.charCodeAt(i);
    // upper alpha (A-Z))
    if (code > 96 && code < 123) {
      return true;
    }
  }
  return false;
}

export function containsSpecialCharacter(str) {
  return /(.*[!@#$%^&*].*)/.test(str);
}

export function containsNumber(str) {
  return /\d/.test(str);
}

// Credit to Jon Kantner @ https://css-tricks.com/converting-color-spaces-in-javascript/
export function hexToHSL(H) {
  // Convert hex to RGB first
  let r = 0, g = 0, b = 0;
  if (H.length === 4) {
    r = "0x" + H[1] + H[1];
    g = "0x" + H[2] + H[2];
    b = "0x" + H[3] + H[3];
  } else if (H.length === 7) {
    r = "0x" + H[1] + H[2];
    g = "0x" + H[3] + H[4];
    b = "0x" + H[5] + H[6];
  }
  // Then to HSL
  r /= 255;
  g /= 255;
  b /= 255;
  let cmin = Math.min(r,g,b),
      cmax = Math.max(r,g,b),
      delta = cmax - cmin,
      h = 0,
      s = 0,
      l = 0;

  if (delta === 0)
    h = 0;
  else if (cmax === r)
    h = ((g - b) / delta) % 6;
  else if (cmax === g)
    h = (b - r) / delta + 2;
  else
    h = (r - g) / delta + 4;

  h = Math.round(h * 60);

  if (h < 0)
    h += 360;

  l = (cmax + cmin) / 2;
  s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  s = +(s * 100).toFixed(1);
  l = +(l * 100).toFixed(1);

  // return "hsl(" + h + "," + s + "%," + l + "%)";
  return {
    h: h,
    s: s,
    l: l
  }
}

export function fadeHSLColor(h, s, l) {
  return {
    h: h,
    s: (s * 0.45),
    l: (l * 1.40)
  }
}

//https://stackoverflow.com/a/44134328
export function hslToHex(h, s, l) {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');   // convert to Hex and prefix "0" if needed
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function buildOpponentList(currentTeam, allTeams) {
  return allTeams.filter((value) => {return value !== currentTeam});
}

//https://stackoverflow.com/a/13627586
export function addOrdinalNumberSuffix(number) {
  var j = number % 10,
  k = number % 100;
  if (j == 1 && k != 11) {
    return number + "st";
  }
  if (j == 2 && k != 12) {
    return number + "nd";
  }
  if (j == 3 && k != 13) {
    return number + "rd";
  }
  return number + "th";
}

export function addPluralSuffixIfNecessary(number, word) {
  if (number === 1) {
    return `${number} ${word}`
  }
  return `${number} ${word}s`
}

// Assumes a dictionary with the standard linemate Game response object as input as well as the abbreviated team code
export function isHomeGame(game, teamCode) {
  if (game.homeTeamCode === teamCode.toUpperCase()) {
    return true;
  }
  return false;
}

export function getOpposingTeamCode(game, teamCode) {
  if (game.homeTeamCode === teamCode.toUpperCase()) {
    return game.awayTeamCode;
  }
  return game.homeTeamCode;
}

export function stringPresent(str) {
  return str !== null && str !== "";
}

export function mergeSubDictionaries(dict) {
  var mergedDict = {};
  Object.keys(dict).map((key) => {
    mergedDict = Object.assign(mergedDict, dict[key]);
  });
  return mergedDict;
}

export function shouldBlockUserAccess(userAttributes) {
  // return isDictEmpty(userAttributes) || userAttributes.accessLevel === 1;
  // return isDictEmpty(userAttributes);
  return false;
}

export function isGuest(userAttributes) {
  return userAttributes === null || isDictEmpty(userAttributes);
}

export function isFreeUser(userAttributes) {
  return !isGuest(userAttributes) && userAttributes.accessLevel === ACCESS_LEVEL_FREE;
}

export function isTrialUser(userAttributes) {
  return !isGuest(userAttributes) && userAttributes.accessLevel === ACCESS_LEVEL_TRIAL;
}

export function isPaidUser(userAttributes) {
  return !isGuest(userAttributes) && userAttributes.accessLevel === ACCESS_LEVEL_PAID;
}

export function isSuperUser(userAttributes) {
  return !isGuest(userAttributes) && userAttributes.accessLevel === ACCESS_LEVEL_SUPERUSER;
}

export function hasPremiumAccess(userAttributes) {
  return isTrialUser(userAttributes) || isPaidUser(userAttributes) || isSuperUser(userAttributes);
}

export function isIterable(obj) {
  // checks for null and undefined
  if (obj == null) {
    return false;
  }
  return typeof obj[Symbol.iterator] === 'function';
}

export function isFieldEmpty(value) {
  return value === null || value === "" || value === "undefined";
}

export function redirectEvent(event) {
  redirect(event.currentTarget.dataset.endpoint);
}

export function redirect(endpoint) {
  window.location.href = endpoint;
}

export function isNum(value) {
  return !isNaN(value);
}

export function getPlayerLeaderStats(league, player) {
  return SUPPORTED_LEAGUES[league]?.playerLeaderConfig?.getStats?.(player) || {};
}

// TODO: can we remove this -> no it's used in web for the modal, though we should see if we can discontinue that
// TODO: for NHL and NFL we could get the leaders for all positions/positionGroups in one API call and split them up after on the client side
// Alternatively, we could fetch the per-position or per-position group leaders on demand if this is too slow
export function fetchPlayerLeaders(host, league, inputState, setStateFn) {
  const config = SUPPORTED_LEAGUES[league]?.playerLeaderConfig;
  if (!config) {
    return;
  }

  const baseUrl = `${host}/api/${league}/v1/players/leaders`;
  const groups = config.groups || ["ALL"];

  const requests = groups.map((group) => {
    if (config.fetchMode === "position") {
      return fetch(`${baseUrl}?position=${group}`).then((data) => data.json());
    }
    if (config.fetchMode === "positionGroup") {
      return fetch(`${baseUrl}?positionGroup=${group}`).then((data) => data.json());
    }
    return fetch(baseUrl).then((data) => data.json());
  });

  Promise.all(requests).then((result) => {
    inputState.playerLeaders = Object.fromEntries(
      groups.map((group, index) => [group, result[index]])
    );
    setStateFn(inputState);
  });
}

// TODO: can we remove
export function getLeaguePlayerLeaders(leaders, league, player) {
  const config = SUPPORTED_LEAGUES[league]?.playerLeaderConfig;
  if (!config) {
    return {};
  }

  const group = config.resolveGroup?.(player) || "ALL";
  return leaders[group] || {};
}

export function getPlayerBirthplace(player) {
  if (player.info.birthPlace !== null) {
    return player.info.birthPlace;
  }
  if (player.info.birthCity === null && player.info.birthCountry) {
    return "";
  }
  if (player.info.birthCity !== null) {
    return player.info.birthCity;
  }
  if (player.info.birthCountry !== null) {
    return player.info.birthCountry;
  }
}

export function getPreferredFormat(userAttributes) {
  var format = DEFAULT_LINE_FORMAT;
  if (userAttributes && userAttributes.preferredOddsFormat && AVAILABLE_LINE_FORMATS.includes(userAttributes.preferredOddsFormat.toLowerCase())) {
    format = userAttributes.preferredOddsFormat.toLowerCase();
  }
  return format;
}

// Mostly used for game odds which is a dict
export function getFormattedOdds(userAttributes, odds) {
  const format = getPreferredFormat(userAttributes);
  return Object.assign({format: format}, odds[format]);
}

// Mostly used for player props which is a single value
export function getFormattedOddValue(userAttributes, odds) {
  const format = getPreferredFormat(userAttributes);
  return odds?.[format] || "";
}

// Replacement of the above 'getFormattedOddValue' as we try to deprecate it
// If formatted=true it will format the odds to be display-ready. Positive american odds will have the '+' sign, decimal odds will have the decimal fixed to 2 placed, etc.
// If formatted=false it will return them raw as-is from the back-end
export function getPreferredOdds(userAttributes, odds, formatted) {
  if (!odds) {
    return null;
  }
  const format = getPreferredFormat(userAttributes);
  if (formatted) {
    return formatOdds(format, odds[format])
  }
  return odds[format];
}

// Technically incorrect to call this the line value since it's the odds, not the line, but we'll leave it for now until we find a better name
// 'getFormattedOddValue' is already used so we would have to re-name that one first
export function getFormattedLineValue(format, value) {
  switch(format) {
    case "american":
      if (value > 0) {
        return `+${value}`
      } else {
        return value;
      }
    case "decimal":
      return value.toFixed(2);
    case "fractional":
      return value;
    default:
      return value;
  }
}

// Replacement of the above 'getFormattedLineValue' as we try to deprecate it
export function formatOdds(format, odds) {
  if (!odds) return odds;
  switch(format) {
    case "american":
      if (odds > 0) {
        return `+${odds}`
      } else {
        return odds;
      }
    case "decimal":
      return odds.toFixed(2);
    case "fractional":
    default:
      return odds;
  }
}

export function convertAmericanToDecimal(american) {
  if (american > 0) {
    return (american / 100) + 1;
  } else if (american < 0) {
    return 1 - (100 / american);
  } else {
    return 0;
  }
}

export function convertFractionalToDecimal(fractional) {
  const numerator = Number(fractional.split("/")[0]);
  const denominator = Number(fractional.split("/")[1]);
  return 1 + (numerator / denominator);
}

export function convertDecimalToAmerican(decimal) {
  if (1.0 < decimal && decimal < 2) {
    return Math.round(-100 / (decimal - 1))
  }
  else if (decimal >= 2.0) {
    return Math.round((decimal - 1) * 100)
  }
  // Will return 0 by default
  return 0
}

export function convertDecimalToFractional(decimal) {
  return `${Math.round((decimal - 1) * 100)}/${100}`
}

// Gradually moving to support all in lowercase as a normalized id
// Once we give it enough time and we think users have all adoped the version which supports both we can update back-end to use all lowercase
// The display name of the book will then be dependent on a separate configuration
// TODO: change this to be similar to what we have in python where it's just a list to check in order 
// TODO; also add new books (bet365 and maybe anything else that we're gonna get from optic)
//  dabble comes to mind
//  underdog
//  prizepicks
//  tbd
export function getBookEntryBasedOnPrecedence(books) {
  // const ordered_books_list = ["FanDuel", "DraftKings", "Caesars", "BetMGM", "Sleeper", "PointsBet", "sportsbet", "tab"]
  // for book_name in ordered_books_list:
  //     book = next((x for x in market['books'].keys() if x == book_name), None)
  //     if book is not None and market['books'][book] is not None:
  //         return book
  // return None
  if (!books) {
    return {};
  }
  if (books['FanDuel']) {
    return books['FanDuel'];
  }
  if (books['fanduel']) {
    return books['fanduel'];
  }
  if (books['DraftKings']) {
    return books['DraftKings'];
  }
  if (books['draftkings']) {
    return books['draftkings'];
  }
  if (books['Caesars']) {
    return books['Caesars'];
  }
  if (books['caesars']) {
    return books['caesars'];
  }
  if (books['BetMGM']) {
    return books['BetMGM'];
  }
  if (books['betmgm']) {
    return books['betmgm'];
  }
  if (books['PointsBet']) {
    return books['PointsBet'];
  }
  if (books['pointsbet']) {
    return books['pointsbet'];
  }
  if (books['Sleeper']) {
    return books['Sleeper'];
  }
  if (books['sleeper']) {
    return books['sleeper'];
  }
  if (books['sportsbet']) {
    return books['sportsbet'];
  }
  if (books['tab']) {
    return books['tab'];
  }
  if (books['unibet']) {
    return books['unibet'];
  }
  if (books['prizepicks']) {
    return books['prizepicks'];
  }
  return {};
}

// TODO: fallback on country preferences
export function getBookEntryBasedOnBestOdds(books, outcome, line, preferredProviders, alternate) {
  var bestBook = null
  var bestOdds = null

  // Need to differentiate between true, false and null/undefined since we have uses cases where we want to still allow checking against both main and alt
  // At the time of writing that's used for the workstation lines
  // Make sure to keep double equals instead of triple equals to treat null and undefined the same way
  const isMainAllowed = alternate == null || !alternate
  const isAltAllowed = alternate == null || alternate
  
  for (let bookId in books) {
    if (preferredProviders && preferredProviders.length > 0 && !preferredProviders.includes(bookId)) {
      continue
    }
    var odds = null
    if (isMainAllowed && books[bookId]?.[outcome]?.current?.value === line) {
      odds = books[bookId]?.[outcome]?.current?.odds?.decimal
    } else if (isAltAllowed) {
      const alternateOutcome = Object.values(books[bookId]?.[outcome]?.alternates || {}).find(x => x?.value === line)
      if (!alternateOutcome) {
        continue
      }
      odds = alternateOutcome?.odds?.decimal
    } else {
      continue
    }
    if (bestOdds === null || odds > bestOdds) {
      bestBook = bookId
      bestOdds = odds
    }
  }
  return bestBook
}

export function getPlayerName(player) {
  // if (isDictEmpty(player) || isDictEmpty(player.info)) {
  //   return "";
  // }
  // return `${player.info.firstName.charAt(0)}. ${player.info.lastName}`;
  if (isDictEmpty(player)) {
    return '';
  }
  // Supports passing in either the player record or the playerInfo
  const playerInfo = 'info' in player ? player.info : player;
  if ('firstName' in playerInfo && playerInfo.firstName && playerInfo.firstName.trim() !== '' &&
      'lastName' in playerInfo && playerInfo.lastName && playerInfo.lastName.trim() !== '') {
    return `${playerInfo.firstName.charAt(0)}. ${playerInfo.lastName}`
  }
  if ('fullName' in playerInfo && playerInfo.fullName && playerInfo.fullName.trim() !== '') {
    return playerInfo.fullName;
  }
  return '';
}

export function getPlayerPosition(player, includeHandedness) {
  if (isDictEmpty(player) || !('info' in player) || !('position' in player.info)) {
    return "";
  }
  var position = player.info.position;
  // This only applies to MLB
  if (includeHandedness) {
    if ((player.info.position === "P" || player.info.position === "SP" || player.info.position === "RP") && 'pitchingHand' in player.info) {
      position += ` [${player.info.pitchingHand}H]`;
    } else if ('battingHand' in player.info) {
      position += ` [${player.info.battingHand}H]`;
    }
  }
  return position;
}

export function getFullPlayerName(player) {
  if (isDictEmpty(player) || isDictEmpty(player.info)) {
    return "";
  }
  
  var playerNameParts = [];
  if (player.info.preferredName) {
    playerNameParts.push(player.info.preferredName);
  } else if (player.info.firstName) {
    playerNameParts.push(player.info.firstName);
  }
  if (player.info.lastName) {
    playerNameParts.push(player.info.lastName);
  }

  const name = playerNameParts.join(" ");
  if (name.trim() === "") {
    return getPlayerFullDisplayName(player.info)
  }
  return name;
}

export function getPlayerFullDisplayName(playerInfo) {
  if ('firstName' in playerInfo && playerInfo.firstName && playerInfo.firstName.trim() !== '' &&
      'lastName' in playerInfo && playerInfo.lastName && playerInfo.lastName.trim() !== '') {
    return `${playerInfo.firstName} ${playerInfo.lastName}`
  }
  if ('fullName' in playerInfo && playerInfo.fullName && playerInfo.fullName.trim() !== '') {
    return playerInfo.fullName;
  }
  return '';
}

export function horizontalScrollHandler(parentSelector, leftButtonClass, rightButtonClass) {
  const element = document.querySelector(parentSelector);
  if (element.scrollLeft === 0) {
      // Remove left indicator
      document.querySelector(`.${leftButtonClass}`).style.display = 'none';
  } else {
      // Put back left indicator
      document.querySelector(`.${leftButtonClass}`).style.display = 'block';
  }
  if (element.offsetWidth + element.scrollLeft >= element.scrollWidth) {
      // Remove right indicator
      document.querySelector(`.${rightButtonClass}`).style.display = 'none';
  } else {
      // Put back right indicator
      document.querySelector(`.${rightButtonClass}`).style.display = 'block';
  }
}

export function getMultiFieldValue(dictionary, fields) {
  return getMultiFieldValueWithPrecision(dictionary, fields, 1)
}

export function getMultiFieldValueWithPrecision(dictionary, fields, defaultPrecision) {
  var value = 0;
  fields.map((field) => {
    // Need to wrap in Number cast because it can return a string from the decimal precision with padding (not ideal but should work)
    value += Number(getDictionaryValueWithPrecision(dictionary, field, defaultPrecision));
  })
  // This is a pretty bad hack but I don't know how else to fix it quickly without refactoring a bunch of shit
  // Going to use the getDictionaryValue internal mechanism to get the right decimal points but we're going to use the last field's decimal precision
  var tempDictionary = {};
  // Array.at() is not supported in Safari until early to mid 2022 which at the
  //  time of writing this is very recent, meaning there's a good chance some
  //  users won't have updated to that version yet and get errors
  // It is the cleaner option so we should consider switching back to it at some
  //  point or extend the Array prototype to include similar functionality
  //var key = fields.at(-1);
  var key = fields[fields.length - 1];
  if (key.includes(".")) {
    const keySplit = key.split(".");
    key = keySplit[keySplit.length - 1];
  }
  tempDictionary[key] = value;
  value = getDictionaryValueWithPrecision(tempDictionary, key, defaultPrecision);
  if (isNaN(value)) {
    return 0;
  }
  return value;
}

// gameRecord should be a player game record, we can only re-use this for team if we add score and opposingScore to the team game record
export function getGameResultText(league, gameRecord) {
  const config = SUPPORTED_LEAGUES[league].recordConfig;
  if (!config) {
    return "";
  }

  return `${buildResultPrefix(gameRecord, config.gameRecordDrawField, config.gameRecordDrawLabel)} · ${gameRecord.score}-${gameRecord.opposingScore}`;
}

export function getTeamGameResultText(league, gameRecord) {
  const config = SUPPORTED_LEAGUES[league]?.recordConfig;
  if (!config) {
    return "";
  }

  const stat = config.scoreStat;
  return `${buildResultPrefix(gameRecord, config.gameRecordDrawField, config.gameRecordDrawLabel)} · ${gameRecord.cumulativeStats.offensive[stat]}-${gameRecord.cumulativeStats.defensive[stat]}`;
}

export function getRegionAffiliateTitle(regionCode, regionName) {
  // Once we have more territories with restrictions on advertising we should set this to check in a list of those who are restrictive
  if (regionCode === "CA-ON" || regionCode === "CA-AB" || regionCode.startsWith('AU')) {
    return `${regionName} Partners`
  }
  return `${regionName} Bonuses`
}

export function getAffiliateTitle(regionCode, country, t) {
  return getNamedAffiliateTitle(regionCode, country, t, "common.bonuses");
}

export function getOffersAffiliateTitle(regionCode, country, t) {
  return getNamedAffiliateTitle(regionCode, country, t, "home.sections.offers");
}

function getNamedAffiliateTitle(regionCode, country, t, defaultValue) {
  // Once we have more territories with restrictions on advertising we should set this to check in a list of those who are restrictive
  if (regionCode && (regionCode === "CA-ON" || regionCode === "CA-AB" || regionCode.startsWith("AU"))) {
    return t("home.sections.partners");
  }
  if (country && country === "AU") {
    return t("home.sections.partners");
  }
  return t(defaultValue);
}

export function safe(promise) {
  return promise.catch(error => {
    console.log(error);
    console.log(error.stack);
  });
}

export function buildTeamPropRankings(teams, league) {
  var result = {};
  Object.keys(PLAYER_BET_TYPE_ID_TO_NAME[league]).map((propID) => {
      const propMapping = getPlayerPropDefensiveTeamStatPath[league](propID);
      const fields = propMapping.defensiveTeamFields;
      if (fields && fields.length > 0) {
        // Creating a local copy of the teams list
        var localTeams = teams.map(a => ({...a}));
        // Need to iterate to build the value since we have props with multiple fields
        localTeams.map((team) => {
            var value = 0;
            fields.map((field) => {
                value += getDictionaryValue(team, `${field}`);
            })
            team.propValue = value;
        })
        // console.log(localTeams);
  
        // prop -> teamRankMapping
        // teamRankMapping: team -> rank
        var teamRankMapping = {};
        // TODO: add a custom order, for now we will do ASC (lower is better)
        //  This should be updated for stuff like defensive interceptions being better
        // TODO: we could also look into re-using the existing order defined in other places
        // TODO: review block for NBA (I think the defensive blocks for NBA team is the amount of blocks they have had, so the offensive.blocks for team is what the player is going against I think)
        orderListByField(localTeams, 'propValue', propMapping.defensiveSortingOrder);
        localTeams.map((team, index) => {
            teamRankMapping[team.code] = index + 1;
        })
        result[propID] = teamRankMapping
      }
  })
  return result;
}

export function range(size, start, increment) {
  return [...Array(size).keys()].map(i => (i * increment) + start);
}

export function closestMultipleCeil(input, multiple) {
  return multiple * Math.ceil(input/multiple);
}

export function closestMultipleFloor(input, multiple) {
  return multiple * Math.floor(input/multiple);
}

// The double negative is to cover cases where the input is undefined
export function fetchPlayerRecord(host, league, id, includeMarkets) {
  return fetch(`${host}/api/${league}/v4/players/${id}?includeMarkets=${!!includeMarkets}`).then(response => response.status === 200 ? response.json() : null);
}

export function fetchBaseballPitcherMatchupRecord(host, league, batterId, pitcherId) {
  return fetch(`${host}/api/${league}/v4/players/${batterId}/pitcherMatchupsRecord?againstPitcherId=${pitcherId}`).then(response => jsonOrDefault(response, null)).catch(console.error)
}

export function fetchBaseballPitcherMatchups(host, league, batterId, pitcherId) {
  return fetch(`${host}/api/${league}/v4/players/${batterId}/pitcherMatchups?againstPitcherId=${pitcherId}`).then(response => jsonOrDefault(response, [])).catch(console.error)
}

// Situation means either "current" or "opening"
export function buildGameMarketStructure(game, market, userAttributes, situation) {
  const lineFormat = getPreferredFormat(userAttributes);
  const targetMarkets = game.markets || {};
  const targetMarket = targetMarkets[market] || {};
  const targetMarketBook = getBookEntryBasedOnPrecedence(targetMarket.books);

  const defaultMarketText = DEFAULT_MARKET_TEXT;
  var totalOverLineText = defaultMarketText;
  var totalOverLine = defaultMarketText;
  var totalOverOddsText = defaultMarketText;
  var totalUnderLineText = defaultMarketText;
  var totalUnderLine = defaultMarketText;
  var totalUnderOddsText = defaultMarketText;
  if (targetMarketBook && targetMarketBook.over && targetMarketBook.over[situation]) {
    if (targetMarketBook.over[situation].value) {
      totalOverLineText = `${"over".charAt(0)}${targetMarketBook.over[situation].value}`
      totalOverLine = targetMarketBook.over[situation].value;
    }
    if (targetMarketBook.over[situation].odds) {
      totalOverOddsText = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, targetMarketBook.over[situation].odds));
    }
  }
  if (targetMarketBook && targetMarketBook.under && targetMarketBook.under[situation]) {
    if (targetMarketBook.under[situation].value) {
      totalUnderLineText = `${"under".charAt(0)}${targetMarketBook.under[situation].value}`
      totalUnderLine = targetMarketBook.under[situation].value;
    }
    if (targetMarketBook.under[situation].odds) {
      totalUnderOddsText = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, targetMarketBook.under[situation].odds));
    }
  }
  return {
    over: {
      line: totalOverLine,
      formattedLine: totalOverLineText,
      odds: totalOverOddsText
    },
    under: {
      line: totalUnderLineText,
      formattedLine: totalUnderLine,
      odds: totalUnderOddsText
    }
  }
}

// Situation means either "current" or "opening"
export function buildTeamMarketStructure(teamData, market, userAttributes, situation) {
  const teamMarkets = teamData.markets || {};
  const defaultMarketText = DEFAULT_MARKET_TEXT;
  const lineFormat = getPreferredFormat(userAttributes);

  const targetMarket = teamMarkets[market] || {};
  const targetBook = getBookEntryBasedOnPrecedence(targetMarket.books);
  // over/under markets such as total, we can re-use the game function (which maybe we should rename to over/under market structure)
  if (targetBook && (targetBook.over || targetBook.under)) {
    return buildGameMarketStructure(teamData, market, userAttributes, situation);
  }

  const result = {
    cover: {
      line: defaultMarketText,
      formattedLine: defaultMarketText,
      odds: defaultMarketText
    },
    draw: {
      line: defaultMarketText,
      formattedLine: defaultMarketText,
      odds: defaultMarketText
    }
  }

  const targets = ["cover", "draw"]
  targets.forEach((target) => {
    // Cover markets such as moneyline and spread
    if (targetBook && target in targetBook && targetBook[target] && situation in targetBook[target] && targetBook[target][situation]) {
      const situationalTarget = targetBook[target][situation];
      if (situationalTarget.odds) {
        result[target].odds = getFormattedLineValue(lineFormat, getFormattedOddValue(userAttributes, situationalTarget.odds));
      }
      // A cover with a line value, such as spread
      if (situationalTarget.value) {
        result[target].line = situationalTarget.value;
        result[target].formattedLine = `${situationalTarget.value > 0 ? "+" : ""}${situationalTarget.value}`;
      } else {
        // A cover without a line such as moneyline, nothing to do
      }
    }
  })

  return result
}

export function buildStandingsRecordString(league, standings) {
  const fields = SUPPORTED_LEAGUES[league]?.recordConfig?.standingsFields || ['wins', 'losses'];
  return formatRecordFromFields(standings || {}, fields);
}

export function formatStandingsStreak(league, streak) {
  if (!streak || !streak.type || !SUPPORTED_LEAGUES[league].recordConfig) {
    return "";
  }
  return `${streak.type.charAt(0).toUpperCase()}${streak.length}`;
}

export function getMatchupTeamGameRecords(host, league, teamId, opposingTeamCode, currentSeason) {
  return fetch(`${host}/api/${league}/v3/teams/${teamId}/games?&opponent=${opposingTeamCode}&sortingOrder=DESC&timeframe=RANGE_${currentSeason - 2}_${currentSeason}`).then(response => response.json())
}

export function getTeamAverages(host, league) {
  return fetch(`${host}/api/${league}/v1/teams/averages`).then(response => response.json());
}

export function getLast5TeamGameRecords(host, league, teamId) {
  return fetch(`${host}/api/${league}/v3/teams/${teamId}/games?timeframe=LAST_5&sortingOrder=DESC`).then(response => response.json());
}

export function getCombinedStandings(league, teamGameRecords) {
  const config = SUPPORTED_LEAGUES[league]?.recordConfig;
  if (!config) {
    return {};
  }

  const result = Object.fromEntries(config.standingsFields.map((field) => [field, 0]));

  for (const game of teamGameRecords) {
    result.wins += game.win || 0;
    result.losses += game.loss || 0;

    if (config.gameRecordDrawField === 'tie') {
      result.ties += game.tie || 0;
    } else if (config.gameRecordDrawField === 'overtimeLoss') {
      result.overtimeLosses += game.overtimeLoss || 0;
    } else if (config.gameRecordDrawField === 'draw') {
      result.draws += game.draw || 0;
    }
  }

  return result;
}

export function getCombinedStandingsGraphDictionary(league, teamGameRecords) {
  const config = SUPPORTED_LEAGUES[league]?.recordConfig;
  const combinedStandings = getCombinedStandings(league, teamGameRecords);

  if (!config) {
    return {};
  }

  if (config.graphKeys.join(',') === 'W,L') {
    return { W: combinedStandings.wins, L: combinedStandings.losses };
  }
  if (config.graphKeys.join(',') === 'W,L,T') {
    return { W: combinedStandings.wins, L: combinedStandings.losses, T: combinedStandings.ties };
  }
  if (config.graphKeys.join(',') === 'W,L,OTL') {
    return { W: combinedStandings.wins, L: combinedStandings.losses, OTL: combinedStandings.overtimeLosses };
  }
  return { W: combinedStandings.wins, L: combinedStandings.losses, D: combinedStandings.draws };
}

export function getCombinedHitRecords(teamGameRecords) {
  return teamGameRecords.map(record => record.hitRecords).reduce((previous, current) => {
      return {
        againstTheSpread: combineHitRecordEntries(previous.againstTheSpread, current.againstTheSpread),
        awayAgainstTheSpread: combineHitRecordEntries(previous.awayAgainstTheSpread, current.awayAgainstTheSpread),
        awayTotalOver: combineHitRecordEntries(previous.awayTotalOver, current.awayTotalOver),
        homeAgainstTheSpread: combineHitRecordEntries(previous.homeAgainstTheSpread, current.homeAgainstTheSpread),
        homeTotalOver: combineHitRecordEntries(previous.homeTotalOver, current.homeTotalOver),
        totalOver: combineHitRecordEntries(previous.totalOver, current.totalOver)
      }
    },
    {
      againstTheSpread: DEFAULT_HIT_RECORD_ENTRY,
      awayAgainstTheSpread: DEFAULT_HIT_RECORD_ENTRY,
      awayTotalOver: DEFAULT_HIT_RECORD_ENTRY,
      homeAgainstTheSpread: DEFAULT_HIT_RECORD_ENTRY,
      homeTotalOver: DEFAULT_HIT_RECORD_ENTRY,
      totalOver: DEFAULT_HIT_RECORD_ENTRY
    }
  )
}

export function combineHitRecordEntries(entry1, entry2) {
  return {
    games: entry1.games + entry2.games,
    hits: entry1.hits + entry2.hits,
    misses: entry1.misses + entry2.misses,
    pushes: entry1.pushes + entry2.pushes,
    hitRate: entry1.games + entry2.games === 0 ? 0 : ((entry1.hits + entry2.hits) / (entry1.games + entry2.games)) * 100
  }
}

export function getPlayersToWatch(host, league, teamCode, opposingTeamCode) {
  return fetch(`${host}/api/${league}/v1/players/forPlaybookComparison?teamCode=${teamCode}&opponent=${opposingTeamCode}`).then(response => response.json());
}

export function buildPlayersToWatchSections(league, awayPlayers, homePlayers) {
  switch(league) {
    case "mlb":
      return {
        "Player Stat": {
          stats: {
            "cumulativeStats": {
              "AB": "cumulativeStats.hitting.atBats",
              "R": "cumulativeStats.hitting.runs",
              "H": "cumulativeStats.hitting.hits",
              "1B": "cumulativeStats.hitting.singles",
              "2B": "cumulativeStats.hitting.doubles",
              "3B": "cumulativeStats.hitting.triples",
              "HR": "cumulativeStats.hitting.homeRuns",
              "ISO": "cumulativeStats.hitting.isolatedPower",
              "RBI": "cumulativeStats.hitting.runsBattedIn",
              "TB": "cumulativeStats.hitting.totalBases",
              "BB": "cumulativeStats.hitting.walks",
              "SO": "cumulativeStats.hitting.strikeouts",
              "AVG": "cumulativeStats.hitting.battingAverage",
              "OBP": "cumulativeStats.hitting.onBasePercentage",
              "SLG": "cumulativeStats.hitting.sluggingPercentage",
              "OPS": "cumulativeStats.hitting.onBasePlusSluggingPercentage"
            }, 
            "averageStats": {
              "AB": "averageStats.hitting.atBats",
              "R": "averageStats.hitting.runs",
              "H": "averageStats.hitting.hits",
              "1B": "averageStats.hitting.singles",
              "2B": "averageStats.hitting.doubles",
              "3B": "averageStats.hitting.triples",
              "HR": "averageStats.hitting.homeRuns",
              "ISO": "averageStats.hitting.isolatedPower",
              "RBI": "averageStats.hitting.runsBattedIn",
              "TB": "averageStats.hitting.totalBases",
              "BB": "averageStats.hitting.walks",
              "SO": "averageStats.hitting.strikeouts",
              "AVG": "averageStats.hitting.battingAverage",
              "OBP": "averageStats.hitting.onBasePercentage",
              "SLG": "averageStats.hitting.sluggingPercentage",
              "OPS": "averageStats.hitting.onBasePlusSluggingPercentage"
            }
          },
          awayPlayers: awayPlayers, 
          homePlayers: homePlayers
        }
      };
    case "nba":
    case "wnba":
    case "ncaab":
      return {
        "Player Stat": {
          stats: {
            "cumulativeStats": {
              "PTS": "cumulativeStats.points",
              "FT%": "cumulativeStats.freeThrowPercentage",
              "FG%": "cumulativeStats.fieldGoalPercentage",
              "3PT%": "cumulativeStats.threePointPercentage",
              "REB": "cumulativeStats.rebounds",
              "AST": "cumulativeStats.assists",
              "STL": "cumulativeStats.steals",
              "BLK": "cumulativeStats.blocks"
            }, 
            "averageStats": {
              "PTS": "averageStats.points",
              "FT%": "averageStats.freeThrowPercentage",
              "FG%": "averageStats.fieldGoalPercentage",
              "3PT%": "averageStats.threePointPercentage",
              "REB": "averageStats.rebounds",
              "AST": "averageStats.assists",
              "STL": "averageStats.steals",
              "BLK": "averageStats.blocks"
            }
          },
          awayPlayers: awayPlayers, 
          homePlayers: homePlayers
        }
      };
    case "nhl":
      const awaySkaters = {};
      const awayGoalies = {};

      const homeSkaters = {};
      const homeGoalies = {};
      Object.keys(awayPlayers).forEach((timeframe) => {
        const awayPlayersInternal = awayPlayers[timeframe];
        const homePlayersInternal = homePlayers[timeframe];
        awaySkaters[timeframe] = [];              
        awayGoalies[timeframe] = [];
        awayPlayersInternal.forEach((player) => {
            if (player.info.position === "G") {
                awayGoalies[timeframe].push(player);
            } else {
                awaySkaters[timeframe].push(player);
            }
        });

        homeSkaters[timeframe] = [];              
        homeGoalies[timeframe] = [];
        homePlayersInternal.forEach((player) => {
            if (player.info.position === "G") {
                homeGoalies[timeframe].push(player);
            } else {
                homeSkaters[timeframe].push(player);
            }
        });
      });
      return {
        "Player Stat": {
          stats: {
            "cumulativeStats": {
              "PTS": "cumulativeStats.points",
              "G": "cumulativeStats.goals",
              "A": "cumulativeStats.assists",
              "SOG": "cumulativeStats.shotsOnGoal",
              "SAT": "cumulativeStats.shotAttempts",
              "+/-": "cumulativeStats.plusMinus",
              "PPP": "cumulativeStats.powerplayPoints",
              "SHP": "cumulativeStats.shorthandedPoints",
              "PIM": "cumulativeStats.penaltyMinutes",
              "BLK": "cumulativeStats.defensiveBlocks"
            }, 
            "averageStats": {
              "PTS": "averageStats.points",
              "G": "averageStats.goals",
              "A": "averageStats.assists",
              "SOG": "averageStats.shotsOnGoal",
              "SAT": "averageStats.shotAttempts",
              "+/-": "averageStats.plusMinus",
              "PPP": "averageStats.powerplayPoints",
              "SHP": "averageStats.shorthandedPoints",
              "PIM": "averageStats.penaltyMinutes",
              "BLK": "averageStats.defensiveBlocks"
            }
          },
          awayPlayers: awaySkaters, 
          homePlayers: homeSkaters
        },
        "Goalie Stat": {
          stats: {
            "cumulativeStats": {
              "WINS": "cumulativeStats.wins",
              "SA": "cumulativeStats.shotsAgainst",
              "SAVES": "cumulativeStats.shotsSaved",
              "SV%": "cumulativeStats.savePercentage",
              "GA": "cumulativeStats.goalsAllowed",
              "SHUTOUTS": "cumulativeStats.shutouts"
            }, 
            "averageStats": {
              "WINS": "averageStats.wins",
              "SA": "averageStats.shotsAgainst",
              "SAVES": "averageStats.shotsSaved",
              "SV%": "averageStats.savePercentage",
              "GA": "averageStats.goalsAllowed",
              "SHUTOUTS": "averageStats.shutouts"
            }
          },
          awayPlayers: awayGoalies, 
          homePlayers: homeGoalies
        }
      };
    case "nfl":
    case "ncaaf":
      const awayPassingPlayers = {};                
      const awayRushingPlayers = {};
      const awayReceivingPlayers = {};
      const awayKickingPlayers = {};
      const homePassingPlayers = {};             
      const homeRushingPlayers = {};
      const homeReceivingPlayers = {};
      const homeKickingPlayers = {};
      Object.keys(awayPlayers).forEach((timeframe) => {
          const awayPlayersInternal = awayPlayers[timeframe];
          const homePlayersInternal = homePlayers[timeframe];

          awayPassingPlayers[timeframe] = [];              
          awayRushingPlayers[timeframe] = [];
          awayReceivingPlayers[timeframe] = [];
          awayKickingPlayers[timeframe] = [];
          awayPlayersInternal.forEach((player) => {
              if (player.info.position === "QB") {
                  awayPassingPlayers[timeframe].push(player);
              }
              //"QB", "RB", "FB", "HB"
              if (player.info.position === "QB" || player.info.position === "RB" || player.info.position === "FB" || player.info.position === "HB") {
                  awayRushingPlayers[timeframe].push(player);
              }
              //"RB", "FB", "HB", "WR", "TE"
              if (player.info.position === "RB" || player.info.position === "FB" || player.info.position === "HB" || player.info.position === "WR" || player.info.position === "TE") {
                  awayReceivingPlayers[timeframe].push(player);
              }
              //"P", "K"
              if (player.info.position === "P" || player.info.position === "K") {
                  awayKickingPlayers[timeframe].push(player);
              }
          });

          homePassingPlayers[timeframe] = [];              
          homeRushingPlayers[timeframe] = [];
          homeReceivingPlayers[timeframe] = [];
          homeKickingPlayers[timeframe] = [];
          homePlayersInternal.forEach((player) => {
              if (player.info.position === "QB") {
                  homePassingPlayers[timeframe].push(player);
              }
              //"QB", "RB", "FB", "HB"
              if (player.info.position === "QB" || player.info.position === "RB" || player.info.position === "FB" || player.info.position === "HB") {
                  homeRushingPlayers[timeframe].push(player);
              }
              //"RB", "FB", "HB", "WR", "TE"
              if (player.info.position === "RB" || player.info.position === "FB" || player.info.position === "HB" || player.info.position === "WR" || player.info.position === "TE") {
                  homeReceivingPlayers[timeframe].push(player);
              }
              //"P", "K"
              if (player.info.position === "P" || player.info.position === "K") {
                  homeKickingPlayers[timeframe].push(player);
              }
          });
      });
      return {
        "Passing Stat": {
          stats: {
            "cumulativeStats": {
              "PASS RTG": "cumulativeStats.rating",
              "COMP": "cumulativeStats.passingCompletions",
              "ATT": "cumulativeStats.passingAttempts",
              "COMP %": "cumulativeStats.completionPercentage",
              "YDS": "cumulativeStats.passingYards",
              "TD": "cumulativeStats.passingTouchdowns",
              "INT": "cumulativeStats.interceptions",
              "RZ ATT": "cumulativeStats.redzonePassingAttempts",
              "RZ COMP": "cumulativeStats.redzoneCompletions",
              "RZ TD": "cumulativeStats.redzonePassingTouchdowns",
              "RZ COMP %": "cumulativeStats.redzoneCompletionPercentage"
            }, 
            "averageStats": {
              "PASS RTG": "averageStats.rating",
              "COMP": "averageStats.passingCompletions",
              "ATT": "averageStats.passingAttempts",
              "COMP %": "averageStats.completionPercentage",
              "YDS": "averageStats.passingYards",
              "TD": "averageStats.passingTouchdowns",
              "INT": "averageStats.interceptions",
              "RZ ATT": "averageStats.redzonePassingAttempts",
              "RZ COMP": "averageStats.redzoneCompletions",
              "RZ TD": "averageStats.redzonePassingTouchdowns",
              "RZ COMP %": "averageStats.redzoneCompletionPercentage"
            }
          },
          awayPlayers: awayPassingPlayers, 
          homePlayers: homePassingPlayers
        },
        "Receiving Stat": {
          stats: {
            "cumulativeStats": {
              "TGT": "cumulativeStats.targets",
              "REC": "cumulativeStats.receptions",
              "YDS": "cumulativeStats.receivingYards",
              "TD": "cumulativeStats.receivingTouchdowns",
              "YDS/REC": "cumulativeStats.receivingYardsPerReception",
              "RZ TGT": "cumulativeStats.redzoneTargets",
              "RZ REC": "cumulativeStats.redzoneReceptions",
              "RZ TD": "cumulativeStats.redzoneReceivingTouchdowns"
            }, 
            "averageStats": {
              "TGT": "averageStats.targets",
              "REC": "averageStats.receptions",
              "YDS": "averageStats.receivingYards",
              "TD": "averageStats.receivingTouchdowns",
              "YDS/REC": "averageStats.receivingYardsPerReception",
              "RZ TGT": "averageStats.redzoneTargets",
              "RZ REC": "averageStats.redzoneReceptions",
              "RZ TD": "averageStats.redzoneReceivingTouchdowns"
            }
          },
          awayPlayers: awayReceivingPlayers, 
          homePlayers: homeReceivingPlayers
        },
        "Rushing Stat": {
          stats: {
            "cumulativeStats": {
              "ATT": "cumulativeStats.rushingAttempts",
              "YDS": "cumulativeStats.rushingYards",
              "TD": "cumulativeStats.rushingTouchdowns",
              "YDS/ATT": "cumulativeStats.rushingYardsPerAttempt",
              "RZ ATT": "cumulativeStats.redzoneRushingAttempts",
              "RZ TD": "cumulativeStats.redzoneRushingTouchdowns"
            }, 
            "averageStats": {
              "ATT": "averageStats.rushingAttempts",
              "YDS": "averageStats.rushingYards",
              "TD": "averageStats.rushingTouchdowns",
              "YDS/ATT": "averageStats.rushingYardsPerAttempt",
              "RZ ATT": "averageStats.redzoneRushingAttempts",
              "RZ TD": "averageStats.redzoneRushingTouchdowns"
            }
          },
          awayPlayers: awayRushingPlayers, 
          homePlayers: homeRushingPlayers
        },
        "Kicking Stat": {
          stats: {
            "cumulativeStats": {
              "PTS": "cumulativeStats.pointsKicked",
              "FGA": "cumulativeStats.fieldGoalAttempts",
              "FGM": "cumulativeStats.fieldGoalsMade",
              "FG%": "cumulativeStats.fieldGoalPercentage",
              "XPA": "cumulativeStats.extraPointAttempts",
              "XPM": "cumulativeStats.extraPointsMade",
              "XP%": "cumulativeStats.extraPointPercentage",
              "FG (0-19)": "cumulativeStats.extraShortRangeFieldGoals",
              "FG (20-29)": "cumulativeStats.shortRangeFieldGoals",
              "FG (30-39)": "cumulativeStats.mediumRangeFieldGoals",
              "FG (40-49)": "cumulativeStats.longRangeFieldGoals",
              "FG (50+)": "cumulativeStats.extraLongRangeFieldGoals"
            }, 
            "averageStats": {
              "PTS": "averageStats.pointsKicked",
              "FGA": "averageStats.fieldGoalAttempts",
              "FGM": "averageStats.fieldGoalsMade",
              "FG%": "averageStats.fieldGoalPercentage",
              "XPA": "averageStats.extraPointAttempts",
              "XPM": "averageStats.extraPointsMade",
              "XP%": "averageStats.extraPointPercentage",
              "FG (0-19)": "averageStats.extraShortRangeFieldGoals",
              "FG (20-29)": "averageStats.shortRangeFieldGoals",
              "FG (30-39)": "averageStats.mediumRangeFieldGoals",
              "FG (40-49)": "averageStats.longRangeFieldGoals",
              "FG (50+)": "averageStats.extraLongRangeFieldGoals"
            }
          },
          awayPlayers: awayKickingPlayers, 
          homePlayers: homeKickingPlayers
        }
      };
    case "bundesliga":
    case "epl":
    case "laliga":
    case "ligue1":
    case "seriea":
    case "brazil-serie-a":
    case "mls":
    case "euro":
    case "ucl":
    case "uel":
    case "fifa-world-cup":
      const awayOutfielders = {};
      const awayGoalkeepers = {};

      const homeOutfielders = {};
      const homeGoalkeepers = {};
      Object.keys(awayPlayers).forEach((timeframe) => {
        const awayPlayersInternal = awayPlayers[timeframe];
        const homePlayersInternal = homePlayers[timeframe];
        awayOutfielders[timeframe] = [];              
        awayGoalkeepers[timeframe] = [];
        awayPlayersInternal.forEach((player) => {
            if (player.info.position === "goalkeeper") {
                awayGoalkeepers[timeframe].push(player);
            } else {
                awayOutfielders[timeframe].push(player);
            }
        });

        homeOutfielders[timeframe] = [];              
        homeGoalkeepers[timeframe] = [];
        homePlayersInternal.forEach((player) => {
            if (player.info.position === "goalkeeper") {
                homeGoalkeepers[timeframe].push(player);
            } else {
                homeOutfielders[timeframe].push(player);
            }
        });
      });
      return {
        "Outfielder Stat": {
          stats: {
            "cumulativeStats": {
              "G": "cumulativeStats.goals",
              "A": "cumulativeStats.assists",
              "SOT": "cumulativeStats.shotsOnTarget",
              "SHO": "cumulativeStats.totalShots",
              "PAS": "cumulativeStats.totalPasses",
              // "CC": "cumulativeStats.chancesCreated",
              "DRI": "cumulativeStats.dribblesCompleted",
              "TCK": "cumulativeStats.totalTackles",
              "FLS": "cumulativeStats.foulsCommitted",
              "YEL": "cumulativeStats.yellowCards",
              "RED": "cumulativeStats.redCards"
            }, 
            "averageStats": {
              "G": "averageStats.goals",
              "A": "averageStats.assists",
              "SOT": "averageStats.shotsOnTarget",
              "SHO": "averageStats.totalShots",
              "PAS": "averageStats.totalPasses",
              // "CC": "averageStats.chancesCreated",
              "DRI": "averageStats.dribblesCompleted",
              "TCK": "averageStats.totalTackles",
              "FLS": "averageStats.foulsCommitted",
              "YEL": "averageStats.yellowCards",
              "RED": "averageStats.redCards"
            }
          },
          awayPlayers: awayOutfielders, 
          homePlayers: homeOutfielders
        },
        "Goalie Stat": {
          stats: {
            "cumulativeStats": {
              "GA": "cumulativeStats.goalsConceded",
              "SAV": "cumulativeStats.shotsFacedSaved",
              "SA": "cumulativeStats.shotsFacedTotal",
              "YEL": "cumulativeStats.yellowCards",
              "RED": "cumulativeStats.redCards"
            }, 
            "averageStats": {
              "GA": "averageStats.goalsConceded",
              "SAV": "averageStats.shotsFacedSaved",
              "SA": "averageStats.shotsFacedTotal",
              "YEL": "averageStats.yellowCards",
              "RED": "averageStats.redCards"
            }
          },
          awayPlayers: awayGoalkeepers, 
          homePlayers: homeGoalkeepers
        }
      };
    case "afl":
    case "nrl":
      // No injuries
      return {}
    default:
      return {};
  }
}

export function updateUserAttributes(host, userToken, userAttributes) {
  const postRequestInfo = {
      method: 'POST',
      headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': "Bearer " + userToken
      },
      body: JSON.stringify({userAttributes: userAttributes})
  };
  return fetch(`${host}/api/users/v1/update`, postRequestInfo).catch(console.error)
}

export function sendEmailVerificationCode(host, email) {
  return fetch(`${host}/api/users/v1/sendEmailVerificationCode?email=${encodeURIComponent(email)}`, {method: 'PUT'});
}

export function verifyEmail(host, email, code) {
  return fetch(`${host}/api/users/v1/verifyEmail?email=${encodeURIComponent(email)}&hash=${code}`, {method: 'PUT'});
}

export function isSoccer(league) {
  return Object.keys(SOCCER_LEAGUES).includes(league);
}

// TODO: review places where this is used to set format=weekly in API call, we may be able to just remove that and change the default bahavior in back-end
export function isWeeklyCompetition(league) {
  return SUPPORTED_LEAGUES[league].scheduleFormat === SCHEDULE_FORMAT_WEEKLY;
}

// We're not adding the playbook for new sports or leagues
export function isPlaybookSupported(league) {
  return !!SUPPORTED_LEAGUES[league]?.playbookSupported;
}

export function getPlayerId(playerInfo) {
  return playerInfo?.playerId || "";
}

export function getTeamDisplayName(league, teamInfo) {
  const mode = SUPPORTED_LEAGUES[league]?.display?.teamDisplayName || 'city_name';
  return mode === 'name_only' ? teamInfo.name : `${teamInfo.city} ${teamInfo.name}`;
}

export function getTeamCityDisplayName(league, teamInfo) {
  const mode = SUPPORTED_LEAGUES[league]?.display?.teamCityDisplayName || 'city_only';
  return mode === 'name_only' ? teamInfo.name : teamInfo.city;
}

export function getPlayerWeight(playerInfo) {
  if (!playerInfo) {
    return "";
  }
  if ("weightUnit" in playerInfo && playerInfo.weightUnit && playerInfo.weightUnit.trim() !== "") {
    return `${playerInfo.weight} ${playerInfo.weightUnit}`;
  }
  return `${playerInfo.weight} lbs`;
}

export function getRankDisplayName(team) {
  if (!team || !'standings' in team) {
    return "";
  }

  // Trying to cover all standings separations and rankings possible in any league
  if ('division' in team.standings && team.standings.division) {
    return `${team.standings.division} - ${addOrdinalNumberSuffix(team.standings.divisionRank)}`
  }
  if ('conference' in team.standings && team.standings.conference) {
    return `${team.standings.conference} - ${addOrdinalNumberSuffix(team.standings.conferenceRank)}`
  }
  if ('league' in team.standings && team.standings.league) {
    return `${team.standings.league} - ${addOrdinalNumberSuffix(team.standings.leagueRank)}`
  }
  // Default to overall rank
  if ("overallRank" in team.standings && team.standings.overallRank) {
    return `${addOrdinalNumberSuffix(team.standings.overallRank)}`
  } else if ("rank" in team.standings && team.standings.rank) {
    return `${addOrdinalNumberSuffix(team.standings.rank)}`
  }

  // If we haven't figured it out by this point just return an empty string
  return "";
}

//Same function as above, just changing the formatting to work for game summary
export function getRankWithStandingType(team) {
  if (!team || team.length === 0 || !('standings' in team)) {
    return "";
  }

  // Trying to cover all standings separations and rankings possible in any league
  if ('division' in team.standings && team.standings.division) {
    return {term: 'Division ', position: addOrdinalNumberSuffix(team.standings.divisionRank)}
  }
  if ('conference' in team.standings && team.standings.conference) {
    return {term: 'Conference ', position: addOrdinalNumberSuffix(team.standings.conferenceRank)}
  }
  if ('league' in team.standings && team.standings.league) {
    return {term: 'League ', position: addOrdinalNumberSuffix(team.standings.leagueRank)}
  }
  // Default to overall rank
  if ("overallRank" in team.standings && team.standings.overallRank) {
    return {term: 'Overall ', position: addOrdinalNumberSuffix(team.standings.overallRank)}
  } else if ("rank" in team.standings && team.standings.rank) {
    return {term: '', position: addOrdinalNumberSuffix(team.standings.rank)}
  }

  // If we haven't figured it out by this point just return an empty string
  return "No Rank found";
}

// Iterates over the dictionary and swaps the keys with a specific value in the object
// dict => the dictionary to operate on
// entryKey => the key within each object to use as a swapping point
export function swapDictionary(dict, entryKey) {
  var newDictionary = {};
  Object.keys(dict).forEach((key) => {
    newDictionary[dict[key][entryKey]] = key;
  })
  return newDictionary;
}

// Input must be in RGBA format otherwise the same color that is passed as input will be returned without modification
export function setOpacity(color, opacity) {
  if (color.startsWith("#")) {
    console.warn("Hex color provided as input to set its opacity. This is not currently supported.")
    return color;
  }
  if (!color.startsWith("rgba")) {
    console.warn("Non-rgba format provided. Returning input color.")
    return color;
  }
  const regex = /,[1-9]\d*(\.\d+)?\)/i;
  return color.replace(regex, `,${opacity})`)
}

export function getGameTitle(league, game) {
  var gameTitle = `${game.awayTeamData.info.code} @ ${game.homeTeamData.info.code}`;
  const gameIdParts = game.id.split("-");
  if (league === "mlb" && gameIdParts.length > 3) {
      const gameNumber = gameIdParts[3];
      gameTitle += ` (${gameNumber})`;
  }
  return gameTitle;
}

export function getMarketOdds(market, line, outcome, userAttributes, preferredProviders) {
  return getOddsFromCard({market: market, line: line, outcome: outcome}, userAttributes, preferredProviders)
}

export function getOddsFromTrend(trend, userAttributes, preferredProviders) {
  const odds = getOddsObjectFrom(trend, preferredProviders);
  if (!odds) {
    return null
  }
  return getFormattedLineValue(
      getPreferredFormat(userAttributes),
      getFormattedOddValue(userAttributes, odds)
  )
}

export function getOddsFromCard(card, userAttributes, preferredProviders) {
  return getOddsFromTrend(card, userAttributes, preferredProviders)
}

export function getOddsObjectFrom(card, preferredProviders) {
  return getLineOutcomeFromCard(card, preferredProviders)?.odds
}

// Can return null
export function getLineOutcomeFromCard(card, preferredProviders) {
  const outcome = card.outcome;
  const line = card.line;
  const book = getBookEntryBasedOnBestOdds(card.market.books, outcome, line, preferredProviders, card.alternate)
  if (!book) {
    return null
  }
  var lineOutcome = card.market.books[book][outcome].current
  if (card.alternate) {
    if (!isDictEmpty(card.market.books[book][outcome].alternates) && line in card.market.books[book][outcome].alternates) {
      lineOutcome = card.market.books[book][outcome].alternates[line]
    }
  }
  return lineOutcome;
}

export function getParlayBestEligibleProvider(parlay, preferredProviders) {
  if (!parlay?.legs?.length || !preferredProviders?.length) {
    return null;
  }

  let bestProvider = null;
  let bestDecimalOdds = null;

  preferredProviders.forEach((provider) => {
    let providerDecimalOdds = 1;

    for (const leg of parlay.legs) {
      const lineOutcome = getLineOutcomeFromCard(leg, [provider]);
      const decimalOdds = lineOutcome?.odds?.decimal;

      if (!decimalOdds) {
        providerDecimalOdds = null;
        break;
      }

      providerDecimalOdds *= decimalOdds;
    }

    if (
      providerDecimalOdds !== null &&
      (bestDecimalOdds === null || providerDecimalOdds > bestDecimalOdds)
    ) {
      bestProvider = provider;
      bestDecimalOdds = providerDecimalOdds;
    }
  });

  return bestProvider;
}

const mapping = {};
mapping[TREND_OPTION_KEYS.RECENT_FORM] = ["RECENT_FORM"];
mapping[TREND_OPTION_KEYS.HEAD_TO_HEAD] = ["HEAD_TO_HEAD"];
mapping[TREND_OPTION_KEYS.HOME_AWAY_SPLIT] = ["HOME_SPLIT", "AWAY_SPLIT"];
mapping[TREND_OPTION_KEYS.OPPONENT_RANK] = ["OPPONENT"];
mapping[TREND_OPTION_KEYS.INJURY_IMPACT] = ["INJURY_IMPACT"];
mapping[TREND_OPTION_KEYS.STARTER] = ["STARTER"];

export function getNarrativeIds(narrativeKey) {
    return mapping[narrativeKey];
}

// TODO: should we have 'SPLITS' as mapping for home/away? we just use it in parlay for the combined home/away signal
const SIGNAL_NAME_ID_MAPPINGS = {
  [SIGNAL_OPTION_KEYS.RECENT_FORM]: ["RECENT_FORM"],
  [SIGNAL_OPTION_KEYS.HEAD_TO_HEAD]: ["HEAD_TO_HEAD"],
  [SIGNAL_OPTION_KEYS.HOME_AWAY_SPLIT]: ["HOME_SPLIT", "AWAY_SPLIT"],
  [SIGNAL_OPTION_KEYS.OPPONENT_RANK]: ["OPPONENT_RANK"],
  [SIGNAL_OPTION_KEYS.INJURY_IMPACT]: ["INJURY_IMPACT"],
  [SIGNAL_OPTION_KEYS.STARTER]: ["STARTER"],
  [SIGNAL_OPTION_KEYS.WEATHER]: ["WEATHER"],
  [SIGNAL_OPTION_KEYS.STARTING_PITCHER]: ["VERSUS_STARTING_PITCHER"]
};
export function getSignalIds(signalDisplayName) {
  return SIGNAL_NAME_ID_MAPPINGS?.[signalDisplayName] || []
}

export function getSignalsFilterForAPI(league) {
  const baseSignalKeys = [
    SIGNAL_OPTION_KEYS.RECENT_FORM,
    SIGNAL_OPTION_KEYS.HEAD_TO_HEAD,
    SIGNAL_OPTION_KEYS.HOME_AWAY_SPLIT,
    SIGNAL_OPTION_KEYS.OPPONENT_RANK,
  ];

  const signalKeys = baseSignalKeys.concat(SUPPORTED_LEAGUES[league]?.signalKeys || []);

  const options = {};
  options[SIGNAL_OPTION_KEYS.ALL] = null;
  Object.assign(
    options,
    Object.fromEntries(
      signalKeys.map((key) => [key, getSignalIds(key).join(",")])
    )
  );

  return {
    isActive: false,
    options,
    optionLabels: Object.fromEntries(
      [SIGNAL_OPTION_KEYS.ALL].concat(signalKeys).map((key) => [key, SIGNAL_OPTION_LABELS[key]])
    ),
    selectedValue: SIGNAL_OPTION_KEYS.ALL,
    filterType: "single",
    queryParamField: "signals",
  };
}

function getInsightFraction(trend, narrative) {
  const index = (trend.narratives || []).indexOf(narrative)
  if (index < 0) {
    return {numerator: 1, denominator: 1}
  }
  const insight = trend.insights[index]
  const parsingResult = insight.description.match(/(\d+)/g)
  return {
    numerator: Number(parsingResult[0]),
    denominator: Number(parsingResult[1])
  }
}

// All based on the insight entry in the trend
export const TREND_NARRATIVE_INFO = {
  RECENT_FORM: (trend) => {
    const displayName = "Recent Form"
    const fraction = getInsightFraction(trend, 'RECENT_FORM')
    return {
      displayName: displayName,
      ...fraction
    }
  },
  HEAD_TO_HEAD: (trend) => {
    // Arbitrarily using one of the fields that should only be present in parlays as an indicator, in this case 'crossTeam'
    const displayName = 'crossTeam' in trend ? 'Head to Head' : `vs ${trend.opposingTeam.code}`
    const fraction = getInsightFraction(trend, 'HEAD_TO_HEAD')
    return {
      displayName: displayName,
      ...fraction
    }
  },
  HOME_SPLIT: (trend) => {
    const displayName = 'Home Split'
    const fraction = getInsightFraction(trend, 'HOME_SPLIT')
    return {
      displayName: displayName,
      ...fraction
    }
  },
  AWAY_SPLIT: (trend) => {
    const displayName = 'Away Split'
    const fraction = getInsightFraction(trend, 'AWAY_SPLIT')
    return {
      displayName: displayName,
      ...fraction
    }
  },
  // TODO: if every we need it
  OPPONENT: (trend) => ({displayName: '', numerator: 1, denominator: 1}),
  STARTER: (trend) => {
    const displayName = 'When Starting'
    const fraction = getInsightFraction(trend, 'STARTER')
    return {
      displayName: displayName,
      ...fraction
    }
  },
  INJURY_IMPACT: (trend) => {
    const index = (trend.narratives || []).indexOf('INJURY_IMPACT')
    if (index < 0) {
      return {displayName: 'Without', numerator: 1, denominator: 1}
    }
    const insight = trend.insights[index]
    const withoutPerson = insight.description.split(' without ')?.[1] || ''
    const displayName = `w/o ${withoutPerson}`
    const parsingResult = insight.description.match(/(\d+)/g)
    return {
      displayName: displayName,
      numerator: Number(parsingResult[0]),
      denominator: Number(parsingResult[1])
    }
  }
}

// TODO: review key:value of multiple filter
// TODO: why do we have object options for multiple but array for single?
export function getGamesFilter(options, annotations) {
  var gameOptions = {};
  gameOptions[ALL_GAMES_FILTER_OPTION] = ALL_GAMES_FILTER_OPTION;
  return {
      isActive: false,
      options: Object.assign(gameOptions, options),
      selectedValues: [ALL_GAMES_FILTER_OPTION],
      annotations: annotations,
      filterType: "multiple"
  }
}

export function getGamesFilterForAPI(options, annotations) {
  return {
      isActive: false,
      options: Object.assign(
        { all: ALL_GAMES_FILTER_OPTION },
        Object.fromEntries(Object.entries(options).map(([label, gameId]) => [gameId, label]))
      ),
      selectedValues: ["all"],
      queryParamField: 'gameIds',
      annotations: Object.fromEntries(
        Object.entries(options).map(([label, gameId]) => [gameId, annotations[label]])
      ),
      filterType: "multiple"
  };
}

export function getLineTypeFilter() {
  return {
    isActive: false,
    options: ["Main Lines", "Alternate Lines"],
    selectedValue: "Main Lines",
    filterType: "single"
  }
}

export function getLineTypeFilterForAPI() {
  return {
    isActive: false,
    options: {
      [LINE_TYPE_OPTION_KEYS.MAIN]: "MAIN",
      [LINE_TYPE_OPTION_KEYS.ALTERNATE]: "ALTERNATE",
    },
    optionLabels: LINE_TYPE_OPTION_LABELS,
    queryParamField: 'lineTypes',
    selectedValue: LINE_TYPE_OPTION_KEYS.MAIN,
    filterType: "single"
  };
}
export function getOverUnderFilter() {
  return getSingleOverUnderFilter();
}

export function getSingleOverUnderFilter() {
  return {
      isActive: false,
      options: {
        [OUTCOME_OPTION_KEYS.ALL]: null,
        [OUTCOME_OPTION_KEYS.OVER]: "OVER,YES,COVER",
        [OUTCOME_OPTION_KEYS.UNDER]: "UNDER,NO",
      },
      optionLabels: OVER_UNDER_OPTION_LABELS,
      selectedValue: OUTCOME_OPTION_KEYS.ALL,
      filterType: "single"
  };
}

export function getMultipleOverUnderFilter() {
  return {
      isActive: false,
      options: {
        [OUTCOME_OPTION_KEYS.ALL]: null,
        [OUTCOME_OPTION_KEYS.OVER]: "OVER,YES,COVER",
        [OUTCOME_OPTION_KEYS.UNDER]: "UNDER,NO"
      },
      optionLabels: OVER_UNDER_OPTION_LABELS,
      queryParamField: 'outcomes',
      selectedValues: [OUTCOME_OPTION_KEYS.ALL],
      filterType: "multiple"
  };
}

export function getBetTypeFilter(options) {
  return getSingleBetTypeFilter(options);
}

export function getSingleBetTypeFilter(options) {
  return {
      isActive: false,
      options: [ALL_BETS_MARKET_NAME].concat(options),
      selectedValue: ALL_BETS_MARKET_NAME,
      filterType: "single"
  }
}

export function getMultipleBetTypeFilter(options) {
  return {
      isActive: false,
      options: arrayToDict([ALL_BETS_MARKET_NAME].concat(options)),
      selectedValues: [ALL_BETS_MARKET_NAME],
      filterType: "multiple"
  }
}

// Options here is a dictionary with key (display name) and value (market id)
export function getMultipleBetTypeFilterForAPI(inputOptions) {
  return {
      isActive: false,
      options: {
        all: ALL_BETS_MARKET_NAME,
        ...inputOptions,
      },
      selectedValues: ["all"],
      filterType: "multiple",
      queryParamField: 'markets',
  };
}

export function getTimeframeFilterForAPI() {
  return {
      isActive: false,
      options: {
        season: BETTING_LEADERBOARD_TIMEFRAMES["Season"],
        headToHead: BETTING_LEADERBOARD_TIMEFRAMES["Head to Head"],
        last5: BETTING_LEADERBOARD_TIMEFRAMES["Last 5"],
        last10: BETTING_LEADERBOARD_TIMEFRAMES["Last 10"],
        last20: BETTING_LEADERBOARD_TIMEFRAMES["Last 20"],
        last30: BETTING_LEADERBOARD_TIMEFRAMES["Last 30"],
      },
      optionLabels: {
        season: "Season",
        headToHead: "Head to Head",
        last5: "Last 5",
        last10: "Last 10",
        last20: "Last 20",
        last30: "Last 30",
      },
      selectedValue: "season",
      filterType: "single",
      queryParamField: 'timeframe',
  };
}

// Only for internal use at the time of writing
export function getStraightTrendTypeFilterForAPI(defaultSelectedValue) {
  return {
    isActive: false,
    options: {
      [STRAIGHT_TREND_TYPE_OPTION_KEYS.PLAYER]: "PLAYER",
      [STRAIGHT_TREND_TYPE_OPTION_KEYS.TEAM]: "TEAM"
    },
    optionLabels: {
      [STRAIGHT_TREND_TYPE_OPTION_KEYS.PLAYER]: "player",
      [STRAIGHT_TREND_TYPE_OPTION_KEYS.TEAM]: "team"
    },
    queryParamField: 'trendTypes',
    selectedValue: defaultSelectedValue,
    filterType: "single",
    hidden: true
  };
}

export function getTrendsFilter() {
  return getSingleTrendsFilter()
}

export function getSingleTrendsFilter() {
  return {
      isActive: false,
      options: {
        [TREND_OPTION_KEYS.ALL]: null,
        [TREND_OPTION_KEYS.RECENT_FORM]: getNarrativeIds(TREND_OPTION_KEYS.RECENT_FORM).join(","),
        [TREND_OPTION_KEYS.HEAD_TO_HEAD]: getNarrativeIds(TREND_OPTION_KEYS.HEAD_TO_HEAD).join(","),
        [TREND_OPTION_KEYS.HOME_AWAY_SPLIT]: getNarrativeIds(TREND_OPTION_KEYS.HOME_AWAY_SPLIT).join(","),
        [TREND_OPTION_KEYS.OPPONENT_RANK]: getNarrativeIds(TREND_OPTION_KEYS.OPPONENT_RANK).join(","),
      },
      optionLabels: TREND_OPTION_LABELS,
      selectedValue: TREND_OPTION_KEYS.ALL,
      filterType: "single"
  };
}

export function getMultipleTrendsFilter() {
  const options = {};
  options[TREND_OPTION_KEYS.ALL] = null;
  Object.assign(
    options,
    Object.fromEntries(
      [
        TREND_OPTION_KEYS.RECENT_FORM,
        TREND_OPTION_KEYS.HEAD_TO_HEAD,
        TREND_OPTION_KEYS.HOME_AWAY_SPLIT,
        TREND_OPTION_KEYS.STARTER,
      ].map((key) => [key, getNarrativeIds(key).join(",")])
    )
  );
  return {
      isActive: false,
      options,
      optionLabels: TREND_OPTION_LABELS,
      selectedValues: [TREND_OPTION_KEYS.ALL],
      filterType: "multiple",
      queryParamField: 'narratives',
  };
}

export function getBetTypeOptions(league, type) {
  if (type === "player") {
      return Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING[league]).filter(prop => !SCREENER_ONLY_PROPS[league].includes(prop));
  } else if (type === "team") {
      return Object.keys(TEAM_BET_TYPE_REVERSE_MAPPING[league]);
  }
  return []
}

// Unlike the above, this returns a dictionary of key (display name) and value (market id)
export function getBetTypeOptionsForAPI(league, type) {
  if (type === "player") {
      return Object.fromEntries(
          Object.entries(PLAYER_BET_TYPES_REVERSE_MAPPING[league]).map(([label, marketId]) => [marketId, label])
      );
  } else if (type === "team") {
      return Object.fromEntries(
          Object.entries(TEAM_BET_TYPE_REVERSE_MAPPING[league]).map(([label, marketId]) => [marketId, label])
      );
  }
  return {}
}

// TODO: change to be getMarketIdFromName from betting-utils but all in one place to avoid cyclical dependencies
function getBetId(league, type, betName) {
  if (type === "player") {
      return PLAYER_BET_TYPES_REVERSE_MAPPING[league][betName];
  } else if (type === "team") {
      return TEAM_BET_TYPE_REVERSE_MAPPING[league][betName];
  }
  return "";
}

// TODO: change to be getMarketNameFromId from betting-utils but all in one place to avoid cyclical dependencies
function getBetName(league, type, marketId) {
  if (type === "team") {
    return TEAM_BETS[league][marketId].displayName
  }
  if (type === "player") {
    return PLAYER_BET_TYPE_ID_TO_NAME[league][marketId]
  }
  return ""
}

export function filterCards(league, cards, filters, type) {
  return cards.filter((card) => {
    const isParlay = type.includes("parlay")
    if (type !== "player" && type !== "team" && !isParlay) {
      return false;
    }
    // O/U filter
    // The 'over' case is also used for 'cover'
    if (FILTER_KEYS.OUTCOME in filters) {
      const filterType = filters[FILTER_KEYS.OUTCOME].filterType;
      if (
        filterType === "single" &&
        !(
          filters[FILTER_KEYS.OUTCOME].selectedValue === OUTCOME_OPTION_KEYS.ALL ||
          filters[FILTER_KEYS.OUTCOME].selectedValue === card.outcome ||
          (filters[FILTER_KEYS.OUTCOME].selectedValue === OUTCOME_OPTION_KEYS.OVER &&
            card.outcome.toLowerCase() === "cover")
        )
      ) {
        return false;
      }
      if (
        filterType === "multiple" &&
        !filters[FILTER_KEYS.OUTCOME].selectedValues.some(
          (outcomeFilter) =>
            outcomeFilter === OUTCOME_OPTION_KEYS.ALL ||
            outcomeFilter === card.outcome ||
            (outcomeFilter === OUTCOME_OPTION_KEYS.OVER &&
              card.outcome.toLowerCase() === "cover")
        )
      ) {
        return false;
      }
    }
    
    // Bet type filter
    if (FILTER_KEYS.BET_TYPE in filters && !isParlay) {
      const filterType = filters[FILTER_KEYS.BET_TYPE].filterType;
      if (
        filterType === "single" &&
        !(
          filters[FILTER_KEYS.BET_TYPE].selectedValue === "all" ||
          getBetId(
            league,
            type,
            filters[FILTER_KEYS.BET_TYPE].optionLabels[filters[FILTER_KEYS.BET_TYPE].selectedValue]
          ) === card.market.name
        )
      ) {
        return false;
      }
      if (
        filterType === "multiple" &&
        !filters[FILTER_KEYS.BET_TYPE].selectedValues.some(
          (betTypeFilter) =>
            betTypeFilter === "all" ||
            getBetId(
              league,
              type,
              filters[FILTER_KEYS.BET_TYPE].optionLabels[betTypeFilter]
            ) === card.market.name
        )
      ) {
        return false;
      }
    }

    // Trends filter
    if (FILTER_KEYS.TRENDS in filters) {
      const filterType = filters[FILTER_KEYS.TRENDS].filterType;
      if (
        filterType === "single" &&
        !(
          filters[FILTER_KEYS.TRENDS].selectedValue === TREND_OPTION_KEYS.ALL ||
          card.narratives.some((narrative) =>
            getNarrativeIds(filters[FILTER_KEYS.TRENDS].selectedValue).includes(narrative)
          )
        )
      ) {
        return false;
      }
      if (
        filterType === "multiple" &&
        !filters[FILTER_KEYS.TRENDS].selectedValues.some(
          (trendsFilter) =>
            trendsFilter === TREND_OPTION_KEYS.ALL ||
            card.narratives.some((narrative) => getNarrativeIds(trendsFilter).includes(narrative))
        )
      ) {
        return false;
      }
    }

    // Games filter
    if (GAMES_FILTER in filters || FILTER_KEYS.GAMES in filters) {
      const gamesFilter = filters[GAMES_FILTER] || filters[FILTER_KEYS.GAMES];
      const filterType = gamesFilter.filterType;

      if (filterType === "single" && !(gamesFilter.selectedValue === "all" || gamesFilter.selectedValue === card.gameId)) {
        return false;
      }

      if (filterType === "multiple" && !gamesFilter.selectedValues.some((gameFilter) => gameFilter === "all" || gameFilter === card.gameId)) {
        return false;
      }
    }

    // We could make the assumption that anything containing parlay-related filters can be assumed to be a parlay trend 
    //  but wrapping it in the parlay type check is just a bit safer
    if (type.includes("parlay")) {
      // Leg count filter
      if (PARLAY_LEGS_COUNT_FILTER in filters) {
        const filterSelection = filters[PARLAY_LEGS_COUNT_FILTER].selectedValue;
        // Ideally we would have the option as just the number to do a direct comparison but if we do that we only see the number in the filter selection visual which doesn't tell the user much information
        // If we change the design we could do it but right now we need options with text after the number
        // parseInt will ignore any non-numerical data so we can use it to pick out the numbers in the filter option
        if (filterSelection !== ALL_LEG_COUNTS_OPTION && card.legs.length !== parseInt(filterSelection)) {
          return false;
        }
      }
  
      // Leg type filter
      if (PARLAY_LEGS_TYPE_FILTER in filters) {
        const filterSelection = filters[PARLAY_LEGS_TYPE_FILTER].selectedValue;
        if (!card.legs.every(x => x.type === filterSelection.toLowerCase())) {
          return false;
        }
      }

      if (type === CROSS_GAME_PARLAY && BET_TYPE_FILTER in filters) {
        const selectedValues = filters[BET_TYPE_FILTER].selectedValues
        if (!card.legs.every(leg => selectedValues.includes(getBetName(league, "player", leg.market.name)) || selectedValues.includes(ALL_BETS_MARKET_NAME))) {
          return false;
        }
      }
    }

    return true;
  })
}

export function generateDummyPlay(type, home, insights, outcome, market, line, odds, narratives, team, opposingTeam, player) {
  return {
    type: type,
    book: 'dummy',
    home: home,
    insights: insights,
    outcome: outcome,
    market: {
        name: market,
        books: {
            dummy: {
                over: {
                    current: {
                        value: line,
                        odds: odds
                    }
                }
            }
        }
    },
    narratives: narratives,
    opposingTeam: opposingTeam,
    player: player,
    team: team
  }
}

export function getFilterQueryParameter(filter) {
  if ('queryParameterLocation' in filter && filter.queryParameterLocation === FILTER_QUERY_PARAMETER_LOCATION_VALUE) {
    return filter.options[filter.selectedValue];
  }
  return filter.selectedValue;
}

export function jsonOrDefault(response, defaultValue) {
  if (response.status >= 200 && response.status < 300) {
    return response.json();
  }
  console.error(`${response.status} for ${response.url}`)
  return defaultValue;
}

export function noOpPromise(resolutionData) {
  return new Promise((resolve, reject) => {
    resolve(resolutionData)
  })
}

export function arrayToDict(items) {
  return Object.fromEntries(items.map(x => [x, x]))
}

export function filtersToQueryParamsDict(filters) {
  return Object.fromEntries(
    Object.keys(filters).map((filterKey) => {
      const filter = filters[filterKey];
      const queryField = filter.queryParamField || filterKey;

      if ('selectedValue' in filter) {
        if (queryField === 'markets' || queryField === 'minimumOdds') {
          return [queryField, filter.selectedValue === "all" ? "" : filter.selectedValue];
        }
        return [queryField, filter.options[filter.selectedValue]];
      } else if ('selectedValues' in filter) {
        if (queryField === 'gameIds' || queryField === 'markets' || queryField === 'exchanges') {
          return [
            queryField,
            filter.selectedValues.includes("all") ? "" : filter.selectedValues.join(",")
          ];
        }

        return [queryField, filter.selectedValues.map((v) => filter.options[v]).join(",")];
      } else {
        console.warn("At least 'selectedValue' (single) of 'selectedValues' (multiple) is required");
      }
    })
  );
}

export function fetchServerStatus(apiHost) {
  return fetch(`${apiHost}/api/status/v1`).then(response => jsonOrDefault(response, null)).catch(console.error)
}

export function getDisplayDateFromRecord(record) {
  const formattedTimestamp = parseDateFromString(record.timestamp);
  return `${String(formattedTimestamp.month).padStart(2, '0')}/${String(formattedTimestamp.day).padStart(2, '0')}/${formattedTimestamp.yearShort}`;
}

export function getBetslipLinks(apiHost, operator, operatorOutcomeData, country, region) {
  return fetch(
      `${apiHost}/api/betslip/v1/operatorLinks`, 
      {
          method: 'POST', 
          headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({
              operator: operator.toLowerCase(),
              operatorOutcomeData: operatorOutcomeData,
              location: {
                  country: {code: country},
                  region: {code: region}
              }
          })
      }
  )
  .then(response => jsonOrDefault(response, {ios: '', android: '', web: ''}))
  .catch(console.error)
}

export function getBetslipLinksForLocation(apiHost, location, selectedProviderRaw, operatorOutcomeData = []) {
    const selectedProvider = selectedProviderRaw?.toLowerCase() || ""
    const locationData = getLocationObject(location)

    return getBetslipLinks(
        apiHost,
        selectedProvider,
        operatorOutcomeData,
        locationData.country,
        locationData.region
    )
}

export function getBetslipDetails(apiHost, legs, country, region) {
  return fetch(
      `${apiHost}/api/betslip/v1/details`, 
      {
          method: 'POST', 
          headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({
              legs: legs,
              location: {
                  country: {code: country},
                  region: {code: region}
              }
          })
      }
  )
  .then(response => jsonOrDefault(response, {operators: {}}))
  .catch(console.error)
}

/**
 * 
 * @param {*} apiHost 
 * @param {*} operatorLegs 
 * {
 *  operator1: {
 *    legs: [...]
 *  },
 *  operator2: {legs:[...]}
 * }
 * @param {*} country 
 * @param {*} region 
 * @returns 
 */
export function getBetslipDetailsV2(apiHost, operatorLegs, country, region) {
  return fetch(
      `${apiHost}/api/betslip/v2/details`, 
      {
          method: 'POST', 
          headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({
              operators: operatorLegs,
              location: {
                  country: {code: country},
                  region: {code: region}
              }
          })
      }
  )
  .then(response => jsonOrDefault(response, {operators: {}}))
  .catch(console.error)
}

export async function analyzeBetslipImage(apiHost, authToken, imageBase64, premium) {
  const analysisResponse = await fetch(
      `${apiHost}/api/betslip/v1/imageAnalysis?premium=${premium}`, 
      {
          method: 'POST',
          headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + authToken
          },
          body: JSON.stringify({base64: imageBase64})
      }
  )
  // await analysisResponse.json()
  const analysisResults = await jsonOrDefault(analysisResponse, {})
  const legs = (analysisResults?.['matches'] || [])
  return legs
}

export async function analyzeBetslipImageV2(apiHost, imageBase64, preferredProviders = []) {
  const analysisResponse = await fetch(
      `${apiHost}/api/betslip/v2/imageAnalysis?preferredProviders=${preferredProviders.join(',')}`, 
      {
          method: 'POST',
          headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({base64: imageBase64})
      }
  )
  const analysisResults = await jsonOrDefault(analysisResponse, {})
  const legs = (analysisResults?.['matches'] || [])
  return legs
}

export async function analyzeImageV1(apiHost, imageBase64, preferredProviders = [], supportedActions = []) {
  const analysisResponse = await fetch(
      `${apiHost}/api/imageAnalysis/v1?preferredProviders=${preferredProviders.join(',')}&supportedActions=${supportedActions.join(',')}`, 
      {
          method: 'POST',
          headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({base64: imageBase64})
      }
  )
  /**
   * {action: '', data: {}}
   */
  return await jsonOrDefault(analysisResponse, {})
}

export function setupUser(apiHost, token, firstName, lastName, userName, appsFlyerId, favoriteLeagues, preferredOddsFormat, preferredProviders) {
  const postRequestInfo = {
      method: 'POST',
      headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': "Bearer " + token
      },
      body: JSON.stringify(
          {
              firstName: firstName,
              lastName: lastName,
              username: userName,
              appsFlyerId: appsFlyerId,
              favoriteLeagues: favoriteLeagues,
              preferredOddsFormat: preferredOddsFormat,
              preferredProviders: preferredProviders
          }
      )
  };
  return fetch(`${apiHost}/api/users/v1/setup?sendEmailVerification=false`, postRequestInfo).then(response => jsonOrDefault(response, {}))
}

export function resolvePreferredProviders(userAttributes, localizedCountryProviders) {
  if (userAttributes?.preferredProviders?.length > 0) {
    return userAttributes.preferredProviders
  }
  return localizedCountryProviders || []
}

export function isDictionary(obj) {
  return obj.constructor == Object
}

// TODO: update the filtering to not rely on the image and instead use the book it
export function getLocationAffiliates(locationCode, countryCode, affiliates, partners, confirmedProviders, preferredProviders, globalAffiliateOrder, advertisingTiers) {
  const locationAffiliates = affiliates?.[locationCode] || affiliates?.[countryCode] || {}
  const affiliateOrder = globalAffiliateOrder || []
  // Tiers as a starting point and adding all the other affiliates after if they aren't already in there
  const resolvedAffiliateOrder = _.cloneDeep(advertisingTiers || [])
  affiliateOrder.forEach((operator) => {
    if (resolvedAffiliateOrder.indexOf(operator) === -1) {
      resolvedAffiliateOrder.push(operator)
    }
  })
  
  const filteredAffiliates = Object.fromEntries(
    Object.keys(locationAffiliates)
      .filter((operatorName) =>
        operatorName in SPORTSBOOKS_CONFIG &&
        !confirmedProviders?.includes(operatorName) &&
        !preferredProviders?.includes(operatorName)
      )
      .sort((a, b) => {
        const indexA = resolvedAffiliateOrder.indexOf(a);
        const indexB = resolvedAffiliateOrder.indexOf(b);

        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return 0;
      })
      .map((operatorName) => [operatorName, locationAffiliates[operatorName]])
  );

  const sortOffersPrioritizingNonSignup = (offers = []) => _.sortBy(
    offers,
    (offer) => offer?.type?.endsWith('_SIGNUP') ? 1 : 0
  )
  
  //replace bookname by operatorId since the key is the operator id, and dont need to use image
  //adding a sorted by type instead of partners
  return {
    affiliates: filteredAffiliates,
    offersByType: Object.entries(filteredAffiliates).reduce((result, [operator, offers]) => {
      (offers || []).forEach((offer) => {
        if (!offer?.type) {
          return;
        }

        if (!result[offer.type]) {
          result[offer.type] = [];
        }

        result[offer.type].push({
          operator,
          ...offer
        });
      });

      return result;
    }, {}),
    offersByOperator: Object.entries(filteredAffiliates).reduce((result, [operator, offers]) => {
      result[operator] = sortOffersPrioritizingNonSignup(
        (offers || []).map((offer) => ({
          operator,
          ...offer
        }))
      );

      return result;
    }, {})
  }
}

export function getLocationObject(location) {
    var country = ""
    var region = ""
    if (location?.includes('-')) {
        const parts = location.split('-')
        country = parts[0]
        region = parts[1]
    }
    return {country: country, region: region}
}

export function analyzeBetslipLegs(legs, localizedCountryProviders) {
  const providers = {}
  Object.keys(legs).forEach(legKey => {
    const leg = legs[legKey]
    const canonicalLegKey = getBetslipCanonicalLegKey(leg.league, leg)
    Object.keys(leg.market.books).filter(bookId => bookId in SPORTSBOOKS_CONFIG && localizedCountryProviders.includes(bookId)).forEach(provider => {
        if (!(provider.toLowerCase() in providers)) {
            // canonicalLegs -> no line or outcome
            providers[provider.toLowerCase()] = {'book': provider, 'legs': {}, 'canonicalLegs': {}}
        }
        const providerAlternateOutcomes = Object.values(leg.market.books[provider][leg.outcome]?.alternates || {}).filter(x => x?.value !== 0)
        const providerMainOutcome = leg.market.books[provider][leg.outcome]?.current
        const providerOutcomes = [providerMainOutcome].concat(providerAlternateOutcomes)
        const providerLegKey = getBetslipLegKey(leg.league, {...leg, line: providerMainOutcome?.value || 0})
        const providerLeg = {
            ...leg, 
            // I don't actually know if we need to set the book, I think we always use the state provider and not the book on the leg
            book: provider.toLowerCase(), 
            // line: providerMainOutcome?.value || 0
        }
        const providerOutcomeMatch = providerOutcomes.find(x => x?.value === leg.line)
        if (providerOutcomeMatch) {
            providerLeg.odds = providerOutcomeMatch?.odds || {}
            // Current provider has a line matching the original leg that was added. Could be from main or alt, doesn't matter
            // When we get the outcome data to generate the deeplink later that's where we need to make sure we grab the correct data but here all we care about is setting the line
            providers[provider.toLowerCase()].legs[providerLegKey] = {
                ...providerLeg, 
                // We technically don't need to do that because it means one of main or alts matched the original leg
                // line: providerOutcomeMatch?.value || 0, 
                alternate: providerOutcomeMatch?.value !== leg.line
            }
        } else {
            const providerAlts = providerAlternateOutcomes.map(x => x?.value || 0)
            const providerMainLine = providerMainOutcome?.value || 0
            var closestMatch = providerMainLine
            var closestMatchDiff = Math.abs(providerMainLine - leg.line)
            providerAlts.forEach((line) => {
                const diff = Math.abs(line - leg.line)
                if (diff < closestMatchDiff) {
                    closestMatch = line
                    closestMatchDiff = diff
                }
            })
            providerLeg.line = closestMatch
            providerLeg.alternate = closestMatch !== providerMainLine
            const closestProviderOutcomeMatch = providerOutcomes.find(x => x?.value === providerLeg.line)
            providerLeg.odds = closestProviderOutcomeMatch?.odds || {}
        }
        providers[provider.toLowerCase()].canonicalLegs[canonicalLegKey] = providerLeg
    })
  })
  return providers
}

export async function transformAndGetBetslipDetails(host, analyzedLegs, location) {
  try {
    if (!location) {
      return {operators: {}, fetched: false}
    }
    if (isDictEmpty(analyzedLegs)) {
      return {operators: {}, fetched: false}
    }
    const locationData = getLocationObject(location)
    const betslipDetailsLegs = Object.fromEntries(
        Object.keys(analyzedLegs).map(provider => {
            const providerLegs = Object.values(analyzedLegs[provider].canonicalLegs).map((leg) => {
                return {
                    line: leg.line || 0,
                    outcome: leg.outcome,
                    providerData: leg.market.providerData
                }
            })
            return [provider, {legs: providerLegs}]
        })
    )
    const response = await getBetslipDetailsV2(host, betslipDetailsLegs, locationData.country, locationData.region)
    return {operators: response?.operators || {}, fetched: true}
  } catch(error) {
    console.error(error)
    return {operators: {}}
  }
}

function calculateCrossGameParlayOdds(providerCanonicalLegs) {
  if (providerCanonicalLegs.length === 0) {
      return null
  }
  var decimalOdds = 1
  providerCanonicalLegs.forEach((leg) => {
      decimalOdds *= leg?.odds?.decimal || 1
  })
  return {
      decimal: decimalOdds,
      american: convertDecimalToAmerican(decimalOdds),
      fractiona: convertDecimalToFractional(decimalOdds)
  }
}

function getPreprocessedProviderOdds(userAttributes, preProcessedBetslipDetails, provider) {
  var odds = ""
  if (provider.toLowerCase() in preProcessedBetslipDetails.operators && preProcessedBetslipDetails.operators[provider.toLowerCase()]?.odds) {
      odds = getFormattedLineValue(
          getPreferredFormat(userAttributes),
          getFormattedOddValue(userAttributes, preProcessedBetslipDetails.operators[provider.toLowerCase()]?.odds || {})
      )
  }
  return `${odds}`
}

export function getBetslipOdds(userAttributes, preProcessedBetslipDetails, isParlay, isExclusivelyCrossGameParlay, provider, providerLegs) {
  var odds = ""
  if (isParlay) {
      if (isExclusivelyCrossGameParlay) {
          odds = calculateCrossGameParlayOdds(Object.values(providerLegs))
          if (!odds) {
              odds = ""
          } else {
              odds = getFormattedLineValue(
                  getPreferredFormat(userAttributes),
                  getFormattedOddValue(userAttributes, odds)
              )
          }
      } else {
          odds = getPreprocessedProviderOdds(userAttributes, preProcessedBetslipDetails, provider)
      }
  } else if (Object.values(providerLegs).length > 0) {
      odds = getOddsFromCard(Object.values(providerLegs)[0], userAttributes, [provider])
  }
  return `${odds}`
}

export function getBetslipInfo(userAttributes, analyzedLegs, preProcessedBetslipDetails, 
                               localizedRegionProviders, affiliates, advertising, location, 
                               selectedProvider, betslipLegs, groupedLegs, t = null) {
  const providerSelected = selectedProvider && selectedProvider.length > 0
  const legsCount = Object.keys(betslipLegs).length
  const containsLegs = legsCount > 0
  const isParlay = legsCount > 1
  const providerCanonicalLegs = Object.values(analyzedLegs[selectedProvider.toLowerCase()]?.canonicalLegs || {})
  const games = new Set(Object.values(betslipLegs).map(leg => leg.gameId))
  const isExclusivelyCrossGameParlay = games.size === legsCount && legsCount > 1
  const leagues = Object.keys(groupedLegs)

  const gameSections = []
  Object.keys(groupedLegs).forEach(league => {
      Object.keys(groupedLegs[league]).forEach(gameId => {
          gameSections.push({
              title: gameId,
              data: groupedLegs[league][gameId]
          })
      })
  })

  const tiers = (advertising?.[location]?.betslip?.tiers || []).map(x => x?.operator).filter(x => x)
  const regionBooks = localizedRegionProviders
  const sortedBooks = Object.values(analyzedLegs).sort((a, b) => {
      const diff = Object.keys(b.legs).length - Object.keys(a.legs).length
      if (diff !== 0) {
          return diff
      }
      const aIndexOf = tiers.indexOf(a.book)
      const bIndexOf = tiers.indexOf(b.book)

      // If both elements are in tiers, sort by their position in tiers
      if (aIndexOf !== -1 && bIndexOf !== -1) return aIndexOf - bIndexOf;
      // If only one is in tiers, prioritize the one that is
      if (aIndexOf !== -1) return -1;
      if (bIndexOf !== -1) return 1;

      // After the number of legs keep the ones with offers at the top
      if ((SPORTSBOOKS_CONFIG?.[b?.book?.toLowerCase()]?.displayName || '') in affiliates) {
          return 1
      }
      return -1
  })

  // First group by wether or not they are available in the region
  const regionGroupedBooks = groupBy(sortedBooks, x => regionBooks?.includes(x.book))
  
  // Separated in two groups, one that has all the legs and one that doesn't
  const groupedAvailableBooks = groupBy(regionGroupedBooks?.['true'] || [], x => Object.keys(x.canonicalLegs).length === legsCount)
  var bookSections = []
  if (groupedAvailableBooks?.['true']) {
      bookSections.push({
          titleKey: 'picks.sections.availableOrAdjusted',
          data: groupedAvailableBooks['true'],
          locked: false
      })
  }
  if (groupedAvailableBooks?.['false']) {
      bookSections.push({
          titleKey: 'picks.sections.missingProps',
          data: groupedAvailableBooks['false'],
          locked: false
      })
  }
  if (regionGroupedBooks?.['false']) {
      bookSections.push({
          titleKey: 'picks.sections.unavailableInRegion',
          data: regionGroupedBooks['false'],
          locked: true
      })
  }
  bookSections = bookSections.filter(x => x.data.length > 0)
  const providerCanonicalLegsCount = Object.keys(providerCanonicalLegs).length
  const providerLegsCount = Object.keys(analyzedLegs[selectedProvider.toLowerCase()]?.legs || {}).length
  const selectedProviderDisplayName = SPORTSBOOKS_CONFIG?.[selectedProvider?.toLowerCase()]?.displayName || ''
  const providerMissingLegsCount = legsCount - providerCanonicalLegsCount
  const providerAdjustedLegsCount = providerCanonicalLegsCount - providerLegsCount
  var infoBannerText = '';
  if (providerSelected) {
      if (typeof t === 'function') {
          const warningParts = [];

          if (providerMissingLegsCount > 0) {
              warningParts.push(t('picks.warnings.legsNotFound', { count: providerMissingLegsCount }));
          }

          if (providerAdjustedLegsCount > 0) {
              warningParts.push(t('picks.warnings.adjusted', { count: providerAdjustedLegsCount }));
          }

          if (warningParts.length > 0) {
              infoBannerText = `${warningParts.join(t('picks.warnings.and'))}${t('picks.warnings.forOperator', { operator: selectedProviderDisplayName })}`;
          }
      } else {
          if (providerMissingLegsCount > 0) {
              infoBannerText += `${addPluralSuffixIfNecessary(providerMissingLegsCount, 'leg')} could not be found`
          }
          if (providerAdjustedLegsCount > 0) {
              if (providerMissingLegsCount > 0) {
                  infoBannerText += ' and '
              }
              infoBannerText += `${addPluralSuffixIfNecessary(providerAdjustedLegsCount, 'leg')} ${providerAdjustedLegsCount > 1 ? 'were' : 'was'} adjusted`
          }
          if (providerMissingLegsCount > 0 || providerAdjustedLegsCount > 0) {
              infoBannerText += ` for ${selectedProviderDisplayName}.`
          }
      }
  }

  const selectedProviderOdds = getBetslipOdds(userAttributes, preProcessedBetslipDetails, isParlay, isExclusivelyCrossGameParlay, selectedProvider, providerCanonicalLegs)
  const selectedProviderAvailableInRegion = providerSelected && regionBooks?.includes(selectedProvider)
  const actionDisabled = !providerSelected || !selectedProviderAvailableInRegion
  return {
    legsCount: legsCount,
    containsLegs: containsLegs, 
    isParlay: isParlay,
    providerCanonicalLegs: providerCanonicalLegs,
    isExclusivelyCrossGameParlay: isExclusivelyCrossGameParlay,
    leagues: leagues,
    bookSections: bookSections,
    gameSections: gameSections,
    infoBannerText: infoBannerText,
    selectedProviderOdds: selectedProviderOdds,
    selectedProviderAvailableInRegion: selectedProviderAvailableInRegion,
    actionDisabled: actionDisabled
  }
}

// Mostly for when legs are removed but could utilize for when it's added where we iterate over lges to be added to the overall dict first and then group afterwards through here
export function groupBetslipLegs(legs) {
  const groupedLegs = {}
  for (let leg of legs) {
    const league = leg.league
    if (!(league in groupedLegs)) {
      groupedLegs[league] = {}
    }
    if (!(leg.gameId in groupedLegs[league])) {
      groupedLegs[league][leg.gameId] = []
    }
    groupedLegs[league][leg.gameId].push(leg)
  }
  return groupedLegs
}

export function getDirectBetslipLinks(apiHost, location, selectedProviderRaw, analyzedLegs) {
    const selectedProvider = selectedProviderRaw?.toLowerCase() || ""
    const operatorOutcomeData = Object.values(analyzedLegs?.[selectedProvider]?.canonicalLegs || {}).map(leg => {
        const outcome = leg.market.books?.[selectedProvider]?.[leg.outcome] || leg.market.books[SPORTSBOOKS_CONFIG[selectedProvider].displayName]?.[leg.outcome]
        // TODO: could possibly use the 'alternate' flag in the leg instead of checking if main/alt, though we still need to check the list of alts anyway
        const line = leg.line
        // TODO: is there a bug with .current?
        if (line === outcome?.current?.value) {
            return outcome.current.operatorData
        }
        const alternateLineSelection = Object.values(outcome?.alternates || []).find(alt => alt?.value === line)
        if (alternateLineSelection) {
            return alternateLineSelection.operatorData
        }
        return null
    }).filter(x => x !== null)
    return getBetslipLinksForLocation(apiHost, location, selectedProvider, operatorOutcomeData)
}

export function getRegionPopupTitle(regionCode, country, operator, t) {
    const operatorName = SPORTSBOOKS_CONFIG[operator.toUpperCase()]?.displayName
    if (!operatorName) {
        return ""
    }
    // Once we have more territories with restrictions on advertising we should set this to check in a list of those who are restrictive
    if (regionCode && (regionCode === "CA-ON" || regionCode === "CA-AB" || regionCode.startsWith('AU'))) {
        return operatorName
    }
    if (country && country === 'AU') {
        return operatorName
    }
    return t("common.affiliate.claimYourOffer", {operator: operatorName})
}

export function getRegionPopupCTA(regionCode, country, t) {
    // Once we have more territories with restrictions on advertising we should set this to check in a list of those who are restrictive
    if (regionCode && (regionCode === "CA-ON" || regionCode === "CA-AB" || regionCode.startsWith('AU'))) {
        return t("common.actions.continue")
    }
    if (country && country === 'AU') {
        return t("common.actions.continue")
    }
    return t("common.actions.claim")
}

export function getTeamBetTypesByLeague(league) {
  return TEAM_BETS[league]
}

export function getPlayerBetTypesByLeague(league) {
  return PLAYER_BET_TYPE_ID_TO_NAME[league]
}

export function getLegEntityInfo(league, leg) {
  const entityInfo = {entity_type: leg?.type || null}
  if (leg?.type === 'player') {
    entityInfo.entity_id_internal = getPlayerId(leg.player)
    entityInfo.entity_name = getPlayerFullDisplayName(leg.player)
  } else if (leg?.type === 'team') {
    entityInfo.entity_abbreviation = leg?.team?.code
    entityInfo.entity_id_internal = leg?.team?.teamId
    entityInfo.entity_name = getTeamDisplayName(league, leg?.team)
  }
  return entityInfo;
}

export function getBetslipLegInfo(league, leg, operator) {
  const finalLeague = leg.league || league
  return {
    league: finalLeague,
    line: leg.line,
    outcome: leg.outcome,
    market: `${finalLeague}_${leg.market.name}`,
    odds: leg.odds || getOddsObjectFrom(leg, [operator]),
    participant: leg.type === 'team' ? getTeamDisplayName(finalLeague, leg.team) : getPlayerFullDisplayName(leg.player),
    participant_id_internal: leg.type === 'team' ? leg.team.teamId : getPlayerId(leg.player),
    type: leg.type,
    alternate: leg.alternate,
    gameId: leg?.gameId,
    ...getLegEntityInfo(finalLeague, leg)
  }
}
