
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
