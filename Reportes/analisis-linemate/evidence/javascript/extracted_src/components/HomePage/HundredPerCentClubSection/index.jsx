import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./HundredPercentClub.scss";
import GlobalContext from "../../GlobalContext";
import EmptyState from "../../EmptyState";

import { getPlayerId, getPlayerName } from "../../../linemate-react-common/src/util";
import { getMarketDescriptionFromTrend } from "../../../linemate-react-common/src/betting-utils";
import { SUPPORTED_LEAGUES } from "../../../linemate-react-common/src/constants";
import {
  getTeamLogoPath,
  getTheme,
  getTrendSignalIconPath,
  shouldUseRoundTeamLogoBackground,
  teamLogoPathOnErrorFallback,
} from "../../../react-web-utils";
import CardCarousel from "../../CardCarousel";

const CHEATSHEET_ICON_PATHS = {
  bolt: "/assets/trend-signals/bolt.svg",
  shield: "/assets/trend-signals/shield.svg",
  alternate: "/assets/alternate.svg",
  quarter: "/assets/first-quarter.svg",
  half: "/assets/first-quarter.svg",
  "location-filled": "/assets/trend-signals/location-filled.svg",
  "group-outline": "/assets/group-outline.svg",
  under: "/assets/trend-signals/bolt.svg",
};

function buildPreviewSubjectProfileHref(previewTrend, league) {
  if (previewTrend?.type === "player") {
    const playerId = getPlayerId(previewTrend.player);
    return playerId ? `/${league}/players/${playerId}/profile` : null;
  }

  const teamCode = previewTrend?.team?.code;
  return teamCode ? `/${league}/teams/${teamCode.toUpperCase()}/profile` : null;
}

function navigateToPreviewSubjectProfile(event, href) {
  event.preventDefault();
  event.stopPropagation();

  if (href) {
    window.location.href = href;
  }
}

