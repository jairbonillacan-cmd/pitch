let fetchErrorReporter = null;
let fetchHeadersProvider = null;
let fetchProxyMatcher = null;
let fetchTimingReporter = null;
let originalFetch = null;

export const GENERIC_NETWORK_REQUEST_FAILED_MESSAGE = 'Network request failed';

// React Native uses this message for transport-level fetch failures. Keep the
// check here so all consumers classify the same error consistently.
export function isGenericNetworkRequestFailedError(error) {
  return error?.message === GENERIC_NETWORK_REQUEST_FAILED_MESSAGE;
}

// Installs a single global fetch wrapper for app code. The wrapper only applies
// custom behavior to requests matched by `fetchProxyMatcher` (for example,
// API_HOST requests). Matched requests receive shared headers, annotated errors,
// and reporter callbacks; unmatched requests pass through untouched.
//
// Usage:
// setFetchHeadersProvider(async () => ({ 'X-Foo': 'bar' }));
// setFetchProxyMatcher(({ endpoint }) => typeof endpoint === 'string' && endpoint.startsWith(API_HOST));
// setFetchErrorReporter((error, context) => captureError(error, 'fetchProxy', context));
// installFetchProxy();
//
// Call sites can either use plain fetch(...) or fetchProxy(...). Both paths
// route through the same implementation once installFetchProxy() has been run.
// For extra request context on plain fetch, pass `fetchContext` on init:
// fetch(url, { fetchContext: { phase: 'startup_config' } })
// That metadata is used only for local annotation/reporting and is stripped
// before the real network request is sent.

export function setFetchErrorReporter(reporter) {
  fetchErrorReporter = reporter;
}

export function setFetchHeadersProvider(provider) {
  fetchHeadersProvider = provider;
}

export function setFetchProxyMatcher(matcher) {
  fetchProxyMatcher = matcher;
}

// Receives a timing result for every proxied request. Timing includes any
// asynchronous shared-header work (such as refreshing an auth token), then
// ends when fetch resolves or rejects.
export function setFetchTimingReporter(reporter) {
  fetchTimingReporter = reporter;
}

function getOriginalFetch() {
  if (!originalFetch) {
    originalFetch = global.fetch.bind(global);
  }
  return originalFetch;
}

export function installFetchProxy() {
  const baseFetch = getOriginalFetch();
  if (global.fetch === fetchProxy) {
    return baseFetch;
  }

  global.fetch = fetchProxy;
  return baseFetch;
}

function buildFetchError(error, context) {
  const annotatedError = error instanceof Error ? error : new Error(String(error));
  annotatedError.endpoint = context.endpoint;
  annotatedError.phase = context.phase;
  annotatedError.method = context.method;
  annotatedError.fetchContext = context;
  return annotatedError;
}

async function buildHeaders(input, init, context) {
  const providerHeaders = fetchHeadersProvider ? await fetchHeadersProvider(context) : null;
  const headers = new Headers(providerHeaders || undefined);
  const requestHeaders = init?.headers || (typeof input !== 'string' ? input?.headers : undefined);
  new Headers(requestHeaders || undefined).forEach((value, key) => {
    headers.set(key, value);
  });
  return headers;
}

function shouldProxyFetch(context) {
  if (!fetchProxyMatcher) {
    return true;
  }

  try {
    return !!fetchProxyMatcher(context);
  } catch (error) {
    console.error(error);
    return false;
  }
}

function buildFetchContext(input, init, extraData) {
  const endpoint = typeof input === 'string' ? input : input?.url;
  const method = init?.method || (typeof input !== 'string' ? input?.method : null) || 'GET';
  return {
    endpoint,
    method,
    ...(init?.fetchContext || {}),
    ...(extraData || {})
  };
}

function stripFetchContext(init) {
  if (!init || !('fetchContext' in init)) {
    return init;
  }

  const { fetchContext, ...sanitizedInit } = init;
  return sanitizedInit;
}

function reportFetchTiming(timing, context) {
  if (!fetchTimingReporter) {
    return;
  }

  try {
    fetchTimingReporter(timing, context);
  } catch (reportingError) {
    console.error(reportingError);
  }
}

export async function fetchProxy(input, init, extraData) {
  const context = buildFetchContext(input, init, extraData);
  const sanitizedInit = stripFetchContext(init);

  if (!shouldProxyFetch(context)) {
    return getOriginalFetch()(input, sanitizedInit);
  }

  const startTimeMs = Date.now();
  try {
    const headers = await buildHeaders(input, sanitizedInit, context);
    const response = await getOriginalFetch()(input, {
      ...sanitizedInit,
      headers
    });
    reportFetchTiming({
      durationMs: Date.now() - startTimeMs,
      status: response.status,
      succeeded: true
    }, context);
    return response;
  } catch (error) {
    const annotatedError = buildFetchError(error, context);
    reportFetchTiming({
      durationMs: Date.now() - startTimeMs,
      status: null,
      succeeded: false
    }, context);
    if (fetchErrorReporter) {
      try {
        fetchErrorReporter(annotatedError, context);
      } catch (reportingError) {
        console.error(reportingError);
      }
    }
    throw annotatedError;
  }
}
