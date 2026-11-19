/**
 * Generador de tarjetas compartibles verticales 9:16 (1080×1920 PNG) para Stories / WhatsApp / X:
 * - Partido (`shareMatchStoryCard`)
 * - Comparador H2H (`shareH2hStoryCard`)
 *
 * Lee todos los colores desde los tokens CSS vivos en `:root` (cero hex escritos a mano).
 */
import { canonicalGameHref, sportHasDraw } from "@pitchlab/contracts";
import { formatOddsValue } from "../access-guard";
import type { OddsFormat, PlatformGame } from "../types";

export interface MatchStoryShareInput {
  game: PlatformGame;
  oddsFormat: OddsFormat;
  siteOrigin?: string;
}

export interface H2hStoryRow {
  label: string;
  leftValue: string;
  rightValue: string;
}

export interface H2hStoryShareInput {
  leagueLabel: string;
  leftTitle: string;
  rightTitle: string;
  leftSub?: string;
  rightSub?: string;
  headline?: string;
  rows: readonly H2hStoryRow[];
  shareUrl?: string;
}

interface StoryPalette {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  brand: string;
  success: string;
  text: string;
  secondary: string;
  muted: string;
}

function readStoryPalette(): StoryPalette {
  const style = getComputedStyle(document.documentElement);
  const pick = (primary: string, fallback: string) =>
    style.getPropertyValue(primary).trim() || style.getPropertyValue(fallback).trim() || style.color;
  return {
    bg: pick("--pl-bg", "--bg-canvas"),
    surface: pick("--pl-surface", "--bg-surface"),
    surface2: pick("--pl-surface-2", "--bg-elevated"),
    border: pick("--pl-card-border", "--border-subtle"),
    brand: pick("--pl-brand", "--brand-primary"),
    success: pick("--pl-success", "--semantic-success"),
    text: pick("--pl-text", "--text-primary"),
    secondary: pick("--pl-text-secondary", "--text-secondary"),
    muted: pick("--pl-text-muted", "--text-muted"),
  };
}

