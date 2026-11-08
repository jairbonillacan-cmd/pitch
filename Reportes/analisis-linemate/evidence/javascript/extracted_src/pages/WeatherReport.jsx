import React, { useContext, useEffect, useMemo, useState } from "react";
import { Buffer } from "buffer";
import "./OpponentDefensiveRank.scss";
import "./WeatherReport.scss";
import "../components/App.scss";
import GlobalContext from "../components/GlobalContext";
import { API_HOST } from "../react-web-constants";
import {
  buildQueryParams,
  hasPremiumAccess,
  jsonOrDefault,
  parseDateFromString,
} from "../linemate-react-common/src/util";
import {
  SUPPORTED_LEAGUES,
} from "../linemate-react-common/src/constants";
import {
  getTeamLogoPath,
  getTheme,
  teamLogoPathOnErrorFallback,
} from "../react-web-utils";
import HomeSidebar from "../components/HomeSidebar";
import Footer from "../components/Footer";
import Button from "../components/Button";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useTranslation } from "react-i18next";

const WEATHER_SIGNAL = "WEATHER";
const UNKNOWN_DIRECTION = "UNKNOWN_DIRECTION";

const DIRECTION_LABEL_KEYS = {
  IN_TO_OUT: "inToOut",
  OUT_TO_RIGHT: "outToRight",
  OUT_TO_IN: "outToIn",
  IN_FROM_LEFT: "inFromLeft",
  IN_FROM_RIGHT: "inFromRight",
  LEFT_TO_RIGHT: "leftToRight",
  OUT_TO_LEFT: "outToLeft",
  RIGHT_TO_LEFT: "rightToLeft",
  [UNKNOWN_DIRECTION]: "unknown",
};

