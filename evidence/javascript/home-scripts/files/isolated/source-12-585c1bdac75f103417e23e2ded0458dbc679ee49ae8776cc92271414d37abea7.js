/*
  Attribute charts: the bars, the radar and the attribute picker the player
  page's Perfil tab and the team page's Resumen tab both draw. One source for
  how an attribute looks, so the two pages cannot drift apart.

  An attribute ("trait") is the shape OptaSeasonStatsService::buildTraitsData()
  and OptaTeamAttributeService::forTeam() both return: key, label, category,
  val, percentile, benchmark, population averages, lowerIsBetter.

  Three units, one fill. Bars and wedges always fill to the percentile against
  the peers; the unit only picks the number on the badge - the percentile, or
  the value itself (p90 for a player, per match for a team). Total swaps each
  trait for its `total` view (AttributeRanking::view()): the season's raw
  count with its own percentile among the same peers' counts, so a bar in
  Total is as long as that count ranks (Fase 3).

  Two ways in:
  - the drawing functions (drawPizzaChart, createBarChart, renderTraitsGrid,
    the modal transition), which the player page calls from its own state;
  - a controller that runs a whole section from data-attribute-* hooks, which
    the team page uses (see mount() at the bottom).
*/
(() => {
  const UNIT_PERCENTILE = 'percentile';
  const UNIT_VALUE = 'value';
  const UNIT_TOTAL = 'total';

  /*
    620ms on easeOutQuart, the duration and curve the bar rows animate on, so
    the two views of the same attributes settle at the same rate.
  */
  const PIZZA_ANIMATION_MS = 620;
  const MODAL_TRANSITION_MS = 240;

  // A wheel's animation in flight, per canvas, so a redraw can cancel it.
  const pizzaAnimations = new WeakMap();

  function prefersReducedMotion() {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // iOS Safari kills the tab process ("A problem repeatedly occurred") when canvas
  // memory gets too high. At devicePixelRatio 3 (retina phones) every canvas allocates
  // 9x the pixels; capping the ratio on mobile keeps the chart buffers small enough.
  function canvasDpr() {
    const raw = window.devicePixelRatio || 1;
    const narrowViewport = window.matchMedia('(max-width: 768px)').matches;
    const touchCapable = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

    return narrowViewport && touchCapable ? Math.min(raw, 1.5) : Math.min(raw, 2);
  }

  function hexToRgba(hex, alpha) {
    if (hex.startsWith('rgb')) {
      const channels = hex.match(/\d+(\.\d+)?/g)?.slice(0, 3) || [0, 0, 0];
      return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
    }

    const clean = hex.replace('#', '');
    const bigint = parseInt(clean, 16);
    if (Number.isNaN(bigint)) return `rgba(178, 217, 139, ${alpha})`;

    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /*
    A number in the platform's Spanish, as PHP's number_format($n, $d, ',', '.')
    writes it: a decimal comma and a point between thousands. Intl's es-ES
    leaves four-digit numbers ungrouped, which the server-drawn tables do not.
  */
  function formatSpanish(value, decimals) {
    const numeric = Number(value ?? 0);
    const [whole, fraction] = Math.abs(numeric).toFixed(decimals).split('.');
    const sign = numeric < 0 && Number(fraction ? `${whole}.${fraction}` : whole) !== 0 ? '-' : '';

    return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${fraction ? `,${fraction}` : ''}`;
  }

  function formatMetric(value) {
    const numeric = Number(value ?? 0);

    return formatSpanish(numeric, Number.isInteger(numeric) ? 0 : 2);
  }

  /*
    A place's band in the Ranking tables: the field in thirds, best first,
    each rounded up (1-6, 7-12, 13-18 of 18). The twin of PHP's
    App\Support\RankBands::third(). Null without a place.
  */
  function rankThird(rank, total) {
    const place = Number(rank);
    const field = Number(total);

    if (!Number.isFinite(place) || !Number.isFinite(field) || rank === null || total === null || field < 1) return null;
    if (place <= Math.floor((field + 2) / 3)) return 'high';
    if (place <= Math.floor((2 * field + 2) / 3)) return 'mid';

    return 'low';
  }

  /**
   * Lower-is-better stats (Goals Conceded, Total Losses Of Possession, ...)
   * fill toward the *lowest* value seen, not the highest: the bar mirrors
   * benchmark/value instead of reading value/benchmark directly off the
   * axis. 0 (or less) is treated as the perfect floor rather than dividing
   * by it. Only the player page's Comparar radar still scales by value; the
   * bars and wheel here always fill to the percentile.
   */
  function invertedValueRatio(value, trait) {
    const benchmark = Number(trait.benchmark ?? 0);

    if (value <= 0) return 100;

    return Math.min(100, Math.max(0, (benchmark / value) * 100));
  }

  /*
    A trait as one unit shows it. In Total, its `total` view's figures - value,
    percentile, average, best and range - stand in for the per-90 or
    per-match ones under the same names, and the badge reads the value as the
    value unit does. A trait without a total (no count at all) keeps its own.
  */
  function traitInUnit(trait, unit) {
    return unit === UNIT_TOTAL && trait?.total ? { ...trait, ...trait.total } : trait;
  }

  // The badge's unit: Total reads its value as the value unit does.
  function badgeUnit(unit) {
    return unit === UNIT_TOTAL ? UNIT_VALUE : unit;
  }

  function clampedPercentile(value) {
    const numeric = Number(value ?? 0);

    return Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : 0;
  }

  /*
    How far a bar or wedge fills: the percentile, whichever unit is on show.
    The unit only changes the number on the badge. Filling the value unit to
    the value over the best peer's measured something else entirely (how
    close to the best, not how many it beats), so the same attribute changed
    length on a unit switch; and with a floor of 1 under that ratio, any stat
    whose best peer did it less than once per 90 read almost empty (0.13
    through-balls against a 0.36 best drew 13%, not 36%, at the 95th
    percentile).
  */
  function getTraitDisplayRatio(trait) {
    return clampedPercentile(trait.percentile);
  }

  // The league/position average's marker, on the same percentile scale.
  function getTraitPopulationAverageRatio(trait) {
    return clampedPercentile(trait.population_average_percentile);
  }

  /*
    A bar's badge, written as the advanced search writes its rank badges
    (Players::formatStatValue()): a percentage to one decimal with its sign,
    any other value to two decimals, a whole number bare. The percentile unit
    shows the whole percentile, as the radar's badges do.
  */
  function getTraitChartBadgeLabel(trait, unit) {
    if (unit === UNIT_VALUE || unit === UNIT_TOTAL) {
      const shown = traitInUnit(trait, unit);
      const value = Number(shown.val ?? 0);

      return shown.unit === 'percentage' ? `${formatSpanish(value, 1)}%` : formatMetric(value);
    }

    return String(Math.round(Number(trait.percentile ?? 0)));
  }

  /*
    The value line of a bar's tooltip. A player's attributes are per 90 and
    read "p90 ..."; a success rate, or a team attribute that is a percentage
    or a ratio, is not, so it reads as the value it is.
  */
  function valueTooltipLine(trait, valueLabel) {
    const isPercentage = trait.unit === 'percentage';
    const suffix = isPercentage ? '%' : '';
    const prefix = isPercentage || trait.unit === 'ratio' ? 'valor' : valueLabel;

    return `${prefix} ${formatMetric(trait.val)}${suffix}  ·  media ${formatMetric(trait.population_average)}${suffix}  ·  mejor ${formatMetric(trait.benchmark)}${suffix}`;
  }

  // The percentile line of the same tooltip: where the value, the average and the best stand.
  function percentileTooltipLine(trait) {
    return `percentil ${formatMetric(trait.percentile)}%  ·  media ${formatMetric(trait.population_average_percentile)}%  ·  mejor ${formatMetric(trait.benchmark_percentile ?? 0)}%`;
  }

  /*
    Placed by its inner edge, not by its middle.

    The label used to be centred on a fixed radius, so how close it sat to the
    rim depended on how many lines it wrapped to: a one-line name sat a whole
    line-height further out than a three-line one, and the ring as a whole
    stood off the wheel by the worst case. Measuring the block and then pushing
    it out by `gap` from `innerRadius` puts every label the same distance from
    the rim whatever it wraps to, and lets that distance be small.

    Lines stack along the radius - the rotation maps the local y axis onto it -
    so the block's radial half-extent is what has to clear the rim: half a line
    height per line past the middle, plus half a glyph.
  */
  /*
    A rotated label's lines: words joined while a line stays within 14
    characters. Its own function so a chart can measure the band its labels
    need before drawing them (Comparar's radar, beta-final-changes fase 6).
  */
  function rotatedLabelLines(text) {
    const words = String(text ?? '').split(' ');
    const lines = [];
    let current = '';

    words.forEach(word => {
      if ((current + ' ' + word).trim().length > 14 && current) {
        lines.push(current.trim());
        current = word;
      } else {
        current += ' ' + word;
      }
    });

    if (current.trim()) lines.push(current.trim());

    return lines;
  }

  function drawRotatedLabel(ctx, text, cx, cy, angle, innerRadius, gap, fontSize, color) {
    const lines = rotatedLabelLines(text);

    const lineHeight = fontSize * 1.15;
    const halfExtent = ((lines.length - 1) / 2) * lineHeight + fontSize * 0.5;
    const radius = innerRadius + gap + halfExtent;

    ctx.save();
    ctx.translate(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));

    // Tangential rotation
    let rotation = angle + Math.PI / 2;

    // Prevent upside-down text on the left side
    if (rotation > Math.PI / 2 && rotation < 3 * Math.PI / 2) {
      rotation += Math.PI;
    }

    ctx.rotate(rotation);
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px Inter,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    lines.forEach((line, i) => {
      ctx.fillText(
        line,
        0,
        (i - (lines.length - 1) / 2) * lineHeight
      );
    });

    ctx.restore();
  }

  function renderPizzaCanvas(ctx, size, visible, unit, progress = 1) {
    const isDark  = document.documentElement.getAttribute('data-theme') === 'dark';
    const cx = size / 2, cy = size / 2;
    const innerR  = size * 0.05;
    const outerR  = size * 0.34;
    /*
      Clearance from the rim to the nearest glyph. It has to clear a badge on a
      full-length wedge too: those are centred eight pixels past the rim and
      run about eleven more, so anything under ~0.04 puts a label through the
      100 badge.
    */
    const labelGap = size * 0.05;
    const TAU     = 2 * Math.PI;

    const n = visible.length;
    ctx.clearRect(0, 0, size, size);
    if (n === 0) return;

    const sliceAngle = TAU / n;

    /*
      The track behind every wedge, drawn as its own pass so the reference
      circles can go on top of it.

      They used to be drawn first, under everything. The track is translucent,
      so the rings did survive - at 45% of the stated alpha on the dark theme,
      which put a 0.13 white line on screen at about 0.07 and left the grid
      effectively invisible. Above the track they render at the alpha they ask
      for, and they are still under the solid value fill, so a filled wedge
      stays solid and the rings read only in the part of the wedge that is
      empty - which is the part they are measuring.
    */
    visible.forEach((trait, i) => {
      const sa = -Math.PI / 2 + i * sliceAngle;
      const ea = sa + sliceAngle;
      const color = '#4CAF7B';
      const borderColor = isDark
        ? 'rgba(12, 18, 15, 0.95)'
        : 'rgba(255, 255, 255, 0.95)';
      const borderWidth = Math.max(1.5, size * 0.004);

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, sa, ea);
      ctx.arc(cx, cy, innerR, ea, sa, true);
      ctx.closePath();
      ctx.fillStyle = hexToRgba(color, isDark ? 0.45 : 0.22);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, sa, ea);
      ctx.arc(cx, cy, innerR, ea, sa, true);
      ctx.closePath();
      ctx.lineWidth = borderWidth;
      ctx.strokeStyle = borderColor;
      ctx.stroke();
      ctx.restore();
    });

    // Reference circles. 100 is left out: it sits exactly on the rim the wedge
    // borders already draw, so a dashed ring there only frays the outline.
    [25, 50, 75].forEach(lv => {
      const r = innerR + (lv / 100) * (outerR - innerR);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.42)' : 'rgba(22,32,25,0.30)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Petals
    visible.forEach((trait, i) => {
      const sa = -Math.PI / 2 + i * sliceAngle;
      const ea = sa + sliceAngle;
      const mid = sa + sliceAngle / 2;

      /*
        The wedge fills to the percentile whichever unit is selected (the unit
        only changes the badge). This is getTraitDisplayRatio, the same ratio
        the bar view uses.

        It used to have its own ratio, which divided visual_value by min_range
        and max_range. Those are not the same unit: buildTraitsData sets
        visual_value to the percentile while the two bounds are raw p90 values,
        so a trait scoring 42 with peers between 0.20 and 5.20 per 90 came out
        at (42 - 0.2) / 5 = 836%. Every trait clamped to a full wedge, which is
        why the darker track and the reference rings had nothing to show in.
      */
      const ratio = getTraitDisplayRatio(trait) / 100;
      const drawnRatio = ratio * progress;
      const barR = innerR + drawnRatio * (outerR - innerR);
      const color = '#4CAF7B';

      /*
        The badge catches up late. Riding the rim from the first frame stacks
        every badge on the hub, overlapping, and drags the numbers outward
        through the whole run; held back to the last stretch it fades in
        essentially where it lands, since easeOutQuart has the wedge past 80%
        of its travel by then.
      */
      const badgeAlpha = Math.max(0, Math.min(1, (progress - 0.35) / 0.45));

      const borderColor = isDark
        ? 'rgba(12, 18, 15, 0.95)'
        : 'rgba(255, 255, 255, 0.95)';
      const borderWidth = Math.max(1.5, size * 0.004);

      // Filled value petal. The track and its border are already down, from
      // the pass that runs before the reference circles. Nothing to fill
      // or outline at a zero-area wedge, so this stays gated — but the
      // badge below must not be, or a stat pinned at 0 shows no label at
      // all instead of reading "0".
      if (drawnRatio > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, barR, sa, ea);
        ctx.arc(cx, cy, innerR, ea, sa, true);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();

        // Hard border around filled petal
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, barR, sa, ea);
        ctx.arc(cx, cy, innerR, ea, sa, true);
        ctx.closePath();
        ctx.lineWidth = borderWidth;
        ctx.strokeStyle = borderColor;
        ctx.stroke();
        ctx.restore();
      }

      // Badge — drawn regardless of whether the wedge itself has any fill,
      // so a value of 0 still shows a "0" label like every other stat
      // rather than going blank.
      {
        const displayText = unit === UNIT_VALUE
          ? formatMetric(trait.val)
          : `${Math.round(trait.percentile)}`;

        // Place the badge exactly at the edge of the filled slice (the
        // inner radius itself, when there is no fill to sit past).
        const badgeOffset = 8; // slightly outward from the slice edge
        const bR = barR + badgeOffset;

        const bx = cx + bR * Math.cos(mid);
        const by = cy + bR * Math.sin(mid);

        const bw = Math.max(28, size * 0.07);
        const bh = Math.max(18, size * 0.045);
        const badgeRadius = 4;

        // Badge background
        ctx.save();
        ctx.globalAlpha = badgeAlpha;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(bx - bw / 2, by - bh / 2, bw, bh, badgeRadius);
        } else {
          ctx.rect(bx - bw / 2, by - bh / 2, bw, bh);
        }
        ctx.fillStyle = isDark ? 'rgba(58, 90, 83, 0.92)' : 'rgba(255,255,255,0.95)';
        ctx.fill();

        // Border
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = isDark ? 'rgba(25, 35, 32, 0.95)' : 'rgba(50,70,60,0.75)';
        ctx.stroke();

        // Text
        ctx.fillStyle = isDark ? '#dff5ea' : '#1e2c25';
        const fs = Math.max(9, size * 0.024);
        ctx.font = `700 ${fs}px Inter,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayText, bx, by);
        ctx.restore();
      }

      // Outer label
      const lfs = Math.max(10, size * 0.026);

      drawRotatedLabel(
        ctx,
        trait.label,
        cx,
        cy,
        mid,
        outerR,
        labelGap,
        lfs,
        isDark ? '#e5ece7' : '#2f3d33'
      );
    });

    // Center hole
    ctx.beginPath();
    ctx.arc(cx, cy, innerR - 1, 0, TAU);
    ctx.fillStyle = isDark ? '#0c1a10' : '#f7f9f7';
    ctx.fill();
  }

  /*
    The wheel grows out of the hub when it is rebuilt - the wheel first shown,
    a trait toggled, the unit switched - and not when it is merely repainted.
    A theme flip or a resize redraws the same numbers, and regrowing there
    reads as fresh data arriving when none has.
  */
  function drawPizzaChart(wrapper, canvas, visible, { unit = UNIT_PERCENTILE, animate = false } = {}) {
    if (!wrapper || !canvas) return;

    wrapper.style.maxWidth = '500px';
    wrapper.style.aspectRatio = '1';
    wrapper.style.height = '';

    const dpr = canvasDpr();
    const rect = wrapper.getBoundingClientRect();
    const size = Math.max(320, Math.round(rect.width || wrapper.clientWidth || 500));

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';

    const ctx = canvas.getContext('2d');

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pizzaAnimationRafId = pizzaAnimations.get(canvas);

    // A run still in flight is cancelled before another starts, so a resize
    // part way through cannot leave two loops painting the same canvas.
    if (pizzaAnimationRafId !== undefined) {
      cancelAnimationFrame(pizzaAnimationRafId);
      pizzaAnimations.delete(canvas);
    }

    if (!animate || prefersReducedMotion()) {
      renderPizzaCanvas(ctx, size, visible.map(t => traitInUnit(t, unit)), badgeUnit(unit), 1);
      return;
    }

    const shown = visible.map(t => traitInUnit(t, unit));

    const startedAt = performance.now();

    const step = (now) => {
      const elapsed = Math.max(0, now - startedAt);
      const t = Math.min(1, elapsed / PIZZA_ANIMATION_MS);

      renderPizzaCanvas(ctx, size, shown, badgeUnit(unit), 1 - Math.pow(1 - t, 4));

      if (t < 1) {
        pizzaAnimations.set(canvas, requestAnimationFrame(step));
      } else {
        pizzaAnimations.delete(canvas);
      }
    };

    pizzaAnimations.set(canvas, requestAnimationFrame(step));
  }

  /*
    The bar rows: rank bars, drawn by the shared percentile-rows renderer.
    Each fill is the percentile, in either unit, drawn in the percentile
    gradient the server places (AttributeRanking's bar_gradient), so it ends
    in its percentile's colour; a payload without one leaves the fill in that
    colour alone. Returns the Chart.js instance; the caller destroys it
    before the next build.
  */
  function createBarChart(canvas, wrapper, visible, {
    unit = UNIT_PERCENTILE,
    showAverage = false,
    instanceId,
    animate = true,
    valueLabel = 'p90',
  } = {}) {
    if (!canvas || !wrapper || !window.StatiskicksPercentileRows) return null;

    // A name line over a measure line (percentile-rows.js).
    const rowHeight = 60;
    const padding = 24;

    // The wrapper is what the card's list scrolls; its height follows the rows
    // and must not be capped.
    wrapper.style.height = (visible.length * rowHeight + padding) + 'px';
    canvas.style.width = ''; canvas.style.height = '';
    canvas.width = 0; canvas.height = 0; // let Chart.js resize

    const valueUnit = unit !== UNIT_PERCENTILE;
    const tooltipValueLabel = unit === UNIT_TOTAL ? 'total' : valueLabel;

    const entries = visible.map(t => traitInUnit(t, unit)).map(trait => ({
      label: trait.label,
      ratio: getTraitDisplayRatio(trait),
      colorPercentile: Number(trait.percentile ?? 0),
      badge: getTraitChartBadgeLabel(trait, badgeUnit(unit)),
      averageRatio: getTraitPopulationAverageRatio(trait),
      gradient: trait.bar_gradient?.percentile ?? null,
      available: true,
      tooltipData: trait,
    }));

    return window.StatiskicksPercentileRows.create(canvas, {
      instanceId,
      entries,
      wrapper,
      animate,
      showAverage,
      rowSeparators: true,
      rowHeight,
      tooltipCallbacks: {
        /*
          One line per unit rather than one line for everything. Chart.js
          draws the box on the canvas and never wraps a line, so the single
          run of six figures this used to return was wider than the card and
          lost its tail off the right edge.
        */
        label: entry => {
          const trait = entry?.tooltipData;
          if (!trait) return [];

          const valueLine = valueTooltipLine(trait, tooltipValueLabel);

          if (valueUnit) {
            return valueLine;
          }

          return [percentileTooltipLine(trait), valueLine];
        },
      },
    });
  }

  function traitDotIcon(filled) {
    return filled
      ? `<svg width="14" height="14" viewBox="0 0 14 14" style="flex-shrink:0"><circle cx="7" cy="7" r="7" fill="var(--accent)" opacity="0.18"/><circle cx="7" cy="7" r="4" fill="var(--accent)"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 14 14" style="flex-shrink:0"><circle cx="7" cy="7" r="6" fill="none" stroke="#b0c4b8" stroke-width="1.5"/></svg>`;
  }

  function categoryDotIcon(state) {
    if (state === 'all') return traitDotIcon(true);
    if (state === 'partial') {
      return `<svg width="14" height="14" viewBox="0 0 14 14" style="flex-shrink:0"><circle cx="7" cy="7" r="6" fill="none" stroke="var(--text-secondary)" stroke-width="1.5"/><circle cx="7" cy="7" r="3" fill="var(--text-secondary)"/></svg>`;
    }
    return traitDotIcon(false);
  }

  /*
    Folded to lower case and stripped of diacritics, so "aereo" finds "JUEGO
    AÉREO" and "posesion" finds "POSESIÓN". The categories are Spanish and
    accented; some attribute labels are not.
  */
  function normalizeTraitSearchText(value) {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /*
    The attribute picker: one box per category, in the order categories first
    appear, each with a header that selects or clears the whole group.

    Filtering happens while grouping rather than by hiding chips afterwards,
    so a category header counts, and acts on, only what is actually on
    screen: under a search, clicking PASE selects the passing attributes the
    search left visible, which is what the header now sits above.

    `onChange` runs after the selection changes; the caller re-renders the
    grid and the charts from it.
  */
  function renderTraitsGrid(grid, empty, traits, visibleTraits, query, onChange) {
    if (!grid) return;

    grid.innerHTML = '';

    const normalizedQuery = normalizeTraitSearchText(query).trim();

    const matchesSearch = trait => normalizedQuery === ''
      || normalizeTraitSearchText(trait.label).includes(normalizedQuery)
      || normalizeTraitSearchText(trait.raw_name).includes(normalizedQuery)
      || normalizeTraitSearchText(trait.category || 'General').includes(normalizedQuery);

    const categories = new Map();
    (traits || []).forEach(t => {
      if (!matchesSearch(t)) return;
      const category = t.category || 'General';
      if (!categories.has(category)) categories.set(category, []);
      categories.get(category).push(t);
    });

    if (empty) empty.hidden = categories.size > 0;

    categories.forEach((categoryTraits, category) => {
      const visibleCount = categoryTraits.filter(t => visibleTraits.has(t.key)).length;
      const state = visibleCount === categoryTraits.length ? 'all' : (visibleCount === 0 ? 'none' : 'partial');

      const box = document.createElement('div');
      box.className = 'traits-category-box';

      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'traits-category-label' + (state === 'all' ? ' traits-category-label--all' : state === 'partial' ? ' traits-category-label--partial' : '');
      label.innerHTML = `<span class="trait-icon">${categoryDotIcon(state)}</span><span>${escapeHtml(category)}</span>`;
      label.addEventListener('click', () => {
        // Not fully selected yet -> select the whole group; already fully
        // selected -> clear the whole group.
        const selectAll = state !== 'all';
        categoryTraits.forEach(t => {
          if (selectAll) visibleTraits.add(t.key);
          else visibleTraits.delete(t.key);
        });
        onChange();
      });

      const categoryGrid = document.createElement('div');
      categoryGrid.className = 'traits-category-grid';

      categoryTraits.forEach(t => {
        const chip = document.createElement('div');
        const isVisible = visibleTraits.has(t.key);
        chip.className = 'trait-chip' + (isVisible ? '' : ' hidden');
        chip.innerHTML = `<span class="trait-icon">${traitDotIcon(isVisible)}</span><span>${escapeHtml(t.label)}</span>`;
        chip.addEventListener('click', () => {
          if (visibleTraits.has(t.key)) visibleTraits.delete(t.key);
          else visibleTraits.add(t.key);
          onChange();
        });
        categoryGrid.appendChild(chip);
      });

      box.appendChild(label);
      box.appendChild(categoryGrid);
      grid.appendChild(box);
    });
  }

  function defaultVisibleTraits(traits) {
    const source = Array.isArray(traits) ? traits : [];
    const defaultKeys = source
      .filter(t => Boolean(t.defaultVisible))
      .map(t => t.key);

    // Fallback: a subject with no configured default should not load an empty chart.
    return new Set(defaultKeys.length ? defaultKeys : source.map(t => t.key));
  }

  function openModalBackdrop(backdrop) {
    if (!backdrop) return;

    // A close still in flight would otherwise hide the modal we are opening.
    if (backdrop.dataset.closeTimerId) {
      clearTimeout(Number(backdrop.dataset.closeTimerId));
      delete backdrop.dataset.closeTimerId;
    }

    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';

    /*
      Two frames, not one: the first lets the browser lay the now-displayed
      panel out at its start values, the second adds the class that
      transitions away from them. Set in the same frame as `hidden = false`,
      the two values collapse into one style resolution and nothing moves.
    */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => backdrop.classList.add('is-open'));
    });
  }

  function closeModalBackdrop(backdrop) {
    if (!backdrop || backdrop.hidden || backdrop.dataset.closeTimerId) return;

    backdrop.classList.remove('is-open');
    document.body.style.overflow = '';

    const timerId = setTimeout(() => {
      backdrop.hidden = true;
      delete backdrop.dataset.closeTimerId;
    }, MODAL_TRANSITION_MS);

    backdrop.dataset.closeTimerId = String(timerId);
  }

  /*
    ── The Ranking tables ─────────────────────────────────────────────────

    The team and player pages' Ranking (beta-feature-2): the picked traits
    by category, each with its value, the field's average and its place, a
    chip in the SKore's colours by third of the field (rankThird()). One
    renderer for both pages, run by the controller below on a root with a
    [data-ranking-body].

    A count reads its total in Total (and always, when `total_only`: Time
    Played per 90 is 90 for everyone); a percentage or a ratio reads itself.
    Métrica and Ranking sort (a click, the next reverses, the third puts the
    categories back); sorted, the rows are one list. By place the best
    first, as the share of the field ahead: 2nd of 45 before 2nd of 18.
  */
  function rankingView(trait, unit) {
    const counted = !['percentage', 'ratio'].includes(trait.unit) && (unit === UNIT_TOTAL || Boolean(trait.total_only));

    return { counted, view: counted ? (trait.total || {}) : trait };
  }

  function rankingNumber(value, trait, counted) {
    if (value === null || value === undefined) return '—';
    const n = Number(value);
    if (trait.unit === 'percentage') return `${formatSpanish(n, 1)}%`;

    return formatSpanish(n, counted && Number.isInteger(n) ? 0 : 2);
  }

  function rankingRow(trait, unit) {
    const { counted, view } = rankingView(trait, unit);
    const ranked = view.rank !== null && view.rank !== undefined && view.rank_total !== null && view.rank_total !== undefined;
    const band = ranked ? rankThird(view.rank, view.rank_total) : null;

    return `<tr data-ranking-key="${escapeHtml(trait.key)}">`
      + `<td>${escapeHtml(trait.label)}</td>`
      + `<td><strong>${rankingNumber(view.val, trait, counted)}</strong></td>`
      + `<td>${rankingNumber(view.population_average, trait, counted)}</td>`
      + `<td class="sk-ranking-place-cell"><span class="sk-skore sk-skore-chip sk-ranking-place${band ? ` sk-skore--${band}` : ''}">${ranked ? `${view.rank} de ${view.rank_total}` : '—'}</span></td>`
      + '</tr>';
  }

  function rankingRows(traits, keys, unit, sort) {
    const picked = traits.filter(trait => keys.has(trait.key));

    if (sort.key !== null) {
      const ahead = trait => {
        const { view } = rankingView(trait, unit);

        return Number(view.rank_total) > 0 ? (Number(view.rank) - 1) / Number(view.rank_total) : null;
      };
      const byLabel = (a, b) => String(a.label).localeCompare(String(b.label), 'es', { sensitivity: 'base' });
      const direction = sort.desc ? -1 : 1;

      return [...picked].sort((a, b) => {
        if (sort.key === 'label') return direction * byLabel(a, b);

        // Unranked rows last, whichever way round.
        const [x, y] = [ahead(a), ahead(b)];
        if (x === null || y === null) return x === y ? byLabel(a, b) : (x === null ? 1 : -1);

        return direction * (x - y) || byLabel(a, b);
      }).map(trait => rankingRow(trait, unit)).join('');
    }

    const groups = new Map();
    picked.forEach(trait => {
      if (!groups.has(trait.category)) groups.set(trait.category, []);
      groups.get(trait.category).push(trait);
    });

    return [...groups].map(([category, rows]) => (
      `<tr class="team-stats-group-row"><th colspan="4">${escapeHtml(category)}</th></tr>` + rows.map(trait => rankingRow(trait, unit)).join('')
    )).join('');
  }

  function nextRankingSort(sort, key) {
    if (sort.key !== key) return { key, desc: false };

    return sort.desc ? { key: null, desc: false } : { key, desc: true };
  }

  /*
    ── The controller ─────────────────────────────────────────────────────

    Runs one section from its data-attribute-* hooks, inside a root marked
    [data-attribute-charts]. The page supplies the traits as JSON in
    [data-attribute-charts-payload]; everything else - unit, comparison,
    selection, search - is state kept here, and survives Livewire morphs.

    A root may start on another unit (data-initial-unit) and need no chart:
    the team page's Ranking is a table of the picked attributes. Every change
    of selection or unit is announced on the root as an
    `attribute-charts-change` event ({ unit, keys }), which such a table
    follows, and the modal's close as `attribute-charts-closed`.

    Scoped to its root on purpose: a page that already ran its own charts
    (the player page, after wire:navigate) leaves document-level listeners
    behind that act on ids, so this one finds everything by hook inside the
    root instead.
  */
  const controllers = new Map();

  class AttributeChartsController {
    constructor(root) {
      this.root = root;
      this.instanceId = root.dataset.instanceId || 'attribute-charts';
      this.traits = [];
      this.state = 'ready';
      this.rankingSort = { key: null, desc: false };
      this.valueLabel = 'p90';
      this.signature = '';
      this.unit = [UNIT_VALUE, UNIT_TOTAL].includes(root.dataset.initialUnit) ? root.dataset.initialUnit : UNIT_PERCENTILE;
      this.showAverage = false;
      this.visibleTraits = new Set();
      this.query = '';
      this.active = false;
      this.barChart = null;
      this.traitKeysSignature = '';

      this.handleClick = event => this.onClick(event);
      this.handleInput = event => {
        if (event.target.matches('[data-attribute-search]')) {
          this.query = event.target.value;
          this.renderGrid();
        }
      };
      this.handleKeydown = event => {
        if (event.key === 'Escape') this.closeModal();
      };
      this.handleResize = () => {
        if (this.active) this.drawRadar(false);
      };

      root.addEventListener('click', this.handleClick);
      root.addEventListener('input', this.handleInput);
      document.addEventListener('keydown', this.handleKeydown);
      window.addEventListener('resize', this.handleResize);

      this.sync();
    }

    find(hook) {
      return this.root.querySelector(`[data-attribute-${hook}]`);
    }

    sync() {
      const source = this.find('charts-payload');
      const signature = source?.textContent?.trim() || '{}';

      if (signature === this.signature) {
        this.syncControls();
        return;
      }

      this.signature = signature;

      let payload = {};
      try {
        payload = JSON.parse(signature);
      } catch (_error) {
        payload = {};
      }

      this.traits = Array.isArray(payload.traits) ? payload.traits : [];
      // A page still loading its traits says so ('loading'): a Ranking shows it.
      this.state = payload.state || 'ready';
      this.valueLabel = payload.valueLabel || 'p90';

      // A new subject or season brings a new attribute list: start from its
      // defaults. The same list re-sent by a morph keeps the user's choice.
      const keys = this.traits.map(t => t.key).join('|');
      if (keys !== this.traitKeysSignature) {
        this.traitKeysSignature = keys;
        this.visibleTraits = defaultVisibleTraits(this.traits);
      }

      this.syncControls();
      this.renderGrid();
      this.announce();

      if (this.active) requestAnimationFrame(() => this.render(true));
    }

    // The selection and unit, for whatever else on the root shows them.
    announce(name = 'attribute-charts-change') {
      this.root.dispatchEvent(new CustomEvent(name, {
        detail: { unit: this.unit, keys: this.traits.filter(t => this.visibleTraits.has(t.key)).map(t => t.key) },
      }));

      if (name === 'attribute-charts-change') this.renderRanking();
    }

    // A Ranking table on the root (rankingRows()): its rows, and its headers' sort.
    renderRanking() {
      const body = this.root.querySelector('[data-ranking-body]');
      if (!body) return;

      const message = text => `<tr><td colspan="4" class="sk-ranking-empty">${escapeHtml(text)}</td></tr>`;
      const picked = this.traits.some(t => this.visibleTraits.has(t.key));

      body.innerHTML = this.state === 'loading' ? message('Cargando ranking...')
        : this.traits.length === 0 ? message(body.dataset.rankingEmpty || 'No hay estadísticas.')
        : !picked ? message('No hay atributos seleccionados.')
        : rankingRows(this.traits, this.visibleTraits, this.unit, this.rankingSort);

      this.root.querySelectorAll('[data-ranking-sort]').forEach(button => {
        const sorted = button.dataset.rankingSort === this.rankingSort.key;
        const icon = button.querySelector('i');

        button.closest('th')?.setAttribute('aria-sort', sorted ? (this.rankingSort.desc ? 'descending' : 'ascending') : 'none');
        if (icon) {
          icon.hidden = !sorted;
          icon.className = `bi ${this.rankingSort.desc ? 'bi-caret-down-fill' : 'bi-caret-up-fill'}`;
        }
      });
    }

    activate() {
      this.active = true;
      requestAnimationFrame(() => this.render(true));
    }

    visible() {
      return this.traits.filter(t => this.visibleTraits.has(t.key));
    }

    render(animate = true) {
      this.drawRadar(animate);
      this.drawBars(animate);
    }

    drawRadar(animate = false) {
      drawPizzaChart(this.find('radar-wrapper'), this.find('radar'), this.visible(), { unit: this.unit, animate });
    }

    drawBars(animate = true) {
      this.barChart?.destroy();
      this.barChart = createBarChart(this.find('bars'), this.find('bars-wrapper'), this.visible(), {
        unit: this.unit,
        showAverage: this.showAverage,
        instanceId: this.instanceId,
        animate,
        valueLabel: this.valueLabel,
      });
    }

    syncControls() {
      this.root.querySelectorAll('[data-attribute-unit]').forEach(button => {
        button.classList.toggle('active', button.dataset.attributeUnit === this.unit);
      });
      this.root.querySelectorAll('[data-attribute-compare]').forEach(button => {
        button.classList.toggle('active', (button.dataset.attributeCompare === 'average') === this.showAverage);
      });
    }

    renderGrid() {
      renderTraitsGrid(this.find('grid'), this.find('search-empty'), this.traits, this.visibleTraits, this.query, () => {
        this.renderGrid();
        this.announce();
        if (this.active) this.render(true);
      });
    }

    openModal() {
      // A filter left over from the last visit would hide most of the list with
      // nothing on screen explaining why, so every open starts from the whole set.
      this.query = '';
      const input = this.find('search');
      if (input) input.value = '';
      this.renderGrid();
      openModalBackdrop(this.find('modal'));
    }

    // Closed, the modal says what was picked once (attribute-charts-closed):
    // a root that asks the server for its picks (the team page's Comparar)
    // does so then, not on every chip.
    closeModal() {
      const modal = this.find('modal');
      if (!modal || modal.hidden || modal.dataset.closeTimerId) return;

      closeModalBackdrop(modal);
      this.announce('attribute-charts-closed');
    }

    onClick(event) {
      const sortButton = event.target.closest('[data-ranking-sort]');
      if (sortButton) {
        this.rankingSort = nextRankingSort(this.rankingSort, sortButton.dataset.rankingSort);
        this.renderRanking();
        return;
      }

      const unitButton = event.target.closest('[data-attribute-unit]');
      if (unitButton) {
        const next = [UNIT_VALUE, UNIT_TOTAL].includes(unitButton.dataset.attributeUnit) ? unitButton.dataset.attributeUnit : UNIT_PERCENTILE;
        if (next !== this.unit) {
          this.unit = next;
          this.syncControls();
          this.announce();
          if (this.active) this.render(true);
        }
        return;
      }

      const compareButton = event.target.closest('[data-attribute-compare]');
      if (compareButton) {
        const next = compareButton.dataset.attributeCompare === 'average';
        if (next !== this.showAverage) {
          this.showAverage = next;
          this.syncControls();
          if (this.active) this.drawBars(true);
        }
        return;
      }

      if (event.target.closest('[data-attribute-open-modal]')) {
        this.openModal();
        return;
      }

      if (event.target.closest('[data-attribute-modal-close]')) {
        this.closeModal();
        return;
      }

      if (event.target.closest('[data-attribute-modal-clear]')) {
        this.visibleTraits.clear();
        this.renderGrid();
        this.announce();
        if (this.active) this.render(true);
        return;
      }

      const modal = this.find('modal');
      if (modal && event.target === modal) {
        this.closeModal();
      }
    }

    destroy() {
      this.root.removeEventListener('click', this.handleClick);
      this.root.removeEventListener('input', this.handleInput);
      document.removeEventListener('keydown', this.handleKeydown);
      window.removeEventListener('resize', this.handleResize);
      this.barChart?.destroy();
      this.barChart = null;
      document.body.style.overflow = '';
    }
  }

  function boot() {
    document.querySelectorAll('[data-attribute-charts]').forEach(root => {
      const id = root.dataset.instanceId || 'attribute-charts';
      const existing = controllers.get(id);

      if (existing?.root === root) {
        existing.sync();
        return;
      }

      existing?.destroy();
      controllers.set(id, new AttributeChartsController(root));
    });

    controllers.forEach((controller, id) => {
      if (!controller.root?.isConnected) {
        controller.destroy();
        controllers.delete(id);
      }
    });
  }

  window.StatiskicksAttributeCharts = {
    UNIT_PERCENTILE,
    UNIT_VALUE,
    UNIT_TOTAL,
    traitInUnit,
    formatMetric,
    formatSpanish,
    rankThird,
    rankingRows,
    nextRankingSort,
    hexToRgba,
    getTraitDisplayRatio,
    getTraitPopulationAverageRatio,
    getTraitChartBadgeLabel,
    valueTooltipLine,
    percentileTooltipLine,
    invertedValueRatio,
    drawPizzaChart,
    // Perfil's labels around its wheel, for Comparar's radar too (fase 6).
    drawRotatedLabel,
    rotatedLabelLines,
    createBarChart,
    renderTraitsGrid,
    normalizeTraitSearchText,
    defaultVisibleTraits,
    openModalBackdrop,
    closeModalBackdrop,
    boot,
    activate(instanceId) {
      boot();
      controllers.get(instanceId)?.activate();
    },
  };

  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('livewire:navigated', boot);
  document.addEventListener('livewire:navigating', () => {
    controllers.forEach(controller => controller.destroy());
    controllers.clear();
  });
  document.addEventListener('livewire:init', () => {
    if (window.Livewire?.hook) {
      window.Livewire.hook('morph.updated', () => requestAnimationFrame(boot));
    }
  });

  // A theme flip repaints the same numbers: no regrow.
  new MutationObserver(() => {
    controllers.forEach(controller => {
      if (controller.active) {
        controller.drawRadar(false);
        controller.drawBars(false);
      }
    });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  boot();
})();
