import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BadgeInfoTrigger } from "../src/platform/components/BadgeInfoTrigger";
import {
  TopLayerModalDialog,
  computeNextRenderedToasts,
  detectDialogScrollContainer,
  shouldAllowDialogSwipeStart,
} from "../src/platform/components/PlatformOverlays";

class FakeHtmlElement {
  readonly tagName: string;
  readonly classListSet: Set<string>;
  scrollTop = 0;
  parentElement: FakeHtmlElement | null = null;
  children: FakeHtmlElement[] = [];

  constructor(tagName: string, classes: string[] = [], scrollTop = 0) {
    this.tagName = tagName.toLowerCase();
    this.classListSet = new Set(classes);
    this.scrollTop = scrollTop;
  }

  append(child: FakeHtmlElement): FakeHtmlElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  contains(other: unknown): boolean {
    if (!(other instanceof FakeHtmlElement)) return false;
    let cur: FakeHtmlElement | null = other;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  matchesSelectorToken(token: string): boolean {
    const clean = token.trim();
    if (!clean) return false;
    if (clean.startsWith(".")) {
      return this.classListSet.has(clean.slice(1));
    }
    return this.tagName === clean.toLowerCase();
  }

  matches(selectorList: string): boolean {
    return selectorList
      .split(",")
      .some((part) => this.matchesSelectorToken(part));
  }

  closest(selectorList: string): FakeHtmlElement | null {
    let cur: FakeHtmlElement | null = this;
    while (cur) {
      if (cur.matches(selectorList)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  querySelector(selectorList: string): FakeHtmlElement | null {
    for (const child of this.children) {
      if (child.matches(selectorList)) return child;
      const nested = child.querySelector(selectorList);
      if (nested) return nested;
    }
    return null;
  }
}

function withFakeHtmlElement<T>(run: () => T): T {
  const globalRecord = globalThis as { HTMLElement?: unknown };
  const hadOwn = Object.prototype.hasOwnProperty.call(globalRecord, "HTMLElement");
  const prev = globalRecord.HTMLElement;
  globalRecord.HTMLElement = FakeHtmlElement;
  try {
    return run();
  } finally {
    if (hadOwn) {
      globalRecord.HTMLElement = prev;
    } else {
      delete globalRecord.HTMLElement;
    }
  }
}

const ROOT = path.resolve(import.meta.dirname, "../../..");

describe("Fase 1: ToastViewport state transitions", () => {
  it("marca toasts removidos como closing y reporta sus IDs fuera del updater de React", () => {
    const t1 = { id: "t-1", tone: "success", text: "Pick sellado" };
    const t2 = { id: "t-2", tone: "default", text: "Segundo aviso" };

    const first = computeNextRenderedToasts([], [t1, t2]);
    expect(first.newlyClosingIds).toEqual([]);
    expect(first.next).toEqual([
      { ...t1, closing: false },
      { ...t2, closing: false },
    ]);

    const dismissedFirst = computeNextRenderedToasts(first.next, [t2]);
    expect(dismissedFirst.newlyClosingIds).toEqual(["t-1"]);
    expect(dismissedFirst.next).toEqual([
      { ...t1, closing: true },
      { ...t2, closing: false },
    ]);
  });

  it("no cancela ni duplica un toast closing cuando llega otro toast nuevo concurrente", () => {
    const prev = [
      { id: "t-1", tone: "success", text: "Cerrando", closing: true },
    ];
    const t3 = { id: "t-3", tone: "warning", text: "Nuevo aviso" };

    const result = computeNextRenderedToasts(prev, [t3]);
    expect(result.newlyClosingIds).toEqual([]);
    expect(result.next).toEqual([
      { id: "t-1", tone: "success", text: "Cerrando", closing: true },
      { ...t3, closing: false },
    ]);
  });

  it("reactiva un toast closing si regresa antes de desmontarse", () => {
    const prev = [
      { id: "t-1", tone: "success", text: "Reactivado", closing: true },
    ];
    const result = computeNextRenderedToasts(prev, [
      { id: "t-1", tone: "success", text: "Reactivado" },
    ]);
    expect(result.newlyClosingIds).toEqual([]);
    expect(result.next).toEqual([
      { id: "t-1", tone: "success", text: "Reactivado", closing: false },
    ]);
  });
});

describe("Fase 1: TopLayerModalDialog scroll containment y swipe-dismiss", () => {
  it("autodetección respeta scrollContainerRef explícito o .pl-sheet-scroll/.pl-prefs-modal-body", () => {
    withFakeHtmlElement(() => {
      const dialog = new FakeHtmlElement("dialog");
      const header = dialog.append(new FakeHtmlElement("div", ["pl-sheet-drag-zone"]));
      const scrollBody = dialog.append(new FakeHtmlElement("div", ["pl-prefs-modal-body"], 48));
      const innerCard = scrollBody.append(new FakeHtmlElement("div", ["card"]));

      const detected = detectDialogScrollContainer(
        dialog as unknown as HTMLElement,
        innerCard as unknown as EventTarget,
      );
      expect(detected).toBe(scrollBody);

      const blocked = shouldAllowDialogSwipeStart({
        dialog: dialog as unknown as HTMLElement,
        target: innerCard as unknown as EventTarget,
      });
      expect(blocked.allow).toBe(false);
      expect(blocked.scrollElement).toBe(scrollBody);

      const headerStart = shouldAllowDialogSwipeStart({
        dialog: dialog as unknown as HTMLElement,
        target: header as unknown as EventTarget,
      });
      expect(headerStart.allow).toBe(true);
      expect(headerStart.scrollElement).toBeNull();

      scrollBody.scrollTop = 0;
      const topBodyStart = shouldAllowDialogSwipeStart({
        dialog: dialog as unknown as HTMLElement,
        target: innerCard as unknown as EventTarget,
      });
      expect(topBodyStart.allow).toBe(true);
      expect(topBodyStart.scrollElement).toBe(scrollBody);
    });
  });

  it("honra un scrollContainerRef explícito cuando está scrolleado", () => {
    withFakeHtmlElement(() => {
      const dialog = new FakeHtmlElement("dialog");
      const customScroller = dialog.append(new FakeHtmlElement("div", ["custom-body"], 24));
      const row = customScroller.append(new FakeHtmlElement("button", ["row-btn"]));

      const explicitRef = {
        current: customScroller as unknown as HTMLElement,
      };
      const blocked = shouldAllowDialogSwipeStart({
        dialog: dialog as unknown as HTMLElement,
        target: row as unknown as EventTarget,
        explicitScrollRef: explicitRef,
      });
      expect(blocked.allow).toBe(false);
      expect(blocked.scrollElement).toBe(customScroller);

      customScroller.scrollTop = 0;
      const allowed = shouldAllowDialogSwipeStart({
        dialog: dialog as unknown as HTMLElement,
        target: row as unknown as EventTarget,
        explicitScrollRef: explicitRef,
      });
      expect(allowed.allow).toBe(true);
      expect(allowed.scrollElement).toBe(customScroller);
    });
  });
});

describe("Fase 1: Ergonomía táctil, badges CSS y contraste WCAG AA en toasts", () => {
  it("BadgeInfoTrigger y TopLayerModalDialog renderizan sin errores en SSR", () => {
    const html = renderToStaticMarkup(
      <BadgeInfoTrigger
        badgeId="ojo-fino"
        family="precision"
        label="Ojo fino"
        criterion=">= 60 % de acierto en 30 picks."
      />,
    );
    expect(html).toContain("pl-badge-icon-btn");
    expect(html).toContain('data-badge-icon="ojo-fino"');
    expect(html).toContain('<span class="sr-only">Ojo fino</span>');
    const badgeTriggerTsx = fs.readFileSync(
      path.join(ROOT, "packages/ui/src/platform/components/BadgeInfoTrigger.tsx"),
      "utf8",
    );
    expect(badgeTriggerTsx).toContain("autoFocus={!isCompactOrCoarse}");

    const scrollRef = { current: null };
    const dialogHtml = renderToStaticMarkup(
      <TopLayerModalDialog
        open
        onClose={() => undefined}
        ariaLabel="Diálogo de prueba"
        scrollContainerRef={scrollRef}
      >
        <div className="pl-sheet-scroll">Contenido</div>
      </TopLayerModalDialog>,
    );
    expect(dialogHtml).toContain("pl-native-dialog");
    expect(dialogHtml).toContain("pl-sheet-scroll");
  });

  it("badges.css aloja .pl-badge-icon-btn (44x44 en táctil/móvil) y pitchlab-v4.css ya no lo duplica", () => {
    const badgesCss = fs.readFileSync(
      path.join(ROOT, "apps/web/app/badges.css"),
      "utf8",
    );
    const v4Css = fs.readFileSync(
      path.join(ROOT, "apps/web/app/pitchlab-v4.css"),
      "utf8",
    );
    expect(badgesCss).toContain(".pl-badge-icon-btn");
    expect(badgesCss).toContain(".pl-badge-info-dialog");
    expect(badgesCss).toMatch(
      /@media \(max-width: 767px\), \(pointer: coarse\)[\s\S]*\.pl-badge-icon-btn[\s\S]*min-inline-size:\s*44px;[\s\S]*min-block-size:\s*44px;/,
    );
    expect(v4Css).not.toContain(".pl-badge-icon-btn");
    expect(v4Css).not.toContain(".pl-badge-info-dialog");
    expect(v4Css).toMatch(
      /\.pl-toast-item\s*\{[\s\S]*background:\s*var\(--pl-glass-pill\);[\s\S]*color:\s*var\(--pl-text\);/,
    );
  });

  it("PlatformOverlays y MaestroPrimitives cumplen targets 44px móvil, 16px input y anti-doble-envío", () => {
    const overlaysTsx = fs.readFileSync(
      path.join(ROOT, "packages/ui/src/platform/components/PlatformOverlays.tsx"),
      "utf8",
    );
    const primitivesTsx = fs.readFileSync(
      path.join(ROOT, "packages/ui/src/platform/components/MaestroPrimitives.tsx"),
      "utf8",
    );
    expect(overlaysTsx).toContain("prevRenderedRef");
    expect(overlaysTsx).toContain("inert={t.closing ? true : undefined}");
    expect(overlaysTsx).toContain("scrollContainerRef?: React.RefObject<HTMLElement | null>");
    expect(overlaysTsx).toContain("disabled={sealing}");
    expect(overlaysTsx).toContain("autoFocus={!isCompactOrCoarse}");
    expect(overlaysTsx).toContain("text-base md:text-sm");
    expect(overlaysTsx).toContain("min-h-11 md:min-h-7");
    expect(overlaysTsx).not.toContain("!min-h-[26px]");
    expect(overlaysTsx).not.toContain("!min-h-[28px]");
    expect(primitivesTsx).toContain("seg-btn min-h-11 md:min-h-7 px-2.5 text-xs");
    expect(primitivesTsx).not.toContain("!min-h-[28px]");
  });
});
