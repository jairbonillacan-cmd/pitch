import React from "react";
import { withTranslation } from "react-i18next";

import "./TrendCard.scss";
import "../../App.scss";

import GlobalContext from "../../GlobalContext";
import {
  getBookEntryBasedOnBestOdds,
  getOddsFromCard,
  getPlayerName,
  getPlayerId,
  getParlayBestEligibleProvider
} from "../../../linemate-react-common/src/util";
import {
  getCardKey,
  getLocalizedMarketNameFromId,
  getMarketDescriptionFromTrend,
} from "../../../linemate-react-common/src/betting-utils";
import { getTeamLogoPath, getTheme, teamLogoPathOnErrorFallback, getTrendSignalIconPath, normalizeHighlightedSignalType, shouldUseRoundTeamLogoBackground } from "../../../react-web-utils";
import { GAME_BET_TYPE, SUPPORTED_LEAGUES, TEAM_BETS } from "../../../linemate-react-common/src/constants";

function buildStraightTrendTitle(trend, league) {
  if (trend.type === "player") {
    return getPlayerName(trend.player);
  } else if (
    trend.type === "team" &&
    trend.market.name in TEAM_BETS[league] &&
    TEAM_BETS[league][trend.market.name].type === GAME_BET_TYPE
  ) {
    return trend.home ? `${trend.opposingTeam.code} @ ${trend.team.code}` : `${trend.team.code} @ ${trend.opposingTeam.code}`;
  }
  return trend.team.code;
}

function buildParlayTrendTitle(trend, league, t) {
  if (trend.crossGame) {
    return getLocalizedMarketNameFromId(t, league, trend.legs[0].type, trend.legs[0].market.name);
  }
  return `${trend.awayTeam.code} @ ${trend.homeTeam.code}`;
}

function buildProfileHrefFromEntity(item, league) {
  if (item?.type === "player") {
    const playerId = getPlayerId(item.player);
    return playerId ? `/${league}/players/${playerId}/profile` : null;
  }

  const teamCode = item?.team?.code;
  return teamCode ? `/${league}/teams/${teamCode.toUpperCase()}/profile` : null;
}

function navigateToProfile(event, href) {
  event.preventDefault();
  event.stopPropagation();

  if (href) {
    window.location.href = href;
  }
}

class TrendCard extends React.Component {
  static contextType = GlobalContext;

  legOverflowRefs = {};
  state = { truncatedLegIndices: {} };

  checkLegTruncation = () => {
    const truncatedLegIndices = {};
    Object.entries(this.legOverflowRefs).forEach(([index, el]) => {
      if (el && el.scrollWidth > el.clientWidth) truncatedLegIndices[index] = true;
    });
    this.setState({ truncatedLegIndices });
  };

  componentDidMount() {
    setTimeout(this.checkLegTruncation, 0);
  }

  componentDidUpdate(prevProps) {
    if (this.props.parlay) setTimeout(this.checkLegTruncation, 0);
  }

  getSummarySignals(card) {
    return (card.signals || []).filter((signal) => signal.summary);
  }

