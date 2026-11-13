import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BLOG_CATEGORIES,
  blogToday,
  buildBlogPostingJsonLd,
  buildBlogRssXml,
  estimateReadingMinutes,
  formatBlogDate,
  isPublished,
  parseBlogPost,
  parseFrontmatter,
  pickRelatedPosts,
  readBlogDirectory,
  renderBlogMarkdown,
  slugifyHeading,
} from "../src/server/blog";

function source(front: string, body = "Texto del artículo.\n\n## Sección\n\nMás texto."): string {
  return `---\n${front}\n---\n\n${body}`;
}

const BASE_FRONT = [
  'title: "Qué es el momio justo"',
  "description: Resumen corto del artículo.",
  "date: 2026-11-13",
  "category: momios",
  "tags: [momio justo, probabilidad]",
].join("\n");

describe("parseFrontmatter", () => {
  it("lee cadenas, booleanos, listas en línea y listas con guiones", () => {
    const { data, body } = parseFrontmatter(
      "---\r\ntitle: 'Hola: mundo'\r\ndraft: true\r\ntags: [a, \"b c\"]\r\nauthors:\r\n  - Ana\r\n  - Luis\r\n# comentario\r\n---\r\nCuerpo",
    );
    expect(data).toEqual({ title: "Hola: mundo", draft: true, tags: ["a", "b c"], authors: ["Ana", "Luis"] });
    expect(body).toBe("Cuerpo");
  });

  it("exige el encabezado", () => {
    expect(() => parseFrontmatter("# Sin encabezado")).toThrow(/encabezado/);
  });
});

describe("parseBlogPost", () => {
  it("construye el artículo con valores por omisión", () => {
    const post = parseBlogPost("que-es-el-momio-justo", source(BASE_FRONT));
    expect(post).toMatchObject({
      slug: "que-es-el-momio-justo",
      title: "Qué es el momio justo",
      date: "2026-11-13",
      updated: null,
      category: { slug: "momios" },
      tags: ["momio justo", "probabilidad"],
      author: "Equipo PitchLab",
      draft: false,
      readingMinutes: 1,
    });
    expect(post.toc).toEqual([{ id: "seccion", text: "Sección" }]);
  });

  it("rechaza datos inválidos con mensajes claros", () => {
    expect(() => parseBlogPost("Mal_Nombre", source(BASE_FRONT))).toThrow(/minúsculas/);
    expect(() => parseBlogPost("ok", source(BASE_FRONT.replace("category: momios", "category: casino")))).toThrow(
      /categoría «casino» no existe/,
    );
    expect(() => parseBlogPost("ok", source(BASE_FRONT.replace("2026-11-13", "2026-02-30")))).toThrow(/AAAA-MM-DD/);
    expect(() => parseBlogPost("ok", source(`${BASE_FRONT}\nupdated: 2026-01-01`))).toThrow(/anterior/);
    expect(() => parseBlogPost("ok", source(BASE_FRONT.replace(/^title:.*$/m, "")))).toThrow(/«title»/);
    expect(() => parseBlogPost("ok", source(BASE_FRONT, "   "))).toThrow(/contenido/);
  });

  it("ignora `updated` igual a la fecha de publicación", () => {
    expect(parseBlogPost("ok", source(`${BASE_FRONT}\nupdated: 2026-11-13`)).updated).toBeNull();
    expect(parseBlogPost("ok", source(`${BASE_FRONT}\nupdated: 2026-12-01`)).updated).toBe("2026-12-01");
  });
});

