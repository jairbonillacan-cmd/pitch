export type TicketAspect = "4:5" | "9:16";
export type TicketTone = "success" | "warning" | "danger" | "neutral";

export interface TicketRasterLeg {
  rank: number;
  label: string;
  subLabel: string;
  probLabel: string;
  oddsLabel: string;
  highlight?: boolean;
  status?: "won" | "lost" | "push" | "pending";
}

export interface TicketRasterContent {
  aspect: TicketAspect;
  leagueLabel: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: TicketTone;
  units: string;
  mainLine: string;
  detailLine: string;
  legs?: TicketRasterLeg[];
  summaryLeftLabel?: string;
  summaryLeftValue?: string;
  summaryRightLabel?: string;
  summaryRightValue?: string;
  summaryTone?: TicketTone;
  footerLine: string;
  footerSub: string;
  watermark: string;
}

const SIZES: Record<TicketAspect, { width: number; height: number }> = {
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
};

type RasterColors = Record<
  | "bg"
  | "surface"
  | "fg"
  | "secondary"
  | "muted"
  | "border"
  | "accent"
  | "success"
  | "warning"
  | "danger",
  string
>;

function resolveToneColor(tone: TicketTone, c: RasterColors): string {
  if (tone === "success") return c.success;
  if (tone === "danger") return c.danger;
  if (tone === "warning") return c.warning;
  return c.secondary;
}

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

