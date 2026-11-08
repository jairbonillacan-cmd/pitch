import React from 'react';
import { withTranslation } from 'react-i18next';
import i18n from '../i18n';
import PredictionMarketGraph from '../components/PredictionMarketGraph';

import './Trends.scss';
import './Props.scss';
import './PredictionMarkets.scss';

import GlobalContext from '../components/GlobalContext';
import { API_HOST } from '../react-web-constants';
import { buildQueryParams, filtersToQueryParamsDict, getBetTypeOptionsForAPI, getBetslipLinks, getGameTitle, getGamesFilterForAPI, getMultipleBetTypeFilterForAPI, getPlayerName, parseDateFromString } from '../linemate-react-common/src/util';
import { FILTER_KEYS } from '../linemate-react-common/src/filter-config';
import { getMarketDescription } from '../linemate-react-common/src/betting-utils';
import { SPORTSBOOKS_CONFIG, SUPPORTED_LEAGUES } from '../linemate-react-common/src/constants';
import {
    getTeamIdByCode,
    getTeamLogoPath,
    getTheme,
    shouldUseRoundTeamLogoBackground,
    teamLogoPathOnErrorFallback
} from '../react-web-utils';
import ListComponent from '../components/ListComponent';
import PredictionMarketEntry from '../components/PredictionMarketEntry';
import MyPicksWithOffers from '../components/MyPicksWithOffers';
import QuickPicksSection from '../components/QuickPicksSection';
import QuickpicksLeg from '../components/QuickpicksLeg';
import Chip from '../components/Chip';
import Loader from '../components/Loader';
import Footer from '../components/Footer';
import { logCustomEvent } from '../analytics';

export const PREDICTION_MARKET_TOOLS = [
    { slug: 'most-volume', metric: 'volume', titleKey: 'mostVolume' },
    { slug: 'largest-trades', metric: 'largestTrade', titleKey: 'largestTrades' },
    { slug: 'biggest-movers', metric: 'priceMovement', titleKey: 'biggestMovers' },
    { slug: 'markets-split', metric: 'marketSplit', titleKey: 'marketsSplit' },
    { slug: 'most-activity', metric: 'tradeCount', titleKey: 'mostActivity' }
];

const formatNumber = (value, maximumFractionDigits = 0) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(Number(value));

function formatMetric(metric, value, t) {
    if (value == null || !Number.isFinite(Number(value))) return '-';
    if (metric === 'volume' || metric === 'largestTrade') {
        return `$${formatNumber(value)}`;
    }
    if (metric === 'tradeCount') {
        return t('home.predictionMarkets.values.trades', { count: formatNumber(value) });
    }
    return t('home.predictionMarkets.values.points', {
        count: formatNumber(Math.abs(Number(value)) * 100, 1)
    });
}

function getExchangeWidget(entry, exchange, theme, t) {
    const provider = exchange?.toLowerCase();
    if (provider !== 'polymarket' && provider !== 'kalshi') return null;

    const book = entry.books?.[provider]
        || entry.books?.[SPORTSBOOKS_CONFIG?.[provider]?.displayName];
    const operatorData = book?.[entry.outcome]?.current?.operatorData;

    if (provider === 'polymarket') {
        if (!operatorData?.eventSlug) return null;

        const params = new URLSearchParams({
            market: operatorData.eventSlug,
            theme,
            border: 'true',
            liveactivity: 'true',
            height: '300'
        });

        return {
            src: `https://embed.polymarket.com/sports?${params}`,
            title: `${t('home.predictionMarkets.analysis.title')} - Polymarket`,
            provider
        };
    }

    if (!operatorData?.marketId) return null;

    const params = new URLSearchParams({
        widget_size: 'large',
        period: 'all'
    });
    if (theme === 'dark') params.set('colorTheme', 'dark');
    params.set('utm_medium', 'widget');

    return {
        src: `https://widgets.kalshi.com/external-widgets/events/${encodeURIComponent(operatorData.marketId)}?${params}`,
        title: `${t('home.predictionMarkets.analysis.title')} - Kalshi`,
        provider
    };
}

