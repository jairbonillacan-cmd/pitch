import * as amplitude from '@amplitude/analytics-browser';
import { isPaidUser } from './linemate-react-common/src/util';
import { clearTrackingStorage, hasGlobalPrivacyControl } from './privacy';
import { logThirdPartyStatus, monitorThirdPartyScript, warnThirdPartyStatus } from './third-party-debug';

let initialized = false;
let googleConsentConfigured = false;
let googleAnalyticsStarted = false;
let googleAnalyticsAllowed = false;
let amplitudeAllowed = false;

// Verified against the published GTM-PW3JHDD container. Keep the same stream
// while loading only its Google Analytics tag, rather than the whole container.
export const GA4_MEASUREMENT_ID = process.env.REACT_APP_GA4_MEASUREMENT_ID || 'G-116J5RPQK9';

function pushGoogleTagCommand(...args) {
    if (typeof window === 'undefined') {
        return;
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
        window.dataLayer.push(arguments);
    };
    window.gtag(...args);
}

/**
 * Queue denied defaults before any Google script loads. The tag itself stays
 * blocked until the regional policy and the visitor's preferences allow it.
 */
export const initializeGoogleConsent = () => {
    if (googleConsentConfigured) {
        return;
    }

    window[`ga-disable-${GA4_MEASUREMENT_ID}`] = true;
    pushGoogleTagCommand('consent', 'default', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
    });
    pushGoogleTagCommand('set', 'ads_data_redaction', true);
    googleConsentConfigured = true;
};

/**
 * GA4 is used only for product analytics. Its advertising permissions stay
 * denied even when the separate Marketing category is accepted.
 */
export const updateGoogleConsent = ({ analyticsGranted }) => {
    initializeGoogleConsent();
    pushGoogleTagCommand('consent', 'update', {
        analytics_storage: analyticsGranted ? 'granted' : 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
    });
};

