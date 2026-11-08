import React from 'react';
import { withTranslation } from 'react-i18next';
import './PicksSidebar.scss'
import './App.scss'
import {
    getBetslipInfo,
    getBetslipOdds,
    getDirectBetslipLinks,
    getLocationAffiliates,
    getPlayerFullDisplayName,
    getPlayerId,
    getPlayerName,
    getTeamDisplayName,
    hasPremiumAccess,
    noOpPromise
} from '../linemate-react-common/src/util';
import GlobalContext from './GlobalContext';
import Button from './Button';
import { getTeamLogoPath, getTheme, shouldUseRoundTeamLogoBackground, teamLogoPathOnErrorFallback } from '../react-web-utils';
import { getBetslipCanonicalLegKey, getBetslipLegKey, getMarketDescriptionInfo } from '../linemate-react-common/src/betting-utils';
import { SPORTSBOOKS_CONFIG, SUPPORTED_LEAGUES } from '../linemate-react-common/src/constants';
import InformationalBanner from './InformationalBanner';
import { API_HOST } from '../react-web-constants';
import OfferPopup from './OfferPopup'
import BetslipImportZone from './BetslipImportZone';
import { logCustomEvent } from '../analytics';

const getBookName = (book) => {
    return SPORTSBOOKS_CONFIG?.[book?.toLowerCase()]?.displayName || ''
}

/**
 * Props:
 * - tab: picks | offers
 */
class PicksSidebar extends React.Component {

    static contextType = GlobalContext;

    constructor(props, context) {
        super(props, context);

        this.betslipContentRef = React.createRef();

        this.continueToProvider = this.continueToProvider.bind(this)
        this.getAndOpenBetslipLink = this.getAndOpenBetslipLink.bind(this)
        this.logBetslipRedirect = this.logBetslipRedirect.bind(this)
        this.getDirectBetslipLinks = this.getDirectBetslipLinks.bind(this)
        this.handleOperatorSelection = this.handleOperatorSelection.bind(this)

        this.state = {
            affiliateDisclaimerDialogOpen: false,
            selectedProvider: '',
            showWarning: true,
            parlayOpen: false,
            offerModalOpen: false,
        }
    }

    componentDidMount() {
        this.footerResizeObserver = new ResizeObserver((entries) => {
            if (this.betslipContentRef.current && entries?.[0]?.borderBoxSize?.[0]?.blockSize) {
                this.betslipContentRef.current.style.paddingBottom = `${entries[0].borderBoxSize[0].blockSize}px`;
            }
        })
        if (document.getElementsByClassName("betslip-footer")[0]) {
            this.footerResizeObserver.observe(document.getElementsByClassName("betslip-footer")[0]);
        }
    }

    componentWillUnmount() {
        if (this.footerResizeObserver) {
            this.footerResizeObserver.disconnect()
        }
    }

    continueToProvider(location) {
        const { affiliates } = getLocationAffiliates(
            this.context.location?.region?.code,
            this.context.location?.country?.code,
            this.context.configuration.affiliateOffers,
            [],
            this.context.userAttributes?.confirmedProviders || [],
            this.context.userAttributes?.preferredProviders || [],
            [],
            []
        )

        const selectedProvider = this.state.selectedProvider.toLowerCase()
        const rawOfferEntries = affiliates?.[selectedProvider] || []

        if (rawOfferEntries.length === 0) {
            return this.getAndOpenBetslipLink(location)
        }

        this.setState({
            offerEntry: {
                operator: selectedProvider,
                offers: rawOfferEntries
            },
            offerModalOpen: true
        })
    }

    handleOperatorSelection(provider, operatorOffers, locked = false, rawAffiliates = {}) {
        if (locked) {
            return
        }

        const selectedProvider = provider?.toLowerCase()
        const rawOfferEntries = rawAffiliates?.[selectedProvider] || []

        this.setState({
            selectedProvider,
            showWarning: true,
            offerEntry: rawOfferEntries.length > 0 ? {
                operator: selectedProvider,
                offers: rawOfferEntries
            } : null,
            offerModalOpen: rawOfferEntries.length > 0
        })
    }

