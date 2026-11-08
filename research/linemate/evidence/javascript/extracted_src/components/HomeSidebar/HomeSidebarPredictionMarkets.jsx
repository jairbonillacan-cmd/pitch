import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import GlobalContext from '../GlobalContext';
import PredictionMarketEntry from '../PredictionMarketEntry';
import { API_HOST } from '../../react-web-constants';
import { getPlayerName } from '../../linemate-react-common/src/util';
import { getMarketDescription } from '../../linemate-react-common/src/betting-utils';
import { SPORTSBOOKS_CONFIG } from '../../linemate-react-common/src/constants';
import { canAccessPredictionMarkets, getTeamIdByCode } from '../../react-web-utils';
import './HomeSidebarPredictionMarkets.scss';

function HomeSidebarPredictionMarkets() {
    const context = useContext(GlobalContext);
    const { t, i18n } = useTranslation();
    const [outcomes, setOutcomes] = useState([]);
    const country = context.location?.country?.code;
    const enabled = canAccessPredictionMarkets(
        { country: { code: country } }, context.userAttributes
    );
    const league = context.league;

    useEffect(() => {
        setOutcomes([]);
        if (!enabled || !league) return;
        const controller = new AbortController();

        fetch(`${API_HOST}/api/${league}/v1/prediction/trends?limit=3&sortBy=volume`, {
            signal: controller.signal,
        })
            .then((response) => {
                if (!response.ok) throw new Error(`Prediction markets: ${response.status}`);
                return response.json();
            })
            .then((data) => setOutcomes(Array.isArray(data) ? data.slice(0, 3) : []))
            .catch((error) => {
                if (error.name !== 'AbortError') console.error(error);
            });

        return () => controller.abort();
    }, [enabled, league, country, i18n.language]);

    if (!enabled || outcomes.length === 0) return null;

    return (
        <section className="home-sidebar-prediction-markets">
            <p className="text-style-label-semibold color-fig-subtle">
                {t('home.predictionMarkets.cards.mostVolume.title')}
            </p>
            <div className="home-sidebar-prediction-markets-table">
                {outcomes.map((outcome, index) => {
                    const market = outcome.market || {};
                    const team = market.team || {};
                    const opponent = market.opposingTeam || {};
                    const exchange = String(outcome.exchange || '').toLowerCase();
                    if (!SPORTSBOOKS_CONFIG[exchange]) return null;
                    const metrics = outcome.exchangeTradeMetrics?.[outcome.exchange] || {};
                    const type = market.level === 'player' || market.player ? 'player' : 'team';
                    const entry = {
                        league,
                        teamCode: team.code,
                        teamId: team.teamId || team.id || getTeamIdByCode(context.teams, team.code),
                        opponentCode: opponent.code,
                        opponentTeamId: opponent.teamId || opponent.id || getTeamIdByCode(context.teams, opponent.code),
                        marketId: market.name,
                        subject: type === 'player' ? getPlayerName(market.player) : team.code || outcome.outcome,
                        home: market.isHome,
                        description: getMarketDescription(league, type, outcome.line, outcome.outcome, market, false, t),
                        probability: metrics.probability,
                        exchange,
                        metricText: metrics.volume == null ? '-' : `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(metrics.volume)}`
                    };
                    return (
                        <a
                            key={`${outcome.selectionId || index}-${exchange}`}
                            href={`/${league}/prediction-markets/most-volume?selectedId=${encodeURIComponent(`${outcome.selectionId || market.gameId || market.name || index}-${outcome.exchange || index}`)}`}
                        >
                            <PredictionMarketEntry entry={entry} t={t} locale={i18n.language} />
                        </a>
                    );
                })}
            </div>
        </section>
    );
}

export default HomeSidebarPredictionMarkets;