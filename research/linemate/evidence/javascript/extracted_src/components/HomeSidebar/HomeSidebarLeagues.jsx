import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import GlobalContext from '../GlobalContext';
import { SUPPORTED_LEAGUES } from '../../linemate-react-common/src/constants';
import { getLeagueLogoPath } from '../../react-web-utils';
import './HomeSidebarLeagues.scss';

const PRIORITY_LEAGUES = new Set(['nfl', 'nba', 'epl', 'mlb']);

function HomeSidebarLeagues() {
    const context = useContext(GlobalContext);
    const { t } = useTranslation();

    const leagues = Object.entries(context.configuration?.leagues || {})
        .filter(([league, configuration]) =>
            configuration?.enabled &&
            configuration.active !== false &&
            SUPPORTED_LEAGUES[league]
        )
        .map(([league, configuration]) => ({
            league,
            title: configuration.title || SUPPORTED_LEAGUES[league].title,
            sport: SUPPORTED_LEAGUES[league].sport,
            games: Number(configuration.currentGamesCount) || 0,
            priority: PRIORITY_LEAGUES.has(league)
        }))
        .filter(({ games }) => games > 0)
        .sort((left, right) =>
            Number(right.priority) - Number(left.priority) ||
            right.games - left.games
        )
        .slice(0, 3);

    if (leagues.length === 0) return null;

    return (
        <section className="home-sidebar-leagues">
            <p className="text-style-label-semibold color-fig-subtle">
                {t('home.sidebar.trendingLeagues')}
            </p>
            <div className="home-sidebar-leagues-table">
                {leagues.map(({ league, title, sport, games }) => (
                    <a
                        key={league}
                        href={`/${league}`}
                        className="home-sidebar-leagues-row"
                    >
                        <span className="home-sidebar-leagues-logo">
                            <img src={getLeagueLogoPath(league)} alt="" />
                        </span>
                        <span className="home-sidebar-leagues-details">
                            <span className="text-style-caption-medium color-fig-subtle">
                                {t(`leagues.sections.sports.${sport.id}`)}
                            </span>
                            <span className="text-style-label-semibold color-fig-default">
                                {title}
                            </span>
                        </span>
                        <span className="home-sidebar-leagues-count text-style-label-medium color-fig-subtle">
                            {t('browse.gameCount', { count: games })}
                        </span>
                    </a>
                ))}
            </div>
        </section>
    );
}

export default HomeSidebarLeagues;