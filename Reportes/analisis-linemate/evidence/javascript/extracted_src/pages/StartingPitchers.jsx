import React, { useContext, useEffect, useMemo, useState } from "react";
import { Buffer } from "buffer";
import "./OpponentDefensiveRank.scss";
import "./StartingPitchers.scss";
import "../components/App.scss";
import GlobalContext from "../components/GlobalContext";
import { API_HOST } from "../react-web-constants";
import {
  buildQueryParams,
  getPlayerId,
  getPlayerName,
  jsonOrDefault,
  hasPremiumAccess,
  getTeamDisplayName
} from "../linemate-react-common/src/util";
import { SUPPORTED_LEAGUES } from "../linemate-react-common/src/constants";
import { supportedTrendFilter } from "../linemate-react-common/src/betting-utils";
import { getTeamLogoPath, getTheme, teamLogoPathOnErrorFallback, shouldUseRoundTeamLogoBackground } from "../react-web-utils";
import TrendContent from "../components/TrendContent";
import HomeSidebar from "../components/HomeSidebar";
import Footer from "../components/Footer";
import Button from "../components/Button";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useTranslation } from "react-i18next";


const STARTING_PITCHER_SIGNAL = "VERSUS_STARTING_PITCHER";

function getPitcherStatusLabel(startingPitcher, t) {
  return t(startingPitcher?.confirmed ? "startingPitchers.labels.confirmed" : "startingPitchers.labels.expected");
}

function getPitcherDisplayName(startingPitcher, t) {
  return getPlayerName(startingPitcher) || t("startingPitchers.labels.tbd");
}

function getStartingPitcherIds(startingPitcher) {
  return [
    getPlayerId(startingPitcher),
    startingPitcher?.playerId,
    startingPitcher?.SRGUID,
    startingPitcher?.id,
  ].filter(Boolean).map(String);
}

function buildStartingPitcherEntries(currentGames) {
  const entries = [];

  (currentGames || []).forEach((game, gameIndex) => {
    const awayTeamCode = game?.awayTeamData?.info?.code;
    const homeTeamCode = game?.homeTeamData?.info?.code;

    const teamEntries = [
      {
        gameId: game?.id,
        teamCode: awayTeamCode,
        teamId: game?.awayTeamData?.info?.teamId,
        opponentCode: homeTeamCode,
        pitcher: game?.awayTeamData?.startingPitcher,
        isHome: false,
        teamSortOrder: 0,
      },
      {
        gameId: game?.id,
        teamCode: homeTeamCode,
        teamId: game?.homeTeamData?.info?.teamId,
        opponentCode: awayTeamCode,
        pitcher: game?.homeTeamData?.startingPitcher,
        isHome: true,
        teamSortOrder: 1,
      },
    ];

    teamEntries.forEach((entry) => {
      const pitcherIds = getStartingPitcherIds(entry.pitcher);

      if (!entry.gameId || !entry.teamCode || !entry.opponentCode || pitcherIds.length === 0) {
        return;
      }

      entries.push({
        ...entry,
        pitcherId: pitcherIds[0],
        pitcherIds,
        key: `${entry.gameId}-${entry.teamCode}-${pitcherIds[0]}`,
        gameSortOrder: gameIndex,
      });
    });
  });

  return entries;
}

function buildStartingPitchersTrendsHref(league, entry, selectedTrendIndex = 0) {
  const feed = {
    titleKey: "startingPitchers.title",
    subtitle: getPlayerName(entry.pitcher) || "",
    includeFilters: false,
    highlightedSignalType: STARTING_PITCHER_SIGNAL,
    signalPitcherId: entry.pitcherId,
    queryParams: {
      gameIds: entry.gameId,
      signals: STARTING_PITCHER_SIGNAL,
    },
  };

  return `/${league}/trends?feed=${encodeURIComponent(
    Buffer.from(JSON.stringify(feed)).toString("base64")
  )}&tabs=${encodeURIComponent(JSON.stringify(["player"]))}&tab=player&index=${selectedTrendIndex}`;
}

function buildAllStartingPitchersTrendsHref(league) {
  const feed = {
    titleKey: "startingPitchers.title",
    includeFilters: false,
    highlightedSignalType: STARTING_PITCHER_SIGNAL,
    queryParams: {
      signals: STARTING_PITCHER_SIGNAL,
    },
  };

  return `/${league}/trends?feed=${encodeURIComponent(
    Buffer.from(JSON.stringify(feed)).toString("base64")
  )}&tabs=${encodeURIComponent(JSON.stringify(["player"]))}&tab=player`;
}

function getStartingPitcherEntryLookupKey(gameId, pitcherId) {
  return `${gameId}-${pitcherId}`;
}

function getTrendStartingPitcherIds(trend) {
  const signal = (trend?.signals || []).find(
    (signal) => signal.type === STARTING_PITCHER_SIGNAL
  );

  return getStartingPitcherIds(signal?.pitcher);
}

