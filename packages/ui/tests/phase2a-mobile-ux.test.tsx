import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { canSafelyUseHistoryBack } from "../src/platform/components/ContextualBackButton";
import { DrawerErrorBoundary } from "../src/platform/components/DrawerErrorBoundary";
import { hasScrolledAncestor } from "../src/platform/components/use-sheet-swipe-dismiss";
import { PublicNavBarClient } from "../src/platform/public/PublicNavBarClient";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../../..");

describe("Fase 2A · UX Móvil App-Like, diálogos nativos y contratos PWA", () => {
  it("bloquea gestos swipe cuando hay un ancestro scrolleado o tira de pestañas/chips", () => {
    const boundary = {
      scrollTop: 0,
      parentElement: null,
      closest: () => null,
    } as unknown as HTMLElement;

    const scrolledChild = {
      scrollTop: 24,
      parentElement: boundary,
      closest: () => null,
    } as unknown as HTMLElement;

    expect(hasScrolledAncestor(scrolledChild, boundary)).toBe(true);

    const cleanDragZoneChild = {
      scrollTop: 0,
      parentElement: boundary,
      closest: (sel: string) =>
        sel.includes(".pl-sheet-drag-zone") ? ({} as Element) : null,
    } as unknown as HTMLElement;

    expect(hasScrolledAncestor(cleanDragZoneChild, boundary)).toBe(false);

    const notifTabChip = {
      scrollTop: 0,
      parentElement: boundary,
      closest: (sel: string) =>
        sel.includes(".pl-notif-tabs") ? ({} as Element) : null,
    } as unknown as HTMLElement;

    expect(hasScrolledAncestor(notifTabChip, boundary)).toBe(true);
  });

  it("canSafelyUseHistoryBack exige historial intra-app o referrer del mismo origen (ignora history.state de deep-links)", () => {
    const store = new Map<string, string>();
    const storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      key: (idx: number) => [...store.keys()][idx] ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
    } satisfies Storage;

    const deepLinkWin = {
      history: { length: 2, state: { __NA: true } } as unknown as History,
      location: { origin: "https://pitchlab.mx" } as unknown as Location,
      sessionStorage: storage,
    };

    expect(canSafelyUseHistoryBack(deepLinkWin, "https://google.com/search?q=pitchlab")).toBe(false);
    expect(canSafelyUseHistoryBack(deepLinkWin, "")).toBe(false);
    expect(canSafelyUseHistoryBack(deepLinkWin, "https://pitchlab.mx/app")).toBe(true);

    store.set("pl-intra-nav-trail", JSON.stringify(["/app", "/app/liga-mx/g/america-vs-chivas"]));
    expect(canSafelyUseHistoryBack(deepLinkWin, "")).toBe(true);
  });

  it("DrawerErrorBoundary renderiza hijos normalmente y expone fallback accesible en SSR si ocurre error controlado", () => {
    const okHtml = renderToStaticMarkup(
      <DrawerErrorBoundary title="Bet Lab">
        <div data-testid="drawer-body">Contenido activo</div>
      </DrawerErrorBoundary>,
    );
    expect(okHtml).toContain("Contenido activo");
  });

  it("PublicNavBarClient renderiza un dialog modal real con enlace Entrar y cierre táctil", () => {
    const visitorHtml = renderToStaticMarkup(<PublicNavBarClient activePath="/" hasSession={false} />);
    expect(visitorHtml).toContain("<dialog");
    expect(visitorHtml).toContain("pl-lp-mobile-dialog");
    expect(visitorHtml).toContain('closedby="any"');
    expect(visitorHtml).toContain('href="/login"');
    expect(visitorHtml).toContain(">Entrar<");
    expect(visitorHtml).not.toContain('role="dialog"');

    const memberHtml = renderToStaticMarkup(<PublicNavBarClient activePath="/precio" hasSession />);
    expect(memberHtml).toContain('href="/app"');
    expect(memberHtml).toContain(">Ir a la app<");
  });

  it("verifica interactiveWidget en layout, badge monocromo PNG en sw.js y esqueletos contextuales de rutas", () => {
    const rootLayout = fs.readFileSync(path.join(REPO_ROOT, "apps/web/app/layout.tsx"), "utf8");
    expect(rootLayout).toContain('interactiveWidget: "resizes-content"');
    expect(rootLayout).toContain("./public-mobile-nav.css");

    const badgePath = path.join(REPO_ROOT, "apps/web/public/brand/app-icons/badge-96.png");
    expect(fs.existsSync(badgePath)).toBe(true);
    const pngBytes = fs.readFileSync(badgePath);
    expect(pngBytes.subarray(0, 4).toString("hex")).toBe("89504e47");
    expect(pngBytes.readUInt32BE(16)).toBe(96);
    expect(pngBytes.readUInt32BE(20)).toBe(96);

    const sw = fs.readFileSync(path.join(REPO_ROOT, "apps/web/public/sw.js"), "utf8");
    expect(sw).toContain('badge: "/brand/app-icons/badge-96.png"');

    for (const skelRel of [
      "apps/web/app/app/alertas/loading.tsx",
      "apps/web/app/app/[league]/arbitros/loading.tsx",
      "apps/web/app/app/[league]/r/[refereeSlug]/loading.tsx",
    ]) {
      const skel = fs.readFileSync(path.join(REPO_ROOT, skelRel), "utf8");
      expect(skel).toContain("pl-route-skel");
      expect(skel).toContain('aria-busy="true"');
    }

    const previewTs = fs.readFileSync(
      path.join(REPO_ROOT, "packages/ui/.storybook/preview.ts"),
      "utf8",
    );
    expect(previewTs).toContain("public-mobile-nav.css");
  });
});
