# Blog de PitchLab: cómo publicar un artículo

> **Propósito:** que cualquier persona del equipo publique un artículo en `pitchlab.mx/blog` sin tocar código.
> **Actualizado:** 2026-11-13 · **Código:** `apps/web/src/server/blog.ts` (lectura y SEO), `packages/ui/src/platform/public/BlogSurfaces.tsx` (pantallas), `apps/web/app/blog/*` (rutas).

## 1. Publicar en 4 pasos

1. Copia `apps/web/content/blog/_plantilla.md` y renómbralo con la URL que quieres, en minúsculas y con guiones. Ejemplo: `como-leer-un-handicap.md` se publica en `https://pitchlab.mx/blog/como-leer-un-handicap`.
2. Llena el encabezado (sección 2) y escribe el texto en Markdown (sección 3).
3. Revisa cómo se ve con `pnpm dev` en `http://localhost:3000/blog/<slug>`. Los borradores y los programados también se ven en local, con un aviso de «Vista previa».
4. Quita `draft: true`, haz commit y despliega. El artículo entra solo al índice, a su categoría, al sitemap y al RSS.

> Un archivo con un error en el encabezado detiene el blog con un mensaje que dice qué archivo y qué campo fallaron. `pnpm --filter @pitchlab/web test` lo detecta antes del deploy.

## 2. Encabezado

```yaml
---
title: "Qué es el momio justo y cómo calcularlo en 3 pasos"
description: "Resumen de 120 a 160 caracteres para Google y redes."
date: 2026-11-13
updated: 2026-12-01        # opcional: solo si cambió el fondo del artículo
category: momios
tags: [momio justo, probabilidad implícita]
author: "Nombre Apellido"  # opcional: por omisión «Equipo PitchLab»
draft: true                # opcional: true = no se publica
---
```

| Campo | Obligatorio | Reglas |
|---|---|---|
| `title` | Sí | Máximo 70 caracteres (ideal 60). Palabra clave al inicio. |
| `description` | Sí | De 70 a 170 caracteres (ideal 120–160). Es el texto que aparece en Google. |
| `date` | Sí | `AAAA-MM-DD`. **Una fecha futura programa el artículo:** aparece solo ese día (hora de la Ciudad de México), sin redeploy. |
| `updated` | No | `AAAA-MM-DD`, igual o posterior a `date`. |
| `category` | Sí | Una de: `momios`, `parlays`, `juego-responsable`, `guias`. Para agregar otra, edita `BLOG_CATEGORIES` en `blog.ts`. |
| `tags` | No | Lista de temas. Se muestran al pie y van como palabras clave. |
| `author` | No | Persona que firma. Sin él, firma la organización. |
| `draft` | No | `true` lo oculta en producción. |

Los archivos que empiezan con `_` (como la plantilla) nunca se publican.

## 3. Escribir el cuerpo

- Usa `##` para cada sección. Con 3 o más secciones aparece el índice «En este artículo».
- `###` para subsecciones. No uses `#`: el título del artículo ya es el `<h1>`.
- Tablas, listas, negritas, citas (`>`) y enlaces funcionan como en cualquier Markdown.
- **No se permite HTML crudo**: se muestra como texto. Esto evita romper el diseño o abrir un hueco de seguridad.
- Enlaces internos con ruta relativa (`/como-funciona`, `/parlays`). Los externos llevan `rel="noopener noreferrer"` automáticamente.
- Imágenes: súbelas a `apps/web/public/blog/` y enlázalas como `![Descripción útil](/blog/archivo.webp)`. Siempre con texto alternativo.

## 4. Voz y reglas de la marca

Las mismas de `docs/design/DESIGN_SYSTEM.md` §7:

- Español de México, directo, frases cortas.
- Nunca «pick seguro», «gana», «cobra» ni montos como recomendación. La probabilidad se presenta como estimación.
- Porcentajes con 1 decimal y espacio («55.8 %»); momios americanos con signo menos tipográfico (−150).
- Los 5 motores propios sí se nombran. Los proveedores de datos y las fórmulas internas, nunca.
- Todo artículo cierra con un enlace interno útil. El aviso de +18 y la Línea de la Vida se agregan solos al pie.

## 5. Qué hace el sitio por el SEO (automático)

| Elemento | Dónde |
|---|---|
| Título, descripción y URL canónica por artículo y categoría | `generateMetadata` en `app/blog/**/page.tsx` |
| Open Graph (`article`) y tarjeta grande de X | Ídem, con imagen generada en `opengraph-image.tsx` (1200×630, colores de `@pitchlab/tokens`) |
| Datos estructurados `BlogPosting`, `Blog` y `BreadcrumbList` | JSON-LD en cada página (`src/server/json-ld.tsx`) |
| Sitemap con `lastModified` | `app/sitemap.ts` (se regenera cada hora) |
| RSS | `/blog/rss.xml` (se regenera cada hora) |
| Categorías vacías | Se muestran con `noindex` y no entran al sitemap |
| Borradores y programados | Fuera del índice, del sitemap y del RSS; en local se previsualizan con `noindex` |
