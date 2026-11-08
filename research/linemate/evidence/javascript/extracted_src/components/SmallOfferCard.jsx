import { useState, useContext } from 'react'
import "./SmallOfferCard.scss"
import { SPORTSBOOKS_CONFIG } from '../linemate-react-common/src/constants';
import OfferPopup from './OfferPopup';
import GlobalContext from './GlobalContext';
import { isPaidUser } from '../linemate-react-common/src/util';
import { logCustomEvent, trackAdImpression } from '../analytics';
import useImpressionTracker from '../hooks/useImpressionTracker';

function SmallOfferCard({ element, theme, source = 'home_bonus_section' }) {
    const [openModalPopup, setOpenModalPopup] = useState(false);
    const context = useContext(GlobalContext);
    const analyticsContext = {
        amplitudeInstance: context.amplitudeInstance,
        userAttributes: context.userAttributes,
        league: context.league
    };

    const operatorId = (element?.operator || element?.image || element?.id || "").toLowerCase()
    const operatorConfig = SPORTSBOOKS_CONFIG?.[operatorId]
    const operatorName = operatorConfig?.displayName || ""
    const impressionRef = useImpressionTracker({
        enabled: Boolean(operatorConfig && context.amplitudeInstance),
        onImpression: () => {
            trackAdImpression(analyticsContext, {
                operator: operatorId,
                affiliate: operatorName,
                source,
                additionalProperties: {
                    isPaidUser: isPaidUser(context.userAttributes)
                }
            });
        }
    });

    if (!operatorConfig) {
        return null
    }

    return (
        <>
            <div
                ref={impressionRef}
                className='small-offer-card-container'
                style={{background: `linear-gradient(270deg, ${operatorConfig.gradientColors[theme]})`}}
                onClick={() => {
                    logCustomEvent(analyticsContext, "affiliate_card_press", {
                        affiliate: operatorName,
                        source
                    });
                    setOpenModalPopup(true)}
                }
            >
                <p className='text-style-label-medium'>{operatorName}</p>
                <p className='text-style-label-semibold'>{element.offers?.[0]?.title || ''}</p>
                <img
                    src={`assets/sportsbook-logos/${operatorId}-${theme}.png`}
                    alt={`${operatorId} logo`}
                    onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = `assets/sportsbook-logos/${operatorId}.png`
                    }}
                />
            </div>
            <OfferPopup element={element} theme={theme} openModalPopup={openModalPopup} setOpenModalPopup={setOpenModalPopup} source={source}/>
        </>
    )
}

export default SmallOfferCard;
