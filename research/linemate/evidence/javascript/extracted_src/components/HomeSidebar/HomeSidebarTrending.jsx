import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import GlobalContext from '../GlobalContext';
import SegmentedControl from '../SegmentedControl';
import {
    base64Encode,
    getBookEntryBasedOnBestOdds,
    getOddsFromCard,
    getPlayerName,
    getPreferredOdds
} from '../../linemate-react-common/src/util';
import { getMarketDescriptionFromTrend } from '../../linemate-react-common/src/betting-utils';
import { SUPPORTED_LEAGUES } from '../../linemate-react-common/src/constants';
import {
    getTeamLogoPath,
    getTheme,
    shouldUseRoundTeamLogoBackground,
    teamLogoPathOnErrorFallback
} from '../../react-web-utils';
import './HomeSidebarTrending.scss';

const CATEGORIES = {
    MOST_BET_ON: 'home.sidebar.mostBetOn',
    MOST_SEARCHED: 'home.sidebar.mostSearched'
};

function HomeSidebarTrending({ trendingToday = {} }) {
    const context = useContext(GlobalContext);
    const { t } = useTranslation();
    const [selection, setSelection] = useState('MOST_BET_ON');

    const sections = Object.fromEntries(
        Object.keys(CATEGORIES).map((category) => {
            const entry = Object.entries(trendingToday).find(([key]) =>
                key.toUpperCase().replace(/[^A-Z]/g, '') === category.replace(/_/g, '')
            );
            return [category, Array.isArray(entry?.[1]) ? entry[1] : []];
        })
    );

    if (!Object.values(sections).some((trends) => trends.length > 0)) {
        return null;
    }

    const trends = sections[selection];
    const preferredProviders = context.resolvedPreferredProviders || [];

    function openTrend(trend) {
        const league = trend.league || context.league;
        const tab = trend.type === 'team' ? 'team' : 'player';
        const cards = [
            trend,
            ...trends.filter((item) => item !== trend && item.type === trend.type)
        ];
        const storageKey = 'home-sidebar-trending-cards';

        sessionStorage.setItem(storageKey, JSON.stringify(cards));

        const feed = base64Encode(JSON.stringify({
            title: t(CATEGORIES[selection]),
            importedTrendsKey: storageKey,
            includeFilters: false
        }));

        const params = new URLSearchParams({
            feed,
            tabs: JSON.stringify([tab]),
            tab
        });

        window.location.assign(`/${league}/trends?${params}`);
    }

    return (
        <section className="home-sidebar-trending">
            <div className="home-sidebar-trending-header">
                <p className="text-style-label-semibold color-fig-subtle">
                    {t('web.common.today')}
                </p>
                <div className="home-sidebar-trending-selector">
                    <SegmentedControl
                        options={Object.fromEntries(Object.entries(CATEGORIES).map(([key, localeKey]) => [key, t(localeKey)]))}
                        selection={selection}
                        selectionHandler={setSelection}
                    />
                </div>
            </div>

            <div className="home-sidebar-trending-table">
                {trends.length === 0 && (
                    <p className="home-sidebar-trending-empty text-style-label-medium color-fig-subtle">
                        {t('home.empty.trend')}
                    </p>
                )}

                {trends.slice(0, 3).map((trend, index) => {
                    const league = trend.league || context.league;
                    const book = getBookEntryBasedOnBestOdds(
                        trend.market?.books || {},
                        trend.outcome,
                        trend.line,
                        preferredProviders,
                        trend.alternate
                    );
                    const odds = getOddsFromCard(
                        trend,
                        context.userAttributes,
                        preferredProviders
                    ) || getPreferredOdds(context.userAttributes, trend.odds, true);
                    const subject = trend.type === 'player'
                        ? getPlayerName(trend.player)
                        : trend.team?.code;
                    const description = getMarketDescriptionFromTrend(
                        league, trend, preferredProviders, t
                    );
                    const roundLogo = shouldUseRoundTeamLogoBackground(league);

                    return (
                        <button
                            key={trend.trendId || trend.id || index}
                            type="button"
                            className="home-sidebar-trending-row"
                            onClick={() => openTrend(trend)}
                        >
                            <span
                                className="home-sidebar-trending-logo"
                                style={{
                                    backgroundColor: roundLogo
                                        ? SUPPORTED_LEAGUES[league]?.teams?.colors?.[getTheme()]?.[
                                            trend.team?.code?.toLowerCase()
                                        ]
                                        : 'transparent'
                                }}
                            >
                                <img
                                    src={getTeamLogoPath(league, trend.team)}
                                    onError={({ currentTarget }) =>
                                        teamLogoPathOnErrorFallback(currentTarget, league)
                                    }
                                    alt=""
                                />
                            </span>
                            <span className="home-sidebar-trending-details">
                                <span className="home-sidebar-trending-subject">
                                    <span className="text-style-label-semibold color-fig-default">
                                        {subject}
                                    </span>
                                    {trend.opposingTeam?.code && (
                                        <span className="text-style-caption-normal color-fig-subtle">
                                            {`${trend.home ? 'vs' : '@'} ${trend.opposingTeam.code}`}
                                        </span>
                                    )}
                                </span>
                                <span className="home-sidebar-trending-description text-style-caption-medium color-fig-default">
                                    {description}
                                </span>
                            </span>
                            <span className="home-sidebar-trending-odds">
                                <span className="text-style-label-semibold color-fig-subtle">
                                    {odds || '—'}
                                </span>
                                {book && (
                                    <img src={`/assets/sportsbooks/${book.toLowerCase()}.svg`} alt="" />
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

export default HomeSidebarTrending;