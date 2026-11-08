import React from 'react';

import './Pricing.scss'
import '../components/App.scss'

import GlobalContext from '../components/GlobalContext';
import Button from '../components/Button';
import { isDictEmpty } from '../linemate-react-common/src/util';
import { getStripeCheckoutSessionUrl, getTheme, openStripeBillingPortal } from '../react-web-utils';
import { API_HOST } from '../react-web-constants';
import SegmentedControl from '../components/SegmentedControl';
import { Swiper, SwiperSlide } from 'swiper/react';
import { A11y } from 'swiper/modules';
import 'swiper/css';
import { withTranslation } from 'react-i18next';

const edgeSelections = [
    {label: "Signals", value: "signals", icon: "signal.svg"},
    {label: "Opponent defensive rank", value: "defensive_rank", icon: "trophy.svg"},
    {label: "Injury impact", value: "injury_impact", icon: "injury-no-background.svg"},
    {label: "Weather impact", value: "weather_impact", icon: "stadium.svg"}
]
const ANNUAL_PRICE_ID = '1PL4fXFA68iq99Lmo5lRvopb';
const NEWSLETTER_PROMOTION_CODE_ID = 'promo_1UREwuFA68iq99LmUAD8fjRG';

export const PLANS = [
    {
        title: 'Free',
        price: 0,
        billing: null,
        features: [
            'Daily trending plays',
            'Team & player hit rates',
            'Game logs & performance history'
        ],
        action: (user, userAttributes, cookies) => {
            if (isDictEmpty(userAttributes)) {
                return {
                    text: 'Get started',
                    enabled: true,
                    onClick: () => window.location.href = 'signup?origin=/pricing',
                    type: 'secondary'
                }
            }
            if (userAttributes.accessLevel === 1) {
                return {
                    text: 'Your current plan',
                    enabled: false,
                    onClick: () => {},
                    type: 'secondary'
                }
            }
            return {
                text: 'Change plan',
                enabled: !userAttributes.purchasePlatform || userAttributes.purchasePlatform === "web",
                onClick: () => user.getIdToken().then((token) => openStripeBillingPortal(API_HOST, token)),
                type: 'secondary'
            }
        }
    },
    {
        title: 'Annual',
        price: 149.99,
        discountPercentage: 60.001,
        billing: {
            short: 'year',
            long: 'annually'
        },
        features: [
            'Includes everything in Free plan +',
            'Every play signal and full analysis',
            'Starting lineups, injury impacts, and weather',
            'Exclusive access to every parlay',
            'Deeper insights on all trending parlays',
            'Advanced search filters',
            'Option to select and change odds view'
        ],
        highlighted: true,
        action: (user, userAttributes, cookies, options = {}) => {
            const promotionCodeId = options.promotionCodeId || null;
            const signupUrl = promotionCodeId
                ? `signup?origin=${encodeURIComponent('/pricing?origin=newsletter')}&checkout=${ANNUAL_PRICE_ID}&promotionCodeId=${promotionCodeId}`
                : 'signup?origin=/pricing';

            if (isDictEmpty(userAttributes)) {
                return {
                    text: 'Start your free trial',
                    enabled: true,
                    onClick: () => window.location.href = signupUrl,
                    type: 'primary'
                }
            }
            if (userAttributes.accessLevel === 3) {
                return {
                    text: 'Manage',
                    enabled: !userAttributes.purchasePlatform || userAttributes.purchasePlatform === "web",
                    onClick: () => user.getIdToken().then((token) => openStripeBillingPortal(API_HOST, token)),
                    type: 'secondary'
                }
            }
            return {
                text: 'Upgrade',
                enabled: true,
                onClick: () => {
                    user.getIdToken().then((token) => {
                        getStripeCheckoutSessionUrl(
                            API_HOST,
                            token,
                            ANNUAL_PRICE_ID,
                            null,
                            (checkoutSessionUrl) => {
                                window.location.href = checkoutSessionUrl
                            },
                            cookies.get('_fprom_tid'),
                            promotionCodeId
                        )
                    })
                },
                type: 'primary'
            }
        }
    },
    {
        title: 'Monthly',
        price: 14.99,
        billing: {
            short: 'month',
            long: 'monthly'
        },
        features: [
            'Includes everything in Free plan +',
            'Every play signal and full analysis',
            'Starting lineups, injury impacts, and weather',
            'Exclusive access to every parlay',
            'Deeper insights on all trending parlays',
            'Advanced search filters',
            'Option to select and change odds view'
        ],
        action: (user, userAttributes, cookies) => {
            if (isDictEmpty(userAttributes)) {
                return {
                    text: 'Upgrade',
                    enabled: true,
                    onClick: () => window.location.href = 'signup?origin=/pricing',
                    type: 'secondary'
                }
            }
            if (userAttributes.accessLevel === 3) {
                return {
                    text: 'Manage',
                    enabled: !userAttributes.purchasePlatform || userAttributes.purchasePlatform === "web",
                    onClick: () => user.getIdToken().then((token) => openStripeBillingPortal(API_HOST, token)),
                    type: 'secondary'
                }
            }
            return {
                text: 'Upgrade',
                enabled: true,
                onClick: () => {
                    user.getIdToken().then((token) => {
                        getStripeCheckoutSessionUrl(
                            API_HOST, 
                            token, 
                            '1S57skFA68iq99LmemKir7Gq', 
                            null, 
                            (checkoutSessionUrl) => {
                                window.location.href = checkoutSessionUrl
                            }, 
                            cookies.get('_fprom_tid')
                        )
                    })
                },
                type: 'secondary'
            }
        }
    }
]

