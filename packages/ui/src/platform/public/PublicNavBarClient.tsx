"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { BrandLogo } from "../../brand-logo";
import { ThemeToggle } from "../../primitives";

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

/**
 * Isla cliente liviana para la barra pública: solo maneja el estado del menú móvil,
 * la detección de scroll y el cambio de tema, sin arrastrar 3D, calendarios ni emblemas.
 */
export function PublicNavBarClient({
  activePath,
  hasSession = false,
}: {
  activePath?: PublicNavPath;
  hasSession?: boolean;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const landing = activePath === "/";
  const navItems = landing ? LANDING_NAV_ITEMS : PUBLIC_NAV_ITEMS;
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const scrollMarker = useRef<HTMLSpanElement | null>(null);
  const drawerId = useId();

  useEffect(() => {
    setMenuOpen(false);
  }, [activePath]);

  useEffect(() => {
    if (!scrollMarker.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setScrolled(!entry.isIntersecting);
    });
    observer.observe(scrollMarker.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth >= 900) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen]);

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
                href={hasSession ? "/app" : "/login"}
              >
                {hasSession ? "Ir a la app" : "Entrar"}
              </a>
              <a
                className="pl-lp-btn pl-lp-btn--compact pl-lp-btn-primary pl-lp-bar-cta"
                href={hasSession ? "/app" : "/signup"}
              >
                Probar 7 días
              </a>
              <button
                ref={menuBtnRef}
                type="button"
                className="pl-lp-menu-btn"
                aria-label="Abrir menú"
                aria-expanded={menuOpen}
                aria-controls={drawerId}
                onClick={() => setMenuOpen((prev) => !prev)}
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

          {menuOpen ? (
            <div
              id={drawerId}
              className="pl-lp-mobile-menu glass-card glass-ring"
              role="region"
              aria-label="Menú principal móvil"
            >
              {navItems.map((item) => (
                <a
                  key={item.href}
                  className="pl-lp-navlink"
                  href={item.href}
                  aria-current={activePath === item.href ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <a
                className="pl-lp-btn pl-lp-btn-primary"
                href={hasSession ? "/app" : "/signup"}
                onClick={() => setMenuOpen(false)}
              >
                Probar 7 días gratis{" "}
                <span className="pl-lp-arr" aria-hidden="true">
                  →
                </span>
              </a>
            </div>
          ) : null}
        </div>
      </header>
    </>
  );
}
