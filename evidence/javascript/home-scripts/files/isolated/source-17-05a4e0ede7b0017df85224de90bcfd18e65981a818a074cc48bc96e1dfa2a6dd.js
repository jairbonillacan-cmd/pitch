(function () {
  'use strict';

  if (window.StatiskicksLeagueScatter) return;

  /*
    The league page's Dispersión tab (SK-02.5): every player or every team of
    the season on two attributes, drawn as an SVG.

    The points arrive from LeagueDetail::loadScatter() whenever the population
    or an axis changes. Everything else happens here, over the points already
    held: the filters, the mean of each axis, the trend line (least squares,
    with its r), and the names — none until the reader asks for one, by
    clicking a point, dragging a box over an area or searching for it.

    Teams are drawn with their crests. Each crest is fetched once and kept as
    a data URL (the image host allows CORS), so the page's chart download
    (chart-download.js), which rasterizes the SVG on its own, keeps them.
  */

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const LABEL_FONT = '600 11px Inter, system-ui, sans-serif';
  const LABEL_HEIGHT = 13;
  const HIT_RADIUS = 24;
  const DRAG_THRESHOLD = 5;
  const DOT_RADIUS = 7;
  const CREST_SIZE = 28;
  const MARGIN = { top: 44, right: 24, bottom: 54, left: 64 };
  const DEFAULT_MIN_MINUTES = 450;
  /*
    A change of chart is a transition, not a cut: each point travels from
    where it was to where it now is, a point the change brings in fades in, a
    point it takes out fades out where it stood, and the grid, the lines and
    the names cross-fade once the points have mostly arrived. The league
    page's own easing (league-detail.css, the tab entrance).
  */
  const MOVE_MS = 650;
  const FADE_MS = 380;
  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const AGE_FLOOR = 15;
  const AGE_CEILING = 40;
  /* The one unit both axes are read in; a percentage or ratio keeps its own. */
  const UNIT_CHOICES = { players: ['p90', 'total'], teams: ['per_match', 'total'] };

  const controllers = new Set();
  /* Crest URL → data URL (or null when it could not be read), shared by every chart. */
  const crests = new Map();
  let uid = 0;

  function parseJson(value, fallback) {
    try {
      return JSON.parse(value || '');
    } catch {
      return fallback;
    }
  }

  const formatters = new Map();

  function number(value, digits) {
    const key = digits;
    if (!formatters.has(key)) {
      formatters.set(key, new Intl.NumberFormat('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
    }
    return formatters.get(key).format(value);
  }

  /* A value as its unit reads: a percentage with one decimal, a whole total as is, a rate with two. */
  function formatValue(value, unit) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    if (unit === 'percent') return `${number(value, 1)} %`;
    if (unit === 'total' && Number.isInteger(value)) return number(value, 0);
    return number(value, 2);
  }

  /* Accents and case aside, so "atletico" finds "Atlético". */
  function fold(text) {
    return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function initials(name) {
    return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  }

  function make(tag, attrs = {}, parent = null) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== null && value !== undefined) node.setAttribute(key, value);
    });
    if (parent) parent.appendChild(node);
    return node;
  }

  /* 1, 2, 2.5 or 5 times a power of ten, the nearest to the raw step: the one a person would pick. */
  function niceStep(raw) {
    const exponent = Math.floor(Math.log10(raw));
    const fraction = raw / 10 ** exponent;
    const nice = fraction < 1.5 ? 1 : fraction < 2.25 ? 2 : fraction < 3.5 ? 2.5 : fraction < 7.5 ? 5 : 10;
    return nice * 10 ** exponent;
  }

  function ticks(min, max, count) {
    const step = niceStep((max - min) / Math.max(1, count));
    const values = [];
    for (let value = Math.ceil(min / step - 1e-9) * step; value <= max + step * 1e-9; value += step) {
      values.push(Number(value.toFixed(10)) || 0);
    }
    const decimals = String(Number(step.toFixed(6))).split('.')[1]?.length || 0;
    return { values, digits: Math.min(3, decimals) };
  }

  /* The values' span with a little air, so no point sits on the frame. */
  function domain(values) {
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      const pad = Math.abs(min) * 0.1 || 1;
      return [min - pad, max + pad];
    }
    const pad = (max - min) * 0.06;
    return [min - pad, max + pad];
  }

  function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  /* Least squares: y = a + b·x, and Pearson's r. Null when x does not vary. */
  function regression(points) {
    if (points.length < 3) return null;
    const mx = mean(points.map(point => point.x));
    const my = mean(points.map(point => point.y));
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    points.forEach(point => {
      sxx += (point.x - mx) ** 2;
      sxy += (point.x - mx) * (point.y - my);
      syy += (point.y - my) ** 2;
    });
    if (sxx === 0) return null;
    const slope = sxy / sxx;
    return { slope, intercept: my - slope * mx, r: syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy) };
  }

  function reducedMotion() {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  }

  /* The Web Animations API, so nothing is left in the markup the download copies. */
  function play(element, keyframes, options = {}) {
    if (!element?.animate) return null;
    return element.animate(keyframes, { duration: MOVE_MS, easing: EASE, ...options });
  }

  function fadeIn(element, delay = 0) {
    return play(element, [{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out', delay, fill: 'backwards' });
  }

  function overlap(a, b) {
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return width * height;
  }

  /* Fetched once per crest, for every chart on the page; null when it cannot be read. */
  function crest(url) {
    if (!crests.has(url)) {
      crests.set(url, fetch(url, { mode: 'cors' })
        .then(response => (response.ok ? response.blob() : null))
        .then(blob => blob && new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        }))
        .catch(() => null)
        .then(dataUrl => {
          crests.set(url, dataUrl || null);
          return dataUrl || null;
        }));
    }
    return crests.get(url);
  }

  class LeagueScatter {
    constructor(root) {
      this.root = root;
      this.id = ++uid;
      const bootstrap = parseJson(root.dataset.bootstrap, {});
      const config = bootstrap.config || {};
      this.title = bootstrap.title || '';
      this.populations = config.populations || {};
      this.units = config.units || {};
      // The other tournament of the season, read match by match (SK-02.12):
      // an attribute with no per-match source cannot be an axis.
      this.windowed = !!config.windowed;
      this.attributes = {};
      Object.entries(this.populations).forEach(([population, entry]) => {
        const index = new Map();
        (entry.catalog || []).forEach(group => group.attributes.forEach(attribute => {
          index.set(attribute.key, { ...attribute, category: group.category });
        }));
        this.attributes[population] = index;
      });

      this.state = {
        population: 'players',
        axes: {},
        groups: new Set(),
        team: '',
        ageLow: AGE_FLOOR,
        ageHigh: AGE_CEILING,
        // Null: the default floor (minutesLow) or no ceiling at all (minutesHigh).
        minutesLow: null,
        minutesHigh: null,
        unit: {},
        mean: true,
        trend: false,
      };
      Object.entries(this.populations).forEach(([population, entry]) => {
        const defaults = entry.defaults || {};
        this.state.axes[population] = { x: defaults.x?.[0], y: defaults.y?.[0] };
        this.state.unit[population] = defaults.x?.[1] || UNIT_CHOICES[population]?.[0];
      });
      this.minutesCeiling = 3000;
      this.teams = [];
      this.labelled = { players: new Set(), teams: new Set() };
      this.data = null;
      this.visible = [];
      this.marks = [];
      this.token = 0;
      this.pointer = null;
      this.frame = null;

      const find = selector => root.querySelector(selector);
      this.el = {
        summary: find('[data-scatter-summary]'),
        filters: find('[data-scatter-filters]'),
        teamMenu: find('[data-scatter-menu="team"]'),
        find: find('[data-scatter-find]'),
        findMenu: find('[data-scatter-find-menu]'),
        chart: find('[data-scatter-chart]'),
        svg: find('[data-scatter-svg]'),
        tooltip: find('[data-scatter-tooltip]'),
        loading: find('[data-scatter-loading]'),
        empty: find('[data-scatter-empty]'),
        download: find('[data-scatter-download]'),
        labelled: find('[data-scatter-labelled]'),
        chips: find('[data-scatter-chips]'),
        picker: find('[data-scatter-picker]'),
      };

      this.onClick = event => this.handleClick(event);
      this.onInput = event => this.handleInput(event);
      this.onKeydown = event => this.handleKeydown(event);
      this.onOutside = event => {
        if (!event.target.closest('[data-scatter-menu], [data-scatter-menu-pill]')) this.closeMenus();
        if (!event.target.closest('.league-scatter__find')) this.closeFind();
      };
      this.onPointerDown = event => this.pointerDown(event);
      this.onPointerMove = event => this.pointerMove(event);
      this.onPointerUp = event => this.pointerUp(event);
      this.onPointerLeave = () => {
        if (!this.pointer?.brushing) this.hideHover();
      };

      root.addEventListener('click', this.onClick);
      root.addEventListener('input', this.onInput);
      root.addEventListener('keydown', this.onKeydown);
      document.addEventListener('pointerdown', this.onOutside);
      // Another league picked in the sidebar (league-switcher.js): these settings go with it.
      this.onLeagueSwitch = () => {
        if (this.root.isConnected) window.SkLeagueCarry?.save('scatter', this.carried());
      };
      window.addEventListener('sk:league-switch', this.onLeagueSwitch);
      this.restore(window.SkLeagueCarry?.take('scatter'));
      this.el.svg.addEventListener('pointerdown', this.onPointerDown);
      this.el.svg.addEventListener('pointermove', this.onPointerMove);
      this.el.svg.addEventListener('pointerup', this.onPointerUp);
      this.el.svg.addEventListener('pointerleave', this.onPointerLeave);

      this.width = 0;
      this.resizer = new ResizeObserver(() => {
        const width = this.el.chart.clientWidth;
        if (width && width !== this.width) {
          this.width = width;
          // A new size is a new layout, not a new chart: no transition.
          this.render({ animate: false });
        }
      });
      this.resizer.observe(this.el.chart);

      this.renderControls();
      this.load();
    }

    destroy() {
      this.token++;
      this.root.removeEventListener('click', this.onClick);
      this.root.removeEventListener('input', this.onInput);
      this.root.removeEventListener('keydown', this.onKeydown);
      document.removeEventListener('pointerdown', this.onOutside);
      window.removeEventListener('sk:league-switch', this.onLeagueSwitch);
      this.resizer.disconnect();
    }

    /*
      What carries to another league's Dispersión: the population, axes,
      units, lines and the filters that mean the same in any league — not the
      team, nor a minutes ceiling read off this season's data, nor the labels.
    */
    carried() {
      const { population, axes, unit, groups, ageLow, ageHigh, minutesLow, mean, trend } = this.state;
      return { population, axes, unit, groups: [...groups], ageLow, ageHigh, minutesLow, mean, trend };
    }

    /* The settings carried from another league, where they fit this one's catalog. */
    restore(carried) {
      if (!carried) return;
      if (this.populations[carried.population]) this.state.population = carried.population;
      Object.entries(carried.axes || {}).forEach(([population, axes]) => {
        const index = this.attributes[population];
        if (index?.has(axes?.x) && index.has(axes?.y)) this.state.axes[population] = { x: axes.x, y: axes.y };
      });
      Object.entries(carried.unit || {}).forEach(([population, unit]) => {
        if ((UNIT_CHOICES[population] || []).includes(unit)) this.state.unit[population] = unit;
      });
      const groups = new Set(Array.from(this.root.querySelectorAll('[data-scatter-group]')).map(item => item.dataset.scatterGroup).filter(Boolean));
      this.state.groups = new Set((carried.groups || []).filter(group => groups.has(group)));
      const age = value => Number.isInteger(value) && value >= AGE_FLOOR && value <= AGE_CEILING;
      if (age(carried.ageLow) && age(carried.ageHigh) && carried.ageLow <= carried.ageHigh) {
        this.state.ageLow = carried.ageLow;
        this.state.ageHigh = carried.ageHigh;
      }
      if (carried.minutesLow === null || (Number.isFinite(carried.minutesLow) && carried.minutesLow >= 0)) this.state.minutesLow = carried.minutesLow;
      this.state.mean = Boolean(carried.mean);
      this.state.trend = Boolean(carried.trend);
    }

    component() {
      const host = this.root.closest('[wire\\:id]');
      return host && window.Livewire ? window.Livewire.find(host.getAttribute('wire:id')) || null : null;
    }

    /* As league-maps.js: on a first page load this script runs before Livewire has the component. */
    async whenComponent(token) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const component = this.component();
        if (component || token !== this.token || !this.root.isConnected) return component;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return null;
    }

    get players() {
      return this.state.population === 'players';
    }

    axes() {
      return this.state.axes[this.state.population];
    }

    attribute(key) {
      return this.attributes[this.state.population]?.get(key) || null;
    }

    /* The unit an axis is read in: the chosen one when its attribute has it, else its own. */
    axisUnit(axis) {
      const chosen = this.state.unit[this.state.population];
      const units = this.attribute(this.axes()[axis])?.units || [];
      return units.includes(chosen) || !units.length ? chosen : units[0];
    }

    /* ---------------------------------------------------------------- data */

    async load() {
      const token = ++this.token;
      this.hideHover();
      this.setLoading(true);
      const component = await this.whenComponent(token);
      if (token !== this.token) return;

      const population = this.state.population;
      const { x, y } = this.axes();
      let payload = null;

      if (component) {
        try {
          payload = await component.call('loadScatter', population, x, this.axisUnit('x'), y, this.axisUnit('y'));
        } catch {
          payload = null;
        }
      }
      if (token !== this.token) return;

      this.data = payload ? { ...payload, population } : null;

      if (payload?.status === 'ready') this.prepare();

      this.setLoading(false);
      this.renderControls();
      this.render();
    }

    /* What a new set of points changes besides the chart: the minutes scale, the team list, crests. */
    prepare() {
      const points = this.data.points || [];

      if (this.data.population === 'players') {
        const most = Math.max(0, ...points.map(point => point.minutes));
        this.minutesCeiling = Math.max(10, Math.ceil(most / 10) * 10);
        if (this.state.minutesLow === null) this.state.minutesLow = this.defaultMinutes();
        if (this.state.minutesHigh !== null && this.state.minutesHigh >= this.minutesCeiling) this.state.minutesHigh = null;

        const teams = new Map();
        points.forEach(point => {
          if (point.team_id) teams.set(point.team_id, point.team);
        });
        this.teams = [...teams.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
        if (this.state.team && !teams.has(this.state.team)) this.state.team = '';
        return;
      }

      const token = this.token;
      const pending = points.filter(point => point.image && !crests.has(point.image)).map(point => crest(point.image));
      if (pending.length) {
        Promise.all(pending).then(() => {
          if (token === this.token) this.render();
        });
      }
    }

    /* Five matches, or a third of the most anyone has played while the season is younger than that. */
    defaultMinutes() {
      return Math.min(DEFAULT_MIN_MINUTES, Math.floor(this.minutesCeiling / 3 / 10) * 10);
    }

    ageIsSet() {
      return this.state.ageLow > AGE_FLOOR || this.state.ageHigh < AGE_CEILING;
    }

    filtered() {
      const points = this.data?.points || [];
      if (!this.players) return points;

      const { groups, team, ageLow, ageHigh, minutesHigh } = this.state;
      const minutesLow = this.state.minutesLow || 0;
      const ageSet = this.ageIsSet();

      return points.filter(point => {
        if (point.minutes < minutesLow) return false;
        if (minutesHigh !== null && point.minutes > minutesHigh) return false;
        if (groups.size && !groups.has(point.group)) return false;
        if (team && point.team_id !== team) return false;
        if (ageSet) {
          // As the advanced search: an unknown age is out once age narrows,
          // and the top of the range means "and older".
          if (!Number.isFinite(point.age) || point.age < ageLow) return false;
          if (ageHigh < AGE_CEILING && point.age > ageHigh) return false;
        }
        return true;
      });
    }

    /* ------------------------------------------------------------ controls */

    renderControls() {
      const players = this.players;

      this.root.querySelectorAll('[data-scatter-population]').forEach(button => {
        const active = button.dataset.scatterPopulation === this.state.population;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      const pill = this.root.querySelector('[data-scatter-axes]');
      const names = ['x', 'y'].map(axis => this.attribute(this.axes()[axis])?.label || this.axes()[axis] || 'Atributo');
      ['x', 'y'].forEach((axis, index) => {
        pill.querySelector(`[data-scatter-axis-label="${axis}"]`).textContent = names[index];
      });
      pill.title = `Eje X: ${names[0]} · Eje Y: ${names[1]}`;

      // Disabled while neither axis has a choice of unit (two percentages).
      const adjustable = ['x', 'y'].some(axis => (this.attribute(this.axes()[axis])?.units || []).length > 1);
      this.root.querySelector('[data-scatter-unit-toggle]').replaceChildren(...(UNIT_CHOICES[this.state.population] || []).map(unit => {
        const button = document.createElement('button');
        button.type = 'button';
        const active = unit === this.state.unit[this.state.population];
        button.className = `chart-toggle-btn${active ? ' active' : ''}`;
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.disabled = !adjustable;
        button.dataset.scatterUnit = unit;
        button.textContent = this.units[unit] || unit;
        return button;
      }));

      this.el.filters.hidden = !players;
      this.renderGroupMenu();
      this.renderTeamMenu();
      this.renderRange('age');
      this.renderRange('minutes');

      this.root.querySelectorAll('[data-scatter-line]').forEach(button => {
        const active = Boolean(this.state[button.dataset.scatterLine]);
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      this.el.find.placeholder = players ? 'Etiquetar jugador…' : 'Etiquetar equipo…';
    }

    setPill(name, label, active, title = label) {
      const pill = this.root.querySelector(`[data-scatter-menu-pill="${name}"]`);
      pill.classList.toggle('active', active);
      pill.querySelector(`[data-scatter-pill-label="${name}"]`).textContent = label;
      pill.title = title;
    }

    /* A tick menu row, the advanced search's: the green check before it when picked. */
    tick(button, on) {
      button.classList.toggle('selected', on);
      button.querySelector('.players-multi-menu__check')?.classList.toggle('bi-check-lg', on);
      if (button.getAttribute('role') === 'menuitemcheckbox') button.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    /* Roles, several at once; none ticked is every role. Named as the advanced search names its pills. */
    renderGroupMenu() {
      const picked = [];
      this.root.querySelectorAll('[data-scatter-group]').forEach(button => {
        const key = button.dataset.scatterGroup;
        const on = key === '' ? this.state.groups.size === 0 : this.state.groups.has(key);
        this.tick(button, on);
        if (on && key !== '') picked.push(button.textContent.trim());
      });

      const label = picked.length === 0 ? 'Posiciones' : picked.length === 1 ? picked[0] : `${picked.length} posiciones`;
      this.setPill('groups', label, picked.length > 0, picked.length > 1 ? picked.join(', ') : label);
    }

    /* The Mapas tab's menu: every team of the points, the whole league first. */
    renderTeamMenu() {
      const options = [['', 'Todos los equipos'], ...this.teams];
      this.el.teamMenu.replaceChildren(...options.map(([id, name]) => {
        const item = document.createElement('li');
        item.setAttribute('role', 'presentation');
        const button = document.createElement('button');
        button.type = 'button';
        const selected = id === this.state.team;
        button.className = 'sk-menu-item';
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
        button.dataset.scatterTeamOption = id;
        const check = document.createElement('i');
        check.className = 'bi players-multi-menu__check';
        check.setAttribute('aria-hidden', 'true');
        button.append(check, name);
        this.tick(button, selected);
        item.appendChild(button);
        return item;
      }));

      const team = this.teams.find(([id]) => id === this.state.team);
      this.setPill('team', team ? team[1] : 'Equipos', Boolean(team), team ? team[1] : 'Todos los equipos');
    }

    /* A dual range, the advanced search's: track, fill between the thumbs, the two ends under it. */
    renderRange(name) {
      const range = this.root.querySelector(`[data-scatter-range="${name}"]`);
      const age = name === 'age';
      const floor = age ? AGE_FLOOR : 0;
      const ceiling = age ? AGE_CEILING : this.minutesCeiling;
      const low = age ? this.state.ageLow : (this.state.minutesLow ?? 0);
      const high = age ? this.state.ageHigh : (this.state.minutesHigh ?? ceiling);

      // Not while a thumb is held: either may pass the other, and writing
      // the sorted ends back would snap the held thumb to the other side.
      const held = range.contains(document.activeElement);
      range.querySelectorAll('[data-scatter-range-end]').forEach(input => {
        if (!age) input.max = ceiling;
        if (!held) input.value = input.dataset.scatterRangeEnd === 'min' ? low : high;
      });
      const span = ceiling - floor || 1;
      range.style.setProperty('--range-left', `${((low - floor) / span) * 100}%`);
      range.style.setProperty('--range-width', `${((high - low) / span) * 100}%`);

      const top = age ? `${high}${high >= AGE_CEILING ? '+' : ''}` : number(high, 0);
      this.root.querySelector(`[data-scatter-range-low="${name}"]`).textContent = age ? String(low) : number(low, 0);
      this.root.querySelector(`[data-scatter-range-high="${name}"]`).textContent = top;

      if (age) {
        this.setPill('age', this.ageIsSet() ? `${low}–${top} años` : 'Edad', this.ageIsSet());
        return;
      }
      const set = low > 0 || this.state.minutesHigh !== null;
      const label = !set ? 'Minutos' : this.state.minutesHigh === null ? `≥ ${number(low, 0)} min` : `${number(low, 0)}–${number(high, 0)} min`;
      this.setPill('minutes', label, set);
    }

    menu(name) {
      return this.root.querySelector(`[data-scatter-menu="${name}"]`);
    }

    openMenu(name) {
      this.closeMenus();
      this.menu(name).hidden = false;
      const pill = this.root.querySelector(`[data-scatter-menu-pill="${name}"]`);
      pill.setAttribute('aria-expanded', 'true');
      (this.menu(name).querySelector('.selected') || this.menu(name).querySelector('input, button'))?.focus();
    }

    closeMenus() {
      this.root.querySelectorAll('[data-scatter-menu]').forEach(menu => {
        menu.hidden = true;
      });
      this.root.querySelectorAll('[data-scatter-menu-pill]').forEach(pill => pill.setAttribute('aria-expanded', 'false'));
    }

    /* The player and team pages' "Seleccionar atributos" window, both axes in it. */
    openPicker() {
      const picker = window.Alpine && this.el.picker ? window.Alpine.$data(this.el.picker) : null;
      if (!picker?.openFor) return;

      picker.openFor({
        catalog: this.populations[this.state.population]?.catalog || [],
        windowed: this.windowed,
        axes: { ...this.axes() },
        onDone: axes => this.chooseAxes(axes),
      });
    }

    /* A filter changed: the controls at once, the chart on the next frame (a dragged thumb fires often). */
    refilter() {
      this.renderControls();
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => this.render());
    }

    handleClick(event) {
      const population = event.target.closest('[data-scatter-population]');
      if (population) {
        if (population.dataset.scatterPopulation === this.state.population) return;
        this.state.population = population.dataset.scatterPopulation;
        this.closeFind();
        this.closeMenus();
        this.renderControls();
        this.load();
        return;
      }

      if (event.target.closest('[data-scatter-axes]')) {
        this.openPicker();
        return;
      }

      const unit = event.target.closest('[data-scatter-unit]');
      if (unit) {
        if (this.state.unit[this.state.population] === unit.dataset.scatterUnit) return;
        this.state.unit[this.state.population] = unit.dataset.scatterUnit;
        this.renderControls();
        this.load();
        return;
      }

      if (event.target.closest('[data-scatter-swap]')) {
        const axes = this.axes();
        [axes.x, axes.y] = [axes.y, axes.x];
        this.renderControls();
        this.load();
        return;
      }

      const pill = event.target.closest('[data-scatter-menu-pill]');
      if (pill) {
        const name = pill.dataset.scatterMenuPill;
        if (this.menu(name).hidden) this.openMenu(name);
        else this.closeMenus();
        return;
      }

      const team = event.target.closest('[data-scatter-team-option]');
      if (team) {
        this.state.team = team.dataset.scatterTeamOption;
        this.closeMenus();
        this.root.querySelector('[data-scatter-menu-pill="team"]').focus();
        this.refilter();
        return;
      }

      // The menu stays open: several roles are ticked in a row.
      const group = event.target.closest('[data-scatter-group]');
      if (group) {
        const key = group.dataset.scatterGroup;
        if (key === '') this.state.groups.clear();
        else if (this.state.groups.has(key)) this.state.groups.delete(key);
        else this.state.groups.add(key);
        this.refilter();
        return;
      }

      if (event.target.closest('[data-scatter-reset]')) {
        this.state.groups.clear();
        this.state.team = '';
        this.state.ageLow = AGE_FLOOR;
        this.state.ageHigh = AGE_CEILING;
        this.state.minutesLow = this.defaultMinutes();
        this.state.minutesHigh = null;
        this.closeMenus();
        this.refilter();
        return;
      }

      const line = event.target.closest('[data-scatter-line]');
      if (line) {
        const key = line.dataset.scatterLine;
        this.state[key] = !this.state[key];
        this.renderControls();
        this.render();
        return;
      }

      const match = event.target.closest('[data-scatter-find-option]');
      if (match) {
        this.label(match.dataset.scatterFindOption, true);
        this.el.find.value = '';
        this.closeFind();
        this.el.find.focus();
        return;
      }

      const remove = event.target.closest('[data-scatter-unlabel]');
      if (remove) {
        this.label(remove.dataset.scatterUnlabel, false);
        return;
      }

      if (event.target.closest('[data-scatter-clear]')) {
        this.labelled[this.state.population].clear();
        this.render();
      }
    }

    handleInput(event) {
      const target = event.target;

      if (target === this.el.find) {
        this.renderFind();
        return;
      }

      const range = target.closest('[data-scatter-range]');
      if (range) {
        // Either thumb may pass the other: the lower is the floor, as in the advanced search.
        const [a, b] = Array.from(range.querySelectorAll('[data-scatter-range-end]')).map(input => Number(input.value));
        const low = Math.min(a, b);
        const high = Math.max(a, b);
        if (range.dataset.scatterRange === 'age') {
          this.state.ageLow = low;
          this.state.ageHigh = high;
        } else {
          this.state.minutesLow = low;
          this.state.minutesHigh = high >= this.minutesCeiling ? null : high;
        }
        this.refilter();
      }
    }

    handleKeydown(event) {
      if (event.key === 'Escape') {
        const open = event.target.closest('.league-filterbar__item')?.querySelector('[data-scatter-menu-pill]');
        this.closeMenus();
        this.closeFind();
        open?.focus();
        return;
      }

      const list = event.target.closest('[data-scatter-menu="team"], [data-scatter-menu="groups"], .league-scatter__find');
      if (!list || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;

      const options = Array.from(list.querySelectorAll('[data-scatter-team-option], [data-scatter-group], [data-scatter-find-option]'));
      if (!options.length) return;
      const index = options.indexOf(document.activeElement);

      if (event.key === 'Enter') {
        if (index === -1) {
          event.preventDefault();
          options[0].click();
        }
        return;
      }

      event.preventDefault();
      const next = event.key === 'ArrowDown'
        ? options[Math.min(options.length - 1, index + 1)]
        : index <= 0 ? (list.querySelector('input') || options[0]) : options[index - 1];
      next?.focus();
    }

    /* The window closed: redraw only if an axis changed. */
    chooseAxes(axes) {
      const current = this.axes();
      this.root.querySelector('[data-scatter-axes]').focus();
      if (!axes.x || !axes.y || (axes.x === current.x && axes.y === current.y)) return;

      this.state.axes[this.state.population] = { x: axes.x, y: axes.y };
      this.renderControls();
      this.load();
    }

    /* ------------------------------------------------------------- labels */

    label(id, on) {
      const set = this.labelled[this.state.population];
      if (on) set.add(id);
      else set.delete(id);
      this.render();
    }

    renderFind() {
      const query = fold(this.el.find.value.trim());
      if (!query || this.data?.status !== 'ready') {
        this.closeFind();
        return;
      }

      const labelled = this.labelled[this.state.population];
      const pool = this.visible.length ? this.visible : this.data.points;
      const matches = pool
        .filter(point => !labelled.has(point.id) && (fold(point.name).includes(query) || (point.team && fold(point.team).includes(query))))
        .slice(0, 8);

      const items = matches.map(point => {
        const item = document.createElement('li');
        item.setAttribute('role', 'presentation');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sk-menu-item league-scatter__option';
        button.setAttribute('role', 'option');
        button.dataset.scatterFindOption = point.id;
        const name = document.createElement('strong');
        name.textContent = point.name;
        button.appendChild(name);
        if (point.team) {
          const team = document.createElement('span');
          team.className = 'league-scatter__option-meta';
          team.textContent = ` · ${point.team}`;
          button.appendChild(team);
        }
        item.appendChild(button);
        return item;
      });

      if (!items.length) {
        const none = document.createElement('li');
        none.className = 'league-scatter__menu-none';
        none.textContent = this.players ? 'Ningún jugador coincide.' : 'Ningún equipo coincide.';
        items.push(none);
      }

      this.el.findMenu.replaceChildren(...items);
      this.el.findMenu.hidden = false;
      this.el.find.setAttribute('aria-expanded', 'true');
    }

    closeFind() {
      // Emptied too, so Enter in a closed search never picks a stale match.
      this.el.findMenu.replaceChildren();
      this.el.findMenu.hidden = true;
      this.el.find.setAttribute('aria-expanded', 'false');
    }

    /* Under the chart: whose names are on, each a link to its page and a way to take it off. */
    renderChips() {
      const labelled = this.labelled[this.state.population];
      const points = (this.data?.points || []).filter(point => labelled.has(point.id));
      const shown = new Set(this.visible.map(point => point.id));

      this.el.labelled.hidden = points.length === 0;
      this.el.chips.replaceChildren(...points.map(point => {
        const chip = document.createElement('span');
        chip.className = `league-scatter__chip${shown.has(point.id) ? '' : ' league-scatter__chip--hidden'}`;
        if (!shown.has(point.id)) chip.title = 'Fuera de los filtros actuales';
        const link = document.createElement('a');
        link.href = point.url;
        link.textContent = point.name;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.dataset.scatterUnlabel = point.id;
        remove.setAttribute('aria-label', `Quitar la etiqueta de ${point.name}`);
        remove.innerHTML = '<i class="bi bi-x" aria-hidden="true"></i>';
        chip.append(link, remove);
        return chip;
      }));
    }

    /* -------------------------------------------------------------- chart */

    /*
      The skeleton only stands in for a chart there is not yet; once there is
      one it stays, dimmed, until the new one arrives and moves into place.
    */
    setLoading(loading) {
      this.loading = loading;
      this.el.loading.hidden = !loading || this.marks.length > 0;
      this.el.chart.classList.toggle('league-scatter__chart--loading', loading);
    }

    showEmpty(message) {
      this.el.svg.replaceChildren();
      this.el.svg.removeAttribute('width');
      this.el.svg.removeAttribute('height');
      this.el.svg.toggleAttribute('hidden', true);
      this.el.download.disabled = true;
      this.el.empty.textContent = message;
      this.el.empty.hidden = false;
      this.marks = [];
    }

    render({ animate = true } = {}) {
      this.closeFind();
      this.hideHover();
      this.visible = this.data?.status === 'ready' ? this.filtered() : [];
      this.renderChips();
      this.renderSummary();

      if (this.loading && !this.data) return;

      if (!this.data) {
        this.showEmpty('No se pudieron cargar los datos. Inténtalo de nuevo en unos minutos.');
        return;
      }
      if (this.data.status === 'pending') {
        this.showEmpty('Los datos de esta temporada se están preparando. Vuelve en unos minutos.');
        return;
      }

      const all = this.data.points || [];
      if (!all.length) {
        this.showEmpty('Esta temporada todavía no tiene datos para estas métricas.');
        return;
      }

      // An attribute the season does not carry (xG in a league without it)
      // reads as one value for everyone: say so rather than draw a line of dots.
      for (const axis of ['x', 'y']) {
        const first = all[0][axis];
        if (all.every(point => point[axis] === first)) {
          this.showEmpty(`«${this.data[axis].label}» no tiene datos esta temporada. Elige otra métrica.`);
          return;
        }
      }

      if (!this.visible.length) {
        this.showEmpty(this.players ? 'Ningún jugador cumple los filtros. Prueba a ampliarlos.' : 'Ningún equipo tiene datos para estas métricas.');
        return;
      }

      this.el.empty.hidden = true;
      this.el.svg.toggleAttribute('hidden', false);
      this.el.download.disabled = false;
      this.draw({ animate });
    }

    renderSummary() {
      const total = this.data?.status === 'ready' ? this.data.points.length : null;
      const noun = this.players ? 'jugadores' : 'equipos';
      this.el.summary.textContent = total === null
        ? this.title
        : `${this.title} · ${number(this.visible.length, 0)} de ${number(total, 0)} ${noun}`;
    }

    draw({ animate = true } = {}) {
      const svg = this.el.svg;
      const population = this.data.population;
      const moving = animate && !reducedMotion();
      // Where each point stood, by id, when the last chart was of the same population.
      const before = new Map(this.drawn?.population === population ? this.marks.map(mark => [mark.point.id, mark]) : []);
      const labelledBefore = this.drawn?.population === population ? this.drawn.labelled : new Set();
      const width = this.el.chart.clientWidth || 640;
      const height = Math.round(Math.max(340, Math.min(620, width * 0.62)));
      const narrow = width < 520;
      const margin = { ...MARGIN, left: narrow ? 52 : MARGIN.left };
      const plot = { left: margin.left, top: margin.top, right: width - margin.right, bottom: height - margin.bottom };
      const points = this.visible;
      const { x: xAxis, y: yAxis } = this.data;
      const players = this.data.population === 'players';

      svg.replaceChildren();
      svg.setAttribute('width', width);
      svg.setAttribute('height', height);
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.setAttribute('aria-label', `Dispersión: ${yAxis.label} frente a ${xAxis.label}, ${points.length} ${players ? 'jugadores' : 'equipos'}`);
      this.el.download.dataset.skChartDownload = `dispersion ${yAxis.label} vs ${xAxis.label}`;

      const [x0, x1] = domain(points.map(point => point.x));
      const [y0, y1] = domain(points.map(point => point.y));
      /*
        Where less is better (xAxis.lower: xG conceded, PPDA…) the axis runs
        the other way, so the better end is always to the right and at the
        top (beta-final-changes fase 5, L2). The ticks, the reference lines
        and the trend all go through sx/sy, so they follow.
      */
      const xShare = value => (xAxis.lower ? x1 - value : value - x0) / (x1 - x0);
      const yShare = value => (yAxis.lower ? y1 - value : value - y0) / (y1 - y0);
      const sx = value => plot.left + xShare(value) * (plot.right - plot.left);
      const sy = value => plot.bottom - yShare(value) * (plot.bottom - plot.top);
      this.scale = { sx, sy, plot };
      const frame = [x0, x1, y0, y1, width, height].map(value => value.toFixed(6)).join('|') + `|${Boolean(xAxis.lower)}|${Boolean(yAxis.lower)}`;
      const rescaled = this.drawn?.frame !== frame;

      // A solid surface, so the download reads the same outside the page.
      make('rect', { class: 'league-scatter__surface', x: 0, y: 0, width, height }, svg);

      // Caption: what this is, for the download as much as for the page.
      const caption = make('text', { class: 'league-scatter__caption', x: plot.left, y: 18 }, svg);
      caption.textContent = this.caption(points.length);

      const clipId = `league-scatter-clip-${this.id}`;
      const clip = make('clipPath', { id: clipId }, make('defs', {}, svg));
      make('rect', { x: plot.left, y: plot.top, width: plot.right - plot.left, height: plot.bottom - plot.top }, clip);

      // Grid and ticks: hairlines, recessive.
      const xt = ticks(x0, x1, Math.max(3, Math.round((plot.right - plot.left) / 90)));
      const yt = ticks(y0, y1, Math.max(3, Math.round((plot.bottom - plot.top) / 56)));
      const grid = make('g', {}, svg);
      xt.values.forEach(value => {
        const x = sx(value);
        make('line', { class: 'league-scatter__grid', x1: x, x2: x, y1: plot.top, y2: plot.bottom }, grid);
        const label = make('text', { class: 'league-scatter__tick', x, y: plot.bottom + 17, 'text-anchor': 'middle' }, grid);
        label.textContent = number(value, xt.digits);
      });
      yt.values.forEach(value => {
        const y = sy(value);
        make('line', { class: 'league-scatter__grid', x1: plot.left, x2: plot.right, y1: y, y2: y }, grid);
        const label = make('text', { class: 'league-scatter__tick', x: plot.left - 8, y: y + 4, 'text-anchor': 'end' }, grid);
        label.textContent = number(value, yt.digits);
      });
      make('line', { class: 'league-scatter__axis-line', x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom }, grid);
      make('line', { class: 'league-scatter__axis-line', x1: plot.left, x2: plot.left, y1: plot.top, y2: plot.bottom }, grid);

      const xTitle = make('text', { class: 'league-scatter__axis-title', x: (plot.left + plot.right) / 2, y: height - 12, 'text-anchor': 'middle' }, svg);
      // An inverted axis says so: its numbers grow the other way.
      const inverted = axis => (axis.lower ? ' · invertido (menos es mejor)' : '');
      xTitle.textContent = `${xAxis.label} · ${xAxis.unit_label}${inverted(xAxis)}`;
      const yTitle = make('text', {
        class: 'league-scatter__axis-title',
        x: -((plot.top + plot.bottom) / 2),
        y: 15,
        'text-anchor': 'middle',
        transform: 'rotate(-90)',
      }, svg);
      yTitle.textContent = `${yAxis.label} · ${yAxis.unit_label}${inverted(yAxis)}`;

      if (moving && rescaled) {
        [grid, xTitle, yTitle].forEach(element => fadeIn(element));
      }

      // Reference lines, over what the filters show.
      const lines = make('g', { 'clip-path': `url(#${clipId})` }, svg);
      const legend = [];

      if (this.state.mean) {
        const mx = mean(points.map(point => point.x));
        const my = mean(points.map(point => point.y));
        make('line', { class: 'league-scatter__mean', x1: sx(mx), x2: sx(mx), y1: plot.top, y2: plot.bottom }, lines);
        make('line', { class: 'league-scatter__mean', x1: plot.left, x2: plot.right, y1: sy(my), y2: sy(my) }, lines);
        const xMean = make('text', { class: 'league-scatter__line-label', x: sx(mx) + 5, y: plot.top + 11 }, lines);
        xMean.textContent = `Media ${formatValue(mx, xAxis.unit)}`;
        const yMean = make('text', { class: 'league-scatter__line-label', x: plot.right - 5, y: sy(my) - 5, 'text-anchor': 'end' }, lines);
        yMean.textContent = `Media ${formatValue(my, yAxis.unit)}`;
        legend.push({ kind: 'mean', text: 'Media' });
      }

      if (this.state.trend) {
        const fit = regression(points);
        if (fit) {
          make('line', {
            class: 'league-scatter__trend',
            x1: sx(x0),
            x2: sx(x1),
            y1: sy(fit.intercept + fit.slope * x0),
            y2: sy(fit.intercept + fit.slope * x1),
          }, lines);
          legend.push({ kind: 'trend', text: `Tendencia (r = ${number(fit.r, 2)})` });
        }
      }

      this.drawLegend(svg, legend, plot);

      // Points: the unlabelled first, so a labelled one is never hidden under the cloud.
      const labelled = this.labelled[this.data.population];
      const ordered = [...points].sort((a, b) => Number(labelled.has(a.id)) - Number(labelled.has(b.id)));
      const leaving = make('g', {}, svg);
      const layer = make('g', {}, svg);
      this.marks = ordered.map(point => {
        const cx = sx(point.x);
        const cy = sy(point.y);
        const on = labelled.has(point.id);
        if (players) {
          const element = make('circle', { class: `league-scatter__dot${on ? ' league-scatter__dot--labelled' : ''}`, cx, cy, r: on ? DOT_RADIUS + 1 : DOT_RADIUS }, layer);
          return { point, cx, cy, r: DOT_RADIUS + 1, element };
        }
        const element = this.drawCrest(layer, point, cx, cy, on);
        return { point, cx, cy, r: CREST_SIZE / 2, element };
      });

      let moved = false;
      if (moving) {
        const now = new Set(this.marks.map(mark => mark.point.id));
        this.marks.forEach(mark => {
          const was = before.get(mark.point.id);
          if (!was) {
            fadeIn(mark.element);
            return;
          }
          const dx = was.cx - mark.cx;
          const dy = was.cy - mark.cy;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
          moved = true;
          play(mark.element, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }]);
        });

        // Out of the chart: a ghost where it stood fades away, then goes.
        before.forEach((was, id) => {
          if (now.has(id) || !players) return;
          const ghost = make('circle', { class: 'league-scatter__dot', cx: was.cx, cy: was.cy, r: DOT_RADIUS }, leaving);
          const fade = play(ghost, [{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-in', fill: 'forwards' });
          if (fade) fade.onfinish = () => ghost.remove();
          else ghost.remove();
        });
      }

      // The lines and the names wait for the points to have mostly arrived.
      const settle = moved ? MOVE_MS * 0.6 : 0;
      if (moving && (rescaled || moved)) fadeIn(lines, settle);

      const names = this.drawLabels(svg, this.marks.filter(mark => labelled.has(mark.point.id)), plot);
      if (moving) {
        names.forEach(({ id, element }) => {
          if (moved || !labelledBefore.has(id)) fadeIn(element, settle);
        });
      }

      this.drawn = { population, frame, labelled: new Set(labelled) };

      this.hoverLayer = make('g', {}, svg);
      this.brush = make('rect', { class: 'league-scatter__brush', x: 0, y: 0, width: 0, height: 0, visibility: 'hidden' }, svg);
    }

    caption(count) {
      const parts = [this.title, `${number(count, 0)} ${this.players ? 'jugadores' : 'equipos'}`];
      if (this.players) {
        // What the pills say, so the PNG names its own filters.
        const pills = ['minutes', 'age', 'team']
          .map(name => this.root.querySelector(`[data-scatter-menu-pill="${name}"]`))
          .filter(pill => pill?.classList.contains('active'))
          .map(pill => pill.querySelector('.league-filterbar__pill-label').textContent.trim());
        if (this.state.groups.size) {
          const names = Array.from(this.root.querySelectorAll('[data-scatter-group]'))
            .filter(button => button.dataset.scatterGroup !== '' && this.state.groups.has(button.dataset.scatterGroup))
            .map(button => button.textContent.trim().toLowerCase());
          parts.push(names.join(', '));
        }
        parts.push(...pills);
      }
      return parts.filter(Boolean).join(' · ');
    }

    drawLegend(svg, items, plot) {
      if (!items.length) return;
      // A row of its own under the caption, so a long caption never runs into it.
      let x = plot.right;
      const y = 34;
      [...items].reverse().forEach(item => {
        const text = make('text', { class: 'league-scatter__legend', x, y, 'text-anchor': 'end' }, svg);
        text.textContent = item.text;
        const width = this.measure(item.text, '500 11px Inter, system-ui, sans-serif');
        const swatchEnd = x - width - 6;
        make('line', {
          class: item.kind === 'mean' ? 'league-scatter__mean' : 'league-scatter__trend',
          x1: swatchEnd - 18,
          x2: swatchEnd,
          y1: y - 4,
          y2: y - 4,
        }, svg);
        x = swatchEnd - 32;
      });
    }

    /* One group per crest, ring and all, so the transition moves it whole. */
    drawCrest(layer, point, cx, cy, on) {
      const half = CREST_SIZE / 2;
      const group = make('g', {}, layer);
      if (on) make('circle', { class: 'league-scatter__crest-ring', cx, cy, r: half + 4 }, group);

      if (point.image) {
        // The data URL once it has landed, so the download keeps the crest;
        // until then, or if it cannot be read, the page shows the URL itself.
        const kept = crests.get(point.image);
        const href = typeof kept === 'string' ? kept : point.image;
        make('image', { href, x: cx - half, y: cy - half, width: CREST_SIZE, height: CREST_SIZE, preserveAspectRatio: 'xMidYMid meet' }, group);
        return group;
      }
      make('circle', { class: 'league-scatter__crest-fallback', cx, cy, r: half - 2 }, group);
      const text = make('text', { class: 'league-scatter__crest-initials', x: cx, y: cy + 3.5, 'text-anchor': 'middle' }, group);
      text.textContent = initials(point.name);
      return group;
    }

    measure(text, font = LABEL_FONT) {
      this.context ||= document.createElement('canvas').getContext('2d');
      this.context.font = font;
      return this.context.measureText(text).width;
    }

    /*
      Each name tries the spots around its mark, nearest first, and takes the
      first that overlaps no other name or labelled mark and stays inside the
      plot; failing that, the one that overlaps least. A name set away from its
      mark gets a leader line back to it.
    */
    drawLabels(svg, marks, plot) {
      if (!marks.length) return [];
      const layer = make('g', {}, svg);
      const drawn = [];
      const placed = [];
      const obstacles = marks.map(mark => ({ left: mark.cx - mark.r, right: mark.cx + mark.r, top: mark.cy - mark.r, bottom: mark.cy + mark.r }));

      [...marks].sort((a, b) => a.cy - b.cy).forEach(mark => {
        const text = mark.point.name;
        const width = this.measure(text);
        const h = LABEL_HEIGHT;
        const r = mark.r + 3;
        let best = null;

        for (const distance of [0, 14, 30, 50]) {
          const d = distance;
          const spots = [
            [mark.cx + r + d, mark.cy - h / 2],
            [mark.cx - r - d - width, mark.cy - h / 2],
            [mark.cx - width / 2, mark.cy - r - d - h],
            [mark.cx - width / 2, mark.cy + r + d],
            [mark.cx + r * 0.7 + d, mark.cy - r * 0.7 - d - h],
            [mark.cx - r * 0.7 - d - width, mark.cy - r * 0.7 - d - h],
            [mark.cx + r * 0.7 + d, mark.cy + r * 0.7 + d],
            [mark.cx - r * 0.7 - d - width, mark.cy + r * 0.7 + d],
          ];

          for (const [left, top] of spots) {
            const box = { left, top, right: left + width, bottom: top + h };
            const inside = box.left >= plot.left + 2 && box.right <= plot.right - 2 && box.top >= plot.top + 2 && box.bottom <= plot.bottom - 2;
            if (!inside) continue;
            const score = placed.reduce((sum, other) => sum + overlap(box, other), 0)
              + obstacles.reduce((sum, other) => sum + overlap(box, other) * 0.5, 0);
            if (!best || score < best.score) best = { box, score, distance };
            if (score === 0) break;
          }
          if (best && best.score === 0) break;
        }

        if (!best) {
          const left = Math.min(plot.right - width - 2, Math.max(plot.left + 2, mark.cx + r));
          const top = Math.min(plot.bottom - h - 2, Math.max(plot.top + 2, mark.cy - h / 2));
          best = { box: { left, top, right: left + width, bottom: top + h }, distance: 0 };
        }

        placed.push(best.box);
        const { box } = best;
        const group = make('g', {}, layer);
        drawn.push({ id: mark.point.id, element: group });

        if (best.distance > 0) {
          const tx = Math.max(box.left, Math.min(box.right, mark.cx));
          const ty = Math.max(box.top, Math.min(box.bottom, mark.cy));
          make('line', { class: 'league-scatter__leader', x1: mark.cx, y1: mark.cy, x2: tx, y2: ty }, group);
        }

        // A halo in the surface colour under the name, drawn as its own text
        // so the download (which only copies computed fill and stroke) keeps it.
        const baseline = box.top + h - 3;
        const halo = make('text', { class: 'league-scatter__label-halo', x: box.left, y: baseline }, group);
        halo.textContent = text;
        const label = make('text', { class: 'league-scatter__label', x: box.left, y: baseline }, group);
        label.textContent = text;
      });

      return drawn;
    }

    /* -------------------------------------------------------- interaction */

    local(event) {
      const rect = this.el.svg.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    /* The mark nearest the pointer, within reach — no need to land dead on an 8px dot. */
    nearest({ x, y }) {
      let best = null;
      let bestDistance = Infinity;
      this.marks.forEach(mark => {
        const distance = (mark.cx - x) ** 2 + (mark.cy - y) ** 2;
        const reach = Math.max(HIT_RADIUS, mark.r + 6);
        if (distance <= reach ** 2 && distance < bestDistance) {
          best = mark;
          bestDistance = distance;
        }
      });
      return best;
    }

    pointerDown(event) {
      if (event.button !== 0 || !this.marks.length) return;
      const at = this.local(event);
      this.pointer = { start: at, type: event.pointerType, brushing: false, id: event.pointerId };
      if (event.pointerType !== 'touch') {
        this.el.svg.setPointerCapture(event.pointerId);
        event.preventDefault();
      }
    }

    pointerMove(event) {
      if (!this.marks.length) return;
      const at = this.local(event);
      const pointer = this.pointer;

      if (pointer && pointer.type !== 'touch') {
        const moved = Math.hypot(at.x - pointer.start.x, at.y - pointer.start.y);
        if (pointer.brushing || moved > DRAG_THRESHOLD) {
          pointer.brushing = true;
          this.hideHover();
          const { plot } = this.scale;
          const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
          const x1 = clamp(Math.min(at.x, pointer.start.x), plot.left, plot.right);
          const x2 = clamp(Math.max(at.x, pointer.start.x), plot.left, plot.right);
          const y1 = clamp(Math.min(at.y, pointer.start.y), plot.top, plot.bottom);
          const y2 = clamp(Math.max(at.y, pointer.start.y), plot.top, plot.bottom);
          pointer.box = { x1, x2, y1, y2 };
          Object.entries({ x: x1, y: y1, width: x2 - x1, height: y2 - y1, visibility: 'visible' })
            .forEach(([key, value]) => this.brush.setAttribute(key, value));
          return;
        }
      }

      if (event.pointerType !== 'touch') this.showHover(this.nearest(at));
    }

    pointerUp(event) {
      const pointer = this.pointer;
      this.pointer = null;
      if (!pointer) return;
      if (this.el.svg.hasPointerCapture?.(event.pointerId)) this.el.svg.releasePointerCapture(event.pointerId);

      const labelled = this.labelled[this.data?.population || this.state.population];

      if (pointer.brushing && pointer.box) {
        this.brush.setAttribute('visibility', 'hidden');
        const { x1, x2, y1, y2 } = pointer.box;
        const inside = this.marks.filter(mark => mark.cx >= x1 && mark.cx <= x2 && mark.cy >= y1 && mark.cy <= y2).map(mark => mark.point.id);
        if (!inside.length) return;
        // A box over names already on takes them off; otherwise it puts every one on.
        const allOn = inside.every(id => labelled.has(id));
        inside.forEach(id => (allOn ? labelled.delete(id) : labelled.add(id)));
        this.render();
        return;
      }

      const mark = this.nearest(this.local(event));
      if (!mark) return;
      if (labelled.has(mark.point.id)) labelled.delete(mark.point.id);
      else labelled.add(mark.point.id);
      this.render();
      // A tap has no hover: show what was tapped.
      if (pointer.type === 'touch') this.showHover(this.marks.find(other => other.point.id === mark.point.id) || null);
    }

    showHover(mark) {
      if (!mark) {
        this.hideHover();
        return;
      }
      if (this.hovered === mark) return;
      this.hovered = mark;

      this.hoverLayer.replaceChildren();
      make('circle', { class: 'league-scatter__hover', cx: mark.cx, cy: mark.cy, r: mark.r + 4 }, this.hoverLayer);
      this.el.svg.style.cursor = 'pointer';

      const { point } = mark;
      const tooltip = this.el.tooltip;
      const { x, y } = this.data;
      const rows = [];
      const title = document.createElement('strong');
      title.textContent = point.name;
      rows.push(title);

      const meta = document.createElement('span');
      meta.className = 'league-scatter__tooltip-meta';
      meta.textContent = this.data.population === 'players'
        ? [point.team, point.position, Number.isFinite(point.age) ? `${point.age} años` : null, `${number(point.minutes, 0)}′`].filter(Boolean).join(' · ')
        : `${point.games} partidos`;
      rows.push(meta);

      [[x, point.x], [y, point.y]].forEach(([axis, value]) => {
        const row = document.createElement('span');
        row.className = 'league-scatter__tooltip-row';
        const label = document.createElement('span');
        label.textContent = axis.label;
        const amount = document.createElement('b');
        amount.textContent = formatValue(value, axis.unit);
        row.append(label, amount);
        rows.push(row);
      });

      tooltip.replaceChildren(...rows);
      tooltip.hidden = false;

      const width = this.el.chart.clientWidth;
      const box = tooltip.getBoundingClientRect();
      let left = mark.cx + mark.r + 10;
      if (left + box.width > width - 4) left = mark.cx - mark.r - 10 - box.width;
      let top = mark.cy - box.height / 2;
      top = Math.max(4, Math.min(this.el.chart.clientHeight - box.height - 4, top));
      tooltip.style.left = `${Math.max(4, left)}px`;
      tooltip.style.top = `${top}px`;
    }

    hideHover() {
      this.hovered = null;
      this.hoverLayer?.replaceChildren();
      if (this.el?.tooltip) this.el.tooltip.hidden = true;
      if (this.el?.svg) this.el.svg.style.cursor = '';
    }
  }

  function boot() {
    document.querySelectorAll('[data-league-scatter]').forEach(root => {
      if (!Array.from(controllers).some(controller => controller.root === root)) controllers.add(new LeagueScatter(root));
    });
    controllers.forEach(controller => {
      if (!controller.root.isConnected) {
        controller.destroy();
        controllers.delete(controller);
      }
    });
  }

  /*
    The Alpine scope around the shared "Seleccionar atributos" window
    (attribute-picker.js) with both axes in it: a chip goes to the axis
    switched on above the chips (X first, then on to Y), a chip already on
    the other axis trades places with this one, and each chip says which
    axis holds it. Closing the window — Listo, the cross, Escape — hands
    both axes back to league-scatter.js, which opened it with openFor().
  */
  window.skScatterPicker = function () {
    return Object.assign(window.skAttributePicker([]), {
      pickerAxis: 'x',
      pickerAxes: { x: null, y: null },
      pickerLabels: {},
      pickerOnDone: null,

      pickerHas(key) {
        return key === this.pickerAxes.x || key === this.pickerAxes.y;
      },

      pickerTag(key) {
        return ['x', 'y'].filter(axis => this.pickerAxes[axis] === key).map(axis => axis.toUpperCase()).join(' · ');
      },

      pickerLabel(axis) {
        const key = this.pickerAxes[axis];
        return this.pickerLabels[key] || key || '—';
      },

      pickerWindowed: false,

      // As the search's period: why an attribute cannot be picked, or ''.
      pickerDisabled(key) {
        if (!this.pickerWindowed) return '';
        const attribute = this.pickerCatalog.flatMap(group => group.attributes).find(a => a.key === key);
        return attribute && attribute.rangeable === false ? 'No disponible por torneo: no hay dato partido a partido' : '';
      },

      pickerSet(key) {
        if (this.pickerDisabled(key)) return;
        const axis = this.pickerAxis;
        const other = axis === 'x' ? 'y' : 'x';
        const axes = { ...this.pickerAxes };
        if (axes[other] === key) axes[other] = axes[axis];
        axes[axis] = key;
        this.pickerAxes = axes;
        if (axis === 'x') this.pickerAxis = 'y';
      },

      pickerClear() {},

      onPickerClosed() {
        const done = this.pickerOnDone;
        this.pickerOnDone = null;
        done?.({ ...this.pickerAxes });
      },

      openFor({ catalog, axes, onDone, windowed = false }) {
        this.pickerCatalog = catalog;
        this.pickerWindowed = windowed;
        this.pickerLabels = Object.fromEntries(catalog.flatMap(group => group.attributes.map(attribute => [attribute.key, attribute.label])));
        this.pickerAxes = { ...axes };
        this.pickerAxis = 'x';
        this.pickerOnDone = onDone;
        this.openPicker();
      },
    });
  };

  window.StatiskicksLeagueScatter = { boot };

  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('livewire:navigated', boot);
  document.addEventListener('livewire:init', () => {
    if (window.Livewire?.hook) window.Livewire.hook('morph.updated', () => requestAnimationFrame(boot));
  });

  boot();
})();
