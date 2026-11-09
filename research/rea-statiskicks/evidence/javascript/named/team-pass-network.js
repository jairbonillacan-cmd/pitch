(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function readPayload(root) {
    const source = root.querySelector('[data-team-pass-network-payload]');
    if (!source) return {};

    try {
      return JSON.parse(source.textContent || '{}');
    } catch (error) {
      return {};
    }
  }

  /*
    Colours come from the stylesheet for the same reason the canvas charts read
    them: an SVG presentation attribute cannot take a var(), so the values are
    resolved once per render and the theme lives in one place rather than in a
    ternary beside every shape.
  */
  function themeInk() {
    const styles = getComputedStyle(document.documentElement);
    const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
    const series = read('--chart-series', '#2C7A55');

    return {
      line: read('--pitch-line', 'rgba(16,21,17,0.26)'),
      grid: read('--chart-grid-soft', 'rgba(16,21,17,0.08)'),
      series,
      seriesAt: alpha => rgbaFrom(series, alpha),
      surface: read('--chart-surface', '#ffffff'),
      label: read('--chart-label', '#141A15'),
    };
  }

  function rgbaFrom(color, alpha) {
    if (color.startsWith('rgb')) {
      const channels = color.match(/\d+(\.\d+)?/g)?.slice(0, 3) || [0, 0, 0];
      return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
    }

    const clean = color.replace('#', '');
    const value = parseInt(clean.length === 3 ? clean.replace(/./g, c => c + c) : clean, 16);
    if (Number.isNaN(value)) return `rgba(44, 122, 85, ${alpha})`;

    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }

  function svgEl(name, attrs = {}) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function clear(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numeric(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function format(value, decimals = 1) {
    return numeric(value).toLocaleString('es-ES', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function formatSigned(value, decimals = 3) {
    const number = numeric(value);
    return `${number > 0 ? '+' : ''}${format(number, decimals)}`;
  }

  function interpolateColor(start, end, amount) {
    const channels = start.map((channel, index) => Math.round(channel + ((end[index] - channel) * amount)));
    return `rgb(${channels.join(',')})`;
  }

  function volumeColor(ratio, isDark) {
    const start = isDark ? [106, 139, 128] : [99, 139, 116];
    const end = isDark ? [95, 211, 156] : [26, 133, 84];
    const amount = clamp(ratio, 0, 1);
    return interpolateColor(start, end, amount);
  }

  function threatColor(value, domain, isDark) {
    const neutral = isDark ? [105, 116, 111] : [103, 116, 109];
    const negative = isDark ? [245, 158, 11] : [217, 119, 6];
    const positive = isDark ? [45, 212, 191] : [13, 148, 136];
    const ratio = clamp(Math.abs(numeric(value)) / Math.max(domain, 0.05), 0, 1);

    return interpolateColor(neutral, numeric(value) < 0 ? negative : positive, ratio);
  }

  function matrixVolumeColor(value, domain, isDark) {
    const neutral = isDark ? [43, 55, 51] : [229, 236, 232];
    const positive = isDark ? [20, 184, 166] : [13, 148, 136];
    const ratio = clamp(numeric(value) / Math.max(numeric(domain), 1), 0, 1);

    return interpolateColor(neutral, positive, 0.14 + (ratio * 0.86));
  }

  function htmlEl(name, className = '') {
    const element = document.createElement(name);
    if (className) element.className = className;
    return element;
  }

  function drawPitch(svg, width, height, colors, markerId) {
    const left = 24;
    const top = 28;
    const fieldWidth = width - 48;
    const fieldHeight = height - 56;
    const centerX = width / 2;
    const centerY = height / 2;

    svg.appendChild(svgEl('rect', {
      x: left,
      y: top,
      width: fieldWidth,
      height: fieldHeight,
      rx: 2,
      fill: colors.pitch,
      stroke: colors.line,
      'stroke-width': 1.2,
    }));
    svg.appendChild(svgEl('line', {
      x1: left,
      y1: centerY,
      x2: width - left,
      y2: centerY,
      stroke: colors.line,
      'stroke-width': 1,
    }));
    svg.appendChild(svgEl('circle', {
      cx: centerX,
      cy: centerY,
      r: 42,
      fill: 'none',
      stroke: colors.line,
      'stroke-width': 1,
    }));
    svg.appendChild(svgEl('circle', {
      cx: centerX,
      cy: centerY,
      r: 2,
      fill: colors.line,
    }));

    [top, top + fieldHeight - 86].forEach(boxY => {
      svg.appendChild(svgEl('rect', {
        x: centerX - 74,
        y: boxY,
        width: 148,
        height: 86,
        fill: 'none',
        stroke: colors.line,
        'stroke-width': 1,
      }));
    });

    [top, top + fieldHeight - 36].forEach(boxY => {
      svg.appendChild(svgEl('rect', {
        x: centerX - 34,
        y: boxY,
        width: 68,
        height: 36,
        fill: 'none',
        stroke: colors.line,
        'stroke-width': 1,
      }));
    });

    svg.appendChild(svgEl('line', {
      x1: width - 44,
      y1: 82,
      x2: width - 44,
      y2: 48,
      stroke: colors.attack,
      'stroke-width': 1.5,
      'marker-end': `url(#${markerId})`,
    }));
    const attackLabel = svgEl('text', {
      x: width - 54,
      y: 70,
      'text-anchor': 'end',
      fill: colors.muted,
      'font-size': 9,
      'font-weight': 700,
    });
    attackLabel.textContent = 'ATAQUE';
    svg.appendChild(attackLabel);
  }

  function pointFor(node, width, height) {
    return {
      x: 24 + (clamp(numeric(node.x), 0, 100) / 100) * (width - 48),
      y: 28 + (clamp(numeric(node.y), 0, 100) / 100) * (height - 56),
    };
  }

  function pathFor(source, target, sourceRadius, targetRadius, reciprocal) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.max(Math.sqrt((dx * dx) + (dy * dy)), 1);
    const ux = dx / distance;
    const uy = dy / distance;
    const start = {
      x: source.x + (ux * (sourceRadius + 3)),
      y: source.y + (uy * (sourceRadius + 3)),
    };
    const end = {
      x: target.x - (ux * (targetRadius + 8)),
      y: target.y - (uy * (targetRadius + 8)),
    };
    const bend = reciprocal ? 17 : 0;
    const control = {
      x: ((start.x + end.x) / 2) - (uy * bend),
      y: ((start.y + end.y) / 2) + (ux * bend),
    };

    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }

  // "Bruno Guimarães" → "Guimarães"; "N. Williams" stays as Opta wrote it.
  function shortName(name) {
    const words = String(name).trim().split(/\s+/).filter(Boolean);
    if (words.length < 2 || /\.$/.test(words[0])) return words.join(' ');

    return words.slice(1).join(' ');
  }

  function playerSummary(node) {
    const players = Array.isArray(node.players) ? node.players : [];
    if (players.length === 0) return node.player_name || 'Sin jugador identificado';

    const visible = players.slice(0, 3).map(player => `${player.name} (${format(player.minutes, 0)} min)`);
    if (players.length > 3) visible.push(`+${players.length - 3} más`);

    return visible.join(', ');
  }

  function ensureTooltip(root) {
    let tooltip = root.querySelector('[data-team-pass-network-tooltip]');

    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.dataset.teamPassNetworkTooltip = '';
      tooltip.className = 'team-pass-network-tooltip';
      tooltip.hidden = true;
      root.appendChild(tooltip);
    }

    return tooltip;
  }

  function fillTooltip(tooltip, lines) {
    tooltip.replaceChildren();
    lines.forEach((line, index) => {
      const row = document.createElement(index === 0 ? 'strong' : 'span');
      row.textContent = line;
      tooltip.appendChild(row);
    });
  }

  function positionTooltip(root, tooltip, clientX, clientY) {
    const rootBox = root.getBoundingClientRect();
    const left = clientX - rootBox.left + 14;
    const top = clientY - rootBox.top + 14;
    tooltip.style.left = `${clamp(left, 8, rootBox.width - tooltip.offsetWidth - 8)}px`;
    tooltip.style.top = `${clamp(top, 8, rootBox.height - tooltip.offsetHeight - 8)}px`;
  }

  function bindTooltip(root, element, tooltip, lines) {
    const show = (clientX, clientY) => {
      fillTooltip(tooltip, lines);
      tooltip.hidden = false;
      positionTooltip(root, tooltip, clientX, clientY);
    };
    const hide = () => {
      tooltip.hidden = true;
    };

    element.addEventListener('pointerenter', event => show(event.clientX, event.clientY));
    element.addEventListener('pointermove', event => positionTooltip(root, tooltip, event.clientX, event.clientY));
    element.addEventListener('pointerleave', hide);
    element.addEventListener('focus', () => {
      const box = element.getBoundingClientRect();
      show(box.left + (box.width / 2), box.top + (box.height / 2));
    });
    element.addEventListener('blur', hide);
  }

  /*
    The matrix fills in (team-pass-network.css) when it first draws and when
    a style is picked, a diagonal wave from the top corner; a live refresh or
    a theme change redraws it without one.
  */
  function renderPassMatrix(root, payload, tooltip, isDark, animate = false) {
    const matrixRoot = root.querySelector('[data-team-pass-matrix]');
    const table = matrixRoot?.querySelector('[data-team-pass-matrix-table]');
    const trigger = matrixRoot?.querySelector('[data-team-pass-matrix-trigger]');
    const triggerLabel = matrixRoot?.querySelector('[data-team-pass-matrix-trigger-label]');
    const menu = matrixRoot?.querySelector('[data-team-pass-matrix-menu]');
    const options = [...(matrixRoot?.querySelectorAll('[data-team-pass-matrix-option]') || [])];
    const maxLabel = matrixRoot?.querySelector('[data-team-pass-matrix-max]');
    const matrix = payload?.pass_matrix;

    if (!matrixRoot || !table || !trigger || !menu || !matrix?.available) return;

    const players = Array.isArray(matrix.players) ? matrix.players : [];
    const styles = Array.isArray(matrix.styles) ? matrix.styles : [];
    const cells = Array.isArray(matrix.cells) ? matrix.cells : [];
    const validStyles = new Set(styles.map(style => style.key));
    const defaultStyle = validStyles.has(matrix.default_style) ? matrix.default_style : 'all';
    const selectedStyle = validStyles.has(matrixRoot.dataset.selectedStyle) ? matrixRoot.dataset.selectedStyle : defaultStyle;
    const selectedStyleData = styles.find(style => style.key === selectedStyle);
    const styleLabel = selectedStyleData?.label || 'Todos';
    const cellByPair = new Map(cells.map(cell => [`${cell.source}>${cell.target}`, cell]));
    const maxCount = Math.max(
      0,
      ...cells.map(cell => numeric(cell.values?.[selectedStyle]?.count)),
    );

    matrixRoot.dataset.selectedStyle = selectedStyle;
    // On the root, not the matrix: a live refresh rebuilds the matrix's markup.
    table.classList.toggle('team-pass-matrix__table--enter', animate || root.dataset.passMatrixAnimated !== 'true');
    root.dataset.passMatrixAnimated = 'true';
    options.forEach(option => {
      const selected = option.dataset.teamPassMatrixOption === selectedStyle;
      option.classList.toggle('selected', selected);
      option.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    if (triggerLabel) {
      triggerLabel.textContent = `${styleLabel} (${Number(selectedStyleData?.pass_count || 0).toLocaleString('es-MX')})`;
    }
    clear(table);

    const caption = htmlEl('caption');
    caption.textContent = `Matriz de pases. Filas: jugador que pasa. Columnas: jugador que recibe. Estilo: ${styleLabel}.`;
    caption.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
    table.appendChild(caption);

    const head = htmlEl('thead');
    const headRow = htmlEl('tr');
    const corner = htmlEl('th', 'team-pass-matrix__corner');
    corner.scope = 'col';
    const receiverLabel = htmlEl('span');
    receiverLabel.textContent = 'Recibe →';
    const passerLabel = htmlEl('span');
    passerLabel.textContent = 'Pasa ↓';
    corner.append(receiverLabel, passerLabel);
    headRow.appendChild(corner);

    players.forEach(player => {
      const header = htmlEl('th', 'team-pass-matrix__column');
      header.scope = 'col';
      header.title = `${player.name} · ${player.role_name || player.role}`;
      header.dataset.playerId = player.id;
      const label = htmlEl('span');
      label.textContent = player.name;
      header.appendChild(label);
      headRow.appendChild(header);
    });
    head.appendChild(headRow);
    table.appendChild(head);

    const body = htmlEl('tbody');

    players.forEach((source, rowIndex) => {
      const row = htmlEl('tr');
      const rowHeader = htmlEl('th', 'team-pass-matrix__row');
      rowHeader.scope = 'row';
      rowHeader.title = `${source.name} · ${source.role_name || source.role}`;
      rowHeader.dataset.playerId = source.id;
      rowHeader.textContent = source.name;
      row.appendChild(rowHeader);

      players.forEach((target, columnIndex) => {
        const isDiagonal = source.id === target.id;
        const cellData = cellByPair.get(`${source.id}>${target.id}`);
        const value = cellData?.values?.[selectedStyle];
        const count = numeric(value?.count);
        const cell = htmlEl('td', `team-pass-matrix__cell${isDiagonal ? ' team-pass-matrix__cell--diagonal' : ''}`);
        cell.dataset.source = source.id;
        cell.dataset.target = target.id;
        cell.dataset.style = selectedStyle;
        cell.style.setProperty('--i', String(rowIndex + columnIndex));

        if (isDiagonal) {
          cell.dataset.passMatrixDiagonal = 'true';
          cell.textContent = '—';
        } else if (count > 0) {
          const ratio = count / Math.max(maxCount, 1);
          const lines = [
            `${source.name} → ${target.name}`,
            `Estilo: ${styleLabel}`,
            `${Number(count).toLocaleString('es-MX')} pases completados`,
            `${format(value.passes_per90)} por 90 min compartidos`,
            `${format(cellData.shared_minutes)} minutos compartidos`,
          ];

          if (value.xt_total !== null && value.xt_total !== undefined) {
            lines.push(`xT: ${formatSigned(value.xt_total)} total`);
            lines.push(`xT: ${formatSigned(value.xt_per90)} por 90 min compartidos`);
          }

          cell.dataset.passMatrixCell = '';
          cell.dataset.count = String(count);
          cell.tabIndex = 0;
          cell.setAttribute('role', 'img');
          cell.setAttribute('aria-label', lines.join('. '));
          cell.style.background = matrixVolumeColor(count, maxCount, isDark);
          cell.style.color = ratio >= 0.42 ? '#ffffff' : (isDark ? '#f4f7f3' : '#162019');
          cell.textContent = Number(count).toLocaleString('es-MX');
          bindTooltip(root, cell, tooltip, lines);
        }

        row.appendChild(cell);
      });

      body.appendChild(row);
    });

    table.appendChild(body);
    if (maxLabel) maxLabel.textContent = `Máximo: ${Number(maxCount).toLocaleString('es-MX')}`;
    matrixRoot.dataset.rendered = 'true';

    if (matrixRoot.dataset.passMatrixBound !== 'true') {
      matrixRoot.dataset.passMatrixBound = 'true';
      const closeMenu = () => {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      };
      const openMenu = () => {
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
      };

      trigger.addEventListener('click', () => {
        if (menu.hidden) openMenu();
        else closeMenu();
      });
      options.forEach(option => option.addEventListener('click', () => {
        const picked = option.dataset.teamPassMatrixOption || defaultStyle;
        const changed = picked !== matrixRoot.dataset.selectedStyle;
        matrixRoot.dataset.selectedStyle = picked;
        closeMenu();
        const currentThemeIsDark = document.documentElement.getAttribute('data-theme') === 'dark';
        renderPassMatrix(root, readPayload(root), ensureTooltip(root), currentThemeIsDark, changed);
        trigger.focus();
      }));
      matrixRoot.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        closeMenu();
        trigger.focus();
      });
      matrixRoot.addEventListener('focusout', () => {
        setTimeout(() => {
          if (!matrixRoot.contains(document.activeElement)) closeMenu();
        }, 0);
      });
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function subtitleText(payload) {
    // One match (the match page) is drawn whole, a substitute in his slot.
    if (payload?.available && payload.scope === 'match') {
      return `Formación ${payload.formation ?? ''} · Todo el partido; cada cambio ocupa el lugar del jugador que sale.`;
    }

    return payload?.available
      ? `Formación ${payload.formation ?? ''} · Acciones previas a la primera sustitución, expulsión o cambio táctico.`
      : 'Circulación agregada desde pases abiertos de la formación más usada.';
  }

  function networkBodyHtml(payload) {
    if (!payload?.available) {
      if (payload?.loading) return '';

      return `<div class="team-empty">${escapeHtml(payload?.empty_message || 'No hay datos suficientes para construir la red de pases.')}</div>`;
    }

    let html = '<div class="team-pass-network-pitch">'
      + '<svg data-team-pass-network-svg role="img" aria-label="Red de pases del equipo"></svg>'
      + '</div>'
      + '<div class="team-snapshot">'
      + `<div class="team-snapshot__item"><span class="team-snapshot__label">Formación</span><span class="team-snapshot__value">${escapeHtml(payload.formation || '—')}</span></div>`
      + `<div class="team-snapshot__item"><span class="team-snapshot__label">Partidos analizados</span><span class="team-snapshot__value">${Number(payload.matches || 0).toLocaleString('es-MX')}</span></div>`
      + `<div class="team-snapshot__item"><span class="team-snapshot__label">Minutos analizados</span><span class="team-snapshot__value">${format(payload.analyzed_minutes)}</span></div>`
      + `<div class="team-snapshot__item"><span class="team-snapshot__label">Receptores identificados</span><span class="team-snapshot__value">${format(payload.recipient_coverage?.percent)}%</span></div>`
      + '</div>';

    if (payload.budget_truncated) {
      html += `<p class="team-formation-note">Muestra parcial: se analizaron los primeros ${Number(payload.matches || 0)} partidos por límite de tiempo.</p>`;
    }

    const edgeThreshold = format(numeric(payload.edge_threshold_per90 ?? 5), 0);
    html += '<div class="team-pass-network-legend" aria-label="Leyenda de la red de pases">'
      + '<div class="team-pass-network-legend__item"><span class="team-pass-network-legend__node" aria-hidden="true"></span><span>El tamaño del nodo representa participación por 90 minutos.</span></div>'
      + '<div class="team-pass-network-legend__item"><span class="team-pass-network-legend__line" aria-hidden="true"></span><span>El grosor indica pases completados por 90; la flecha muestra la dirección.</span></div>';

    html += payload.xt_available
      ? '<div class="team-pass-network-legend__item"><span class="team-pass-network-legend__threat" aria-hidden="true"></span><span>El color representa xT por 90: naranja es negativo, gris es cercano a cero y verde azulado es positivo.</span></div>'
        + `<div>Se muestran conexiones con al menos ${edgeThreshold} pases por 90 minutos y hasta tres conexiones adicionales por amenaza generada.</div>`
      : `<div>El color representa volumen de pases. Se muestran conexiones con al menos ${edgeThreshold} pases por 90 minutos.</div>`;

    html += '</div>';

    return html;
  }

  function matrixBodyHtml(payload) {
    const matrix = payload?.pass_matrix;

    if (!matrix?.available) {
      if (payload?.loading) return '';

      return `<p class="team-pass-matrix__empty">${escapeHtml(matrix?.empty_message || 'No hay suficientes pases con receptor identificado para construir la matriz.')}</p>`;
    }

    const styles = Array.isArray(matrix.styles) ? matrix.styles : [];
    const defaultStyle = styles.some(style => style.key === matrix.default_style) ? matrix.default_style : 'all';
    const selectedStyleData = styles.find(style => style.key === defaultStyle);
    const styleLabel = selectedStyleData?.label || 'Todos';
    const optionsHtml = styles.map(style => {
      const selected = style.key === defaultStyle;

      return `<li role="presentation"><button type="button" class="sk-menu-item${selected ? ' selected' : ''}" data-team-pass-matrix-option="${escapeHtml(style.key)}" role="option" aria-selected="${selected ? 'true' : 'false'}">${escapeHtml(style.label)} (${Number(style.pass_count || 0).toLocaleString('es-MX')})</button></li>`;
    }).join('');

    return '<section class="team-pass-matrix" data-team-pass-matrix>'
      + '<div class="sk-detail-control team-pass-matrix__filter">'
      + '<p class="sk-select-label">Estilo de pase</p>'
      + '<div class="sk-field-dropdown sk-pill-dropdown" data-sk-pill-dropdown data-team-pass-matrix-dropdown>'
      + '<button type="button" class="btn sk-pill-control rounded-pill team-pass-matrix__trigger" data-team-pass-matrix-trigger aria-haspopup="listbox" aria-expanded="false">'
      + `<span class="sk-pill-dropdown__label" data-team-pass-matrix-trigger-label>${escapeHtml(styleLabel)} (${Number(selectedStyleData?.pass_count || 0).toLocaleString('es-MX')})</span>`
      + '<i class="bi bi-chevron-down ms-1" aria-hidden="true"></i>'
      + '</button>'
      + `<ul class="sk-dropdown-menu" data-team-pass-matrix-menu role="listbox" hidden>${optionsHtml}</ul>`
      + '</div>'
      + '</div>'
      + '<div class="team-pass-matrix__scroll" data-team-pass-matrix-scroll tabindex="0" aria-label="Matriz desplazable de pases entre jugadores">'
      + '<table class="team-pass-matrix__table" data-team-pass-matrix-table aria-label="Pases dirigidos entre jugadores"></table>'
      + '</div>'
      + '<div class="team-pass-matrix__legend" aria-label="Escala de volumen de la matriz">'
      + '<span>Menos</span><span class="team-pass-matrix__gradient" aria-hidden="true"></span><span>Más</span>'
      + '<span data-team-pass-matrix-max></span>'
      + '</div>'
      + '<p class="team-pass-matrix__note">Incluye únicamente pases con receptor identificado. El color representa el volumen del estilo seleccionado.</p>'
      + '</section>';
  }

  /*
    The matches a map filter picks, as the team page compares them (Fase 4):
    the ticked ones, sorted, or the competition. The event, chart and side
    are the map's own and leave the network as it is.
  */
  function matchSelection(filters) {
    if (filters?.scope === 'competition') return { scope: 'competition', tournamentKey: filters.tournamentKey || null };

    const ids = Array.isArray(filters?.matchIds) ? filters.matchIds : (filters?.matchId ? [filters.matchId] : []);
    return { scope: 'match', matchIds: ids.map(String).sort() };
  }

  /*
    A root that follows a map (data-pass-network-map, the team page) sends
    the map's selection, a new one replacing a request still out (its
    answer is dropped by its id); none sent asks for the map's default, the
    latest match. The match page's root sends the request id alone.
  */
  function requestPassNetwork(root, selection = null) {
    const follows = Boolean(root.dataset.passNetworkMap);
    if (root.dataset.passNetworkState === 'pending' && !(follows && selection)) return;

    const wireRoot = root.closest('[wire\\:id]');
    const wireId = wireRoot?.getAttribute('wire:id');
    const component = wireId && window.Livewire ? window.Livewire.find(wireId) : null;

    if (!component) return;

    const requestId = `pass-network-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    root.dataset.passNetworkState = 'pending';
    root.dataset.passNetworkRequestId = requestId;

    if (!follows) {
      Promise.resolve(component.call('loadTeamPassNetwork', requestId)).catch(() => {
        root.dataset.passNetworkState = 'idle';
      });
      return;
    }

    if (selection) root.dataset.passNetworkSelection = JSON.stringify(selection);
    root.querySelector('[data-team-pass-network-loading]')?.classList.add('stats-loading-overlay--show');
    Promise.resolve(component.call('loadTeamPassNetwork', selection || {}, requestId)).catch(() => {
      if (root.dataset.passNetworkRequestId === requestId) root.dataset.passNetworkState = 'idle';
    });
  }

  document.addEventListener('sk-event-map-filters', event => {
    const { instanceId, filters } = event.detail || {};
    if (!instanceId) return;

    const selection = matchSelection(filters);
    const signature = JSON.stringify(selection);
    document.querySelectorAll('[data-team-pass-network][data-pass-network-map]').forEach(root => {
      if (root.dataset.passNetworkMap !== instanceId || root.dataset.passNetworkSelection === signature) return;
      requestPassNetwork(root, selection);
    });
  });

  function applyPassNetworkResult(root, rootIndex, passNetwork) {
    const subtitle = root.querySelector('[data-team-pass-network-subtitle]');
    const networkBody = root.querySelector('[data-team-pass-network-body]');
    const matrixBody = root.querySelector('[data-team-pass-matrix-body]');
    const overlay = root.querySelector('[data-team-pass-network-loading]');
    const payloadScript = root.querySelector('[data-team-pass-network-payload]');

    if (subtitle) subtitle.textContent = subtitleText(passNetwork);
    // One match is drawn whole, whatever its formation; more are read in their most-used one.
    const title = root.querySelector('[data-team-pass-network-title]');
    if (title) title.textContent = passNetwork?.scope === 'match' ? 'Red de pases' : 'Red de pases en formación más utilizada';
    if (passNetwork?.selection) root.dataset.passNetworkSelection = JSON.stringify(passNetwork.selection);
    if (networkBody) networkBody.innerHTML = networkBodyHtml(passNetwork);
    if (matrixBody) matrixBody.innerHTML = matrixBodyHtml(passNetwork);
    if (overlay) overlay.classList.remove('stats-loading-overlay--show');
    if (payloadScript) payloadScript.textContent = JSON.stringify(passNetwork);

    root.dataset.passNetworkState = 'done';
    root.dataset.passNetworkRendered = '';

    if (passNetwork?.available) {
      renderRoot(root, rootIndex, passNetwork);
    } else if (passNetwork?.pass_matrix?.available) {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      renderPassMatrix(root, passNetwork, ensureTooltip(root), isDark);
    }
  }

  window.addEventListener('team-pass-network-data-updated', event => {
    const { passNetwork, requestId } = event.detail || {};

    document.querySelectorAll('[data-team-pass-network]').forEach((root, index) => {
      if (root.dataset.passNetworkRequestId !== String(requestId)) return;

      applyPassNetworkResult(root, index, passNetwork || {});
    });
  });

  function renderRoot(root, rootIndex, payloadOverride) {
    const svg = root.querySelector('[data-team-pass-network-svg]');
    const payload = payloadOverride || readPayload(root);

    if (payload?.loading === true) {
      requestPassNetwork(root);

      return;
    }

    if (!svg || !payload?.available) return;

    const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
    const edges = Array.isArray(payload.edges) ? payload.edges : [];

    if (nodes.length < 2 || edges.length === 0) return;

    clear(svg);

    const width = 440;
    const height = 620;
    const markerId = `team-pass-network-arrow-${rootIndex}`;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const colors = {
      pitch: isDark ? 'rgba(255,255,255,.018)' : 'rgba(20,88,52,.025)',
      line: isDark ? 'rgba(255,255,255,.29)' : 'rgba(13,52,31,.27)',
      muted: isDark ? 'rgba(244,247,243,.62)' : 'rgba(22,32,25,.60)',
      text: isDark ? '#f4f7f3' : '#162019',
      nodeStroke: isDark ? '#f4f7f3' : '#ffffff',
      attack: isDark ? '#9fcf82' : '#2d7a22',
    };
    const tooltip = ensureTooltip(root);
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const maxInvolvement = Math.max(...nodes.map(node => numeric(node.involvement_per90 || node.touches)), 1);
    const maxEdge = Math.max(...edges.map(edge => numeric(edge.passes_per90 || edge.count)), 1);
    const xtAvailable = payload.xt_available === true;
    const nodeThreatDomain = Math.max(0.05, ...nodes.map(node => Math.abs(numeric(node.xt_per90))));
    const edgeThreatDomain = Math.max(0.05, ...edges.map(edge => Math.abs(numeric(edge.xt_per90))));
    const positions = new Map();
    const radii = new Map();
    const edgeKeys = new Set(edges.map(edge => `${edge.source}>${edge.target}`));

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.dataset.rendered = 'true';
    // Its entrance only on the root's first drawing: a live refresh or a theme change redraws in place.
    svg.classList.toggle('team-pass-network--enter', root.dataset.passNetworkAnimated !== 'true');
    root.dataset.passNetworkAnimated = 'true';

    const defs = svgEl('defs');
    const marker = svgEl('marker', {
      id: markerId,
      viewBox: '0 0 10 10',
      refX: 9,
      refY: 5,
      markerWidth: 10,
      markerHeight: 10,
      markerUnits: 'userSpaceOnUse',
      orient: 'auto-start-reverse',
    });
    marker.appendChild(svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'context-stroke' }));
    defs.appendChild(marker);
    svg.appendChild(defs);
    drawPitch(svg, width, height, colors, markerId);

    nodes.forEach(node => {
      const involvement = numeric(node.involvement_per90 || node.touches);
      const ratio = involvement / maxInvolvement;
      positions.set(node.id, pointFor(node, width, height));
      radii.set(node.id, 12 + (Math.sqrt(ratio) * 12));
    });

    edges.forEach((edge, edgeIndex) => {
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      if (!sourceNode || !targetNode || !source || !target) return;

      const passesPer90 = numeric(edge.passes_per90 || edge.count);
      const ratio = passesPer90 / maxEdge;
      const xtPer90 = numeric(edge.xt_per90);
      const reciprocal = edgeKeys.has(`${edge.target}>${edge.source}`);
      const ariaMetrics = xtAvailable
        ? `${format(passesPer90)} pases y ${formatSigned(xtPer90)} xT por 90 minutos`
        : `${format(passesPer90)} pases por 90 minutos`;
      const group = svgEl('g', {
        tabindex: 0,
        role: 'img',
        'aria-label': `${sourceNode.role || sourceNode.label} a ${targetNode.role || targetNode.label}: ${ariaMetrics}`,
        'data-pass-network-edge': '',
        'data-source': edge.source,
        'data-target': edge.target,
        'data-passes-per90': passesPer90,
        'data-xt-per90': xtAvailable ? xtPer90 : '',
        'data-display-reasons': Array.isArray(edge.display_reasons) ? edge.display_reasons.join(',') : '',
        'data-reciprocal': reciprocal ? 'true' : 'false',
        style: `--i: ${edgeIndex}`,
      });
      const path = svgEl('path', {
        // A length of 1 whatever the curve, so the entrance can draw every line with one dash.
        pathLength: 1,
        d: pathFor(source, target, radii.get(edge.source), radii.get(edge.target), reciprocal),
        fill: 'none',
        stroke: xtAvailable ? threatColor(xtPer90, edgeThreatDomain, isDark) : volumeColor(ratio, isDark),
        'stroke-width': 1.5 + (ratio * 6.5),
        'stroke-opacity': 0.36 + (ratio * 0.58),
        'stroke-linecap': 'round',
        'marker-end': `url(#${markerId})`,
        'data-pass-network-edge-path': '',
      });
      const lines = [
        `${sourceNode.role || sourceNode.label} → ${targetNode.role || targetNode.label}`,
        `${Number(edge.count || 0).toLocaleString('es-MX')} pases completados`,
        `${format(passesPer90)} pases por 90 min`,
      ];
      if (xtAvailable) {
        lines.push(`xT: ${formatSigned(edge.xt_total)} total`);
        lines.push(`xT: ${formatSigned(xtPer90)} por 90 min`);
      }

      group.appendChild(path);
      bindTooltip(root, group, tooltip, lines);
      svg.appendChild(group);
    });

    nodes.forEach((node, nodeIndex) => {
      const point = positions.get(node.id);
      const radius = radii.get(node.id);
      const involvement = numeric(node.involvement_per90 || node.touches);
      const ratio = involvement / maxInvolvement;
      const xtPer90 = numeric(node.xt_per90);
      const ariaMetrics = xtAvailable
        ? `${format(involvement)} intervenciones y ${formatSigned(xtPer90)} xT por 90 minutos`
        : `${format(involvement)} intervenciones por 90 minutos`;
      const group = svgEl('g', {
        tabindex: 0,
        role: 'img',
        'aria-label': `${node.role || node.label}: ${ariaMetrics}`,
        'data-pass-network-node': '',
        'data-node-id': node.id,
        'data-role': node.role || node.label || '',
        'data-involvement-per90': involvement,
        'data-xt-per90': xtAvailable ? xtPer90 : '',
        style: `--i: ${nodeIndex}`,
      });
      const nodeFill = xtAvailable ? threatColor(xtPer90, nodeThreatDomain, isDark) : volumeColor(0.34 + (ratio * 0.66), isDark);
      group.appendChild(svgEl('circle', {
        cx: point.x,
        cy: point.y,
        r: radius,
        fill: nodeFill,
        stroke: colors.nodeStroke,
        'stroke-width': 2,
      }));

      /*
        One match (the match page) gives each node its player's face: the
        photo inside a ring in the node's colour, his name under it. The team
        page's nodes are a slot over many matches and keep the acronym.
      */
      if (node.photo) {
        const clipId = `team-pass-network-face-${rootIndex}-${String(node.id).replace(/[^\w-]/g, '')}`;
        const clip = svgEl('clipPath', { id: clipId });
        clip.appendChild(svgEl('circle', { cx: point.x, cy: point.y, r: Math.max(radius - 3, 6) }));
        defs.appendChild(clip);
        group.appendChild(svgEl('circle', { cx: point.x, cy: point.y, r: Math.max(radius - 3, 6), fill: isDark ? '#1b2a21' : '#eef3ec', 'pointer-events': 'none' }));
        const face = svgEl('image', {
          href: node.photo,
          x: point.x - radius,
          y: point.y - radius,
          width: radius * 2,
          height: radius * 2,
          preserveAspectRatio: 'xMidYMin slice',
          'clip-path': `url(#${clipId})`,
          'pointer-events': 'none',
        });
        face.addEventListener('error', () => face.remove());
        group.appendChild(face);

        const name = svgEl('text', {
          x: point.x,
          y: point.y + radius + 11,
          'text-anchor': 'middle',
          fill: colors.text,
          stroke: isDark ? '#0d1712' : '#ffffff',
          'stroke-width': 3,
          'paint-order': 'stroke',
          'font-size': 9,
          'font-weight': 800,
          'pointer-events': 'none',
        });
        name.textContent = shortName(node.player_name || '');
        group.appendChild(name);
      }

      const label = svgEl('text', {
        x: point.x,
        y: point.y + 3,
        'text-anchor': 'middle',
        fill: '#ffffff',
        'font-size': String((node.role || node.label || '').length > 4 ? 8 : 9),
        'font-weight': 800,
        'pointer-events': 'none',
      });
      label.textContent = node.role || node.label || '';
      if (!node.photo) group.appendChild(label);

      // The node shows the Spanish acronym; its tooltip opens with the full name.
      const lines = [
        node.role_name ? `${node.role || node.label} · ${node.role_name}` : (node.role || node.label || 'Posición'),
        `Jugadores: ${playerSummary(node)}`,
        `Pases: ${format(node.passes_per90)} por 90 min`,
        `Recepciones: ${format(node.receptions_per90)} por 90 min`,
        `Participación: ${format(node.involvement_per90)} por 90 min`,
      ];
      if (xtAvailable) {
        lines.push(`xT enviado: ${formatSigned(node.xt_total)} total`);
        lines.push(`xT enviado: ${formatSigned(xtPer90)} por 90 min`);
      }
      bindTooltip(root, group, tooltip, lines);
      svg.appendChild(group);
    });

    renderPassMatrix(root, payload, tooltip, isDark);

    root.dataset.passNetworkRendered = 'true';
  }

  /*
    The matrix for the download menu (chart-download.js, source
    "pass-matrix"), drawn from the table on show: the style picked, every
    row and column however far the table scrolls, each cell in its colours
    on screen, the receivers' names turned upwards as their headers are, and
    the volume scale under it. Painting the table as HTML would lay those
    names flat and crop it to its scroll box.
  */
  const MATRIX_EXPORT = { pad: 8, rowHead: 132, head: 112, cell: 30, gap: 1, legend: 34 };

  function fitText(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
    return `${cut}…`;
  }

  function matrixExportSource(button) {
    const card = button.closest('[data-pass-network-card="matrix"]');
    const matrixRoot = card?.querySelector('[data-team-pass-matrix]');
    const table = matrixRoot?.querySelector('[data-team-pass-matrix-table]');
    const columns = [...(table?.tHead?.rows[0]?.cells || [])].slice(1);
    const rows = [...(table?.tBodies[0]?.rows || [])];
    if (!columns.length || !rows.length) return null;

    const { pad, rowHead, head, cell, gap, legend } = MATRIX_EXPORT;
    const step = cell + gap;
    const width = pad * 2 + rowHead + columns.length * step;
    const height = pad * 2 + head + rows.length * step + legend;
    const styleLabel = (matrixRoot.querySelector('[data-team-pass-matrix-trigger-label]')?.textContent || '').trim();
    const maxLabel = (matrixRoot.querySelector('[data-team-pass-matrix-max]')?.textContent || '').trim();
    const maxCount = Math.max(0, ...[...table.querySelectorAll('[data-count]')].map(el => numeric(el.dataset.count)));

    return {
      width,
      height,
      nativeScale: Math.max(2, window.devicePixelRatio || 1),
      name: `matriz-pases-equipo ${styleLabel.replace(/\s*\(.*\)$/, '')}`,
      render(scale) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
        const ink = css('--text') || '#101511';
        const secondary = css('--text-secondary') || ink;
        const muted = css('--text-muted') || secondary;
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        ctx.fillStyle = css('--chart-surface') || '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.textBaseline = 'middle';

        const top = pad + head;
        const left = pad + rowHead;

        // The corner: who receives across, who passes down.
        ctx.font = `700 10.5px ${font}`;
        ctx.fillStyle = secondary;
        ctx.textAlign = 'left';
        ctx.fillText('Recibe →', pad + 4, top - 26);
        ctx.fillStyle = muted;
        ctx.textAlign = 'right';
        ctx.fillText('Pasa ↓', left - 8, top - 10);

        // The receivers, read upwards from the grid.
        ctx.font = `700 10.5px ${font}`;
        ctx.fillStyle = secondary;
        ctx.textAlign = 'left';
        columns.forEach((th, index) => {
          ctx.save();
          ctx.translate(left + index * step + cell / 2, top - 6);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(fitText(ctx, th.textContent.trim(), head - 12), 0, 0);
          ctx.restore();
        });

        rows.forEach((tr, rowIndex) => {
          const y = top + rowIndex * step;
          const [rowHeader, ...cells] = [...tr.cells];

          ctx.font = `700 10.5px ${font}`;
          ctx.fillStyle = secondary;
          ctx.textAlign = 'left';
          ctx.fillText(fitText(ctx, rowHeader.textContent.trim(), rowHead - 12), pad + 4, y + cell / 2);

          cells.forEach((td, columnIndex) => {
            const x = left + columnIndex * step;
            const style = getComputedStyle(td);
            ctx.fillStyle = style.backgroundColor;
            ctx.beginPath();
            ctx.roundRect(x, y, cell, cell, 2);
            ctx.fill();

            const text = td.textContent.trim();
            if (!text) return;
            ctx.font = `800 10px ${font}`;
            ctx.fillStyle = style.color;
            ctx.textAlign = 'center';
            ctx.fillText(text, x + cell / 2, y + cell / 2 + 0.5);
          });
        });

        // The scale, as under the table: the style, then less to more and the most.
        const legendY = top + rows.length * step + legend / 2 + 2;
        ctx.font = `600 10.5px ${font}`;
        ctx.textAlign = 'left';
        let x = pad + 4;
        if (styleLabel) {
          ctx.fillStyle = secondary;
          const style = `Estilo: ${styleLabel}`;
          ctx.fillText(style, x, legendY);
          x += ctx.measureText(style).width + 16;
        }
        ctx.fillStyle = muted;
        ctx.fillText('Menos', x, legendY);
        x += ctx.measureText('Menos').width + 6;
        const ramp = ctx.createLinearGradient(x, 0, x + 120, 0);
        ramp.addColorStop(0, matrixVolumeColor(0, maxCount, isDark));
        ramp.addColorStop(1, matrixVolumeColor(maxCount, maxCount, isDark));
        ctx.fillStyle = ramp;
        ctx.beginPath();
        ctx.roundRect(x, legendY - 4, 120, 8, 2);
        ctx.fill();
        x += 126;
        ctx.fillStyle = muted;
        ctx.fillText('Más', x, legendY);
        x += ctx.measureText('Más').width + 12;
        if (maxLabel) ctx.fillText(maxLabel, x, legendY);

        return canvas;
      },
    };
  }

  (window.SkChartDownloadSources = window.SkChartDownloadSources || {})['pass-matrix'] = matrixExportSource;

  window.StatiskicksTeamPassNetwork = {
    boot() {
      document.querySelectorAll('[data-team-pass-network]').forEach((root, index) => renderRoot(root, index));
    },
    /*
      Asks for the network again and redraws it when the answer lands, the
      drawing kept in place meanwhile: the match page calls it on each live
      refresh. A root still on its first load is left to finish it.
    */
    refresh(root) {
      if (!root || root.dataset.passNetworkState !== 'done') return;

      root.dataset.passNetworkState = 'idle';
      requestPassNetwork(root);
    },
  };
})();
