import React from 'react';
import { canAccessPredictionMarkets, getTeamIdByCode, getTeamLogoPath, getTheme, toggleTheme, shouldUseRoundTeamLogoBackground } from '../react-web-utils';
import { FEATURE_BETSLIP, SUPPORTED_LEAGUES } from '../linemate-react-common/src/constants';
import { base64Encode, getFullPlayerName, getPlayerName, getTeamDisplayName, hasPremiumAccess, isDictEmpty, isSuperUser } from '../linemate-react-common/src/util';
import { auth } from '../firebase.js'
import { withTranslation } from 'react-i18next';
import { PREDICTION_MARKET_TOOLS } from '../pages/PredictionMarkets.jsx';

import Button from './Button';
import Avatar from './Avatar';
import InputSelection from './InputSelection';
import GlobalContext from './GlobalContext';

import './App.scss';
import './NavigationBar.scss';
import Dialog from './Dialog';
import BasicDialog from './BasicDialog';
import PricingPopup from './PricingPopup';
import PicksSidebar from './PicksSidebar.jsx';
import SearchField from './SearchField.jsx';
import { API_HOST } from '../react-web-constants.js';
import SegmentedControl from './SegmentedControl.jsx';

// TODO: for 'start free trial', go to signup with origin as pricing
class NavigationBar extends React.Component {

    static contextType = GlobalContext;

    constructor(props, context) {
        super(props, context);

        this.toggleTheme = this.toggleTheme.bind(this);
        this.toggleMobileNavigation = this.toggleMobileNavigation.bind(this);
        this.getControls = this.getControls.bind(this);
        this.getTabs = this.getTabs.bind(this);
        this.leagueDropdownSelected = this.leagueDropdownSelected.bind(this);
        this.setThemeSelection = this.setThemeSelection.bind(this);
        //this.searchPressed = this.searchPressed.bind(this);
        this.searchRef = React.createRef()

        this.avatarMenuItems = {
            'Profile settings': () => window.location.href = '/profile', 
            // Note: the anonymous function is needed rather than a direct auth.signOut reference otherwise it won't work because of a mismatch in number of arguments
            'Log Out': () => auth.signOut()
        }

        this.isStatsPage = context.tab === 'stats'

        var searchActive = false;
        var presetSearchTerm = null;
        const searchParams = new URLSearchParams(window.location.search);
        if (searchParams.has('search')) {
            searchActive = true;
        }
        if (searchParams.get('search')) {
            presetSearchTerm = searchParams.get('search')
            document.getElementsByTagName('body')[0].style.overflow = 'hidden';
        }

        this.state = {
            theme: getTheme(),
            mobileNavigationOpen: false,
            affiliatesDrawerOpen: false,
            picksDrawerOpen: false,
            searchActive: searchActive,
            searchTerm: presetSearchTerm,
            typingTimeout: 0,
            searchResults: {},
            showSearchResults: false,
            showToolsHover: false,
            showPredictionMarketsHover: false,
            showBonusesHover: false,
            mobileToolsOpen: false,
            mobilePredictionMarketsOpen: false,
            mobileProfileOpen: false,
            openPricingModal: false,
            pricingModalVariant: "opponent_rank"
        }
    }

    componentDidMount() {
        const leagueActive = !this.context.league || this.context.configuration.leagues[this.context.league].active;
        document.addEventListener("click", this.handleClickOutside)
        var navbarHeight = 48;
        if (!leagueActive) {
            navbarHeight += 36;
        }
        document.documentElement.style.setProperty("--navbar-height", `${navbarHeight}px`);
    }

    componentDidUpdate(prevProps, prevState) {
        if (!prevState.searchActive && this.state.searchActive) {
            this.searchRef.current?.focus();
        }
    }

    toggleTheme() {
        const newTheme = toggleTheme()
        this.setState({theme: newTheme})
        this.context.updateTheme(newTheme);
    }

    setThemeSelection(selection) {
        if (selection === this.state.theme) {
            return;
        }

        const newTheme = selection;
        document.documentElement.classList.remove(`theme-${this.state.theme}`);
        document.documentElement.classList.add(`theme-${newTheme}`);
        localStorage.setItem('theme', newTheme);
        window.dispatchEvent(new CustomEvent('themeChange', { detail: { theme: newTheme } }));

        this.setState({ theme: newTheme });
        this.context.updateTheme(newTheme);
    }

    toggleMobileNavigation() {
        this.setState((previousState) => {return {mobileNavigationOpen: !previousState.mobileNavigationOpen}})
    }

    getControls() {
        if (this.isStatsPage) {
            return <></>
        }
        return (
            <>
                <div className='navigation-bar-left-dropdown-trigger'>
                    <InputSelection
                        enabled
                        type="single"
                        typography="sm"
                        options={Object.fromEntries(
                            Object.entries(this.context.configuration.leagues || {})
                                .filter(([league, configuration]) =>
                                    configuration?.enabled && SUPPORTED_LEAGUES[league]
                                )
                                .map(([league, configuration]) => [
                                    league,
                                    configuration.title || SUPPORTED_LEAGUES[league].title
                                ])
                        )}
                        selection={this.context.league || this.context.configuration.defaultLeague}
                        selectionHandler={this.leagueDropdownSelected}
                    />
                </div>
            </>
        )
    }

