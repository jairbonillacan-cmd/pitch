import React, {useState, useEffect, useContext} from "react";
import GlobalContext from "./GlobalContext";
import { SPORTSBOOKS_CONFIG } from "../linemate-react-common/src/constants";
import { getTheme } from "../react-web-utils";
import "./BonusCard.scss";
import { isPaidUser } from "../linemate-react-common/src/util";
import OfferCard from "./OfferCard.jsx";
import OfferPopup from "./OfferPopup.jsx";
import { logCustomEvent, trackAdImpression } from "../analytics";
import useImpressionTracker from "../hooks/useImpressionTracker";

function BonusCard({ element, theme, source = 'home_bonus_section' }) {
    const [openModalPopup, setOpenModalPopup] = useState(false);
    const [currentTheme, setCurrentTheme] = useState(theme != "" ? theme : getTheme());
    const { amplitudeInstance, userAttributes, league } = useContext(GlobalContext);
    const analyticsContext = { amplitudeInstance, userAttributes, league };

    const operatorId = (element?.operator || element?.image || element?.id || "").toLowerCase()
    const operatorName = SPORTSBOOKS_CONFIG?.[operatorId]?.displayName || ""
    const impressionRef = useImpressionTracker({
        enabled: Boolean(operatorId && operatorName && amplitudeInstance),
        onImpression: () => {
            trackAdImpression(analyticsContext, {
                operator: operatorId,
                affiliate: operatorName,
                source,
                additionalProperties: {
                    isPaidUser: isPaidUser(userAttributes)
                }
            });
        }
    });

    function getCardBody(inDialog) {
        return (
            <OfferCard
                ref={inDialog ? null : impressionRef}
                operatorId={operatorId}
                affiliateEntry={element}
                theme={currentTheme}
                onClick={inDialog ? null : () => {
                    logCustomEvent(analyticsContext, "affiliate_card_press", {
                        affiliate: operatorName,
                        source
                    });
                    setOpenModalPopup(true)
                }}
            />
        )
    }

    useEffect(() => {
        if (theme === "") {
            setCurrentTheme(getTheme());
        } else {
            setCurrentTheme(theme);
        }
    }, [theme])

    if (!operatorId || !SPORTSBOOKS_CONFIG?.[operatorId]) {
        return null
    }

    return (
        <>
            {getCardBody(false)}
            <OfferPopup element={element} theme={theme} openModalPopup={openModalPopup} setOpenModalPopup={setOpenModalPopup} source={source}/>
        </>
    )
}

export default BonusCard;
