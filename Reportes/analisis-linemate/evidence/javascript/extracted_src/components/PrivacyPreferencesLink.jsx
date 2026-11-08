import React from 'react';
import { openPrivacyPreferences, PRIVACY_PREFERENCES_URL } from '../privacy';

export default function PrivacyPreferencesLink({ children = 'Your Privacy Choices', ...props }) {
  return (
    <a
      {...props}
      href={PRIVACY_PREFERENCES_URL}
      aria-haspopup="dialog"
      onClick={event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        // Until the shared location/CMP initialization completes, the href is
        // a safe deep-link fallback to the same modal, not a second settings UI.
        if (openPrivacyPreferences()) event.preventDefault();
      }}
    >
      {children}
    </a>
  );
}
