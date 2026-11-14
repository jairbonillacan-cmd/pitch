import React from "react";
import type { Meta } from "@storybook/react-vite";
import {
  BlogIndexSurface,
  BlogPostSurface,
  type BlogCategoryLink,
  type BlogPostSummaryView,
  type BlogPostView,
} from "./public/BlogSurfaces";

const meta = {
  title: "PitchLab v4 / Blog",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

const categories: BlogCategoryLink[] = [
  { slug: "momios", label: "Momios y probabilidad", href: "/blog/categoria/momios" },
  { slug: "parlays", label: "Parlays", href: "/blog/categoria/parlays" },
  { slug: "juego-responsable", label: "Juego responsable", href: "/blog/categoria/juego-responsable" },
  { slug: "guias", label: "Guías de PitchLab", href: "/blog/categoria/guias" },
];

const [momios, parlays, responsable] = categories as [BlogCategoryLink, BlogCategoryLink, BlogCategoryLink];

const posts: BlogPostSummaryView[] = [
  {
    slug: "que-es-el-momio-justo",
    href: "/blog/que-es-el-momio-justo",
    title: "Qué es el momio justo y cómo calcularlo en 3 pasos",
    description:
      "Convierte cualquier momio en probabilidad, quítale el margen de la casa y compáralo con el momio justo para saber si el precio vale la pena.",
    category: momios,
    date: "2026-11-13",
    dateLabel: "13 de noviembre de 2026",
    readingMinutes: 4,
  },
  {
    slug: "como-calcular-la-probabilidad-de-un-parlay",
    href: "/blog/como-calcular-la-probabilidad-de-un-parlay",
    title: "Cómo calcular la probabilidad real de un parlay",
    description:
      "Por qué una combinada de cuatro selecciones casi nunca se cumple, cómo se multiplica el margen de la casa y qué selecciones no deben ir juntas.",
    category: parlays,
    date: "2026-11-12",
    dateLabel: "12 de noviembre de 2026",
    readingMinutes: 4,
  },
  {
    slug: "juego-responsable-limites-y-senales",
    href: "/blog/juego-responsable-limites-y-senales",
    title: "Juego responsable: límites claros y señales de alerta",
    description:
      "Cómo poner un presupuesto, por qué nunca conviene perseguir pérdidas, qué señales indican que es momento de parar y dónde pedir ayuda en México.",
    category: responsable,
    date: "2026-11-10",
    dateLabel: "10 de noviembre de 2026",
    readingMinutes: 3,
  },
  {
    slug: "como-leer-un-handicap",
    href: "/blog/como-leer-un-handicap",
    title: "Hándicap asiático: qué significa −0.25 y cómo se liquida",
    description: "Los hándicaps de cuarto de gol parten tu jugada en dos. Te explicamos cada caso con ejemplos de Liga MX.",
    category: momios,
    date: "2026-11-08",
    dateLabel: "8 de noviembre de 2026",
    readingMinutes: 5,
  },
];

const ARTICLE_HTML = `
<p>Un momio no es solo lo que te pagan: también es una opinión sobre qué tan probable es un resultado. Si aprendes a leer esa opinión, puedes compararla con una estimación propia y decidir con números.</p>
<h2 id="paso-1-convierte-el-momio-en-probabilidad">Paso 1: convierte el momio en probabilidad</h2>
<p>Cada formato de momio se traduce a una probabilidad implícita con una cuenta sencilla:</p>
<div class="pl-blog-table" role="region" tabindex="0" aria-label="Tabla desplazable"><table>
<thead><tr><th>Formato</th><th>Ejemplo</th><th>Cuenta</th><th>Probabilidad implícita</th></tr></thead>
<tbody>
<tr><td>Americano negativo</td><td>−150</td><td>150 ÷ (150 + 100)</td><td>60.0 %</td></tr>
<tr><td>Americano positivo</td><td>+260</td><td>100 ÷ (260 + 100)</td><td>27.8 %</td></tr>
<tr><td>Decimal</td><td>4.50</td><td>1 ÷ 4.50</td><td>22.2 %</td></tr>
</tbody></table></div>
<h2 id="paso-2-quita-el-margen-de-la-casa">Paso 2: quita el margen de la casa</h2>
<p>Si sumas las probabilidades de los tres resultados casi nunca te da 100 %. En el ejemplo, la suma es <strong>110.0 %</strong>.</p>
<ul><li>Local −150 → 60.0 %</li><li>Empate +260 → 27.8 %</li><li>Visitante +350 → 22.2 %</li></ul>
<h2 id="paso-3-calcula-el-momio-justo">Paso 3: calcula el momio justo</h2>
<p>El momio justo es el inverso de la probabilidad. Puedes ver cómo se leen en <a href="/como-funciona">Cómo funciona</a>.</p>
<blockquote><p>Una probabilidad no es una promesa. Un 70 % falla 3 de cada 10 veces.</p></blockquote>
`;

const post: BlogPostView = {
  ...posts[0]!,
  author: "Equipo PitchLab",
  updated: null,
  updatedLabel: null,
  tags: ["momio justo", "probabilidad implícita", "margen"],
  html: ARTICLE_HTML,
  toc: [
    { id: "paso-1-convierte-el-momio-en-probabilidad", text: "Paso 1: convierte el momio en probabilidad" },
    { id: "paso-2-quita-el-margen-de-la-casa", text: "Paso 2: quita el margen de la casa" },
    { id: "paso-3-calcula-el-momio-justo", text: "Paso 3: calcula el momio justo" },
  ],
};

const momiosCategory = {
  ...momios,
  description:
    "Cómo leer un momio, convertirlo en probabilidad y saber cuándo un precio está por debajo de lo justo.",
};

function Index(props: Partial<React.ComponentProps<typeof BlogIndexSurface>>) {
  return <BlogIndexSurface posts={posts} categories={categories} {...props} />;
}

export const IndiceOscuro = { globals: { theme: "dark" }, render: () => <Index /> };
export const IndiceClaro = { globals: { theme: "light" }, render: () => <Index /> };
export const IndiceConSesionOscuro = { globals: { theme: "dark" }, render: () => <Index hasSession /> };

export const CategoriaOscuro = {
  globals: { theme: "dark" },
  render: () => <Index posts={posts.filter((p) => p.category.slug === "momios")} activeCategory={momiosCategory} />,
};
export const CategoriaClaro = {
  globals: { theme: "light" },
  render: () => <Index posts={posts.filter((p) => p.category.slug === "momios")} activeCategory={momiosCategory} />,
};

const guiasCategory = {
  ...categories[3]!,
  description: "Cómo sacarle provecho a cada pantalla de PitchLab, paso a paso.",
};
export const CategoriaVaciaOscuro = {
  globals: { theme: "dark" },
  render: () => <Index posts={[]} activeCategory={guiasCategory} />,
};
export const CategoriaVaciaClaro = {
  globals: { theme: "light" },
  render: () => <Index posts={[]} activeCategory={guiasCategory} />,
};

export const ArticuloOscuro = {
  globals: { theme: "dark" },
  render: () => <BlogPostSurface post={post} related={posts.slice(1, 4)} />,
};
export const ArticuloClaro = {
  globals: { theme: "light" },
  render: () => <BlogPostSurface post={post} related={posts.slice(1, 4)} />,
};

export const ArticuloActualizadoSinIndiceOscuro = {
  globals: { theme: "dark" },
  render: () => (
    <BlogPostSurface
      post={{ ...post, toc: post.toc.slice(0, 2), updated: "2026-12-01", updatedLabel: "1 de diciembre de 2026" }}
      related={[]}
    />
  ),
};

export const ArticuloVistaPreviaOscuro = {
  globals: { theme: "dark" },
  render: () => <BlogPostSurface post={post} related={posts.slice(1, 3)} isPreview />,
};
export const ArticuloVistaPreviaClaro = {
  globals: { theme: "light" },
  render: () => <BlogPostSurface post={post} related={posts.slice(1, 3)} isPreview />,
};
