import cookieLanguage from './cookieLanguage.json';
import * as CookieConsent from 'vanilla-cookieconsent';

const OPTIONAL_CATEGORIES = ['functional', 'analytics', 'marketing'];
// Only recognised states (plus D.C.) can use the U.S. default-on policy.
// Missing/malformed regions and unreviewed territories stay opt-in.
const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const US_OPT_IN_STATES = new Set(['CO', 'MD']);
let preferencesReady = false;
let refreshPreferencesModal = () => {};

export const PRIVACY_PREFERENCES_URL = '/privacy?preferences=1#privacy-choices';

export function isPrivacyPreferencesRequest(location = window.location) {
  return location.pathname === '/privacy-choices'
    || (location.pathname === '/privacy' && new URLSearchParams(location.search).get('preferences') === '1');
}

export function setPrivacyPreferencesReady(ready) {
  preferencesReady = ready;
  if (!ready) refreshPreferencesModal = () => {};
}

export function openPrivacyPreferences() {
  if (!preferencesReady) return false;
  refreshPrivacyPreferences();
  CookieConsent.hide();
  CookieConsent.showPreferences();
  return true;
}

export function refreshPrivacyPreferences() {
  if (hasGlobalPrivacyControl()) {
    CookieConsent.hide();
    if (!CookieConsent.validConsent() || OPTIONAL_CATEGORIES.some(category => CookieConsent.acceptedCategory(category))) {
      CookieConsent.acceptCategory('necessary');
    }
  }
  refreshPreferencesModal(false);
}

const getStoredPolicy = consent => {
  const data = consent.getCookie('data');
  // Read the earlier analytics-only record as well as the current category-wide record.
  const profile = data?.optionalPolicy || data?.analyticsPolicy;
  // Older notice-mode records must still require fresh consent in strict regions.
  return profile === 'US_NOTICE_AND_RIGHTS' ? 'NOTICE' : profile;
};

export const hasGlobalPrivacyControl = () => (
  typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true
);

export function getPrivacyPolicy(location) {
  const isUS = location?.country?.code === 'US';
  const regionCode = typeof location?.region?.code === 'string'
    ? location.region.code.trim().toUpperCase().replace(/^US-/, '')
    : '';
  const defaultOn = isUS && US_STATES.has(regionCode) && !US_OPT_IN_STATES.has(regionCode);
  return {
    profile: defaultOn ? 'NOTICE' : 'STRICT_OPT_IN',
    functionalDefault: defaultOn,
    analyticsDefault: defaultOn,
    marketingDefault: defaultOn,
  };
}

export function getTrackingPermissions(policy, consent, gpc = hasGlobalPrivacyControl()) {
  if (!policy || gpc) {
    return { functional: false, analytics: false, marketing: false };
  }

  const hasSavedPreferences = consent.validConsent();
  const needsFreshOptIn = policy.profile === 'STRICT_OPT_IN'
    && getStoredPolicy(consent) === 'NOTICE';
  return Object.fromEntries(OPTIONAL_CATEGORIES.map(category => [
    category,
    hasSavedPreferences
      ? consent.acceptedCategory(category) && !needsFreshOptIn
      : !!policy[`${category}Default`],
  ]));
}

