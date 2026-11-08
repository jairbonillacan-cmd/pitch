import React, { useContext, useEffect, useMemo, useState } from "react";
import { Buffer } from "buffer";
import "./OpponentDefensiveRank.scss";
import "../components/App.scss";
import GlobalContext from "../components/GlobalContext";
import { API_HOST } from "../react-web-constants";
import {
  addOrdinalNumberSuffix,
  buildQueryParams,
  buildTeamPropRankings,
  getTeamDisplayName,
  jsonOrDefault,
  hasPremiumAccess
} from "../linemate-react-common/src/util";
import {
  PLAYER_BET_TYPE_ID_TO_NAME,
  SUPPORTED_LEAGUES
} from "../linemate-react-common/src/constants";
import { supportedTrendFilter, getCardKey } from "../linemate-react-common/src/betting-utils";
import { getTeamLogoPath, getTheme, teamLogoPathOnErrorFallback, shouldUseRoundTeamLogoBackground } from "../react-web-utils";
import TrendContent from "../components/TrendContent";
import HomeSidebar from "../components/HomeSidebar";
import Footer from "../components/Footer";
import Button from "../components/Button";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useTranslation } from "react-i18next";

const OPPONENT_RANK_SIGNAL = "OPPONENT_RANK";

function shouldShowRank(rank, totalTeams) {
  if (!Number.isFinite(rank) || !Number.isFinite(totalTeams) || totalTeams <= 0) {
    return false;
  }

  if (totalTeams <= 10) {
    return true;
  }

  return rank <= 5 || rank > totalTeams - 5;
}

function buildOpponentRankEntries(currentGames, teamPropRankings, league) {
  const entries = [];
  const marketEntries = Object.entries(teamPropRankings || {}).filter(([marketId]) =>
    PLAYER_BET_TYPE_ID_TO_NAME[league]?.[marketId]
  );

  (currentGames || []).forEach((game, gameIndex) => {
    const awayTeamCode = game?.awayTeamData?.info?.code;
    const homeTeamCode = game?.homeTeamData?.info?.code;

    const teams = [
      {
        gameId: game?.id,
        teamCode: awayTeamCode,
        teamId: game?.awayTeamData?.info?.teamId,
        opponentCode: homeTeamCode,
        opponentId: game?.homeTeamData?.info?.teamId,
        teamSortOrder: 0,
      },
      {
        gameId: game?.id,
        teamCode: homeTeamCode,
        teamId: game?.homeTeamData?.info?.teamId,
        opponentCode: awayTeamCode,
        opponentId: game?.awayTeamData?.info?.teamId,
        teamSortOrder: 1,
      },
    ];

    teams.forEach((teamEntry) => {
      if (!teamEntry.teamCode || !teamEntry.opponentCode || !teamEntry.gameId) {
        return;
      }

      marketEntries.forEach(([marketId, rankings], marketIndex) => {
        const marketName = PLAYER_BET_TYPE_ID_TO_NAME[league][marketId];
        const rank = Number(rankings?.[teamEntry.opponentCode]);
        const totalTeams = Object.keys(rankings || {}).length;

        if (!shouldShowRank(rank, totalTeams)) {
          return;
        }

        entries.push({
          key: `${teamEntry.gameId}-${teamEntry.teamCode}-${marketId}`,
          gameId: teamEntry.gameId,
          teamCode: teamEntry.teamCode,
          teamId: teamEntry.teamId,
          opponentCode: teamEntry.opponentCode,
          opponentId: teamEntry.opponentId,
          marketId,
          marketName,
          rank,
          gameSortOrder: gameIndex,
          marketSortOrder: marketIndex,
          teamSortOrder: teamEntry.teamSortOrder,
        });
      });
    });
  });

  return entries;
}