export const SHOWCASE_FEATURES = [
    {
        title: 'Combo Trends',
        subtitle: 'Access plays with trending badges, backed by more than 1 statistical edge.',
        image: `assets/${getTheme()}-combo-showcase.png`
    },
    {
        title: 'Parlay Trends',
        subtitle: 'Unlock the same trends-based research, but now for parlays.',
        image: `assets/${getTheme()}-parlay-showcase.png`
    },
    {
        title: 'Premium Filters & Features',
        subtitle: 'Gain access to with/without filters, trends impacted by player injuries, and more.',
        image: `assets/${getTheme()}-injury-showcase.png`
    }
]

// TODO: origin  
class Pricing extends React.Component {

    static contextType = GlobalContext;

    constructor(props) {
        super(props);

        this.planPickerOptions = {
            free: 'Free',
            paid: 'Linemate+'
        }

        this.showcaseToolOptions = {
            lineups: <img src="assets/basketball-outline.svg" alt="Starting lineups" />,
            pitchers: <img src="assets/baseball-outline.svg" alt="Starting pitchers" />
        }

        this.state = {
            planPickerSelection: Object.keys(this.planPickerOptions)[1],
            edgeSelected: edgeSelections[0],
            showcaseToolSelection: 'lineups',
            testimonialsAtStart: true,
            testimonialsAtEnd: false,
            testimonialsActiveIndex: 0,
            width: typeof window !== 'undefined' ? window.innerWidth : 1280
        }

        this.testimonialsSwiper = null;
    }

    componentDidMount() {
        document.title = `${this.props.t('pricing.title')} - Linemate`;
        window.addEventListener("resize", this.handleResize);
    }

    componentWillUnmount() {
        window.removeEventListener("resize", this.handleResize)
    }

    handleResize = () => {
        this.setState({ width: window.innerWidth });
    };

    handleEdgeSelection(edge) {
        this.setState({edgeSelected: edge})
    }

