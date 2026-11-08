import React, { useContext, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Buffer } from 'buffer'

import './BetslipImportZone.scss'

import GlobalContext from './GlobalContext'
import Dialog from './Dialog'
import Button from './Button'
import BetslipScanningLoader from './BetslipScanningLoader'

import { SUPPORTED_LEAGUES } from '../linemate-react-common/src/constants'
import { getBetslipLegKey, getMarketDescriptionInfo } from '../linemate-react-common/src/betting-utils'
import { analyzeImageV1, getBookEntryBasedOnBestOdds, jsonOrDefault } from '../linemate-react-common/src/util'
import { API_HOST } from '../react-web-constants'
import { getTeamLogoPath, getTheme, shouldUseRoundTeamLogoBackground, teamLogoPathOnErrorFallback } from '../react-web-utils'

const normalizeImportedLeg = (leg) => {
    const resolvedTrendId = leg?.trendId || (Array.isArray(leg?.trendIds) && leg.trendIds.length > 0 ? leg.trendIds[0] : null)

    return {
        ...leg,
        trendId: resolvedTrendId
    }
}

const getResolvedLegTrendId = (leg) => {
    return leg?.trendId || (Array.isArray(leg?.trendIds) && leg.trendIds.length > 0 ? leg.trendIds[0] : null)
}

const groupImportedLegs = (legs) => {
    const groupedLegs = {}

    ;(legs || []).forEach((leg) => {
        const sectionKey = `${leg.league}:${leg.gameId}`
        if (!groupedLegs[sectionKey]) {
            groupedLegs[sectionKey] = []
        }
        groupedLegs[sectionKey].push(leg)
    })

    return Object.values(groupedLegs)
}

const buildImportedTrendsHref = (league, importedTrendsKey, title, selectedTrendIndex = 0) => {
    const feed = {
        title,
        includeFilters: false,
        importedTrendsKey,
        importedAnalysis: true,
        disableProfileNavigation: true,
    }

    return `/${league}/trends?feed=${encodeURIComponent(
        Buffer.from(JSON.stringify(feed)).toString('base64')
    )}&tabs=${encodeURIComponent(JSON.stringify(['player']))}&tab=player&index=${selectedTrendIndex}`
}

