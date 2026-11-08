import React, { useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import "./ParlaysSection.scss";

import TrendCard from "../TrendCard";
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
  getMultipleBetTypeFilterForAPI,
  parseDateFromString,
} from "../../../linemate-react-common/src/util";
import { FILTER_KEYS } from "../../../linemate-react-common/src/filter-config";

function buildDropdownOptions(sections) {
  return Object.fromEntries(
    sections.map((section) => [section.id, section.label])
  );
}

function ParlayCarouselCard({ element }) {
  return (
    <HomeCheckoutCard trend={element.parlay}>
      {(preferredProviders) => (
        <div className="parlays-list-item" onClick={element.onClick}>
          <TrendCard
            card={element.parlay}
            parlay
            preferredProviders={preferredProviders}
          />
        </div>
      )}
    </HomeCheckoutCard>
  );
}

export function ParlaysSection({
  sameGameParlays,
  sameGameParlayChipsListOptions,
  crossGameParlays,
  crossGameParlayChipsListOptions,
  maxPreviewTrends,
}) {
  const { league, currentGames } = useContext(GlobalContext);
  const { t } = useTranslation();
  const parlaySections = useMemo(() => {
    const sameGameSections = Object.keys(sameGameParlayChipsListOptions || {})
      .map((label) => {
        const gameId = sameGameParlayChipsListOptions[label];
        const items = sameGameParlays?.[gameId] || [];
        const game = (currentGames || []).find((entry) => entry.id === gameId);

        if (!items.length || !game) {
          return null;
        }

        return {
          id: `sgp:${gameId}`,
          type: "sgp",
          label,
          value: gameId,
          game,
          items,
        };
      })
      .filter(Boolean);

    const crossGameSections = Object.keys(crossGameParlayChipsListOptions || {})
      .map((label) => {
        const items = crossGameParlays?.[label] || [];

        if (!items.length) {
          return null;
        }

        return {
          id: `cgp:${label}`,
          type: "cgp",
          label,
          value: label,
          marketId: crossGameParlayChipsListOptions[label],
          items,
        };
      })
      .filter(Boolean);

    const interleaved = [];
    const maxLength = Math.max(
      sameGameSections.length,
      crossGameSections.length
    );

    for (let index = 0; index < maxLength; index += 1) {
      if (sameGameSections[index]) {
        interleaved.push(sameGameSections[index]);
      }
      if (crossGameSections[index]) {
        interleaved.push(crossGameSections[index]);
      }
    }

    return interleaved;
  }, [
    sameGameParlays,
    sameGameParlayChipsListOptions,
    crossGameParlays,
    crossGameParlayChipsListOptions,
    currentGames,
  ]);

  const [selectedSectionId, setSelectedSectionId] = useState(
    parlaySections[0]?.id || ""
  );

  useEffect(() => {
    const sectionIds = parlaySections.map((section) => section.id);

    if (sectionIds.length === 0) {
      setSelectedSectionId("");
      return;
    }

    if (!selectedSectionId || !sectionIds.includes(selectedSectionId)) {
      setSelectedSectionId(sectionIds[0]);
    }
  }, [parlaySections, selectedSectionId]);

  const selectedSection =
    parlaySections.find((section) => section.id === selectedSectionId) || null;

  const selectedParlays = selectedSection?.items || [];
  const dropdownOptions = buildDropdownOptions(parlaySections);

  const buildSameGameParlayHref = (parlay = null, selectedParlayIndex = null) => {
    if (!selectedSection || selectedSection.type !== "sgp") {
      return `/${league}/trends?tab=sameGameParlay`;
    }

    const game = selectedSection.game;
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

    const feed = base64Encode(
      JSON.stringify({
        initialFilters,
        filtersToExclude: [FILTER_KEYS.GAMES],
        selectedParlayId: parlay?.id || null,
      })
    );

    const indexParam =
      selectedParlayIndex !== null ? `&index=${selectedParlayIndex}` : "";

    return `/${league}/trends?feed=${feed}&tab=sameGameParlay${indexParam}`;
  };

  const buildCrossGameParlayHref = (parlay = null, selectedParlayIndex = null) => {
    if (!selectedSection || selectedSection.type !== "cgp") {
      return `/${league}/trends?tab=crossGameParlay`;
    }

    const betTypeFilter = getMultipleBetTypeFilterForAPI({
      [selectedSection.marketId]: selectedSection.label,
    });
    betTypeFilter.selectedValues = [selectedSection.marketId];

    const feed = base64Encode(
      JSON.stringify({
        initialFilters: {
          [FILTER_KEYS.BET_TYPE]: betTypeFilter,
        },
        selectedParlayId: parlay?.id || null,
      })
    );

    const indexParam =
      selectedParlayIndex !== null ? `&index=${selectedParlayIndex}` : "";

    return `/${league}/trends?feed=${feed}&tab=crossGameParlay${indexParam}`;
  };

  const handleViewAll = () => {
    if (!selectedSection) {
      return;
    }

    window.location.href =
      selectedSection.type === "sgp"
        ? buildSameGameParlayHref()
        : buildCrossGameParlayHref();
  };

  if (parlaySections.length === 0) {
    return (
      <div className="parlays-section-padding">
        <div className="parlays-title-container">
          <div className="parlays-title-row">
            <span className="text-style-h-3-semibold home-page-title-text-desktop">
              {t("home.sections.parlays")}
            </span>
            <span className="text-style-h-3-semibold home-page-title-text-mobile">
              {t("home.sections.parlays")}
            </span>
          </div>
        </div>

        <div className="parlays-empty-state-container">
          <EmptyState
            className="parlays-empty-state"
            text={t("home.empty.parlayMinGames")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="parlays-section-padding">
      {selectedParlays.length === 0 && (
        <>
          <div className="parlays-title-container">
            <div className="parlays-title-row">
              <span className="text-style-h-3-semibold color-fig-default">
                {`${t("home.sections.parlays")} ${t("web.common.for")}`}
              </span>

              <div className="parlays-dropdown-wrapper">
                <InputSelection
                  enabled={true}
                  type="single"
                  typography="sm"
                  selection={selectedSectionId}
                  options={dropdownOptions}
                  selectionHandler={setSelectedSectionId}
                />
              </div>
            </div>
          </div>

          <div className="parlays-empty-state-container">
            <EmptyState
              className="parlays-empty-state"
              text={t("home.empty.parlayMinGames")}
            />
          </div>
        </>
      )}

      {selectedParlays.length > 0 && (
        <CardCarousel
          listOfElements={selectedParlays.slice(0, maxPreviewTrends).map((parlay, index) => ({
            parlay,
            onClick: () => {
              if (!selectedSection) {
                return;
              }

              window.location.href =
                selectedSection.type === "sgp"
                  ? buildSameGameParlayHref(parlay, index)
                  : buildCrossGameParlayHref(parlay, index);
            },
          }))}
          elementsPerView={3}
          spaceBetweenSlides={16}
          title=""
          CardComponent={ParlayCarouselCard}
          showHeader={true}
          mobileOnlyControls={true}
          headerContent={
            <div className="parlays-carousel-header">
              <div className="parlays-title-row">
                <span className="text-style-h-3-semibold color-fig-default">
                  {`${t("home.sections.parlays")} ${t("web.common.for")}`}
                </span>

                <div className="parlays-dropdown-wrapper">
                  <InputSelection
                    enabled={true}
                    type="single"
                    typography="sm"
                    selection={selectedSectionId}
                    options={dropdownOptions}
                    selectionHandler={setSelectedSectionId}
                  />
                </div>
              </div>

              <Button
                text={t("common.viewAll")}
                typography="sm"
                type="invisible"
                enabled={!!selectedSection}
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