/*
  Mapa de portería (spec beta-final-changes fase 2): a goalkeeper's shots faced
  on his goal, seen from in front of it (his right post on the left), from
  OptaKeeperGoalmouthService's payload.

    window.StatiskicksGoalmouth.render(root, payload, emptyMessage)

  `root` is the partial's #playerGoalmouth. Three views and three filters
  (Todos, Sin penales, Solo penales), kept on the root's dataset so a redraw
  after new data keeps what the viewer picked:

  - Calor (the default): a heat map of the saves, of the goals or of both
    (data-heat, picked beside it), drawn by the platform's own heat map
    (window.StatiskicksHeatmap, heatmap.js): the same kernel and scale as
    the Perfil's and the event maps', with the goal as the pitch. Its kernel
    radius is the shared share (9.5 %) of the goal's width, about 70 cm: of
    its height, the pitch's own rule, it was 23 cm, and a keeper's 30-45
    shots a season drew as separate spots rather than a heat. The saves are
    in the platform's palette; the goals in a palette of their own (Dario,
    6 Nov), rose to violet on paper and wine to pale pink on the dark card,
    a family the platform's never uses. Ambos is the two maps as they are,
    one over the other: the saves', then the goals' on top (Dario, 6 Nov).
    Painted on a canvas and embedded in the SVG as an image, so the download
    stays one SVG.
  - Remates: a dot a shot, its size the xGOT.
  - Zonas: a 3 × 3 grid by save percentage.

  The heat map's palette follows the theme, so a theme flip paints it again
  (the observer at the bottom).
*/
(function () {
  const NS = 'http://www.w3.org/2000/svg';

  // The goal in the SVG's 360 × 196 box: 3:1 as a real one (7.32 × 2.44 m).
  const GOAL = { left: 30, right: 330, top: 22, bottom: 122 };
  const GOAL_WIDTH = GOAL.right - GOAL.left;
  const GOAL_HEIGHT = GOAL.bottom - GOAL.top;

  // The heat's canvas: the goal at 3:1, enough pixels for the kernel's fade.
  const HEAT_WIDTH = 600;
  const HEAT_HEIGHT = 200;

  const HEAT_LABELS = { saves: 'atajadas', goals: 'goles' };

  /*
    The goals' heat palette (Dario, 6 Nov): the platform's shape - the same
    breakpoints, the same fade-in from the net, heatmap.js's gamma - in a
    family its own palette never uses, so goals read as goals beside saves
    and over them. Rose to deep violet on paper; wine to a pale pink on the
    dark card, brightening with density as the platform's does there.
  */
  const GOAL_GAMMA = 0.7;
  const GOAL_STEPS = 256;

  const GOAL_STOPS = {
    light: [
      [0.00, [255, 255, 255, 0]],
      [0.12, [249, 168, 212, 140]],
      [0.30, [236, 72, 153, 205]],
      [0.48, [190, 24, 93, 230]],
      [0.70, [134, 25, 143, 250]],
      [1.00, [76, 29, 149, 255]],
    ],
    dark: [
      [0.00, [0, 0, 0, 0]],
      [0.12, [131, 24, 67, 115]],
      [0.30, [190, 24, 93, 195]],
      [0.48, [236, 72, 153, 235]],
      [0.70, [249, 168, 212, 255]],
      [1.00, [253, 242, 248, 255]],
    ],
  };

  const goalPalettes = {};

  /* The goals' palette for a theme, the gamma baked in, as heatmap.js builds the platform's. */
  function goalPalette(theme) {
    if (goalPalettes[theme]) return goalPalettes[theme];
    const stops = GOAL_STOPS[theme];
    const palette = [];
    for (let i = 0; i < GOAL_STEPS; i++) {
      const t = Math.pow(i / (GOAL_STEPS - 1), GOAL_GAMMA);
      let at = 0;
      while (at < stops.length - 2 && t > stops[at + 1][0]) at++;
      const [t0, c0] = stops[at];
      const [t1, c1] = stops[at + 1];
      const p = Math.min(1, Math.max(0, (t - t0) / Math.max(0.0001, t1 - t0)));
      palette.push(c0.map((value, k) => Math.round(value + (c1[k] - value) * p)));
    }
    goalPalettes[theme] = palette;
    return palette;
  }

  /* A density field in the goals' palette, cells at or over `reference` at full heat. */
  function colorizeGoals({ values, width, height }, reference) {
    const palette = goalPalette(currentTheme());
    const image = new ImageData(width, height);
    for (let i = 0; i < values.length; i++) {
      if (!values[i]) continue;
      image.data.set(palette[Math.round(Math.min(1, values[i] / reference) * (GOAL_STEPS - 1))], i * 4);
    }
    return image;
  }

  function currentTheme() {
    return window.StatiskicksHeatmap?.isDark() ? 'dark' : 'light';
  }

  const SUMMARY = [
    ['faced', 'Remates a puerta', 0],
    ['saves', 'Atajadas', 0],
    ['goals', 'Goles recibidos', 0],
    ['save_pct', '% de atajadas', 1, ' %'],
    ['xgot', 'xGOT recibido', 2],
    ['prevented', 'Goles prevenidos', 2],
  ];

  function el(tag, attrs = {}, text = null) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text !== null) node.textContent = text;
    return node;
  }

  // Decimals with a point, as the rest of the platform's figures.
  function figure(value, decimals, suffix = '') {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return Number(value).toFixed(decimals) + suffix;
  }

  function signed(value) {
    if (value === null || value === undefined) return '—';
    const fixed = Number(value).toFixed(2);
    return Number(value) > 0 ? '+' + fixed : fixed;
  }

  // --- Heat --------------------------------------------------------------

  /*
    The shots of one outcome as the shared heat map's points: 0–100 across,
    from the keeper's right post (the left, seen from in front), and up from the ground.
  */
  function heatPoints(shots, outcome) {
    return shots
      .filter(shot => Boolean(shot.goal) === (outcome === 'goals'))
      .map(shot => ({ x: shot.x * 100, y: shot.y * 100 }));
  }

  /*
    One outcome's heat map over the goal, or null with no shot of it: the
    platform's (heatmap.js), the saves in its palette and the goals in
    their own (colorizeGoals()).
  */
  function heatImage(points, width = HEAT_WIDTH, height = HEAT_HEIGHT, outcome = 'saves') {
    const heatmap = window.StatiskicksHeatmap;
    if (!heatmap || !points.length) return null;
    const options = {
      width,
      height,
      // The radius's reference: the goal's width, not its height (see the header).
      shortSide: width,
      project: (x, y) => [(x / 100) * width, (1 - y / 100) * height],
    };
    if (outcome !== 'goals') return heatmap.buildImage(points, options);
    const field = heatmap.density(points, options);
    return field ? colorizeGoals(field, field.reference) : null;
  }

  function imageHref(imageData) {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  // An outcome's palette left to right, as the legend's strip: its colorize() over a ramp.
  function legendHref(outcome = 'saves') {
    const heatmap = window.StatiskicksHeatmap;
    if (!heatmap) return null;
    const width = 150;
    const values = new Float32Array(width);
    for (let i = 0; i < width; i++) values[i] = (i + 1) / width;
    const field = { values, width, height: 1 };
    return imageHref(outcome === 'goals' ? colorizeGoals(field, 1) : heatmap.colorize(field, 1));
  }

  function drawHeat(svg, shots, outcome) {
    const both = outcome === 'both';
    const own = both ? shots : shots.filter(shot => Boolean(shot.goal) === (outcome === 'goals'));
    // Ambos: the two maps as they are, the saves' first and the goals' on top.
    const layers = both ? ['saves', 'goals'] : [outcome];

    layers.forEach(layer => {
      const image = heatImage(heatPoints(shots, layer), HEAT_WIDTH, HEAT_HEIGHT, layer);
      const href = image ? imageHref(image) : null;
      if (!href) return;
      // Under the posts, over the net: the frame stays drawn on top of the heat.
      svg.insertBefore(el('image', {
        class: 'sk-goalmouth__heat',
        'data-goalmouth-layer': layer,
        x: GOAL.left, y: GOAL.top, width: GOAL_WIDTH, height: GOAL_HEIGHT,
        preserveAspectRatio: 'none',
        href,
      }), svg.querySelector('.sk-goalmouth__posts'));
    });

    // Each shot of that outcome, faint, still there to hover; with Ambos a goal's is filled.
    const marks = el('g', { class: 'sk-goalmouth__marks' });
    own.forEach(shot => marks.appendChild(el('circle', {
      class: 'sk-goalmouth__mark' + (both && shot.goal ? ' sk-goalmouth__mark--goal' : ''),
      cx: (GOAL.left + shot.x * GOAL_WIDTH).toFixed(1),
      cy: (GOAL.bottom - shot.y * GOAL_HEIGHT).toFixed(1),
      r: 2.2,
      tabindex: 0,
      'data-sk-tip-title': shot.rival ? 'vs ' + shot.rival : 'Remate',
      'data-sk-tip': tooltip(shot),
    })));
    svg.appendChild(marks);

    const legend = el('g', { class: 'sk-goalmouth__legend' });

    if (both) {
      // Each map's strip, less to more, and the counts.
      const goals = shots.filter(shot => shot.goal).length;
      [['saves', 'Atajadas', 0, 40], ['goals', 'Goles', 112, 29]].forEach(([layer, label, at, gap]) => {
        legend.appendChild(el('text', { x: GOAL.left + at, y: 168 }, label));
        const strip = legendHref(layer);
        if (strip) legend.appendChild(el('image', { x: GOAL.left + at + gap, y: 161, width: 60, height: 8, preserveAspectRatio: 'none', href: strip }));
      });
      legend.appendChild(el('text', { x: GOAL.right, y: 168, 'text-anchor': 'end' }, `${shots.length - goals} atajadas · ${goals} goles`));
      legend.appendChild(el('text', { x: GOAL.left, y: 184 }, 'Cada mapa en su escala: más intenso, más remates'));
      svg.appendChild(legend);
      return;
    }

    if (!own.length) {
      legend.appendChild(el('text', { x: GOAL.left, y: 172 }, `Sin ${HEAT_LABELS[outcome]} en este periodo`));
    } else {
      const strip = legendHref(outcome);
      legend.appendChild(el('text', { x: GOAL.left, y: 172 }, 'Menos'));
      if (strip) legend.appendChild(el('image', { x: GOAL.left + 34, y: 165, width: 120, height: 8, preserveAspectRatio: 'none', href: strip }));
      legend.appendChild(el('text', { x: GOAL.left + 160, y: 172 }, `Más ${HEAT_LABELS[outcome]}`));
      legend.appendChild(el('text', { x: GOAL.right, y: 172, 'text-anchor': 'end' }, `${own.length} ${HEAT_LABELS[outcome]}`));
    }
    svg.appendChild(legend);
  }

  function goalFrame(svg) {
    const net = el('g', { class: 'sk-goalmouth__net' });
    for (let x = GOAL.left + 25; x < GOAL.right; x += 25) net.appendChild(el('line', { x1: x, y1: GOAL.top, x2: x, y2: GOAL.bottom }));
    for (let y = GOAL.top + 20; y < GOAL.bottom; y += 20) net.appendChild(el('line', { x1: GOAL.left, y1: y, x2: GOAL.right, y2: y }));
    svg.appendChild(net);
    svg.appendChild(el('line', { class: 'sk-goalmouth__ground', x1: 6, y1: GOAL.bottom, x2: 354, y2: GOAL.bottom }));
    svg.appendChild(el('path', {
      class: 'sk-goalmouth__posts',
      d: `M ${GOAL.left} ${GOAL.bottom} L ${GOAL.left} ${GOAL.top} L ${GOAL.right} ${GOAL.top} L ${GOAL.right} ${GOAL.bottom}`,
    }));
    // Seen from in front of the goal (Dario, 6 Nov): the keeper's right on the left.
    svg.appendChild(el('text', { class: 'sk-goalmouth__side', x: GOAL.left, y: GOAL.bottom + 16, 'text-anchor': 'start' }, 'Derecha del portero'));
    svg.appendChild(el('text', { class: 'sk-goalmouth__side', x: GOAL.right, y: GOAL.bottom + 16, 'text-anchor': 'end' }, 'Izquierda del portero'));
  }

  function radius(xgot) {
    return xgot === null || xgot === undefined ? 5 : 3.5 + 9 * Math.sqrt(Math.max(0, xgot));
  }

  function tooltip(shot) {
    const lines = [
      shot.goal ? 'Gol' : 'Atajado',
      `Minuto ${shot.minute}'` + (shot.penalty ? ' · penal' : '') + (shot.head ? ' · de cabeza' : ''),
    ];
    if (shot.xgot !== null && shot.xgot !== undefined) lines.push(`xGOT ${Number(shot.xgot).toFixed(2)}`);
    return lines.join('\n');
  }

  function drawShots(svg, shots) {
    // Saves under goals, the biggest first, so a small shot stays on top to hover.
    const ordered = shots.slice().sort((a, b) => (Number(a.goal) - Number(b.goal)) || (radius(b.xgot) - radius(a.xgot)));
    const layer = el('g', { class: 'sk-goalmouth__shots' });

    ordered.forEach(shot => {
      const dot = el('circle', {
        class: 'sk-goalmouth__shot ' + (shot.goal ? 'sk-goalmouth__shot--goal' : 'sk-goalmouth__shot--save'),
        cx: (GOAL.left + shot.x * GOAL_WIDTH).toFixed(1),
        cy: (GOAL.bottom - shot.y * GOAL_HEIGHT).toFixed(1),
        r: radius(shot.xgot).toFixed(1),
        tabindex: 0,
        'data-sk-tip-title': shot.rival ? 'vs ' + shot.rival : 'Remate',
        'data-sk-tip': tooltip(shot),
      });
      layer.appendChild(dot);
    });

    svg.appendChild(layer);

    const legend = el('g', { class: 'sk-goalmouth__legend' });
    legend.appendChild(el('circle', { class: 'sk-goalmouth__shot sk-goalmouth__shot--save', cx: 36, cy: 172, r: 5 }));
    legend.appendChild(el('text', { x: 46, y: 176 }, 'Atajado'));
    legend.appendChild(el('circle', { class: 'sk-goalmouth__shot sk-goalmouth__shot--goal', cx: 112, cy: 172, r: 5 }));
    legend.appendChild(el('text', { x: 122, y: 176 }, 'Gol'));
    legend.appendChild(el('text', { x: GOAL.right, y: 176, 'text-anchor': 'end' }, 'Tamaño: xGOT'));
    svg.appendChild(legend);
  }

  function zoneGrade(pct) {
    if (pct === null || pct === undefined) return 'none';
    if (pct >= 70) return 'high';
    if (pct >= 40) return 'mid';
    return 'low';
  }

  function drawZones(svg, zones) {
    const cellWidth = GOAL_WIDTH / 3;
    const cellHeight = GOAL_HEIGHT / 3;
    const layer = el('g', { class: 'sk-goalmouth__zones' });

    (zones || []).forEach((row, rowIndex) => row.forEach((cell, columnIndex) => {
      const x = GOAL.left + columnIndex * cellWidth;
      const y = GOAL.top + rowIndex * cellHeight;
      layer.appendChild(el('rect', {
        class: 'sk-goalmouth__zone sk-goalmouth__zone--' + zoneGrade(cell.save_pct),
        x: x + 1, y: y + 1, width: cellWidth - 2, height: cellHeight - 2, rx: 3,
        tabindex: 0,
        'data-sk-tip-title': 'Zona',
        'data-sk-tip': cell.shots > 0
          ? `${cell.saves} atajadas de ${cell.shots} remates\n${cell.goals} goles`
          : 'Sin remates',
      }));
      if (cell.shots > 0) {
        layer.appendChild(el('text', { class: 'sk-goalmouth__zone-pct', x: x + cellWidth / 2, y: y + cellHeight / 2 + 1, 'text-anchor': 'middle' }, `${Math.round(cell.save_pct)} %`));
        layer.appendChild(el('text', { class: 'sk-goalmouth__zone-count', x: x + cellWidth / 2, y: y + cellHeight / 2 + 14, 'text-anchor': 'middle' }, `${cell.saves}/${cell.shots}`));
      }
    }));

    svg.appendChild(layer);

    const legend = el('g', { class: 'sk-goalmouth__legend' });
    legend.appendChild(el('text', { x: GOAL.left, y: 176 }, '% de atajadas por zona · atajadas / remates'));
    svg.appendChild(legend);
  }

  function drawSummary(list, summary) {
    list.replaceChildren();
    SUMMARY.forEach(([key, label, decimals, suffix]) => {
      const term = document.createElement('dt');
      term.textContent = label;
      const value = document.createElement('dd');
      value.textContent = key === 'prevented' ? signed(summary?.[key]) : figure(summary?.[key], decimals, suffix || '');
      if (key === 'prevented' && summary?.[key] !== null && summary?.[key] !== undefined) {
        value.classList.add(summary[key] >= 0 ? 'is-positive' : 'is-negative');
      }
      const item = document.createElement('div');
      item.append(term, value);
      list.appendChild(item);
    });
  }

  function syncControls(root) {
    root.querySelectorAll('[data-goalmouth-view]').forEach(button => button.classList.toggle('active', button.dataset.goalmouthView === root.dataset.view));
    root.querySelectorAll('[data-goalmouth-filter]').forEach(button => button.classList.toggle('active', button.dataset.goalmouthFilter === root.dataset.filter));
    root.querySelectorAll('[data-goalmouth-heat]').forEach(button => button.classList.toggle('active', button.dataset.goalmouthHeat === (root.dataset.heat || 'saves')));

    // Atajadas | Goles | Ambos only while Calor is shown.
    const heatChoice = root.querySelector('[data-goalmouth-heat-choice]');
    if (heatChoice) heatChoice.hidden = (root.dataset.view || 'heat') !== 'heat';
  }

  function draw(root) {
    const svg = root.querySelector('[data-goalmouth-svg]');
    const summaryList = root.querySelector('[data-goalmouth-summary]');
    const empty = root.querySelector('[data-goalmouth-empty]');
    if (!svg || !summaryList || !empty) return;

    const payload = root.__goalmouth || null;
    const filter = root.dataset.filter || 'all';
    const view = root.dataset.view || 'heat';
    const summary = payload?.summary?.[filter] || null;

    syncControls(root);
    svg.replaceChildren();
    goalFrame(svg);

    const faced = summary?.faced || 0;
    empty.hidden = faced > 0 || payload === null;
    empty.textContent = payload && faced === 0 ? (root.__goalmouthEmpty || 'Sin remates a puerta recibidos en este periodo.') : '';

    if (payload && faced > 0) {
      const shots = (payload.shots || []).filter(shot => filter === 'all' || (filter === 'penalties') === Boolean(shot.penalty));

      if (view === 'zones') {
        drawZones(svg, payload.zones?.[filter]);
      } else if (view === 'shots') {
        drawShots(svg, shots);
      } else {
        drawHeat(svg, shots, ['goals', 'both'].includes(root.dataset.heat) ? root.dataset.heat : 'saves');
      }
    }

    drawSummary(summaryList, summary);
  }

  function render(root, payload, emptyMessage) {
    if (!root) return;
    root.__goalmouth = payload || null;
    root.__goalmouthEmpty = emptyMessage || null;
    draw(root);
  }

  if (!window.__goalmouthClickRegistered) {
    window.__goalmouthClickRegistered = true;
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-goalmouth-view], [data-goalmouth-filter], [data-goalmouth-heat]');
      const root = button?.closest('.sk-goalmouth');
      if (!root) return;

      if (button.dataset.goalmouthView) root.dataset.view = button.dataset.goalmouthView;
      if (button.dataset.goalmouthFilter) root.dataset.filter = button.dataset.goalmouthFilter;
      if (button.dataset.goalmouthHeat) root.dataset.heat = button.dataset.goalmouthHeat;
      draw(root);
    });
  }

  // The heat reads the theme's colours when it paints: a flip paints it again.
  if (!window.__goalmouthThemeObserved && typeof MutationObserver !== 'undefined') {
    window.__goalmouthThemeObserved = true;
    new MutationObserver(() => {
      document.querySelectorAll('.sk-goalmouth').forEach(root => {
        if (root.__goalmouth && (root.dataset.view || 'heat') === 'heat') draw(root);
      });
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  // heatPoints() and heatImage() are exposed for checking the heat without a page.
  window.StatiskicksGoalmouth = { render, heatPoints, heatImage };
})();
