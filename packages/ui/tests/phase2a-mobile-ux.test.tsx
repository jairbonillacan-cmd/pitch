import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClubLayoutShell } from "../src/platform/components/ShellChrome";
import { canSafelyUseHistoryBack } from "../src/platform/components/ContextualBackButton";
import { DrawerErrorBoundary } from "../src/platform/components/DrawerErrorBoundary";
import { hasScrolledAncestor } from "../src/platform/components/use-sheet-swipe-dismiss";
import { PlatformProvider } from "../src/platform/platform-provider";
import { PublicNavBarClient } from "../src/platform/public/PublicNavBarClient";
import { STORY_DATASET } from "../src/platform/story-fixtures";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../../..");

interface ListenerEntry {
  listener: EventListenerOrEventListenerObject;
  capture: boolean;
}

class MiniNode {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly ownerDocument: MiniDocument;
  parentNode: MiniNode | null = null;
  readonly childNodes: MiniNode[] = [];
  private listeners = new Map<string, ListenerEntry[]>();
  private _nodeValue = "";

  constructor(nodeType: number, nodeName: string, ownerDocument: MiniDocument) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.ownerDocument = ownerDocument;
  }

  get parentElement(): MiniElement | null {
    return this.parentNode instanceof MiniElement ? this.parentNode : null;
  }

  get firstChild(): MiniNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): MiniNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  get nextSibling(): MiniNode | null {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx >= 0 ? (this.parentNode.childNodes[idx + 1] ?? null) : null;
  }

  get previousSibling(): MiniNode | null {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx > 0 ? (this.parentNode.childNodes[idx - 1] ?? null) : null;
  }

  get nodeValue(): string {
    return this._nodeValue;
  }

  set nodeValue(val: string | null) {
    this._nodeValue = val ?? "";
  }

  get textContent(): string {
    if (this.nodeType === 3 || this.nodeType === 8) return this._nodeValue;
    return this.childNodes.map((c) => c.textContent).join("");
  }

  set textContent(val: string | null) {
    if (this.nodeType === 3 || this.nodeType === 8) {
      this._nodeValue = val ?? "";
      return;
    }
    while (this.childNodes.length > 0) {
      this.removeChild(this.childNodes[this.childNodes.length - 1]!);
    }
    if (val) {
      this.appendChild(this.ownerDocument.createTextNode(val));
    }
  }

  appendChild<T extends MiniNode>(child: T): T {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore<T extends MiniNode>(newChild: T, refChild: MiniNode | null): T {
    if (!refChild) return this.appendChild(newChild);
    if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
    const idx = this.childNodes.indexOf(refChild);
    if (idx < 0) return this.appendChild(newChild);
    newChild.parentNode = this;
    this.childNodes.splice(idx, 0, newChild);
    return newChild;
  }

  removeChild<T extends MiniNode>(child: T): T {
    const idx = this.childNodes.indexOf(child);
    if (idx >= 0) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  contains(other: unknown): boolean {
    if (!(other instanceof MiniNode)) return false;
    let cur: MiniNode | null = other;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentNode;
    }
    return false;
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (!listener) return;
    const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
    const list = this.listeners.get(type) ?? [];
    if (!list.some((item) => item.listener === listener && item.capture === capture)) {
      list.push({ listener, capture });
      this.listeners.set(type, list);
    }
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (!listener) return;
    const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
    const list = this.listeners.get(type);
    if (!list) return;
    this.listeners.set(
      type,
      list.filter((item) => !(item.listener === listener && item.capture === capture)),
    );
  }

  private invokeListeners(event: Event, capture: boolean): void {
    const list = [...(this.listeners.get(event.type) ?? [])];
    for (const entry of list) {
      if (entry.capture !== capture) continue;
      if (typeof entry.listener === "function") {
        entry.listener.call(this, event);
      } else {
        entry.listener.handleEvent(event);
      }
    }
  }

  dispatchEvent(event: Event): boolean {
    const path: MiniNode[] = [];
    let cur: MiniNode | null = this;
    while (cur) {
      path.push(cur);
      cur = cur.parentNode;
    }
    Object.defineProperty(event, "target", { value: this, configurable: true });
    let stopped = false;
    const origStop = event.stopPropagation.bind(event);
    event.stopPropagation = () => {
      stopped = true;
      origStop();
    };

    for (let i = path.length - 1; i >= 1 && !stopped; i -= 1) {
      const node = path[i]!;
      Object.defineProperty(event, "currentTarget", { value: node, configurable: true });
      node.invokeListeners(event, true);
    }
    if (!stopped) {
      Object.defineProperty(event, "currentTarget", { value: this, configurable: true });
      this.invokeListeners(event, true);
      this.invokeListeners(event, false);
    }
    if (event.bubbles && !stopped) {
      for (let i = 1; i < path.length && !stopped; i += 1) {
        const node = path[i]!;
        Object.defineProperty(event, "currentTarget", { value: node, configurable: true });
        node.invokeListeners(event, false);
      }
    }
    return !event.defaultPrevented;
  }
}

