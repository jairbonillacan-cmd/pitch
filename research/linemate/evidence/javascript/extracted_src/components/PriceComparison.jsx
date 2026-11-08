import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import GlobalContext from './GlobalContext';
import SegmentedControl from './SegmentedControl';
import { API_HOST } from '../react-web-constants';
import { SPORTSBOOKS_CONFIG } from '../linemate-react-common/src/constants';
import {
    getBetslipLinks,
    getPreferredOdds
} from '../linemate-react-common/src/util';

function PriceComparison({ market, line, outcome, outcomeType }) {
    const context = useContext(GlobalContext);
    const { t } = useTranslation();
    const [selectedOutcome, setSelectedOutcome] = useState('over');

    const outcomes = outcome
        ? [outcome]
        : ['COVER', 'COVER_YES'].includes(outcomeType)
            ? ['cover']
            : outcomeType === 'YES_NO'
                ? ['yes', 'no']
                : ['over', 'under'];

    const activeOutcome = outcomes.includes(selectedOutcome)
        ? selectedOutcome
        : outcomes[0];

    const preferredProviders = context.resolvedPreferredProviders || [];
    const regionalProviders = context.localizedRegionProviders || [];
    const allowedProviders = preferredProviders.filter((provider) =>
        regionalProviders.length === 0 || regionalProviders.includes(provider)
    );
    const providers = allowedProviders.length ? allowedProviders : preferredProviders;

    const rowsByOutcome = Object.fromEntries(outcomes.map((value) => [
        value,
        [...new Set(providers.map((provider) => provider.toLowerCase()))]
            .map((provider) => {
                const configuration = SPORTSBOOKS_CONFIG[provider];
                const book = market?.books?.[provider]
                    || market?.books?.[configuration?.displayName];
                const bookOutcome = book?.[value];
                const matchesLine = (entry) =>
                    entry?.value != null && Number(entry.value) === Number(line);
                const entry = line == null || matchesLine(bookOutcome?.current)
                    ? bookOutcome?.current
                    : Object.values(bookOutcome?.alternates || {})
                        .find(matchesLine);

                if (!configuration || !entry?.odds) return null;

                const decimalOdds = Number(entry.odds.decimal);
                if (!Number.isFinite(decimalOdds) || decimalOdds <= 0) return null;

                return {
                    provider,
                    name: configuration.displayName || provider,
                    decimalOdds,
                    odds: getPreferredOdds(context.userAttributes, entry.odds, true),
                    operatorData: entry.operatorData
                };
            })
            .filter(Boolean)
            .sort((left, right) => right.decimalOdds - left.decimalOdds)
            .slice(0, 5)
    ]));
    const rows = rowsByOutcome[activeOutcome] || [];
    const hasComparison = Object.values(rowsByOutcome).some((entries) => entries.length > 0);

    async function openCheckout(row) {
        if (!row.operatorData) return;

        const checkoutTab = window.open('about:blank', '_blank');
        if (checkoutTab) checkoutTab.opener = null;

        try {
            const links = await getBetslipLinks(
                API_HOST,
                row.provider,
                [row.operatorData],
                context.location?.country?.code,
                context.location?.region?.code
            );

            if (links?.web) {
                if (checkoutTab) checkoutTab.location.replace(links.web);
                else window.open(links.web, '_blank', 'noopener,noreferrer');
            } else {
                checkoutTab?.close();
            }
        } catch (error) {
            checkoutTab?.close();
            console.error('Unable to open price-comparison checkout', error);
        }
    }

    if (!market || !hasComparison) return null;

    return (
        <section className="my-picks-pick-container price-comparison">
            <div className="my-picks-pick-header price-comparison-header">
                <img
                    src="assets/compare.svg"
                    className="my-picks-pick-header-image"
                    alt=""
                />
                <p className="text-style-body-medium color-fig-default">
                    {t('common.priceComparison')}
                </p>
            </div>

            {outcomes.length > 1 && (
                <div className="price-comparison-selector">
                    <SegmentedControl
                        options={Object.fromEntries(outcomes.map((value) => [
                            value,
                            t(`common.filters.options.outcome.${value}`)
                        ]))}
                        selection={activeOutcome}
                        selectionHandler={setSelectedOutcome}
                        fillWidth
                    />
                </div>
            )}

            <div className="price-comparison-rows">
                {rows.length === 0 && (
                    <p className="price-comparison-empty text-style-label-medium color-fig-subtle">
                        No odds
                    </p>
                )}
                {rows.map((row) => (
                    <button
                        key={row.provider}
                        type="button"
                        className="my-picks-trends-line price-comparison-row"
                        disabled={!row.operatorData}
                        onClick={() => openCheckout(row)}
                    >
                        <span className="price-comparison-provider">
                            <img
                                src={`assets/sportsbooks/${row.provider}.svg`}
                                alt=""
                            />
                            <span className="text-style-label-medium">
                                {row.name}
                            </span>
                            {row.operatorData && (
                                <img
                                    className="price-comparison-external"
                                    src="assets/external.svg"
                                    alt=""
                                />
                            )}
                        </span>
                        <span className="price-comparison-odds">
                            <span className="text-style-label-semibold">
                                {row.odds}
                            </span>
                        </span>
                    </button>
                ))}
            </div>
        </section>
    );
}

export default PriceComparison;