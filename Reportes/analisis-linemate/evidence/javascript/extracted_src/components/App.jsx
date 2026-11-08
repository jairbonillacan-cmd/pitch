import React from 'react';
import * as braze from "@braze/web-sdk"
import { withCookies } from "react-cookie";
import { Router, Switch, Route, Redirect } from "react-router-dom";
import { canAccessPredictionMarkets, clearAppsflyerUserId, getLatestAccessedFeatureVersion, getTheme, setAppsflyerUserId, setLatestAccessedFeatureVersion, setTheme } from '../react-web-utils';
import { auth } from '../firebase.js';
import { API_HOST } from '../react-web-constants';
import i18n from '../i18n';
import { GlobalContextProvider } from './GlobalContext';
import { SPORTSBOOKS_CONFIG, SUPPORTED_LEAGUES } from '../linemate-react-common/src/constants';
import IndexedDBWrapper from '../database';

import NavigationBar from './NavigationBar';
import Footer from './Footer';
import Home from '../pages/Home';
import AuthenticationPage from '../authentication-page';

import './App.scss'
import AuthenticationActionPage from '../authentication-action-page';
import ForgotPassword from '../pages/ForgotPassword';
import VerifyEmailPage from '../verify-email-page';
import Privacy from '../pages/Privacy';
import Terms from '../pages/Terms.jsx';
import ResponsibleGamblingPage from '../responsible-gambling-page';
import AffiliateRedirect from '../affiliate-redirect';
import PurchaseSuccessPage from '../purchase-success-page';
import Profile from '../pages/Profile';
import Download from '../pages/Download';
import DownloadW2A from '../pages/DownloadW2A';
import Trends from '../pages/Trends';
import Login from '../pages/Login';
import Signup from '../pages/Signup';
import Pricing from '../pages/Pricing';
import ManageSubscription from '../pages/ManageSubscription';
import Bonuses from '../pages/Bonuses';
import Glossary from '../glossary';
import { analyzeBetslipLegs, groupBetslipLegs, isDictionary, isPlaybookSupported, isSuperUser, resolvePreferredProviders, transformAndGetBetslipDetails } from '../linemate-react-common/src/util.js';
import Socials from '../pages/Socials.jsx';
import CheatSheet from '../pages/Cheatsheet.jsx';
import { getAllTeams, getGamedaySchedule } from '../linemate-react-common/src/gameday-utils.js';
import ProfileWorkstation from './ProfileWorkstation.jsx';
import Props from '../pages/Props.jsx';
import ToastModal from './ToastModal.jsx';
import PredictionMarkets from '../pages/PredictionMarkets.jsx';
import { getBetslipCanonicalLegKey, getBetslipLegKey } from '../linemate-react-common/src/betting-utils.js';
import _ from "lodash"
import {
  getAmplitude,
  initializeGoogleConsent,
  logCustomEvent,
  setGoogleAnalyticsUserId,
  startGoogleAnalytics,
  stopAmplitudeTracking,
  stopGoogleAnalytics,
  trackAmplitudePageView,
} from '../analytics.js';
import GameSummary from '../pages/GameSummary.jsx';
import StatsPage from '../pages/seo/StatsPage'
import StatsProfile from './StatsProfile.jsx'
import Leaderboard from '../pages/Leaderboard.jsx'
import Standings from '../pages/Standings.jsx'
import OpponentDefensiveRank from "../pages/OpponentDefensiveRank.jsx";
import StartingPitchers from "../pages/StartingPitchers.jsx";
import StartingLineups from "../pages/StartingLineups.jsx";
import WeatherReport from "../pages/WeatherReport.jsx";
import InjuryImpact from "../pages/InjuryImpact.jsx";
import Support from '../pages/Support';
import GenerateTrend from '../pages/GenerateTrend.jsx';
import NotFound from '../pages/404';

import "vanilla-cookieconsent/dist/cookieconsent.css";
import * as CookieConsent from "vanilla-cookieconsent";
import { createConsentConfig, getPrivacyPolicy, getTrackingPermissions, hasGlobalPrivacyControl, isPrivacyPreferencesRequest, openPrivacyPreferences, PRIVACY_PREFERENCES_URL, refreshPrivacyPreferences, renewOptionalOptIn, setPrivacyPreferencesReady } from '../privacy';
import { fetchCurrentLocation, loadCachedLocation } from '../location';
import PrivacyNotice from './PrivacyNotice';
import MobileLandingPage from '../pages/MobileLandingPage.jsx';
import { installFetchProxy, setFetchHeadersProvider, setFetchProxyMatcher } from '../linemate-react-common/src/network-utils.js';
import { history } from '../history';
import { initSentry, setSentryUser, shutdownSentry } from '../sentry';
import AffiliateOfferRedirect from '../affiliate-offer-redirect.js';
import { startMarketingTracking, stopMarketingTracking } from '../marketing.js';
import { logPrivacySettings, logThirdPartyStatus, warnThirdPartyStatus } from '../third-party-debug';

const SportsChat = React.lazy(() => import('../pages/SportsChat.jsx'));

function RetiredLeagueRedirect({ configuration, country }) {
  const enabledLeagues = Object.keys(SUPPORTED_LEAGUES).filter(
    (league) => configuration.leagues?.[league]?.enabled
  );
  const defaultLeague = [
    configuration.localizedDefaultLeague?.[country],
    configuration.defaultLeague,
    ...enabledLeagues
  ].find((league) => enabledLeagues.includes(league));

  React.useEffect(() => {
    if (!defaultLeague) return;

    const target = new URL(window.location.href);
    target.pathname = `/${defaultLeague}`;
    window.location.replace(target.href);
  }, [defaultLeague]);

  return null;
}

function RedirectWithSearch({ to }) {
  return (
    <Route
      render={({ location }) => (
        <Redirect
          to={typeof to === 'string'
            ? { pathname: to, search: location.search }
            : { ...to, search: to.search ?? location.search }}
        />
      )}
    />
  );
}

