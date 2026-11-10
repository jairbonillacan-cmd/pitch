import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dirname, "..");
const BRAND_CSS_PATH = resolve(PKG_DIR, "..", "..", "pitchlab-brand", "tokens", "brand-tokens.css");
const DIST_DIR = join(PKG_DIR, "dist");
const SRC_DIR = join(PKG_DIR, "src");

mkdirSync(DIST_DIR, { recursive: true });
mkdirSync(SRC_DIR, { recursive: true });

const brandCss = readFileSync(BRAND_CSS_PATH, "utf8");

// Extraer pares --variable: valor del bloque :root principal
const rootMatch = brandCss.match(/:root\s*\{([\s\S]*?)\}/);
const rawVars = {};
if (rootMatch && rootMatch[1]) {
  for (const line of rootMatch[1].split(/\r?\n/)) {
    const m = line.match(/^\s*(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/);
    if (m && m[1] && m[2]) {
      rawVars[m[1]] = m[2].trim();
    }
  }
}

const derivedAndLightCss = `
/* Tokens derivados (DESIGN_SYSTEM.md §1.1–1.2) */
:root, :root[data-theme="dark"] {
  color-scheme: dark;
  --bg-canvas: var(--background-primary);
  --bg-subtle: var(--background-secondary);
  --on-primary: #0B1020;
  --brand-primary-hover: #C6B2FF;
  --focus-ring: var(--brand-primary);
  --font-sans: var(--font-family);
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --layout-max: var(--layout-content);
  --radius-xs: 6px;
  --radius-sm: var(--radius-control);
  --radius-md: var(--radius-panel);
  --radius-lg: var(--radius-overlay);
  --time-slow: 420ms;
  --glow: #B49AFF26;
  --shadow-card: 0 4px 16px #0b102033;
  --shadow-mascot: #0b102055;
  --shadow-nav: 0 8px 28px #0b102040;
  --shadow-nav-scrolled: 0 10px 32px #0b102066;
  --shadow-card-hover: 0 10px 24px #0b102040;
  --backdrop-modal: #0b1020b8;
  --backdrop-pin: #0b1020c4;
  --mask-solid: #000000;
  --success-subtle: #132A2E;
  --info-subtle: #182544;
  --warning-subtle: #2B2624;
  --danger-subtle: #2D1E30;

  /* Superficies neutras y biseles ópticos blancos Liquid Glass (landing y cabeceras) */
  --glass-scrim: rgba(11, 16, 32, 0.58);
  --glass-nav: rgba(12, 17, 32, 0.88);
  --glass-lens-bg: rgba(13, 18, 34, 0.90);
  --glass-well-bg: rgba(10, 14, 27, 0.86);
  --glass-card-matte: rgba(13, 19, 35, 0.89);
  --glass-sheen: rgba(255, 255, 255, 0.03);
  --glass-hover-boost: rgba(255, 255, 255, 0.08);
  --glass-corner-hi: rgba(255, 255, 255, 0.76);
  --glass-corner-lo: rgba(255, 255, 255, 0.38);
  --glass-rim-top: rgba(255, 255, 255, 0.44);
  --glass-rim-bot: rgba(255, 255, 255, 0.22);
  --glass-rim-clear: rgba(255, 255, 255, 0);
  --glass-hover-corner-hi: rgba(255, 255, 255, 0.88);
  --glass-hover-corner-lo: rgba(255, 255, 255, 0.50);
  --glass-hover-rim-top: rgba(255, 255, 255, 0.56);
  --glass-hover-rim-bot: rgba(255, 255, 255, 0.30);
  --glass-feat-corner-hi: rgba(255, 255, 255, 0.94);
  --glass-feat-corner-lo: rgba(255, 255, 255, 0.58);
  --glass-feat-rim-top: rgba(255, 255, 255, 0.64);
  --glass-feat-rim-bot: rgba(255, 255, 255, 0.34);
  --glass-ring-shadow: none;

  /* PitchLab v4 · Liquid Glass (estética shows.link + Spacetime Suite v2.1, contraste AA/AAA) */
  --pl-stage-bg: #000000;
  --pl-stage-subtle: #09090B;
  --pl-stage-elevated: #121217;
  --pl-brand: #C4B5FD;
  --pl-brand-solid: #6D28D9;
  --pl-brand-hover: #DDD6FE;
  --pl-accent: #7DD3FC;
  --pl-surface: rgba(255, 255, 255, 0.056);
  --pl-surface-elevated: rgba(255, 255, 255, 0.082);
  --pl-surface-hover: rgba(255, 255, 255, 0.105);
  --pl-surface-active: rgba(255, 255, 255, 0.15);
  --pl-text: #FFFFFF;
  --pl-text-secondary: #E4E4E7;
  --pl-text-muted: #B4B4BE;
  --pl-border: rgba(255, 255, 255, 0.11);
  --pl-border-strong: rgba(255, 255, 255, 0.22);
  --pl-row-rule: rgba(255, 255, 255, 0.085);
  --pl-perf-rule: rgba(180, 180, 190, 0.32);
  --pl-success: #6EE7B7;
  --pl-warning: #FCD34D;
  --pl-danger: #FDA4AF;
  --pl-info: #93C5FD;
  --pl-on-primary: #09090B;
  --pl-on-solid: #FFFFFF;
  --pl-glow: rgba(196, 181, 253, 0.24);
  --pl-glass-scrim: rgba(0, 0, 0, 0.64);
  --pl-glass-scrim-top: rgba(0, 0, 0, 0.32);
  --pl-glass-nav: rgba(6, 6, 9, 0.72);
  --pl-glass-rail: rgba(9, 9, 12, 0.68);
  --pl-glass-lens: rgba(16, 16, 22, 0.78);
  --pl-glass-card: rgba(14, 14, 20, 0.74);
  --pl-glass-pill: rgba(12, 12, 16, 0.86);
  --pl-glass-input: rgba(255, 255, 255, 0.06);
  --pl-ring-top: rgba(255, 255, 255, 0.42);
  --pl-ring-fade: rgba(255, 255, 255, 0.04);
  --pl-ring-bot: rgba(255, 255, 255, 0.20);
  --pl-ring-corner: rgba(255, 255, 255, 0.74);
  --pl-ring-feat-corner: #FFFFFF;
  --pl-ring-feat-top: rgba(255, 255, 255, 0.58);
  --pl-ring-feat-bot: rgba(255, 255, 255, 0.28);
  --pl-card-shadow: 0 10px 30px -8px rgba(0, 0, 0, 0.62);
  --pl-lens-shadow: 0 22px 54px -12px rgba(0, 0, 0, 0.76);
  --pl-atmo-opacity: 0.70;
  --pl-avatar-ring: #000000;
  --pl-psplit-track: rgba(255, 255, 255, 0.14);
  --pl-scrollbar-thumb: rgba(255, 255, 255, 0.18);
  --pl-modal-backdrop: rgba(0, 0, 0, 0.76);
  --pl-aura-default-home: #E5B53A;
  --pl-aura-default-away: #6366F1;

  /* Motores PitchLab Spacetime Suite v2.1 */
  --engine-tachyon: #7DD3FC;
  --engine-singularity: #C4B5FD;
  --engine-minkowski: #6EE7B7;
  --engine-geodesic: #FCD34D;
  --engine-cortex: #F9A8D4;

  /* Boleto exportable 4:5 / 9:16 (siempre estética nocturna editorial) */
  --share-card-bg: #07070A;
  --share-card-surface: rgba(255, 255, 255, 0.06);
  --share-card-fg: #FFFFFF;
  --share-card-secondary: #E4E4E7;
  --share-card-muted: #B4B4BE;
  --share-card-border: rgba(255, 255, 255, 0.16);
  --share-card-accent: #C4B5FD;
  --share-card-success: #6EE7B7;
  --share-card-warning: #FCD34D;

  /* Gradientes de avatar verificados */
  --avatar-grad-1: linear-gradient(135deg, #6D28D9, #2563EB);
  --avatar-grad-2: linear-gradient(135deg, #047857, #0284C7);
  --avatar-grad-3: linear-gradient(135deg, #B45309, #BE123C);
  --avatar-grad-4: linear-gradient(135deg, #4338CA, #7C3AED);
  --avatar-grad-5: linear-gradient(135deg, #0F766E, #4F46E5);
}

:root[data-theme="light"] {
  color-scheme: light;
  --brand-primary: #5940B2;
  --brand-primary-hover: #473294;
  --brand-accent: #1F6F99;
  --background-primary: #F3F5FD;
  --background-secondary: #EAEFF9;
  --background-elevated: #FFFFFF;
  --bg-canvas: var(--background-primary);
  --bg-subtle: var(--background-secondary);
  --surface-default: #FFFFFF;
  --surface-hover: #E9ECF7;
  --surface-active: #E6E0FF;
  --text-primary: #0B1020;
  --text-secondary: #3B4560;
  --text-muted: #505A74;
  --border-default: #D5DAE8;
  --border-strong: #7C87A3;
  --success: #0E6345;
  --warning: #7A4800;
  --danger: #A31D34;
  --info: #2744A3;
  --chart-model: #5940B2;
  --chart-observed: #1F6F99;
  --shadow-overlay: 0 16px 40px #0b10202e;
  --shadow-card: 0 4px 14px #0b102012;
  --on-primary: #FFFFFF;
  --glow: #5940B21f;
  --success-subtle: #E6F5EF;
  --info-subtle: #EBF0FC;
  --warning-subtle: #FDF3E6;
  --danger-subtle: #FCEBEC;

  /* Superficies neutras claras y biseles ópticos blancos Liquid Glass */
  --glass-scrim: rgba(243, 245, 253, 0.58);
  --glass-nav: rgba(248, 250, 255, 0.90);
  --glass-lens-bg: rgba(251, 252, 255, 0.93);
  --glass-well-bg: rgba(240, 244, 252, 0.90);
  --glass-card-matte: rgba(250, 251, 255, 0.92);
  --glass-sheen: rgba(255, 255, 255, 0.92);
  --glass-hover-boost: rgba(11, 16, 32, 0.045);
  --glass-corner-hi: rgba(255, 255, 255, 1);
  --glass-corner-lo: rgba(255, 255, 255, 0.88);
  --glass-rim-top: rgba(255, 255, 255, 0.96);
  --glass-rim-bot: rgba(255, 255, 255, 0.78);
  --glass-rim-clear: rgba(255, 255, 255, 0);
  --glass-hover-corner-hi: rgba(255, 255, 255, 1);
  --glass-hover-corner-lo: rgba(255, 255, 255, 0.94);
  --glass-hover-rim-top: rgba(255, 255, 255, 1);
  --glass-hover-rim-bot: rgba(255, 255, 255, 0.88);
  --glass-feat-corner-hi: rgba(255, 255, 255, 1);
  --glass-feat-corner-lo: rgba(255, 255, 255, 0.96);
  --glass-feat-rim-top: rgba(255, 255, 255, 1);
  --glass-feat-rim-bot: rgba(255, 255, 255, 0.90);
  --glass-ring-shadow: 0 0 0 1px rgba(11, 16, 32, 0.065), 0 8px 24px rgba(18, 25, 54, 0.05);

  /* PitchLab v4 · Liquid Glass Modo Claro (contraste AA/AAA verificado) */
  --pl-stage-bg: #F4F4F7;
  --pl-stage-subtle: #E6E7EE;
  --pl-stage-elevated: #FFFFFF;
  --pl-brand: #5B21B6;
  --pl-brand-solid: #5B21B6;
  --pl-brand-hover: #4C1D95;
  --pl-accent: #0369A1;
  --pl-surface: rgba(255, 255, 255, 0.88);
  --pl-surface-elevated: rgba(255, 255, 255, 0.96);
  --pl-surface-hover: rgba(24, 24, 27, 0.06);
  --pl-surface-active: rgba(91, 33, 182, 0.11);
  --pl-text: #09090B;
  --pl-text-secondary: #27272A;
  --pl-text-muted: #52525B;
  --pl-border: rgba(24, 24, 27, 0.11);
  --pl-border-strong: rgba(24, 24, 27, 0.22);
  --pl-row-rule: rgba(24, 24, 27, 0.085);
  --pl-perf-rule: rgba(82, 82, 91, 0.34);
  --pl-success: #065F46;
  --pl-warning: #92400E;
  --pl-danger: #9F1239;
  --pl-info: #1E40AF;
  --pl-on-primary: #FFFFFF;
  --pl-on-solid: #FFFFFF;
  --pl-glow: rgba(91, 33, 182, 0.15);
  --pl-glass-scrim: rgba(244, 244, 247, 0.78);
  --pl-glass-scrim-top: rgba(244, 244, 247, 0.42);
  --pl-glass-nav: rgba(255, 255, 255, 0.88);
  --pl-glass-rail: rgba(255, 255, 255, 0.90);
  --pl-glass-lens: rgba(255, 255, 255, 0.94);
  --pl-glass-card: rgba(255, 255, 255, 0.90);
  --pl-glass-pill: rgba(255, 255, 255, 0.94);
  --pl-glass-input: rgba(24, 24, 27, 0.045);
  --pl-ring-top: rgba(24, 24, 27, 0.15);
  --pl-ring-fade: rgba(24, 24, 27, 0.06);
  --pl-ring-bot: rgba(24, 24, 27, 0.13);
  --pl-ring-corner: rgba(91, 33, 182, 0.28);
  --pl-ring-feat-corner: rgba(91, 33, 182, 0.52);
  --pl-ring-feat-top: rgba(91, 33, 182, 0.32);
  --pl-ring-feat-bot: rgba(24, 24, 27, 0.16);
  --pl-card-shadow: 0 8px 24px -8px rgba(9, 9, 11, 0.08);
  --pl-lens-shadow: 0 18px 42px -10px rgba(9, 9, 11, 0.12);
  --pl-atmo-opacity: 0.28;
  --pl-avatar-ring: #FFFFFF;
  --pl-psplit-track: rgba(24, 24, 27, 0.13);
  --pl-scrollbar-thumb: rgba(24, 24, 27, 0.22);
  --pl-modal-backdrop: rgba(9, 9, 11, 0.56);
  --pl-aura-default-home: #D97706;
  --pl-aura-default-away: #4F46E5;

  --engine-tachyon: #0369A1;
  --engine-singularity: #5B21B6;
  --engine-minkowski: #065F46;
  --engine-geodesic: #92400E;
  --engine-cortex: #9D174D;
}
`;

const tailwindThemeBlock = `
@theme {
  --color-brand-primary: var(--brand-primary);
  --color-brand-secondary: var(--brand-secondary);
  --color-brand-accent: var(--brand-accent);
  --color-background-primary: var(--background-primary);
  --color-background-secondary: var(--background-secondary);
  --color-background-elevated: var(--background-elevated);
  --color-surface-default: var(--surface-default);
  --color-surface-hover: var(--surface-hover);
  --color-surface-active: var(--surface-active);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-border-default: var(--border-default);
  --color-border-strong: var(--border-strong);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-danger: var(--danger);
  --color-info: var(--info);
  --color-on-primary: var(--on-primary);
  --color-chart-model: var(--chart-model);
  --color-chart-observed: var(--chart-observed);
  --radius-control: var(--radius-control);
  --radius-panel: var(--radius-panel);
  --radius-overlay: var(--radius-overlay);
  --radius-pill: var(--radius-pill);
  --shadow-overlay: var(--shadow-overlay);
  --font-sans: var(--font-family);
}
`;

const tokensCss = `${brandCss}\n${derivedAndLightCss}`;
const themeCss = `@import "tailwindcss";\n${tokensCss}\n${tailwindThemeBlock}`;

writeFileSync(join(DIST_DIR, "tokens.css"), tokensCss, "utf8");
writeFileSync(join(DIST_DIR, "theme.css"), themeCss, "utf8");

const tsContent = `// Generado automáticamente desde pitchlab-brand/tokens/brand-tokens.css — NO EDITAR MANUALMENTE
export const BRAND_TOKENS = ${JSON.stringify(rawVars, null, 2)} as const;

export const LIGHT_THEME_TOKENS = {
  "--brand-primary": "#5940B2",
  "--brand-accent": "#1F6F99",
  "--background-primary": "#F3F5FD",
  "--background-secondary": "#EAEFF9",
  "--background-elevated": "#FFFFFF",
  "--surface-default": "#FFFFFF",
  "--surface-hover": "#E9ECF7",
  "--surface-active": "#E6E0FF",
  "--text-primary": "#0B1020",
  "--text-secondary": "#3B4560",
  "--text-muted": "#505A74",
  "--border-default": "#D5DAE8",
  "--border-strong": "#7C87A3",
  "--success": "#0E6345",
  "--warning": "#7A4800",
  "--danger": "#A31D34",
  "--info": "#2744A3",
  "--chart-model": "#5940B2",
  "--chart-observed": "#1F6F99",
  "--shadow-overlay": "0 16px 40px #0b10202e",
  "--on-primary": "#FFFFFF",
  "--glow": "#5940B21f"
} as const;

export const DERIVED_DARK_TOKENS = {
  "--on-primary": "var(--background-primary)",
  "--glow": "#B49AFF26"
} as const;

export type BrandTokenKey = keyof typeof BRAND_TOKENS;
`;

writeFileSync(join(SRC_DIR, "tokens.generated.ts"), tsContent, "utf8");
console.log("OK [@pitchlab/tokens]: Generados dist/tokens.css, dist/theme.css y src/tokens.generated.ts");