    getTabs() {
        if (this.isStatsPage) {
            return <></>
        }
        const { t } = this.props;
        const defaultLeague = this.context.configuration.defaultLeague
        const premiumUser = hasPremiumAccess(this.context.userAttributes)
        const advancedTools = SUPPORTED_LEAGUES[this.context.league || defaultLeague]?.advancedTools || [];
        const showOpponentRank = advancedTools.includes('opponent_rank');
        const showStartingPitchers = advancedTools.includes('starting_pitchers');
        const showStartingLineups = advancedTools.includes('starting_lineups');
        const showWeatherReport = advancedTools.includes('weather_report');
        const showInjuryImpact = advancedTools.includes('injury_impact');
        const predictionMarketsEnabled = canAccessPredictionMarkets(this.context.location, this.context.userAttributes);
        return (
            <>
                <a className={`navigation-bar-tab${this.context.tab === "home" ? "-selected" : ""}`} href={`/${this.context.league || defaultLeague}`}>
                    <p className='text-style-label-medium'>{t('tabs.home')}</p>
                </a>
                <a className={`navigation-bar-tab${this.context.tab === "trends" ? "-selected" : ""}`} href={`/${this.context.league || defaultLeague}/trends`}>
                    <p className='text-style-label-medium'>{t('tabs.trends')}</p>
                </a>
                <a
                    className={`navigation-bar-tab${this.context.tab === "chat" || this.context.tab === "props" || this.context.tab === "leaderboard" || this.context.tab === "standings" || this.context.tab === "opponent-defensive-rank" || this.context.tab === "starting-pitchers" || this.context.tab === "starting-lineups" || this.context.tab === "injury-impact" || this.context.tab === "weather-report" ? "-selected" : ""}`}
                    onMouseEnter={() => this.setState({ showToolsHover: true })}
                    onMouseLeave={() => this.setState({ showToolsHover: false })}
                    onClick={() => this.setState((previousState) => ({ showToolsHover: !previousState.showToolsHover }))}
                >
                    <p className='text-style-label-medium'>{t('web.navigation.tools')} ▾</p>
                    {this.state.showToolsHover && 
                        <>
                            <div className='navigation-bar-tools-hover text-style-label-normal'>
                                <div className='navigation-bar-tools-hover-item'>
                                    <a href={`/${this.context.league || defaultLeague}/tools/props`}>{t('props.title')}</a>
                                </div>
                                <div className='navigation-bar-tools-hover-item'>
                                    <a href={`/${this.context.league || defaultLeague}/tools/stats`}>{t('stats.title')}</a>
                                </div>
                                <div className='navigation-bar-tools-hover-item'>
                                    <a href={`/${this.context.league || defaultLeague}/tools/standings`}>{t('standings.title')}</a>
                                </div>
                                
                                {/* Temporary remove from dropdown, just uncomment to add back */}
                                <div className='navigation-bar-tools-hover-section-header'>
                                    <div className='navigation-bar-tools-hover-section-header-inner text-style-label-normal'>
                                        <span>{t('home.sections.advancedTools')}</span>
                                        <span className='navigation-bar-dropdown-linemate-badge text-style-caption-semibold'>Linemate+</span>
                                    </div>
                                </div>

                                {showOpponentRank && (
                                    <div className='navigation-bar-tools-hover-item'>
                                        <a
                                            href={premiumUser ? `/${this.context.league || defaultLeague}/tools/opponent-defensive-rank` : "#"}
                                            onClick={(event) => {
                                                if (!premiumUser) {
                                                    event.preventDefault();
                                                    this.setState({
                                                        openPricingModal: true,
                                                        pricingModalVariant: "opponent_rank",
                                                        showToolsHover: false
                                                    });
                                                }
                                            }}
                                        >
                                            {t('web.navigation.toolsMenu.opponentDefensiveRank')}
                                        </a>
                                    </div>
                                )}
                                
                                {showStartingPitchers && (
                                    <div className='navigation-bar-tools-hover-item'>
                                        <a
                                            href={premiumUser ? `/${this.context.league || defaultLeague}/tools/starting-pitchers` : "#"}
                                            onClick={(event) => {
                                                if (!premiumUser) {
                                                    event.preventDefault();
                                                    this.setState({
                                                        openPricingModal: true,
                                                        pricingModalVariant: "starting_pitchers",
                                                        showToolsHover: false
                                                    });
                                                }
                                            }}
                                        >
                                            {t('web.navigation.toolsMenu.startingOpponentPitchers')}
                                        </a>
                                    </div>
                                )}

                                {showStartingLineups && (
                                    <div className='navigation-bar-tools-hover-item'>
                                        <a
                                            href={premiumUser ? `/${this.context.league || defaultLeague}/tools/starting-lineups` : "#"}
                                            onClick={(event) => {
                                                if (!premiumUser) {
                                                    event.preventDefault();
                                                    this.setState({
                                                        openPricingModal: true,
                                                        pricingModalVariant: "starting_lineups",
                                                        showToolsHover: false
                                                    });
                                                }
                                            }}
                                        >
                                            {t('startingLineups.title')}
                                        </a>
                                    </div>
                                )}

                                {showWeatherReport && (
                                    <div className='navigation-bar-tools-hover-item'>
                                        <a
                                            href={premiumUser ? `/${this.context.league || defaultLeague}/tools/weather-report` : "#"}
                                            onClick={(event) => {
                                                if (!premiumUser) {
                                                    event.preventDefault();
                                                    this.setState({
                                                        openPricingModal: true,
                                                        pricingModalVariant: "weather_report",
                                                        showToolsHover: false
                                                    });
                                                }
                                            }}
                                        >
                                            {t('weatherReport.title')}
                                        </a>
                                    </div>
                                )}

                                {showInjuryImpact && (
                                    <div className='navigation-bar-tools-hover-item'>
                                        <a
                                            href={premiumUser ? `/${this.context.league || defaultLeague}/tools/injury-impact` : "#"}
                                            onClick={(event) => {
                                                if (!premiumUser) {
                                                    event.preventDefault();
                                                    this.setState({
                                                        openPricingModal: true,
                                                        pricingModalVariant: "injury_impact",
                                                        showToolsHover: false
                                                    });
                                                }
                                            }}
                                        >
                                            {t('injuryImpact.title')}
                                        </a>
                                    </div>
                                )}
                                {isSuperUser(this.context.userAttributes) && (
                                    <div className='navigation-bar-tools-hover-item'>
                                        <a href={`/${this.context.league || defaultLeague}/tools/chat`}>Chat</a>
                                    </div>
                                )}
                            </div>
                        </>
                    }
                    
                </a>
                {predictionMarketsEnabled && (
                    <a
                        className={`navigation-bar-tab${this.context.tab === "prediction-markets" ? "-selected" : ""}`}
                        onMouseEnter={() => this.setState({ showPredictionMarketsHover: true })}
                        onMouseLeave={() => this.setState({ showPredictionMarketsHover: false })}
                        onClick={() => this.setState((previousState) => ({
                            showPredictionMarketsHover: !previousState.showPredictionMarketsHover
                        }))}
                    >
                        <p className='text-style-label-medium'>
                            {t('home.predictionMarkets.hubTitle')} ▾
                        </p>
                        {this.state.showPredictionMarketsHover && (
                            <div className='navigation-bar-tools-hover text-style-label-normal'>
                                {PREDICTION_MARKET_TOOLS.map((tool) => (
                                    <div className='navigation-bar-tools-hover-item' key={tool.slug}>
                                        <a href={`/${this.context.league || defaultLeague}/prediction-markets/${tool.slug}`}>
                                            {t(`home.predictionMarkets.cards.${tool.titleKey}.title`)}
                                        </a>
                                    </div>
                                ))}
                            </div>
                        )}
                    </a>
                )}
                {/* <div className={`navigation-bar-tab${this.context.tab === "bonuses" ? "-selected" : ""}`} onMouseEnter={() => this.setState({ showBonusesHover: true })} onMouseLeave={() => this.setState({ showBonusesHover: false })}>
                    <p className='text-style-label-medium'>Bonuses ▾</p>
                    {this.state.showBonusesHover &&
                        <div className='navigation-bar-tools-hover text-style-label-normal'>
                            <div className='navigation-bar-tools-hover-item'>
                                <a href='/bonuses?category=sports-betting'>Sports Betting</a>
                            </div>
                            <div className='navigation-bar-tools-hover-item'>
                                <a href='/bonuses?category=prediction-markets'>Prediction Markets</a>
                            </div>
                            <div className='navigation-bar-tools-hover-item'>
                                <a href='/bonuses?category=casino'>Casino</a>
                            </div>
                        </div>
                    }
                </div> */}
            </>
        )
    }

