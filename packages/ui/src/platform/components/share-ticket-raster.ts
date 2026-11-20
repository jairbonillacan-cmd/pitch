/**
 * Descarga real de boletos compartibles como PNG (1080×1350 feed 4:5, 1080×1920 stories 9:16).
 * Dibuja en <canvas> con los colores de los tokens `--share-card-*` leídos del propio boleto
 * en pantalla, así no hay colores escritos a mano fuera de @pitchlab/tokens.
 */

export type TicketAspect = "4:5" | "9:16";

export interface TicketRasterLeg {
  rank: number;
  label: string;
  subLabel: string;
  probLabel: string;
  oddsLabel: string;
  highlight?: boolean;
}

export interface TicketRasterContent {
  aspect: TicketAspect;
  leagueLabel: string;
  title: string;
  subtitle: string;
  /** Línea de estado sobre la selección (p. ej. "PICK ABIERTO DE LA SEMANA"). */
  badge: string;
  badgeTone: "success" | "warning";
  units: string;
  /** Selección o texto de sellado. */
  mainLine: string;
  detailLine: string;
  /** Patas detalladas para parlays multi-pata compartibles (opcional). */
  legs?: TicketRasterLeg[];
  summaryLeftLabel?: string;
  summaryLeftValue?: string;
  summaryRightLabel?: string;
  summaryRightValue?: string;
  footerLine: string;
  footerSub: string;
  watermark: string;
}

const SIZES: Record<TicketAspect, { width: number; height: number }> = {
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
};

