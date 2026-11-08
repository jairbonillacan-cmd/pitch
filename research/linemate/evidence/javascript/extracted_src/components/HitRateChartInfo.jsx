import React from 'react'
import { capitalizeFirstLetter } from '../linemate-react-common/src/util'
import { SUPPORTED_LEAGUES } from '../linemate-react-common/src/constants'
import { getTheme } from '../react-web-utils'
import GlobalContext from './GlobalContext'
import { withTranslation } from 'react-i18next'

class HitRateChartInfo extends React.Component {
  static contextType = GlobalContext

  getOutcomeBlock(outcome, trends, gamesCount, teamColor) {
    var hitPercentage = 0
    var hits = 0
    if (trends) {
      if (outcome === 'under') {
        hitPercentage = trends.missPercentage
        hits = gamesCount - trends.hits - trends.push
      } else {
        hitPercentage = trends.hitPercentage
        hits = trends.hits
      }
    }
    // TODO: can't have div inside p
    return (
      <>
        <p className="text-style-label-medium">
          <div
            className={'hit-rate-chart-info-details-indicator'}
            style={{ backgroundColor: teamColor, opacity: outcome === 'over' ? 1 : 0.5 }}></div>
          {this.props.t(`common.filters.options.outcome.${outcome}`, {
            defaultValue: outcome === 'cover'
              ? this.props.t('workstation.labels.cover')
              : capitalizeFirstLetter(outcome)
          })}
        </p>
        <div>
          <p className="text-style-h-3-semibold">{`${hitPercentage}%`}</p>
          <div className="hit-rate-chart-info-details-fraction">
            <p className="text-style-caption-medium">{`${hits}/${gamesCount}`}</p>
          </div>
        </div>
      </>
    )
  }

  render() {
    const {
      hitRateLine,
      lineInputChanged,
      decreaseLine,
      increaseLine,
      trends,
      filteredGames,
      isCoverOutcome,
      selectedCard,
      resultAverage,
      marketOutcomeType
    } = this.props
    // Calculate team color for the indicator
    const effectiveLeague = this.props.leagueOverride || this.context.league
    const teamColor =
      SUPPORTED_LEAGUES[effectiveLeague]?.teams?.colors?.[getTheme()]?.[selectedCard.team?.code.toLowerCase()]
    return (
      <div className="hit-rate-chart-info">
        <div className="hit-rate-chart-info-details">
          {isCoverOutcome && (
            <div className="hit-rate-chart-info-details-cover">
              {this.getOutcomeBlock('cover', trends, filteredGames.length, teamColor)}
            </div>
          )}
          {!isCoverOutcome && (
            <>
              <div className="hit-rate-chart-info-details-over-under">
                {this.getOutcomeBlock('over', trends, filteredGames.length, teamColor)}
              </div>
              <div className="hit-rate-chart-info-details-over-under">
                {this.getOutcomeBlock('under', trends, filteredGames.length, teamColor)}
              </div>
            </>
          )}
          {marketOutcomeType && marketOutcomeType !== 'COVER_YES' &&
          <div className='hit-rate-chart-info-details-cover'>
            <p className='text-style-label-medium'>{this.props.t('workstation.labels.averagePerGame')}</p>
            <p className='text-style-h-4-medium' style={{color: "var(--color-fig-default)"}}>{resultAverage}</p>
          </div>
          }
        </div>
        {selectedCard.type === 'player' && <div className="hit-rate-chart-info-average"></div>}
      </div>
    )
  }
}

export default withTranslation()(HitRateChartInfo)
