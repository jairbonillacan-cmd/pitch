import React, { useState, useContext, useEffect, useRef, useCallback } from 'react';
import GlobalContext from '../components/GlobalContext';
import Footer from '../components/Footer';
import HomeSidebar from '../components/HomeSidebar';
import SegmentedControl from '../components/SegmentedControl';
import Table from '../components/Table';
import { getTeamLogoPath, teamLogoPathOnErrorFallback } from '../react-web-utils';
import './Standings.scss';
import { API_HOST } from '../react-web-constants';
import { buildStandings } from '../linemate-react-common/src/gameday-utils';
import { jsonOrDefault } from '../linemate-react-common/src/util';
import { STANDINGS_FIELDS } from '../linemate-react-common/src/constants';
import { useTranslation } from 'react-i18next';

function Standings() {
    const { t } = useTranslation();
    const context = useContext(GlobalContext);

    const [segment, setSegment] = useState(''); // 'conference' | 'division'
    const [standings, setStandings] = useState();
    const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth: 1280)
    const standingsTableRefs = useRef({});
    const [dragState, setDragState] = useState({
        isDragging: false,
        tableKey: null,
        startX: 0,
        scrollLeft: 0,
    });

    useEffect(() => {
        document.title = `${t('standings.title')} - Linemate`
    }, [t])

    useEffect(() => {
        Promise.all([
            fetch(`${API_HOST}/api/${context.league}/v3/teams/rankings`).then((response) => jsonOrDefault(response, []))
        ])
        .then((results) => {
            const tempStandings = buildStandings(results[0])
            setStandings(tempStandings)
            setSegment(Object.keys(tempStandings)[0])
        })
        const onResize = () => setWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [context.league])
    
    const getSegmentLabel = (segmentKey) => {
        return t(`standings.picker.${segmentKey}`, {
            defaultValue: segmentKey[0].toUpperCase() + segmentKey.slice(1)
        })
    }

    const getColumnLabel = (columnName) => {
        if (columnName === '#') return t('standings.labels.ranking')
        if (columnName === 'TEAM') return t('standings.labels.team')
        return t(`standings.columns.${columnName}`, { defaultValue: columnName })
    }

    const handleTableMouseDown = (event, tableKey) => {
        const tableWrapper = standingsTableRefs.current[tableKey]?.querySelector('.table-component-wrapper');
        if (!tableWrapper || !event.target.closest('.table-component-wrapper')) return;

        setDragState({
            isDragging: true,
            tableKey,
            startX: event.clientX,
            scrollLeft: tableWrapper.scrollLeft,
        });

        event.preventDefault();
        event.stopPropagation();
    };

    const handleTableMouseMove = useCallback((event) => {
        if (!dragState.isDragging || !dragState.tableKey) return;

        const tableWrapper = standingsTableRefs.current[dragState.tableKey]?.querySelector('.table-component-wrapper');
        if (!tableWrapper) return;

        const walk = event.clientX - dragState.startX;
        tableWrapper.scrollLeft = dragState.scrollLeft - walk;
        event.preventDefault();
    }, [dragState]);

    const handleTableMouseUp = useCallback(() => {
        if (!dragState.isDragging) return;

        setDragState((previousState) => ({
            ...previousState,
            isDragging: false,
            tableKey: null,
        }));
    }, [dragState.isDragging]);

    useEffect(() => {
        document.addEventListener('mousemove', handleTableMouseMove);
        document.addEventListener('mouseup', handleTableMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleTableMouseMove);
            document.removeEventListener('mouseup', handleTableMouseUp);
        };
    }, [handleTableMouseMove, handleTableMouseUp]);

    const standingFields = STANDINGS_FIELDS[context.league]
    const standingFieldKeys = Object.keys(standingFields);
    const tableColumns = ['#', 'TEAM'].concat(standingFieldKeys)

    return (
        <div className="standings-page-container">
            {standings &&
            <div className="standings-main-container">
                <div className="standings-content-row">
                    <div className="standings-content-wrapper">
                        <div className="standings-top-section-padding">
                            <div className="standings-header">
                                <div className="standings-header-left">
                                    <h1 className="text-style-h-2-bold color-fig-default">{t('standings.title')}</h1>
                                </div>
                                {Object.keys(standings).length > 1 &&
                                    <div className="standings-header-right">
                                        <div className="standings-segmented-control-wrapper">
                                            <SegmentedControl
                                                options={Object.fromEntries(Object.keys(standings).map(k => [k, getSegmentLabel(k)]))}
                                                selection={segment}
                                                selectionHandler={setSegment}
                                            />
                                        </div>
                                    </div>
                                }
                            </div>
                        </div>
                        {segment && 
                        <div className="standings-page-padding">
                            <div className="standings-tables-grid">
                            {Object.entries(standings[segment])
                                .sort((a, b) => a[0].localeCompare(b[0]))
                                .map((division) => {
                                const teams = [...division[1]].sort((a, b) => (b.standings?.wins ?? 0) - (a.standings?.wins ?? 0));
                                return (
                                <div
                                    key={division[0]}
                                    ref={(element) => { standingsTableRefs.current[division[0]] = element }}
                                    className={`standings-division-table-section${dragState.isDragging && dragState.tableKey === division[0] ? ' standings-division-table-section--dragging' : ''}`}
                                    onMouseDown={(event) => handleTableMouseDown(event, division[0])}
                                >
                                    <p className='text-style-body-medium'>{division[0]}</p>
                                    <Table
                                        columns={tableColumns}
                                        columnLabelFormatter={getColumnLabel}
                                        columnStyling={(columnIndex, columnName) => {
                                            if (columnIndex === 0) {
                                                return { width: 40, minWidth: 40, textAlign: 'left' }
                                            }
                                            if (columnIndex === 1) {
                                                return { width: 96, minWidth: 96, textAlign: 'left' }
                                            }
                                            return { width: 56, minWidth: 56, textAlign: 'right' }
                                        }}
                                        rowCount={teams.length}
                                        dataExtractor={(rowIndex, columnIndex, columnName) => {
                                            if (columnIndex === 0) {
                                                return rowIndex + 1;
                                            }
                                            if (columnIndex === 1) {
                                                return <div className='standings-table-team-logo-entry'>
                                                        <img src={getTeamLogoPath(context.league, teams[rowIndex].teamId)} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, context.league)} />
                                                        <p>{teams[rowIndex].code}</p>
                                                    </div>
                                            }
                                            if (columnIndex >= 2) {
                                                const path = standingFields[columnName];
                                                if (!path) return undefined;
                                                return path.split('.').reduce((obj, key) => obj?.[key], teams[rowIndex]);
                                            }
                                            return undefined;
                                        }}
                                    />
                                </div>
                                );
                            })}
                            </div>
                        </div>
                        }
                        {width && width <= 1000 &&
                            <div className="global-sidebar-column leaderboard-sidebar-stacked">
                                <div style={{ position: 'relative', width: '100%' }}>
                                    <HomeSidebar />
                                </div>
                            </div>
                        }
                        <Footer />
                    </div>
                    {width && width > 1000 &&
                    <div className="global-sidebar-column">
                        <div style={{ position: 'relative', width: '100%' }}>
                            <HomeSidebar />
                        </div>
                    </div>
                    }
                </div>
            </div>
            }
        </div>
    );
}

export default Standings;
