import React, { useEffect, useRef } from 'react';

function getRgbChannels(color) {
    const hex = String(color).trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
    if (hex) {
        const value = hex[1].length === 3
            ? hex[1].split('').map((channel) => channel + channel).join('')
            : hex[1];
        return [
            parseInt(value.slice(0, 2), 16),
            parseInt(value.slice(2, 4), 16),
            parseInt(value.slice(4, 6), 16)
        ];
    }

    const channels = String(color).match(/\d+(?:\.\d+)?/g);
    if (!channels || channels.length < 3) return null;

    const rgb = channels.slice(0, 3).map(Number);
    return rgb.every(Number.isFinite) ? rgb : null;
}

// Same monotone spline calculation used by Liveline.
function drawSpline(ctx, points) {
    if (points.length < 2) return;
    if (points.length === 2) {
        ctx.lineTo(points[1][0], points[1][1]);
        return;
    }

    const n = points.length;
    const h = new Array(n - 1);
    const delta = new Array(n - 1);

    for (let i = 0; i < n - 1; i++) {
        h[i] = points[i + 1][0] - points[i][0];
        delta[i] = h[i] === 0
            ? 0
            : (points[i + 1][1] - points[i][1]) / h[i];
    }

    const m = new Array(n);
    m[0] = delta[0];
    m[n - 1] = delta[n - 2];

    for (let i = 1; i < n - 1; i++) {
        m[i] = delta[i - 1] * delta[i] <= 0
            ? 0
            : (delta[i - 1] + delta[i]) / 2;
    }

    for (let i = 0; i < n - 1; i++) {
        if (delta[i] === 0) {
            m[i] = 0;
            m[i + 1] = 0;
        } else {
            const alpha = m[i] / delta[i];
            const beta = m[i + 1] / delta[i];
            const length = alpha * alpha + beta * beta;

            if (length > 9) {
                const scale = 3 / Math.sqrt(length);
                m[i] = scale * alpha * delta[i];
                m[i + 1] = scale * beta * delta[i];
            }
        }
    }

    for (let i = 0; i < n - 1; i++) {
        const width = h[i];
        ctx.bezierCurveTo(
            points[i][0] + width / 3,
            points[i][1] + m[i] * width / 3,
            points[i + 1][0] - width / 3,
            points[i + 1][1] - m[i + 1] * width / 3,
            points[i + 1][0],
            points[i + 1][1]
        );
    }
}

