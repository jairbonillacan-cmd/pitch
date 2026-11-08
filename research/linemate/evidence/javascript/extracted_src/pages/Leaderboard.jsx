import React, { useState, useEffect, useRef, useContext, useCallback, useMemo } from 'react';
import GlobalContext from '../components/GlobalContext';
import Footer from '../components/Footer';
import HomeSidebar from '../components/HomeSidebar';
import SegmentedControl from '../components/SegmentedControl';
import TabToggle from '../components/TabToggle';
import InputSelection from '../components/InputSelection';
import Dialog from '../components/Dialog';
import Table from '../components/Table';
import { getTeamLogoPath, teamLogoPathOnErrorFallback } from '../react-web-utils';
import './Leaderboard.scss';
import { buildQueryParams, jsonOrDefault } from '../linemate-react-common/src/util';
import { LEADERBOARD_TEAM_COLUMNS, LEADERBOARD_PLAYER_COLUMNS } from '../linemate-react-common/src/constants';
import { API_HOST } from '../react-web-constants';
import { useTranslation } from 'react-i18next';

function Leaderboard() {
    const { t } = useTranslation();
    const context = useContext(GlobalContext);
    const tableWrapperRef = useRef(null);

    const [viewMode, setViewMode] = useState('cumulative'); // 'cumulative' or 'average'
    const [tabSelection, setTabSelection] = useState('team'); // 'team' or 'player'
    const [filterValues, setFilterValues] = useState({}); // Dynamic filter values
    const [typeFilter, setTypeFilter] = useState('offensive'); // Type filter for team tab: 'offensive' or 'defensive'
    const [legendDialogOpen, setLegendDialogOpen] = useState(false);
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [sortColumn, setSortColumn] = useState(null); // Column name to sort by
    const [sortDirection, setSortDirection] = useState('desc'); // 'asc' or 'desc'
    const initializedSortKeyRef = useRef(null);
    const [filterValuesForTab, setFilterValuesForTab] = useState('team'); // Which tab the current filterValues were initialized for
    const [showLeftGradient, setShowLeftGradient] = useState(false);
    const [showRightGradient, setShowRightGradient] = useState(false);
    const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth: 1280)

    const getStatHeaderLabel = (header) =>
        t(`common.statHeaders.${header}`, { defaultValue: header });

    const getColumnLabel = (columnName) => {
        if (columnName === 'RANK') return t('stats.table.rank');
        if (columnName === 'NAME') return t('stats.table.name');
        return getStatHeaderLabel(columnName);
    };

    const getFilterLabel = (filterKey) => {
        return (
            t(`stats.filters.titles.${filterKey}`, { defaultValue: '' }) ||
            t(`common.filters.titles.${filterKey}`, { defaultValue: '' }) ||
            filterKey.charAt(0).toUpperCase() + filterKey.slice(1)
        );
    };

    const getFiltersFromConfig = () => {
        const league = context.league;
        if (!league || !context.configuration) {
            return {};
        }
        
        const leaderboardConfig = context.configuration.leaderboard?.[league];
        if (!leaderboardConfig || !leaderboardConfig.filterGroups) {
            return {};
        }
        
        const filterGroups = leaderboardConfig.filterGroups;
        const currentFilters = tabSelection === 'team' 
            ? (filterGroups.team || {})
            : (filterGroups.player || {});

        // Return all filters dynamically - each filter has options and filterType
        return currentFilters;
    };

    const getColumns = (tab, league, filters) => {
        if (tab === "team") {
            return getTeamColumns(league, filters);
        } else {
            return getPlayerColumns(league, filters);
        }
    }

    const getTeamColumns = (league, filters) => {
        const qualifier = filters.qualifier.options[filters.qualifier.selectedValue];
        const type = filters.type.options[filters.type.selectedValue];
        return LEADERBOARD_TEAM_COLUMNS[league]?.({ qualifier, type }) || {};
    }

    // NOTE: if any of the names here change they will have to be updated in the discovery leaders configuration to make sure the sorting column functionality works
    const getPlayerColumns = (league, filters) => {
        const qualifier = filters.qualifier.options[filters.qualifier.selectedValue];
        const position = 'position' in filters ? filters.position.selectedValue : "";
        switch (league) {
            case "nfl":
            case "ncaaf":
            const passingStats = {
                "GP": "gamesPlayed",
                "PASS RTG": `${qualifier}.rating`,
                "PASS COMP": `${qualifier}.passingCompletions`,
                "PASS ATT": `${qualifier}.passingAttempts`,
                "PASS YDS": `${qualifier}.passingYards`,
                "PASS TD": `${qualifier}.passingTouchdowns`,
                "INT": `${qualifier}.interceptions`,
                "PASS YDS/ATT": `${qualifier}.yardsPerAttempt`,
                "300+ YDS": `${qualifier}.threeHundredYardsPassing`,
                "PASS RZ ATT": `${qualifier}.redzonePassingAttempts`,
                "PASS RZ COMPL": `${qualifier}.redzoneCompletions`,
                "PASS RZ TD": `${qualifier}.redzonePassingTouchdowns`
            }
            const rushingStats = {
                "GP": "gamesPlayed",
                "RUSH ATT": `${qualifier}.rushingAttempts`,
                "RUSH YDS": `${qualifier}.rushingYards`,
                "RUSH TD": `${qualifier}.rushingTouchdowns`,
                "RUSH YDS/ATT": `${qualifier}.rushingYardsPerAttempt`,
                "RUSH LONG": `${qualifier}.longestRun`,
                "RUSH 100+ YDS": `${qualifier}.hundredYardsRushing`,
                "RUSH RZ ATT": `${qualifier}.redzoneRushingAttempts`,
                "RUSH RZ TD": `${qualifier}.redzoneRushingTouchdowns`,
                "FUML": `${qualifier}.fumblesLost`
            }
            const receivingStats = {
                "GP": "gamesPlayed",
                "REC TGT": `${qualifier}.targets`,
                "REC": `${qualifier}.receptions`,
                "REC YDS": `${qualifier}.receivingYards`,
                "REC TD": `${qualifier}.receivingTouchdowns`,
                "REC YDS/REC": `${qualifier}.receivingYardsPerReception`,
                "REC 100+ YDS": `${qualifier}.hundredYardsReceiving`,
                "REC RZ TGT": `${qualifier}.redzoneTargets`,
                "REC RZ REC": `${qualifier}.redzoneReceptions`,
                "REC RZ TD": `${qualifier}.redzoneReceivingTouchdowns`,
                "FUML": `${qualifier}.fumblesLost`
            }
            const kickingStats = {
                "GP": "gamesPlayed",
                "PTS": `${qualifier}.pointsKicked`,
                "FGA": `${qualifier}.fieldGoalAttempts`,
                "FGM": `${qualifier}.fieldGoalsMade`,
                "FG%": `${qualifier}.fieldGoalPercentage`,
                "XPA": `${qualifier}.extraPointAttempts`,
                "XPM": `${qualifier}.extraPointsMade`,
                "XP%": `${qualifier}.extraPointPercentage`,
                "FG (0-19)": `${qualifier}.extraShortRangeFieldGoals`,
                "FG (20-29)": `${qualifier}.shortRangeFieldGoals`,
                "FG (30-39)": `${qualifier}.mediumRangeFieldGoals`,
                "FG (40-49)": `${qualifier}.longRangeFieldGoals`,
                "FG (50+)": `${qualifier}.extraLongRangeFieldGoals`
            }
            switch (position) {
                case "QB":
                return Object.assign({}, passingStats, rushingStats);
                case "RB":
                return Object.assign({}, rushingStats, receivingStats);
                case "WR":
                case "TE":
                return Object.assign({}, receivingStats, rushingStats);
                case "K":
                return kickingStats;
                default:
                console.log("Unsupported position " + position);
                return {};
            }
            case "nhl":
            if (position === "G") {
                return {
                "GP": "gamesPlayed",
                "WINS": `${qualifier}.wins`,
                "SA": `${qualifier}.shotsAgainst`,
                "SAVES": `${qualifier}.shotsSaved`,
                "SV%": `${qualifier}.savePercentage`,
                "GA": `${qualifier}.goalsAllowed`,
                "SHUTOUTS": `${qualifier}.shutouts`
                }
            } else {
                return {
                "GP": "gamesPlayed",
                "PTS": `${qualifier}.points`,
                "G": `${qualifier}.goals`,
                "A": `${qualifier}.assists`,
                "SOG": `${qualifier}.shotsOnGoal`,
                "SAT": `${qualifier}.shotAttempts`,
                "TOI": `${qualifier}.timeOnIce`,
                "+/-": `${qualifier}.plusMinus`,
                "PPP": `${qualifier}.powerplayPoints`,
                "SHP": `${qualifier}.shorthandedPoints`,
                "PIM": `${qualifier}.penaltyMinutes`,
                "BLK": `${qualifier}.defensiveBlocks`
                }
            }
            case "nba":
            case "wnba":
            case "ncaab":
            return {
                "GP": "gamesPlayed",
                "PTS": `${qualifier}.points`,
                "FTM": `${qualifier}.freeThrowsMade`,
                "FTA": `${qualifier}.freeThrowAttempts`,
                "FT%": `${qualifier}.freeThrowPercentage`,
                "FGM": `${qualifier}.fieldGoalsMade`,
                "FGA": `${qualifier}.fieldGoalAttempts`,
                "FG%": `${qualifier}.fieldGoalPercentage`,
                "3PTM": `${qualifier}.threePointsMade`,
                "3PTA": `${qualifier}.threePointAttempts`,
                "3PT%": `${qualifier}.threePointPercentage`,
                "TS%": `${qualifier}.trueShootingPercentage`,
                "EFG%": `${qualifier}.effectiveFieldGoalPercentage`,
                "REB": `${qualifier}.rebounds`,
                "AST": `${qualifier}.assists`,
                "STL": `${qualifier}.steals`,
                "TO": `${qualifier}.turnovers`,
                "BLK": `${qualifier}.blocks`,
                "MIN": `${qualifier}.minutesPlayed`,
                "USAGE %": `${qualifier}.usagePercentage`
            }
            case "mlb":
            if (position.toUpperCase() === "PITCHERS") {
                return {
                "GP": "gamesPlayed",
                "W": `${qualifier}.pitching.wins`,
                "L": `${qualifier}.pitching.losses`,
                "ERA": `${qualifier}.pitching.earnedRunsAverage`,
                "SV": `${qualifier}.pitching.saves`,
                "H": `${qualifier}.pitching.hits`,
                "R": `${qualifier}.pitching.runs`,
                "HR": `${qualifier}.pitching.homeRuns`,
                "1B": `${qualifier}.pitching.singles`,
                "2B": `${qualifier}.pitching.doubles`,
                "3B": `${qualifier}.pitching.triples`,
                "ER": `${qualifier}.pitching.earnedRuns`,
                "BB": `${qualifier}.pitching.walks`,
                "SO": `${qualifier}.pitching.strikeouts`,
                "WHIP": `${qualifier}.pitching.walksAndHitsPerInningPitched`,
                "AVG": `${qualifier}.pitching.battingAverageAgainst`
                }
            } else {
                return {
                "GP": "gamesPlayed",
                "AB": `${qualifier}.hitting.atBats`,
                "R": `${qualifier}.hitting.runs`,
                "H": `${qualifier}.hitting.hits`,
                "1B": `${qualifier}.hitting.singles`,
                "2B": `${qualifier}.hitting.doubles`,
                "3B": `${qualifier}.hitting.triples`,
                "HR": `${qualifier}.hitting.homeRuns`,
                "ISO": `${qualifier}.hitting.isolatedPower`,
                "RBI": `${qualifier}.hitting.runsBattedIn`,
                "TB": `${qualifier}.hitting.totalBases`,
                "BB": `${qualifier}.hitting.walks`,
                "SO": `${qualifier}.hitting.strikeouts`,
                "AVG": `${qualifier}.hitting.battingAverage`,
                "OBP": `${qualifier}.hitting.onBasePercentage`,
                "SLG": `${qualifier}.hitting.sluggingPercentage`,
                "OPS": `${qualifier}.hitting.onBasePlusSluggingPercentage`
                }
            }
            case "bundesliga":
            case "epl":
            case "laliga":
            case "ligue1":
            case "seriea":
            case "brazil-serie-a":
            case "mls":
            case "euro":
            case "ucl":
            case "uel":
            case "fifa-world-cup":
            if (position.toLowerCase() === "goalkeeper") {
                return {
                "GP": "gamesPlayed",
                "GA": `${qualifier}.goalsConceded`,
                "SAV": `${qualifier}.shotsFacedSaved`,
                "SA": `${qualifier}.shotsFacedTotal`,
                "PS": `${qualifier}.penaltiesSaved`,
                "DSAV": `${qualifier}.divingSaves`,
                "CS": `${qualifier}.cleanSheet`,
                "YEL": `${qualifier}.yellowCards`,
                "2YELRED": `${qualifier}.yellowRedCards`,
                "RED": `${qualifier}.redCards`
                }
            } else {
                return {
                "GP": "gamesPlayed",
                "G": `${qualifier}.goals`,
                "A": `${qualifier}.assists`,
                "SOT": `${qualifier}.shotsOnTarget`,
                "SHO": `${qualifier}.totalShots`,
                "MIN": `${qualifier}.minutesPlayed`,
                // "CC": `${qualifier}.chancesCreated`,
                "PAS": `${qualifier}.totalPasses`,
                "DRI": `${qualifier}.dribblesCompleted`,
                "LOP": `${qualifier}.lossOfPossession`,
                "TCK": `${qualifier}.totalTackles`,
                "FLS": `${qualifier}.foulsCommitted`,
                "INT": `${qualifier}.interceptions`,
                "YEL": `${qualifier}.yellowCards`,
                "2YELRED": `${qualifier}.yellowRedCards`,
                "RED": `${qualifier}.redCards`
                }
            }
            case "afl":
            return {
                "GP": "gamesPlayed",
                "PTS": `${qualifier}.points`,
                "G": `${qualifier}.goals`,
                "B": `${qualifier}.behinds`,
                "D": `${qualifier}.disposals`,
                "H": `${qualifier}.handballs`,
                "HO": `${qualifier}.hitouts`,
                "K": `${qualifier}.kicks`,
                "M": `${qualifier}.marks`,
                "T": `${qualifier}.tackles`
            }
            case "nrl":
            return {
                "GP": "gamesPlayed",
                "MIN": `${qualifier}.minutesPlayed`,
                "PTS": `${qualifier}.points`,
                "T": `${qualifier}.tries`,
                'G': `${qualifier}.goals`,
                'FG': `${qualifier}.fieldGoals`,
                '1PT': `${qualifier}.onePointFieldGoals`,
                '2PT': `${qualifier}.twoPointFieldGoals`,
                'LB': `${qualifier}.lineBreaks`,
                'TB': `${qualifier}.tackleBreaks`,
                'PCRM': `${qualifier}.postContactRunMetres`,
                'HU': `${qualifier}.hitUps`,
                'TA': `${qualifier}.tryAssists`,
                'P': `${qualifier}.passes`,
                'DP': `${qualifier}.dummyPasses`,
                'OFF': `${qualifier}.offloads`,
                'REC': `${qualifier}.allReceipts`,

                'R': `${qualifier}.allRuns`,
                'RM': `${qualifier}.allRunMetres`,
                'DHR': `${qualifier}.dummyHalfRuns`,
                'KR': `${qualifier}.kickReturns`,
                'KRM': `${qualifier}.kickReturnMetres`,

                'K': `${qualifier}.totalKicks`,
                'KM': `${qualifier}.totalKickMetres`,
                'CM': `${qualifier}.conversionsMade`,
                'CA': `${qualifier}.conversionAttempts`,
                'C%': `${qualifier}.conversionPercentage`,
                '40/20': `${qualifier}.fortyTwentyKicks`,
                '20/40': `${qualifier}.twentyFortyKicks`,
                'GK': `${qualifier}.grubberKicks`,
                'BK': `${qualifier}.bombKicks`,
                'CFK': `${qualifier}.crossFieldKicks`,
                'S': `${qualifier}.supports`,
                'DR': `${qualifier}.decoyRuns`,
            }
            default:
            console.log("Unsupported league " + league);
            return {}
        }
    }

    // Build filters object for getColumns function
    // qualifier for column paths is the stats type (cumulativeStats / averageStats) from viewMode, not a UI filter
    const buildFiltersForColumns = useCallback(() => {
        const filters = getFiltersFromConfig();
        const filtersObj = {};
        
        // Column paths use stats type from viewMode: cumulativeStats or averageStats
        filtersObj.qualifier = {
            options: { "Total": "cumulativeStats", "Per Game": "averageStats" },
            selectedValue: viewMode === 'cumulative' ? "Total" : "Per Game"
        };
        
        // Build type filter (for team tab)
        if (tabSelection === 'team') {
            filtersObj.type = {
                options: { "Offensive": "offensive", "Defensive": "defensive" },
                selectedValue: typeFilter === 'offensive' ? 'Offensive' : 'Defensive'
            };
        }
        
        // Build position filter (for player tab)
        if (tabSelection === 'player' && filters.position) {
            const positionValueObj = filterValues.position;
            const positionStoredValue = positionValueObj?.value;
            const storedValue = Array.isArray(positionStoredValue) ? positionStoredValue[0] : positionStoredValue;
            
            // Use the backend/API value for column logic, not the localized display label.
            filtersObj.position = {
                selectedValue: storedValue || ""
            };
        } else if (tabSelection === 'player') {
            filtersObj.position = {
                selectedValue: ""
            };
        }
        
        return filtersObj;
    }, [filterValues, tabSelection, typeFilter, viewMode]);

    const loadData = useCallback(() => {
        if (!context.league) {
            return;
        }

        const columns = getColumns(tabSelection, context.league, buildFiltersForColumns());
        const statPath = columns[sortColumn];
        // Position changes can remove the selected stat. Wait for the sort effect
        // to choose a valid replacement before requesting rankings.
        if (!statPath) return;

        const controller = new AbortController();
        
        const endpoint = `${tabSelection}s`
        let queryParams = {}
        Object.keys(filterValues).forEach((filterKey) => {
            const filterValueObj = filterValues[filterKey];
            if (!filterValueObj || filterValueObj.value === undefined) {
                return;
            }
            
            if (filterValueObj.filterType === "single") {
                const selectedValue = filterValueObj.value;
                if (selectedValue == null || selectedValue === 'ALL') return;
                queryParams[filterKey] = selectedValue;
            } else if (filterValueObj.filterType === "multiple") {
                //NFL, NCAAF, AFL and NRL don't take a round/week value to display all
                const selectedValues = filterValueObj.value;
                // v4 player rankings accept team IDs; "All" means omit the filter.
                if (filterKey === 'team' && Array.isArray(selectedValues) && selectedValues.includes('ALL')) return;
                if (['nfl', 'ncaaf', 'afl', 'nrl'].includes(context.league) && selectedValues[0] === 'ALL') {
                    selectedValues[0] = null;
                }
                if (Array.isArray(selectedValues)) {
                    queryParams[filterKey] = selectedValues.join(',');
                } else {
                    queryParams[filterKey] = selectedValues;
                }
                
            }
        })
        
        // Add type filter for team tab
        if (tabSelection === 'team') {
            queryParams.type = typeFilter;
        }
        
        // Add sort parameters: use column path (e.g. cumulativeStats.points) not display name (e.g. PTS)
        queryParams.stat = statPath;
        queryParams.order = sortDirection.toUpperCase();
        
        const apiVersion = tabSelection === 'player' ? 'v4' : 'v3';
        const url = `${API_HOST}/api/${context.league}/${apiVersion}/${endpoint}/rankings?${buildQueryParams(queryParams)}`
        fetch(url, { signal: controller.signal })
            .then((response) => jsonOrDefault(response, []))
            .then((data) => {
                if (controller.signal.aborted) return;
                setLeaderboardData(Array.isArray(data) ? data : []);
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                console.error('Error loading leaderboard data:', error);
                setLeaderboardData([]);
            });
        // Filter changes must load their own results instead of being dropped
        // while a previous request is running.
        return () => controller.abort();
    }, [context.league, tabSelection, filterValues, typeFilter, sortColumn, sortDirection, buildFiltersForColumns]);

    const getDisplayOptions = (filter, filterType) => {
        // Create options object where keys and values are the same (to display labels)
        // For multiple filters, InputSelection adds "ALL" automatically, so remove "All" variants from backend
        // and override the display text to show "All" instead of "ALL"
        const displayOptions = {};
        Object.keys(filter.options).forEach(key => {
            const lowerKey = key.toLowerCase();
            if (filterType === 'multiple' && (filter.options[key] == null || lowerKey === 'all' || lowerKey.startsWith('all ') || lowerKey === 'all rounds' || lowerKey === 'all weeks')) {
                return; // Skip "All" variants for multiple filters since InputSelection adds its own
            }
            displayOptions[key] = key; // Use key as both key and value for display
        });
        
        // For multiple filters, override the "ALL" option to display as "All"
        if (filterType === 'multiple') {
            displayOptions['ALL'] = 'All';
        }
        
        return displayOptions;
    };

    const initializeFilters = () => {
        const filters = getFiltersFromConfig();
        
        // Initialize all filter values from configuration
        const initialValues = {};
        Object.keys(filters).forEach(filterKey => {
            const filter = filters[filterKey];
            if (filter && filter.options && Object.keys(filter.options).length > 0) {
                const filterType = filter.filterType === 'multiple' ? 'multiple' : 'single';
                
                // Get first available option key (skip "All" variants for multiple)
                const allOptionKeys = Object.keys(filter.options);
                let firstOptionKey;
                
                if (filterType === 'multiple') {
                    // For multiple, find first non-"All" option
                    const availableOptions = allOptionKeys.filter(key => {
                        const lowerKey = key.toLowerCase();
                        return filter.options[key] != null && !(lowerKey === 'all' || lowerKey.startsWith('all '));
                    });
                    firstOptionKey = availableOptions.length > 0 ? availableOptions[0] : allOptionKeys[0];
                } else {
                    firstOptionKey = allOptionKeys[0];
                }
                
                if (firstOptionKey) {
                    // Store the value from options, not the key, along with filterType
                    if (filterType === 'multiple') {
                        initialValues[filterKey] = {
                            value: ['ALL'], // 'ALL' is special, keep as is
                            filterType: filterType
                        };
                    } else {
                        initialValues[filterKey] = {
                            value: filter.options[firstOptionKey],
                            filterType: filterType
                        };
                    }
                }
            }
        });
        
        setFilterValues(initialValues);
    };

    const handleFilterChange = (filterKey, selection) => {
        const filters = getFiltersFromConfig();
        const filter = filters[filterKey];
        
        if (!filter || !filter.options) {
            setFilterValues(prev => ({
                ...prev,
                [filterKey]: {
                    value: selection,
                    filterType: 'single'
                }
            }));
            return;
        }
        
        // Convert display key to actual value from filter.options
        const filterType = filter.filterType === 'multiple' ? 'multiple' : 'single';
        let storedValue;
        
        if (filterType === 'multiple') {
            // For multiple, selection is an array of display keys
            // Convert each key to its value, handling 'ALL' specially
            storedValue = Array.isArray(selection) 
                ? selection.map(key => {
                    if (key === 'ALL') return 'ALL';
                    return key in filter.options ? filter.options[key] : key;
                })
                : [selection in filter.options ? filter.options[selection] : selection];
        } else {
            // For single, selection is a display key
            storedValue = selection in filter.options ? filter.options[selection] : selection;
        }

        if (filterKey === 'position') {
            // Resolve the new position before updating filters so its first
            // request uses its own default stat, even when the old stat is shared.
            const columnFilters = buildFiltersForColumns();
            columnFilters.position = {
                selectedValue: Array.isArray(storedValue) ? storedValue[0] : storedValue
            };
            const columns = getColumns(tabSelection, context.league, columnFilters);
            setSortColumn(Object.keys(columns)[1] || null);
            setSortDirection('desc');
        }
        
        setFilterValues(prev => ({
            ...prev,
            [filterKey]: {
                value: storedValue,
                filterType: filterType
            }
        }));
    };

    useEffect(() => {
        document.title = `${t('stats.title')} - Linemate`
        const onResize = () => setWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [])

    const handleViewModeChange = (selection) => {
        // Convert UI selection to internal value
        const internalValue = selection === 'Total' ? 'cumulative' : 'average';
        setViewMode(internalValue);
    };

    const handleTabChange = (selection) => {
        if (selection !== tabSelection) {
            // The stat list changes with the tab, so let the default-sort effect
            // select the second stat from the newly active list.
            setSortColumn(null);
        }
        setTabSelection(selection);
        // Reset typeFilter when switching to player tab (not used there)
        if (selection === 'player') {
            setTypeFilter('offensive'); // Reset to default, won't be used
        }
    };


    const handleLegendOpen = () => {
        setLegendDialogOpen(true);
    };

    const handleMouseDown = (e) => {
        // Only handle if clicking on the table wrapper, not on table cells
        if (e.target.closest('.table-component-wrapper')) {
            const tableWrapper = tableWrapperRef.current;
            if (!tableWrapper) return;
            
            // Find the actual table wrapper element
            const actualWrapper = tableWrapper.querySelector('.table-component-wrapper');
            if (!actualWrapper) return;
            
            // Always enable drag for horizontal scrolling
            setIsDragging(true);
            setStartX(e.clientX);
            setScrollLeft(actualWrapper.scrollLeft);
            e.preventDefault();
            e.stopPropagation();
        }
    };

    const handleMouseMove = useCallback((e) => {
        if (!isDragging) return;
        const tableWrapper = tableWrapperRef.current;
        if (!tableWrapper) return;
        
        const actualWrapper = tableWrapper.querySelector('.table-component-wrapper');
        if (!actualWrapper) return;

        const x = e.clientX;
        const walk = x - startX; // Direct 1:1 mapping to scroll position (like moving scrollbar)
        actualWrapper.scrollLeft = scrollLeft - walk;
        e.preventDefault();
    }, [isDragging, startX, scrollLeft]);

    const handleMouseUp = useCallback(() => {
        if (isDragging) {
            setIsDragging(false);
        }
    }, [isDragging]);

    const handleMouseLeave = () => {
        if (isDragging) {
            setIsDragging(false);
        }
    };

    const checkScrollPosition = useCallback(() => {
        const tableWrapper = tableWrapperRef.current;
        if (!tableWrapper) return;
        
        const actualWrapper = tableWrapper.querySelector('.table-component-wrapper');
        if (!actualWrapper) return;
        
        const { scrollLeft, scrollWidth, clientWidth } = actualWrapper;
        const isAtLeft = scrollLeft === 0;
        const isAtRight = scrollLeft + clientWidth >= scrollWidth - 1; // -1 for rounding errors
        const hasOverflow = scrollWidth > clientWidth;
        
        setShowLeftGradient(hasOverflow && !isAtLeft);
        setShowRightGradient(hasOverflow && !isAtRight);
    }, []);

    const tableColumns = useMemo(() => {
        const filters = buildFiltersForColumns();
        const columns = getColumns(tabSelection, context.league, filters);
        return ['RANK', 'NAME', ...Object.keys(columns)];
    }, [buildFiltersForColumns, tabSelection, context.league]);

    // Initialize each league/tab and replace stats removed by position changes.
    // The first defined stat is games played, so rank by the second stat by default.
    useEffect(() => {
        const sortKey = `${context.league}:${tabSelection}`;
        if (filterValuesForTab !== tabSelection) {
            return;
        }
        if (initializedSortKeyRef.current === sortKey && tableColumns.includes(sortColumn)) {
            return;
        }

        const defaultSortColumn = tableColumns[3];
        if (!defaultSortColumn) {
            return;
        }

        initializedSortKeyRef.current = sortKey;
        setSortColumn(defaultSortColumn);
        setSortDirection('desc');
    }, [context.league, filterValuesForTab, tabSelection, tableColumns, sortColumn]);

    const handleColumnSort = (columnName) => {
        // Don't allow sorting on RANK or NAME columns
        if (columnName === 'RANK' || columnName === 'NAME') {
            return;
        }
        
        // Toggle direction if clicking the same column, otherwise set to asc
        if (sortColumn === columnName) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(columnName);
            setSortDirection('asc');
        }
    };

    // Helper function to get nested value by path string
    const getValueByPath = (obj, path) => {
        if (!path || !obj) return null;
        return path.split('.').reduce((acc, key) => acc?.[key], obj);
    };

    const sortedData = useMemo(() => {
        if (!sortColumn || leaderboardData.length === 0) {
            return leaderboardData;
        }

        const filters = buildFiltersForColumns();
        const columns = getColumns(tabSelection, context.league, filters);
        const columnPath = columns[sortColumn];
        
        if (!columnPath) {
            return leaderboardData;
        }

        // Build the full path like we do in getDataExtractor
        const statsType = viewMode === 'average' ? 'averageStats' : 'cumulativeStats';
        let fullPath;
        if (tabSelection === 'team') {
            const pathParts = columnPath.split('.');
            if (pathParts.length >= 3) {
                fullPath = `${statsType}.${typeFilter}.${pathParts.slice(2).join('.')}`;
            } else {
                fullPath = columnPath.replace(/^[^.]+\./, `${statsType}.${typeFilter}.`);
            }
        } else {
            fullPath = columnPath.replace(/^[^.]+\./, `${statsType}.`);
        }

        const sorted = [...leaderboardData].sort((a, b) => {
            const valueA = getValueByPath(a, fullPath);
            const valueB = getValueByPath(b, fullPath);
            
            // Handle null/undefined values
            if (valueA == null && valueB == null) return 0;
            if (valueA == null) return 1;
            if (valueB == null) return -1;
            
            // Compare values
            let comparison = 0;
            if (typeof valueA === 'number' && typeof valueB === 'number') {
                comparison = valueA - valueB;
            } else {
                comparison = String(valueA).localeCompare(String(valueB));
            }
            
            return sortDirection === 'asc' ? comparison : -comparison;
        });

        return sorted;
    }, [leaderboardData, sortColumn, sortDirection, tabSelection, context.league, viewMode, typeFilter, buildFiltersForColumns]);

    const getColumnStyling = (columnIndex, columnName) => {
        const baseStyle = {
            cursor: (columnName !== 'RANK' && columnName !== 'NAME') ? 'pointer' : 'default',
            userSelect: 'none'
        };
        
        if (columnIndex === 0) {
            return { ...baseStyle, width: '60px', textAlign: 'center', padding: '0px 12px', minWidth: '60px', position: 'sticky', left: '0' };
        }
        if (columnIndex === 1) {
            return { ...baseStyle, width: '120px', textAlign: 'left', padding: '0px 12px', minWidth: '120px', position: 'sticky', left: '60px' };
        }
        // Calculate minimum width based on column name length
        // Estimate: ~8px per character + padding
        const minWidth = Math.max(80, columnName.length * 8 + 24);
        return { ...baseStyle, textAlign: 'right', padding: '0px 12px', minWidth: `${minWidth}px`, whiteSpace: 'nowrap' };
    };

    const getDataExtractor = useCallback((rowIndex, columnIndex, columnName) => {
        if (!sortedData || sortedData.length === 0) {
            return '';
        }
        const data = sortedData[rowIndex];
        if (!data) {
            return '';
        }

        // Handle RANK and NAME columns
        if (columnName === 'RANK') {
            // RANK should reflect the sorted position, not the original rank
            return rowIndex + 1;
        }
        if (columnName === 'NAME') {
            if (tabSelection === 'player') {
                // For players: show "G. Lock" format (first initial + last name) with team logo
                const firstName = data.info?.firstName || '';
                const lastName = data.info?.lastName || '';
                const displayName = firstName && lastName 
                    ? `${firstName.charAt(0)}. ${lastName}`
                    : data.info?.fullName || '';
                const teamCode = data.teamCode || '';
                const teamId = data.teamId || data.currentTeamId;
                
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img 
                            src={getTeamLogoPath(context.league, teamId)} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, context.league)}
                            style={{ width: '24px', height: '24px' }}
                        />
                        <span>{displayName}</span>
                    </div>
                );
            } else {
                // For teams: show team code
                const teamCode = data.code || '';
                const teamId = data.teamId || data.id;
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img 
                            src={getTeamLogoPath(context.league, teamId)} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, context.league)}
                            style={{ width: '24px', height: '24px' }}
                        />
                        <span>{teamCode}</span>
                    </div>
                );
            }
        }

        // Get column paths from getColumns
        const filters = buildFiltersForColumns();
        const columns = getColumns(tabSelection, context.league, filters);
        const columnPath = columns[columnName];
        
        if (!columnPath) {
            return '';
        }

        // Handle special case: gamesPlayed is at root level
        if (columnPath === 'gamesPlayed') {
            const value = data.gamesPlayed;
            return value != null ? value : '';
        }
        
        // Determine the base path based on viewMode
        const statsType = viewMode === 'average' ? 'averageStats' : 'cumulativeStats';
        
        // The columnPath from getColumns is like "cumulativeStats.offensive.points" or "averageStats.defensive.goals"
        // We need to replace the first part (qualifier) with the actual statsType based on viewMode
        // For team tab, also ensure we use the correct typeFilter instead of the type from filters
        let fullPath;
        if (tabSelection === 'team') {
            // Path format: qualifier.type.field -> statsType.typeFilter.field
            // Replace both qualifier and type
            const pathParts = columnPath.split('.');
            if (pathParts.length >= 3) {
                // Replace first two parts (qualifier.type) with statsType.typeFilter
                fullPath = `${statsType}.${typeFilter}.${pathParts.slice(2).join('.')}`;
            } else {
                // Fallback: replace qualifier and add typeFilter
                fullPath = columnPath.replace(/^[^.]+\./, `${statsType}.${typeFilter}.`);
            }
        } else {
            // For player, replace qualifier with statsType
            // Path format: qualifier.field -> statsType.field (no type for players)
            fullPath = columnPath.replace(/^[^.]+\./, `${statsType}.`);
        }

        // Get value using the path
        const value = getValueByPath(data, fullPath);
        
        // Round numeric values to nearest 0.1
        if (value != null && typeof value === 'number') {
            return Math.round(value * 10) / 10;
        }
        
        return value != null ? value : '';
    }, [sortedData, tabSelection, context.league, viewMode, typeFilter, buildFiltersForColumns]);

    // Initialize filters on mount
    useEffect(() => {
        initializeFilters();
        setFilterValuesForTab(tabSelection);
    }, []);

    // Update filters when tab or league changes (state ensures loadData runs only after filterValues have committed for this tab)
    useEffect(() => {
        initializeFilters();
        setFilterValuesForTab(tabSelection);
    }, [tabSelection, context.league, context.configuration]);

    // Execute when any filter changes (including viewMode)
    useEffect(() => {
        // Skip on initial mount (filters are being initialized)
        if (Object.keys(filterValues).length === 0) {
            return;
        }

        // Boilerplate code to execute when filters change
        const handleFilterChange = () => {
            // TODO: Add your filter change logic here
            // Examples:
            // - Reload leaderboard data
            // - Make API call with new filter values
            // - Update URL parameters
            // - Log filter changes for debugging
        };

        handleFilterChange();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterValues, typeFilter, viewMode, tabSelection, context.league]);

    // Reload data when filters, tab, league, viewMode, or sort changes
    useEffect(() => {
        // Skip if filters aren't initialized yet or league is not set
        if (Object.keys(filterValues).length === 0 || !context.league || !sortColumn) {
            return;
        }
        // Skip until filterValues have been reset for this tab (avoids using previous tab's filters)
        if (filterValuesForTab !== tabSelection) {
            return;
        }
        return loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabSelection, context.league, filterValues, filterValuesForTab, typeFilter, viewMode, sortColumn, sortDirection]);

    // Add document-level event listeners for drag functionality
    useEffect(() => {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, startX, scrollLeft]);

    // Add scroll event listener for gradient overlays
    useEffect(() => {
        const tableWrapper = tableWrapperRef.current;
        if (!tableWrapper) return;
        
        const actualWrapper = tableWrapper.querySelector('.table-component-wrapper');
        if (!actualWrapper) return;
        
        // Check initial scroll position
        checkScrollPosition();
        
        // Add scroll event listener
        actualWrapper.addEventListener('scroll', checkScrollPosition);
        
        // Also check on resize
        const handleResize = () => {
            checkScrollPosition();
        };
        window.addEventListener('resize', handleResize);
        
        return () => {
            actualWrapper.removeEventListener('scroll', checkScrollPosition);
            window.removeEventListener('resize', handleResize);
        };
    }, [checkScrollPosition, leaderboardData.length]);

    // Check scroll position when data changes
    useEffect(() => {
        // Use setTimeout to ensure DOM is updated
        const timer = setTimeout(() => {
            checkScrollPosition();
        }, 100);
        
        return () => clearTimeout(timer);
    }, [leaderboardData.length, checkScrollPosition]);

    const viewModeOptions = {
        'Total': t('stats.filters.options.qualifier.cumulativeStats'),
        'Per Game': t('stats.filters.options.qualifier.perGame')
    };

    const tabOptions = {
        team: t('stats.tabs.team'),
        player: t('stats.tabs.player')
    };

    // Get filter options from configuration based on current league and tab
    const filters = getFiltersFromConfig();
    
    // Get filter order - prioritize common filters (season/timeframe, week/round, split)
    const getFilterOrder = (filterKeys) => {
        const priority = ['season', 'timeframe', 'week', 'round', 'split', 'position', 'team'];
        return filterKeys.sort((a, b) => {
            const aIndex = priority.indexOf(a);
            const bIndex = priority.indexOf(b);
            if (aIndex === -1 && bIndex === -1) return 0;
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        });
    };
    
    const filterKeys = getFilterOrder(Object.keys(filters));

    const legendContent = (
        <div>
            <p className="text-style-label-normal color-fig-default">
                <strong>GP:</strong> Games Played<br/>
                <strong>PTS:</strong> Points<br/>
                <strong>S%:</strong> Success Percentage<br/>
                <strong>PLAYS:</strong> Total Plays<br/>
                <strong>YDS:</strong> Yards<br/>
                <strong>TD:</strong> Touchdowns<br/>
                <strong>1D:</strong> First Downs<br/>
                <strong>3D%:</strong> Third Down Conversion Percentage<br/>
                <strong>4D%:</strong> Fourth Down Conversion Percentage<br/>
                <strong>RZ%:</strong> Red Zone Percentage
            </p>
        </div>
    );

    return (
        <div className='leaderboard-page-container'>
            <div className='leaderboard-main-container'>
                <div className='leaderboard-content-row'>
                    <div className='leaderboard-content-wrapper'>
                    <div className='leaderboard-top-section-padding'>
                        {/* Header Section */}
                        <div className='leaderboard-header'>
                            <div className='leaderboard-header-left'>
                                <h1 className='text-style-h-2-bold color-fig-default'>{t('stats.title')}</h1>
                            </div>
                            <div className='leaderboard-header-right'>
                                <div className='leaderboard-segmented-control-wrapper'>
                                    <SegmentedControl
                                        options={viewModeOptions}
                                        selection={viewMode === 'cumulative' ? 'Total' : 'Per Game'}
                                        selectionHandler={handleViewModeChange}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Border after Stats + Total/Per Game */}
                    <div className='leaderboard-tabs-section-padding'>
                        {/* Tabs Section */}
                        <div className='leaderboard-tabs-section'>
                            <TabToggle
                                options={tabOptions}
                                selection={tabSelection}
                                selectionHandler={handleTabChange}
                                includeLegend={false}
                            />
                            <Dialog
                                open={legendDialogOpen}
                                onOpenChange={(open) => setLegendDialogOpen(open)}
                                trigger={
                                    <div className='leaderboard-legend-link clickable' onClick={handleLegendOpen}>
                                        <p className='text-style-caption-medium color-fig-accent'>Legend</p>
                                    </div>
                                }
                                title={t('stats.legend.title')}
                                content={legendContent}
                                footer={null}
                            />
                        </div>
                    </div>
                    {/* Border after Tabs */}
                    <div className='leaderboard-top-section-padding leaderboard-top-section-padding-filters'>
                        {/* Filters Section */}
                        <div className='leaderboard-filters-section'>
                            {/* Type filter - only shown for team tab */}
                            {tabSelection === 'team' && (
                                <div className="leaderboard-filter-item">
                                    <p className="text-style-label-medium color-fig-subtle leaderboard-filter-label">{t('stats.filters.titles.type')}</p>
                                    <InputSelection
                                        type="single"
                                        typography="sm"
                                        options={{
                                            Offensive: t('stats.filters.options.type.offensive'),
                                            Defensive: t('stats.filters.options.type.defensive')
                                        }}
                                        selection={typeFilter === 'offensive' ? 'Offensive' : typeFilter === 'defensive' ? 'Defensive' : 'Offensive'}
                                        selectionHandler={(selection) => {
                                            // Convert display key to stored value
                                            const valueMap = { "Offensive": "offensive", "Defensive": "defensive" };
                                            setTypeFilter(valueMap[selection] || "offensive");
                                        }}
                                        enabled={true}
                                    />
                                </div>
                            )}
                            {filterKeys.map(filterKey => {
                                const filter = filters[filterKey];
                                if (!filter || !filter.options || Object.keys(filter.options).length === 0) {
                                    return null;
                                }
                                
                                const filterType = filter.filterType === 'multiple' ? 'multiple' : 'single';
                                
                                // Get display options (after filtering out "All" variants for multiple filters)
                                const displayOptions = getDisplayOptions(filter, filterType);
                                const availableOptionKeys = Object.keys(displayOptions);
                                
                                if (availableOptionKeys.length === 0) {
                                    return null; // Skip if no options available
                                }
                                
                                const filterValueObj = filterValues[filterKey];
                                const storedValue = filterValueObj?.value;
                                const storedFilterType = filterValueObj?.filterType || filterType;
                                
                                // Convert stored value back to display key for InputSelection
                                // Find the key in filter.options that matches the stored value
                                let currentSelection;
                                
                                if (storedValue === undefined || storedValue === null) {
                                    // Initialize with 'ALL' for multiple, first option for single
                                    currentSelection = storedFilterType === 'multiple' ? ['ALL'] : availableOptionKeys[0];
                                } else if (storedFilterType === 'multiple') {
                                    // For multiple, storedValue is an array of values
                                    const valueArray = Array.isArray(storedValue) ? storedValue : [storedValue];
                                    // Convert each stored value back to its display key
                                    currentSelection = valueArray.map(value => {
                                        if (value === 'ALL') return 'ALL';
                                        // Find the key in filter.options that has this value
                                        const matchingKey = Object.keys(filter.options).find(key => filter.options[key] === value);
                                        return matchingKey || value;
                                    }).filter(key => displayOptions[key]); // Only keep keys that exist in displayOptions
                                    
                                    // If empty after filtering, default to 'ALL'
                                    if (currentSelection.length === 0) {
                                        currentSelection = ['ALL'];
                                    }
                                } else {
                                    // For single, find the key that matches the stored value
                                    const matchingKey = Object.keys(filter.options).find(key => filter.options[key] === storedValue);
                                    currentSelection = matchingKey && displayOptions[matchingKey] ? matchingKey : availableOptionKeys[0];
                                }
                                
                                // Capitalize first letter of filter key for label
                                const filterLabel = getFilterLabel(filterKey);
                                
                                return (
                                    <div key={filterKey} className="leaderboard-filter-item">
                                        <p className="text-style-label-medium color-fig-subtle leaderboard-filter-label">{filterLabel}</p>
                                        <InputSelection
                                            type={filterType}
                                            typography="sm"
                                            options={displayOptions}
                                            selection={currentSelection}
                                            selectionHandler={(selection) => handleFilterChange(filterKey, selection)}
                                            enabled={true}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    {/* Border after Filters */}
                    <div className='leaderboard-page-padding'>
                        {/* Table Section */}
                        <div 
                            className={`leaderboard-table-section ${isDragging ? 'dragging' : ''}`}
                            ref={tableWrapperRef}
                            onMouseDown={handleMouseDown}
                            onMouseLeave={handleMouseLeave}
                        >
                            {/* Left gradient overlay */}
                            {/* {showLeftGradient && (
                                <div className="leaderboard-table-gradient leaderboard-table-gradient-left" style={{left: tabSelection === 'team' ? '180px' : '210px'}}/>
                            )} */}
                            {/* Right gradient overlay */}
                            {showRightGradient && (
                                <div className="leaderboard-table-gradient leaderboard-table-gradient-right" />
                            )}
                            <Table
                                columns={tableColumns}
                                columnStyling={getColumnStyling}
                                columnLabelFormatter={getColumnLabel}
                                rowCount={leaderboardData.length}
                                dataExtractor={getDataExtractor}
                                headerClickHandler={handleColumnSort}
                                sortColumn={sortColumn}
                                sortDirection={sortDirection}
                            />
                        </div>
                    </div>
                    {width && width <= 1000 &&
                        <div className='global-sidebar-column leaderboard-sidebar-stacked'>
                            <div style={{position: 'relative', width: '100%'}}>
                                <HomeSidebar />
                            </div>
                        </div>
                    }
                    <Footer />
                    </div>
                    {/* Sidebar */}
                    {width && width > 1000 &&
                    <div className='global-sidebar-column'>
                        <div style={{position: 'relative', width: '100%'}}>
                            <HomeSidebar />
                        </div>
                    </div>
                    }
                </div>
            </div>
        </div>
    );
}

export default Leaderboard;
