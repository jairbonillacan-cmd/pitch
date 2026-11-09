(function () {
  const LABEL_FONT = '700 11px Inter, sans-serif';
  const LABEL_HEIGHT = 14;
  const LABEL_PADDING = 2;
  const POINT_SEPARATION = 14;
  const BAND_LABEL_SIZE = 12;
  const BAND_LABEL_MIN_SIZE = 8;

  function pointRadius(point) {
    return Math.max(4, Math.min(8, 4 + Number(point?.player?.minutes_share || 0) / 20));
  }

  function boxesOverlap(first, second) {
    return first.left < second.right
      && first.right > second.left
      && first.top < second.bottom
      && first.bottom > second.top;
  }

  function labelBox(x, y, width) {
    return {
      left: x - (width / 2) - LABEL_PADDING,
      right: x + (width / 2) + LABEL_PADDING,
      top: y - (LABEL_HEIGHT / 2) - LABEL_PADDING,
      bottom: y + (LABEL_HEIGHT / 2) + LABEL_PADDING,
    };
  }

  function insideChart(box, chartArea) {
    return box.left >= chartArea.left + 2
      && box.right <= chartArea.right - 2
      && box.top >= chartArea.top + 2
      && box.bottom <= chartArea.bottom - 2;
  }

  function overlapArea(box, occupied) {
    return occupied.reduce((total, other) => {
      const width = Math.max(0, Math.min(box.right, other.right) - Math.max(box.left, other.left));
      const height = Math.max(0, Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top));
      return total + (width * height);
    }, 0);
  }

  function placementCandidates(anchor, width, chartArea, share) {
    const radius = anchor.radius;
    const gap = 7;
    const sideDistance = radius + gap + (width / 2);
    const verticalDistance = radius + gap + (LABEL_HEIGHT / 2);
    const candidates = [];
    const seen = new Set();

    const add = (x, y) => {
      const clampedX = Math.max(
        chartArea.left + (width / 2) + LABEL_PADDING + 2,
        Math.min(chartArea.right - (width / 2) - LABEL_PADDING - 2, x)
      );
      const key = `${Math.round(clampedX)}|${Math.round(y)}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ x: clampedX, y });
    };

    const addVerticalLanes = (direction, levels = 12) => {
      for (let level = 0; level < levels; level += 1) {
        const distance = verticalDistance + (level * (LABEL_HEIGHT + 5));
        const y = anchor.y + (direction * distance);
        add(anchor.x, y);
        add(anchor.x - sideDistance, y);
        add(anchor.x + sideDistance, y);
      }
    };

    if (share <= 4) {
      addVerticalLanes(-1);
      addVerticalLanes(1, 3);
    } else if (share >= 96) {
      addVerticalLanes(1, 5);
      addVerticalLanes(-1, 5);
    } else {
      add(anchor.x, anchor.y - verticalDistance);
      add(anchor.x - sideDistance, anchor.y);
      add(anchor.x + sideDistance, anchor.y);
      add(anchor.x, anchor.y + verticalDistance);
      addVerticalLanes(-1, 6);
      addVerticalLanes(1, 6);
    }

    return candidates;
  }

  function distributeDuplicatePoints(points) {
    const groups = new Map();

    points.forEach(point => {
      const key = `${point.x}|${Number(point.y).toFixed(1)}`;
      const group = groups.get(key) || [];
      group.push(point);
      groups.set(key, group);
    });

    groups.forEach(group => {
      group
        .slice()
        .sort((first, second) => String(first.player?.name || '').localeCompare(String(second.player?.name || ''), 'es'))
        .forEach((point, index) => {
          point.pointXOffset = (index - ((group.length - 1) / 2)) * POINT_SEPARATION;
          point.collisionCount = group.length;
        });
    });
  }

  function layoutLabels(chart, points) {
    const { chartArea, ctx, scales } = chart;
    if (!chartArea || !scales?.x || !scales?.y) return;

    const anchors = points.map(point => ({
      x: scales.x.getPixelForValue(point.x) + Number(point.pointXOffset || 0),
      y: scales.y.getPixelForValue(point.y),
      radius: pointRadius(point) + 2,
    }));
    const pointBoxes = anchors.map((anchor, index) => {
      const radius = anchor.radius + 2;
      return {
        index,
        left: anchor.x - radius,
        right: anchor.x + radius,
        top: anchor.y - radius,
        bottom: anchor.y + radius,
      };
    });
    const occupied = [];
    const placements = [];
    const order = points.map((point, index) => ({ point, index }))
      .sort((first, second) => first.point.y - second.point.y
        || first.point.x - second.point.x
        || String(first.point.player?.name || '').localeCompare(String(second.point.player?.name || ''), 'es'));

    ctx.save();
    ctx.font = LABEL_FONT;

    order.forEach(({ point, index }) => {
      const width = Math.ceil(ctx.measureText(point.player?.name || '').width);
      const anchor = anchors[index];
      const candidates = placementCandidates(anchor, width, chartArea, Number(point.player?.minutes_share || 0));
      const obstacles = occupied.concat(pointBoxes.filter(box => box.index !== index));
      const available = candidates.filter(candidate => insideChart(labelBox(candidate.x, candidate.y, width), chartArea));
      let chosen = available.find(candidate => {
        const box = labelBox(candidate.x, candidate.y, width);
        return obstacles.every(other => !boxesOverlap(box, other));
      });

      if (!chosen) {
        chosen = available
          .map(candidate => ({ candidate, score: overlapArea(labelBox(candidate.x, candidate.y, width), obstacles) }))
          .sort((first, second) => first.score - second.score)[0]?.candidate;
      }

      chosen ||= { x: anchor.x, y: anchor.y - anchor.radius - 12 };
      const box = labelBox(chosen.x, chosen.y, width);
      const distance = Math.hypot(chosen.x - anchor.x, chosen.y - anchor.y);

      point.labelPlacement = {
        xAdjust: chosen.x - anchor.x,
        yAdjust: chosen.y - anchor.y,
        leader: distance > anchor.radius + 18,
        labelX: chosen.x,
        labelY: chosen.y,
        pointX: anchor.x,
        pointY: anchor.y,
        radius: anchor.radius,
      };
      occupied.push(box);
      placements.push({
        player: point.player?.name || '',
        dataIndex: index,
        ...box,
      });
    });

    ctx.restore();
    chart.$ageProfileLabelBoxes = placements;
  }

  function positionPoints(chart, points) {
    const elements = chart.getDatasetMeta(0)?.data || [];
    const { scales } = chart;
    if (!scales?.x || !scales?.y) return;

    elements.forEach((element, index) => {
      const point = points[index];
      element.x = scales.x.getPixelForValue(point.x) + Number(point.pointXOffset || 0);
      element.y = scales.y.getPixelForValue(point.y);
    });
  }

  class TeamAgeProfile {
    constructor(root) {
      this.root = root;
      this.chart = null;
      this.payload = this.readPayload();
    }

    readPayload() {
      const source = this.root.querySelector('[data-team-age-profile-payload]');
      if (!source) return {};

      try {
        return JSON.parse(source.textContent || '{}');
      } catch (error) {
        return {};
      }
    }

    render() {
      const canvas = this.root.querySelector('[data-team-age-profile-canvas]');
      const players = Array.isArray(this.payload?.players) ? this.payload.players : [];

      if (!canvas || typeof window.Chart === 'undefined' || players.length === 0) {
        this.destroy();
        return;
      }

      this.destroy();

      const styles = getComputedStyle(document.documentElement);
      const readVar = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
      /*
        Chart ink comes from the --chart-* set rather than from --text and
        --border-light. Those are page tokens: --border-light in particular is a
        hairline meant to sit under a card edge, which as a gridline on white is
        barely there, and --accent is the pistachio fill, not an ink.
      */
      const series = readVar('--chart-series', '#2C7A55');
      const seriesFill = readVar('--chart-series-fill', 'rgba(33,110,78,0.16)');
      const text = readVar('--chart-label', '#141A15');
      const muted = readVar('--chart-tick', '#55625A');
      const border = readVar('--chart-grid', 'rgba(16,21,17,0.14)');
      const surface = readVar('--chart-surface', '#ffffff');
      const leader = readVar('--chart-outline', 'rgba(16,21,17,0.26)');
      const reference = this.payload?.reference || {};
      const primeMin = Number(reference.prime_min || 24);
      const primeMax = Number(reference.prime_max || 29);

      const points = players.map(player => ({
        x: Number(player.age),
        y: Number(player.minutes_share),
        player,
      })).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
      distributeDuplicatePoints(points);

      const ages = points.map(point => point.x);
      const minAge = Math.max(15, Math.floor(Math.min(...ages, primeMin) - 1));
      const maxAge = Math.min(45, Math.ceil(Math.max(...ages, primeMax) + 1));

      const backgroundPlugin = {
        id: 'teamAgeProfileBackground',
        beforeDatasetsDraw(chart) {
          const { ctx, chartArea, scales } = chart;
          if (!chartArea || !scales?.x || !scales?.y) return;

          const primeLeft = scales.x.getPixelForValue(primeMin);
          const primeRight = scales.x.getPixelForValue(primeMax);
          // Over its band, above the plot (owner, 7 Nov): inside it the words
          // ran under the players. A narrow band takes a smaller size, never
          // a word cut short or run into the next band's.
          const drawBandLabel = (label, left, right) => {
            const clampedLeft = Math.max(chartArea.left, left);
            const clampedRight = Math.min(chartArea.right, right);
            const room = clampedRight - clampedLeft - 6;

            ctx.save();
            ctx.fillStyle = muted;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';

            for (let size = BAND_LABEL_SIZE; size >= BAND_LABEL_MIN_SIZE; size -= 1) {
              ctx.font = `700 ${size}px Inter, sans-serif`;

              if (ctx.measureText(label).width <= room) {
                ctx.fillText(label, (clampedLeft + clampedRight) / 2, chartArea.top - 5);
                break;
              }
            }

            ctx.restore();
          };

          ctx.save();
          ctx.fillStyle = seriesFill;
          ctx.fillRect(Math.max(chartArea.left, primeLeft), chartArea.top, Math.min(chartArea.right, primeRight) - Math.max(chartArea.left, primeLeft), chartArea.bottom - chartArea.top);
          drawBandLabel('JÓVENES', chartArea.left, primeLeft);
          drawBandLabel('EN APOGEO', primeLeft, primeRight);
          drawBandLabel('EXPERIMENTADOS', primeRight, chartArea.right);

          [50, 75].forEach(value => {
            const y = scales.y.getPixelForValue(value);
            ctx.strokeStyle = value === 75 ? 'rgba(255, 170, 96, 0.65)' : 'rgba(178, 217, 139, 0.55)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(chartArea.left, y);
            ctx.lineTo(chartArea.right, y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = muted;
            ctx.font = '600 11px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${value}% minutos`, chartArea.right - 6, y - 6);
          });

          ctx.restore();
        },
      };

      const collisionPlugin = {
        id: 'teamAgeProfileCollisions',
        afterLayout(chart) {
          layoutLabels(chart, points);
        },
        beforeDatasetsDraw(chart) {
          positionPoints(chart, points);
        },
        afterDatasetsDraw(chart) {
          const { ctx } = chart;

          ctx.save();
          ctx.strokeStyle = leader;
          ctx.lineWidth = 1;

          points.forEach(point => {
            const placement = point.labelPlacement;
            if (!placement?.leader) return;

            const dx = placement.labelX - placement.pointX;
            const dy = placement.labelY - placement.pointY;
            const distance = Math.max(Math.hypot(dx, dy), 1);
            const startX = placement.pointX + ((dx / distance) * (placement.radius + 2));
            const startY = placement.pointY + ((dy / distance) * (placement.radius + 2));
            const endX = placement.labelX - ((dx / distance) * 5);
            const endY = placement.labelY - ((dy / distance) * 5);

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
          });

          ctx.fillStyle = text;
          ctx.font = LABEL_FONT;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          points.forEach(point => {
            const placement = point.labelPlacement;
            if (!placement) return;
            ctx.fillText(point.player?.name || '', placement.labelX, placement.labelY);
          });

          ctx.restore();
        },
      };

      const plugins = [backgroundPlugin, collisionPlugin];

      this.chart = new window.Chart(canvas.getContext('2d'), {
        type: 'scatter',
        data: {
          datasets: [{
            label: 'Jugadores',
            data: points,
            parsing: false,
            borderColor: series,
            backgroundColor: series,
            pointBorderColor: surface,
            pointBorderWidth: 2,
            pointRadius: context => pointRadius(context.raw),
            pointHoverRadius: 8,
            clip: false,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 180 },
          // The top is the age bands' names (drawBandLabel()). The players'
          // labels keep inside the plot (insideChart()), where the axis'
          // 100–110% leaves those over the top players room.
          layout: {
            padding: { top: 24, right: 72, bottom: 8, left: 8 },
          },
          scales: {
            x: {
              min: minAge,
              max: maxAge,
              title: { display: true, text: 'Edad', color: text, font: { weight: '700' } },
              grid: { color: border },
              ticks: { color: muted, precision: 0 },
            },
            y: {
              min: -5,
              max: 110,
              title: { display: true, text: '% de minutos jugados', color: text, font: { weight: '700' } },
              grid: {
                color: context => Number(context.tick?.value) < 0 ? 'rgba(0,0,0,0)' : border,
                lineWidth: context => Number(context.tick?.value) < 0 ? 0 : 1,
              },
              ticks: {
                color: muted,
                callback: value => Number(value) < 0 || Number(value) > 100 ? '' : `${value}%`,
              },
            },
          },
          plugins: {
            legend: { display: false },
            datalabels: { display: false },
            tooltip: {
              callbacks: {
                label(item) {
                  const player = item.raw?.player || {};
                  return [
                    player.name || 'Jugador',
                    `Edad: ${player.age}`,
                    `Minutos: ${Number(player.minutes || 0).toLocaleString('es-MX')}`,
                    `% minutos: ${Number(player.minutes_share || 0).toFixed(1)}%`,
                  ];
                },
              },
            },
          },
        },
        plugins,
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

  window.StatiskicksTeamAgeProfile = {
    boot() {
      document.querySelectorAll('[data-team-age-profile]').forEach(root => {
        let instance = instances.get(root);
        if (!instance) {
          instance = new TeamAgeProfile(root);
          instances.set(root, instance);
        }

        instance.render();
      });
    },
  };
})();