    logBetslipRedirect(operator, odds, legs, link) {
        if (!legs || legs.length === 0) {
            return;
        }
        // Make sure we don't crash just because of logging an event since gathering all the data here is a bit more complicated
        try {
            const leagues = new Set(legs.map(leg => leg.league))
            const players = new Set(legs.filter(leg => leg.type === 'player').map(leg => getPlayerId(leg.player)))
            const teams = new Set(legs.filter(leg => leg.type === 'team').map(leg => leg.team.code))
            const games = new Set(legs.map(leg => leg.gameId))
            const markets = new Set(legs.map(leg => `${leg.league}_${leg.market.name}`))
            const participantsNames = new Set(legs.map(leg => leg.type === 'team' ? getTeamDisplayName(leg.league, leg.team) : getPlayerFullDisplayName(leg.player)))
            const participantIds = new Set(legs.map(leg => leg.type === 'team' ? leg.team.code : getPlayerId(leg.player)))
            var type = "";
            if (legs.length === 1) {
                type = "straight"
            } else if (games.size === legs.length) {
                type = "parlay"
            } else if (games.size > 1) {
                type = "sgp+"
            } else {
                type = "sgp"
            }
            const currentTime = new Date().getTime()
            logCustomEvent({
                amplitudeInstance: this.context.amplitudeInstance,
                userAttributes: this.context.userAttributes
            }, 'betslip_link_open', {
                operator: operator, 
                platform: 'web',
                leaguesCount: leagues.size,
                legsCount: legs.length,
                playersCount: players.size,
                teamsCount: teams.size,
                participantNames: [...participantsNames],
                participantIds: [...participantIds],
                markets: [...markets],
                leagues: [...leagues],
                type: type,
                location: this.context.location.code,
                userId: this.context.userAttributes.uuid,
                odds: odds,
                legs: legs.map(leg => ({
                    league: leg.league,
                    line: leg.line,
                    outcome: leg.outcome,
                    market: `${leg.league}_${leg.market.name}`,
                    odds: leg.odds || {},
                    participant: leg.type === 'team' ? getTeamDisplayName(leg.league, leg.team) : getPlayerFullDisplayName(leg.player),
                    participantId: leg.type === 'team' ? leg.team.code : getPlayerId(leg.player)
                })),
                link: link,
                timestamp: currentTime,
                timeSinceOpen: currentTime - this.openTime
            })
        } catch(error) {
            console.error(error)
        }
    }

    getDirectBetslipLinks(location) {
        return getDirectBetslipLinks(API_HOST, location, this.state.selectedProvider, this.context.betslip.analyzedLegs)
    }

    getAndOpenBetslipLink(location) {
        const selectedProvider = this.state.selectedProvider?.toLowerCase() || ""
        if (this.context.betslip.preProcessedBetslipDetails.operators?.[selectedProvider]?.links) {
            const links = this.context.betslip.preProcessedBetslipDetails.operators[selectedProvider].links
            return this.setState({linkLoading: true}, () => {
                this.openLink(links, selectedProvider).then(() => this.setState({linkLoading: false}))
            })
        }
        this.setState({linkLoading: true}, () => {
            this.getDirectBetslipLinks(location)
            .then(links => this.openLink(links, selectedProvider).then(() => this.setState({linkLoading: false})))
            .catch(error => {
                console.error(error)
                this.setState({linkLoading: false})
            })
        })
    }

    openLink(links, selectedProvider) {
        const odds = this.context.betslip.preProcessedBetslipDetails?.[selectedProvider]?.odds || {}
        // TODO: review here, not all legs are logged in some cases
        const legs = Object.values(this.context.betslip.analyzedLegs[selectedProvider]?.canonicalLegs || {})
        try{
            if (links?.web?.length > 0) {
                window.open(links?.web, '_blank').focus()
                this.logBetslipRedirect(selectedProvider, odds, legs, links?.web)
                return noOpPromise(null)
            } else {
                console.log("No link to be opened")
                return noOpPromise(null)
            }
        } catch (error) {
            console.error(error)
            return noOpPromise(null)
        }
    }

