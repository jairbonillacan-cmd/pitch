import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BRAND_TOKENS, LIGHT_THEME_TOKENS, DERIVED_DARK_TOKENS } from "../src/index";

describe("@pitchlab/tokens", () => {
  it("expone los tokens oficiales de pitchlab-brand sin alterarlos", () => {
    expect(BRAND_TOKENS["--brand-primary"]).toBe("#B49AFF");
    expect(BRAND_TOKENS["--background-primary"]).toBe("#0B1020");
    expect(BRAND_TOKENS["--surface-default"]).toBe("#151E34");
  });

  it("incluye los tokens derivados del tema claro y oscuro según DESIGN_SYSTEM.md §1.1-1.2", () => {
    expect(LIGHT_THEME_TOKENS["--brand-primary"]).toBe("#5940B2");
    expect(LIGHT_THEME_TOKENS["--on-primary"]).toBe("#FFFFFF");
    expect(LIGHT_THEME_TOKENS["--glow"]).toBe("#5940B21f");
    expect(DERIVED_DARK_TOKENS["--on-primary"]).toBe("var(--background-primary)");
    expect(DERIVED_DARK_TOKENS["--glow"]).toBe("#B49AFF26");
  });

  it("genera dist/theme.css con el bloque @theme de Tailwind v4", () => {
    const css = readFileSync(resolve(import.meta.dirname, "../dist/theme.css"), "utf8");
    expect(css).toContain("@theme");
    expect(css).toContain("--color-brand-primary: var(--brand-primary)");
    expect(css).toContain(':root[data-theme="light"]');
  });
});
