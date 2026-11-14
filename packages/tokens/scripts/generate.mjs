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
  --pl-stage-elevated: #09090B;
  --pl-brand: #C4B5FD;
  --pl-brand-solid: #7C3AED;
  --pl-brand-hover: #DDD6FE;
  --pl-accent: #7DD3FC;
  --pl-surface: rgba(255, 255, 255, 0.055);
  --pl-surface-elevated: rgba(255, 255, 255, 0.078);
  --pl-surface-hover: rgba(255, 255, 255, 0.095);
  --pl-surface-active: rgba(255, 255, 255, 0.14);
  --pl-text: #FFFFFF;
  --pl-text-secondary: #E4E4E7;
  --pl-text-muted: #B0B0BA;
  --pl-border: rgba(255, 255, 255, 0.10);
  --pl-border-strong: rgba(255, 255, 255, 0.20);
  --pl-row-rule: rgba(255, 255, 255, 0.08);
  --pl-perf-rule: rgba(176, 176, 186, 0.30);
  --pl-success: #6EE7B7;
  --pl-warning: #FBBF24;
  --pl-danger: #FDA4AF;
  --pl-info: #7DD3FC;
  --pl-on-primary: #000000;
  --pl-on-solid: #FFFFFF;
  --pl-glow: rgba(196, 181, 253, 0.24);
  --pl-btn-primary-bg: #FFFFFF;
  --pl-btn-primary-hover: #E4E4E7;
  --pl-btn-primary-fg: #000000;
  --pl-btn-accent-bg: #7C3AED;
  --pl-btn-accent-hover: #6D28D9;
  --pl-btn-accent-fg: #FFFFFF;
  --pl-glass-scrim-top: rgba(0, 0, 0, 0.34);
  --pl-glass-scrim: rgba(0, 0, 0, 0.72);
  --pl-glass-nav: rgba(4, 4, 7, 0.52);
  --pl-glass-rail: rgba(10, 10, 13, 0.72);
  --pl-glass-menu: rgba(8, 8, 10, 0.98);
  --pl-glass-lens: rgba(255, 255, 255, 0.068);
  --pl-glass-card: rgba(255, 255, 255, 0.052);
  --pl-glass-pill: rgba(12, 12, 16, 0.82);
  --pl-glass-modal: rgba(12, 12, 16, 0.90);
  --pl-table-head-bg: rgba(10, 10, 13, 0.90);
  --pl-glass-input: rgba(255, 255, 255, 0.055);
  --pl-ring-top: rgba(255, 255, 255, 0.34);
  --pl-ring-mid: rgba(255, 255, 255, 0.03);
  --pl-ring-fade: rgba(255, 255, 255, 0.03);
  --pl-ring-bot: rgba(255, 255, 255, 0.16);
  --pl-ring-corner: rgba(255, 255, 255, 0.62);
  --pl-ring-feat-corner: rgba(255, 255, 255, 0.90);
  --pl-ring-feat-top: rgba(255, 255, 255, 0.58);
  --pl-ring-feat-bot: rgba(255, 255, 255, 0.26);
  --pl-card-shadow: 0 8px 28px -6px rgba(0, 0, 0, 0.55);
  --pl-lens-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.72);
  --pl-atmo-opacity: 0.62;
  --pl-avatar-ring: #000000;
  --pl-psplit-track: rgba(255, 255, 255, 0.14);
  --pl-scrollbar-thumb: rgba(255, 255, 255, 0.18);
  --pl-modal-backdrop: rgba(0, 0, 0, 0.78);
  --pl-aura-default-home: #8B5CF6;
  --pl-aura-default-away: #EC4899;
  --pl-aura-1: var(--home-color, var(--pl-aura-default-home));
  --pl-aura-2: var(--away-color, var(--pl-aura-default-away));
  --pl-orb-violet: #8B5CF6;
  --pl-orb-emerald: #10B981;
  --pl-orb-pink: #EC4899;
  --pl-orb-rose: #EC4899;
  --pl-orb-sky: #38BDF8;
  --pl-orb-amber: #F59E0B;
  --pl-orb-opacity: 0.28;
  --pl-orb-opacity-subtle: 0.16;
  --pl-auth-beam: rgba(255, 255, 255, 0.045);
  --pl-auth-lens: rgba(16, 16, 22, 0.72);
  --pl-auth-pane: rgba(255, 255, 255, 0.028);
  --pl-auth-field: rgba(255, 255, 255, 0.038);
  --pl-auth-field-hover: rgba(255, 255, 255, 0.065);
  --pl-google-blue: #4285F4;
  --pl-google-green: #34A853;
  --pl-google-yellow: #FBBC05;
  --pl-google-red: #EA4335;
  --pl-locked-surface: rgba(139, 92, 246, 0.09);
  --pl-compare-surface: rgba(139, 92, 246, 0.09);

  /* Píldoras semánticas con contraste >= 4.5:1 sobre cristal ahumado */
  --pl-pill-brand-fg: #DDD6FE;
  --pl-pill-brand-bg: rgba(139, 92, 246, 0.16);
  --pl-pill-brand-border: rgba(196, 181, 253, 0.30);
  --pl-pill-cortex-fg: #FBCFE8;
  --pl-pill-cortex-bg: rgba(236, 72, 153, 0.15);
  --pl-pill-cortex-border: rgba(249, 168, 212, 0.30);
  --pl-pill-success-fg: #6EE7B7;
  --pl-pill-success-bg: rgba(16, 185, 129, 0.14);
  --pl-pill-success-border: rgba(110, 231, 183, 0.28);
  --pl-pill-warning-fg: #FBBF24;
  --pl-pill-warning-bg: rgba(245, 158, 11, 0.14);
  --pl-pill-warning-border: rgba(251, 191, 36, 0.28);
  --pl-pill-danger-fg: #FECDD3;
  --pl-pill-danger-bg: rgba(244, 63, 94, 0.15);
  --pl-pill-danger-border: rgba(253, 164, 175, 0.28);
  --pl-pill-info-fg: #7DD3FC;
  --pl-pill-info-bg: rgba(14, 165, 233, 0.14);
  --pl-pill-info-border: rgba(125, 211, 252, 0.28);

  /* Motores PitchLab Spacetime Suite v2.1 */
  --engine-tachyon: #7DD3FC;
  --engine-singularity: #C4B5FD;
  --engine-minkowski: #6EE7B7;
  --engine-geodesic: #FBBF24;
  --engine-cortex: #F9A8D4;

  /* Colores de marca de redes sociales (solo para sus logotipos) */
  --social-whatsapp: #25D366;

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
  --pl-stage-bg: #F1F2F6;
  --pl-stage-subtle: #E4E5EC;
  --pl-stage-elevated: #FFFFFF;
  --pl-brand: #5B21B6;
  --pl-brand-solid: #6D28D9;
  --pl-brand-hover: #4C1D95;
  --pl-accent: #075985;
  --pl-surface: rgba(255, 255, 255, 0.86);
  --pl-surface-elevated: rgba(255, 255, 255, 0.96);
  --pl-surface-hover: rgba(24, 24, 27, 0.06);
  --pl-surface-active: rgba(91, 33, 182, 0.11);
  --pl-text: #09090B;
  --pl-text-secondary: #27272A;
  --pl-text-muted: #52525B;
  --pl-border: rgba(24, 24, 27, 0.12);
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
  --pl-btn-primary-bg: #09090B;
  --pl-btn-primary-hover: #27272A;
  --pl-btn-primary-fg: #FFFFFF;
  --pl-btn-accent-bg: #6D28D9;
  --pl-btn-accent-hover: #5B21B6;
  --pl-btn-accent-fg: #FFFFFF;
  --pl-glass-scrim-top: rgba(241, 242, 246, 0.38);
  --pl-glass-scrim: rgba(241, 242, 246, 0.80);
  --pl-glass-nav: rgba(255, 255, 255, 0.90);
  --pl-glass-rail: rgba(255, 255, 255, 0.94);
  --pl-glass-menu: rgba(255, 255, 255, 0.98);
  --pl-glass-lens: rgba(255, 255, 255, 0.98);
  --pl-glass-card: rgba(255, 255, 255, 0.92);
  --pl-glass-pill: rgba(255, 255, 255, 0.92);
  --pl-glass-modal: rgba(255, 255, 255, 0.96);
  --pl-table-head-bg: rgba(255, 255, 255, 0.95);
  --pl-glass-input: rgba(24, 24, 27, 0.045);
  --pl-ring-top: rgba(24, 24, 27, 0.13);
  --pl-ring-mid: rgba(24, 24, 27, 0.08);
  --pl-ring-fade: rgba(24, 24, 27, 0.08);
  --pl-ring-bot: rgba(24, 24, 27, 0.16);
  --pl-ring-corner: rgba(91, 33, 182, 0.28);
  --pl-ring-feat-corner: rgba(91, 33, 182, 0.54);
  --pl-ring-feat-top: rgba(91, 33, 182, 0.34);
  --pl-ring-feat-bot: rgba(24, 24, 27, 0.16);
  --pl-card-shadow: 0 1px 2px rgba(9, 9, 11, 0.04), 0 8px 24px -10px rgba(9, 9, 11, 0.12);
  --pl-lens-shadow: 0 1px 2px rgba(9, 9, 11, 0.05), 0 18px 40px -16px rgba(9, 9, 11, 0.18);
  --pl-atmo-opacity: 0.30;
  --pl-avatar-ring: #FFFFFF;
  --pl-psplit-track: rgba(24, 24, 27, 0.13);
  --pl-scrollbar-thumb: rgba(24, 24, 27, 0.22);
  --pl-modal-backdrop: rgba(9, 9, 11, 0.56);
  --pl-aura-default-home: #7C3AED;
  --pl-aura-default-away: #DB2777;
  --pl-aura-1: var(--home-color, var(--pl-aura-default-home));
  --pl-aura-2: var(--away-color, var(--pl-aura-default-away));
  --pl-orb-violet: #7C3AED;
  --pl-orb-emerald: #059669;
  --pl-orb-pink: #DB2777;
  --pl-orb-rose: #DB2777;
  --pl-orb-sky: #0284C7;
  --pl-orb-amber: #D97706;
  --pl-orb-opacity: 0.14;
  --pl-orb-opacity-subtle: 0.08;
  --pl-auth-beam: rgba(255, 255, 255, 0.60);
  --pl-auth-lens: rgba(255, 255, 255, 0.90);
  --pl-auth-pane: rgba(11, 16, 32, 0.03);
  --pl-auth-field: rgba(24, 24, 27, 0.03);
  --pl-auth-field-hover: #FFFFFF;
  --pl-locked-surface: rgba(109, 40, 217, 0.07);
  --pl-compare-surface: rgba(109, 40, 217, 0.07);

  --pl-pill-brand-fg: #4C1D95;
  --pl-pill-brand-bg: rgba(109, 40, 217, 0.09);
  --pl-pill-brand-border: rgba(109, 40, 217, 0.24);
  --pl-pill-cortex-fg: #831843;
  --pl-pill-cortex-bg: rgba(219, 39, 119, 0.09);
  --pl-pill-cortex-border: rgba(190, 24, 93, 0.24);
  --pl-pill-success-fg: #065F46;
  --pl-pill-success-bg: rgba(5, 150, 105, 0.10);
  --pl-pill-success-border: rgba(6, 95, 70, 0.24);
  --pl-pill-warning-fg: #78350F;
  --pl-pill-warning-bg: rgba(217, 119, 6, 0.11);
  --pl-pill-warning-border: rgba(146, 64, 14, 0.25);
  --pl-pill-danger-fg: #881337;
  --pl-pill-danger-bg: rgba(225, 29, 72, 0.09);
  --pl-pill-danger-border: rgba(159, 18, 57, 0.24);
  --pl-pill-info-fg: #1E3A8A;
  --pl-pill-info-bg: rgba(37, 99, 235, 0.09);
  --pl-pill-info-border: rgba(30, 64, 175, 0.24);

  --engine-tachyon: #075985;
  --engine-singularity: #5B21B6;
  --engine-minkowski: #065F46;
  --engine-geodesic: #92400E;
  --engine-cortex: #9D174D;
  --social-whatsapp: #128C3E;
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

// Colores del escenario oscuro de la landing (--pl-*), para quien no puede usar variables CSS (correos).
const darkStageCss = derivedAndLightCss.slice(0, derivedAndLightCss.indexOf("--pl-stage-bg: #F1F2F6"));
const stageDark = {};
for (const m of darkStageCss.matchAll(/^\s*(--pl-[a-z0-9-]+):\s*((?:#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\)));/gm)) {
  stageDark[m[1]] = m[2];
}

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

export const STAGE_DARK_TOKENS = ${JSON.stringify(stageDark, null, 2)} as const;

export type BrandTokenKey = keyof typeof BRAND_TOKENS;
`;

writeFileSync(join(SRC_DIR, "tokens.generated.ts"), tsContent, "utf8");
console.log("OK [@pitchlab/tokens]: Generados dist/tokens.css, dist/theme.css y src/tokens.generated.ts");
