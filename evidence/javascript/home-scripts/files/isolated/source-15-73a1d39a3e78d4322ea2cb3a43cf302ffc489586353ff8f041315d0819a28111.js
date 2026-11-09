(function () {
  'use strict';

  if (window.StatiskicksEventMap) return;

  const controllers = new Map();

  /*
    One read of the stylesheet per pitch draw. The map used to branch on
    data-theme at five separate points, each with its own light value picked in
    isolation - a 45%-black pitch line under a 18%-black zone grid under #102016
    zone counts - which is why the light map never looked like one drawing.
  */
  function readMapInk() {
    const styles = getComputedStyle(document.documentElement);
    const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;

    return {
      pitchLine: read('--pitch-line', 'rgba(16,21,17,0.26)'),
      grid: read('--chart-grid', 'rgba(16,21,17,0.14)'),
      label: read('--chart-label', '#141A15'),
      tick: read('--chart-tick', '#55625A'),
      series: read('--chart-series', '#2C7A55'),
      seriesFill: read('--chart-series-fill', 'rgba(33,110,78,0.16)'),
      surface: read('--chart-surface', '#ffffff'),
      outline: read('--chart-outline', 'rgba(16,21,17,0.26)'),
      rankHigh: read('--rank-high', '#93CC63'),
      rankMid: read('--rank-mid', '#F0C32E'),
      rankLow: read('--rank-low', '#F2924A'),
      // The zones of control in the win and loss inks, as xG for and against are.
      controlled: read('--result-win', '#1F7A68'),
      conceded: read('--result-loss', '#AE4444'),
    };
  }

  function parseJson(value, fallback = {}) {
    try {
      return JSON.parse(value || '');
    } catch {
      return fallback;
    }
  }

  /*
    What a legend swatch or an xT band paints with. xT reuses the percentile
    bands - high threat reads as the same green a top-ranked stat does - and a
    pass that gives threat away drops to the muted tick ink.
  */
  function swatchColor(ink, swatch) {
    return {
      primary: ink.series,
      secondary: ink.tick,
      'xt-negative': ink.tick,
      'xt-low': ink.rankLow,
      'xt-mid': ink.rankMid,
      'xt-high': ink.rankHigh,
      controlled: ink.controlled,
      conceded: ink.conceded,
      contested: ink.grid,
    }[swatch] || ink.series;
  }

  /*
    Below this many weighted events the heatmap draws the events themselves:
    the density is scaled to its own hottest cells, so a handful of isolated
    events would each draw at full heat - hot spots that aren't there.
  */
  const MIN_HEATMAP_POINTS = 10;
  const SPARSE_HEATMAP_MESSAGE = 'Muy pocos eventos para un mapa de calor: se muestran como puntos.';

  /*
    Mark sizes, in CSS pixels on a 700 px-wide pitch. markUnit() scales them
    with the pitch, so the wide desktop map draws marks to its size and a
    phone's doesn't swell them. One place to tune how dense the map reads.
  */
  const MARKS = {
    dot: 5.5,
    hullDot: 4.5,
    shot: 5,            // a shot's radius without a reliable xG, and its floor with one
    shotXg: 14,         // + this x sqrt(xG)
    shotMax: 16,
    arrowWidth: 2.5,
    originDot: 1.4,     // an arrow's origin dot radius, as a multiple of its width
    headLength: 11,
    headMin: 5,
    headAngle: 0.5,     // half the head's opening, in radians
    headMaxShare: 0.4,  // a head is at most this share of its pass - short passes keep a shaft
  };
  const MARK_REFERENCE_PITCH = 700;

  /*
    How much a crowded map thins its marks: full size up to 80 events, ~75% at
    400, never under 65% - a season's worth of thick arrows is a solid block.
  */
  function crowding(count) {
    if (count <= 80) return 1;
    return Math.max(0.65, Math.min(1, 1 - 0.35 * Math.log10(count / 80)));
  }

  /*
    The draw order inside a view: misses, give-aways and key passes under
    completions, threat and assists, so what a scout looks for stays on top.
  */
  function markRank(point) {
    if (point.xt_band) return { negative: 0, low: 1, mid: 2, high: 3 }[point.xt_band] ?? 1;
    if (point.chance) return point.chance === 'assist' ? 1 : 0;
    if (point.goal !== undefined) return point.goal ? 1 : 0;
    if (point.accurate === false || point.success === false) return 0;
    return 1;
  }

  /*
    The painters, outside the controller so the league page's small multiples
    (league-maps.js) draw the same pitch, dots, arrows and zones as this map:
    one drawing, whatever page it is on. The controller's draw* methods call
    them and add their own hover targets through the callbacks.
  */
  function paintPitch(ctx, width, height) {
    /*
      The pitch and everything drawn on it read the --chart-* / --pitch-* set,
      so the map matches the card it sits in. `ink` rides along on the metrics
      object the same way `isDark` used to, which is what the zone, scatter
      and dot painters below read.
    */
    const ink = readMapInk();
    const lineColor = ink.pitchLine;
    const pad = { l: width * .035, r: width * .035, t: height * .075, b: height * .075 };
    const pw = width - pad.l - pad.r;
    const ph = height - pad.t - pad.b;
    const px = value => pad.l + (Number(value) / 100) * pw;
    const py = value => pad.t + (Number(value) / 100) * ph;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = lineColor;
    ctx.fillStyle = lineColor;
    ctx.lineWidth = Math.max(1, 1.5 * (window.devicePixelRatio || 1));
    ctx.strokeRect(px(0), py(0), pw, ph);
    ctx.beginPath(); ctx.moveTo(px(50), py(0)); ctx.lineTo(px(50), py(100)); ctx.stroke();
    ctx.beginPath(); ctx.arc(px(50), py(50), pw * .09, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(px(50), py(50), 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeRect(px(0), py(28), pw * .12, ph * .44);
    ctx.strokeRect(px(88), py(28), pw * .12, ph * .44);
    ctx.strokeRect(px(0), py(39), pw * .05, ph * .22);
    ctx.strokeRect(px(95), py(39), pw * .05, ph * .22);
    ctx.beginPath(); ctx.arc(px(12), py(50), 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px(88), py(50), 2, 0, Math.PI * 2); ctx.fill();
    // One mark-size pixel in canvas pixels; see MARKS.
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const unit = Math.max(0.85, Math.min(1.5, (pw / scale) / MARK_REFERENCE_PITCH)) * scale;
    return { width, height, pw, ph, px, py, ink, scale, unit };
  }

  /*
    `width` is in mark units. The shaft stops at the head's base, so a thick
    shaft doesn't poke out beside the point and a translucent arrow isn't
    painted twice where they would overlap. A short pass's head shrinks to
    MARKS.headMaxShare of it, keeping a shaft, but not under MARKS.headMin.
  */
  function paintArrow(ctx, metrics, point, color, alpha, width) {
    const sx = metrics.px(point.x), sy = metrics.py(point.y), ex = metrics.px(point.end_x), ey = metrics.py(point.end_y);
    const length = Math.hypot(ex - sx, ey - sy);
    if (length < 0.5) return;
    const angle = Math.atan2(ey - sy, ex - sx);
    const head = Math.max(MARKS.headMin * metrics.unit, Math.min(MARKS.headLength * metrics.unit, length * MARKS.headMaxShare));
    const back = head * Math.cos(MARKS.headAngle);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width * metrics.unit;
    ctx.lineCap = 'round';
    if (length > back) {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex - back * Math.cos(angle), ey - back * Math.sin(angle));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - head * Math.cos(angle - MARKS.headAngle), ey - head * Math.sin(angle - MARKS.headAngle));
    ctx.lineTo(ex - head * Math.cos(angle + MARKS.headAngle), ey - head * Math.sin(angle + MARKS.headAngle));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /*
    `radius` is in mark units. The ring is the card's own surface, so dots
    that overlap stay apart and read as solid colour in either theme.
  */
  function paintDot(ctx, metrics, x, y, radius, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.strokeStyle = metrics.ink.surface;
    ctx.lineWidth = metrics.scale;
    ctx.beginPath(); ctx.arc(metrics.px(x), metrics.py(y), radius * metrics.unit, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /*
    Arrows for passes, sized dots for shots, plain dots for the rest. Misses
    fade so completions lead unless `fadeMisses` is off (one result focused:
    there is nothing to lead). `onPoint(point, radius)` and `onArrow(point,
    width)` hear of every mark drawn, for hover targets.
  */
  function paintScatter(ctx, metrics, points, payload, { fadeMisses = true, onPoint = null, onArrow = null } = {}) {
    const primary = metrics.ink.series;
    const secondary = metrics.ink.tick;
    const k = crowding(points.length);
    const ordered = points.map((point, index) => ({ point, index }))
      .sort((a, b) => markRank(a.point) - markRank(b.point) || a.index - b.index)
      .map(entry => entry.point);

    ordered.forEach(point => {
      if (point.end_x !== undefined && point.end_y !== undefined) {
        let color = point.accurate === false ? secondary : primary;
        let alpha = point.accurate === false && fadeMisses ? .45 : .85;
        if (point.xt_band) {
          color = swatchColor(metrics.ink, `xt-${point.xt_band}`);
          alpha = point.xt_band === 'negative' ? .4 : .85;
        } else if (point.chance) {
          color = point.chance === 'assist' ? primary : secondary;
          alpha = .85;
        }
        const width = MARKS.arrowWidth * k;
        paintArrow(ctx, metrics, point, color, alpha * k, width);
        // A shade stronger than its arrow, so a faded miss doesn't start at a solid dot.
        paintDot(ctx, metrics, point.x, point.y, width * MARKS.originDot, color, Math.min(.95, alpha * k + .1));
        onArrow?.(point, width);
      } else if (payload.kind === 'shot') {
        const reliableXg = payload.summary?.xg_reliable === true && Number.isFinite(Number(point.xg));
        const size = reliableXg
          ? Math.min(MARKS.shotMax, MARKS.shot + Math.sqrt(Number(point.xg)) * MARKS.shotXg)
          : MARKS.shot;
        paintDot(ctx, metrics, point.x, point.y, size, point.goal ? primary : secondary, .85 * k);
        onPoint?.(point, size);
      } else {
        const success = point.success === undefined ? true : Boolean(point.success);
        paintDot(ctx, metrics, point.x, point.y, MARKS.dot, success ? primary : secondary, (success || !fadeMisses ? .9 : .55) * k);
        onPoint?.(point, MARKS.dot);
      }
    });
  }

  /*
    The 5 x 6 zone grid, each cell washed by its value against `max` and
    labelled. By default the value is the zone's count against the map's own
    busiest zone; the league page passes a per-match value and one maximum
    for every team, and drops the labels when a cell is too small for them.
  */
  function paintZones(ctx, metrics, zones, { value = zone => Number(zone.count || 0), max = null, label = null, fontSize = 12 } = {}) {
    const top = max ?? Math.max(1, ...zones.map(zone => value(zone)));
    zones.forEach(zone => {
      const x = metrics.px(Number(zone.col || 0) * 20);
      const y = metrics.py(Number(zone.row || 0) * (100 / 6));
      const w = metrics.pw / 5;
      const h = metrics.ph / 6;
      const amount = value(zone);
      ctx.fillStyle = `rgba(130,196,90,${.14 + .48 * Math.min(1, amount / Math.max(top, 1e-9))})`;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = metrics.ink.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      const text = label ? label(zone) : (() => {
        const rate = zone.success_rate !== null && zone.success_rate !== undefined ? ` / ${Number(zone.success_rate).toFixed(0)}%` : '';
        return `${Number(zone.count || 0)}${rate}`;
      })();
      if (!text) return;
      ctx.fillStyle = metrics.ink.label;
      ctx.font = `700 ${fontSize * Math.min(2, window.devicePixelRatio || 1)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + w / 2, y + h / 2);
    });
  }

  /*
    The zones of control (OptaZoneControl, SK-10.4): the 6 x 4 grid, a
    controlled zone washed in the win ink and a conceded one in the loss ink,
    deeper the further its share is from even; a contested one is left to the
    pitch. Each zone reads its share - the team's percentage of the touches
    there - faintly when too few touches were made there to judge it. The
    share is on one scale for every team, so the league page's maps compare.
  */
  function paintControl(ctx, metrics, control, { fontSize = 13, labels = true, onCell = null } = {}) {
    const cols = Number(control?.cols || 6);
    const rows = Number(control?.rows || 4);
    const w = metrics.pw / cols;
    const h = metrics.ph / rows;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    (control?.cells || []).forEach(cell => {
      const x = metrics.px(0) + Number(cell.col) * w;
      const y = metrics.py(0) + Number(cell.row) * h;
      const color = { controlled: metrics.ink.controlled, conceded: metrics.ink.conceded }[cell.state];
      ctx.save();
      if (color) {
        // From the threshold's light wash to the full one 30 points off even.
        ctx.globalAlpha = .2 + .4 * Math.min(1, Math.abs(Number(cell.share) - 50) / 30);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = metrics.ink.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      if (labels && cell.share !== null && cell.share !== undefined) {
        ctx.globalAlpha = cell.sparse ? .45 : 1;
        ctx.fillStyle = metrics.ink.label;
        ctx.font = `700 ${fontSize * scale}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(cell.share), x + w / 2, y + h / 2);
      }
      ctx.restore();
      onCell?.(cell, { x, y, w, h });
    });
  }

  const CONTROL_STATES = { controlled: 'Controlada', conceded: 'Cedida', contested: 'Disputada' };

  /* The views that draw their own grid of server-built zones: no divisions, focus or result toggle on them. */
  const GRID_VIEWS = ['zone_plot', 'control'];

  /*
    The pitch divisions every view (but the zone plot, which has its own grid)
    draws under its events, and the cells a click focuses on. Thirds run along
    the attack; the 18 zones split each third into two columns and the width
    into three lanes, numbered from the own goal column by column, top lane
    first. The top of this pitch is the team's left - the builder flips Opta's
    y - so zone 1 is the left of the defensive third and zone 14 the front of
    the box.
  */
  const DIVISIONS = {
    thirds: { cols: 3, rows: 1 },
    zones: { cols: 6, rows: 3 },
  };
  const THIRD_LABELS = ['Tercio defensivo', 'Tercio medio', 'Tercio ofensivo'];

  function divisionCell(division, x, y) {
    const { cols, rows } = DIVISIONS[division];
    const col = Math.min(cols - 1, Math.max(0, Math.floor(Number(x) / (100 / cols))));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(Number(y) / (100 / rows))));
    return col * rows + row;
  }

  function cellBounds(division, cell) {
    const { cols, rows } = DIVISIONS[division];
    const col = Math.floor(cell / rows);
    const row = cell % rows;
    return { x0: col * (100 / cols), x1: (col + 1) * (100 / cols), y0: row * (100 / rows), y1: (row + 1) * (100 / rows) };
  }

  /*
    What a focus is called: a third by name, zones by number ("Zonas 4, 5 y
    14"), or by count once a list would outgrow the chip.
  */
  function focusLabel(division, cells) {
    if (division === 'thirds') return THIRD_LABELS[cells[0]];
    if (cells.length === 1) return `Zona ${cells[0] + 1}`;
    if (cells.length > 4) return `${cells.length} zonas`;
    const numbers = cells.map(cell => cell + 1);
    return `Zonas ${numbers.slice(0, -1).join(', ')} y ${numbers[numbers.length - 1]}`;
  }

  /*
    Thirds (or the 18 zones) under the events, in the zone grid's ink and
    dashed so they read as a guide, not as pitch markings: long dashes for
    the thirds, short ones for the cells inside them. The third names sit
    under the pitch, the zone numbers in each cell's corner.
  */
  function paintDivisions(ctx, metrics, division) {
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const zones = division === 'zones';
    const line = (x0, y0, x1, y1, dash) => {
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(metrics.px(x0), metrics.py(y0));
      ctx.lineTo(metrics.px(x1), metrics.py(y1));
      ctx.stroke();
    };

    ctx.save();
    ctx.strokeStyle = metrics.ink.grid;
    ctx.lineWidth = scale;
    [100 / 3, 200 / 3].forEach(x => line(x, 0, x, 100, [6 * scale, 4 * scale]));
    if (zones) {
      // x = 50 is the halfway line the pitch already draws.
      [100 / 6, 500 / 6].forEach(x => line(x, 0, x, 100, [2 * scale, 4 * scale]));
      [100 / 3, 200 / 3].forEach(y => line(0, y, 100, y, [2 * scale, 4 * scale]));
    }
    ctx.setLineDash([]);

    ctx.fillStyle = metrics.ink.tick;
    ctx.font = `600 ${10 * scale}px system-ui, sans-serif`;
    if (zones) {
      ctx.globalAlpha = .55;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (let cell = 0; cell < 18; cell++) {
        const bounds = cellBounds('zones', cell);
        ctx.fillText(String(cell + 1), metrics.px(bounds.x0) + 5 * scale, metrics.py(bounds.y0) + 4 * scale);
      }
    }
    ctx.globalAlpha = .7;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelY = metrics.py(100) + (metrics.height - metrics.py(100)) / 2;
    THIRD_LABELS.forEach((label, third) => ctx.fillText(label, metrics.px(third * (100 / 3) + 100 / 6), labelY));
    ctx.restore();
  }

  /*
    Dims everything outside the focused cells and outlines each, before the
    events are drawn. The cells never overlap, so each one cuts its own hole
    in the shade under the even-odd rule.
  */
  function paintFocus(ctx, metrics, division, cells) {
    if (!cells.length) return;
    const rects = cells.map(cell => {
      const bounds = cellBounds(division, cell);
      const x = metrics.px(bounds.x0);
      const y = metrics.py(bounds.y0);
      return [x, y, metrics.px(bounds.x1) - x, metrics.py(bounds.y1) - y];
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, metrics.width, metrics.height);
    rects.forEach(rect => ctx.rect(...rect));
    ctx.globalAlpha = .7;
    ctx.fillStyle = metrics.ink.surface;
    ctx.fill('evenodd');
    ctx.globalAlpha = .9;
    ctx.strokeStyle = metrics.ink.series;
    ctx.lineWidth = 1.5 * metrics.scale;
    rects.forEach(rect => ctx.strokeRect(...rect));
    ctx.restore();
  }

  /*
    The insights panel under the summary, one per kind of map - the catalog
    names it as the event's `insights`. Each reads the points the map draws,
    so it follows a focused zone and the result toggle, and returns
    { title, stats: [{ label, value, tone? }], table: { head, rows } | null, notes }.
    A table with a single row says nothing a stat doesn't, so it is dropped.
  */
  const sumOf = (points, read) => points.reduce((total, point) => total + (Number(read(point)) || 0), 0);
  const share = (part, total) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '—');
  const decimal = (value, places = 2) => Number(value).toFixed(places);
  const signed = (value, places = 2) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(places)}`;
  const tableOf = (head, rows) => (rows.length > 1 ? { head, rows } : null);

  const INSIGHTS = {
    shots(points) {
      const total = points.length;
      const goals = points.filter(point => point.goal).length;
      // Every shot needs an xG for the sums to mean anything; the scatter's dot sizes ask the same.
      const reliable = total > 0 && points.every(point => point.xg !== null && point.xg !== undefined);
      const xg = sumOf(points, point => point.xg);
      const ifReliable = value => (reliable ? value : '—');
      const penalties = points.filter(point => point.penalty);

      const stats = [
        { label: 'Remates', value: total },
        { label: 'Goles', value: goals },
        { label: 'Conversión', value: share(goals, total) },
        { label: 'A puerta', value: points.filter(point => point.on_target).length },
        { label: 'xG', value: ifReliable(decimal(xg)) },
        { label: 'xG / remate', value: ifReliable(total ? decimal(xg / total) : '—') },
        { label: 'Goles − xG', value: ifReliable(signed(goals - xg)), tone: reliable ? (goals - xg >= 0 ? 'up' : 'down') : null },
      ];
      // A penalty is ~0.76 xG: without them the xG is the open game's.
      if (penalties.length && reliable) {
        stats.push({ label: 'xG sin penales', value: decimal(xg - sumOf(penalties, point => point.xg)) });
      }

      const notes = [];
      if (penalties.length) {
        const scored = penalties.filter(point => point.goal).length;
        notes.push(`Penales: ${penalties.length} (${scored} ${scored === 1 ? 'gol' : 'goles'})`);
      }
      if (total && !reliable) notes.push('xG no disponible para todos los remates.');

      const rows = [['right', 'Pie derecho'], ['left', 'Pie izquierdo'], ['head', 'Cabeza'], ['other', 'Otro']]
        .map(([part, label]) => {
          const shots = points.filter(point => point.body_part === part);
          return shots.length
            ? [label, shots.length, shots.filter(point => point.goal).length, ifReliable(decimal(sumOf(shots, point => point.xg)))]
            : null;
        })
        .filter(Boolean);

      return { title: 'Remates', stats, table: tableOf(['Perfil', 'Remates', 'Goles', 'xG'], rows), notes };
    },

    passes(points) {
      const total = points.length;
      const completed = point => point.accurate !== false;
      const done = points.filter(completed).length;

      // Where the passes start: the third that loses the ball shows up here.
      const rows = ['Defensivo', 'Medio', 'Ofensivo'].map((label, third) => {
        const passes = points.filter(point => divisionCell('thirds', point.x, point.y) === third);
        const made = passes.filter(completed).length;
        return passes.length ? [label, passes.length, made, share(made, passes.length)] : null;
      }).filter(Boolean);

      return {
        title: 'Pases',
        stats: [
          { label: 'Pases', value: total },
          { label: 'Completados', value: done },
          { label: '% completados', value: share(done, total) },
          { label: 'Progresivos', value: points.filter(point => point.progressive).length },
          { label: 'Al área', value: points.filter(point => point.into_box).length },
          // Rated for completed open-play passes only.
          { label: 'xT generado', value: decimal(sumOf(points, point => point.xt)) },
        ],
        table: tableOf(['Origen', 'Pases', 'Compl.', '%'], rows),
        notes: [],
      };
    },

    duels(points, { event }) {
      const total = points.length;
      const won = point => point.success !== false;
      const wins = points.filter(won).length;
      const wonLabel = event?.outcomes?.[0]?.label || 'Ganados';

      // Aerials alone split by side; otherwise in the air against on the ground.
      const groups = points.length && points.every(point => point.aerial)
        ? [['Defensivos', point => point.aerial_side === 'defensive'], ['Ofensivos', point => point.aerial_side === 'offensive']]
        : [['Aéreos', point => point.aerial], ['Al suelo', point => !point.aerial]];
      const rows = groups.map(([label, test]) => {
        const duels = points.filter(test);
        const duelWins = duels.filter(won).length;
        return duels.length ? [label, duels.length, duelWins, share(duelWins, duels.length)] : null;
      }).filter(Boolean);

      return {
        title: event?.key === 'tackles' ? 'Entradas' : 'Duelos',
        stats: [
          { label: event?.key === 'tackles' ? 'Entradas' : 'Duelos', value: total },
          { label: wonLabel, value: wins },
          { label: `% ${wonLabel.toLowerCase()}`, value: share(wins, total) },
        ],
        table: tableOf(['Tipo', 'Total', 'Ganados', '%'], rows),
        notes: [],
      };
    },

    xt(points) {
      const total = points.length;
      const xt = sumOf(points, point => point.xt);
      const rows = [['Pases', point => !point.carry], ['Conducciones', point => point.carry]].map(([label, test]) => {
        const actions = points.filter(test);
        return actions.length ? [label, actions.length, decimal(sumOf(actions, point => point.xt))] : null;
      }).filter(Boolean);

      const notes = [];
      const best = points.reduce((top, point) => (Number(point.xt) > Number(top?.xt ?? 0) ? point : top), null);
      if (best) {
        const minute = best.minute !== null && best.minute !== undefined ? ` · min ${best.minute}` : '';
        notes.push(`Mayor amenaza: ${signed(Number(best.xt), 3)} xT · ${best.carry ? 'Conducción' : 'Pase'}${minute}`);
      }

      return {
        title: 'Amenaza (xT)',
        stats: [
          { label: 'xT generado', value: decimal(xt) },
          { label: 'Acciones', value: total },
          { label: 'xT / acción', value: total ? decimal(xt / total, 3) : '—' },
          { label: 'Restan amenaza', value: points.filter(point => Number(point.xt) < 0).length },
        ],
        table: tableOf(['Acción', 'Acciones', 'xT'], rows),
        notes,
      };
    },

    chances(points) {
      const total = points.length;
      const assists = points.filter(point => point.chance === 'assist').length;
      const rows = [['cross', 'Centro'], ['through', 'Filtrado'], ['other', 'Otro pase']].map(([type, label]) => {
        const chances = points.filter(point => point.pass_type === type);
        return chances.length ? [label, chances.length, chances.filter(point => point.chance === 'assist').length] : null;
      }).filter(Boolean);
      const fromBox = points.filter(point => point.from_box).length;

      return {
        title: 'Creación',
        stats: [
          { label: 'Ocasiones', value: total },
          { label: 'Asistencias', value: assists },
          { label: 'Pases clave', value: total - assists },
          // An assist is the chance a goal came from.
          { label: 'Acabaron en gol', value: share(assists, total) },
        ],
        table: tableOf(['Tipo', 'Ocasiones', 'Asist.'], rows),
        notes: fromBox ? [`Desde dentro del área: ${fromBox}`] : [],
      };
    },

    // Not over the points - the touches stay on the server - but the zones' own counts.
    control(points, { payload }) {
      const control = payload?.control || {};
      const total = (control.cells || []).length;
      return {
        title: `${Number(control.controlled || 0)} de ${total} zonas controladas`,
        stats: [
          { label: 'Controladas', value: Number(control.controlled || 0), tone: 'controlled' },
          { label: 'Cedidas', value: Number(control.conceded || 0), tone: 'conceded' },
          { label: 'Disputadas', value: Number(control.contested || 0) },
        ],
        table: null,
        notes: control.note ? [control.note] : [],
      };
    },
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  class EventMapController {
    constructor(root) {
      this.root = root;
      this.bootstrap = parseJson(root.dataset.bootstrap, {});
      this.id = this.bootstrap.instanceId || root.dataset.instanceId;
      this.config = this.bootstrap.config || {};
      this.events = Array.isArray(this.config.events) ? this.config.events : [];
      this.views = Array.isArray(this.config.views) ? this.config.views : [];
      this.showContextFilter = Boolean(this.bootstrap.showContextFilter);
      // The team and player pages tick any number of matches (Fase 4); the
      // match page's "match" menu picks one side.
      this.multipleMatches = Boolean(this.bootstrap.multipleMatches);
      // The team page's "A favor" / "En contra" (Fase 4).
      this.showSide = Boolean(this.bootstrap.showSide);
      this.active = false;
      this.bound = false;
      this.cleanup = [];
      this.filterSeq = 0;
      this.dataSeq = 0;
      this.hitTargets = [];
      this.heatCache = null;
      this.metrics = null;
      this.state = {
        division: 'thirds',
        focus: [],
        outcome: null,
        scope: this.bootstrap.initialFilters?.defaults?.scope || 'match',
        eventKey: this.config.defaults?.eventKey || 'involvement',
        viewKey: this.config.defaults?.viewKey || 'scatterplot',
        variantKey: this.config.defaults?.variantKey || 'all',
        hullPlayer: null,
        matchId: this.bootstrap.initialFilters?.defaults?.matchId || null,
        matchIds: this.bootstrap.initialFilters?.defaults?.matchId ? [this.bootstrap.initialFilters.defaults.matchId] : [],
        // The match page's player filter: '' is the whole side.
        playerId: '',
        // 'for' the team's events, 'against' its rivals' (Fase 4).
        side: 'for',
        playerOptions: {},
        contextKey: this.bootstrap.initialFilters?.defaults?.contextKey || null,
        tournamentKey: this.bootstrap.initialFilters?.defaults?.tournamentKey || null,
        matchOptions: this.bootstrap.initialFilters?.matchOptions || [],
        contextOptions: this.bootstrap.initialFilters?.contextOptions || [],
        tournamentOptions: this.bootstrap.initialFilters?.tournamentOptions || [],
        filtersLoaded: false,
        filtersPending: false,
        dataLoaded: false,
        dataPending: false,
        queuedFilters: false,
        queuedData: false,
        pendingFilterSignature: null,
        loadedFilterSignature: null,
        pendingDataSignature: null,
        loadedDataSignature: null,
        latestFilterRequestId: null,
        latestDataRequestId: null,
        payload: null,
      };

      this.bind();
      this.renderControls();
      this.renderMap();
    }

    query(selector) {
      return this.root?.querySelector(selector) || null;
    }

    queryAll(selector) {
      return Array.from(this.root?.querySelectorAll(selector) || []);
    }

    component() {
      if (!window.Livewire || !this.root?.isConnected) return null;
      const componentRoot = this.root.closest('[wire\\:id]');
      return componentRoot ? window.Livewire.find(componentRoot.getAttribute('wire:id')) : null;
    }

    listen(target, eventName, handler, options) {
      if (!target?.addEventListener) return;
      target.addEventListener(eventName, handler, options);
      this.cleanup.push(() => target.removeEventListener(eventName, handler, options));
    }

    bind() {
      if (this.bound) return;
      this.bound = true;

      this.listen(this.root, 'click', event => this.handleClick(event));
      this.listen(this.root, 'keydown', event => this.handleKeydown(event));
      this.listen(this.root, 'input', event => this.handleInput(event));
      this.listen(this.root, 'change', event => this.handleChange(event));

      /*
        A field or block a choice brings (Mostrar, División de la cancha, the
        zones of control's tally, the legend...) fades in (sk.css). Only once
        the first map is in: what the page opens with arrives with the page.
      */
      const reveals = new MutationObserver(records => {
        if (!this.state.dataLoaded || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        records.forEach(({ target, oldValue }) => {
          if (oldValue === null || target.hidden || target.closest('[data-map-dropdown-menu], [data-map-tooltip]')) return;
          target.classList.remove('sk-event-map__reveal');
          void target.offsetWidth;
          target.classList.add('sk-event-map__reveal');
        });
      });
      reveals.observe(this.root, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true, subtree: true });
      this.cleanup.push(() => reveals.disconnect());

      const canvas = this.query('[data-map-canvas]');
      this.listen(canvas, 'mousemove', event => this.syncTooltip(event));
      this.listen(canvas, 'mouseleave', () => this.hideTooltip());

      this.listen(window, this.bootstrap.filterEvent, event => this.handleFilterOptions(event));
      this.listen(window, this.bootstrap.dataEvent, event => this.handleData(event));
    }

    handleClick(event) {
      const scope = event.target.closest('[data-map-scope]');
      if (scope && this.root.contains(scope)) {
        this.selectScope(scope.dataset.mapScope);
        return;
      }

      const trigger = event.target.closest('[data-map-dropdown-trigger]');
      if (trigger && this.root.contains(trigger)) {
        event.preventDefault();
        this.toggleDropdown(trigger.dataset.mapDropdownTrigger);
        return;
      }

      const option = event.target.closest('[data-map-option-role]');
      if (option && this.root.contains(option) && !option.disabled) {
        event.preventDefault();
        this.selectOption(option.dataset.mapOptionRole, option.dataset.mapOptionId);
        return;
      }

      const view = event.target.closest('[data-map-view]');
      if (view && this.root.contains(view)) {
        this.selectView(view.dataset.mapView);
        return;
      }

      const variant = event.target.closest('[data-map-variant]');
      if (variant && this.root.contains(variant)) {
        this.selectVariant(variant.dataset.mapVariant);
        return;
      }

      const side = event.target.closest('[data-map-side]');
      if (side && this.root.contains(side) && !side.disabled) {
        this.selectSide(side.dataset.mapSide);
        return;
      }

      const division = event.target.closest('[data-map-division]');
      if (division && this.root.contains(division)) {
        this.selectDivision(division.dataset.mapDivision);
        return;
      }

      const outcome = event.target.closest('[data-map-outcome]');
      if (outcome && this.root.contains(outcome)) {
        this.selectOutcome(outcome.dataset.mapOutcome);
        return;
      }

      const clearFocus = event.target.closest('[data-map-focus-clear]');
      if (clearFocus && this.root.contains(clearFocus)) {
        this.setFocus([]);
        return;
      }

      if (event.target.matches('[data-map-canvas]')) {
        this.focusAt(event);
        return;
      }

      const hullPlayer = event.target.closest('[data-map-hull-player]');
      if (hullPlayer && this.root.contains(hullPlayer)) {
        this.state.hullPlayer = hullPlayer.dataset.mapHullPlayer;
        this.renderLegend();
        this.renderMap();
      }
    }

    handleKeydown(event) {
      const trigger = event.target.closest('[data-map-dropdown-trigger]');
      if (trigger && event.key === 'Escape') {
        event.preventDefault();
        this.closeDropdowns();
        trigger.focus();
        return;
      }
      if (trigger && ['ArrowDown', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        const role = trigger.dataset.mapDropdownTrigger;
        this.openDropdown(role);
        requestAnimationFrame(() => this.menuItems(role)[0]?.focus());
        return;
      }

      const option = event.target.closest('[data-map-option-role]');
      if (!option) return;
      const role = option.dataset.mapOptionRole;
      const items = this.menuItems(role);
      const index = items.indexOf(option);

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        items[(index + delta + items.length) % items.length]?.focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.closeDropdowns();
        this.query(`[data-map-dropdown-trigger="${role}"]`)?.focus();
      }
    }

    handleInput(event) {
      if (event.target.matches('[data-map-cluster-count]')) {
        const label = this.query('[data-map-cluster-count-label]');
        if (label) label.textContent = event.target.value;
        this.renderMap();
      }
    }

    handleChange(event) {
      if (event.target.matches('[data-map-cluster-count], [data-map-remove-outliers]')) {
        this.requestData(true);
      }
    }

    activate() {
      this.active = true;
      this.refreshRoot();
      this.requestData(false);
      requestAnimationFrame(() => this.renderMap());
    }

    invalidate({ filters = true } = {}) {
      this.state.dataLoaded = false;
      this.state.dataPending = false;
      this.state.loadedDataSignature = null;
      this.state.pendingDataSignature = null;
      this.state.latestDataRequestId = null;
      this.state.queuedData = false;
      this.state.payload = null;
      this.hitTargets = [];
      this.heatCache = null;
      if (filters) {
        this.state.filtersLoaded = false;
        this.state.filtersPending = false;
        this.state.loadedFilterSignature = null;
        this.state.pendingFilterSignature = null;
        this.state.latestFilterRequestId = null;
        this.state.queuedFilters = false;
      }
      this.renderControls();
      this.renderMap();
      if (this.active) this.requestData(true);
    }

    destroy() {
      this.cleanup.splice(0).forEach(cleanup => cleanup());
      this.bound = false;
      this.active = false;
    }

    refreshRoot() {
      const current = document.querySelector(`[data-sk-event-map][data-instance-id="${CSS.escape(this.id)}"]`);
      if (!current || current === this.root) return;
      this.cleanup.splice(0).forEach(cleanup => cleanup());
      this.root = current;
      this.bound = false;
      this.bind();
      this.renderControls();
    }

    filters() {
      return {
        scope: this.state.scope,
        matchId: this.state.matchId,
        ...(this.multipleMatches ? { matchIds: this.state.matchIds } : {}),
        ...(this.showSide ? { side: this.effectiveSide() } : {}),
        playerId: this.state.playerId || '',
        contextKey: this.state.contextKey,
        tournamentKey: this.state.tournamentKey,
      };
    }

    options() {
      return {
        clusters: Number(this.query('[data-map-cluster-count]')?.value || this.config.defaults?.clusters || 3),
        removeOutliers: Boolean(this.query('[data-map-remove-outliers]')?.checked ?? true),
        variant: this.state.variantKey || 'all',
      };
    }

    filterSignature() {
      return JSON.stringify({ contextKey: this.state.contextKey || null });
    }

    dataSignature() {
      return JSON.stringify({
        eventKey: this.state.eventKey,
        viewKey: this.state.viewKey,
        filters: this.filters(),
        options: this.options(),
      });
    }

    nextRequestId(kind) {
      if (kind === 'filters') {
        this.filterSeq += 1;
        return `${this.id}-filters-${this.filterSeq}`;
      }
      this.dataSeq += 1;
      return `${this.id}-data-${this.dataSeq}`;
    }

    requestFilters(force = false) {
      const signature = this.filterSignature();
      if (this.state.filtersPending) {
        if (force || signature !== this.state.pendingFilterSignature) this.state.queuedFilters = true;
        return false;
      }
      if (!force && this.state.filtersLoaded && signature === this.state.loadedFilterSignature) return true;

      const component = this.component();
      if (!component || !this.bootstrap.filterMethod) return false;

      const requestId = this.nextRequestId('filters');
      this.state.filtersPending = true;
      this.state.pendingFilterSignature = signature;
      this.state.latestFilterRequestId = requestId;
      this.state.queuedFilters = false;
      this.syncLoading();
      this.renderControls();

      const args = this.showContextFilter ? [this.state.contextKey, requestId] : [requestId];
      Promise.resolve(component.call(this.bootstrap.filterMethod, ...args)).catch(() => {
        if (this.state.latestFilterRequestId !== requestId) return;
        this.state.filtersPending = false;
        this.state.pendingFilterSignature = null;
        this.state.payload = { points: [], zones: [], emptyMessage: 'No se pudieron cargar los filtros del mapa.' };
        this.syncLoading();
        this.renderMap();
      });
      return false;
    }

    requestData(force = false) {
      if (!this.active) return;
      let signature = this.dataSignature();
      if (this.state.dataPending) {
        if (force || signature !== this.state.pendingDataSignature) this.state.queuedData = true;
        return;
      }
      if (!force && this.state.dataLoaded && signature === this.state.loadedDataSignature) {
        this.renderMap();
        return;
      }
      if (!this.requestFilters(false)) {
        this.state.queuedData = true;
        return;
      }

      const component = this.component();
      if (!component || !this.bootstrap.dataMethod) return;
      signature = this.dataSignature();
      const requestId = this.nextRequestId('data');
      this.state.dataPending = true;
      this.state.pendingDataSignature = signature;
      this.state.latestDataRequestId = requestId;
      this.state.queuedData = false;
      this.syncLoading();

      // What the map asks for, for whatever follows it (the team's pass network, Fase 4).
      document.dispatchEvent(new CustomEvent('sk-event-map-filters', {
        detail: { instanceId: this.bootstrap.instanceId, filters: this.filters() },
      }));

      Promise.resolve(component.call(
        this.bootstrap.dataMethod,
        this.state.eventKey,
        this.state.viewKey,
        this.options(),
        this.filters(),
        requestId
      )).catch(() => {
        if (this.state.latestDataRequestId !== requestId) return;
        this.state.dataPending = false;
        this.state.pendingDataSignature = null;
        this.state.payload = { points: [], zones: [], emptyMessage: 'No se pudo cargar el mapa.' };
        this.syncLoading();
        this.renderMap();
      });
    }

    handleFilterOptions(event) {
      const payload = event.detail?.mapGraphFilters || {};
      if (payload.requestId !== this.state.latestFilterRequestId) return;

      this.state.matchOptions = Array.isArray(payload.matchOptions) ? payload.matchOptions : [];
      this.state.playerOptions = payload.playerOptions && typeof payload.playerOptions === 'object' ? payload.playerOptions : {};
      this.state.contextOptions = Array.isArray(payload.contextOptions)
        ? payload.contextOptions
        : (Array.isArray(payload.seasonOptions) ? payload.seasonOptions : []);
      this.state.tournamentOptions = Array.isArray(payload.tournamentOptions) ? payload.tournamentOptions : [];

      const defaults = payload.defaults || {};
      this.state.scope = ['match', 'competition'].includes(defaults.scope) ? defaults.scope : this.state.scope;
      this.state.matchId = this.validSelection(this.state.matchOptions, this.state.matchId, defaults.matchId);
      // The ticks still among the options; else the default match alone.
      const known = new Set(this.state.matchOptions.map(option => String(option.id)));
      const kept = this.state.matchIds.filter(id => known.has(String(id)));
      this.state.matchIds = kept.length ? kept : (this.state.matchId ? [this.state.matchId] : []);
      this.state.matchId = this.state.matchIds[0] || null;
      this.state.contextKey = this.validSelection(this.state.contextOptions, this.state.contextKey, defaults.contextKey);
      this.state.tournamentKey = this.validSelection(this.state.tournamentOptions, this.state.tournamentKey, defaults.tournamentKey);
      this.state.filtersLoaded = true;
      this.state.filtersPending = false;
      this.state.loadedFilterSignature = this.filterSignature();
      this.state.pendingFilterSignature = null;
      this.renderControls();
      this.syncLoading();

      if (this.state.queuedFilters) {
        this.state.queuedFilters = false;
        this.requestFilters(true);
        return;
      }
      if (this.state.queuedData || !this.state.dataLoaded) {
        this.state.queuedData = false;
        this.requestData(true);
      }
    }

    handleData(event) {
      const payload = event.detail?.mapGraphData || {};
      if (payload.requestId !== this.state.latestDataRequestId) return;

      this.state.payload = payload;
      if (Array.isArray(payload.availableEvents)) this.events = payload.availableEvents;
      if (payload.eventKey) this.state.eventKey = payload.eventKey;
      if (payload.viewKey) this.state.viewKey = payload.viewKey;
      if (payload.variantKey) this.state.variantKey = payload.variantKey;
      if (!(payload.hulls || []).some(hull => hull.player_id === this.state.hullPlayer)) this.state.hullPlayer = null;
      if (['match', 'competition'].includes(payload.filters?.scope)) this.state.scope = payload.filters.scope;
      this.state.dataLoaded = true;
      this.state.dataPending = false;
      this.state.loadedDataSignature = this.dataSignature();
      this.state.pendingDataSignature = null;
      this.renderControls();
      this.syncLoading();
      this.renderMap();

      if (this.state.queuedData && this.state.loadedDataSignature !== this.dataSignature()) {
        this.state.queuedData = false;
        this.requestData(true);
      } else {
        this.state.queuedData = false;
      }
    }

    validSelection(options, current, fallback) {
      if (options.some(option => String(option.id) === String(current))) return current;
      if (options.some(option => String(option.id) === String(fallback))) return fallback;
      return options[0]?.id || null;
    }

    selectScope(scope) {
      if (!['match', 'competition'].includes(scope) || scope === this.state.scope) return;
      this.state.scope = scope;
      this.renderControls();
      this.requestData(true);
    }

    selectView(view) {
      if (!this.availableViews().includes(view) || view === this.state.viewKey) return;
      this.state.viewKey = view;
      this.renderControls();
      this.requestData(true);
    }

    selectSide(side) {
      if (!['for', 'against'].includes(side) || side === this.state.side) return;
      this.state.side = side;
      this.renderControls();
      if (this.sideEnabled()) this.requestData(true);
    }

    /*
      Whether this map has an "en contra": every one but a player's
      territory and the zones of control, which show both sides already.
      Involucramiento too: the rivals' touches (Dario, 28 Oct).
    */
    sideEnabled() {
      return this.showSide
        && this.state.viewKey !== 'control'
        && this.eventConfig()?.kind !== 'hull';
    }

    effectiveSide() {
      return this.sideEnabled() ? this.state.side : 'for';
    }

    selectDivision(division) {
      if (!DIVISIONS[division] || division === this.state.division) return;
      this.state.division = division;
      // A third and a zone are different cells: a focus doesn't carry over.
      this.state.focus = [];
      this.renderControls();
      this.renderMap();
    }

    // The zone plot and the zones of control draw their own grid; the divisions would fight it.
    divisionEnabled() {
      return !GRID_VIEWS.includes(this.state.viewKey);
    }

    focusActive() {
      return this.state.focus.length > 0 && this.divisionEnabled();
    }

    setFocus(cells) {
      this.state.focus = [...cells].sort((a, b) => a - b);
      this.syncFocus();
      this.syncSummary();
      this.renderMap();
    }

    /*
      Thirds focus one at a time: a click focuses a third, a click on the
      focused one shows the whole pitch. Zones add up: a click adds a zone to
      the focus or takes a focused one out, and taking out the last one shows
      the whole pitch again.
    */
    focusAt(event) {
      if (!this.divisionEnabled() || !this.metrics) return;
      const point = this.pitchPoint(event);
      if (!point) return;
      const cell = divisionCell(this.state.division, point.x, point.y);
      const focused = this.state.focus.includes(cell);
      if (this.state.division === 'thirds') {
        this.setFocus(focused ? [] : [cell]);
      } else {
        this.setFocus(focused ? this.state.focus.filter(other => other !== cell) : [...this.state.focus, cell]);
      }
    }

    // A pointer event's position in pitch coordinates (0-100), or null off the pitch.
    pitchPoint(event) {
      const canvas = this.query('[data-map-canvas]');
      const metrics = this.metrics;
      if (!canvas || !metrics) return null;
      const rect = canvas.getBoundingClientRect();
      const canvasX = (event.clientX - rect.left) * (canvas.width / rect.width);
      const canvasY = (event.clientY - rect.top) * (canvas.height / rect.height);
      const x = ((canvasX - metrics.px(0)) / metrics.pw) * 100;
      const y = ((canvasY - metrics.py(0)) / metrics.ph) * 100;
      return x >= 0 && x <= 100 && y >= 0 && y <= 100 ? { x, y } : null;
    }

    /*
      The result toggle: both results show by default; picking one focuses
      it, picking the other switches to it, and picking the focused one again
      shows both. It filters what's loaded, so it never refetches - and the
      choice carries to the next event that has results, the way a focused
      zone does.
    */
    availableOutcomes() {
      const outcomes = this.eventConfig()?.outcomes;
      return Array.isArray(outcomes) && outcomes.length === 2 ? outcomes : [];
    }

    // A grid's counts are built on the server over every result.
    outcomeEnabled() {
      return this.availableOutcomes().length === 2 && !GRID_VIEWS.includes(this.state.viewKey);
    }

    outcomeActive() {
      return this.state.outcome !== null && this.outcomeEnabled();
    }

    selectOutcome(key) {
      if (!this.availableOutcomes().some(outcome => outcome.key === key)) return;
      this.state.outcome = this.state.outcome === key ? null : key;
      this.syncOutcome();
      this.syncSummary();
      this.renderMap();
    }

    outcomeLabel() {
      return this.availableOutcomes().find(outcome => outcome.key === this.state.outcome)?.label || '';
    }

    // A point's result, read off the field its colour comes from.
    pointOutcome(point) {
      const color = this.eventConfig()?.color;
      if (color === 'goal') return point.goal ? 'success' : 'miss';
      if (color === 'accurate') return point.accurate === false ? 'miss' : 'success';
      return point.success === false ? 'miss' : 'success';
    }

    syncOutcome() {
      const field = this.query('[data-map-outcome-field]');
      const wrap = this.query('[data-map-outcome-controls]');
      if (field) field.hidden = !this.outcomeEnabled();
      if (!wrap) return;
      wrap.innerHTML = '';
      this.availableOutcomes().forEach(outcome => {
        const shown = this.state.outcome === null || this.state.outcome === outcome.key;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `sk-segmented-control__button sk-event-map__outcome${shown ? ' active' : ''}`;
        button.dataset.mapOutcome = outcome.key;
        button.setAttribute('aria-pressed', String(shown));
        const swatch = document.createElement('span');
        swatch.className = `sk-event-map__outcome-swatch sk-event-map__outcome-swatch--${outcome.key}`;
        swatch.setAttribute('aria-hidden', 'true');
        button.appendChild(swatch);
        button.appendChild(document.createTextNode(outcome.label));
        wrap.appendChild(button);
      });
    }

    /*
      The events a view draws: all of them, or only those of the focused
      result and starting in a focused cell - where the action happened, so a
      pass is the passer's even when it ends elsewhere.
    */
    visiblePoints(payload) {
      let points = Array.isArray(payload?.points) ? payload.points : [];
      if (this.outcomeActive()) {
        points = points.filter(point => this.pointOutcome(point) === this.state.outcome);
      }
      if (this.focusActive()) {
        points = points.filter(point => this.state.focus.includes(divisionCell(this.state.division, point.x, point.y)));
      }
      return points;
    }

    syncFocus() {
      const enabled = this.divisionEnabled();
      const active = this.focusActive();
      const wrap = this.query('[data-map-focus]');
      const hint = this.query('[data-map-focus-hint]');
      const clear = this.query('[data-map-focus-clear]');
      const label = this.query('[data-map-focus-label]');
      if (wrap) wrap.hidden = !enabled;
      if (hint) {
        hint.hidden = active;
        hint.textContent = this.state.division === 'thirds'
          ? 'Haz clic en un tercio para enfocarlo'
          : 'Haz clic en una o más zonas para enfocarlas';
      }
      if (clear) clear.hidden = !active;
      if (label) label.textContent = active ? focusLabel(this.state.division, this.state.focus) : '';
      this.query('[data-map-canvas]')?.classList.toggle('sk-event-map__canvas--focusable', enabled);
    }

    selectVariant(variant) {
      if (!this.availableVariants().some(option => option.key === variant) || variant === this.state.variantKey) return;
      this.state.variantKey = variant;
      this.renderControls();
      this.requestData(true);
    }

    availableVariants() {
      const variants = this.eventConfig()?.variants;
      return Array.isArray(variants) ? variants : [];
    }

    /*
      A match ticked or unticked (Fase 4): the menu stays open, at least one
      stays ticked, and the map asks again once the ticking settles.
    */
    toggleMatch(id) {
      const key = String(id);
      const ticked = this.state.matchIds.map(String);
      if (ticked.includes(key)) {
        if (ticked.length === 1) return;
        this.state.matchIds = this.state.matchIds.filter(matchId => String(matchId) !== key);
      } else {
        // In the menu's order, newest first, as the options come.
        const order = this.state.matchOptions.map(option => String(option.id));
        this.state.matchIds = [...ticked, key].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      }
      this.state.matchId = this.state.matchIds[0] || null;
      this.syncMatchTicks();
      clearTimeout(this.matchTickTimer);
      this.matchTickTimer = setTimeout(() => this.requestData(true), 350);
    }

    /*
      The ticks and the pill updated in place: rebuilding the menu would
      detach the row just clicked, and the page's outside-click closer would
      then take the click for one outside and shut the menu.
    */
    syncMatchTicks() {
      const ticked = this.state.matchIds.map(String);
      this.queryAll('[data-map-dropdown-menu="match"] [data-map-option-role="match"]').forEach(button => {
        const on = ticked.includes(String(button.dataset.mapOptionId));
        button.classList.toggle('selected', on);
        button.setAttribute('aria-checked', String(on));
        button.querySelector('.players-multi-menu__check')?.classList.toggle('bi-check-lg', on);
      });
      const label = this.query('[data-map-dropdown-label="match"]');
      const picked = this.state.matchOptions.filter(option => ticked.includes(String(option.id)));
      if (label) label.textContent = picked.length > 1 ? `${picked.length} partidos` : (picked[0] ? this.optionText(picked[0]) : label.textContent);
    }

    selectOption(role, id) {
      if (role === 'match' && this.multipleMatches) {
        this.toggleMatch(id);
        return;
      }
      this.closeDropdowns();
      if (role === 'match') {
        // Another side: its own players, from the whole of it.
        if (String(id) !== String(this.state.matchId)) this.state.playerId = '';
        this.state.matchId = id;
      }
      if (role === 'player') this.state.playerId = id || '';
      if (role === 'context') {
        this.state.contextKey = id;
        this.state.filtersLoaded = false;
        this.state.loadedFilterSignature = null;
        this.state.dataLoaded = false;
        this.renderControls();
        this.requestFilters(true);
        return;
      }
      if (role === 'tournament') this.state.tournamentKey = id;
      if (role === 'event') {
        this.state.eventKey = id;
        this.state.variantKey = 'all';
        this.state.hullPlayer = null;
        if (!this.availableViews().includes(this.state.viewKey)) this.state.viewKey = this.availableViews()[0];
      }
      this.renderControls();
      this.requestData(true);
    }

    eventConfig() {
      return this.events.find(event => event.key === this.state.eventKey) || this.events[0] || null;
    }

    // The players of the side picked (the match page), shirt number first.
    playerOptions() {
      const players = this.state.playerOptions?.[this.state.matchId];

      return Array.isArray(players)
        ? players.map(player => ({ id: player.id, label: player.meta ? `${player.meta} · ${player.label}` : player.label }))
        : [];
    }

    playerName() {
      if (!this.state.playerId) return null;
      const player = (this.state.playerOptions?.[this.state.matchId] || []).find(option => String(option.id) === String(this.state.playerId));

      return player?.label || null;
    }

    availableViews() {
      const views = this.eventConfig()?.views;
      return Array.isArray(views) && views.length ? views : ['scatterplot'];
    }

    viewLabel(key) {
      return this.views.find(view => view.key === key)?.label || key;
    }

    renderControls() {
      if (!this.root?.isConnected) return;
      this.queryAll('[data-map-scope]').forEach(button => {
        button.classList.toggle('active', button.dataset.mapScope === this.state.scope);
      });
      const matchPanel = this.query('[data-map-match-panel]');
      const competitionPanel = this.query('[data-map-competition-panel]');
      if (matchPanel) matchPanel.hidden = this.state.scope !== 'match';
      if (competitionPanel) competitionPanel.hidden = this.state.scope !== 'competition';

      this.renderDropdown('match', this.state.matchOptions, this.multipleMatches ? this.state.matchIds : this.state.matchId, 'Sin partidos disponibles', this.state.filtersPending ? 'Cargando partidos...' : null);
      if (this.query('[data-map-player-field]')) {
        this.renderDropdown('player', [{ id: '', label: 'Todos' }, ...this.playerOptions()], this.state.playerId || '', 'Todos');
      }
      this.renderDropdown('context', this.state.contextOptions, this.state.contextKey, 'Sin temporadas disponibles');
      this.renderDropdown('tournament', this.state.tournamentOptions, this.state.tournamentKey, 'Sin competencias disponibles');
      this.renderDropdown('event', this.events.map(event => ({
        id: event.key,
        label: event.label,
        group: event.sectionLabel || null,
        disabled: Boolean(event.disabled),
        // Not in the viewer's plan (PlanAccess::allowsMapEvent()): shown with a
        // lock, and the paywall (download-paywall.js) takes the click.
        locked: Boolean(event.locked),
        meta: event.disabled ? '0 en este partido' : null,
      })), this.state.eventKey, 'Sin eventos disponibles');

      const sideEnabled = this.sideEnabled();
      this.queryAll('[data-map-side]').forEach(button => {
        const active = button.dataset.mapSide === this.effectiveSide();
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
        button.disabled = !sideEnabled;
        button.title = sideEnabled ? '' : 'Este mapa no tiene «en contra»';
      });

      const variantField = this.query('[data-map-variant-field]');
      const variantWrap = this.query('[data-map-variant-controls]');
      const variants = this.availableVariants();
      if (variantField) variantField.hidden = variants.length === 0;
      if (variantWrap) {
        if (!variants.some(option => option.key === this.state.variantKey)) this.state.variantKey = 'all';
        variantWrap.innerHTML = '';
        variants.forEach(option => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = `sk-segmented-control__button${option.key === this.state.variantKey ? ' active' : ''}`;
          button.dataset.mapVariant = option.key;
          button.textContent = option.label;
          variantWrap.appendChild(button);
        });
      }

      const viewWrap = this.query('[data-map-view-controls]');
      if (viewWrap) {
        if (!this.availableViews().includes(this.state.viewKey)) this.state.viewKey = this.availableViews()[0];
        viewWrap.innerHTML = '';
        this.availableViews().forEach(view => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = `sk-segmented-control__button${view === this.state.viewKey ? ' active' : ''}`;
          button.dataset.mapView = view;
          button.textContent = this.viewLabel(view);
          viewWrap.appendChild(button);
        });
      }

      const divisionField = this.query('[data-map-division-field]');
      if (divisionField) divisionField.hidden = !this.divisionEnabled();
      this.queryAll('[data-map-division]').forEach(button => {
        const selected = button.dataset.mapDivision === this.state.division;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      this.syncFocus();
      this.syncOutcome();

      const clusterPanel = this.query('[data-map-cluster-options]');
      if (clusterPanel) clusterPanel.hidden = !this.eventConfig()?.hasClusterOptions;
      this.syncHeader();
      this.syncSummary();
    }

    /* `selectedId` is a list where the menu ticks several (the matches, Fase 4). */
    renderDropdown(role, options, selectedId, emptyLabel, loadingLabel = null) {
      const menu = this.query(`[data-map-dropdown-menu="${role}"]`);
      const label = this.query(`[data-map-dropdown-label="${role}"]`);
      if (!menu || !label) return;
      const multiple = Array.isArray(selectedId);
      const picked = multiple ? options.filter(option => selectedId.map(String).includes(String(option.id))) : [];
      const selected = multiple ? (picked.length === 1 ? picked[0] : null) : options.find(option => String(option.id) === String(selectedId));
      label.textContent = multiple && picked.length > 1
        ? `${picked.length} partidos`
        : (selected
          ? (selected.group ? `${selected.group} · ${this.optionText(selected)}` : this.optionText(selected))
          : (loadingLabel || emptyLabel));
      menu.setAttribute('role', multiple ? 'menu' : 'listbox');
      menu.classList.toggle('players-multi-menu', multiple);
      menu.innerHTML = '';

      if (loadingLabel) this.appendMenuItem(menu, role, { id: '', label: loadingLabel, disabled: true }, selectedId);
      if (!options.length && !loadingLabel) {
        this.appendMenuItem(menu, role, { id: '', label: emptyLabel, disabled: true }, selectedId);
        return;
      }
      let group = null;
      options.forEach(option => {
        if (option.group && option.group !== group) {
          group = option.group;
          const header = document.createElement('li');
          header.setAttribute('role', 'presentation');
          header.className = 'sk-menu-group';
          header.textContent = group;
          menu.appendChild(header);
        }
        this.appendMenuItem(menu, role, option, selectedId);
      });
    }

    appendMenuItem(menu, role, option, selectedId) {
      const li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      const button = document.createElement('button');
      const multiple = Array.isArray(selectedId);
      const isSelected = multiple ? selectedId.map(String).includes(String(option.id)) : String(option.id) === String(selectedId);
      button.type = 'button';
      button.className = `sk-menu-item${option.group ? ' sk-menu-item--grouped' : ''}${isSelected ? ' selected' : ''}`;
      button.dataset.mapOptionRole = role;
      button.dataset.mapOptionId = option.id;
      button.disabled = Boolean(option.disabled);
      if (multiple) {
        // The advanced search's tick menus: a check box a match.
        button.setAttribute('role', 'menuitemcheckbox');
        button.setAttribute('aria-checked', String(isSelected));
      } else {
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(isSelected));
      }
      button.textContent = this.optionText(option);
      if (option.locked) {
        // Caught on window, in capture, before this map's own click handler.
        button.classList.add('is-locked');
        button.dataset.skPaywallTrigger = 'events';
        button.setAttribute('aria-haspopup', 'dialog');
        const lock = document.createElement('i');
        lock.className = 'bi bi-lock-fill chart-toggle-lock';
        lock.setAttribute('aria-hidden', 'true');
        button.prepend(lock);
      }
      if (multiple) {
        const check = document.createElement('i');
        check.className = `bi players-multi-menu__check${isSelected ? ' bi-check-lg' : ''}`;
        check.setAttribute('aria-hidden', 'true');
        button.prepend(check);
      }
      li.appendChild(button);
      menu.appendChild(li);
    }

    optionText(option) {
      return option.meta ? `${option.label} - ${option.meta}` : option.label;
    }

    menuItems(role) {
      return this.queryAll(`[data-map-dropdown-menu="${role}"] [data-map-option-role]:not(:disabled)`);
    }

    toggleDropdown(role) {
      const menu = this.query(`[data-map-dropdown-menu="${role}"]`);
      if (!menu) return;
      const shouldOpen = menu.hidden;
      this.closeDropdowns();
      if (shouldOpen) this.openDropdown(role);
    }

    openDropdown(role) {
      const menu = this.query(`[data-map-dropdown-menu="${role}"]`);
      const trigger = this.query(`[data-map-dropdown-trigger="${role}"]`);
      if (menu) menu.hidden = false;
      trigger?.setAttribute('aria-expanded', 'true');
    }

    closeDropdowns() {
      this.queryAll('[data-map-dropdown-menu]').forEach(menu => { menu.hidden = true; });
      this.queryAll('[data-map-dropdown-trigger]').forEach(trigger => trigger.setAttribute('aria-expanded', 'false'));
    }

    /*
      What the map shows, as far as the reader chose it: the request, the
      division, the focus and the result. A live refresh, a resize or a theme
      change keeps it, so only a choice the reader made crossfades.
    */
    visualSignature() {
      return JSON.stringify([this.dataSignature(), this.state.division, this.state.focus, this.state.outcome]);
    }

    /*
      The previous drawing, copied to a canvas laid over the map (the wrap's
      canvas rule places it) and faded out while the new one draws under it
      (sk.css). Only once the answer for the new choice is in: while it loads,
      the old drawing stays under the overlay.
    */
    crossfadeOnChange(canvas) {
      if (this.state.dataPending || this.state.filtersPending || !this.state.payload) return;
      const signature = this.visualSignature();
      const changed = signature !== this.renderedSignature;
      this.renderedSignature = signature;
      if (!changed || canvas.width < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      canvas.parentElement.querySelector('.sk-event-map__ghost')?.remove();
      const ghost = document.createElement('canvas');
      ghost.width = canvas.width;
      ghost.height = canvas.height;
      ghost.className = 'sk-event-map__ghost';
      ghost.setAttribute('aria-hidden', 'true');
      // A passing frame, never part of a download.
      ghost.setAttribute('data-sk-export-skip', '');
      ghost.getContext('2d').drawImage(canvas, 0, 0);
      canvas.after(ghost);
      ghost.addEventListener('animationend', () => ghost.remove(), { once: true });
    }

    syncLoading() {
      const overlay = this.query('[data-map-loading-overlay]');
      const text = this.query('[data-map-loading-text]');
      const loading = this.state.filtersPending || this.state.dataPending;
      if (text) text.textContent = this.state.filtersPending ? 'Cargando filtros...' : 'Cargando mapa...';
      overlay?.classList.toggle('stats-loading-overlay--show', loading);
      // Kept, dimmed, while the next answer loads, so the card doesn't jump.
      this.query('[data-map-insights]')?.classList.toggle('sk-event-map__insights--loading', loading);
    }

    syncHeader() {
      const title = this.query('[data-map-title]');
      const subtitle = this.query('[data-map-subtitle]');
      const label = this.state.payload?.eventLabel || this.eventConfig()?.label || 'Mapa';
      if (title) title.textContent = this.state.payload?.side === 'against' ? `${label} en contra` : label;
      if (subtitle) {
        const section = this.state.payload?.sectionLabel || this.eventConfig()?.sectionLabel;
        const variant = this.availableVariants().find(option => option.key === this.state.variantKey && option.key !== 'all');
        const view = this.state.payload?.viewLabel || this.viewLabel(this.state.viewKey);
        subtitle.textContent = [this.playerName(), section, variant?.label, view].filter(Boolean).join(' · ');
      }
    }

    syncSummary() {
      const summary = this.query('[data-map-summary]');
      if (!summary) return;
      const payload = this.state.payload;
      const outcome = this.outcomeActive();
      const focused = (this.focusActive() || outcome) && Array.isArray(payload?.points);
      const data = focused ? this.summaryFor(this.visiblePoints(payload), payload) : (payload?.summary || {});
      const filters = payload?.filters || {};
      const tags = [
        this.focusActive() ? focusLabel(this.state.division, this.state.focus) : null,
        outcome ? this.outcomeLabel() : null,
      ].filter(Boolean).map(escapeHtml).join(' · ');
      // Events and matches share the first line.
      const head = [focused
        ? `<span><strong>${data.total}</strong> de ${payload.points.length} eventos · ${tags}</span>`
        : `<span><strong>${Number(data.total || 0)}</strong> eventos</span>`];
      // One match, or as many as are ticked (Fase 4).
      const matchCount = filters.scope === 'match' ? Math.max(1, Number(filters.matchCount || 1)) : Number(filters.matchCount || 0);
      if (filters.scope === 'match' || filters.scope === 'competition') {
        head.push(`<span><strong>${matchCount}</strong> ${matchCount === 1 ? 'partido' : 'partidos'}</span>`);
      }
      const parts = [`<div class="sk-event-map__summary-head">${head.join('')}</div>`];
      // A map with an insights panel says the rest there, once.
      if (this.insightsKind()) {
        summary.innerHTML = parts.join('');
        this.renderInsights();
        return;
      }
      this.renderInsights();
      if (this.state.payload?.kind === 'shot') parts.push(`<span><strong>${Number(data.goals || 0)}</strong> goles</span>`);
      if (data.xg_reliable === true) {
        parts.push(`<span><strong>${Number(data.total_xg || 0).toFixed(2)}</strong> xG total</span>`);
        parts.push(`<span><strong>${Number(data.xg_per_shot || 0).toFixed(2)}</strong> xG por remate</span>`);
      }
      if (data.total_xt !== undefined) parts.push(`<span><strong>${Number(data.total_xt || 0).toFixed(2)}</strong> xT generado</span>`);
      if (data.assists !== undefined) {
        parts.push(`<span><strong>${Number(data.assists || 0)}</strong> asistencias</span>`);
        parts.push(`<span><strong>${Number(data.key_passes || 0)}</strong> pases clave</span>`);
      }
      // One result focused is all of one result: its rate says nothing.
      if (data.success_rate !== undefined && !outcome) parts.push(`<span><strong>${Number(data.success_rate).toFixed(0)}%</strong> ${this.successNoun()}</span>`);
      if (data.players !== undefined && this.state.payload?.subject === 'team') parts.push(`<span><strong>${Number(data.players)}</strong> jugadores</span>`);
      summary.innerHTML = parts.join('');
    }

    // The panel this map gets, if any: none on the zone plot, whose counts are the server's; the zones of control their own.
    insightsKind() {
      if (this.state.viewKey === 'control') return this.state.payload?.control ? 'control' : null;
      const kind = this.eventConfig()?.insights;
      return INSIGHTS[kind] && this.state.viewKey !== 'zone_plot' ? kind : null;
    }

    renderInsights() {
      const box = this.query('[data-map-insights]');
      if (!box) return;
      // While the next answer loads, the last panel stays up, dimmed by syncLoading().
      if (this.state.dataPending && !box.hidden) return;
      const kind = this.insightsKind();
      const payload = this.state.payload;
      if (!kind || !Array.isArray(payload?.points) || payload.eventKey !== this.state.eventKey) {
        box.hidden = true;
        box.innerHTML = '';
        return;
      }

      const insight = INSIGHTS[kind](this.visiblePoints(payload), { event: this.eventConfig(), payload });
      const stats = insight.stats.map(stat => (
        `<div class="sk-event-map__stat${stat.tone ? ` sk-event-map__stat--${stat.tone}` : ''}">`
        + `<strong>${escapeHtml(stat.value)}</strong><span>${escapeHtml(stat.label)}</span></div>`
      )).join('');
      const table = insight.table
        ? '<table class="sk-event-map__insights-table"><thead><tr>'
          + insight.table.head.map(cell => `<th scope="col">${escapeHtml(cell)}</th>`).join('')
          + '</tr></thead><tbody>'
          + insight.table.rows.map(row => `<tr>${row.map((cell, index) => (
            index === 0 ? `<th scope="row">${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`
          )).join('')}</tr>`).join('')
          + '</tbody></table>'
        : '';
      const notes = (insight.notes || []).map(note => `<p class="sk-event-map__insights-note">${escapeHtml(note)}</p>`).join('');
      const columns = Math.max(3, Math.ceil(insight.stats.length / 2));

      box.innerHTML = `<p class="sk-event-map__insights-title">${escapeHtml(insight.title)}</p>`
        // Never a third row of stats: past six, a fourth column - and smaller type to fit it.
        + `<div class="sk-event-map__insights-grid${columns > 3 ? ' sk-event-map__insights-grid--dense' : ''}" style="--insight-columns: ${columns}">${stats}</div>`
        + `${table}${notes}`;
      box.hidden = false;
    }

    /*
      The payload's summary over a focused cell's events: the same sums
      OptaEventMapBuilder::summary() makes over all of them, so a focused cell
      reads the way the whole pitch does. The hull count stays the payload's -
      the territories are drawn whole.
    */
    summaryFor(points, payload) {
      const total = points.length;
      const summary = { total };
      const present = value => value !== null && value !== undefined && Number.isFinite(Number(value));

      if (payload?.kind === 'shot') {
        const totalXg = points.reduce((sum, point) => sum + (present(point.xg) ? Number(point.xg) : 0), 0);
        summary.goals = points.filter(point => point.goal).length;
        summary.total_xg = totalXg;
        summary.xg_per_shot = total > 0 ? totalXg / total : 0;
        summary.xg_reliable = total > 0 && points.every(point => point.xg !== null && point.xg !== undefined);
      }
      if (payload?.kind === 'xt') {
        summary.total_xt = points.reduce((sum, point) => sum + (present(point.xt) ? Number(point.xt) : 0), 0);
      }
      if (payload?.kind === 'chance') {
        summary.assists = points.filter(point => point.chance === 'assist').length;
        summary.key_passes = total - summary.assists;
      }
      const metric = { accurate: 'accurate', success: 'success' }[this.eventConfig()?.color];
      if (metric && total > 0) {
        summary.success_rate = (points.filter(point => Boolean(point[metric])).length / total) * 100;
      }
      if (payload?.summary?.players !== undefined) summary.players = payload.summary.players;
      return summary;
    }

    successNoun() {
      const color = this.eventConfig()?.color;
      if (color === 'accurate') return 'completados';
      if (this.state.payload?.eventKey === 'tackles') return 'con recuperación';
      return 'ganados';
    }

    selectedHull(hulls) {
      return hulls.find(hull => hull.player_id === this.state.hullPlayer) || hulls[0] || null;
    }

    renderLegend() {
      const legend = this.query('[data-map-legend]');
      if (!legend) return;
      const payload = this.state.payload;
      const ink = readMapInk();
      const hulls = Array.isArray(payload?.hulls) ? payload.hulls : [];
      legend.innerHTML = '';

      if (payload?.kind === 'hull' && payload.subject === 'team' && hulls.length) {
        const selected = this.selectedHull(hulls);
        hulls.forEach(hull => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = `sk-event-map__legend-player${hull === selected ? ' active' : ''}`;
          button.dataset.mapHullPlayer = hull.player_id;
          button.setAttribute('aria-pressed', String(hull === selected));
          button.textContent = `${hull.player_name || 'Jugador'} (${Number(hull.count || 0)})`;
          legend.appendChild(button);
        });
        legend.hidden = false;
        return;
      }

      if (this.drawsHeatmap(payload)) {
        // The per-event legend (gol / sin gol, completo / incompleto…) names
        // colours the heatmap doesn't use; what it shows is the density ramp.
        const row = document.createElement('span');
        row.className = 'sk-event-map__legend-item';
        const ramp = document.createElement('span');
        ramp.className = 'sk-event-map__legend-swatch sk-event-map__legend-swatch--ramp';
        ramp.style.background = window.StatiskicksHeatmap.cssGradient();
        row.appendChild(ramp);
        row.appendChild(document.createTextNode(this.heatLegendLabel(payload)));
        legend.appendChild(row);
        legend.hidden = false;
        return;
      }

      const items = Array.isArray(payload?.legend) ? payload.legend : [];
      items.forEach(item => {
        const row = document.createElement('span');
        row.className = 'sk-event-map__legend-item';
        const swatch = document.createElement('span');
        swatch.className = `sk-event-map__legend-swatch${item.swatch === 'size' ? ' sk-event-map__legend-swatch--size' : ''}`;
        // The result the toggle hides fades in the legend too.
        const faded = this.outcomeActive() && item.swatch === (this.state.outcome === 'success' ? 'secondary' : 'primary');
        row.classList.toggle('sk-event-map__legend-item--muted', faded);
        if (item.swatch !== 'size') swatch.style.background = swatchColor(ink, item.swatch);
        row.appendChild(swatch);
        row.appendChild(document.createTextNode(item.label));
        legend.appendChild(row);
      });
      legend.hidden = items.length === 0 || !(payload?.points?.length || payload?.control);
    }

    renderMap() {
      const canvas = this.query('[data-map-canvas]');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      this.crossfadeOnChange(canvas);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d');
      this.hitTargets = [];
      this.hideTooltip();
      // Its download, a tall preset's: the map turned with its attack upwards (Fase 6).
      canvas.skTurned = () => this.turnedCanvas();
      this.paintMap(ctx, width, height);
      const payload = this.state.payload;
      const allPoints = Array.isArray(payload?.points) ? payload.points : [];
      const points = this.visiblePoints(payload);
      const zones = Array.isArray(payload?.zones) ? payload.zones : [];
      const control = payload?.viewKey === 'control' ? payload.control || null : null;
      const empty = this.query('[data-map-empty]');
      if (empty) {
        empty.hidden = this.state.filtersPending || this.state.dataPending || allPoints.length > 0 || zones.length > 0 || Boolean(control);
        empty.textContent = payload?.emptyMessage || 'No hay eventos disponibles para los filtros seleccionados.';
      }
      this.renderLegend();
      if (control || !payload || (allPoints.length === 0 && zones.length === 0)) return;
      if (empty && payload.viewKey === 'hull' && !(payload.hulls || []).length && payload.emptyMessage) {
        // The actions are drawn, but too few for a territory: say so over them.
        empty.hidden = false;
        empty.textContent = payload.emptyMessage;
      }
      const heatmap = this.drawsHeatmap(payload);
      if (empty && payload.viewKey === 'heatmap' && !heatmap) {
        // Too few for a density: the events are drawn as dots, say why over them.
        empty.hidden = false;
        empty.textContent = SPARSE_HEATMAP_MESSAGE;
      }
      if (empty && (this.focusActive() || this.outcomeActive()) && points.length === 0) {
        const where = !this.focusActive() ? ''
          : this.state.division === 'thirds' ? ' en este tercio'
            : (this.state.focus.length > 1 ? ' en estas zonas' : ' en esta zona');
        empty.hidden = false;
        empty.textContent = this.outcomeActive()
          ? `No hay eventos «${this.outcomeLabel()}»${where}.`
          : `Ningún evento${where}.`;
      }
    }

    /*
      Everything the map draws, on any context at any size: the pitch, its
      divisions and focus, then the zones of control, the zones, the heat,
      the territories or the events. renderMap() paints the page's canvas
      with it; turnedCanvas() a download's.
    */
    paintMap(ctx, width, height) {
      const metrics = this.drawPitch(ctx, width, height);
      this.metrics = metrics;
      if (this.divisionEnabled()) {
        this.drawDivisions(ctx, metrics);
        // Under the events: a focused cell's events stay whole on top, an
        // arrow that ends outside the cell included.
        this.drawFocus(ctx, metrics);
      }
      const payload = this.state.payload;
      const allPoints = Array.isArray(payload?.points) ? payload.points : [];
      const zones = Array.isArray(payload?.zones) ? payload.zones : [];
      const control = payload?.viewKey === 'control' ? payload.control || null : null;
      if (control) {
        this.drawControl(ctx, metrics, control);
        return metrics;
      }
      if (!payload || (allPoints.length === 0 && zones.length === 0)) return metrics;
      const points = this.visiblePoints(payload);
      if (payload.viewKey === 'zone_plot') this.drawZones(ctx, metrics, zones);
      else if (this.drawsHeatmap(payload)) this.drawHeatmap(ctx, metrics, payload);
      else if (payload.viewKey === 'hull') this.drawHulls(ctx, metrics, points, payload);
      else this.drawScatter(ctx, metrics, points, payload);
      return metrics;
    }

    /*
      The map turned a quarter, its attack upwards, for a tall download
      (chart-download.js, Fase 6: Vertical and Historia): painted again at
      the canvas's own size, on its side. Text inside the pitch (zone
      values, cell numbers) is turned back upright; the thirds' names under
      it run along the side, as an axis title does. The page's hover
      targets are left as they were.
    */
    turnedCanvas() {
      const canvas = this.query('[data-map-canvas]');
      if (!canvas?.width || !canvas.height) return null;
      const { width, height } = canvas;
      const turned = document.createElement('canvas');
      turned.width = height;
      turned.height = width;
      const ctx = turned.getContext('2d');
      ctx.translate(0, width);
      ctx.rotate(-Math.PI / 2);

      ['fillText', 'strokeText'].forEach(name => {
        const draw = ctx[name].bind(ctx);
        ctx[name] = (text, x, y, ...rest) => {
          const m = this.metrics;
          const inside = m && x >= m.px(0) && x <= m.px(100) && y >= m.py(0) && y <= m.py(100);
          if (!inside) return draw(text, x, y, ...rest);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.PI / 2);
          draw(text, 0, 0, ...rest);
          ctx.restore();
          return undefined;
        };
      });

      const kept = { hitTargets: this.hitTargets, metrics: this.metrics };
      this.hitTargets = [];
      try {
        this.paintMap(ctx, width, height);
      } finally {
        this.hitTargets = kept.hitTargets;
        this.metrics = kept.metrics;
      }
      return turned;
    }

    drawDivisions(ctx, metrics) {
      paintDivisions(ctx, metrics, this.state.division);
    }

    drawFocus(ctx, metrics) {
      if (!this.focusActive()) return;
      paintFocus(ctx, metrics, this.state.division, this.state.focus);
    }

    /*
      The points the heatmap weighs. A shot carries its xG as `weight`, but a
      shot with no xG falls back to 1.0 - a whole goal's worth - so unless
      every shot has one (`xg_reliable`, the same test that sizes the scatter's
      dots) the shots are counted, not weighed. With a cell focused, only its
      events add heat.
    */
    heatPoints(payload) {
      const points = this.visiblePoints(payload);
      if (payload?.kind === 'shot' && payload.summary?.xg_reliable !== true) {
        return points.map(({ weight, ...point }) => point);
      }
      return points;
    }

    drawsHeatmap(payload) {
      if (payload?.viewKey !== 'heatmap' || !window.StatiskicksHeatmap) return false;
      const weighted = this.heatPoints(payload).filter(point => window.StatiskicksHeatmap.weightOf(point) > 0);
      return weighted.length >= MIN_HEATMAP_POINTS;
    }

    heatLegendLabel(payload) {
      if (payload?.kind === 'xt') return 'Más intenso = más xT generado';
      if (payload?.kind === 'shot' && payload.summary?.xg_reliable === true) return 'Más intenso = más xG';
      return 'Más intenso = más eventos';
    }

    drawHulls(ctx, metrics, points, payload) {
      const hulls = Array.isArray(payload.hulls) ? payload.hulls : [];
      const selected = this.selectedHull(hulls);
      hulls.forEach(hull => {
        if (hull !== selected) this.drawPolygon(ctx, metrics, hull.points, metrics.ink.tick, metrics.ink.tick, .05, .4);
      });
      if (selected) this.drawPolygon(ctx, metrics, selected.points, metrics.ink.series, metrics.ink.series, .16, .95);

      const own = payload.subject === 'team' && selected
        ? points.filter(point => point.player_id === selected.player_id)
        : points;
      own.forEach(point => {
        this.drawDot(ctx, metrics, point.x, point.y, MARKS.hullDot, metrics.ink.series, .9);
        this.registerPoint(metrics, point, MARKS.hullDot);
      });
    }

    drawPolygon(ctx, metrics, vertices, stroke, fill, fillAlpha, strokeAlpha) {
      if (!Array.isArray(vertices) || vertices.length < 3) return;
      const scale = Math.min(2, window.devicePixelRatio || 1);
      ctx.save();
      ctx.beginPath();
      vertices.forEach(([x, y], index) => {
        if (index === 0) ctx.moveTo(metrics.px(x), metrics.py(y));
        else ctx.lineTo(metrics.px(x), metrics.py(y));
      });
      ctx.closePath();
      ctx.globalAlpha = fillAlpha;
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.globalAlpha = strokeAlpha;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5 * scale;
      ctx.stroke();
      ctx.restore();
    }

    drawPitch(ctx, width, height) {
      return paintPitch(ctx, width, height);
    }

    drawZones(ctx, metrics, zones) {
      paintZones(ctx, metrics, zones);
    }

    // Each zone is its own hover target: its share and both sides' touches.
    drawControl(ctx, metrics, control) {
      paintControl(ctx, metrics, control, {
        onCell: (cell, rect) => this.hitTargets.push({ kind: 'cell', cell, ...rect }),
      });
    }

    /*
      The same density heatmap the Perfil tab draws (heatmap.js), projected
      onto this horizontal pitch. The Perfil heatmap is a canvas blended over
      an SVG pitch with CSS mix-blend-mode; here pitch and heat share one
      canvas, so the blend is a composite operation instead - which is also
      what keeps it in the PNG the download button exports.
    */
    drawHeatmap(ctx, metrics, payload) {
      const layer = this.heatLayer(metrics, payload);
      if (!layer) return;
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

    /*
      The coloured density as an offscreen canvas, rebuilt only when the
      payload, the focused cell, the canvas size or the theme changes - renderMap() also runs
      for the legend, the cluster slider and every theme flip. It is built at
      CSS-pixel resolution and scaled up: the density is smooth, so the extra
      device pixels would add cost, not detail.
    */
    heatLayer(metrics, payload) {
      const dark = window.StatiskicksHeatmap.isDark();
      const cache = this.heatCache;
      const focus = `${this.state.division}:${this.focusActive() ? this.state.focus.join(',') : ''}:${this.outcomeActive() ? this.state.outcome : ''}`;
      if (cache && cache.payload === payload && cache.focus === focus && cache.width === metrics.width && cache.height === metrics.height && cache.dark === dark) {
        return cache.canvas;
      }

      const scale = 1 / Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(metrics.width * scale));
      const height = Math.max(1, Math.round(metrics.height * scale));
      const image = window.StatiskicksHeatmap.buildImage(this.heatPoints(payload), {
        width,
        height,
        shortSide: Math.min(metrics.pw, metrics.ph) * scale,
        project: (x, y) => [metrics.px(x) * scale, metrics.py(y) * scale],
      });

      let canvas = null;
      if (image) {
        canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').putImageData(image, 0, 0);
      }

      this.heatCache = { payload, focus, width: metrics.width, height: metrics.height, dark, canvas };
      return canvas;
    }

    drawScatter(ctx, metrics, points, payload) {
      paintScatter(ctx, metrics, points, payload, {
        // Misses fade so completions lead; with one result focused there is nothing to lead.
        fadeMisses: !this.outcomeActive(),
        onPoint: (point, radius) => this.registerPoint(metrics, point, radius),
        onArrow: (point, width) => this.registerArrow(metrics, point, width),
      });
    }

    drawArrow(ctx, metrics, point, color, alpha, width) {
      paintArrow(ctx, metrics, point, color, alpha, width);
    }

    drawDot(ctx, metrics, x, y, radius, color, alpha) {
      paintDot(ctx, metrics, x, y, radius, color, alpha);
    }

    // Hover targets follow the marks' size, with a floor a pointer can find.
    registerPoint(metrics, point, radius) {
      this.hitTargets.push({
        kind: 'point', point, x: metrics.px(point.x), y: metrics.py(point.y),
        radius: Math.max(12 * metrics.scale, radius * metrics.unit + 8 * metrics.scale),
      });
    }

    registerArrow(metrics, point, width) {
      this.hitTargets.push({
        kind: 'arrow', point,
        x0: metrics.px(point.x), y0: metrics.py(point.y),
        x1: metrics.px(point.end_x), y1: metrics.py(point.end_y),
        radius: Math.max(8 * metrics.scale, (width * metrics.unit) / 2 + 6 * metrics.scale),
      });
    }

    syncTooltip(event) {
      const canvas = this.query('[data-map-canvas]');
      const tooltip = this.query('[data-map-tooltip]');
      if (!canvas || !tooltip || !this.hitTargets.length) return;
      const rect = canvas.getBoundingClientRect();
      const canvasX = (event.clientX - rect.left) * (canvas.width / rect.width);
      const canvasY = (event.clientY - rect.top) * (canvas.height / rect.height);
      const target = this.findHitTarget(canvasX, canvasY);
      if (!target) { this.hideTooltip(); return; }
      tooltip.innerHTML = this.tooltipHtml(target);
      tooltip.hidden = false;
      // The tooltip is placed in the wrap, where the canvas may start lower
      // (10px under the download button, sk.css).
      this.placeTooltip(tooltip, event.clientX - rect.left, event.clientY - rect.top + canvas.offsetTop, rect.width, rect.height + canvas.offsetTop);
    }

    /*
      Below and right of the pointer, flipped to the other side wherever that
      would cross the map's edge - the wrap clips its overflow, so a tooltip
      near a touchline or a goal line used to be cut off.
    */
    placeTooltip(tooltip, x, y, width, height) {
      const gap = 12;
      const margin = 4;
      const w = tooltip.offsetWidth;
      const h = tooltip.offsetHeight;
      const left = x + gap + w > width - margin ? x - gap - w : x + gap;
      const top = y + gap + h > height - margin ? y - gap - h : y + gap;
      tooltip.style.left = `${Math.max(margin, Math.min(width - margin - w, left))}px`;
      tooltip.style.top = `${Math.max(margin, Math.min(height - margin - h, top))}px`;
    }

    findHitTarget(x, y) {
      let best = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      this.hitTargets.forEach(target => {
        if (target.kind === 'cell') {
          if (x >= target.x && x < target.x + target.w && y >= target.y && y < target.y + target.h) best = target;
          return;
        }
        const distance = target.kind === 'arrow'
          ? this.distanceToSegment(x, y, target.x0, target.y0, target.x1, target.y1)
          : Math.hypot(x - target.x, y - target.y);
        if (distance <= target.radius && distance < bestDistance) {
          best = target;
          bestDistance = distance;
        }
      });
      return best;
    }

    distanceToSegment(px, py, x0, y0, x1, y1) {
      const dx = x1 - x0, dy = y1 - y0;
      if (dx === 0 && dy === 0) return Math.hypot(px - x0, py - y0);
      const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
    }

    tooltipHtml(target) {
      if (target.kind === 'cell') return this.cellTooltipHtml(target.cell);
      const point = target.point || {};
      const rows = [];
      const title = this.state.payload?.eventLabel || this.eventConfig()?.label || 'Evento';
      if (point.outcome_label) rows.push(point.outcome_label);
      if (target.kind === 'arrow' || (point.end_x !== undefined && point.end_y !== undefined)) {
        rows.push(`Inicio (${this.coord(point.x)}, ${this.coord(point.y)})`);
        rows.push(`Fin (${this.coord(point.end_x)}, ${this.coord(point.end_y)})`);
      } else {
        rows.push(`Ubicación (${this.coord(point.x)}, ${this.coord(point.y)})`);
      }
      if (point.minute !== null && point.minute !== undefined) {
        const second = point.second !== null && point.second !== undefined ? `:${String(point.second).padStart(2, '0')}` : '';
        rows.push(`Min ${point.minute}${second}`);
      }
      if (point.player_name) rows.push(point.player_name);
      if (point.xg !== null && point.xg !== undefined) rows.push(`xG ${Number(point.xg).toFixed(2)}`);
      if (point.xt !== null && point.xt !== undefined) rows.push(`xT ${Number(point.xt) >= 0 ? '+' : ''}${Number(point.xt).toFixed(3)}`);
      if (point.goal && !point.outcome_label) rows.push('Gol');
      if (point.success !== undefined && !point.outcome_label) rows.push(point.success ? 'Exitoso' : 'Intentado');
      if (point.match_display) rows.push(point.match_display);
      else if (point.match_id) rows.push(`Partido ${point.match_id}`);
      return `<strong>${escapeHtml(title)}</strong>${rows.map(row => `<div>${escapeHtml(row)}</div>`).join('')}`;
    }

    cellTooltipHtml(cell) {
      const rows = [
        cell.share === null || cell.share === undefined ? 'Sin toques' : `${cell.share}% de los toques`,
        `${Number(cell.team || 0)} del equipo · ${Number(cell.opponent || 0)} del rival`,
        `${Number(cell.per_match || 0).toFixed(1)} toques por partido${cell.sparse ? ': muy pocos para juzgarla' : ''}`,
      ];
      return `<strong>${escapeHtml(CONTROL_STATES[cell.state] || 'Zona')}</strong>${rows.map(row => `<div>${escapeHtml(row)}</div>`).join('')}`;
    }

    coord(value) {
      const number = Number(value);
      return Number.isFinite(number) ? number.toFixed(1).replace(/\.0$/, '') : '-';
    }

    hideTooltip() {
      const tooltip = this.query('[data-map-tooltip]');
      if (tooltip) tooltip.hidden = true;
    }
  }

  function boot() {
    document.querySelectorAll('[data-sk-event-map]').forEach(root => {
      const id = root.dataset.instanceId;
      const existing = controllers.get(id);
      if (existing?.root === root) return;
      existing?.destroy();
      controllers.set(id, new EventMapController(root));
    });
    controllers.forEach((controller, id) => {
      if (!controller.root?.isConnected) {
        controller.destroy();
        controllers.delete(id);
      }
    });
  }

  function closeAllDropdowns(event) {
    controllers.forEach(controller => {
      const clickedDropdown = event?.target?.closest?.('[data-map-dropdown-trigger], [data-map-dropdown-menu]');
      if (!clickedDropdown || !controller.root.contains(clickedDropdown)) controller.closeDropdowns();
    });
  }

  function handlePillKeyboard(event) {
    const trigger = event.target.closest('[data-sk-pill-trigger]');
    if (trigger && event.key === 'ArrowDown') {
      event.preventDefault();
      if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
      requestAnimationFrame(() => trigger.closest('[data-sk-pill-dropdown]')?.querySelector('.sk-menu-item:not(:disabled)')?.focus());
      return;
    }
    const item = event.target.closest('[data-sk-pill-dropdown] .sk-menu-item');
    if (!item || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(item.closest('.sk-dropdown-menu')?.querySelectorAll('.sk-menu-item:not(:disabled)') || []);
    const index = items.indexOf(item);
    event.preventDefault();
    if (event.key === 'Home') items[0]?.focus();
    else if (event.key === 'End') items[items.length - 1]?.focus();
    else items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  }

  window.StatiskicksEventMap = {
    boot,
    activate(id) { boot(); controllers.get(id)?.activate(); },
    invalidate(id, options) { boot(); controllers.get(id)?.invalidate(options); },
    destroy(id) { controllers.get(id)?.destroy(); controllers.delete(id); },
    controller(id) { boot(); return controllers.get(id) || null; },
    paint: {
      pitch: paintPitch,
      dot: paintDot,
      arrow: paintArrow,
      scatter: paintScatter,
      zones: paintZones,
      control: paintControl,
      gridViews: GRID_VIEWS,
      divisions: paintDivisions,
      focus: paintFocus,
      divisionCell,
      cellBounds,
      focusLabel,
      divisionKeys: Object.keys(DIVISIONS),
      ink: readMapInk,
      swatchColor,
      minHeatmapPoints: MIN_HEATMAP_POINTS,
    },
  };

  document.addEventListener('click', closeAllDropdowns);
  document.addEventListener('keydown', handlePillKeyboard);
  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('livewire:navigated', boot);
  document.addEventListener('livewire:init', () => {
    if (window.Livewire?.hook) window.Livewire.hook('morph.updated', () => requestAnimationFrame(boot));
  });
  /*
    Debounced the way the Perfil tab's resize work is: a heatmap redraw
    rebuilds its density at the new size, which a drag would otherwise ask
    for on every frame.
  */
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => controllers.forEach(controller => { if (controller.active) controller.renderMap(); }), 120);
  });

  new MutationObserver(() => controllers.forEach(controller => { if (controller.active) controller.renderMap(); }))
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  boot();
})();