describe("renderBlogMarkdown", () => {
  it("convierte # y ## en h2 con ids únicos y arma el índice", () => {
    const { html, toc } = renderBlogMarkdown("# Uno\n\n## Momio justo (sin margen)\n\n## Momio justo (sin margen)\n\n### Detalle");
    expect(html).toContain('<h2 id="uno">Uno</h2>');
    expect(html).toContain('<h2 id="momio-justo-sin-margen">');
    expect(html).toContain('<h2 id="momio-justo-sin-margen-2">');
    expect(html).toContain('<h3 id="detalle">Detalle</h3>');
    expect(toc.map((t) => t.id)).toEqual(["uno", "momio-justo-sin-margen", "momio-justo-sin-margen-2"]);
  });

  it("escapa HTML crudo y descarta enlaces peligrosos", () => {
    const { html } = renderBlogMarkdown(
      '<script>alert(1)</script>\n\nTexto <b onclick="x">b</b> [malo](javascript:alert(1)) y [bueno](/precio).',
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b onclick");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('<a href="/precio">bueno</a>');
  });

  it("marca enlaces externos y envuelve tablas en una región desplazable", () => {
    const { html } = renderBlogMarkdown(
      "[ext](https://ejemplo.com) [propio](https://pitchlab.mx/precio)\n\n| a | b |\n|---|---|\n| 1 | 2 |",
    );
    expect(html).toContain('<a href="https://ejemplo.com" rel="noopener noreferrer">ext</a>');
    expect(html).toContain('<a href="https://pitchlab.mx/precio">propio</a>');
    expect(html).toContain('<div class="pl-blog-table" role="region" tabindex="0" aria-label="Tabla desplazable"><table>');
    expect(html).toContain("</table></div>");
  });
});

describe("utilidades", () => {
  it("slugifyHeading quita acentos y signos", () => {
    expect(slugifyHeading("¿Qué es el «momio justo»?")).toBe("que-es-el-momio-justo");
  });

  it("formatBlogDate no se corre de día por la zona horaria", () => {
    expect(formatBlogDate("2026-11-01")).toBe("1 de noviembre de 2026");
  });

  it("blogToday usa el día calendario de la Ciudad de México", () => {
    expect(blogToday(new Date("2026-11-14T03:00:00Z"))).toBe("2026-11-13");
  });

  it("estimateReadingMinutes redondea hacia arriba con mínimo de 1", () => {
    expect(estimateReadingMinutes("hola")).toBe(1);
    expect(estimateReadingMinutes(Array.from({ length: 401 }, () => "palabra").join(" "))).toBe(3);
  });

  it("isPublished excluye borradores y fechas futuras", () => {
    const post = parseBlogPost("ok", source(BASE_FRONT));
    expect(isPublished(post, "2026-11-13")).toBe(true);
    expect(isPublished(post, "2026-11-12")).toBe(false);
    expect(isPublished({ ...post, draft: true }, "2026-12-01")).toBe(false);
  });

  it("pickRelatedPosts prioriza la misma categoría y las etiquetas en común", () => {
    const base = parseBlogPost("base", source(BASE_FRONT));
    const sameCat = parseBlogPost("misma", source(BASE_FRONT.replace("tags: [momio justo, probabilidad]", "tags: []")));
    const sharedTag = parseBlogPost(
      "etiqueta",
      source(BASE_FRONT.replace("category: momios", "category: parlays").replace("2026-11-13", "2026-11-20")),
    );
    const other = parseBlogPost(
      "otro",
      source(BASE_FRONT.replace("category: momios", "category: guias").replace("tags: [momio justo, probabilidad]", "tags: []")),
    );
    expect(pickRelatedPosts(base, [other, sharedTag, base, sameCat]).map((p) => p.slug)).toEqual([
      "misma",
      "etiqueta",
      "otro",
    ]);
  });

  it("JSON-LD y RSS usan la URL canónica y escapan el texto", () => {
    const post = parseBlogPost("ok", source(BASE_FRONT.replace("Resumen corto del artículo.", "Uno & <dos>")));
    const ld = buildBlogPostingJsonLd(post, "https://pitchlab.mx");
    expect(ld).toMatchObject({
      "@type": "BlogPosting",
      url: "https://pitchlab.mx/blog/ok",
      datePublished: "2026-11-13T12:00:00-06:00",
      inLanguage: "es-MX",
    });
    const rss = buildBlogRssXml([post], "https://pitchlab.mx");
    expect(rss).toContain("<link>https://pitchlab.mx/blog/ok</link>");
    expect(rss).toContain("<description>Uno &amp; &lt;dos&gt;</description>");
  });
});

describe("readBlogDirectory", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "pitchlab-blog-"));
    await writeFile(path.join(dir, "viejo.md"), source(BASE_FRONT.replace("2026-11-13", "2026-10-01")));
    await writeFile(path.join(dir, "nuevo.md"), source(BASE_FRONT));
    await writeFile(path.join(dir, "_plantilla.md"), "sin encabezado");
    await writeFile(path.join(dir, "notas.txt"), "se ignora");
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("lee solo .md sin guion bajo y ordena del más reciente al más antiguo", async () => {
    const posts = await readBlogDirectory(dir);
    expect(posts.map((p) => p.slug)).toEqual(["nuevo", "viejo"]);
  });

  it("devuelve una lista vacía si la carpeta no existe", async () => {
    await expect(readBlogDirectory(path.join(dir, "no-existe"))).resolves.toEqual([]);
  });

  it("señala el archivo con error", async () => {
    await writeFile(path.join(dir, "roto.md"), source(BASE_FRONT.replace("category: momios", "category: x")));
    await expect(readBlogDirectory(dir)).rejects.toThrow(/content\/blog\/roto\.md: La categoría/);
    await rm(path.join(dir, "roto.md"));
  });
});

describe("artículos publicados en content/blog", () => {
  it("todos los archivos son válidos y usan categorías existentes", async () => {
    const posts = await readBlogDirectory(path.join(process.cwd(), "content", "blog"));
    expect(posts.length).toBeGreaterThanOrEqual(3);
    for (const post of posts) {
      expect(BLOG_CATEGORIES.some((c) => c.slug === post.category.slug)).toBe(true);
      expect(post.description.length).toBeGreaterThanOrEqual(70);
      expect(post.description.length).toBeLessThanOrEqual(170);
      expect(post.title.length).toBeLessThanOrEqual(70);
    }
  });
});
