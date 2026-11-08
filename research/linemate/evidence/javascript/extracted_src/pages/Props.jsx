import React from 'react'

import './Trends.scss'
import '../components/App.scss'
import './Props.scss'

import GlobalContext from '../components/GlobalContext'
import { buildQueryParams, filtersToQueryParamsDict, getBetTypeOptionsForAPI, getGamesFilterForAPI, getGameTitle, getMultipleBetTypeFilterForAPI, getPreferredFormat, getTimeframeFilterForAPI, jsonOrDefault, parseDateFromString } from '../linemate-react-common/src/util';
import { API_HOST } from '../react-web-constants';
import { getHitRateKey, isMarketSupported, supportedCrossGameParlayFilter, supportedSameGameParlayFilter, supportedTrendFilter } from '../linemate-react-common/src/betting-utils';
import { BETTING_LEADERBOARD_MIN_ODDS_OPTIONS, LINE_TYPE_FILTER, SCHEDULE_FORMAT_DAILY, SCHEDULE_FORMAT_WEEKLY, SUPPORTED_LEAGUES } from '../linemate-react-common/src/constants';
import _ from 'lodash';
import TrendDetails from '../components/TrendDetails';
import Loader from '../components/Loader';
import { getOverUnderFilterForAPI } from './Cheatsheet';
import HitRateEntry from '../components/HitRateEntry';
import ListComponent from './../components/ListComponent'
import { FILTER_KEYS } from '../linemate-react-common/src/filter-config'
import { withTranslation } from 'react-i18next'

const filterFunctions = {
    player: supportedTrendFilter,
    team: supportedTrendFilter,
    crossGameParlay: supportedCrossGameParlayFilter,
    sameGameParlay: supportedSameGameParlayFilter
}
export const FILTER_FUNCTIONS = filterFunctions



const filters = {
    team: (league, gamesDict, annotations) => {
        var filters = {}
        filters[FILTER_KEYS.GAMES] = getGamesFilterForAPI(gamesDict, annotations)
        filters[FILTER_KEYS.BET_TYPE] = getMultipleBetTypeFilterForAPI(getBetTypeOptionsForAPI(league, 'team'))
        filters[FILTER_KEYS.TIMEFRAME] = getTimeframeFilterForAPI()
        return filters;
    },
    player: (league, gamesDict, annotations, userAttributes) => {
        var filters = {}
        filters[FILTER_KEYS.GAMES] = getGamesFilterForAPI(gamesDict, annotations)
        filters[FILTER_KEYS.OVER_UNDER] = getOverUnderFilterForAPI()
        filters[FILTER_KEYS.MIN_ODDS] = {
            isActive: false,
            options: Object.assign(
                { all: "All Odds" },
                Object.fromEntries(
                    BETTING_LEADERBOARD_MIN_ODDS_OPTIONS[getPreferredFormat(userAttributes)].map((odds) => [String(odds), String(odds)])
                )
            ),
            selectedValue: "all",
            queryParamField: 'minimumOdds',
            filterType: "single"
        }
        filters[FILTER_KEYS.BET_TYPE] = getMultipleBetTypeFilterForAPI(getBetTypeOptionsForAPI(league, 'player'))
        filters[FILTER_KEYS.TIMEFRAME] = getTimeframeFilterForAPI()
        return filters;
    }
}

const dataLimitIncrement = 50


// TODO: deduplicate between trends, props, cheatsheet where possible since it's a very similar design overall
class Props extends React.Component {
    static contextType = GlobalContext

