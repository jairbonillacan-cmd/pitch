import React from "react";
import { withTranslation } from "react-i18next";

import "./HitRateEntry.scss";
import "./App.scss";

import GlobalContext from "./GlobalContext";
import {
  decimalPrecision,
  getBookEntryBasedOnBestOdds,
  getFormattedLineValue,
  getFormattedOddValue,
  getPlayerName,
  getPreferredFormat,
  getPreferredOdds,
} from "../linemate-react-common/src/util";
import { getMarketDescription } from "../linemate-react-common/src/betting-utils";
import { getTeamId, getTeamIdByCode, getTeamLogoPath, getTheme, shouldUseRoundTeamLogoBackground } from "../react-web-utils";
import { SUPPORTED_LEAGUES } from "../linemate-react-common/src/constants";

/**
 * Props:
 * - entry
 * - selected
 */
class HitRateEntry extends React.Component {
  static contextType = GlobalContext;

  render() {
    const { t } = this.props;
    const entry = this.props.entry;
    const league = entry?.league || this.context.league;
    const type = entry?.player ? "player" : "team";

    const teamCode =
      entry?.betslipLeg?.team?.code ||
      entry?.team?.code ||
      entry?.team;
    const teamId = getTeamId(entry?.betslipLeg?.team || entry?.team) ||
      getTeamIdByCode(this.context.teams, teamCode);

    const opposingTeamCode =
      entry?.betslipLeg?.opposingTeam?.code ||
      entry?.opposingTeam?.code ||
      entry?.opponent;

    const subject = type === "player" ? getPlayerName(entry.player) : teamCode;

    const marketDescription = getMarketDescription(
      league,
      type,
      entry.line,
      entry.outcome,
      { name: entry.marketId },
      false,
      t
    );

    const odds = getFormattedLineValue(
      getPreferredFormat(this.context.userAttributes),
      getFormattedOddValue(this.context.userAttributes, entry.odds)
    );

    let newOdds;
    let book;
    if (entry.market) {
      book = getBookEntryBasedOnBestOdds(
        entry?.market?.books,
        entry?.outcome,
        entry?.line,
        this.context.resolvedPreferredProviders,
        entry?.alternate
      );
      newOdds = getPreferredOdds(
        this.context.userAttributes,
        (
          entry?.alternate
            ? entry?.market?.books?.[book]?.[entry?.outcome]?.alternates?.[entry?.line]
            : entry?.market?.books?.[book]?.[entry?.outcome]?.current
        )?.odds,
        true
      );
    }
    const useRoundBackground = shouldUseRoundTeamLogoBackground(league);

    return (
      <div className={`hit-rate-entry${this.props.selected ? "-selected" : ""}`}>
        <div className="hit-rate-entry-left">
          <div
            className="hit-rate-entry-logo"
            style={{
              backgroundColor: useRoundBackground
                ? SUPPORTED_LEAGUES[league]?.teams?.colors?.[getTheme()]?.[teamCode.toLowerCase()]
                : "transparent",
              borderRadius: useRoundBackground ? "50px" : 0,
            }}
          >
            <img src={getTeamLogoPath(league, teamId)} alt={teamCode} />
          </div>
          <div className="hit-rate-entry-details">
            <div>
              <p className="text-style-label-semibold color color-fig-default">{subject}</p>
              <p className="text-style-caption-normal color-fig-subtle">{entry.home ? "vs" : "@"}</p>
              <p className="text-style-caption-uppercase-normal color-fig-subtle">{opposingTeamCode}</p>
            </div>
            <div>
              <p className="text-style-caption-medium color-fig-default">{marketDescription}</p>
              <p className="text-style-caption-semibold color-fig-subtle">{newOdds ?? odds}</p>
              <img src={`assets/sportsbooks/${book ?? entry.bookId}.svg`} style={{ width: 12, height: 12 }} />
            </div>
          </div>
        </div>
        <div className="hit-rate-entry-right">
          <p className="text-style-label-tabular-medium color-fig-default">{`${decimalPrecision(entry.hitRecord.hitRate, 0)}%`}</p>
          <p className="text-style-caption-tabular-medium color-fig-subtle">{`${entry.hitRecord.hits}/L${entry.hitRecord.games}`}</p>
        </div>
      </div>
    );
  }
}

export default withTranslation()(HitRateEntry);
