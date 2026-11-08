import React from "react";

import "./PredictionMarketEntry.scss";

import {
  getTeamLogoPath,
  getTheme,
  shouldUseRoundTeamLogoBackground,
  teamLogoPathOnErrorFallback,
} from "../react-web-utils";
import { SUPPORTED_LEAGUES } from "../linemate-react-common/src/constants";

function PredictionMarketEntry({ entry, selected, showMovement, t, locale }) {
  const league = entry.league;
  const roundLogo = shouldUseRoundTeamLogoBackground(league);
  const colors = SUPPORTED_LEAGUES[league]?.teams?.colors?.[getTheme()] || {};
  const teamColor = colors[entry.teamCode?.toLowerCase()];
  const opponentColor = colors[entry.opponentCode?.toLowerCase()];
  const isMatchup = entry.marketId === "GAME_TOTAL" && entry.opponentTeamId;

  return (
    <div className={`prediction-market-entry${selected ? "-selected" : ""}`}>
      <div className="prediction-market-entry-left">
        {isMatchup ? (
          <div className="prediction-market-entry-matchup-logos">
            <div
              className="prediction-market-entry-matchup-logo prediction-market-entry-matchup-logo-first"
              style={{ backgroundColor: teamColor, borderColor: teamColor }}
            >
              <img
                src={getTeamLogoPath(league, entry.teamId)}
                alt={entry.teamCode || ""}
                onError={(event) =>
                  teamLogoPathOnErrorFallback(event.currentTarget, league)
                }
              />
            </div>
            <div
              className="prediction-market-entry-matchup-logo prediction-market-entry-matchup-logo-second"
              style={{ backgroundColor: opponentColor, borderColor: opponentColor }}
            >
              <img
                src={getTeamLogoPath(league, entry.opponentTeamId)}
                alt={entry.opponentCode || ""}
                onError={(event) =>
                  teamLogoPathOnErrorFallback(event.currentTarget, league)
                }
              />
            </div>
          </div>
        ) : (
          <div
            className="prediction-market-entry-logo"
            style={{
              backgroundColor: roundLogo ? teamColor : "transparent",
              borderRadius: roundLogo ? "50px" : 0,
            }}
          >
            <img
              src={getTeamLogoPath(league, entry.teamId)}
              alt={entry.teamCode || ""}
              onError={(event) =>
                teamLogoPathOnErrorFallback(event.currentTarget, league)
              }
            />
          </div>
        )}

        <div className="prediction-market-entry-details">
          <div>
            <p className="text-style-label-semibold color-fig-default">
              {entry.subject}
            </p>
            {entry.opponentCode && (
              <p className="text-style-caption-normal color-fig-subtle">
                {entry.home
                  ? t("home.advancedTools.vsOpponent", { opponent: entry.opponentCode })
                  : `@ ${entry.opponentCode}`}
              </p>
            )}
          </div>
          <div>
            <p className="text-style-caption-medium color-fig-default">
              {entry.description}
            </p>
            <p className="text-style-caption-semibold color-fig-subtle">
              {entry.probability == null
                ? "-"
                : new Intl.NumberFormat(locale, {
                    style: "percent",
                    maximumFractionDigits: 0
                  }).format(Number(entry.probability))}
            </p>
            <img
              src={`assets/sportsbooks/${entry.exchange}.svg`}
              alt={entry.exchange}
              style={{ width: 12, height: 12 }}
            />
          </div>
        </div>
      </div>

      <div className="prediction-market-entry-right">
        {showMovement && Number.isFinite(Number(entry.metric)) && Number(entry.metric) !== 0 && (
          <img
            className={`prediction-market-entry-arrow${Number(entry.metric) < 0 ? " prediction-market-entry-arrow-down" : ""}`}
            src="assets/arrow-up.svg"
            alt=""
          />
        )}
        <p className="text-style-label-tabular-medium color-fig-default">
          {entry.metricText}
        </p>
      </div>
    </div>
  );
}

export default PredictionMarketEntry;