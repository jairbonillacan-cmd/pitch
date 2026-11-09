(function () {
  'use strict';

  if (window.SkChartDownload) return;

  /*
    Every chart's download (SK-18). The corner icon opens one small menu -
    the size (the chart as it is, or a preset for a social network) and the
    format - and the file is built in four steps:

      source   what the chart is drawn as (a canvas, an SVG, layers of both,
               or a page's own composer), painted at the scale asked for
      frame    the preset's exact pixels, the chart fitted and centred in
               them, its title and context above it and the navbar's logo
               under it - always, so every image says what it is and whose
      encode   PNG or JPG
      save     a blob URL, clicked and revoked
  */

  // What each preset is for (not shown, the label and pixels say enough):
  // Cuadrado and Vertical the Instagram and Facebook feeds, Historia stories
  // and reels, Horizontal X and YouTube, Enlace LinkedIn and link previews.
  const SIZES = [
    { key: 'original', label: 'Tamaño original' },
    { key: 'square', slug: 'cuadrado', label: 'Cuadrado', width: 1080, height: 1080 },
    { key: 'portrait', slug: 'vertical', label: 'Vertical', width: 1080, height: 1350 },
    // Stories put the platform's own bars over the top and bottom: the
    // title and the chart stay inside the central 1080 x 1420.
    { key: 'story', slug: 'historia', label: 'Historia', width: 1080, height: 1920, safe: 1420 },
    { key: 'landscape', slug: 'horizontal', label: 'Horizontal', width: 1600, height: 900 },
    { key: 'link', slug: 'enlace', label: 'Enlace', width: 1200, height: 630 },
  ];

  const FORMATS = {
    png: { label: 'PNG', type: 'image/png', ext: 'png' },
    jpg: { label: 'JPG', type: 'image/jpeg', ext: 'jpg', quality: 0.92 },
  };

  /*
    A button can ask for two more things (the advanced search's results):
    data-sk-export-csv="{Livewire method}" adds CSV to the formats - the
    server builds that file, every result in it - and data-sk-export-rows
    ("5,10,15,20") a choice of how many rows the image shows, named by
    data-sk-export-noun ("Jugadores"). Every other chart's menu is as it was.
  */
  const CSV = { key: 'csv', label: 'CSV' };
  const CSV_NOTE = 'El CSV trae todos los resultados de la búsqueda.';
  const DEFAULT_ROWS = 10;

  /*
    SK-18.2 / SK-18.3: a player's or a team's chart can carry their card
    above its title when the menu's "Incluir datos del jugador / del equipo"
    is ticked: a player's photo, name, position pill, club, league, season
    and age; a team's crest, name, place in the table (its pill), league and
    season. Several (a comparison) are drawn in a row.

    The cards are the JSON of the nearest data-sk-player-card, from the
    button outwards, else the page's: one card or a list of them, each
    {name, kind, club, league, season, age, position, photo, color}. An empty
    attribute offers no card. Off unless ticked; the choice is remembered
    like the size.
  */
  const CARD_PHOTO_TIMEOUT_MS = 4000;
  // The site's placeholder face (ui-avatars.com, background=1D665D).
  const CARD_FACE = '#1D665D';

  const BRAND = 'Statiskicks';
  const STORE_KEY = 'sk.chartExport.v1';
  const DEFAULTS = { size: 'original', format: 'png', rows: DEFAULT_ROWS, card: false };
  const MAX_SCALE = 4;
  /*
    Fase 6: in a preset, a chart's text is a share of the image's short side
    (Dario, 29 Oct: 2.8 %, about 30 px in 1080), whatever the chart's shape;
    BASE_TEXT is the page's chart text it scales from.
  */
  const TEXT_SHARE = 0.028;
  const BASE_TEXT = 12;
  // How long the button says "Descargada" before the menu closes.
  const DONE_MS = 450;

  /*
    The brand in the frame: the navbar's mark (logos/logo_white.png, white on
    transparent). Found beside this script, so every page that loads the
    download has it, whatever its layout.
  */
  const LOGO_URL = (() => {
    const src = document.currentScript && document.currentScript.src;
    try {
      return src ? new URL('../logos/logo_white.png', src.split('?')[0]).href : null;
    } catch (_error) {
      return null;
    }
  })();
  const ERROR_TEXT = 'No se pudo generar la imagen. Inténtalo de nuevo.';
  const EMPTY_TEXT = 'Esta gráfica no tiene nada que descargar todavía.';

  /*
    Pages whose picture is not one element register a source by name
    (league-maps.js, momentum-chart.js); a button carrying
    data-sk-chart-source="{name}" uses it. A plain map, so a script loaded
    before this one can register too.
  */
  const sources = window.SkChartDownloadSources = window.SkChartDownloadSources || {};

  function cssColor(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  /*
    A colour a canvas can paint with. A page may hand over its theme's token
    as `var(--compare-1)` (Comparar's players), which a canvas does not read:
    it ignores the assignment and keeps the colour before, so a card's ring
    came out in whatever was painted last. Resolved here to the theme's value.
  */
  function paintColor(value) {
    const token = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/.exec(String(value || '').trim());
    return token ? cssColor(token[1], (token[2] || '').trim()) : String(value || '').trim();
  }

  function slugify(text) {
    return String(text || 'grafico')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-+|-+$)/g, '') || 'grafico';
  }

  function screenScale() {
    return Math.max(2, window.devicePixelRatio || 1);
  }

  function createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  /*
    Chart.js (and the raw event-map canvas) paint on a transparent backing
    buffer - the card's background only shows through on screen. An opaque
    fill under every export keeps the image readable outside the app, where
    there is no card behind it, and is what lets JPG work at all.
  */
  function fillSurface(ctx, canvas, colour) {
    ctx.fillStyle = colour || cssColor('--chart-surface', '#ffffff');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /*
    SVG presentation attributes here are set from JS via CSS custom properties
    (var(--accent), currentColor, ...), which resolve fine on screen but are
    meaningless once the markup is serialized on its own - the canvas 2D
    context painting the export never had the stylesheet cascade to resolve
    them against. Copying each node's *computed* value onto its clone bakes
    the resolved colour in before serialization. `display` comes along so a
    group a class hides on screen (the momentum's other view) stays hidden.
  */
  function inlineComputedStyle(sourceEl, targetEl) {
    const PROPERTIES = [
      'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
      'stroke-opacity', 'fill-opacity', 'color', 'opacity', 'display', 'visibility',
      'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline',
    ];

    const apply = (source, target) => {
      const computed = getComputedStyle(source);
      const style = PROPERTIES
        .map(prop => {
          const value = computed.getPropertyValue(prop);
          return value ? `${prop}:${value}` : '';
        })
        .filter(Boolean)
        .join(';');

      if (style) target.setAttribute('style', style);
    };

    apply(sourceEl, targetEl);

    const sourceNodes = sourceEl.querySelectorAll('*');
    const targetNodes = targetEl.querySelectorAll('*');
    sourceNodes.forEach((node, index) => {
      if (targetNodes[index]) apply(node, targetNodes[index]);
    });
  }

  function svgToImage(svg, width, height) {
    return new Promise((resolve, reject) => {
      const clone = svg.cloneNode(true);
      inlineComputedStyle(svg, clone);
      clone.setAttribute('width', width);
      clone.setAttribute('height', height);
      if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      const svgUrl = URL.createObjectURL(new Blob(
        [new XMLSerializer().serializeToString(clone)],
        { type: 'image/svg+xml;charset=utf-8' }
      ));

      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(svgUrl); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(svgUrl); reject(new Error('svg rasterization failed')); };
      image.src = svgUrl;
    });
  }

  /*
    An SVG into the box (x, y, w, h) of the export, in pixels. With a viewBox
    it is rasterized at the box's own size, so it stays sharp at any scale;
    without one, a bigger width would only add empty space, so it is
    rasterized at its CSS size and stretched.
  */
  async function drawSvg(ctx, svg, cssWidth, cssHeight, x, y, w, h) {
    const viewBox = svg.viewBox && svg.viewBox.baseVal;
    const scalable = viewBox && viewBox.width && viewBox.height;
    const image = scalable
      ? await svgToImage(svg, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))
      : await svgToImage(svg, Math.max(1, Math.round(cssWidth)), Math.max(1, Math.round(cssHeight)));
    ctx.drawImage(image, x, y, w, h);
  }

  function isVisible(el) {
    if (el.hidden) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  }

  function isDrawableLayer(el) {
    return el.tagName === 'CANVAS' || el.tagName.toLowerCase() === 'svg';
  }

  /*
    A source: what the chart is, at CSS size (width, height), the scale its
    "Tamaño original" file has always had (nativeScale), and render(scale),
    which paints it on an opaque canvas at that scale.
  */

  function copyCanvas(canvas, factor) {
    const output = createCanvas(canvas.width * factor, canvas.height * factor);
    const ctx = output.getContext('2d');
    fillSurface(ctx, output);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, output.width, output.height);
    return output;
  }

  /*
    A Chart.js chart redrawn at `scale` rather than stretched: the buffer
    grows, the CSS size does not, so nothing moves on the page, and the
    chart goes back to the screen's own ratio straight after. update('none')
    paints at once, with no animation to wait for.
  */
  function chartAt(chart, scale) {
    const previous = chart.options.devicePixelRatio;
    chart.stop();
    try {
      chart.options.devicePixelRatio = scale;
      chart.resize();
      chart.update('none');
      return copyCanvas(chart.canvas, 1);
    } finally {
      chart.options.devicePixelRatio = previous;
      chart.resize();
      chart.update('none');
    }
  }

  /*
    A Chart.js chart laid out again in a preset's shape (Fase 6): its own
    configuration on a canvas of that size off the page, painted once at
    `scale`, then dropped, so the chart on the page never moves. No
    animation, so it paints at once.
  */
  function chartInto(chart, box, scale) {
    const holder = document.createElement('div');
    holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${box.width}px;height:${box.height}px;pointer-events:none;`;
    const canvas = document.createElement('canvas');
    holder.appendChild(canvas);
    document.body.appendChild(holder);
    let copy = null;

    try {
      const config = chart.config._config || chart.config;
      copy = new window.Chart(canvas.getContext('2d'), {
        type: config.type,
        data: config.data,
        options: { ...(config.options || {}), responsive: true, maintainAspectRatio: false, animation: false, devicePixelRatio: scale },
        plugins: config.plugins || [],
      });
      copy.resize();
      copy.update('none');
      return copyCanvas(canvas, 1);
    } finally {
      copy?.destroy();
      holder.remove();
    }
  }

  function canvasSource(canvas) {
    const rect = canvas.getBoundingClientRect();
    if (!canvas.width || !canvas.height || !rect.width || !rect.height) return null;
    const own = canvas.width / rect.width;
    const chart = window.Chart && typeof window.Chart.getChart === 'function' ? window.Chart.getChart(canvas) : null;

    const source = {
      width: rect.width,
      height: rect.height,
      nativeScale: own,
      async render(scale) {
        if (chart && scale > own * 1.01) {
          try {
            return chartAt(chart, scale);
          } catch (_error) {
            // A chart that will not resize still exports, stretched.
          }
        }
        return copyCanvas(canvas, scale / own);
      },
    };

    // A pitch that can be painted on its side (the event map, Fase 6) turns for a tall preset.
    if (typeof canvas.skTurned === 'function') {
      source.renderTurned = async scale => {
        const turned = canvas.skTurned();
        return turned ? copyCanvas(turned, scale / own) : source.render(scale);
      };
    }

    // A Chart.js chart takes the preset's shape; a hand-drawn canvas keeps its own.
    if (chart) {
      // Rows of bars (percentile-rows.js) need the height each has on the
      // page, or a label lands on the bar above; other charts can give up
      // some of theirs before their text crowds.
      const rows = (chart.config._config?.plugins || []).some(plugin => String(plugin?.id || '').startsWith('statiskicksPercentileRows'));
      source.minHeight = rows ? rect.height : rect.height * 0.6;
      // Labels placed around points (the age profile) crowd on a narrow layout.
      source.minWidth = rect.width * 0.6;
      source.renderInto = async (box, scale) => {
        try {
          return chartInto(chart, box, scale);
        } catch (_error) {
          return source.render(scale);
        }
      };
    }

    return source;
  }

  function svgSource(svg) {
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox && svg.viewBox.baseVal;
    const width = Math.round(rect.width || (viewBox && viewBox.width) || 0);
    const height = Math.round(rect.height || (viewBox && viewBox.height) || 0);
    if (!width || !height) return null;

    return {
      width,
      height,
      nativeScale: screenScale(),
      async render(scale) {
        const output = createCanvas(width * scale, height * scale);
        const ctx = output.getContext('2d');
        fillSurface(ctx, output);
        await drawSvg(ctx, svg, width, height, 0, 0, output.width, output.height);
        return output;
      },
    };
  }

  /*
    The heatmap (and anything else layering a pitch SVG under a blended canvas
    under a legend SVG) has no single element that holds the whole picture.
    This redraws every visible canvas/svg child, in DOM order and each where
    it sits in the container, replaying each layer's CSS mix-blend-mode and
    opacity (Canvas 2D's globalCompositeOperation accepts the same blend-mode
    names) so the result matches what the browser composites on screen.
  */
  function layeredSource(container, layers) {
    // The box less its top padding: the 10px kept clear under the download
    // button (sk.css) are the page's, not the chart's.
    const box = container.getBoundingClientRect();
    const inset = parseFloat(getComputedStyle(container).paddingTop) || 0;
    const rect = { left: box.left, top: box.top + inset, width: box.width, height: box.height - inset };
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (!width || !height) return null;

    return {
      width,
      height,
      nativeScale: screenScale(),
      async render(scale) {
        const output = createCanvas(width * scale, height * scale);
        const ctx = output.getContext('2d');
        fillSurface(ctx, output);

        for (const layer of layers) {
          if (!isVisible(layer)) continue;

          const box = layer.getBoundingClientRect();
          const x = (box.left - rect.left) * scale;
          const y = (box.top - rect.top) * scale;
          const w = box.width * scale;
          const h = box.height * scale;
          if (!w || !h) continue;

          const layerStyle = getComputedStyle(layer);
          const blend = layerStyle.mixBlendMode;
          const opacity = Number(layerStyle.opacity);

          ctx.save();
          ctx.globalCompositeOperation = blend && blend !== 'normal' ? blend : 'source-over';
          ctx.globalAlpha = Number.isFinite(opacity) ? opacity : 1;

          try {
            if (layer.tagName === 'CANVAS') {
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(layer, x, y, w, h);
            } else {
              await drawSvg(ctx, layer, box.width, box.height, x, y, w, h);
            }
          } catch (_error) {
            // Skip a layer that failed to rasterize rather than losing the rest.
          }

          ctx.restore();
        }

        return output;
      },
    };
  }

  function isTransparent(colour) {
    return !colour || colour === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(colour);
  }

  /*
    A box's horizontal linear-gradient background as a canvas gradient: the
    graded rank bars' fills (.sk-rank-bars--graded), drawn across their whole
    track (background-size) from the box's left, or from its right at 270deg.
    Null for any other background, which paintHtml() then leaves out.
  */
  function htmlGradient(ctx, style, box, origin, scale) {
    const image = style.backgroundImage || '';
    if (!image.startsWith('linear-gradient(')) return null;

    const reversed = /^linear-gradient\(\s*270deg/.test(image);
    const span = (parseFloat(style.backgroundSize) || box.width) * scale;
    const left = (box.left - origin.left) * scale;
    const gradient = reversed
      ? ctx.createLinearGradient(left + box.width * scale, 0, left + box.width * scale - span, 0)
      : ctx.createLinearGradient(left, 0, left + span, 0);
    const stops = [...image.matchAll(/(rgba?\([^)]*\))\s+(-?[\d.]+)%/g)];
    if (stops.length === 0) return null;

    stops.forEach(([, colour, at]) => gradient.addColorStop(Math.min(1, Math.max(0, Number(at) / 100)), colour));

    return gradient;
  }

  /*
    An image, contained in its box as object-fit: contain draws it - only one
    loaded with CORS (crossorigin="anonymous": the team crests), since any
    other from another host would taint the canvas and lose the download.
  */
  /* A box's corner radius in pixels: "50%" (a round face, a pitch's circle) is half its short side. */
  function radiusOf(style, box) {
    const radius = String(style.borderTopLeftRadius || '0');
    return radius.endsWith('%')
      ? (Math.min(box.width, box.height) * parseFloat(radius)) / 100
      : parseFloat(radius) || 0;
  }

  /*
    The initials avatar (ui-avatars.com, the site's placeholder face) drawn
    from its own address: that host refuses a canvas its pixels, so the
    download paints what it shows — the initials on its colour, round.
  */
  function paintAvatar(ctx, img, box, origin, scale) {
    let url;
    try {
      url = new URL(img.currentSrc || img.src);
    } catch (_error) {
      return false;
    }
    if (url.host !== 'ui-avatars.com') return false;

    const name = url.searchParams.get('name') || '';
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0].toUpperCase()).join('') || '?';
    const x = (box.left - origin.left) * scale;
    const y = (box.top - origin.top) * scale;
    const size = Math.min(box.width, box.height) * scale;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + (box.width * scale) / 2, y + (box.height * scale) / 2, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = `#${url.searchParams.get('background') || '1D665D'}`;
    ctx.fill();
    ctx.fillStyle = `#${url.searchParams.get('color') || 'fff'}`;
    ctx.font = `700 ${size * 0.4}px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, x + (box.width * scale) / 2, y + (box.height * scale) / 2 + size * 0.02);
    ctx.restore();
    return true;
  }

  function paintHtmlImage(ctx, img, box, origin, scale) {
    if (paintAvatar(ctx, img, box, origin, scale)) return;
    if (img.crossOrigin !== 'anonymous' || !img.complete || !img.naturalWidth || !box.width || !box.height) return;

    // As the page fits it (object-fit: cover fills, the rest fits inside), clipped to its corners.
    const style = getComputedStyle(img);
    const fit = style.objectFit === 'cover' ? Math.max : Math.min;
    const ratio = fit(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const width = img.naturalWidth * ratio;
    const height = img.naturalHeight * ratio;
    const left = box.left - origin.left;
    const top = box.top - origin.top;
    const x = left + (box.width - width) / 2;
    const y = top + (box.height - height) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(left * scale, top * scale, box.width * scale, box.height * scale, radiusOf(style, box) * scale);
    ctx.clip();
    try {
      ctx.drawImage(img, x * scale, y * scale, width * scale, height * scale);
    } catch (_error) {
      // An image the browser will not hand over is left out, not the export.
    }
    ctx.restore();
  }

  /*
    A box's borders, as the page draws them: one stroke round it when its
    four sides match (a pitch, its circle, a card), else each side drawn on
    its own (a halfway line is a box's left border alone).
  */
  function paintBorders(ctx, style, box, origin, scale) {
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map(side => ({
      side,
      width: parseFloat(style[`border${side}Width`]) || 0,
      color: style[`border${side}Color`],
      line: style[`border${side}Style`],
    })).filter(side => side.width > 0 && side.line !== 'none' && side.line !== 'hidden' && !isTransparent(side.color));
    if (!sides.length) return;

    const x = (box.left - origin.left) * scale;
    const y = (box.top - origin.top) * scale;
    const w = box.width * scale;
    const h = box.height * scale;
    ctx.save();

    if (sides.length === 4 && sides.every(side => side.width === sides[0].width && side.color === sides[0].color)) {
      const line = sides[0].width * scale;
      ctx.strokeStyle = sides[0].color;
      ctx.lineWidth = line;
      if (sides[0].line === 'dashed') ctx.setLineDash([line * 3, line * 2]);
      if (sides[0].line === 'dotted') ctx.setLineDash([line, line]);
      ctx.beginPath();
      ctx.roundRect(x + line / 2, y + line / 2, w - line, h - line, Math.max(0, radiusOf(style, box) * scale - line / 2));
      ctx.stroke();
    } else {
      sides.forEach(({ side, width, color }) => {
        const line = width * scale;
        ctx.fillStyle = color;
        if (side === 'Top') ctx.fillRect(x, y, w, line);
        if (side === 'Right') ctx.fillRect(x + w - line, y, line, h);
        if (side === 'Bottom') ctx.fillRect(x, y + h - line, w, line);
        if (side === 'Left') ctx.fillRect(x, y, line, h);
      });
    }

    ctx.restore();
  }

  /*
    Plain HTML where it sits on screen - each box with a background (a legend
    swatch) and each run of text, in its own font and colour - for the parts
    of a chart that are not SVG or canvas: a legend under a radar, the minute
    ticks under the momentum. `origin` is the export's top-left in client
    coordinates, `scale` its pixels per CSS pixel.
  */
  /*
    The box that cuts a run of text on screen: the nearest element, from the
    text's own up to the chart's root, whose overflow is not visible - its
    padding box, where the browser clips - and whether it ends the run in
    "…" (text-overflow: ellipsis) at its content edge. Null when nothing
    cuts it. Without this a long name in a fixed-width column (Comparar's
    grid header) was painted whole, over the next column.
  */
  function textClip(element, root) {
    for (let node = element; node; node = node === root ? null : node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
      const box = node.getBoundingClientRect();
      const left = box.left + node.clientLeft;
      const top = box.top + node.clientTop;
      return {
        left,
        top,
        right: left + node.clientWidth,
        bottom: top + node.clientHeight,
        contentRight: left + node.clientWidth - (parseFloat(style.paddingRight) || 0),
        ellipsis: style.textOverflow === 'ellipsis',
      };
    }
    return null;
  }

  function paintHtml(ctx, el, origin, scale) {
    const walk = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        const start = text.search(/\S/);
        if (start < 0) return;
        const end = text.length - (text.length - text.trimEnd().length);
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        const box = range.getClientRects()[0];
        if (!box) return;
        const style = getComputedStyle(node.parentElement);
        const clip = textClip(node.parentElement, el);
        ctx.save();
        ctx.font = `${style.fontWeight} ${parseFloat(style.fontSize) * scale}px ${style.fontFamily}`;
        ctx.fillStyle = style.color;
        ctx.globalAlpha = Number(style.opacity) || 1;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        let shown = text.slice(start, end);
        if (clip) {
          // Cut where the screen cuts, "…" included.
          ctx.beginPath();
          ctx.rect((clip.left - origin.left) * scale, (clip.top - origin.top) * scale, (clip.right - clip.left) * scale, (clip.bottom - clip.top) * scale);
          ctx.clip();
          if (clip.ellipsis) shown = ellipsize(ctx, shown, Math.max(0, (clip.contentRight - box.left) * scale));
        }
        ctx.fillText(shown, (box.left - origin.left) * scale, (box.top - origin.top + box.height / 2) * scale);
        ctx.restore();
        return;
      }

      // Nor what is there for screen readers only (a header's "Barra").
      if (node.nodeType !== Node.ELEMENT_NODE || !isVisible(node) || node.matches('.sk-chart-download-btn, .visually-hidden, .sr-only')) return;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      const fill = isTransparent(style.backgroundColor) ? htmlGradient(ctx, style, box, origin, scale) : style.backgroundColor;
      if (fill && box.width && box.height) {
        ctx.save();
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.roundRect((box.left - origin.left) * scale, (box.top - origin.top) * scale, box.width * scale, box.height * scale, radiusOf(style, box) * scale);
        ctx.fill();
        ctx.restore();
      }
      if (box.width && box.height) paintBorders(ctx, style, box, origin, scale);
      if (node.tagName === 'IMG') {
        paintHtmlImage(ctx, node, box, origin, scale);
        return;
      }
      node.childNodes.forEach(walk);
    };

    walk(el);
  }

  /*
    A chart that is plain HTML - neither canvas nor SVG - painted as it sits
    on screen (paintHtml()): the player page's comparison bars and grid
    (data-sk-chart-source="html"). The button's parent is the chart, less
    the top padding kept clear under the button, as the layered source.
    Images are left out unless loaded with CORS (paintHtmlImage()): a photo
    from another host would taint the canvas.
  */
  function htmlSource(container) {
    if (!container) return null;

    const box = container.getBoundingClientRect();
    const inset = parseFloat(getComputedStyle(container).paddingTop) || 0;
    const origin = { left: box.left, top: box.top + inset };
    const width = Math.round(box.width);
    const height = Math.round(box.height - inset);
    if (!width || height <= 0) return null;

    return {
      width,
      height,
      nativeScale: screenScale(),
      async render(scale) {
        const output = createCanvas(width * scale, height * scale);
        const ctx = output.getContext('2d');
        fillSurface(ctx, output);
        paintHtml(ctx, container, origin, scale);

        return output;
      },
    };
  }

  /*
    What a button exports: the element its data-sk-chart-target names, found
    from the button outwards (the nearest ancestor holding one, so a card's
    own chart wins over a namesake elsewhere on the page), when the button
    sits in its card's corner or among controls rather than over the chart;
    else the element it sits in.
  */
  function chartRoot(button) {
    const selector = button.dataset.skChartTarget;
    if (selector) {
      for (let node = button.parentElement; node; node = node.parentElement) {
        const found = node.querySelector(selector);
        if (found) return found;
      }
      return null;
    }
    return button.parentElement;
  }

  /*
    Text that shrinks to its box rather than be cut: a cell marked
    data-sk-fit (its value the smallest size, in px; 7 if empty) and, inside
    it, the run marked data-sk-fit-text. The run's type drops half a pixel
    at a time until the cell no longer overflows; past the floor, the cell's
    own ellipsis cuts (textClip()). It starts from the stylesheet's size
    each time, so calling it again is safe. The page runs it on screen
    (Comparar's grid header, Dario 6-nov) and htmlInto() again on its copy,
    whose columns a narrower preset may have changed.
  */
  function fitText(cell) {
    const run = cell.querySelector('[data-sk-fit-text]');
    if (!run) return;
    run.style.fontSize = '';
    if (!cell.clientWidth) return;
    const floor = parseFloat(cell.dataset.skFit) || 7;
    let size = parseFloat(getComputedStyle(run).fontSize);
    while (cell.scrollWidth > cell.clientWidth && size > floor) {
      size = Math.max(floor, size - 0.5);
      run.style.fontSize = `${size}px`;
    }
  }

  /* What would wake on a copy: Alpine, Livewire, the site's tooltips. */
  function stripLive(el) {
    Array.from(el.attributes).forEach(attr => {
      if (/^(x-|wire:|@|:)/.test(attr.name) || attr.name.startsWith('data-sk-tip')) el.removeAttribute(attr.name);
    });
  }

  /*
    An HTML chart laid out again at a width (Fase 6): a copy beside it, off
    the page, so the rules of its ancestors still reach it and its container
    queries see the new width; nothing on it wakes (x-ignore, the live
    attributes stripped) and nothing animates ([data-sk-export-clone],
    sk.css). Measured once its images are in, painted, removed.
  */
  async function htmlInto(container, box, scale) {
    const clone = container.cloneNode(true);
    clone.querySelectorAll('*').forEach(stripLive);
    stripLive(clone);
    /*
      Its images asked for again with CORS, at once (a lazy one off the page
      never loads), so the canvas may read them; the page's own stay as they
      are. One a host refuses is left out (a placeholder face is drawn).
    */
    clone.querySelectorAll('img').forEach(img => {
      const src = img.currentSrc || img.src;
      img.loading = 'eager';
      img.removeAttribute('srcset');
      if (src && !src.startsWith('data:') && new URL(src, location.href).origin !== location.origin) img.crossOrigin = 'anonymous';
      img.src = src;
    });
    clone.setAttribute('x-ignore', '');
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('data-sk-export-clone', '');
    clone.style.position = 'absolute';
    clone.style.left = '-100000px';
    clone.style.top = '0';
    clone.style.width = `${box.width}px`;
    clone.style.maxWidth = 'none';
    container.parentNode.insertBefore(clone, container.nextSibling);

    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      // Fitted again at the copy's own widths.
      clone.querySelectorAll('[data-sk-fit]').forEach(fitText);
      const settle = img => Promise.race([img.decode().catch(() => null), new Promise(resolve => setTimeout(resolve, 3000))]);
      await Promise.all(Array.from(clone.querySelectorAll('img')).map(settle));
      const source = htmlSource(clone);
      if (!source) throw new Error('nothing laid out');
      return await source.render(scale);
    } finally {
      clone.remove();
    }
  }

  sources.html = button => {
    const container = chartRoot(button);
    const source = container ? htmlSource(container) : null;
    if (source) {
      // A chart that crowds when narrower says so (the Best XI's pitch, its names).
      source.minWidth = Number(container.dataset.skExportMinWidth) || 0;
      // At its own size too, from a quiet copy: its images then load with CORS.
      const direct = source.render;
      source.render = async scale => {
        try {
          return await htmlInto(container, { width: source.width }, scale);
        } catch (_error) {
          return direct(scale);
        }
      };
      source.renderInto = async (box, scale) => {
        try {
          return await htmlInto(container, box, scale);
        } catch (_error) {
          return direct(scale);
        }
      };
    }
    return source;
  };

  /*
    An SVG with an HTML legend under it (data-sk-chart-legend: the match
    radar): both, in the box they share on screen, so the colours keep
    their names.
  */
  function svgLegendSource(svg, legend) {
    const svgBox = svg.getBoundingClientRect();
    const legendBox = legend.getBoundingClientRect();
    if (!svgBox.width || !svgBox.height) return null;

    const pad = 8;
    const left = Math.min(svgBox.left, legendBox.left) - pad;
    const top = svgBox.top - pad;
    const width = Math.round(Math.max(svgBox.right, legendBox.right) + pad - left);
    const height = Math.round(Math.max(svgBox.bottom, legendBox.bottom) + pad - top);
    const origin = { left, top };

    return {
      width,
      height,
      nativeScale: screenScale(),
      async render(scale) {
        const output = createCanvas(width * scale, height * scale);
        const ctx = output.getContext('2d');
        fillSurface(ctx, output);
        await drawSvg(ctx, svg, svgBox.width, svgBox.height, (svgBox.left - left) * scale, (svgBox.top - top) * scale, svgBox.width * scale, svgBox.height * scale);
        paintHtml(ctx, legend, origin, scale);
        return output;
      },
    };
  }

  /*
    The chart is whatever sits beside the button, read at click time - which
    is what makes the export reflect the filters active right now.
  */
  function genericSource(button) {
    const container = chartRoot(button);
    if (!container) return null;

    // What a page marks as passing (a map's crossfade) is never drawn.
    const layers = Array.from(container.children).filter(el => isDrawableLayer(el) && !el.matches('[data-sk-export-skip]'));
    if (layers.length > 1) return layeredSource(container, layers);

    const canvas = container.querySelector('canvas:not([data-sk-export-skip])');
    if (canvas && canvas.width && canvas.height) return canvasSource(canvas);

    const svg = Array.from(container.querySelectorAll('svg')).find(el => !el.closest('.sk-chart-download-btn'));
    if (!svg) return null;

    const legend = container.querySelector('[data-sk-chart-legend]');
    return legend && isVisible(legend) ? svgLegendSource(svg, legend) : svgSource(svg);
  }

  /* `choice` reaches a page's own source: how many rows it draws. */
  function resolveSource(button, choice = {}) {
    const name = button.dataset.skChartSource;
    const factory = name && typeof sources[name] === 'function' ? sources[name] : null;
    try {
      const source = factory ? factory(button, choice) : genericSource(button);
      return source && source.width > 0 && source.height > 0 ? source : null;
    } catch (_error) {
      return null;
    }
  }

  /*
    The heading of the card holding the chart, without the <small> note some
    headings carry: the chart's own card when the button sits in another
    (the event map's, in its filters' card), else the button's.
  */
  function cardTitle(button) {
    const root = button.dataset.skChartTarget ? chartRoot(button) : null;
    const card = root?.closest('.sk-card, .match-card') || button.closest('.sk-card, .match-card');
    const heading = card && card.querySelector('.sk-card-title, .match-card__title');
    if (!heading) return '';
    return Array.from(heading.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE || (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'SMALL'))
      .map(node => node.textContent)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Who or what the page is about: the button's own, else the page's (data-sk-chart-context). */
  function pageContext(button) {
    const holder = button.closest('[data-sk-chart-context]') || document.querySelector('[data-sk-chart-context]');
    return holder ? holder.dataset.skChartContext.replace(/\s+/g, ' ').trim() : '';
  }

  /*
    One card as the page wrote it, cleaned; null without a name. A player's
    (the default) or a team's (`kind: "team"`: its crest, whole, where a
    player's photo is cropped round). `position` is the pill: a player's
    position, a team's place in the table. `color` rings the face
    (Comparar's series).
  */
  function normaliseCard(card) {
    const name = card && typeof card.name === 'string' ? card.name.replace(/\s+/g, ' ').trim() : '';
    if (!name) return null;
    const age = Number(card.age);
    const text = value => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
    return {
      name,
      kind: card.kind === 'team' ? 'team' : 'player',
      club: text(card.club),
      league: text(card.league),
      season: text(card.season),
      age: card.age !== null && card.age !== '' && Number.isFinite(age) && age > 0 ? Math.round(age) : null,
      position: text(card.position),
      photo: typeof card.photo === 'string' ? card.photo : '',
      color: paintColor(text(card.color)),
    };
  }

  /* What the card says beside its pill, in order: club, league, season, age (what each has). */
  function cardFacts(card) {
    return [card.club, card.league, card.season, card.age !== null ? `${card.age} años` : ''].filter(Boolean);
  }

  /*
    The players a chart belongs to (SK-18.2, see CARD_PHOTO_TIMEOUT_MS): the
    button's own cards or its nearest holder's, else the page's. One card
    (an object) or several (a list: Comparar's radar and grid, one a
    compared player). Null where there are none, where the attribute is
    empty or unreadable.
  */
  function playerCards(button) {
    const holder = button.closest('[data-sk-player-card]') || document.querySelector('[data-sk-player-card]');
    const raw = holder ? holder.getAttribute('data-sk-player-card') : '';
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      const cards = (Array.isArray(parsed) ? parsed : [parsed]).map(normaliseCard).filter(Boolean);
      return cards.length ? cards : null;
    } catch (_error) {
      return null;
    }
  }

  /*
    A source that paints its own heading (Mapas) gets only the brand from the
    frame - and the players' cards when they are asked for (choice.card).
  */
  function chartMeta(button, source, choice = {}) {
    const titled = Boolean(source.titled);
    return {
      name: slugify(source.name || button.dataset.skChartDownload),
      title: titled ? '' : (button.dataset.skChartTitle || source.title || cardTitle(button)),
      context: titled ? '' : (source.context || pageContext(button)),
      cards: choice.card ? playerCards(button) : null,
      legend: chartLegend(button, choice),
    };
  }

  /*
    Who is who on a chart that tells its players apart by colour alone
    (data-sk-export-legend: Comparar's radar), when their cards are left
    out: each one's colour and name, centred under the chart as the page
    shows them (beta-final-changes fase 6). With the cards in, their rings
    are the key and there is no legend.
  */
  function chartLegend(button, choice = {}) {
    if (choice.card || !button.hasAttribute('data-sk-export-legend')) return null;
    const items = (playerCards(button) || []).filter(card => card.color).map(card => ({ name: card.name, color: card.color }));
    return items.length > 1 ? items : null;
  }

  function frameFont() {
    return getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  }

  let measurer = null;

  /* The legend's sizes, on the frame's context line. */
  function legendType(t) {
    const size = t.context;
    return { size, dot: size * 0.85, gap: size * 0.45, between: size * 1.6, line: size * 1.7 };
  }

  /* The legend's items in rows that fit `maxWidth`, each with its width. */
  function legendRows(items, maxWidth, t) {
    const type = legendType(t);
    measurer = measurer || createCanvas(1, 1).getContext('2d');
    measurer.font = `600 ${type.size}px ${frameFont()}`;
    const rows = [];
    let row = { items: [], width: 0 };

    items.forEach(item => {
      const width = Math.min(maxWidth, type.dot + type.gap + measurer.measureText(item.name).width);
      const next = row.items.length ? row.width + type.between + width : width;
      if (row.items.length && next > maxWidth) {
        rows.push(row);
        row = { items: [{ ...item, width }], width };
      } else {
        row.items.push({ ...item, width });
        row.width = next;
      }
    });
    if (row.items.length) rows.push(row);
    return rows;
  }

  /* The room the legend takes under the chart: a gap and its rows. */
  function legendHeight(meta, t, maxWidth) {
    return meta.legend ? t.pad * 0.5 + legendRows(meta.legend, maxWidth, t).length * legendType(t).line : 0;
  }

  function paintLegend(ctx, items, plan, t, font) {
    const type = legendType(t);
    const maxWidth = plan.width - t.pad * 2;
    let y = plan.chart.y + plan.chart.h + t.pad * 0.5;

    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `600 ${type.size}px ${font}`;
    legendRows(items, maxWidth, t).forEach(row => {
      let x = (plan.width - row.width) / 2;
      const middle = y + type.line / 2;
      row.items.forEach(item => {
        // The player's colour, ringed so the palest shade still reads on the surface.
        ctx.beginPath();
        ctx.arc(x + type.dot / 2, middle, type.dot / 2, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.fill();
        ctx.lineWidth = Math.max(1, type.size * 0.08);
        ctx.strokeStyle = cssColor('--border', '#C9D1CB');
        ctx.stroke();
        // The name in the text's ink, not the series colour (readable on any of them).
        ctx.fillStyle = cssColor('--text', '#101511');
        ctx.fillText(ellipsize(ctx, item.name, item.width - type.dot - type.gap), x + type.dot + type.gap, middle);
        x += item.width + type.between;
      });
      y += type.line;
    });
    ctx.restore();
  }

  /* The frame's sizes: the page's at "Tamaño original", a share of the preset's short side otherwise. `logo` is the mark's height. */
  function frameType(size, source) {
    if (size.key === 'original') {
      const s = source.nativeScale;
      return { pad: 20 * s, title: 18 * s, context: 13 * s, logo: 18 * s };
    }
    // Fase 6: the frame's words follow the chart's text, one scale for the image.
    const m = Math.min(size.width, size.height);
    const text = m * TEXT_SHARE;
    return { pad: m * 0.06, title: text * 1.6, context: text * 0.95, logo: text * 1.5, text };
  }

  /*
    The cards' sizes. One card: a face 2.6 titles across, his name and one
    line beside it (pill · club · league · age). Several, side by side in
    the width one has: a smaller face and the facts on two lines (pill ·
    club, then league · age), so each fits a third of the image.
  */
  function cardType(t, count) {
    const compact = count > 1;
    const face = t.title * (compact ? 2.0 : 2.6);
    const name = t.title * (compact ? 0.8 : 0.95);
    const line = t.context;
    const pill = line * 1.6;
    const text = name * 1.3 + pill + (compact ? line * 1.45 : 0);
    return { compact, face, name, line, pill, height: Math.max(face, text) };
  }

  function cardsHeight(t, cards) {
    return cards && cards.length ? cardType(t, cards.length).height : 0;
  }

  /* The room between the cards and the chart's title (Dario, 5 Nov): the cards are who, the title what. */
  function cardGap(t) {
    return t.pad * 0.8;
  }

  function headerHeight(meta, t) {
    let height = 0;
    if (meta.cards) height += cardsHeight(t, meta.cards) + (meta.title || meta.context ? cardGap(t) : 0);
    if (meta.title) height += t.title * 1.25;
    if (meta.context) height += (meta.title ? t.context * 0.35 : 0) + t.context * 1.3;
    return height ? height + t.pad * 0.5 : 0;
  }

  function footerHeight(t) {
    return t.pad * 0.45 + t.logo;
  }

  /*
    Where everything goes. "Tamaño original" keeps the chart at its own size
    and adds the bands around it. A preset is its exact pixels, the chart
    fitted inside what the bands leave, centred, never stretched or cropped,
    and painted at the scale that fitting needs. (Unframed, which only the
    API asks for, is the chart's own file untouched.)
  */
  function layout(source, size, framed, meta) {
    const t = frameType(size, source);
    const head = framed ? headerHeight(meta, t) : 0;
    // The brand, and under the chart its players' legend when it has one (fase 6).
    const footFor = width => (framed ? footerHeight(t) + legendHeight(meta, t, width) : 0);

    if (size.key === 'original') {
      const s = source.nativeScale;
      const w = source.width * s;
      const h = source.height * s;
      if (!framed) return { bare: true, width: w, height: h, scale: s };

      const height = t.pad * 2 + head + h + footFor(w);
      return { width: w + t.pad * 2, height, top: 0, region: height, type: t, scale: s, chart: { x: t.pad, y: t.pad + head, w, h } };
    }

    const region = size.safe || size.height;
    const top = (size.height - region) / 2;
    const pad = framed ? t.pad : t.pad * 0.5;
    const availW = size.width - pad * 2;
    const availH = region - pad * 2 - head - footFor(availW);
    const fit = { x: pad, y: top + pad + head, w: availW, h: availH };

    /*
      Fase 6: a source that can be laid out again (Chart.js, the HTML
      grids, the hand-drawn tables) is given the room the frame leaves, in
      page pixels at the image's text scale, and fills it; what it paints
      is then fitted to that room (buildImage()).
    */
    if (typeof source.renderInto === 'function') {
      const f = Math.min(MAX_SCALE, t.text / BASE_TEXT);
      // Laid out taller or wider than the room, it is shrunk by `fitted` to
      // fit: laid out that much larger the other way too, it still fills it.
      const least = { width: Math.max(availW / f, source.minWidth || 0), height: Math.max(availH / f, source.minHeight || 0) };
      const fitted = Math.min(1, availW / (least.width * f), availH / (least.height * f));
      return {
        width: size.width,
        height: size.height,
        top,
        region,
        type: t,
        scale: f,
        reflow: true,
        // Never shorter than the source can be laid out: what is taller
        // than the room is then shrunk to fit it, whole.
        box: { width: Math.max(least.width, availW / (f * fitted)), height: Math.max(least.height, availH / (f * fitted)) },
        fit,
        chart: { ...fit },
      };
    }

    /*
      A wide pitch in a tall preset (Vertical, Historia) is painted on its
      side, its attack upwards, when its source can (Dario, 29 Oct): it
      then fits as tall as it is wide.
    */
    const turned = size.height > size.width && source.width > source.height && typeof source.renderTurned === 'function';
    const shape = turned ? { width: source.height, height: source.width } : source;
    const k = Math.max(0.05, Math.min(availW / shape.width, availH / shape.height));
    const w = shape.width * k;
    const h = shape.height * k;

    return {
      width: size.width,
      height: size.height,
      top,
      region,
      type: t,
      scale: Math.min(MAX_SCALE, k),
      turned,
      chart: { x: (size.width - w) / 2, y: top + pad + head + (availH - h) / 2, w, h },
    };
  }

  function ellipsize(ctx, text, maxWidth) {
    let shown = text;
    while (shown.length > 1 && ctx.measureText(shown).width > maxWidth) shown = `${shown.slice(0, -2)}…`;
    return shown;
  }

  /* The mark's own box inside the file: the PNG pads it with transparent rows. */
  function trimLogo(image) {
    const canvas = createCanvas(image.naturalWidth, image.naturalHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let top = height;
    let left = width;
    let right = -1;
    let bottom = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }

    return right < 0 ? null : { image, sx: left, sy: top, sw: right - left + 1, sh: bottom - top + 1 };
  }

  let logoRequest = null;
  function loadLogo() {
    if (!LOGO_URL) return Promise.resolve(null);
    if (!logoRequest) {
      logoRequest = new Promise(resolve => {
        const image = new Image();
        image.onload = () => {
          try {
            resolve(trimLogo(image));
          } catch (_error) {
            resolve(null);
          }
        };
        // Not there: the wordmark stands in, and the next export asks again.
        image.onerror = () => {
          logoRequest = null;
          resolve(null);
        };
        image.src = LOGO_URL;
      });
    }
    return logoRequest;
  }

  /*
    The mark at `height`, in `colour`: the file is white, so it is tinted the
    way the navbar's filter recolours it on screen - the theme's text colour,
    dark on the light theme and light on the dark one.
  */
  function tintLogo(logo, colour, height) {
    const canvas = createCanvas((height * logo.sw) / logo.sh, height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(logo.image, logo.sx, logo.sy, logo.sw, logo.sh, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  }

  /*
    The card's photo as an image the canvas may read, or null: none, the
    placeholder face (its host refuses a canvas its pixels; the initials are
    drawn instead), refused, missing or too slow. Another host's is asked
    for with CORS, as the HTML charts' copies are; the mirror's is the page's
    own origin.
  */
  const cardPhotos = new Map();
  function loadCardPhoto(url) {
    let parsed;
    try {
      parsed = url ? new URL(url, location.href) : null;
    } catch (_error) {
      parsed = null;
    }
    if (!parsed || parsed.host === 'ui-avatars.com') return Promise.resolve(null);

    const key = parsed.href;
    if (!cardPhotos.has(key)) {
      cardPhotos.set(key, new Promise(resolve => {
        const image = new Image();
        const timer = setTimeout(() => resolve(null), CARD_PHOTO_TIMEOUT_MS);
        if (parsed.origin !== location.origin) image.crossOrigin = 'anonymous';
        image.onload = () => { clearTimeout(timer); resolve(image); };
        image.onerror = () => {
          clearTimeout(timer);
          // Asked again next time: the host may answer then.
          cardPhotos.delete(key);
          resolve(null);
        };
        image.src = key;
      }));
    }
    return cardPhotos.get(key);
  }

  /* The page's position pill (.badge-position) lends the card's its colours, in either theme. */
  function pillStyle() {
    const pill = document.querySelector('[data-sk-player-card] .badge-position, .badge-position');
    const style = pill ? getComputedStyle(pill) : null;
    return {
      ink: (style && style.color) || cssColor('--accent-ink', '#1D665D'),
      border: style && !isTransparent(style.borderTopColor) ? style.borderTopColor : cssColor('--border-light', '#D9DED9'),
      fill: style && !isTransparent(style.backgroundColor) ? style.backgroundColor : null,
    };
  }

  /* The position as the page shows it: its acronym in a round-ended pill. Returns its width. */
  function paintPill(ctx, text, x, y, size, font) {
    const style = pillStyle();
    const height = size * 1.6;
    ctx.save();
    ctx.font = `700 ${size * 0.92}px ${font}`;
    const width = ctx.measureText(text).width + size * 1.2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, height / 2);
    if (style.fill) {
      ctx.fillStyle = style.fill;
      ctx.fill();
    }
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.strokeStyle = style.border;
    ctx.stroke();
    ctx.fillStyle = style.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + width / 2, y + height / 2 + size * 0.03);
    ctx.restore();
    return width;
  }

  /*
    One player's card at (x, y), `width` wide, laid out by `type`
    (cardType()): his face in a circle (his photo, else his initials on the
    placeholder's colour), ringed in his series' colour when he has one;
    then his name and, under it, the position pill, his club, his league and
    his age.
  */
  async function paintCard(ctx, card, x, y, width, t, type, font) {
    const size = type.face;
    const photo = await loadCardPhoto(card.photo);
    const cx = x + size / 2;
    const cy = y + type.height / 2;

    const crest = card.kind === 'team';
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = photo || crest ? cssColor('--bg-secondary', '#EEF1EE') : CARD_FACE;
    ctx.fill();
    if (photo && crest) {
      // A crest is not a face: whole, inside the circle, as the page shows it.
      const k = Math.min((size * 0.66) / photo.naturalWidth, (size * 0.66) / photo.naturalHeight);
      ctx.imageSmoothingQuality = 'high';
      try {
        ctx.drawImage(photo, cx - (photo.naturalWidth * k) / 2, cy - (photo.naturalHeight * k) / 2, photo.naturalWidth * k, photo.naturalHeight * k);
      } catch (_error) {
        // A crest the browser will not hand over is left out, not the export.
      }
    } else if (photo) {
      ctx.clip();
      // Cover the circle, as the page's round avatar does.
      const k = Math.max(size / photo.naturalWidth, size / photo.naturalHeight);
      ctx.imageSmoothingQuality = 'high';
      try {
        ctx.drawImage(photo, cx - (photo.naturalWidth * k) / 2, cy - (photo.naturalHeight * k) / 2, photo.naturalWidth * k, photo.naturalHeight * k);
      } catch (_error) {
        // A photo the browser will not hand over is left out, not the export.
      }
    } else {
      const initials = card.name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0].toUpperCase()).join('') || '?';
      ctx.fillStyle = crest ? cssColor('--text', '#101511') : '#ffffff';
      ctx.font = `700 ${size * 0.38}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials, cx, cy + size * 0.02);
    }
    ctx.restore();

    // The ring: his colour in the chart, thick enough to read as its key; else the page's border.
    const ring = card.color ? Math.max(2, size * 0.07) : Math.max(1, size * 0.02);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2 - ring / 2, 0, Math.PI * 2);
    ctx.lineWidth = ring;
    ctx.strokeStyle = card.color || cssColor('--border', '#C9D1CB');
    ctx.stroke();
    ctx.restore();

    const left = x + size + t.pad * (type.compact ? 0.3 : 0.45);
    const room = Math.max(0, x + width - left);
    const facts = cardFacts(card);
    const textHeight = type.name * 1.3 + type.pill + (type.compact ? type.line * 1.45 : 0);
    const top = y + (type.height - textHeight) / 2;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `800 ${type.name}px ${font}`;
    ctx.fillStyle = cssColor('--text', '#101511');
    ctx.fillText(ellipsize(ctx, card.name, room), left, top);

    const lineTop = top + type.name * 1.3;
    let cursor = left;
    if (card.position) cursor += paintPill(ctx, card.position, cursor, lineTop, type.line, font) + type.line * 0.6;

    // One card: every fact on the pill's line. Several: the first there, the rest under it.
    const beside = (type.compact ? facts.slice(0, 1) : facts).join(' · ');
    const under = type.compact ? facts.slice(1).join(' · ') : '';
    ctx.font = `600 ${type.line}px ${font}`;
    ctx.fillStyle = cssColor('--text-secondary', '#414B44');
    if (beside) {
      ctx.textBaseline = 'middle';
      ctx.fillText(ellipsize(ctx, beside, Math.max(0, left + room - cursor)), cursor, lineTop + type.pill / 2);
    }
    if (under) {
      ctx.textBaseline = 'top';
      ctx.fillText(ellipsize(ctx, under, room), left, lineTop + type.pill + type.line * 0.25);
    }
    ctx.restore();
  }

  /* Every card, side by side in the frame's width, from the left (one card takes it all). */
  async function paintCards(ctx, cards, x, y, maxWidth, t, font) {
    const type = cardType(t, cards.length);
    const gap = t.pad * 0.6;
    const width = (maxWidth - gap * (cards.length - 1)) / cards.length;
    for (let i = 0; i < cards.length; i++) {
      await paintCard(ctx, cards[i], x + i * (width + gap), y, width, t, type, font);
    }
  }

  async function paintFrame(ctx, plan, meta) {
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (_error) { /* the fallback font will do */ }
    }
    const logo = await loadLogo();

    const t = plan.type;
    const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
    const maxWidth = plan.width - t.pad * 2;
    let y = plan.top + t.pad;

    if (meta.cards) {
      await paintCards(ctx, meta.cards, t.pad, y, maxWidth, t, font);
      y += cardsHeight(t, meta.cards) + (meta.title || meta.context ? cardGap(t) : 0);
    }

    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    if (meta.title) {
      ctx.font = `800 ${t.title}px ${font}`;
      ctx.fillStyle = cssColor('--text', '#101511');
      ctx.fillText(ellipsize(ctx, meta.title, maxWidth), t.pad, y);
      y += t.title * 1.25 + t.context * 0.35;
    }

    if (meta.context) {
      ctx.font = `600 ${t.context}px ${font}`;
      ctx.fillStyle = cssColor('--text-secondary', '#414B44');
      ctx.fillText(ellipsize(ctx, meta.context, maxWidth), t.pad, y);
    }

    if (meta.legend && plan.chart) paintLegend(ctx, meta.legend, plan, t, font);

    const ink = cssColor('--text', '#101511');
    const logoTop = plan.top + plan.region - t.pad - t.logo;
    if (logo) {
      ctx.drawImage(tintLogo(logo, ink, t.logo), t.pad, logoTop);
    } else {
      ctx.font = `800 ${t.logo * 0.7}px ${font}`;
      ctx.fillStyle = ink;
      ctx.fillText(BRAND, t.pad, logoTop + t.logo * 0.15);
    }
    ctx.restore();
  }

  /*
    What a laid-out source painted, in the room it was given: never larger
    than that room (shrunk to fit, as a grid taller than the room), never
    blown past its own pixels, centred.
  */
  function placeIn(rendered, fit) {
    const k = Math.min(1, fit.w / rendered.width, fit.h / rendered.height);
    const w = rendered.width * k;
    const h = rendered.height * k;
    return { x: fit.x + (fit.w - w) / 2, y: fit.y + (fit.h - h) / 2, w, h };
  }

  async function buildImage(source, size, framed, meta) {
    const plan = layout(source, size, framed, meta);
    const rendered = plan.reflow
      ? await source.renderInto(plan.box, plan.scale)
      : (plan.turned ? await source.renderTurned(plan.scale) : await source.render(plan.scale));
    if (plan.bare) return rendered;
    if (plan.reflow) plan.chart = placeIn(rendered, plan.fit);

    // A source with a background of its own (Mapas: the page's) lends it to
    // the frame, so the chart does not sit in a box of another colour.
    const output = createCanvas(plan.width, plan.height);
    const ctx = output.getContext('2d');
    fillSurface(ctx, output, source.surface);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(rendered, plan.chart.x, plan.chart.y, plan.chart.w, plan.chart.h);
    if (framed) await paintFrame(ctx, plan, meta);
    return output;
  }

  function encode(canvas, format) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('empty image'))), format.type, format.quality);
      } catch (error) {
        // A canvas tainted by a cross-origin image refuses to be read.
        reject(error);
      }
    });
  }

  function save(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function sizeFor(key) {
    return SIZES.find(size => size.key === key) || SIZES[0];
  }

  function fileName(meta, size, format) {
    return size.key === 'original' ? `${meta.name}.${format.ext}` : `${meta.name}-${size.slug}.${format.ext}`;
  }

  /* The whole export for one button: resolved now, so it is the chart as it is now. */
  async function exportChart(button, choice = {}) {
    const source = resolveSource(button, choice);
    if (!source) throw new Error('nothing to export');

    const size = sizeFor(choice.size);
    const format = FORMATS[choice.format] || FORMATS.png;
    const framed = choice.frame !== false;
    const meta = chartMeta(button, source, choice);
    const canvas = await buildImage(source, size, framed, meta);
    const blob = await encode(canvas, format);
    save(blob, fileName(meta, size, format));
  }

  /*
    The CSV a button asks the server for (data-sk-export-csv): its Livewire
    component's method, whose download Livewire saves as it always has.
  */
  async function exportCsv(button) {
    const method = button.dataset.skExportCsv;
    const host = button.closest('[wire\\:id]');
    const component = method && host && window.Livewire ? window.Livewire.find(host.getAttribute('wire:id')) : null;
    if (!component) throw new Error('no csv');
    await component.call(method);
  }

  /* Where the chart lands for a choice, without drawing it: what the browser tests measure. */
  function planFor(button, choice = {}) {
    const source = resolveSource(button, choice);
    if (!source) return null;

    const size = sizeFor(choice.size);
    const framed = choice.frame !== false;
    const meta = chartMeta(button, source, choice);
    return { source: { width: source.width, height: source.height }, meta, ...layout(source, size, framed, meta) };
  }

  /* ── The menu ─────────────────────────────────────────────────────── */

  function readPrefs() {
    const prefs = { ...DEFAULTS };
    try {
      const stored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (stored && typeof stored === 'object') {
        if (SIZES.some(size => size.key === stored.size)) prefs.size = stored.size;
        // CSV only where a button offers it (forTrigger()).
        if (FORMATS[stored.format] || stored.format === CSV.key) prefs.format = stored.format;
        if (Number.isInteger(stored.rows) && stored.rows > 0) prefs.rows = stored.rows;
        if (typeof stored.card === 'boolean') prefs.card = stored.card;
      }
    } catch (_error) {
      // Blocked or broken storage: the defaults.
    }
    return prefs;
  }

  function storePrefs(prefs) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ size: prefs.size, format: prefs.format, rows: prefs.rows, card: prefs.card }));
    } catch (_error) {
      // Private mode: the choice lasts the page.
    }
  }

  /* What a button offers beyond size and format (see CSV above, and the player's card). */
  function triggerOptions(trigger) {
    return {
      cards: playerCards(trigger),
      csv: Boolean(trigger.dataset.skExportCsv),
      rows: (trigger.dataset.skExportRows || '').split(',').map(Number).filter(count => Number.isInteger(count) && count > 0),
      noun: trigger.dataset.skExportNoun || 'Filas',
      heading: trigger.dataset.skExportHeading || 'Descargar gráfica',
    };
  }

  /* The remembered choice, fitted to what this button offers. */
  function forTrigger(prefs, options) {
    const fitted = { ...prefs };
    if (fitted.format === CSV.key && !options.csv) fitted.format = DEFAULTS.format;
    if (options.rows.length && !options.rows.includes(fitted.rows)) {
      fitted.rows = options.rows.includes(DEFAULT_ROWS) ? DEFAULT_ROWS : options.rows[0];
    }
    return fitted;
  }

  function pixels(width, height) {
    return `${Math.round(width)} × ${Math.round(height)}`;
  }

  function reducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  let menu = null;
  let state = null;
  let observer = null;
  let closing = null;

  function buildMenu() {
    const el = document.createElement('div');
    el.className = 'sk-export-menu';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-labelledby', 'sk-export-menu-title');
    el.setAttribute('data-sk-export-menu', '');

    // --i staggers the rows in as the menu opens (sk.css).
    const sizes = SIZES.map((size, index) => `
      <label class="sk-export-menu__size" style="--i: ${index}">
        <input type="radio" name="sk-export-size" value="${size.key}" data-sk-export-size>
        <span class="sk-export-menu__size-name">${size.label}</span>
        <span class="sk-export-menu__size-px" data-sk-export-px="${size.key}">${size.width ? pixels(size.width, size.height) : ''}</span>
      </label>`).join('');

    // CSV is the last pill, shown only where the button offers it.
    const formats = [...Object.entries(FORMATS), [CSV.key, CSV]].map(([key, format]) => `
      <label class="sk-export-menu__format"${key === CSV.key ? ' data-sk-export-csv-option hidden' : ''}>
        <input type="radio" name="sk-export-format" value="${key}" data-sk-export-format>
        <span>${format.label}</span>
      </label>`).join('');

    el.innerHTML = `
      <div class="sk-export-menu__head">
        <p class="sk-export-menu__title" id="sk-export-menu-title" data-sk-export-heading>Descargar gráfica</p>
        <button type="button" class="sk-export-menu__close" data-sk-export-close aria-label="Cerrar">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 3.5l9 9m0-9-9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </button>
      </div>
      <fieldset class="sk-export-menu__group" data-sk-export-sizes>
        <legend class="sk-export-menu__label">Tamaño</legend>
        ${sizes}
      </fieldset>
      <fieldset class="sk-export-menu__group" data-sk-export-rows-group hidden>
        <legend class="sk-export-menu__label" data-sk-export-rows-label>Filas</legend>
        <div class="sk-export-menu__formats sk-export-menu__rows" data-sk-export-rows style="--i: 6"></div>
      </fieldset>
      <fieldset class="sk-export-menu__group" data-sk-export-card-group hidden>
        <legend class="sk-export-menu__label" data-sk-export-card-legend>Jugador</legend>
        <label class="sk-export-menu__check" style="--i: 6">
          <input type="checkbox" data-sk-export-card>
          <span data-sk-export-card-label>Incluir datos del jugador</span>
        </label>
        <p class="sk-export-menu__note" data-sk-export-card-note></p>
      </fieldset>
      <fieldset class="sk-export-menu__group">
        <legend class="sk-export-menu__label">Formato</legend>
        <div class="sk-export-menu__formats" data-sk-export-formats>${formats}</div>
        <p class="sk-export-menu__note" data-sk-export-note hidden>${CSV_NOTE}</p>
      </fieldset>
      <button type="button" class="sk-export-menu__submit" data-sk-export-submit>
        <span class="sk-export-menu__submit-icon" aria-hidden="true"></span>
        <span data-sk-export-label>Descargar</span>
      </button>
      <p class="sk-export-menu__status" data-sk-export-status role="alert" hidden></p>`;

    el.addEventListener('change', onMenuChange);
    el.addEventListener('click', onMenuClick);
    el.addEventListener('keydown', onMenuKeydown);
    document.body.appendChild(el);
    return el;
  }

  function showStatus(text) {
    const status = menu.querySelector('[data-sk-export-status]');
    status.textContent = text || '';
    status.hidden = !text;
  }

  /* The button's three moments: ready, building (a spinner), done (a tick, then the menu closes). */
  function setSubmit(phase) {
    const submit = menu.querySelector('[data-sk-export-submit]');
    const label = submit.querySelector('[data-sk-export-label]');
    if (phase) submit.dataset.phase = phase;
    else delete submit.dataset.phase;
    label.textContent = phase === 'busy' ? 'Generando…' : phase === 'done' ? 'Descargada' : 'Descargar';
    return submit;
  }

  /* A segmented control's sliding pill: how many it holds and which is on (sk.css). */
  function slidePill(group, values, value) {
    group.style.setProperty('--sk-segments', String(Math.max(1, values.length)));
    group.style.setProperty('--sk-segment', String(Math.max(0, values.indexOf(value))));
    group.dataset.format = value;
  }

  /* The row counts this button offers, as pills: 5 | 10 | 15 | 20. */
  function renderRows(options) {
    const group = menu.querySelector('[data-sk-export-rows-group]');
    group.hidden = options.rows.length === 0;
    menu.querySelector('[data-sk-export-rows-label]').textContent = options.noun;
    menu.querySelector('[data-sk-export-rows]').innerHTML = options.rows.map(count => `
      <label class="sk-export-menu__format">
        <input type="radio" name="sk-export-rows" value="${count}" data-sk-export-row-count>
        <span>${count}</span>
      </label>`).join('');
  }

  /* The controls as the choice stands, and the original size of this chart as it is now. */
  function syncMenu() {
    const { prefs, trigger, options } = state;
    const csv = prefs.format === CSV.key;
    const formats = [...Object.keys(FORMATS), ...(options.csv ? [CSV.key] : [])];

    menu.querySelector('[data-sk-export-heading]').textContent = options.heading;
    menu.querySelectorAll('[data-sk-export-size]').forEach(input => { input.checked = input.value === prefs.size; });
    menu.querySelectorAll('[data-sk-export-format]').forEach(input => { input.checked = input.value === prefs.format; });
    menu.querySelectorAll('[data-sk-export-row-count]').forEach(input => { input.checked = Number(input.value) === prefs.rows; });
    menu.querySelector('[data-sk-export-csv-option]').hidden = !options.csv;

    // The players' cards: offered only where the chart has them, and named, so it is clear whose.
    const cards = options.cards || [];
    const one = cards.length === 1 ? cards[0] : null;
    const cardGroup = menu.querySelector('[data-sk-export-card-group]');
    cardGroup.hidden = cards.length === 0;
    cardGroup.disabled = csv;
    menu.querySelector('[data-sk-export-card]').checked = Boolean(prefs.card);
    const teams = cards.length > 0 && cards.every(card => card.kind === 'team');
    const many = cards.length > 1;
    menu.querySelector('[data-sk-export-card-legend]').textContent = teams ? (many ? 'Equipos' : 'Equipo') : (many ? 'Jugadores' : 'Jugador');
    menu.querySelector('[data-sk-export-card-label]').textContent = teams
      ? (many ? 'Incluir datos de los equipos' : 'Incluir datos del equipo')
      : (many ? 'Incluir datos de los jugadores' : 'Incluir datos del jugador');
    menu.querySelector('[data-sk-export-card-note]').textContent = one
      ? [one.name, one.position, ...cardFacts(one)].filter(Boolean).join(' · ')
      : cards.map(card => card.name).join(' · ');
    // The sliding pills under PNG | JPG (| CSV) and the row counts follow these.
    slidePill(menu.querySelector('[data-sk-export-formats]'), formats, prefs.format);
    slidePill(menu.querySelector('[data-sk-export-rows]'), options.rows.map(String), String(prefs.rows));

    // The CSV is every result, at no size: what only the image reads is set aside.
    menu.querySelector('[data-sk-export-sizes]').disabled = csv;
    menu.querySelector('[data-sk-export-rows-group]').disabled = csv;
    menu.querySelector('[data-sk-export-note]').hidden = !csv;

    const source = resolveSource(trigger, { rows: prefs.rows });
    const original = menu.querySelector('[data-sk-export-px="original"]');
    const submit = menu.querySelector('[data-sk-export-submit]');

    if (!source) {
      original.textContent = '';
      submit.disabled = !csv || Boolean(state.busy);
      showStatus(csv ? '' : EMPTY_TEXT);
      return;
    }

    const plan = layout(source, SIZES[0], true, chartMeta(trigger, source, { card: prefs.card }));
    original.textContent = pixels(plan.width, plan.height);
    submit.disabled = Boolean(state.busy);
    showStatus('');
  }

  function positionMenu() {
    if (!state || !menu || menu.hidden) return;

    const gutter = 16;
    const anchor = state.trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    // The layout box, not the animated one: a transform mid-animation would skew it.
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;

    const left = viewportWidth < 576
      ? gutter
      : Math.min(Math.max(gutter, anchor.right - width), viewportWidth - gutter - width);
    let top = anchor.bottom + 6;
    const above = top + height > viewportHeight - 8 && anchor.top - 6 - height >= 8;
    if (above) top = anchor.top - 6 - height;

    // It grows out of the icon: from its top right below it, its bottom right above it.
    menu.dataset.placement = above ? 'above' : 'below';
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(Math.max(8, top))}px`;
  }

  let positionFrame = null;
  function schedulePosition() {
    if (positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = null;
      positionMenu();
    });
  }

  function onOutsidePointer(event) {
    if (!state) return;
    if (menu.contains(event.target) || state.trigger.contains(event.target)) return;
    closeMenu(false);
  }

  /* A close still fading out is cut short: the menu is taken straight back. */
  function finishClosing() {
    if (!closing) return;
    clearTimeout(closing.timer);
    menu.removeEventListener('animationend', closing.done);
    closing = null;
  }

  function openMenu(trigger) {
    if (!menu || !menu.isConnected) menu = buildMenu();

    if (state && state.trigger === trigger) {
      closeMenu(true);
      return;
    }
    if (state) closeMenu(false);
    finishClosing();

    const options = triggerOptions(trigger);
    state = { trigger, options, prefs: forTrigger(readPrefs(), options), busy: false };
    trigger.setAttribute('aria-expanded', 'true');
    setSubmit(null);
    renderRows(options);
    syncMenu();
    menu.hidden = false;
    positionMenu();
    // Restarted each time, so a menu moving from one icon to the next opens again.
    delete menu.dataset.state;
    void menu.offsetWidth;
    menu.dataset.state = 'open';

    document.addEventListener('pointerdown', onOutsidePointer, true);
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, true);
    // The icon can leave the page under the menu (a filter rebuilt the card,
    // a live poll redrew the tab): the menu goes with it.
    observer = new MutationObserver(() => {
      if (state && !state.trigger.isConnected) closeMenu(false);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // The first choice that can be made: the size, or the format when the CSV set the size aside.
    const first = tabStops().find(el => el.matches('input'));
    if (first) first.focus();
  }

  function closeMenu(refocus) {
    if (!state) return;
    const { trigger } = state;
    state = null;

    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutsidePointer, true);
    window.removeEventListener('resize', schedulePosition);
    window.removeEventListener('scroll', schedulePosition, true);
    if (observer) observer.disconnect();
    observer = null;

    if (menu) {
      finishClosing();
      const hide = () => {
        finishClosing();
        if (state) return;
        menu.hidden = true;
        delete menu.dataset.state;
      };

      if (reducedMotion() || menu.hidden) {
        hide();
      } else {
        // Shrinks back into the icon; hidden once its own animation ends (or
        // would have) - the rows' animations bubble here too, and do not count.
        const ended = event => {
          if (event.target === menu) hide();
        };
        menu.dataset.state = 'closing';
        closing = { done: ended, timer: setTimeout(hide, 220) };
        menu.addEventListener('animationend', ended);
      }
    }

    if (refocus && trigger.isConnected) trigger.focus();
  }

  function onMenuChange(event) {
    if (!state) return;
    const input = event.target;
    const prefs = state.prefs;

    if (input.matches('[data-sk-export-size]')) prefs.size = input.value;
    if (input.matches('[data-sk-export-format]')) prefs.format = input.value;
    if (input.matches('[data-sk-export-row-count]')) prefs.rows = Number(input.value);
    if (input.matches('[data-sk-export-card]')) prefs.card = input.checked;

    storePrefs(prefs);
    syncMenu();
  }

  async function runExport() {
    if (!state || state.busy) return;

    const current = state;
    if (!current.trigger.isConnected) {
      closeMenu(false);
      return;
    }

    current.busy = true;
    const submit = setSubmit('busy');
    submit.disabled = true;
    showStatus('');

    try {
      if (current.prefs.format === CSV.key) {
        await exportCsv(current.trigger);
      } else {
        await exportChart(current.trigger, {
          size: current.prefs.size,
          format: current.prefs.format,
          rows: current.prefs.rows,
          card: Boolean(current.prefs.card && current.options.cards),
        });
      }
      if (state !== current) return;
      // A beat to say it worked, then the menu goes.
      setSubmit('done');
      await new Promise(resolve => setTimeout(resolve, reducedMotion() ? 150 : DONE_MS));
      if (state === current) closeMenu(true);
    } catch (_error) {
      if (state === current) {
        setSubmit(null);
        showStatus(ERROR_TEXT);
      }
    } finally {
      current.busy = false;
      if (state === current) submit.disabled = false;
    }
  }

  function onMenuClick(event) {
    if (event.target.closest('[data-sk-export-close]')) {
      closeMenu(true);
      return;
    }
    if (event.target.closest('[data-sk-export-submit]')) runExport();
  }

  /*
    Tab stays inside: the controls a Tab reaches, in order (a radio group is
    one stop) - not those of a group hidden, or set aside by the CSV.
  */
  function tabStops() {
    return [
      menu.querySelector('[data-sk-export-close]'),
      menu.querySelector('[data-sk-export-size]:checked') || menu.querySelector('[data-sk-export-size]'),
      menu.querySelector('[data-sk-export-row-count]:checked') || menu.querySelector('[data-sk-export-row-count]'),
      menu.querySelector('[data-sk-export-card]'),
      menu.querySelector('[data-sk-export-format]:checked') || menu.querySelector('[data-sk-export-format]'),
      menu.querySelector('[data-sk-export-submit]'),
    ].filter(el => el && !el.matches(':disabled') && !el.closest('[hidden]'));
  }

  function onMenuKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }

    if (event.key !== 'Tab') return;
    const stops = tabStops();
    if (!stops.length) return;
    const first = stops[0];
    const last = stops[stops.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /*
    One delegated listener rather than one per button: the download buttons
    live inside cards that Livewire morphs or JS controllers rebuild on every
    filter change, so anything bound directly to the button would need to be
    rebound on every re-render.
  */
  document.addEventListener('click', event => {
    const button = event.target.closest('.sk-chart-download-btn, [data-sk-chart-source], [data-sk-chart-target]');
    if (!button || button.disabled) return;

    event.preventDefault();
    event.stopPropagation();
    openMenu(button);
  });

  window.SkChartDownload = {
    register(name, factory) { sources[name] = factory; },
    exportChart,
    chartRoot,
    plan: planFor,
    open: openMenu,
    close: () => closeMenu(false),
    svgToImage,
    paintHtml,
    fitText,
    surface: () => cssColor('--chart-surface', '#ffffff'),
    slugify,
    sizes: SIZES.map(size => ({ ...size })),
  };
})();
