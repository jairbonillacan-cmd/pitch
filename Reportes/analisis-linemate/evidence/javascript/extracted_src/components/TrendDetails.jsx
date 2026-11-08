import React from 'react'

import './TrendDetails.scss'
import './App.scss'
import GlobalContext from './GlobalContext'
import GamelogDetails from './GamelogDetails'
import { getBetslipLegKey, getCardKey, getLocalizedMarketNameFromId, getMarketDescription, getMarketDescriptionFromTrend } from '../linemate-react-common/src/betting-utils'
import TrendsWorkstation from './TrendsWorkstation'
import { base64Encode, getPlayerName } from '../linemate-react-common/src/util'
import { getTeamIdByCode, getTeamLogoPath, getTheme, teamLogoPathOnErrorFallback, shouldUseRoundTeamLogoBackground } from '../react-web-utils'
import { FEATURE_BETSLIP, GAME_TOTAL_MARKET_ID, SUPPORTED_LEAGUES } from '../linemate-react-common/src/constants'
import Button from './Button'
import Footer from './Footer'
import { withTranslation } from 'react-i18next'

/**
 * Props:
 * - trend: {}
 * - type: parlay|straight
 * One of trend or profileInfo is necessary
 */
// It's called trend details but realistically it's a component that's used as a combination of trend gamelog details, workstation, profile etc.
class TrendDetails extends React.Component {
  static contextType = GlobalContext

  constructor(props) {
    super(props)

    this.addToBetslip = this.addToBetslip.bind(this);
    this.removeFromBetslip = this.removeFromBetslip.bind(this);

    this.isWorkstation = ['profile', 'props'].includes(props.source)
    this.isDetails = ['trends', 'props'].includes(props.source)
 

    // if (this.isWorkstation) {
    //   this.tabs = {
    //     workstation: 'Workstation',
    //     details: 'Details'
    //   }
    //   if (!props.trend) {
    //     delete this.tabs['details']
    //   }
    // } else if (this.isDetails) {
    //   this.tabs = {
    //     details: 'Details',
    //     workstation: 'Workstation'
    //   }
    // }
    // if (props.type === 'parlay') {
    //   delete this.tabs['workstation']
    // }

    // TODO: completely remove the tabs
    //  For that need to still know which one to render based on profile or list of trends
    this.state = {
      tab: ['profile', 'props'].includes(props.source) ? 'workstation' : 'details', //Object.keys(this.tabs)[0]
      width: typeof window !== 'undefined' ? window.innerWidth : 1280
    }
  }