  render() {
    const card = this.props.card;
    const summarySignals = this.getSummarySignals(card);
    const league = this.props.league || this.context.league;
    const { t } = this.props;
    const normalizedHighlightedSignalType = normalizeHighlightedSignalType(this.props.highlightedSignalType);
    const useRoundBackground = shouldUseRoundTeamLogoBackground(league);

    if (!this.props.parlay) {
      const subject = buildStraightTrendTitle(card, league);
      const subjectProfileHref = buildProfileHrefFromEntity(card, league);
      const opponent = `${card.home ? "vs" : "@"} ${card.opposingTeam.code.toUpperCase()}`;
      const preferredProviders = this.context.resolvedPreferredProviders;
      const marketDescription = getMarketDescriptionFromTrend(league, card, preferredProviders, t);
      const odds = getOddsFromCard(card, this.context.userAttributes, preferredProviders);
      const customTextStyling = this.props.maskContent
        ? {
            fontFamily: "Flow Rounded",
            fontWeight: 400,
            fontSize: 14,
            lineHeight: "20px",
            letterSpacing: -0.09,
            marginRight: 8,
          }
        : {};

      return (
        <>
          <div className="trend-content-header">
            <div className="trend-content-header-left">
              <div
                style={{
                  height: "32px",
                  width: "32px",
                  borderRadius: useRoundBackground ? 50 : 0,
                  backgroundColor: useRoundBackground
                    ? SUPPORTED_LEAGUES[league]?.teams?.colors?.[getTheme()]?.[card.team.code.toLowerCase()]
                    : "transparent",
                  marginRight: "8px",
                }}
              >
                <img src={getTeamLogoPath(league, card.team)} onError={({ currentTarget }) => teamLogoPathOnErrorFallback(currentTarget, this.context.league)} />
              </div>
              <div className="trend-content-header-info">
                <div className="trend-content-header-info-subject">
                  {subjectProfileHref ? (
                    <button
                      type="button"
                      className="trend-content-profile-link text-style-label-semibold color-fig-default"
                      onClick={(event) => navigateToProfile(event, subjectProfileHref)}
                    >
                      {subject}
                    </button>
                  ) : (
                    <p className="text-style-label-semibold color-fig-default">
                      {subject}
                    </p>
                  )}
                  <p className="text-style-caption-normal color-fig-subtle">
                    {card.type === "player" ? opponent : ""}
                  </p>
                </div>
                <div className="trend-content-header-info-market">
                  <p className="text-style-caption-medium color-fig-default" style={customTextStyling}>
                    {marketDescription}
                  </p>
                  <p className="text-style-caption-semibold color-fig-subtle" style={customTextStyling}>
                    {odds}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="trend-content-insights">
            {summarySignals.map((signal, index) => {
              const description = this.props.maskContent
                ? signal.description
                    .replaceAll(/[a-zA-Z]/g, "a")
                    .replace(/[0-9]/g, "0")
                : signal.description;
              const annotation = this.props.maskContent
                ? signal.annotation
                    .replaceAll(/[a-zA-Z]/g, "a")
                    .replace(/[0-9]/g, "0")
                : signal.annotation;
              const highlighted = normalizedHighlightedSignalType && signal.type === normalizedHighlightedSignalType;

              return (
                <div key={`${signal.type}-${signal.description}-${index}`} className="trend-content-insight-wrapper">
                  <div className="trend-content-insight-narrative">
                    <div className={`trend-content-insight-icon${highlighted ? " trend-content-insight-icon--highlighted" : ""}`}>
                      <img src={getTrendSignalIconPath(signal)} alt={signal.type} />
                    </div>
                    <p className={`text-style-caption-medium ${highlighted ? "color-fig-default" : "color-fig-subtle"}`} style={customTextStyling}>{description}</p>
                  </div>
                  <p className="text-style-caption-tabular-medium" style={Object.assign({}, customTextStyling, { marginRight: 0 })}>
                    {annotation}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      );
    }

    const subject = buildParlayTrendTitle(card, league, t);

    const bestEligibleProvider = getParlayBestEligibleProvider(
      card,
      this.props.preferredProviders || this.context.resolvedPreferredProviders
    );

    return (
      <>
        <div className="trend-content-header">
          <div className="trend-content-header-left-parlay">
            <div className="trend-content-header-info trend-content-header-info-parlay">
              <div className="trend-content-header-info-subject">
                <p className="text-style-body-medium color-fig-subtle">{subject}</p>
              </div>
            </div>
          </div>

          {bestEligibleProvider && (
            <div className="trend-content-header-parlay-provider">
              <img
                src={`/assets/sportsbooks/${bestEligibleProvider}.svg`}
                alt={bestEligibleProvider}
              />
            </div>
          )}
        </div>

        <div className="trend-parlay-legs">
          {card.legs.map((leg, index) => {
            const legSubject = leg.type === "player" ? getPlayerName(leg.player) : leg.team.code;
            const legProfileHref = buildProfileHrefFromEntity(leg, leg.league || league);
            const resolvedPreferredProviders = bestEligibleProvider
              ? [bestEligibleProvider]
              : this.context.resolvedPreferredProviders;
            const newBook =
              getBookEntryBasedOnBestOdds(
                leg?.market?.books,
                leg?.outcome,
                leg?.line,
                resolvedPreferredProviders,
                leg?.alternate
              ) || "";
            const legMarketDescription = getMarketDescriptionFromTrend(
              league,
              { ...leg, book: newBook },
              resolvedPreferredProviders,
              t
            );
            const newOdds = newBook
              ? getOddsFromCard(leg, this.context.userAttributes, resolvedPreferredProviders)
              : "";

            return (
              <div key={`${getCardKey(card)}-${index}`} className="trend-parlay-leg">
                <div
                  className="trend-parlay-team-logo"
                  style={{
                    backgroundColor: useRoundBackground
                      ? SUPPORTED_LEAGUES[league]?.teams?.colors?.[getTheme()]?.[leg.team.code.toLowerCase()]
                      : "transparent",
                    borderRadius: useRoundBackground ? "50%" : 0,
                  }}
                >
                  <img src={getTeamLogoPath(league, leg.team)} onError={({ currentTarget }) => teamLogoPathOnErrorFallback(currentTarget, this.context.league)} />
                </div>
                {index > 0 && <div className="trend-parlay-leg-line"></div>}
                <div className="trend-parlay-leg-text">
                  {legProfileHref ? (
                    <button
                      type="button"
                      className="trend-content-profile-link text-style-label-semibold color-fig-default"
                      onClick={(event) => navigateToProfile(event, legProfileHref)}
                    >
                      {`${legSubject}:`}
                    </button>
                  ) : (
                    <p className="text-style-label-semibold color-fig-default">{`${legSubject}:`}</p>
                  )}
                  <p className="text-style-label-medium color-fig-default trend-content-prop-overflow">
                    <span
                      className={`trend-content-prop-tooltip-wrapper${this.state.truncatedLegIndices[index] ? " trend-content-prop-tooltip-wrapper--truncated" : ""}`}
                    >
                      <span
                        ref={(el) => { if (el) this.legOverflowRefs[index] = el; else delete this.legOverflowRefs[index]; }}
                        className="trend-content-prop-overflow-inner"
                      >
                        {legMarketDescription}
                      </span>
                      <span className="trend-content-prop-tooltip-bubble">{legMarketDescription}</span>
                    </span>
                  </p>
                  {newOdds && (
                    <p className="text-style-label-semibold color-fig-subtle">{newOdds}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="trend-content-insights">
          {summarySignals.map((signal, index) => {
            return (
              <div key={`${signal.type}-${signal.description}-${index}`} className="trend-content-insight-wrapper">
                <div className="trend-content-insight-narrative">
                  <div className="trend-content-insight-icon">
                    <img src={getTrendSignalIconPath(signal)} alt={signal.type} />
                  </div>
                  <p className="text-style-caption-medium">{signal.description}</p>
                </div>
                <p className="text-style-caption-tabular-medium">{signal.annotation}</p>
              </div>
            );
          })}
        </div>
      </>
    );
  }
}

export default withTranslation()(TrendCard);
