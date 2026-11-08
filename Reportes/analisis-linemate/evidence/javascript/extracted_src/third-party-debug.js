// Keep troubleshooting messages payload-free. Never pass SDK options,
// errors, URLs, keys, user identifiers, or event properties into these helpers.
export function logThirdPartyStatus(component, status) {
  console.log(`[Third-party] ${component}: ${status}`);
}

export function warnThirdPartyStatus(component, status) {
  console.warn(`[Third-party] ${component}: ${status}`);
}

export function logPrivacySettings(location, policy, gpc) {
  // Only log the coarse location codes used for policy selection, never the
  // full localization response (which may include city, IP, or coordinates).
  const country = location?.country?.code;
  const region = location?.region?.code;
  console.log('[Third-party] Privacy: location used for policy', {
    country: typeof country === 'string' && country ? country : 'unknown',
    region: typeof region === 'string' && region ? region : 'unknown',
    profile: policy.profile,
    gpc,
  });
}

export function monitorThirdPartyScript(script, component) {
  // A script load is not proof that vendor initialization or event delivery
  // succeeded. Keep it distinct from SDK-confirmed initialization.
  logThirdPartyStatus(component, 'initialization queued');
  script.addEventListener('load', () => logThirdPartyStatus(component, 'script loaded'), { once: true });
  script.addEventListener('error', () => warnThirdPartyStatus(component, 'script failed to load'), { once: true });
}