function ExchangeWidget({ widget }) {
    const containerRef = React.useRef(null);
    const [size, setSize] = React.useState(null);
    const [loadedSrc, setLoadedSrc] = React.useState(null);

    React.useEffect(() => {
        if (widget.provider !== 'polymarket') return;

        const container = containerRef.current;
        const widthSource = container.parentElement;
        let frame;

        const updateWidth = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const width = Math.round(widthSource.clientWidth);
                if (width > 0) {
                    setSize((previous) =>
                        previous?.width === width
                            ? previous
                            : { width, height: 300 }
                    );
                }
            });
        };

        const observer = new ResizeObserver(updateWidth);
        observer.observe(widthSource);
        updateWidth();

        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [widget.provider]);

    let src = widget.src;
    if (widget.provider === 'polymarket') {
        src = null;
        if (size) {
            const url = new URL(widget.src);
            url.searchParams.set('width', String(size.width));
            url.searchParams.set('height', String(size.height));
            src = url.toString();
        }
    }

    const loaded = src !== null && loadedSrc === src;

    return (
        <div
            ref={containerRef}
            className={`prediction-markets-graph prediction-markets-graph-${widget.provider}`}
        >
            {!loaded && (
                <div className="prediction-markets-graph-loader">
                    <Loader />
                </div>
            )}
            {src && (
                <iframe
                    key={src}
                    title={widget.title}
                    src={src}
                    width={size?.width}
                    height={size?.height}
                    loading="lazy"
                    onLoad={() => setLoadedSrc(src)}
                    className={loaded ? '' : 'prediction-markets-graph-loading'}
                />
            )}
        </div>
    );
}

function buildPredictionMarketFilters(context) {
    const games = context.currentGames?.length
        ? context.currentGames
        : (context.upcomingGames || []);

    const gameIds = Object.fromEntries(
        games.map((game) => [getGameTitle(context.league, game), game.id])
    );
    const annotations = Object.fromEntries(
        games.map((game) => {
            const date = parseDateFromString(game.timestamp);
            return [
                getGameTitle(context.league, game),
                `${date.dayOfWeekShort} ${date.formattedTime}`
            ];
        })
    );

    return {
        [FILTER_KEYS.GAMES]: getGamesFilterForAPI(gameIds, annotations),
        [FILTER_KEYS.BET_TYPE]: getMultipleBetTypeFilterForAPI({
            ...getBetTypeOptionsForAPI(context.league, 'player'),
            ...getBetTypeOptionsForAPI(context.league, 'team')
        })
    };
}

class PredictionMarkets extends React.Component {
    static contextType = GlobalContext;

    state = {
        markets: [],
        loading: true,
        error: false,
        selectedId: null,
        selectedExchange: null,
        filters: null
    };

    componentDidMount() {
        this.initialSelectedId = new URLSearchParams(window.location.search).get('selectedId');
        this.loadedLeague = this.context.league;
        this.loadedTool = this.getTool().slug;

        const filters = buildPredictionMarketFilters(this.context);
        this.setState({ filters }, () => this.loadMarkets(filters));
    }

    componentDidUpdate(prevProps) {
        const tool = this.getTool();
        if (this.loadedLeague !== this.context.league) {
            const filters = buildPredictionMarketFilters(this.context);
            this.setState({ filters }, () => this.loadMarkets(filters));
        } else if (this.loadedTool !== tool.slug) {
            this.loadMarkets();
        } else if (prevProps.i18n.language !== this.props.i18n.language) {
            this.loadMarkets(this.state.filters, true);
        }
    }

    getTool() {
        const slug = window.location.pathname.split('/').filter(Boolean).pop();
        return PREDICTION_MARKET_TOOLS.find((tool) => tool.slug === slug)
            || PREDICTION_MARKET_TOOLS[0];
    }

