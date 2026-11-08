import InitialsImage from './initials-image.js';
import { compress, decompress } from 'lz-string';
import { LOCAL_STORAGE_LOCATION_KEY, EVICTION_SAFE_KEYS, COLOR_CODES, GAME_TOTAL_MARKET_NAME, SPREAD_MARKET_NAME, SUPPORTED_LEAGUES} from './linemate-react-common/src/constants.js';
import { decimalPrecision, getPlayerName, isDictEmpty, isSuperUser, parseDateFromString, setOpacity } from './linemate-react-common/src/util.js';
import { getGameLineValue } from './linemate-react-common/src/betting-utils.js';
import { result } from 'lodash';
import { LOGOS_ASSETS_BASE, TEAM_LOGOS_ASSETS_BASE } from './react-web-constants.js';

export function canAccessPredictionMarkets(location, userAttributes) {
  return isSuperUser(userAttributes) || location?.country?.code === 'US';
}

export function getPlayerImage(player, size, fontSize) {
  var firstLetter = "";
  var secondLetter = "";
  if (!isDictEmpty(player)) {
    firstLetter = player.info.firstName.charAt(0);
    secondLetter = player.info.lastName.charAt(0);
  }
  // if (isDictEmpty(player) || player.imageURL == null) {
  return (
      <div style={{display: 'inline-block', verticalAlign: 'middle', height: `${size}px`, width: `${size}px`}}>
          <InitialsImage  firstLetter={firstLetter}
                          secondLetter={secondLetter}
                          fontSize={fontSize}/>
      </div>
  )
  // }
  // return <img class="rounded-icon" style={{backgroundColor: '#F3F4F6', objectFit: 'cover'}} src={player.imageURL} height={size} width={size} alt=""/>
}



// https://stackoverflow.com/questions/4391575/how-to-find-the-size-of-localstorage
export function getLocalStorageSize() {
  var _lsTotal = 0,
    _xLen, _x;
  for (_x in localStorage) {
      if (!localStorage.hasOwnProperty(_x)) {
          continue;
      }
      _xLen = ((localStorage[_x].length + _x.length) * 2);
      _lsTotal += _xLen;
      console.log(_x.substr(0, 50) + " = " + (_xLen / 1024).toFixed(2) + " KB")
  };
  return (_lsTotal / 1024).toFixed(2) + " KB";
}
  
export function cleanupLocalStorage() {
  Object.keys(localStorage).map((key) => {
    try {
      const cacheEntry = JSON.parse(decompress(localStorage[key]));
      const cacheEntryExpiry = cacheEntry.expiry;
      const currentTime = (new Date()).getTime();
      if (currentTime > cacheEntryExpiry) {
        // Entry exists in cache but is expired
        localStorage.removeItem(key);
      }
    } catch (err) {
      console.log(err);
      console.log(`Error parsing local storage entry with key ${key}`)
    }
  })
}
  
  
  
// TODO: we should apply the versioning to the fetch proxy as well
export function getLocalStorageLocation(version) {
  if (!window.localStorage[LOCAL_STORAGE_LOCATION_KEY]) {
    return {};
  }

  try {
    const cacheEntry = JSON.parse(decompress(window.localStorage[LOCAL_STORAGE_LOCATION_KEY]));
    const cacheEntryExpiry = cacheEntry.expiry;
    const cacheEntryVersion = cacheEntry.version;
    const currentTime = (new Date()).getTime();
    if (currentTime > cacheEntryExpiry || !cacheEntryVersion || cacheEntryVersion !== version) {
      // Entry exists in cache but is expired or outdated in terms of version
      window.localStorage.removeItem(LOCAL_STORAGE_LOCATION_KEY);
      return {};
    }
    return cacheEntry.value;
  } catch (err) {
    console.log(err);
    console.log(`Error parsing local storage location`)
    return {};
  }
}
  
/**
 * 
 * @param {string} key                Key in local storage under which the data will be saved
 * @param {Object} data               Data to be saved, assumed to be in json/dictionary format
 * @param {string} version            Version of the data. Futureproofing backwards compatibility in case we switch the data format
 * @param {Long} ttl                  The time to live of the entry. The current time will be appended to this
 * @param {Boolean} shouldMakeSpace   Whether or not we should make space for this entry should the local storage be full
 * @param {Number} iteration          The recursive iteration at which we are if we need to make space. This is capped at an arbitrary number of 5
 */
export function saveLocalStorage(key, data, version, ttl, shouldMakeSpace, iteration) {
  const currentTime = (new Date()).getTime();
  try {
    window.localStorage.setItem(key, compress(JSON.stringify({version: version, expiry: currentTime + ttl, value: data})));
  } catch (e) {
    if ((e.code === "22" || e.code === "1024") && shouldMakeSpace && iteration < 5) {
      evictFromLocalStorage(EVICTION_SAFE_KEYS);
      saveLocalStorage(key, data, version, ttl, shouldMakeSpace, iteration + 1);
    }
  }
}