function StartingPitchers() {
  const { t } = useTranslation();
  const context = useContext(GlobalContext);
  const userHasPremiumAccess = hasPremiumAccess(context.userAttributes);
  const [width, setWidth] = useState(window.innerWidth);
  const [loading, setLoading] = useState(true);
  const [trendsByEntry, setTrendsByEntry] = useState({});

  useEffect(() => {
    document.title = `${t("startingPitchers.title")} - Linemate`;
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

  const entries = useMemo(() => {
    console.log("Starting pitchers currentGames", context.currentGames);
    return buildStartingPitcherEntries(context.currentGames).sort(
      (left, right) =>
        left.gameSortOrder - right.gameSortOrder ||
        left.teamSortOrder - right.teamSortOrder
    );
  }, [context.currentGames]);

  const teamsByCode = useMemo(() => {
    return Object.fromEntries((context.teams || []).map((team) => [team.code, team]));
  }, [context.teams]);

  const visibleEntries = useMemo(() => {
    return entries.filter((entry) => (trendsByEntry[entry.key] || []).length > 0);
  }, [entries, trendsByEntry]);

  const redirectToStartingPitchersTrends = (entry, selectedTrendIndex = 0) => {
    window.location.href = buildStartingPitchersTrendsHref(
      context.league,
      entry,
      selectedTrendIndex
    );
  };

  const redirectToAllStartingPitchersTrends = () => {
    window.location.href = buildAllStartingPitchersTrendsHref(context.league);
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
      const entryLookup = new Map(
        entries.flatMap((entry) =>
          entry.pitcherIds.map((pitcherId) => [
            getStartingPitcherEntryLookupKey(entry.gameId, pitcherId),
            entry.key,
          ])
        )
      );

      const groupedTrends = Object.fromEntries(entries.map((entry) => [entry.key, []]));

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
            signals: STARTING_PITCHER_SIGNAL,
          })}`
        )
          .then((response) => jsonOrDefault(response, []))
          .then((trends) =>
            (trends || []).filter((trend) => supportedTrendFilter(context.league, trend))
          )
          .catch(() => []);
          console.log("Starting pitchers trend page", {
  uniqueGameIds,
  page,
  entryLookup,
});

        page.forEach((trend) => {
          const entryKey = getTrendStartingPitcherIds(trend)
            .map((pitcherId) =>
              entryLookup.get(getStartingPitcherEntryLookupKey(trend.gameId, pitcherId))
            )
            .find(Boolean);

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
                {t("startingPitchers.title")}
              </p>

              <div className="opponent-defensive-rank-view-all-wrapper">
                <Button
                  text={t("common.viewAll")}
                  typography="md"
                  type="invisible"
                  enabled="true"
                  onClick={redirectToAllStartingPitchersTrends}
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
                  title={t("startingPitchers.empty.title")}
                  subtitle={t("common.empty.checkBackLater")}
                  lightIconPath="/assets/empty-state/empty-card-light.png"
                  darkIconPath="/assets/empty-state/empty-card-dark.png"
                />
              ) : (
                visibleEntries.map((entry) => {
                const opponentTeam = teamsByCode[entry.opponentCode];
                const opponentTeamDisplayName = opponentTeam
                    ? getTeamDisplayName(context.league, opponentTeam)
                    : entry.opponentCode;
                const trends = trendsByEntry[entry.key] || [];
                const visibleTrends = trends.slice(0, 3);
                const backgroundColor =
                  SUPPORTED_LEAGUES[context.league]?.teams?.colors?.[getTheme()]?.[entry.teamCode?.toLowerCase?.()] ||
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
                          src={getTeamLogoPath(context.league, entry.teamId)}
                          alt={entry.teamCode}
                          onError={({ currentTarget }) =>
                            teamLogoPathOnErrorFallback(currentTarget, context.league)
                          }
                        />
                      </div>

                      <div className="opponent-defensive-rank-section-header-main">
                        <div className="opponent-defensive-rank-section-copy">
                          <p className="text-style-h-4-semibold color-fig-default">
                            <span>{getPitcherDisplayName(entry.pitcher, t)}&nbsp;</span>
                            <span className="text-style-h-4-medium color-fig-subtle">
                              {`${entry.isHome ? "vs" : "@"} ${opponentTeamDisplayName}`}
                            </span>
                            <span className="text-style-caption-medium starting-pitchers-status-badge">
                                {getPitcherStatusLabel(entry.pitcher, t)}
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
                              onClick={() => redirectToStartingPitchersTrends(entry)}
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
                                key={trend.id || `${trend.gameId}-${trend.market?.name}-${trend.line}`}
                                className="trends-page-list-items-item opponent-defensive-rank-trend-card"
                                onClick={() => redirectToStartingPitchersTrends(entry, index)}
                            >
                                <TrendContent
                                card={trend}
                                league={context.league}
                                highlightedSignalType={STARTING_PITCHER_SIGNAL}
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

export default StartingPitchers;
