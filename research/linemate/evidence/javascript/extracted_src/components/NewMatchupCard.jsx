import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { getTeamIdByCode, getTeamLogoPath, getTheme, teamLogoPathOnErrorFallback } from '../react-web-utils'
import GlobalContext from './GlobalContext'
import "./NewMatchupCard.scss"
import { GAMES_FILTER, SUPPORTED_LEAGUES } from '../linemate-react-common/src/constants'
import { base64Encode, getGamesFilterForAPI, getGameTitle, parseDateFromString } from '../linemate-react-common/src/util'

function NewMatchupCard({game, awayTeam, homeTeam, gameTime, gameId, onClick}) {
    const context = useContext(GlobalContext)
    const { t, i18n } = useTranslation()
    const awayTeamId = game?.awayTeamData?.info?.teamId || getTeamIdByCode(context.teams, awayTeam)
    const homeTeamId = game?.homeTeamData?.info?.teamId || getTeamIdByCode(context.teams, homeTeam)

    const date = new Date(gameTime)
    const now = new Date();

    const isToday =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();

    const locale = i18n.language || 'en';

    const datePart = isToday ? t("web.common.today") : date.toLocaleDateString(locale, {
        month: "short",
        day: "2-digit",
    });

    const timePart = date.toLocaleTimeString(locale, {
        hour: "numeric",
        minute: "2-digit",
    });
    let listFeed = "";
    if (game) {
        const gameTitleToGameIdDict = Object.fromEntries([game].map(x => [getGameTitle(context.league, x), x.id]))
        const gameTitleToAnnotationDict = Object.fromEntries([game].map(x => {
            const parsedDate = parseDateFromString(x.timestamp);
            return [getGameTitle(context.league, x), `${parsedDate.dayOfWeekShort} ${parsedDate.formattedTime}`]
        }))
        const initialFilters = {}
        initialFilters[GAMES_FILTER] = getGamesFilterForAPI(gameTitleToGameIdDict, gameTitleToAnnotationDict)
        initialFilters[GAMES_FILTER].selectedValues = [Object.keys(gameTitleToGameIdDict)[0]]
        const feed = base64Encode(JSON.stringify({
            initialFilters: initialFilters,
            filtersToExclude: [GAMES_FILTER]
        }))
        listFeed = feed
    }

    return (
        <div className='matchup-card-container' onClick={() => window.location.href = `/${context.league}/summary/${gameId}?feed=${listFeed}`}>
            <div className='matchup-card-blur'>
                <div className='matchup-card-blur-away' style={{backgroundColor: SUPPORTED_LEAGUES[context.league]?.teams?.colors?.[getTheme()]?.[awayTeam.toLowerCase()]}}/>
                <div className='matchup-card-blur-home' style={{backgroundColor: SUPPORTED_LEAGUES[context.league]?.teams?.colors?.[getTheme()]?.[homeTeam.toLowerCase()]}}/>
            </div>
            <div className='matchup-card-away'>
                <img src={getTeamLogoPath(context.league, awayTeamId)} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, context.league)}/>
                <p className='text-style-label-uppercase-medium'>{awayTeam}</p>
            </div>
            <div className='matchup-card-time'>
                <p className='text-style-caption-medium'>{datePart}</p>
                <p className='text-style-caption-uppercase-medium'>{timePart}</p>
            </div>
            <div className='matchup-card-home'>
                <img src={getTeamLogoPath(context.league, homeTeamId)} onError={({currentTarget}) => teamLogoPathOnErrorFallback(currentTarget, context.league)}/>
                <p className='text-style-label-uppercase-medium'>{homeTeam}</p>
            </div>
        </div>
    )
}

export default NewMatchupCard;
