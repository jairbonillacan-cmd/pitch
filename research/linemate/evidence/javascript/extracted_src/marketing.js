import { clearTrackingStorage, hasGlobalPrivacyControl } from './privacy';
import { monitorThirdPartyScript } from './third-party-debug';

const FIRST_PROMOTER_CUSTOMER_ID = 'eno97akw';
const META_PIXEL_ID = '1139595960849083';
const APPS_FLYER_WEB_APP_ID = 'b0dfae88-8303-45c9-bdea-bf87fd72d010';

let firstPromoterStarted = false;
let metaPixelStarted = false;
let appsFlyerStarted = false;

function appendScript(id, src, component) {
  if (document.getElementById(id)) {
    return;
  }

  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  monitorThirdPartyScript(script, component);
  document.head.appendChild(script);
}

function startFirstPromoter() {
  if (firstPromoterStarted || typeof window === 'undefined') {
    return;
  }

  window.fpr = window.fpr || function firstPromoterQueue(...args) {
    window.fpr.q = window.fpr.q || [];
    window.fpr.q.push(args);
  };
  window.fpr('init', { cid: FIRST_PROMOTER_CUSTOMER_ID });
  window.fpr('click');
  appendScript('first-promoter-sdk', 'https://cdn.firstpromoter.com/fpr.js', 'FirstPromoter');
  firstPromoterStarted = true;
}

function startMetaPixel() {
  if (typeof window === 'undefined') {
    return;
  }

  if (!window.fbq) {
    const fbq = function metaPixelQueue(...args) {
      if (fbq.callMethod) {
        fbq.callMethod(...args);
      } else {
        fbq.queue.push(args);
      }
    };
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = '2.0';
    window.fbq = fbq;
    window._fbq = fbq;
    appendScript('meta-pixel-sdk', 'https://connect.facebook.net/en_US/fbevents.js', 'Meta Pixel');
  }

  window.fbq('consent', 'grant');
  if (!metaPixelStarted) {
    window.fbq('init', META_PIXEL_ID);
    window.fbq('track', 'PageView');
    metaPixelStarted = true;
  }
}

function startAppsFlyer() {
  if (appsFlyerStarted || typeof window === 'undefined') {
    return;
  }

  window.AppsFlyerSdkObject = 'AF';
  window.AF = window.AF || function appsFlyerQueue(...args) {
    window.AF.q = window.AF.q || [];
    window.AF.q.push([Date.now(), ...args]);
  };
  window.AF.id = window.AF.id || { pba: { webAppId: APPS_FLYER_WEB_APP_ID } };
  window.AF.plugins = window.AF.plugins || {};
  appendScript('appsflyer-pba-sdk', 'https://websdk.appsflyersdk.com?st=pba', 'AppsFlyer PBA');
  appsFlyerStarted = true;
}

export function startMarketingTracking() {
  if (hasGlobalPrivacyControl()) return;
  startFirstPromoter();
  startMetaPixel();
  startAppsFlyer();
}

export function stopMarketingTracking() {
  if (typeof window === 'undefined') {
    return;
  }

  if (typeof window.fbq === 'function') {
    window.fbq('consent', 'revoke');
  }

  if (typeof window.AF === 'function') {
    window.AF('pba', 'setCustomerUserId', '');
  }
  clearTrackingStorage(/^(_fbp$|_fbc$|_af_|afUserId$|AF_|_fprom_|_fpr_|ab\.storage\.)/i);
}
