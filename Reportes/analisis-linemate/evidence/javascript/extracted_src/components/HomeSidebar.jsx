import { useState, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import MyPicks from './MyPicks'
import { getLocationAffiliates, getOffersAffiliateTitle, hasPremiumAccess } from '../linemate-react-common/src/util'
import GlobalContext from './GlobalContext'
import BonusCard from './BonusCard';
import "./HomeSidebar.scss"
import { buildSignupOfferSections, getTheme } from '../react-web-utils';
import SmallOfferCard from './SmallOfferCard';
import BasicDialog from './BasicDialog';
import PricingPopup from './PricingPopup';
import HomeSidebarPromoCard from './HomeSidebar/HomeSidebarPromoCard'
import HomeSidebarTrending from './HomeSidebar/HomeSidebarTrending';
import HomeSidebarLeagues from './HomeSidebar/HomeSidebarLeagues';
import HomeSidebarPredictionMarkets from './HomeSidebar/HomeSidebarPredictionMarkets';
import HomeSidebarNewsletter from './HomeSidebar/HomeSidebarNewsletter';

function SidebarOffersList({ entries, cardType }) {
    const CardComponent = cardType === 'bonus' ? BonusCard : SmallOfferCard;

    return (
        <div className='home-sidebar-offers-list'>
            {entries.map((entry) => (
                <CardComponent key={entry.operator} element={entry} theme={getTheme()} source='home_bonus_section' />
            ))}
        </div>
    )
}

function HomeSidebar({ trendingToday = {} }) {
    const context = useContext(GlobalContext);
    const { t } = useTranslation();
    const assetLeague = ({
        wnba: 'nba',
        ncaab: 'nba',
        ncaaf: 'nfl',
        afl: 'nfl',
        nrl: 'nfl',
        mls: 'epl',
        ucl: 'epl',
        uel: 'epl'
    })[context.league] || context.league;

    const locationAffiliates = getLocationAffiliates(
        context.location?.region?.code,
        context.location?.country?.code,
        context.configuration.affiliateOffers,
        [],
        context.userAttributes?.confirmedProviders || [],
        context.userAttributes?.preferredProviders || [],
        [],
        context.configuration.advertising?.location?.home?.featured?.tiers || []
    )

    const affiliateEntries = Object.entries(locationAffiliates.affiliates || {}).map(([operator, offers]) => ({
        operator,
        offers
    }))

    const topOffers = affiliateEntries.slice(0, 3)
    const topOfferOperators = topOffers.map((entry) => entry.operator)

    const offerSections = buildSignupOfferSections(
        locationAffiliates.offersByOperator,
        topOfferOperators,
        t
    )

    const partnerEntries = Object.entries(locationAffiliates.offersByOperator || {})
        .map(([operator, offers]) => ({
            operator,
            offers: (offers || []).filter((offer) => offer?.type === 'PARTNER')
        }))
        .filter(({ offers }) => offers.length > 0)

    const [openPricingModal, setOpenPricingModal] = useState(false)

    return (
        <div className='home-sidebar-container'>
            <BasicDialog 
                open={openPricingModal}
                onOpenChange={(open) => setOpenPricingModal(open)}
                content={<PricingPopup variant='plays' onOpenChange={(open) => setOpenPricingModal(open)} />}
                additionalClassName={"pricing-popup-dialog"}
            />
            <MyPicks/>
            <HomeSidebarPromoCard
                title={t('home.sidebar.downloadApp')}
                headline={t('home.sidebar.neverMissTrend')}
                buttonText={t('web.footer.download')}
                backgroundImage={`/assets/home/home-download-bg-${getTheme()}.png`}
                image={`/assets/home/home-download-${getTheme()}.png`}
                href="/download"
            />
            {!hasPremiumAccess(context.userAttributes) && (
                <HomeSidebarPromoCard
                    variant="plus"
                    title={t('common.linematePlus')}
                    headline={t('home.sidebar.unlockAnalysis')}
                    buttonText={t('home.sidebar.unlock')}
                    backgroundImage={`/assets/home/bg-${getTheme()}-${assetLeague}.png`}
                    image={`/assets/home/${assetLeague}-${getTheme()}.png`}
                    onClick={() => setOpenPricingModal(true)}
                />
            )}
            <HomeSidebarTrending trendingToday={trendingToday} />

            {topOffers.length > 0 &&
                <div className='home-sidebar-offers'>
                    <p className='text-style-label-semibold'>{t('home.sidebar.topOffers', { type: getOffersAffiliateTitle(context.location.region.code, context.location.country.code, t) })}</p>
                    <SidebarOffersList entries={topOffers} cardType='bonus' />
                </div>
            }
            <HomeSidebarLeagues />
            <HomeSidebarPredictionMarkets />
            <HomeSidebarNewsletter />

            {offerSections.map(({ title, entries }) => (
                <div className='home-sidebar-offers' key={title}>
                    <p className='text-style-label-semibold color-fig-subtle'>{title}</p>
                    <SidebarOffersList entries={entries} cardType='small' />
                </div>
            ))}

            {partnerEntries.length > 0 &&
                <div className='home-sidebar-offers'>
                    <p className='text-style-label-semibold color-fig-subtle'>{t('home.offers.types.PARTNER')}</p>
                    <SidebarOffersList entries={partnerEntries} cardType='small' />
                </div>
            }
        </div>
    )
}

export default HomeSidebar;
