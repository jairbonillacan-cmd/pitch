import React from 'react';

import '../components/App.scss'

import GlobalContext from '../components/GlobalContext';
import Button from '../components/Button';
import { API_HOST, CHEATSHEET_STYLES } from '../react-web-constants';
import { toJpeg } from 'html-to-image';
import { getPlayerId, getPlayerName, isSoccer, jsonOrDefault, parseDate, parseDateFromString } from '../linemate-react-common/src/util';
import { getMarketDescriptionFromTrend, supportedTrendFilter } from '../linemate-react-common/src/betting-utils';
import { getLeagueLogoPath, getTeamIdByCode, getTeamLogoPath } from '../react-web-utils';
import Loader from '../components/Loader';

const getMainTrends = (league) =>
    fetch(`${API_HOST}/api/${league}/v1/discovery/cards?premium=true`)
    .then(response => jsonOrDefault(response, []))
    .then(trends => trends.filter(trend => supportedTrendFilter(league, trend)))
    .catch(console.log)

const getAltTrends = (league) =>
    fetch(`${API_HOST}/api/${league}/v1/discovery/cards?cardGroup=ALTERNATES&premium=true`)
    .then(response => jsonOrDefault(response, []))
    .then(trends => trends.filter(trend => supportedTrendFilter(league, trend)))
    .catch(console.log)

const getMainTrendsAndGames = (league, recordType) => 
    Promise.all([
        fetch(`${API_HOST}/api/${league}/v1/discovery/cards?premium=true`).then(response => jsonOrDefault(response, [])).then(trends => trends.filter(trend => supportedTrendFilter(league, trend))).catch(console.log),
        fetch(`${API_HOST}/api/${league}/v2/games/current?${recordType ? "recordType=" + recordType : ""}`).then(response => jsonOrDefault(response, [])).catch(console.log)
    ]).catch(console.log)

const getAltTrendsAndGames = (league, recordType) => 
    Promise.all([
        fetch(`${API_HOST}/api/${league}/v1/discovery/cards?cardGroup=ALTERNATES&premium=true`).then(response => jsonOrDefault(response, [])).then(trends => trends.filter(trend => supportedTrendFilter(league, trend))).catch(console.log),
        fetch(`${API_HOST}/api/${league}/v2/games/current?${recordType ? "recordType=" + recordType : ""}`).then(response => jsonOrDefault(response, [])).catch(console.log)
    ]).catch(console.log)

const recentFormHitRecordGameSort = (a, b) => {
    const hitRecordA = getCustomRecentFormHitRecord(a)
    const hitRecordB = getCustomRecentFormHitRecord(b)
    const hitRateResult = hitRecordB.hitRate - hitRecordA.hitRate
    if (hitRateResult !== 0) {
        return hitRateResult;
    }
    return hitRecordB.games - hitRecordA.games
}

const headToHeadHitRecordGameSort = (a, b) => {
    const hitRecordA = getCustomHeadToHeadHitRecord(a)
    const hitRecordB = getCustomHeadToHeadHitRecord(b)
    const hitRateResult = hitRecordB.hitRate - hitRecordA.hitRate
    if (hitRateResult !== 0) {
        return hitRateResult;
    }
    return hitRecordB.games - hitRecordA.games
}

const getCustomRecentFormHitRecord = (trend) => {
    const line = trend.line.toFixed(1)
    const outcome = trend.outcome
    var customHitRateOutcomeName = `CUSTOM_RECENT_FORM_${outcome.toUpperCase()}`
    // For team props since back-end hasn't necessarily done the over/under custom hit rates at the time of writing this, 
    //  we'll check for either with or without the outcome
    // Make sure to check trend.line as opposed to the formatted line since the formatted line with the === comparison won't work
    if (outcome === 'cover' && trend.line === 0) {
        return trend.market.pregameHitRecords?.cover?.[customHitRateOutcomeName]?.all || trend.market.pregameHitRecords?.cover["CUSTOM_RECENT_FORM"].all
    }
    return trend.market.pregameHitRecords[`${line}`]?.[customHitRateOutcomeName]?.all || trend.market.pregameHitRecords[`${line}`]["CUSTOM_RECENT_FORM"].all
}

const getCustomHeadToHeadHitRecord = (trend) => {
    const line = trend.line.toFixed(1)
    const outcome = trend.outcome
    const customHitRateOutcomeName = `CUSTOM_HEAD_TO_HEAD_${outcome.toUpperCase()}`
    // For team props since back-end hasn't necessarily done the over/under custom hit rates at the time of writing this, 
    //  we'll check for either with or without the outcome
    if (outcome === 'cover' && trend.line === 0) {
        return trend.market.pregameHitRecords?.cover?.[customHitRateOutcomeName]?.all || trend.market.pregameHitRecords?.cover["CUSTOM_HEAD_TO_HEAD"].all
    }
    return trend.market.pregameHitRecords[`${line}`]?.[customHitRateOutcomeName]?.all || trend.market.pregameHitRecords[`${line}`]["CUSTOM_HEAD_TO_HEAD"].all
}

const buildMarketInfo = (league, trend) => {
    return getMarketDescriptionFromTrend(league, trend, [])
}

const trendToSheetEntry = (league, trend, getHitRecordFunction) => {
    const fn = getHitRecordFunction || getCustomRecentFormHitRecord
    const hitRecord = fn(trend)
    return {
        team: trend.team.code,
        subject: trend.type === "player" ? getPlayerName(trend.player) : trend.team.code,
        marketInfo: buildMarketInfo(league, trend),
        annotation: `${hitRecord.hits}/L${hitRecord.games} Games`
    }
}

const trendToSheetEntryWithOpponent = (league, trend) => {
    const hitRecord = getCustomHeadToHeadHitRecord(trend)
    return {
        team: trend.team.code,
        subject: trend.type === "player" ? getPlayerName(trend.player) : trend.team.code,
        marketInfo: buildMarketInfo(league, trend),
        annotation: `${hitRecord.hits}/L${hitRecord.games} vs ${trend.opposingTeam.code}`
    }
}

const buildCheatsheetData = (title, sheetEntries, subtitle) => {
    const dateInfo = parseDate(new Date())
    return {
        title: title,
        subtitle: subtitle || dateInfo.formattedLong.toUpperCase(),
        entries: sheetEntries
    }
}

const recentForm100Filter = (trend) => trend.outcome === "over" && trend['type'] === "player" && trend.narratives.includes('RECENT_FORM')// && trend.insights[0]['annotation'] == '100%'
const recentForm100FilterTeam = (trend) => (trend.outcome === "over" || trend.outcome === 'cover') && trend['type'] === "team" && trend.narratives.includes('RECENT_FORM')// && trend.insights[0]['annotation'] == '100%'
const headToHead100Filter = (trend) => trend.outcome === "over" && trend['type'] === "player" && trend.narratives.includes('HEAD_TO_HEAD')// && trend.insights[trend.narratives.indexOf('HEAD_TO_HEAD')]['annotation'] == '100%'
const headToHead100FilterTeam = (trend) => (trend.outcome === "over" || trend.outcome === 'cover') && trend['type'] === "team" && trend.narratives.includes('HEAD_TO_HEAD')// && trend.insights[trend.narratives.indexOf('HEAD_TO_HEAD')]['annotation'] == '100%'

// Keep only the first instance of a particular player (preserves order)
// Assumes the input trend and all the trends are player only
const filterDuplicates = (trend, index, allTrends) => allTrends.findIndex(x => x.type === "player" ? getPlayerId(x.player) === getPlayerId(trend.player) : x.team.code === trend.team.code) === index

const getSheetSubtitle= (games) => {
    var subtitle = null;
    if (games && games.length > 0 && games[0]?.title) {
        subtitle = games[0]?.title
    }
    return subtitle
}

