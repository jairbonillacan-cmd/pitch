# ADR-054 · Pulido 100 % App Nativa, Diseño Plano Editorial, Evidencia de Picks, Parlays y Récord Pierna por Pierna

- **Estado:** Aceptada
- **Fecha:** 2026-11-20
- **Relacionadas:** `ADR-040` (Bordes planos y tokens), `ADR-044` (Insignias y Mi récord), `ADR-048` (Tira activa, screener y árbitros), `ADR-049` (Spacetime Suite v5.1), `ADR-050` (Portabilidad sin lock-in), `ADR-051` (Server-First y cero-jank), `ADR-052` (Mobile-First), `ADR-053` (App nativa, gestos, PWA `/offline` y shell progresivo).

---

## Contexto

Tras consolidar la velocidad base y la física táctil móvil (`ADR-051`–`ADR-053`), una auditoría visual y de producto frente a referentes nativos deportivos (Sofascore, ScoutPicks) y las reglas de UX nativa reveló seis oportunidades de mejora directa:

1. **Iconografía, eventos y barras estadísticas en fichas de partido:** el marcador hero listaba goleadores en texto plano sin iconos de gol/penal/autogol; el timeline de `Eventos por tiempo` usaba tarjetas encerradas ruidosas y el error de plural `"1 cambios"`; el gráfico de `Momento del partido` carecía de escudos, iconos de gol, divisor de descanso y aguja roja en vivo; y las barras estadísticas en `LiveMatchCenter` dejaban vacías las métricas negativas (`Goles evitados -0.54 vs -0.44`) al recortar valores `< 0` a `0`.
2. **Retiro definitivo de «Confianza N» (sin reemplazar por chip de cobertura):** la métrica numérica `Conf. 48` mezclaba claridad del favorito 1X2 (50 %) con cobertura de datos (30 %) y muestra (20 %), castigando partidos parejos buenísimos. El usuario decidió retirar `Conf. N` de toda la interfaz **y tampoco mostrar** etiquetas de `Datos completos / parciales`, dejando hablar a la probabilidad calibrada, momio justo, evidencia verificable y ventaja matemática.
3. **Picks por partido con Evidencia verificable (estilo ScoutPicks) y limpieza de redundancias:** la columna izquierda de la ficha repetía `Picks y Cortex IA` y `Tiempo reglamentario 1·X·2` (ya presentes en el Hero y en las pestañas principales), mientras que los picks necesitaban agrupación por mercado (`Resultado`, `Goles`, `Ambos anotan`, `Córners y tarjetas`, `Hándicaps`) con columna de **Evidencia** real verificable (`H2H`, `X/5` reciente, proyección y árbitro/conteos Bzzoiro) y terminología limpia (`Valor +X.X %`, `Ventaja +X.X pts`, `Momio justo`).
4. **Parlays unificados (`/app/parlays`) y seguimiento pierna por pierna en «Mi récord» (`/app/lab`):** `/app/parlays` duplicaba `PersonalParlayQuickBar` encima del «Auto-Armador en 4 Pasos» y desplegaba un muro de 57 botones de ligas; además, «Mi récord» mezclaba simples y parlays sin desglose expandible pierna por pierna aunque `JournalEntry.parlayLegs` y `parlayLegResults` ya existían.
5. **Insignias sin redundancia y animación suave al equipar/quitar:** los tipsters veían duplicado `Tipster verificado` en el selector de destacadas pese a tener ya `<VerifiedSeal />` + `<TipsterVerifiedBadge />` junto al nombre; la familia `Top` podía mostrar `Top 10 semanal` y `Top 10 mensual` a la vez; y el cambio de insignia bloqueaba clics con `saving` y hacía pop brusco sin transición de salida.
6. **Cierre integral de las 9 reglas de pulido nativo (sin cambiar la regla 7 de diseño de botones):** skeletons en el 100 % de rutas `/app/**`, UI optimista con rollback silencioso en todas las mutaciones de baja fricción, tabular numbers (`.num`), `corner-shape: squircle` progresivo, *swipe-to-dismiss* en todos los modales/hojas móviles respetando `scrollTop === 0`, Shared Element Transitions (`view-transition-name` dinámico), política dual (confirmar acciones destructivas + `Deshacer` en toast para acciones reversibles sin falsificar Undo en `sealed_picks`), `text-wrap: balance/pretty` focalizado y `<ProgressiveImage>` blur-up con `CLS = 0`.

