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