function roundedRectPath(
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

function createStoryCanvas(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  pal: StoryPalette;
  font: (w: number, sz: number) => string;
} {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible");
  const pal = readStoryPalette();
  const font = (weight: number, size: number) =>
    `${weight} ${size}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, 1080, 1920);

  // Marco editorial limpio
  roundedRectPath(ctx, 56, 72, 968, 1776, 44);
  ctx.fillStyle = pal.surface;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = pal.border;
  ctx.stroke();

  // Cabecera PitchLab
  ctx.fillStyle = pal.brand;
  roundedRectPath(ctx, 112, 134, 48, 48, 14);
  ctx.fill();
  ctx.fillStyle = pal.text;
  ctx.font = font(800, 38);
  ctx.fillText("PitchLab", 180, 171);

  ctx.fillStyle = pal.muted;
  ctx.font = font(600, 26);
  ctx.fillText("Lee el juego con datos", 180, 206);

  return { canvas, ctx, pal, font };
}

async function emitCanvasAsShareOrDownload(
  canvas: HTMLCanvasElement,
  filename: string,
  shareMeta: { title: string; text: string; url: string },
): Promise<"shared" | "downloaded"> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo generar PNG"))), "image/png");
  });

  if (typeof navigator !== "undefined" && typeof File !== "undefined" && typeof navigator.share === "function") {
    const file = new File([blob], filename, { type: "image/png" });
    try {
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: shareMeta.title,
          text: shareMeta.text,
          url: shareMeta.url,
        });
        return "shared";
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return "shared";
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}

/** Genera y comparte/descarga una tarjeta vertical 9:16 del partido con probabilidades y enlace corto. */
export async function shareMatchStoryCard(
  input: MatchStoryShareInput,
): Promise<"shared" | "downloaded"> {
  const { game, oddsFormat } = input;
  const origin = input.siteOrigin ?? (typeof window !== "undefined" ? window.location.origin : "https://pitchlab.mx");
  const shortPath = canonicalGameHref(game.league, game);
  const shareUrl = `${origin.replace(/\/$/, "")}${shortPath}`;
  const { canvas, ctx, pal, font } = createStoryCanvas();

  // Liga y fecha
  ctx.fillStyle = pal.brand;
  ctx.font = font(700, 30);
  ctx.fillText(`${game.leagueLabel.toUpperCase()} · ${game.round}`.slice(0, 44), 112, 310);

  ctx.fillStyle = pal.secondary;
  ctx.font = font(500, 28);
  ctx.fillText(`${game.dayLabel} · ${game.kickoffLocal}`.slice(0, 48), 112, 356);

  // Equipos
  ctx.fillStyle = pal.text;
  ctx.font = font(800, 62);
  ctx.fillText(game.home.name.slice(0, 22), 112, 490);
  ctx.fillStyle = pal.muted;
  ctx.font = font(700, 34);
  ctx.fillText("VS", 112, 554);
  ctx.fillStyle = pal.text;
  ctx.font = font(800, 62);
  ctx.fillText(game.away.name.slice(0, 22), 112, 636);

  // Probabilidades
  if (game.x12) {
    const hasDraw = sportHasDraw(game.sport);
    const [pH, pD, pA] = game.x12;
    roundedRectPath(ctx, 112, 720, 856, 230, 28);
    ctx.fillStyle = pal.surface2;
    ctx.fill();
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = pal.muted;
    ctx.font = font(700, 24);
    ctx.fillText("PROBABILIDAD DEL MODELO", 148, 772);

    const cols = hasDraw
      ? [
          { label: game.home.shortName.slice(0, 12), val: `${(pH * 100).toFixed(1)} %`, x: 148 },
          { label: "Empate", val: `${(pD * 100).toFixed(1)} %`, x: 444 },
          { label: game.away.shortName.slice(0, 12), val: `${(pA * 100).toFixed(1)} %`, x: 700 },
        ]
      : [
          { label: game.home.shortName.slice(0, 16), val: `${(pH * 100).toFixed(1)} %`, x: 148 },
          { label: game.away.shortName.slice(0, 16), val: `${(pA * 100).toFixed(1)} %`, x: 560 },
        ];
    for (const col of cols) {
      ctx.fillStyle = pal.secondary;
      ctx.font = font(600, 26);
      ctx.fillText(col.label, col.x, 836);
      ctx.fillStyle = pal.text;
      ctx.font = font(800, 52);
      ctx.fillText(col.val, col.x, 904);
    }
  }

  // Pick principal (si está desbloqueado)
  const mainPick = game.picks[0];
  if (mainPick && !mainPick.isRedacted) {
    roundedRectPath(ctx, 112, 1000, 856, 300, 28);
    ctx.fillStyle = pal.surface2;
    ctx.fill();
    ctx.strokeStyle = pal.brand;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = pal.brand;
    ctx.font = font(700, 24);
    ctx.fillText("SELECCIÓN PRINCIPAL DEL MOTOR", 148, 1058);

    ctx.fillStyle = pal.text;
    ctx.font = font(800, 44);
    ctx.fillText(mainPick.label.slice(0, 30), 148, 1134);

    ctx.fillStyle = pal.success;
    ctx.font = font(800, 46);
    ctx.fillText(`${(mainPick.p * 100).toFixed(1)} %`, 148, 1236);

    ctx.fillStyle = pal.secondary;
    ctx.font = font(700, 34);
    ctx.fillText(
      `Momio justo ${formatOddsValue(mainPick.fairDecimal, oddsFormat)}`,
      420,
      1232,
    );
  }

  // Contexto sede / árbitro
  const metaParts: string[] = [];
  if (game.venue) metaParts.push(`Sede: ${game.venue}`);
  const ref = game.referee ?? game.preGame?.matchContext?.referee;
  if (ref) metaParts.push(`Árbitro: ${ref}`);
  if (metaParts.length > 0) {
    ctx.fillStyle = pal.secondary;
    ctx.font = font(500, 26);
    ctx.fillText(metaParts.join(" · ").slice(0, 62), 112, 1410);
  }

  // Pie de marca y enlace corto
  ctx.fillStyle = pal.border;
  ctx.fillRect(112, 1660, 856, 2);
  ctx.fillStyle = pal.text;
  ctx.font = font(700, 28);
  ctx.fillText(shareUrl.replace(/^https?:\/\//, "").slice(0, 52), 112, 1732);
  ctx.fillStyle = pal.muted;
  ctx.font = font(500, 24);
  ctx.fillText("Análisis informativo con datos verificados · +18", 112, 1778);

  return emitCanvasAsShareOrDownload(
    canvas,
    `pitchlab-${game.home.slug}-vs-${game.away.slug}-9x16.png`,
    {
      title: `${game.home.name} vs ${game.away.name} · PitchLab`,
      text: `Probabilidades y lectura del partido en PitchLab (${game.leagueLabel})`,
      url: shareUrl,
    },
  );
}

/** Genera y comparte/descarga una tarjeta vertical 9:16 de comparativa H2H (equipos o jugadores). */
export async function shareH2hStoryCard(
  input: H2hStoryShareInput,
): Promise<"shared" | "downloaded"> {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://pitchlab.mx";
  const shareUrl = input.shareUrl ?? `${origin.replace(/\/$/, "")}/app/comparar`;
  const { canvas, ctx, pal, font } = createStoryCanvas();

  ctx.fillStyle = pal.brand;
  ctx.font = font(700, 28);
  ctx.fillText(`COMPARADOR H2H · ${input.leagueLabel.toUpperCase()}`.slice(0, 46), 112, 304);

  ctx.fillStyle = pal.text;
  ctx.font = font(800, 50);
  ctx.fillText(input.leftTitle.slice(0, 20), 112, 412);
  ctx.fillStyle = pal.muted;
  ctx.font = font(700, 30);
  ctx.fillText("VS", 112, 468);
  ctx.fillStyle = pal.text;
  ctx.font = font(800, 50);
  ctx.fillText(input.rightTitle.slice(0, 20), 112, 534);

  if (input.headline) {
    ctx.fillStyle = pal.secondary;
    ctx.font = font(600, 28);
    ctx.fillText(input.headline.slice(0, 54), 112, 606);
  }

  let y = 690;
  for (const row of input.rows.slice(0, 7)) {
    roundedRectPath(ctx, 112, y, 856, 116, 22);
    ctx.fillStyle = pal.surface2;
    ctx.fill();
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = pal.text;
    ctx.font = font(800, 36);
    ctx.fillText(row.leftValue.slice(0, 14), 148, y + 72);

    ctx.fillStyle = pal.muted;
    ctx.font = font(600, 26);
    const labelW = ctx.measureText(row.label).width;
    ctx.fillText(row.label, 540 - labelW / 2, y + 68);

    ctx.fillStyle = pal.text;
    ctx.font = font(800, 36);
    const rightW = ctx.measureText(row.rightValue).width;
    ctx.fillText(row.rightValue.slice(0, 14), 932 - rightW, y + 72);

    y += 136;
  }

  ctx.fillStyle = pal.border;
  ctx.fillRect(112, 1660, 856, 2);
  ctx.fillStyle = pal.text;
  ctx.font = font(700, 28);
  ctx.fillText(shareUrl.replace(/^https?:\/\//, "").slice(0, 52), 112, 1732);
  ctx.fillStyle = pal.muted;
  ctx.font = font(500, 24);
  ctx.fillText("PitchLab · Comparativa verificada de datos", 112, 1778);

  return emitCanvasAsShareOrDownload(canvas, "pitchlab-h2h-9x16.png", {
    title: `${input.leftTitle} vs ${input.rightTitle} · PitchLab`,
    text: `Comparativa H2H en PitchLab (${input.leagueLabel})`,
    url: shareUrl,
  });
}