    async loadMarkets(filters = this.state.filters, preserveSelection = true) {
        const league = this.context.league;
        const tool = this.getTool();
        const requestId = this.marketRequestId = (this.marketRequestId || 0) + 1;
        const requestedId = preserveSelection
            ? this.state.selectedId || this.initialSelectedId
            : this.initialSelectedId;
        this.loadedLeague = league;
        this.loadedTool = tool.slug;
        this.setState({
            loading: true,
            error: false,
            markets: [],
            selectedId: requestedId
        });

        const title = this.props.t(`home.predictionMarkets.cards.${tool.titleKey}.title`);
        document.title = `${title} - Linemate`;

        try {
            const query = buildQueryParams({
                limit: 50,
                sortBy: tool.metric,
                ...filtersToQueryParamsDict(filters || {})
            });
            const response = await fetch(`${API_HOST}/api/${league}/v1/prediction/trends?${query}`);
            if (!response.ok) throw new Error(`Prediction markets request failed: ${response.status}`);

            const outcomes = await response.json();
            const markets = (Array.isArray(outcomes) ? outcomes : [])
                .filter((outcome) => SPORTSBOOKS_CONFIG?.[String(outcome.exchange || '').toLowerCase()])
                .map((outcome, index) => {
                    const market = outcome.market || {};
                    const team = market.team || {};
                    const opponent = market.opposingTeam || {};
                    const type = market.level === 'player' || market.player ? 'player' : 'team';
                    const metrics = outcome.exchangeTradeMetrics?.[outcome.exchange] || {};
                    let description = market.name || '';

                    try {
                        description = getMarketDescription(
                            league, type, outcome.line, outcome.outcome,
                            market, false, this.props.t
                        ) || description;
                    } catch (error) {
                        // Keep the market name for unsupported market types.
                    }

                    return {
                        id: `${outcome.selectionId || market.gameId || market.name || index}-${outcome.exchange || index}`,
                        teamCode: team.code,
                        teamId: team.teamId || team.id || getTeamIdByCode(this.context.teams, team.code),
                        opponentTeamId: opponent.teamId || opponent.id || getTeamIdByCode(this.context.teams, opponent.code),
                        marketId: market.name,
                        gameId: market.gameId,
                        type,
                        playerName: type === 'player' ? getPlayerName(market.player) : null,
                        exchangeTradeMetrics: outcome.exchangeTradeMetrics,
                        subject: type === 'player'
                            ? getPlayerName(market.player)
                            : team.code || outcome.outcome,
                        opponentCode: opponent.code,
                        home: market.isHome,
                        description,
                        probability: metrics.probability,
                        aggregateTradeMetrics: outcome.aggregateTradeMetrics,
                        metric: metrics[tool.metric],
                        books: market.books,
                        outcome: outcome.outcome,
                        line: outcome.line,
                        exchange: String(outcome.exchange).toLowerCase()
                    };
                })
                .sort((a, b) =>
                    Math.abs(Number(b.metric ?? -Infinity)) - Math.abs(Number(a.metric ?? -Infinity))
                );

            if (requestId === this.marketRequestId && this.loadedLeague === league && this.loadedTool === tool.slug) {
                this.initialSelectedId = null;

                this.setState({
                    markets,
                    selectedId: markets.some((market) => market.id === requestedId)
                        ? requestedId
                        : markets[0]?.id || null,
                    loading: false
                });
            }
        } catch (error) {
            console.error('Unable to load prediction markets', error);
            if (requestId === this.marketRequestId && this.loadedLeague === league && this.loadedTool === tool.slug) {
                this.setState({ loading: false, error: true });
            }
        }
    }

    async openCheckout(entry) {
        const provider = entry.exchange;
        const providerOutcome = entry.books?.[provider]?.[entry.outcome]
            || entry.books?.[SPORTSBOOKS_CONFIG?.[provider]?.displayName]?.[entry.outcome];

        const operatorData = entry.line == null || entry.line === providerOutcome?.current?.value
            ? providerOutcome?.current?.operatorData
            : Object.values(providerOutcome?.alternates || {})
                .find((alternate) => alternate?.value === entry.line)
                ?.operatorData;
        logCustomEvent(this.context, 'predictionMarketQuickCheckoutPressed', {
            operator: provider,
            source: 'quick_checkout',
            source_screen: 'market_analysis',
            market_tool: this.getTool().slug,
            market_id: entry.marketId,
            game_id: entry.gameId,
            market_type: entry.type,
            outcome: entry.outcome,
            line: entry.line,
            team_id: entry.teamId,
            opponent_team_id: entry.opponentTeamId,
            player_name: entry.playerName
        });
        // Open during the click event so the browser does not block the new tab.
        const checkoutTab = window.open('about:blank', '_blank');
        try {
            const links = await getBetslipLinks(
                API_HOST,
                provider,
                operatorData ? [operatorData] : [],
                this.context.location?.country?.code,
                this.context.location?.region?.code
            );

            if (links?.web) {
                if (checkoutTab) checkoutTab.location.replace(links.web);
                else window.location.assign(links.web);
            } else {
                checkoutTab?.close();
                console.warn('No prediction-market checkout link available');
            }
        } catch (error) {
            checkoutTab?.close();
            console.error('Unable to open prediction-market checkout', error);
        }
    }