function buildOpponentRankTrendsHref(league, entry, selectedTrendIndex = 0) {
  const feed = {
    titleKey: "web.navigation.toolsMenu.opponentDefensiveRank",
    subtitleKey: "opponentRank.feedSubtitle",
    subtitleValues: {
      team: entry.opponentCode,
    },
    includeFilters: false,
    highlightedSignalType: OPPONENT_RANK_SIGNAL,
    queryParams: {
      gameIds: entry.gameId,
      signals: OPPONENT_RANK_SIGNAL,
      markets: entry.marketId,
    },
  };

  return `/${league}/trends?feed=${encodeURIComponent(
    Buffer.from(JSON.stringify(feed)).toString("base64")
  )}&tabs=${encodeURIComponent(JSON.stringify(["player"]))}&tab=player&index=${selectedTrendIndex}`;
}

function buildAllOpponentRankTrendsHref(league) {
  const feed = {
    titleKey: "web.navigation.toolsMenu.opponentDefensiveRank",
    includeFilters: false,
    highlightedSignalType: OPPONENT_RANK_SIGNAL,
    queryParams: {
      signals: OPPONENT_RANK_SIGNAL,
    },
  };

  return `/${league}/trends?feed=${encodeURIComponent(
    Buffer.from(JSON.stringify(feed)).toString("base64")
  )}&tabs=${encodeURIComponent(JSON.stringify(["player"]))}&tab=player`;
}

function getOpponentRankEntriesLookupKey(gameId, marketId) {
  return `${gameId}-${marketId}`;
}

function getTrendTeamCode(trend) {
  return (
    trend?.team?.code ||
    trend?.market?.team?.code ||
    trend?.player?.teamCode ||
    null
  );
}

function getTrendOpponentCode(trend) {
  return (
    trend?.opposingTeam?.code ||
    trend?.market?.opposingTeam?.code ||
    null
  );
}

function getMatchingOpponentRankEntryKey(trend, entriesByGameAndMarket) {
  const lookupKey = getOpponentRankEntriesLookupKey(trend?.gameId, trend?.market?.name);
  const candidates = entriesByGameAndMarket.get(lookupKey) || [];
  const trendTeamCode = getTrendTeamCode(trend);
  const trendOpponentCode = getTrendOpponentCode(trend);

  const exactMatch = candidates.find((entry) => {
    if (trendTeamCode && trendOpponentCode) {
      return entry.teamCode === trendTeamCode && entry.opponentCode === trendOpponentCode;
    }
    return false;
  });

  if (exactMatch) {
    return exactMatch.key;
  }

  const reversedMatch = candidates.find((entry) => {
    if (trendTeamCode && trendOpponentCode) {
      return entry.teamCode === trendOpponentCode && entry.opponentCode === trendTeamCode;
    }
    return false;
  });

  if (reversedMatch) {
    return reversedMatch.key;
  }

  const fallbackMatch = candidates.find((entry) => {
    if (trendOpponentCode && entry.opponentCode === trendOpponentCode) {
      return true;
    }

    if (trendTeamCode && entry.teamCode === trendTeamCode) {
      return true;
    }

    return false;
  });

  return fallbackMatch?.key || null;
}

