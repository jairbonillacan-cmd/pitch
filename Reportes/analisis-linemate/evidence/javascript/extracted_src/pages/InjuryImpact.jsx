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
  hasPremiumAccess,
  jsonOrDefault,
} from "../linemate-react-common/src/util";
import {
  SUPPORTED_LEAGUES,
} from "../linemate-react-common/src/constants";
import {
  getCardKey,
  supportedTrendFilter,
} from "../linemate-react-common/src/betting-utils";
import TrendContent from "../components/TrendContent";
import HomeSidebar from "../components/HomeSidebar";
import Footer from "../components/Footer";
import Button from "../components/Button";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useTranslation } from "react-i18next";

const INJURY_IMPACT_SIGNAL = "INJURY_IMPACT";
function getInjurySignals(trend) {
  return (trend.signals || []).filter(
    (signal) =>
      signal.type === INJURY_IMPACT_SIGNAL &&
      getInjuryPlayerId(signal)
  );
}

function getInjuryPlayerId(signal) {
  return signal?.injuryReport?.playerId
    || signal?.injuryReport?.id
    || signal?.injuryReport?.SRGUID
    || signal?.injuryReport?.srguid
    || signal?.playerId
    || signal?.id
    || null;
}

function getInjuryTeamCode(signal) {
  return signal?.injuryReport?.team?.code
    || signal?.injuryReport?.teamCode
    || signal?.team?.code
    || signal?.teamCode
    || null;
}

function getInjuryShortName(injury) {
  const firstName =
    injury?.firstName ||
    injury?.info?.firstName ||
    injury?.injuryReport?.firstName ||
    "";
  const lastName =
    injury?.lastName ||
    injury?.info?.lastName ||
    injury?.injuryReport?.lastName ||
    "";

  if (firstName && lastName) {
    return `${firstName[0]}. ${lastName}`;
  }

  return getPlayerName(injury)
}

function buildInjuryEntries(injuries, currentGames) {
  const injuriesByTeam = {};

  (injuries || []).forEach((injury) => {
    const playerId = getPlayerId(injury);

    if (!injury?.teamCode || !playerId) {
      return;
    }

    if (!(injury.teamCode in injuriesByTeam)) {
      injuriesByTeam[injury.teamCode] = [];
    }

    injuriesByTeam[injury.teamCode].push(injury);
  });

  const entries = [];

  (currentGames || []).forEach((game, gameIndex) => {
    const awayTeamCode = game?.awayTeamData?.info?.code;
    const homeTeamCode = game?.homeTeamData?.info?.code;

    const teamEntries = [
      {
        gameId: game?.id,
        teamCode: awayTeamCode,
        opponentCode: homeTeamCode,
        teamSortOrder: 0,
      },
      {
        gameId: game?.id,
        teamCode: homeTeamCode,
        opponentCode: awayTeamCode,
        teamSortOrder: 1,
      },
    ];

    teamEntries.forEach((teamEntry) => {
      (injuriesByTeam[teamEntry.teamCode] || []).forEach((injury, injurySortOrder) => {
        const playerId = getPlayerId(injury);

        if (!teamEntry.gameId || !teamEntry.teamCode || !playerId) {
          return;
        }

        entries.push({
          ...teamEntry,
          injury,
          playerId,
          key: `${teamEntry.gameId}-${playerId}`,
          gameSortOrder: gameIndex,
          injurySortOrder,
        });
      });
    });
  });

  return entries;
}

function buildInjuryImpactTrendsHref(league, entry, storageKey, selectedTrendIndex = 0) {
  const feed = {
    titleKey: "injuryImpact.title",
    subtitle: getInjuryShortName(entry.injury),
    importedTrendsKey: storageKey,
    includeFilters: false,
    highlightedSignalType: INJURY_IMPACT_SIGNAL,
    isInjuryImpactFeed: true,
    without: {
      id: entry.playerId,
      name: getPlayerName(entry.injury),
    },
  };

  return `/${league}/trends?feed=${encodeURIComponent(
    Buffer.from(JSON.stringify(feed)).toString("base64")
  )}&tabs=${encodeURIComponent(JSON.stringify(["player"]))}&tab=player&index=${selectedTrendIndex}`;
}

