import React from "react";
import { BrandLogo } from "../../brand-logo";
import { PublicNavBarClient, type PublicNavPath } from "./PublicNavBarClient";

export type { PublicNavPath };

function buildFooterLinks(activePath?: PublicNavPath) {
  const isHome = activePath === "/";
  return [
    {
      title: "Producto",
      links: [
        { href: isHome ? "#que-obtienes" : "/#que-obtienes", label: "Funciones" },
        { href: isHome ? "#hoy" : "/#hoy", label: "Comparador" },
        { href: "/precio", label: "Precio" },
        { href: "/blog", label: "Blog" },
      ],
    },
    {
      title: "Transparencia",
      links: [
        { href: "/motores", label: "Motores" },
        { href: "/resultados", label: "Resultados" },
        { href: "/legal/creditos", label: "Créditos" },
      ],
    },
    {
      title: "Legal",
      links: [
        { href: "/legal/terminos", label: "Términos" },
        { href: "/legal/privacidad", label: "Aviso de privacidad" },
        { href: "/legal/juego-responsable", label: "Juego responsable" },
      ],
    },
  ] as const;
}

/**
 * Shell público Server-First (ADR-051): HTML puro desde el servidor + únicamente
 * la isla cliente liviana `PublicNavBarClient`, sin hidratar pie de página ni
 * arrastrar bundles de gráficas, 3D ni emblemas en `/blog/*` y `/legal/*`.
 */
export function PublicSiteShell({
  activePath,
  children,
  hasSession = false,
  className,
}: {
  activePath?: PublicNavPath;
  hasSession?: boolean;
  /** Clase extra en la raíz, para estilos propios de una página (p. ej. `pl-lp--precio`). */
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const extraClass = className && className !== "pl-lp--clean" ? ` ${className}` : "";
  const footerColumns = buildFooterLinks(activePath);

  return (
    <div className={`pl-stage pl-lp pl-lp--clean${extraClass}`}>
      <a className="skip-link" href="#main">
        Saltar al contenido principal
      </a>
      <PublicNavBarClient activePath={activePath} hasSession={hasSession} />
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="pl-clean-footer">
        <div className="pl-lp-wrap">
          <nav aria-label="Pie" className="pl-clean-footer-links">
            {footerColumns.map(({ title, links }) => (
              <div key={title}>
                <h2>{title}</h2>
                <ul>
                  {links.map(({ href, label }) => (
                    <li key={href}>
                      <a href={href}>{label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="pl-clean-footer-note">
            <BrandLogo variant="horizontal" width={113} height={22} alt="PitchLab" lazy />
            <p>Información para decidir · No somos casa de apuestas · +18</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function ClosingCtaSection({
  hasSession = false,
  variant,
}: {
  hasSession?: boolean;
  variant?: "banner";
} = {}): React.JSX.Element {
  void variant;
  return (
    <section className="pl-clean-section pl-clean-closing" aria-labelledby="pl-clean-cta-title">
      <div className="pl-lp-wrap">
        <div className="pl-clean-banner">
          <div className="pl-clean-banner-copy">
            <h2 id="pl-clean-cta-title">Lee el juego con datos.</h2>
            <p>Abre la jornada y compara el momio justo antes de decidir.</p>
            <a className="pl-lp-btn" href={hasSession ? "/app" : "/signup"}>
              Probar 7 días gratis <span aria-hidden="true">→</span>
            </a>
          </div>
          <figure className="pl-clean-banner-render">
            <img
              src="/landing/cta-ball-cards.webp"
              width={1480}
              height={1010}
              loading="lazy"
              decoding="async"
              alt=""
            />
          </figure>
        </div>
      </div>
    </section>
  );
}
