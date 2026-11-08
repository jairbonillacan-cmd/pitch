import React, {useState, useEffect, useContext} from "react";
import "./ListComponent.scss";
import GlobalContext from "./GlobalContext";
import { buildQueryParams, filtersToQueryParamsDict, getBetTypeOptionsForAPI, getGamesFilterForAPI, getGameTitle, getLineTypeFilterForAPI, getMultipleBetTypeFilterForAPI, getMultipleOverUnderFilter, getMultipleTrendsFilter, getPlayerId, getStraightTrendTypeFilterForAPI, hasPremiumAccess, isDictEmpty, jsonOrDefault, noOpPromise, parseDateFromString } from '../linemate-react-common/src/util';
import { getTheme } from "../react-web-utils";
import { API_HOST } from '../react-web-constants';
import Button from "../components/Button";
import { getCardKey, getMarketNameFromId, isMarketSupported, supportedCrossGameParlayFilter, supportedSameGameParlayFilter, supportedTrendFilter } from '../linemate-react-common/src/betting-utils';
import SegmentedControl from "./SegmentedControl";
import Dialog from "../components/Dialog";
import Chip from "../components/Chip";
import ToggleSwitch from "./ToggleSwitch";
import _ from 'lodash';
import * as Checkbox from '@radix-ui/react-checkbox';
import { FILTER_LABELS, LINE_TYPE_OPTION_KEYS, FILTER_KEYS } from '../linemate-react-common/src/filter-config';
import { withTranslation } from 'react-i18next';

/**
 * Props
 * - title:string
 * - fetchBatch:fn
 * - customFeed:string
 * - profile:bool
 * - pickerOptions:dict
 * - tabs:dict
 * - pickerSelection:string
 * - setPickerSelection:fn
 * - haveCards:bool
 * - listFilters:dict
 * - listRef:ref
 * - cardSelected:fn
 * - renderList:fn
 */
class ListComponent extends React.Component {
  static contextType = GlobalContext

    constructor(props, context) {
        super(props, context);
        this.listContentRef = React.createRef();
        this.segmentedControlSelection = this.segmentedControlSelection.bind(this);
        this.startingIndex = Number(new URLSearchParams(window.location.search).get('index') || 0);

        this.state = {
            customFeed: this.props.customFeed,
            profile: this.props.profile,
            pickerOptions: this.props.pickerOptions,
            tabs: this.props.tabs,
            pickerSelection: this.props.pickerSelection,
            listFiltersModalOpen: false,
            listFilters: this.props.listFilters,
            cardSelected: this.props.cardSelected,
            selectedCard: ""
        }

        this.defaultListFilters = _.cloneDeep(this.props.listFilters)

    }

    static getDerivedStateFromProps(nextProps, prevState) {
        // When parent owns the list data (e.g. GameSummary), sync tabs from props so the list
        // updates when parent's fetchBatch completes. Skip when ListComponent fetches its own data (customFeed).
        const parentOwnsData = nextProps.profile || !nextProps.customFeed || !nextProps.customFeed?.endpoint;
        if (!parentOwnsData) return null;
        const updates = {};
        if (nextProps.tabs !== prevState.tabs) updates.tabs = nextProps.tabs;
        if (nextProps.hideHeader && nextProps.pickerSelection !== prevState.pickerSelection) updates.pickerSelection = nextProps.pickerSelection;
        // Sync listFilters from parent when dialog is closed so e.g. Display Games options stay current when games load
        if (nextProps.listFilters && nextProps.listFilters !== prevState.listFilters && !prevState.listFiltersModalOpen) {
            updates.listFilters = nextProps.listFilters;
        }
        return Object.keys(updates).length ? updates : null;
    }