// TODO: for SNF only do night games
// Note: some have the same data but use a different format for displaying the text (last X vs last X vs team)
//  This means that even if we're building H2H data we may not always map the trend to a H2H format, we may just write last X
// Variables: 
// - main/alt trends
// - initial filter for 100% (recent vs h2h)
// - sort (recent vs h2h)
// - number of entries (slice)
// - final mapping format (recent for or h2h indicating the opponent)
// NOTE: IF ANY TITLES CHANGE HERE MAKE SURE TO UPDATE IT IN BUNDLES AS IT RELIES ON THAT
// TODO: switch to some id to make it easier fo bundles
const SOCIAL_MEDIA_ACTIONS = {
    "nba": [
        {
            "title": "100% Season Streaks",
            "subtitle": "- Top 10 players\n- 100% Recent Form Main lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getMainTrends("nba")
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nba", trend))
                                        return buildCheatsheetData('100% Season Streaks', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Alternate Lines",
            "subtitle": "- Top 10 players\n- 100% Recent Form Alternate lines\n- Overs only\n- No Steals or Turnovers\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getAltTrends("nba")
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.market.name !== 'STEALS' && trend.market.name !== "TURNOVERS" && !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nba", trend))
                                        return buildCheatsheetData('100% Alternate Lines', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Versus Opponent",
            "subtitle": "- Top 10 players\n- 100% Head to Head Alternate lines\n- Overs only\n- No Steals or Turnovers\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getAltTrends("nba")
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(headToHead100Filter)
                                            .filter(trend => trend.market.name !== 'STEALS' && trend.market.name !== "TURNOVERS" && !trend.market.name.endsWith("_1Q"))
                                            .sort(headToHeadHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntryWithOpponent("nba", trend))
                                        return buildCheatsheetData('100% Versus Opponent', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Season Streaks (MEGA LIST)",
            "subtitle": "- Top 12 players\n- 100% Recent Form Main lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getMainTrends("nba")
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nba", trend))
                                        return buildCheatsheetData('100% Season Streaks', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Alternate Lines (MEGA LIST)",
            "subtitle": "- Top 12 players\n- 100% Recent Form Alternate lines\n- Overs only\n- No Steals or Turnovers\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getAltTrends("nba")
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.market.name !== 'STEALS' && trend.market.name !== "TURNOVERS" && !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nba", trend))
                                        return buildCheatsheetData('100% Alternate Lines', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Versus Opponent (MEGA LIST)",
            "subtitle": "- Top 12 players\n- 100% Head to Head Alternate lines\n- Overs only\n- No Steals or Turnovers\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getAltTrends("nba")
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(headToHead100Filter)
                                            .filter(trend => trend.market.name !== 'STEALS' && trend.market.name !== "TURNOVERS" && !trend.market.name.endsWith("_1Q"))
                                            .sort(headToHeadHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntryWithOpponent("nba", trend))
                                        return buildCheatsheetData('100% Versus Opponent', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% 1st Quarter Trends",
            "subtitle": "- Top 10 players\n- 100% 1Q Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getMainTrends("nba")
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nba", trend))
                                        return buildCheatsheetData('100% 1st Quarter Trends', sheetEntries)
                                    }),
            "finePrint": null
        }
    ],
    "wnba": [
        {
            "title": "100% Season Streaks",
            "subtitle": "- Top 10 players\n- 100% Recent Form Main lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getMainTrends(league)
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry(league, trend))
                                        return buildCheatsheetData('100% Season Streaks', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Alternate Lines",
            "subtitle": "- Top 10 players\n- 100% Recent Form Alternate lines\n- Overs only\n- No Steals or Turnovers\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getAltTrends(league)
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.market.name !== 'STEALS' && trend.market.name !== "TURNOVERS" && !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry(league, trend))
                                        return buildCheatsheetData('100% Alternate Lines', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Versus Opponent",
            "subtitle": "- Top 10 players\n- 100% Head to Head Alternate lines\n- Overs only\n- No Steals or Turnovers\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getAltTrends(league)
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(headToHead100Filter)
                                            .filter(trend => trend.market.name !== 'STEALS' && trend.market.name !== "TURNOVERS" && !trend.market.name.endsWith("_1Q"))
                                            .sort(headToHeadHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntryWithOpponent(league, trend))
                                        return buildCheatsheetData('100% Versus Opponent', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Season Streaks (MEGA LIST)",
            "subtitle": "- Top 12 players\n- 100% Recent Form Main lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getMainTrends(league)
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry(league, trend))
                                        return buildCheatsheetData('100% Season Streaks', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Alternate Lines (MEGA LIST)",
            "subtitle": "- Top 12 players\n- 100% Recent Form Alternate lines\n- Overs only\n- No Steals or Turnovers\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getAltTrends(league)
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.market.name !== 'STEALS' && trend.market.name !== "TURNOVERS" && !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry(league, trend))
                                        return buildCheatsheetData('100% Alternate Lines', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Versus Opponent (MEGA LIST)",
            "subtitle": "- Top 12 players\n- 100% Head to Head Alternate lines\n- Overs only\n- No Steals or Turnovers\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getAltTrends(league)
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(headToHead100Filter)
                                            .filter(trend => trend.market.name !== 'STEALS' && trend.market.name !== "TURNOVERS" && !trend.market.name.endsWith("_1Q"))
                                            .sort(headToHeadHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntryWithOpponent(league, trend))
                                        return buildCheatsheetData('100% Versus Opponent', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% 1st Quarter Trends",
            "subtitle": "- Top 10 players\n- 100% 1Q Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getMainTrends(league)
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry(league, trend))
                                        return buildCheatsheetData('100% 1st Quarter Trends', sheetEntries)
                                    }),
            "finePrint": null
        }
    ],
    "nhl": [
        {
            "title": "100% Season Streaks",
            "subtitle": "- Top 10 players\n- 100% Recent Form Main lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getMainTrends("nhl")
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nhl", trend))
                                        return buildCheatsheetData('100% Season Streaks', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Alternate Lines",
            "subtitle": "- Top 10 players\n- 100% Recent Form Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getAltTrends("nhl")
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nhl", trend))
                                        return buildCheatsheetData('100% Alternate Lines', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Versus Opponent",
            "subtitle": "- Top 10 players\n- 100% Head to Head Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getAltTrends("nhl")
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(headToHead100Filter)
                                            .sort(headToHeadHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntryWithOpponent("nhl", trend))
                                        return buildCheatsheetData('100% Versus Opponent', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Season Streaks (MEGA LIST)",
            "subtitle": "- Top 12 players\n- 100% Recent Form Main lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getMainTrends("nhl")
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nhl", trend))
                                        return buildCheatsheetData('100% Season Streaks', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Alternate Lines (MEGA LIST)",
            "subtitle": "- Top 12 players\n- 100% Recent Form Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getAltTrends("nhl")
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nhl", trend))
                                        return buildCheatsheetData('100% Alternate Lines', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Versus Opponent (MEGA LIST)",
            "subtitle": "- Top 12 players\n- 100% Head to Head Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getAltTrends("nhl")
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(headToHead100Filter)
                                            .sort(headToHeadHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntryWithOpponent("nhl", trend))
                                        return buildCheatsheetData('100% Versus Opponent', sheetEntries)
                                    }),
            "finePrint": null
        }
    ],
    "nfl": [
        {
            "title": "100% Season Streaks",
            "subtitle": "- Top 10 ALL POSITIONS\n- 100% Recent Form Main lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getMainTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        const trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0 && games[0]?.title) {
                                            subtitle = games[0]?.title
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('100% Season Streaks', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Alternate Lines",
            "subtitle": "- Top 10 ALL POSITIONS\n- 100% Recent Form Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getAltTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        const trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0 && games[0]?.title) {
                                            subtitle = games[0]?.title
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('100% Alternate Lines', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% 1Q Alternate Lines",
            "subtitle": "- Top 10 ALL POSITIONS\n- 100% 1Q Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getAltTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        const trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0 && games[0]?.title) {
                                            subtitle = games[0]?.title
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('100% 1Q Alternate Lines', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% 1Q Alternate Lines (MEGA LIST)",
            "subtitle": "- Top 12 ALL POSITIONS\n- 100% 1Q Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getAltTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        const trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0 && games[0]?.title) {
                                            subtitle = games[0]?.title
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('100% 1Q Alternate Lines', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Season Streaks (MEGA LIST)",
            "subtitle": "- Top 12 ALL POSITIONS\n- 100% Recent Form Main lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getMainTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        const trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0 && games[0]?.title) {
                                            subtitle = games[0]?.title
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('100% Season Streaks', sheetEntries, subtitle)
                                    }),
            "action": null,
            "finePrint": null
        },
        {
            "title": "100% Alternate Lines (MEGA LIST)",
            "subtitle": "- Top 12 ALL POSITIONS\n- 100% Recent Form Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getAltTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        const trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0 && games[0]?.title) {
                                            subtitle = games[0]?.title
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('100% Alternate Lines', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% QB Alternate Lines",
            "subtitle": "- Top 10 QBs\n- 100% Recent Form Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getAltTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        const trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0 && games[0]?.title) {
                                            subtitle = games[0]?.title
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.player.position === "QB" && !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('100% QB Alternate Lines', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% RB Alternate Lines",
            "subtitle": "- Top 10 RBs\n- 100% Recent Form Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getAltTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        const trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0 && games[0]?.title) {
                                            subtitle = games[0]?.title
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.player.position === "RB" && !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('100% RB Alternate Lines', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% WR Alternate Lines",
            "subtitle": "- Top 10 WRs\n- 100% Recent Form Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getAltTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        const trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0 && games[0]?.title) {
                                            subtitle = games[0]?.title
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.player.position === "WR" && !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('100% WR Alternate Lines', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% TE Alternate Lines",
            "subtitle": "- Top 10 TEs\n- 100% Recent Form Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getAltTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        const trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0 && games[0]?.title) {
                                            subtitle = games[0]?.title
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.player.position === "TE" && !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('100% TE Alternate Lines', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "TNF Alternate Line Trends",
            "subtitle": "- Top 10 from TNF\n- Recent Form Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getAltTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        var trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0) {
                                            // Find the Thursday game(s)
                                            const gameIds = new Set(
                                                games.filter((game) => {
                                                    const parsedDate = parseDateFromString(game.timestamp)
                                                    // 0-based starting Sunday, 4 is thursday
                                                    return parsedDate.dayOfWeek === 4;
                                                })
                                                .map((game) => game.id)
                                            )
                                            trends = trends.filter(trend => gameIds.has(trend.gameId))
                                            subtitle = "Thursday Night Football"
                                        } else {
                                            return buildCheatsheetData('Alternate Line Trends', [], subtitle)
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('Alternate Line Trends', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "SNF Alternate Line Trends",
            "subtitle": "- Top 10 from SNF\n- Recent Form Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getAltTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        var trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0) {
                                            // Find the sunday game(s)
                                            const gameIds = new Set(
                                                games.filter((game) => {
                                                    const parsedDate = parseDateFromString(game.timestamp)
                                                    // 0-based starting Sunday, 0 is sunday
                                                    return parsedDate.dayOfWeek === 0;
                                                })
                                                .map((game) => game.id)
                                            )
                                            trends = trends.filter(trend => gameIds.has(trend.gameId))
                                            subtitle = "Sunday Night Football"
                                        } else {
                                            return buildCheatsheetData('Alternate Line Trends', [], subtitle)
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('Alternate Line Trends', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "MNF Alternate Line Trends",
            "subtitle": "- Top 10 from MNF\n- Recent Form Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getAltTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        var trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0) {
                                            // Find the monday game(s)
                                            const gameIds = new Set(
                                                games.filter((game) => {
                                                    const parsedDate = parseDateFromString(game.timestamp)
                                                    // 0-based starting Sunday, 1 is monday
                                                    return parsedDate.dayOfWeek === 1;
                                                })
                                                .map((game) => game.id)
                                            )
                                            trends = trends.filter(trend => gameIds.has(trend.gameId))
                                            subtitle = "Monday Night Football"
                                        } else {
                                            return buildCheatsheetData('Alternate Line Trends', [], subtitle)
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => !trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('Alternate Line Trends', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "TNF 1st Quarter Trends",
            "subtitle": "- Top 10 from TNF\n- 1st Quarter alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getAltTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        var trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0) {
                                            // Find the Thursday game(s)
                                            const gameIds = new Set(
                                                games.filter((game) => {
                                                    const parsedDate = parseDateFromString(game.timestamp)
                                                    // 0-based starting Sunday, 4 is thursday
                                                    return parsedDate.dayOfWeek === 4;
                                                })
                                                .map((game) => game.id)
                                            )
                                            trends = trends.filter(trend => gameIds.has(trend.gameId))
                                            subtitle = "Thursday Night Football"
                                        } else {
                                            return buildCheatsheetData('1st Quarter Trends', [], subtitle)
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('1st Quarter Trends', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "SNF 1st Quarter Trends",
            "subtitle": "- Top 10 from SNF\n- 1st Quarter alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getAltTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        var trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0) {
                                            // Find the sunday game(s)
                                            const gameIds = new Set(
                                                games.filter((game) => {
                                                    const parsedDate = parseDateFromString(game.timestamp)
                                                    // 0-based starting Sunday, 0 is sunday
                                                    return parsedDate.dayOfWeek === 0;
                                                })
                                                .map((game) => game.id)
                                            )
                                            trends = trends.filter(trend => gameIds.has(trend.gameId))
                                            subtitle = "Sunday Night Football"
                                        } else {
                                            return buildCheatsheetData('1st Quarter Trends', [], subtitle)
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('1st Quarter Trends', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "MNF 1st Quarter Trends",
            "subtitle": "- Top 10 from MNF\n- 1st Quarter alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getAltTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        var trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0) {
                                            // Find the monday game(s)
                                            const gameIds = new Set(
                                                games.filter((game) => {
                                                    const parsedDate = parseDateFromString(game.timestamp)
                                                    // 0-based starting Sunday, 1 is monday
                                                    return parsedDate.dayOfWeek === 1;
                                                })
                                                .map((game) => game.id)
                                            )
                                            trends = trends.filter(trend => gameIds.has(trend.gameId))
                                            subtitle = "Monday Night Football"
                                        } else {
                                            return buildCheatsheetData('1st Quarter Trends', [], subtitle)
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.market.name.endsWith("_1Q"))
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('1st Quarter Trends', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "Anytime Touchdown Trends",
            "subtitle": "- Top 10 players\n- Anytime touchdown props\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getMainTrendsAndGames("nfl", recordType)
                                    .then((promises) => {
                                        const trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0 && games[0]?.title) {
                                            subtitle = games[0]?.title
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.market.name === "ANYTIME_TOUCHDOWN")
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("nfl", trend))
                                        return buildCheatsheetData('Anytime Touchdown Trends', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        }
    ],
    "ncaaf": [
        {
            "title": "100% Touchdown Streaks",
            "subtitle": "- Top 12 players\n- 100% Recent Form ATD\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getMainTrends("ncaaf")
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.market.name === "ANYTIME_TOUCHDOWN")
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("ncaaf", trend))
                                        return buildCheatsheetData('100% Touchdown Streaks', sheetEntries)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Alternate Lines",
            "subtitle": "- Top 12 players\n- 100% Recent Form Alternate lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getAltTrends("ncaaf")
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("ncaaf", trend))
                                        return buildCheatsheetData('100% Alternate Lines', sheetEntries)
                                    }),
            "finePrint": null
        }
    ],
    // TODO: add 100% team form and 100% alt lines
    "ncaab": [
        {
            "title": "100% Season Streaks",
            "subtitle": "- Top 12 players\n- 100% Recent Form Main Lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>   getMainTrends("ncaab")
                                    .then((trends) => {
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry("ncaab", trend))
                                        return buildCheatsheetData('100% Season Streaks', sheetEntries)
                                    }),
            "finePrint": null
        }
    ],
    "soccer": [
        {
            "title": "100% Season Streaks",
            "subtitle": "- Top 10 players\n- 100% Recent Form Main Lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>     getMainTrendsAndGames(league, recordType)
                                                        .then((promises) => {
                                                            const subtitle = getSheetSubtitle(promises[1])
                                                            const trends = promises[0]
                                                            const sheetEntries = trends.filter(recentForm100Filter)
                                                                .sort(recentFormHitRecordGameSort)
                                                                .filter(filterDuplicates)
                                                                .slice(0, 10)
                                                                .map((trend) => trendToSheetEntry(league, trend))
                                                            return buildCheatsheetData('100% Season Streaks', sheetEntries, subtitle)
                                                        }),
            "finePrint": null
        },
        {
            "title": "100% Season Streaks (MEGA LIST)",
            "subtitle": "- Top 12 players\n- 100% Recent Form Main Lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>     getMainTrendsAndGames(league, recordType)
                                                        .then((promises) => {
                                                            const subtitle = getSheetSubtitle(promises[1])
                                                            const trends = promises[0]
                                                            const sheetEntries = trends.filter(recentForm100Filter)
                                                                .sort(recentFormHitRecordGameSort)
                                                                .filter(filterDuplicates)
                                                                .slice(0, 10)
                                                                .map((trend) => trendToSheetEntry(league, trend))
                                                            return buildCheatsheetData('100% Season Streaks', sheetEntries, subtitle)
                                                        }),
            "finePrint": null
        },
        {
            "title": "Shots Streaks",
            "subtitle": "- Top 10 players\n- Recent Form SHO & SOT Lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>     getMainTrendsAndGames(league, recordType)
                                                        .then((promises) => {
                                                            const subtitle = getSheetSubtitle(promises[1])
                                                            const trends = promises[0]
                                                            const sheetEntries = trends.filter(recentForm100Filter)
                                                                .filter(trend => trend.market.name.endsWith('SHOTS_ON_TARGET') || trend.market.name.endsWith('SHOTS'))
                                                                .sort(recentFormHitRecordGameSort)
                                                                .filter(filterDuplicates)
                                                                .slice(0, 10)
                                                                .map((trend) => trendToSheetEntry(league, trend))
                                                            return buildCheatsheetData('Shots Streaks', sheetEntries, subtitle)
                                                        }),
            "finePrint": null
        },
        {
            "title": "H2H Shots Streaks",
            "subtitle": "- Top 10 players\n- Head to Head SHO & SOT Lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>     getMainTrendsAndGames(league, recordType)
                                                        .then((promises) => {
                                                            const subtitle = getSheetSubtitle(promises[1])
                                                            const trends = promises[0]
                                                            const sheetEntries = trends.filter(headToHead100Filter)
                                                                .filter(trend => trend.market.name.endsWith('SHOTS_ON_TARGET') || trend.market.name.endsWith('SHOTS'))
                                                                .sort(headToHeadHitRecordGameSort)
                                                                .filter(filterDuplicates)
                                                                .slice(0, 10)
                                                                .map((trend) => trendToSheetEntryWithOpponent(league, trend))
                                                            return buildCheatsheetData('H2H Shots Streaks', sheetEntries, subtitle)
                                                        }),
            "finePrint": null
        },
        {
            "title": "Goal & Assist Streaks",
            "subtitle": "- Top 10 players\n- Recent Form G, AST & G or AST Lines\n-Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>     getMainTrendsAndGames(league, recordType)
                                                        .then((promises) => {
                                                            const subtitle = getSheetSubtitle(promises[1])
                                                            const trends = promises[0]
                                                            const sheetEntries = trends.filter(recentForm100Filter)
                                                                .filter(trend => trend.market.name === "GOALS" || trend.market.name === "ASSISTS" || trend.market.name === 'ANYTIME_GOAL_SCORER' || trend.market.name.endsWith('OR_MORE_ASSISTS'))
                                                                .sort(recentFormHitRecordGameSort)
                                                                .filter(filterDuplicates)
                                                                .slice(0, 10)
                                                                .map((trend) => trendToSheetEntry(league, trend))
                                                            return buildCheatsheetData('Goal & Assist Streaks', sheetEntries, subtitle)
                                                        }),
            "finePrint": null
        },
        {
            "title": "H2H Goal & Assist Streaks",
            "subtitle": "- Top 10 players\n- Head to Head G, AST & G or AST Lines\n-Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>     getMainTrendsAndGames(league, recordType)
                                                        .then((promises) => {
                                                            const subtitle = getSheetSubtitle(promises[1])
                                                            const trends = promises[0]
                                                            const sheetEntries = trends.filter(headToHead100Filter)
                                                                .filter(trend => trend.market.name === "GOALS" || trend.market.name === "ASSISTS" || trend.market.name === 'ANYTIME_GOAL_SCORER' || trend.market.name.endsWith('OR_MORE_ASSISTS'))
                                                                .sort(headToHeadHitRecordGameSort)
                                                                .filter(filterDuplicates)
                                                                .slice(0, 10)
                                                                .map((trend) => trendToSheetEntryWithOpponent(league, trend))
                                                            return buildCheatsheetData('H2H Goal & Assist Streaks', sheetEntries, subtitle)
                                                        }),
            "finePrint": null
        },
        {
            "title": "Team Streaks",
            "subtitle": "- Top 10 Team Props\n- Recent Form Main Lines (TT, Corners, Cards)\n- Overs only",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>     getMainTrendsAndGames(league, recordType)
                                                        .then((promises) => {
                                                            const subtitle = getSheetSubtitle(promises[1])
                                                            const trends = promises[0]
                                                            const sheetEntries = trends.filter(recentForm100FilterTeam)
                                                                .sort(recentFormHitRecordGameSort)
                                                                .filter(filterDuplicates)
                                                                .slice(0, 10)
                                                                .map((trend) => trendToSheetEntry(league, trend))
                                                            return buildCheatsheetData('Team Streaks', sheetEntries, subtitle)
                                                        }),
            "finePrint": null
        },
        {
            "title": "H2H Team Streaks",
            "subtitle": "- Top 10 Team Props\n- Head to Head Main Lines (TT, Corners, Cards)\n- Overs only",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>     getMainTrendsAndGames(league, recordType)
                                                        .then((promises) => {
                                                            const subtitle = getSheetSubtitle(promises[1])
                                                            const trends = promises[0]
                                                            const sheetEntries = trends.filter(headToHead100FilterTeam)
                                                                .sort(headToHeadHitRecordGameSort)
                                                                .filter(filterDuplicates)
                                                                .slice(0, 10)
                                                                .map((trend) => trendToSheetEntryWithOpponent(league, trend))
                                                            return buildCheatsheetData('H2H Team Streaks', sheetEntries, subtitle)
                                                        }),
            "finePrint": null
        }
    ],
    "mlb": [
        {
            "title": "100% Hits Streaks",
            "subtitle": "- Top 10 players\n- 100% Recent Form Main Lines\n- Overs only\n- No Player More than once\n- Hits only",
            "actionTitle": "Generate & Save",
            "action": async (league) =>     getMainTrends(league)
                                            .then((trends) => {
                                                const sheetEntries = trends.filter(recentForm100Filter)
                                                    .filter(trend => trend.market.name === "HITTER_HITS")
                                                    .sort(recentFormHitRecordGameSort)
                                                    .filter(filterDuplicates)
                                                    .slice(0, 10)
                                                    .map((trend) => trendToSheetEntry(league, trend))
                                                return buildCheatsheetData('100% Hits Streaks', sheetEntries)
                                            }),
            "finePrint": null
        },
        {
            "title": "100% Season Streaks",
            "subtitle": "- Top 10 players\n- 100% Recent Form Main Lines\n- Overs only\n- No Player More than once",
            "actionTitle": "Generate & Save",
            "action": async (league) =>     getMainTrends(league)
                                            .then((trends) => {
                                                const sheetEntries = trends.filter(recentForm100Filter)
                                                    .sort(recentFormHitRecordGameSort)
                                                    .filter(filterDuplicates)
                                                    .slice(0, 10)
                                                    .map((trend) => trendToSheetEntry(league, trend))
                                                return buildCheatsheetData('100% Season Streaks', sheetEntries)
                                            }),
            "finePrint": null
        }
    ],
    afl: [
        {
            "title": "Goal Streaks",
            "subtitle": "- Top 10 players\n- 100% Recent Form\n- Goals only",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getMainTrendsAndGames(league, recordType)
                                    .then((promises) => {
                                        const trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0 && games[0]?.title) {
                                            subtitle = games[0]?.title
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.market.name === "ANYTIME_GOAL_SCORER")
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry(league, trend))
                                        return buildCheatsheetData('Goal Streaks', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Player Streaks",
            "subtitle": "- Top 10 players\n- 100% Recent Form",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getMainTrendsAndGames(league, recordType)
                                    .then((promises) => {
                                        const trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0 && games[0]?.title) {
                                            subtitle = games[0]?.title
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry(league, trend))
                                        return buildCheatsheetData('100% Player Streaks', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Team Streaks",
            "subtitle": "- Top 10 team streaks\n- 100% Recent Form Main lines\n- Overs only",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getMainTrendsAndGames(league, recordType)
                                    .then((promises) => {
                                        const trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0 && games[0]?.title) {
                                            subtitle = games[0]?.title
                                        }
                                        const sheetEntries = trends.filter(recentForm100FilterTeam)
                                            .sort(recentFormHitRecordGameSort)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry(league, trend))
                                        return buildCheatsheetData('100% Team Streaks', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
    ],
    nrl: [
        {
            "title": "Anytime Try Scorer Streaks",
            "subtitle": "- Top 10 players\n- 100% Recent Form\n- Anytime Try Scorer only",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getMainTrendsAndGames(league, recordType)
                                    .then((promises) => {
                                        const trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0 && games[0]?.title) {
                                            subtitle = games[0]?.title
                                        }
                                        const sheetEntries = trends.filter(recentForm100Filter)
                                            .filter(trend => trend.market.name === "ANYTIME_TRY_SCORER")
                                            .sort(recentFormHitRecordGameSort)
                                            .filter(filterDuplicates)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry(league, trend))
                                        return buildCheatsheetData('Anytime Try Scorer Streaks', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
        {
            "title": "100% Team Streaks",
            "subtitle": "- Top 10 team streaks\n- 100% Recent Form Main lines\n- Overs only",
            "actionTitle": "Generate & Save",
            "action": async (league, recordType) =>   getMainTrendsAndGames(league, recordType)
                                    .then((promises) => {
                                        const trends = promises[0]
                                        const games = promises[1]
                                        var subtitle = null;
                                        if (games && games.length > 0 && games[0]?.title) {
                                            subtitle = games[0]?.title
                                        }
                                        const sheetEntries = trends.filter(recentForm100FilterTeam)
                                            .sort(recentFormHitRecordGameSort)
                                            .slice(0, 10)
                                            .map((trend) => trendToSheetEntry(league, trend))
                                        return buildCheatsheetData('100% Team Streaks', sheetEntries, subtitle)
                                    }),
            "finePrint": null
        },
    ]
}

const SOCIAL_MEDIA_BUNDLE_ACTIONS = {
    nba: [
        {
            "title": "NBA Main",
            "subtitle": "- 100% Alternate lines\n- 100% Versus opponent\n- 100% 1st quarter trends",
            "actionTitle": "Generate & Save",
            "sheets": ["100% Alternate Lines", "100% Versus Opponent", '100% 1st Quarter Trends'],
            "finePrint": null
        }
    ],
    wnba: [
        {
            "title": "WNBA Main",
            "subtitle": "- 100% Alternate lines\n- 100% Versus opponent\n- 100% 1st quarter trends",
            "actionTitle": "Generate & Save",
            "sheets": ["100% Alternate Lines", "100% Versus Opponent", '100% 1st Quarter Trends'],
            "finePrint": null
        }
    ],
    nhl: [
        {
            "title": "NHL Main",
            "subtitle": "- 100% Season Streaks\n- 100% Alternate Lines\n- 100% Versus Opponent",
            "actionTitle": "Generate & Save",
            "sheets": ["100% Season Streaks", "100% Alternate Lines", "100% Versus Opponent"],
            "finePrint": null
        }
    ],
    nfl: [
        {
            "title": "NFL Alts",
            "subtitle": "- 100% QB Alternate Lines\n- 100% RB Alternate Lines\n- 100% WR Alternate Lines\n- 100% TE Alternate Lines",
            "actionTitle": "Generate & Save",
            "sheets": ["100% QB Alternate Lines", "100% RB Alternate Lines", "100% WR Alternate Lines", "100% TE Alternate Lines"],
            "finePrint": null
        },
        {
            "title": "NFL Main",
            "subtitle": "- 100% Season Streaks\n- 100% 1Q Alternate Lines\n- 100% Alternate Lines",
            "actionTitle": "Generate & Save",
            "sheets": ["100% Season Streaks", "100% 1Q Alternate Lines", "100% Alternate Lines"],
            "finePrint": null
        },
        {
            "title": "NFL TNF",
            "subtitle": "- TNF Alternate Line Trends\n- TNF 1st Quarter Trends",
            "actionTitle": "Generate & Save",
            "sheets": ["TNF Alternate Line Trends", "TNF 1st Quarter Trends"],
            "finePrint": null
        },
        {
            "title": "NFL SNF",
            "subtitle": "- SNF Alternate Line Trends\n- SNF 1st Quarter Trends",
            "actionTitle": "Generate & Save",
            "sheets": ["SNF Alternate Line Trends", "SNF 1st Quarter Trends"],
            "finePrint": null
        },
        {
            "title": "NFL MNF",
            "subtitle": "- MNF Alternate Line Trends\n- MNF 1st Quarter Trends",
            "actionTitle": "Generate & Save",
            "sheets": ["MNF Alternate Line Trends", "MNF 1st Quarter Trends"],
            "finePrint": null
        },
    ],
    ncaaf: [
        {
            "title": "NCAAF Main",
            "subtitle": "- 100% Touchdown Streaks\n- 100% Alternate Lines",
            "actionTitle": "Generate & Save",
            "sheets": ["100% Touchdown Streaks", "100% Alternate Lines"],
            "finePrint": null
        }
    ],
    soccer: [
        {
            "title": "Soccer Main",
            "subtitle": "- 100% Season Streaks\n- Shots Streaks\n- Goal & Assist Streaks\n- Team Streaks",
            "actionTitle": "Generate & Save",
            "sheets": [
                "100% Season Streaks", 
                "Shots Streaks", 
                "Goal & Assist Streaks", 
                "Team Streaks", 
                "H2H Shots Streaks",
                "H2H Goal & Assist Streaks",
                "H2H Team Streaks"
            ],
            "finePrint": null
        }
    ],
    mlb: [
        {
            "title": "MLB Hits",
            "subtitle": "- 100% Hits Streaks\n- 100% Season Streaks",
            "actionTitle": "Generate & Save",
            "sheets": ["100% Hits Streaks", "100% Season Streaks"],
            "finePrint": null
        }
    ],
    afl: [
        {
            "title": "AFL Players",
            "subtitle": "- Goal Streaks\n- 100% Player Streaks",
            "actionTitle": "Generate & Save",
            "sheets": ["Goal Streaks", "100% Player Streaks"],
            "finePrint": null
        },
        {
            "title": "AFL Teams",
            "subtitle": "- 100% Team Streaks",
            "actionTitle": "Generate & Save",
            "sheets": ["100% Team Streaks"],
            "finePrint": null
        }
    ],
    nrl: [
        {
            "title": "NRL Players",
            "subtitle": "- Anytime Try Scorer Streaks",
            "actionTitle": "Generate & Save",
            "sheets": ["Anytime Try Scorer Streaks"],
            "finePrint": null
        },
        {
            "title": "NRL Teams",
            "subtitle": "- 100% Team Streaks",
            "actionTitle": "Generate & Save",
            "sheets": ["100% Team Streaks"],
            "finePrint": null
        }
    ]
}

const GOOGLE_FONTS_BASE_URL = "https://fonts.googleapis.com/css2"

const GOOGLE_FONTS_QUERY_PARAMS = {
    "Space Mono": "family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700",
    "Space Grotesk": "family=Space+Grotesk:wght@300..700",
    "Roboto Slab": "family=Roboto+Slab:wght@100..900",
    "Bebas Neue": "family=Bebas+Neue",
    "Inter": "family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900",
    "Fira Mono": "family=Fira+Mono:wght@400;500;700",
    "Fira Sans": "family=Fira+Sans:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900",
    "Poppins": "family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900",
    "Figtree": "family=Figtree:ital,wght@0,300..900;1,300..900",
    "Public Sans": "family=Public+Sans:ital,wght@0,100..900;1,100..900",
    "Sofia Sans": "family=Sofia+Sans:ital,wght@0,1..1000;1,1..1000",
    "Noto Sans": "family=Noto+Sans:ital,wght@0,100..900;1,100..900",
    "Rubik": "family=Rubik:ital,wght@0,300..900;1,300..900",
    "DM Sans": "family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000",
    "Geist": "family=Geist:wght@100..900",
    "IBM Plex Sans": "family=IBM+Plex+Sans:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700",
    "Sora": "family=Sora:wght@100..800",
    "Open Sans": "family=Open+Sans:ital,wght@0,300..800;1,300..800",
    "Domine": "family=Domine:wght@400..700",
    "Be Vietnam Pro": "family=Be+Vietnam+Pro:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900",
    "Bree Serif": "family=Bree+Serif",
    "Afacad": "family=Afacad:ital,wght@0,400..700;1,400..700",
    "Plus Jakarta Sans": "family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800",
    "Oswald": "family=Oswald:wght@200..700",
    "Asap": "family=Asap:ital,wght@0,100..900;1,100..900",
    "Onest": "family=Onest:wght@100..900",
    "Geologica": "family=Geologica:wght@100..900",
    "Instrument Sans": "family=Instrument+Sans",
    "Plus Jakarta Sans": "family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800",
    "Maven Pro": "family=Maven+Pro:wght@400..900",
    "Monda": "family=Monda:wght@400..700",
    "Radio Canada": "family=Radio+Canada:ital,wght@0,300..700;1,300..700",
    "Reddit Sans": "family=Reddit+Sans:ital,wght@0,200..900;1,200..900",
    "Prompt": "family=Prompt:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900",
    "Hind": "family=Hind:wght@300;400;500;600;700",
    "Lato": "family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900",
    "Libre Bodoni": "family=Libre+Bodoni:ital,wght@0,400..700;1,400..700",
    "Libre Franklin": "family=Libre+Franklin:ital,wght@0,100..900;1,100..900",
    "Gothic A1": "family=Gothic+A1",
    "Aleo": "family=Aleo:ital,wght@0,100..900;1,100..900",
    "Anuphan": "family=Anuphan:wght@100..700",
    "Archivo": "family=Archivo:ital,wght@0,100..900;1,100..900",
    "Alexandria": "family=Alexandria:wght@100..900",
    "Anaheim": "family=Anaheim:wght@400..800",
    "Bitter": "family=Bitter:ital,wght@0,100..900;1,100..900",
    "Bricolage Grotesque": "family=Bricolage+Grotesque:opsz,wght@12..96,200..800",
    "Heebo": "family=Heebo:wght@100..900",
    "Frank Ruhl Libre": "family=Frank+Ruhl+Libre:wght@300..900",
    "Schibsted Grotesk": "family=Schibsted+Grotesk:ital,wght@0,400..900;1,400..900",
    "Shadows Into Light": "family=Shadows+Into+Light",
    "Nanum Pen Script": "family=Nanum+Pen+Script",
    "Solitreo": "family=Solitreo"
}

// The name of the font is not necessary, it's part of the css named after the style number
// Assumes title and subtitle have the same theme, will re-use the title theme for subtitle
// All the theme options should be either 'light' or 'dark'
// All the alignment options should be either 'left' or 'center'
const STYLES = {
    "01": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        // family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900
        fonts: ["Inter"]
    },
    "02": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'center',
        // family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700
        // family=Space+Grotesk:wght@300..700
        fonts: ["Space Mono", "Space Grotesk"]
    },
    "03": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        // family=Roboto+Slab:wght@100..900
        fonts: ["Roboto Slab"]
    },
    "04": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Bebas+Neue
        fonts: ["Bebas Neue"]
    },
    "05": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        // family=Fira+Mono:wght@400;500;700
        // family=Fira+Sans:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900
        fonts: ["Fira Mono", "Fira Sans"]
    },
    "06": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'center',
        // family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900
        fonts: ["Poppins"]
    },
    "07": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        fontUrl: 'https://fonts.cdnfonts.com/css/satoshi',
        fonts: ["Satoshi"]
    },
    "08": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        fontUrl: 'https://fonts.cdnfonts.com/css/cabinet-grotesk',
        fonts: ["Cabinet Grotesk"]
    },
    "09": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'center',
        fonts: ["Sentient"]
    },
    "10": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        fontUrl: 'https://fonts.cdnfonts.com/css/switzer',
        fonts: ["Switzer"]
    },
    "11": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'left',
        // family=Figtree:ital,wght@0,300..900;1,300..900
        fonts: ["Figtree"]
    },
    "12": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'left',
        // family=Public+Sans:ital,wght@0,100..900;1,100..900
        fonts: ["Public Sans"]
    },
    "13": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Sofia+Sans:ital,wght@0,1..1000;1,1..1000
        fonts: ["Sofia Sans"]
    },
    "14": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Noto+Sans:ital,wght@0,100..900;1,100..900
        fonts: ["Noto Sans"]
    },
    "15": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        // family=Rubik:ital,wght@0,300..900;1,300..900
        fonts: ["Rubik"]
    },
    "16": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        // family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000
        fonts: ["DM Sans"]
    },
    "17": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'left',
        // family=Geist:wght@100..900
        fonts: ["Geist"]
    },
    "18": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=IBM+Plex+Sans:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700
        fonts: ["IBM Plex Sans"]
    },
    "19": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'center',
        // family=Sora:wght@100..800
        fonts: ["Sora"]
    },
    "20": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Open+Sans:ital,wght@0,300..800;1,300..800
        fonts: ["Open Sans"]
    },
    "21": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'center',
        // family=Domine:wght@400..700
        fonts: ["Domine"]
    },
    "22": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        // family=Be+Vietnam+Pro:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900
        fonts: ["Be Vietnam Pro"]
    },
    "22-parlaytrends": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        // family=Be+Vietnam+Pro:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900
        fonts: ["Be Vietnam Pro"],
        customFooter: true,
        includeLinemateLogo: false
    },
    "23": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'left',
        // family=Bree+Serif
        fonts: ["Bree Serif"]
    },
    "24": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'center',
        // family=Afacad:ital,wght@0,400..700;1,400..700
        fonts: ["Afacad"]
    },
    "24-betsfromdownunder": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'center',
        // family=Afacad:ital,wght@0,400..700;1,400..700
        fonts: ["Afacad"],
        customFooter: true,
        includeLinemateLogo: false
    },
    "25": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        fonts: ["Schibsted Grotesk"]
    },
    "26": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800
        fonts: ["Plus Jakarta Sans"]
    },
    "27": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Oswald:wght@200..700
        fonts: ["Oswald"]
    },
    "28": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'left',
        // family=Asap:ital,wght@0,100..900;1,100..900
        fonts: ["Asap"]
    },
    "29": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Onest:wght@100..900
        fonts: ["Onest"]
    },
    "30": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        // family=Geologica:wght@100..900
        fonts: ["Geologica"]
    },
    "31": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'center',
        // family=Instrument+Sans
        // family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800
        fonts: ["Instrument Sans", "Plus Jakarta Sans"]
    },
    "32": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        // family=Maven+Pro:wght@400..900
        fonts: ["Maven Pro"]
    },
    "33": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        fontUrl: 'https://fonts.cdnfonts.com/css/pontano-sans',
        fonts: ["Pontano Sans"]
    },
    "34": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        // family=Monda:wght@400..700
        fonts: ["Monda"]
    },
    "35": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'left',
        // family=Radio+Canada:ital,wght@0,300..700;1,300..700
        fonts: ["Radio Canada"]
    },
    "36": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'left',
        // family=Reddit+Sans:ital,wght@0,200..900;1,200..900
        fonts: ["Reddit Sans"]
    },
    "37": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Prompt:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900
        fonts: ["Prompt"]
    },
    "38": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Hind:wght@300;400;500;600;700
        fonts: ["Hind"]
    },
    "39": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        // family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900
        fonts: ["Lato"]
    },
    "40": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Libre+Bodoni:ital,wght@0,400..700;1,400..700
        fonts: ["Libre Bodoni"]
    },
    "41": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'left',
        // family=Libre+Franklin:ital,wght@0,100..900;1,100..900
        fonts: ["Libre Franklin"]
    },
    "42": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Gothic+A1
        fonts: ["Gothic A1"]
    },
    "43": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        // family=Aleo:ital,wght@0,100..900;1,100..900
        fonts: ["Aleo"]
    },
    "44": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Anuphan:wght@100..700
        fonts: ["Anuphan"]
    },
    "45": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Archivo:ital,wght@0,100..900;1,100..900
        fonts: ["Archivo"]
    },
    "46": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        // family=Alexandria:wght@100..900
        fonts: ["Alexandria"]
    },
    "47": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        // family=Anaheim:wght@400..800
        fonts: ["Anaheim"]
    },
    "48": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Bitter:ital,wght@0,100..900;1,100..900
        fonts: ["Bitter"]
    },
    "49": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'left',
        // family=Bricolage+Grotesque:opsz,wght@12..96,200..800
        fonts: ["Bricolage Grotesque"]
    },
    "50": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'left',
        // family=Heebo:wght@100..900
        fonts: ["Heebo"]
    },
    "51": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Frank+Ruhl+Libre:wght@300..900
        fonts: ["Frank Ruhl Libre"]
    },
    "52-1": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'center',
        // family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700
        // family=Space+Grotesk:wght@300..700
        fonts: ["Space Mono", "Space Grotesk"],
        customFooter: true,
        includeLinemateLogo: false
    },
    "52-2": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'center',
        // family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700
        // family=Space+Grotesk:wght@300..700
        fonts: ["Space Mono", "Space Grotesk"],
        customFooter: true,
        includeLinemateLogo: false
    },
    "52-3": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'center',
        // family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700
        // family=Space+Grotesk:wght@300..700
        fonts: ["Space Mono", "Space Grotesk"],
        customFooter: true,
        includeLinemateLogo: false
    },
    "53-1": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Oswald:wght@200..700
        fonts: ["Oswald"],
        customFooter: true,
        includeLinemateLogo: false
    },
    "53-2": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Oswald:wght@200..700
        fonts: ["Oswald"],
        customFooter: true,
        includeLinemateLogo: false
    },
    "53-3": {
        themes: {
            titleTheme: 'dark',
            entriesTheme: 'dark',
            callToActionTheme: 'dark'
        },
        alignment: 'center',
        // family=Oswald:wght@200..700
        fonts: ["Oswald"],
        customFooter: true,
        includeLinemateLogo: false
    },
    "note": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'left',
        fonts: ["Shadows Into Light"],
        includeFooter: false,
        includeLinemateLogo: false,
        includeLogos: false
    },
    "book": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'left',
        fonts: ["Nanum Pen Script"],
        includeFooter: false,
        includeLinemateLogo: false,
        includeLogos: false
    },
    "board": {
        themes: {
            titleTheme: 'light',
            entriesTheme: 'light',
            callToActionTheme: 'light'
        },
        alignment: 'center',
        fonts: ["Solitreo"],
        includeFooter: false,
        includeLinemateLogo: false,
        includeLogos: false
    }
}