function BetslipImportZone({
    renderTrigger,
    dialogClassName = 'betslip-import-dialog',
}) {
    const context = useContext(GlobalContext)
    const { t } = useTranslation()
    const importPhotoInputRef = useRef(null)
    const lastImportedPhotoFileRef = useRef(null)

    const [importPhotoDragging, setImportPhotoDragging] = useState(false)
    const [importPhotoLoading, setImportPhotoLoading] = useState(false)
    const [importedPhotoLegs, setImportedPhotoLegs] = useState([])
    const [importedPhotoError, setImportedPhotoError] = useState(null)
    const [importPhotoModalOpen, setImportPhotoModalOpen] = useState(false)
    const [importPhotoModalStage, setImportPhotoModalStage] = useState('scanning')
    const [importPhotoPreviewUrl, setImportPhotoPreviewUrl] = useState(null)
    const [importPhotoAction, setImportPhotoAction] = useState(null)

    const importedLegSections = groupImportedLegs(importedPhotoLegs)

    const openImportPhotoPicker = () => {
        importPhotoInputRef.current?.click()
    }

    const readFileAsBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()

            reader.onload = () => {
                const result = reader.result || ''
                const base64 = typeof result === 'string' ? result.split(',')[1] : null

                if (!base64) {
                    reject(new Error('Unable to read image as base64'))
                    return
                }

                resolve(base64)
            }

            reader.onerror = () => reject(reader.error || new Error('Unable to read image file'))
            reader.readAsDataURL(file)
        })
    }

    const closeImportPhotoModal = () => {
        if (importPhotoPreviewUrl) {
            URL.revokeObjectURL(importPhotoPreviewUrl)
        }

        lastImportedPhotoFileRef.current = null

        setImportPhotoModalOpen(false)
        setImportPhotoModalStage('scanning')
        setImportPhotoPreviewUrl(null)
        setImportPhotoLoading(false)
        setImportedPhotoLegs([])
        setImportedPhotoError(null)
        setImportPhotoAction(null)
    }

    const handleImportPhotoDragOver = (event) => {
        event.preventDefault()
        if (!importPhotoDragging) {
            setImportPhotoDragging(true)
        }
    }

    const handleImportPhotoDragLeave = (event) => {
        event.preventDefault()
        setImportPhotoDragging(false)
    }

    const resolveImportedLegToTrend = (leg) => {
        const resolvedTrendId = getResolvedLegTrendId(leg)

        if (!resolvedTrendId) {
            return Promise.resolve({
                ...leg,
                signals: leg.signals || [],
                impactingInjuries: leg.impactingInjuries || []
            })
        }

        return fetch(`${API_HOST}/api/${leg.league || context.league}/v1/trends/straights/${resolvedTrendId}`)
            .then((response) => jsonOrDefault(response, null))
            .then((trendResponse) =>
                trendResponse
                    ? (() => {
                        const mergedMarket = {
                            ...trendResponse.market,
                            ...leg.market,
                            books: trendResponse.market?.books || leg.market?.books,
                        }

                        const resolvedOutcome = leg.outcome ?? trendResponse.outcome
                        const resolvedLine = leg.line ?? trendResponse.line
                        const resolvedAlternate = leg.alternate ?? trendResponse.alternate

                        const resolvedBook =
                            leg.book ||
                            leg.operator ||
                            leg.sportsbook ||
                            trendResponse.book ||
                            (
                                mergedMarket?.books
                                    ? getBookEntryBasedOnBestOdds(
                                        mergedMarket.books,
                                        resolvedOutcome,
                                        resolvedLine,
                                        context.resolvedPreferredProviders,
                                        resolvedAlternate
                                    )
                                    : null
                            )

                        const resolvedOdds =
                            leg.odds ||
                            (
                                resolvedBook
                                    ? (
                                        resolvedAlternate
                                            ? mergedMarket?.books?.[resolvedBook]?.[resolvedOutcome]?.alternates?.[resolvedLine]?.odds
                                            : mergedMarket?.books?.[resolvedBook]?.[resolvedOutcome]?.current?.odds
                                    )
                                    : null
                            )

                        return {
                            ...trendResponse,
                            ...leg,
                            market: mergedMarket,
                            team: leg.team || trendResponse.team,
                            opposingTeam: leg.opposingTeam || trendResponse.opposingTeam,
                            player: leg.player || trendResponse.player,
                            line: resolvedLine,
                            outcome: resolvedOutcome,
                            home: leg.home ?? trendResponse.home,
                            gameId: leg.gameId ?? trendResponse.gameId,
                            type: leg.type || trendResponse.type,
                            alternate: resolvedAlternate,
                            book: resolvedBook,
                            odds: resolvedOdds,
                            league: leg.league || trendResponse.league,
                            trendId: leg.trendId || trendResponse.trendId || trendResponse.id,
                            signals: trendResponse.signals || leg.signals || [],
                            impactingInjuries: trendResponse.impactingInjuries || leg.impactingInjuries || [],
                        }
                    })()
                    : {
                        ...leg,
                        signals: leg.signals || [],
                        impactingInjuries: leg.impactingInjuries || []
                    }
            )
            .catch(() => ({
                ...leg,
                signals: leg.signals || [],
                impactingInjuries: leg.impactingInjuries || []
            }))
    }

    const handleAnalyzeImportedLegs = () => {
        if (importedPhotoLegs.length === 0 || importPhotoAction) {
            return
        }

        setImportPhotoAction('analyze')

        Promise.all(importedPhotoLegs.map(resolveImportedLegToTrend))
            .then((resolvedTrends) => {
                if (resolvedTrends.length === 0) {
                    setImportPhotoAction(null)
                    return
                }

                const targetLeague =
                    resolvedTrends[0]?.league ||
                    importedPhotoLegs[0]?.league ||
                    context.league

                const importedTrendsKey = `betslip-import-trends-${Date.now()}`
                sessionStorage.setItem(importedTrendsKey, JSON.stringify(resolvedTrends))

                window.location.href = buildImportedTrendsHref(
                    targetLeague,
                    importedTrendsKey,
                    t('picks.imageImport.importedPicks'),
                    0
                )
            })
            .catch((error) => {
                console.error(error)
                setImportPhotoAction(null)
            })
    }

    const handleAddImportedLegsToMyPicks = () => {
        if (importedPhotoLegs.length === 0 || importPhotoAction) {
            return
        }

        setImportPhotoAction('add')

        context.addLegsToBetslip(importedPhotoLegs, () => {
            closeImportPhotoModal()
        })
    }

    const handleRemoveImportedLeg = (legToRemove) => {
        const legKeyToRemove = getBetslipLegKey(legToRemove.league, legToRemove)

        setImportedPhotoLegs((previousLegs) =>
            previousLegs.filter(
                (leg) => getBetslipLegKey(leg.league, leg) !== legKeyToRemove
            )
        )
    }

    const renderImportedPhotoLeg = (leg, index, sectionLength) => {
        const marketDescriptionInfo = getMarketDescriptionInfo(
            leg.league,
            leg.type,
            leg.line,
            leg.outcome,
            leg.market,
            leg?.alternate,
            t
        )

        const isLast = index === sectionLength - 1
        const useRoundBackground = shouldUseRoundTeamLogoBackground(leg.league)

        return (
            <div
                key={getBetslipLegKey(leg.league, leg)}
                className={`betslip-import-results-game-line text-style-label-medium ${!isLast ? 'has-connector' : ''}`}
            >
                <div className='betslip-import-results-game-line-logo-slip'>
                    <img
                        src={getTeamLogoPath(leg.league, leg.team)}
                        alt={leg.team.code}
                        style={{
                            backgroundColor: useRoundBackground
                                ? SUPPORTED_LEAGUES[leg.league]?.teams?.colors?.[getTheme()]?.[leg.team.code.toLowerCase()]
                                : 'transparent',
                            borderRadius: useRoundBackground ? '200px' : 0,
                        }}
                        onError={({ currentTarget }) => teamLogoPathOnErrorFallback(currentTarget, context.league)}
                    />
                    <p>
                        {`${leg?.player ? `${leg.player.firstName[0]}. ${leg.player.lastName}` : leg.team.code}: ${marketDescriptionInfo.description}`}
                    </p>
                </div>
                <div className='betslip-import-results-line-minus-wrapper'>
                    <Button
                        icon='assets/minus.svg'
                        type='invisible'
                        enabled={!importPhotoAction}
                        onClick={() => handleRemoveImportedLeg(leg)}
                    />
                </div>
            </div>
        )
    }

    const handleImagePickerResponse = async (files, uploadMethod) => {
        const firstFile = files?.[0]

        if (!firstFile) {
            console.error('No image selected')
            return
        }

        lastImportedPhotoFileRef.current = firstFile

        if (importPhotoPreviewUrl) {
            URL.revokeObjectURL(importPhotoPreviewUrl)
        }

        const previewUrl = URL.createObjectURL(firstFile)

        setImportPhotoDragging(false)
        setImportPhotoLoading(true)
        setImportedPhotoLegs([])
        setImportedPhotoError(null)
        setImportPhotoModalOpen(true)
        setImportPhotoModalStage('scanning')
        setImportPhotoPreviewUrl(previewUrl)
        setImportPhotoAction(null)

        try {
            const base64Image = await readFileAsBase64(firstFile)
            let legs = {}
            const analysisResponse = await analyzeImageV1(
                API_HOST,
                base64Image,
                context.preferredProviders,
                ['betslip_analysis']
            )

            if (analysisResponse?.action === 'betslip_analysis') {
                legs = analysisResponse?.data?.matches || []
            }

            const normalizedLegs = (legs || []).map(normalizeImportedLeg)

            setImportPhotoLoading(false)
            setImportedPhotoLegs(normalizedLegs)
            setImportedPhotoError(null)
            setImportPhotoModalStage('results')
        } catch (error) {
            console.error(error)
            setImportPhotoLoading(false)
            setImportedPhotoError(error)
            setImportedPhotoLegs([])
            setImportPhotoModalStage('results')
        }
    }

    const handleImportPhotoChange = (event) => {
        const files = Array.from(event.target.files || [])
        handleImagePickerResponse(files, 'gallery')
        event.target.value = ''
    }

    const handleImportPhotoDrop = (event) => {
        event.preventDefault()
        const files = Array.from(event.dataTransfer?.files || [])
        setImportPhotoDragging(false)
        handleImagePickerResponse(files, 'drag_drop')
    }

    const hiddenInput = (
        <input
            ref={importPhotoInputRef}
            type='file'
            accept='image/*'
            style={{ display: 'none' }}
            onChange={handleImportPhotoChange}
        />
    )

    return (
        <>
            {renderTrigger({
                dragging: importPhotoDragging,
                openPicker: openImportPhotoPicker,
                onDragOver: handleImportPhotoDragOver,
                onDragLeave: handleImportPhotoDragLeave,
                onDrop: handleImportPhotoDrop,
                hiddenInput,
            })}

            <Dialog
                open={importPhotoModalOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        closeImportPhotoModal()
                    }
                }}
                title={t('picks.imageImport.title')}
                className={`${dialogClassName}${importPhotoModalStage === 'scanning' ? ` ${dialogClassName}-scanning` : ''}`}
                content={
                    importPhotoModalStage === 'scanning' ? (
                        <div className='betslip-import-modal-loading'>
                            {importPhotoPreviewUrl && (
                                <BetslipScanningLoader
                                    imageUri={importPhotoPreviewUrl}
                                    size={500}
                                    theme={getTheme()}
                                    className='betslip-import-modal-loading-loader'
                                    imageAlt={t('picks.imageImport.title')}
                                    ariaLabel={t('picks.imageImport.scanningBetslip')}
                                    loadingText={t('picks.imageImport.scanningBetslip')}
                                    rotatingMessages={[
                                        t('picks.imageImport.analyzingImage'),
                                        t('picks.imageImport.detectingOdds'),
                                        t('picks.imageImport.preparingResults'),
                                    ]}
                                />
                            )}
                        </div>
                    ) : (
                        <div className='betslip-import-modal-results'>
                            {importedPhotoLegs.length === 0 ? (
                                <div className='betslip-import-modal-empty-state'>
                                    <img src='assets/scan-fail.svg' alt={t('trends.analysis.imageImport.noPicksFound')} />
                                    <div className='betslip-import-modal-empty-state-text'>
                                        <p className='text-style-body-semibold color-fig-default'>
                                            {t('trends.analysis.imageImport.noPicksFound')}
                                        </p>
                                        <p className='text-style-label-normal color-fig-subtle'>
                                            {t('picks.imageImport.pleaseTryAgain')}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className='betslip-import-results-list'>
                                    {importedLegSections.map((section) => {
                                        const firstLeg = section[0]
                                        const homeTeamCode = firstLeg.home ? firstLeg.team.code : firstLeg.opposingTeam.code
                                        const awayTeamCode = firstLeg.home ? firstLeg.opposingTeam.code : firstLeg.team.code

                                        return (
                                            <div key={`${firstLeg.league}:${firstLeg.gameId}`} className='betslip-import-results-game'>
                                                <div className='betslip-import-results-game-header-row'>
                                                    <p className='betslip-import-results-game-header text-style-caption-uppercase-medium'>
                                                        {`${awayTeamCode} @ ${homeTeamCode}`}
                                                    </p>
                                                </div>

                                                {section.map((leg, index) =>
                                                    renderImportedPhotoLeg(leg, index, section.length)
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                }
                footer={
                    importPhotoModalStage === 'results' && importedPhotoLegs.length > 0 ? (
                        <div className='betslip-import-modal-footer'>
                            <div className='betslip-import-modal-footer-button betslip-import-modal-footer-button-analyze'>
                                <Button
                                    text={t('trends.analysis.imageImport.analyze')}
                                    typography='md'
                                    type='secondary'
                                    enabled={!importPhotoAction}
                                    onClick={handleAnalyzeImportedLegs}
                                />
                            </div>
                            <div className='betslip-import-modal-footer-button betslip-import-modal-footer-button-add'>
                                <Button
                                    text={importPhotoAction === 'add' ? t('picks.imageImport.adding') : t('trends.analysis.addParlayToMyPicks')}
                                    typography='md'
                                    type='primary'
                                    enabled={!importPhotoAction}
                                    onClick={handleAddImportedLegsToMyPicks}
                                />
                            </div>
                        </div>
                    ) : importPhotoModalStage === 'results' && importedPhotoLegs.length === 0 ? (
                        <div className='betslip-import-modal-footer'>
                            <div className='betslip-import-modal-footer-button betslip-import-modal-footer-button-close'>
                                <Button
                                    text={t('common.actions.close')}
                                    typography='md'
                                    type='secondary'
                                    enabled={!importPhotoLoading}
                                    onClick={closeImportPhotoModal}
                                />
                            </div>
                            <div className='betslip-import-modal-footer-button betslip-import-modal-footer-button-retry'>
                                <Button
                                    text={t('picks.imageImport.tryAgain')}
                                    typography='md'
                                    type='primary'
                                    enabled={!importPhotoLoading && !!lastImportedPhotoFileRef.current}
                                    onClick={() => handleImagePickerResponse([lastImportedPhotoFileRef.current], 'retry')}
                                />
                            </div>
                        </div>
                    ) : null
                }
            />
        </>
    )
}

export default BetslipImportZone
