/**
 * The match page's momentum chart (SK-17): hover, goal details and zoom over
 * the SVG the server draws.
 *
 * The line stays the server's — it reads without JavaScript, and a live poll
 * redraws it. This only moves the SVG's viewBox (zoom and pan) and fills a
 * wire:ignore'd layer above it: a guide and a tooltip that follow the
 * pointer, a button per goal, the minute ticks for the span in view. The
 * zoom lives on the container, which Livewire keeps across a poll, so a live
 * update does not throw the reader back to the whole match.
 *
 *   Curva / Barras   the smoothed line, or a bar a minute (kept in localStorage)
 *   hover        the minute, who had the momentum, each side's xT that minute
 *   a goal       scorer, minute, the score it left, the assist
 *   wheel / ± / drag / double-click   zoom in, out, pan, back to the whole match
 */
(function () {
  if (window.skMomentumBound) {
    return;
  }

  window.skMomentumBound = true;

  const WIDTH = 720;
  const VIEW_KEY = 'sk.momentum.view';

  /** The reader's last view, kept in this browser; the curve when storage is off. */
  const storedView = () => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'bars' ? 'bars' : 'curve';
    } catch (e) {
      return 'curve';
    }
  };

  const storeView = (view) => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch (e) {
      // Private mode: the choice lasts the page.
    }
  };

  /*
    The view just shown grows in again (match-detail.css). Showing a
    display:none group does not restart its SVG children's animations in
    Chromium, so they are cleared and handed back after a reflow.
  */
  const replayRise = (box) => {
    const parts = box.querySelectorAll('.match-momentum__curve, .match-momentum__bar');
    parts.forEach((el) => { el.style.animation = 'none'; });
    box.getBoundingClientRect();
    parts.forEach((el) => { el.style.animation = ''; });
  };

  // The narrowest span in view: about a dozen minutes.
  const MIN_SPAN_MINUTES = 12;

  const fmt = (value, decimals = 2) => Number(value || 0).toFixed(decimals).replace('.', ',');
  const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

  const read = (box) => {
    try {
      return JSON.parse(box.querySelector('[data-momentum-data]')?.textContent || 'null');
    } catch (e) {
      return null;
    }
  };

  const xOf = (data, i) => (i / (data.n - 1)) * WIDTH;
  const pct = (state, x) => ((x - state.from) / (state.to - state.from)) * 100;

  /** The layer's fixed parts, built once: they survive polls (wire:ignore). */
  const scaffold = (layer) => {
    if (layer.dataset.ready) {
      return;
    }

    layer.dataset.ready = '1';
    layer.innerHTML = '<div class="mm-guide" hidden></div><div class="mm-dot" hidden></div><div class="mm-tip" role="status" hidden></div><div class="mm-goals"></div><div class="mm-ticks" aria-hidden="true"></div><div class="mm-now" hidden></div>';
  };

  const render = (box) => {
    const state = box._mm;
    const { data } = state;
    const svg = box.querySelector('svg');
    const layer = box.querySelector('.match-momentum__layer');

    svg.setAttribute('viewBox', `${state.from} -14 ${state.to - state.from} 208`);
    scaffold(layer);

    box.classList.toggle('match-momentum--bars', state.view === 'bars');
    box.querySelectorAll('[data-momentum-view]').forEach((button) => {
      const on = button.dataset.momentumView === state.view;
      button.classList.toggle('match-momentum__view--active', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    // Goals in view, as buttons: hover, focus or tap for the details. The
    // ball is the site's PNG; the icon font stands in if it is missing.
    const ball = box.dataset.momentumBall
      ? `<img src="${esc(box.dataset.momentumBall)}" alt="" width="18" height="18" draggable="false">`
      : '<i class="bi bi-dribbble" aria-hidden="true"></i>';
    const goals = layer.querySelector('.mm-goals');
    goals.innerHTML = data.goals
      .filter((g) => g.x >= state.from && g.x <= state.to)
      .map((g, k) => {
        const team = data.teams[g.side];
        const who = g.player || team;

        return `<button type="button" class="mm-goal mm-goal--${g.side}" style="left:${pct(state, g.x)}%" data-goal="${data.goals.indexOf(g)}" aria-label="Gol de ${esc(who)}, ${esc(g.minute)}, ${esc(g.score)}">${ball}</button>`;
      })
      .join('');

    // Minute ticks for the span in view: every 15' for the whole match,
    // every 5' or every minute as it narrows; half time always.
    const span = ((state.to - state.from) / WIDTH) * data.n;
    const whole = state.to - state.from >= WIDTH - 0.5;
    const step = span > 60 ? 15 : span > 25 ? 5 : 1;
    const ticks = [];

    // The whole match reads as the reference does: kick-off, half time, the end.
    if (whole) {
      layer.querySelector('.mm-ticks').innerHTML = `<span class="mm-tick mm-tick--start" style="left:0%">0'</span><span class="mm-tick mm-tick--half" style="left:${pct(state, xOf(data, data.halfTime))}%">HT</span><span class="mm-tick mm-tick--end" style="left:100%">FT</span>`;
      box.classList.toggle('match-momentum--zoomed', false);

      return;
    }

    const halfPct = pct(state, xOf(data, data.halfTime));

    data.labels.forEach((label, i) => {
      const x = xOf(data, i);

      if (!label || x < state.from || x > state.to) {
        return;
      }

      const minute = parseInt(label, 10);
      const isHalf = i === data.halfTime;
      // A minute that would sit on top of "MT" gives way to it.
      const crowdsHalf = !isHalf && Math.abs(pct(state, x) - halfPct) < 7;

      if (isHalf || (!crowdsHalf && !label.includes('+') && minute % step === 0)) {
        ticks.push(`<span class="mm-tick${isHalf ? ' mm-tick--half' : ''}" style="left:${pct(state, x)}%">${isHalf ? 'HT' : esc(label)}</span>`);
      }
    });

    layer.querySelector('.mm-ticks').innerHTML = ticks.join('');
    box.classList.toggle('match-momentum--zoomed', state.to - state.from < WIDTH - 0.5);
  };

  const showTip = (box, html, leftPct, guide) => {
    const layer = box.querySelector('.match-momentum__layer');
    const tip = layer.querySelector('.mm-tip');
    const line = layer.querySelector('.mm-guide');

    tip.innerHTML = html;
    tip.hidden = false;
    // Keep the box inside the plot: flip to the pointer's left past halfway.
    tip.style.left = `${Math.min(Math.max(leftPct, 0), 100)}%`;
    tip.classList.toggle('mm-tip--left', leftPct > 60);

    if (guide) {
      line.hidden = false;
      line.style.left = `${leftPct}%`;
    } else {
      line.hidden = true;
    }
  };

  const hideTip = (box) => {
    const layer = box.querySelector('.match-momentum__layer');
    ['.mm-tip', '.mm-guide', '.mm-dot', '.mm-now'].forEach((sel) => layer.querySelector(sel)?.setAttribute('hidden', ''));
    layer.querySelector('.mm-ticks')?.classList.remove('mm-ticks--muted');
  };

  /** The line's height at point i, as a share of the plot (the server's own scale). */
  const yPct = (data, i, view = 'curve') => {
    const v = (view === 'bars' ? data.net?.[i] : data.points[i]) || 0;
    const max = (view === 'bars' ? data.barMax : data.max) || 1;
    const y = 90 - Math.sign(v) * Math.sqrt(Math.abs(v) / max) * 80;

    return ((y + 14) / 208) * 100;
  };

  /** The minute under the pointer: a guide, a dot on the line, the minute on the axis. */
  const hover = (box, clientX) => {
    const state = box._mm;
    const { data } = state;
    const layer = box.querySelector('.match-momentum__layer');
    const rect = box.querySelector('.match-momentum__plot').getBoundingClientRect();
    const x = state.from + ((clientX - rect.left) / rect.width) * (state.to - state.from);
    const i = Math.max(0, Math.min(data.n - 1, Math.round((x / WIDTH) * (data.n - 1))));
    const label = data.labels[i];

    if (!label) {
      hideTip(box);

      return;
    }

    const left = pct(state, xOf(data, i));
    const net = data.points[i] || 0;
    const ahead = Math.abs(net) < 0.002 ? null : net > 0 ? 'home' : 'away';
    const dot = layer.querySelector('.mm-dot');
    const now = layer.querySelector('.mm-now');

    dot.hidden = false;
    dot.style.left = `${left}%`;
    dot.style.top = `${yPct(data, i, state.view)}%`;
    dot.className = `mm-dot${ahead ? ` mm-dot--${ahead}` : ''}`;

    // The minute on the axis, as the reference shows it; HT beside it at the break.
    now.hidden = false;
    now.style.left = `${left}%`;
    now.textContent = i === data.halfTime ? `HT ${label}` : label;
    layer.querySelector('.mm-ticks').classList.add('mm-ticks--muted');

    // A single minute's xT is often nothing even mid-spell; the five that
    // end at it are what the line is showing.
    const recent = (side) => data[side].slice(Math.max(0, i - 4), i + 1).reduce((sum, v) => sum + (v || 0), 0);

    showTip(box, `
      <span class="mm-tip__row"><i class="mm-tip__key mm-tip__key--home"></i>${esc(data.teams.home)}<b>${fmt(recent('home'))}</b></span>
      <span class="mm-tip__row"><i class="mm-tip__key mm-tip__key--away"></i>${esc(data.teams.away)}<b>${fmt(recent('away'))}</b></span>
      <span class="mm-tip__note">xT en los últimos 5 minutos</span>
    `, left, true);
    layer.querySelector('.mm-tip').classList.add('mm-tip--chip');
    layer.querySelector('.mm-tip').classList.remove('mm-tip--below');
  };

  /** A goal: the scorer's face, "Gol (0 - 1)" with the scorer's number lit, the name. */
  const goalTip = (box, button) => {
    const state = box._mm;
    const g = state.data.goals[parseInt(button.dataset.goal, 10)];

    if (!g) {
      return;
    }

    const [home, away] = String(g.score).split('-');
    const lit = (n, side) => `<span class="${g.side === side ? `mm-card__lit mm-card__lit--${side}` : ''}">${esc(n)}</span>`;
    const how = g.type === 'PG' ? ' de penal' : g.type === 'OG' ? ' en propia' : '';
    const face = g.photo
      ? `<img class="mm-card__face" src="${esc(g.photo)}" alt="" width="36" height="36" onerror="this.remove()">`
      : `<span class="mm-card__face mm-card__face--blank" aria-hidden="true">${esc((g.player || '?').slice(0, 1))}</span>`;

    showTip(box, `
      <span class="mm-card">
        ${face}
        <span class="mm-card__text">
          <b>Gol${how} (${lit(home, 'home')} - ${lit(away, 'away')})</b>
          <span>${esc(g.player || state.data.teams[g.side])} · ${esc(g.minute)}</span>
          ${g.assist ? `<small>Asistencia de ${esc(g.assist)}</small>` : ''}
        </span>
      </span>
    `, pct(state, g.x), true);

    const layer = box.querySelector('.match-momentum__layer');
    const tip = layer.querySelector('.mm-tip');
    tip.classList.remove('mm-tip--chip');
    tip.classList.toggle('mm-tip--below', g.side === 'away');
    // The minute and the dot belong to the line, not to a goal.
    layer.querySelector('.mm-dot').hidden = true;
    layer.querySelector('.mm-now').hidden = true;
    layer.querySelector('.mm-ticks').classList.remove('mm-ticks--muted');
  };

  /** Zoom by `factor` (< 1 in, > 1 out) about the plot point `centre`. */
  const zoom = (box, factor, centre) => {
    const state = box._mm;
    const minSpan = (MIN_SPAN_MINUTES / state.data.n) * WIDTH;
    const span = Math.min(WIDTH, Math.max(minSpan, (state.to - state.from) * factor));
    const anchor = centre ?? (state.from + state.to) / 2;
    const share = (anchor - state.from) / (state.to - state.from);
    let from = anchor - share * span;

    from = Math.max(0, Math.min(WIDTH - span, from));
    state.from = from;
    state.to = from + span;
    render(box);
  };

  const plotX = (box, clientX) => {
    const state = box._mm;
    const rect = box.querySelector('.match-momentum__plot').getBoundingClientRect();

    return state.from + ((clientX - rect.left) / rect.width) * (state.to - state.from);
  };

  const bind = (box) => {
    const plot = box.querySelector('.match-momentum__plot');
    let drag = null;

    plot.addEventListener('pointermove', (e) => {
      if (drag) {
        const rect = plot.getBoundingClientRect();
        const state = box._mm;
        const span = state.to - state.from;
        const shift = ((e.clientX - drag.x) / rect.width) * span;
        const from = Math.max(0, Math.min(WIDTH - span, drag.from - shift));

        state.from = from;
        state.to = from + span;
        render(box);
        hideTip(box);

        return;
      }

      if (!e.target.closest('.mm-goal')) {
        hover(box, e.clientX);
      }
    });

    plot.addEventListener('pointerleave', () => {
      drag = null;
      hideTip(box);
    });

    plot.addEventListener('pointerdown', (e) => {
      const state = box._mm;

      if (e.target.closest('.mm-goal') || state.to - state.from >= WIDTH - 0.5) {
        return;
      }

      drag = { x: e.clientX, from: state.from };
      plot.setPointerCapture?.(e.pointerId);
    });

    const endDrag = () => {
      drag = null;
    };

    plot.addEventListener('pointerup', endDrag);
    plot.addEventListener('pointercancel', endDrag);

    plot.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoom(box, e.deltaY < 0 ? 0.8 : 1.25, plotX(box, e.clientX));
    }, { passive: false });

    plot.addEventListener('dblclick', () => {
      box._mm.from = 0;
      box._mm.to = WIDTH;
      render(box);
    });

    const layer = box.querySelector('.match-momentum__layer');

    ['mouseover', 'focusin', 'click'].forEach((type) => {
      layer.addEventListener(type, (e) => {
        const button = e.target.closest('.mm-goal');

        if (button) {
          goalTip(box, button);
        }
      });
    });

    box.querySelectorAll('[data-momentum-view]').forEach((button) => {
      button.addEventListener('click', () => {
        const view = button.dataset.momentumView === 'bars' ? 'bars' : 'curve';
        const changed = view !== box._mm.view;
        box._mm.view = view;
        storeView(view);
        hideTip(box);
        render(box);

        if (changed) {
          replayRise(box);
        }
      });
    });

    box.querySelectorAll('[data-momentum-zoom]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.momentumZoom;

        if (action === 'reset') {
          box._mm.from = 0;
          box._mm.to = WIDTH;
          render(box);
        } else {
          zoom(box, action === 'in' ? 0.6 : 1 / 0.6);
        }
      });
    });
  };

  const setup = (box) => {
    const data = read(box);

    if (!data || !data.n) {
      return;
    }

    box._mm = box._mm || { from: 0, to: WIDTH, view: storedView() };
    box._mm.data = data;

    if (!box.dataset.mmBound) {
      box.dataset.mmBound = '1';
      bind(box);
    }

    box.classList.add('match-momentum--interactive');
    render(box);
  };

  /*
    The download (chart-download.js, SK-18): the plot as the reader sees it —
    the zoom, the curve or the bars, the goal balls, the minute ticks — and
    the teams' legend under it. The goals and the ticks are HTML over the
    SVG, so the generic SVG export would leave them out.
  */
  const exportSource = (box) => {
    const download = window.SkChartDownload;
    const plot = box.querySelector('.match-momentum__plot');
    const svg = plot?.querySelector('svg');

    if (!download || !svg || !box._mm) {
      return null;
    }

    const svgBox = svg.getBoundingClientRect();

    if (!svgBox.width || !svgBox.height) {
      return null;
    }

    const layer = plot.querySelector('.match-momentum__layer');
    const ticks = layer?.querySelector('.mm-ticks');
    const legend = box.querySelector('.match-legend');
    const pad = 12;
    const origin = { left: svgBox.left - pad, top: svgBox.top - pad };
    const bottom = Math.max(svgBox.bottom, ticks?.getBoundingClientRect().bottom || 0, legend?.getBoundingClientRect().bottom || 0);
    const width = Math.round(svgBox.width + pad * 2);
    const height = Math.round(bottom + pad - origin.top);

    return {
      width,
      height,
      nativeScale: Math.max(2, window.devicePixelRatio || 1),
      render: async (scale) => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        const at = (rect) => [(rect.left - origin.left) * scale, (rect.top - origin.top) * scale, rect.width * scale, rect.height * scale];
        const styles = getComputedStyle(box);

        ctx.fillStyle = download.surface();
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const image = await download.svgToImage(svg, Math.round(svgBox.width * scale), Math.round(svgBox.height * scale));
        ctx.drawImage(image, ...at(svgBox));

        // The goal balls where the layer puts them; a ring in the side's colour if the PNG is missing.
        layer?.querySelectorAll('.mm-goal').forEach((goal) => {
          const [x, y, w, h] = at(goal.getBoundingClientRect());
          const ball = goal.querySelector('img');

          if (ball && ball.complete && ball.naturalWidth) {
            ctx.drawImage(ball, x, y, w, h);

            return;
          }

          ctx.beginPath();
          ctx.arc(x + w / 2, y + h / 2, Math.max(1, w / 2 - scale), 0, Math.PI * 2);
          ctx.fillStyle = styles.getPropertyValue('--bg-card').trim() || '#ffffff';
          ctx.fill();
          ctx.lineWidth = 2 * scale;
          ctx.strokeStyle = styles.getPropertyValue(goal.classList.contains('mm-goal--home') ? '--match-home' : '--match-away').trim() || '#888888';
          ctx.stroke();
        });

        // The minute axis: its dotted rule, then the minutes.
        if (ticks) {
          const style = getComputedStyle(ticks);
          const [x, y, w] = at(ticks.getBoundingClientRect());
          const line = (parseFloat(style.borderTopWidth) || 2) * scale;

          ctx.save();
          ctx.strokeStyle = style.borderTopColor;
          ctx.lineWidth = line;
          ctx.setLineDash([line, line * 1.5]);
          ctx.beginPath();
          ctx.moveTo(x, y + line / 2);
          ctx.lineTo(x + w, y + line / 2);
          ctx.stroke();
          ctx.restore();
          download.paintHtml(ctx, ticks, origin, scale);
        }

        if (legend) {
          download.paintHtml(ctx, legend, origin, scale);
        }

        return canvas;
      },
    };
  };

  (window.SkChartDownloadSources = window.SkChartDownloadSources || {}).momentum = (button) => {
    const box = button.closest('.match-card')?.querySelector('[data-momentum]');

    return box ? exportSource(box) : null;
  };

  const boot = () => document.querySelectorAll('[data-momentum]').forEach(setup);

  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('livewire:navigated', boot);
  document.addEventListener('livewire:init', () => {
    window.Livewire?.hook?.('morph.updated', () => requestAnimationFrame(boot));
  });
})();
