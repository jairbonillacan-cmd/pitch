// === INLINE SCRIPT 0 | tag: <script> | len=57 ===
document.documentElement.classList.add('sk-home-motion');

// === INLINE SCRIPT 1 | tag: <script> | len=4452 ===
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

// === INLINE SCRIPT 2 | tag: <script> | len=4673 ===
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

// === INLINE SCRIPT 3 | tag: <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"> | len=0 ===


// === INLINE SCRIPT 4 | tag: <script> | len=2937 ===
// ── Hamburger nav toggle ──────────────────────────────────
    (function () {
      const toggle = document.getElementById('navToggle');
      const drawer = document.getElementById('navDrawer');
      const icon   = document.getElementById('navToggleIcon');
      if (!toggle || !drawer) return;

      if (toggle.dataset.skBound !== '1') {
        toggle.dataset.skBound = '1';

        toggle.addEventListener('click', () => {
          const open = drawer.classList.toggle('open');
          toggle.setAttribute('aria-expanded', open);
          icon.className = open ? 'bi bi-x-lg' : 'bi bi-list';
        });

        // Delegated from the drawer so links added later still close it, and so
        // there is one listener to guard rather than one per link.
        drawer.addEventListener('click', (event) => {
          if (!event.target.closest('a, button.btn-iniciar')) return;

          drawer.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
          icon.className = 'bi bi-list';
        });
      }

      // Sync mobile theme toggle with main toggle
      const mainToggle   = document.getElementById('themeToggle');
      const mobileToggle = document.getElementById('themeToggleMobile');
      const mobileIcon   = document.getElementById('themeIconMobile');

      if (mobileToggle && mainToggle && mobileToggle.dataset.skBound !== '1') {
        mobileToggle.dataset.skBound = '1';
        mobileToggle.addEventListener('click', () => mainToggle.click());

        new MutationObserver(() => {
          const mainIcon = document.getElementById('themeIcon');
          if (mobileIcon && mainIcon) mobileIcon.className = mainIcon.className;
        }).observe(document.getElementById('themeIcon'), { attributes: true, attributeFilter: ['class'] });
      }
    })();

    // ── Theme toggle ─────────────────────────────────────────
    (function () {
      const root = document.documentElement;
      const btn  = document.getElementById('themeToggle');
      const icon = document.getElementById('themeIcon');
      if (!btn) return;

      const stored = localStorage.getItem('sk-theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = stored ? stored === 'dark' : prefersDark;

      function applyTheme(dark) {
        root.setAttribute('data-theme', dark ? 'dark' : 'light');
        if (icon) icon.className = dark ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
        localStorage.setItem('sk-theme', dark ? 'dark' : 'light');
      }

      // Applying on every execution is harmless and keeps the icon in step
      // after a navigation; only the binding must not repeat.
      applyTheme(isDark);

      if (btn.dataset.skBound === '1') return;
      btn.dataset.skBound = '1';

      btn.addEventListener('click', function () {
        applyTheme(root.getAttribute('data-theme') !== 'dark');
      });
    })();

// === INLINE SCRIPT 5 | tag: <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"> | len=0 ===


// === INLINE SCRIPT 6 | tag: <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js"> | len=0 ===


// === INLINE SCRIPT 7 | tag: <script> | len=234 ===
// The UMD build does not auto-register with Chart.js 4 — every chart's
    // `plugins.datalabels` option was silently inert without this.
    if (window.Chart && window.ChartDataLabels) {
      Chart.register(ChartDataLabels);
    }

// === INLINE SCRIPT 8 | tag: <script src="https://www.statiskicks.com/custom_assets/js/home-motion.js?v=1791380772"> | len=0 ===


// === INLINE SCRIPT 9 | tag: <script src="https://www.statiskicks.com/custom_assets/js/sk-tooltip.js?v=1792175742"> | len=0 ===


// === INLINE SCRIPT 10 | tag: <script src="https://www.statiskicks.com/custom_assets/js/download-paywall.js?v=1793826522"> | len=0 ===


// === INLINE SCRIPT 11 | tag: <script src="https://www.statiskicks.com/custom_assets/js/chart-download.js?v=1794084628"> | len=0 ===


// === INLINE SCRIPT 12 | tag: <script src="https://www.statiskicks.com/custom_assets/js/search-results-image.js?v=1794084628"> | len=0 ===


// === INLINE SCRIPT 13 | tag: <script src="https://www.statiskicks.com/custom_assets/js/percentile-rows.js?v=1793360776"> | len=0 ===


// === INLINE SCRIPT 14 | tag: <script src="https://www.statiskicks.com/custom_assets/js/skore.js?v=1793032870"> | len=0 ===


// === INLINE SCRIPT 15 | tag: <script src="https://www.statiskicks.com/custom_assets/js/attribute-picker.js?v=1791577902"> | len=0 ===


// === INLINE SCRIPT 16 | tag: <script src="https://www.statiskicks.com/custom_assets/js/attribute-charts.js?v=1794084628"> | len=0 ===


// === INLINE SCRIPT 17 | tag: <script src="https://www.statiskicks.com/custom_assets/js/heatmap.js?v=1791561866"> | len=0 ===


// === INLINE SCRIPT 18 | tag: <script src="https://www.statiskicks.com/custom_assets/js/goalmouth-map.js?v=1794084628"> | len=0 ===


// === INLINE SCRIPT 19 | tag: <script src="https://www.statiskicks.com/custom_assets/js/event-map.js?v=1793880030"> | len=0 ===


// === INLINE SCRIPT 20 | tag: <script src="https://www.statiskicks.com/custom_assets/js/league-maps.js?v=1794084628"> | len=0 ===


// === INLINE SCRIPT 21 | tag: <script src="https://www.statiskicks.com/custom_assets/js/league-scatter.js?v=1794084628"> | len=0 ===


// === INLINE SCRIPT 22 | tag: <script src="https://www.statiskicks.com/custom_assets/js/league-switcher.js?v=1793361650"> | len=0 ===


// === INLINE SCRIPT 23 | tag: <script src="https://www.statiskicks.com/custom_assets/js/team-profile.js?v=1791380772"> | len=0 ===


// === INLINE SCRIPT 24 | tag: <script src="https://www.statiskicks.com/custom_assets/js/team-age-profile.js?v=1794168592"> | len=0 ===


// === INLINE SCRIPT 25 | tag: <script src="https://www.statiskicks.com/custom_assets/js/team-xg-rolling.js?v=1791380772"> | len=0 ===


// === INLINE SCRIPT 26 | tag: <script src="https://www.statiskicks.com/custom_assets/js/team-formation-profile.js?v=1791380772"> | len=0 ===


// === INLINE SCRIPT 27 | tag: <script src="https://www.statiskicks.com/custom_assets/js/team-pass-network.js?v=1794084628"> | len=0 ===


// === INLINE SCRIPT 28 | tag: <script src="https://www.statiskicks.com/custom_assets/js/live-motion.js?v=1792175986"> | len=0 ===


// === INLINE SCRIPT 29 | tag: <script src="https://www.statiskicks.com/custom_assets/js/momentum-chart.js?v=1792708794"> | len=0 ===


// === INLINE SCRIPT 30 | tag: <script src="https://www.statiskicks.com/custom_assets/js/player-heat.js?v=1792491156"> | len=0 ===


// === INLINE SCRIPT 31 | tag: <script src="https://www.statiskicks.com/custom_assets/js/scroll-lock.js?v=1792589840"> | len=0 ===


// === INLINE SCRIPT 32 | tag: <script> | len=401 ===
// Destroy all Chart.js instances before SPA navigation to prevent canvas-in-use errors
    document.addEventListener('livewire:navigating', function () {
      document.body.classList.remove('sk-search-open', 'league-modal-open');

      if (typeof Chart !== 'undefined') {
        Object.values(Chart.instances || {}).forEach(function (chart) {
          chart.destroy();
        });
      }
    });

// === INLINE SCRIPT 33 | tag: <script data-navigate-once=""> | len=1861 ===
(function () {
    // Not window.skUsageNotice: the element's id already puts the <div>
    // there (named access on window), and the guard would never let this run.
    if (window.skShowUsageNotice) return;

    const fallback = "Recibimos demasiadas solicitudes seguidas. Espera un momento y vuelve a intentarlo.";
    let timer = null;

    function show(message) {
      const notice = document.getElementById('skUsageNotice');

      if (!notice) return;

      notice.querySelector('.sk-usage-notice__text').textContent = message || fallback;
      notice.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(function () { notice.hidden = true; }, 9000);
    }

    window.skShowUsageNotice = show;

    window.addEventListener('sk-usage-limit', function (event) {
      show(event.detail && event.detail.message);
    });

    document.addEventListener('click', function (event) {
      if (event.target.closest('.sk-usage-notice__close')) {
        const notice = document.getElementById('skUsageNotice');

        if (notice) notice.hidden = true;
      }
    });

    let intercepting = false;

    function intercept() {
      if (intercepting || !window.Livewire || typeof window.Livewire.interceptRequest !== 'function') return;

      intercepting = true;
      window.Livewire.interceptRequest(function ({ onError }) {
        onError(function ({ response, body, preventDefault }) {
          if (!response || response.status !== 429) return;

          preventDefault();

          let message = fallback;

          try {
            message = JSON.parse(body).message || fallback;
          } catch (e) {
            // Not the usage limits' JSON: the generic message will do.
          }

          show(message);
        });
      });
    }

    document.addEventListener('livewire:init', intercept);
    intercept();
  })();

// === INLINE SCRIPT 34 | tag: <script src="https://www.statiskicks.com/livewire-e3175f40/livewire.min.js?id=6b3709b1" data-no-progress-bar="" data-csrf="ttBStjz865YspiaUewPs3mHnqKzC2rhwhQPmCsS4" data-module-url="https://www.statiskicks.com/livewire-e3175f40" data-update-uri="https://www.statiskicks.com/livewire-e3175f40/update" data-navigate-once="true"> | len=0 ===


// === INLINE SCRIPT 35 | tag: <script> | len=1434 ===
(function () {
      function sameOriginEndpoint(value) {
        if (!value) return value;

        try {
          const parsed = new URL(String(value), window.location.origin);

          if (parsed.origin === window.location.origin) {
            return parsed.href;
          }

          return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
        } catch {
          return value;
        }
      }

      function normalizeLivewireEndpointConfig() {
        const livewireScript = document.querySelector('script[data-update-uri]');

        if (livewireScript) {
          const updateUri = sameOriginEndpoint(livewireScript.getAttribute('data-update-uri'));
          const moduleUrl = sameOriginEndpoint(livewireScript.getAttribute('data-module-url'));

          if (updateUri) {
            livewireScript.setAttribute('data-update-uri', updateUri);
          }

          if (moduleUrl) {
            livewireScript.setAttribute('data-module-url', moduleUrl);
          }
        }

        if (window.livewireScriptConfig) {
          window.livewireScriptConfig.uri = sameOriginEndpoint(window.livewireScriptConfig.uri);
          window.livewireScriptConfig.moduleUrl = sameOriginEndpoint(window.livewireScriptConfig.moduleUrl);
        }
      }

      normalizeLivewireEndpointConfig();
      document.addEventListener('livewire:navigated', normalizeLivewireEndpointConfig);
    })();

// === INLINE SCRIPT 36 | tag: <script> | len=8868 ===
(function () {
        const rawSearchUrl = "https:\/\/www.statiskicks.com\/search";

        function resolveSearchUrl(url) {
            const fallbackPath = '/search';

            try {
                const parsed = new URL(String(url || ''), window.location.origin);
                const path = parsed.pathname || fallbackPath;
                const query = parsed.search || '';
                return `${window.location.origin}${path}${query}`;
            } catch {
                const normalized = String(url || '').trim();
                const path = normalized
                    ? (normalized.startsWith('/') ? normalized : `/${normalized}`)
                    : fallbackPath;

                return `${window.location.origin}${path}`;
            }
        }

        const searchUrl = resolveSearchUrl(rawSearchUrl);

        function registerNavbarSearchPanel() {
            Alpine.data('navbarSearchPanel', () => ({
                open: false,
                activeTab: 'search',
                query: '',
                leagues: [],
                teams: [],
                players: [],
                recentItems: [],
                loading: false,
                // Over the search's ceiling (SK-19): the reason, said in the
                // panel instead of «no results», which would read as "no such
                // player".
                limited: '',
                searchUrl,
                searchTimer: null,
                searchController: null,

                init() {
                    this.loadRecent();
                    this.$watch('query', (value) => this.queueSearch(value));
                },

                openPanel() {
                    this.open = true;
                    this.activeTab = 'search';
                    document.body.classList.add('sk-search-open');
                    this.loadRecent();
                    this.$nextTick(() => this.$refs.searchInput?.focus());
                },

                closePanel() {
                    this.open = false;
                    this.query = '';
                    this.clearResults();
                    this.loading = false;
                    this.abortSearch();
                    document.body.classList.remove('sk-search-open');
                },

                queueSearch(value) {
                    this.abortSearch();
                    clearTimeout(this.searchTimer);
                    this.limited = '';

                    const term = String(value || '').trim();
                    if (term.length < 2) {
                        this.clearResults();
                        this.loading = false;
                        return;
                    }

                    this.loading = true;
                    this.searchTimer = setTimeout(() => this.runSearch(term), 350);
                },

                abortSearch() {
                    if (this.searchController) {
                        this.searchController.abort();
                        this.searchController = null;
                    }
                },

                async runSearch(term) {
                    this.abortSearch();
                    this.searchController = new AbortController();

                    try {
                        const response = await fetch(`${this.searchUrl}?q=${encodeURIComponent(term)}`, {
                            headers: { Accept: 'application/json' },
                            signal: this.searchController.signal,
                        });

                        // Over the search's ceiling (SK-19): say so, rather
                        // than an empty list that reads as "no players".
                        if (response.status === 429) {
                            const limited = await response.json().catch(() => ({}));
                            this.limited = limited.message || "Demasiadas b\u00fasquedas seguidas; espera un momento.";
                        }

                        if (!response.ok) {
                            throw new Error('Search failed');
                        }

                        const payload = await response.json();
                        if (String(this.query || '').trim() === term) {
                            this.leagues = Array.isArray(payload.leagues) ? payload.leagues : [];
                            this.teams = Array.isArray(payload.teams) ? payload.teams : [];
                            this.players = Array.isArray(payload.players) ? payload.players : [];
                        }
                    } catch (error) {
                        if (error?.name !== 'AbortError') {
                            this.clearResults();
                        }
                    } finally {
                        if (String(this.query || '').trim() === term) {
                            this.loading = false;
                        }
                        this.searchController = null;
                    }
                },

                clearResults() {
                    this.leagues = [];
                    this.teams = [];
                    this.players = [];
                },

                get hasResults() {
                    return this.leagues.length + this.teams.length + this.players.length > 0;
                },

                get sections() {
                    return [
                        { kind: 'league', title: 'Ligas', items: this.leagues },
                        { kind: 'team', title: 'Equipos', items: this.teams },
                        { kind: 'player', title: 'Jugadores', items: this.players },
                    ].filter((section) => section.items.length > 0);
                },

                loadRecent() {
                    try {
                        const stored = JSON.parse(localStorage.getItem('sk-recent-players') || '[]');
                        this.recentItems = Array.isArray(stored) ? stored : [];
                    } catch {
                        this.recentItems = [];
                    }
                },

                // Entries saved before teams and leagues were searchable carry no kind: they are players.
                itemKind(item) {
                    return item?.kind || 'player';
                },

                selectResult(item, kind) {
                    if (!item?.id) {
                        this.closePanel();
                        return;
                    }

                    const entry = { ...item, kind };
                    const existing = this.recentItems.filter(
                        (recent) => !(recent.id === entry.id && this.itemKind(recent) === kind)
                    );
                    this.recentItems = [entry, ...existing].slice(0, 8);

                    try {
                        localStorage.setItem('sk-recent-players', JSON.stringify(this.recentItems));
                    } catch {
                        // ignore storage errors
                    }

                    this.closePanel();
                },

                resultImage(item, kind) {
                    if (item?.image) {
                        return item.image;
                    }

                    const fallback = { league: 'Liga', team: 'Equipo', player: 'Jugador' }[kind] || 'Jugador';
                    const name = encodeURIComponent(item?.name || fallback);
                    return `https://ui-avatars.com/api/?name=${name}&background=1D665D&color=fff&size=80`;
                },

                resultMeta(item, kind) {
                    if (kind === 'league') {
                        return item?.country || '—';
                    }

                    if (kind === 'team') {
                        return item?.competition || '—';
                    }

                    return [item?.role, item?.team].filter(Boolean).join(' · ') || '—';
                },

                resultFlag(item, kind) {
                    if (kind === 'league') {
                        return String(item?.alpha2 || '').toLowerCase();
                    }

                    return kind === 'player' ? (item?.flag || '') : '';
                },
            }));
        }

        function bootNavbarSearchPanel() {
            if (typeof Alpine === 'undefined') {
                return;
            }

            registerNavbarSearchPanel();

            document.querySelectorAll('#navbarSearchRoot[x-data]').forEach((element) => {
                if (!element.__x) {
                    Alpine.initTree(element);
                }
            });
        }

        document.addEventListener('alpine:init', registerNavbarSearchPanel);
        document.addEventListener('livewire:navigated', bootNavbarSearchPanel);

        if (typeof Alpine !== 'undefined') {
            bootNavbarSearchPanel();
        }
    })();
