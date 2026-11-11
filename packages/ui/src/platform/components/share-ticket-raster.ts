/**
 * Descarga real de boletos compartibles como PNG (1080×1350 feed 4:5, 1080×1920 stories 9:16).
 * Dibuja en <canvas> con los colores de los tokens `--share-card-*` leídos del propio boleto
 * en pantalla, así no hay colores escritos a mano fuera de @pitchlab/tokens.
 */

export type TicketAspect = "4:5" | "9:16";

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

  const pad = 88;
  const inner = width - pad * 2;
  const tall = content.aspect === "9:16";

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 3;
  roundRect(ctx, 24, 24, width - 48, height - 48, 56);
  ctx.stroke();

  let y = pad + (tall ? 80 : 20);
  ctx.textBaseline = "top";

  // Marca y liga
  ctx.fillStyle = c.fg;
  ctx.font = font(800, 54);
  ctx.fillText("PitchLab", pad, y);
  ctx.fillStyle = c.accent;
  ctx.font = font(800, 26);
  ctx.fillText("SPACETIME SUITE v3.0", pad, y + 66);
  ctx.font = font(700, 30);
  const leagueW = ctx.measureText(content.leagueLabel).width + 48;
  ctx.fillStyle = c.surface;
  roundRect(ctx, width - pad - leagueW, y + 4, leagueW, 56, 28);
  ctx.fill();
  ctx.fillStyle = c.fg;
  ctx.fillText(content.leagueLabel, width - pad - leagueW + 24, y + 16);
  y += 160;

  // Título y subtítulo
  ctx.fillStyle = c.fg;
  ctx.font = font(800, 64);
  for (const line of wrapLines(ctx, content.title, inner).slice(0, 3)) {
    ctx.fillText(line, pad, y);
    y += 78;
  }
  ctx.fillStyle = c.muted;
  ctx.font = font(500, 34);
  for (const line of wrapLines(ctx, content.subtitle, inner).slice(0, 2)) {
    ctx.fillText(line, pad, y + 8);
    y += 46;
  }
  y += tall ? 120 : 60;

  // Bloque de selección
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

  // Pie: código y marca de agua
  const footY = height - pad - 150;
  ctx.fillStyle = c.surface;
  roundRect(ctx, pad, footY, inner, 150, 32);
  ctx.fill();
  ctx.fillStyle = c.fg;
  ctx.font = font(800, 34);
  ctx.fillText(content.footerLine, pad + 36, footY + 32);
  ctx.fillStyle = c.muted;
  ctx.font = font(500, 28);
  ctx.fillText(content.footerSub, pad + 36, footY + 86);
  ctx.font = font(700, 28);
  const wmW = ctx.measureText(content.watermark).width;
  ctx.fillText(content.watermark, pad + inner - 36 - wmW, footY + 86);

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