export function createConsentConfig(policy, onChange, gpc = hasGlobalPrivacyControl(), { preferencesRequested = false } = {}) {
  const language = JSON.parse(JSON.stringify(cookieLanguage));
  const isOptOut = policy.profile === 'NOTICE';
  const explanation = signal => signal
    ? 'Your browser sends Global Privacy Control. We honor this signal by disabling all optional analytics, diagnostics, and marketing tools. Necessary services remain available.'
    : isOptOut
      ? 'Product analytics, diagnostics, and marketing tools are enabled by default unless you opt out. You can turn off individual categories or reject all optional tracking here. Reopen these preferences using Your Privacy Choices in the footer.'
      : 'We use necessary storage to provide the service. Optional diagnostics, product analytics, and marketing tools run only when you enable their categories. You can change your choices at any time using Privacy choices.';

  const consentDescription = gpc || isOptOut ? explanation(gpc) : language.consentModal.description;
  language.consentModal.description = `${consentDescription} <a class="cc-link" href="/privacy#privacy-choices">Read our privacy notice</a>.`;
  language.preferencesModal.sections[0].description = explanation(gpc);

  let modal;
  let lastGpc;
  const updateModal = (force = true) => {
    if (!modal) return;
    const signal = hasGlobalPrivacyControl();
    // Focus/visibility updates must not overwrite unsaved selections unless GPC changed.
    if (!force && lastGpc === signal) return;
    lastGpc = signal;
    const permissions = getTrackingPermissions(policy, CookieConsent, signal);
    modal.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (input.value !== 'necessary' && !OPTIONAL_CATEGORIES.includes(input.value)) return;
      input.checked = input.value === 'necessary' || permissions[input.value];
      input.disabled = input.value === 'necessary' || signal;
    });
    // CookieConsent readOnly means always ON, so lock GPC choices in the modal
    // without marking optional categories necessary or changing their semantics.
    modal.querySelectorAll('button[data-role="all"]').forEach(button => {
      button.hidden = signal;
      button.disabled = signal;
      button.style.display = signal ? 'none' : '';
    });
    const saveButton = modal.querySelector('button[data-role="save"]');
    if (saveButton) saveButton.textContent = signal ? 'Keep optional tracking off' : language.preferencesModal.savePreferencesBtn;
    const description = modal.querySelector('.pm__section-desc');
    if (description) {
      description.textContent = explanation(signal);
      if (signal) description.setAttribute('role', 'status');
      else description.removeAttribute('role');
    }
  };
  refreshPreferencesModal = updateModal;

  const enforceGpc = () => {
    if (hasGlobalPrivacyControl() && OPTIONAL_CATEGORIES.some(category => CookieConsent.acceptedCategory(category))) {
      CookieConsent.acceptCategory('necessary');
      return true;
    }
    return false;
  };

  const recordChoice = () => {
    if (enforceGpc()) return;
    const data = CookieConsent.getCookie('data');
    CookieConsent.setCookieData({ value: {
      ...(data && typeof data === 'object' ? data : {}),
      optionalPolicy: policy.profile,
    } });
    onChange();
  };

  return {
    mode: isOptOut && !gpc ? 'opt-out' : 'opt-in',
    // GPC is already an opt-out, not a reason to ask for consent again.
    // An explicitly requested preferences modal replaces the initial prompt.
    autoShow: !isOptOut && !gpc && !preferencesRequested,
    categories: {
      necessary: { enabled: true, readOnly: true },
      functional: { enabled: isOptOut && !gpc },
      analytics: { enabled: isOptOut && !gpc },
      marketing: { enabled: isOptOut && !gpc },
    },
    language: { default: 'en', translations: { en: language } },
    onFirstConsent: recordChoice,
    onConsent: () => { if (!enforceGpc()) onChange(); },
    onChange: recordChoice,
    onModalReady: ({ modalName, modal: element }) => {
      if (modalName !== 'preferencesModal') return;
      modal = element;
      updateModal();
    },
    onModalShow: ({ modalName }) => {
      if (modalName === 'preferencesModal') updateModal();
    },
  };
}

export function renewOptionalOptIn(policy, consent = CookieConsent, showPrompt = true) {
  // Preselected U.S. categories are not affirmative opt-in when a visitor later
  // enters a stricter jurisdiction. This applies to every optional category.
  if (policy.profile !== 'STRICT_OPT_IN'
    || getStoredPolicy(consent) !== 'NOTICE'
    || !OPTIONAL_CATEGORIES.some(category => consent.acceptedCategory(category))) return;

  const categories = consent.getUserPreferences().acceptedCategories.filter(category => !OPTIONAL_CATEGORIES.includes(category));
  consent.acceptCategory(categories);
  if (showPrompt && !hasGlobalPrivacyControl()) consent.show(true);
}

// SDKs commonly set cookies on the parent domain. Clear both host-only and
// parent-domain cookies, plus matching browser storage, when a category is off.
export function clearTrackingStorage(pattern) {
  if (typeof window === 'undefined') return;

  for (const storageName of ['localStorage', 'sessionStorage']) {
    try {
      const storage = window[storageName];
      Object.keys(storage).filter(key => pattern.test(key)).forEach(key => storage.removeItem(key));
    } catch {
      // Some browsers deny access to storage altogether.
    }
  }

  const parts = window.location.hostname.split('.');
  const domains = [''];
  for (let i = 0; i < parts.length - 1; i += 1) {
    domains.push(`; Domain=${parts.slice(i).join('.')}`);
  }
  document.cookie.split(';').forEach(entry => {
    const name = entry.trim().split('=')[0];
    if (pattern.test(name)) {
      domains.forEach(domain => {
        document.cookie = `${name}=; Max-Age=0; Path=/${domain}; SameSite=Lax`;
      });
    }
  });
}
