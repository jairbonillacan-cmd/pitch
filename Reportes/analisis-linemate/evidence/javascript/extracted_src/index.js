import App from './components/App';
import * as Sentry from '@sentry/react';
import { createRoot } from 'react-dom/client';
import './i18n';

const root = createRoot(document.getElementById('root'));

root.render(
  <Sentry.ErrorBoundary fallback={<p>Something went wrong.</p>}>
    <App />
  </Sentry.ErrorBoundary>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/service-worker.js');
    } catch (err) {
      console.error('Service worker registration failed:', err);
    }
  });
}