function truncateTextToWidth(
  ctx: CanvasRenderingContext2D,
  rawText: string,
  maxWidth: number,
): string {
  let out = rawText;
  while (out.length > 4 && ctx.measureText(out).width > maxWidth) {
    out = `${out.slice(0, -2)}…`;
  }
  return out;
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
  c: RasterColors,
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
  const statusBarH = 54;
  const statusGap = tall ? 22 : 14;
  const summaryH = tall ? 148 : 132;
  const summaryGap = tall ? 24 : 18;
  const maxBodySpan = footY - 24 - startY;
  const count = Math.max(1, legs.length);
  const rowH = Math.max(
    92,
    Math.min(tall ? 168 : 134, Math.floor((maxBodySpan - statusBarH - statusGap - summaryH - summaryGap) / count) - 14),
  );
  const gap = Math.max(12, Math.min(20, count > 1 ? 16 : 0));
  const stackHeight = statusBarH + statusGap + count * rowH + (count - 1) * gap + summaryGap + summaryH;
  const slack = Math.max(0, maxBodySpan - stackHeight);
  let y = startY + (tall ? Math.min(180, Math.round(slack * 0.34)) : Math.min(48, Math.round(slack * 0.25)));

  const statusTone = resolveToneColor(content.badgeTone, c);
  ctx.fillStyle = c.surface;
  roundRect(ctx, pad, y, inner, statusBarH, 27);
  ctx.fill();
  ctx.fillStyle = statusTone;
  ctx.font = font(800, 24);
  ctx.fillText(content.badge, pad + 26, y + 14);
  ctx.fillStyle = c.fg;
  ctx.font = font(800, 24);
  const unitsW = ctx.measureText(content.units).width;
  ctx.fillText(content.units, pad + inner - 26 - unitsW, y + 14);
  y += statusBarH + statusGap;

  for (const leg of legs) {
    const legTone =
      leg.status === "won"
        ? c.success
        : leg.status === "lost"
          ? c.danger
          : leg.status === "push"
            ? c.muted
            : leg.highlight
              ? c.success
              : c.accent;

    ctx.fillStyle = c.surface;
    roundRect(ctx, pad, y, inner, rowH, 28);
    ctx.fill();

    ctx.strokeStyle =
      leg.status === "lost"
        ? c.danger
        : leg.status === "won" || leg.highlight
          ? c.success
          : c.border;
    ctx.lineWidth = leg.highlight || leg.status === "won" || leg.status === "lost" ? 2.5 : 1.5;
    roundRect(ctx, pad, y, inner, rowH, 28);
    ctx.stroke();

    const badgeR = rowH >= 110 ? 22 : 18;
    const badgeCx = pad + 26 + badgeR;
    const badgeCy = y + rowH / 2;
    ctx.fillStyle = legTone;
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = c.bg;
    ctx.font = font(800, rowH >= 110 ? 26 : 22);
    const rankMark =
      leg.status === "won"
        ? "✓"
        : leg.status === "lost"
          ? "✕"
          : leg.status === "push"
            ? "—"
            : String(leg.rank);
    const rankW = ctx.measureText(rankMark).width;
    ctx.textBaseline = "middle";
    ctx.fillText(rankMark, badgeCx - rankW / 2, badgeCy + 1);
    ctx.textBaseline = "top";

    const hasOddsSub = leg.oddsLabel.trim().length > 0;
    ctx.font = font(800, rowH >= 110 ? 32 : 28);
    const probW = ctx.measureText(leg.probLabel).width;
    ctx.font = font(600, rowH >= 110 ? 23 : 20);
    const oddsW = hasOddsSub ? ctx.measureText(leg.oddsLabel).width : 0;
    const rightColW = Math.max(probW, oddsW);
    const rightEdge = pad + inner - 26;

    ctx.fillStyle = legTone;
    ctx.font = font(800, rowH >= 110 ? 32 : 28);
    if (hasOddsSub) {
      ctx.fillText(leg.probLabel, rightEdge - probW, y + Math.max(16, Math.round(rowH * 0.2)));
      ctx.fillStyle = c.muted;
      ctx.font = font(600, rowH >= 110 ? 23 : 20);
      ctx.fillText(leg.oddsLabel, rightEdge - oddsW, y + Math.max(52, Math.round(rowH * 0.58)));
    } else {
      ctx.textBaseline = "middle";
      ctx.fillText(leg.probLabel, rightEdge - probW, badgeCy);
      ctx.textBaseline = "top";
    }

    const textX = badgeCx + badgeR + 20;
    const maxTextW = Math.max(160, rightEdge - rightColW - 24 - textX);
    const topY = y + Math.max(16, Math.round(rowH * 0.2));

    ctx.fillStyle = c.fg;
    ctx.font = font(800, rowH >= 110 ? 32 : 27);
    const label = truncateTextToWidth(ctx, leg.label, maxTextW);
    ctx.fillText(label, textX, topY);

    if (leg.highlight && leg.status !== "lost" && leg.status !== "won") {
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
    const sub = truncateTextToWidth(ctx, leg.subLabel, maxTextW);
    ctx.fillText(sub, textX, y + Math.max(50, Math.round(rowH * 0.58)));

    y += rowH + gap;
  }

  const summaryY = y - gap + summaryGap;
  const summaryTone = resolveToneColor(content.summaryTone ?? content.badgeTone, c);
  ctx.fillStyle = c.surface;
  roundRect(ctx, pad, summaryY, inner, summaryH, 32);
  ctx.fill();
  ctx.strokeStyle = content.summaryTone ? summaryTone : c.accent;
  ctx.lineWidth = 2.5;
  roundRect(ctx, pad, summaryY, inner, summaryH, 32);
  ctx.stroke();

  ctx.fillStyle = c.muted;
  ctx.font = font(700, 22);
  ctx.fillText(content.summaryLeftLabel ?? "MOMIO JUSTO COMBINADO", pad + 32, summaryY + 24);
  ctx.fillStyle = c.fg;
  ctx.font = font(800, 42);
  ctx.fillText(content.summaryLeftValue ?? content.mainLine, pad + 32, summaryY + 58);

  const rightSummaryLabel = content.summaryRightLabel ?? "PROBABILIDAD";
  const rightSummaryVal = content.summaryRightValue ?? "";
  ctx.font = font(700, 22);
  const rLblW = ctx.measureText(rightSummaryLabel).width;
  ctx.fillStyle = c.muted;
  ctx.fillText(rightSummaryLabel, pad + inner - 32 - rLblW, summaryY + 24);
  ctx.font = font(800, 42);
  const rValW = ctx.measureText(rightSummaryVal).width;
  ctx.fillStyle = content.summaryTone ? summaryTone : c.success;
  ctx.fillText(rightSummaryVal, pad + inner - 32 - rValW, summaryY + 58);
}

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

  const c: RasterColors = {
    bg: token(colorSource, "--share-card-bg", "--pl-stage-bg"),
    surface: token(colorSource, "--share-card-surface", "--pl-surface"),
    fg: token(colorSource, "--share-card-fg", "--pl-text"),
    secondary: token(colorSource, "--share-card-secondary", "--pl-text-secondary"),
    muted: token(colorSource, "--share-card-muted", "--pl-text-muted"),
    border: token(colorSource, "--share-card-border", "--pl-border"),
    accent: token(colorSource, "--share-card-accent", "--pl-brand"),
    success: token(colorSource, "--share-card-success", "--pl-success"),
    warning: token(colorSource, "--share-card-warning", "--pl-warning"),
    danger: token(colorSource, "--share-card-danger", "--pl-danger"),
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

  let y = pad + (tall ? (hasLegs ? 42 : 76) : 14);
  ctx.textBaseline = "top";

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

  ctx.fillStyle = c.fg;
  ctx.font = font(800, hasLegs ? 50 : 60);
  for (const line of wrapLines(ctx, content.title, inner).slice(0, 2)) {
    ctx.fillText(line, pad, y);
    y += hasLegs ? 60 : 74;
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
      y + (tall ? 28 : 20),
    );
  } else {
    y += tall ? 96 : 56;

    ctx.font = font(800, 52);
    const mainLines = wrapLines(ctx, content.mainLine, inner - 80).slice(0, 3);
    ctx.font = font(500, 32);
    const detailLines = wrapLines(ctx, content.detailLine, inner - 80).slice(0, 3);
    const boxH = 120 + mainLines.length * 64 + detailLines.length * 44 + 40;
    ctx.fillStyle = c.surface;
    roundRect(ctx, pad, y, inner, boxH, 36);
    ctx.fill();

    let by = y + 40;
    ctx.fillStyle = resolveToneColor(content.badgeTone, c);
    ctx.font = font(800, 30);
    ctx.fillText(content.badge, pad + 40, by);
    ctx.fillStyle = c.fg;
    const unitsW = ctx.measureText(content.units).width;
    ctx.fillText(content.units, pad + inner - 40 - unitsW, by);
    by += 72;
    ctx.font = font(800, 52);
    for (const line of mainLines) {
      ctx.fillText(line, pad + 40, by);
      by += 64;
    }
    ctx.fillStyle = c.secondary;
    ctx.font = font(500, 32);
    for (const line of detailLines) {
      ctx.fillText(line, pad + 40, by + 10);
      by += 44;
    }
  }

  const footY = height - pad - 148;
  ctx.fillStyle = c.surface;
  roundRect(ctx, pad, footY, inner, 148, 32);
  ctx.fill();
  ctx.fillStyle = c.fg;
  ctx.font = font(800, 31);
  ctx.fillText(truncateTextToWidth(ctx, content.footerLine, inner - 68), pad + 34, footY + 30);
  ctx.fillStyle = c.muted;
  ctx.font = font(700, 25);
  const wmText = truncateTextToWidth(ctx, content.watermark, 320);
  const wmW = ctx.measureText(wmText).width;
  ctx.fillText(wmText, pad + inner - 34 - wmW, footY + 86);
  ctx.font = font(500, 25);
  const subMaxW = inner - 68 - wmW - 24;
  ctx.fillText(truncateTextToWidth(ctx, content.footerSub, subMaxW), pad + 34, footY + 86);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar el PNG"))), "image/png");
  });
}

export async function downloadTicketPng(
  content: TicketRasterContent,
  colorSource: Element,
  fileName: string,
): Promise<"shared" | "downloaded"> {
  const blob = await renderTicketPng(content, colorSource);

  if (typeof navigator !== "undefined" && typeof File !== "undefined") {
    try {
      const file = new File([blob], fileName, { type: "image/png" });
      const shareData: ShareData = {
        files: [file],
        title: `${content.title} · PitchLab`,
        text: `${content.mainLine} · ${content.footerLine}`,
      };
      if (
        typeof navigator.canShare === "function" &&
        typeof navigator.share === "function" &&
        navigator.canShare(shareData)
      ) {
        await navigator.share(shareData);
        return "shared";
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "shared";
      }
    }
  }

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
  return "downloaded";
}