// The style here are applied to the dom element and not to the rendered image which allows us to have an original scale that is very low to hide the element under the page and then apply the scale(1) to bring it back to normal right before rendering as an image
const getToJpeg = async (cheatsheet) => toJpeg(cheatsheet.viewRef.current, {cacheBust: true, fetchRequestInit: {'cache': 'no-cache'}, skipAutoScale: true, includeQueryParams: true, quality: 1, skipFonts: false, style: {width: 1080, height: 1920, transform: 'scale(1)'}})

// See https://github.com/bubkoo/html-to-image/issues/361
const buildJpg = async (cheatsheet) => {
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    let dataUrl = '';
    let i = 0;
    let maxAttempts;
    if (isSafari) {
        maxAttempts = 10;
    } else {
        // Technically 1 should be enough but putting a few extra as backup
        maxAttempts = 3;
    }
    let cycle = [];
    let repeat = true;

    while (repeat && i < maxAttempts) {
        dataUrl = await getToJpeg(cheatsheet)
        // console.log(dataUrl.length)
        i += 1;

        // Original implementation stops the cycles as soon as we have two consecutive results with the same size 
        //  however it's possible that there are two back-to-back results that are the same and both are wrong
        // Update 1: replace it with a check for a minimum size if we know in advance the rough size it should be
        //  In this case we're using 2M as the threshold. It's not perfect but seems to work okay
        // Update 2: the file size is not reliable as it sometimes gets big enough 
        //  so we're just going to rely on max attempts for now which seems to work fine

        // cycle[i] = dataUrl.length;
        // if (dataUrl.length === cycle[i - 1]) {
        //     repeat = false;
        // }
        // if (dataUrl.length > 2000000 && dataUrl.length === cycle[i - 1]) {
        //     repeat = false;
        // }
    }
    // console.log('safari:' + isSafari + '_repeat_need_' + i);
    return dataUrl;
};

