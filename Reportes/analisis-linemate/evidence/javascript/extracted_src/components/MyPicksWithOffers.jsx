import { useState, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import MyPicks from './MyPicks'
import "./MyPicksWithOffers.scss"
import { getLocationAffiliates, hasPremiumAccess } from '../linemate-react-common/src/util';
import GlobalContext from './GlobalContext';
import { getTheme } from '../react-web-utils';
import "./MyPicks.scss"
import SmallOfferCard from './SmallOfferCard';
import BasicDialog from './BasicDialog'
import PricingPopup from './PricingPopup'
import PriceComparison from './PriceComparison';

function MyPicksWithOffers({ myPicksContent, checkoutContent, checkoutTitle, offerType, priceComparison }) {
    const { t } = useTranslation();
    const context = useContext(GlobalContext);
    const checkoutMode = Boolean(checkoutContent);

    const locationAffiliates = getLocationAffiliates(
        context.location?.region?.code,
        context.location?.country?.code,
        context.configuration.affiliateOffers,
        [],
        context.userAttributes?.confirmedProviders || [],
        context.userAttributes?.preferredProviders || [],
        [],
        (context.configuration.advertising?.[context.location?.region?.code]?.[checkoutMode ? 'props' : 'betslip']?.tiers || [])
            .map((tier) => tier?.operator || tier)
            .filter(Boolean)
    );

    const affiliateEntries = Object.entries(locationAffiliates.affiliates || {})
        .map(([operator, offers]) => ({
            operator,
            offers: offerType ? offers.filter((offer) => offer.type === offerType) : offers
        }))
        .filter((entry) => entry.offers.length > 0);

    const [openPricingModal, setOpenPricingModal] = useState(false);

    return (
        <div className="my-picks-with-offers-container">
            <BasicDialog
                open={openPricingModal}
                onOpenChange={setOpenPricingModal}
                content={<PricingPopup variant="plays" onOpenChange={setOpenPricingModal} />}
                additionalClassName="pricing-popup-dialog"
            />

            <MyPicks
                content={checkoutMode ? (
                    <>
                        <div className="my-picks-quickPicks-header">
                            <p className="text-style-label-medium">{checkoutTitle}</p>
                        </div>
                        {checkoutContent}
                    </>
                ) : myPicksContent}
            />

            {priceComparison && <PriceComparison {...priceComparison} />}

            {affiliateEntries.map((entry) => (
                <SmallOfferCard
                    key={entry.operator}
                    element={entry}
                    theme={getTheme()}
                    source={checkoutMode ? 'prediction_markets' : 'betslip'}
                />
            ))}

            {!hasPremiumAccess(context.userAttributes) && (
                <div className="linemate-plus-ad-mini-card" onClick={() => setOpenPricingModal(true)}>
                    <p className="text-style-label-medium" style={{ zIndex: 1 }}>Linemate+</p>
                    <p className="text-style-label-medium" style={{ zIndex: 1 }}>
                        {t('picks.plusPromo.description')}
                    </p>
                    <img
                        src={`assets/linemate_plus_ad_${getTheme()}.png`}
                        className="linemate-plus-ad-card-image"
                        alt=""
                    />
                </div>
            )}
        </div>
    );
}

export default MyPicksWithOffers;