    componentDidMount() {
        const userHasPremiumAccess = hasPremiumAccess(this.context.userAttributes);
        const apiFilters = {
            premium: userHasPremiumAccess,
            preferredProviders: this.context.resolvedPreferredProviders
        }
        const queryParams = buildQueryParams(apiFilters)
        if (this.props.profile) {
            return;
        }
        if (Array.isArray(this.state.customFeed?.cards)) {
            return;
        }
       if (this.state.customFeed?.endpoint) {
            fetch(`${API_HOST}/api/${this.context.league}/v1/${this.state.customFeed.endpoint}${this.state.customFeed.endpoint.includes('?') ? "&" : "?"}${queryParams}`)
            .then((res) => jsonOrDefault(res, []))
            .then((response) => {
                const state = {tabs: this.state.tabs}
                // Assume there's only one tab provided if we have an endpoint
                const tab = Object.keys(this.state.pickerOptions)[0]
                state.tabs[tab] = {
                    trends: response, 
                    offset: 0, 
                    loadingBatch: false,
                    initialLoadInProgress: false,
                    endReached: true
                }
                var presetIndex = this.startingIndex || 0;
                if (presetIndex >= state.tabs[tab].trends.length) {
                    presetIndex = 0;
                }
                state.selectedCard = state.tabs[tab].trends.length > presetIndex ? state.tabs[tab].trends[presetIndex] : null
                this.setState(state, () => this.props.cardSelected(state.selectedCard, true, []))
            })
            .catch((err) => {
                console.log(err);
                const state = {tabs: this.state.tabs}
                // Assume there's only one tab provided if we have an endpoint
                state.tabs[Object.keys(this.state.pickerOptions)[0]] = {
                    trends: [], 
                    offset: 0, 
                    loadingBatch: false,
                    initialLoadInProgress: false,
                    endReached: true
                }
                this.setState(state)
            })
        } else {
            Object.keys(this.state.pickerOptions).forEach((tab, index) => this.props.fetchBatch(tab, 0, true, tab === this.state.pickerSelection))
            const scrollRoot = this.listContentRef.current || null;
            this.listInteresectionObserver = new IntersectionObserver(
                (entries) => {
                    if (entries[0].isIntersecting && !this.state.tabs[this.state.pickerSelection].loadingBatch && !this.state.tabs[this.state.pickerSelection].initialLoadInProgress && !this.state.tabs[this.state.pickerSelection].endReached) {
                        const tabs = this.state.tabs
                        tabs[this.state.pickerSelection].loadingBatch = true
                        this.setState({tabs: tabs}, () => this.props.fetchBatch(this.state.pickerSelection, tabs[this.state.pickerSelection].offset, false, false))
                    }
                },
                {
                    threshold: 0,
                    rootMargin: '0px 0px 200px 0px', // Load a bit earlier
                    root: scrollRoot // use list scroll container so fetch only when list reaches bottom, not main content
                }
            )
            // Alternatively here we could make it so it observes an element in the list that is X positions before the last one (accounting for smaller lists too)
            //  to load data before getting to the end
            this.observeLoader()
        }
    }

    componentDidUpdate(prevProps, prevState) {
        // List container key includes pickerSelection + lastFetchTime, so the loader is a new DOM node when
        // we switch tabs, after a fetch, or after applying filters. Re-attach the observer so "load more" keeps firing.
        const parentOwnsData = this.props.profile || !this.props.customFeed || !this.props.customFeed?.endpoint
        if (!parentOwnsData || !this.listInteresectionObserver) return
        const tabDataChanged = prevState.tabs !== this.state.tabs
        const tabSelectionChanged = prevState.pickerSelection !== this.state.pickerSelection
        const listFiltersChanged = this.props.listFilters && prevProps.listFilters !== this.props.listFilters
        if (tabDataChanged || tabSelectionChanged || listFiltersChanged) {
            // Defer when tab data changed so the new list/loader is in the DOM (e.g. after filter apply or fetch).
            if (tabDataChanged) {
                setTimeout(() => this.observeLoader(), 0)
            } else {
                this.observeLoader()
            }
        }
    }

    observeLoader() {
        if (!this.listInteresectionObserver) return
        this.listInteresectionObserver.disconnect()
        const loaderEl = document.getElementsByClassName("trends-page-list-items-loader")[0]
        if (loaderEl) this.listInteresectionObserver.observe(loaderEl)
    }

    componentWillUnmount() {
        /*if (this.listInteresectionObserver) {
            this.listInteresectionObserver.disconnect();
        }*/
    }

    // NOTE: if we turn on filters in the places where we didn't previously have filters with custom endpoint/url we may have to bring back some client-side filtering
    applyFilters() {
        window.scrollTo({top: 0, behavior: 'smooth'});
        const filtersToApply = this.state.listFilters
        const tab = this.state.pickerSelection
        this.props.setListFilters && this.props.setListFilters(filtersToApply)
        this.props.fetchBatch(tab, 0, true, false, filtersToApply)
    }