    // TODO: keys on iterable
    // TODO: use linkLoading
    // TODO: change the !hasAffiliates condition since this is now also a betslip
    // {/* TODO: if it gets too small make it scrollable (more than 4 preferences, or maybe even 3 max on static) */}
    render() {
        const { t } = this.props
        const hasAffiliates = this.context.location?.region?.code && this.context.location.region.code in this.context.configuration.affiliateOffers;

        const locationAffiliates = getLocationAffiliates(
            this.context.location?.region?.code,
            this.context.location?.country?.code,
            this.context.configuration.affiliateOffers,
            [],
            this.context.userAttributes?.confirmedProviders || [],
            this.context.userAttributes?.preferredProviders || [],
            [],
            []
        )
        const affiliates = locationAffiliates.affiliates
        const operatorOffers = locationAffiliates.offersByOperator
        const premium = hasPremiumAccess(this.context.userAttributes)
        const providerSelected = this.state.selectedProvider && this.state.selectedProvider.length > 0
        const location = this.context.location?.region?.code
        const availableRegionProviders = new Set(
            (this.context.localizedRegionProviders || []).map((provider) => provider.toLowerCase())
        )

        const visiblePreferredProviders = (this.context.userAttributes?.preferredProviders || []).filter(
            (provider) => availableRegionProviders.has(provider.toLowerCase())
        )

        const {
            legsCount, 
            containsLegs, 
            isParlay, 
            providerCanonicalLegs, 
            isExclusivelyCrossGameParlay, 
            leagues, 
            bookSections, 
            gameSections,
            infoBannerText, 
            selectedProviderOdds, 
            selectedProviderAvailableInRegion, 
            actionDisabled
        } = getBetslipInfo(
            this.context.userAttributes,
            this.context.betslip.analyzedLegs,
            this.context.betslip.preProcessedBetslipDetails,
            this.context.localizedRegionProviders,
            affiliates,
            this.context.configuration.advertising,
            this.context.location?.region?.code,
            this.state.selectedProvider,
            this.context.betslip.legs,
            this.context.betslip.groupedLegs,
            t
        )
        return (
            <>
            <div className='affiliates-sidebar'>
                <div className='affiliates-sidebar-close-row'>
                    <p className='text-style-h-3-semibold color-fig-default'>{t('picks.title')}</p>
                    <button
                        type='button'
                        className='affiliates-sidebar-close-button'
                        onClick={() => this.props.onClose()}
                    >
                        <img src='assets/close-icon.svg' alt={t('web.navigation.closeMyPicks')} />
                    </button>
                </div>
                {/* Warning notice in case of changes to the slip based on the selected provider */}
                {
                    infoBannerText.length > 0 && this.state.showWarning && (
                        <InformationalBanner 
                            severity={'warning'} 
                            text={infoBannerText}
                            onDismiss={() => this.setState({showWarning: false})}
                        />
                    )
                }
                {
                    !containsLegs && (
                        <BetslipImportZone
                            dialogClassName='betslip-import-dialog'
                            renderTrigger={({ dragging, openPicker, onDragOver, onDragLeave, onDrop, hiddenInput }) => (
                                <div className='betslip-no-picks'>
                                    <img
                                        className='betslip-no-picks-hero'
                                        src={`assets/mypicks-empty-${getTheme()}.png`}
                                        alt={t('picks.empty.title')}
                                    />

                                    <p className='text-style-body-semibold color-fig-default'>{t('picks.empty.title')}</p>
                                    <p className='text-style-label-normal color-fig-subtle'>
                                        {t('picks.empty.subtitle')}
                                    </p>

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
                                            alt={t('picks.actions.importPhoto')}
                                        />
                                        <p className='text-style-label-medium color-fig-default'>
                                            {t('picks.actions.importPhoto')}
                                        </p>
                                        <p className='text-style-caption-normal color-fig-subtle'>
                                            {t('picks.imageImport.dropzoneCta')}
                                        </p>
                                    </div>

                                    {hiddenInput}
                                </div>
                            )}
                        />
                    )
                }
                {
                    containsLegs && (
                        <>
                            <div ref={this.betslipContentRef} className='betslip-content'>
                                {
                                    isParlay && (
                                        <div className='betslip-content-parlay-header' onClick={() => this.setState({parlayOpen: !this.state.parlayOpen})}>
                                            <div className='betslip-content-parlay-header-left'>
                                                <p className='text-style-h-4-medium color-fig-default'>{t('picks.labels.parlay')}</p>
                                                <p className='text-style-h-4-medium color-fig-subtle'>{legsCount}</p>
                                                {
                                                    leagues.map((league) =>
                                                        <div className='betslip-content-parlay-header-league'>
                                                            <p className='text-style-caption-uppercase-medium color-fig-subtle'>{league}</p>
                                                        </div>
                                                    )
                                                }
                                            </div>
                                            <img src={`assets/chevron-${this.state.parlayOpen ? 'down' : 'right'}.svg`} alt='open-close' onClick={() => {}}/>
                                        </div>
                                    )
                                }
                                {/* Legs */}
                                {
                                    (!isParlay || this.state.parlayOpen) && gameSections.map((section) => {
                                        const firstLeg = section.data[0]
                                        // Assumes at least one leg present
                                        const homeTeamCode = firstLeg.home ? firstLeg.team.code : firstLeg.opposingTeam.code
                                        const awayTeamCode = firstLeg.home ? firstLeg.opposingTeam.code : firstLeg.team.code
                                        const legs = section.data
                                        return (
                                            <div className='betslip-content-game'>
                                            <p className='text-style-body-uppercase-medium color-fig-subtle'>{`${awayTeamCode} @ ${homeTeamCode}`}</p>
                                            {
                                                legs.map((leg, index) => {
                                                    const isLast = index === legs.length - 1
                                                    const legKey = getBetslipLegKey(leg?.league, leg)
                                                    const canonicalLegKey = getBetslipCanonicalLegKey(leg?.league, leg)
                                                    const lineMatch = !!this.context.betslip.analyzedLegs?.[this.state.selectedProvider.toLowerCase()]?.legs?.[legKey]
                                                    const providerLeg = this.context.betslip.analyzedLegs?.[this.state.selectedProvider.toLowerCase()]?.canonicalLegs?.[canonicalLegKey]
                                                    const canonicalMatch = !!providerLeg
                                                    var marketAvailableAtDifferentLine = canonicalMatch && !lineMatch
                                                    const isMarketAvailable = lineMatch || canonicalMatch
                                                    const availabilityOpacity = !isMarketAvailable ? 0.25 : 1
                                                    const marketDescriptionInfo = getMarketDescriptionInfo(leg.league, leg.type, leg.line, leg.outcome, leg.market, leg?.alternate, this.props.t)
                                                    const displayLine = marketDescriptionInfo.displayLine
                                                    const marketDescriptionParts = marketDescriptionInfo.description.split(`${displayLine}`)
                                                    const useRoundBackground = shouldUseRoundTeamLogoBackground(leg.league)

                                                    var providerMarketDescriptionInfo = null
                                                    if (marketAvailableAtDifferentLine) {
                                                        providerMarketDescriptionInfo = getMarketDescriptionInfo(
                                                            providerLeg.league,
                                                            providerLeg.type,
                                                            providerLeg.line,
                                                            providerLeg.outcome,
                                                            providerLeg.market,
                                                            providerLeg.alternate,
                                                            this.props.t
                                                        )

                                                        if (providerMarketDescriptionInfo.line === marketDescriptionInfo.line) {
                                                            marketAvailableAtDifferentLine = false
                                                        }
                                                    }

                                                    return (
                                                        <div className={`betslip-content-leg ${!isLast ? 'has-connector' : ''}`}>
                                                            <div className='betslip-content-leg-left' style={{opacity: availabilityOpacity}}>
                                                                <div className='betslip-content-leg-logo-slip'>
                                                                    <img
                                                                        src={getTeamLogoPath(leg.league, leg.team)}
                                                                        alt={leg.team.code}
                                                                        style={{
                                                                            backgroundColor: useRoundBackground
                                                                                ? SUPPORTED_LEAGUES[leg.league]?.teams?.colors?.[getTheme()]?.[leg.team.code.toLowerCase()]
                                                                                : 'transparent',
                                                                            borderRadius: useRoundBackground ? '200px' : 0,
                                                                        }}
                                                                        onError={({ currentTarget }) => teamLogoPathOnErrorFallback(currentTarget, leg.league)}
                                                                    />
                                                                </div>

                                                                <div className='betslip-content-leg-text'>
                                                                    <p className='text-style-label-semibold color-fig-default'>{`${leg?.player ? getPlayerName(leg.player) : leg.team.code}:`}&nbsp;</p>
                                                                    <p className='text-style-label-medium color-fig-default'>{marketDescriptionParts[0].trim()}&nbsp;</p>
                                                                    <p
                                                                        className={`text-style-label-medium ${marketAvailableAtDifferentLine ? 'color-fig-subtle' : 'color-fig-default'}`}
                                                                        style={{textDecorationLine: marketAvailableAtDifferentLine ? 'line-through' : 'none'}}
                                                                    >
                                                                        {displayLine || ""}
                                                                    </p>
                                                                    &nbsp;
                                                                    {
                                                                        marketAvailableAtDifferentLine && (
                                                                            <p className='text-style-label-medium color-fig-default'>{providerMarketDescriptionInfo.displayLine}&nbsp;</p>
                                                                        )
                                                                    }
                                                                    <p className='text-style-label-medium color-fig-default'>{marketDescriptionParts[1] || ""}</p>
                                                                </div>
                                                            </div>

                                                            <div className='betslip-content-leg-right'>
                                                                <Button
                                                                    icon="assets/minus.svg"
                                                                    type="invisible"
                                                                    onClick={() => this.context.removeLegsFromBetslip([leg])}
                                                                    enabled={true}
                                                                />
                                                            </div>
                                                        </div>
                                                    )
                                                })
                                            }
                                            </div>
                                        )
                                    })
                                }
                                {
                                    isParlay && this.state.parlayOpen && (
                                        <p className='betslip-content-clear-all text-style-caption-medium color-fig-destructive' onClick={this.context.clearBetslip}>{t('common.actions.clearAll')}</p>
                                    )
                                }
                                {/* Preferred Providers */}
                                    {
                                        premium && visiblePreferredProviders.length > 0 && (
                                            <div className='betslip-content-operator-section'>
                                                <p className='text-style-label-medium color-fig-subtle'>{t('common.labels.preferredOdds')}</p>
                                                {
                                                    visiblePreferredProviders.map((provider) => {
                                                        const offerText = operatorOffers?.[provider.toLowerCase()]?.[0]?.title || ''
                                                        const providerLegs = this.context.betslip.analyzedLegs[provider.toLowerCase()]?.canonicalLegs || {}
                                                        const selected = this.state.selectedProvider?.toLowerCase() === provider.toLowerCase()
                                                        const odds = getBetslipOdds(
                                                            this.context.userAttributes,
                                                            this.context.betslip.preProcessedBetslipDetails,
                                                            isParlay,
                                                            isExclusivelyCrossGameParlay,
                                                            provider,
                                                            providerLegs
                                                        )

                                                        return (
                                                            <div
                                                                className={`betslip-content-operator ${selected ? 'betslip-content-operator-selected' : ''}`}
                                                                onClick={() => this.handleOperatorSelection(provider, operatorOffers, false, affiliates)}
                                                            >
                                                                <div className='betslip-content-operator-top'>
                                                                    <div className='betslip-content-operator-info'>
                                                                        <img src={`assets/sportsbooks/${provider}.svg`} alt={provider}/>
                                                                        <p className='text-style-label-medium color-fig-default'>
                                                                            {getBookName(provider)}
                                                                        </p>
                                                                        <p className='text-style-label-medium color-fig-subtle'>{odds}</p>
                                                                    </div>
                                                                    <p className='text-style-label-medium color-fig-default'>
                                                                        {`${Object.keys(providerLegs).length || 0}/${legsCount}`}
                                                                    </p>
                                                                </div>
                                                                {
                                                                    offerText && (
                                                                        <p className='text-style-label-normal color-fig-subtle'>{offerText}</p>
                                                                    )
                                                                }
                                                            </div>
                                                        )
                                                    })
                                                }
                                            </div>
                                        )
                                    }
                                {/* Books */}
                                {
                                    bookSections.map((section) => {
                                        return (
                                            <div className='betslip-content-operator-section'>
                                                <p className='text-style-label-medium color-fig-subtle'>{t(section.titleKey)}</p>
                                                {
                                                    section.data.map((entry) => {
                                                        // Assumes there's at least one leg if it got saved here
                                                        const book = entry.book
                                                        const selected = this.state.selectedProvider?.toLowerCase() === book.toLowerCase()
                                                        // Affiliate name in the affiliates is the display name not the internal lowercased id that we are switching to
                                                        const affiliateName = getBookName(book)
                                                        const odds = getBetslipOdds(this.context.userAttributes, this.context.betslip.preProcessedBetslipDetails, isParlay, isExclusivelyCrossGameParlay, book, this.context.betslip.analyzedLegs[book.toLowerCase()]?.canonicalLegs || {})
                                                        const offerText = operatorOffers?.[book.toLowerCase()]?.[0]?.title || ''
                                                        return (
                                                            <div
                                                                className={`betslip-content-operator ${selected ? 'betslip-content-operator-selected' : ''} ${section.locked ? 'betslip-content-operator-locked' : ''}`}
                                                                onClick={() => this.handleOperatorSelection(book, operatorOffers, section.locked, affiliates)}
                                                            >
                                                                <div className='betslip-content-operator-top'>
                                                                    <div className='betslip-content-operator-info'>
                                                                        <img src={`assets/sportsbooks/${book}.svg`} alt={book}/>
                                                                        <p className='text-style-label-medium color-fig-default'>{affiliateName}</p>
                                                                        <p className='text-style-label-medium color-fig-subtle'>{odds}</p>
                                                                    </div>
                                                                    <p className='text-style-label-medium color-fig-default'>{`${Object.keys(entry.canonicalLegs).length}/${legsCount}`}</p>
                                                                </div>
                                                                {
                                                                    offerText && (
                                                                        <p className='text-style-label-normal color-fig-subtle'>{offerText}</p>
                                                                    )
                                                                }
                                                            </div>
                                                        )
                                                    })
                                                }
                                            </div>
                                        )
                                    })
                                }
                            </div>
                            {/* Absolute footer */}
                            <div className='betslip-footer'>
                                {/* Betslip info */}
                                <div className='betslip-footer-info'>
                                    <p className='text-style-label-medium color-fig-default'>{isParlay ? t('picks.labels.legParlay', { count: legsCount }) : t('picks.labels.straight')}</p>
                                    {
                                        selectedProviderOdds && (
                                            <p className='text-style-label-medium color-fig-default'>{selectedProviderOdds}</p>
                                        )
                                    }
                                    {
                                        !selectedProviderOdds && (
                                            <p className='betslip-pricing-not-available text-style-caption-medium color-fig-subtle'>
                                                {isParlay && !isExclusivelyCrossGameParlay ? t('picks.labels.sgpPricingUnavailable') : t('picks.labels.pricingUnavailable')}
                                            </p>
                                        )
                                    }
                                </div>
                                {/* Action */}
                                <div className='betslip-footer-action'>
                                    {
                                        providerSelected && selectedProviderAvailableInRegion && this.context.betslipProviders.includes(this.state.selectedProvider) && (
                                            <Button
                                                enabled={true}
                                                text={t('picks.actions.openOn', { operator: SPORTSBOOKS_CONFIG?.[this.state.selectedProvider.toLowerCase()]?.displayName })}
                                                typography='lg'
                                                type='primary'
                                                onClick={() => this.continueToProvider(location)}
                                            />
                                        )
                                    }
                                    {
                                        providerSelected && selectedProviderAvailableInRegion && !this.context.betslipProviders.includes(this.state.selectedProvider) && (
                                            <Button
                                                enabled={true}
                                                text={t('picks.actions.visit', { operator: SPORTSBOOKS_CONFIG?.[this.state.selectedProvider.toLowerCase()]?.displayName })}
                                                typography='lg'
                                                type='secondary'
                                                onClick={() => this.continueToProvider(location)}
                                            />
                                        )
                                    }
                                    {
                                        actionDisabled && (
                                            <Button
                                                enabled={false}
                                                text={t('picks.actions.selectOperatorToContinue')}
                                                typography='lg'
                                                type='secondary'
                                                onClick={() => {}}
                                            />
                                        )
                                    }
                                </div>
                            </div>
                        </>
                    )
                }
            </div>
            {
                this.state.offerModalOpen && (
                    <OfferPopup element={this.state.offerEntry} openModalPopup={this.state.offerModalOpen} setOpenModalPopup={(value) => this.setState({offerModalOpen: value})} source='betslip'/>
                )
            }
            </>
        );
    }
}

export default withTranslation()(PicksSidebar);