function token(el: Element, name: string, fallbackVar: string): string {
  const style = getComputedStyle(el);
  const value = style.getPropertyValue(name).trim();
  return value || style.getPropertyValue(fallbackVar).trim() || style.color;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawLegListTicket(
  ctx: CanvasRenderingContext2D,
  content: TicketRasterContent,
  c: Record<"bg" | "surface" | "fg" | "secondary" | "muted" | "border" | "accent" | "success" | "warning", string>,
  font: (weight: number, size: number) => string,
  width: number,
  height: number,
  pad: number,
  inner: number,
  startY: number,
): void {
  const tall = content.aspect === "9:16";
  const legs = (content.legs ?? []).slice(0, 6);
  const footerHeight = 148;
  const footY = height - pad - footerHeight;
  const summaryH = tall ? 146 : 132;
  const summaryGap = tall ? 26 : 18;
  const availableForLegs = footY - summaryGap - summaryH - startY - (tall ? 20 : 12);

  const count = Math.max(1, legs.length);
  const gap = Math.max(10, Math.min(20, Math.floor((availableForLegs - count * 88) / Math.max(1, count))));
  const rowH = Math.max(82, Math.min(138, Math.floor((availableForLegs - gap * (count - 1)) / count)));

  let y = startY;
  for (const leg of legs) {
    ctx.fillStyle = c.surface;
    roundRect(ctx, pad, y, inner, rowH, 28);
    ctx.fill();

    ctx.strokeStyle = leg.highlight ? c.success : c.border;
    ctx.lineWidth = leg.highlight ? 2.5 : 1.5;
    roundRect(ctx, pad, y, inner, rowH, 28);
    ctx.stroke();

    // Círculo numerado 1..N
    const badgeR = rowH >= 110 ? 22 : 18;
    const badgeCx = pad + 26 + badgeR;
    const badgeCy = y + rowH / 2;
    ctx.fillStyle = leg.highlight ? c.success : c.accent;
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = c.bg;
    ctx.font = font(800, rowH >= 110 ? 26 : 22);
    const rankStr = String(leg.rank);
    const rankW = ctx.measureText(rankStr).width;
    ctx.textBaseline = "middle";
    ctx.fillText(rankStr, badgeCx - rankW / 2, badgeCy + 1);
    ctx.textBaseline = "top";

    // Columna derecha (probabilidad + momio)
    ctx.font = font(800, rowH >= 110 ? 34 : 29);
    const probW = ctx.measureText(leg.probLabel).width;
    ctx.font = font(600, rowH >= 110 ? 24 : 21);
    const oddsW = ctx.measureText(leg.oddsLabel).width;
    const rightColW = Math.max(probW, oddsW);
    const rightEdge = pad + inner - 26;

    ctx.fillStyle = leg.highlight ? c.success : c.accent;
    ctx.font = font(800, rowH >= 110 ? 34 : 29);
    ctx.fillText(leg.probLabel, rightEdge - probW, y + Math.max(16, Math.round(rowH * 0.2)));

    ctx.fillStyle = c.muted;
    ctx.font = font(600, rowH >= 110 ? 24 : 21);
    ctx.fillText(leg.oddsLabel, rightEdge - oddsW, y + Math.max(50, Math.round(rowH * 0.57)));

    // Columna central (selección + badge Más probable + partido/hora)
    const textX = badgeCx + badgeR + 20;
    const maxTextW = Math.max(160, rightEdge - rightColW - 24 - textX);
    const topY = y + Math.max(15, Math.round(rowH * 0.19));

    ctx.fillStyle = c.fg;
    ctx.font = font(800, rowH >= 110 ? 32 : 27);
    let label = leg.label;
    while (label.length > 6 && ctx.measureText(label).width > maxTextW) {
      label = `${label.slice(0, -2)}…`;
    }
    ctx.fillText(label, textX, topY);

    if (leg.highlight) {
      const labelW = ctx.measureText(label).width;
      const chipText = "MÁS PROBABLE";
      ctx.font = font(800, 17);
      const chipW = ctx.measureText(chipText).width + 20;
      if (textX + labelW + 14 + chipW <= rightEdge - rightColW - 18) {
        const chipX = textX + labelW + 14;
        const chipY = topY + 4;
        ctx.fillStyle = c.bg;
        roundRect(ctx, chipX, chipY, chipW, 26, 13);
        ctx.fill();
        ctx.strokeStyle = c.success;
        ctx.lineWidth = 1.5;
        roundRect(ctx, chipX, chipY, chipW, 26, 13);
        ctx.stroke();
        ctx.fillStyle = c.success;
        ctx.fillText(chipText, chipX + 10, chipY + 4);
      }
    }

    ctx.fillStyle = c.muted;
    ctx.font = font(500, rowH >= 110 ? 24 : 21);
    let sub = leg.subLabel;
    while (sub.length > 6 && ctx.measureText(sub).width > maxTextW) {
      sub = `${sub.slice(0, -2)}…`;
    }
    ctx.fillText(sub, textX, y + Math.max(48, Math.round(rowH * 0.56)));

    y += rowH + gap;
  }

  // Bloque resumen combinado con tokens del tema (sin degradados genéricos)
  const summaryY = footY - summaryGap - summaryH;
  ctx.fillStyle = c.surface;
  roundRect(ctx, pad, summaryY, inner, summaryH, 32);
  ctx.fill();
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 2.5;
  roundRect(ctx, pad, summaryY, inner, summaryH, 32);
  ctx.stroke();

  ctx.fillStyle = c.muted;
  ctx.font = font(700, 22);
  ctx.fillText(content.summaryLeftLabel ?? "MOMIO JUSTO COMBINADO", pad + 32, summaryY + 24);
  ctx.fillStyle = c.fg;
  ctx.font = font(800, 44);
  ctx.fillText(content.summaryLeftValue ?? content.mainLine, pad + 32, summaryY + 56);

  const rightSummaryLabel = content.summaryRightLabel ?? "PROBABILIDAD";
  const rightSummaryVal = content.summaryRightValue ?? "";
  ctx.font = font(700, 22);
  const rLblW = ctx.measureText(rightSummaryLabel).width;
  ctx.fillStyle = c.muted;
  ctx.fillText(rightSummaryLabel, pad + inner - 32 - rLblW, summaryY + 24);
  ctx.font = font(800, 44);
  const rValW = ctx.measureText(rightSummaryVal).width;
  ctx.fillStyle = c.success;
  ctx.fillText(rightSummaryVal, pad + inner - 32 - rValW, summaryY + 56);
}

/** Dibuja el boleto y devuelve el PNG. `colorSource` es el boleto en pantalla. */
export async function renderTicketPng(
  content: TicketRasterContent,
  colorSource: Element,
): Promise<Blob> {
  const { width, height } = SIZES[content.aspect];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible");

  const c = {
    bg: token(colorSource, "--share-card-bg", "--pl-stage-bg"),
    surface: token(colorSource, "--share-card-surface", "--pl-surface"),
    fg: token(colorSource, "--share-card-fg", "--pl-text"),
    secondary: token(colorSource, "--share-card-secondary", "--pl-text-secondary"),
    muted: token(colorSource, "--share-card-muted", "--pl-text-muted"),
    border: token(colorSource, "--share-card-border", "--pl-border"),
    accent: token(colorSource, "--share-card-accent", "--pl-brand"),
    success: token(colorSource, "--share-card-success", "--pl-success"),
    warning: token(colorSource, "--share-card-warning", "--pl-warning"),
  };
  const fontFamily = getComputedStyle(colorSource).fontFamily || "sans-serif";
  const font = (weight: number, size: number) => `${weight} ${size}px ${fontFamily}`;

  const pad = 80;
  const inner = width - pad * 2;
  const tall = content.aspect === "9:16";
  const hasLegs = Boolean(content.legs && content.legs.length > 0);

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 3;
  roundRect(ctx, 24, 24, width - 48, height - 48, 56);
  ctx.stroke();

  let y = pad + (tall ? (hasLegs ? 42 : 80) : 14);
  ctx.textBaseline = "top";

  // Marca y liga
  ctx.fillStyle = c.fg;
  ctx.font = font(800, 50);
  ctx.fillText("PitchLab", pad, y);
  ctx.fillStyle = c.accent;
  ctx.font = font(800, 24);
  ctx.fillText("Probabilidades claras", pad, y + 60);
  ctx.font = font(700, 28);
  const leagueW = ctx.measureText(content.leagueLabel).width + 44;
  ctx.fillStyle = c.surface;
  roundRect(ctx, width - pad - leagueW, y + 4, leagueW, 52, 26);
  ctx.fill();
  ctx.fillStyle = c.fg;
  ctx.fillText(content.leagueLabel, width - pad - leagueW + 22, y + 14);
  y += hasLegs ? 124 : 152;

  // Título y subtítulo
  ctx.fillStyle = c.fg;
  ctx.font = font(800, hasLegs ? 50 : 62);
  for (const line of wrapLines(ctx, content.title, inner).slice(0, 2)) {
    ctx.fillText(line, pad, y);
    y += hasLegs ? 60 : 76;
  }
  ctx.fillStyle = c.muted;
  ctx.font = font(500, hasLegs ? 28 : 34);
  for (const line of wrapLines(ctx, content.subtitle, inner).slice(0, 2)) {
    ctx.fillText(line, pad, y + 6);
    y += hasLegs ? 38 : 46;
  }

  if (hasLegs) {
    drawLegListTicket(
      ctx,
      content,
      c,
      font,
      width,
      height,
      pad,
      inner,
      y + (tall ? 34 : 22),
    );
  } else {
    y += tall ? 120 : 60;

    // Bloque de selección única
    ctx.font = font(800, 54);
    const mainLines = wrapLines(ctx, content.mainLine, inner - 80).slice(0, 3);
    ctx.font = font(500, 32);
    const detailLines = wrapLines(ctx, content.detailLine, inner - 80).slice(0, 3);
    const boxH = 120 + mainLines.length * 66 + detailLines.length * 44 + 40;
    ctx.fillStyle = c.surface;
    roundRect(ctx, pad, y, inner, boxH, 36);
    ctx.fill();

    let by = y + 40;
    ctx.fillStyle = content.badgeTone === "success" ? c.success : c.warning;
    ctx.font = font(800, 30);
    ctx.fillText(content.badge, pad + 40, by);
    ctx.fillStyle = c.fg;
    const unitsW = ctx.measureText(content.units).width;
    ctx.fillText(content.units, pad + inner - 40 - unitsW, by);
    by += 72;
    ctx.font = font(800, 54);
    for (const line of mainLines) {
      ctx.fillText(line, pad + 40, by);
      by += 66;
    }
    ctx.fillStyle = c.secondary;
    ctx.font = font(500, 32);
    for (const line of detailLines) {
      ctx.fillText(line, pad + 40, by + 10);
      by += 44;
    }
  }

  // Pie: código y marca de agua
  const footY = height - pad - 148;
  ctx.fillStyle = c.surface;
  roundRect(ctx, pad, footY, inner, 148, 32);
  ctx.fill();
  ctx.fillStyle = c.fg;
  ctx.font = font(800, 32);
  ctx.fillText(content.footerLine, pad + 34, footY + 30);
  ctx.fillStyle = c.muted;
  ctx.font = font(500, 26);
  ctx.fillText(content.footerSub, pad + 34, footY + 84);
  ctx.font = font(700, 26);
  const wmW = ctx.measureText(content.watermark).width;
  ctx.fillText(content.watermark, pad + inner - 34 - wmW, footY + 84);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar el PNG"))), "image/png");
  });
}

/** Genera el PNG y lo descarga en el navegador. */
export async function downloadTicketPng(
  content: TicketRasterContent,
  colorSource: Element,
  fileName: string,
): Promise<void> {
  const blob = await renderTicketPng(content, colorSource);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