    segmentedControlSelection(selection) {
        window.scrollTo({top: 0, behavior: 'smooth'});
        this.props.setPickerSelection && this.props.setPickerSelection(selection);
        this.setState({
            pickerSelection: selection
        })
    }

    getFilterDisplayName(filterKey) {
        if (filterKey === FILTER_KEYS.TRENDS) {
            return this.props.t('trends.filters.trends')
        }

        return this.props.t(`common.filters.titles.${filterKey}`, FILTER_LABELS[filterKey] || filterKey)
    }

    getFilterOptionLabel(filterKey, optionKey) {
        const filterConfig = this.state.listFilters[this.state.pickerSelection][filterKey]

        if (filterKey === FILTER_KEYS.BET_TYPE) {
            if (optionKey === 'all') {
                return this.props.t('common.filters.options.betType.all')
            }

            return this.props.t(`betTypes.${optionKey}`, {
                defaultValue: filterConfig?.options?.[optionKey] || optionKey
            })
        }

        if (filterKey === FILTER_KEYS.TRENDS && optionKey === 'allTrends') {
            return this.props.t('trends.filters.allTrends')
        }

        const optionNamespaceByFilter = {
            [FILTER_KEYS.GAMES]: 'game',
            [FILTER_KEYS.LINE_TYPE]: 'lineType',
            [FILTER_KEYS.OVER_UNDER]: 'outcome',
            [FILTER_KEYS.MIN_ODDS]: 'minOdds',
            [FILTER_KEYS.TIMEFRAME]: 'timeframe',
            [FILTER_KEYS.TRENDS]: 'signals',
            [FILTER_KEYS.SIGNALS]: 'signals',
            [FILTER_KEYS.TREND_TYPE]: 'trendType',
        }
        const optionNamespace = optionNamespaceByFilter[filterKey]
        
        const localizedOption = optionNamespace
            ? this.props.t(`common.filters.options.${optionNamespace}.${optionKey}`, { defaultValue: '' })
            : ''

        if (localizedOption) return localizedOption
        if (!filterConfig) return optionKey
        if (filterConfig.optionLabels && optionKey in filterConfig.optionLabels) return filterConfig.optionLabels[optionKey]
        if (!Array.isArray(filterConfig.options) && optionKey in filterConfig.options) return filterConfig.options[optionKey]

        return optionKey
    }

    getPickerOptionLabel(optionKey) {
        const tabKeyByOption = {
            player: 'player',
            team: 'team',
            parlay: 'parlay',
            crossGameParlay: 'parlay',
            sameGameParlay: 'sgp',
        }

        const tabKey = tabKeyByOption[optionKey]
        return tabKey
            ? this.props.t(`trends.tabs.${tabKey}`, this.state.pickerOptions[optionKey])
            : this.state.pickerOptions[optionKey]
    }