    leagueDropdownSelected(selection) {
        const pathname = window.location.pathname;
        const isGameSummaryPage = pathname.includes('/summary');
        let targetUrl;
        if (isGameSummaryPage) {
            targetUrl = `/${selection}`;
        } else if (this.context.league) {
            targetUrl = pathname.replace(this.context.league, selection);
        } else {
            targetUrl = `/${selection}`;
        }
        window.location.href = targetUrl;
    }

    handleSearchClick() {
        this.setState(prevState => ({
            searchActive: !prevState.searchActive
        }));
    };

    handleClickOutside = (e) => {
        if (
            this.state.searchActive && this.searchRef.current && !this.searchRef.current.contains(e.target)
        ) {
            this.setState({searchActive: false, searchTerm: "", searchResults: {}})
        }
    }

    handleSearchInput(e) {
        const searchTerm = e.target.value;
        if (this.state.typingTimeout) {
            clearTimeout(this.state.typingTimeout);
        }

        this.setState({searchTerm: searchTerm, typingTimeout: setTimeout(() => this.search(searchTerm), 250), showSearchResults: false})
    }

    /*searchPressed() {
        this.setState((previousState) => {
            if (previousState.searchActive) {
                document.getElementsByTagName('body')[0].style.overflow = 'auto';
            } else {
                document.getElementsByTagName('body')[0].style.overflow = 'hidden';
            }
            return {searchActive: !previousState.searchActive, mobileNavigationOpen: false}
        })
    }*/

