import React, {useContext} from "react";
import Dialog from "./Dialog";
import Button from "./Button";
import { base64Encode, getRegionPopupCTA, getRegionPopupTitle, updateUserAttributes } from "../linemate-react-common/src/util";
import GlobalContext from "./GlobalContext";
import { SPORTSBOOKS_CONFIG } from "../linemate-react-common/src/constants";
import { getTheme } from "../react-web-utils";
import "./BonusCard.scss";
import { auth } from '../firebase.js';
import { API_HOST } from "../react-web-constants";
import OfferCard from "./OfferCard.jsx";
import { logCustomEvent } from "../analytics";
import { useTranslation } from "react-i18next";

function OfferPopup({ element, openModalPopup, setOpenModalPopup, source }) {
    const { amplitudeInstance, userAttributes, setUserAttributes, league, location } = useContext(GlobalContext);
    const analyticsContext = { amplitudeInstance, userAttributes, league };
    const { t } = useTranslation();

    const operatorId = (element?.operator || element?.image || element?.id || "").toLowerCase()
    const operatorName = SPORTSBOOKS_CONFIG?.[operatorId]?.displayName || ""

    if (!operatorId || !operatorName) {
        return null
    }

    function getCardBody(inDialog) {
        return (
            <OfferCard
                operatorId={operatorId}
                affiliateEntry={element}
                theme={getTheme()}
                onClick={inDialog ? null : () => {
                    logCustomEvent(analyticsContext, "affiliate_card_press", {
                        affiliate: operatorName,
                        source: source
                    });
                    setOpenModalPopup(true)
                }}
            />
        )
    }

    return (
        <Dialog
            open={openModalPopup}
            onOpenChange={(open) => setOpenModalPopup(open)}
            content={
                <div className="bonus-card-popup-wrapper">
                    {getCardBody(true)}
                    <p className="bonus-card-popup-tnc">{element.offers?.[0]?.details}</p>
                </div>
            }
            footer={
                <div className="bonus-card-popup-footer">
                    <div className="bonus-card-popup-footer-existing">
                        <Button
                            enabled={true}
                            text={t('common.actions.alreadyHaveAccount')}
                            type="invisible"
                            typography="md"
                            onClick={() => {
                                logCustomEvent(analyticsContext, "offer_provider_confirmed", {
                                    affiliate: operatorName
                                });
                                if (userAttributes) {
                                    const confirmedProviders = userAttributes?.confirmedProviders || []
                                    confirmedProviders.push(operatorId)
                                    setUserAttributes({...userAttributes, confirmedProviders: confirmedProviders})
                                    auth.currentUser.getIdToken().then((token) => updateUserAttributes(API_HOST, token, {confirmedProviders: confirmedProviders}))
                                }
                                setOpenModalPopup(false)
                            }}
                        />
                    </div>
                    <div className="bonus-card-popup-footer-claim">
                        <Button
                            enabled={true}
                            className="bonus-card-popup-footer-claim"
                            text={getRegionPopupCTA(location.region.code, location.country.code, t)}
                            type="primary"
                            typography="md"
                            onClick={() => {
                                logCustomEvent(analyticsContext, 'offer_claim', {
                                    affiliate: operatorName
                                });
                                window.open(`/affiliate?link=${base64Encode(element.offers?.[0]?.link)}`, '_blank').focus();
                            }}
                        />
                    </div>
                </div>
            }
            title={getRegionPopupTitle(location.region.code, location.country.code, operatorId, t)}
        />
    )
}

export default OfferPopup;
