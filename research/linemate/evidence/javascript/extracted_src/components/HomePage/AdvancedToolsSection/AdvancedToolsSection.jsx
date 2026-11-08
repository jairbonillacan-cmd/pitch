import React, { useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import "./AdvancedToolsSection.scss";

import TrendContent from "../../TrendContent";
import InputSelection from "../../InputSelection";
import EmptyState from "../../EmptyState";
import Button from "../../Button";
import GlobalContext from "../../GlobalContext";
import CardCarousel from "../../CardCarousel";
import HomeCheckoutCard from "../HomeCheckoutCard";

import {
  base64Encode,
  getGamesFilterForAPI,
  getGameTitle,
  parseDateFromString,
} from "../../../linemate-react-common/src/util";
import { FILTER_KEYS } from "../../../linemate-react-common/src/filter-config";

const ADVANCED_TOOLS_SUBTITLE_KEYS = {
  starting_lineups: "home.advancedTools.subtitles.startingLineups",
  injury_impact: "home.advancedTools.subtitles.injuryImpact",
  opponent_rank: "home.advancedTools.subtitles.opponentRank",
  starting_pitchers: "home.advancedTools.subtitles.startingPitchers",
  weather_report: "home.advancedTools.subtitles.weatherReport",
}

function AdvancedToolsCarouselCard({ element }) {
  const trend = element.trend;

  return (
    <HomeCheckoutCard trend={trend}>
      {(preferredProviders) => (
        <div className="advanced-tools-list-item" onClick={element.onClick}>
          <TrendContent
            card={trend}
            league={trend.league || element.league}
            highlightedSignalType={element.selectedTool?.signal}
            preferredProvidersOverride={preferredProviders}
          />
        </div>
      )}
    </HomeCheckoutCard>
  );
}

export function AdvancedToolsSection({
  advancedTools,
  advancedToolsPreview,
  maxPreviewTrends,
  league,
  onToolClick,
  onViewAllClick,
}) {
  const context = useContext(GlobalContext);
  const { t } = useTranslation();
  const [selectedToolKey, setSelectedToolKey] = useState(
    advancedTools?.[0]?.key || ""
  );

  const dropdownOptions = useMemo(() => {
    return Object.fromEntries(
      (advancedTools || []).map((tool) => [tool.key, tool.display])
    );
  }, [advancedTools]);

  useEffect(() => {
    const optionKeys = Object.keys(dropdownOptions);

    if (optionKeys.length === 0) {
      setSelectedToolKey("");
      return;
    }

    if (!selectedToolKey || !optionKeys.includes(selectedToolKey)) {
      setSelectedToolKey(optionKeys[0]);
    }
  }, [dropdownOptions, selectedToolKey]);

  const selectedTool =
    (advancedTools || []).find((tool) => tool.key === selectedToolKey) || null;
  const trends = advancedToolsPreview?.[selectedToolKey] || [];
  const games =
    context.currentGames && context.currentGames.length > 0
      ? context.currentGames
      : context.upcomingGames || [];

  const buildTrendFeedHref = (trend) => {
    const game = games.find((item) => item.id === trend.gameId);

    if (!game) {
      return `/${league}/trends?tabs=${encodeURIComponent(
        JSON.stringify(["player", "team", "sameGameParlay"])
      )}&tab=${trend.type === "team" ? "team" : "player"}`;
    }

    const gameTitleToGameIdDict = Object.fromEntries(
      [game].map((x) => [getGameTitle(league, x), x.id])
    );

    const gameTitleToAnnotationDict = Object.fromEntries(
      [game].map((x) => {
        const parsedDate = parseDateFromString(x.timestamp);
        return [
          getGameTitle(league, x),
          `${parsedDate.dayOfWeekShort} ${parsedDate.formattedTime}`,
        ];
      })
    );

    const initialFilters = {};
    initialFilters[FILTER_KEYS.GAMES] = getGamesFilterForAPI(
      gameTitleToGameIdDict,
      gameTitleToAnnotationDict
    );
    initialFilters[FILTER_KEYS.GAMES].selectedValues = [game.id];

    const parsedDate = parseDateFromString(game.timestamp);

    const feed = base64Encode(
      JSON.stringify({
        title: `${game.awayTeamData.info.code} @ ${game.homeTeamData.info.code}`,
        annotation: `${parsedDate.formattedDayMonthShort} ${parsedDate.formattedTime}`,
        initialFilters,
        filtersToExclude: [FILTER_KEYS.GAMES],
        selectedTrendId: trend.trendId || trend.id || null,
      })
    );

    return `/${league}/trends?feed=${feed}&tabs=${encodeURIComponent(
      JSON.stringify(["player", "team", "sameGameParlay"])
    )}&tab=${trend.type === "team" ? "team" : "player"}`;
  };

  if (!advancedTools || advancedTools.length === 0) {
    return null;
  }

  const handleViewAll = () => {
    if (!selectedTool) {
      return;
    }

    const href = selectedTool.href(league);

    if (onViewAllClick) {
      onViewAllClick(selectedTool.key, href);
      return;
    }

    window.location.href = href;
  };

  return (
    <div className="advanced-tools-section-padding">
      {trends.length === 0 && (
        <>
          <div className="advanced-tools-title-container">
            <div className="advanced-tools-title-copy">
              <div className="advanced-tools-title-row">
                <span className="text-style-h-3-semibold color-fig-default">
                  {`${t("home.sections.advancedTools")} ${t("web.common.for")}`}
                </span>

                <div className="advanced-tools-dropdown-wrapper">
                  <InputSelection
                    enabled={true}
                    type="single"
                    typography="sm"
                    selection={selectedToolKey}
                    options={dropdownOptions}
                    selectionHandler={setSelectedToolKey}
                  />
                </div>
              </div>

              <span className="text-style-body-medium color-fig-subtle">
                {t(ADVANCED_TOOLS_SUBTITLE_KEYS[selectedToolKey])} <span className="color-fig-default">{t("common.linematePlus")}</span><span>.</span>
              </span>
            </div>
          </div>

          <div className="advanced-tools-empty-state-container">
            <EmptyState
              className="advanced-tools-empty-state"
              text={t("home.empty.trend")}
            />
          </div>
        </>
      )}

      {trends.length > 0 && (
        <CardCarousel
          listOfElements={trends.slice(0, maxPreviewTrends).map((trend) => ({
            trend,
            league,
            selectedTool,
            onClick: () => {
              const href = buildTrendFeedHref(trend);

              if (onToolClick && selectedTool) {
                onToolClick(selectedTool.key, trend, href);
                return;
              }

              window.location.href = href;
            },
          }))}
          elementsPerView={3}
          spaceBetweenSlides={16}
          title=""
          CardComponent={AdvancedToolsCarouselCard}
          showHeader={true}
          mobileOnlyControls={true}
          headerContent={
            <div className="advanced-tools-carousel-header">
              <div className="advanced-tools-title-copy">
                <div className="advanced-tools-title-row">
                  <span className="text-style-h-3-semibold color-fig-default">
                    {`${t("home.sections.advancedTools")} ${t("web.common.for")}`}
                  </span>

                  <div className="advanced-tools-dropdown-wrapper">
                    <InputSelection
                      enabled={true}
                      type="single"
                      typography="sm"
                      selection={selectedToolKey}
                      options={dropdownOptions}
                      selectionHandler={setSelectedToolKey}
                    />
                  </div>
                </div>

                <span className="text-style-body-medium color-fig-subtle">
                  {t(ADVANCED_TOOLS_SUBTITLE_KEYS[selectedToolKey])} <span className="color-fig-default">{t("common.linematePlus")}</span><span>.</span>
                </span>
              </div>

              <Button
                text={t("common.viewAll")}
                typography="sm"
                type="invisible"
                enabled={!!selectedTool}
                onClick={handleViewAll}
                className="home-page-view-all"
              />
            </div>
          }
        />
      )}
    </div>
  );
}