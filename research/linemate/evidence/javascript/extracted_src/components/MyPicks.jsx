import React, {useState, useEffect, useContext} from "react";
import { getMarketDescription } from "../linemate-react-common/src/betting-utils";
import { useTranslation } from "react-i18next";
import "./MyPicks.scss"
import GlobalContext from "./GlobalContext";
import { getTeamLogoPath, getTheme, teamLogoPathOnErrorFallback, shouldUseRoundTeamLogoBackground } from "../react-web-utils";
import { FEATURE_BETSLIP, SUPPORTED_LEAGUES } from "../linemate-react-common/src/constants";
import Button from "./Button.jsx"
import Dialog from "./Dialog.jsx";
import PicksSidebar from "./PicksSidebar.jsx";
import BetslipImportZone from "./BetslipImportZone.jsx";


function MyPicks({content}) {
    const context = useContext(GlobalContext)
    const { t } = useTranslation()
    const [expandedPicks, setExpandedPicks] = useState(false);
    const [picksDrawerOpen, setPicksDrawerOpen] = useState(false)
    const [hovered, setHovered] = useState(false)
    const betslipSize = Object.values(context.betslip.groupedLegs).flatMap(league => Object.values(league)).reduce((sum, arr) => sum + arr.length, 0)

    const handleRemoveLine = (lineToRemove) => {
        context.removeLegsFromBetslip([lineToRemove])
    }

    useEffect(() => {
        if (betslipSize > 0) {
            setExpandedPicks(true)
        }
    }, [betslipSize])

    const isBetslipEnabled = context?.enabledFeatures?.has(FEATURE_BETSLIP)
    if (!isBetslipEnabled) {
        return (<></>)
    }
    return(
        <>
            <div>
                <div className="my-picks-pick-container">
                    <div className="text-style-body-medium my-picks-pick-header-container">
                        <div className="my-picks-pick-header" onClick={() => setExpandedPicks(prev => !prev)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} 
                            style={{
                                ...(hovered
                                    ? !content && !expandedPicks
                                        ? { borderRadius: "11px" }
                                        : {
                                            borderTopLeftRadius: "11px",
                                            borderTopRightRadius: "11px",
                                        }
                                    : {})
                            }}>
                            <img src="assets/picks.svg" className="my-picks-pick-header-image"/>
                            <p style={{color: "var(--color-fig-default)"}}>{t("picks.title")}</p>
                            <p style={{color: "var(--color-fig-subtle)"}}>{betslipSize}</p>
                            {expandedPicks ?
                            <img src="assets/arrow-down.svg" className="my-picks-pick-header-image my-picks-pick-header-arrow-expand"/>
                            :
                            <img src="assets/arrow-right.svg" className="my-picks-pick-header-image my-picks-pick-header-arrow-expand"/>
                            }
                        </div>
                        {expandedPicks ? 
                            betslipSize > 0 ?
                                <div className="my-picks-betslip-container">
                                    {
                                        Object.values(context.betslip.groupedLegs).flatMap(games => 
                                            Object.entries(games).map(([gameId, allGames]) => (
                                                <>
                                                <div key={gameId} className="my-picks-betslip-game"> 
                                                    <p className="my-picks-betslip-game-header text-style-caption-uppercase-medium">{`${gameId.split('-')[1]} @ ${gameId.split('-')[2]}`}</p>

                                                    {allGames.map((singleLine, index) => {
                                                        const isLast = index === allGames.length - 1
                                                        const useRoundBackground = shouldUseRoundTeamLogoBackground(singleLine.league);
                                                        return (
                                                            <div key={index} className={`my-picks-betslip-game-line text-style-caption-medium ${!isLast ? "has-connector" : ""}`}>
                                                                <div className="my-picks-betslip-game-line-logo-slip">
                                                                    <img
                                                                        src={getTeamLogoPath(singleLine.league, singleLine.team)}
                                                                        style={{
                                                                            backgroundColor: useRoundBackground
                                                                            ? SUPPORTED_LEAGUES[singleLine.league]?.teams?.colors?.[getTheme()]?.[singleLine.team.code.toLowerCase()]
                                                                            : "transparent",
                                                                            borderRadius: useRoundBackground ? "200px" : 0,
                                                                        }}
                                                                        onError={({ currentTarget }) => teamLogoPathOnErrorFallback(currentTarget, context.league)}
                                                                    />
                                                                    <p>{`${singleLine.type === "player" ? `${singleLine.player.firstName[0]}. ${singleLine.player.lastName}` : singleLine.team.code}: ${getMarketDescription(singleLine.league, singleLine.type, singleLine.line, singleLine.outcome, singleLine.market, singleLine?.alternate, t)}`}</p>
                                                                </div>
                                                                <div className="my-picks-betslip-line-minus-wrapper" onClick={() => {handleRemoveLine(singleLine)}}>
                                                                    <img key={index} src="assets/minus.svg" className="my-picks-betslip-line-minus"/>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                                </>
                                            ))
                                        )
                                    }

                                    <Dialog
                                        className='navigation-bar-picks-modal'
                                        open={picksDrawerOpen}
                                        onOpenChange={(open) => setPicksDrawerOpen(open)}
                                        title={null}
                                        content={<PicksSidebar onClose={() => setPicksDrawerOpen(false)}/>}
                                        footer={null}
                                    />
                                    <div style={{padding: "8px 16px 16px 16px", height: "52px"}}>
                                        <Button 
                                            text={t("common.actions.continue")}
                                            typography="md"
                                            type="primary"
                                            enabled="true"
                                            onClick={() => setPicksDrawerOpen(true)}
                                        />
                                    </div>
                                </div> 
                                :
                                <div>
                                    <div className="my-picks-no-picks-selected">
                                        <BetslipImportZone
                                            dialogClassName='betslip-import-dialog'
                                            renderTrigger={({ dragging, openPicker, onDragOver, onDragLeave, onDrop, hiddenInput }) => (
                                                <>
                                                    <div
                                                        className={`betslip-import-zone-trigger${dragging ? ' betslip-import-zone-trigger-dragging' : ''}`}
                                                        onClick={openPicker}
                                                        onDragOver={onDragOver}
                                                        onDragLeave={onDragLeave}
                                                        onDrop={onDrop}
                                                        role='button'
                                                        tabIndex={0}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Enter' || event.key === ' ') {
                                                                event.preventDefault()
                                                                openPicker()
                                                            }
                                                        }}
                                                    >
                                                        <img
                                                            className='betslip-import-zone-trigger-icon'
                                                            src='assets/upload.svg'
                                                            alt={t("picks.actions.importPhoto")}
                                                        />
                                                        <p className="text-style-caption-medium color-fig-subtle">{t("picks.imageImport.dropzoneBody")}</p>
                                                        <p className="text-style-caption-normal color-fig-subtle">
                                                            {t("picks.imageImport.dropzoneCta")}
                                                        </p>
                                                    </div>

                                                    {hiddenInput}
                                                </>
                                            )}
                                        />
                                    </div>
                                    {!content &&
                                        <div className="my-picks-no-picks-selected-button-wrapper">
                                            <Button 
                                                text={t("picks.actions.findTrends")}
                                                typography="sm"
                                                type="secondary"
                                                enabled="true"
                                                href={`/${context.league}/trends`}
                                            />
                                        </div>
                                    }
                                </div>
                            :null
                            
                        }
                    </div>
                        {content &&
                            <div className="my-picks-quickPicks">
                                {content}
                            </div>
                        }
                    
                </div>
            </div>
        </>
    )
}

export default MyPicks;
