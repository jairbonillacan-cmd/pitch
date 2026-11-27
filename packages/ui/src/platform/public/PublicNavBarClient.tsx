"use client";

import React, { useId, useRef, useState } from "react";
import { BrandLogo } from "../../brand-logo";
import { ThemeToggle } from "../../primitives";
import { useSafeEffect } from "../hooks";

export type PublicNavPath = "/" | "/motores" | "/resultados" | "/precio";

export const PUBLIC_NAV_ITEMS: ReadonlyArray<{
  href: Exclude<PublicNavPath, "/">;
  label: string;
}> = [
  { href: "/motores", label: "Motores" },
  { href: "/resultados", label: "Resultados" },
  { href: "/precio", label: "Precio" },
];

const LANDING_NAV_ITEMS = [
  { href: "#que-obtienes", label: "Funciones" },
  { href: "#motores", label: "Motores" },
  { href: "#precio", label: "Precio" },
  { href: "#faq", label: "Preguntas" },
] as const;

export function PublicNavBarClient({
  activePath,
  hasSession = false,
}: {
  activePath?: PublicNavPath;
  hasSession?: boolean;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [detectedSession, setDetectedSession] = useState(hasSession);
  const effectiveSession = hasSession || detectedSession;
  const landing = activePath === "/";
  const navItems = landing ? LANDING_NAV_ITEMS : PUBLIC_NAV_ITEMS;
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const restoreFocusOnCloseRef = useRef<boolean>(false);
  const scrollMarker = useRef<HTMLSpanElement | null>(null);
  const drawerId = useId();
  const titleId = useId();

  useSafeEffect(() => {
    if (hasSession) {
      setDetectedSession(true);
      return;
    }
    if (typeof window === "undefined" || typeof fetch !== "function") return;
    const controller = new AbortController();
    let alive = true;
    fetch("/api/public/session", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { authenticated?: boolean } | null) => {
        if (alive && !controller.signal.aborted && data?.authenticated === true) {
          setDetectedSession(true);
        }
      })
      .catch((err: unknown) => {
        void err;
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [hasSession]);

  useSafeEffect(() => {
    restoreFocusOnCloseRef.current = false;
    setMenuOpen(false);
  }, [activePath]);

  useSafeEffect(() => {
    if (!scrollMarker.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setScrolled(!entry.isIntersecting);
    });
    observer.observe(scrollMarker.current);
    return () => observer.disconnect();
  }, []);

  useSafeEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (menuOpen && !dialog.open) {
      if (typeof dialog.showModal === "function") {
        try {
          dialog.showModal();
        } catch (err) {
          void err;
          dialog.setAttribute("open", "");
        }
      } else {
        dialog.setAttribute("open", "");
      }
    } else if (!menuOpen && (dialog.open || dialog.hasAttribute("open"))) {
      if (typeof dialog.close === "function" && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [menuOpen]);

  useSafeEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      const shouldRestoreFocus = restoreFocusOnCloseRef.current;
      restoreFocusOnCloseRef.current = false;
      setMenuOpen(false);
      if (shouldRestoreFocus) {
        menuBtnRef.current?.focus({ preventScroll: true });
      }
    };
    const handleCancel = (event: Event) => {
      event.preventDefault();
      restoreFocusOnCloseRef.current = true;
      setMenuOpen(false);
    };
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("cancel", handleCancel);

    const needsLightDismissFallback =
      typeof HTMLDialogElement !== "undefined" &&
      !("closedBy" in HTMLDialogElement.prototype);
    let pressedOutside = false;
    const isBackdropTarget = (e: PointerEvent) => {
      if (e.target !== dialog) return false;
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isBackdropTarget(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isBackdropTarget(e)) {
        restoreFocusOnCloseRef.current = true;
        setMenuOpen(false);
      }
      pressedOutside = false;
    };
    if (needsLightDismissFallback) {
      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
    }

    const onResize = () => {
      if (typeof window !== "undefined" && window.innerWidth >= 900) {
        restoreFocusOnCloseRef.current = false;
        setMenuOpen(false);
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("resize", onResize);
    }
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("cancel", handleCancel);
      if (needsLightDismissFallback) {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", onResize);
      }
    };
  }, []);

  const closeFromDismissControl = () => {
    restoreFocusOnCloseRef.current = true;
    setMenuOpen(false);
  };

  const closeFromNavLink = () => {
    restoreFocusOnCloseRef.current = false;
    setMenuOpen(false);
  };

  return (
    <>
      <span ref={scrollMarker} className="pl-clean-scroll-marker" aria-hidden="true" />
      <header className="pl-lp-header" data-scrolled={scrolled}>
        <div className="pl-lp-wrap">
          <nav aria-label="Principal" className="pl-lp-bar">
            <a href="/" aria-label="PitchLab, inicio" className="pl-lp-logo">
              <BrandLogo variant="horizontal" width={133} height={26} alt="" />
            </a>

            <div className="pl-lp-nav">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  className="pl-lp-navlink"
                  href={item.href}
                  aria-current={activePath === item.href ? "page" : undefined}
                >
                  {item.label}
                </a>
              ))}
            </div>

            <div className="pl-lp-actions">
              <ThemeToggle shape="pill" />
              <a
                className="pl-lp-navlink pl-lp-navlink--login"
                href={effectiveSession ? "/app" : "/login"}
              >
                {effectiveSession ? "Ir a la app" : "Entrar"}
              </a>
              <a
                className="pl-lp-btn pl-lp-btn--compact pl-lp-btn-primary pl-lp-bar-cta"
                href={effectiveSession ? "/app" : "/signup"}
              >
                Probar 7 días
              </a>
              <button
                ref={menuBtnRef}
                type="button"
                className="pl-lp-menu-btn"
                aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
                aria-expanded={menuOpen}
                aria-controls={drawerId}
                onClick={() => {
                  restoreFocusOnCloseRef.current = true;
                  setMenuOpen((prev) => !prev);
                }}
              >
                {menuOpen ? (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                )}
              </button>
            </div>
          </nav>

          <dialog
            ref={dialogRef}
            id={drawerId}
            className="pl-lp-mobile-menu pl-lp-mobile-dialog"
            aria-labelledby={titleId}
            {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
          >
            <div className="pl-lp-mobile-head">
              <span id={titleId} className="pl-lp-mobile-title">
                Explorar PitchLab
              </span>
              <button
                type="button"
                className="pl-lp-mobile-close"
                aria-label="Cerrar menú"
                onClick={closeFromDismissControl}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <nav aria-label="Menú principal móvil" className="pl-lp-mobile-links">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  className="pl-lp-navlink"
                  href={item.href}
                  aria-current={activePath === item.href ? "page" : undefined}
                  onClick={closeFromNavLink}
                >
                  {item.label}
                </a>
              ))}
              <a
                className="pl-lp-navlink pl-lp-mobile-login"
                href={effectiveSession ? "/app" : "/login"}
                onClick={closeFromNavLink}
              >
                {effectiveSession ? "Ir a la app" : "Entrar"}
              </a>
              <a
                className="pl-lp-btn pl-lp-btn-primary"
                href={effectiveSession ? "/app" : "/signup"}
                onClick={closeFromNavLink}
              >
                Probar 7 días gratis{" "}
                <span className="pl-lp-arr" aria-hidden="true">
                  →
                </span>
              </a>
            </nav>
          </dialog>
        </div>
      </header>
    </>
  );
}