    isAlternateLinesSelected() {
        const lineTypeFilter = this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.LINE_TYPE]
        return lineTypeFilter?.selectedValue === LINE_TYPE_OPTION_KEYS.ALTERNATE
    }

    handleAlternateLinesFilterChange = () => {
        const currentValue = this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.LINE_TYPE].selectedValue
        const newValue =
            currentValue === LINE_TYPE_OPTION_KEYS.ALTERNATE
                ? LINE_TYPE_OPTION_KEYS.MAIN
                : LINE_TYPE_OPTION_KEYS.ALTERNATE

        const nextListFilters = {
            ...this.state.listFilters,
            [this.state.pickerSelection]: {
                ...this.state.listFilters[this.state.pickerSelection],
                [FILTER_KEYS.LINE_TYPE]: {
                    ...this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.LINE_TYPE],
                    selectedValue: newValue
                },
            },
        }

        this.setState({ listFilters: nextListFilters })
    }

    listFilterOptionSelected(filter, value) {
        const tempState = this.state
        const listFilter = tempState.listFilters[tempState.pickerSelection][filter]
        if (listFilter.filterType === 'single') {
            tempState.listFilters[tempState.pickerSelection][filter].selectedValue = value
            this.setState(tempState)
            return
        }
        const index = listFilter.selectedValues.indexOf(value)
        // Assumes the first entry in each filter represents the 'all' option
        const options = Array.isArray(listFilter.options) ? listFilter.options : Object.keys(listFilter.options)
        const allOption = options[0]
        if (index === -1) {
        // Value is being checked
        if (
            allOption === value ||
            (listFilter.selectedValues.length > 0 &&
            listFilter.selectedValues[0] !== allOption &&
            listFilter.selectedValues.length + 2 === options.length)
        ) {
            tempState.listFilters[tempState.pickerSelection][filter].selectedValues = [allOption]
        } else {
            if (listFilter.selectedValues.length > 0 && listFilter.selectedValues[0] === allOption) {
            tempState.listFilters[tempState.pickerSelection][filter].selectedValues.splice(0, 1)
            }
            tempState.listFilters[tempState.pickerSelection][filter].selectedValues.push(value)
        }
        } else {
        tempState.listFilters[tempState.pickerSelection][filter].selectedValues.splice(index, 1)
        }
        this.setState(tempState)
    }

    hasScheduledGames() {
        return (
            (this.context?.currentGames?.length || 0) > 0 ||
            (this.context?.upcomingGames?.length || 0) > 0
        )
    }

    getEmptyStateConfig() {
        const theme = getTheme()
        const t = this.props.t

        if (this.props.emptyStateMode === 'props') {
            return {
                imageSrc: `assets/empty-state/props-empty-${theme}.png`,
                title: t('trends.list.empty.noPropsAvailable'),
                subtitle: t('common.empty.checkBackLater'),
            }
        }

        if (this.state.pickerSelection === 'sameGameParlay') {
            return {
                imageSrc: `assets/empty-state/trends-empty-parlay-${theme}.png`,
                title: t('trends.list.empty.noTrendsAvailableYet'),
                subtitle: t('common.empty.checkBackLater'),
            }
        }

        if (this.state.pickerSelection === 'crossGameParlay') {
            return {
                imageSrc: `assets/empty-state/trends-empty-parlay-${theme}.png`,
                title: t('trends.list.empty.noTrendsAvailableYet'),
                subtitle: t('trends.list.empty.needsThreeGamesMinimum'),
            }
        }

        return {
            imageSrc: `assets/empty-state/trends-empty-straight-${theme}.png`,
            title: t('trends.list.empty.noTrendsAvailableYet'),
            subtitle: this.hasScheduledGames()
                ? t('trends.list.empty.pendingOddsCheckBack')
                : t('common.empty.checkBackLater'),
        }
    }

    render() {
        const listContentRefCallback = (el) => {
            this.listContentRef.current = el;
            if (this.props.listScrollContainerRef) this.props.listScrollContainerRef.current = el;
        };
        const currentTab = this.state.tabs?.[this.state.pickerSelection]
        const showEmptyState = !this.props.haveCards && !currentTab?.initialLoadInProgress && !currentTab?.loadingBatch && currentTab?.endReached === true

        const emptyStateConfig = this.getEmptyStateConfig()

        if (this.props.hideHeader) {
            return (
                <div className="trends-page-list list-component-wrapper" ref={this.props.listRef}>
                    <div
                        className={`list-component-list-content${showEmptyState ? ' list-component-list-content--empty' : ''}`}
                        ref={listContentRefCallback}
                    >
                        {showEmptyState ? (
                            <div className="list-component-empty-state">
                                <img
                                    className="list-component-empty-state-image"
                                    src={emptyStateConfig.imageSrc}
                                    alt={emptyStateConfig.title}
                                />
                                <div className="list-component-empty-state-copy">
                                    <p className="text-style-body-semibold color-fig-default">
                                        {emptyStateConfig.title}
                                    </p>
                                    <p className="text-style-label-normal color-fig-subtle">
                                        {emptyStateConfig.subtitle}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            this.props.renderList(this.state)
                        )}
                    </div>
                </div>
            );
        }

        const showPicker = Object.keys(this.state.pickerOptions).length > 1
        const filtersEnabled =
              Object.keys(this.state.listFilters)
                .map((x) => this.state.listFilters[x])
                .some((x) => !isDictEmpty(x)) &&
              this.state.pickerSelection !== 'parlay'
        const filtersButtonDisabled = this.props.profile || !filtersEnabled
        return (
            <div>
                <div className={`trends-page-list list-component-wrapper ${this.props.listWrapperClassName || ''}`} ref={this.props.listRef}>
                    <div className="list-component-header">
                    <div className="trends-page-list-title list-component-title">
                        {typeof this.props.title === 'string' ? (
                            <>
                                {this.props.onBackClick && (
                                    <img
                                        src="assets/arrow-back.svg"
                                        onClick={this.props.onBackClick}
                                        alt="back"
                                        className="list-component-back"
                                        role="button"
                                    />
                                )}
                                <div className="list-component-title-block">
                                <p className="text-style-h-4-semibold color-fig-default">{this.props.title}</p>
                                {this.props.subtitle && <p className="text-style-h-4-medium color-fig-subtle">{this.props.subtitle}</p>}
                                </div>
                                {this.props.annotation && <p className="text-style-label-normal">{this.props.annotation}</p>}
                            </>
                        ) : (
                            this.props.title
                        )}
                        <div className={`list-component-filters-button-wrapper${filtersButtonDisabled ? ' list-component-filters-button-wrapper--disabled' : ''}`}>
                            <img
                                src="assets/filters.svg"
                                alt="Filters"
                                onClick={filtersButtonDisabled ? undefined : () => this.setState({listFiltersModalOpen: true})}
                                role="button"
                                aria-disabled={filtersButtonDisabled}
                            />
                        </div>
                    </div>
                    <div className="trends-filter">
                        {showPicker && (
                            <div className="trends-page-list-filters">
                                <div className="trends-page-list-filters-picker-wrapper">
                                    <SegmentedControl
                                        fillWidth={true}
                                        options={Object.fromEntries(Object.keys(this.state.pickerOptions).map((option) => [option, this.getPickerOptionLabel(option)]))}
                                        selection={this.state.pickerSelection}
                                        selectionHandler={this.segmentedControlSelection}
                                    />
                                </div>
                            </div>
                        )}
                            <Dialog
                                open={this.state.listFiltersModalOpen}
                                // TODO: on close reset filters (except for apply)
                                onOpenChange={(open) => this.setState({listFiltersModalOpen: open})}
                                title={this.props.t('trends.filters.title')}
                                content={
                                    <div className='trends-page-list-filters-dialog-content'>
                                        {
                                            FILTER_KEYS.LINE_TYPE in this.state.listFilters[this.state.pickerSelection] && !this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.LINE_TYPE].hidden && (
                                                <div style={{
                                                    display: 'flex',
                                                    flexDirection: 'row',
                                                    gap: '8px',
                                                    alignItems: 'center',
                                                    marginBottom: '24px',
                                                }}>
                                                    <p className='text-style-label-medium color-fig-default'>{this.props.t('trends.filters.alternateLines')}</p>
                                                    <ToggleSwitch
                                                        id="lines"
                                                        checked={this.isAlternateLinesSelected()}
                                                        small
                                                        onChange={this.handleAlternateLinesFilterChange}
                                                    />
                                                </div>
                                            )
                                        }
                                        {
                                            this.props.showGamesFilter &&
                                            (
                                                (this.context?.currentGames && this.context.currentGames.length > 0) ||
                                                (this.context?.upcomingGames && this.context.upcomingGames.length > 0)
                                            ) &&
                                            FILTER_KEYS.GAMES in this.state.listFilters[this.state.pickerSelection] &&
                                            !this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.GAMES].hidden && (
                                                <>
                                                    <p className='text-style-label-medium'>{this.props.t('trends.filters.displayGames')}</p>
                                                    <div className='trends-page-list-filters-dialog-content-checkbox-list-wrapper'>
                                                    {
                                                        Object.keys(this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.GAMES].options).map((option) => {
                                                            const checked = this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.GAMES].selectedValues.includes(option);
                                                            return (
                                                                <Checkbox.Root key={option} className='trends-page-list-filters-dialog-content-checkbox-list-item' checked={checked} onCheckedChange={(checked) => this.listFilterOptionSelected(FILTER_KEYS.GAMES, option)}>
                                                                    <div
                                                                        className={`trends-page-list-filters-dialog-content-checkbox-list-item-checkbox-indicator${
                                                                            checked
                                                                            ? " trends-page-list-filters-dialog-content-checkbox-list-item-checkbox-indicator-checked"
                                                                            : ""
                                                                        }`}
                                                                        >
                                                                        {checked && (<img src='assets/checked.svg' alt="check"/>)}
                                                                    </div>
                                                                    <p className={`text-style-label-normal trends-page-list-filters-dialog-content-checkbox-list-item-text${checked ? "-selected" : ""}`}>
                                                                        {this.getFilterOptionLabel(FILTER_KEYS.GAMES, option)}
                                                                    </p>
                                                                </Checkbox.Root>
                                                            )
                                                        })
                                                    }
                                                    </div>
                                                </>
                                            )
                                        }
                                        {
                                            FILTER_KEYS.OVER_UNDER in this.state.listFilters[this.state.pickerSelection] && !this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.OVER_UNDER].hidden && this.state.pickerSelection !== "crossGameParlay" && this.state.pickerSelection !== "sameGameParlay" && (
                                                <>
                                                    <p className='text-style-label-medium'>{this.props.t('common.filters.titles.outcome')}</p>
                                                    <div className='trends-page-list-filters-dialog-content-chip-wrapper'>
                                                        {
                                                            Object.keys(this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.OVER_UNDER].options).map((option) => {
                                                                const f = this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.OVER_UNDER];
                                                                const selected = f.filterType === 'single' ? f.selectedValue === option : (f.selectedValues && f.selectedValues.includes(option));
                                                                return (
                                                                    <Chip
                                                                        key={option}
                                                                        text={this.getFilterOptionLabel(FILTER_KEYS.OVER_UNDER, option)}
                                                                        size="sm"
                                                                        selected={selected}
                                                                        onClick={() => this.listFilterOptionSelected(FILTER_KEYS.OVER_UNDER, option)}
                                                                    />
                                                                );
                                                            })
                                                        }
                                                    </div>
                                                </>
                                            )
                                        }
                                        {
                                            FILTER_KEYS.MIN_ODDS in this.state.listFilters[this.state.pickerSelection] && !this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.MIN_ODDS].hidden && (
                                                <>
                                                    <p className='text-style-label-medium'>{this.props.t('common.filters.titles.minOdds')}</p>
                                                    <div className='trends-page-list-filters-dialog-content-chip-wrapper'>
                                                        {
                                                            Object.keys(this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.MIN_ODDS].options).map((option) =>
                                                                <Chip
                                                                    key={option}
                                                                    text={this.getFilterOptionLabel(FILTER_KEYS.MIN_ODDS, option)}
                                                                    size="sm"
                                                                    selected={this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.MIN_ODDS].selectedValue === option}
                                                                    onClick={() => this.listFilterOptionSelected(FILTER_KEYS.MIN_ODDS, option)}
                                                                />
                                                            )
                                                        }
                                                    </div>
                                                </>
                                            )
                                        }
                                        {
                                            FILTER_KEYS.BET_TYPE in this.state.listFilters[this.state.pickerSelection] && !this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.BET_TYPE].hidden && this.state.pickerSelection !== "crossGameParlay" && this.state.pickerSelection !== "sameGameParlay" && (
                                                <>
                                                    <p className='text-style-label-medium'>{this.props.t('common.filters.plurals.betType')}</p>
                                                    <div className='trends-page-list-filters-dialog-content-chip-wrapper'>
                                                                {
                                                                    Object.keys(this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.BET_TYPE].options).map((option) => 
                                                                        <Chip
                                                                            key={option}
                                                                            text={this.getFilterOptionLabel(FILTER_KEYS.BET_TYPE, option)}
                                                                            size="sm"
                                                                            selected={this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.BET_TYPE].selectedValues.includes(option)}
                                                                            onClick={() => this.listFilterOptionSelected(FILTER_KEYS.BET_TYPE, option)}
                                                                        />
                                                                    )
                                                                }
                                                    </div>
                                                </>
                                            )
                                        }
                                        {
                                            (() => {
                                                const availableFilterKey =
                                                    FILTER_KEYS.SIGNALS in this.state.listFilters[this.state.pickerSelection]
                                                        ? FILTER_KEYS.SIGNALS
                                                        : (FILTER_KEYS.TRENDS in this.state.listFilters[this.state.pickerSelection]
                                                            ? FILTER_KEYS.TRENDS
                                                            : null)

                                                if (
                                                    !availableFilterKey ||
                                                    this.state.listFilters[this.state.pickerSelection][availableFilterKey].hidden
                                                ) {
                                                    return null
                                                }

                                                const filterConfig = this.state.listFilters[this.state.pickerSelection][availableFilterKey]

                                                return (
                                                    <>
                                                        <p className='text-style-label-medium'>{this.getFilterDisplayName(availableFilterKey)}</p>
                                                        <div className='trends-page-list-filters-dialog-content-chip-wrapper'>
                                                            {
                                                                Object.keys(filterConfig.options).map((option) => {
                                                                    const selected = filterConfig.filterType === 'single'
                                                                        ? filterConfig.selectedValue === option
                                                                        : (filterConfig.selectedValues && filterConfig.selectedValues.includes(option))

                                                                    return (
                                                                        <Chip
                                                                            key={option}
                                                                            text={this.getFilterOptionLabel(availableFilterKey, option)}
                                                                            size="sm"
                                                                            selected={selected}
                                                                            onClick={() => this.listFilterOptionSelected(availableFilterKey, option)}
                                                                        />
                                                                    )
                                                                })
                                                            }
                                                        </div>
                                                    </>
                                                )
                                            })()
                                        }
                                        {
                                            FILTER_KEYS.TIMEFRAME in this.state.listFilters[this.state.pickerSelection] && !this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.TIMEFRAME].hidden && (
                                                <>
                                                    <p className='text-style-label-medium'>{this.props.t('common.filters.titles.timeframe')}</p>
                                                    <div className='trends-page-list-filters-dialog-content-chip-wrapper'>
                                                        {
                                                            Object.keys(this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.TIMEFRAME].options).map((option) =>
                                                                <Chip
                                                                    key={option}
                                                                    text={this.getFilterOptionLabel(FILTER_KEYS.TIMEFRAME, option)}
                                                                    size="sm"
                                                                    selected={this.state.listFilters[this.state.pickerSelection][FILTER_KEYS.TIMEFRAME].selectedValue === option}
                                                                    onClick={() => this.listFilterOptionSelected(FILTER_KEYS.TIMEFRAME, option)}
                                                                />
                                                            )
                                                        }
                                                    </div>
                                                </>
                                            )
                                        }
                                    </div>
                                }
                                footer={
                                    <div className='trends-page-list-filters-dialog-footer'>
                                        <div>
                                            {/* Only enabled if all filters have at least 1 selected value */}
                                            <Button 
                                                text={this.props.t('common.actions.apply')}
                                                typography="md" 
                                                type="primary" 
                                                enabled={Object.keys(
                                                    this.state.listFilters[this.state.pickerSelection]).map((filter) => {
                                                        const listFilter = this.state.listFilters[this.state.pickerSelection][filter];
                                                        return listFilter.filterType === "multiple" ? listFilter.selectedValues.length : listFilter.selectedValue !== "" ? 1 : 0;
                                                    }).every((length) => length > 0)}
                                                onClick={() => { this.applyFilters(); this.setState({listFiltersModalOpen: false}); }}
                                            />
                                        </div>
                                    </div>
                                }
                            />
                    </div>
                    </div>
                    <div
                        className={`list-component-list-content${showEmptyState ? ' list-component-list-content--empty' : ''}`}
                        ref={listContentRefCallback}
                    >
                        {showEmptyState ? (
                            <div className="list-component-empty-state">
                                <img
                                    className="list-component-empty-state-image"
                                    src={emptyStateConfig.imageSrc}
                                    alt={emptyStateConfig.title}
                                />
                                <div className="list-component-empty-state-copy">
                                    <p className="text-style-body-semibold color-fig-default">
                                        {emptyStateConfig.title}
                                    </p>
                                    <p className="text-style-label-normal color-fig-subtle">
                                        {emptyStateConfig.subtitle}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            this.props.renderList(this.state)
                        )}
                    </div>
                </div>
            </div>
        )
    }
}

export default withTranslation()(ListComponent);