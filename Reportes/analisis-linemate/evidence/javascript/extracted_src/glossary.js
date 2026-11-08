import React from 'react';
import { LEGENDS, POSITION_LEGEND } from './linemate-react-common/src/constants.js';
import { capitalizeFirstLetter } from './linemate-react-common/src/util.js';
import './fonts.css';
import './generic.css';
import './glossary.css';
import HtmlHeaders from './html-headers.js';

const sportsLeagueMapping = {
    nfl: 'football',
    nhl: 'hockey',
    nba: 'basketball',
    mlb: 'baseball'
}

class Glossary extends React.Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    document.title = 'Glossary - Linemate';
  }

  render() {
    return(
        <div class="content-container">
            <HtmlHeaders canonicalRef="https://www.linemate.io/glossary"/>
            <div class="glossary-header">
                <p class="font size-44 weight-700 color-fig-default spaced-negative-low display-block" style={{marginBottom: '24px'}}>Glossary</p>
                <p class="font size-18 color-fig-default display-block" style={{marginBottom: '20px'}}>At Linemate, we believe in sharing our knowledge. Here is a list of abbreviations used for different stats across all of the sports covered by Linemate.</p>
                {
                    Object.keys(LEGENDS).map((league, index) =>
                        <>
                            {/* <span class="grey" style={index === 0 ? {display: 'none'} : {marginLeft: '24px', marginRight: '24px'}}>&bull;</span> */}
                            <a href={`/glossary#${league.toLowerCase()}`}>
                                {/* <img style={{paddingBottom: '4px'}} src={`/assets/${sportsLeagueMapping[league.toLowerCase()]}-icon-green.svg`} width={24} height={24} alt=""/> */}
                                <p class="font size-16 green">{league.toUpperCase()}</p>
                            </a>
                        </>
                    )
                }
            </div>
            <hr style={{marginTop: '44px'}}/>
            {
                Object.keys(LEGENDS).map((league, index) =>
                <>
                    <div class="glossary-margin-separator"></div>
                    <div id={league.toLowerCase()} class="glossary-league-marker">
                        {/* <img src={`/assets/${sportsLeagueMapping[league.toLowerCase()]}-icon.svg`} alt=""/> */}
                        <p class="font size-30 weight-600 color-fig-default">{league.toUpperCase()}</p>
                    </div>
                    <div class="glossary-content">
                        {
                            Object.keys(LEGENDS[league]).map((category) =>
                                <>
                                    <p class={`font size-24 weight-600 color-fig-default full-width display-block ${category.toLowerCase() === "team" ? "glossary-team-heading" : "glossary-player-heading"}`}>
                                        {`${capitalizeFirstLetter(category)} stats`}
                                    </p>
                                    {/* Dividing the stats in 2 columns of roughly equal length */}
                                    <div class="glossary-category-stats">
                                        {
                                            Object.keys(LEGENDS[league][category]).slice(0, Object.keys(LEGENDS[league][category]).length / 2).map((stat) =>
                                                <div style={{marginBottom: '12px'}}>
                                                    <p class="font size-18 weight-600 color-fig-default">{stat}: </p>
                                                    <p class="font size-18 color-fig-subtle">{LEGENDS[league][category][stat]}</p>
                                                </div>
                                            )
                                        }
                                    </div>
                                    <div class="glossary-category-stats">
                                        {
                                            Object.keys(LEGENDS[league][category]).slice(Object.keys(LEGENDS[league][category]).length / 2, Object.keys(LEGENDS[league][category]).length).map((stat) =>
                                                <div style={{marginBottom: '12px'}}>
                                                    <p class="font size-18 weight-600 color-fig-default">{stat}: </p>
                                                    <p class="font size-18 color-fig-subtle">{LEGENDS[league][category][stat]}</p>
                                                </div>
                                            )
                                        }
                                    </div>
                                </>
                            )
                        }
                        <>
                            <p class={`font size-24 weight-600 color-fig-default full-width display-block glossary-player-heading`}>
                                Position
                            </p>
                            {/* Dividing the stats in 2 columns of roughly equal length */}
                            <div class="glossary-category-stats">
                                {
                                    Object.keys(POSITION_LEGEND[league]).slice(0, Object.keys(POSITION_LEGEND[league]).length / 2).map((abbreviation) =>
                                        <div style={{marginBottom: '12px'}}>
                                            <p class="font size-18 weight-600 color-fig-default">{abbreviation}: </p>
                                            <p class="font size-18 color-fig-subtle">{POSITION_LEGEND[league][abbreviation]}</p>
                                        </div>
                                    )
                                }
                            </div>
                            <div class="glossary-category-stats">
                                {
                                    Object.keys(POSITION_LEGEND[league]).slice(Object.keys(POSITION_LEGEND[league]).length / 2, Object.keys(POSITION_LEGEND[league]).length).map((abbreviation) =>
                                        <div style={{marginBottom: '12px'}}>
                                            <p class="font size-18 weight-600 color-fig-default">{abbreviation}: </p>
                                            <p class="font size-18 color-fig-subtle">{POSITION_LEGEND[league][abbreviation]}</p>
                                        </div>
                                    )
                                }
                            </div>
                        </>
                    </div>
                    <div class="glossary-margin-separator"></div>
                    <hr style={index === Object.keys(LEGENDS).length - 1 ? {display: 'none'} : {}}/>
                </>
                )
            }
        </div>
    );
  }
}

export default Glossary;
