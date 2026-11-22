# ADR-060 · Sistema de Íconos WebP Dual, Logos Oficiales, Anti-Slop Visual, Hub `/app/[league]` Editorial y Disciplina WCAG 2.5.3

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Rama origen:** `gemini-dos`
- **Relacionadas:** `ADR-016` (Iconografía propia `MaestroIcon`), `ADR-017` (Registro de emblemas deportivos con fallback), `ADR-040` (Bordes planos y paquete dual WebP), `ADR-051`/`ADR-052`/`ADR-054` (Presupuesto `DOM < 1,500`, ergonomía móvil `>= 44 px` y diseño plano), `ADR-058` (`LeagueCapabilityContract`, `.pl-sf-*` y `ZONA PROTEGIDA`), `ADR-059` (Maestro-Detalle `/app` y Bet Lab `/app/picks`), `ADR-061` (Regla estática `no-curved-accent-slop` y cierre cuantitativo/seguridad).

---

## Contexto

Con las capacidades estructurales de Olas 0A–6 operando en producción local, una auditoría exhaustiva de interfaz, identidad deportiva y accesibilidad (`Ola 7`) evidenció cinco brechas que alejaban la experiencia del estándar editorial Apple/Sofascore:

1. **Cobertura incompleta de iconografía y fricción de polaridad:** faltaban activos WebP dedicados para mercados, metadatos de jugador y contexto de partido; el renderizado SSR resolvía `"/icons"` en lugar de `"/icons-dark"`, `/icons-dark/:path*` carecía de política `Cache-Control`, y los íconos monocromáticos sobre CTAs primarios sólidos perdían legibilidad al cambiar de polaridad.
2. **Inconsistencia de emblemas oficiales y saturación en el header global:** `HomeSportStrip` usaba íconos genéricos en lugar de los logos reales de `NFL`/`NBA`/`NHL`/`MLB`; el escudo de Champions League perdía contraste sobre fondos oscuros; debía blindarse el contrato `logoUrl === null` → iniciales para cumplimiento de licencia Bzzoiro en superficie pública; y `Árbitros` ocupaba espacio de navegación global y en la hoja móvil `Explorar` pese a pertenecer al contexto de ligas de fútbol.
3. **Residuos de *AI-slop* y ergonomía móvil/calendario:** persistían bordes curvos en forma de paréntesis `(` (generados por `border-left`/`border-inline-start` sobre elementos con `border-radius`), pastillas `G/E/P` inconsistentes con recortes en `Últimos 5`/`PTS`, un calendario de `/app` recargado con falsos indicadores verdes de «En vivo» en días pasados y `30` botones `< 44 px` en móvil sobre `.mobile-dock`.
4. **Páginas de liga `/app/[league]` por debajo del estándar editorial y con DOM excedido:** `/app/liga-mx` (`1,972` nodos) y `/app/champions-league` (`4,958` nodos, sin acotar a los `36` clubes de la fase de liga) violaban el presupuesto `DOM < 1,500`, carecían de estructura 2 columnas con splits/proyecciones/árbitros integrados y necesitaban compuerta `Cero-Fuga` en `loadLeagueHubEnrichment`.
5. **Regresión WCAG 2.5.3 (`label-content-name-mismatch`) bajo `axe-core@4.14.0`:** el algoritmo `visibleVirtual()` evalúa el texto visible en pantalla incluso si un nodo lleva `aria-hidden="true"`, por lo que controles con texto visible y `aria-label` divergente fallaban la auditoría WCAG 2.1 AA.

---

## Decisión

### 1. Sistema de íconos WebP dual claro/oscuro (`0-404`) e inversión automática en CTAs sólidos

- **Manifiesto exhaustivo `0-404` (`packages/ui/src/pack-icon-theme.ts`, `packages/ui/src/icons.tsx`):** se integran **`348` nuevos activos WebP** (`contexto/` `6`, `eventos/` `21`, `interfaz/` `13` nuevos, `jugador/` `6`, `mercados/` `41` × `32 px` y `64 px` en tema claro y oscuro), consolidando **`160` íconos únicos × `4` directorios (`icons/{32,64}` e `icons-dark/{32,64}`) = `640` archivos** declarados en `PACK_ICON_ASSET_MANIFEST` y verificados con `0` respuestas `404`.
- **Componentes dedicados tema-aware (`packages/ui/src/platform/components/PackSportIcons.tsx` + `PackSportIcons.stories.tsx`):** se introducen `<MarketCategoryIcon />`, `<PlayerMetaIcon />` y `<MatchContextIcon />`, consumidos en `/app/picks`, perfiles de jugador y contexto de partido.
- **Paridad SSR y caché HTTP:** `usePackIconBase()` alinea su valor SSR (`readServerPackBase`) a `"/icons-dark"` para coincidir con el tema oscuro por defecto sin parpadeo ni discrepancia de hidratación; `apps/web/next.config.mjs` configura `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` sobre `/icons-dark/:path*` (paridad exacta con `/icons/:path*` y `/brand/:path*`).
- **Inversión CSS automática de polaridad en CTAs primarios sólidos (`apps/web/app/pitchlab-v4.css`, `4d87f1ee`):** todo ícono monocromático `:is(.pl-maestro-icon, .pl-pack-icon):not(.pl-emblem)` dentro de botones primarios sólidos (y acentos sólidos en tema claro) aplica `filter: invert(1)` automáticamente, excluyendo emblemas deportivos (`.pl-emblem`), restaurando `filter: none` dentro de `.share-ticket-card` en tema claro y respetando `@media (forced-colors: active)`.

