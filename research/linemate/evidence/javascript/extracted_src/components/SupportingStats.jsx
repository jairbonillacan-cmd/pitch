import React from 'react'

import './SupportingStats.scss'
import './App.scss'
import GlobalContext from './GlobalContext'
import { getPlayerTitle, getTeamLogoPath } from '../react-web-utils'
import {
  addOrdinalNumberSuffix,
  decimalPrecision,
  getDictionaryValue,
  getMultiFieldValue,
  getPlayerPosition,
  isDictEmpty
} from '../linemate-react-common/src/util'
import SegmentedControl from './SegmentedControl'
import { withTranslation } from 'react-i18next'

/**
 * Props:
 * - supportingStats: {}
 * - teamId: str
 * - opposingTeamCode: str
 * - opposingTeamId: str
 * - playerRecord: {}
 * - opposingSupportingStats: {}
 * - opponent: {}
 * - opponentType: team|player
 * - displaySituations: bool
 * - situations: {}
 * - supportingStatsRankings: {}
 * - supportingStatsPositionalRankings: {}
 * - positionalSituation: str
 * - currentSelectedSituation: str
 * - comparableSelectedSituation: str
 * - currentSituationSelected: fn(str)
 * - comparableSituationSelected: fn(str)
 */
class SupportingStats extends React.Component {
  static contextType = GlobalContext

  getStatHeaderLabel(stat) {
    return this.props.t(`common.statHeaders.${stat}`, { defaultValue: stat })
  }

  render() {
    const effectiveLeague = this.props.leagueOverride || this.context.league
    if (
      isDictEmpty(this.props.supportingStats) ||
      isDictEmpty(this.props.opposingSupportingStats)
    ) {
      return <></>
    }
    return (
      <div className="supporting-stats-container">
        <p className="text-style-h-3-medium color-fig-default">{this.props.t('workstation.sections.seasonStats')}</p>
        <div className="supporting-stats-sections">
          {/* Current player */}
          <div className="supporing-stats-table">
            <div className="supporing-stats-table-subject">
              <img
                src={getTeamLogoPath(effectiveLeague, this.props.teamId)}
                height={24}
                width={24}
              />
              <p className="text-style-body-medium color-fig-default">
                {getPlayerTitle(this.props.playerRecord, effectiveLeague, true, true)}
              </p>
            </div>
            {this.props.displaySituations && (
              <div className="supporting-stats-table-segmented-control-wrapper">
                <SegmentedControl
                  options={this.props.situations}
                  selection={this.props.currentSelectedSituation}
                  selectionHandler={this.props.currentSituationSelected}
                  fillWidth={true}
                />
              </div>
            )}
            <div className="supporting-stats-table-headers">
              {Object.keys(this.props.supportingStats).map((stat, index) => (
                <div
                  key={stat}
                  className="supporting-stats-table-header"
                  style={{ '--columns': Object.keys(this.props.supportingStats).length }}
                  data-bordered={index !== 0}>
                  <p className="text-style-caption-uppercase-medium color-fig-subtle">{this.getStatHeaderLabel(stat)}</p>
                </div>
              ))}
            </div>
            <div className="supporting-stats-table-data">
              {Object.keys(this.props.supportingStats).map((stat, index) => (
                <div
                  key={stat}
                  className="supporting-stats-table-data-entry"
                  style={{ '--columns': Object.keys(this.props.supportingStats).length }}
                  data-bordered={index !== 0}>
                  <p className="text-style-body-tabular-medium color-fig-default">
                    {getDictionaryValue(this.props.playerRecord, this.props.supportingStats[stat])}
                  </p>
                </div>
              ))}
            </div>
          </div>
          {/* Opposing comparable */}
          <div className="supporing-stats-table">
            <div className="supporing-stats-table-subject">
              <img
                src={getTeamLogoPath(effectiveLeague, this.props.opposingTeamId)}
                height={24}
                width={24}
              />
              {this.props.opponentType === 'team' ? (
                <p className="text-style-body-medium color-fig-default">
                  {this.props.opposingTeamCode}
                </p>
              ) : (
                <p className="text-style-body-medium color-fig-default">
                  {getPlayerTitle(this.props.opponent, effectiveLeague, true, true)}
                </p>
              )}
            </div>
            {/* Situational picker if applicable (mlb) */}
            {this.props.displaySituations && (
              <div className="supporting-stats-table-segmented-control-wrapper">
                <SegmentedControl
                  options={this.props.situations}
                  selection={this.props.comparableSelectedSituation}
                  selectionHandler={this.props.comparableSituationSelected}
                  fillWidth={true}
                />
              </div>
            )}
            {/* Positional picker if applicable */}
            {this.props.supportingStatsPositionalRankings && (
              <div className="supporting-stats-table-segmented-control-wrapper">
                <SegmentedControl
                  options={{
                    all: this.props.t('workstation.filters.all'),
                    positional: this.props.t('workstation.filters.versusPosition', {
                      position: getPlayerPosition(this.props.playerRecord)
                    })
                  }}
                  selection={this.props.positionalSituation}
                  selectionHandler={this.props.positionalSituationSelected}
                  fillWidth={true}
                />
              </div>
            )}
            <div className="supporting-stats-table-headers">
              {Object.keys(this.props.opposingSupportingStats).map((stat, index) => (
                <div
                  key={stat}
                  className="supporting-stats-table-header"
                  style={{ '--columns': Object.keys(this.props.opposingSupportingStats).length }}
                  data-bordered={index !== 0}>
                  <p className="text-style-caption-uppercase-medium color-fig-subtle">{this.getStatHeaderLabel(stat)}</p>
                </div>
              ))}
            </div>
            <div className="supporting-stats-table-data">
              {Object.keys(this.props.opposingSupportingStats).map((stat, index) => (
                <div
                  key={stat}
                  className="supporting-stats-table-data-entry"
                  style={{ '--columns': Object.keys(this.props.opposingSupportingStats).length }}
                  data-bordered={index !== 0}>
                  <p className="text-style-body-tabular-medium color-fig-default">
                    {this.props.opponentType === 'player' &&
                      decimalPrecision(
                        getMultiFieldValue(
                          this.props.opponent,
                          this.props.opposingSupportingStats[stat].playerFields
                        ),
                        1
                      )}
                    {this.props.opponentType === 'team' &&
                      this.props.positionalSituation === 'all' && (
                        <>
                          {this.props.opposingSupportingStats[stat].ranked
                            ? addOrdinalNumberSuffix(
                                this.props.supportingStatsRankings[stat][
                                  this.props.opposingTeamCode
                                ]
                              )
                            : decimalPrecision(
                                this.props.supportingStatsRankings[stat][
                                  this.props.opposingTeamCode
                                ],
                                1
                              )}
                        </>
                      )}
                    {this.props.supportingStatsPositionalRankings &&
                      this.props.positionalSituation === 'positional' && (
                        <>
                          {this.props.opposingSupportingStats[stat].ranked
                            ? addOrdinalNumberSuffix(
                                this.props.supportingStatsPositionalRankings[stat][
                                  getPlayerPosition(this.props.playerRecord)
                                ][this.props.opposingTeamCode]
                              )
                            : // Note: in non-ranked we use the original/regular supporting stats rankings since the positional one won't have things that aren't ranked
                              //  This is primarily for the GP/games played field right now but could be used for others in the future
                              //  Using the positional rankings with an un-ranked stat would cause an error
                              decimalPrecision(
                                this.props.supportingStatsRankings[stat][
                                  this.props.opposingTeamCode
                                ],
                                1
                              )}
                        </>
                      )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }
}

export default withTranslation()(SupportingStats)