// TODO; we could optimise this to fetch all cards only once and just do post-process filtering per sheet
// Note: apparently https://github.com/qq15725/modern-screenshot (which is a fork of html-to-image) may be working better
//  If we need to make updates to this and we have more problems, could be worth looking into
class Socials extends React.Component {

    static contextType = GlobalContext;

    constructor(props) {
        super(props);

        this.shareableRefs = []

        this.generateSheets = this.generateSheets.bind(this);
        this.downloadSheets = this.downloadSheets.bind(this);

        this.state = {
            /**
             * {
                    viewRef: null,
                    title: null,
                    subtitle: null,
                    entries: []
                }
             */
            cheatsheets: [],
            style: null,
            loading: false,
            bundles: [],
            shareFiles: [],
            generatedBundle: null,
            isMobileIos: /iPhone|iPad/.test(window.navigator.userAgent),
            fontEmbeddings: null
        }
    }

    componentDidMount() {
        document.title = 'Socials - Linemate';
        this.setState({bundles: isSoccer(this.context.league) ? SOCIAL_MEDIA_BUNDLE_ACTIONS.soccer : SOCIAL_MEDIA_BUNDLE_ACTIONS?.[this.context.league] || []})
    }

    async generateSheets(bundle, style) {
        this.setState({loading: true})
        const recordType = this.context?.configuration?.metadata?.leagues?.[this.context.league]?.recordType || "REGULAR"
        const individualSheets = isSoccer(this.context.league) ? SOCIAL_MEDIA_ACTIONS.soccer : SOCIAL_MEDIA_ACTIONS?.[this.context.league] || []
    
        const cheatsheets = []
        for (const sheetTitle of bundle.sheets) {
            const sheetConfiguration = individualSheets.filter(x => x.title.toLowerCase() === sheetTitle.toLowerCase())?.[0]
            if (!sheetConfiguration) {
                continue
            }
            const cheatsheet = await sheetConfiguration.action(this.context.league, recordType)
            cheatsheet.viewRef = React.createRef()
            cheatsheets.push(cheatsheet)
        }

        if (style === 'auto') {
            style = Object.keys(CHEATSHEET_STYLES)[Math.floor(Math.random() * Object.keys(CHEATSHEET_STYLES).length)]
        }

        const promises = []
        const googleFontQueryParams = []
        STYLES[style].fonts.forEach((font) => {
            if (font in GOOGLE_FONTS_QUERY_PARAMS) {
                googleFontQueryParams.push(GOOGLE_FONTS_QUERY_PARAMS[font])
            } else if ('fontUrl' in STYLES[style]) {
                promises.push(fetch(STYLES[style].fontUrl).then((result) => result.text()))
            }
        })
        if (googleFontQueryParams.length > 0) {
            promises.push(fetch(`${GOOGLE_FONTS_BASE_URL}?${googleFontQueryParams.join("&")}&display=swap`).then((result) => result.text()))
        }

        Promise.all(promises)
        .then((results) => {
            // Here we might be able to just set the reference to this.downloadSheets and use the state in there,
            //  but can't be bothered to test and see if it's consistently going to have the state up to date so we're just going to pass the sheets as argument
            this.setState({ fontEmbeddings: results.join("\n"), cheatsheets: cheatsheets, style: style }, () => this.downloadSheets(bundle.title, cheatsheets))
        })
    }