### 2. Jerarquía de emblemas deportivos oficiales (`57/57`) y limpieza del header global

- **Logos reales en `57/57` ligas y tira superior (`HomeSportStrip.tsx`, `LeagueCategorySheet.tsx`, `packages/ui/src/sports.tsx`):** la tira de deportes y los selectores de competencia muestran logos oficiales reales de `NFL`, `NBA`, `NHL`, `MLB` y las `57` ligas de `PRODUCT_LEAGUES`.
- **Contraste en tema oscuro para UCL y contrato estricto `logoUrl === null`:** el escudo de Champions League incorpora la pastilla de contraste oscuro `data-emblem-dark-pill`; cuando un llamador o superficie pública pasa explícitamente `logoUrl === null`, `sports.tsx` (`49086bf0`) respeta el respaldo de iniciales sin intentar hotlinks externos, garantizando cumplimiento de licencia Bzzoiro en superficie pública.
- **Retiro de `Árbitros` del header global y de `Explorar` (`ShellChrome.tsx`, `48a2c18c`):** `Árbitros` sale de la navegación global de escritorio y de la hoja móvil `Explorar` para mantener el chrome limpio y agnóstico de deporte, conservando su descubrimiento contextual en la pestaña `Árbitros` de `/app/[league]`, las rutas canónicas `/app/[league]/arbitros` y `/app/[league]/r/[refereeSlug]` y la paleta `Cmd+K`.

### 3. Erradicación `100 %` de bordes curvos `(` (*anti-slop*), pastillas `G/E/P` WCAG AA y calendario `/app` compacto

- **Cero bordes curvos `(` (`7eb29da6`):** se erradica el `100 %` de los patrones `border-left`/`border-inline-start` sobre elementos con `border-radius` en `pitchlab-v4.css`, `sofascore-kit.css`, `alerts-referees.css`, `atomic-kit.css`, `account-v2.css`, `community-v2.css`, `momios-compare.css`, `tipster-admin.css` y `shell-ergonomics.css`, sustituyéndolos por barras verticales rectas `::before` de `3 px` (respaldado mecánicamente por la regla `no-curved-accent-slop` de `ADR-061`).
- **Pastillas `G/E/P` unificadas WCAG AA (`FormSquares.tsx`, `AtomicFormStrip.tsx`, `StandingsBracketsSection.tsx`):** relleno sólido con contraste verificado **`5.5–6.8:1`** en oscuro y claro y columnas `Últimos 5` y `PTS` sin recorte horizontal.
- **Calendario `/app` compacto y guardia `isEffectiveLiveGame` (`HomeFilterBar.tsx`, `HomeClubView.tsx`, `home-view-helpers.ts`, `shell-ergonomics.css`):** popover de calendario compacto estilo Apple/Sofascore sin footer de ligas ni leyenda redundante, `z-index` elevado en tableta, guardia unificada `isEffectiveLiveGame` (`dayId >= today`, `0` puntos verdes falsos en días pasados) y objetivos táctiles móviles `>= 44×44 px` por encima de `.mobile-dock` (**`30 → 0`** botones `< 44 px`).

### 4. Páginas de liga `/app/[league]` editoriales en 2 columnas (`DOM < 1,500`, `Cero-Fuga`)

- **Arquitectura 2 columnas desktop (`CoreMatchViews.tsx` · `LeagueHubClubView`, `standings-brackets.ts` · `loadLeagueHubEnrichment`):**
  - **Hero editorial:** logo oficial real, barra de progreso real calculada desde `season-results.json` y botón único `Seguir`/`Siguiendo`.
  - **Columna izquierda:** `Partido destacado`, `Proyección líder Spacetime` y lista de jornadas conmutables `Por fecha | Por ronda`.
  - **Columna derecha:** `Clasificaciones` con splits `Todos | Local | Visitante` paginada (fase de liga UCL depurada a **`36` clubes**), `Eliminatorias`, `Estadísticas` reales, `Equipos`, `Árbitros` y `Noticias`, gobernados por `LeagueCapabilityContract`.
- **Compuerta `Cero-Fuga` y presupuesto `DOM < 1,500`:** `loadLeagueHubEnrichment(league, fullAccess)` bloquea `attackDefense`, `refereeRanking` y proyecciones Spacetime cuando `!fullAccess`; la paginación y consolidación editorial mantienen los hubs y el screener bajo `1,500` nodos DOM, mientras `P2` (Ficha de Partido) y `P3` (Páginas de Equipo) permanecen **100 % intocables** en `ZONA PROTEGIDA`.