function getPath() {
  // Trim leading and trailing forward slash 
  return window.location.pathname.replace(/^\//g, '').replace(/\/$/g, '');
}

const LOCATION_FETCH_SKIP_PATHS = new Set([
  '/affiliate',
  '/authentication',
  '/authentication/action',
  '/bonuses',
  '/download',
  '/download-w2a',
  '/login',
  '/password-reset',
  '/paywall',
  '/preferences',
  '/privacy',
  '/responsible-gambling',
  '/signup',
  '/success',
  '/support',
  '/terms',
  '/verify-email',
]);

function shouldSkipLocationFetch(pathname = window.location.pathname) {
  return LOCATION_FETCH_SKIP_PATHS.has(pathname)
    && !isPrivacyPreferencesRequest({ pathname, search: window.location.search });
}

function determineLeague() {
  const path = getPath();
  if (path.length > 0) {
    const parts = path.split('/')
    // Special case for the SEO stats links
    if ((parts[0].toLowerCase() === 'stats' || parts[0].toLowerCase() === 'odds') && parts.length > 1 && parts[1] in SUPPORTED_LEAGUES) {
      return parts[1].toLowerCase()
    }
    if (parts[0].toLowerCase() in SUPPORTED_LEAGUES) {
      return parts[0].toLowerCase()
    }
  }
  return null;
}

function determineTab() {
  const path = getPath();
  if (path.length > 0) {
    const parts = path.split('/');
    if (parts[0] === 'stats' || parts[0] === 'odds') {
      // Special case for /stats and /odds SEO pages
      return 'stats'
    }
    if (parts.includes('bonuses')) {
      return 'bonuses';
    }
    if (parts.includes('prediction-markets')) {
      return 'prediction-markets';
    }
    if (parts.includes('opponent-defensive-rank')) {
      return 'opponent-defensive-rank';
    }
    if (parts.includes('starting-pitchers')) {
      return 'starting-pitchers';
    }
    if (parts.includes('chat')) {
      return 'chat';
    }
    if (parts.includes('starting-lineups')) {
      return 'starting-lineups';
    }
    if (parts.includes('weather-report')) {
      return 'weather-report';
    }
    if (parts.includes('injury-impact')) {
      return 'injury-impact';
    }
    if (parts.includes('trends')) {
      return 'trends';
    }
    if (parts.includes('props')) {
      return 'props'
    }
    if (parts.includes('leaderboard')) {
      return 'leaderboard'
    }
    if (parts.includes('standings')) {
      return 'standings'
    }
    if (parts.length === 1 && parts[0].toLowerCase() in SUPPORTED_LEAGUES) {
      return 'home';
    }
  }
  return null;
}

const HOUR_MS_MULTIPLIER = 3600000;
const CONFIGURATION_VERSION = 3;
const CONFIGURATION_CACHE_VERSION = 2;
const CONFIGURATION_CACHE_KEY = 'configuration';

function getBackendLocale() {
  return i18n.resolvedLanguage || i18n.language || 'en';
}

const DEFAULT_LOCATION = {
  country: {
    code: null,
    name: null
  },
  region: {
    code: null,
    name: null
  }
}

const DEFAULT_BETSLIP = {
  // Dict of all the unique keys/ids representing legs that are in the slip to know if a leg is already in there or not
  legs: {},
  // Dict of (participant + market) allowing us to override if a user adds a prop/trend for which we already have an entry based on participant and market
  // For example if we have player points over, and the user adds player points under we can override it since only one of those can be added
  canonicalLegs: {},
  // Legs grouped by league, then by game id
  groupedLegs: {},
  analyzedLegs: {},
  preProcessedBetslipDetails: {operators: {}}
}

const LATEST_FEATURE_VERSION = 1

// TODO: IMPORTANT NOTE: clean up old local storage stuff we no longer use since moving to IndexedDB
class App extends React.Component {

  constructor(props) {
    super(props);

    this.updateUserAttributes = this.updateUserAttributes.bind(this);
    this.loadDatabase = this.loadDatabase.bind(this);
    this.loadConfiguration = this.loadConfiguration.bind(this);
    this.loadLocation = this.loadLocation.bind(this);
    this.checkWhatsNew = this.checkWhatsNew.bind(this);
    this.clearBetslip = this.clearBetslip.bind(this);
    this.removeLegsFromBetslip = this.removeLegsFromBetslip.bind(this);
    this.addLegsToBetslip = this.addLegsToBetslip.bind(this);
    this.saveBetslip = this.saveBetslip.bind(this)
    this.setUserAttributes = this.setUserAttributes.bind(this)

    setTheme(getTheme());

    this.databaseWrapper = null;

    this.state = {
      userAttributes: {},
      league: determineLeague(),
      userInitialized: false,
      authStateReady: false,
      databaseWrapper: null,
      configuration: null,
      location: DEFAULT_LOCATION,
      currentGames: [],
      upcomingGames: [],
      theme: getTheme(),
      // For us to get this we need to check in both loadLocation and loadConfiguration since we don't know which we're going to get first but we need both
      // TODO: there is some duplication/similar code in a few different places we should extract
      localizedCountryProviders: [],
      localizedRegionProviders: [],
      showWhatsNew: false,
      // NOTE: if anything changes here the betslip in indexdb may not be valid anymore, need to invalidate by changing version
      betslip: _.cloneDeep(DEFAULT_BETSLIP),
      betslipProviders: [],
      enabledFeatures: new Set(),
      amplitudeInstance: null,
      marketingConsentGranted: false,
      privacyPreferences: { ready: false, profile: null, gpc: false, functional: false, analytics: false, marketing: false },
      teams: []
    };
  }

  checkWidthAndRedirect = () => {
    const width = window.innerWidth;
    const path = window.location.pathname;
    const search = window.location.search;

    const mobilePath = "/mobile";
    const desktopRedirect = "/"; // change if needed

    // Routes that should NEVER redirect
    const exceptions = ["/pricing", "/paywall", "/preferences", "/profile", "/download", "/download-w2a", "/manage-subscription", "/privacy", "/terms", "/login", "/signup", "/password-reset", "/authentication/action", '/bonuses', '/responsible-gambling'];

    const isException = exceptions.some(route =>
      path.startsWith(route)
    );

    // If it's an exception page → do nothing
    if (isException) return;

    // Small screen → force /mobile
    if (width < 1000 && !path.startsWith(mobilePath)) {
      window.location.replace(`${mobilePath}${search}`);
      return;
    }

    // Large screen → block /mobile
    if (width >= 1000 && path.startsWith(mobilePath)) {
      window.location.replace(`${desktopRedirect}${search}`);
      return;
    }
  };

  updateTheme = (theme) => {
    this.setState({
      theme
    })
  }

  componentDidMount() {
    this.handleLanguageChanged = () => {
      if (this.state.databaseWrapper) {
        this.loadConfiguration(this.state.databaseWrapper);
      }
    };
    window.addEventListener('linemate-language-changed', this.handleLanguageChanged);
    setFetchHeadersProvider(async () => {
      const headers = {
        'Linemate-Client-Platform': 'web',
        'Linemate-Client-Version': process.env.REACT_APP_VERSION || '',
        'Linemate-Client-Build': process.env.REACT_APP_BUILD || '',
        'Linemate-Client-Country': this.state.location?.country?.code || '',
        'Linemate-Client-Locale': getBackendLocale()
      };

      if (auth.currentUser) {
        try {
          headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
        } catch (error) {
          console.log('Unable to resolve auth token for fetch headers');
          console.error(error);
        }
      }

      return headers;
    });

    setFetchProxyMatcher(({ endpoint }) => typeof endpoint === 'string' && endpoint.startsWith(API_HOST));
    installFetchProxy();

    //this.checkWidthAndRedirect();
    this.checkWhatsNew()
    auth.authStateReady().then(() => this.setState({authStateReady: true}))
    auth.onAuthStateChanged(this.updateUserAttributes);
    const wrapper = new IndexedDBWrapper("LinemateLocalStorageDb", 1, "default");
    // Privacy waits for the same cached location / request used by the app.
    this.locationRequest = wrapper.openDatabase().then(() => {
      this.setState({databaseWrapper: wrapper});
      this.loadDatabase(wrapper);
      return this.loadLocation(wrapper);
    }).catch(error => {
      console.error('Unable to load stored location', error);
      return DEFAULT_LOCATION;
    });
    window.CookieConsent = CookieConsent
    this.analyticsBooted = false;
    this.marketingBooted = false;
    this.sentryBooted = false;
    this.privacyReady = false;
    setPrivacyPreferencesReady(false);
    initializeGoogleConsent();

    const permissions = () => this.privacyReady
      ? getTrackingPermissions(this.privacyPolicy, CookieConsent)
      : { functional: false, analytics: false, marketing: false };

    const bootFunctional = () => {
      if (!permissions().functional || this.sentryBooted) return;

      initSentry();
      setSentryUser(this.state?.userAttributes || {});
      this.sentryBooted = true;
    };

    const bootAnalytics = () => {
      if (!permissions().analytics || this.analyticsBooted) return;

      const uuid = this.state?.userAttributes?.uuid;
      this.analyticsBooted = true;

      startGoogleAnalytics(uuid);
      const amplitudeInstance = getAmplitude(uuid);
      this.setState({ amplitudeInstance });
      this.lastTrackedPathname = window.location.pathname;
      trackAmplitudePageView(amplitudeInstance);
    };

    const bootMarketing = () => {
      if (!permissions().marketing) return;

      const uuid = this.state?.userAttributes?.uuid;
      if (!this.marketingBooted) {
        startMarketingTracking();
        braze.enableSDK();
        const brazeInitialized = braze.initialize(process.env.REACT_APP_BRAZE_API_KEY, {
          baseUrl: process.env.REACT_APP_BRAZE_SDK_ENDPOINT,
          minimumIntervalBetweenTriggerActionsInSeconds: 0,
          allowUserSuppliedJavascript: true,
          manageServiceWorkerExternally: true
        });
        if (brazeInitialized) logThirdPartyStatus('Braze', 'initialized');
        else warnThirdPartyStatus('Braze', 'initialization failed');
        braze.automaticallyShowInAppMessages();
        braze.openSession();
        this.marketingBooted = true;
      }

      if (uuid) {
        setAppsflyerUserId(uuid);
        braze.changeUser(uuid);
      }
      this.setState({ marketingConsentGranted: true });
    };

    const syncConsent = () => {
      if (!this.privacyReady || this.unmounted) return;
      refreshPrivacyPreferences();

      // Persist the browser's opt-out so it also survives disabling GPC later.
      // Permission checks already block tracking while this cookie is updated.
      if (hasGlobalPrivacyControl() && ['functional', 'analytics', 'marketing'].some(category => CookieConsent.acceptedCategory(category))) {
        CookieConsent.acceptCategory('necessary');
        return;
      }

      const { functional, analytics: analyticsGranted, marketing: marketingGranted } = permissions();
      this.setState({ privacyPreferences: {
        ready: true,
        profile: this.privacyPolicy.profile,
        gpc: hasGlobalPrivacyControl(),
        functional,
        analytics: analyticsGranted,
        marketing: marketingGranted,
      } }, () => {
        // Render any regional notice before starting newly permitted SDKs.
        // Each boot helper checks current permissions again in case they changed.
        if (this.unmounted) return;
        if (functional) bootFunctional();
        if (analyticsGranted) bootAnalytics();
        if (marketingGranted) bootMarketing();
      });
      const analyticsWasBooted = this.analyticsBooted;
      const marketingWasBooted = this.marketingBooted;
      const functionalWasBooted = this.sentryBooted;

      if (!functional && this.sentryBooted) {
        this.sentryBooted = false;
        shutdownSentry();
      }

      if (!analyticsGranted) {
        this.analyticsBooted = false;
        setGoogleAnalyticsUserId(null);
        stopGoogleAnalytics();
        stopAmplitudeTracking();
        this.setState({ amplitudeInstance: null });
      }

      if (!marketingGranted) {
        clearAppsflyerUserId();
        stopMarketingTracking();
        if (this.marketingBooted) {
          braze.wipeData();
          braze.disableSDK();
          braze.destroy();
          this.marketingBooted = false;
        }
        this.setState({ marketingConsentGranted: false });
      }

      // Google Analytics, AppsFlyer, and FirstPromoter cannot be reliably unloaded once
      // their JavaScript has executed. Reload into the new consent state so a
      // withdrawal immediately starts a clean page without those SDKs.
      if ((analyticsWasBooted && !analyticsGranted) || (marketingWasBooted && !marketingGranted) || (functionalWasBooted && !functional)) {
        window.setTimeout(() => window.location.reload(), 0);
      }
    };

    this.bootAnalytics = bootAnalytics;
    this.bootMarketing = bootMarketing;
    this.bootFunctional = bootFunctional;
    this.syncConsent = syncConsent;

    this.stopAnalyticsHistory = history.listen(location => {
      if (isPrivacyPreferencesRequest(location)) openPrivacyPreferences();
      if (!this.analyticsBooted) return;
      if (!permissions().analytics) {
        syncConsent();
        return;
      }
      if (location.pathname !== this.lastTrackedPathname) {
        this.lastTrackedPathname = location.pathname;
        trackAmplitudePageView(this.state.amplitudeInstance, location);
      }
    });

    this.locationRequest.then(async location => {
      if (this.unmounted) return;
      this.privacyPolicy = getPrivacyPolicy(location);
      const gpc = hasGlobalPrivacyControl();
      logPrivacySettings(location, this.privacyPolicy, gpc);
      const preferencesRequested = isPrivacyPreferencesRequest();
      await CookieConsent.run(createConsentConfig(this.privacyPolicy, syncConsent, gpc, { preferencesRequested }));
      logThirdPartyStatus('CookieConsent', 'initialized');
      if (this.unmounted) return;
      renewOptionalOptIn(this.privacyPolicy, CookieConsent, !preferencesRequested);
      this.privacyReady = true;
      setPrivacyPreferencesReady(true);
      if (hasGlobalPrivacyControl()) CookieConsent.acceptCategory('necessary');
      syncConsent();
      if (preferencesRequested) openPrivacyPreferences();
    }).catch(error => {
      console.error('Unable to initialize privacy preferences', error);
    });

    // Browsers can change GPC while the page is open. Re-check before resumed
    // activity; the analytics event helpers also check the signal per event.
    this.handlePrivacyFocus = () => syncConsent();
    window.addEventListener('focus', this.handlePrivacyFocus);
    document.addEventListener('visibilitychange', this.handlePrivacyFocus);
  }

  componentWillUnmount() {
    this.unmounted = true;
    setPrivacyPreferencesReady(false);
    this.stopAnalyticsHistory?.();
    window.removeEventListener('focus', this.handlePrivacyFocus);
    document.removeEventListener('visibilitychange', this.handlePrivacyFocus);
    if (this.handleLanguageChanged) {
      window.removeEventListener('linemate-language-changed', this.handleLanguageChanged);
    }
  }

  componentDidUpdate(prevProps, prevState) {
    const prevUuid = prevState?.userAttributes?.uuid;
    const uuid = this.state?.userAttributes?.uuid;
    if (prevUuid !== uuid) this.syncConsent?.();
    if (!prevUuid && uuid) {
      this.bootAnalytics();
      this.bootMarketing();
    }
    if (prevUuid !== uuid && this.sentryBooted) {
      setSentryUser(this.state.userAttributes);
    }
    if (prevUuid !== uuid && this.analyticsBooted && this.state.amplitudeInstance) {
      if (uuid) {
        this.state.amplitudeInstance.setUserId(uuid);
      } else {
        this.state.amplitudeInstance.reset();
      }
    }
    if (prevUuid !== uuid && this.analyticsBooted) {
      setGoogleAnalyticsUserId(uuid);
    }
    if (prevUuid !== uuid && this.marketingBooted && uuid) {
      setAppsflyerUserId(uuid);
      braze.changeUser(uuid);
    }
  }

  checkWhatsNew() {
    const latestAccessedfeatureVersion = getLatestAccessedFeatureVersion()
    if (!latestAccessedfeatureVersion) {
      setLatestAccessedFeatureVersion(LATEST_FEATURE_VERSION)
    } else if (latestAccessedfeatureVersion < LATEST_FEATURE_VERSION) {
      this.setState({showWhatsNew: true})
      setLatestAccessedFeatureVersion(LATEST_FEATURE_VERSION)
    }
  }

  // TODO: switch to users v1 everywhere
  updateUserAttributes(user) {
    if (user) {
      user.getIdToken().then((token) => { 
        const requestInfo = {
            headers: {'Authorization': "Bearer " + token}
        };
        fetch(`${API_HOST}/api/users/v1/current`, requestInfo)
        .then(data => data.json())
        .then(result => {
            var attributes = result
            if (attributes.code === 404) {
              attributes = {};
            }
            this.setState({
              userAttributes: attributes,
              userInitialized: true
            }, () => setSentryUser(attributes))
        })
        .catch(error => {
            this.setState({
              userAttributes: {},
              userInitialized: true
            }, () => setSentryUser({}));
            console.log("Error loading user profile: " + error);
        });
      });
    } else {
      clearAppsflyerUserId()
      this.setState({
        userAttributes: {},
        userInitialized: true
      }, () => setSentryUser({}));
    }
  }

  loadDatabase(databaseWrapper) {
    const currentTime = (new Date()).getTime();

    databaseWrapper
    .getDataById(CONFIGURATION_CACHE_KEY)
    .then((data) => {
      if (!data || data.version !== CONFIGURATION_CACHE_VERSION || data.language !== getBackendLocale() || !data.value || (data.expiration && currentTime > data.expiration)) {
        this.loadConfiguration(databaseWrapper);
      } else {
        this.setState(
          (previousState) => {
            const resolvedDefaultLeague = data.value?.localizedDefaultLeague?.[previousState.location?.country?.code] || data.value?.defaultLeague
            const updatedState = {configuration: data.value, league: previousState.league || determineLeague() || resolvedDefaultLeague}
            if (previousState.location?.country?.code) {
              updatedState.localizedCountryProviders = data.value?.localizedFeatures?.preferredProvidersV2?.[previousState.location.country.code] || []
              updatedState.localizedCountryProviders = updatedState.localizedCountryProviders.filter(x => x in SPORTSBOOKS_CONFIG)
              updatedState.betslipProviders = data.value?.localizedFeatures?.betslip?.[previousState.location.country.code] || []
              updatedState.betslipProviders = updatedState.betslipProviders.filter(x => x in SPORTSBOOKS_CONFIG)
              updatedState.enabledFeatures = new Set(
                Object.keys(data.value?.localizedFeatures || {})
                .filter(feature => {
                  if (Array.isArray(data.value.localizedFeatures[feature])) {
                    return data.value.localizedFeatures[feature].includes(previousState.location.country.code)
                  } else if (isDictionary(data.value.localizedFeatures[feature])) {
                    return previousState.location.country.code in data.value.localizedFeatures[feature]
                  }
                  return false
                })
              )
            }
            if (previousState.location?.region?.code) {
              updatedState.localizedRegionProviders = data.value?.localizedFeatures?.preferredProvidersV2?.[previousState.location.region.code] || []
              updatedState.localizedRegionProviders = updatedState.localizedRegionProviders.filter(x => x in SPORTSBOOKS_CONFIG)
            }
            return updatedState
          }, 
          () => {
            const resolvedDefaultLeague =
              data.value?.localizedDefaultLeague?.[this.state.location?.country?.code] ||
              data.value?.defaultLeague

            const league = determineLeague() || resolvedDefaultLeague
            const leagueMetadata = data.value.leagues[league]
            Promise.all(getGamedaySchedule(API_HOST, league, leagueMetadata.recordType, false, SUPPORTED_LEAGUES?.[league]?.scheduleFormat).concat([getAllTeams(API_HOST, league)]))
              .then((result) => {
                const teams = result[2];
                this.setState(
                  {
                    gamesLoaded: true,
                    currentGames: result[0],
                    upcomingGames: result[1],
                    teams: teams,
                    leagueMetadata: leagueMetadata
                  }
                );
              })
              .catch((error) => {
                console.log(error);
                this.setState(
                  {
                    gamesLoaded: true,
                    currentGames: [],
                    upcomingGames: [],
                    teams: [],
                    teamSituationalStatsRankings: {},
                    teamPropRankings: {},
                    league: league,
                    configurationMetadata: {},
                    leagueMetadata: {}
                  }
                );
              })
          }
        );
      }
    })
    .catch((error) => {
      console.log(error)
    })

    databaseWrapper
    .getDataById("betslip")
    .then((data) => {
      if (data && data.value && (!data.expiration || currentTime <= data.expiration)) {
        this.setState({betslip: data.value})
      }
    })
  }

  // TODO: de-duplicate code with the config loading in loadDatabase()
  loadConfiguration(databaseWrapper) {
    const language = getBackendLocale();
    fetch(`${API_HOST}/api/configuration/v${CONFIGURATION_VERSION}?platform=web`)
    .then((data) => data.json())
    .then((data) => {
      // A response for a previous language must not replace the current configuration.
      if (language !== getBackendLocale()) return;
      this.setState(
        (previousState) => {
          const resolvedDefaultLeague =
            data?.localizedDefaultLeague?.[previousState.location?.country?.code] ||
            data?.defaultLeague

          const updatedState = {
            configuration: data,
            league: previousState.league || determineLeague() || resolvedDefaultLeague
          }
          if (previousState.location?.country?.code) {
            updatedState.localizedCountryProviders = data?.localizedFeatures?.preferredProvidersV2?.[previousState.location.country.code] || []
            updatedState.localizedCountryProviders = updatedState.localizedCountryProviders.filter(x => x in SPORTSBOOKS_CONFIG)
            updatedState.betslipProviders = data?.localizedFeatures?.betslip?.[previousState.location.country.code] || []
            updatedState.betslipProviders = updatedState.betslipProviders.filter(x => x in SPORTSBOOKS_CONFIG)
            updatedState.enabledFeatures = new Set(
              Object.keys(data?.localizedFeatures || {})
              .filter(feature => {
                if (Array.isArray(data.localizedFeatures[feature])) {
                  return data.localizedFeatures[feature].includes(previousState.location.country.code)
                } else if (isDictionary(data.localizedFeatures[feature])) {
                  return previousState.location.country.code in data.localizedFeatures[feature]
                }
                return false
              })
            )
          }
          if (previousState.location?.region?.code) {
            updatedState.localizedRegionProviders = data?.localizedFeatures?.preferredProvidersV2?.[previousState.location.region.code] || []
            updatedState.localizedRegionProviders = updatedState.localizedRegionProviders.filter(x => x in SPORTSBOOKS_CONFIG)
          }
          return updatedState
        }, 
        () => {
          const resolvedDefaultLeague =
            data?.localizedDefaultLeague?.[this.state.location?.country?.code] ||
            data?.defaultLeague

          const league = determineLeague() || resolvedDefaultLeague
          const leagueMetadata = data.leagues[league]

          Promise.all(getGamedaySchedule(API_HOST, league, leagueMetadata.recordType, false).concat([getAllTeams(API_HOST, league)]))
          .then((result) => {
            const teams = result[2];
            this.setState(
              {
                gamesLoaded: true,
                currentGames: result[0],
                upcomingGames: result[1],
                teams: teams,
                leagueMetadata: leagueMetadata
              }
            );
          })
          .catch((error) => {
            console.log(error);
            this.setState(
              {
                gamesLoaded: true,
                currentGames: [],
                upcomingGames: [],
                teams: [],
                teamSituationalStatsRankings: {},
                teamPropRankings: {},
                league: league,
                configurationMetadata: {},
                leagueMetadata: {}
              }
            );
          })
        }
      )
      databaseWrapper.addData({version: CONFIGURATION_CACHE_VERSION, language, expiration: (new Date()).getTime() + (1 * HOUR_MS_MULTIPLIER), value: data}, CONFIGURATION_CACHE_KEY)
    });
  }

  loadLocation(databaseWrapper) {
    return loadCachedLocation(databaseWrapper, () => fetchCurrentLocation(API_HOST), shouldSkipLocationFetch())
    .then(location => location || DEFAULT_LOCATION)
    .then(response => {
      this.setState((previousState) => {
        const updatedState = {location: response}
        if (response?.country?.code && previousState.configuration) {
          updatedState.localizedCountryProviders = previousState.configuration?.localizedFeatures?.preferredProvidersV2?.[response.country.code] || []
          updatedState.localizedCountryProviders = updatedState.localizedCountryProviders.filter(x => x in SPORTSBOOKS_CONFIG)
          updatedState.betslipProviders = previousState.configuration?.localizedFeatures?.betslip?.[response.country.code] || []
          updatedState.betslipProviders = updatedState.betslipProviders.filter(x => x in SPORTSBOOKS_CONFIG)
          updatedState.enabledFeatures = new Set(
            Object.keys(previousState.configuration?.localizedFeatures || {})
            .filter(feature => {
              if (Array.isArray(previousState.configuration.localizedFeatures[feature])) {
                return previousState.configuration.localizedFeatures[feature].includes(response.country.code)
              } else if (isDictionary(previousState.configuration.localizedFeatures[feature])) {
                return response.country.code in previousState.configuration.localizedFeatures[feature]
              }
              return false
            })
          )
        }
        if (response?.region?.code && previousState.configuration) {
          updatedState.localizedRegionProviders = previousState.configuration?.localizedFeatures?.preferredProvidersV2?.[response.region.code] || []
          updatedState.localizedRegionProviders = updatedState.localizedRegionProviders.filter(x => x in SPORTSBOOKS_CONFIG)
        }
        return updatedState
      });
      return response;
    })
    .catch(error => {
      console.log(`Unable to get location data ${error}`)
      return DEFAULT_LOCATION;
    })
  }

  clearBetslip() {
    this.saveBetslip(DEFAULT_BETSLIP)
    this.setState({betslip: _.cloneDeep(DEFAULT_BETSLIP)})
  }

  removeLegsFromBetslip(legs) {
    this.setState((state) => {
      for (let leg of legs) {
        const legKey = getBetslipLegKey(leg?.league, leg)
        if (legKey in state.betslip.legs) {
          delete state.betslip.legs[legKey]
        }
        const participantMarketKey = getBetslipCanonicalLegKey(leg?.league, leg)
        if (participantMarketKey in state.betslip.canonicalLegs) {
          delete state.betslip.canonicalLegs[participantMarketKey]
        }
      }
      state.betslip.groupedLegs = groupBetslipLegs(Object.values(state.betslip.legs))
      state.betslip.analyzedLegs = analyzeBetslipLegs(state.betslip.legs, state.localizedCountryProviders)
      this.saveBetslip(state.betslip)
      return state
    }, async () => {
      const preProcessedBetslipDetails = await transformAndGetBetslipDetails(API_HOST, this.state.betslip.analyzedLegs, this.state.location?.region?.code)
      if (preProcessedBetslipDetails?.fetched) {
        logCustomEvent({
          amplitudeInstance: this.state.amplitudeInstance,
          league: this.state.league,
          userAttributes: this.state.userAttributes
        }, 'betslip_details_fetched', preProcessedBetslipDetails)
      }
      this.setState((previousState) => {
        const betslip = {
          ...previousState.betslip, 
          preProcessedBetslipDetails: preProcessedBetslipDetails
        }
        this.saveBetslip(betslip)
        return {betslip: betslip}
      })
    })
  }

  addLegsToBetslip(legs, callback) {
    this.setState((previousState) => {
      const betslip = previousState.betslip
      for (let leg of legs) {
        const league = leg.league || this.state.league
        leg.league = league
        const legKey = getBetslipLegKey(league, leg)
        if (legKey in betslip.legs) {
          continue
        }
        const participantMarketKey = getBetslipCanonicalLegKey(league, leg)
        if (participantMarketKey in betslip.canonicalLegs) {
          // If we have a leg that's got the same participant and prop remove the old and replace with new
          const existingParticipantMarketLeg = betslip.canonicalLegs[participantMarketKey]
          delete betslip.legs[getBetslipLegKey(league, existingParticipantMarketLeg)]
        }
        betslip.canonicalLegs[participantMarketKey] = leg
        betslip.legs[legKey] = leg
      }
      // Not the most efficient. Would be faster to do it all during the looping of legs but this reduces some code duplication
      betslip.groupedLegs = groupBetslipLegs(Object.values(betslip.legs))
      betslip.analyzedLegs = analyzeBetslipLegs(betslip.legs, previousState.localizedCountryProviders)
      this.saveBetslip(betslip)
      return {betslip: betslip}
    }, async () => {
      callback && callback()
      const preProcessedBetslipDetails = await transformAndGetBetslipDetails(API_HOST, this.state.betslip.analyzedLegs, this.state.location?.region?.code)
      if (preProcessedBetslipDetails?.fetched) {
        logCustomEvent({
          amplitudeInstance: this.state.amplitudeInstance,
          league: this.state.league,
          userAttributes: this.state.userAttributes
        }, 'betslip_details_fetched', preProcessedBetslipDetails)
      }
      this.setState((previousState) => {
        const betslip = {
          ...previousState.betslip, 
          preProcessedBetslipDetails: preProcessedBetslipDetails
        }
        this.saveBetslip(betslip)
        return {betslip: betslip}
      })
    })
  }

  saveBetslip(betslip) {
    this.state.databaseWrapper.addData({version: 1, expiration: (new Date()).getTime() + (1 * HOUR_MS_MULTIPLIER), value: betslip}, "betslip")
  }

  setUserAttributes(userAttributes) {
    this.setState({
      userAttributes: userAttributes
    });
  }

  render() {
    if (!(this.state.configuration && this.state.authStateReady && this.state.userInitialized)) {
      // Privacy initialization and explicitly requested preferences do not depend
      // on the main app's configuration/authentication finishing.
      return (
        <>
          <PrivacyNotice preferences={this.state.privacyPreferences} />
        </>
      );
    }

    const predictionMarketsEnabled = canAccessPredictionMarkets(this.state.location, this.state.userAttributes);

    return (
      <GlobalContextProvider value={
        {
          league: this.state.league,
          user: auth.currentUser,
          userAttributes: this.state.userAttributes,
          setUserAttributes: this.setUserAttributes,
          configuration: this.state.configuration,
          location: this.state.location,
          theme: getTheme(),
          updateTheme: this.updateTheme,
          tab: determineTab(),
          cookies: this.props.cookies,
          currentGames: this.state.currentGames,
          upcomingGames: this.state.upcomingGames,
          localizedCountryProviders: this.state.localizedCountryProviders,
          localizedRegionProviders: this.state.localizedRegionProviders,
          resolvedPreferredProviders: resolvePreferredProviders(this.state.userAttributes, this.state.localizedCountryProviders),
          betslipProviders: this.state.betslipProviders,
          betslip: this.state.betslip,
          addLegsToBetslip: this.addLegsToBetslip,
          removeLegsFromBetslip: this.removeLegsFromBetslip,
          clearBetslip: this.clearBetslip,
          enabledFeatures: this.state.enabledFeatures,
          // enabledFeatures: new Set(),
          amplitudeInstance: this.state.amplitudeInstance,
          marketingConsentGranted: this.state.marketingConsentGranted,
          teams: this.state.teams
        }
      }>
        <React.StrictMode>
          <Router history={history}>
            <div style={{display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', minHeight: '100vh'}}>
              <ToastModal isVisible={this.state.showWhatsNew} onClose={() => this.setState({showWhatsNew: false})}/>
              <Switch>
                  {Object.keys(SUPPORTED_LEAGUES)
                    .filter((league) => !this.state.configuration.leagues?.[league]?.enabled)
                    .map((league) => (
                      <Route
                        key={`${league}-disabled`}
                        path={[`/${league}`, `/stats/${league}`, `/odds/${league}`]}
                      >
                        <RetiredLeagueRedirect
                          configuration={this.state.configuration}
                          country={this.state.location?.country?.code}
                        />
                      </Route>
                    ))}
                  {/* Account related pages */}
                  <Route exact path="/authentication/action">
                    <AuthenticationActionPage userAttributes={this.state.userAttributes} userInitialized={this.state.userInitialized} user={auth.currentUser} />
                  </Route>
                  <Route exact path="/mobile">
                    <NavigationBar />
                    <MobileLandingPage />
                  </Route>
                  <Route exact path="/authentication">
                    <AuthenticationPage userAttributes={this.state.userAttributes} userInitialized={this.state.userInitialized} user={auth.currentUser} />
                  </Route> 

                  <Route exact path="/login">
                    <Login/>
                  </Route> 

                  <Route exact path="/signup">
                    <Signup/>
                  </Route> 

                  <Route exact path="/password-reset">
                    <ForgotPassword user={auth.currentUser} />
                  </Route> 

                  <Route exact path="/verify-email">
                    <VerifyEmailPage/>
                  </Route> 

                  <Route exact path="/profile">
                    <NavigationBar/>
                    <Profile/>
                  </Route>

                  <Route exact path="/preferences">
                    <RedirectWithSearch to={{pathname: `/profile`}}/>
                  </Route>

                  <Route exact path="/pricing">
                    <NavigationBar/>
                    <Pricing/>
                    <Footer pageFooter/>
                  </Route>

                  <Route exact path="/paywall">
                    <RedirectWithSearch to={{pathname: `/pricing`}}/>
                  </Route>

                  <Route exact path="/glossary">
                    <NavigationBar/>
                    <Glossary />
                    <Footer pageFooter/>
                  </Route>

                  <Route exact path="/">
                    <RedirectWithSearch to={{pathname: `/${this.state.league}`}}/>
                  </Route>

                  <Route exact path="/support">
                    <NavigationBar />
                    <Support />
                    <Footer pageFooter />
                  </Route>

                  {/* League-based pages */}
                  {
                    Object.keys(SUPPORTED_LEAGUES).flatMap((league) => [
                      <Route key={`${league}-gameday`} exact path={`/${league}/gameday`}>
                        <RedirectWithSearch to={{pathname: `/${league}`}}/>
                      </Route>,

                      <Route key={`${league}-home`} exact path={`/${league}`}>
                        <NavigationBar/>
                        <Home/>
                      </Route>,

                      <Route key={`${league}-summary-game`} exact path={`/${league}/summary/:gameID`}>
                        <NavigationBar />
                        <GameSummary />
                      </Route>,

                      <Route key={`${league}-games-summary`} exact path={`/${league}/games/:gameID/summary`}>
                        <NavigationBar />
                        <GameSummary />
                      </Route>,

                      <Route key={`${league}-summary`} exact path={`/${league}/summary`}>
                        <NavigationBar />
                        <GameSummary />
                      </Route>,

                      <Route key={`${league}-cheatsheets`} exact path={`/${league}/cheatsheets/:prop`}>
                        <NavigationBar/>
                        <CheatSheet/>
                      </Route>,

                      <Route key={`${league}-trends`} exact path={`/${league}/trends`}>
                        <NavigationBar/>
                        <Trends/>
                      </Route>,

                      <Route key={`${league}-prediction-markets`} exact path={`/${league}/prediction-markets/:marketTool`}>
                        {predictionMarketsEnabled ? (
                          <>
                            <NavigationBar/>
                            <PredictionMarkets />
                          </>
                        ) : (
                          <RedirectWithSearch to={{pathname: `/${league}`}}/>
                        )}
                      </Route>,

                      <Route key={`${league}-chat`} exact path={`/${league}/tools/chat`}>
                        {/* Keep the navbar spacer and chat together inside the outer space-between layout. */}
                        <div style={{ width: '100%', flex: 1 }}>
                          <NavigationBar/>
                          <React.Suspense fallback={<main role="status" style={{ padding: 32 }}>Loading sports chat…</main>}><SportsChat /></React.Suspense>
                        </div>
                      </Route>,

                      <Route key={`${league}-starting-pitchers`} exact path={`/${league}/tools/starting-pitchers`}>
                        <NavigationBar/>
                        <StartingPitchers />
                      </Route>,

                      <Route key={`${league}-opponent-defensive-rank`} exact path={`/${league}/tools/opponent-defensive-rank`}>
                        <NavigationBar/>
                        <OpponentDefensiveRank />
                      </Route>,

                      <Route key={`${league}-starting-lineups`} exact path={`/${league}/tools/starting-lineups`}>
                        <NavigationBar/>
                        <StartingLineups />
                      </Route>,

                      <Route key={`${league}-weather-report`} exact path={`/${league}/tools/weather-report`}>
                        <NavigationBar/>
                        <WeatherReport />
                      </Route>,

                      <Route key={`${league}-injury-impact`} exact path={`/${league}/tools/injury-impact`}>
                        <NavigationBar/>
                        <InjuryImpact />
                      </Route>,

                      <Route
                        key={`${league}-team-profile`}
                        exact
                        path={`/${league}/teams/:teamCode/profile`}
                        render={({match}) => (
                          <>
                            <NavigationBar/>
                            <Trends
                              profile={true}
                              teamCode={match.params.teamCode?.toUpperCase()}
                              title="Profile"
                              subtitle={match.params.teamCode?.toUpperCase()}
                            />
                          </>
                        )}
                      />,

                      <Route
                        key={`${league}-profile-team-player`}
                        exact
                        path={`/${league}/profile/:teamCode/:playerId`}
                        render={({match}) => (
                          <ProfileWorkstation teamCode={match.params.teamCode?.toUpperCase()} playerId={match.params.playerId}/>
                        )}
                      />,

                      <Route
                        key={`${league}-players-profile`}
                        exact
                        path={`/${league}/players/:playerId/profile`}
                        render={({match}) => (
                          <>
                            <NavigationBar/>
                            <StatsProfile playerId={match.params.playerId} profile={true}/>
                          </>
                        )}
                      />,

                      <Route
                        key={`${league}-players`}
                        exact
                        path={`/${league}/players/:playerId`}
                        render={({match}) => (
                          <>
                            <NavigationBar/>
                            <StatsProfile playerId={match.params.playerId} profile={true}/>
                          </>
                        )}
                      />,

                      ...(isSuperUser(this.state.userAttributes) ? [
                        <Route key={`${league}-socials`} exact path={`/${league}/socials`}>
                          <NavigationBar/>
                          <Socials/>
                          <Footer/>
                        </Route>
                      ] : []),

                      <Route key={`${league}-props`} exact path={`/${league}/tools/props`}>
                        <NavigationBar/>
                        <Props />
                      </Route>,

                      <Route key={`${league}-leaderboard`} exact path={`/${league}/tools/stats`}>
                        <NavigationBar/>
                        <Leaderboard />
                      </Route>,

                      <Route key={`${league}-standings`} exact path={`/${league}/tools/standings`}>
                        <NavigationBar/>
                        <Standings />
                      </Route>,

                      <Route key={`stats-${league}-player`} exact path={`/stats/${league}/players/:slug--:id`}>
                        <NavigationBar/>
                        <StatsPage type="player"/>
                        <Footer/>
                      </Route>,

                      <Route key={`stats-${league}`} exact path={`/stats/${league}`}>
                        <NavigationBar/>
                        <StatsPage type="league"/>
                        <Footer/>
                      </Route>,

                      <Route key={`odds-${league}`} exact path={`/odds/${league}`}>
                        <NavigationBar/>
                        <StatsPage type="odds"/>
                        <Footer/>
                      </Route>,
                    ])
                  }
                  
                  {/* Other pages */}
                  <Route exact path="/privacy-choices">
                    <Redirect to={PRIVACY_PREFERENCES_URL} />
                  </Route>

                  <Route exact path="/generate-trend">
                    <NavigationBar/>
                    <GenerateTrend />
                    <Footer/>
                  </Route>
                  
                  <Route exact path="/privacy">
                    <NavigationBar/>
                    <Privacy/>
                    <Footer pageFooter/>
                  </Route>

                  <Route exact path="/terms">
                    <NavigationBar/>
                    <Terms/>
                    <Footer pageFooter/>
                  </Route>

                  <Route exact path="/responsible-gambling">
                    <NavigationBar/>
                    <ResponsibleGamblingPage/>
                    <Footer pageFooter/>
                  </Route>

                  <Route exact path="/affiliate/offer">
                    <AffiliateOfferRedirect/>
                  </Route>

                  {/* TODO: test exact path with query params, should work since download works */}
                  <Route exact path="/affiliate">
                    <AffiliateRedirect/>
                  </Route>

                  <Route exact path="/success">
                    <PurchaseSuccessPage/>
                  </Route>

                  <Route exact path="/download">
                    <NavigationBar/>
                    <Download/>
                    <Footer pageFooter/>
                  </Route>

                  <Route exact path="/download-w2a">
                    <DownloadW2A/>
                  </Route>

                  <Route exact path="/manage-subscription">
                    <NavigationBar/>
                    <ManageSubscription/>
                    <Footer pageFooter/>
                  </Route>

                  {/* TODO: when we have the new 'my picks' sidebar, trigger it opening */}
                  <Route exact path="/picks">
                    <RedirectWithSearch to={{pathname: `/`}}/>
                  </Route>

                  <Route exact path="/bonuses">
                    {/* <NavigationBar/>
                    <Bonuses/>
                    <Footer pageFooter/> */}
                    <RedirectWithSearch to={{pathname: `/`}}/>
                  </Route>

                  <Route path="*">
                    <NavigationBar />
                    <NotFound />
                    <Footer pageFooter />
                  </Route>
              </Switch>
            </div>
            <PrivacyNotice preferences={this.state.privacyPreferences} />
          </Router>
        </React.StrictMode>
      </GlobalContextProvider>
    );
  }
}

export default withCookies(App);
