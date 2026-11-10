# Design System de PitchLab

> **Propósito:** el contrato visual aprobado (D1, 2026-11-08) que implementan `packages/tokens`, `packages/ui`, `packages/sports-ui` y `packages/charts`. Toda pantalla nueva parte de aquí.
> **Fuente visual de referencia:** `design/d1/` (landing, login, crear cuenta, panel). Si este documento y el prototipo difieren, manda este documento.
> **Consumidores:** prompt 00 (Design System y Shell), pre-MVP y todos los agentes de UI.
> **Jerarquía:** marca oficial (`pitchlab-brand/`) → este documento → `UI_LIBRARIES.md` (HeroUI + Astryx + shadcn) → componentes → pantallas.

## 1. Temas

| Tema | Origen | Uso |
|---|---|---|
| **Oscuro** (por defecto) | Tokens oficiales `pitchlab-brand/tokens/brand-tokens.css` | Toda la app y el sitio |
| **Claro** | Derivado de la marca (Iris + Tinta sobre Blanco y Hielo). **Pendiente de validar con quien hizo la marca.** | Opcional, con el botón de tema |

- **Selección inicial:** preferencia guardada (`pl-theme`), si no la del sistema (`prefers-color-scheme`). Se aplica en `<head>` antes del primer pintado (sin parpadeo).
- **Cambio:** botón sol/luna en el header, que cambia `data-theme` en `<html>`, los logos (`-dark` / `-light`) y el `color-scheme`.

### 1.1 Tokens del tema claro (contraste verificado)

| Token | Claro | Contraste |
|---|---|---|
| `--brand-primary` | `#5940B2` (Iris) | 7.50:1 sobre blanco |
| `--brand-accent` | `#1F6F99` | 5.54:1 |
| `--background-primary` / `-secondary` / `-elevated` | `#F3F5FD` / `#FFFFFF` / `#FFFFFF` | — |
| `--surface-default` / `-hover` / `-active` | `#FFFFFF` / `#E9ECF7` / `#E6E0FF` | — |
| `--text-primary` / `-secondary` / `-muted` | `#0B1020` / `#3B4560` / `#5A6480` | 18.9 / 9.5 / 5.9:1 |
| `--border-default` / `-strong` | `#D5DAE8` / `#7C87A3` | — / 3.6:1 |
| `--success` / `--warning` / `--danger` / `--info` | `#12704E` / `#8A5200` / `#B4233C` / `#2F4FB5` | ≥ 6:1 |
| `--chart-model` / `--chart-observed` | `#5940B2` / `#1F6F99` | — |

### 1.2 Tokens derivados (nuevos, ambos temas)

| Token | Oscuro | Claro | Uso |
|---|---|---|---|
| `--on-primary` | `var(--background-primary)` | `#FFFFFF` | Texto sobre botón primario |
| `--glow` | `#B49AFF26` | `#5940B21f` | Halo detrás de Radar, anillo de hover del CTA y casilla activa del PIN |
| `--glass-lens-bg` / `--glass-card-matte` / `--glass-well-bg` / `--glass-nav` | `rgba(10..13, 14..19, 27..35, 0.86..0.90)` | `rgba(240..251, 244..252, 252..255, 0.90..0.93)` | Rellenos neutros de alta lectura que aíslan el texto del alumbrado cromático exterior |
| `--glass-corner-hi` / `-lo` · `--glass-rim-top` / `-bot` | Blanco óptico `0.22–0.94` | Blanco óptico `0.78–1.0` + sombra ancla `--glass-ring-shadow` | Bisel Liquid Glass blanco (`.glass-ring`) en contenedores y controles con borde de la landing |

**Regla:** fuera de `packages/tokens` no existe ningún hex (lint).

## 2. Tipografía

- **Fuente:** Inter Variable (WOFF2 local en producción), con la escala de la marca (`--type-display` … `--type-caption`; las variables móviles ya vienen en los tokens).
- Todas las cifras llevan `tabular-nums lining-nums` (clase `.num`) y formato `Intl` es-MX: porcentajes con 1 decimal y espacio («55.8 %»), horas en 24 h («18:00»).
- **Eyebrow:** caption de 600, mayúsculas y tracking de 0.08 em. En encabezados de sección usa `--brand-primary`.
- **Encabezados de sección del sitio:** centrados (eyebrow + h1 + una frase de máximo 2 líneas).

## 3. Espaciado, radios y superficies

- Espaciado en la escala `--space-*` de la marca. Contenedor máximo de 1440 px. Márgenes laterales de 32 / 24 / 16 px (≥ 1200 / ≥ 768 / móvil).
- **Radios:** controles `--radius-control` (8), paneles `--radius-panel` (12), overlays `--radius-overlay` (16), PIN 24, píldoras `--radius-pill`.
- **Elevación:** borde de 1 px (`--border-default`) en paneles. La sombra `--shadow-overlay` solo en overlays (modal, PIN, tarjetas flotantes del hero).
- **Vidrio:** solo en la barra flotante y en barras pegajosas (fondo al 72–92 % más `backdrop-filter: blur`), nunca en tarjetas de contenido.

## 4. Motivo y color de datos

