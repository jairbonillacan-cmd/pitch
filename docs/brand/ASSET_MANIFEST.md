# Manifiesto de activos de marca y deportivos

> **Propósito:** mapa único de los activos disponibles y de cómo los consume el código.
> **Consumidores:** `packages/tokens`, `packages/sports-assets`, `apps/web` y agentes de UI.
> **Fecha:** 2026-11-08 · **Fase:** F0

## 1. Activos de marca → destino en el código (F4)

| Fuente (`pitchlab-brand/…`) | Destino publicado | Uso |
|---|---|---|
| `tokens/brand-tokens.css` | `packages/tokens/src/brand-tokens.css` → Tailwind `@theme` y `tokens.ts` | Fuente única de color, espacio, radio, movimiento y layout |
| `tokens/design-tokens.json` | `packages/tokens` (roles y documentación) | Storybook (página Foundations) |
| `logos/pitchlab-horizontal-dark.svg` | `apps/web/public/brand/logos/` | Header de escritorio (148 px) y landing |
| `logos/pitchlab-compact-dark.svg` | ídem | Header móvil (124 px) |
| `logos/pitchlab-isotype-dark.svg` | ídem | Avatar del asistente, loading y estados |
| `logos/*-light.svg` | ídem | Documentación y emails sobre fondo claro |
| `app-icons/*` | `apps/web/app/` (`icon.svg`, `apple-icon.png`) y `public/` | Favicon y PWA |
| `social/open-graph.png` | `apps/web/public/og/default.png` | OG por defecto |
| `social/post-*.svg` | plantillas de `next/og` en `apps/web/app/api/og/` | Share cards de pick, perfil y partido |
| `visuals/icons/*.svg` | `packages/ui/src/icons/brand/` | Iconos con identidad |
| `visuals/field-grid.svg` | `packages/ui/src/decor/` | Motivo decorativo, uno por composición |
| Inter WOFF2 (**faltante**) | `apps/web/public/fonts/InterVariable.woff2` | Fuente única |

## 2. Emblemas deportivos

| Liga | Fuente | Rev. | Entradas | Destino (F4) | `LeagueId` canónico |
|---|---|---:|---:|---|---|
| Liga MX · Apertura 2026 | `pitchlab-brand/football/liga-mx-apertura-2026/` | 1 | 1 competición + 18 clubes | `apps/web/public/brand/sports/liga-mx/r1/` | `liga-mx` |
| Premier League 2026/27 | `pitchlab-brand/football/premier-league-2026-27/` | 2 | 1 competición + 20 clubes | `apps/web/public/brand/sports/premier-league/r2/` | `premier-league` |

**Cada entrada del manifiesto** trae `id` (slug estable), `code` (rótulo de UI de 3 letras, que **no** equivale al código del proveedor), `name`, `shortName`, `kind` (`competition` o `club`), `colors.tile/primary/accent`, `contrast`, `svg`, `png`, `symbolId` y `source`.

**Regla de identidad:** `TeamId` canónico = `<league>.<id del manifiesto>` (por ejemplo, `liga-mx.atlante` ≠ `liga-mx.atlas`). Los IDs de proveedor se resuelven en `provider_ref` y nunca contra el manifiesto.

### Cobertura actual

| Deporte / liga | Equipos activos (aprox.) | Con emblema | Fallback |
|---|---:|---:|---|
| Liga MX | 18 | 18 | — |
| Premier League | 20 | 20 | — |
| NFL | 32 | 0 | `default-club` + código |
| NCAA Football (FBS) | ~130+ | 0 | `default-club` + código |
| NHL | 32 | 0 | `default-club` + código |
| MLB | 30 | 0 | `default-club` + código |
| Otras ligas de fútbol | — | 0 | `default-club` / `default-competition` |

En F4 esta tabla se regenera automáticamente como `docs/design/SPORTS_ASSET_COVERAGE.md` a partir de la DB y el registro.

## 3. Reglas de uso de emblemas (del README de GPT, normativas)

- Tamaños: 24 px en tablas, 32 en listas y encabezados, 48 en tarjetas de partido, 20 en vistas compactas y 16 solo si el nombre o código está visible.
- Caja de 80×80 y proporción intacta. Los colores del club solo dentro del emblema. La UI usa los tokens de PitchLab.
- Si el nombre está al lado, el emblema lleva `alt=""`. Si va solo, el nombre del club como nombre accesible.
- Públicamente se presentan como «ilustraciones editoriales de PitchLab».
- Sprite: `<ruta>/<sprite>.svg#<symbolId>` desde el mismo origen.
- Una revisión nueva se publica en una ruta nueva (`/r<rev>/`) para invalidar la caché.
- Interruptor legal por liga: flag `assets.emblems.<league>` (ver el plan maestro §6).