    render() {
        const { t } = this.props;
        const searchParams = new URLSearchParams(window.location.search);
        const isNewsletterOrigin = searchParams.get('origin') === 'newsletter';
        const width = this.state.width;
        const isTabletView = width >= 551 && width <= 999;
        const isDesktopView = width >= 1000;
        const useStackedComparisonTables = width <= 550;
        const planKeys = ['free', 'annual', 'monthly'];
        const visiblePlanKeys = isNewsletterOrigin ? ['annual'] : planKeys;
        const plans = PLANS.map((plan, index) => {
            const planKey = planKeys[index];

            return {
                ...plan,
                planKey,
                title: t(
                    planKey === 'free'
                        ? 'paywall.comparison.free'
                        : `paywall.plans.${planKey}`
                ),
                billing: plan.billing
                    ? {
                        short: t(`pricing.plans.${planKey}.billingShort`),
                        long: t(`pricing.plans.${planKey}.billingLong`)
                    }
                    : null,
                features: t(`pricing.plans.${planKey}.features`, { returnObjects: true })
            };
        })
        .filter((plan) => visiblePlanKeys.includes(plan.planKey))
        .sort((a, b) => visiblePlanKeys.indexOf(a.planKey) - visiblePlanKeys.indexOf(b.planKey));

        const getPricingActionText = (actionText) => {
            const actionTextMap = {
                'Get started': t('common.actions.getStarted'),
                'Your current plan': t('pricing.actions.currentPlan'),
                'Change plan': t('preferences.subscription.changePlan'),
                'Start your free trial': t('paywall.cta.startYourFreeTrial'),
                Manage: t('pricing.actions.manage'),
                Upgrade: t('pricing.actions.upgrade')
            };

            return actionTextMap[actionText] || actionText;
        };
        const showcaseToolSelection = this.state.showcaseToolSelection;
        const showcaseToolImage = showcaseToolSelection === 'pitchers' ? 'pitcher' : 'lineups';
        const showcaseToolTitle = showcaseToolSelection === 'pitchers'
            ? t('paywall.features.startingPitchers.title')
            : t('paywall.features.startingLineups.title');
        const showcaseToolSubtitle = showcaseToolSelection === 'pitchers'
            ? t('paywall.features.startingPitchers.description')
            : t('paywall.features.startingLineups.description')

        const showcaseCards = [
            {
                key: 'injury',
                title: t('paywall.features.injuryImpact.title'),
                subtitle: t('paywall.features.injuryImpact.description'),
                image: `assets/pricing/pricing-injury-${getTheme()}.png`,
                alt: t('paywall.features.injuryImpact.title')
            },
            {
                key: 'rank',
                title: t('paywall.features.opponentRank.title'),
                subtitle: t('paywall.features.opponentRank.description'),
                image: `assets/pricing/pricing-rank-${getTheme()}.png`,
                alt: t('paywall.features.opponentRank.title')
            },
            {
                key: 'starting-tools',
                title: showcaseToolTitle,
                subtitle: showcaseToolSubtitle,
                image: `assets/pricing/pricing-${showcaseToolImage}-${getTheme()}.png`,
                alt: showcaseToolTitle,
                hasToggle: true
            },
            {
                key: 'weather',
                title: t('paywall.features.weatherReport.title'),
                subtitle: t('paywall.features.weatherReport.description'),
                image: `assets/pricing/pricing-weather-${getTheme()}.png`,
                alt: t('paywall.features.weatherReport.title')
            }
        ];
        const testimonials = t('pricing.testimonials.items', { returnObjects: true });

        const comparisonRows = [
            { label: t('paywall.comparison.rows.dailyTeamAndPlayerTrends'), free: true, premium: true },
            { label: t('paywall.comparison.rows.dailyParlayTrends'), free: true, premium: true },
            { label: t('paywall.comparison.rows.teamAndPlayerPropsTool'), free: true, premium: true },
            { label: t('paywall.comparison.rows.statsAndStandings'), free: true, premium: true },
            { label: t('paywall.comparison.rows.dailyCheatsheets'), free: true, premium: true },
            { label: t('paywall.comparison.rows.advancedSignalsAndTools'), free: false, premium: true },
            { label: t('paywall.comparison.rows.startingLineups'), free: false, premium: true },
            { label: t('paywall.comparison.rows.injuryImpact'), free: false, premium: true },
            { label: t('paywall.comparison.rows.opponentDefensiveRank'), free: false, premium: true },
            { label: t('paywall.comparison.rows.weatherReports'), free: false, premium: true },
            { label: t('paywall.comparison.rows.startingOpponentPitchers'), free: false, premium: true }
        ];

        const freePlanAction = PLANS[0].action(this.context.user, this.context.userAttributes, this.context.cookies);
        const premiumPlanAction = PLANS[1].action(this.context.user, this.context.userAttributes, this.context.cookies);

        const fullVisibleTestimonialsCount =
            isDesktopView ? 4 : isTabletView ? 3 : 1;

        const comparisonPlans = [
            {
                key: 'free',
                title: t('paywall.comparison.free'),
                action: freePlanAction,
                buttonText: t('common.actions.getStarted'),
                buttonType: 'secondary',
                getValue: (row) => row.free
            },
            {
                key: 'premium',
                title: t('pricing.comparison.premium'),
                action: premiumPlanAction,
                buttonText: t('paywall.cta.startYourFreeTrial'),
                buttonType: 'primary',
                getValue: (row) => row.premium
            }
        ];

        return (
            <div className='pricing-page-container'>
                <div className='pricing-page-intro'>
                    <div className='pricing-page-hero-header'>
                        <h1 className='pricing-page-hero-title text-style-h-1-semibold color-fig-default'>
                            {t(isNewsletterOrigin ? 'pricing.hero.newsletterTitle' : 'pricing.hero.title')}
                        </h1>
                        <p className='pricing-page-hero-subtitle text-style-h-3-medium color-fig-subtle'>
                            {t(isNewsletterOrigin ? 'pricing.hero.newsletterSubtitle' : 'pricing.hero.subtitle')}
                        </p>
                    </div>

                    <div className='pricing-page-tier-grid' data-newsletter-origin={isNewsletterOrigin ? 'true' : 'false'}>
                        {plans.map((plan, index) => {
                            const planAction = plan.action(this.context.user, this.context.userAttributes, this.context.cookies, {
                                promotionCodeId: isNewsletterOrigin && plan.planKey === 'annual' ? NEWSLETTER_PROMOTION_CODE_ID : null
                            });

                            const overrideButtonText =
                                plan.planKey === 'annual'
                                    ? (isNewsletterOrigin ? t('paywall.cta.claimYourCode', 'Claim your code') : t('paywall.cta.startYourFreeTrial'))
                                    : t('common.actions.getStarted');

                            const buttonText =
                                ['Manage', 'Change plan', 'Your current plan'].includes(planAction.text)
                                    ? getPricingActionText(planAction.text)
                                    : overrideButtonText;

                            const discountedPrice = plan.discountPercentage
                                ? (plan.price * ((100 - plan.discountPercentage) / 100)).toFixed(2)
                                : null;

                            return (
                                <div
                                    key={plan.planKey}
                                    className='pricing-page-tier-card'
                                    data-highlighted={plan.highlighted ? 'true' : 'false'}
                                    data-has-divider={index !== plans.length - 1}
                                    data-plan-title={plan.planKey}
                                >
                                    <div className='pricing-page-tier-card-header'>
                                        <div className='pricing-page-tier-card-title-row'>
                                            <p
                                                className={`text-style-h-1-medium ${
                                                    plan.planKey === 'annual' ? 'color-fig-default' : 'color-fig-subtle'
                                                }`}
                                            >
                                                {plan.title}
                                            </p>
                                            {plan.discountPercentage && (
                                                <div className='pricing-page-tier-card-badge'>
                                                    <p className='text-style-caption-medium'>
                                                        {t('pricing.badges.mostPopular')}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className='pricing-page-tier-card-price-block'>
                                            {!plan.discountPercentage && (
                                                <>
                                                    <div className='pricing-page-tier-card-price-row'>
                                                        <p className='pricing-page-tier-card-price text-style-h-3-medium color-fig-default'>
                                                            {`${plan.price > 0 ? 'US' : ''}$${plan.price}`}
                                                            {plan.billing ? `/${plan.billing.short}` : ''}
                                                        </p>
                                                    </div>
                                                    <div className='pricing-page-tier-card-savings-row' />
                                                </>
                                            )}

                                            {plan.discountPercentage && (
                                                <>
                                                    {isNewsletterOrigin && plan.planKey === 'annual' ? (
                                                        <>
                                                            <div className='pricing-page-tier-card-price-row'>
                                                                <p className='pricing-page-tier-card-price text-style-h-3-medium color-fig-default'>
                                                                    {t('pricing.hero.newsletterPriceLine')}
                                                                </p>
                                                            </div>
                                                            <div className='pricing-page-tier-card-savings-row'>
                                                                <p className='text-style-label-normal color-fig-subtle'>
                                                                    {t('pricing.hero.newsletterRenewLine')}
                                                                </p>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className='pricing-page-tier-card-price-row'>
                                                                <p className='pricing-page-tier-card-price-inline-secondary text-style-h-3-medium color-fig-disabled'>
                                                                    <s>{`US$${plan.price}`}</s>
                                                                </p>
                                                                <p className='pricing-page-tier-card-price text-style-h-3-medium color-fig-default'>
                                                                    {`US$${discountedPrice}/${plan.billing.short}`}
                                                                </p>
                                                            </div>
                                                            <div className='pricing-page-tier-card-savings-row'>
                                                                <p className='text-style-label-normal color-fig-accent'>
                                                                    {t('pricing.badges.annualSavings')}
                                                                </p>
                                                            </div>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className='pricing-page-tier-card-features'>
                                        {plan.features.map((feature) => (
                                            <div key={feature} className='pricing-page-tier-card-feature'>
                                                <img src='assets/check-circle.svg' alt='check-circle' />
                                                <p className='text-style-label-normal color-fig-default'>{feature}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className='pricing-page-tier-card-button-wrapper'>
                                        <Button
                                            text={buttonText}
                                            typography="xl"
                                            type={plan.planKey === 'annual' ? 'primary' : 'secondary'}
                                            enabled={planAction.enabled}
                                            onClick={planAction.onClick}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                        {isNewsletterOrigin && (
                            <div className='pricing-page-tier-newsletter-image-column'>
                                <img
                                    className='pricing-page-tier-newsletter-image'
                                    src={`assets/pricing/full-picture-${getTheme()}.png`}
                                    alt='Linemate pricing full picture'
                                />
                            </div>
                        )}
                    </div>
                    <div className='pricing-page-vectors-section'>
                        <p className='pricing-page-vectors-copy text-style-h-4-medium color-fig-subtle'>
                            {t('pricing.operators.prefix')} <span className='color-fig-default'>{t('pricing.operators.highlight')}</span> {t('pricing.operators.suffix')}
                        </p>

                        <div className='pricing-page-vectors-row'>
                            {Array.from({ length: 9 }, (_, index) => (
                                <img
                                    key={`pricing-vector-${index + 1}`}
                                    src={`assets/pricing/vector${index + 1}-${getTheme()}.svg`}
                                    alt={`pricing vector ${index + 1}`}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {!isNewsletterOrigin && (
                    <div className='pricing-page-full-picture-section'>
                        <div className='pricing-page-full-picture-section-inner'>
                            <p className='pricing-page-full-picture-title text-style-h-1-semibold color-fig-default'>
                                {t('pricing.sections.fullPicture')}
                            </p>
                            <img
                                className='pricing-page-full-picture-image'
                                src={`assets/pricing/full-picture-${getTheme()}.png`}
                                alt='Linemate pricing full picture'
                            />
                        </div>
                    </div>
                )}

                <div className='pricing-page-tools-showcase-section'>
                    <div className='pricing-page-tools-showcase-inner'>
                        <p className='pricing-page-tools-showcase-title text-style-h-1-semibold color-fig-default'>
                            {t('pricing.sections.signals')}
                        </p>

                        <div className='pricing-page-tools-showcase-grid-shell'>
                            <div className='pricing-page-tools-showcase-grid'>
                                {showcaseCards.map((card) => (
                                    <div
                                        key={card.key}
                                        className={`pricing-page-tools-showcase-card pricing-page-tools-showcase-card-${card.key}`}
                                    >
                                        <div className='pricing-page-tools-showcase-card-image-wrap'>
                                            <img
                                                className='pricing-page-tools-showcase-card-image'
                                                src={card.image}
                                                alt={card.alt}
                                            />
                                        </div>

                                        <div className='pricing-page-tools-showcase-card-header-row'>
                                            <div className='pricing-page-tools-showcase-card-text-block'>
                                                <p className='pricing-page-tools-showcase-card-title text-style-label-semibold color-fig-default'>
                                                    {card.title}
                                                </p>
                                                <p className='pricing-page-tools-showcase-card-copy text-style-label-normal color-fig-subtle'>
                                                    {card.subtitle}
                                                </p>
                                            </div>

                                            {card.hasToggle && (
                                                <div className='pricing-page-tools-showcase-toggle'>
                                                    <SegmentedControl
                                                        options={this.showcaseToolOptions}
                                                        selection={showcaseToolSelection}
                                                        selectionHandler={(selection) => this.setState({ showcaseToolSelection: selection })}
                                                        contentType="icon"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {!isNewsletterOrigin && (
                <div className='pricing-page-testimonials-section'>
                    <div className='pricing-page-testimonials-inner'>
                        <div className='pricing-page-testimonials-header'>
                            <div className='pricing-page-testimonials-header-part'>
                                <p className='text-style-h-1-semibold color-fig-default'>
                                    <span dangerouslySetInnerHTML={{ __html: t('pricing.testimonials.trusted') }} />
                                </p>
                            </div>

                            <div className='pricing-page-testimonials-header-part'>
                                <p className='text-style-h-1-semibold color-fig-default'>
                                    <span dangerouslySetInnerHTML={{ __html: t('pricing.testimonials.betslips') }} />
                                </p>
                            </div>

                            <div className='pricing-page-testimonials-header-rating'>
                                <img
                                    src='assets/pricing/pricing-testimonials-ratings.png'
                                    alt='Testimonials rating'
                                />
                            </div>
                        </div>

                        <div className='pricing-page-testimonials-carousel-shell'>
                            <Swiper
                                modules={[A11y]}
                                watchSlidesProgress={true}
                                onSwiper={(swiper) => {
                                    this.testimonialsSwiper = swiper;
                                    this.setState({
                                        testimonialsAtStart: swiper.isBeginning,
                                        testimonialsAtEnd: swiper.isEnd,
                                        testimonialsActiveIndex: swiper.activeIndex
                                    });
                                }}
                                onSlideChange={(swiper) => {
                                    this.setState({
                                        testimonialsAtStart: swiper.isBeginning,
                                        testimonialsAtEnd: swiper.isEnd,
                                        testimonialsActiveIndex: swiper.activeIndex
                                    });
                                }}
                                onBreakpoint={(swiper) => {
                                    this.setState({
                                        testimonialsAtStart: swiper.isBeginning,
                                        testimonialsAtEnd: swiper.isEnd,
                                        testimonialsActiveIndex: swiper.activeIndex
                                    });
                                }}
                                speed={400}
                                spaceBetween={0}
                                slidesPerView={1.08}
                                breakpoints={{
                                    551: { slidesPerView: 2.15 },
                                    800: { slidesPerView: 3.15 },
                                    1000: { slidesPerView: 4.15 }
                                }}
                            >
                                {testimonials.map((testimonial, index) => {
                                    const isFirstCard = index === 0;
                                    const isLastCard = index === testimonials.length - 1;

                                    return (
                                        <SwiperSlide key={`${testimonial.title}-${index}`}>
                                            <div
                                                className={`pricing-page-testimonials-card${isFirstCard ? ' pricing-page-testimonials-card-first' : ''}${isLastCard ? ' pricing-page-testimonials-card-last' : ''}`}
                                            >
                                                <div className='pricing-page-testimonials-stars'>
                                                    {Array.from({ length: 5 }, (_, starIndex) => (
                                                        <img
                                                            key={`${testimonial.title}-star-${starIndex}`}
                                                            src='assets/star.svg'
                                                            alt='star'
                                                        />
                                                    ))}
                                                </div>

                                                <p className='pricing-page-testimonials-card-title text-style-label-semibold color-fig-default'>
                                                    {testimonial.title}
                                                </p>

                                                <p className='pricing-page-testimonials-card-description text-style-caption-normal color-fig-subtle'>
                                                    {testimonial.description}
                                                </p>

                                                <p className='pricing-page-testimonials-card-source text-style-label-medium color-fig-subtle'>
                                                    {t('onboarding.socialProof.reviewer')}
                                                </p>
                                            </div>
                                        </SwiperSlide>
                                    );
                                })}
                            </Swiper>

                            {!this.state.testimonialsAtEnd && (
                                <div className='pricing-page-testimonials-gradient pricing-page-testimonials-gradient-right' />
                            )}
                        </div>

                        <div className='pricing-page-testimonials-controls'>
                            <button
                                type='button'
                                className={`pricing-page-testimonials-nav-button ${this.state.testimonialsAtStart ? 'pricing-page-testimonials-nav-button-disabled' : ''}`}
                                disabled={this.state.testimonialsAtStart}
                                onClick={() => this.testimonialsSwiper?.slidePrev()}
                            >
                                <img src='assets/chevron-left-medium.svg' alt={t('pricing.testimonials.previous')} />
                            </button>

                            <button
                                type='button'
                                className={`pricing-page-testimonials-nav-button ${this.state.testimonialsAtEnd ? 'pricing-page-testimonials-nav-button-disabled' : ''}`}
                                disabled={this.state.testimonialsAtEnd}
                                onClick={() => this.testimonialsSwiper?.slideNext()}
                            >
                                <img src='assets/chevron-right-medium.svg' alt={t('pricing.testimonials.next')} />
                            </button>
                        </div>
                    </div>
                </div>
                )}

                <div className='pricing-page-comparison-section'>
                    <div className='pricing-page-comparison-inner'>
                        {!useStackedComparisonTables && (
                            <div className='pricing-page-comparison-table-shell'>
                                <div className='pricing-page-comparison-table-header pricing-page-comparison-table-row'>
                                    <div className='pricing-page-comparison-table-cell pricing-page-comparison-table-cell-feature'>
                                        <p className='text-style-h-1-medium color-fig-default'>{t('paywall.comparison.title')}</p>
                                    </div>

                                    <div className='pricing-page-comparison-table-cell pricing-page-comparison-table-cell-plan'>
                                        <p className='text-style-h-1-medium color-fig-default'>{t('paywall.comparison.free')}</p>
                                    </div>

                                    <div className='pricing-page-comparison-table-cell pricing-page-comparison-table-cell-plan'>
                                        <p className='text-style-h-1-medium color-fig-default'>{t('pricing.comparison.premium')}</p>
                                    </div>
                                </div>

                                {comparisonRows.map((row) => (
                                    <div key={row.label} className='pricing-page-comparison-table-row'>
                                        <div className='pricing-page-comparison-table-cell pricing-page-comparison-table-cell-feature'>
                                            <p className='text-style-label-normal color-fig-default'>{row.label}</p>
                                        </div>

                                        <div className='pricing-page-comparison-table-cell pricing-page-comparison-table-cell-plan pricing-page-comparison-table-cell-plan-image'>
                                            <img
                                                src={row.free ? 'assets/check-circle.svg' : 'assets/close.svg'}
                                                alt={row.free ? t('pricing.comparison.included') : t('pricing.comparison.notIncluded')}
                                            />
                                        </div>

                                        <div className='pricing-page-comparison-table-cell pricing-page-comparison-table-cell-plan pricing-page-comparison-table-cell-plan-image'>
                                            <img
                                                src={row.premium ? 'assets/check-circle.svg' : 'assets/close.svg'}
                                                 alt={row.premium ? t('pricing.comparison.included') : t('pricing.comparison.notIncluded')}
                                            />
                                        </div>
                                    </div>
                                ))}

                                <div className='pricing-page-comparison-table-footer pricing-page-comparison-table-row'>
                                    <div className='pricing-page-comparison-table-cell pricing-page-comparison-table-cell-feature' />

                                    <div className='pricing-page-comparison-table-cell pricing-page-comparison-table-cell-plan pricing-page-comparison-table-cell-button'>
                                        <div className='pricing-page-comparison-table-button-wrapper'>
                                            <Button
                                                text={t('common.actions.getStarted')}
                                                typography='lg'
                                                type='secondary'
                                                enabled={freePlanAction.enabled}
                                                onClick={freePlanAction.onClick}
                                            />
                                        </div>
                                    </div>

                                    <div className='pricing-page-comparison-table-cell pricing-page-comparison-table-cell-plan pricing-page-comparison-table-cell-button'>
                                        <div className='pricing-page-comparison-table-button-wrapper'>
                                            <Button
                                                text={t('paywall.cta.startYourFreeTrial')}
                                                typography='lg'
                                                type='primary'
                                                enabled={premiumPlanAction.enabled}
                                                onClick={premiumPlanAction.onClick}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {useStackedComparisonTables && (
                            <div className='pricing-page-comparison-mobile-stack'>
                                {comparisonPlans.map((plan) => (
                                    <div key={plan.key} className='pricing-page-comparison-mobile-table'>
                                        <div className='pricing-page-comparison-mobile-header'>
                                            <p className='text-style-h-1-medium color-fig-default'>{plan.title}</p>
                                        </div>

                                        <div className='pricing-page-comparison-mobile-rows'>
                                            {comparisonRows.map((row) => (
                                                <div key={`${plan.key}-${row.label}`} className='pricing-page-comparison-mobile-row'>
                                                    <p className='text-style-label-normal color-fig-default'>{row.label}</p>
                                                    <img
                                                        src={plan.getValue(row) ? 'assets/check-circle.svg' : 'assets/close.svg'}
                                                        alt={plan.getValue(row) ? t('pricing.comparison.included') : t('pricing.comparison.notIncluded')}
                                                    />
                                                </div>
                                            ))}
                                        </div>

                                        <div className='pricing-page-comparison-mobile-button'>
                                            <div className='pricing-page-comparison-table-button-wrapper'>
                                                <Button
                                                    text={plan.buttonText}
                                                    typography='lg'
                                                    type={plan.buttonType}
                                                    enabled={plan.action.enabled}
                                                    onClick={plan.action.onClick}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )
    }

}

export default withTranslation()(Pricing);