    search(inputSearchTerm) {
            // TODO: on app inputSearchTerm is used but should be searchTerm
            if (inputSearchTerm != null && inputSearchTerm.trim().length > 1) { 
                const searchTerm = inputSearchTerm.trim().toLowerCase();
                const playerSearchPromise = new Promise((resolve, reject) => {
                    fetch(`${API_HOST}/api/${this.context.league}/v3/players/search?searchTerm=${searchTerm}`)
                    .then(result => result.json())
                    .then(result => resolve(result.map(x => ({type: "player", player: x, teamCode: x.teamCode, teamId: x.teamId || x.currentTeamId || x.team?.teamId || getTeamIdByCode(this.context.teams, x.teamCode), text: getFullPlayerName(x), activeGameInfo: x.activeGameInfo}))))
                })
    
                const teamSearchPromise = new Promise((resolve, reject) => {
                    fetch(`${API_HOST}/api/${this.context.league}/v3/teams/search?searchTerm=${searchTerm}`)
                    .then(result => result.json())
                    .then(result => resolve(result.map(x => ({type: "team", teamCode: x.code, teamId: x.teamId || x.id, text: getTeamDisplayName(this.context.league, x), activeGameInfo: x.activeGameInfo}))))
                })
    
                Promise.all([playerSearchPromise, teamSearchPromise])
                .then((results) => {
                    const overallPlayerResults = results[0];
                    const overallTeamResults = results[1];
                    this.setState({
                        searchResults: {
                            players: overallPlayerResults,
                            teams: overallTeamResults,
                            total: overallPlayerResults.concat(overallTeamResults)
                        },
                        showSearchResults: true
                    })
                })
            } else {
                this.setState({
                    searchResults: {}
                })
            }
        }

