(function () {
  /*
    The team page's rolling xG vs xGA. Every point arrives computed from
    OptaTeamXgTimelineService: the chart only draws. The x axis is one step per
    league match, both seasons in a row, labelled by month; the first four
    matches hold their place on the axis but carry no average.
  */
  const MIN_TICK_GAP = 52;
  const LABEL_FONT = '600 11px Inter, sans-serif';
  const LABEL_ROW = 16;
  const LABEL_GAP = 8;
  /* The y axis's ticks and title, before the first layout has measured them. */
  const PLOT_LEFT_GUESS = 56;
  const POINT_RADIUS = 4;
  const POINT_BORDER = 2;
  /* Room past the last match for its end dot, which sits on the right edge. */
  const EDGE_ROOM = POINT_RADIUS + POINT_BORDER + 4;
  /*
    The download button sits over the canvas's top-right corner (20px, 8px
    in). The plot starts below it and no manager's name runs under it.
  */
  const BUTTON_ROOM = 32;

  function decimal(value, digits = 2) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(digits).replace('.', ',') : '—';
  }

  function withAlpha(color, alpha) {
    const hex = String(color).trim().match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const n = parseInt(hex[1], 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }

    const rgb = String(color).match(/rgba?\(([^)]+)\)/);
    if (rgb) {
      const [r, g, b] = rgb[1].split(',').map(part => part.trim());
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    return color;
  }

  function areaFill(color, opacity) {
    return context => {
      const { chart } = context;
      const area = chart.chartArea;
      if (!area) return withAlpha(color, opacity / 2);

      const gradient = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      gradient.addColorStop(0, withAlpha(color, opacity));
      gradient.addColorStop(1, withAlpha(color, 0));
      return gradient;
    };
  }

  /*
    Month labels thinned to what fits: never two closer than MIN_TICK_GAP px.
    Ticks are built before the scale places itself, so pixels come from the
    width and range rather than getPixelForValue().
  */
  function fittingTicks(scale, monthTicks) {
    const kept = [];
    const range = Math.max(scale.max - scale.min, 1);
    let lastPixel = -Infinity;

    monthTicks.forEach(tick => {
      const pixel = ((tick.index - scale.min) / range) * scale.width;
      if (pixel - lastPixel < MIN_TICK_GAP) return;
      kept.push({ value: tick.index, label: tick.label });
      lastPixel = pixel;
    });

    return kept;
  }

  class TeamXgRolling {
    constructor(root) {
      this.root = root;
      this.chart = null;
      this.payload = this.readPayload();
    }

    readPayload() {
      const source = this.root.querySelector('[data-team-xg-rolling-payload]');
      if (!source) return {};

      try {
        return JSON.parse(source.textContent || '{}');
      } catch (error) {
        return {};
      }
    }

    render() {
      const canvas = this.root.querySelector('[data-team-xg-rolling-canvas]');
      const points = Array.isArray(this.payload?.points) ? this.payload.points : [];

      this.destroy();

      if (!canvas || typeof window.Chart === 'undefined' || this.payload?.status !== 'ready' || points.length === 0) {
        return;
      }

      const rootStyles = getComputedStyle(this.root);
      const readVar = (name, fallback) => rootStyles.getPropertyValue(name).trim() || fallback;
      const xgColor = readVar('--xg-for', '#1F7A68');
      const xgaColor = readVar('--xg-against', '#AE4444');
      const text = readVar('--chart-label', '#141A15');
      const muted = readVar('--chart-tick', '#55625A');
      const grid = readVar('--chart-grid', 'rgba(16,21,17,0.14)');
      const outline = readVar('--chart-outline', 'rgba(16,21,17,0.26)');
      const surface = readVar('--chart-surface', '#ffffff');

      const lastIndex = points.length - 1;
      const series = key => points
        .map((point, index) => ({ x: index, y: point[key] }))
        .filter(point => point.y !== null && Number.isFinite(Number(point.y)));
      const averages = points.flatMap(point => [point.rolling_xg, point.rolling_xga])
        .filter(value => value !== null && Number.isFinite(Number(value)))
        .map(Number);
      // Headroom both ways so a peak's dot sits inside the plot, never below zero.
      const low = Math.min(...averages);
      const high = Math.max(...averages);
      const pad = Math.max((high - low) * 0.12, 0.1);
      const monthTicks = Array.isArray(this.payload.month_ticks) ? this.payload.month_ticks : [];
      const monthLabels = new Map(monthTicks.map(tick => [tick.index, tick.label]));
      const coachChanges = Array.isArray(this.payload.coach_changes) ? this.payload.coach_changes : [];
      const seasonStarts = Array.isArray(this.payload.season_starts) ? this.payload.season_starts : [];

      /*
        Manager names get their own band above the plot, so no line or fill
        can cover them; each dashed line runs from its name down to the axis.
        A name that would run into one already placed drops a row; one that
        would pass the right edge (or run under the download button) reads
        leftwards. The band is as deep as the names need at this width:
        beforeLayout places them on an estimate of the plot and sizes the
        padding, then the draw places them on the real one in those rows.
      */
      const placeLabels = (chart, pixelFor, rowLimit, gap) => {
        const { ctx } = chart;
        const rowEnds = [];

        ctx.save();
        ctx.font = LABEL_FONT;
        const placed = coachChanges.map(change => {
          const x = pixelFor(change.index - 0.5);
          const label = change.manager || 'Cambio de entrenador';
          const width = ctx.measureText(label).width;
          const flip = x + 6 + width > chart.width - BUTTON_ROOM;
          // Where the text is anchored: its left end, or its right end when
          // flipped, which never reaches under the download button either.
          const anchor = flip ? Math.min(x - 6, chart.width - BUTTON_ROOM) : x + 6;
          const left = flip ? anchor - width : anchor;
          let row = rowEnds.findIndex(end => left > end + gap);

          if (row === -1 && rowEnds.length < rowLimit) {
            row = rowEnds.length;
          } else if (row === -1) {
            row = rowEnds.indexOf(Math.min(...rowEnds));
          }

          rowEnds[row] = left + width;

          return { x, anchor, label, flip, row };
        });
        ctx.restore();

        return { placed, rows: rowEnds.length };
      };

      const bandPlugin = {
        id: 'teamXgRollingBand',
        beforeLayout(chart) {
          const left = PLOT_LEFT_GUESS;
          const right = chart.width - EDGE_ROOM;
          const max = Math.max(lastIndex, 1);
          const estimate = placeLabels(chart, value => left + (value / max) * (right - left), Infinity, LABEL_GAP + 6);

          chart.$xgRollingRows = estimate.rows;
          chart.options.layout.padding.top = Math.max(BUTTON_ROOM, 8 + (estimate.rows * LABEL_ROW));
        },
      };

      const markersPlugin = {
        id: 'teamXgRollingMarkers',
        beforeDatasetsDraw(chart) {
          const { ctx, chartArea, scales } = chart;
          if (!chartArea || !scales?.x) return;

          // Every name drawn, as a box, for the browser tests to check it fits.
          const boxes = [];
          const box = (kind, x, top, width, flip) => boxes.push({
            kind,
            left: flip ? x - width : x,
            right: flip ? x : x + width,
            top,
            bottom: top + 13,
          });

          ctx.save();
          ctx.font = LABEL_FONT;
          ctx.textBaseline = 'top';

          // A new season: a solid hairline, its name along the foot, turned
          // leftwards when it starts too close to the right edge to fit.
          seasonStarts.forEach(start => {
            const x = scales.x.getPixelForValue(start.index - 0.5);
            const flip = x + 6 + ctx.measureText(start.label).width > chartArea.right;
            ctx.strokeStyle = grid;
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.stroke();
            ctx.fillStyle = muted;
            ctx.textAlign = flip ? 'right' : 'left';
            ctx.fillText(start.label, flip ? x - 6 : x + 6, chartArea.bottom - 16);
            box('season', flip ? x - 6 : x + 6, chartArea.bottom - 16, ctx.measureText(start.label).width, flip);
          });

          const rows = chart.$xgRollingRows || 0;
          const { placed } = placeLabels(chart, value => scales.x.getPixelForValue(value), Math.max(rows, 1), LABEL_GAP);

          placed.forEach(({ x, anchor, label, flip, row }) => {
            const top = chartArea.top - ((rows - row) * LABEL_ROW);
            ctx.strokeStyle = outline;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = text;
            ctx.textAlign = flip ? 'right' : 'left';
            ctx.fillText(label, anchor, top + 2);
            box('coach', anchor, top + 2, ctx.measureText(label).width, flip);
          });

          ctx.restore();
          chart.$xgRollingLabelBoxes = boxes;
        },
      };

      const dataset = (label, key, color, opacity) => ({
        label,
        data: series(key),
        parsing: false,
        borderColor: color,
        backgroundColor: areaFill(color, opacity),
        fill: 'start',
        borderWidth: 2.5,
        tension: 0.35,
        // The end dot sits on the plot's right edge: clipped to the plot it
        // showed half a circle, so it draws into the padding kept for it.
        clip: false,
        pointRadius: context => (context.raw?.x === lastIndex ? POINT_RADIUS : 0),
        pointHoverRadius: POINT_RADIUS,
        pointBackgroundColor: color,
        pointBorderColor: surface,
        pointBorderWidth: POINT_BORDER,
        pointHoverBorderWidth: POINT_BORDER,
      });

      this.chart = new window.Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          datasets: [
            dataset('xG en contra', 'rolling_xga', xgaColor, 0.16),
            dataset('xG a favor', 'rolling_xg', xgColor, 0.22),
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 180 },
          interaction: { mode: 'index', intersect: false, axis: 'x' },
          // top is set per width by bandPlugin, before every layout.
          layout: { padding: { top: BUTTON_ROOM, right: EDGE_ROOM, bottom: 0, left: 0 } },
          scales: {
            x: {
              type: 'linear',
              min: 0,
              max: Math.max(lastIndex, 1),
              grid: { display: false },
              border: { color: outline },
              afterBuildTicks: scale => {
                scale.ticks = fittingTicks(scale, monthTicks);
              },
              ticks: {
                autoSkip: false,
                maxRotation: 0,
                color: muted,
                callback: value => monthLabels.get(value) ?? '',
              },
            },
            y: {
              suggestedMin: Math.max(0, low - pad),
              suggestedMax: high + pad,
              grid: { color: grid },
              border: { display: false },
              title: { display: true, text: 'xG por partido (media móvil)', color: text, font: { weight: '700' } },
              ticks: { color: muted, maxTicksLimit: 6, callback: value => decimal(value, 1) },
            },
          },
          plugins: {
            legend: { display: false },
            datalabels: { display: false },
            tooltip: {
              callbacks: {
                title(items) {
                  const point = points[items[0]?.raw?.x];
                  if (!point) return '';
                  const venue = point.home ? 'vs' : 'en';
                  const score = point.score ? ` (${point.score})` : '';
                  return `${point.date} · ${venue} ${point.opponent}${score}`;
                },
                label(item) {
                  return `${item.dataset.label}: ${decimal(item.raw?.y)}`;
                },
                afterBody(items) {
                  const point = points[items[0]?.raw?.x];
                  if (!point) return [];
                  const lines = [`Partido: xG ${decimal(point.xg)} · xGA ${decimal(point.xga)}`];
                  if (point.manager) lines.push(`Entrenador: ${point.manager}`);
                  return lines;
                },
              },
            },
          },
        },
        plugins: [bandPlugin, markersPlugin],
      });
    }

    destroy() {
      if (!this.chart) return;

      try {
        this.chart.destroy();
      } catch (error) {
        // Chart.js may already have released the canvas during Livewire navigation.
      }

      this.chart = null;
    }
  }

  const instances = new WeakMap();

  window.StatiskicksTeamXgRolling = {
    boot() {
      document.querySelectorAll('[data-team-xg-rolling]').forEach(root => {
        let instance = instances.get(root);
        if (!instance) {
          instance = new TeamXgRolling(root);
          instances.set(root, instance);
        }

        instance.payload = instance.readPayload();
        instance.render();
      });
    },
  };

  // A theme flip repaints with the other theme's inks.
  new MutationObserver(() => window.StatiskicksTeamXgRolling.boot())
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
