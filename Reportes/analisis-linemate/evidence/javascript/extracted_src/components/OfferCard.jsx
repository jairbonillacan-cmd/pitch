import React, {useState, useEffect} from "react";
import { SPORTSBOOKS_CONFIG } from "../linemate-react-common/src/constants";
import { getTheme } from "../react-web-utils";
import "./OfferCard.scss";

const OfferCard = React.forwardRef(function OfferCard({ operatorId, affiliateEntry, theme, onClick }, ref) {
    const [currentTheme, setCurrentTheme] = useState(theme ?? getTheme());
    const resolvedOperatorId = (operatorId || affiliateEntry?.operator || affiliateEntry?.image || affiliateEntry?.id || "").toLowerCase()
    const operatorConfig = SPORTSBOOKS_CONFIG?.[resolvedOperatorId]
    const operatorName = operatorConfig?.displayName || ""

    useEffect(() => {
        if (theme === "") {
            setCurrentTheme(getTheme());
        } else {
            setCurrentTheme(theme);
        }
    }, [theme])

    if (!operatorConfig) {
        return <></>
    }

    return (
        <div
            ref={ref}
            className={`offer-card-container ${onClick ? 'offer-card-container-clickable' : ''}`}
            onClick={onClick}
            style={{background: `linear-gradient(180deg, ${operatorConfig.gradientColors[currentTheme]})`}}
        >
            <img src={`assets/sportsbook-wordmarks/${currentTheme}/${resolvedOperatorId}.svg`} alt={operatorName} className="offer-card-sportsbook-logo"/>
            <p className="text-style-body-semibold color-fig-default">{affiliateEntry.offers?.[0]?.title || ''}</p>
        </div>
    )
})

export default OfferCard;