// Primarily designed to create space for the most important key(s)
// Input is expected to be a set of strings corresponding to keys that should not be evicted
// Will find the first key in local storage not matching a key from the 'evictionSafeKeys' set
// This should only be called after the local storage has been cleaned up and expired entries have already been evicted
export function evictFromLocalStorage(evictionSafeKeys) {
  Object.keys(localStorage).map((key) => {
    if (!evictionSafeKeys.has(key)) {
      localStorage.removeItem(key);
    }
  })
}

// TODO: look at other places using the color and switch to the new one
// Builds graph data for the Nivo bar graph
// Line is optional. If not provided keep the original opacity
export function buildGraphData(league, type, betType, teamCode, games, line) {
  var trendsGraphData = [];
  games.forEach((game) => {
      var gameEntry = {};
      gameEntry["key"] = `${game.opposingTeam} (${String(parseDateFromString(game.timestamp).month).padStart(2, '0')}/${String(parseDateFromString(game.timestamp).day).padStart(2, '0')}/${String(parseDateFromString(game.timestamp).year)})`;
      // Would be cool if we tracked double header on a team-game level but I guess we forgot to? Will use the game ID instead
      // Standard game id is 3 pieces <date>-<away>-<home>, for MLB with double header we have <date>-<away>-<home>-<game number>
      const gameIdParts = game.gameID.split("-");
      if (league === "mlb" && gameIdParts.length > 3) {
          const gameNumber = gameIdParts[3];
          gameEntry["key"] += ` (${gameNumber})`;
      }
      
      gameEntry[betType] = getGameLineValue(league, type, game, betType);
      gameEntry[`color`] = setOpacity(SUPPORTED_LEAGUES[league]?.teams?.colors?.[getTheme()]?.[teamCode.toLowerCase()] ?? "var(--color-fig-default)", !line || gameEntry[betType] > line ? 1 : 0.5)      
      
      trendsGraphData.push(gameEntry);
  })
  return trendsGraphData;
}

export function getPlayerTitle(player, league, includePosition, includeHandedness) {
  if (!player) {
      return "";
  }
  var title = `${getPlayerName(player)}`;
  if (includePosition) {
      title += ` - ${player.info.position}`;
  }
  if (league !== "mlb" || !includeHandedness) {
      return title;
  }
  // Here we could write RHB/LHB or RHP/LHP but we won't write the B or P to match the picker which is harder to include the B or P in the current design
  if (player.info.position === "P" || player.info.position === "SP" || player.info.position === "RP") {
      title += ` (${player.info.pitchingHand}H)`;
  } else {
      title += ` (${player.info.battingHand}H)`;
  }
  return title;
}

export function getTeamId(team) {
  if (typeof team === 'string') {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(team)
      ? team
      : null;
  }

  return team?.teamId || team?.id || team?.currentTeamId || team?.info?.teamId || team?.info?.id || null;
}

export function getTeamIdByCode(teams, teamCode) {
  const normalizedTeamCode = String(teamCode || '').toLowerCase();
  if (!normalizedTeamCode) {
    return null;
  }

  const team = (Array.isArray(teams) ? teams : Object.values(teams || {})).find((candidate) =>
    String(candidate?.code || candidate?.info?.code || '').toLowerCase() === normalizedTeamCode
  );

  return getTeamId(team);
}

export function getTeamLogoPath(league, teamId) {
  const normalizedLeague = String(league || '').toLowerCase();
  const normalizedTeamId = String(getTeamId(teamId) || '').toLowerCase();
  const sport = SUPPORTED_LEAGUES[normalizedLeague]?.sport?.id

  if (!normalizedTeamId || !sport) {
    return getLeagueLogoPath(normalizedLeague);
  }

  return `${TEAM_LOGOS_ASSETS_BASE}/${sport}/${normalizedTeamId}.svg`;
}

export function shouldUseRoundTeamLogoBackground(league) {
  return !["euro", "fifa-world-cup"].includes(league);
}

export function getLeagueLogoPath(league) {
  return `${LOGOS_ASSETS_BASE}/${league.toLowerCase()}/league.svg`
}

export function teamLogoPathOnErrorFallback(currentTarget, league) {
  currentTarget.onerror = null;
  currentTarget.src = getLeagueLogoPath(league)
}

function triggerThemeChangeEvent(themeChanged) {
  const themeEvent = new CustomEvent("themeChange", {detail: { theme: themeChanged}});
  window.dispatchEvent(themeEvent);
}

export function toggleTheme() {
  if (getTheme() === 'dark'){
      triggerThemeChangeEvent('light');
      return setTheme('light');
  } else {
      triggerThemeChangeEvent('dark');
      return setTheme('dark');
  }
}

export function setTheme(themeName) {
  localStorage.setItem('theme', themeName);
  document.documentElement.className = `theme-${themeName}`;
  return themeName;
}

const VALID_THEMES = new Set(['dark', 'light'])

export function getTheme() {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has('theme') && VALID_THEMES.has(searchParams.get('theme').toLowerCase())) {
    return searchParams.get('theme').toLowerCase()
  }
  const theme = localStorage.getItem('theme');
  if (theme) {
    return theme;
  }
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return isDark ? "dark" : "light";
}

