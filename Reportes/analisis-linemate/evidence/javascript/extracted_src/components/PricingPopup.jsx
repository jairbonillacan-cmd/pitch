import { useState, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import './PricingPopup.scss'
import { getTheme } from '../react-web-utils';
import Button from './Button';
import ToggleSwitch from "../components/ToggleSwitch";
import { PLANS } from '../pages/Pricing';
import GlobalContext from './GlobalContext';

const PRICING_POPUP_CONTENT = {
    plays: {
        titleKey: 'paywall.generic.title',
        descriptionKey: 'paywall.generic.subtitle',
        image: (theme) => `assets/pricing-popup/${theme}_generic.png`
    },
    opponent_rank: {
        titleKey: 'paywall.sources.opponentRank.title',
        descriptionKey: 'paywall.sources.opponentRank.subtitle',
        image: (theme) => `assets/pricing-popup/${theme}_rank.png`
    },
    starting_pitchers: {
        titleKey: 'paywall.sources.startingPitchers.title',
        descriptionKey: 'paywall.sources.startingPitchers.subtitle',
        image: (theme) => `assets/pricing-popup/${theme}_pitcher.png`
    },
    starting_lineups: {
        titleKey: 'paywall.sources.startingLineups.title',
        descriptionKey: 'paywall.sources.startingLineups.subtitle',
        image: (theme) => `assets/pricing-popup/${theme}_starter.png`
    },
    weather_report: {
        titleKey: 'paywall.sources.weatherReport.title',
        descriptionKey: 'paywall.sources.weatherReport.subtitle',
        image: (theme) => `assets/pricing-popup/${theme}_weather.png`
    },
    injury_impact: {
        titleKey: 'paywall.sources.injuryImpact.title',
        descriptionKey: 'paywall.sources.injuryImpact.subtitle',
        image: (theme) => `assets/pricing-popup/${theme}_injury.png`
    }
}

function PricingPopup({ variant = 'plays', onOpenChange }) {
    const { t } = useTranslation();
    const [annualChecked, setAnnualChecked] = useState(true);
    const context = useContext(GlobalContext);

    const content = PRICING_POPUP_CONTENT[variant] || PRICING_POPUP_CONTENT.plays;
    const contentTitle = t(content.titleKey);
    const contentDescription = t(content.descriptionKey);

    const LINEMATE_PLUS_FEATURES = [
        t('pricing.plans.annual.features.0'),
        t('paywall.comparison.rows.advancedSignalsAndTools'),
        t('paywall.comparison.rows.startingLineups'),
        t('paywall.comparison.rows.injuryImpact'),
        t('paywall.comparison.rows.opponentDefensiveRank'),
        t('paywall.comparison.rows.weatherReports'),
        t('paywall.comparison.rows.startingOpponentPitchers')
    ];

    const handleToggle = () => {
        setAnnualChecked(prev => !prev);
    };

    const annualPlan = PLANS[1];
    const monthlyPlan = PLANS[2];
    const selectedPlan = annualChecked ? annualPlan : monthlyPlan;

    const handleUpgrade = () => {
        selectedPlan.action(context.user, context.userAttributes, context.cookies).onClick();
    };

    const selectedPlanKey = annualChecked ? 'annual' : 'monthly';
    const billingPeriod = t(`pricing.plans.${selectedPlanKey}.billingShort`);
    const selectedPrice = selectedPlan.discountPercentage
        ? `US$${(selectedPlan.price * ((100 - selectedPlan.discountPercentage) / 100)).toFixed(2)}`
        : `US$${selectedPlan.price}`;

    const upgradeText = t('pricing.popup.upgradeForJust', {
        price: selectedPrice,
        billingPeriod
    });

    return (
        <div className='pricing-popup-container'>
            <div className='pricing-popup-text-section'>
                <div className='pricing-popup-header'>
                    <div className='pricing-popup-description'>
                        <p className='text-style-h-3-semibold color-fig-default'>{contentTitle}</p>
                        <p className='text-style-label-normal color-fig-subtle'>{contentDescription}</p>
                    </div>

                    <div className='pricing-popup-billing-slider'>
                        <p className='text-style-label-medium color-fig-default'>{t('pricing.popup.billedAnnually')}</p>
                        <ToggleSwitch id="price" checked={annualChecked} small onChange={handleToggle} />
                        <p className='pricing-popup-badge text-style-caption-semibold'>{t('pricing.popup.savePercent', { percent: annualPlan.discountPercentage.toFixed(0) })}</p>
                    </div>
                </div>

                <div className='pricing-popup-features'>
                    {LINEMATE_PLUS_FEATURES.map((feature) => (
                        <div key={feature} className='pricing-popup-individual-feature text-style-caption-medium'>
                            <img src='assets/check-circle.svg' alt="" />
                            <p>{feature}</p>
                        </div>
                    ))}
                </div>

                <div className='pricing-popup-buttons'>
                    <Button text={upgradeText} typography="md" type="primary" enabled={true} onClick={handleUpgrade} />
                    <Button text={t('pricing.popup.dismiss')} typography="md" type="invisible" enabled={true} onClick={() => onOpenChange(false)} />
                </div>
            </div>

            <div className='pricing-popup-image-section'>
                <img src={content.image(getTheme())} alt={contentTitle} />
            </div>
        </div>
    );
}

export default PricingPopup;