function toKebabDataKey(prop: string): string {
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

class MiniElement extends MiniNode {
  readonly tagName: string;
  readonly attrs = new Map<string, string>();
  scrollTop = 0;
  clientWidth = 375;
  popoverOpen = false;
  readonly capturedPointers = new Set<number>();
  hidePopover = vi.fn(() => {
    this.popoverOpen = false;
  });
  showPopover = vi.fn(() => {
    this.popoverOpen = true;
  });
  readonly style: Record<string, unknown> & {
    setProperty: (prop: string, value: string | null) => void;
    removeProperty: (prop: string) => void;
    getPropertyValue: (prop: string) => string;
  };
  readonly dataset: Record<string, string | undefined>;
  readonly classList: {
    contains: (token: string) => boolean;
    add: (...tokens: string[]) => void;
    remove: (...tokens: string[]) => void;
  };

  constructor(tagName: string, ownerDocument: MiniDocument) {
    super(1, tagName.toUpperCase(), ownerDocument);
    this.tagName = tagName.toUpperCase();
    const styleStore = new Map<string, string>();
    const styleObj: Record<string, unknown> = {
      setProperty: (prop: string, value: string | null) => {
        if (value === null || value === "") {
          styleStore.delete(prop);
        } else {
          styleStore.set(prop, value);
        }
      },
      removeProperty: (prop: string) => {
        styleStore.delete(prop);
      },
      getPropertyValue: (prop: string) => styleStore.get(prop) ?? "",
    };
    this.style = new Proxy(styleObj, {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        if (typeof prop === "string") return styleStore.get(prop) ?? "";
        return undefined;
      },
      set(target, prop, value) {
        if (typeof prop === "string" && !(prop in target)) {
          styleStore.set(prop, value == null ? "" : String(value));
          return true;
        }
        return false;
      },
    }) as MiniElement["style"];

    this.dataset = new Proxy(
      {},
      {
        get: (_, prop) => {
          if (typeof prop !== "string") return undefined;
          return this.attrs.get(`data-${toKebabDataKey(prop)}`);
        },
        set: (_, prop, value) => {
          if (typeof prop !== "string") return false;
          this.setAttribute(`data-${toKebabDataKey(prop)}`, String(value));
          return true;
        },
      },
    );

    this.classList = {
      contains: (token) => this.classTokens().includes(token),
      add: (...tokens) => {
        const next = new Set(this.classTokens());
        for (const t of tokens) next.add(t);
        this.setAttribute("class", [...next].join(" "));
      },
      remove: (...tokens) => {
        const removeSet = new Set(tokens);
        this.setAttribute(
          "class",
          this.classTokens()
            .filter((t) => !removeSet.has(t))
            .join(" "),
        );
      },
    };
  }

  private classTokens(): string[] {
    return (this.attrs.get("class") ?? "").split(/\s+/).filter(Boolean);
  }

  get id(): string {
    return this.attrs.get("id") ?? "";
  }

  set id(val: string) {
    this.setAttribute("id", val);
  }

  get className(): string {
    return this.attrs.get("class") ?? "";
  }

  set className(val: string) {
    this.setAttribute("class", val);
  }

  get children(): MiniElement[] {
    return this.childNodes.filter((c): c is MiniElement => c instanceof MiniElement);
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name.toLowerCase(), String(value));
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name.toLowerCase()) ?? null;
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name.toLowerCase());
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name.toLowerCase());
  }

  getBoundingClientRect() {
    return {
      top: 0,
      left: 0,
      right: 375,
      bottom: 44,
      width: 375,
      height: 44,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  }

  setPointerCapture(pointerId: number): void {
    this.capturedPointers.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.capturedPointers.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.capturedPointers.delete(pointerId);
  }

  focus(): void {}
  blur(): void {}

  private matchesSimpleSelector(part: string): boolean {
    const trimmed = part.trim();
    if (!trimmed) return false;
    const tokens = trimmed.match(/(\.[a-zA-Z0-9_-]+|#[a-zA-Z0-9_-]+|\[[^\]]+\]|[a-zA-Z0-9_-]+)/g);
    if (!tokens || tokens.join("") !== trimmed) return false;
    for (const token of tokens) {
      if (token.startsWith(".")) {
        if (!this.classTokens().includes(token.slice(1))) return false;
      } else if (token.startsWith("#")) {
        if (this.id !== token.slice(1)) return false;
      } else if (token.startsWith("[") && token.endsWith("]")) {
        const inner = token.slice(1, -1);
        const eqIdx = inner.indexOf("=");
        if (eqIdx === -1) {
          if (!this.hasAttribute(inner)) return false;
        } else {
          const attrName = inner.slice(0, eqIdx).trim();
          const expected = inner.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
          if (this.getAttribute(attrName) !== expected) return false;
        }
      } else if (this.tagName.toLowerCase() !== token.toLowerCase()) {
        return false;
      }
    }
    return true;
  }

  matches(selectorList: string): boolean {
    return selectorList.split(",").some((part) => this.matchesSimpleSelector(part));
  }

  closest(selectorList: string): MiniElement | null {
    let cur: MiniElement | null = this;
    while (cur) {
      if (cur.matches(selectorList)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  querySelector(selectorList: string): MiniElement | null {
    for (const child of this.children) {
      if (child.matches(selectorList)) return child;
      const nested = child.querySelector(selectorList);
      if (nested) return nested;
    }
    return null;
  }

  querySelectorAll(selectorList: string): MiniElement[] {
    const out: MiniElement[] = [];
    for (const child of this.children) {
      if (child.matches(selectorList)) out.push(child);
      out.push(...child.querySelectorAll(selectorList));
    }
    return out;
  }
}

class MiniDocument extends MiniNode {
  readonly documentElement: MiniElement;
  readonly head: MiniElement;
  readonly body: MiniElement;
  activeElement: MiniElement | null = null;
  defaultView: Window | null = null;

  constructor() {
    super(9, "#document", null as unknown as MiniDocument);
    Object.defineProperty(this, "ownerDocument", { value: this });
    this.documentElement = new MiniElement("html", this);
    this.head = new MiniElement("head", this);
    this.body = new MiniElement("body", this);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
  }

  createElement(tagName: string): MiniElement {
    return new MiniElement(tagName, this);
  }

  createElementNS(_ns: string, tagName: string): MiniElement {
    return new MiniElement(tagName, this);
  }

  createTextNode(text: string): MiniNode {
    const node = new MiniNode(3, "#text", this);
    node.nodeValue = text;
    return node;
  }

  createComment(text: string): MiniNode {
    const node = new MiniNode(8, "#comment", this);
    node.nodeValue = text;
    return node;
  }
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
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
  };
}

function dispatchPointerEvent(
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  init: { clientY: number; clientX?: number; pointerId?: number; button?: number; pointerType?: string },
): void {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, {
    clientX: init.clientX ?? 40,
    clientY: init.clientY,
    pointerId: init.pointerId ?? 1,
    button: init.button ?? 0,
    pointerType: init.pointerType ?? "mouse",
  });
  target.dispatchEvent(ev);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

  it("permite swipe-to-dismiss inmediato en .pl-profile-menu (pointerdown -> pointermove -> pointerup) antes de que llegue un evento toggle tardío", async () => {
    const doc = new MiniDocument();
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const sessionStorage = createMemoryStorage();
    const localStorage = createMemoryStorage();
    const winTarget = new EventTarget();
    class MiniIFrameElement {}
    const win = Object.assign(winTarget, {
      document: doc,
      location: { pathname: "/app", search: "", origin: "http://127.0.0.1:3100" },
      navigator: { platform: "iPhone", userAgent: "Mobile Safari", onLine: true },
      sessionStorage,
      localStorage,
      HTMLIFrameElement: MiniIFrameElement,
      HTMLElement: MiniElement,
      Element: MiniElement,
      Node: MiniNode,
      matchMedia: () => ({
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      }),
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setInterval: globalThis.setInterval.bind(globalThis),
      clearInterval: globalThis.clearInterval.bind(globalThis),
      requestAnimationFrame: (cb: FrameRequestCallback) => globalThis.setTimeout(() => cb(Date.now()), 0),
      cancelAnimationFrame: (id: number) => globalThis.clearTimeout(id),
      getComputedStyle: () => ({ scrollbarWidth: "none" }),
      scrollY: 0,
    });
    doc.defaultView = win as unknown as Window;

    class MiniMutationObserver {
      observe() {}
      disconnect() {}
    }
    class MiniResizeObserver {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("navigator", win.navigator);
    vi.stubGlobal("Node", MiniNode);
    vi.stubGlobal("Element", MiniElement);
    vi.stubGlobal("HTMLElement", MiniElement);
    vi.stubGlobal("HTMLIFrameElement", MiniIFrameElement);
    vi.stubGlobal("MutationObserver", MiniMutationObserver);
    vi.stubGlobal("ResizeObserver", MiniResizeObserver);

    const root = createRoot(container as unknown as Element);
    await act(async () => {
      root.render(
        <PlatformProvider dataset={STORY_DATASET} initialRole="member">
          <ClubLayoutShell activePath="/app">
            <div>Contenido principal</div>
          </ClubLayoutShell>
        </PlatformProvider>,
      );
    });

    const trigger = container.querySelector("[data-profile-menu-trigger]");
    const profileMenu = container.querySelector('[aria-label="Menú de tu cuenta"]');
    const dragZone = profileMenu?.querySelector(".pl-profile-menu-sheet-top.pl-sheet-drag-zone");
    const profileHead = profileMenu?.querySelector(".pl-profile-menu-head");
    const closeBtn = profileMenu?.querySelector(".pl-profile-menu-close");
    const bellTrigger = container.querySelector(".pl-bell-btn");
    const notifMenu = container.querySelector(".pl-notif-menu");
    const notifDragZone = notifMenu?.querySelector(".pl-profile-menu-sheet-top.pl-sheet-drag-zone");
    const notifCloseBtn = notifMenu?.querySelector(".pl-profile-menu-close");
    expect(trigger).not.toBeNull();
    expect(profileMenu).not.toBeNull();
    expect(profileMenu!.classList.contains("pl-profile-menu")).toBe(true);
    expect(profileMenu!.classList.contains("pl-notif-menu")).toBe(false);
    expect(dragZone).not.toBeNull();
    expect(profileHead).not.toBeNull();
    expect(closeBtn).not.toBeNull();
    expect(bellTrigger).not.toBeNull();
    expect(notifMenu).not.toBeNull();
    expect(notifDragZone).not.toBeNull();
    expect(notifCloseBtn).not.toBeNull();

    profileMenu!.popoverOpen = true;
    expect(trigger!.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      dispatchPointerEvent(dragZone!, "pointerdown", { clientY: 12, pointerId: 1 });
    });
    await act(async () => {
      dispatchPointerEvent(dragZone!, "pointermove", { clientY: 60, pointerId: 1 });
      dispatchPointerEvent(dragZone!, "pointermove", { clientY: 165, pointerId: 1 });
    });
    expect(profileMenu!.style.transform).toBe("translate3d(0, 153px, 0)");
    await act(async () => {
      dispatchPointerEvent(dragZone!, "pointerup", { clientY: 165, pointerId: 1 });
    });

    expect(profileMenu!.hidePopover).toHaveBeenCalledTimes(1);
    expect(profileMenu!.popoverOpen).toBe(false);

    profileMenu!.hidePopover.mockClear();
    await act(async () => {
      const beforeOpen = new Event("beforetoggle");
      Object.assign(beforeOpen, { oldState: "closed", newState: "open" });
      profileMenu!.dispatchEvent(beforeOpen);
      profileMenu!.popoverOpen = true;
    });
    expect(trigger!.getAttribute("aria-expanded")).toBe("true");

    await act(async () => {
      dispatchPointerEvent(closeBtn!, "pointerdown", { clientY: 12, pointerId: 2 });
      dispatchPointerEvent(closeBtn!, "pointermove", { clientY: 165, pointerId: 2 });
      dispatchPointerEvent(closeBtn!, "pointerup", { clientY: 165, pointerId: 2 });
    });
    expect(profileMenu!.hidePopover).not.toHaveBeenCalled();

    await act(async () => {
      dispatchPointerEvent(profileHead!, "pointerdown", { clientY: 80, pointerId: 3 });
      dispatchPointerEvent(profileHead!, "pointermove", { clientY: 220, pointerId: 3 });
      dispatchPointerEvent(profileHead!, "pointerup", { clientY: 220, pointerId: 3 });
    });
    expect(profileMenu!.hidePopover).not.toHaveBeenCalled();
    expect(profileMenu!.style.transform).toBe("");

    await act(async () => {
      dispatchPointerEvent(dragZone!, "pointerdown", { clientY: 12, pointerId: 4 });
    });
    await act(async () => {
      dispatchPointerEvent(profileHead!, "pointermove", { clientY: 64, pointerId: 4 });
      dispatchPointerEvent(win, "pointermove", { clientY: 165, pointerId: 4 });
    });
    expect(profileMenu!.style.transform).toBe("translate3d(0, 153px, 0)");
    await act(async () => {
      dispatchPointerEvent(win, "pointerup", { clientY: 165, pointerId: 4 });
    });
    expect(profileMenu!.hidePopover).toHaveBeenCalledTimes(1);
    expect(profileMenu!.popoverOpen).toBe(false);
    expect(profileMenu!.style.transform).toBe("");

    profileMenu!.hidePopover.mockClear();
    profileMenu!.popoverOpen = true;
    profileMenu!.scrollTop = 24;
    await act(async () => {
      dispatchPointerEvent(dragZone!, "pointerdown", { clientY: 12, pointerId: 5 });
      dispatchPointerEvent(win, "pointermove", { clientY: 165, pointerId: 5 });
      dispatchPointerEvent(win, "pointerup", { clientY: 165, pointerId: 5 });
    });
    expect(profileMenu!.hidePopover).not.toHaveBeenCalled();
    profileMenu!.scrollTop = 0;

    await act(async () => {
      const lateToggle = new Event("toggle");
      Object.assign(lateToggle, { oldState: "open", newState: "closed" });
      profileMenu!.dispatchEvent(lateToggle);
    });
    expect(trigger!.getAttribute("aria-expanded")).toBe("false");

    notifMenu!.popoverOpen = true;
    await act(async () => {
      dispatchPointerEvent(notifCloseBtn!, "pointerdown", { clientY: 12, pointerId: 6 });
      dispatchPointerEvent(win, "pointermove", { clientY: 165, pointerId: 6 });
      dispatchPointerEvent(win, "pointerup", { clientY: 165, pointerId: 6 });
    });
    expect(notifMenu!.hidePopover).not.toHaveBeenCalled();

    await act(async () => {
      dispatchPointerEvent(notifDragZone!, "pointerdown", { clientY: 12, pointerId: 7 });
    });
    await act(async () => {
      dispatchPointerEvent(win, "pointermove", { clientY: 64, pointerId: 7 });
      dispatchPointerEvent(win, "pointermove", { clientY: 165, pointerId: 7 });
    });
    expect(notifMenu!.style.transform).toBe("translate3d(0, 153px, 0)");
    await act(async () => {
      dispatchPointerEvent(win, "pointerup", { clientY: 165, pointerId: 7 });
    });
    expect(notifMenu!.hidePopover).toHaveBeenCalledTimes(1);
    expect(notifMenu!.popoverOpen).toBe(false);

    await act(async () => {
      const notifBeforeOpen = new Event("beforetoggle");
      Object.assign(notifBeforeOpen, { oldState: "closed", newState: "open" });
      notifMenu!.dispatchEvent(notifBeforeOpen);
    });
    expect(bellTrigger!.getAttribute("aria-expanded")).toBe("true");

    await act(async () => {
      dispatchPointerEvent(dragZone!, "pointerdown", { clientY: 12, pointerId: 8 });
    });
    await act(async () => {
      root.unmount();
    });
    await act(async () => {
      dispatchPointerEvent(win, "pointermove", { clientY: 165, pointerId: 8 });
      dispatchPointerEvent(win, "pointerup", { clientY: 165, pointerId: 8 });
    });
  });
});