function buildAllInjuryImpactTrendsHref(league) {
  const feed = {
    titleKey: "injuryImpact.title",
    includeFilters: false,
    highlightedSignalType: INJURY_IMPACT_SIGNAL,
    queryParams: {
      signals: INJURY_IMPACT_SIGNAL,
    },
  };

  return `/${league}/trends?feed=${encodeURIComponent(
    Buffer.from(JSON.stringify(feed)).toString("base64")
  )}&tabs=${encodeURIComponent(JSON.stringify(["player"]))}&tab=player`;
}

function InjuryImpact() {
  const { t } = useTranslation();
  const context = useContext(GlobalContext);
  const userHasPremiumAccess = hasPremiumAccess(context.userAttributes);
  const toolSupported = (
    SUPPORTED_LEAGUES[context.league]?.advancedTools || []
  ).includes("injury_impact");

  const [width, setWidth] = useState(window.innerWidth);
  const [loading, setLoading] = useState(true);
  const [injuries, setInjuries] = useState([]);
  const [trends, setTrends] = useState([]);

  useEffect(() => {
    document.title = `${t("injuryImpact.title")} - Linemate`;
  }, [t]);

  useEffect(() => {
    if (!context.league) {
      return;
    }

    if (userHasPremiumAccess && toolSupported) {
      return;
    }

    window.location.replace(`/${context.league}`);
  }, [context.league, toolSupported, userHasPremiumAccess]);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInjuryImpact() {
      if (!userHasPremiumAccess || !toolSupported || !context.league) {
        setInjuries([]);
        setTrends([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const injuriesRequest = fetch(`${API_HOST}/api/${context.league}/v3/teams/injuries`)
          .then((response) => jsonOrDefault(response, {}))
          .catch(() => ({}));

        const allTrends = [];
        const limit = 100;
        let offset = 0;

        while (!cancelled) {
          const response = await fetch(
            `${API_HOST}/api/${context.league}/v1/trends/straights?${buildQueryParams({
              signals: INJURY_IMPACT_SIGNAL,
              preferredProviders: context.resolvedPreferredProviders,
              offset,
              limit,
            })}`
          );
          if (!response.ok) throw new Error(`Injury impact request failed: ${response.status}`);

          const page = await jsonOrDefault(response, []);
          if (!Array.isArray(page)) break;

          allTrends.push(...page);
          if (page.length < limit) break;
          offset += limit;
        }

        const hydratedTrends = await Promise.all(
          allTrends.map(async (trend) => {
            const trendId = trend.trendId || trend.id;
            if (!trendId) return trend;

            try {
              const response = await fetch(
                `${API_HOST}/api/${context.league}/v1/trends/straights/${encodeURIComponent(trendId)}`
              );
              if (!response.ok) return trend;

              const details = await jsonOrDefault(response, null);
              return details
                ? {
                    ...trend,
                    gameId: trend.gameId || details.gameId,
                    signals: details.signals || trend.signals || [],
                  }
                : trend;
            } catch (error) {
              console.error("Unable to load injury impact details", trendId, error);
              return trend;
            }
          })
        );

        const injuryResponse = await injuriesRequest;
        if (cancelled) return;

        setInjuries(Object.values(injuryResponse || {}).flat(1));
        setTrends(
          hydratedTrends.filter(
            (trend) =>
              supportedTrendFilter(context.league, trend) &&
              getInjurySignals(trend).length > 0
          )
        );
      } catch (error) {
        if (!cancelled) {
          console.error("Unable to load injury impact trends", error);
          setTrends([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInjuryImpact();
    return () => {
      cancelled = true;
    };
  }, [
    context.league,
    context.resolvedPreferredProviders,
    toolSupported,
    userHasPremiumAccess,
  ]);

  const entries = useMemo(() => {
    const result = new Map(
      buildInjuryEntries(injuries, context.currentGames).map((entry) => [entry.key, entry])
    );

    trends.forEach((trend) => {
      const gameId = trend.gameId || trend.market?.gameId;

      getInjurySignals(trend).forEach((signal, injurySortOrder) => {
        const playerId = getInjuryPlayerId(signal);
        if (!gameId || !playerId) return;

        const key = `${gameId}-${playerId}`;
        if (result.has(key)) return;

        const injury = signal.injuryReport;
        const gameIndex = (context.currentGames || []).findIndex(
          (game) => String(game.id) === String(gameId)
        );
        const game = context.currentGames?.[gameIndex];
        const teamCode = getInjuryTeamCode(signal) || trend.team?.code;
        const awayCode = game?.awayTeamData?.info?.code;
        const homeCode = game?.homeTeamData?.info?.code;

        result.set(key, {
          key,
          gameId,
          playerId,
          teamCode,
          opponentCode: teamCode === awayCode ? homeCode : awayCode,
          injury: { ...injury, playerId, teamCode },
          gameSortOrder: gameIndex < 0 ? Number.MAX_SAFE_INTEGER : gameIndex,
          teamSortOrder: teamCode === awayCode ? 0 : 1,
          injurySortOrder,
        });
      });
    });
    

    return [...result.values()].sort(
      (left, right) =>
        left.gameSortOrder - right.gameSortOrder ||
        left.teamSortOrder - right.teamSortOrder ||
        left.injurySortOrder - right.injurySortOrder
    );
  }, [injuries, context.currentGames, trends]);

  const trendsByEntry = useMemo(() => {
    const result = Object.fromEntries(entries.map((entry) => [entry.key, []]));

    trends.forEach((trend) => {
      const gameId = trend.gameId || trend.market?.gameId;

      getInjurySignals(trend).forEach((signal) => {
        const playerId = getInjuryPlayerId(signal);
        const cards = result[`${gameId}-${playerId}`];
        if (!cards) return;

        const cardKey = getCardKey(trend);
        if (!cards.some((card) => getCardKey(card) === cardKey)) {
          cards.push(trend);
        }
      });
    });

    return result;
  }, [entries, trends]);

  const visibleEntries = useMemo(
    () => entries.filter((entry) => trendsByEntry[entry.key]?.length > 0),
    [entries, trendsByEntry]
  );

  const redirectToInjuryImpactTrends = (entry, entryTrends, selectedTrendIndex = 0) => {
    const storageKey = `injury-impact-${Date.now()}`;
    sessionStorage.setItem(storageKey, JSON.stringify(entryTrends));

    window.location.href = buildInjuryImpactTrendsHref(
      context.league,
      entry,
      storageKey,
      selectedTrendIndex
    );
  };

  const redirectToAllInjuryImpactTrends = () => {
    window.location.href = buildAllInjuryImpactTrendsHref(context.league);
  };

  if (!userHasPremiumAccess || !toolSupported) {
    return null;
  }

  return (
    <div className="opponent-defensive-rank-page-container">
      <div className="opponent-defensive-rank-main-container">
        <div className="opponent-defensive-rank-content-row">
          <div className="opponent-defensive-rank-content-wrapper">
            <div className="opponent-defensive-rank-header">
              <p className="text-style-h-2-semibold color-fig-default">
                {t("injuryImpact.title")}
              </p>

              <div className="opponent-defensive-rank-view-all-wrapper">
                <Button
                  text={t("common.viewAll")}
                  typography="md"
                  type="invisible"
                  enabled="true"
                  onClick={redirectToAllInjuryImpactTrends}
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
                  title={t("injuryImpact.empty.title")}
                  subtitle={t("common.empty.checkBackLater")}
                  lightIconPath="/assets/empty-state/empty-card-light.png"
                  darkIconPath="/assets/empty-state/empty-card-dark.png"
                />
              ) : (
                visibleEntries.map((entry) => {
                  const trends = trendsByEntry[entry.key] || [];
                  const visibleTrends = trends.slice(0, 3);
                  return (
                    <div key={entry.key} className="opponent-defensive-rank-section">
                      <div className="opponent-defensive-rank-section-header">
                        <div className="opponent-defensive-rank-section-header-main">
                            <div className="opponent-defensive-rank-section-copy">
                              <p className="text-style-h-4-semibold color-fig-default">
                                <span>{getPlayerName(entry.injury) || entry.injury?.fullName || t("web.common.unknown")}</span>
                                <span className="color-fig-subtle"> ・ </span>
                                <span className="text-style-h-4-medium color-fig-subtle">
                                  {entry.injury.status}
                                </span>
                                <span className="text-style-caption-medium starting-pitchers-status-badge">
                                  {entry.injury.injury}
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
                                onClick={() => redirectToInjuryImpactTrends(entry, trends, 0)}
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
                              onClick={() => redirectToInjuryImpactTrends(entry, trends, index)}
                            >
                              <TrendContent
                                card={trend}
                                league={context.league}
                                highlightedSignalType={INJURY_IMPACT_SIGNAL}
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

export default InjuryImpact;