    constructor(props, context) {
        // https://github.com/facebook/react/issues/13944
        // Looks like this API is being deprecated but it doesn't look like there is any official way of doing it in the new API
        super(props, context)

        this.segmentedControlSelection = this.segmentedControlSelection.bind(this)
        this.hitRateSelected = this.hitRateSelected.bind(this)
        this.listFilterOptionSelected = this.listFilterOptionSelected.bind(this)
        this.applyFilters = this.applyFilters.bind(this)
        this.fetchBatch = this.fetchBatch.bind(this)
        this.listRef = React.createRef()

        this.workstationResizeObserver = null

        this.pickerOptions = {
            player: 'Player',
            team: 'Team'
        }

        const games = context.currentGames && context.currentGames.length > 0 ? context.currentGames : (context.upcomingGames || [])
        const gameTitleToGameIdDict = Object.fromEntries(games.map(x => [getGameTitle(context.league, x), x.id]))
        const gameTitleToAnnotationDict = Object.fromEntries(games.map(x => {
            const parsedDate = parseDateFromString(x.timestamp);
            return [getGameTitle(context.league, x), `${parsedDate.dayOfWeekShort} ${parsedDate.formattedTime}`]
        }))
        var listFilters = {
            player: filters.player(context.league, gameTitleToGameIdDict, gameTitleToAnnotationDict, context.userAttributes),
            team: filters.team(context.league, gameTitleToGameIdDict, gameTitleToAnnotationDict)
        };

        this.defaultListFilters = _.cloneDeep(listFilters)

        this.startingIndex = 0

        const searchParams = new URLSearchParams(window.location.search)
        const selectedTab = searchParams.get('tab');
        const pickerSelection = selectedTab && this.pickerOptions?.[selectedTab] ? selectedTab : Object.keys(this.pickerOptions)[0]
        this.state = {
            tabs: {
                player: {
                    hitRates: [], 
                    offset: 0, 
                    loadingBatch: false,
                    initialLoadInProgress: true,
                    endReached: false,
                    lastFetchTime: new Date().getTime()
                },
                team: {
                    hitRates: [], 
                    offset: 0, 
                    loadingBatch: false,
                    initialLoadInProgress: true,
                    endReached: false,
                    lastFetchTime: new Date().getTime()
                },
            },
            pickerSelection: pickerSelection,
            selectedHitRate: null,
            selectedHitRateMarkets: null,
            listFiltersModalOpen: false,
            listFilters: _.cloneDeep(listFilters),
            // Dictates if we need to show the details view if set to true, otherwise show the list view
            mobileHitRateSelected: false,
            initialHitRateSelection: true
        }
    }

    componentDidMount() {
       document.title = `${this.props.t('props.title')} - Linemate`;
        this.workstationResizeObserver = new ResizeObserver((entries) => {
            // Sync list height to details panel so the list keeps a bounded height and overflow: auto works.
            // Apply at all breakpoints so the list does not expand at small viewports (e.g. ≤1023px).
            // When switching tabs or when details are empty but current tab has data, avoid collapsing the list to 0.
            const detailsHeight = entries[0].contentRect.height;
            const currentTab = this.state.tabs[this.state.pickerSelection];
            const hasHitRatesInCurrentTab = currentTab && currentTab.hitRates && currentTab.hitRates.length > 0;
            const minHeight = detailsHeight === 0 ? '70vh' : `${detailsHeight}px`;
            if (this.listRef.current) {
                this.listRef.current.style.height = minHeight;
            }
        })
        const detailsEl = document.getElementsByClassName("trends-page-details")[0];
        if (detailsEl) this.workstationResizeObserver.observe(detailsEl);
    }

    componentWillUnmount() {
        if (this.workstationResizeObserver) {
            this.workstationResizeObserver.disconnect();
        }
    }
    
    fetchBatch(tab, offset, reset, initialLoad, filtersOverride) {
        const context = this.context
        if (!context) return

        const filtersForTab = (filtersOverride && filtersOverride[tab])
            ? filtersOverride[tab]
            : this.state.listFilters[tab]

        const apiFilters = {
            offset: offset,
            limit: dataLimitIncrement,
            preferredProviders: context.resolvedPreferredProviders,
            levelsToInclude: tab === 'player' ? 'player' : 'game,team',
            oddsFormat: context.userAttributes.preferredOddsFormat,
            ...filtersToQueryParamsDict(filtersForTab)
        }

        const queryParams = buildQueryParams(apiFilters)

        fetch(`${API_HOST}/api/${context.league}/v3/markets/hitRates?${queryParams}`)
            .then((response) => jsonOrDefault(response, []))
            .then((hitRatesResponse) => {
                const filteredHitRates = hitRatesResponse.filter(
                    (hitRate) => isMarketSupported(context.league, tab, hitRate.marketId)
                )

                this.setState((previousState) => {
                    const previousTabState = previousState.tabs[tab]
                    const currentTrendsLength = previousTabState.hitRates.length
                    const reachedEndByResponse = hitRatesResponse.length < dataLimitIncrement
                    const noRenderableResultsOnReset = reset && filteredHitRates.length === 0

                    const nextTabState = {
                        ...previousTabState,
                        hitRates: reset
                            ? filteredHitRates
                            : previousTabState.hitRates.concat(filteredHitRates),
                        offset: offset + dataLimitIncrement,
                        loadingBatch: false,
                        initialLoadInProgress: false,
                        endReached: reachedEndByResponse || noRenderableResultsOnReset,
                        lastFetchTime: new Date().getTime()
                    }

                    const nextState = {
                        tabs: {
                            ...previousState.tabs,
                            [tab]: nextTabState
                        }
                    }

                    if (reset && filteredHitRates.length === 0 && previousState.pickerSelection === tab) {
                        nextState.selectedHitRate = null
                    }

                    if (initialLoad) {
                        let presetIndex = this.startingIndex || 0
                        if (presetIndex >= nextTabState.hitRates.length) {
                            presetIndex = 0
                        }

                        nextState.selectedHitRate =
                            nextTabState.hitRates.length > presetIndex
                                ? nextTabState.hitRates[presetIndex]
                                : null
                    }

                    return nextState
                }, () => {
                    if (initialLoad) {
                        this.hitRateSelected(this.state.selectedHitRate, true)
                    } else if (!reset) {
                        const items = document.getElementsByClassName('props-entry')
                        const currentTrendsLength = this.state.tabs[tab].hitRates.length - filteredHitRates.length
                        if (currentTrendsLength > 0) {
                            const previousLastItem = items[currentTrendsLength - 1]
                            previousLastItem?.scrollIntoView(false, { behavior: 'auto', block: 'end' })
                        }
                    }
                })
            })
            .catch((err) => {
                console.error(err)
                this.setState((previousState) => ({
                    tabs: {
                        ...previousState.tabs,
                        [tab]: {
                            ...previousState.tabs[tab],
                            loadingBatch: false,
                            initialLoadInProgress: false
                        }
                    }
                }))
            })
    }