  componentDidMount() {
    window.addEventListener('resize', this.handleResize)
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.handleResize)
  }

  handleResize = () => {
    this.setState({ width: window.innerWidth })
  }

  addToBetslip(legs) {
    this.context.addLegsToBetslip(legs)
  }

  removeFromBetslip(legs) {
    this.context.removeLegsFromBetslip(legs)
  }

  // TODO: clean up the mobile vs desktop implementation to reduce duplicate code
  // TODO: The tabs are sub-optimal as it re-loads the data from back-end on each switch
  //  Ideally we should load them all at a higher level or cache them
  render() {
    const { t } = this.props
    var trend = this.props.trend
    if (!trend && this.props.source !== 'props' && this.isDetails) {
      return <></>
    }
    if (!trend && (this.isWorkstation || this.props.source === 'props')) {
      trend = {
        id: 'n/a',
        gameId: this.props.customFeed.gameId ?? '',
        hasOpponent: !!this.props.customFeed.opposingTeam,
        type: this.props.customFeed.player ? 'player' : 'team',
        player: this.props.customFeed.player,
        team: {
          ...this.props.customFeed.team,
          code: this.props.customFeed.teamCode || this.props.customFeed.team?.code
        },
        opposingTeam: this.props.customFeed.opposingTeam ?? null,
        market: this.props.customFeed.market || null,
        line: this.props.customFeed.line || null,
        outcome: this.props.customFeed.outcome ?? null,
        home: this.props.customFeed.home ?? null
      }
    }
    const importedAnalysis = Boolean(
      this.props.customFeed?.importedAnalysis || this.props.customFeed?.importedTrendsKey
    )
    const allowProfileNavigation =
      !this.isWorkstation && !importedAnalysis && !this.props.customFeed?.disableProfileNavigation
    const effectiveLeague =
      trend?.league ||
      this.props.detailTrend?.league ||
      this.props.workstationSeedTrend?.league ||
      this.context.league
    const getTrendLeague = (item) => item?.league || effectiveLeague
    const shouldUseWorkstationFallback = importedAnalysis && this.props.type === 'straight' && (!Array.isArray(trend?.signals) || trend.signals.length === 0)
    
    var profileHref = ''
    if (
      allowProfileNavigation &&
      (this.isDetails || this.props.source === 'props') &&
      this.props.type === 'straight'
    ) {
      const feed = base64Encode(
        JSON.stringify({
          title: 'Profile',
          subtitle: trend.type === 'player' ? getPlayerName(trend.player) : trend.team.code,
          player: trend.type === 'player' ? trend.player : null,
          teamCode: trend.team.code
        })
      )
      // Here an alternative would have been /league/profile/team or player id
      // However in an attempt to try and hide what ids we use we will keep the existing trends url and add data to the encoded query param
      // Realistically anyone that knows what they are doing and actually want to find out can decode it but it adds a layer of "protection"
      profileHref = `/${effectiveLeague}/trends?feed=${feed}&profile=true`
    }

    // Get Odds Title
    const legMarketDescription =
      this.props.type === 'straight' && trend?.market?.name
        ? (
            getMarketDescriptionFromTrend(
              effectiveLeague,
              trend,
              this.context.resolvedPreferredProviders,
              t
            ) ||
            getMarketDescription(
              effectiveLeague,
              trend.type,
              trend.line,
              trend.outcome,
              trend.market,
              trend.alternate,
              t
            )
          )
        : null
    const isParlay = this.props.type === 'parlay'
    var parlayHeaderText = ""
    if (isParlay) {
      if (trend.crossGame) {
        parlayHeaderText = `${getLocalizedMarketNameFromId(t, effectiveLeague, trend.legs[0].type, trend.legs[0].market.name)} ${t('trends.tabs.parlay')}`
      } else {
        const game = this.context.currentGames.find(x => x.id === trend.gameId)
        if (game) {
          parlayHeaderText = `${game.awayTeamData.info.code} @ ${game.homeTeamData.info.code} ${t('trends.tabs.sgp')}`
        } else {
          parlayHeaderText = `${trend.awayTeam.code} @ ${trend.homeTeam.code} ${t('trends.tabs.sgp')}`
        }
      }
    }

    const isBetslipEnabled = this.context?.enabledFeatures?.has(FEATURE_BETSLIP)
    // Blur section: 1 team (straight single-team), 2 teams (game total team trend or same-game parlay), 3 teams (cross-game parlay)
    var blurTeamCodes = []
    if (isParlay) {
      if (trend.crossGame && trend.legs) {
        blurTeamCodes = [...new Set(trend.legs.map(leg => leg.team.code))]
      } else if (trend.awayTeam && trend.homeTeam) {
        blurTeamCodes = [trend.awayTeam.code, trend.homeTeam.code]
      }
    } else if (trend.team) {
      const isGameTotalTeamTrend = trend.type === 'team' && trend.market?.name === GAME_TOTAL_MARKET_ID
      if (isGameTotalTeamTrend && trend.gameId) {
        const game = this.context.currentGames?.find(x => x.id === trend.gameId)
        if (game?.awayTeamData?.info?.code && game?.homeTeamData?.info?.code) {
          blurTeamCodes = [game.awayTeamData.info.code, game.homeTeamData.info.code]
        } else {
          blurTeamCodes = [trend.team.code]
        }
      } else {
        blurTeamCodes = [trend.team.code]
      }
    }
    var betslipButtonText = t('trends.analysis.addToMyPicks')
    var betslipButtonAction = () => this.addToBetslip(isParlay ? trend.legs : [trend])
    if (this.isDetails) {
      if (!isParlay && getBetslipLegKey(getTrendLeague(trend), trend) in this.context.betslip.legs) {
        betslipButtonText = t('trends.analysis.removeFromMyPicks')
        betslipButtonAction = () => this.removeFromBetslip([trend])
      } else if (isParlay && trend.legs.every((leg) => getBetslipLegKey(getTrendLeague(leg), leg) in this.context.betslip.legs)) {
        betslipButtonText = t('trends.analysis.removeFromMyPicks')
        betslipButtonAction = () => this.removeFromBetslip(trend.legs)
      }
    }
    const useRoundBackground = shouldUseRoundTeamLogoBackground(effectiveLeague);
    const trendTeamId = trend.team?.teamId || trend.team?.id || getTeamIdByCode(this.context.teams, trend.team?.code)
    const isMobileView = this.state.width <= 1000
    const titleClassName = isMobileView ? 'text-style-h-4-semibold' : 'text-style-h-2-semibold'
    const marketClassName = isMobileView ? 'text-style-h-4-medium' : 'text-style-h-2-medium'
    const opponentClassName = isMobileView ? 'team-indicator text-style-h-5-medium' : 'team-indicator text-style-h-4-normal'
    const shouldShowMobileTrendsButton =
      this.props.onMobileClose && this.isWorkstation && this.props.source !== 'props'
    const shouldShowMobileCloseButton =
      this.props.onMobileClose && (!this.isWorkstation || this.props.source === 'props')
    return (
      <div className={`trend-details-wrapper ${isParlay ? 'trend-details-wrapper-parlay' : ''}`}>
        {/* Header className="trends-page-details-title trends-page-details-title-desktop"> */}
        {/* Shared Card Layout for Mobile and Desktop */}
        {/* XL Desktop Single Row Layout */}
        <div className="trend-details-header-content-desktop">
          <div className="trend-details-header-content-desktop-header">
            {this.props.type === 'straight' && (
              <>
                {/* team-icon */}
                <div
                  className="team-icon"
                  style={{
                    backgroundColor: useRoundBackground
                      ? SUPPORTED_LEAGUES[effectiveLeague]?.teams?.colors?.[getTheme()]?.[
                          trend.team.code.toLowerCase()
                        ]
                      : "transparent",
                    borderRadius: useRoundBackground ? "50%" : 0
                  }}>
                  <img
                    src={getTeamLogoPath(effectiveLeague, trendTeamId)}
                    onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, effectiveLeague)}
                  />
                </div>

                {/* Player Info */}
                <div className="trend-details-header-content-header-player">
                  <h2 className={titleClassName}>
                    {allowProfileNavigation ? (
                      <a href={profileHref}>
                        {!this.isWorkstation && trend.type === 'player' && `${getPlayerName(trend.player)}: `}
                        {!this.isWorkstation && trend.type === 'team' && `${trend.team.code}: `}
                        {this.isWorkstation && trend.type === 'player' && getPlayerName(trend.player)}
                        {this.isWorkstation && trend.type === 'team' && `${trend.team.code}`}
                      </a>
                    ) : (
                      <span>
                        {!this.isWorkstation && trend.type === 'player' && `${getPlayerName(trend.player)}: `}
                        {!this.isWorkstation && trend.type === 'team' && `${trend.team.code}: `}
                        {this.isWorkstation && trend.type === 'player' && getPlayerName(trend.player)}
                        {this.isWorkstation && trend.type === 'team' && `${trend.team.code}`}
                      </span>
                    )}
                  </h2>
                </div>

                {/* Market */}
                <div className="trend-details-header-content-header-line">
                  {
                    legMarketDescription && 
                    <span className={marketClassName}>
                    {`${legMarketDescription} `}
                    </span>
                  }
                  {/* @ section */}
                  {trend.opposingTeam && (
                    <span
                      className={opponentClassName}>{`${trend.home ? 'vs' : '@'} ${trend.opposingTeam.code}`}</span>
                  )}
                </div>

                {/* Spacer */}
                <div className="spacer"></div>

                {shouldShowMobileTrendsButton && (
                  <div className="trend-details-mobile-trends-button">
                    <Button
                      text={t('trends.title')}
                      typography="sm"
                      type="invisible"
                      enabled={true}
                      onClick={this.props.onMobileClose}
                    />
                  </div>
                )}

                {shouldShowMobileCloseButton && (
                  <div className="trend-details-mobile-close">
                    <Button
                      icon="assets/close-icon.svg"
                      typography="sm"
                      type="invisible"
                      enabled={true}
                      onClick={this.props.onMobileClose}
                    />
                  </div>
                )}

                {/* Action Buttons */}
                {/* TODO: set actions here */}
                {/* <div className="trend-details-header-content-actions-desktop">
                  {
                    !this.isWorkstation && (
                      <>
                        { {
                          isBetslipEnabled && (
                            <Button enabled={true} typography="sm" type="primary" text={betslipButtonText}  onClick={betslipButtonAction}/>
                          )
                        } }
                        <Button enabled={true} typography="sm" type="secondary" text="View Profile" onClick={() => window.location.href = profileHref}/>
                      </>
                    )
                  }
                </div> */}
              </>
            )}

            {isParlay && (
              <>
                {/* Team Images for Parlay */}
                {/* Team Images for Parlay - Mobile Layout */}
                <div className="trend-details-header-content-parlay">
                {
                  trend.crossGame && (
                    <>
                    {[...new Map((trend?.legs || []).map((leg) => [leg.team.code, leg.team])).values()].map((team) => (
                      <div
                        key={team.code}
                        className={`trend-details-header-content-parlay-logos${
                          useRoundBackground ? "" : " trend-details-header-content-parlay-logos--flat"
                        }`}
                        style={{
                          backgroundColor: useRoundBackground
                            ? SUPPORTED_LEAGUES[effectiveLeague]?.teams?.colors?.[getTheme()]?.[team.code.toLowerCase()]
                            : "transparent",
                          borderRadius: useRoundBackground ? "50%" : 0
                        }}
                      >
                        <img src={getTeamLogoPath(effectiveLeague, team)} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, effectiveLeague)}/>
                      </div>
                    ))}
                    </>
                  )
                }
                {
                  !trend.crossGame && (
                    <>
                    {[trend.awayTeam, trend.homeTeam].map((team) => (
                      <div
                        key={team.code}
                        className={`trend-details-header-content-parlay-logos${
                          useRoundBackground ? "" : " trend-details-header-content-parlay-logos--flat"
                        }`}
                        style={{
                          backgroundColor: useRoundBackground
                            ? SUPPORTED_LEAGUES[effectiveLeague]?.teams?.colors?.[getTheme()]?.[team.code.toLowerCase()]
                            : "transparent",
                          borderRadius: useRoundBackground ? "50%" : 0
                        }}
                      >
                        <img src={getTeamLogoPath(effectiveLeague, team)} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, effectiveLeague)}/>
                      </div>
                    ))}
                    </>
                  )
                }
                </div>

                {/* Player Info */}
                <div className="trend-details-header-content-header-player">
                  <h2 className={titleClassName}>{parlayHeaderText}</h2>
                </div>

                <div className="spacer"></div>

                {shouldShowMobileCloseButton && (
                  <div className="trend-details-mobile-close">
                    <Button
                      icon="assets/close-icon.svg"
                      typography="sm"
                      type="invisible"
                      enabled={true}
                      onClick={this.props.onMobileClose}
                    />
                  </div>
                )}
              </>
            )}
          </div>
          {blurTeamCodes.length > 0 && (
            <div className='trend-details-blur-section'>
              {blurTeamCodes.map((teamCode) => (
                <div key={teamCode} className='trend-details-blur-item'>
                  <div className='trend-details-blur' style={{ backgroundColor: SUPPORTED_LEAGUES[effectiveLeague]?.teams?.colors?.[getTheme()]?.[teamCode.toLowerCase()] }} />
                  <img className='trend-details-blur-logo' src={getTeamLogoPath(effectiveLeague, getTeamIdByCode(this.context.teams, teamCode))} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, effectiveLeague)} />
                </div>
              ))}
            </div>
          )}
          
        </div>

        {/* Details/workstation content depending on tab selection */}
        {this.state.tab === 'details' && isParlay && (
          <GamelogDetails
            key={getCardKey(trend)}
            parlay={isParlay ? trend : null}
            hideFooter={this.props.hideNestedFooter}
          />
        )}
        {this.state.tab === 'details' && this.props.type === 'straight' && !shouldUseWorkstationFallback && (
          <GamelogDetails
              key={getCardKey(trend)}
              trend={this.props.type === 'straight' ? trend : null}
              without={this.props.without}
              leagueOverride={effectiveLeague}
              hideFooter={this.props.hideNestedFooter}
          />
        )}
        {((!importedAnalysis && this.state.tab === 'workstation') || shouldUseWorkstationFallback) && (() => {
          const workstationTrend = this.props.workstationSeedTrend || trend

          return (
            <TrendsWorkstation
              key={this.props.source === 'profile' ? 'profile-workstation' : getCardKey(workstationTrend)}
              league={effectiveLeague}
              leagueOverride={effectiveLeague}
              type={workstationTrend.type}
              gameId={workstationTrend.gameId}
              home={workstationTrend.home}
              team={workstationTrend.team}
              opposingTeam={workstationTrend.opposingTeam}
              markets={{}}
              initialMarket={'market' in workstationTrend ? workstationTrend.market?.name : null}
              initialLine={workstationTrend.line}
              player={workstationTrend.type === 'player' ? workstationTrend.player : null}
              backAction={null}
              without={this.props.without}
              filtersToExclude={this.props.filtersToExclude}
              detailTrend={shouldUseWorkstationFallback ? null : this.props.detailTrend}
              hideFooter={this.props.hideNestedFooter}
            />
          )
        })()}
      </div>
    )
  }
}

export default withTranslation()(TrendDetails)
