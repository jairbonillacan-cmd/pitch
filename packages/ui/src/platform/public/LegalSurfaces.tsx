import React from "react";
import { ClosingCtaSection, PublicSiteShell } from "./PublicSiteSections";

/**
 * Documentos legales (`/legal/*`) con el mismo lenguaje visual que los artículos del blog:
 * encabezado con ruta de navegación, índice lateral y cuerpo de lectura (`blog.css`).
 * El contenido legal llega como JSX desde cada página; este componente solo lo presenta.
 */

export type LegalDocSlug = "terminos" | "privacidad" | "juego-responsable" | "creditos";

export const LEGAL_DOCS: ReadonlyArray<{ slug: LegalDocSlug; label: string; href: string }> = [
  { slug: "terminos", label: "Términos de uso", href: "/legal/terminos" },
  { slug: "privacidad", label: "Aviso de privacidad", href: "/legal/privacidad" },
  { slug: "juego-responsable", label: "Juego responsable", href: "/legal/juego-responsable" },
  { slug: "creditos", label: "Créditos de datos", href: "/legal/creditos" },
];

export interface LegalSection {
  /** Ancla de la sección (se conserva para enlaces existentes, p. ej. `#comunidad`). */
  id: string;
  title: string;
  body: React.ReactNode;
}

export function LegalDocumentSurface({
  slug,
  eyebrow,
  title,
  lede,
  intro,
  sections,
  hasSession = false,
}: {
  slug: LegalDocSlug;
  eyebrow: string;
  title: string;
  lede: string;
  /** Párrafos antes de la primera sección. */
  intro?: React.ReactNode;
  sections: readonly LegalSection[];
  hasSession?: boolean;
}): React.JSX.Element {
  const showToc = sections.length >= 3;

  return (
    <PublicSiteShell hasSession={hasSession} className="pl-lp--legal">
      <article className="pl-blog-article" aria-labelledby="pl-legal-title">
        <header className="pl-lp-section pl-lp-section--top pl-blog-hero">
          <div className="pl-lp-atmo" aria-hidden="true">
            <div className="pl-lp-orb pl-lp-orb--2" />
          </div>
          <div className="pl-lp-fieldgrid" aria-hidden="true" />
          <div className="pl-lp-wrap pl-blog-hero-inner">
            <div className="pl-lp-section-head pl-blog-head">
              <p className="pl-lp-eyebrow">{eyebrow}</p>
              <h1 id="pl-legal-title" className="pl-lp-h1 pl-lp-h1--page pl-blog-title pl-blog-balance">
                {title}
              </h1>
              <p className="pl-lp-lede pl-blog-lede">{lede}</p>
            </div>
            <nav aria-label="Documentos legales" className="pl-blog-cats">
              <ul>
                {LEGAL_DOCS.map((doc) => (
                  <li key={doc.slug}>
                    <a href={doc.href} aria-current={doc.slug === slug ? "page" : undefined}>
                      {doc.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>

        <div className={`pl-lp-wrap pl-blog-layout${showToc ? " pl-blog-layout--toc" : ""}`}>
          {showToc ? (
            <nav className="pl-blog-toc" aria-labelledby="pl-legal-toc-title">
              <h2 id="pl-legal-toc-title" className="pl-blog-toc-title">
                En este documento
              </h2>
              <ol>
                {sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>{section.title}</a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}

          <div className="pl-blog-body">
            <div className="pl-blog-prose">
              {intro}
              {sections.map((section) => (
                <React.Fragment key={section.id}>
                  <h2 id={section.id}>{section.title}</h2>
                  {section.body}
                </React.Fragment>
              ))}
            </div>

            <footer className="pl-blog-article-foot">
              <aside className="pl-blog-note" aria-label="Contacto">
                <p>
                  <strong>¿Dudas sobre este documento?</strong> Escríbenos a{" "}
                  <a href="mailto:soporte@pitchlab.mx">soporte@pitchlab.mx</a>. PitchLab no acepta apuestas y es
                  solo para mayores de 18.
                </p>
              </aside>
            </footer>
          </div>
        </div>
      </article>

      <ClosingCtaSection hasSession={hasSession} />
    </PublicSiteShell>
  );
}