    // TODO: should we avoid rendering the league selection dropdown if it's not a 'sport data' page?
    render() {
        const { t } = this.props;
        const leagueActive = !this.context.league || this.context.configuration.leagues[this.context.league].active;
        const defaultLeague = this.context.configuration.defaultLeague;
        const currentLeague = this.context.league || defaultLeague;
        const advancedTools = SUPPORTED_LEAGUES[currentLeague]?.advancedTools || [];
        const showOpponentRank = advancedTools.includes('opponent_rank');
        const showStartingPitchers = advancedTools.includes('starting_pitchers');
        const showStartingLineups = advancedTools.includes('starting_lineups');
        const showWeatherReport = advancedTools.includes('weather_report');
        const showInjuryImpact = advancedTools.includes('injury_impact');
        const hasAffiliates = this.context.location.region.code && this.context.location.region.code in this.context.configuration.affiliateOffers;
        const loggedIn = this.context.user && !isDictEmpty(this.context.userAttributes);
        const premiumUser = hasPremiumAccess(this.context.userAttributes)
        const isBetslipEnabled = this.context?.enabledFeatures?.has(FEATURE_BETSLIP)
        const useRoundBackground = shouldUseRoundTeamLogoBackground(this.context.league);
        const themeSegmentOptions = {
            light: <img src="assets/light.svg" alt="Light theme" />,
            dark: <img src="assets/dark.svg" alt="Dark theme" />
        };

        const avatarMenuEntries = [
            {
                type: 'item',
                key: 'profile-settings',
                label: t('web.navigation.profileSettings'),
                onSelect: () => window.location.href = '/profile'
            },
            {
                type: 'custom',
                key: 'theme',
                label: t('preferences.display.preferences.theme'),
                content: (
                    <div
                        className="avatar-dropdown-theme-control"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <SegmentedControl
                            options={themeSegmentOptions}
                            selection={this.state.theme}
                            selectionHandler={this.setThemeSelection}
                            contentType="icon"
                        />
                    </div>
                )
            },
            {
                type: 'item',
                key: 'log-out',
                label: t('preferences.items.logOut'),
                onSelect: () => auth.signOut()
            }
        ];
        return (
            <>
                <BasicDialog
                    open={this.state.openPricingModal}
                    onOpenChange={(open) => this.setState({openPricingModal: open})}
                    content={
                        <PricingPopup
                            variant={this.state.pricingModalVariant || 'plays'}
                            onOpenChange={(open) => this.setState({openPricingModal: open})}
                        />
                    }
                    additionalClassName={"pricing-popup-dialog"}
                />
                {/* Container under the absolutely positioned header to push content down */}
                <div className='navigation-bar-placeholder'></div>
                <div className={`navigation-bar ${this.state.affiliatesDrawerOpen ? "navigation-bar-extra-z-index" : ""}`}>
                    <div className='navigation-bar-inner'>
                        {/* Left section: logo, league selection, search */}
                        <div className='navigation-bar-left'>
                            <a className="navigation-bar-wordmark" href={`/${this.context.league}`}>
                                <img src="assets/logomark.svg" alt="Linemate"/>
                            </a>
                            {this.getControls()}
                        </div>
                        {/* Middle section: tabs/pages */}
                        <div className='navigation-bar-middle'>
                            {this.getTabs()}
                        </div>
                        {/* Right section: LM+, Profile, Login/Signup, etc. */}
                        <div className='navigation-bar-right'>
                            <div className='navigation-bar-right-desktop'>
                        {
                            loggedIn && !premiumUser && !this.isStatsPage && (
                                <div className='navigation-bar-right-lm-plus-button-wrapper'>
                                    <Button text={t('web.navigation.getLinematePlus')} typography="sm" type="secondary" enabled={true} onClick={() => window.location.href = `/pricing?origin=${window.location.pathname}`}/>
                                </div>
                            )
                        }
                        {
                            !loggedIn && !this.isStatsPage && (
                                <>
                                    <div className='navigation-bar-right-login-button-wrapper'>
                                        <Button text={t('auth.login.title')} typography="sm" type="invisible" enabled={true} onClick={() => window.location.href = `/login?origin=${window.location.pathname}`}/>
                                    </div>
                                    <div className='navigation-bar-right-signup-button-wrapper'>
                                        <Button text={t('web.navigation.startFreeTrial')} typography="sm" type="secondary" enabled={true} onClick={() => window.location.href = `/signup?origin=/pricing`}/>
                                    </div>
                                </>
                            )
                        }
                        {
                            this.isStatsPage && (
                                <div className='navigation-bar-right-signup-button-wrapper'>
                                    <Button text={t('web.navigation.startFreeTrial')} typography="sm" type="secondary" enabled={true} onClick={() => window.location.href = `/signup?origin=/pricing`}/>
                                </div>
                            )
                        }
                        {
                            this.context.location?.region?.code && !this.isStatsPage && (
                                <>
                                {!this.state.searchActive &&
                                    <div className='navigation-bar-right-moneybag-button-wrapper'>
                                        <Button icon='assets/search.svg' type='invisible' enabled={true} onClick={(e) => {e.stopPropagation(); this.handleSearchClick()}} className='navigation-bar-right-moneybag-button'/>
                                    </div>
                                }
                                {this.state.searchActive &&
                                    <div className='navigation-bar-right-search-bar'>
                                        <SearchField inputRef={this.searchRef} placeholder={t('common.search.teamOrPlayerPlaceholder')} textStyleClass="text-style-caption-normal" onInput={(e) => this.handleSearchInput(e)}/>
                                        
                                        {this.state.searchResults.total && (
                                        <div className="navigation-bar-search-dropdown">
                                            {this.state.searchResults.players.length > 0 && (
                                                <>
                                                    <div className="navigation-bar-right-dropdown-header text-style-label-medium">
                                                        <p>{t('common.labels.player')}</p>
                                                    </div>
                                                    <div className="navigation-bar-search-section">
                                                    {this.state.searchResults.players.map(player => (
                                                        <div className="navigation-bar-search-dropdown-item text-style-label-normal" onClick={() => {
                                                            const feed = base64Encode(JSON.stringify({
                                                                title: t('preferences.profile.title'),
                                                                subtitle: player.type === "player" ? getPlayerName(player.player.info) : player.teamCode,
                                                                player: player.type === "player" ? player.player.info : null,
                                                                teamCode: player.teamCode,
                                                                returnUrl: `${window.location.pathname}?search=${this.state.searchTerm}`
                                                            }))
                                                            window.location.href = `/${this.context.league}/trends?feed=${feed}&profile=true`
                                                        }}>
                                                            <img
                                                                src={getTeamLogoPath(this.context.league, player.teamId)}
                                                                className={`navigation-bar-search-dropdown-item-image${
                                                                    useRoundBackground ? "" : " navigation-bar-search-dropdown-item-image--flat"
                                                                }`}
                                                                style={{
                                                                    background: useRoundBackground
                                                                    ? SUPPORTED_LEAGUES[this.context.league]?.teams?.colors?.[getTheme()]?.[player.teamCode.toLowerCase()]
                                                                    : "transparent",
                                                                }}
                                                                alt={`${player.teamCode} logo`}
                                                            />
                                                            <p>{player.text}</p>
                                                        </div>
                                                    ))}
                                                    </div>
                                                </>
                                            )}

                                            {this.state.searchResults.teams.length > 0 && (
                                                <>
                                                    <div className="navigation-bar-right-dropdown-header text-style-label-medium">
                                                        <p>{t('web.navigation.search.teams')}</p>
                                                    </div>
                                                    <div className="navigation-bar-search-section">
                                                    {this.state.searchResults.teams.map(team => (
                                                        <div className="navigation-bar-search-dropdown-item text-style-label-normal" onClick={() => {
                                                            const feed = base64Encode(JSON.stringify({
                                                                title: t('preferences.profile.title'), 
                                                                subtitle: team.type === "player" ? getPlayerName(team.player.info) : team.teamCode,
                                                                player: team.type === "player" ? team.player.info : null,
                                                                teamCode: team.teamCode,
                                                                returnUrl: `${window.location.pathname}?search=${this.state.searchTerm}`
                                                            }))
                                                            window.location.href = `/${this.context.league}/trends?feed=${feed}&profile=true`
                                                        }}>
                                                            <img
                                                                src={getTeamLogoPath(this.context.league, team.teamId)}
                                                                className={`navigation-bar-search-dropdown-item-image${
                                                                    useRoundBackground ? "" : " navigation-bar-search-dropdown-item-image--flat"
                                                                }`}
                                                                style={{
                                                                    background: useRoundBackground
                                                                    ? SUPPORTED_LEAGUES[this.context.league]?.teams?.colors?.[getTheme()]?.[team.teamCode.toLowerCase()]
                                                                    : "transparent",
                                                                }}
                                                                alt={`${team.teamCode} logo`}
                                                            />
                                                            <p>{team.text}</p>
                                                        </div>
                                                    ))}
                                                    </div>
                                                </>
                                            )}
                                            {this.state.searchResults.total.length === 0 && this.state.searchTerm &&
                                                <div className='navigation-bar-search-no-result text-style-label-normal'>
                                                    <p>{t('web.navigation.search.noResultsFor', { searchTerm: this.state.searchTerm })}</p>
                                                </div>
                                            }
                                        </div>
                                        )}
                                    </div>
                                }
                                    {
                                        isBetslipEnabled && (
                                            <div className='navigation-bar-right-moneybag-button-wrapper'>
                                                <Dialog
                                                    className='navigation-bar-picks-modal'
                                                    open={this.state.picksDrawerOpen}
                                                    onOpenChange={(open) => this.setState({picksDrawerOpen: open})}
                                                    disableAutoFocus={true}
                                                    trigger={
                                                        <Button icon="assets/picks.svg" type="invisible" enabled={true} onClick={() => this.setState({picksDrawerOpen: true})} className='navigation-bar-right-moneybag-button'/>
                                                    }
                                                    title={null}
                                                    content={<PicksSidebar onClose={() => this.setState({picksDrawerOpen: false})}/>}
                                                    footer={null}
                                                />
                                            </div>
                                        )
                                    }
                                    {
                                        !loggedIn && (
                                            <div className='navigation-bar-right-theme-button-wrapper'>
                                                <Button
                                                    icon={this.state.theme === 'dark' ? 'assets/dark.svg' : 'assets/light.svg'}
                                                    type="invisible"
                                                    enabled={true}
                                                    onClick={this.toggleTheme}
                                                />
                                            </div>
                                        )
                                    }
                                </>
                            )
                        }
                            </div>
                            <div className='navigation-bar-right-mobile-menu-button-wrapper'>
                                <Button icon={`assets/${this.state.mobileNavigationOpen ? "close-icon" : "menu"}.svg`} type="invisible" enabled={true} onClick={this.toggleMobileNavigation}/>
                            </div>
                            {
                                loggedIn && !this.isStatsPage && (
                                    <div className='navigation-bar-right-avatar-wrapper'>
                                        <Avatar
                                            text={!('firstName' in this.context.userAttributes) ? "?" : this.context.userAttributes.firstName.charAt(0).toUpperCase()}
                                            typography="sm"
                                            clickable={true}
                                            menuEntries={avatarMenuEntries}
                                        />
                                    </div>
                                )
                            }
                        </div>
                    </div>
                </div>
                {
                    this.state.mobileNavigationOpen && (
                        <div className='navigation-bar-expansion navigation-bar-mobile-menu'>
                            <div className='navigation-bar-mobile-menu-section'>
                                {this.getControls()}
                            </div>

                            <div className='navigation-bar-mobile-menu-section navigation-bar-mobile-menu-tabs'>
                                <a className='navigation-bar-mobile-menu-item text-style-label-medium' href={`/${currentLeague}`}>
                                    {t('tabs.home')}
                                </a>

                                <a className='navigation-bar-mobile-menu-item text-style-label-medium' href={`/${currentLeague}/trends`}>
                                    {t('tabs.trends')}
                                </a>

                                <div className={`navigation-bar-mobile-menu-tools ${this.state.mobileToolsOpen ? "navigation-bar-mobile-menu-tools-open" : ""}`}>
                                    <button
                                        type='button'
                                        className='navigation-bar-mobile-menu-item navigation-bar-mobile-menu-button text-style-label-medium'
                                        onClick={() => this.setState((previousState) => ({ mobileToolsOpen: !previousState.mobileToolsOpen }))}
                                    >
                                        <span>{t('web.navigation.tools')}</span>
                                        <img className='navigation-bar-mobile-menu-chevron' src='assets/chevron-down.svg' alt='' />
                                    </button>

                                    {this.state.mobileToolsOpen && (
                                        <div className='navigation-bar-mobile-menu-tools-list'>
                                            <a className='navigation-bar-mobile-menu-subitem text-style-label-normal' href={`/${currentLeague}/tools/props`}>
                                                {t('props.title')}
                                            </a>

                                            <a className='navigation-bar-mobile-menu-subitem text-style-label-normal' href={`/${currentLeague}/tools/stats`}>
                                                {t('stats.title')}
                                            </a>

                                            <a className='navigation-bar-mobile-menu-subitem text-style-label-normal' href={`/${currentLeague}/tools/standings`}>
                                                {t('standings.title')}
                                            </a>

                                            {showOpponentRank && (
                                                <a
                                                    className='navigation-bar-mobile-menu-subitem text-style-label-normal'
                                                    href={premiumUser ? `/${currentLeague}/tools/opponent-defensive-rank` : "#"}
                                                    onClick={(event) => {
                                                        if (!premiumUser) {
                                                            event.preventDefault();
                                                            this.setState({
                                                                openPricingModal: true,
                                                                pricingModalVariant: "opponent_rank",
                                                                mobileNavigationOpen: false
                                                            });
                                                        }
                                                    }}
                                                >
                                                    {t('web.navigation.toolsMenu.opponentDefensiveRank')}
                                                </a>
                                            )}

                                            {showStartingPitchers && (
                                                <a
                                                    className='navigation-bar-mobile-menu-subitem text-style-label-normal'
                                                    href={premiumUser ? `/${currentLeague}/tools/starting-pitchers` : "#"}
                                                    onClick={(event) => {
                                                        if (!premiumUser) {
                                                            event.preventDefault();
                                                            this.setState({
                                                                openPricingModal: true,
                                                                pricingModalVariant: "starting_pitchers",
                                                                mobileNavigationOpen: false
                                                            });
                                                        }
                                                    }}
                                                >
                                                    {t('web.navigation.toolsMenu.startingOpponentPitchers')}
                                                </a>
                                            )}

                                            {showStartingLineups && (
                                                <a
                                                    className='navigation-bar-mobile-menu-subitem text-style-label-normal'
                                                    href={premiumUser ? `/${currentLeague}/tools/starting-lineups` : "#"}
                                                    onClick={(event) => {
                                                        if (!premiumUser) {
                                                            event.preventDefault();
                                                            this.setState({
                                                                openPricingModal: true,
                                                                pricingModalVariant: "starting_lineups",
                                                                mobileNavigationOpen: false
                                                            });
                                                        }
                                                    }}
                                                >
                                                    {t('startingLineups.title')}
                                                </a>
                                            )}

                                            {showWeatherReport && (
                                                <a
                                                    className='navigation-bar-mobile-menu-subitem text-style-label-normal'
                                                    href={premiumUser ? `/${currentLeague}/tools/weather-report` : "#"}
                                                    onClick={(event) => {
                                                        if (!premiumUser) {
                                                            event.preventDefault();
                                                            this.setState({
                                                                openPricingModal: true,
                                                                pricingModalVariant: "weather_report",
                                                                mobileNavigationOpen: false
                                                            });
                                                        }
                                                    }}
                                                >
                                                    {t('weatherReport.title')}
                                                </a>
                                            )}

                                            {showInjuryImpact && (
                                                <a
                                                    className='navigation-bar-mobile-menu-subitem text-style-label-normal'
                                                    href={premiumUser ? `/${currentLeague}/tools/injury-impact` : "#"}
                                                    onClick={(event) => {
                                                        if (!premiumUser) {
                                                            event.preventDefault();
                                                            this.setState({
                                                                openPricingModal: true,
                                                                pricingModalVariant: "injury_impact",
                                                                mobileNavigationOpen: false
                                                            });
                                                        }
                                                    }}
                                                >
                                                    {t('injuryImpact.title')}
                                                </a>
                                            )}
                                            {isSuperUser(this.context.userAttributes) && (
                                                <a className='navigation-bar-mobile-menu-subitem text-style-label-normal' href={`/${currentLeague}/tools/chat`}>Chat</a>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            {canAccessPredictionMarkets(this.context.location, this.context.userAttributes) && (
                                <div className={`navigation-bar-mobile-menu-prediction-markets ${this.state.mobilePredictionMarketsOpen ? "navigation-bar-mobile-menu-prediction-markets-open" : ""}`}>
                                    <button
                                        type='button'
                                        className='navigation-bar-mobile-menu-item navigation-bar-mobile-menu-button text-style-label-medium'
                                        onClick={() => this.setState((previousState) => ({
                                            mobilePredictionMarketsOpen: !previousState.mobilePredictionMarketsOpen
                                        }))}
                                    >
                                        <span>{t('home.predictionMarkets.hubTitle')}</span>
                                        <img className='navigation-bar-mobile-menu-chevron' src='assets/chevron-down.svg' alt='' />
                                    </button>
                                    {this.state.mobilePredictionMarketsOpen && (
                                        <div className='navigation-bar-mobile-menu-prediction-markets-list'>
                                            {PREDICTION_MARKET_TOOLS.map((tool) => (
                                                <a
                                                    key={tool.slug}
                                                    className='navigation-bar-mobile-menu-subitem text-style-label-normal'
                                                    href={`/${currentLeague}/prediction-markets/${tool.slug}`}
                                                >
                                                    {t(`home.predictionMarkets.cards.${tool.titleKey}.title`)}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {
                                loggedIn && !this.isStatsPage && (
                                    <div className={`navigation-bar-mobile-menu-profile-wrapper ${this.state.mobileProfileOpen ? "navigation-bar-mobile-menu-profile-open" : ""}`}>
                                        <button
                                            type='button'
                                            className='navigation-bar-mobile-menu-section navigation-bar-mobile-menu-profile navigation-bar-mobile-menu-button'
                                            onClick={() => this.setState((previousState) => ({ mobileProfileOpen: !previousState.mobileProfileOpen }))}
                                        >
                                            <Avatar
                                                text={!('firstName' in this.context.userAttributes) ? "?" : this.context.userAttributes.firstName.charAt(0).toUpperCase()}
                                                typography="sm"
                                                clickable={false}
                                                menuEntries={[]}
                                            />
                                            <span className='text-style-label-medium'>{t('preferences.profile.title')}</span>
                                            <img className='navigation-bar-mobile-menu-chevron' src='assets/chevron-down.svg' alt='' />
                                        </button>

                                        {this.state.mobileProfileOpen && (
                                            <div className='navigation-bar-mobile-menu-profile-list'>
                                                <a className='navigation-bar-mobile-menu-subitem text-style-label-normal' href='/profile'>
                                                    {t('web.navigation.profileSettings')}
                                                </a>
                                                <div className='navigation-bar-mobile-menu-theme-row'>
                                                    <span className='text-style-label-normal'>{t('preferences.display.preferences.theme')}</span>
                                                    <div
                                                        className='navigation-bar-mobile-menu-theme-control'
                                                        onPointerDown={(event) => event.stopPropagation()}
                                                        onClick={(event) => event.stopPropagation()}
                                                    >
                                                        <SegmentedControl
                                                            options={themeSegmentOptions}
                                                            selection={this.state.theme}
                                                            selectionHandler={this.setThemeSelection}
                                                            contentType='icon'
                                                        />
                                                    </div>
                                                </div>
                                                <button
                                                    type='button'
                                                    className='navigation-bar-mobile-menu-subitem navigation-bar-mobile-menu-button text-style-label-normal'
                                                    onClick={() => auth.signOut()}
                                                >
                                                    {t('preferences.items.logOut')}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            }

                            {
                                !loggedIn && (
                                    <div className='navigation-bar-mobile-menu-section navigation-bar-mobile-menu-auth'>
                                        <a className='navigation-bar-mobile-menu-item text-style-label-medium' href={`/login?origin=${window.location.pathname}`}>
                                            {t('auth.login.title')}
                                        </a>

                                        <a className='navigation-bar-mobile-menu-item text-style-label-medium' href='/signup?origin=/pricing'>
                                            {t('web.navigation.startFreeTrial')}
                                        </a>
                                    </div>
                                )
                            }
                            <div className='navigation-bar-mobile-menu-section navigation-bar-mobile-menu-bottom'>
                                <a className='navigation-bar-mobile-menu-item navigation-bar-mobile-menu-download text-style-label-medium' href='/download'>
                                    {t('web.navigation.downloadLinemate')}
                                </a>
                            </div>
                        </div>
                    )
                }
                {/* Optional banner under the navbar */}
                {
                    !leagueActive && (
                        <div className={`navigation-bar-banner ${this.state.affiliatesDrawerOpen ? "navigation-bar-extra-z-index" : ""}`}>
                            <img src='assets/off-season.svg' alt="vacation"/>
                            <p className='text-style-label-normal'>{t('web.navigation.offSeason', { league: SUPPORTED_LEAGUES[this.context.league].title })}</p>
                        </div>
                    )
                }
                {
                    /*this.state.searchActive && (
                        <div className='navigation-bar-search'>
                            <SearchResult onBack={this.searchPressed} searchTerm={this.state.searchTerm}/>
                        </div>
                    )*/
                }
            </>
        )
    }
}

export default withTranslation()(NavigationBar);