    async downloadSheets(bundleName, cheatsheets) {
        const date = parseDate(new Date())
        // For ios we could also look at the ios version and if it's sub ios 17 we fallback to download or some other method?
        // Sample user agents: https://www.whatismybrowser.com/guides/the-latest-user-agent/ios
        if (this.state.isMobileIos) {
            if (cheatsheets.length > 0) {
                // I'm losing my fucking mind. It's a stupid workaround but it works so deal with it
                // For whatever reason with all the other workarounds we've done we almost got it to work but the last image to be generated is missing the images and I'm not sure why. 
                // Adding a dummy extra sheet to be processed and then removing it from the files to share seems to work as a workaround
                cheatsheets = cheatsheets.concat([cheatsheets[0]])
            }
            const results = await Promise.all(cheatsheets.map((cheatsheet) => buildJpg(cheatsheet).catch(console.log)))
            var files = await Promise.all(results.map(async (url, index) => {              
                const blob = await (await fetch(url)).blob();
                const file = new File([blob], `${date.formattedDayMonthShort} ${this.context.league.toUpperCase()} ${cheatsheets[index].title}.jpg`, { type: blob.type });
                return file;
            }))
            if (files.length > 1) {
                // I'm losing my fucking mind. It's a stupid workaround but it works so deal with it
                // For whatever reason with all the other workarounds we've done we almost got it to work but the last image to be generated is missing the images and I'm not sure why. 
                // Adding a dummy extra sheet to be processed and then removing it from the files to share seems to work as a workaround
                files = files.slice(0, files.length - 1)
            }
            this.setState({loading: false, shareFiles: files, generatedBundle: bundleName})
        } else {
            const results = await Promise.all(cheatsheets.map((cheatsheet) => buildJpg(cheatsheet).catch(console.log)))
            this.setState({loading: false})
            results.forEach((url, index) => {
                // Needed because safari doesn't like it when we perform a bunch of clicks too close to each-other
                // Going to use it for all browsers anyway, can't hurt
                setTimeout(() => {
                    document.getElementById(`download-anchor`).href = url
                    document.getElementById(`download-anchor`).download = `${date.formattedDayMonthShort} ${this.context.league.toUpperCase()} ${cheatsheets[index].title}.jpg`
                    document.getElementById(`download-anchor`).click()
                }, index * 1000)
            })
        }
    }
    
