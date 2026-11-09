(function () {
  'use strict';

  /*
    The advanced search's results as an image (SK-18's menu, the
    "search-results" source): the first rows of the applied search - 5, 10,
    15 or 20, the menu's "Jugadores" / "Equipos" - drawn on a canvas the way
    the table shows them: rank, face or crest, name and club or league, the
    text columns, then each stat as its washed value or, with one stat, as
    its rank bar and badge.

    The rows are the whole search's, not the page's: the server hands the
    first twenty in data-sk-export-table (Players::exportTable()), in the
    results' order, with the values, colours and bar lengths the table reads.
    Drawn rather than captured, so it is sharp at every preset's scale.

    Faces and crests come from the image host: each is asked for with CORS,
    and one the host will not share is left out - its initials stand in, as
    on the page - so the canvas never refuses to be saved.
  */

  const ROW = 46;
  // draw()'s own name for the natural row: a stretched layout's rows are taller.
  const ROW_BASE = ROW;
  const HEAD = 30;
  const PAD = 12;
  const RANK = 36;
  const ENTITY = 250;
  const EXTRA = 56;
  const SKORE = 64;
  const VALUE = 96;
  const BAR = 320;
  const BADGE = 56;
  const AVATAR = 30;
  const IMAGE_TIMEOUT_MS = 4000;

  const sources = window.SkChartDownloadSources = window.SkChartDownloadSources || {};
  const images = new Map();

  function cssColor(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  /* An image the canvas may read, or null: refused, missing or too slow. */
  function loadImage(url) {
    if (!url) return Promise.resolve(null);
    if (!images.has(url)) {
      images.set(url, new Promise(resolve => {
        const image = new Image();
        const timer = setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS);
        image.crossOrigin = 'anonymous';
        image.onload = () => { clearTimeout(timer); resolve(image); };
        image.onerror = () => {
          clearTimeout(timer);
          // Asked again next time: the host may answer then.
          images.delete(url);
          resolve(null);
        };
        image.src = url;
      }));
    }
    return images.get(url);
  }

  function initials(name) {
    return String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word[0].toUpperCase())
      .join('');
  }

  function ellipsize(ctx, text, maxWidth) {
    let shown = String(text ?? '');
    while (shown.length > 1 && ctx.measureText(shown).width > maxWidth) shown = `${shown.slice(0, -2)}…`;
    return shown;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /* An image cropped to a circle or fitted in a box, centred on (cx, cy). */
  function drawImage(ctx, image, cx, cy, size, round) {
    const k = Math.min(size / image.naturalWidth, size / image.naturalHeight) * (round ? 1.2 : 1);
    const w = image.naturalWidth * k;
    const h = image.naturalHeight * k;
    ctx.save();
    if (round) {
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
  }

  /* The columns, left to right, each with its x and width. */
  function columns(data) {
    const cols = [{ kind: 'rank', width: RANK }, { kind: 'entity', width: ENTITY }];
    data.extras.forEach((extra, index) => cols.push({ kind: 'extra', index, width: EXTRA, label: extra.label }));
    if (data.skore) cols.push({ kind: 'skore', width: SKORE });
    data.columns.forEach((column, index) => cols.push({ kind: 'value', index, width: data.bar ? BAR : VALUE, column }));

    let x = PAD;
    cols.forEach(col => { col.x = x; x += col.width; });
    return { cols, width: x + PAD, row: ROW };
  }

  /*
    The table laid out for a preset's room (Fase 6): the name and the value
    columns share the width past the natural one, the rank, extras and SKore
    keep theirs; the rows share the height, up to 1.6 times their own, so a
    tall image is not a short table with a gap under it.
  */
  function stretched(layout, rows, box) {
    const grow = layout.cols.filter(col => col.kind === 'entity' || col.kind === 'value');
    const extra = Math.max(0, box.width - layout.width);
    const growing = grow.reduce((sum, col) => sum + col.width, 0) || 1;
    const cols = layout.cols.map(col => ({ ...col, width: grow.includes(col) ? col.width + extra * (col.width / growing) : col.width }));

    let x = PAD;
    cols.forEach(col => { col.x = x; x += col.width; });
    const row = Math.min(ROW * 1.6, Math.max(ROW, (box.height - HEAD - PAD) / Math.max(1, rows)));
    return { cols, width: x + PAD, row };
  }

  /* The rank bars' gradient across the track, turning where the badges do (RankBands). */
  function barGradient(ctx, data, x, width) {
    const colours = { low: cssColor('--rank-low', '#F2924A'), mid: cssColor('--rank-mid', '#F0C32E'), high: cssColor('--rank-high', '#93CC63') };
    const stops = data.gradient;
    const gradient = data.reversed ? ctx.createLinearGradient(x + width, 0, x, 0) : ctx.createLinearGradient(x, 0, x + width, 0);
    if (!stops) {
      gradient.addColorStop(0, colours.high);
      gradient.addColorStop(1, colours.high);
      return gradient;
    }
    const at = value => Math.min(1, Math.max(0, value / 100));
    gradient.addColorStop(at(stops.low), colours.low);
    gradient.addColorStop(at(stops.mid_from), colours.mid);
    gradient.addColorStop(at(stops.mid_to), colours.mid);
    gradient.addColorStop(at(stops.high), colours.high);
    return gradient;
  }

  function bandColour(band) {
    return {
      high: cssColor('--rank-high', '#93CC63'),
      mid: cssColor('--rank-mid', '#F0C32E'),
      low: cssColor('--rank-low', '#F2924A'),
    }[band] || cssColor('--bg-secondary', '#EEF1EC');
  }

  async function draw(data, rows, layout, scale) {
    const width = layout.width;
    const ROW = layout.row || ROW_BASE;
    const height = HEAD + rows.length * ROW + PAD;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
    const ink = cssColor('--text', '#101511');
    const secondary = cssColor('--text-secondary', '#414B44');
    const muted = cssColor('--text-muted', '#6B766E');
    const border = cssColor('--border', '#DDE3DC');
    const soft = cssColor('--bg-secondary', '#EEF1EC');
    const wash = cssColor('--wash-green', '#93CC63');
    const rankInk = cssColor('--rank-ink', '#0e1e14');

    ctx.fillStyle = cssColor('--chart-surface', '#ffffff');
    ctx.fillRect(0, 0, width, height);

    // Faces and crests first, all at once; the ones refused stay null.
    const faces = await Promise.all(rows.map(row => loadImage(row.image)));
    const crests = await Promise.all(rows.map(row => loadImage(row.subImage)));

    ctx.textBaseline = 'middle';

    // Header: the table's own, small and muted.
    ctx.font = `700 10.5px ${font}`;
    ctx.fillStyle = muted;
    layout.cols.forEach(col => {
      const label = col.kind === 'rank' ? '#'
        : col.kind === 'entity' ? data.entityLabel
          : col.kind === 'extra' ? col.label
            : col.kind === 'skore' ? 'SKore'
              : [col.column.label, col.column.unit].filter(Boolean).join(' · ');
      ctx.textAlign = col.kind === 'entity' ? 'left' : 'center';
      const x = col.kind === 'entity' ? col.x : col.x + col.width / 2;
      ctx.fillText(ellipsize(ctx, String(label).toUpperCase(), col.width - 8), x, HEAD / 2);
    });

    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, HEAD - 0.5);
    ctx.lineTo(width - PAD, HEAD - 0.5);
    ctx.stroke();

    rows.forEach((row, index) => {
      const top = HEAD + index * ROW;
      const cy = top + ROW / 2;

      layout.cols.forEach(col => {
        if (col.kind === 'rank') {
          ctx.font = `700 13px ${font}`;
          ctx.fillStyle = secondary;
          ctx.textAlign = 'center';
          ctx.fillText(String(row.rank), col.x + col.width / 2, cy);
          return;
        }

        if (col.kind === 'entity') {
          const cx = col.x + AVATAR / 2;
          if (faces[index]) {
            drawImage(ctx, faces[index], cx, cy, AVATAR, data.roundImages);
          } else {
            ctx.fillStyle = soft;
            ctx.beginPath();
            ctx.arc(cx, cy, AVATAR / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = `700 11px ${font}`;
            ctx.fillStyle = secondary;
            ctx.textAlign = 'center';
            ctx.fillText(initials(row.name), cx, cy);
          }

          const textX = col.x + AVATAR + 10;
          const textWidth = col.width - AVATAR - 18;
          ctx.textAlign = 'left';
          ctx.font = `700 13.5px ${font}`;
          ctx.fillStyle = ink;
          ctx.fillText(ellipsize(ctx, row.name, textWidth), textX, row.sub ? cy - 8 : cy);

          if (row.sub) {
            let subX = textX;
            if (crests[index]) {
              drawImage(ctx, crests[index], subX + 6, cy + 9, 12, false);
              subX += 16;
            }
            ctx.font = `500 11px ${font}`;
            ctx.fillStyle = secondary;
            ctx.fillText(ellipsize(ctx, row.sub, textWidth - (subX - textX)), subX, cy + 9);
          }
          return;
        }

        if (col.kind === 'extra') {
          ctx.font = `600 12.5px ${font}`;
          ctx.fillStyle = ink;
          ctx.textAlign = 'center';
          ctx.fillText(ellipsize(ctx, row.extras[col.index] ?? '—', col.width - 6), col.x + col.width / 2, cy);
          return;
        }

        if (col.kind === 'skore') {
          // The table's chip (.sk-skore-chip): the rank bars' colour of its band.
          const skore = row.skore || { text: '—', grade: 'none' };
          const chipWidth = 46;
          const chipX = col.x + (col.width - chipWidth) / 2;
          if (skore.grade !== 'none') {
            ctx.fillStyle = bandColour(skore.grade);
            roundRect(ctx, chipX, cy - 11, chipWidth, 22, 6);
            ctx.fill();
          }
          ctx.font = `800 12px ${font}`;
          ctx.fillStyle = skore.grade === 'none' ? muted : rankInk;
          ctx.textAlign = 'center';
          ctx.fillText(skore.text, chipX + chipWidth / 2, cy);
          return;
        }

        const value = row.values[col.index] || {};

        if (data.bar) {
          // The rank bar: a track, its fill to the value's length, the badge after it.
          const trackX = col.x + 6;
          const trackWidth = col.width - BADGE - 18;
          ctx.fillStyle = soft;
          roundRect(ctx, trackX, cy - 7, trackWidth, 14, 7);
          ctx.fill();

          if (value.text !== null && value.text !== undefined) {
            if (data.diverging) {
              /*
                A diverging bar (Goals Prevented, fase 5 B1), as the table's:
                0 at the track's centre, a hairline there, the fill run right
                for a positive share and left for a negative one, the
                gradient across the whole track (yellow on 0).
              */
              const centre = trackX + trackWidth / 2;
              const share = Math.max(-1, Math.min(1, Number(value.share) || 0));
              const half = Math.abs(share) * trackWidth / 2;
              if (half > 0) {
                ctx.save();
                roundRect(ctx, trackX, cy - 7, trackWidth, 14, 7);
                ctx.clip();
                ctx.fillStyle = barGradient(ctx, data, trackX, trackWidth);
                ctx.fillRect(share < 0 ? centre - half : centre, cy - 7, half, 14);
                ctx.restore();
              }
              ctx.fillStyle = muted;
              ctx.fillRect(centre - 1, cy - 7, 2, 14);
            } else {
              const fill = Math.max(0, Math.min(100, value.ratio || 0)) / 100 * trackWidth;
              // From the left either way; where lower is better only the gradient turns round.
              if (fill > 0) {
                ctx.fillStyle = barGradient(ctx, data, trackX, trackWidth);
                roundRect(ctx, trackX, cy - 7, Math.max(fill, 7), 14, 7);
                ctx.fill();
              }
            }
            ctx.fillStyle = bandColour(value.band);
            roundRect(ctx, col.x + col.width - BADGE - 4, cy - 12, BADGE, 24, 6);
            ctx.fill();
            ctx.font = `700 12px ${font}`;
            ctx.fillStyle = rankInk;
            ctx.textAlign = 'center';
            ctx.fillText(ellipsize(ctx, value.text, BADGE - 6), col.x + col.width - BADGE / 2 - 4, cy);
          } else {
            ctx.font = `600 12px ${font}`;
            ctx.fillStyle = muted;
            ctx.textAlign = 'center';
            ctx.fillText('—', col.x + col.width - BADGE / 2 - 4, cy);
          }
          return;
        }

        // A value washed green by its standing, as the table's cells are.
        const cellX = col.x + 4;
        const cellWidth = col.width - 8;
        if (value.text !== null && value.text !== undefined && value.ratio > 0) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, value.ratio / 100);
          ctx.fillStyle = wash;
          roundRect(ctx, cellX, cy - 14, cellWidth, 28, 8);
          ctx.fill();
          ctx.restore();
        }
        ctx.font = `600 12.5px ${font}`;
        ctx.fillStyle = value.text === null || value.text === undefined ? muted : ink;
        ctx.textAlign = 'center';
        ctx.fillText(ellipsize(ctx, value.text ?? '—', cellWidth - 6), cellX + cellWidth / 2, cy);
      });

      if (index < rows.length - 1) {
        ctx.strokeStyle = border;
        ctx.beginPath();
        ctx.moveTo(PAD, top + ROW - 0.5);
        ctx.lineTo(width - PAD, top + ROW - 0.5);
        ctx.stroke();
      }
    });

    return canvas;
  }

  function readTable(button) {
    try {
      const data = JSON.parse(button.dataset.skExportTable || 'null');
      return data && Array.isArray(data.rows) ? data : null;
    } catch (_error) {
      return null;
    }
  }

  /* The source chart-download.js asks for, with the menu's row count. */
  sources['search-results'] = function (button, choice = {}) {
    const data = readTable(button);
    if (!data || data.rows.length === 0) return null;

    const count = Number(choice.rows) > 0 ? Number(choice.rows) : data.rows.length;
    const rows = data.rows.slice(0, count);
    const layout = columns(data);

    return {
      width: layout.width,
      height: HEAD + rows.length * ROW + PAD,
      nativeScale: Math.max(2, window.devicePixelRatio || 1),
      name: `${data.name}-top-${rows.length}`,
      title: data.title,
      context: data.context,
      render: scale => draw(data, rows, layout, scale),
      renderInto: (box, scale) => draw(data, rows, stretched(layout, rows.length, box), scale),
    };
  };
})();