export function HundredPerCentClubSection({
  supportedHundredPercentClubs,
  cheatsheetPreviews = {},
}) {
  const context = useContext(GlobalContext);
  const history = useHistory();
  const { t } = useTranslation();

  const visibleCheatsheetCards = useMemo(
    () =>
      supportedHundredPercentClubs.filter(
        (trend) => (cheatsheetPreviews?.[trend.id] || []).length > 0
      ),
    [supportedHundredPercentClubs, cheatsheetPreviews]
  );

  const overflowRefs = useRef({});
  const [truncatedKeys, setTruncatedKeys] = useState({});
  
  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => {
      const nextTruncatedKeys = {};

      Object.entries(overflowRefs.current).forEach(([key, element]) => {
        if (element && element.scrollWidth > element.clientWidth) {
          nextTruncatedKeys[key] = true;
        }
      });

      setTruncatedKeys(nextTruncatedKeys);
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [visibleCheatsheetCards, cheatsheetPreviews, context.league]);

  const setOverflowRef = (key, node) => {
    if (node) {
      overflowRefs.current[key] = node;
    } else {
      delete overflowRefs.current[key];
    }
  };

  const CheatsheetCarouselCard = ({ element }) => {
    const { trend } = element;
    const previewItems = cheatsheetPreviews?.[trend.id] || [];
    const iconPath =
      CHEATSHEET_ICON_PATHS[trend.icon] ||
      getTrendSignalIconPath({ type: trend.previewSignalType });

    return (
      <div
        className="hpc-card"
        onClick={() => trend.action(history, context)}
      >
        <div className="hpc-card-header">
          <div className="hpc-card-header-icon">
            <img src={iconPath} alt={trend.icon} />
          </div>

          <p className="text-style-label-semibold color-fig-default hpc-card-header-title">
            {`100% ${t(trend.cheatsheetTitleKey).replaceAll("\n", " ")}`}
          </p>
        </div>

        <div className="hpc-card-preview-list">
          {previewItems.map((previewTrend, previewIndex) => {
            const useRoundBackground = shouldUseRoundTeamLogoBackground(context.league);
            const teamCode = previewTrend.team.code;
            const marketDescription = getMarketDescriptionFromTrend(
              previewTrend.league || context.league,
              previewTrend,
              context.resolvedPreferredProviders,
              t
            );
            const previewKey = `${trend.id}-${teamCode}-${previewIndex}`;
            const subjectText = previewTrend.type === "player"
              ? `${getPlayerName(previewTrend.player)}:`
              : `${previewTrend.team.code}:`;
            const subjectProfileHref = buildPreviewSubjectProfileHref(previewTrend, context.league);
            const subjectKey = `${previewKey}-subject`;
            const marketKey = `${previewKey}-market`;

            return (
              <div key={previewKey} className="hpc-card-preview-row">
                <div
                  className="hpc-card-preview-logo"
                  style={{
                    backgroundColor: useRoundBackground
                      ? SUPPORTED_LEAGUES[context.league]?.teams?.colors?.[getTheme()]?.[teamCode.toLowerCase()] || "transparent"
                      : "transparent",
                    borderRadius: useRoundBackground ? 999 : 0,
                  }}
                >
                  <img
                    src={getTeamLogoPath(context.league, previewTrend.team)}
                    alt={teamCode}
                    onError={({ currentTarget }) =>
                      teamLogoPathOnErrorFallback(currentTarget, context.league)
                    }
                  />
                </div>

                <span
                  className={`hpc-card-preview-subject-tooltip-wrapper${
                    truncatedKeys[subjectKey] ? " hpc-card-preview-tooltip-wrapper--truncated" : ""
                  }`}
                >
                  {subjectProfileHref ? (
                    <button
                      type="button"
                      ref={(node) => setOverflowRef(subjectKey, node)}
                      className="text-style-label-semibold color-fig-default hpc-card-preview-subject hpc-card-preview-subject-link"
                      onClick={(event) => navigateToPreviewSubjectProfile(event, subjectProfileHref)}
                    >
                      {subjectText}
                    </button>
                  ) : (
                    <span
                      ref={(node) => setOverflowRef(subjectKey, node)}
                      className="text-style-label-semibold color-fig-default hpc-card-preview-subject"
                    >
                      {subjectText}
                    </span>
                  )}

                  {truncatedKeys[subjectKey] && (
                    <span className="hpc-card-preview-tooltip-bubble">
                      {subjectText}
                    </span>
                  )}
                </span>

                <span
                  className={`hpc-card-preview-market-tooltip-wrapper${
                    truncatedKeys[marketKey] ? " hpc-card-preview-tooltip-wrapper--truncated" : ""
                  }`}
                >
                  <span
                    ref={(node) => setOverflowRef(marketKey, node)}
                    className="text-style-label-medium color-fig-default hpc-card-preview-market"
                  >
                    {marketDescription}
                  </span>

                  {truncatedKeys[marketKey] && (
                    <span className="hpc-card-preview-tooltip-bubble">
                      {marketDescription}
                    </span>
                  )}
                </span>

                <p className="text-style-label-tabular-medium color-fig-default hpc-card-preview-record">
                  {previewTrend.previewSignal?.hitRecord
                    ? `${previewTrend.previewSignal.hitRecord.hits}/${previewTrend.previewSignal.hitRecord.games}`
                    : "--"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="hpc-section-padding">
      {visibleCheatsheetCards.length === 0 ? (
        <>
          <div className="hpc-title-container">
            <div className="hpc-title-section">
              <p className="text-style-h-3-semibold color-fig-default">{t("home.sections.cheatsheets")}</p>
              <span className="text-style-body-medium color-fig-subtle">
                {t("home.hundredPercentClub.subtitle")}
              </span>
            </div>
          </div>

          <div className="hpc-empty-state-container">
            <EmptyState className="hpc-empty-state" text={t("home.empty.cheatsheet")} iconPath={"/assets/cheatsheet-missing.svg"} />
          </div>
        </>
      ) : (
        <CardCarousel
          listOfElements={visibleCheatsheetCards.map((trend) => ({ trend }))}
          elementsPerView={3}
          spaceBetweenSlides={16}
          title=""
          CardComponent={CheatsheetCarouselCard}
          showHeader={true}
          desktopOnlyControls={true}
          headerContent={(
            <div className="hpc-title-section">
              <p className="text-style-h-3-semibold color-fig-default">{t("home.sections.cheatsheets")}</p>
              <span className="text-style-body-medium color-fig-subtle">
                {t("home.hundredPercentClub.subtitle")}
              </span>
            </div>
          )}
        />
      )}
    </div>
  );
}
