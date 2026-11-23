import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateMetadata as generatePublicPickMetadata } from "../app/p/[pickId]/page";
import { loadPublicShareProfile } from "../src/server/public-profile";
import { resolveShortInviteTarget } from "../src/server/short-invite";

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(TESTS_DIR, "..");
const REPO_ROOT = resolve(WEB_ROOT, "../..");

function collectFilesRecursive(dir: string, exts: readonly string[]): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectFilesRecursive(full, exts));
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

describe("Contratos del embudo público, ISR y FD-16", () => {
  it("las rutas públicas ISR exportan revalidate > 0 y no leen cookies ni headers en SSR", () => {
    const isrPages = [
      "app/page.tsx",
      "app/motores/page.tsx",
      "app/resultados/page.tsx",
      "app/verificacion/page.tsx",
      "app/blog/page.tsx",
      "app/blog/[slug]/page.tsx",
    ];

    for (const rel of isrPages) {
      const source = readFileSync(join(WEB_ROOT, rel), "utf8");
      const match = /export const revalidate\s*=\s*(\d+)\s*;/.exec(source);
      expect(match, `${rel} debe exportar revalidate numérico`).not.toBeNull();
      const revalidateValue = match?.[1] ? Number.parseInt(match[1], 10) : 0;
      expect(revalidateValue).toBeGreaterThan(0);
      expect(source).not.toMatch(/from\s+["']next\/headers["']/);
      expect(source).not.toMatch(/\bcookies\s*\(/);
      expect(source).not.toMatch(/\bheaders\s*\(/);
    }
  });

  it("las superficies públicas usan primitivas Editorial* neutrales y cero fugas Sofascore en RSC", () => {
    expect(
      existsSync(join(REPO_ROOT, "packages/ui/src/components/ui/sofascore-surface.tsx")),
    ).toBe(false);
    expect(
      existsSync(join(REPO_ROOT, "packages/ui/src/components/ui/editorial-surface.tsx")),
    ).toBe(true);

    const publicUiFiles = collectFilesRecursive(
      join(REPO_ROOT, "packages/ui/src/platform/public"),
      [".ts", ".tsx"],
    );
    expect(publicUiFiles.length).toBeGreaterThan(0);
    for (const filePath of publicUiFiles) {
      const content = readFileSync(filePath, "utf8");
      expect(content, `${filePath} no debe importar símbolos Sofascore*`).not.toMatch(
        /\bSofascore(?:Card|KpiStrip|KpiItem|Table|TableColumn|Tabs|TabItem|FilterBar|EmptyState|ValueCell|SignalPair)\b/,
      );
      expect(content).not.toContain("sofascore-surface");
    }

    const webAppFiles = collectFilesRecursive(join(WEB_ROOT, "app"), [".ts", ".tsx"]);
    for (const filePath of webAppFiles) {
      const content = readFileSync(filePath, "utf8");
      expect(content).not.toMatch(
        /\bSofascore(?:Card|KpiStrip|Table|Tabs|FilterBar|EmptyState|ValueCell|SignalPair)\b/,
      );
      expect(content).not.toContain("sofascore-surface");
    }
  });

  it("conserva objetivos táctiles >= 44 px en móvil para navegación blog, Línea de la Vida y enlaces auth/referidos", () => {
    const blogSurfaces = readFileSync(
      join(REPO_ROOT, "packages/ui/src/platform/public/BlogSurfaces.tsx"),
      "utf8",
    );
    expect(blogSurfaces).toContain("min-h-11 min-w-11");
    expect(blogSurfaces).toContain('href="tel:8009112000" className="inline-flex min-h-11');

    const authOnboarding = readFileSync(
      join(REPO_ROOT, "packages/ui/src/platform/public/AuthAndOnboardingSurfaces.tsx"),
      "utf8",
    );
    expect(authOnboarding).toContain("inline-flex min-h-11 sm:min-h-0 items-center");

    const v4Css = readFileSync(join(WEB_ROOT, "app/pitchlab-v4.css"), "utf8");
    expect(v4Css).toMatch(/\.pl-referral-code-btn\s*\{[^}]*min-height:\s*44px[^}]*min-width:\s*44px/s);
    expect(v4Css).toMatch(/\.pl-referral-login-link\s*\{[^}]*min-height:\s*44px[^}]*min-width:\s*44px/s);
    expect(v4Css).toMatch(/\.pl-auth-link\s*\{[^}]*min-height:\s*44px[^}]*min-width:\s*44px/s);
  });

  it("resuelve invitación corta /i/SOFIA5 sin BD y mantiene Cero-Fuga en /u y /p", async () => {
    const invite = await resolveShortInviteTarget("SOFIA5", {
      accountsEnabled: false,
      db: null,
    });
    expect(invite.valid).toBe(true);
    expect(invite.code).toBe("SOFIA5");
    expect(invite.handle).toBeNull();
    expect(invite.redirectTo).toBe("/pricing/referral?code=SOFIA5");

    const prevDbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const publicProfile = await loadPublicShareProfile("sofia_nfl");
      expect(publicProfile).toBeNull();
    } finally {
      if (prevDbUrl !== undefined) {
        process.env.DATABASE_URL = prevDbUrl;
      }
    }

    const pickMeta = await generatePublicPickMetadata({
      params: Promise.resolve({ pickId: "carlos-sem" }),
    });
    expect(pickMeta.robots).toEqual({ index: false, follow: true });
  });
});
