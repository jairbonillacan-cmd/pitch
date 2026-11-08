# Auditoría de marca PitchLab

> **Propósito:** dejar constancia de qué entregó GPT, qué está verificado y qué falta antes de construir el Design System.
> **Consumidores:** owner de Wave 0 (tokens, UI, shell), agentes de sección y fundador.
> **Fecha:** 2026-11-08 · **Fase:** F0 · **Fuente oficial:** `pitchlab-brand/` (no se edita)

## 1. Jerarquía de autoridad

1. `pitchlab-brand/PITCHLAB_BRAND_HANDOFF.md` y `pitchlab-brand/guidelines/*` (identidad aprobada de GPT)
2. `pitchlab-brand/tokens/brand-tokens.css` y `design-tokens.json` (valores)
3. `packages/tokens` (F4: generado a partir del punto 2, nunca editado a mano)
4. `packages/ui`, `packages/sports-ui` y las stories de Storybook
5. Pantallas de sección

Una referencia externa (Draftea, las tres competidoras) nunca prevalece sobre los niveles 1–2.

## 2. Qué existe (OBSERVADO, inspeccionado en disco)

| Área | Evidencia | Estado |
|---|---|---|
| Firmas del logo | `logos/`: 6 composiciones (isotype, horizontal, compact, stacked, wordmark, isologo) × 5 tintas (dark, light, white, black, one-ink) = 30 SVG | Completo |
| App icons y favicon | `app-icons/` (16, 32, 192, 512, apple-touch, favicon.svg) | Completo |
| Paleta | 20 tokens de color con nombre (Pulso, Tinta, Órbita, Pizarra…) en `tokens/brand-tokens.css` | Completo |
| Contraste | `tokens/contrast-audit.csv` (68 pares más la cabecera) | Verificado por GPT; se re-verificará en el CI (F4) |
| Tipografía | Inter Variable, con la escala display…caption en el handoff | ⚠ **Falta el archivo WOFF2** en el paquete (0 archivos `.woff*`). F4 debe descargarlo de rsms.me/inter (SIL OFL 1.1). |
| Espacio, radio, movimiento y layout | Tokens `--space-*`, `--radius-*`, `--time-*`, `--layout-*` | Completo |
| Iconos | `visuals/icons/`: 8 (assistant, close, filters, games, historical, info, panel, trend) | Insuficiente para la app: hace falta un set base (ver §4) |
| Reglas de producto | Handoff, sección «Aplicación en producto»: header, sidebar, nav móvil, botones, tablas, gráficas, estados, asistente | Completo; es la base del prompt 00 |
| Mockups | `applications/*.svg` (dashboard, login, pricing, mobile, splash, loading, hero, email…) | Referencia visual, no especificación |
| Social | `social/` (open-graph, banner, profile, post-game, post-model, post-stat) | Base de las share cards (§8 del plan maestro) |
| **Emblemas de fútbol** | `football/liga-mx-apertura-2026/` y `football/premier-league-2026-27/` | Ver `ASSET_MANIFEST.md` |

## 3. Verificación propia de los emblemas (2026-11-08)

| Pack | SVG | PNG | viewBox 80×80 | `<image>` embebido | Texto o fuentes | Revisión | Contraste mínimo primario/campo |
|---|---:|---:|---:|---:|---:|---:|---:|
| Liga MX Apertura 2026 | 19 | 19 | 19/19 | 0 | 0 | 1 | 5.78:1 |
| Premier League 2026/27 | 21 | 21 | 21/21 | 0 | 0 | 2 | 5.44:1 |

Hay 40 de 40 SVG aptos para el registro. La participación de clubes la verificó GPT contra las fuentes citadas en cada manifiesto: es **INFERIDO** para nosotros hasta cruzarla con el proveedor de datos.

## 4. Brechas y propuestas (requieren aprobación; no se modifica la marca)

| # | Brecha | Propuesta |
|---|---|---|
| B1 | Falta el WOFF2 de Inter | Descargar el oficial en F4 y servirlo localmente con `font-display: swap` |
| B2 | Solo 8 iconos de producto | Usar una librería de trazo compatible (Lucide, trazo 1,75 y uniones redondas) **solo** para los iconos genéricos; los iconos con identidad (asistente, juegos, histórico) siguen siendo los de la marca. Se decide en la ADR de iconografía. |
| B3 | No hay emblemas para NFL, NCAA, NHL, MLB, La Liga, UCL, etc. | Tres iconos neutros de fallback (`default-club`, `default-competition`, `default-national`) en la retícula de iconos de la marca, más el código del equipo. Diseño en F4 y aprobación del fundador. |
| B4 | La marca solo define el modo oscuro de la app | El MVP es solo dark. El modo claro queda para documentación y email, como indica la marca. |
| B5 | Riesgo marcario: nombre PitchLab (coincidencia con una app de béisbol) y motivos de clubes en los emblemas | Registrado en `FOUNDER_DECISIONS.md` y en el futuro `COMPLIANCE_REGISTER.md` |
| B6 | Cambios recientes de marca sin commit: el handoff y el README añaden la sección «Identificadores de ligas y clubes»; `football/` no está en git | Los versiona el fundador (no se incluyeron en los commits del plan) |

## 5. Reglas para agentes (resumen ejecutable)

- Solo se usan variables de `brand-tokens.css`. Cero hex sueltos (lo bloqueará un lint en F4).
- Un CTA primario (Pulso, texto Tinta) por región. Foco con anillo Pulso de 2 px y offset de 2 px.
- Números con `tabular-nums lining-nums` y formato `Intl.NumberFormat('es-MX')`.
- En gráficas, la serie de modelo va en `--chart-model` con línea sólida y la observada en `--chart-observed` con 6/4. El color nunca es la única señal.
- Logos: solo los SVG oficiales. Nunca reconstruidos con texto, estirados ni con efectos.
- Emblemas de clubes: con la proporción y los colores del manifiesto, siempre junto al nombre o código, y fallback neutro si no existe.