export function getLatestAccessedFeatureVersion() {
  const lastAccessedFeatureVersion = localStorage.getItem('featureVersion')
  if (!lastAccessedFeatureVersion) {
    return null
  }
  try {
    return parseInt(lastAccessedFeatureVersion)
  } catch (error) {
    console.error(error)
    return null
  }
}

export function setLatestAccessedFeatureVersion(version) {
  localStorage.setItem('featureVersion', version)
}

export function openStripeBillingPortal(API_HOST, userToken) {
  const requestInfo = {
      headers: {'Authorization': "Bearer " + userToken}
  };
  fetch(`${API_HOST}/api/payment/v1/portal`, requestInfo).then(data => data.json())
  .then(result => {
      if (result.code && result.code > 200) {
          console.log("Error fetching stripe url");
      } else {
          window.open(result.redirect, '_blank').focus();
      }
  })
  .catch(error => {
      console.log("Error fetching stripe url", error);
  });
}

export function getStripeCheckoutSessionUrl(API_HOST, userToken, priceId, origin, callback, trackingId, promotionCodeId) {
  const requestInfo = {
      headers: {
          'Authorization': "Bearer " + userToken
      }
  };
  var url = `${API_HOST}/api/payment/v1/checkout?id=${priceId}`;
  if (origin && origin != "") {
      url += `&origin=${encodeURIComponent(origin)}`;
  }
  if (trackingId) {
      url += `&clientReferenceId=${encodeURIComponent(trackingId)}`;
  }
  if (promotionCodeId) {
      url += `&promotionCodeId=${encodeURIComponent(promotionCodeId)}`;
  }
  fetch(url, requestInfo).then(data => {return data.json();})
  .then((result) => callback(result.redirect))
  .catch(error => {
      console.log("Error getting checkout session: " + error);
  });
}

// TODO: consent ?
export function setAppsflyerUserId(userId) {
  if (typeof window.AF === 'function') {
    window.AF?.('pba', 'setCustomerUserId', userId)
  }
}

export function clearAppsflyerUserId() {
  setAppsflyerUserId('')
}

export function getTrendSignalIconPath(signal) {
    switch (signal?.type) {
        case "RECENT_FORM":
            return "/assets/trend-signals/bolt.svg";
        case "HEAD_TO_HEAD":
            return "/assets/trend-signals/shield.svg";
        case "SPLITS":
        case "HOME_SPLIT":
        case "AWAY_SPLIT":
            return "/assets/trend-signals/location-filled.svg";
        case "STARTER":
            return "/assets/trend-signals/star.svg";
        case "OPPONENT_RANK":
            return "/assets/trend-signals/trophy.svg";
        case "INJURY_IMPACT":
            return "/assets/trend-signals/injury.svg";
        case "WEATHER":
            return "/assets/trend-signals/weather.svg";
        case "VERSUS_STARTING_PITCHER":
            return "/assets/trend-signals/target.svg";
        default:
            return "/assets/trend-signals/bolt.svg";
    }
}

export function normalizeHighlightedSignalType(highlightedSignalType) {
    return typeof highlightedSignalType === "string"
        ? highlightedSignalType
        : highlightedSignalType?.type;
}

function formatOfferSectionTitle(type = "", t) {
  if (!type || !t) {
    return "";
  }

  return t(`home.offers.types.${type}`);
}

export function buildSignupOfferSections(offersByOperator = {}, excludedOperators = [], t) {
  const groupedSections = {}
  const excludedSet = new Set(excludedOperators.map((operator) => operator?.toLowerCase?.() || operator))

  Object.entries(offersByOperator).forEach(([operator, offers]) => {
    if (excludedSet.has(operator?.toLowerCase?.() || operator)) {
      return
    }

    const signupOffers = (offers || []).filter((offer) => offer?.type?.endsWith("_SIGNUP"))

    if (signupOffers.length === 0) {
      return
    }

    const sectionTitle = formatOfferSectionTitle(signupOffers[0].type, t)

    if (!groupedSections[sectionTitle]) {
      groupedSections[sectionTitle] = []
    }

    groupedSections[sectionTitle].push({
      operator,
      offers: signupOffers
    })
  })

  return Object.entries(groupedSections).map(([title, entries]) => ({
    title,
    entries
  }))
}

export function buildNonSignupOfferSections(offersByOperator = {}, excludedOperators = [], t) {
  const groupedSections = {}
  const excludedSet = new Set(
    excludedOperators.map((operator) => operator?.toLowerCase?.() || operator)
  )

  Object.entries(offersByOperator).forEach(([operator, offers]) => {
    if (excludedSet.has(operator?.toLowerCase?.() || operator)) {
      return
    }

    ;(offers || [])
      .filter((offer) => offer?.type && !offer.type.includes("_SIGNUP"))
      .forEach((offer) => {
        if (!groupedSections[offer.type]) {
          groupedSections[offer.type] = []
        }

        groupedSections[offer.type].push({
          operator,
          offers: [offer],
        })
      })
  })

  return Object.entries(groupedSections).map(([type, entries]) => ({
    type,
    title: formatOfferSectionTitle(type, t),
    entries,
  }))
}
