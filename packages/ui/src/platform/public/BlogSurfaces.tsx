import React from "react";
import { getMascotPath } from "@pitchlab/sports-assets";
import { ClosingCtaSection, PublicSiteShell } from "./PublicSiteSections";

/**
 * Superficies del blog público (`/blog`, `/blog/categoria/[categoria]` y `/blog/[slug]`).
 * Solo presentan: la app lee los artículos Markdown y entrega el HTML ya convertido.
 */

export interface BlogCategoryLink {
  slug: string;
  label: string;
  href: string;
}

export interface BlogPostSummaryView {
  slug: string;
  href: string;
  title: string;
  description: string;
  category: BlogCategoryLink;
  /** `YYYY-MM-DD` */
  date: string;
  dateLabel: string;
  readingMinutes: number;
}

export interface BlogPostView extends BlogPostSummaryView {
  author: string;
  updated: string | null;
  updatedLabel: string | null;
  tags: readonly string[];
  /** HTML generado en el servidor a partir del Markdown del artículo (sin HTML crudo del autor). */
  html: string;
  toc: ReadonlyArray<{ id: string; text: string }>;
}

function readingLabel(minutes: number): string {
  return `${minutes} min de lectura`;
}

function Breadcrumbs({ items }: { items: ReadonlyArray<{ label: string; href?: string }> }): React.JSX.Element {
  return (
    <nav aria-label="Ruta de navegación" className="pl-blog-crumbs">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href ? (
              <a href={item.href}>{item.label}</a>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function BlogPostCard({
  post,
  headingLevel = 2,
  featured = false,
}: {
  post: BlogPostSummaryView;
  headingLevel?: 2 | 3;
  featured?: boolean;
}): React.JSX.Element {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className={`pl-blog-card${featured ? " pl-blog-card--featured" : ""}`}>
      <Heading className="pl-blog-card-title">
        <a className="pl-blog-card-link" href={post.href}>
          {post.title}
        </a>
      </Heading>
      <p className="pl-blog-card-desc">{post.description}</p>
      <footer className="pl-blog-meta">
        <span className="pl-blog-meta-cat">{post.category.label}</span>
        <time dateTime={post.date}>{post.dateLabel}</time>
        <span>{readingLabel(post.readingMinutes)}</span>
      </footer>
    </article>
  );
}

function CategoryNav({
  categories,
  activeSlug,
}: {
  categories: readonly BlogCategoryLink[];
  activeSlug?: string;
}): React.JSX.Element {
  const items: BlogCategoryLink[] = [{ slug: "", label: "Todo", href: "/blog" }, ...categories];
  return (
    <nav aria-label="Categorías del blog" className="pl-blog-cats">
      <ul>
        {items.map((cat) => {
          const active = (activeSlug ?? "") === cat.slug;
          return (
            <li key={cat.slug || "todo"}>
              <a href={cat.href} aria-current={active ? "page" : undefined}>
                {cat.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BlogIndexSurface({
  posts,
  categories,
  activeCategory,
  hasSession = false,
}: {
  posts: readonly BlogPostSummaryView[];
  categories: readonly BlogCategoryLink[];
  /** En `/blog/categoria/[categoria]`: la categoría elegida con su descripción. */
  activeCategory?: BlogCategoryLink & { description: string };
  hasSession?: boolean;
}): React.JSX.Element {
  const [featured, ...rest] = posts;
  const showFeatured = !activeCategory && featured !== undefined;
  const gridPosts = showFeatured ? rest : posts;

  return (
    <PublicSiteShell hasSession={hasSession}>
      <section className="pl-lp-section pl-lp-section--top pl-blog-hero">
        <div className="pl-lp-atmo" aria-hidden="true">
          <div className="pl-lp-orb pl-lp-orb--2" />
        </div>
        <div className="pl-lp-fieldgrid" aria-hidden="true" />
        <div className="pl-lp-wrap pl-blog-hero-inner">
          {activeCategory ? (
            <Breadcrumbs items={[{ label: "Blog", href: "/blog" }, { label: activeCategory.label }]} />
          ) : null}
          <div className="pl-lp-section-head pl-blog-head">
            <p className="pl-lp-eyebrow">{activeCategory ? "Categoría" : "Blog"}</p>
            <h1 className="pl-lp-h1 pl-lp-h1--page pl-blog-balance">
              {activeCategory ? activeCategory.label : "Probabilidad deportiva, explicada en claro."}
            </h1>
            <p className="pl-lp-lede">
              {activeCategory
                ? activeCategory.description
                : "Guías cortas para leer momios, armar parlays con sentido y decidir con números. Sin promesas, con cuentas que puedes revisar."}
            </p>
          </div>
          <CategoryNav categories={categories} activeSlug={activeCategory?.slug} />
        </div>
      </section>

      <section className="pl-lp-section pl-blog-list-section" aria-label="Artículos">
        <div className="pl-lp-wrap">
          {posts.length === 0 ? (
            <div className="pl-blog-empty">
              <img src={getMascotPath("radar")} alt="" width={140} height={140} />
              <p className="pl-lp-h3">Todavía no hay artículos en esta sección.</p>
              <p className="pl-lp-fine">Estamos escribiendo los primeros. Mientras, revisa los demás temas.</p>
              <a className="pl-lp-btn pl-lp-btn-ghost pl-lp-btn--compact" href="/blog">
                Ver todo el blog
              </a>
            </div>
          ) : (
            <div className="pl-blog-grid">
              {showFeatured ? <BlogPostCard post={featured} featured /> : null}
              {gridPosts.map((post) => (
                <BlogPostCard key={post.slug} post={post} />
              ))}
            </div>
          )}
        </div>
      </section>

      <ClosingCtaSection hasSession={hasSession} />
    </PublicSiteShell>
  );
}

export function BlogPostSurface({
  post,
  related = [],
  isPreview = false,
  hasSession = false,
}: {
  post: BlogPostView;
  related?: readonly BlogPostSummaryView[];
  /** Borrador o programado visto fuera de producción. */
  isPreview?: boolean;
  hasSession?: boolean;
}): React.JSX.Element {
  const showToc = post.toc.length >= 3;

  return (
    <PublicSiteShell hasSession={hasSession}>
      <article className="pl-blog-article" aria-labelledby="pl-blog-title">
        <header className="pl-lp-section pl-lp-section--top pl-blog-hero">
          <div className="pl-lp-atmo" aria-hidden="true">
            <div className="pl-lp-orb pl-lp-orb--2" />
          </div>
          <div className="pl-lp-wrap pl-blog-hero-inner pl-blog-hero-inner--post">
            <Breadcrumbs
              items={[
                { label: "Blog", href: "/blog" },
                { label: post.category.label, href: post.category.href },
              ]}
            />
            {isPreview ? (
              <p className="pl-blog-preview" role="status">
                Vista previa: este artículo es un borrador o está programado y no es visible al público.
              </p>
            ) : null}
            <h1 id="pl-blog-title" className="pl-lp-h1 pl-lp-h1--page pl-blog-title pl-blog-balance">
              {post.title}
            </h1>
            <p className="pl-lp-lede pl-blog-lede">{post.description}</p>
            <p className="pl-blog-meta pl-blog-meta--post">
              <span>{post.author}</span>
              <time dateTime={post.date}>{post.dateLabel}</time>
              <span>{readingLabel(post.readingMinutes)}</span>
              {post.updated && post.updatedLabel ? (
                <span>
                  Actualizado el <time dateTime={post.updated}>{post.updatedLabel}</time>
                </span>
              ) : null}
            </p>
          </div>
        </header>

        <div className={`pl-lp-wrap pl-blog-layout${showToc ? " pl-blog-layout--toc" : ""}`}>
          {showToc ? (
            <nav className="pl-blog-toc" aria-labelledby="pl-blog-toc-title">
              <h2 id="pl-blog-toc-title" className="pl-blog-toc-title">
                En este artículo
              </h2>
              <ol>
                {post.toc.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`}>{item.text}</a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}

          <div className="pl-blog-body">
            <div className="pl-blog-prose" dangerouslySetInnerHTML={{ __html: post.html }} />

            <footer className="pl-blog-article-foot">
              {post.tags.length > 0 ? (
                <div className="pl-blog-tags">
                  <h2 className="pl-blog-tags-title">Temas</h2>
                  <ul>
                    {post.tags.map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <aside className="pl-blog-note" aria-label="Aviso">
                <p>
                  <strong>Información para decidir, no una garantía.</strong> PitchLab no acepta apuestas y es solo
                  para mayores de 18. Si el juego deja de ser un pasatiempo, llama sin costo a la Línea de la Vida:{" "}
                  <a href="tel:8009112000">800 911 2000</a>.
                </p>
              </aside>
            </footer>
          </div>
        </div>
      </article>

      {related.length > 0 ? (
        <section className="pl-lp-section" aria-labelledby="pl-blog-related-title">
          <div className="pl-lp-wrap pl-lp-stack">
            <div className="pl-lp-section-head">
              <p className="pl-lp-eyebrow">Sigue leyendo</p>
              <h2 id="pl-blog-related-title" className="pl-lp-h2">
                Más del blog
              </h2>
            </div>
            <div className="pl-blog-grid">
              {related.map((item) => (
                <BlogPostCard key={item.slug} post={item} headingLevel={3} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <ClosingCtaSection hasSession={hasSession} />
    </PublicSiteShell>
  );
}
