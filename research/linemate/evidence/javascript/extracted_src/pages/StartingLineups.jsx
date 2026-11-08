import React, { useContext, useEffect, useMemo, useState } from "react";
import { Buffer } from "buffer";
import "./OpponentDefensiveRank.scss";
import "./StartingLineups.scss";
import "../components/App.scss";
import GlobalContext from "../components/GlobalContext";
import { API_HOST } from "../react-web-constants";
import {
  buildQueryParams,
  getPlayerName,
  hasPremiumAccess,
  jsonOrDefault,
  parseDateFromString,
} from "../linemate-react-common/src/util";
import {
  SUPPORTED_LEAGUES,
} from "../linemate-react-common/src/constants";
import { supportedTrendFilter } from "../linemate-react-common/src/betting-utils";
import {
  getTeamLogoPath,
  getTheme,
  teamLogoPathOnErrorFallback,
  shouldUseRoundTeamLogoBackground
} from "../react-web-utils";
import HomeSidebar from "../components/HomeSidebar";
import Footer from "../components/Footer";
import Button from "../components/Button";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useTranslation } from "react-i18next";

const STARTER_SIGNAL = "STARTER";

function formatGameDateTimeLabel(timestamp, locale) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const datePart = date.toLocaleDateString(locale || undefined, {
    month: "short",
    day: "numeric",
  });

  const timePart = date.toLocaleTimeString(locale || undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${datePart}・${timePart}`.toUpperCase();
}

function isBaseballLeague(league) {
  return SUPPORTED_LEAGUES[league]?.layout?.lineupMode === "baseball";
}

function getLineupStatusLabel(teamData, league, t) {
  const isConfirmed = isBaseballLeague(league)
    ? teamData?.startingPitcher?.confirmed
    : teamData?.lineup?.confirmed;

  return t(isConfirmed ? "startingLineups.labels.confirmed" : "startingLineups.labels.expected");
}

function buildPlayersList(teamData, league) {
  if (isBaseballLeague(league)) {
    const players = [];
    const startingPitcher = teamData?.startingPitcher;

    if (startingPitcher) {
      players.push({
        ...startingPitcher,
        position: startingPitcher?.position || startingPitcher?.info?.position || "P",
      });
    }

    if (Array.isArray(teamData?.hittingLineup)) {
      players.push(...teamData.hittingLineup);
    }

    return players;
  }

  return Array.isArray(teamData?.lineup?.players) ? teamData.lineup.players : [];
}

function buildStartingLineupsTrendsHref(league, game) {
  const awayTeamCode = game?.awayTeamData?.info?.code;
  const homeTeamCode = game?.homeTeamData?.info?.code;

  const feed = {
    titleKey: "startingLineups.title",
    subtitle: `${awayTeamCode} @ ${homeTeamCode}`,
    includeFilters: false,
    highlightedSignalType: STARTER_SIGNAL,
    queryParams: {
      gameIds: game.id,
      signals: STARTER_SIGNAL,
    },
  };

  return `/${league}/trends?feed=${encodeURIComponent(
    Buffer.from(JSON.stringify(feed)).toString("base64")
  )}&tabs=${encodeURIComponent(JSON.stringify(["player"]))}&tab=player`;
}

function buildAllStartingLineupsTrendsHref(league) {
  const feed = {
    titleKey: "startingLineups.title",
    includeFilters: false,
    highlightedSignalType: STARTER_SIGNAL,
    queryParams: {
      signals: STARTER_SIGNAL,
    },
  };

  return `/${league}/trends?feed=${encodeURIComponent(
    Buffer.from(JSON.stringify(feed)).toString("base64")
  )}&tabs=${encodeURIComponent(JSON.stringify(["player"]))}&tab=player`;
}

function TeamLogo({ league, teamCode, teamId }) {
  const backgroundColor =
    SUPPORTED_LEAGUES[league]?.teams?.colors?.[getTheme()]?.[teamCode?.toLowerCase?.()] ||
    "var(--color-surface-subtle)";
  const useRoundBackground = shouldUseRoundTeamLogoBackground(league);

  return (
    <div
      className={`starting-lineups-team-logo-background${
        useRoundBackground ? "" : " starting-lineups-team-logo-background--flat"
      }`}
      style={{ backgroundColor: useRoundBackground ? backgroundColor : "transparent" }}
    >
      <img
        src={getTeamLogoPath(league, teamId)}
        alt={teamCode}
        onError={({ currentTarget }) =>
          teamLogoPathOnErrorFallback(currentTarget, league)
        }
      />
    </div>
  );
}

function StatusBadge({ label, align = "left" }) {
  return (
    <div
      className={`starting-lineups-status-slot${
        align === "right" ? " starting-lineups-status-slot--right" : ""
      }`}
    >
      <div className="starting-lineups-status-badge">
        <p className="text-style-caption-semibold color-fig-subtle">{label}</p>
      </div>
    </div>
  );
}

function PlayerRow({ player, align = "left", sideKey, index, t }) {
  const position = player?.info?.position || player?.position || "";
  const playerName = getPlayerName(player) || t("startingLineups.labels.tbd");
  const key =
    player?.SRGUID ||
    player?.info?.SRGUID ||
    `${sideKey}-${index}-${playerName}`;

  if (align === "right") {
    return (
      <div key={key} className="starting-lineups-player-row starting-lineups-player-row--right">
        <p className="text-style-caption-medium color-fig-default starting-lineups-player-name starting-lineups-player-name--right">
          {playerName}
        </p>
        <p className="text-style-caption-medium color-fig-subtle starting-lineups-player-position starting-lineups-player-position--right">
          {position}
        </p>
      </div>
    );
  }

  return (
    <div key={key} className="starting-lineups-player-row">
      <p className="text-style-caption-medium color-fig-subtle starting-lineups-player-position">
        {position}
      </p>
      <p className="text-style-caption-medium color-fig-default starting-lineups-player-name">
        {playerName}
      </p>
    </div>
  );
}

function PlayerColumn({ players, align = "left", sideKey, t }) {
  if (!players.length) {
    return (
      <p
        className={`text-style-caption-medium color-fig-disabled starting-lineups-empty-copy${
          align === "right" ? " starting-lineups-empty-copy--right" : ""
        }`}
      >
        {t("startingLineups.labels.noLineupAvailable")}
      </p>
    );
  }

  return (
    <div className="starting-lineups-player-column">
      {players.map((player, index) => (
        <PlayerRow
          key={
            player?.SRGUID ||
            player?.info?.SRGUID ||
            `${sideKey}-${index}-${getPlayerName(player) || "TBD"}`
          }
          t={t}
          player={player}
          align={align}
          sideKey={sideKey}
          index={index}
        />
      ))}
    </div>
  );
}

function StartingLineups() {
  const { t, i18n } = useTranslation();
  const context = useContext(GlobalContext);
  const userHasPremiumAccess = hasPremiumAccess(context.userAttributes);
  const lineupToolSupported = (
    SUPPORTED_LEAGUES[context.league]?.advancedTools || []
  ).includes("starting_lineups");

  const [width, setWidth] = useState(window.innerWidth);
  const [loading, setLoading] = useState(true);
  const [visibleGameIds, setVisibleGameIds] = useState(new Set());

  useEffect(() => {
    document.title = `${t("startingLineups.title")} - Linemate`;
  }, [t]);

  useEffect(() => {
    if (!context.league) {
      return;
    }

    if (userHasPremiumAccess && lineupToolSupported) {
      return;
    }

    window.location.replace(`/${context.league}`);
  }, [context.league, lineupToolSupported, userHasPremiumAccess]);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const visibleGames = useMemo(() => {
    return (context.currentGames || []).filter((game) => visibleGameIds.has(game.id));
  }, [context.currentGames, visibleGameIds]);

  const redirectToAllStartingLineupsTrends = () => {
    window.location.href = buildAllStartingLineupsTrendsHref(context.league);
  };

  const redirectToGameStartingLineupsTrends = (game) => {
    window.location.href = buildStartingLineupsTrendsHref(context.league, game);
  };

  useEffect(() => {
    let cancelled = false;

    async function loadTrends() {
      if (!userHasPremiumAccess || !lineupToolSupported) {
        setLoading(false);
        return;
      }

      const uniqueGameIds = [
        ...new Set((context.currentGames || []).map((game) => game.id).filter(Boolean)),
      ];

      if (!uniqueGameIds.length) {
        setVisibleGameIds(new Set());
        setLoading(false);
        return;
      }

      setLoading(true);

      const gamesWithStarterTrends = new Set();
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
            signals: STARTER_SIGNAL,
          })}`
        )
          .then((response) => jsonOrDefault(response, []))
          .then((trends) =>
            (trends || []).filter((trend) => supportedTrendFilter(context.league, trend))
          )
          .catch(() => []);

        page.forEach((trend) => {
          if (trend?.gameId) {
            gamesWithStarterTrends.add(trend.gameId);
          }
        });

        const allVisibleGamesFound = uniqueGameIds.every((gameId) =>
          gamesWithStarterTrends.has(gameId)
        );

        reachedEnd = page.length < limit || allVisibleGamesFound;
        offset += limit;
      }

      if (cancelled) {
        return;
      }

      setVisibleGameIds(new Set(gamesWithStarterTrends));
      setLoading(false);
    }

    loadTrends();

    return () => {
      cancelled = true;
    };
  }, [
    context.currentGames,
    context.league,
    context.resolvedPreferredProviders,
    lineupToolSupported,
    userHasPremiumAccess,
  ]);

  if (!userHasPremiumAccess || !lineupToolSupported) {
    return null;
  }

  return (
    <div className="opponent-defensive-rank-page-container">
      <div className="opponent-defensive-rank-main-container">
        <div className="opponent-defensive-rank-content-row">
          <div className="opponent-defensive-rank-content-wrapper">
            <div className="opponent-defensive-rank-header">
              <p className="text-style-h-2-semibold color-fig-default">
                {t("startingLineups.title")}
              </p>

              <div className="opponent-defensive-rank-view-all-wrapper">
                <Button
                  text={t("common.viewAll")}
                  typography="md"
                  type="invisible"
                  enabled="true"
                  onClick={redirectToAllStartingLineupsTrends}
                  className="opponent-defensive-rank-view-all"
                />
              </div>
            </div>

            <div className="opponent-defensive-rank-sections">
              {loading ? (
                <div className="starting-lineups-feedback">
                  <Loader />
                </div>
              ) : visibleGames.length === 0 ? (
                <EmptyState
                  variant="advanced-tool"
                  title={t("startingLineups.empty.title")}
                  subtitle={t("common.empty.checkBackLater")}
                  lightIconPath="/assets/empty-state/empty-lineups-light.png"
                  darkIconPath="/assets/empty-state/empty-lineups-dark.png"
                />
              ) : (
                <div className="starting-lineups-grid">
                  {visibleGames.map((game) => {
                    const awayTeamCode = game?.awayTeamData?.info?.code;
                    const homeTeamCode = game?.homeTeamData?.info?.code;
                    const awayTeamId = game?.awayTeamData?.info?.teamId;
                    const homeTeamId = game?.homeTeamData?.info?.teamId;
                    const awayPlayers = buildPlayersList(game?.awayTeamData, context.league);
                    const homePlayers = buildPlayersList(game?.homeTeamData, context.league);
                    const hasAwayLineup = awayPlayers.length > 0;
                    const hasHomeLineup = homePlayers.length > 0;

                    return (
                      <div
                        key={
                          game?.id ||
                          `${awayTeamCode}-${homeTeamCode}-${game?.timestamp}`
                        }
                        className="starting-lineups-card"
                        onClick={() => redirectToGameStartingLineupsTrends(game)}
                      >
                        <div className="starting-lineups-card-header">
                          <div className="starting-lineups-team starting-lineups-team--away">
                            <TeamLogo league={context.league} teamCode={awayTeamCode} teamId={awayTeamId} />
                            <p className="text-style-label-semibold color-fig-default starting-lineups-team-code">
                              {awayTeamCode}
                            </p>
                          </div>

                          <p className="text-style-caption-uppercase-medium color-fig-subtle starting-lineups-game-time">
                            {formatGameDateTimeLabel(game?.timestamp, i18n.language)}
                          </p>

                          <div className="starting-lineups-team starting-lineups-team--home">
                            <p className="text-style-label-semibold color-fig-default starting-lineups-team-code starting-lineups-team-code--home">
                              {homeTeamCode}
                            </p>
                            <TeamLogo league={context.league} teamCode={homeTeamCode} teamId={homeTeamId} />
                          </div>
                        </div>
                        
                        <div className="starting-lineups-card-body">
                            <div className="starting-lineups-status-row">
                            {hasAwayLineup ? (
                                <StatusBadge
                                  label={getLineupStatusLabel(game?.awayTeamData, context.league, t)}
                                />
                            ) : (
                                <div className="starting-lineups-status-slot" />
                            )}

                            {hasHomeLineup ? (
                                <StatusBadge
                                  label={getLineupStatusLabel(game?.homeTeamData, context.league, t)}
                                  align="right"
                                />
                            ) : (
                                <div className="starting-lineups-status-slot starting-lineups-status-slot--right" />
                            )}
                            </div>

                            <div className="starting-lineups-columns">
                            <PlayerColumn players={awayPlayers} sideKey="away" t={t} />
                            <PlayerColumn players={homePlayers} align="right" sideKey="home" t={t} />
                            </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
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

export default StartingLineups;