### 5. Disciplina vinculante WCAG 2.5.3 (`label-content-name-mismatch`)

- En `axe-core@4.14.0`, la regla `label-content-name-mismatch` calcula el texto visible mediante `visibleVirtual()`, que incluye nodos visibles aunque porten `aria-hidden="true"`.
- Por decisión permanente (`ae60aedf`, `e54d3f53`), todo botón o enlace interactivo con texto visible (`ShellChrome.tsx`, `HomeSportStrip.tsx`, `HomeFilterBar.tsx`, `AstroMatchRow.tsx`, `CoreMatchViews.tsx` y cualquier vista nueva) **construye su nombre accesible con su propio texto visible complementado mediante `<span className="sr-only">`** en lugar de sobreescribirlo con un `aria-label` divergente.

---

## Alternativas descartadas

1. **Usar `filter: invert(1)` globalmente sobre un solo juego de WebP para tema oscuro:** descartado (`ADR-040`) porque corrompe colores de marca y banderas; el paquete dual (`icons/` + `icons-dark/`) sigue siendo obligatorio y `filter: invert(1)` se restringe exclusivamente a íconos monocromáticos sobre CTAs primarios sólidos.
2. **Conservar `aria-label` divergentes añadiendo `aria-hidden="true"` sobre etiquetas visibles:** descartado porque falla `visibleVirtual()` en `axe-core@4.14.0` y rompe comandos de control por voz de WCAG 2.5.3.
3. **Renderizar en el DOM inicial todas las jornadas y filas históricas de UCL sin paginación ni recorte a `36` clubes:** descartado por exceder `4,958` nodos DOM y degradar fluidez en dispositivos móviles.

---

## Consecuencias

- **Positivas:** `640/640` activos WebP duales sin `404` ni saltos de hidratación, emblemas oficiales `57/57` respetando licencias públicas, estética plana libre de bordes curvos `(` y con pastillas `G/E/P` WCAG AA, hubs `/app/[league]` de nivel editorial bajo `1,500` nodos DOM con `Cero-Fuga`, `0` violaciones Axe WCAG 2.1 AA (incluyendo 2.5.3) en escritorio y móvil, y `P2`/`P3` preservadas al `100 %`.
- **Compromisos:** todo activo WebP nuevo debe existir en los `4` directorios (`icons/{32,64}` e `icons-dark/{32,64}`) y registrarse en `PACK_ICON_ASSET_MANIFEST`; todo botón nuevo con texto visible debe usar texto visible + `.sr-only` en lugar de `aria-label` divergente; y los acentos laterales en CSS deben implementarse mediante `::before` recto (`no-curved-accent-slop`).

---

## Validación y métricas verificadas (`6bb9886e..e54d3f53`)

| Dimensión / Ruta | BEFORE | AFTER (`e54d3f53`) | Estado |
|---|---|---|---|
| **Paquete dual WebP (`PACK_ICON_ASSET_MANIFEST`)** | Cobertura parcial · SSR `/icons` · sin caché en `/icons-dark` | **`640/640` archivos (`160 × 4`, `+348` nuevos)** · `0-404` · SSR `/icons-dark` · `Cache-Control` activo · inversión CTA sólidos | **PASS** |
| **Emblemas deportivos y navegación** | Logos US genéricos en strip · `Árbitros` en header/`Explorar` | **`57/57` ligas oficiales** · `data-emblem-dark-pill` UCL · `logoUrl === null` respetado · `Árbitros` contextual por liga + `Cmd+K` | **PASS** |
| **Anti-Slop, pastillas `G/E/P` y móvil `/app`** | Bordes curvos `(` · puntos «En vivo» en días pasados · `30` botones `< 44 px` | **`0` bordes curvos `(`** (`::before` `3 px`) · `G/E/P` **`5.5–6.8:1` AA** · `isEffectiveLiveGame` · **`30 → 0`** botones `< 44 px` | **PASS** |
| **Presupuesto DOM (`/app/[league]` y `/app/picks`)** | `/app/liga-mx` `1,972` · `/app/champions-league` `4,958` · `/app/picks` `2,060` | `/app/liga-mx` **`1,304`** · `/app/champions-league` **`1,329`/`1,337`** (UCL `36` clubes) · `/app/picks` **`899`** (`< 1,500`) | **PASS** |
| **WCAG 2.1 AA / WCAG 2.5.3 (`axe-core@4.14.0`)** | `32` violaciones `label-content-name-mismatch` | **`0` violaciones Axe WCAG 2.1 AA** en todas las rutas desktop y móvil (`ae60aedf`, `e54d3f53`) | **PASS** |
| **`pstack` (`v7-ux-a11y-deslop`), `visual-reviewer-w7` y Zona Protegida** | Pendiente | **`0 CRÍTICO / 0 ALTO / 0 MEDIO`** · **`P2`/`P3` 100 % intactas** | **PASS** |