---

## Decisión

### 1. Diseño plano editorial, iconografía deportiva y barras precisas
- **Iconos deportivos vectoriales (`SportEventIcons.tsx`):** set plano y nítido (`goal`, `own_goal`, `penalty_goal`, `penalty_missed`, `yellow`, `red`, `second_yellow`, `var`, `sub` flechas verde/roja, `injury`, `whistle`) pintado exclusivamente con tokens `--pl-*` (cero colores hex literales). Integrado en goleadores del Hero, `Eventos por tiempo`, `LiveTimeline` y `MomentumChart`.
- **Eventos por tiempo y Momento del partido:** filas planas sin marco pesado estilo editorial con cápsula de marcador solo en goles y plural correcto (`1 cambio` / `N cambios`). `MomentumChart` incorpora escudos laterales, barras sólidas con división blanca de medio tiempo (`45'`), balones en goles y aguja roja vertical en el minuto activo.
- **Barras planas y soporte para métricas negativas (`computeStatBarWidths`):** `live-charts.tsx` calcula longitudes proporcionales válidas incluso cuando ambos valores son negativos (`Goles evitados -0.54 vs -0.44`, resaltando en negrita al mejor valor y tiñendo las barras negativas con `data-negative="true"`). `.psplit` y `.pbar` adoptan geometría plana de `6px` sin gradientes ni cortes oblicuos, y la leyenda de `ProbSplit` usa rejilla de columnas iguales para no truncar etiquetas.

### 2. Retiro total de «Confianza N» y tablero de Picks con Evidencia verificable
- Se retira `<ConfidenceChip />` de `HomeClubView`, `HomeMatchCard`, `MatchList`, `MatchTicketCard` y `MatchHeroScoreboard` **sin sustituirlo** por chips de cobertura (`Datos completos / parciales`).
- Se eliminan las dos tarjetas redundantes de la columna izquierda del partido (`Picks y Cortex IA` y `Tiempo reglamentario 1·X·2`).
- **`match-evidence.ts` + `MatchPicksEvidenceBoard.tsx`:** agrupa los picks del partido por mercado (`Resultado`, `Goles`, `Ambos anotan`, `Córners y tarjetas`, `Hándicaps`), ofrece filtros por grupo, ordenación (`Recomendados`, `Mayor probabilidad`, `Mayor tasa real`, `Mayor valor vs casa`), filtro `Solo con valor`, columna de **Evidencia** con tasas reales verificables (`X/5`, `H2H`, proyección, conteos/árbitro Bzzoiro), `Momio justo` vs casa, `Valor +X.X %` y acciones `+ Parlay` / `Sellar`.

### 3. `/app/parlays` unificado y «Mi récord» pierna por pierna
- **`ParlayBuilderClubView`:** unifica el generador en un flujo de dos pestañas (`Automático` | `Armar a mano`), elimina el montaje duplicado de `PersonalParlayQuickBar`, retira `LensGlowOrbs` y sustituye el muro de 57 botones de ligas por un selector compacto de deporte + desplegable de ligas con partidos abiertos.
- **`RecordPicksTab` (`/app/lab`):** incorpora filtro de tipo `Todos · Simples · Parlays` y renderiza cada parlay sellado como fila expandible (`Ver piernas`, `aria-expanded`) con barra de avance (`X/N cumplidas`) y listado individual pierna por pierna (`parlayLegs` + `parlayLegResults`, con respaldo legible sobre `pickLabel` para registros previos).

### 4. Insignias sin redundancia y transición suave al equipar/quitar
- **`badges.ts`:** colapsa la familia `Top` al nivel más alto ganado (`top-10-mensual` prevalece sobre `top-10-semanal`, igual que `SENIORITY`) y expone `redundantProfileBadgeIds(isTipster)` para excluir `tipster-verificado` cuando el perfil ya muestra `<VerifiedSeal />` + `<TipsterVerifiedBadge />`.
- **`ProfileBadges.tsx` + `BadgePickerDialog.tsx`:** `useOwnBadges.toggle` actualiza de forma optimista a `0 ms` sin bloquear clics consecutivos (con secuencia anti-carreras y rollback en fallo de red) y `FeaturedBadgeRow` anima tanto la entrada (`@starting-style`) como la salida (`[data-closing="true"]`).

