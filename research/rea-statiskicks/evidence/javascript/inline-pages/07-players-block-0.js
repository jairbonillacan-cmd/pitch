
  /*
    Shown on wire:navigate, hidden on livewire:navigated.

    Two timings matter more than the animation does:

      DELAY        Most pages here render in well under 200ms. Flashing an
                   overlay on every click makes a fast app feel busy, so nothing
                   appears unless the navigation is actually slow enough to
                   notice.

      MIN_VISIBLE  Once it has appeared, it stays long enough to read as a
                   deliberate transition. Without this, a navigation finishing
                   at 210ms produces a 30ms flicker, which looks like a glitch
                   rather than a loader.

    Bound once per document: this file is inside the persisted region, and
    wire:navigate re-executes cloned <script> tags, so without the guard every
    navigation would add another pair of listeners.
  */
  (function () {
    if (window.skPageLoaderBound) return;
    window.skPageLoaderBound = true;

    const DELAY = 190;
    const MIN_VISIBLE = 620;
    const UNLOAD_FAILSAFE = 10000;

    let showTimer = null;
    let hideTimer = null;
    let failsafeTimer = null;
    let shownAt = 0;

    const el = () => document.querySelector('[data-page-loader]');

    function reveal() {
      const node = el();
      if (!node) return;

      node.hidden = false;
      node.setAttribute('aria-hidden', 'false');
      node.setAttribute('aria-busy', 'true');
      // Read back before adding the class so the opacity transition runs
      // instead of being collapsed with the display change.
      void node.offsetWidth;
      node.classList.add('is-visible');
      shownAt = Date.now();
    }

    function conceal() {
      const node = el();
      if (!node) return;

      node.classList.remove('is-visible');
      node.setAttribute('aria-hidden', 'true');
      node.removeAttribute('aria-busy');

      // Kept in the layout until the fade finishes, then taken out of the
      // accessibility tree entirely.
      hideTimer = window.setTimeout(() => { node.hidden = true; }, 260);
    }

    // `armFailsafe` is only ever true for beforeunload; see the listeners below.
    function start(armFailsafe) {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      window.clearTimeout(failsafeTimer);

      showTimer = window.setTimeout(reveal, DELAY);

      if (armFailsafe) {
        failsafeTimer = window.setTimeout(finish, UNLOAD_FAILSAFE);
      }
    }

    function finish() {
      window.clearTimeout(showTimer);
      window.clearTimeout(failsafeTimer);

      const node = el();

      if (!node || node.hidden) {
        shownAt = 0;

        return;
      }

      const elapsed = Date.now() - shownAt;

      if (elapsed >= MIN_VISIBLE) {
        conceal();
      } else {
        window.setTimeout(conceal, MIN_VISIBLE - elapsed);
      }
    }

    /*
      No failsafe on wire:navigate, deliberately.

      There was a blanket 10s timeout here, and it could not tell a navigation
      that had died from one that was merely slow. Any page slower than that had
      its overlay concealed mid-flight, dropping the user back on the page they
      had just left with no feedback until the response finally arrived — and a
      league page currently renders in 10–27s, so this was the ordinary case
      rather than the edge case. Raising the number only moves the cliff.

      Nothing here needs rescuing: a wire:navigate always resolves. Livewire
      either swaps the page in and fires livewire:navigated, or gives up and
      falls back to a full page load, which replaces this overlay along with the
      rest of the document.
    */
    document.addEventListener('livewire:navigate', () => start(false));
    document.addEventListener('livewire:navigated', finish);

    // Leaving for a full page load (a form post, a plain link) deserves the same
    // feedback, and this is the case that genuinely needs the timeout:
    // beforeunload also fires for things that do not actually unload the page —
    // a mailto:, a download, a cancelled navigation — and revealing without one
    // would strand the overlay on a page that never goes anywhere. The plans
    // page is full of mailto: links.
    window.addEventListener('beforeunload', () => start(true));

    // Coming back through the cache should never show a stale overlay.
    window.addEventListener('pageshow', (event) => { if (event.persisted) finish(); });
  })();