function OpponentDefensiveRank() {
  const context = useContext(GlobalContext);
  const { t, i18n } = useTranslation();
  const userHasPremiumAccess = hasPremiumAccess(context.userAttributes);
  const [width, setWidth] = useState(window.innerWidth);
  const [loading, setLoading] = useState(true);
  const [trendsByEntry, setTrendsByEntry] = useState({});

  useEffect(() => {
    document.title = `${t("web.navigation.toolsMenu.opponentDefensiveRank")} - Linemate`;
  }, [t]);

  useEffect(() => {
    if (!context.league || userHasPremiumAccess) {
      return;
    }
    window.location.replace(`/${context.league}`);
  }, [context.league, userHasPremiumAccess]);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const teamPropRankings = useMemo(() => {
    if (!context.teams?.length) {
      return {};
    }
    return buildTeamPropRankings(context.teams, context.league);
  }, [context.teams, context.league]);

  const entries = useMemo(() => {
    return buildOpponentRankEntries(
      context.currentGames,
      teamPropRankings,
      context.league
    ).sort(
      (left, right) =>
        right.rank - left.rank ||
        left.gameSortOrder - right.gameSortOrder ||
        left.teamSortOrder - right.teamSortOrder ||
        left.marketSortOrder - right.marketSortOrder
    );
  }, [context.currentGames, teamPropRankings, context.league]);

  const teamsByCode = useMemo(() => {
    return Object.fromEntries((context.teams || []).map((team) => [team.code, team]));
  }, [context.teams]);

  const visibleEntries = useMemo(() => {
    return entries.filter((entry) => (trendsByEntry[entry.key] || []).length > 0);
  }, [entries, trendsByEntry]);

  const redirectToOpponentRankTrends = (entry, selectedTrendIndex = 0) => {
    window.location.href = buildOpponentRankTrendsHref(
      context.league,
      entry,
      selectedTrendIndex
    );
  };

  const redirectToAllOpponentRankTrends = () => {
    window.location.href = buildAllOpponentRankTrendsHref(context.league);
  };

  useEffect(() => {
    let cancelled = false;

    async function loadTrends() {
      if (!userHasPremiumAccess || !entries.length) {
        setTrendsByEntry({});
        setLoading(false);
        return;
      }

      setLoading(true);

      const uniqueGameIds = [...new Set(entries.map((entry) => entry.gameId))];
      const uniqueMarketIds = [...new Set(entries.map((entry) => entry.marketId))];
      const entriesByGameAndMarket = new Map();

      entries.forEach((entry) => {
        const lookupKey = getOpponentRankEntriesLookupKey(entry.gameId, entry.marketId);
        const existingEntries = entriesByGameAndMarket.get(lookupKey) || [];
        existingEntries.push(entry);
        entriesByGameAndMarket.set(lookupKey, existingEntries);
      });

      const groupedTrends = Object.fromEntries(
        entries.map((entry) => [entry.key, []])
      );

      let offset = 0;
      const limit = 100;
      let reachedEnd = false;

      while (!cancelled && !reachedEnd) {
        const page = await fetch(
          `${API_HOST}/api/${context.league}/v1/trends/straights?${buildQueryParams({
            offset,
            limit,
            preferredProviders: context.resolvedPreferredProviders,
            gameIds: uniqueGameIds.join(","),
            signals: OPPONENT_RANK_SIGNAL,
            markets: uniqueMarketIds.join(","),
          })}`
        )
          .then((response) => jsonOrDefault(response, []))
          .catch(() => []);

        page.forEach((trend) => {
          const entryKey = getMatchingOpponentRankEntryKey(
            trend,
            entriesByGameAndMarket
          );

          if (!entryKey) {
            return;
          }

          if (groupedTrends[entryKey].length >= 4) {
            return;
          }

          groupedTrends[entryKey].push(trend);
        });

        const allSectionsHaveEnoughTrends = entries.every(
          (entry) => groupedTrends[entry.key].length >= 4
        );

        reachedEnd = page.length < limit || allSectionsHaveEnoughTrends;
        offset += limit;
      }

      if (cancelled) {
        return;
      }
      setTrendsByEntry(groupedTrends);
      setLoading(false);
    }

    loadTrends();

    return () => {
      cancelled = true;
    };
  }, [entries, context.league, context.resolvedPreferredProviders, userHasPremiumAccess]);

  if (!userHasPremiumAccess) {
    return null;
  }

  return (
    <div className="opponent-defensive-rank-page-container">
      <div className="opponent-defensive-rank-main-container">
        <div className="opponent-defensive-rank-content-row">
          <div className="opponent-defensive-rank-content-wrapper">
            <div className="opponent-defensive-rank-header">
              <p className="text-style-h-2-semibold color-fig-default">
                {t("web.navigation.toolsMenu.opponentDefensiveRank")}
              </p>

                <div className="opponent-defensive-rank-view-all-wrapper">
                    <Button 
                        text={t("common.viewAll")}
                        typography="md"
                        type="invisible"
                        enabled="true"
                        onClick={redirectToAllOpponentRankTrends}
                        className="opponent-defensive-rank-view-all"
                    />
                </div>
            </div>

            <div className="opponent-defensive-rank-sections">
              {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
                  <Loader />
                </div>
              ) : visibleEntries.length === 0 ? (
                <EmptyState
                  variant="advanced-tool"
                  title={t("opponentRank.empty.title")}
                  subtitle={t("common.empty.checkBackLater")}
                  lightIconPath="/assets/empty-state/empty-card-light.png"
                  darkIconPath="/assets/empty-state/empty-card-dark.png"
                />
              ) : (
                visibleEntries.map((entry) => {
                const opponentTeam = teamsByCode[entry.opponentCode];
                const teamDisplayName = opponentTeam
                  ? getTeamDisplayName(context.league, opponentTeam)
                  : entry.opponentCode;
                const trends = trendsByEntry[entry.key] || [];
                const visibleTrends = trends.slice(0, 3);
                const backgroundColor =
                  SUPPORTED_LEAGUES[context.league]?.teams?.colors?.[getTheme()]?.[entry.opponentCode?.toLowerCase?.()] ||
                  "var(--color-surface-subtle)";
                const useRoundBackground = shouldUseRoundTeamLogoBackground(context.league);
                return (
                  <div key={entry.key} className="opponent-defensive-rank-section">
                    <div className="opponent-defensive-rank-section-header">
                        <div
                          className={`opponent-defensive-rank-team-logo-background${
                            useRoundBackground ? "" : " opponent-defensive-rank-team-logo-background--flat"
                          }`}
                          style={{ backgroundColor: useRoundBackground ? backgroundColor : "transparent" }}
                        >
                          <img
                            src={getTeamLogoPath(context.league, entry.opponentId)}
                            alt={entry.opponentCode}
                            onError={({ currentTarget }) =>
                              teamLogoPathOnErrorFallback(currentTarget, context.league)
                            }
                          />
                        </div>

                        <div className="opponent-defensive-rank-section-header-main">
                            <div className="opponent-defensive-rank-section-copy">
                            <p className="text-style-h-4-semibold color-fig-default">
                                <span>{teamDisplayName}</span>
                                <span className="color-fig-subtle"> ・ </span>
                                <span className="text-style-h-4-medium color-fig-subtle">
                                {t("opponentRank.rankSummary", { rank: i18n.language?.startsWith("en") ? addOrdinalNumberSuffix(entry.rank) : new Intl.NumberFormat(i18n.language || undefined).format(entry.rank), marketName: t(`betTypes.${entry.marketId}`, { defaultValue: entry.marketName }) })}
                                </span>
                            </p>
                            </div>

                            {trends.length > 3 && (
                                <div className="opponent-defensive-rank-view-all-wrapper">
                                    <Button 
                                        text={t("common.viewAll")}
                                        typography="md"
                                        type="invisible"
                                        enabled="true"
                                        onClick={() => redirectToOpponentRankTrends(entry, 0)}
                                        className="opponent-defensive-rank-view-all"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {visibleTrends.length > 0 && (
                        <div className="opponent-defensive-rank-trends-list">
                            {visibleTrends.map((trend, index) => (
                                <div
                                    key={getCardKey(trend)}
                                    className="trends-page-list-items-item opponent-defensive-rank-trend-card"
                                    onClick={() => redirectToOpponentRankTrends(entry, index)}
                                >
                                    <TrendContent
                                    card={trend}
                                    league={context.league}
                                    highlightedSignalType={OPPONENT_RANK_SIGNAL}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                  </div>
                );
                }) 
              )}
            </div>
            {width <= 1000 && (
              <div className="global-sidebar-column">
                <div style={{ position: "relative", width: "100%" }}>
                  <HomeSidebar />
                </div>
              </div>
            )}

            <Footer />
          </div>

          {width > 1000 && (
            <div className="global-sidebar-column">
              <div style={{ position: "relative", width: "100%" }}>
                <HomeSidebar />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default OpponentDefensiveRank;