function titleCase(value) {
  if (!value) {
    return "";
  }

  return value
    .toString()
    .replace(/[_-]/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeBearing(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return null;
  }

  return ((Number(value) % 360) + 360) % 360;
}

function getBearingFromCardinalDirection(direction) {
  if (!direction) {
    return null;
  }

  const cardinalBearingMap = {
    N: 0,
    NNE: 22.5,
    NE: 45,
    ENE: 67.5,
    E: 90,
    ESE: 112.5,
    SE: 135,
    SSE: 157.5,
    S: 180,
    SSW: 202.5,
    SW: 225,
    WSW: 247.5,
    W: 270,
    WNW: 292.5,
    NW: 315,
    NNW: 337.5,
    NORTH: 0,
    EAST: 90,
    SOUTH: 180,
    WEST: 270,
  };

  return cardinalBearingMap[direction.toString().trim().toUpperCase()] ?? null;
}

function getVenueOrientationBearing(fieldOrientation) {
  if (fieldOrientation == null) {
    return null;
  }

  if (typeof fieldOrientation === "number") {
    return normalizeBearing(fieldOrientation);
  }

  if (typeof fieldOrientation === "string") {
    const numericBearing = normalizeBearing(fieldOrientation);
    if (numericBearing != null) {
      return numericBearing;
    }

    return getBearingFromCardinalDirection(fieldOrientation);
  }

  if (typeof fieldOrientation === "object") {
    return (
      normalizeBearing(fieldOrientation.bearing) ??
      normalizeBearing(fieldOrientation.degrees) ??
      normalizeBearing(fieldOrientation.angle) ??
      getBearingFromCardinalDirection(fieldOrientation.direction) ??
      getBearingFromCardinalDirection(fieldOrientation.cardinal)
    );
  }

  return null;
}

function getWindBearing(game) {
  const wind = game?.weather?.forecast?.wind;
  return normalizeBearing(wind?.bearing) ?? getBearingFromCardinalDirection(wind?.direction);
}

function getRelativeWindAngle(game) {
  const fieldBearing = getVenueOrientationBearing(game?.venue?.fieldOrientation);
  const windFromBearing = getWindBearing(game);

  if (fieldBearing == null || windFromBearing == null) {
    return null;
  }

  const windToBearing = normalizeBearing(windFromBearing + 180);
  return normalizeBearing(windToBearing - fieldBearing);
}

function getWindDirectionInfo(game) {
  const relativeAngle = getRelativeWindAngle(game);

  if (relativeAngle == null) {
    return {
      key: UNKNOWN_DIRECTION,
      labelKey: DIRECTION_LABEL_KEYS[UNKNOWN_DIRECTION],
      rotation: 0,
    };
  }

  if (relativeAngle < 22.5 || relativeAngle >= 337.5) {
    return { key: "IN_TO_OUT", labelKey: DIRECTION_LABEL_KEYS.IN_TO_OUT, rotation: 0 };
  }
  if (relativeAngle < 67.5) {
    return { key: "OUT_TO_RIGHT", labelKey: DIRECTION_LABEL_KEYS.OUT_TO_RIGHT, rotation: 45 };
  }
  if (relativeAngle < 112.5) {
    return { key: "LEFT_TO_RIGHT", labelKey: DIRECTION_LABEL_KEYS.LEFT_TO_RIGHT, rotation: 90 };
  }
  if (relativeAngle < 157.5) {
    return { key: "IN_FROM_LEFT", labelKey: DIRECTION_LABEL_KEYS.IN_FROM_LEFT, rotation: 135 };
  }
  if (relativeAngle < 202.5) {
    return { key: "OUT_TO_IN", labelKey: DIRECTION_LABEL_KEYS.OUT_TO_IN, rotation: 180 };
  }
  if (relativeAngle < 247.5) {
    return { key: "IN_FROM_RIGHT", labelKey: DIRECTION_LABEL_KEYS.IN_FROM_RIGHT, rotation: 225 };
  }
  if (relativeAngle < 292.5) {
    return { key: "RIGHT_TO_LEFT", labelKey: DIRECTION_LABEL_KEYS.RIGHT_TO_LEFT, rotation: 270 };
  }

  return { key: "OUT_TO_LEFT", labelKey: DIRECTION_LABEL_KEYS.OUT_TO_LEFT, rotation: 315 };
}

function shouldUseImperialUnits(locale) {
  return (locale || "").toUpperCase().includes("US");
}

function getWindSpeedValue(game, shouldUseImperial) {
  const wind = game?.weather?.forecast?.wind;

  if (shouldUseImperial) {
    const milesPerHour = wind?.speeds?.milesPerHour;
    if (milesPerHour != null) {
      return Math.round(milesPerHour);
    }

    const kilometersPerHour = wind?.speeds?.kilometersPerHour;
    if (kilometersPerHour != null) {
      return Math.round(kilometersPerHour / 1.60934);
    }

    return null;
  }

  const kilometersPerHour = wind?.speeds?.kilometersPerHour;
  if (kilometersPerHour != null) {
    return Math.round(kilometersPerHour);
  }

  const milesPerHour = wind?.speeds?.milesPerHour;
  if (milesPerHour != null) {
    return Math.round(milesPerHour * 1.60934);
  }

  return null;
}

function getWindSpeedLabel(game, locale, t) {
  const useImperial = shouldUseImperialUnits(locale);
  const windSpeedValue = getWindSpeedValue(game, useImperial);
  const windSpeedUnit = useImperial ? "MPH" : "KMH";

  return windSpeedValue == null ? t("weatherReport.labels.unavailableValue") : `${windSpeedValue}${windSpeedUnit}`;
}

export function getConditionLabel(game, t) {
  const forecast = game?.weather?.forecast;
  if (!forecast?.condition) {
    return t("weatherReport.labels.forecastUnavailable");
  }

  return titleCase(forecast.condition);
}

export function getTemperatureLabel(game, locale) {
  const useImperial = shouldUseImperialUnits(locale);
  const temperatures = game?.weather?.forecast?.temperatures;
  const primaryTemperature = useImperial ? temperatures?.fahrenheit : temperatures?.celsius;
  const fallbackTemperature = useImperial ? temperatures?.celsius : temperatures?.fahrenheit;
  const temperatureValue = primaryTemperature ?? fallbackTemperature;

  if (temperatureValue == null) {
    return null;
  }

  if (primaryTemperature != null) {
    return `${Math.round(primaryTemperature)}°${useImperial ? "F" : "C"}`;
  }

  const convertedValue = useImperial
    ? (Number(fallbackTemperature) * 9) / 5 + 32
    : ((Number(fallbackTemperature) - 32) * 5) / 9;

  return `${Math.round(convertedValue)}°${useImperial ? "F" : "C"}`;
}

export function getDescription(game, t) {
  return game?.weather?.forecast?.description || t("weatherReport.labels.unavailableDescription");
}

function getGameDateTimeLabel(game, locale) {
  const date = new Date(game.timestamp);

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

function getGameItemKey(game) {
  return game?.id || `${game?.awayTeamData?.info?.code}-${game?.homeTeamData?.info?.code}-${game?.timestamp}`;
}

function buildWeatherReportTrendsHref(league, game) {
  const awayTeamCode = game?.awayTeamData?.info?.code;
  const homeTeamCode = game?.homeTeamData?.info?.code;

  const feed = {
    titleKey: "weatherReport.title",
    subtitle: `${awayTeamCode} @ ${homeTeamCode}`,
    includeFilters: false,
    highlightedSignalType: WEATHER_SIGNAL,
    queryParams: {
      gameIds: game.id,
      signals: WEATHER_SIGNAL,
    },
  };

  return `/${league}/trends?feed=${encodeURIComponent(
    Buffer.from(JSON.stringify(feed)).toString("base64")
  )}&tabs=${encodeURIComponent(JSON.stringify(["player"]))}&tab=player`;
}

function buildAllWeatherReportTrendsHref(league) {
  const feed = {
    titleKey: "weatherReport.title",
    includeFilters: false,
    highlightedSignalType: WEATHER_SIGNAL,
    queryParams: {
      signals: WEATHER_SIGNAL,
    },
  };

  return `/${league}/trends?feed=${encodeURIComponent(
    Buffer.from(JSON.stringify(feed)).toString("base64")
  )}&tabs=${encodeURIComponent(JSON.stringify(["player"]))}&tab=player`;
}

function TeamLogoCircle({ league, teamCode, teamId }) {
  const backgroundColor =
    SUPPORTED_LEAGUES[league]?.teams?.colors?.[getTheme()]?.[teamCode?.toLowerCase?.()] ||
    "var(--color-surface-subtle)";

  return (
    <div
      className="weather-report-team-logo-background"
      style={{ backgroundColor }}
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

function TeamLogoStack({ league, awayTeamCode, awayTeamId, homeTeamCode, homeTeamId }) {
  return (
    <div className="weather-report-team-logo-stack">
      <TeamLogoCircle league={league} teamCode={awayTeamCode} teamId={awayTeamId} />
      <div className="weather-report-team-logo-stack-overlap">
        <TeamLogoCircle league={league} teamCode={homeTeamCode} teamId={homeTeamId} />
      </div>
    </div>
  );
}

export function FieldWeatherGraphic({ game, t, locale }) {
  const isDark = getTheme() === "dark";
  const windDirectionInfo = getWindDirectionInfo(game);
  const arrowOpacity = windDirectionInfo.key === UNKNOWN_DIRECTION ? 0.45 : 1;
  const windSpeedLabel = getWindSpeedLabel(game, locale, t);

  const fieldAsset = isDark
    ? "/assets/baseball-field-dark.svg"
    : "/assets/baseball-field-light.svg";

  const arrowAsset = isDark
    ? "/assets/baseball-field-arrow-dark.svg"
    : "/assets/baseball-field-arrow-light.svg";

  return (
    <div className="weather-report-field-graphic">
      <div className="weather-report-field-graphic-canvas">
        <img
          src={fieldAsset}
          alt=""
          className="weather-report-field-base"
        />
        <img
          src={arrowAsset}
          alt=""
          className="weather-report-field-arrow"
          style={{
            transform: `rotate(${windDirectionInfo.rotation}deg)`,
            opacity: arrowOpacity,
          }}
        />
      </div>

      <div className="weather-report-field-caption">
        <p className="text-style-caption-medium color-fig-default">
          {t(`trends.analysis.weatherDirections.${windDirectionInfo.labelKey}`)}
        </p>
        <p className="text-style-caption-uppercase-medium color-fig-default">
          {windSpeedLabel}
        </p>
      </div>
    </div>
  );
}

function WeatherReportContent({ game, league, t, locale }) {
  const isNflWeatherLayout = SUPPORTED_LEAGUES[league]?.layout?.weatherReport === "stacked";
  const temperatureLabel = getTemperatureLabel(game, locale);

  return (
    <div
      className={
        isNflWeatherLayout
          ? "weather-report-content weather-report-content--stacked"
          : "weather-report-content"
      }
    >
      <div className="weather-report-copy">
        <p className="text-style-label-medium color-fig-default">
          {temperatureLabel ? `${getConditionLabel(game, t)} • ${temperatureLabel}` : getConditionLabel(game, t)}
        </p>
        <p className="text-style-caption-normal color-fig-subtle">
          {getDescription(game, t)}
        </p>
      </div>

      {!isNflWeatherLayout && <FieldWeatherGraphic game={game} t={t} locale={locale} />}
    </div>
  );
}

function WeatherReport() {
  const { t, i18n } = useTranslation();
  const context = useContext(GlobalContext);
  const userHasPremiumAccess = hasPremiumAccess(context.userAttributes);
  const weatherToolSupported = (
    SUPPORTED_LEAGUES[context.league]?.advancedTools || []
  ).includes("weather_report");

  const [width, setWidth] = useState(window.innerWidth);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = `${t("weatherReport.title")} - Linemate`;
  }, [t]);

  useEffect(() => {
    if (!context.league) {
      return;
    }

    if (userHasPremiumAccess && weatherToolSupported) {
      return;
    }

    window.location.replace(`/${context.league}`);
  }, [context.league, weatherToolSupported, userHasPremiumAccess]);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function primeWeatherPage() {
      if (!userHasPremiumAccess || !weatherToolSupported || !context.league) {
        setLoading(false);
        return;
      }

      setLoading(true);

      await fetch(
        `${API_HOST}/api/${context.league}/v1/trends/straights?${buildQueryParams({
          offset: 0,
          limit: 1,
          preferredProviders: context.resolvedPreferredProviders,
          signals: WEATHER_SIGNAL,
        })}`
      )
        .then((response) => jsonOrDefault(response, []))
        .catch(() => []);

      if (cancelled) {
        return;
      }

      setLoading(false);
    }

    primeWeatherPage();

    return () => {
      cancelled = true;
    };
  }, [context.league, context.resolvedPreferredProviders, userHasPremiumAccess, weatherToolSupported]);

  const games = useMemo(() => context.currentGames || [], [context.currentGames]);

  const redirectToAllWeatherTrends = () => {
    window.location.href = buildAllWeatherReportTrendsHref(context.league);
  };

  const redirectToGameWeatherTrends = (game) => {
    window.location.href = buildWeatherReportTrendsHref(context.league, game);
  };

  if (!userHasPremiumAccess || !weatherToolSupported) {
    return null;
  }

  return (
    <div className="opponent-defensive-rank-page-container">
      <div className="opponent-defensive-rank-main-container">
        <div className="opponent-defensive-rank-content-row">
          <div className="opponent-defensive-rank-content-wrapper">
            <div className="opponent-defensive-rank-header">
              <p className="text-style-h-2-semibold color-fig-default">
                {t("weatherReport.title")}
              </p>

              <div className="opponent-defensive-rank-view-all-wrapper">
                <Button
                  text={t("common.viewAll")}
                  typography="md"
                  type="invisible"
                  enabled="true"
                  onClick={redirectToAllWeatherTrends}
                  className="opponent-defensive-rank-view-all"
                />
              </div>
            </div>

            <div className="opponent-defensive-rank-sections">
              {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
                  <Loader />
                </div>
              ) : games.length === 0 ? (
                <EmptyState
                  variant="advanced-tool"
                  title={t("weatherReport.empty.title")}
                  subtitle={t("common.empty.checkBackLater")}
                  lightIconPath={
                    context.league === "nfl"
                      ? "/assets/empty-state/empty-weather-nfl-light.png"
                      : "/assets/empty-state/empty-weather-mlb-light.png"
                  }
                  darkIconPath={
                    context.league === "nfl"
                      ? "/assets/empty-state/empty-weather-nfl-dark.png"
                      : "/assets/empty-state/empty-weather-mlb-dark.png"
                  }
                />
              ) : (
                <div className="weather-report-grid">
                  {games.map((game) => {
                    const awayTeamCode = game?.awayTeamData?.info?.code;
                    const homeTeamCode = game?.homeTeamData?.info?.code;
                    const awayTeamId = game?.awayTeamData?.info?.teamId;
                    const homeTeamId = game?.homeTeamData?.info?.teamId;

                    return (
                      <div
                        key={getGameItemKey(game)}
                        className="weather-report-card"
                        onClick={() => redirectToGameWeatherTrends(game)}
                      >
                        <div className="weather-report-card-header">
                          <div className="weather-report-team weather-report-team--away">
                            <TeamLogoCircle league={context.league} teamCode={awayTeamCode} teamId={awayTeamId} />
                            <p className="text-style-label-semibold color-fig-default weather-report-team-code">
                              {awayTeamCode}
                            </p>
                          </div>

                          <p className="text-style-caption-medium color-fig-subtle weather-report-card-time">
                            {getGameDateTimeLabel(game, i18n.language)}
                          </p>

                          <div className="weather-report-team weather-report-team--home">
                            <p className="text-style-label-semibold color-fig-default weather-report-team-code weather-report-team-code--home">
                              {homeTeamCode}
                            </p>
                            <TeamLogoCircle league={context.league} teamCode={homeTeamCode} teamId={homeTeamId} />
                          </div>
                        </div>

                        <div className="weather-report-card-body">
                          <WeatherReportContent game={game} league={context.league} t={t} locale={i18n.language} />
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

export default WeatherReport;