    render() {
        return (
            <div style={{position: 'relative', display: 'flex', flex: 1}}>
                {/*
                    html-to-image downloads all the fonts that are mentioned in any css, and in this case if we have all the fonts across all sheets it will try to download them all.
                    Google Chrome apparently has trouble dealing with a lot of parallel downloads (in this case we can be downloading 100+ at once), see https://issues.chromium.org/issues/40130136
                    Even if chrome didn't have a problem doing it, it's a pretty stupid way of going about it so instead we're going to conditionally
                        add only the embedded fonts we need based on the style to limit the amount of fonts html-to-image downloads when generating the image
                 */}
                {
                    this.state.fontEmbeddings && (
                        <style>{this.state.fontEmbeddings}</style>
                    )
                }
                {
                    this.state.loading && (
                        <div style={{display: 'flex', flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%', position: 'absolute', top: 0}}>
                            <Loader/>
                        </div>
                    )
                }
                <div style={{display: 'flex', flex: 1, flexDirection: 'column', width: '100%', height: '100%', backgroundColor: 'var(--color-surface-base)'}}>
                    {
                        this.state.bundles.map((bundle) => 
                            <>
                            {
                                Object.keys(this.context.userAttributes.socialMediaSheetsConfiguration.platforms).map((platform) => 
                                    <>
                                    {
                                        Object.keys(this.context.userAttributes.socialMediaSheetsConfiguration.platforms[platform].accounts).map((account) => 
                                            <div key={platform + account + bundle.title} style={{display: 'flex', flex: 1, flexDirection: 'column', padding: '0px 32px', margin: '8px 0px', width: '100%', height: 48}}>
                                                {/* Note: for now we won't add the platform (tiktok/twitter/etc) since we only have tiktok but we may in the future if we want to support more */}
                                                <p className='color-fig-default'>{`${account} - ${bundle.title}`}</p>
                                                {
                                                    this.state.isMobileIos && (
                                                        <Button text={this.state.shareFiles.length > 0 && this.state.generatedBundle === bundle.title && this.state.style === this.context.userAttributes.socialMediaSheetsConfiguration.platforms[platform].accounts[account].style ? "Save" : "Generate"} typography="md" type="primary" enabled={true} onClick={() => {
                                                            if (this.state.shareFiles.length > 0 && this.state.generatedBundle === bundle.title && this.state.style === this.context.userAttributes.socialMediaSheetsConfiguration.platforms[platform].accounts[account].style) {
                                                                navigator.share({files: this.state.shareFiles}).catch(console.log)
                                                            } else {
                                                                this.generateSheets(bundle, this.context.userAttributes.socialMediaSheetsConfiguration.platforms[platform].accounts[account].style)
                                                            }
                                                        }}/>
                                                    )
                                                }
                                                {
                                                    !this.state.isMobileIos && (
                                                        <Button text={"Generate & Download"} typography="md" type="primary" enabled={true} onClick={() => this.generateSheets(bundle, this.context.userAttributes.socialMediaSheetsConfiguration.platforms[platform].accounts[account].style)}/>
                                                    )
                                                }
                                            </div>
                                        )
                                    }
                                    </>
                                )
                            }
                            </>
                        )
                    }
                </div>
                <a id="download-anchor" href=""/>
                {
                    this.state.cheatsheets.map((cheatsheet) => {
                        const style = this.state.style
                        const version = `assets/cheatsheets/${style}/${CHEATSHEET_STYLES[style][Math.floor(Math.random() * CHEATSHEET_STYLES[style].length)]}.jpg`
                        const styleInfo = STYLES[style];
                        const titleTheme = styleInfo.themes.titleTheme
                        const entriesTheme = styleInfo.themes.entriesTheme
                        const callToActionTheme = styleInfo.themes.callToActionTheme
                        const alignment = styleInfo.alignment
                        return (
                            // Note: changing some of these (including top/left/right/bottom) might change the rendered image
                            <div key={this.context.league + cheatsheet.title + cheatsheet.subtitle} ref={cheatsheet.viewRef} style={{zIndex: -1, position: 'absolute', flex: 1, left: 0, top: 0, height: 1920, width: 1080, display: 'flex', flexDirection: 'column', backgroundImage: `url(${version})`, backgroundSize: 'cover', transform: 'scale(0.05)'}}>
                                {
                                    (!('includeLinemateLogo' in styleInfo) || styleInfo.includeLinemateLogo) && (
                                        <div style={{ position: 'absolute', right: 40, top: 40 }}>
                                            <img src={`assets/linemate-logo.svg`} style={{height: 48, width: 64, filter: `var(--color-fig-${titleTheme}-default-filter)`}} alt="logo"/>
                                        </div>
                                    )
                                }
                                <div style={{display: 'flex', flexDirection: 'column', flex: 1, marginLeft: 62, marginRight: 120}}>
                                    {
                                        (!('includeLogos' in styleInfo) || styleInfo.includeLogos) ? (
                                            <div style={{display: 'flex', flexDirection: 'row', justifyContent: alignment, marginTop: 128, }}>
                                                <img src={getLeagueLogoPath(this.context.league)} style={{height: 200, width: 200}} alt={this.context.league}/>
                                            </div>
                                        )
                                        :
                                        // placeholder
                                        (<div style={{marginTop: 128 + 200}}></div>)
                                    }
                                    {/* Main content */}
                                    <p className={`text-style-title-${style} color-fig-${titleTheme}-primary`} style={{marginTop: 24, textAlign: alignment}}>{cheatsheet.title}</p>
                                    <p className={`text-style-subtitle-${style} color-fig-${titleTheme}-secondary`} style={{marginTop: 24, textAlign: alignment}}>{cheatsheet.subtitle}</p>
                                    <div style={{height: 1072, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 48, marginTop: 48}}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                            {
                                                cheatsheet.entries.map((entry) => {
                                                    return (
                                                        <div key={entry.team + entry.subject + entry.marketInfo + entry.annotation} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                                                                {
                                                                    (!('includeLogos' in styleInfo) || styleInfo.includeLogos) && (
                                                                        <img src={getTeamLogoPath(this.context.league, entry.teamId || getTeamIdByCode(this.context.teams, entry.team))} style={{height: 64, width: 64}} alt={entry.team}/>
                                                                    )
                                                                }
                                                                <p className={`text-style-body-primary-${style} color-fig-${entriesTheme}-primary`} style={{marginLeft: 12}}>{entry.subject}:</p>
                                                                <p className={`text-style-body-secondary-${style} color-fig-${entriesTheme}-primary`} style={{marginLeft: 12}}>{entry.marketInfo}</p>
                                                            </div>
                                                            <p className={`text-style-body-primary-${style} color-fig-${entriesTheme}-primary`}>{entry.annotation}</p>
                                                        </div>
                                                    )
                                                })
                                            }
                                        </div>
                                        {/* Call to action */}
                                        {
                                            (!('includeFooter' in styleInfo) || styleInfo.includeFooter) && (
                                                <>
                                                {
                                                    styleInfo.customFooter && (
                                                        <div style={{marginBottom: 88}}>
                                                            {/* Could have done separate text and images but having the whole footer as one change/customization is easiest */}
                                                            <img src={`assets/cheatsheets/${style}/footer.png`} alt="footer"/>
                                                        </div>
                                                    )
                                                }
                                                {
                                                    !styleInfo.customFooter && (
                                                        <div style={{marginBottom: 88}}>
                                                            <p className={`text-style-footer-${style} color-fig-${callToActionTheme}-highlight`} style={{textAlign: alignment}}>Get Linemate App for free</p>
                                                            <div style={{display: 'flex', flexDirection: 'row', justifyContent: alignment}}>
                                                                <img src={`assets/download-${callToActionTheme}.png`} style={{marginTop: 24}} alt="download"/>
                                                            </div>
                                                        </div>
                                                    )
                                                }
                                                </>
                                            )
                                        }
                                    </div>
                                </div>
                            </div>
                        )
                    })
                }
            </div>
        )
    }

}

export default Socials;