- **Motivo «Campo de corte»:** la retícula de 32 px (`.fieldgrid`) se usa enmascarada en el hero y en los paneles visuales. Trayectoria discontinua en `--brand-primary` (se dibuja una vez). El **corte a 45°** del isotipo se usa en el remate de las barras de probabilidad y en los separadores de la barra 1X2.
- **Favorito:** Pulso (`--brand-primary`) se reserva para (a) el CTA primario de cada región, (b) el foco y la selección, y (c) **el valor más probable de cada grupo**. Lo demás va atenuado (`--text-muted` al 38–50 %).
- **Estados:** success, warning, danger e info siempre con texto o icono, nunca solo color.

## 5. Componentes aprobados (inventario para `packages/*`)

| Componente | Paquete | Variantes y estados | Notas |
|---|---|---|---|
| `Button` | ui | primary · secondary · ghost · icon; hover, active, focus, disabled | Primary con anillo `--glow` en hover y flecha que avanza 3 px |
| `Tag` | ui | default · ok · info · model · demo(dev) | Con `dot` opcional (pulsa en ok y frescura) |
| `ThemeToggle` | ui | sol / luna | `aria-label` fijo |
| `FloatingNav` | ui (shell público) | normal · scrolled (compacta) · sección activa | Píldora centrada de 1120 px; en móvil logo + tema + Entrar |
| `AppHeader` + `LeagueSwitch` | ui (shell app) | liga actual · deshabilitada («Pronto») | Scroll horizontal en móvil |
| `DayFilter` (`Chip`) | ui | pressed · default · con contador | Barra pegajosa bajo el header |
| `Panel` | ui | — | Superficie base |
| `Dialog` (modal de análisis) | ui | abriendo · calculando · resultado · cerrando | `<dialog>` nativo, 960 px en desktop y pantalla completa en móvil |
| `PinPad` | ui | vacío · escribiendo · error (sacudida) · bloqueado · éxito | 4 casillas con rombo y teclado 3×4 |
| `Notice` | ui | info | Formularios bloqueados |
| `Field` | ui | default · disabled | Etiqueta siempre visible |
| `TeamBadge` / `LeagueBadge` | sports-ui | 16–56 px y fallback | Emblemas de `pitchlab-brand` |
| `MatchCard` | sports-ui | próximo · finalizado · hover (sube 3 px) | Muestra el favorito con la etiqueta «Favorito» y la cifra en Pulso |
| `ProbSplit` (1X2) | sports-ui | 2 o 3 segmentos | Solo el segmento líder en Pulso, separadores a 45° y `aria-label` con los tres valores |
| `ProbBar` | charts | normal · lead · grow (animación) | Marcas al 25/50/75 % y remate a 45° |
| `MarketTable` | sports-ui | grupos · fila líder · fila seleccionada | La fila es un botón (Enter/Espacio) que alimenta `OddsCompare` |
| `OddsCompare` | sports-ui | vacío · cuota válida · inválida | Decimal o americana; no se guarda |
| `CalcTrace` | sports-ui | pasos (spinner → check), progreso, esqueleto, «Saltar» | Ver `INTERACTION_PATTERNS.md` §2 |
| `FactorsList` | sports-ui | — | Valor y nota; nunca nombres de algoritmos (FD-16) |
| `Freshness` | sports-ui | fresco · stale | Solo la hora, nunca el proveedor |
| `Mascot` | ui | edición por liga o por contexto | Ver §6 |
| `Skeleton` / `EmptyState` | ui | — | El vacío lleva a Radar y una acción |

Cada componente tiene stories de todos sus estados en los dos temas (ADR-004).

## 6. Mascota Radar

| Contexto | Edición | Tamaño |
|---|---|---|
| Hero y estados de sistema (calculando, vacío, PIN) | `radar` (con tableta) | 84 px (avatar del PIN) a 500 px (hero) |
| Contexto de liga (encabezado del hub y tarjetas de liga) | Edición de la liga (`liga-mx`, `premier-league`, `nfl`…) | 170–230 px |
| Cierre del sitio y crear cuenta | `soccer` | 110–380 px |

- Siempre decorativa (`alt=""`). Nunca tapa cifras ni controles.
- Halo `--glow` detrás para legibilidad sobre oscuro.
- Flota (6 s) solo si no hay movimiento reducido.
- Archivos: `pitchlab-brand/mascot/web/*.webp` (se sirven versionados).

## 7. Copy (voz aprobada)

- Directo, concreto y en español de México. Frases cortas.
- Nunca «pick seguro», «gana», «cobra» ni montos como recomendación.
- La protección legal se dice en positivo («Información para decidir», «No somos casa de apuestas», «Historial íntegro», «Solo mayores de 18»).
- **No se nombran proveedores de datos ni algoritmos** (FD-16). El motor es «Modelo PitchLab · en validación», descrito como «modelo estadístico propio».
- En la beta se usa la etiqueta «Beta cerrada».

## 8. Anti-defaults (prohibidos)

- Gradientes decorativos (salvo el halo de Radar y el degradado de la barra líder y de la scrollbar).
- Glassmorphism en tarjetas de contenido.
- «LIVE» o «tiempo real» sobre datos que no lo son.
- Robots o mascotas ajenas, mascotas de la competencia o teatralidad sin datos.
- Tarjetas de features en 3 columnas con iconos genéricos.
- Hero vacío o centrado sin producto.
- Más de un CTA primario por región.
