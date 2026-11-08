import React, { useState } from 'react';
import PrivacyPreferencesLink from './PrivacyPreferencesLink';
import './PrivacyNotice.scss';

const NOTICE_STORAGE_KEY = 'linemate:us-privacy-notice:v1';

function wasNoticeDismissed() {
  try {
    return localStorage.getItem(NOTICE_STORAGE_KEY) === 'dismissed';
  } catch {
    return false;
  }
}

export default function PrivacyNotice({ preferences = {} }) {
  const [dismissed, setDismissed] = useState(wasNoticeDismissed);
  const { ready, profile, gpc } = preferences;
  const showNotice = ready && profile === 'NOTICE' && !gpc && !dismissed;
  const dismissNotice = () => {
    setDismissed(true);
    try {
      // Notice dismissal is not consent and does not change any category.
      localStorage.setItem(NOTICE_STORAGE_KEY, 'dismissed');
    } catch {
      // If storage is unavailable, hide it only for this page visit.
    }
  };

  if (!showNotice) return null;

  return (
    <section className="privacy-banner" aria-labelledby="privacy-default-notice-title">
      <div className="privacy-banner-texts">
        <h2 id="privacy-default-notice-title">We value your privacy</h2>
        <p>
          We use cookies and similar technologies to enhance your browsing experience,
          understand our traffic, and support our marketing. You can review your
          preferences or turn off optional cookies at any time through{' '}
          <PrivacyPreferencesLink />.
        </p>
      </div>
      <div className="privacy-banner-actions">
        <button type="button" onClick={dismissNotice}>Close</button>
      </div>
      {/* <div className="privacy-banner-footer">
        <a href="/privacy#privacy-choices">Read privacy notice</a>
      </div> */}
    </section>
  );
}