    segmentedControlSelection(selection) {
        window.scrollTo({top: 0, behavior: 'smooth'});
        this.setState({pickerSelection: selection})
    }

    hitRateSelected(hitRate, initialLoad) {
      if (!initialLoad) {
          // Scroll to top of page for mobile, otherwise the user ends up at the bottom of the workstation
          window.scrollTo({top: 0, behavior: 'smooth'});
      }
      if (hitRate && this.state.selectedHitRate && getHitRateKey(hitRate) === getHitRateKey(this.state.selectedHitRate)) {
          return this.setState({mobileHitRateSelected: !initialLoad, initialHitRateSelection: initialLoad});
      }
      if (!hitRate) {
          return this.setState({mobileHitRateSelected: true})
      }

      this.setState({
        selectedHitRate: hitRate,
        mobileHitRateSelected: !initialLoad,
        initialHitRateSelection: initialLoad
      })
    }

    listFilterOptionSelected(filter, value) {
        const tempState = this.state
        if (tempState.listFilters[tempState.pickerSelection][filter].filterType === "multiple") {
            const index = tempState.listFilters[tempState.pickerSelection][filter].selectedValues.indexOf(value)
            // Assumes the first entry in each filter represents the 'all' option
            const options = Array.isArray(tempState.listFilters[tempState.pickerSelection][filter].options)
            ? tempState.listFilters[tempState.pickerSelection][filter].options
            : Object.keys(tempState.listFilters[tempState.pickerSelection][filter].options)
            const allOption = options[0]
            if (index === -1) {
            // Value is being checked
            if (
                allOption === value ||
                (tempState.listFilters[tempState.pickerSelection][filter].selectedValues.length > 0 &&
                tempState.listFilters[tempState.pickerSelection][filter].selectedValues[0] !==
                    allOption &&
                tempState.listFilters[tempState.pickerSelection][filter].selectedValues.length + 2 ===
                    options.length)
            ) {
                tempState.listFilters[tempState.pickerSelection][filter].selectedValues = [allOption]
            } else {
                if (
                    tempState.listFilters[tempState.pickerSelection][filter].selectedValues.length > 0 &&
                    tempState.listFilters[tempState.pickerSelection][filter].selectedValues[0] === allOption
                    ) {
                    // If we are checking a box that is not the 'all' option, remove the 'all' option if it's there
                    tempState.listFilters[tempState.pickerSelection][filter].selectedValues.splice(0, 1)
                    }
                    tempState.listFilters[tempState.pickerSelection][filter].selectedValues.push(value)
                }
            } else {
                // Value is being un-checked
                tempState.listFilters[tempState.pickerSelection][filter].selectedValues.splice(index, 1)
            }
        } else if (tempState.listFilters[tempState.pickerSelection][filter].filterType === "single") {
            tempState.listFilters[tempState.pickerSelection][filter].selectedValue = value
        }
        this.setState(tempState)
    }

    // NOTE: if we turn on filters in the places where we didn't previously have filters with custom endpoint/url we may have to bring back some client-side filtering
    applyFilters() {
        window.scrollTo({top: 0, behavior: 'smooth'});
        if (this.state.pickerSelection === "sameGameParlay" || this.state.pickerSelection === "crossGameParlay") {
        this.setState((previousState) => {
            const tempState = previousState;
            // tempState.filteredCards[tempState.pickerSelection] = filterCards(this.context.league, tempState.cards[tempState.pickerSelection], tempState.listFilters[tempState.pickerSelection], tempState.pickerSelection.toLowerCase());
            return tempState;
        }, () => this.fetchBatch(this.state.pickerSelection, 0, true, false))
        } else {
        this.setState((previousState) => {
            const tempState = previousState;
            // tempState.filteredCards[tempState.pickerSelection] = filterCards(this.context.league, tempState.cards[tempState.pickerSelection], tempState.listFilters[tempState.pickerSelection], tempState.pickerSelection).toLowerCase();
            return tempState;
        }, () => this.fetchBatch(this.state.pickerSelection, 0, true, false))
        }
    }

