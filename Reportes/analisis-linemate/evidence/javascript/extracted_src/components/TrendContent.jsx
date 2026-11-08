import React from 'react';
import { withTranslation } from 'react-i18next';

import './TrendContent.scss'
import './App.scss'
import GlobalContext from './GlobalContext';
import { getBookEntryBasedOnBestOdds, getOddsFromCard, getPlayerId, getPlayerName, getPreferredOdds } from '../linemate-react-common/src/util';
import { getCardKey, getLocalizedMarketNameFromId, getMarketDescription, getMarketDescriptionFromTrend } from '../linemate-react-common/src/betting-utils';
import { getTeamLogoPath, getTheme, teamLogoPathOnErrorFallback, getTrendSignalIconPath, normalizeHighlightedSignalType, shouldUseRoundTeamLogoBackground } from '../react-web-utils';
import { GAME_BET_TYPE, SUPPORTED_LEAGUES, TEAM_BETS } from '../linemate-react-common/src/constants';

function buildStraightTrendTitle(trend, league) {
  if (trend.type === "player") {
    return getPlayerName(trend.player);
  } else if (
    trend.type === "team" &&
    trend.market?.name in TEAM_BETS[league] &&
    TEAM_BETS[league][trend.market?.name].type === GAME_BET_TYPE
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
  if (item?.type === 'player') {
    const playerId = getPlayerId(item.player)
    return playerId ? `/${league}/players/${playerId}/profile` : null
  }

  const teamCode = item?.team?.code
  return teamCode ? `/${league}/teams/${teamCode.toUpperCase()}/profile` : null
}

function navigateToProfile(event, href) {
  event.preventDefault()
  event.stopPropagation()

  if (href) {
    window.location.href = href
  }
}

class TrendContent extends React.Component {
  static contextType = GlobalContext;

  signalOverflowRefs = {};
  state = { truncatedSignalIndices: {} };

  checkSignalTruncation = () => {
    const truncatedSignalIndices = {};
    Object.entries(this.signalOverflowRefs).forEach(([index, el]) => {
      if (el && el.scrollWidth > el.clientWidth) truncatedSignalIndices[index] = true;
    });
    this.setState({ truncatedSignalIndices });
  };

  componentDidMount() {
    requestAnimationFrame(() => {
      requestAnimationFrame(this.checkSignalTruncation);
    });
    window.addEventListener("resize", this.checkSignalTruncation);
  }

  componentDidUpdate() {
    requestAnimationFrame(this.checkSignalTruncation);
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.checkSignalTruncation);
  }

  getSummarySignals(card) {
    return (card.signals || []).filter((signal) => signal.summary);
  }

  render() {
    const card = this.props.card;
    const summarySignals = this.getSummarySignals(card);
    const showNoSignalsFallback = this.props.showNoSignalsFallback && summarySignals.length === 0
    const league = this.props.league || this.context.league;
    const normalizedHighlightedSignalType = normalizeHighlightedSignalType(this.props.highlightedSignalType);
    const { t } = this.props;
    const useRoundBackground = shouldUseRoundTeamLogoBackground(league);

    if (!this.props.parlay) {
        const preferredProviders = this.props.preferredProvidersOverride ?? this.context.resolvedPreferredProviders;
        const subject = buildStraightTrendTitle(card, league);
        const subjectProfileHref = buildProfileHrefFromEntity(card, league);
        const opponent = `${card.home ? "vs" : "@"} ${card.opposingTeam.code}`;
        const marketDescription =
            getMarketDescriptionFromTrend(league, card, preferredProviders, t) ||
            getMarketDescription(
                league,
                card.type,
                card.line,
                card.outcome,
                card.market,
                card.alternate,
                t
            )

        const newBook = card.market?.books
            ? getBookEntryBasedOnBestOdds(
                card.market.books,
                card.outcome,
                card.line,
                preferredProviders,
                card.alternate
                )
            : null

        const newOdds =
            getOddsFromCard(
                card,
                this.context.userAttributes,
                preferredProviders
            ) ||
            getPreferredOdds(this.context.userAttributes, card.odds, true)

        const displayBook = (newBook || card.book || card.operator || card.sportsbook || '').toLowerCase()
        const customTextStyling = this.props.maskContent ? {fontFamily: 'Flow Rounded', fontWeight: 400, fontSize: 14, lineHeight: '20px', letterSpacing: -0.09, marginRight: 8} : {}

        return (
            <>
                <div className='trend-content-header'>
                    <div className='trend-content-header-left'>
                        <div className='trend-content-header-left-team-icons'>
                            <div className={`trend-content-header-left-team-icon-team1${
                                useRoundBackground ? "" : " trend-content-header-left-team-icon-team--flat"
                                }`}
                                style={{
                                backgroundColor: useRoundBackground
                                    ? SUPPORTED_LEAGUES[league]?.teams?.colors?.[getTheme()]?.[card.team.code.toLowerCase()]
                                    : "transparent",
                                ...(card.market?.name === "GAME_TOTAL"
                                    ? {
                                        marginRight: "-10px",
                                        zIndex: "3",
                                    }
                                    : {}),
                                }}
                            >
                                <img src={getTeamLogoPath(league, card.team)} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, this.context.league)}/>
                            </div>
                            {card.market?.name === 'GAME_TOTAL' &&
                                <div className={`trend-content-header-left-team-icon-team2${
                                    useRoundBackground ? "" : " trend-content-header-left-team-icon-team--flat"
                                    }`}
                                    style={{
                                    backgroundColor: useRoundBackground
                                        ? SUPPORTED_LEAGUES[league]?.teams?.colors?.[getTheme()]?.[card.opposingTeam.code.toLowerCase()]
                                        : "transparent",
                                    }}
                                >
                                    <img src={getTeamLogoPath(league, card.opposingTeam)} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, this.context.league)}/>
                                </div>
                            }
                        </div>
                        <div className='trend-content-header-info'>
                            <div className='trend-content-header-info-subject'>
                                {subjectProfileHref ? (
                                  <button
                                    type='button'
                                    className='trend-content-profile-link text-style-label-semibold color-fig-default'
                                    onClick={(event) => navigateToProfile(event, subjectProfileHref)}
                                  >
                                    {subject}
                                  </button>
                                ) : (
                                  <p className='text-style-label-semibold color-fig-default'>{subject}</p>
                                )}
                                <p className='text-style-caption-normal color-fig-subtle'>{card.type === "player" ? opponent : ""}</p>
                            </div>
                            <div className='trend-content-header-info-market'>
                                <p className='text-style-caption-medium color-fig-default' style={customTextStyling}>{marketDescription}</p>
                            </div>
                        </div>
                    </div>
                    <div className='trend-content-header-odds'>
                        <p className='text-style-label-semibold color-fig-subtle'>{newOdds}</p>
                        {displayBook && <img src={`/assets/sportsbooks/${displayBook}.svg`} />}
                    </div>
                </div>

                <div className='trend-content-insights'>
                    {
                        showNoSignalsFallback ? (
                            <div className='trend-content-no-signals'>
                                <img src='/assets/signal-not-found.svg' alt='No signals found' />
                                <p className='text-style-caption-medium' style={customTextStyling}>
                                    No signals found
                                </p>
                            </div>
                        ) : (
                            summarySignals.map((signal, index) => {
                                const description = this.props.maskContent ? signal.description.replaceAll(/[a-zA-Z]/g, 'a').replace(/[0-9]/g, '0') : signal.description;
                                const annotation = this.props.maskContent ? signal.annotation.replaceAll(/[a-zA-Z]/g, 'a').replace(/[0-9]/g, '0') : signal.annotation;
                                const highlighted = normalizedHighlightedSignalType && signal.type === normalizedHighlightedSignalType;

                                return (
                                    <div key={`${signal.type}-${signal.description}-${index}`} className='trend-content-insight-wrapper'>
                                        <div className='trend-content-insight-narrative'>
                                            <div className={`trend-content-insight-icon${highlighted ? ' trend-content-insight-icon--highlighted' : ''}`}>
                                                <img src={getTrendSignalIconPath(signal)} alt={signal.type} />
                                            </div>
                                            <div className='trend-content-signal-overflow'>
                                                <span className={`trend-content-signal-tooltip-wrapper${this.state.truncatedSignalIndices[`straight-${index}`] ? ' trend-content-signal-tooltip-wrapper--truncated' : ''}`}>
                                                    <span
                                                        ref={(el) => {
                                                            if (el) this.signalOverflowRefs[`straight-${index}`] = el;
                                                            else delete this.signalOverflowRefs[`straight-${index}`];
                                                        }}
                                                        className={`trend-content-signal-overflow-inner text-style-caption-medium ${highlighted ? 'color-fig-default' : 'color-fig-subtle'}`}
                                                        style={customTextStyling}
                                                    >
                                                        {description}
                                                    </span>
                                                    <span className='trend-content-signal-tooltip-bubble'>{description}</span>
                                                </span>
                                            </div>
                                        </div>
                                        <p className='text-style-caption-tabular-medium' style={Object.assign({}, customTextStyling, {marginRight: 0})}>{annotation}</p>
                                    </div>
                                )
                            })
                        )
                    }
                </div>
            </>
        );
    }

    const subject = buildParlayTrendTitle(card, league, t)

    return (
        <>
            <div className='trend-content-header'>
                <div className='trend-content-header-left-parlay'>
                    <img src={getTeamLogoPath(league, card.legs[0].team)} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, this.context.league)}/>
                    <div className='trend-content-header-info trend-content-header-info-parlay'>
                        <div className='trend-content-header-info-subject'>
                            <p className='text-style-label-default-normal color-fig-subtle'>{subject}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className='trend-parlay-legs'>
                {
                    card.legs.map((leg, index) => {
                        const legSubject = leg.type === "player" ? getPlayerName(leg.player) : leg.team.code;
                        const legProfileHref = buildProfileHrefFromEntity(leg, leg.league || league);
                        const legMarketDescription = getMarketDescriptionFromTrend(league, leg, this.context.resolvedPreferredProviders, t);
                        const odds = getOddsFromCard(leg, this.context.userAttributes)

                        return (
                            <div key={`${getCardKey(card)}-${index}`} className='trend-parlay-leg'>
                                <div className='trend-parlay-leg-dot' style={{backgroundColor: SUPPORTED_LEAGUES[league]?.teams?.colors?.[getTheme()]?.[leg.team.code.toLowerCase()]}}>
                                </div>
                                {
                                    index > 0 && (
                                        <div className='trend-parlay-leg-line' style={{backgroundColor: SUPPORTED_LEAGUES[league]?.teams?.colors?.[getTheme()]?.[leg.team.code.toLowerCase()]}}>
                                        </div>
                                    )
                                }
                                <div className='trend-parlay-leg-text'>
                                    {legProfileHref ? (
                                        <button
                                        type='button'
                                        className='trend-content-profile-link text-style-label-semibold color-fig-default'
                                        onClick={(event) => navigateToProfile(event, legProfileHref)}
                                        >
                                        {`${legSubject}:`}
                                        </button>
                                    ) : (
                                        <p className='text-style-label-semibold color-fig-default'>{`${legSubject}:`}</p>
                                    )}
                                    <p className='text-style-label-medium color-fig-default'>{`${legMarketDescription}`}</p>
                                    <p className='text-style-label-semibold color-fig-subtle'>{odds}</p>
                                </div>
                            </div>
                        )
                    })
                }
            </div>

            <div className='trend-content-insights'>
                {
                    summarySignals.map((signal, index) => {
                        return (
                            <div key={`${signal.type}-${signal.description}-${index}`} className='trend-content-insight-wrapper'>
                                <div className='trend-content-insight-narrative'>
                                    <div className='trend-content-insight-icon'>
                                        <img src={getTrendSignalIconPath(signal)} alt={signal.type} />
                                    </div>
                                    <div className='trend-content-signal-overflow'>
                                        <span className={`trend-content-signal-tooltip-wrapper${this.state.truncatedSignalIndices[`parlay-${index}`] ? ' trend-content-signal-tooltip-wrapper--truncated' : ''}`}>
                                            <span
                                                ref={(el) => {
                                                    if (el) this.signalOverflowRefs[`parlay-${index}`] = el;
                                                    else delete this.signalOverflowRefs[`parlay-${index}`];
                                                }}
                                                className='trend-content-signal-overflow-inner text-style-label-normal'
                                            >
                                                {signal.description}
                                            </span>
                                            <span className='trend-content-signal-tooltip-bubble'>{signal.description}</span>
                                        </span>
                                    </div>
                                </div>
                                <p className='text-style-label-tabular-medium'>{signal.annotation}</p>
                            </div>
                        )
                    })
                }
            </div>
        </>
    );
  }
}

export default withTranslation()(TrendContent);
