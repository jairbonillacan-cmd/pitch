
    // Navbar behaviour: the account dropdown and the search trigger.
    //
    // Bound once per document. wire:navigate rebuilds the body and clones its
    // <script> tags, which re-executes this file on every navigation, so
    // without the guard a second identical listener is added each time. Two
    // listeners defeat a toggle: the first opens the panel, the second reads it
    // as already open and closes it again, so the menu worked only on the page
    // that was loaded first. The listeners are delegated from `document`, which
    // is never replaced, so binding once is both necessary and sufficient.
    (function () {
      if (window.skNavbarBound) return;
      window.skNavbarBound = true;

      function closeAccountPanels(except) {
        document.querySelectorAll('[data-account-panel]').forEach((panel) => {
          if (panel === except) return;

          panel.hidden = true;
          panel.closest('[data-account-menu]')
            ?.querySelector('[data-account-trigger]')
            ?.setAttribute('aria-expanded', 'false');
        });
      }

      document.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-account-trigger]');

        if (trigger) {
          const panel = trigger.closest('[data-account-menu]')?.querySelector('[data-account-panel]');
          const opening = panel?.hidden === true;

          closeAccountPanels(panel);

          if (panel) {
            panel.hidden = ! opening;
            trigger.setAttribute('aria-expanded', opening ? 'true' : 'false');
          }

          return;
        }

        // A click inside the panel (the logout form) must not close it first.
        if (event.target.closest('[data-account-panel]')) return;

        closeAccountPanels();
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeAccountPanels();
      });

      /*
        Which item is lit.

        The bar sits in a persisted region, so wire:navigate keeps this DOM
        rather than re-rendering it - which means the is-active class Blade wrote
        on the first load would still be describing that first page several
        navigations later.

        (Naming the directive here would be a mistake: Blade reads its own
        directives inside JavaScript comments too, and an unclosed one takes the
        whole template down with a 500.) Server-rendered markup cannot answer this on its own; it has to be
        recomputed on arrival.

        Ownership is by path prefix, because a section is more than one route:
        /league/{id} belongs to Ligas and /player/{id} to Scouting, and neither
        matches its own index URL.
      */
      function syncActiveNav() {
        const here = window.location.pathname.replace(/\/+$/, '') || '/';

        document.querySelectorAll('.sk-navbar .nav-links [data-nav-match]').forEach((link) => {
          const owns = link.dataset.navMatch.split('|').some((candidate) => {
            let path;

            try {
              path = new URL(candidate, window.location.origin).pathname;
            } catch (error) {
              return false;
            }

            path = path.replace(/\/+$/, '') || '/';

            // Prefix, but only on a segment boundary: /player must not claim
            // /players.
            return here === path || here.startsWith(path + '/');
          });

          link.classList.toggle('is-active', owns);

          if (owns) {
            link.setAttribute('aria-current', 'page');
          } else {
            link.removeAttribute('aria-current');
          }
        });
      }

      // Close on navigation: the navbar is persisted, so an open panel would
      // otherwise still be hanging open on the page just navigated to.
      document.addEventListener('livewire:navigated', () => {
        closeAccountPanels();
        syncActiveNav();
      });

      syncActiveNav();

      document.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-open-navbar-search]');
        if (!trigger) return;

        event.preventDefault();
        window.dispatchEvent(new CustomEvent('navbar-search-open'));

        const drawer = document.getElementById('navDrawer');
        const navToggle = document.getElementById('navToggle');
        const navToggleIcon = document.getElementById('navToggleIcon');

        if (drawer?.classList.contains('open')) {
          drawer.classList.remove('open');
          navToggle?.setAttribute('aria-expanded', 'false');
          if (navToggleIcon) navToggleIcon.className = 'bi bi-list';
        }
      });
    })();
  