    handleAlternateLinesFilterChange = () => {
        const newValue = this.state.listFilters[this.state.pickerSelection][LINE_TYPE_FILTER].selectedValue === "Alternate Lines" ? "Main Lines" : "Alternate Lines";

        this.setState({
        listFilters: {
            ...this.state.listFilters,
            [this.state.pickerSelection]: {
            ...this.state.listFilters[this.state.pickerSelection],
            [LINE_TYPE_FILTER]: {
                ...this.state.listFilters[this.state.pickerSelection][LINE_TYPE_FILTER],
                selectedValue: newValue
            },
            },
        }
        });
    }

    render() {
        const title = this.props.t('props.title')
        var subtitle = ''
        if (this.context.currentGames.length > 0) {
            switch(SUPPORTED_LEAGUES[this.context.league].scheduleFormat) {
                case SCHEDULE_FORMAT_DAILY:
                    const date = parseDateFromString(this.context.currentGames[0].timestamp)
                    subtitle = date.formattedDayMonthShort
                    break;
                case SCHEDULE_FORMAT_WEEKLY:
                    subtitle = this.context.currentGames[0]?.title || null
                    break;
                default:break;
            }
        }
        const annotation = null

        const haveHitRates = this.state.tabs[this.state.pickerSelection].hitRates.length > 0

        return (
            <div className={`trends-page-container${!haveHitRates ? ' trends-page-container--no-plays' : ''}`}>
                <div className={`props-page-wrapper${this.state.mobileHitRateSelected ? ' props-page-wrapper-mobile-detail-active' : ''}`}>
                <div className='trends-page-props-list-wrapper'>
                <ListComponent
                    title={title}
                    showGamesFilter={true}
                    fetchBatch={this.fetchBatch}
                    emptyStateMode='props'
                    setListFilters={(next) => this.setState({ listFilters: next })}
                    setPickerSelection={(selection) => {
                        this.setState({ pickerSelection: selection }, () => {
                            const selectedTab = this.state.tabs[selection]
                            if (
                                selectedTab &&
                                selectedTab.hitRates.length === 0 &&
                                !selectedTab.loadingBatch &&
                                !selectedTab.endReached
                            ) {
                                this.fetchBatch(selection, 0, true, false)
                            }
                        })
                    }}
                    pickerOptions={this.pickerOptions}
                    tabs={this.state.tabs}
                    pickerSelection={this.state.pickerSelection}
                    haveCards={haveHitRates}
                    listFilters={this.state.listFilters}
                    listRef={this.listRef}
                    listWrapperClassName={this.state.mobileHitRateSelected ? '' : 'trends-page-list-mobile-active'}
                    cardSelected={this.hitRateSelected}
                    renderList={(state) => (
                        <>
                            <div key={`${state.pickerSelection}-${state.tabs[state.pickerSelection].lastFetchTime}`} className='trends-page-list-items'>
                                {
                                    state.tabs[state.pickerSelection].hitRates.map((hitRate) => {
                                        const hitRateKey = getHitRateKey(hitRate);
                                        return (
                                            <div
                                                key={hitRateKey}
                                                className='props-entry'
                                                onClick={() => this.hitRateSelected(hitRate, false)}
                                            >
                                                <HitRateEntry
                                                    selected={this.state.selectedHitRate && hitRateKey === getHitRateKey(this.state.selectedHitRate)}
                                                    entry={hitRate}
                                                />
                                            </div>
                                        );
                                    })
                                }
                            </div>
                            {
                                !state.tabs[state.pickerSelection].endReached && (
                                    <div className='trends-page-list-items-loader'>
                                        <Loader />
                                    </div>
                                )
                            }
                        </>
                    )}
                />
                </div>
                <div className={`trends-page-details ${this.state.mobileHitRateSelected ? "trends-page-details-mobile-active" : ""}`}>
                {
                    this.state.selectedHitRate && (
                        // Here could alternatively create the trend instead of passing in customFeed
                        <TrendDetails 
                            key={getHitRateKey(this.state.selectedHitRate)}
                            trend={null} 
                            source={"props"} 
                            type={"straight"} 
                            without={null} 
                            customFeed={{...this.state.selectedHitRate, market: {name: this.state.selectedHitRate.marketId}}} 
                            crossGame={false}
                            onMobileClose={() => this.setState({ mobileHitRateSelected: false })}
                        />
                    )
                }
                </div>
                </div>
            </div>
        )
    }
}

export default withTranslation()(Props)