export default function PredictionMarketGraph({ metrics, theme, locale }) {
    const containerRef = useRef(null);
    const canvasRef = useRef(null);

    useEffect(() => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return undefined;

        const points = (metrics?.priceMovementPoints || [])
            .map((point) => ({
                time: new Date(point.timestamp).getTime(),
                value: Number(point.probability) * 100
            }))
            .filter((point) =>
                Number.isFinite(point.time) && Number.isFinite(point.value)
            )
            .sort((a, b) => a.time - b.time)
            .filter((point, index, sorted) =>
                index === 0 || point.time !== sorted[index - 1].time
            );

        if (points.length < 2) return undefined;

        const values = points.map((point) => point.value);
        const dataMin = Math.min(...values);
        const dataMax = Math.max(...values);
        const dataRange = dataMax - dataMin;
        const minimumRange = dataRange * 0.1 || 0.4;
        const min = dataRange < minimumRange
            ? (dataMin + dataMax) / 2 - minimumRange / 2
            : dataMin - dataRange * 0.12;
        const max = dataRange < minimumRange
            ? (dataMin + dataMax) / 2 + minimumRange / 2
            : dataMax + dataRange * 0.12;
        const range = max - min;
        const firstTime = points[0].time;
        const lastTime = points[points.length - 1].time;
        const currentValue = points[points.length - 1].value;
        const dark = theme === 'dark';
        const lineColor = getComputedStyle(container)
            .getPropertyValue('--color-fig-default')
            .trim();
        const fallbackRgb = dark ? [237, 238, 240] : [28, 32, 36];
        const [red, green, blue] = getRgbChannels(lineColor) || fallbackRgb;
        const gridColor = dark
            ? 'rgba(255, 255, 255, 0.06)'
            : 'rgba(0, 0, 0, 0.06)';
        const labelColor = dark
            ? 'rgba(255, 255, 255, 0.4)'
            : 'rgba(0, 0, 0, 0.35)';
        const crosshairColor = dark
            ? 'rgba(255, 255, 255, 0.2)'
            : 'rgba(0, 0, 0, 0.12)';
        const tooltipColor = lineColor;
        const tooltipOutline = dark
            ? 'rgba(30, 30, 30, 0.95)'
            : 'rgba(255, 255, 255, 0.95)';
        const formatValue = (value) =>
            new Intl.NumberFormat(locale || undefined, {
                style: 'percent',
                maximumFractionDigits: 0
            }).format(value / 100);
        let hoverX = null;

        const draw = () => {
            const { width, height } = canvas.getBoundingClientRect();
            if (!width || !height) return;

            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);

            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, width, height);

            const left = 12;
            const right = width - 80;
            const top = 12;
            const bottom = height - 28;
            const plotWidth = right - left;
            const plotHeight = bottom - top;
            if (plotWidth <= 0 || plotHeight <= 0) return;

            const yForValue = (value) =>
                bottom - (value - min) / range * plotHeight;

            // Reserve 16px per interval; distribute remaining space by elapsed time.
            const minimumGap = 16;
            const flexibleWidth = plotWidth - minimumGap * (points.length - 1);
            const curve = points.map((point, index) => [
                left
                    + index * minimumGap
                    + flexibleWidth * (point.time - firstTime) / (lastTime - firstTime),
                yForValue(point.value)
            ]);
            const endpointY = yForValue(currentValue);

            // Liveline-style low-contrast grid and right-side value labels.
            ctx.font = '11px "SF Mono", Menlo, Monaco, monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.setLineDash([1, 3]);

            const step = Math.max(1, Math.ceil(range / 4));
            const firstTick = Math.ceil(min / step) * step;

            for (let value = firstTick; value <= max; value += step) {
                const y = yForValue(value);
                ctx.beginPath();
                ctx.strokeStyle = gridColor;
                ctx.lineWidth = 1;
                ctx.moveTo(left, y);
                ctx.lineTo(right, y);
                ctx.stroke();

                ctx.fillStyle = labelColor;
                ctx.fillText(
                    new Intl.NumberFormat(locale || undefined, {
                        style: 'percent',
                        maximumFractionDigits: 0
                    }).format(value / 100),
                    right + 8,
                    y
                );
            }
            ctx.setLineDash([]);

            const renderCurve = () => {
                const gradient = ctx.createLinearGradient(0, top, 0, bottom);
                gradient.addColorStop(
                    0,
                    `rgba(${red}, ${green}, ${blue}, ${dark ? 0.12 : 0.08})`
                );
                gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);

                ctx.beginPath();
                ctx.moveTo(curve[0][0], bottom);
                ctx.lineTo(curve[0][0], curve[0][1]);
                drawSpline(ctx, curve);
                ctx.lineTo(curve[curve.length - 1][0], bottom);
                ctx.closePath();
                ctx.fillStyle = gradient;
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(curve[0][0], curve[0][1]);
                drawSpline(ctx, curve);
                ctx.strokeStyle = lineColor;
                ctx.lineWidth = 2;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                ctx.stroke();
            };

            ctx.save();
            ctx.beginPath();
            ctx.rect(left, top, plotWidth, plotHeight);
            ctx.clip();

            if (hoverX === null) {
                renderCurve();
            } else {
                // Same split treatment as Liveline: 100% left, 40% right.
                ctx.save();
                ctx.beginPath();
                ctx.rect(left, top, hoverX - left, plotHeight);
                ctx.clip();
                renderCurve();
                ctx.restore();

                ctx.save();
                ctx.beginPath();
                ctx.rect(hoverX, top, right - hoverX, plotHeight);
                ctx.clip();
                ctx.globalAlpha = 0.4;
                renderCurve();
                ctx.restore();
            }
            ctx.restore();

            // Liveline's dashed current-value guide.
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 1;
            ctx.globalAlpha = hoverX === null ? 0.4 : 0.32;
            ctx.beginPath();
            ctx.moveTo(left, endpointY);
            ctx.lineTo(right, endpointY);
            ctx.stroke();
            ctx.restore();

            // Static version of Liveline's endpoint dot, without its pulse.
            ctx.save();
            ctx.shadowColor = dark
                ? 'rgba(0, 0, 0, 0.4)'
                : 'rgba(0, 0, 0, 0.15)';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(right, endpointY, 6.5, 0, Math.PI * 2);
            ctx.fillStyle = dark
                ? 'rgba(40, 40, 40, 0.95)'
                : 'rgba(255, 255, 255, 0.95)';
            ctx.fill();
            ctx.restore();

            ctx.beginPath();
            ctx.arc(right, endpointY, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = lineColor;
            ctx.fill();

            // Fixed value badge at the end of the line.
            const badgeText = formatValue(currentValue);
            ctx.font = '11px "SF Mono", Menlo, Monaco, monospace';
            const badgeWidth = ctx.measureText(badgeText).width + 16;
            const badgeX = right + 10;
            const badgeY = endpointY - 12;

            ctx.beginPath();
            ctx.moveTo(badgeX, endpointY);
            ctx.lineTo(badgeX + 7, badgeY + 3);
            ctx.lineTo(badgeX + 7, badgeY + 21);
            ctx.closePath();
            ctx.fillStyle = lineColor;
            ctx.fill();

            ctx.beginPath();
            ctx.roundRect(badgeX + 6, badgeY, badgeWidth, 24, 5);
            ctx.fillStyle = lineColor;
            ctx.fill();
            ctx.fillStyle = getComputedStyle(container)
                .getPropertyValue('--color-surface-default')
                .trim();
            ctx.textBaseline = 'middle';
            ctx.fillText(badgeText, badgeX + 14, endpointY);

            if (hoverX === null) return;

            // Dimming follows the pointer, but labels appear only near real points.
            let hoveredIndex = -1;
            let nearestDistance = Infinity;
            for (let index = 0; index < curve.length; index++) {
                const distance = Math.abs(curve[index][0] - hoverX);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    hoveredIndex = index;
                }
            }
            if (nearestDistance > 8) return;

            const hoveredPoint = points[hoveredIndex];
            const pointX = curve[hoveredIndex][0];
            const pointY = curve[hoveredIndex][1];

            ctx.beginPath();
            ctx.strokeStyle = crosshairColor;
            ctx.globalAlpha = 0.5;
            ctx.lineWidth = 1;
            ctx.moveTo(pointX, top);
            ctx.lineTo(pointX, bottom);
            ctx.stroke();
            ctx.globalAlpha = 1;

            ctx.beginPath();
            ctx.arc(pointX, pointY, 4, 0, Math.PI * 2);
            ctx.fillStyle = lineColor;
            ctx.fill();

            const valueText = formatValue(hoveredPoint.value);
            const timeText = `  ·  ${new Date(hoveredPoint.time).toLocaleString(locale || undefined)}`;
            ctx.font = '400 13px "SF Mono", Menlo, monospace';
            const valueWidth = ctx.measureText(valueText).width;
            const textWidth = valueWidth + ctx.measureText(timeText).width;
            const textX = Math.max(
                left + 4,
                Math.min(pointX - textWidth / 2, right - textWidth)
            );
            const textY = top + 24;

            ctx.lineJoin = 'round';
            ctx.lineWidth = 3;
            ctx.strokeStyle = tooltipOutline;
            ctx.strokeText(valueText + timeText, textX, textY);
            ctx.fillStyle = tooltipColor;
            ctx.fillText(valueText, textX, textY);
            ctx.fillStyle = labelColor;
            ctx.fillText(timeText, textX + valueWidth, textY);
        };

        const onPointerMove = (event) => {
            const rect = canvas.getBoundingClientRect();
            const left = 12;
            const right = rect.width - 80;
            hoverX = Math.max(left, Math.min(event.clientX - rect.left, right));
            draw();
        };

        const onPointerLeave = () => {
            hoverX = null;
            draw();
        };

        const observer = new ResizeObserver(draw);
        observer.observe(container);
        container.addEventListener('pointermove', onPointerMove);
        container.addEventListener('pointerleave', onPointerLeave);
        draw();

        return () => {
            observer.disconnect();
            container.removeEventListener('pointermove', onPointerMove);
            container.removeEventListener('pointerleave', onPointerLeave);
        };
    }, [metrics, theme, locale]);

    if ((metrics?.priceMovementPoints || []).length < 2) return null;

    return (
        <div
            ref={containerRef}
            className="prediction-markets-graph prediction-markets-graph-history"
        >
            <canvas
                ref={canvasRef}
                style={{
                    display: 'block',
                    width: '100%',
                    minWidth: `${92 + Math.max(
                        0,
                        (metrics?.priceMovementPoints?.length || 0) - 1
                    ) * 16}px`,
                    height: '100%'
                }}
            />
        </div>
    );
}