### 5. Las 9 reglas de pulido nativo
1. **Skeletons en el 100 % de `/app/**`:** se añaden 13 archivos `loading.tsx` faltantes (`picks`, `momios`, `social`, `props`, `lab`, `account`, `u/[handle]`, `p/[playerSlug]`, `historial`, `tipster`, `admin`, `canjear`, `tech`) y fallbacks con silueta real en `CoreMatchViews` y `LazyCalibrationIslands`.
2. **UI optimista con rollback silencioso:** completada en `MatchCommunityPoll` (snapshot + rollback), `useOwnBadges` (secuencia optimista), `useFollowedTopics`, `toggleWatchlistGame` y `NotificationInbox`.
3. **Tabular numbers (`.num`):** aplicados en contadores, momios, minutos, tasas de evidencia y filtros con conteo.
4. **Esquinas *squircle* progresivas:** `@supports (corner-shape: squircle)` sobre tarjetas, botones y diálogos (excluyendo píldoras `999px` y avatares circulares).
5. ***Swipe-to-dismiss* en todos los modales/hojas móviles:** `useSheetSwipeDismiss` añade guardia `scrollContainerRef` (`scrollTop <= 0`) y se conecta a `TopLayerModalDialog`, `LeagueCategorySheet`, `BadgePickerDialog` y `MobileParlaySheet`.
6. **Shared Element Transitions:** `setActiveSharedTransition` asigna `view-transition-name` único (`pl-match-hero` / `pl-team-hero`) al elemento tocado justo antes de navegar y `runWithViewTransition` lo limpia en `finished.finally`.
7. **Política dual (Confirmar destructivas + `Deshacer` en reversibles):** `<ConfirmActionDialog>` (con `autoFocus` en `Cancelar` siguiendo `modern-web-guidance/dialog`) protege vaciar parlays con `>= 2` selecciones; `ToastViewport` incorpora botón `Deshacer` (`5 s`, pausa en hover/foco siguiendo `persistent-toast-notifications`, objetivo táctil `>= 44 px`) para quitar pierna, vaciar parlay tras confirmar, dejar de seguir partido, quitar liga favorita, borrar vista guardada del screener y marcar notificaciones leídas. **Nunca** se simula `Deshacer` sobre `sealed_picks` inmutables en PostgreSQL.
8. **Tipografía editorial:** `text-wrap: balance` en títulos/encabezados/estados vacíos y `text-wrap: pretty` en párrafos de lectura (nunca en `*`).
9. **Imágenes progresivas (`<ProgressiveImage>`):** blur-up con `opacity` + `filter: blur()` sobre la propia imagen (`0 backdrop-filter`, `CLS = 0`) y detección síncrona de `img.complete` en caché, conectado en `PersonAvatar`, `Avatar` y `ShellChrome` (sin romper rutas RSC puras).

---

## Alternativas descartadas

1. **Sustituir «Confianza N» por una insignia de `Datos completos / parciales`:** descartada por instrucción explícita del usuario; la claridad del pick sale de su probabilidad, momio justo y evidencia verificable, no de etiquetas de completitud.
2. **Ofrecer botón `Deshacer` al sellar un pick en `Mi récord`:** descartada porque rompería la integridad verificable e inmutable de `sealed_picks` con sello SHA-256 en PostgreSQL.
3. **Usar `transition-behavior: allow-discrete` para animar salida de insignias en todos los navegadores:** descartada en favor de `@starting-style` para entrada + `[data-closing="true"]` controlado en React para salida, garantizando animación consistente en Chrome, Safari y Firefox sin fallos en `display` transitions.

---

## Consecuencias

- **Positivas:** estética plana deportiva coherente en toda la app sin brillos artificiales, métricas negativas legibles al 100 %, picks con evidencia real verificable y sin redundancias, `/app/parlays` sin formularios duplicados ni muro de 57 ligas, parlays auditables pierna por pierna en «Mi récord», insignias limpias y animadas, y cobertura total de las 9 reglas de sensación nativa con `0 KB` de dependencias externas añadidas.
- **Trade-offs:** las pruebas unitarias anteriores que verificaban la presencia de `Conf.` o de `PersonalParlayQuickBar` en `/app/parlays` se actualizaron para reflejar el nuevo contrato de producto.
