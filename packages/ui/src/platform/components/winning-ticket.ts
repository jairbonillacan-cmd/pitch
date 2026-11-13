/**
 * Boleto ganador en PNG para redes (1080×1350 publicación, 1080×1920 historia).
 * Toma los colores de los tokens del elemento que se le pasa, así no hay colores escritos a
 * mano fuera de @pitchlab/tokens.
 */

export type WinningAspect = "4:5" | "9:16";

export interface WinningTicketContent {
  aspect: WinningAspect;
  kind: "pick" | "parlay";
  leagueLabel: string;
  matchLabel: string;
  /** Una selección (pick) o varias (parlay). */
  legs: string[];
  decimal: number;
  american: string;
  units: number;
  /** Ganancia neta en unidades: unidades × (momio − 1). */
  profitUnits: number;
  sealedLabel: string;
  handle: string;
  /** «pitchlab.mx/i/CODIGO» o «pitchlab.mx». */
  link: string;
}

const SIZES: Record<WinningAspect, { width: number; height: number }> = {
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
};

function token(el: Element, name: string, fallback: string): string {
  const style = getComputedStyle(el);
  return style.getPropertyValue(name).trim() || style.getPropertyValue(fallback).trim() || style.color;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

export function formatUnitsSigned(u: number): string {
  const v = Math.round(u * 100) / 100;
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)} u`;
}

export async function renderWinningTicketPng(content: WinningTicketContent, colorSource: Element): Promise<Blob> {
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
  };
  const family = getComputedStyle(colorSource).fontFamily || "sans-serif";
  const font = (w: number, s: number) => `${w} ${s}px ${family}`;
  const tall = content.aspect === "9:16";

  // Fondo con dos halos de color de la marca.
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, width, height);
  const halo = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "transparent");
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  };
  halo(width * 0.15, height * 0.1, width * 0.7, c.accent);
  halo(width * 0.9, height * 0.95, width * 0.7, c.success);

  // Cuerpo del boleto.
  const margin = 72;
  const top = tall ? 260 : 96;
  const bodyH = height - top - (tall ? 260 : 96);
  const x0 = margin;
  const w = width - margin * 2;
  ctx.fillStyle = c.surface;
  rr(ctx, x0, top, w, bodyH, 48);
  ctx.fill();
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 3;
  ctx.stroke();

  const pad = 64;
  let y = top + pad;
  ctx.textBaseline = "top";

  // Encabezado: marca y liga.
  ctx.fillStyle = c.fg;
  ctx.font = font(800, 50);
  ctx.fillText("PitchLab", x0 + pad, y);
  ctx.font = font(700, 28);
  const lw = ctx.measureText(content.leagueLabel).width + 44;
  ctx.fillStyle = c.bg;
  rr(ctx, x0 + w - pad - lw, y + 2, lw, 54, 27);
  ctx.fill();
  ctx.fillStyle = c.secondary;
  ctx.fillText(content.leagueLabel, x0 + w - pad - lw + 22, y + 14);
  y += 110;

  // Sello «GANADO».
  ctx.save();
  const stampX = x0 + pad;
  ctx.strokeStyle = c.success;
  ctx.fillStyle = c.success;
  ctx.lineWidth = 5;
  ctx.font = font(900, 64);
  const stamp = content.kind === "parlay" ? "PARLAY GANADO" : "PICK GANADO";
  const sw = ctx.measureText(stamp).width + 56;
  rr(ctx, stampX, y, sw, 96, 20);
  ctx.stroke();
  ctx.fillText(stamp, stampX + 28, y + 16);
  ctx.restore();
  y += 140;

  // Partido.
  ctx.fillStyle = c.muted;
  ctx.font = font(600, 32);
  for (const line of wrap(ctx, content.matchLabel, w - pad * 2).slice(0, 2)) {
    ctx.fillText(line, x0 + pad, y);
    y += 44;
  }
  y += 20;

  // Selecciones con palomita.
  const maxLegs = tall ? 8 : 5;
  const legs = content.legs.slice(0, maxLegs);
  const legFont = legs.length > 3 ? 40 : 52;
  for (const leg of legs) {
    ctx.fillStyle = c.success;
    ctx.beginPath();
    ctx.arc(x0 + pad + 22, y + legFont / 2 + 4, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c.bg;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x0 + pad + 11, y + legFont / 2 + 5);
    ctx.lineTo(x0 + pad + 20, y + legFont / 2 + 14);
    ctx.lineTo(x0 + pad + 34, y + legFont / 2 - 6);
    ctx.stroke();
    ctx.fillStyle = c.fg;
    ctx.font = font(800, legFont);
    const lines = wrap(ctx, leg, w - pad * 2 - 70).slice(0, 2);
    for (const line of lines) {
      ctx.fillText(line, x0 + pad + 70, y);
      y += legFont + 10;
    }
    y += 14;
  }
  if (content.legs.length > maxLegs) {
    ctx.fillStyle = c.muted;
    ctx.font = font(600, 30);
    ctx.fillText(`y ${content.legs.length - maxLegs} más`, x0 + pad + 70, y);
    y += 48;
  }

  // Perforación con muescas.
  const perfY = Math.max(y + 40, top + bodyH - 420);
  ctx.fillStyle = c.bg;
  ctx.beginPath();
  ctx.arc(x0, perfY, 30, 0, Math.PI * 2);
  ctx.arc(x0 + w, perfY, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 16]);
  ctx.beginPath();
  ctx.moveTo(x0 + 50, perfY);
  ctx.lineTo(x0 + w - 50, perfY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Cifras: momio, unidades y ganancia.
  let sy = perfY + 50;
  const colW = (w - pad * 2) / 3;
  const stats: Array<[string, string, string]> = [
    ["Momio", content.decimal.toFixed(2), content.american],
    ["Unidades", content.units.toFixed(2), "registradas"],
    ["Ganancia", formatUnitsSigned(content.profitUnits), "netas"],
  ];
  stats.forEach(([label, value, sub], i) => {
    const sx = x0 + pad + colW * i;
    ctx.fillStyle = c.muted;
    ctx.font = font(600, 28);
    ctx.fillText(label, sx, sy);
    ctx.fillStyle = i === 2 ? c.success : c.fg;
    ctx.font = font(900, 56);
    ctx.fillText(value, sx, sy + 40);
    ctx.fillStyle = c.muted;
    ctx.font = font(500, 26);
    ctx.fillText(sub, sx, sy + 106);
  });
  sy += 170;

  // Pie: quién, cuándo y enlace.
  ctx.fillStyle = c.secondary;
  ctx.font = font(700, 30);
  ctx.fillText(`${content.handle} · ${content.sealedLabel}`, x0 + pad, sy);
  ctx.fillStyle = c.muted;
  ctx.font = font(500, 26);
  ctx.fillText("Sellado antes del partido en PitchLab. Juega con responsabilidad · +18", x0 + pad, sy + 44);
  ctx.fillStyle = c.accent;
  ctx.font = font(800, 30);
  ctx.fillText(content.link, x0 + pad, sy + 90);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo generar el PNG"))), "image/png");
  });
}
