/**
 * Live motion for the Partidos list and the match page (SK-16 / SK-17).
 *
 * Both pages re-render every 30 seconds while a match is played. Livewire
 * morphs the new HTML into the old, so an element that changed is still the
 * same element: this compares it before and after and adds a short CSS
 * animation class to what moved, and nothing else.
 *
 *   [data-live-score="2-1"]   a score; a goal pops it in the scorer's colour
 *   [data-live-reds="0-1"]    sendings-off by side; a new one flashes red
 *   [data-live-minute]        the minute, ticked on between polls
 *   [data-live-feed]          a list whose new [data-live-item]s slide in
 *
 * One 15-second timer for the whole page, no work while the tab is hidden,
 * and nothing at all when the visitor asks for reduced motion (the minute
 * still ticks: it is information, not motion).
 */
(function () {
  if (window.skLiveMotionBound) {
    return;
  }

  window.skLiveMotionBound = true;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Server clock minus browser clock, from the last render's data-live-now.
  let skew = 0;

  const pair = (value) => String(value || '').split('-').map((n) => parseInt(n, 10) || 0);

  const play = (el, ...classes) => {
    if (reduced.matches) {
      return;
    }

    el.classList.remove(...classes);
    // Restart the animation if it is still running from the last change.
    void el.offsetWidth;
    el.classList.add(...classes);
    el.addEventListener('animationend', () => el.classList.remove(...classes), { once: true });
  };

  const readSkew = () => {
    const root = document.querySelector('[data-live-now]');

    if (root) {
      skew = parseInt(root.dataset.liveNow, 10) - Date.now() / 1000;
    }
  };

  /** 67' → 68' between polls; 45+2' once past the period's end. */
  const tick = () => {
    if (document.hidden) {
      return;
    }

    const now = Date.now() / 1000 + skew;

    document.querySelectorAll('[data-live-minute]').forEach((el) => {
      const at = parseInt(el.closest('[data-live-at]')?.dataset.liveAt || '0', 10);
      const base = parseInt(el.dataset.liveMinute, 10);
      const cap = parseInt(el.dataset.liveCap, 10);

      if (!at || !base || !cap) {
        return;
      }

      // Never more than a quarter of an hour on from the last real reading.
      const minute = base + Math.min(15, Math.max(0, Math.floor((now - at) / 60)));
      const label = minute > cap ? `${cap}+${minute - cap}'` : `${minute}'`;
      const target = el.querySelector('[data-live-minute-text]') || el;

      if (target.textContent.trim() !== label) {
        target.textContent = label;
      }
    });
  };

  const markFeeds = () => {
    document.querySelectorAll('[data-live-feed]').forEach((feed) => {
      feed.dataset.liveReady = '1';
    });
  };

  document.addEventListener('livewire:init', () => {
    if (!window.Livewire?.hook) {
      return;
    }

    window.Livewire.hook('morph.updating', ({ el, toEl }) => {
      if (!(el instanceof HTMLElement) || !(toEl instanceof HTMLElement)) {
        return;
      }

      const before = el.dataset.liveScore;
      const after = toEl.dataset.liveScore;

      if (before !== undefined && after !== undefined && before !== after) {
        const [h0, a0] = pair(before);
        const [h1, a1] = pair(after);
        const side = h1 > h0 ? 'home' : a1 > a0 ? 'away' : null;

        if (side) {
          requestAnimationFrame(() => {
            play(el, 'live-goal', `live-goal--${side}`);
            const row = el.closest('[data-live-row]');

            if (row) {
              play(row, 'live-row-goal');
            }
          });
        }
      }

      const redsBefore = el.dataset.liveReds;
      const redsAfter = toEl.dataset.liveReds;

      if (redsBefore !== undefined && redsAfter !== undefined && redsBefore !== redsAfter) {
        const [h0, a0] = pair(redsBefore);
        const [h1, a1] = pair(redsAfter);

        if (h1 + a1 > h0 + a0) {
          requestAnimationFrame(() => play(el, 'live-red'));
        }
      }
    });

    window.Livewire.hook('morph.added', ({ el }) => {
      if (!(el instanceof HTMLElement) || !el.matches('[data-live-item]')) {
        return;
      }

      // Only into a list that was already on the page: a tab opening is not news.
      if (el.parentElement?.closest('[data-live-feed]')?.dataset.liveReady === '1') {
        play(el, 'live-enter');
      }
    });

    window.Livewire.hook('morph.updated', () => {
      readSkew();
      markFeeds();
      requestAnimationFrame(tick);
    });
  });

  const boot = () => {
    readSkew();
    markFeeds();
    tick();
  };

  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('livewire:navigated', boot);
  document.addEventListener('visibilitychange', tick);
  setInterval(tick, 15000);
})();
