/*
  The match page's player card (SK-17): one player's heat map for one match,
  drawn exactly as the event map's "Mapa de calor" view draws it — its pitch
  (StatiskicksEventMap.paint.pitch) and the site's density heatmap
  (StatiskicksHeatmap, the Perfil tab's), composited the same way. Unlike
  the map, a sub's handful of touches still gets the density, not dots: the
  card is one player's match, and FotMob's draws it however few there are.

  New touches come in animated: the pitch at once, then the heat spreading
  out from where he was most of the match and fading up. A redraw of the same touches — a resize, a theme flip — is
  not animated, nor is any with reduced motion asked for.

  Points come as [x, y] on 0–100: x along his attack (left to right), y from
  the top of the pitch, the event map's own convention.
*/
(function () {
  const DURATION = 900;
  const LONE_TOUCH_FLOOR = 1.8;
  const DOT_STAGGER = 45;

  const easeOut = t => 1 - Math.pow(1 - t, 3);

  function reducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  }

  /*
    Everything one drawing needs, worked out once: the canvas at its size,
    the pitch metrics, and the heat layer (or the dots) to lay over it.
  */
  function prepare(canvas, points) {
    const paint = window.StatiskicksEventMap?.paint;
    const heat = window.StatiskicksHeatmap;
    if (!canvas || !Array.isArray(points) || !paint || !heat) return null;

    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    const metrics = paint.pitch(ctx, width, height);
    const touches = points.map(([x, y]) => ({ x: Number(x), y: Number(y) }));
    const scene = { canvas, ctx, paint, heat, metrics, width, height, touches, layer: null };

    if (touches.length === 0) return scene;

    // Built at CSS-pixel size and scaled up, as the event map's heat layer is.
    const scale = 1 / dpr;
    const layerWidth = Math.max(1, Math.round(width * scale));
    const layerHeight = Math.max(1, Math.round(height * scale));
    const field = heat.density(touches, {
      width: layerWidth,
      height: layerHeight,
      shortSide: Math.min(metrics.pw, metrics.ph) * scale,
      project: (x, y) => [metrics.px(x) * scale, metrics.py(y) * scale],
    });
    /*
      A lone touch peaks at 1. The density scales its heat to its own hottest
      cells, so with a handful of touches each one alone would read at full
      heat; a floor of LONE_TOUCH_FLOOR keeps one touch mid-ramp and only
      touches piled up red. A full match's reference sits far above it.
    */
    const image = field ? heat.colorize(field, Math.max(field.reference, LONE_TOUCH_FLOOR)) : null;

    if (image) {
      scene.layer = document.createElement('canvas');
      scene.layer.width = layerWidth;
      scene.layer.height = layerHeight;
      scene.layer.getContext('2d').putImageData(image, 0, 0);
    }

    return scene;
  }

  // One frame at `progress` (0 → 1); 1 is the finished map.
  function frame(scene, progress) {
    const { ctx, paint, metrics, width, height, touches, layer } = scene;
    paint.pitch(ctx, width, height);

    if (!layer) {
      const count = progress >= 1 ? touches.length : Math.floor(progress * (touches.length + 1));
      touches.slice(0, count).forEach(point => paint.dot(ctx, metrics, point.x, point.y, 5.5, metrics.ink.series, 0.85));

      return;
    }

    const eased = easeOut(progress);
    const dark = scene.heat.isDark();
    // The heat spreads from his touches' centre, far enough to reach every corner.
    const cx = metrics.px(touches.reduce((sum, p) => sum + p.x, 0) / touches.length);
    const cy = metrics.py(touches.reduce((sum, p) => sum + p.y, 0) / touches.length);
    const reach = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy));

    ctx.save();
    ctx.beginPath();
    ctx.rect(metrics.px(0), metrics.py(0), metrics.pw, metrics.ph);
    ctx.clip();
    if (progress < 1) {
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, reach * eased), 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.globalCompositeOperation = dark ? 'screen' : 'multiply';
    ctx.globalAlpha = (dark ? 0.95 : 1) * (0.25 + 0.75 * eased);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(layer, 0, 0, width, height);
    ctx.restore();
  }

  function draw(canvas, points, animate = false) {
    if (canvas?._skHeatFrame) cancelAnimationFrame(canvas._skHeatFrame);

    const scene = prepare(canvas, points);
    if (!scene) return;

    const duration = scene.layer ? DURATION : Math.min(DURATION, DOT_STAGGER * (scene.touches.length + 1));
    if (!animate || reducedMotion() || duration <= 0) {
      frame(scene, 1);

      return;
    }

    const start = performance.now();
    const tick = now => {
      const progress = Math.min(1, (now - start) / duration);
      frame(scene, progress);
      canvas._skHeatFrame = progress < 1 ? requestAnimationFrame(tick) : null;
    };
    canvas._skHeatFrame = requestAnimationFrame(tick);
  }

  /*
    The last map drawn, redrawn when it can be: when the canvas first gets a
    size (the card is still laying out when the touches come back) or changes
    it, and when the theme flips (as the event map does). Only new touches
    animate; a canvas that had no size yet keeps its animation for the first
    drawing it can make.
  */
  let last = null;
  const sized = typeof ResizeObserver === 'function'
    ? new ResizeObserver(entries => entries.forEach(entry => {
      if (last?.canvas !== entry.target) return;
      const animate = last.pending === true;
      last.pending = false;
      draw(last.canvas, last.points, animate);
    }))
    : null;

  function remember(canvas, points) {
    if (last?.canvas !== canvas) {
      if (last?.canvas) sized?.unobserve(last.canvas);
      sized?.observe(canvas);
    }
    const fresh = last?.canvas !== canvas || last?.points !== points;
    const rect = canvas?.getBoundingClientRect();
    const ready = rect && rect.width >= 1 && rect.height >= 1;
    last = { canvas, points, pending: fresh && !ready };
    draw(canvas, points, fresh);
  }

  new MutationObserver(() => {
    if (last?.canvas?.isConnected) draw(last.canvas, last.points);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  window.StatiskicksPlayerHeat = { draw: remember };
})();
