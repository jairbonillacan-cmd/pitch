(function () {
  'use strict';

  if (window.StatiskicksLeagueMaps) return;

  /*
    The league page's Mapas tab (SK-02.8): one small pitch per team, in table
    order, every one on the same event, chart and period.

    The maps arrive a team at a time (LeagueDetail::loadLeagueMap(), awaited
    in turn, so no request builds more than the team page's map does), the
    teams on show first. They are drawn with the event map's own painters
    (event-map.js StatiskicksEventMap.paint) and heatmap.js's density, each
    on its own scale — a heatmap against its own hottest cells, a zone plot
    against its own busiest zone — so every map reads as it does on the
    team's page (decided 2026-10-09).
  */

  const controllers = new Set();

  function parseJson(value, fallback) {
    try {
      return JSON.parse(value || '');
    } catch {
      return fallback;
    }
  }

  /* A decimal comma, as the rest of the page writes numbers. */
  function decimal(value, digits = 1) {
    return Number(value).toFixed(digits).replace('.', ',');
  }

  class LeagueMaps {
    constructor(root) {
      this.root = root;
      const bootstrap = parseJson(root.dataset.bootstrap, {});
      this.teams = bootstrap.teams || [];
      this.title = bootstrap.title || '';
      this.events = bootstrap.config?.events || [];
      this.viewLabels = Object.fromEntries((bootstrap.config?.views || []).map(view => [view.key, view.label]));
      const defaults = bootstrap.config?.defaults || {};
      this.state = {
        event: defaults.eventKey,
        view: defaults.viewKey,
        variant: defaults.variantKey || 'all',
        stage: defaults.stage || 'SEASON_ALL',
        // 'for' each team's events, 'against' its rivals' (Fase 4).
        side: 'for',
        // The team page's pitch divisions, shared by every map: a focused
        // third or zone is focused on all of them.
        division: 'thirds',
        focus: [],
        // The failed ones (incompletos, perdidos, sin gol…) start off, so
        // each map leads with what came off; their legend item brings them
        // back, for every map and every event.
        misses: false,
        // 'table': the standings' order; 'metric': by each team's per match
        // on the event, in the focus when there is one (fase 5, L3).
        sort: 'table',
      };
      this.metrics = new Map();
      this.hidden = new Set();
      this.payloads = new Map();
      this.fields = new Map();
      this.token = 0;
      this.cards = new Map(Array.from(root.querySelectorAll('[data-map-team]')).map(card => [card.dataset.mapTeam, card]));
      this.onClick = event => this.handleClick(event);
      root.addEventListener('click', this.onClick);
      // Another league picked in the sidebar (league-switcher.js): these settings go with it.
      this.onLeagueSwitch = () => {
        if (this.root.isConnected) window.SkLeagueCarry?.save('maps', this.carried());
      };
      window.addEventListener('sk:league-switch', this.onLeagueSwitch);
      this.restore(window.SkLeagueCarry?.take('maps'));
      this.syncSort();
      this.resolveView();
      this.renderModes();
      this.applyVisibility();
      this.load();
    }

    destroy() {
      this.token++;
      this.root.removeEventListener('click', this.onClick);
      window.removeEventListener('sk:league-switch', this.onLeagueSwitch);
    }

    /* What carries to another league's Mapas: not the period, which is this season's own, nor the teams. */
    carried() {
      const { event, view, variant, division, misses, sort } = this.state;
      return { event, view, variant, division, misses, sort };
    }

    /* The settings carried from another league, where this one's menu has them. */
    restore(carried) {
      if (!carried || !this.events.some(event => event.key === carried.event)) return;
      this.state.event = carried.event;
      const option = Array.from(this.root.querySelectorAll('[data-maps-option="event"]')).find(item => item.dataset.value === carried.event);
      if (option) this.selectOption('event', option);
      // resolveView() falls back to the event's first chart if this one is not offered.
      this.state.view = carried.view;
      if ((this.event()?.variants || []).some(variant => variant.key === carried.variant)) this.state.variant = carried.variant;
      if (window.StatiskicksEventMap?.paint?.divisionKeys.includes(carried.division)) this.state.division = carried.division;
      this.state.misses = Boolean(carried.misses);
      if (carried.sort === 'metric') this.state.sort = 'metric';
    }

    component() {
      const host = this.root.closest('[wire\\:id]');
      return host && window.Livewire ? window.Livewire.find(host.getAttribute('wire:id')) || null : null;
    }

    /*
      The component, once Livewire has it. This script runs before Livewire
      starts, so on a first page load find() has nothing yet: asking then
      gave up on every map and left the tab loading for good.
    */
    async whenComponent(token) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const component = this.component();
        if (component || token !== this.token || !this.root.isConnected) return component;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return null;
    }

    event() {
      return this.events.find(event => event.key === this.state.event) || this.events[0] || null;
    }

    /* The chart the event offers: the current one if it can, else its first. */
    resolveView() {
      const views = this.event()?.views || [];
      if (!views.includes(this.state.view)) this.state.view = views[0];
    }

    handleClick(event) {
      // [data-maps-download] opens the charts' download menu (chart-download.js), which reads exportSource().
      if (event.target.closest('[data-maps-download]')) return;

      if (event.target.closest('[data-maps-misses]')) {
        this.state.misses = !this.state.misses;
        this.renderLegend();
        this.scheduleRender();
        return;
      }

      const sort = event.target.closest('[data-maps-sort]');
      if (sort) {
        if (this.state.sort === sort.dataset.mapsSort) return;
        this.state.sort = sort.dataset.mapsSort === 'metric' ? 'metric' : 'table';
        this.syncSort();
        this.applyOrder();
        return;
      }

      const division = event.target.closest('[data-maps-division]');
      if (division) {
        this.selectDivision(division.dataset.mapsDivision);
        return;
      }

      if (event.target.closest('[data-maps-focus-clear]')) {
        this.setFocus([]);
        return;
      }

      const canvas = event.target.closest('[data-map-canvas]');
      if (canvas) {
        this.focusAt(event, canvas.closest('[data-map-team]'));
        return;
      }

      const option = event.target.closest('[data-maps-option]');
      if (option) {
        const kind = option.dataset.mapsOption;
        if (this.state[kind] === option.dataset.value) return;
        this.state[kind] = option.dataset.value;
        this.selectOption(kind, option);
        if (kind === 'event') {
          this.state.variant = 'all';
          this.resolveView();
          this.renderModes();
        }
        this.load();
        return;
      }

      const view = event.target.closest('[data-maps-view]');
      if (view) {
        if (this.state.view === view.dataset.mapsView) return;
        this.state.view = view.dataset.mapsView;
        this.renderModes();
        this.load();
        return;
      }

      const variant = event.target.closest('[data-maps-variant]');
      if (variant) {
        if (this.state.variant === variant.dataset.mapsVariant) return;
        this.state.variant = variant.dataset.mapsVariant;
        this.renderModes();
        this.load();
        return;
      }

      const side = event.target.closest('[data-maps-side]');
      if (side) {
        if (side.disabled || this.state.side === side.dataset.mapsSide) return;
        this.state.side = side.dataset.mapsSide;
        this.renderModes();
        this.load();
        return;
      }

      const hide = event.target.closest('[data-map-hide]');
      if (hide) {
        this.hidden.add(hide.closest('[data-map-team]').dataset.mapTeam);
        this.applyVisibility();
        return;
      }

      const toggle = event.target.closest('[data-maps-team-toggle]');
      if (toggle) {
        const id = toggle.dataset.mapsTeamToggle;
        if (this.hidden.has(id)) this.hidden.delete(id);
        else this.hidden.add(id);
        this.applyVisibility();
        return;
      }

      const show = event.target.closest('[data-maps-show]');
      if (show) {
        this.hidden = show.dataset.mapsShow === 'all' ? new Set() : new Set(this.teams.map(team => team.id));
        this.applyVisibility();
      }
    }

    selectOption(kind, chosen) {
      this.root.querySelectorAll(`[data-maps-option="${kind}"]`).forEach(item => {
        const selected = item === chosen;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-selected', selected ? 'true' : 'false');
      });
      const label = this.root.querySelector(`[data-maps-label="${kind}"]`);
      if (label) label.textContent = chosen.dataset.label || chosen.textContent.trim();
      if (kind === 'stage') {
        this.root.querySelector('[data-maps-pill="stage"]')?.classList.toggle('active', this.state.stage !== 'SEASON_ALL');
      }
    }

    /* The chart and variant toggles, the advanced search's .chart-toggle, for the event chosen. */
    renderModes() {
      const event = this.event();
      const views = this.root.querySelector('[data-maps-views]');
      const variants = this.root.querySelector('[data-maps-variants]');

      if (views) {
        views.replaceChildren(...(event?.views || []).map(key => this.modeButton(this.viewLabels[key] || key, key === this.state.view, { mapsView: key })));
      }

      if (variants) {
        const options = event?.variants || [];
        variants.hidden = options.length === 0;
        variants.replaceChildren(...options.map(option => this.modeButton(option.label, option.key === this.state.variant, { mapsVariant: option.key })));
      }

      // "En contra" rests on "A favor" where a map has none.
      const sides = this.root.querySelector('[data-maps-sides]');
      if (sides) {
        const enabled = this.sideEnabled();
        sides.replaceChildren(...[['for', 'A favor'], ['against', 'En contra']].map(([key, label]) => {
          const button = this.modeButton(label, key === this.side(), { mapsSide: key });
          button.disabled = !enabled;
          button.title = enabled ? '' : 'Este mapa no tiene «en contra»';
          return button;
        }));
      }

      this.syncFocus();
    }

    /*
      Whether the map has an "en contra": every one but the zones of
      control, both sides already. Involucramiento too: the rivals' touches
      (Dario, 28 Oct).
    */
    sideEnabled() {
      return this.state.view !== 'control' && this.event()?.kind !== 'hull';
    }

    side() {
      return this.sideEnabled() ? this.state.side : 'for';
    }

    /*
      The divisions, the team page's way: thirds focus one at a time, a click
      on the focused one shows the whole pitch; zones add up, and taking out
      the last one shows the whole pitch. The zone plot and the zones of
      control draw their own grid, so the divisions step aside for them. A
      focus only repaints: the maps already hold every event.
    */
    divisionEnabled() {
      return !(window.StatiskicksEventMap?.paint.gridViews || ['zone_plot', 'control']).includes(this.state.view);
    }

    focusActive() {
      return this.state.focus.length > 0 && this.divisionEnabled();
    }

    selectDivision(division) {
      const paint = window.StatiskicksEventMap?.paint;
      if (!paint?.divisionKeys.includes(division) || division === this.state.division) return;
      this.state.division = division;
      // A third and a zone are different cells: a focus doesn't carry over.
      this.state.focus = [];
      this.syncFocus();
      this.scheduleRender();
    }

    setFocus(cells) {
      this.state.focus = [...cells].sort((a, b) => a - b);
      this.syncFocus();
      this.scheduleRender();
    }

    focusAt(event, card) {
      const paint = window.StatiskicksEventMap?.paint;
      const metrics = card && this.metrics.get(card.dataset.mapTeam);
      if (!paint || !metrics || !this.divisionEnabled()) return;
      const canvas = card.querySelector('[data-map-canvas]');
      const rect = canvas.getBoundingClientRect();
      const x = (((event.clientX - rect.left) * (canvas.width / rect.width) - metrics.px(0)) / metrics.pw) * 100;
      const y = (((event.clientY - rect.top) * (canvas.height / rect.height) - metrics.py(0)) / metrics.ph) * 100;
      if (x < 0 || x > 100 || y < 0 || y > 100) return;
      const cell = paint.divisionCell(this.state.division, x, y);
      const focused = this.state.focus.includes(cell);
      if (this.state.division === 'thirds') this.setFocus(focused ? [] : [cell]);
      else this.setFocus(focused ? this.state.focus.filter(other => other !== cell) : [...this.state.focus, cell]);
    }

    /*
      Whether the chosen event has a failed result to hide: the two results
      the event map's toggle offers, on a chart that draws each event. A grid
      counts every result on the server, and a heatmap is built from bins.
    */
    missesToggleable() {
      return (this.event()?.outcomes || []).length === 2 && this.state.view === 'scatterplot';
    }

    /* A point's result, read off the field its colour comes from (event-map.js pointOutcome()). */
    isMiss(point) {
      const color = this.event()?.color;
      if (color === 'goal') return !point.goal;
      if (color === 'accurate') return point.accurate === false;
      return point.success === false;
    }

    /* Whether an event (or a heat bin's centre) is in the focus; everything is without one. */
    inFocus(x, y) {
      if (!this.focusActive()) return true;
      return this.state.focus.includes(window.StatiskicksEventMap.paint.divisionCell(this.state.division, x, y));
    }

    focusLabel() {
      return this.focusActive() ? window.StatiskicksEventMap?.paint.focusLabel(this.state.division, this.state.focus) : '';
    }

    syncFocus() {
      const enabled = this.divisionEnabled();
      const active = this.focusActive();
      const divisions = this.root.querySelector('[data-maps-divisions]');
      if (divisions) divisions.hidden = !enabled;
      this.root.querySelectorAll('[data-maps-division]').forEach(button => {
        const selected = button.dataset.mapsDivision === this.state.division;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      const wrap = this.root.querySelector('[data-maps-focus]');
      if (wrap) wrap.hidden = !enabled;
      const clear = this.root.querySelector('[data-maps-focus-clear]');
      if (clear) clear.hidden = !active;
      const label = this.root.querySelector('[data-maps-focus-label]');
      if (label) label.textContent = this.focusLabel();
      this.cards.forEach(card => card.querySelector('[data-map-canvas]').classList.toggle('league-maps__canvas--focusable', enabled));
    }

    modeButton(label, active, data) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `chart-toggle-btn${active ? ' active' : ''}`;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      Object.assign(button.dataset, data);
      button.textContent = label;
      return button;
    }

    applyVisibility() {
      let shown = 0;
      this.cards.forEach((card, id) => {
        const hidden = this.hidden.has(id);
        card.hidden = hidden;
        if (!hidden) shown++;
      });

      // A conference's heading goes with its last team.
      this.root.querySelectorAll('[data-maps-group]').forEach(heading => {
        const group = heading.dataset.mapsGroup;
        heading.hidden = !Array.from(this.cards.values()).some(card => card.dataset.mapGroup === group && !card.hidden);
      });

      this.root.querySelectorAll('[data-maps-team-toggle]').forEach(toggle => {
        const on = !this.hidden.has(toggle.dataset.mapsTeamToggle);
        toggle.setAttribute('aria-checked', on ? 'true' : 'false');
        toggle.classList.toggle('selected', on);
      });

      const total = this.teams.length;
      const label = this.root.querySelector('[data-maps-teams-label]');
      if (label) label.textContent = shown === total ? 'Todos los equipos' : `${shown} de ${total} equipos`;
      this.root.querySelector('[data-maps-teams-pill]')?.classList.toggle('active', shown !== total);
      const count = this.root.querySelector('[data-maps-visible]');
      if (count) count.textContent = String(shown);
      const none = this.root.querySelector('[data-maps-none]');
      if (none) none.hidden = shown > 0;
      this.syncDownload();

      // A team shown again has a box now: draw it.
      this.scheduleRender();
    }

    async load() {
      const token = ++this.token;
      this.payloads.clear();
      this.syncDownload();
      this.fields.clear();
      this.cards.forEach(card => this.setCardState(card, 'loading'));
      this.renderLegend();

      const order = [
        ...this.teams.filter(team => !this.hidden.has(team.id)),
        ...this.teams.filter(team => this.hidden.has(team.id)),
      ];
      this.setProgress(0, order.length);

      const component = await this.whenComponent(token);
      if (!component) {
        if (token === this.token) this.cards.forEach(card => this.setCardState(card, 'empty', 'No se pudo cargar el mapa.'));
        return;
      }

      for (let index = 0; index < order.length; index++) {
        if (token !== this.token || !this.root.isConnected) return;

        const { event, view, variant, stage } = this.state;
        let payload;
        try {
          payload = await component.call('loadLeagueMap', order[index].id, event, view, variant, stage, this.side());
        } catch {
          payload = null;
        }
        if (token !== this.token) return;

        this.payloads.set(order[index].id, payload || { error: true });
        this.setProgress(index + 1, order.length);
        this.syncDownload();
        this.renderLegend();
        this.scheduleRender();
      }
    }

    setProgress(done, total) {
      const progress = this.root.querySelector('[data-maps-progress]');
      if (!progress) return;
      progress.hidden = done >= total;
      progress.textContent = `· cargando ${done + 1} de ${total}`;
    }

    setCardState(card, state, message = '') {
      card.querySelector('[data-map-loading]').hidden = state !== 'loading';
      const empty = card.querySelector('[data-map-empty]');
      empty.hidden = state !== 'empty';
      empty.textContent = message;
      card.classList.toggle('league-maps__card--loading', state === 'loading');
      if (state === 'loading') {
        card.querySelector('[data-map-meta]').textContent = '\u00a0'; // keeps the line, so the card does not jump
        const canvas = card.querySelector('[data-map-canvas]');
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    scheduleRender() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.render();
      });
    }

    /* Every team on show that has its map. */
    render() {
      const paint = window.StatiskicksEventMap?.paint;
      if (!paint || !this.root.isConnected) return;

      this.teams
        .filter(team => !this.hidden.has(team.id) && this.payloads.has(team.id))
        .forEach(team => {
          const card = this.cards.get(team.id);
          const frame = this.frameFor(card, paint);
          if (frame) this.paintCard(card, team, this.payloads.get(team.id), frame, paint);
        });

      // A focus, a period or a map arrived: the metric's order may move.
      this.applyOrder();
    }

    syncSort() {
      this.root.querySelectorAll('[data-maps-sort]').forEach(button => {
        const selected = button.dataset.mapsSort === this.state.sort;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
    }

    /*
      The share of a team's events in the focused third or zones, 0-1 (1
      without a focus): of its heat's weight on a heatmap, of its points
      otherwise - what the map itself draws there. A share rather than a
      count, so the line keeps the payload's own unit and a list the server
      trimmed still reads right (beta-final-changes fase 5, L3).
    */
    focusShare(payload) {
      if (!this.focusActive() || !this.divisionEnabled()) return 1;
      const paint = window.StatiskicksEventMap?.paint;
      const heat = payload.viewKey === 'heatmap' && (payload.weighted || 0) >= (paint?.minHeatmapPoints ?? Infinity) ? payload.heat || [] : null;
      if (heat) {
        const weight = bins => bins.reduce((sum, [, , value]) => sum + (Number(value) || 0), 0);
        const all = weight(heat);
        return all > 0 ? weight(heat.filter(([x, y]) => this.inFocus(x, y))) / all : 0;
      }
      const points = payload.points || [];
      return points.length ? points.filter(point => this.inFocus(point.x, point.y)).length / points.length : 0;
    }

    /* A team's per match on the event, in the focus when there is one: the line under its name and the metric's order. */
    perMatch(payload) {
      return (Number(payload?.per_match) || 0) * this.focusShare(payload);
    }

    /* What the metric's order ranks a team by: the zones it controls on that map, else its per match. */
    sortValue(team) {
      const payload = this.payloads.get(team.id);
      if (!payload || payload.error || !payload.matches) return -1;
      if (payload.viewKey === 'control') return Number(payload.control?.controlled) || 0;
      return this.perMatch(payload);
    }

    /*
      The cards' order (fase 5, L3): the table's, or highest first on the
      metric, each group of a split league kept together under its heading.
      Applied with CSS order once every team on show has its map, so cards
      do not jump while they load; ties keep the table's order.
    */
    applyOrder() {
      const shown = this.teams.filter(team => !this.hidden.has(team.id));
      const ready = this.state.sort === 'metric' && shown.every(team => this.payloads.has(team.id));
      const groups = [...new Set(this.teams.map(team => team.group || ''))];
      const ranked = ready
        ? [...this.teams].sort((a, b) => this.sortValue(b) - this.sortValue(a) || Number(a.rank) - Number(b.rank))
        : this.teams;
      const place = new Map();

      groups.forEach((group, index) => {
        ranked.filter(team => (team.group || '') === group).forEach((team, at) => place.set(team.id, index * 1000 + 1 + at));
      });

      this.cards.forEach((card, id) => { card.style.order = ready ? String(place.get(id)) : ''; });
      this.root.querySelectorAll('[data-maps-group]').forEach(heading => {
        heading.style.order = ready ? String(groups.indexOf(heading.dataset.mapsGroup) * 1000) : '';
      });
      this.ordered = ranked.map(team => team.id);
    }

    /* The cards in the order they show (applyOrder()), for the download's arrangements. */
    orderedCards() {
      return (this.ordered || this.teams.map(team => team.id)).map(id => this.cards.get(id)).filter(Boolean);
    }

    /* The canvas sized to its box, and the pitch drawn on it; null while it has no box (hidden). */
    frameFor(card, paint) {
      const canvas = card.querySelector('[data-map-canvas]');
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext('2d');
      const metrics = paint.pitch(ctx, width, height);
      this.metrics.set(card.dataset.mapTeam, metrics);
      return { canvas, ctx, metrics, dpr };
    }

    /*
      A team's density at its canvas's size, as event-map.js heatLayer()
      builds it (CSS-pixel resolution, projected on the pitch), kept until the
      payload or the size changes. Null when the map is not a heatmap or has
      too few events for one.
    */
    heatField(teamId, payload, frame, paint) {
      if (payload?.viewKey !== 'heatmap' || !window.StatiskicksHeatmap || (payload.weighted || 0) < paint.minHeatmapPoints) return null;
      const { metrics, dpr } = frame;
      const focus = this.focusActive() ? `${this.state.division}:${this.state.focus.join(',')}` : '';
      const kept = this.fields.get(teamId);
      if (kept && kept.payload === payload && kept.focus === focus && kept.width === metrics.width && kept.height === metrics.height) return kept.field;

      const scale = 1 / dpr;
      const width = Math.max(1, Math.round(metrics.width * scale));
      const height = Math.max(1, Math.round(metrics.height * scale));
      const field = window.StatiskicksHeatmap.density(
        // The bins fall on the cells' edges, so a focus keeps whole bins.
        (payload.heat || []).filter(([x, y]) => this.inFocus(x, y)).map(([x, y, weight]) => ({ x, y, weight })),
        {
          width,
          height,
          shortSide: Math.min(metrics.pw, metrics.ph) * scale,
          project: (x, y) => [metrics.px(x) * scale, metrics.py(y) * scale],
        },
      );
      this.fields.set(teamId, { payload, focus, width: metrics.width, height: metrics.height, field });
      return field;
    }

    paintCard(card, team, payload, frame, paint) {
      const { ctx, metrics } = frame;
      const meta = card.querySelector('[data-map-meta]');

      if (!payload || payload.error) {
        this.setCardState(card, 'empty', 'No se pudo cargar el mapa.');
        paint.pitch(ctx, metrics.width, metrics.height);
        return;
      }

      const control = payload.viewKey === 'control' ? payload.control : null;
      meta.textContent = !payload.matches ? '\u00a0'
        : control ? `${payload.matches} PJ · ${control.controlled} controladas · ${control.conceded} cedidas`
          // In the focused third or zones when there is one (fase 5, L3).
          : `${payload.matches} PJ · ${decimal(this.perMatch(payload))} por partido`;

      if (!payload.matches) {
        this.setCardState(card, 'empty', 'Sin partidos en este periodo.');
        return;
      }
      if (!payload.total || (payload.viewKey === 'control' && !control)) {
        this.setCardState(card, 'empty', 'Sin eventos de este tipo.');
        return;
      }
      this.setCardState(card, 'ready');

      if (control) {
        // The team page's zones of control, a share on one scale for every team; the shares only where they fit.
        const roomy = metrics.ph / (control.rows || 4) >= 22 * frame.dpr && metrics.pw / (control.cols || 6) >= 26 * frame.dpr;
        paint.control(ctx, metrics, control, { labels: roomy, fontSize: 10 });
        return;
      }

      if (this.divisionEnabled()) {
        paint.divisions(ctx, metrics, this.state.division);
        if (this.focusActive()) paint.focus(ctx, metrics, this.state.division, this.state.focus);
      }

      if (payload.viewKey === 'zone_plot') {
        // The team page's zones: its own busiest zone at full colour, each
        // cell's count and success rate — only where the cell has room.
        const roomy = metrics.ph / 6 >= 22 * frame.dpr;
        paint.zones(ctx, metrics, payload.zones || [], { label: roomy ? null : () => '', fontSize: 10 });
        return;
      }

      const nothingHere = () => this.setCardState(card, 'empty', this.state.division === 'thirds'
        ? 'Ningún evento en este tercio.'
        : (this.state.focus.length > 1 ? 'Ningún evento en estas zonas.' : 'Ningún evento en esta zona.'));

      if (payload.viewKey === 'heatmap' && (payload.weighted || 0) >= paint.minHeatmapPoints) {
        const field = this.heatField(team.id, payload, frame, paint);
        if (field) this.paintHeat(ctx, metrics, field, field.reference);
        else if (this.focusActive()) nothingHere();
        return;
      }

      // Where the action happened: a pass is its passer's, wherever it ends.
      const hideMisses = this.missesToggleable() && !this.state.misses;
      const points = (payload.points || []).filter(point => this.inFocus(point.x, point.y) && !(hideMisses && this.isMiss(point)));
      if (!points.length && this.focusActive()) {
        nothingHere();
        return;
      }
      if (!points.length && hideMisses && (payload.points || []).length) {
        this.setCardState(card, 'empty', `No hay eventos «${this.event().outcomes[0].label}».`);
        return;
      }
      paint.scatter(ctx, metrics, points, payload);
    }

    /* As event-map.js drawHeatmap(): the colours composited onto the pitch, inside its lines. */
    paintHeat(ctx, metrics, field, reference) {
      const image = window.StatiskicksHeatmap.colorize(field, reference);
      const layer = document.createElement('canvas');
      layer.width = field.width;
      layer.height = field.height;
      layer.getContext('2d').putImageData(image, 0, 0);
      const dark = window.StatiskicksHeatmap.isDark();
      ctx.save();
      ctx.beginPath();
      ctx.rect(metrics.px(0), metrics.py(0), metrics.pw, metrics.ph);
      ctx.clip();
      ctx.globalCompositeOperation = dark ? 'screen' : 'multiply';
      ctx.globalAlpha = dark ? .95 : 1;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(layer, 0, 0, metrics.width, metrics.height);
      ctx.restore();
    }

    /* One legend for all the maps, in the event map's own legend markup. */
    renderLegend() {
      const legend = this.root.querySelector('[data-maps-legend]');
      const paint = window.StatiskicksEventMap?.paint;
      if (!legend || !paint) return;
      const sample = Array.from(this.payloads.values()).find(payload => payload && !payload.error && payload.total);
      const items = [];
      const view = this.state.view;

      if (view === 'heatmap' && window.StatiskicksHeatmap) {
        // The team page's wording (event-map.js heatLegendLabel()). A team
        // with a match short of xG counts its shots there, as its page does.
        const loaded = Array.from(this.payloads.values()).filter(payload => payload && !payload.error && payload.total);
        const shots = loaded.filter(payload => payload.kind === 'shot');
        const what = sample?.kind === 'xt' ? 'xT generado'
          : sample?.kind !== 'shot' ? 'eventos'
            : shots.every(payload => payload.summary?.xg_reliable) ? 'xG'
              : shots.some(payload => payload.summary?.xg_reliable) ? 'xG (más tiros, donde falta el xG de algún partido)'
                : 'tiros';
        items.push({ ramp: true, label: `Más intenso = más ${what} · cada mapa en su propia escala` });
      } else if (view === 'zone_plot') {
        const rated = Array.from(this.payloads.values()).some(payload => (payload?.zones || []).some(zone => zone.success_rate !== null && zone.success_rate !== undefined));
        items.push({ zone: true, label: `Cada zona: eventos${rated ? ' / % de éxito' : ''} · cada mapa en su propia escala` });
      } else if (sample) {
        (sample.legend || []).forEach(item => items.push(item));
        if (Array.from(this.payloads.values()).some(payload => payload?.sampled)) {
          items.push({ label: 'Con muchos eventos, cada mapa muestra una muestra' });
        }
      }

      const ink = paint.ink();
      // The failed result's item is the switch that shows or hides it.
      const toggle = this.missesToggleable();
      legend.replaceChildren(...items.map(item => {
        const misses = toggle && item.swatch === 'secondary';
        const row = document.createElement(misses ? 'button' : 'span');
        row.className = 'sk-event-map__legend-item';
        if (misses) {
          row.type = 'button';
          row.className += ' league-maps__legend-toggle';
          row.dataset.mapsMisses = '';
          row.setAttribute('aria-pressed', this.state.misses ? 'true' : 'false');
          const missed = this.event().outcomes[1].label.toLowerCase();
          row.title = this.state.misses ? `Ocultar ${missed}` : `Mostrar ${missed}`;
          row.classList.toggle('sk-event-map__legend-item--muted', !this.state.misses);
        }
        if (item.ramp || item.zone || item.swatch) {
          const swatch = document.createElement('span');
          swatch.className = 'sk-event-map__legend-swatch'
            + (item.ramp ? ' sk-event-map__legend-swatch--ramp' : '')
            + (item.swatch === 'size' ? ' sk-event-map__legend-swatch--size' : '');
          if (item.ramp) swatch.style.background = window.StatiskicksHeatmap.cssGradient();
          else if (item.zone) swatch.style.background = 'rgba(130,196,90,.62)';
          else if (item.swatch !== 'size') swatch.style.background = paint.swatchColor(ink, item.swatch);
          row.appendChild(swatch);
        }
        row.appendChild(document.createTextNode(item.label));
        if (misses) {
          const eye = document.createElement('i');
          eye.className = `bi ${this.state.misses ? 'bi-eye' : 'bi-eye-slash'}`;
          eye.setAttribute('aria-hidden', 'true');
          row.appendChild(eye);
        }
        return row;
      }));
      legend.hidden = items.length === 0;
    }

    /* The download waits for every map on show, and needs one to show. */
    syncDownload() {
      const button = this.root.querySelector('[data-maps-download]');
      if (!button) return;
      const shown = this.teams.filter(team => !this.hidden.has(team.id));
      const ready = shown.length > 0 && shown.every(team => this.payloads.has(team.id));
      button.disabled = !ready;
      button.title = ready ? 'Descargar los mapas visibles' : (shown.length ? 'Espera a que carguen los mapas' : 'No hay mapas visibles');
    }

    /* What the maps show, for the image's subtitle: event, chart, variant and period. */
    selectionLabel() {
      const event = this.event();
      const variant = (event?.variants || []).find(option => option.key === this.state.variant && option.key !== 'all');
      const stage = this.root.querySelector('[data-maps-label="stage"]')?.textContent.trim()
        || this.root.querySelector('[data-maps-option="stage"].selected')?.dataset.label
        || 'Toda la temporada';
      return [
        this.root.querySelector('[data-maps-label="event"]')?.textContent.trim() || event?.label,
        this.side() === 'against' ? 'En contra' : null,
        this.viewLabels[this.state.view],
        variant?.label,
        stage,
        this.focusLabel(),
      ].filter(Boolean).join(' · ');
    }

    /*
      Every map on show in one image, as the page lays them out: a heading
      with the league, season and what the maps show, the legend, then each
      card where it sits in the grid — its place, team, matches and pitch. On
      the page's background, at the scale the charts' download menu asks for
      (chart-download.js, SK-18: twice the CSS size for "Tamaño original"),
      so it reads like any other chart the app exports. It paints its own
      heading, so the menu's frame only adds the brand.
    */
    exportSource() {
      // A map that arrived this frame is painted before it is copied.
      if (this.frame) {
        cancelAnimationFrame(this.frame);
        this.frame = null;
        this.render();
      }

      const grid = this.root.querySelector('.league-maps__grid');
      // In the order they show: the metric's when it is picked (fase 5, L3).
      const cards = this.orderedCards().filter(card => !card.hidden);
      if (!grid || !cards.length) return null;

      const styles = getComputedStyle(document.documentElement);
      const css = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
      const gridRect = grid.getBoundingClientRect();
      const headings = Array.from(this.root.querySelectorAll('[data-maps-group]')).filter(heading => !heading.hidden);
      const placed = [...headings, ...cards].map(el => ({ el, rect: el.getBoundingClientRect() }));
      const pad = 24;
      const header = 76;
      const width = Math.round(Math.max(...placed.map(({ rect }) => rect.right - gridRect.left))) + pad * 2;
      const height = Math.round(Math.max(...placed.map(({ rect }) => rect.bottom - gridRect.top))) + header + pad * 2;
      const background = css('--bg', '#FFFFFF');
      const selection = this.selectionLabel();
      const pageOrigin = { x: pad - gridRect.left, y: pad + header - gridRect.top };
      const onPage = { width, height, placed: placed.map(item => ({ ...item, origin: pageOrigin })) };

      /*
        The cards rearranged for a preset (Fase 6): the number of columns
        that lets them fill its shape most, each card moved there whole (its
        texts and pitch with it). A league split into groups keeps the
        page's order, its headings in place.
      */
      const arranged = box => {
        if (headings.length || cards.length < 2) return null;
        const rects = cards.map(card => card.getBoundingClientRect());
        const cw = rects[0].width;
        const ch = rects[0].height;
        const beside = rects.find(rect => Math.abs(rect.top - rects[0].top) < 1 && rect.left > rects[0].right);
        const gap = beside ? beside.left - rects[0].right : 16;
        let best = null;

        for (let columns = 1; columns <= cards.length; columns++) {
          const rows = Math.ceil(cards.length / columns);
          const w = columns * cw + (columns - 1) * gap + pad * 2;
          const h = header + rows * ch + (rows - 1) * gap + pad * 2;
          const fit = Math.min(box.width / w, box.height / h);
          if (!best || fit > best.fit) best = { columns, w, h, fit };
        }

        return {
          width: Math.round(best.w),
          height: Math.round(best.h),
          placed: cards.map((el, index) => {
            const rect = rects[index];
            const x = pad + (index % best.columns) * (cw + gap);
            const y = pad + header + Math.floor(index / best.columns) * (ch + gap);
            return { el, rect, origin: { x: x - rect.left, y: y - rect.top } };
          }),
        };
      };

      const paint = async (scale, layout) => {
        const { width, height } = layout;
        const output = document.createElement('canvas');
        output.width = Math.max(1, Math.round(width * scale));
        output.height = Math.max(1, Math.round(height * scale));
        const ctx = output.getContext('2d');
        ctx.scale(scale, scale);
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);

        const font = getComputedStyle(this.root).fontFamily || 'system-ui, sans-serif';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = css('--text', '#101511');
        ctx.font = `800 18px ${font}`;
        ctx.fillText(this.title || 'Mapas', pad, pad + 16);
        ctx.fillStyle = css('--text-secondary', '#414B44');
        ctx.font = `600 13px ${font}`;
        ctx.fillText(selection, pad, pad + 38);
        this.paintLegend(ctx, pad, pad + 58, width - pad * 2, font, css);

        layout.placed.forEach(({ el, rect, origin }) => {
          if (el.matches('[data-maps-group]')) this.paintText(ctx, el, origin);
          else this.paintCardImage(ctx, el, rect, origin, css);
        });

        return output;
      };

      return {
        width,
        height,
        nativeScale: Math.max(2, window.devicePixelRatio || 1),
        name: `mapas ${this.title} ${selection}`,
        titled: true,
        surface: background,
        render: scale => paint(scale, onPage),
        // At the scale that fills the preset's room: its heading grows with it.
        renderInto: (box, scale) => {
          const layout = arranged(box) || onPage;
          return paint(scale * Math.min(box.width / layout.width, box.height / layout.height), layout);
        },
      };
    }

    /* A card as the page draws it: its surface and border, its texts, its pitch and any note over it. */
    paintCardImage(ctx, card, rect, origin, css) {
      const style = getComputedStyle(card);
      const x = origin.x + rect.left;
      const y = origin.y + rect.top;
      const radius = parseFloat(style.borderTopLeftRadius) || 8;
      const background = style.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor)
        ? style.backgroundColor
        : css('--bg-card', '#ffffff');

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, rect.width, rect.height, radius);
      ctx.fillStyle = background;
      ctx.fill();
      if (style.borderTopStyle !== 'none' && parseFloat(style.borderTopWidth) > 0) {
        ctx.strokeStyle = style.borderTopColor;
        ctx.lineWidth = parseFloat(style.borderTopWidth);
        ctx.stroke();
      } else if (window.StatiskicksHeatmap?.isDark()) {
        // The dark theme's card: a green-washed foot and a gradient rim, painted by CSS backgrounds.
        const wash = ctx.createLinearGradient(0, y, 0, y + rect.height);
        wash.addColorStop(0.4, 'rgba(0, 0, 0, 0)');
        wash.addColorStop(1, 'rgba(29, 102, 93, 0.25)');
        ctx.fillStyle = wash;
        ctx.fill();
        const rim = ctx.createLinearGradient(0, y, 0, y + rect.height);
        rim.addColorStop(0, 'rgba(178, 217, 139, 0.28)');
        rim.addColorStop(1, 'rgba(29, 102, 93, 0.35)');
        ctx.strokeStyle = rim;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      card.querySelectorAll('.league-maps__rank, .league-maps__team, [data-map-meta]').forEach(el => this.paintText(ctx, el, origin));

      const canvas = card.querySelector('[data-map-canvas]');
      const box = canvas.getBoundingClientRect();
      if (canvas.width && canvas.height) ctx.drawImage(canvas, origin.x + box.left, origin.y + box.top, box.width, box.height);

      const empty = card.querySelector('[data-map-empty]');
      if (empty && !empty.hidden && empty.textContent.trim()) {
        ctx.save();
        ctx.textAlign = 'center';
        this.paintText(ctx, empty, origin, { x: origin.x + box.left + box.width / 2, width: box.width - 16 });
        ctx.restore();
      }
    }

    /* An element's text where it sits, in its own font and colour, cut to its width. */
    paintText(ctx, el, origin, place = null) {
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (!text) return;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      ctx.save();
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      ctx.fillStyle = style.color;
      ctx.textBaseline = 'middle';
      const maxWidth = place?.width ?? rect.width;
      let shown = text;
      while (shown.length > 1 && ctx.measureText(shown).width > maxWidth) shown = `${shown.slice(0, -2)}…`;
      if (el.matches('.league-maps__group')) shown = shown.toUpperCase();
      ctx.fillText(shown, place?.x ?? origin.x + rect.left, origin.y + rect.top + rect.height / 2);
      ctx.restore();
    }

    /* The legend's items in a row: each swatch (the heat ramp, a zone, a mark colour) and its text. */
    paintLegend(ctx, x, y, maxWidth, font, css) {
      // A failed result switched off is not on the maps, so not in the image's legend.
      const items = Array.from(this.root.querySelectorAll('[data-maps-legend] .sk-event-map__legend-item'))
        .filter(item => !item.matches('[data-maps-misses][aria-pressed="false"]'));
      ctx.save();
      ctx.font = `400 12px ${font}`;
      ctx.textBaseline = 'middle';
      let left = x;
      items.forEach(item => {
        const swatch = item.querySelector('.sk-event-map__legend-swatch');
        if (swatch) {
          const box = swatch.getBoundingClientRect();
          const w = Math.max(10, box.width);
          const h = Math.max(8, box.height);
          const background = getComputedStyle(swatch).backgroundImage;
          const stops = background && background !== 'none'
            ? Array.from(background.matchAll(/rgba?\([^)]+\)\s+[\d.]+%/g)).map(match => match[0])
            : [];
          if (stops.length > 1) {
            const gradient = ctx.createLinearGradient(left, 0, left + w, 0);
            stops.forEach(stop => {
              const [, colour, at] = stop.match(/(rgba?\([^)]+\))\s+([\d.]+)%/);
              gradient.addColorStop(Math.min(1, Number(at) / 100), colour);
            });
            ctx.fillStyle = gradient;
          } else {
            ctx.fillStyle = getComputedStyle(swatch).backgroundColor;
          }
          ctx.beginPath();
          ctx.roundRect(left, y - h / 2, w, h, Math.min(h / 2, 6));
          ctx.fill();
          left += w + 6;
        }
        ctx.fillStyle = css('--text-muted', '#6E7A6F');
        const text = item.textContent.trim();
        if (left + ctx.measureText(text).width > x + maxWidth) return;
        ctx.fillText(text, left, y);
        left += ctx.measureText(text).width + 16;
      });
      ctx.restore();
    }

    /* A size or theme change: the densities are rebuilt at the new size, the colours repainted. */
    redraw({ sized = false } = {}) {
      if (sized) this.fields.clear();
      this.renderLegend();
      this.scheduleRender();
    }
  }

  function boot() {
    document.querySelectorAll('[data-league-maps]').forEach(root => {
      if (!Array.from(controllers).some(controller => controller.root === root)) controllers.add(new LeagueMaps(root));
    });
    controllers.forEach(controller => {
      if (!controller.root.isConnected) {
        controller.destroy();
        controllers.delete(controller);
      }
    });
  }

  window.StatiskicksLeagueMaps = { boot };

  // The Mapas button's picture for the download menu: the composite above.
  (window.SkChartDownloadSources = window.SkChartDownloadSources || {})['league-maps'] = button => {
    const root = button.closest('[data-league-maps]');
    const controller = Array.from(controllers).find(candidate => candidate.root === root);
    return controller ? controller.exportSource() : null;
  };

  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('livewire:navigated', boot);
  document.addEventListener('livewire:init', () => {
    if (window.Livewire?.hook) window.Livewire.hook('morph.updated', () => requestAnimationFrame(boot));
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => controllers.forEach(controller => controller.redraw({ sized: true })), 120);
  });

  new MutationObserver(() => controllers.forEach(controller => controller.redraw()))
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  boot();
})();
