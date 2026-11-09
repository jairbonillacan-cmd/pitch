/*
  Rank bars on canvas: the attribute bars the player and team pages draw
  (attribute-charts.js createBarChart()). One row per attribute - its name,
  then the measure: a track with a round-ended fill and the rank badge at its
  end, the look of the advanced search's HTML rank bars (.sk-rank-bar in
  sk.css). Its geometry, ink and timing are read off that stylesheet's
  tokens, and the fill's gradient is placed server-side (App\Support\RankBands),
  so the two cannot drift apart.

  Chart.js lays the rows out, animates them and runs the tooltips; its bars
  are transparent and everything visible is painted by the rows plugin below.
*/
(() => {
  const charts = new WeakMap();

  function cssColor(name, fallback) {
    const styles = getComputedStyle(document.documentElement);
    let value = styles.getPropertyValue(name).trim();
    const visited = new Set([name]);

    while (value.startsWith('var(')) {
      const nested = value.match(/^var\(\s*(--[^,\s)]+)/)?.[1];
      if (!nested || visited.has(nested)) return fallback;
      visited.add(nested);
      value = styles.getPropertyValue(nested).trim();
    }

    return value || fallback;
  }

  function cssNumber(name, fallback) {
    const value = parseFloat(cssColor(name, ''));
    return Number.isFinite(value) ? value : fallback;
  }

  // A duration token ("620ms", "0.62s") in milliseconds.
  function cssDuration(name, fallback) {
    const raw = cssColor(name, '');
    const value = parseFloat(raw);

    if (!Number.isFinite(value)) return fallback;

    return /ms$/.test(raw) || !/s$/.test(raw) ? value : value * 1000;
  }

  /*
    The rank bars' shared geometry and timing, from the tokens sk.css gives
    its HTML rank bars (:root, "Rank bars"), in px.
  */
  function rankBarLook() {
    return {
      trackHeight: cssNumber('--rank-bar-height', 14),
      trackRadius: cssNumber('--rank-bar-radius', 7),
      gap: cssNumber('--rank-bar-gap', 14),
      growMs: cssDuration('--rank-bar-grow', 620),
      badgeMinWidth: cssNumber('--rank-badge-min-width', 42),
      badgeHeight: cssNumber('--rank-badge-height', 24),
      badgePadding: cssNumber('--rank-badge-padding', 8),
      badgeRadius: cssNumber('--rank-badge-radius', 6),
      badgeFontSize: cssNumber('--rank-badge-font-size', 12),
    };
  }

  function prefersReducedMotion() {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function clamp(value, minimum = 0, maximum = 100) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : minimum;
  }

  /*
    The one percentile ramp these rows and everything drawn through
    percentileColor share, so a percentile reads the same wherever it is shown.
    Three bands (App\Support\RankBands): green from 70, yellow from 40,
    orange below.
  */
  const BANDS = [
    { floor: 70, token: '--rank-high', fallback: '#93CC63' },
    { floor: 40, token: '--rank-mid', fallback: '#F0C32E' },
    { floor: -Infinity, token: '--rank-low', fallback: '#F2924A' },
  ];

  function color(percentile) {
    const value = Number(percentile);
    const band = BANDS.find(entry => Number.isFinite(value) && value >= entry.floor) || BANDS[BANDS.length - 1];

    return cssColor(band.token, band.fallback);
  }

  // The band's name, as the HTML rank bars' modifiers spell it (--high, --mid, --low).
  function band(percentile) {
    const value = Number(percentile);
    const found = BANDS.find(entry => Number.isFinite(value) && value >= entry.floor) || BANDS[BANDS.length - 1];

    return found.token.replace('--rank-', '');
  }

  function badge(percentile) {
    if (percentile === null || percentile === undefined || percentile === '') return '—';
    const value = Number(percentile);
    return Number.isFinite(value) ? String(Math.round(value)) : '—';
  }

  function roundedRectPath(ctx, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, height / 2, Math.abs(width) / 2);

    if (ctx.roundRect) {
      ctx.roundRect(x, y, width, height, safeRadius);
      return;
    }

    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  }

  function bandColor(token) {
    const band = BANDS.find(entry => entry.token === token);
    return cssColor(token, band ? band.fallback : '#F2924A');
  }

  /*
    The fill's gradient, laid across the whole track so a bar shows it only up
    to its own length and ends in its badge's colour: the canvas form of
    .sk-rank-bars--graded. The stops are the server's (RankBands::gradient()),
    in % of the track; null without them, when the fill is its band's colour.
  */
  function trackGradient(ctx, left, right, stops) {
    const offsets = [stops?.low, stops?.mid_from, stops?.mid_to, stops?.high].map(Number);

    if (!stops || !offsets.every(Number.isFinite) || right <= left) return null;

    const colours = [bandColor('--rank-low'), bandColor('--rank-mid'), bandColor('--rank-mid'), bandColor('--rank-high')];
    const gradient = ctx.createLinearGradient(left, 0, right, 0);
    let previous = 0;

    offsets.forEach((offset, index) => {
      // Never behind the stop before it, as CSS would clamp it.
      previous = Math.max(previous, clamp(offset) / 100);
      gradient.addColorStop(previous, colours[index]);
    });

    return gradient;
  }

  function ellipsize(ctx, text, maximumWidth) {
    const value = String(text ?? '');
    if (ctx.measureText(value).width <= maximumWidth) return value;

    let output = value;
    while (output.length > 0 && ctx.measureText(`${output}…`).width > maximumWidth) {
      output = output.slice(0, -1);
    }

    return output ? `${output}…` : '';
  }

  function destroy(canvas) {
    const chart = charts.get(canvas) || (window.Chart?.getChart ? window.Chart.getChart(canvas) : null);

    if (chart) {
      try {
        chart.destroy();
      } catch (_error) {
        // Navigation may already have released the Chart.js instance.
      }
    }

    charts.delete(canvas);
  }

  function create(canvas, config = {}) {
    if (!canvas || typeof window.Chart === 'undefined') return null;

    destroy(canvas);

    const entries = Array.isArray(config.entries) ? config.entries : [];
    const rowHeight = Number(config.rowHeight) > 0 ? Number(config.rowHeight) : 64;
    const padding = Number(config.padding) >= 0 ? Number(config.padding) : 24;
    const wrapper = config.wrapper || canvas.parentElement;

    if (wrapper) wrapper.style.height = `${entries.length * rowHeight + padding}px`;

    /*
      Rows are rebuilt rather than updated, so a caller that is only repainting -
      a theme flip resolves its colours through a fresh build - opts out instead
      of regrowing bars whose numbers have not moved.
    */
    const animate = config.animate !== false && !prefersReducedMotion();

    canvas.style.width = '';
    canvas.style.height = '';
    canvas.width = 0;
    canvas.height = 0;

    const look = rankBarLook();

    const rowsPlugin = {
      id: `statiskicksPercentileRows-${config.instanceId || 'default'}`,
      afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        const meta = chart.getDatasetMeta(0);
        const labelColor = cssColor('--chart-label', '#141A15');
        const trackColor = cssColor('--chart-grid', 'rgba(16,21,17,0.14)');
        const meanMarkerColor = cssColor('--chart-outline', 'rgba(16,21,17,0.26)');
        const unavailableColor = cssColor('--chart-tick', '#55625A');
        const separatorColor = cssColor('--border-light', 'rgba(16,21,17,0.12)');
        const inkColor = cssColor('--rank-ink', '#0e1e14');
        // .sk-rank-badge--none: nothing to rank against.
        const emptyBadgeColor = cssColor('--bg-secondary', '#EEF1EC');
        const emptyInkColor = cssColor('--text-secondary', '#55625A');
        const badgeFont = `700 ${look.badgeFontSize}px Inter, sans-serif`;

        ctx.save();

        entries.forEach((entry, index) => {
          const bar = meta.data[index];
          if (!bar) return;

          const available = entry.available !== false;
          const ratio = available ? clamp(entry.ratio) : 0;
          const entryColor = available ? color(entry.colorPercentile) : unavailableColor;
          const badgeText = available ? String(entry.badge ?? badge(entry.colorPercentile)) : '—';
          const rowY = bar.y;
          /*
            Two lines per row: the name, then the measure - the track with the
            badge at its end, as an HTML rank bar lays them out.
          */
          const labelY = rowY - 15;
          const lineY = rowY + 10;
          const left = chartArea.left + 2;
          const right = chartArea.right - 2;

          ctx.font = badgeFont;
          const badgeWidth = Math.max(look.badgeMinWidth, ctx.measureText(badgeText).width + look.badgePadding * 2);
          const badgeX = right - badgeWidth;
          const badgeY = lineY - look.badgeHeight / 2;
          const trackRight = badgeX - look.gap;
          const trackWidth = Math.max(0, trackRight - left);
          const trackY = lineY - look.trackHeight / 2;

          ctx.font = '700 13px Inter, sans-serif';
          ctx.fillStyle = available ? labelColor : unavailableColor;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(ellipsize(ctx, entry.label, Math.max(40, right - left)), left, labelY);

          ctx.beginPath();
          roundedRectPath(ctx, left, trackY, trackWidth, look.trackHeight, look.trackRadius);
          ctx.fillStyle = trackColor;
          ctx.fill();

          /*
            The fill is measured off the bar element rather than off entry.ratio,
            so it inherits Chart.js's animation. The bar itself is transparent -
            everything visible in a row is painted here - so without this the
            rows appeared fully drawn on the first frame while the invisible bar
            was the only thing growing.
          */
          const span = chartArea.right - chartArea.left;
          const drawnRatio = span > 0
            ? clamp(((bar.x - chartArea.left) / span) * 100)
            : ratio;
          const fillWidth = trackWidth * ((available ? drawnRatio : 0) / 100);
          if (fillWidth > 0) {
            ctx.beginPath();
            roundedRectPath(ctx, left, trackY, fillWidth, look.trackHeight, look.trackRadius);
            ctx.fillStyle = trackGradient(ctx, left, trackRight, entry.gradient) || entryColor;
            ctx.fill();
          }

          ctx.beginPath();
          roundedRectPath(ctx, badgeX, badgeY, badgeWidth, look.badgeHeight, look.badgeRadius);
          ctx.fillStyle = available ? entryColor : emptyBadgeColor;
          ctx.fill();

          ctx.font = badgeFont;
          ctx.fillStyle = available ? inkColor : emptyInkColor;
          ctx.textAlign = 'center';
          ctx.fillText(badgeText, badgeX + badgeWidth / 2, lineY + 0.5);

          /*
            A hairline between rows, placed midway to the next one rather than at
            a fixed offset, so it stays centred whatever rowHeight the caller
            asked for. Nothing is drawn after the last row - the card's own edge
            closes the list.
          */
          if (config.rowSeparators) {
            const next = meta.data[index + 1];

            if (next) {
              // Half-pixel offset so a 1px line lands on the pixel, not across two.
              const separatorY = Math.round((rowY + next.y) / 2) + 0.5;

              ctx.save();
              ctx.strokeStyle = separatorColor;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(chartArea.left, separatorY);
              ctx.lineTo(chartArea.right, separatorY);
              ctx.stroke();
              ctx.restore();
            }
          }

          // The peers' average: a dashed tick across the track, a little past its edges.
          if (available && config.showAverage && Number.isFinite(Number(entry.averageRatio))) {
            const markerX = left + trackWidth * (clamp(entry.averageRatio) / 100);
            const reach = look.trackHeight / 2 + 5;
            ctx.save();
            ctx.strokeStyle = meanMarkerColor;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(markerX, lineY - reach);
            ctx.lineTo(markerX, lineY + reach);
            ctx.stroke();
            ctx.restore();
          }
        });

        ctx.restore();
      },
    };

    const tooltipCallbacks = config.tooltipCallbacks || {};
    const entryFor = item => entries[item?.dataIndex] || null;
    const chart = new window.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: entries.map(entry => entry.label),
        datasets: [{
          data: entries.map(entry => entry.available === false ? 0 : clamp(entry.ratio)),
          backgroundColor: 'rgba(0,0,0,0)',
          hoverBackgroundColor: 'rgba(0,0,0,0)',
          borderWidth: 0,
          borderRadius: 999,
          borderSkipped: false,
          barPercentage: 1,
          categoryPercentage: 0.9,
          maxBarThickness: 48,
          datalabels: { display: false },
        }],
      },
      plugins: [rowsPlugin],
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        /*
          Grown from zero on a build that carries new numbers - the trait set,
          the chart type or the unit changed - so "from the left edge" is the
          right start for all three.
        */
        animation: animate
          ? { duration: look.growMs, easing: 'easeOutQuart' }
          : false,
        animations: animate
          ? { x: { from: context => context.chart.scales.x?.getPixelForValue(0) } }
          : {},
        layout: { padding: { top: 8, right: 8, bottom: 8, left: 8 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            /*
              Rows are read one at a time, so the box is placed under the row it
              describes rather than over it - yAlign 'top' puts the caret at the
              tooltip's top edge, which hangs the body below the point - and
              anchored to the row actually pointed at. Chart.js draws inside the
              canvas and does not wrap, so a caller's lines have to be short
              enough to fit the card; these are.
            */
            position: 'nearest',
            yAlign: 'top',
            caretPadding: 10,
            filter: item => item.datasetIndex === 0 && entryFor(item)?.available !== false,
            callbacks: {
              title: items => {
                const entry = entryFor(items?.[0]);
                return tooltipCallbacks.title ? tooltipCallbacks.title(entry) : (entry?.label || '');
              },
              label: item => {
                const entry = entryFor(item);
                return tooltipCallbacks.label ? tooltipCallbacks.label(entry) : [];
              },
              afterBody: items => {
                const entry = entryFor(items?.[0]);
                return tooltipCallbacks.afterBody ? tooltipCallbacks.afterBody(entry) : [];
              },
            },
          },
          datalabels: { display: false },
        },
        scales: {
          x: {
            min: 0,
            max: 100,
            stacked: false,
            grid: { display: false },
            ticks: { display: false },
            border: { display: false },
          },
          y: {
            stacked: false,
            grid: { display: false },
            ticks: { display: false },
            border: { display: false },
          },
        },
      },
    });

    chart.$statiskicksEntries = entries;
    charts.set(canvas, chart);
    return chart;
  }

  window.StatiskicksPercentileRows = { create, destroy, color, band, badge };
})();