export function startGoogleAnalytics(userId) {
    if (hasGlobalPrivacyControl() || /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(window.location.hostname)) {
        return;
    }

    initializeGoogleConsent();
    googleAnalyticsAllowed = true;
    window[`ga-disable-${GA4_MEASUREMENT_ID}`] = false;
    updateGoogleConsent({ analyticsGranted: true });
    setGoogleAnalyticsUserId(userId);

    if (googleAnalyticsStarted) return;
    googleAnalyticsStarted = true;
    pushGoogleTagCommand('js', new Date());
    pushGoogleTagCommand('config', GA4_MEASUREMENT_ID, {
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        // The existing GA4 stream has Enhanced Measurement's browser-history
        // page views enabled. It owns SPA views; do not also send them manually.
        send_page_view: true,
    });

    const script = document.createElement('script');
    script.id = 'linemate-ga4';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_MEASUREMENT_ID)}`;
    monitorThirdPartyScript(script, 'GA4');
    document.head.appendChild(script);
}

export function stopGoogleAnalytics() {
    googleAnalyticsAllowed = false;
    if (typeof window === 'undefined') return;
    // Stop collection before sending the consent update or reloading the page.
    window[`ga-disable-${GA4_MEASUREMENT_ID}`] = true;
    updateGoogleConsent({ analyticsGranted: false });
    clearTrackingStorage(/^(_ga($|_)|_gid$|_gat($|_))/i);
}

export function trackGoogleSignUp(method) {
    if (!googleAnalyticsAllowed || hasGlobalPrivacyControl()) return;
    pushGoogleTagCommand('event', 'sign_up', { method, send_to: GA4_MEASUREMENT_ID });
}

/**
 * Sets GA4's reserved User-ID for the direct Google Analytics tag. The
 * website uses the opaque Linemate user UUID, never Firebase's UID or PII.
 */
export const setGoogleAnalyticsUserId = (userId = null) => {
    if (typeof window === 'undefined' || !googleAnalyticsAllowed || hasGlobalPrivacyControl()) {
        return;
    }

    const normalizedUserId = typeof userId === 'string' && userId.length > 0
        ? userId
        : null;

    // `set` changes the ID for all following events without emitting an event.
    if (typeof window.gtag === 'function') {
        window.gtag('set', { user_id: normalizedUserId });
    }

};

export const getAmplitude = (userId) => {
    if (hasGlobalPrivacyControl() || !process.env.REACT_APP_AMPLITUDE_API_KEY) return null;
    amplitudeAllowed = true;
    if (!initialized) {
        logThirdPartyStatus('Amplitude', 'initialization requested');
        const initialization = amplitude.init(
            process.env.REACT_APP_AMPLITUDE_API_KEY,
            userId || undefined,
            {
                // Keep product events and page/session counts. Broader capture
                // and marketing attribution require a separate reviewed scope.
                autocapture: {
                    attribution: false,
                    // App.jsx emits one sanitized view on each pathname change.
                    pageViews: false,
                    sessions: true,
                    formInteractions: false,
                    fileDownloads: false,
                    elementInteractions: false,
                    frustrationInteractions: false,
                    networkTracking: false,
                    pageUrlEnrichment: false,
                    webVitals: false,
                },
                remoteConfig: { fetchRemoteConfig: false },
            }
        );
        initialization.promise.then(
            () => logThirdPartyStatus('Amplitude', 'initialized'),
            () => warnThirdPartyStatus('Amplitude', 'initialization failed')
        );
        initialized = true;
    }

    // The caller has resolved the current regional policy and preferences.
    amplitude.setOptOut(false);
    amplitude.setUserId(userId || undefined);
    return amplitude;
}

export const stopAmplitudeTracking = () => {
    amplitudeAllowed = false;
    if (initialized) {
        amplitude.setOptOut(true);
        amplitude.setUserId(undefined);
    }

    // The SDK's opt-out flag prevents future sends. Remove the locally stored
    // analytics identity as well, rather than calling reset(), which creates a
    // fresh anonymous device identity for the next session.
    clearTrackingStorage(/^(amp_|amplitude)/i);
};

export function trackAmplitudePageView(amplitudeInstance, location = window.location) {
    if (!amplitudeAllowed || hasGlobalPrivacyControl() || !amplitudeInstance) return;
    const pageUrl = `${window.location.origin}${location.pathname}`;
    amplitudeInstance.track('[Amplitude] Page Viewed', {
        '[Amplitude] Page Domain': window.location.hostname,
        '[Amplitude] Page Location': pageUrl,
        '[Amplitude] Page URL': pageUrl,
        '[Amplitude] Page Path': location.pathname,
    });
}

function buildDefaultEventProps(analyticsContext = {}) {
    const defaultProps = {};

    if (analyticsContext?.league) {
        defaultProps.league = analyticsContext.league;
    }

    if (analyticsContext?.userAttributes) {
        defaultProps.isPaidUser = isPaidUser(analyticsContext.userAttributes);
        defaultProps.is_paid_user = isPaidUser(analyticsContext.userAttributes);
    }

    return defaultProps;
}

function getAmplitudeInstance(analyticsContext = {}) {
    return analyticsContext?.amplitudeInstance || null;
}

export const logCustomEvent = (
    analyticsContext,
    eventName,
    opts
) => {
    try {
        const amplitudeInstance = getAmplitudeInstance(analyticsContext);
        if (!amplitudeAllowed || hasGlobalPrivacyControl() || !amplitudeInstance || !eventName) {
            return;
        }

        const defaultProps = buildDefaultEventProps(analyticsContext);
        const mergedProps = opts && typeof opts === 'object' && !Array.isArray(opts)
            ? {
                ...defaultProps,
                ...opts
            }
            : (Object.keys(defaultProps).length > 0 ? defaultProps : opts);

        amplitudeInstance.track(eventName, mergedProps);
    } catch (error) {
        console.error(error);
    }
}

export const trackAdImpression = (
    analyticsContext,
    {
        operator,
        affiliate,
        source,
        additionalProperties = {}
    } = {}
) => {
    const normalizedOperator = operator || affiliate;
    if (!getAmplitudeInstance(analyticsContext) || !normalizedOperator || !source) {
        return;
    }

    logCustomEvent(analyticsContext, 'ad_impression', {
        operator: normalizedOperator,
        affiliate: affiliate || normalizedOperator,
        source,
        ...additionalProperties
    });
}
