import * as Sentry from '@sentry/react';
import { matchPath } from 'react-router-dom';

import { API_HOST } from './react-web-constants';
import { history } from './history';
import { logThirdPartyStatus } from './third-party-debug';

const dsn = process.env.REACT_APP_SENTRY_DSN;
const isDevelopment = process.env.NODE_ENV === 'development';
let sentryInitialized = false;

// Ordinary error reporting remains available. Replay is deliberately excluded
// from this integration and cannot be enabled by a sampling environment variable.
function parseSampleRate(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Optional overrides:
// - REACT_APP_SENTRY_TRACES_SAMPLE_RATE
//
// Example customization:
// - staging can set traces to 1.0 for full performance visibility
// - production can leave tracing disabled to control volume and cost
const tracesSampleRate = isDevelopment ? 0 : parseSampleRate(process.env.REACT_APP_SENTRY_TRACES_SAMPLE_RATE, 0);

function getIntegrations() {
  return [
    Sentry.reactRouterV5BrowserTracingIntegration({
      history,
      matchPath,
    }),
  ];
}

export function initSentry() {
  if (!dsn || sentryInitialized || Sentry.isInitialized()) {
    return;
  }

  Sentry.init({
    dsn,
    integrations: getIntegrations(),
    environment: process.env.NODE_ENV,
    tracesSampleRate,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    tracePropagationTargets: API_HOST ? [/^\//, API_HOST] : [/^\//],
  });

  sentryInitialized = true;
  logThirdPartyStatus('Sentry', 'initialized');
}

export async function shutdownSentry() {
  if (!sentryInitialized && !Sentry.isInitialized()) {
    return;
  }

  Sentry.setUser(null);
  await Sentry.close(2000);
  sentryInitialized = false;
}

export function setSentryUser(userAttributes = {}) {
  if (!dsn || !sentryInitialized || !Sentry.isInitialized()) {
    return;
  }

  const sentryUserId = userAttributes?.uuid;

  if (!sentryUserId) {
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({ id: sentryUserId });

  // If we ever want more filtering in Sentry without changing the user shape,
  // we can attach lightweight tags here. Example:
  // Sentry.setTag('league', userAttributes?.preferredLeague || 'unknown');
  // Tags are useful for slicing issues in the Sentry UI, but we should keep
  // them low-cardinality so they stay readable and cost-effective.
}
