import { getTeamLogoPath } from "../react-web-utils"
import { getTeamGameResultText, getTeamRecord } from "../linemate-react-common/src/util"
import { SUPPORTED_LEAGUES } from "../linemate-react-common/src/constants"
import { useEffect } from "react"
import './Last5GamesCard.scss'

function Last5GamesCard({league, game}) {
    const logoPath = getTeamLogoPath(league, game.opposingTeamId)
    const dateTimestamp = new Date(game.timestamp)
    const matchDate = dateTimestamp.toLocaleDateString('en-US', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit'
    })
    const sportId = SUPPORTED_LEAGUES[league]?.sport?.id;

    const pointageTerminology =
        sportId === "baseball"
            ? "runs"
            : sportId === "hockey" || sportId === "soccer"
            ? "goals"
            : "points";

    const gameResult = `${game.cumulativeStats.offensive[pointageTerminology]}-${game.cumulativeStats.defensive[pointageTerminology]}`
    const winLossDraw = getTeamGameResultText(league, game)[0]
    let winLossDrawColor = "var(--color-fig-subtle)"
    if (winLossDraw == "W") {
        winLossDrawColor = "var(--color-fig-positive)"
    } else if (winLossDraw == "L") {
        winLossDrawColor = "var(--color-fig-negative)"
    }

    return (
        <> 
            <div className="last-5-games-card-container text-style-label-uppercase-medium">
                <div className="last-5-games-card-logo-date">
                    <img className="last-5-games-team-logo" src={logoPath} alt={`${game.opposingTeam.toUpperCase()}`}></img>
                    <p style={{color: "var(--color-fig-subtle)"}}>{matchDate}</p>
                </div>
                <div className="last-5-games-card-result">
                    <p style={{color: winLossDrawColor}}>{winLossDraw}</p>
                    <p style={{color: "var(--color-fig-default)"}}>{gameResult}</p>
                </div>
            </div>
        </>
    )
}

export default Last5GamesCard;
