/*
      The player page's "Seleccionar atributos" behaviour for an Alpine scope,
      shared with the league page's Dispersión tab
      (public/custom_assets/js/attribute-picker.js). One of the parts
      composeDraft() builds each tab's filter draft from. The league picker
      below fades on the same beat.
    */
    const PICKER_TRANSITION_MS = 220;
    const attributePicker = window.skAttributePicker;

    /*
      Slider ends already fetched on this visit, by leagues + season +
      attribute + unit, and the leagues each scope reported as pending. They
      outlive the filter card, which is rebuilt after every search.
    */
    const statRangeCache = new Map();
    const statPendingCache = new Map();

    /* The least room a filter-bar popup leaves to the window's edge, in px. */
    const PANEL_EDGE = 12;

    /** key => { label, units } from the grouped catalog. */
    function indexStatCatalog(catalog) {
        const index = {};
        (catalog || []).forEach((group) => group.attributes.forEach((attribute) => {
            index[attribute.key] = attribute;
        }));
        return index;
    }

    /* Same rules as Players::formatStatValue(), so the draft and the table read alike. */
    function formatStatValue(value, unit) {
        const number = Number(value);
        if (value === null || value === undefined || !Number.isFinite(number)) return '—';
        const spanish = window.StatiskicksAttributeCharts.formatSpanish;
        if (unit === 'percent') return `${spanish(number, 1)}%`;
        // The SKore as the rest of the site writes it: two decimals, a point.
        if (unit === 'rating') return number.toFixed(2);
        if (unit === 'total') return spanish(number, Number.isInteger(number) ? 0 : 2);
        return spanish(number, 2);
    }

    /* About a hundred steps across the range, on a 1-2-5 scale; whole numbers for counts. */
    function statStep(range, unit) {
        const span = range.max - range.min;
        if (unit === 'total' && Number.isInteger(range.min) && Number.isInteger(range.max) && span >= 10) return 1;
        if (span <= 0) return 0.01;

        const raw = span / 100;
        const magnitude = 10 ** Math.floor(Math.log10(raw));
        const nice = [1, 2, 5, 10].find((n) => n * magnitude >= raw) * magnitude;

        return Math.max(0.01, Number(nice.toPrecision(2)));
    }

    function draftStatFilter(filter) {
        return {
            key: filter.key,
            unit: filter.unit,
            // Applied bounds; null is an open end.
            min: filter.min ?? null,
            max: filter.max ?? null,
            // Where the slider starts when that is not the lowest value
            // anyone has: minutes start at 0, not at the shortest cameo.
            floor: filter.floor ?? null,
            // Slider positions and ends, filled in once the range arrives.
            low: null,
            high: null,
            range: null,
            step: 0.01,
            loading: true,
        };
    }

    /*
      Slider positions back into bounds. A thumb at its end is an open end, so
      an untouched slider excludes nobody. The step grid starts at the minimum,
      so when the maximum is off the grid (3.04 in steps of 0.05) the top
      thumb stops short of it, at 3.00: anything above the last full step
      below the maximum still counts as the end, or the league's top player
      would fall out of an untouched filter.
    */
    function statBounds(filter) {
        if (!filter.range) return { min: filter.min ?? null, max: filter.max ?? null };

        const lastFullStep = filter.range.max - filter.step;

        return {
            min: filter.low > filter.range.min ? filter.low : null,
            max: filter.high <= lastFullStep + filter.step * 1e-6 ? filter.high : null,
        };
    }

    function captureStatBounds(filter) {
        if (!filter.range) return;

        Object.assign(filter, statBounds(filter));
    }

    /*
      What a search would send, in a comparable form: the draft against the
      applied filters says whether "Buscar" has anything new to do. Order-free
      where the order is not meaningful (leagues, nationalities, positions).
    */
    function filterSignature(state) {
        return JSON.stringify([
            state.filterSeason || '',
            state.filterTournament || '',
            [...(state.filterPositions || [])].sort(),
            [...(state.filterLeagues || [])].sort(),
            [...(state.filterNationalities || [])].sort(),
            [...(state.filterClubs || [])].sort(),
            Number(state.ageMin), Number(state.ageMax),
            Number(state.heightMin), Number(state.heightMax),
            wholeOrNull(state.minutesMin), wholeOrNull(state.minutesMax),
            state.statUnit === 'total' ? 'total' : 'p90',
            (state.statFilters || []).map((filter) => [filter.key, filter.min ?? null, filter.max ?? null]),
            periodSignature(state.period),
        ]);
    }

    /*
      A period in a comparable form, null for the whole season — which the
      server sends as an empty array.
    */
    function periodSignature(period) {
        if (!period || !period.type) return null;
        return [period.type, String(period.from), String(period.to), period.stage || null];
    }

    const PERIOD_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    /* Same words as MatchWindow::label(): "Jornadas 5–10 · Apertura", "1 sep – 30 sep 2026". */
    function periodLabel(period, withStage = true) {
        if (!period || !period.type) return '';

        if (period.type === 'rounds') {
            const rounds = String(period.from) === String(period.to) ? `Jornada ${period.from}` : `Jornadas ${period.from}–${period.to}`;
            return withStage && period.stageLabel ? `${rounds} · ${period.stageLabel}` : rounds;
        }

        const parse = (value) => {
            const [year, month, day] = String(value).split('-').map(Number);
            return { year, month, day };
        };
        const from = parse(period.from);
        const to = parse(period.to);
        const day = (date, year) => `${date.day} ${PERIOD_MONTHS[date.month - 1]}${year ? ` ${date.year}` : ''}`;

        if (period.from === period.to) return day(from, true);

        return `${day(from, from.year !== to.year)} – ${day(to, true)}`;
    }

    /* Minutes are whole; the server rounds them the same way. */
    function wholeOrNull(value) {
        return value === null || value === undefined ? null : Math.round(Number(value));
    }

    /* New ends for a filter; what the scout set is kept, inside them. */
    function applyStatRange(filter, range) {
        if (range && filter.floor !== null && filter.floor < range.min) {
            range = { min: filter.floor, max: range.max };
        }

        filter.loading = false;
        filter.range = range;

        if (!range) {
            filter.low = null;
            filter.high = null;
            return;
        }

        const clamp = (value) => Math.min(range.max, Math.max(range.min, value));
        filter.step = statStep(range, filter.unit);
        filter.low = filter.min === null ? range.min : clamp(filter.min);
        filter.high = filter.max === null ? range.max : clamp(filter.max);
    }

    /*
      The team tab's counterpart of filterSignature(): leagues, season, the
      unit and the stat filters are all it has.
    */
    function teamFilterSignature(state) {
        return JSON.stringify([
            state.filterSeason || '',
            state.filterTournament || '',
            [...(state.filterLeagues || [])].sort(),
            state.statUnit === 'total' ? 'total' : 'per_match',
            (state.statFilters || []).map((filter) => [filter.key, filter.min ?? null, filter.max ?? null]),
            periodSignature(state.period),
        ]);
    }

    /*
      One Alpine scope from several parts, each a plain object from a factory
      below. Copied by descriptor, so a part's getters stay getters — a spread
      would freeze each at the value it had then — and a later part's
      property replaces an earlier one's.
    */
    function composeDraft(...parts) {
        const draft = {};
        parts.forEach((part) => Object.defineProperties(draft, Object.getOwnPropertyDescriptors(part)));
        return draft;
    }

    /*
      The filter bar's popups: one open at a time, each kept inside the
      window, its pill holding still while it is open. A scope may define
      onPanelToggled(panel) for what opening one needs.
    */
    function filterBarPanels() {
        return {
            // The open popup: season, stats, and on the player tab positions,
            // nationality, age, height or minutes.
            panel: '',

            togglePanel(name) {
                this.panel = this.panel === name ? '' : name;
                this.onPanelToggled?.(this.panel);
                this.fitPanel();
            },

            /*
              Keeps the open popup on screen. It hangs from its pill's left edge,
              but the bar wraps, so a pill can start either row or end it at any
              window width, and no fixed side fits them all: measured, then nudged
              just far enough to sit inside both edges.
            */
            fitPanel() {
                const fit = (attempt) => {
                    const panel = this.panel ? this.$root.querySelector(`[data-panel="${this.panel}"]`) : null;
                    if (!panel) return;

                    // x-show's transition displays the popup a frame or two after
                    // the state flips; measured before that it is 0 wide and fits
                    // nowhere. It is still fading in from transparent meanwhile.
                    if (panel.getBoundingClientRect().width === 0) {
                        if (attempt < 10) requestAnimationFrame(() => fit(attempt + 1));
                        return;
                    }

                    panel.style.setProperty('--panel-shift', '0px');

                    const rect = panel.getBoundingClientRect();
                    const viewport = document.documentElement.clientWidth;
                    let shift = 0;

                    if (rect.right > viewport - PANEL_EDGE) shift = viewport - PANEL_EDGE - rect.right;
                    if (rect.left + shift < PANEL_EDGE) shift = PANEL_EDGE - rect.left;

                    panel.style.setProperty('--panel-shift', `${Math.round(shift)}px`);
                };

                this.$nextTick(() => fit(0));
            },

            closePanel() {
                this.panel = '';
            },

            /*
              The open popup's pill keeps the width it opened at. Its label follows
              the filter while it is edited, and a pill growing or shrinking under
              the pointer reflowed the bar, sometimes onto another row, taking the
              popup and the slider being dragged along with it. Meanwhile the label
              truncates; the pill takes its new size once the popup closes.
            */
            holdPillWidth(next, previous) {
                const pill = (name) => (name ? this.$root.querySelector(`[data-pill="${name}"]`) : null);
                const released = pill(previous);
                const held = pill(next);

                if (released) released.style.width = '';
                if (held) held.style.width = `${held.getBoundingClientRect().width}px`;
            },

            // A click in the league or attribute window opened from a popup is
            // outside it on the page, but not a reason to close it.
            closePanelIfOutside(name) {
                if (this.panel === name && !this.pickerOpen && !this.leagueModalOpen) this.panel = '';
            },

            // Whichever way a popup opens or closes, its pill holds still.
            watchPanels() {
                this.$watch('panel', (next, previous) => this.holdPillWidth(next, previous));
            },
        };
    }

    /*
      The league and season pills: "Seleccionar ligas", whose open and shown
      are two flags for the same two-frame entrance as the attribute
      picker's, and the season a search reads for each league.
    */
    function leagueDraft(config) {
        return {
            filterSeason: config.applied.filterSeason,
            filterLeagues: [...(config.applied.filterLeagues || [])],
            // Searched when no league is picked; see Players::defaultCompetitionId().
            defaultLeagueId: config.defaultLeagueId,
            leagueById: config.leagueById,
            leagueCatalog: config.leagueCatalogGrouped,
            seasonOptions: config.seasonOptions,
            leagueCatalogCount: config.leagueCatalogCount,
            leagueDbCount: config.leagueDbCount,
            leagueSeasonCoverage: config.leagueSeasonCoverage || {},
            leagueDefaultSeasonLabel: config.leagueDefaultSeasonLabel || {},
            // False until `php artisan opta:coverage` has run, and on the team
            // tab: the picker then hides the "Sin datos" marker instead of guessing.
            coverageKnown: config.coverageKnown === true,
            leagueModalOpen: false,
            leagueModalShown: false,
            leagueModalCloseTimer: null,
            leagueSearch: '',

            get defaultLeagueName() {
                return this.leagueById[this.defaultLeagueId] || '';
            },

            /*
              The pills say as little as they can, so the whole bar fits one
              line: a filter's name while it is untouched, its value once
              set. Each pill's title says it in full.
            */
            get selectedLeagueLabel() {
                const count = this.filterLeagues.length;
                if (count === 0) return this.defaultLeagueName || 'Ligas';
                if (count === 1) return this.leagueById[this.filterLeagues[0]] || '1 liga';
                return `${count} ligas`;
            },

            get selectedLeagueTitle() {
                if (this.filterLeagues.length === 0) {
                    return this.defaultLeagueName ? `${this.defaultLeagueName} (por defecto)` : 'Selecciona ligas';
                }
                return this.filterLeagues.map((id) => this.leagueById[id] || id).join(', ');
            },

            // The picker's subtitle after its instructions: what is picked, or
            // what is searched without a pick, and how many have Scout data.
            get leaguePickerSummary() {
                const count = this.filterLeagues.length;
                const number = (value) => new Intl.NumberFormat('es-ES').format(value);
                const picked = count === 0
                    ? (this.defaultLeagueName ? `Sin ninguna, se busca en ${this.defaultLeagueName}.` : '')
                    : `${count === 1 ? '1 seleccionada' : `${count} seleccionadas`}.`;
                const coverage = this.coverageKnown
                    ? ` ${number(this.seasonDataLeagueCount)} de ${number(this.leagueCatalogCount)} con datos Scout en la temporada seleccionada.`
                    : '';

                return picked + coverage;
            },

            get seasonDataLeagueCount() {
                return Object.keys(this.leagueById || {})
                    .filter((id) => this.leagueHasSeasonData(id))
                    .length;
            },

            // As openPicker(): laid out at the start values first, then the class
            // that transitions away from them.
            openLeagueModal() {
                clearTimeout(this.leagueModalCloseTimer);
                this.leagueSearch = '';
                this.leagueModalOpen = true;
                document.body.style.overflow = 'hidden';

                requestAnimationFrame(() => requestAnimationFrame(() => {
                    this.leagueModalShown = true;
                }));
            },

            closeLeagueModal() {
                if (!this.leagueModalOpen) return;

                this.leagueModalShown = false;
                document.body.style.overflow = '';
                clearTimeout(this.leagueModalCloseTimer);
                this.leagueModalCloseTimer = setTimeout(() => {
                    this.leagueModalOpen = false;
                }, PICKER_TRANSITION_MS);
            },

            // Accent-insensitive, on the league, its country in Spanish or as Opta
            // names it, and the region: "mexico" finds México, "espana" España.
            get filteredLeagueCatalog() {
                const term = this.foldText(this.leagueSearch.trim());
                if (!term) return this.leagueCatalog;

                return this.leagueCatalog
                    .map((region) => ({
                        ...region,
                        countries: region.countries
                            .map((country) => {
                                const countryMatches = [country.label, country.country, region.region]
                                    .some((text) => this.foldText(text).includes(term));

                                return {
                                    ...country,
                                    leagues: countryMatches
                                        ? country.leagues
                                        : country.leagues.filter((league) => this.foldText(league.name).includes(term)),
                                };
                            })
                            .filter((country) => country.leagues.length > 0),
                    }))
                    .filter((region) => region.countries.length > 0);
            },

            leagueCountryState(country) {
                const picked = country.leagues.filter((league) => this.isLeagueSelected(league.id)).length;
                return picked === country.leagues.length ? 'all' : (picked === 0 ? 'none' : 'partial');
            },

            // As a category in the attribute picker: not all picked -> pick them
            // all; all picked -> clear them. Only the leagues the search shows.
            toggleLeagueCountry(country) {
                const ids = country.leagues.map((league) => league.id);

                this.filterLeagues = this.leagueCountryState(country) === 'all'
                    ? this.filterLeagues.filter((id) => !ids.includes(id))
                    : [...this.filterLeagues, ...ids.filter((id) => !this.filterLeagues.includes(id))];
            },

            flagUrl(alpha2) {
                if (!alpha2 || alpha2.length !== 2) return '';
                return `https://flagcdn.com/w20/${alpha2}.png`;
            },

            isLeagueSelected(id) {
                return this.filterLeagues.includes(id);
            },

            // The season a search would actually read for this league: the one
            // picked in the filter when the league runs it, otherwise the league's
            // own newest started season. Mirrors Players::selectedSeasons().
            resolvedSeasonLabel(id) {
                const byLabel = this.leagueSeasonCoverage[id];

                if (this.filterSeason !== '' && byLabel && this.filterSeason in byLabel) {
                    return this.filterSeason;
                }

                return this.leagueDefaultSeasonLabel[id] || '';
            },

            leagueHasSeasonData(id) {
                // Nothing measured yet: claim nothing, mark nothing.
                if (!this.coverageKnown) return true;

                const byLabel = this.leagueSeasonCoverage[id];

                return !!(byLabel && byLabel[this.resolvedSeasonLabel(id)]);
            },

            // Straight into the draft, as a stat is: "Buscar" applies it.
            toggleLeague(id) {
                this.filterLeagues = this.isLeagueSelected(id)
                    ? this.filterLeagues.filter((item) => item !== id)
                    : [...this.filterLeagues, id];
            },

            clearLeagues() {
                this.filterLeagues = [];
            },
        };
    }

    /*
      The "Periodo" pill (SK-03.4): a season (filterSeason, leagueDraft()'s)
      and, when the leagues share them, one of its tournaments; a date range,
      across every season it reaches; or a matchday range within one stage of
      the season — matchdays only with one league, as they are each league's
      own. What it picks from is asked for when the popup opens
      (Players::periodCalendar(), config.periodCalendarMethod). While a
      period or the other tournament is set, read from the per-match rows,
      attributes with no per-match twin are disabled in the picker
      (pickerDisabled()), and the stat sliders' ends are the period's.
    */
    function periodDraft(config) {
        const applied = config.applied.period && config.applied.period.type ? config.applied.period : null;

        return {
            // '' is the tournament in progress, as on the league page.
            filterTournament: config.applied.filterTournament || '',
            tournamentLabels: config.tournamentLabels || {},
            periodType: applied ? applied.type : 'season',
            periodFrom: applied && applied.type === 'dates' ? applied.from : '',
            periodTo: applied && applied.type === 'dates' ? applied.to : '',
            periodStage: applied && applied.type === 'rounds' ? applied.stage : '',
            periodRoundFrom: applied && applied.type === 'rounds' ? Number(applied.from) : null,
            periodRoundTo: applied && applied.type === 'rounds' ? Number(applied.to) : null,
            periodCalendarMethod: config.periodCalendarMethod,
            periodCalendar: null,
            periodCalendarLoading: false,
            periodCalendarRequest: 0,
            // The open field menu inside the popup: stage, from or to.
            periodMenu: '',

            togglePeriodMenu(name) {
                this.periodMenu = this.periodMenu === name ? '' : name;
            },

            get periodSingleLeague() {
                return this.filterLeagues.length <= 1;
            },

            // The applied stage stays offered until the calendar says otherwise.
            get periodStages() {
                if (!this.periodSingleLeague) return [];
                if (this.periodCalendar) return this.periodCalendar.stages || [];
                return applied && applied.type === 'rounds'
                    ? [{ key: applied.stage, label: applied.stageLabel || applied.stage, first: Number(applied.from), last: Number(applied.to) }]
                    : [];
            },

            get periodRoundsAvailable() {
                return this.periodStages.length > 0;
            },

            get periodRoundsUnavailableReason() {
                if (!this.periodSingleLeague) return 'Elige una sola liga para filtrar por jornadas';
                if (this.periodCalendarLoading) return 'Cargando calendario…';
                return 'Esta temporada no tiene jornadas jugadas';
            },

            get periodStageInfo() {
                return this.periodStages.find((stage) => stage.key === this.periodStage) || null;
            },

            get periodRoundOptions() {
                const stage = this.periodStageInfo;
                if (!stage) return [];
                return Array.from({ length: stage.last - stage.first + 1 }, (_, index) => stage.first + index);
            },

            // What a search sends: null for the whole season, or a complete range.
            get period() {
                if (this.periodType === 'dates' && this.periodFrom && this.periodTo) {
                    const [from, to] = [this.periodFrom, this.periodTo].sort();
                    return { type: 'dates', from, to };
                }

                if (this.periodType === 'rounds' && this.periodStageInfo && this.periodRoundFrom && this.periodRoundTo) {
                    return {
                        type: 'rounds',
                        from: Math.min(this.periodRoundFrom, this.periodRoundTo),
                        to: Math.max(this.periodRoundFrom, this.periodRoundTo),
                        stage: this.periodStage,
                        stageLabel: this.periodStageInfo.label,
                    };
                }

                return null;
            },

            // A string, so watching it fires only when the period does change.
            get periodKey() {
                return JSON.stringify(periodSignature(this.period));
            },

            get periodIsSet() {
                return this.period !== null;
            },

            // What a search sends: a tournament only with the season, '' for
            // the one in progress.
            get tournament() {
                return this.periodType === 'season' ? this.filterTournament : '';
            },

            // The other tournament is read from the per-match rows, as a period is.
            get periodReadsPerMatch() {
                return this.periodIsSet || this.tournament !== '';
            },

            get periodPillActive() {
                return this.periodIsSet || this.filterSeason !== '' || this.tournament !== '';
            },

            /*
              The Torneo picker's choices, as the league page words them: the
              one in progress first-class ('' — "Apertura (en curso)" while its
              season is being played), the other by its key. None until the
              calendar says the leagues share them.
            */
            get periodTournaments() {
                const calendar = this.periodCalendar;
                if (!calendar || !calendar.tournaments) return [];

                return calendar.tournaments.map((option) => option.key === calendar.tournamentCurrent
                    ? { id: '', label: `${option.label}${calendar.tournamentLive ? ' (en curso)' : ''}` }
                    : { id: option.key, label: option.label });
            },

            get periodTournamentLabel() {
                const option = this.periodTournaments.find((choice) => choice.id === this.filterTournament);
                return option ? option.label : (this.tournamentLabels[this.filterTournament] || 'Torneo');
            },

            // The season row's second field: its tournament, or its stage for matchdays.
            get periodSeasonSecondField() {
                return (this.periodType === 'season' && this.periodTournaments.length > 0)
                    || (this.periodType === 'rounds' && this.periodStages.length > 1);
            },

            // Short, as the bar holds a pill's width while its popup is open:
            // "Clausura · 2025/2026", "J5–J10", "1 sep – 30 sep". The title and
            // the header say it in full.
            get periodPillLabel() {
                const period = this.period;

                if (!period) {
                    const tournament = this.tournament ? `${this.tournamentLabels[this.tournament] || this.tournament} · ` : '';
                    return `${tournament}${this.filterSeason || 'Temporada'}`;
                }

                if (period.type === 'rounds') {
                    return period.from === period.to ? `J${period.from}` : `J${period.from}–J${period.to}`;
                }

                return periodLabel(period).replace(/ \d{4}$/, '').replace(/ \d{4} –/, ' –');
            },

            get periodPillTitle() {
                if (this.periodIsSet) return `Periodo: ${periodLabel(this.period)}`;

                const season = this.filterSeason ? `Temporada ${this.filterSeason}` : 'Temporada más reciente';
                return this.tournament ? `${season}, ${this.tournamentLabels[this.tournament] || this.tournament}` : season;
            },

            // An attribute a period cannot read: its reason, or '' when it can.
            pickerDisabled(key) {
                return this.periodReadsPerMatch && this.attributeIndex[key]?.rangeable === false
                    ? 'Sin dato por partido: no se puede leer en un periodo'
                    : '';
            },

            async setPeriodType(type) {
                // What there is to pick from first: matchdays depend on it.
                if (type !== 'season' && !this.periodCalendar) await this.loadPeriodCalendar();
                if (type === 'rounds' && !this.periodRoundsAvailable) return;

                this.periodType = type;
                if (type === 'season') return;

                if (type === 'dates' && this.periodCalendar) {
                    this.periodFrom ||= this.periodCalendar.first || '';
                    this.periodTo ||= this.periodCalendar.last || '';
                }

                // The stage being played now, all its matchdays so far.
                if (type === 'rounds' && !this.periodStageInfo && this.periodStages.length > 0) {
                    this.periodStage = this.periodStages[this.periodStages.length - 1].key;
                    this.onPeriodStageChange();
                }
            },

            onPeriodStageChange() {
                const stage = this.periodStageInfo;
                this.periodRoundFrom = stage ? stage.first : null;
                this.periodRoundTo = stage ? stage.last : null;
            },

            async loadPeriodCalendar() {
                const request = ++this.periodCalendarRequest;
                this.periodCalendarLoading = true;
                let calendar = null;

                try {
                    calendar = await this.$wire[this.periodCalendarMethod]([...this.filterLeagues], this.filterSeason);
                } catch (error) {
                    calendar = null;
                }

                // A newer request (another league ticked) has taken over.
                if (request !== this.periodCalendarRequest) return;

                this.periodCalendarLoading = false;
                this.periodCalendar = calendar || { first: null, last: null, stages: [], pending: [], tournaments: [] };

                // A stage this league or season does not have is no longer a period.
                if (this.periodType === 'rounds' && !this.periodStageInfo) this.periodType = 'season';

                // Nor a tournament these leagues do not share: back to the one in progress.
                if (this.filterTournament && !this.periodTournaments.some((option) => option.id === this.filterTournament)) {
                    this.filterTournament = '';
                }
            },

            resetPeriod() {
                this.filterTournament = '';
                this.periodType = 'season';
                this.periodFrom = '';
                this.periodTo = '';
                this.periodStage = '';
                this.periodRoundFrom = null;
                this.periodRoundTo = null;
            },

            // The calendar follows the draft's leagues and season; matchdays
            // go with a second league. A tournament picked is checked against
            // the new leagues even with the popup closed.
            watchPeriod() {
                const refresh = () => {
                    if (!this.periodSingleLeague && this.periodType === 'rounds') this.periodType = 'season';
                    this.periodCalendar = null;
                    if (this.panel === 'period' || this.filterTournament) this.loadPeriodCalendar();
                };

                this.$watch('filterLeagues', refresh);
                this.$watch('filterSeason', refresh);
                this.$watch('panel', (panel) => {
                    this.periodMenu = '';
                    if (panel === 'period' && !this.periodCalendar && !this.periodCalendarLoading) this.loadPeriodCalendar();
                });
            },
        };
    }

    /*
      Season-stat range filters: the attributes picked, each also a result
      column, with sliders over their ends in the draft's leagues and season,
      and the leagues whose tables are not built yet. config.rangesMethod
      names the $wire action that measures the ends (Players::statRanges() or
      teamStatRanges()), config.unitLabels how each unit reads. The scope sets
      statUnit, the one unit every attribute that has it is read in.
    */
    function statFilterDraft(config) {
        return {
            attributeIndex: indexStatCatalog(config.statCatalog),
            maxStatFilters: config.maxStatFilters || 8,
            unitLabels: config.unitLabels || {},
            rangesMethod: config.rangesMethod,
            statUnit: null,
            statFilters: (config.applied.statFilters || []).map((filter) => draftStatFilter(filter)),
            // Leagues in the draft whose season stats opta:warm has not built yet.
            statsPendingDraft: [],
            statRangeRequest: 0,
            statRangeTimer: null,

            attributeLabel(key) {
                return this.attributeIndex[key]?.label || key;
            },

            attributeUnits(key) {
                return this.attributeIndex[key]?.units || ['p90'];
            },

            unitLabel(unit) {
                return this.unitLabels[unit] ?? unit;
            },

            formatStat(value, unit) {
                return formatStatValue(value, unit);
            },

            pickerHas(key) {
                return this.statFilters.some((filter) => filter.key === key);
            },

            pickerSet(key, on) {
                if (on === this.pickerHas(key)) return;

                if (on) {
                    if (this.statFilters.length >= this.maxStatFilters) return;
                    // Over a period, an attribute with no per-match twin cannot be added.
                    if (this.pickerDisabled?.(key)) return;
                    const added = draftStatFilter({ key, unit: this.unitFor(key) });
                    // The SKore (the only rating) always leads the rest, as in the results.
                    this.statFilters = added.unit === 'rating' ? [added, ...this.statFilters] : [...this.statFilters, added];
                    // A draft may answer what was picked (the players' narrows to goalkeepers).
                    this.attributeAdded?.(key);
                    this.scheduleStatRanges();
                } else {
                    this.statFilters = this.statFilters.filter((filter) => filter.key !== key);
                }
            },

            pickerClear() {
                this.statFilters = [];
            },

            removeStatFilter(key) {
                this.pickerSet(key, false);
            },

            // The overarching unit where the attribute has it, else its only one.
            unitFor(key) {
                const units = this.attributeUnits(key);
                return units.includes(this.statUnit) ? this.statUnit : units[0];
            },

            setStatUnit(unit) {
                if (this.statUnit === unit) return;

                this.statUnit = unit;
                let changed = false;

                // A per-90 or per-match bound means nothing as a total: a
                // filter whose unit changes starts open, on the new unit's
                // range. Ratios, minutes and the like keep their only unit,
                // and their bounds.
                this.statFilters.forEach((filter) => {
                    const next = this.unitFor(filter.key);
                    if (next === filter.unit) return;

                    filter.unit = next;
                    filter.min = null;
                    filter.max = null;
                    filter.range = null;
                    filter.loading = true;
                    changed = true;
                });

                if (changed) this.scheduleStatRanges();
            },

            get statsPillLabel() {
                const count = this.statFilters.length;
                if (count === 0) return 'Estadísticas';
                return `Estadísticas · ${count} · ${this.unitLabel(this.statUnit)}`;
            },

            get statsPillTitle() {
                return this.statFilters.map((filter) => {
                    // Some team attribute names already carry their unit ("Posesión (%)").
                    const label = this.attributeLabel(filter.key);
                    const unit = `(${this.unitLabel(filter.unit)})`;
                    return label.endsWith(unit) ? label : `${label} ${unit}`;
                }).join(', ');
            },

            onStatRangeInput(filter, changed) {
                let low = Number(filter.low);
                let high = Number(filter.high);

                if (low > high) {
                    if (changed === 'low') high = low;
                    else low = high;
                }

                // Float steps drift (0.30000000000000004); four places is plenty.
                filter.low = Math.round(low * 10000) / 10000;
                filter.high = Math.round(high * 10000) / 10000;
            },

            dualRangeStyle(minVal, maxVal, floor, ceiling) {
                const low = Math.min(Number(minVal), Number(maxVal));
                const high = Math.max(Number(minVal), Number(maxVal));
                const span = ceiling - floor || 1;
                const left = ((low - floor) / span) * 100;
                const width = ((high - low) / span) * 100;
                return `--range-left:${left}%;--range-width:${width}%;`;
            },

            scheduleStatRanges() {
                clearTimeout(this.statRangeTimer);
                this.statRangeTimer = setTimeout(() => this.refreshStatRanges(), 250);
            },

            // Every draft filter with a slider.
            get rangedFilters() {
                return this.statFilters;
            },

            // Ends from the leagues and season in the draft, not the applied search.
            async refreshStatRanges() {
                const filters = this.rangedFilters;

                if (filters.length === 0) {
                    this.statsPendingDraft = [];
                    return;
                }

                // Each tab measures its own population, so each keeps its own ends.
                const scope = JSON.stringify([this.rangesMethod, [...this.filterLeagues].sort(), this.filterSeason, this.periodKey ?? null, this.tournament ?? '']);
                const request = ++this.statRangeRequest;
                const missing = [];

                // Known ends are applied at once: the filter card is rebuilt after
                // every search, and asking again would flash "Calculando rango…"
                // and jump the sliders for ends that have not moved.
                filters.forEach((filter) => {
                    captureStatBounds(filter);
                    const cached = statRangeCache.get(`${scope}|${filter.key}|${filter.unit}`);

                    if (cached) {
                        applyStatRange(filter, cached);
                    } else {
                        filter.loading = true;
                        missing.push(filter);
                    }
                });

                if (statPendingCache.has(scope)) this.statsPendingDraft = statPendingCache.get(scope);
                if (missing.length === 0) return;

                let result = null;

                try {
                    result = await this.$wire[this.rangesMethod](
                        [...this.filterLeagues],
                        this.filterSeason,
                        missing.map(({ key, unit }) => ({ key, unit })),
                        this.period ?? null,
                        this.tournament ?? ''
                    );
                } catch (error) {
                    result = null;
                }

                // A newer request (another league ticked) has taken over.
                if (request !== this.statRangeRequest) return;

                const ranges = result?.ranges || {};
                this.statsPendingDraft = result?.pending || [];
                statPendingCache.set(scope, this.statsPendingDraft);

                missing.forEach((filter) => {
                    const range = ranges[`${filter.key}|${filter.unit}`] || null;

                    // "No data" is not remembered: the league may be warmed by the next ask.
                    if (range) statRangeCache.set(`${scope}|${filter.key}|${filter.unit}`, range);
                    applyStatRange(filter, range);
                });
            },

            // The ranges follow the draft's leagues, season, period and tournament.
            watchStatRanges() {
                if (this.rangedFilters.length > 0) this.refreshStatRanges();

                this.$watch('filterLeagues', () => this.scheduleStatRanges());
                this.$watch('filterSeason', () => this.scheduleStatRanges());
                this.$watch('periodKey', () => this.scheduleStatRanges());
                this.$watch('tournament', () => this.scheduleStatRanges());
            },
        };
    }

    function registerPlayersFilterDraft() {
        Alpine.data('playersFilterDraft', (config) => composeDraft(
            attributePicker(config.statCatalog),
            filterBarPanels(),
            leagueDraft(config),
            periodDraft(config),
            statFilterDraft(config),
            {
                // One unit for every stat attribute; see Players::$statUnit.
                statUnit: config.applied.statUnit === 'total' ? 'total' : 'p90',
                // Minutes played: a slider like a stat filter's, from 0 to the most
                // anyone has played in the draft's leagues, but a filter only.
                minutesFilter: draftStatFilter({
                    key: config.minutesAttribute || 'Time Played',
                    unit: 'total',
                    min: config.applied.minutesMin,
                    max: config.applied.minutesMax,
                    floor: 0,
                }),
                // Its ends cost a read of every selected league's table, so they are
                // asked for once the pill is opened or a bound is applied, not before.
                minutesWanted: config.applied.minutesMin != null || config.applied.minutesMax != null,
                filterPositions: [...(config.applied.filterPositions || [])],
                filterNationalities: [...(config.applied.filterNationalities || [])],
                nationalitySearch: '',
                filterClubs: [...(config.applied.filterClubs || [])],
                clubSearch: '',
                ageMin: config.applied.ageMin,
                ageMax: config.applied.ageMax,
                heightMin: config.applied.heightMin,
                heightMax: config.applied.heightMax,
                defaults: config.defaults,
                positionOptions: config.positionOptions,
                // Leagues opta:warm has not computed positions for yet.
                positionsPending: config.positionsPending || [],
                nationalityOptions: config.nationalityOptions,
                clubOptions: config.clubOptions || [],
                appliedSignature: filterSignature(config.applied),

                // Every draft filter with a slider: the stat filters, and minutes once wanted.
                get rangedFilters() {
                    return this.minutesWanted ? [...this.statFilters, this.minutesFilter] : this.statFilters;
                },

                get allPositionCodes() {
                    return this.positionOptions.map((option) => option.code);
                },

                /*
                  A goalkeeper's attribute picked (the "Portero" category:
                  Goals Prevented, saves…) narrows Posición to goalkeepers in
                  the draft, where the pill shows it before Buscar, and the
                  reader can widen it again (beta-final-changes fase 5, B1).
                */
                attributeAdded(key) {
                    if (!this.attributeIndex[key]?.goalkeeper || !this.allPositionCodes.includes('GK')) return;
                    this.filterPositions = ['GK'];
                },

                get allPositionsSelected() {
                    return this.filterPositions.length === this.allPositionCodes.length;
                },

                get positionsCountLabel() {
                    return `${this.filterPositions.length} de ${this.allPositionCodes.length}`;
                },

                isPositionSelected(code) {
                    return this.filterPositions.includes(code);
                },

                // Kept in pitch order so the payload is stable whatever the click order.
                togglePosition(code) {
                    const selected = this.isPositionSelected(code)
                        ? this.filterPositions.filter((item) => item !== code)
                        : [...this.filterPositions, code];

                    this.filterPositions = this.allPositionCodes.filter((item) => selected.includes(item));
                },

                toggleAllPositions() {
                    this.filterPositions = this.allPositionsSelected ? [] : [...this.allPositionCodes];
                },

                nationalityName(value) {
                    const option = this.nationalityOptions.find((item) => item.value === value);
                    return option ? option.label : value;
                },

                get selectedNationalityLabel() {
                    const count = this.filterNationalities.length;
                    if (count === 0) return 'Nacionalidad';
                    if (count === 1) return this.nationalityName(this.filterNationalities[0]);
                    return `${count} nacionalidades`;
                },

                get nationalityPillTitle() {
                    if (this.filterNationalities.length === 0) return 'Todas las nacionalidades';
                    return this.filterNationalities.map((value) => this.nationalityName(value)).join(', ');
                },

                // Accent-insensitive, so "mexico" finds "México".
                foldAccents(value) {
                    return String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
                },

                get filteredNationalityOptions() {
                    const term = this.foldAccents(this.nationalitySearch.trim());
                    if (!term) return this.nationalityOptions;

                    return this.nationalityOptions.filter((option) => this.foldAccents(option.label).includes(term));
                },

                isNationalitySelected(value) {
                    return this.filterNationalities.includes(value);
                },

                // Club: the searched leagues' clubs; nothing ticked is every club.
                clubName(value) {
                    const option = this.clubOptions.find((item) => item.value === value);
                    return option ? option.label : value;
                },

                get selectedClubLabel() {
                    const count = this.filterClubs.length;
                    if (count === 0) return 'Club';
                    if (count === 1) return this.clubName(this.filterClubs[0]);
                    return `${count} clubes`;
                },

                get clubPillTitle() {
                    if (this.filterClubs.length === 0) return 'Todos los clubes';
                    return this.filterClubs.map((value) => this.clubName(value)).join(', ');
                },

                get filteredClubOptions() {
                    const term = this.foldAccents(this.clubSearch.trim());
                    if (!term) return this.clubOptions;

                    return this.clubOptions.filter((option) => this.foldAccents(option.label).includes(term));
                },

                isClubSelected(value) {
                    return this.filterClubs.includes(value);
                },

                toggleClub(value) {
                    this.filterClubs = this.isClubSelected(value)
                        ? this.filterClubs.filter((item) => item !== value)
                        : [...this.filterClubs, value];
                },

                toggleNationality(value) {
                    this.filterNationalities = this.isNationalitySelected(value)
                        ? this.filterNationalities.filter((item) => item !== value)
                        : [...this.filterNationalities, value];
                },

                // Opening a popup: the nationality search takes the focus, and
                // minutes ask for their ends the first time.
                onPanelToggled(panel) {
                    if (panel === 'nationality') {
                        this.nationalitySearch = '';
                        this.$nextTick(() => this.$refs.nationalitySearch?.focus());
                    }

                    if (panel === 'club') {
                        this.clubSearch = '';
                        this.$nextTick(() => this.$refs.clubSearch?.focus());
                    }

                    if (panel === 'minutes' && !this.minutesWanted) {
                        this.minutesWanted = true;
                        this.refreshStatRanges();
                    }
                },

                // ── What each pill says ──

                // The pill names positions by their Spanish acronym; its tooltip, by full name.
                positionOption(code) {
                    return this.positionOptions.find((option) => option.code === code) || { code, short: code, label: code };
                },

                get positionsPillLabel() {
                    const shorts = this.filterPositions.map((code) => this.positionOption(code).short);
                    if (this.allPositionsSelected) return 'Posición';
                    if (shorts.length === 0) return 'Ninguna posición';
                    return shorts.length <= 3 ? shorts.join(', ') : `${shorts.slice(0, 3).join(', ')} +${shorts.length - 3}`;
                },

                get positionsPillTitle() {
                    if (this.allPositionsSelected) return 'Todas las posiciones';
                    return this.filterPositions.map((code) => this.positionOption(code).label).join(', ');
                },

                get ageIsSet() {
                    return this.dualRangeLow('ageMin', 'ageMax') > 15 || this.dualRangeHigh('ageMin', 'ageMax') < 40;
                },

                get agePillLabel() {
                    if (!this.ageIsSet) return 'Edad';
                    const high = this.dualRangeHigh('ageMin', 'ageMax');
                    return `${this.dualRangeLow('ageMin', 'ageMax')}–${high}${high >= 40 ? '+' : ''} años`;
                },

                get agePillTitle() {
                    return this.ageIsSet ? `Edad: ${this.agePillLabel}` : 'Cualquier edad';
                },

                get heightIsSet() {
                    return this.dualRangeLow('heightMin', 'heightMax') > 150 || this.dualRangeHigh('heightMin', 'heightMax') < 210;
                },

                get heightPillLabel() {
                    if (!this.heightIsSet) return 'Altura';
                    const high = this.dualRangeHigh('heightMin', 'heightMax');
                    return `${this.dualRangeLow('heightMin', 'heightMax')}–${high}${high >= 210 ? '+' : ''} cm`;
                },

                get heightPillTitle() {
                    return this.heightIsSet ? `Altura: ${this.heightPillLabel}` : 'Cualquier altura';
                },

                get minutesIsSet() {
                    const { min, max } = statBounds(this.minutesFilter);
                    return min !== null || max !== null;
                },

                get minutesPillLabel() {
                    const { min, max } = statBounds(this.minutesFilter);
                    const minutes = (value) => new Intl.NumberFormat('es-ES').format(Math.round(value));

                    if (min === null && max === null) return 'Minutos';
                    if (max === null) return `${minutes(min)}+ min`;
                    if (min === null) return `Hasta ${minutes(max)} min`;
                    return `${minutes(min)}–${minutes(max)} min`;
                },

                get minutesPillTitle() {
                    return this.minutesIsSet ? `Minutos jugados: ${this.minutesPillLabel}` : 'Cualquier minutaje';
                },

                // Filters hide in popups, so "Buscar" marks changes not searched yet.
                get isDirty() {
                    // Named fields only: spreading `this` would run every getter,
                    // this one included.
                    return filterSignature({
                        filterSeason: this.filterSeason,
                        filterTournament: this.tournament,
                        filterPositions: this.filterPositions,
                        filterLeagues: this.filterLeagues,
                        filterNationalities: this.filterNationalities,
                        filterClubs: this.filterClubs,
                        ageMin: this.dualRangeLow('ageMin', 'ageMax'),
                        ageMax: this.dualRangeHigh('ageMin', 'ageMax'),
                        heightMin: this.dualRangeLow('heightMin', 'heightMax'),
                        heightMax: this.dualRangeHigh('heightMin', 'heightMax'),
                        minutesMin: statBounds(this.minutesFilter).min,
                        minutesMax: statBounds(this.minutesFilter).max,
                        statUnit: this.statUnit,
                        statFilters: this.statFilters.map((filter) => ({ key: filter.key, ...statBounds(filter) })),
                        period: this.period,
                    }) !== this.appliedSignature;
                },

                dualRangeLow(minKey, maxKey) {
                    return Math.min(Number(this[minKey]), Number(this[maxKey]));
                },

                dualRangeHigh(minKey, maxKey) {
                    return Math.max(Number(this[minKey]), Number(this[maxKey]));
                },

                onDualRangeInput(changedKey, minKey, maxKey, floor, ceiling) {
                    let min = Number(this[minKey]);
                    let max = Number(this[maxKey]);
                    min = Math.max(floor, Math.min(ceiling, min));
                    max = Math.max(floor, Math.min(ceiling, max));

                    if (min > max) {
                        if (changedKey === minKey) {
                            max = min;
                        } else {
                            min = max;
                        }
                    }

                    this[minKey] = min;
                    this[maxKey] = max;
                },

                normalizeDualRanges() {
                    this.onDualRangeInput('ageMin', 'ageMin', 'ageMax', 15, 40);
                    this.onDualRangeInput('heightMin', 'heightMin', 'heightMax', 150, 210);
                },

                init() {
                    this.normalizeDualRanges();
                    this.watchStatRanges();
                    this.watchPanels();
                    this.watchPeriod();
                },

                collectPayload() {
                    captureStatBounds(this.minutesFilter);

                    return {
                        filterSeason: this.filterSeason,
                        filterTournament: this.tournament,
                        filterPositions: [...this.filterPositions],
                        filterLeagues: [...this.filterLeagues],
                        filterNationalities: [...this.filterNationalities],
                        filterClubs: [...this.filterClubs],
                        ageMin: this.ageMin,
                        ageMax: this.ageMax,
                        heightMin: this.heightMin,
                        heightMax: this.heightMax,
                        minutesMin: wholeOrNull(this.minutesFilter.min),
                        minutesMax: wholeOrNull(this.minutesFilter.max),
                        statUnit: this.statUnit,
                        statFilters: this.statFilters.map((filter) => {
                            captureStatBounds(filter);
                            return { key: filter.key, min: filter.min, max: filter.max };
                        }),
                        period: this.period,
                    };
                },

                applySearch() {
                    // As the button's own :disabled: nothing to search without a position.
                    if (this.filterPositions.length === 0) return;

                    this.$wire.applyFilters(this.collectPayload());
                },

                resetDraft() {
                    const defaults = this.defaults;
                    this.filterSeason = defaults.filterSeason;
                    this.filterPositions = [...(defaults.filterPositions || [])];
                    this.filterLeagues = [...(defaults.filterLeagues || [])];
                    this.filterNationalities = [...(defaults.filterNationalities || [])];
                    this.filterClubs = [...(defaults.filterClubs || [])];
                    this.ageMin = defaults.ageMin;
                    this.ageMax = defaults.ageMax;
                    this.heightMin = defaults.heightMin;
                    this.heightMax = defaults.heightMax;
                    this.statUnit = defaults.statUnit === 'total' ? 'total' : 'p90';
                    // Back to the defaults' stats (the SKore), their ranges fetched again.
                    this.statFilters = (defaults.statFilters || []).map((filter) => draftStatFilter(filter));
                    this.scheduleStatRanges();
                    // Back to open ends, on the ends already fetched.
                    this.minutesFilter.min = null;
                    this.minutesFilter.max = null;
                    if (this.minutesFilter.range) applyStatRange(this.minutesFilter, this.minutesFilter.range);
                    this.statsPendingDraft = [];
                    this.resetPeriod();
                    this.normalizeDualRanges();
                },

                resetAll() {
                    this.resetDraft();
                    this.$wire.resetFilters();
                },
            },
        ));
    }

    /*
      The team tab's draft: the player tab's league, season and stat parts,
      counts all per match or all in total, applied through
      Players::applyTeamFilters().
    */
    function registerTeamsFilterDraft() {
        Alpine.data('teamsFilterDraft', (config) => composeDraft(
            attributePicker(config.statCatalog),
            filterBarPanels(),
            leagueDraft(config),
            periodDraft(config),
            statFilterDraft(config),
            {
                // One unit for every team count; see Players::$teamStatUnit.
                statUnit: config.applied.statUnit === 'total' ? 'total' : 'per_match',
                defaults: config.defaults,
                appliedSignature: teamFilterSignature(config.applied),

                // Filters hide in popups, so "Buscar" marks changes not searched yet.
                get isDirty() {
                    return teamFilterSignature({
                        filterSeason: this.filterSeason,
                        filterTournament: this.tournament,
                        filterLeagues: this.filterLeagues,
                        statUnit: this.statUnit,
                        statFilters: this.statFilters.map((filter) => ({ key: filter.key, ...statBounds(filter) })),
                        period: this.period,
                    }) !== this.appliedSignature;
                },

                init() {
                    this.watchStatRanges();
                    this.watchPanels();
                    this.watchPeriod();
                },

                collectPayload() {
                    return {
                        filterSeason: this.filterSeason,
                        filterTournament: this.tournament,
                        filterLeagues: [...this.filterLeagues],
                        statUnit: this.statUnit,
                        statFilters: this.statFilters.map((filter) => {
                            captureStatBounds(filter);
                            return { key: filter.key, min: filter.min, max: filter.max };
                        }),
                        period: this.period,
                    };
                },

                applySearch() {
                    this.$wire.applyTeamFilters(this.collectPayload());
                },

                resetDraft() {
                    this.filterSeason = this.defaults.filterSeason;
                    this.filterLeagues = [...(this.defaults.filterLeagues || [])];
                    this.statUnit = this.defaults.statUnit === 'total' ? 'total' : 'per_match';
                    this.statFilters = [];
                    this.statsPendingDraft = [];
                    this.resetPeriod();
                },

                resetAll() {
                    this.resetDraft();
                    this.$wire.resetTeamFilters();
                },
            },
        ));
    }

    registerPlayersFilterDraft();
    registerTeamsFilterDraft();

    document.addEventListener('livewire:navigated', () => {
        document.querySelectorAll('[x-data^="playersFilterDraft"], [x-data^="teamsFilterDraft"]').forEach((element) => {
            if (!element.__x && typeof Alpine !== 'undefined') {
                Alpine.initTree(element);
            }
        });
    });