    render() {
        const { t } = this.props;
        const tool = this.getTool();
        const title = t(`home.predictionMarkets.cards.${tool.titleKey}.title`);
        const entries = this.state.markets.map((market) => ({
            ...market,
            league: this.context.league,
            metricText: formatMetric(tool.metric, market.metric, t)
        }));
        const selectedEntry = entries.find((entry) => entry.id === this.state.selectedId);

        const tabs = {
            market: {
                entries,
                initialLoadInProgress: this.state.loading,
                loadingBatch: false,
                endReached: !this.state.loading && !this.state.error
            }
        };

        return (
            <div className="trends-page-container prediction-markets-page">
                <div className="props-page-wrapper">
                    <div className="trends-page-props-list-wrapper">
                        <ListComponent
                            title={title}
                            showGamesFilter={true}
                            pickerOptions={{ market: title }}
                            pickerSelection="market"
                            tabs={tabs}
                            listFilters={{ market: this.state.filters || {} }}
                            setListFilters={(nextFilters) => this.setState({ filters: nextFilters.market })}
                            fetchBatch={(_, __, ___, ____, nextFilters) =>
                                this.loadMarkets(nextFilters?.market || this.state.filters)
                            }
                            customFeed={{ cards: [] }}
                            haveCards={entries.length > 0}
                            emptyStateMode="props"
                            renderList={() => (
                                <div className="trends-page-list-items">
                                    {this.state.loading && (
                                        <p className="prediction-markets-message">
                                            {t('home.predictionMarkets.status.loading')}
                                        </p>
                                    )}
                                    {this.state.error && (
                                        <p className="prediction-markets-message">
                                            {t('home.predictionMarkets.status.loadError')}
                                        </p>
                                    )}
                                    {entries.map((entry) => (
                                        <div
                                            key={entry.id}
                                            className="props-entry"
                                            onClick={() => this.setState({ selectedId: entry.id })}
                                        >
                                            <PredictionMarketEntry
                                                entry={entry}
                                                selected={this.state.selectedId === entry.id}
                                                showMovement={tool.metric === 'priceMovement'}
                                                t={t}
                                                locale={i18n.language}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        />
                    </div>
                    <div className="trends-page-details">
                        {this.state.selectedId && (() => {
                            const selected = entries.find((entry) => entry.id === this.state.selectedId);
                            if (!selected) return null;

                            const teamColor = SUPPORTED_LEAGUES[this.context.league]
                                ?.teams?.colors?.[getTheme()]?.[selected.teamCode?.toLowerCase()];
                            const logo = getTeamLogoPath(this.context.league, selected.teamId);

                            return (
                                <div className="prediction-markets-header">
                                    <div className="prediction-markets-header-content">
                                        <div
                                            className="team-icon"
                                            style={{
                                                backgroundColor: shouldUseRoundTeamLogoBackground(this.context.league)
                                                    ? teamColor
                                                    : 'transparent'
                                            }}
                                        >
                                            <img
                                                src={logo}
                                                alt={selected.teamCode || ''}
                                                onError={({ currentTarget }) =>
                                                    teamLogoPathOnErrorFallback(currentTarget, this.context.league)
                                                }
                                            />
                                        </div>
                                        <div className="prediction-markets-header-title">
                                            <h2 className="text-style-h-3-semibold color-fig-default">
                                                {selected.subject}:
                                            </h2>{' '}
                                            <span className="text-style-h-3-medium color-fig-subtle">
                                                {selected.description}
                                            </span>
                                        </div>
                                        {selected.opponentCode && (
                                            <span className="text-style-h-4-normal color-fig-subtle">
                                                {selected.home
                                                    ? t('home.advancedTools.vsOpponent', { opponent: selected.opponentCode })
                                                    : `@ ${selected.opponentCode}`}
                                            </span>
                                        )}
                                    </div>

                                    <div className="trend-details-blur-section" aria-hidden="true">
                                        <div className="trend-details-blur-item">
                                            <div
                                                className="trend-details-blur"
                                                style={{ backgroundColor: teamColor }}
                                            />
                                            <img
                                                className="trend-details-blur-logo"
                                                src={logo}
                                                alt=""
                                                onError={({ currentTarget }) =>
                                                    teamLogoPathOnErrorFallback(currentTarget, this.context.league)
                                                }
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                        <div className="prediction-markets-details-scroll">
                        <div className="prediction-markets-details-body">
                            <div className="prediction-markets-details-main">
                                {selectedEntry && (() => {
                                    const exchanges = Object.entries(selectedEntry.exchangeTradeMetrics || {})
                                        .filter(([exchange]) =>
                                            SPORTSBOOKS_CONFIG?.[exchange.toLowerCase()]
                                        );
                                    const activeExchange = exchanges.find(
                                        ([exchange]) => exchange.toLowerCase() === this.state.selectedExchange
                                    ) || exchanges[0];
                                    const multipleExchanges = exchanges.length > 1;
                                    const widget = activeExchange
                                        ? getExchangeWidget(
                                            selectedEntry,
                                            activeExchange[0],
                                            this.context.theme || getTheme(),
                                            t
                                        )
                                        : null;
                                    const columns = [
                                        ['volume', 'volume'],
                                        ['movement', 'priceMovement'],
                                        ['marketSplit', 'marketSplit'],
                                        ['largestTrade', 'largestTrade'],
                                        ['activity', 'tradeCount']
                                    ];

                                    const renderMetrics = (metrics, allExchanges = false) => (
                                        <div className="prediction-markets-metrics-columns">
                                            {columns
                                                .filter(([, metric]) => !allExchanges || (metric !== 'priceMovement' && metric !== 'marketSplit'))
                                                .map(([label, metric]) => (
                                                <div className="prediction-markets-metrics-column" key={metric}>
                                                    <span className="text-style-label-semibold color-fig-subtle">
                                                        {t(`home.predictionMarkets.analysis.rows.${label}`)}
                                                    </span>
                                                    <span className={`text-style-body-tabular-medium color-fig-default${metric === 'priceMovement' ? ' prediction-markets-movement-value' : ''}`}>
                                                        {metric === 'priceMovement' &&
                                                            Number.isFinite(Number(metrics?.priceMovement)) &&
                                                            Number(metrics.priceMovement) !== 0 && (
                                                                <img
                                                                    src="/assets/arrow-up.svg"
                                                                    className={Number(metrics.priceMovement) < 0 ? 'prediction-markets-movement-arrow prediction-markets-movement-arrow-down' : 'prediction-markets-movement-arrow'}
                                                                    alt=""
                                                                />
                                                            )}
                                                        {formatMetric(metric, metrics?.[metric], t)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    );

                                    return (
                                        <>
                                            {multipleExchanges && (
                                                <section className="prediction-markets-all-exchanges">
                                                    <h3 className="text-style-h-3-medium color-fig-default">
                                                        {t('home.predictionMarkets.analysis.allExchanges')}
                                                    </h3>
                                                    {renderMetrics(selectedEntry.aggregateTradeMetrics, true)}
                                                </section>
                                            )}

                                            {activeExchange && (
                                                <section className="prediction-markets-per-exchange">
                                                    {multipleExchanges && (
                                                        <>
                                                            <h3 className="text-style-h-3-medium color-fig-default">
                                                                {t('home.predictionMarkets.analysis.perExchange')}
                                                            </h3>
                                                            <div className="prediction-markets-exchange-chips">
                                                                {exchanges.map(([exchange]) => {
                                                                    const id = exchange.toLowerCase();
                                                                    return (
                                                                        <Chip
                                                                            key={id}
                                                                            text={SPORTSBOOKS_CONFIG[id].displayName || exchange}
                                                                            size="sm"
                                                                            variant="pill"
                                                                            selected={activeExchange[0] === exchange}
                                                                            onClick={() => this.setState({ selectedExchange: id })}
                                                                        />
                                                                    );
                                                                })}
                                                            </div>
                                                        </>
                                                    )}
                                                    {renderMetrics(activeExchange[1])}
                                                    {widget ? (
                                                        <ExchangeWidget key={widget.src} widget={widget} />
                                                    ) : (
                                                        <PredictionMarketGraph
                                                            key={`${selectedEntry.id}-${activeExchange[0]}`}
                                                            metrics={activeExchange[1]}
                                                            theme={this.context.theme || getTheme()}
                                                            locale={i18n.language}
                                                        />
                                                    )}
                                                </section>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                            {selectedEntry && (
                                <aside className="prediction-markets-details-sidebar">
                                    <MyPicksWithOffers
                                        checkoutTitle={t('web.common.checkout')}
                                        offerType="PREDICTION_SIGNUP"
                                        checkoutContent={
                                            <QuickPicksSection
                                                arrayOfContent={[
                                                    <QuickpicksLeg
                                                        key={selectedEntry.id}
                                                        header={selectedEntry.subject}
                                                        label={selectedEntry.description}
                                                        formattedOdds={
                                                            selectedEntry.probability == null
                                                                ? '-'
                                                                : new Intl.NumberFormat(i18n.language, {
                                                                    style: 'percent',
                                                                    maximumFractionDigits: 0
                                                                }).format(Number(selectedEntry.probability))
                                                        }
                                                        bookName={selectedEntry.exchange}
                                                        disabled={!selectedEntry.exchange}
                                                        onClick={() => this.openCheckout(selectedEntry)}
                                                    />
                                                ]}
                                            />
                                        }
                                    />
                                </aside>
                            )}
                        </div>
                        <Footer />
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export default withTranslation()(PredictionMarkets);