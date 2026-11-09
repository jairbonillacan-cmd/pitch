(function () {
  'use strict';

  if (window.StatiskicksHeatmap) return;

  /*
    Heatmap thresholds — shared by the Perfil tab, the Comparación tab and the
    "Mapas y gráficas" event maps, so every heatmap in the app reads alike.

    Density is accumulated in a float grid and scaled against a high
    percentile of the area the points actually cover, not against its single
    hottest pixel. Scaling by the maximum let one cluster of stacked events
    (a corner-kick taker's corners, or the x=0,y=0 placeholder events that used
    to be plotted) set the scale for the whole map, which squeezed everything
    else into the bottom few percent of the palette: the faint wash that was
    hard to read. The 8-bit alpha accumulation it replaces also stepped in
    visible rings; a float grid has no steps.
  */
  const RADIUS_SHARE = 0.095;          // kernel radius, as a share of the pitch's short side
  const REFERENCE_PERCENTILE = 0.985;  // covered cells at or above this density draw at full heat
  const COVERAGE_FLOOR = 0.01;         // cells under 1% of the peak are kernel tail, not coverage
  const GAMMA = 0.7;                   // < 1 lifts the low densities so sparse areas stay legible
  const PALETTE_STEPS = 1024;

  // t is a share of the reference density. The alpha ramp over the first
  // stops is the fade-in from the pitch; without it a lone touch ends in a
  // hard-edged disc.
  const DARK_STOPS = [
    { t: 0.00, rgba: [  0,   0,   0,   0] },
    { t: 0.12, rgba: [ 96,  62, 176, 115] },
    { t: 0.30, rgba: [ 62,  98, 190, 195] },
    { t: 0.48, rgba: [ 33, 160, 150, 235] },
    { t: 0.70, rgba: [253, 231,  37, 255] },
    { t: 1.00, rgba: [255,  60,  20, 255] },
  ];

  // Light mode keeps the dark breakpoints so both themes draw the same shape.
  const LIGHT_STOPS = [
    { t: 0.00, rgba: [255, 255, 255,   0] },
    { t: 0.12, rgba: [ 95, 220, 135, 140] },
    { t: 0.30, rgba: [ 45, 205, 110, 205] },
    { t: 0.48, rgba: [130, 220,  80, 230] },
    { t: 0.70, rgba: [250, 220,  45, 250] },
    { t: 1.00, rgba: [220,  60,  65, 255] },
  ];

  function buildPalette(stops) {
    const palette = new Array(PALETTE_STEPS);

    for (let i = 0; i < PALETTE_STEPS; i++) {
      // The gamma is baked in here so colouring a cell is one lookup.
      const t = Math.pow(i / (PALETTE_STEPS - 1), GAMMA);

      let left = stops[0];
      let right = stops[stops.length - 1];

      for (let j = 0; j < stops.length - 1; j++) {
        if (t >= stops[j].t && t <= stops[j + 1].t) {
          left = stops[j];
          right = stops[j + 1];
          break;
        }
      }

      const p = (t - left.t) / Math.max(0.0001, right.t - left.t);

      palette[i] = left.rgba.map((value, idx) =>
        Math.round(value + ((right.rgba[idx] - value) * p))
      );
    }

    return palette;
  }

  const DARK_PALETTE = buildPalette(DARK_STOPS);
  const LIGHT_PALETTE = buildPalette(LIGHT_STOPS);

  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function palette() {
    return isDark() ? DARK_PALETTE : LIGHT_PALETTE;
  }

  /*
    A point's weight: 1 unless it carries a finite `weight` (a shot's xG, a
    pass's xT). Negative weights count as nothing, the way a pass that gives
    threat away adds no heat.
  */
  function weightOf(point) {
    const weight = Number(point?.weight);
    if (point?.weight === undefined || point?.weight === null || !Number.isFinite(weight)) return 1;
    return Math.max(0, weight);
  }

  /**
   * Colours the given points as an ImageData of `width` x `height`, or null
   * when nothing lands on it.
   *
   * `project(x, y)` maps a point's 0–100 pitch coordinates (already clamped)
   * onto the image's pixels as [cx, cy], which is what lets the vertical
   * Perfil pitch and the horizontal event-map pitch share one density model.
   * `shortSide` is the pitch's short side in the image's pixels; the kernel
   * radius is a share of it.
   */
  function buildImage(points, options) {
    const field = density(points, options);

    return field ? colorize(field, field.reference) : null;
  }

  /**
   * The density buildImage() colours, and the reference it scales it by, or
   * null when nothing lands on the image. Split from the colouring so maps
   * drawn side by side (the league page's) can share one reference: each
   * map's density, then all coloured against the largest reference.
   */
  function density(points, { width, height, shortSide, project }) {
    const radius = Math.max(9, Math.round(shortSide * RADIUS_SHARE));
    const size = radius * 2 + 1;
    const kernel = new Float32Array(size * size);

    for (let ky = 0; ky < size; ky++) {
      for (let kx = 0; kx < size; kx++) {
        const d2 = (((kx - radius) ** 2) + ((ky - radius) ** 2)) / (radius * radius);
        kernel[ky * size + kx] = d2 < 1 ? (1 - d2) * (1 - d2) : 0;
      }
    }

    const grid = new Float32Array(width * height);
    let peak = 0;

    (Array.isArray(points) ? points : []).forEach(point => {
      const weight = weightOf(point);
      if (!weight) return;

      const xVal = Math.max(0, Math.min(100, Number(point.x)));
      const yVal = Math.max(0, Math.min(100, Number(point.y)));
      if (!Number.isFinite(xVal) || !Number.isFinite(yVal)) return;

      const [px, py] = project(xVal, yVal);
      const cx = Math.round(px);
      const cy = Math.round(py);

      const x0 = Math.max(0, cx - radius);
      const x1 = Math.min(width - 1, cx + radius);
      const y0 = Math.max(0, cy - radius);
      const y1 = Math.min(height - 1, cy + radius);

      for (let y = y0; y <= y1; y++) {
        const row = y * width;
        const kernelRow = (y - cy + radius) * size - cx + radius;

        for (let x = x0; x <= x1; x++) {
          const value = (grid[row + x] += kernel[kernelRow + x] * weight);
          if (value > peak) peak = value;
        }
      }
    });

    if (!peak) return null;

    // The reference density: the level a top-percentile covered cell sits at.
    const BINS = 512;
    const histogram = new Uint32Array(BINS);
    const floor = peak * COVERAGE_FLOOR;
    let covered = 0;

    for (let i = 0; i < grid.length; i++) {
      if (grid[i] >= floor) {
        histogram[Math.min(BINS - 1, Math.floor((grid[i] / peak) * (BINS - 1)))]++;
        covered++;
      }
    }

    const hotCells = covered * (1 - REFERENCE_PERCENTILE);
    let seen = 0;
    let bin = BINS - 1;

    for (; bin > 0; bin--) {
      seen += histogram[bin];
      if (seen >= hotCells) break;
    }

    const reference = Math.max(peak * (bin / (BINS - 1)), peak * 0.05);

    return { values: grid, width, height, peak, reference };
  }

  /** A density() field as an ImageData, cells at or over `reference` at full heat. */
  function colorize({ values, width, height }, reference) {
    const colours = palette();
    const image = new ImageData(width, height);
    const out = image.data;

    for (let i = 0; i < values.length; i++) {
      if (!values[i]) continue;

      const [r, g, b, a] = colours[Math.round(Math.min(1, values[i] / reference) * (PALETTE_STEPS - 1))];
      const o = i * 4;

      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = a;
    }

    return image;
  }

  /** Every `stride`-th point once there are more than `maxPoints`. */
  function sample(points, maxPoints) {
    const source = Array.isArray(points) ? points : [];

    if (source.length <= maxPoints) {
      return source;
    }

    const stride = Math.ceil(source.length / maxPoints);
    const sampled = [];

    for (let i = 0; i < source.length; i += stride) {
      sampled.push(source[i]);
    }

    return sampled;
  }

  /*
    The active palette as a left-to-right CSS gradient, for a legend swatch.
    Sampled through the palette (not the raw stops) so the swatch carries the
    same gamma the map does.
  */
  function cssGradient(samples = 12) {
    const colours = palette();
    const parts = [];

    for (let i = 0; i < samples; i++) {
      const share = i / (samples - 1);
      const [r, g, b, a] = colours[Math.round(share * (PALETTE_STEPS - 1))];
      parts.push(`rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)}) ${(share * 100).toFixed(1)}%`);
    }

    return `linear-gradient(90deg, ${parts.join(', ')})`;
  }

  window.StatiskicksHeatmap = {
    buildImage,
    density,
    colorize,
    sample,
    cssGradient,
    isDark,
    weightOf,
  };
})();
