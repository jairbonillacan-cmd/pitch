# ADR-048 · Tira activa primero, Screener con vistas guardadas, rigurosidad arbitral y transparencia de calibración

- **Estado:** Aceptada
- **Fecha:** 2026-11-19
- **Contexto:** Cierre de fricciones de descubrimiento en `/app` (Imagen 1: ligas con `0` partidos apareciendo antes que ligas activas del día) y adopción de mejoras analíticas y de experiencia móvil inspiradas en el análisis competitivo del mercado, preservando estrictamente la independencia editorial (`PRODUCT.md`, `FD-16`, `Cero-Fuga`), la calibración estadística honesta y la experiencia móvil primero (`320–390 px`).

## Decisiones

### 1. Ordenamiento «Activo primero» en deportes, ligas y selector regional
- **`HomeSportStrip` (`orderHomeSports`):** Mantiene «Todos» al inicio, posiciona inmediatamente después los deportes con partidos en la fecha seleccionada (de mayor a menor actividad) y desplaza al final los deportes en `0` con atenuación visual sutil.
- **`HomeLeagueStrip` (`partitionHomeLeagues`):** En la tira horizontal rápida de ligas muestra **únicamente** competiciones con `dayCount > 0` en la fecha activa (más la liga seleccionada explícitamente si el socio filtró una en `0`), priorizando favoritas activas y cantidad de encuentros. Las demás competiciones vigentes en ventana de 30 días se agrupan tras el disparador `Más ligas (+N)`.
- **Supresión de franja redundante en deportes de liga única:** En `ShellChrome`, la segunda franja de ligas solo se despliega cuando `homeSportLeagues.length > 1` (p. ej. Fútbol), recuperando `44 px` útiles en móvil para NFL, NBA, NHL y MLB.
- **`LeagueCategorySheet`:** Incorpora la sección destacada **«Con partidos en esta fecha»** en la parte superior y ordena todas las regiones poniendo primero las ligas con partidos hoy.
- **Scroll nativo moderno:** La pista horizontal aplica `scroll-snap-type: inline proximity`, `scroll-padding-inline` y `scrollIntoView({ block: "nearest", inline: "nearest", container: "nearest" })`.

### 2. Explorador de picks (`/app/picks`) con escala no lineal de momios y vistas guardadas
- **Slider no lineal biyectivo (`screener-views.ts`):** `101` pasos (`0..100`) dedicando el `68 %` del recorrido físico (`12..80`) al tramo denso `[1.30, 3.00]` con resolución de `0.025`, y tramo logarítmico hasta `25.00+` (`step = 100`). Construido sobre `<input type="range">` nativo.
- **Ponderación suave $C^1$ (`smoothOddsWeight`):** Reemplaza umbrales escalonados con una curva suave de Hermite para ordenar por balance probabilidad/liquidez sin saltos discontinuos.
- **Vistas guardadas multi-deporte (`savedViews`):** Hasta `12` presets nombrados (deporte, liga, banda, mercado, ventana temporal, rango no lineal de momios y orden) persistidos en `localStorage` y sincronizados en `user_preferences.followed_topics.savedViews` vía `GET/PUT /api/me/preferences` (sin migración SQL destructiva).
- **Móvil primero:** En `< 640 px`, los filtros avanzados se colapsan bajo un botón táctil de `44 px` (`Filtros (N)`), dejando las vistas guardadas, chips de 1 toque y las primeras tarjetas de picks visibles desde el primer pantallazo.

### 3. Analítica arbitral con contracción Empirical Bayes ($\kappa = 15$)
- **`referee-stats.ts` + `<RefereeRigorBadge>`:** Agrega los árbitros hidratados de cada competición y aplica contracción bayesiana hacia la media ponderada de amarillas de su liga ($\hat{\lambda}_{\text{EB}} = \frac{n\bar{y} + 15\mu_{\text{liga}}}{n + 15}$), evitando etiquetar como «extremos» a árbitros con muestras diminutas.
- Clasifica cada colegiado en `Estricto`, `Promedio` o `Permisivo` con percentil y posición ordinal (`N.º k de M`) en la ficha del partido (`MatchContextPanel`) y habilita la pestaña condicional **`Árbitros`** dentro del Hub de Liga (`CoreMatchViews`) cuando hay ≥ 2 árbitros hidratados.

### 4. Transparencia de margen implícito (overround/vig) y contracción bayesiana en props
- **`<PlayerPropStreakCard>`:** Añade un pie calibrado junto a la racha cruda (`U5/U10/U20`) mostrando probabilidad ajustada `Beta(2, 2)` estrictamente dentro de `(0.02, 0.98)` (jamás `0 %` ni `100 %` crudo), momio justo en el formato del socio (`oddsFormat`) y etiqueta de tamaño de muestra (`Muestra corta / media / sólida`).
- **`MatchMoneyPanel` y `/app/momios`:** Incorporan `computeMarketOverroundPct` y `computeDeVigProbs` para exponer el **margen implícito de la casa (vig %)** directamente en «¿Dónde está el dinero?» y en el Convertidor interactivo de 2 vías.
- **`<CalibrationHonestyLab>`:** Laboratorio educativo interactivo de 10 segundos montado en `/resultados` y `/app/historial` que explica por qué una racha reciente no equivale a probabilidad real ni a valor positivo, reforzando el sello de publicación pre-partido y cero borrados post-FT (sin mencionar terceros).

### 5. Seguimiento en vivo con cuartos de línea asiáticos y cadencia de avisos
- **`live-pick-progress.ts` + `<LivePicksTrackerStrip>`:** Añade lectura `actual / línea` (`2 / 2.5 goles`), indicador provisional `Línea cumplida (provisional hasta FT)` y evaluador completo de 5 estados para hándicaps/spreads con cuartos de línea (`.0`, `.25`, `.5`, `.75`).
- **`alertCadence` (`inmediato | cada_15m | solo_hitos`):** Nuevo control en `Preferencias → Alertas` sincronizado con PostgreSQL (`followed_topics.alertCadence`) para evitar fatiga de notificaciones móviles.

## Consecuencias y verificación
- Cero cambios destructivos de esquema SQL; compatibilidad retroactiva total con `user_preferences.followed_topics` (JSONB).
- Todos los estilos viven 100 % sobre `@pitchlab/tokens` (`0` hex, `0` `backdrop-filter`, soporte oscuro/claro, `@container` y objetivos táctiles ≥ `44 px` en móvil).
- Cobertura de pruebas unitarias en `packages/ui/src/platform/goal3-features.test.ts` y stories oscuro/claro en `packages/ui/src/platform/atomic-club-v4.stories.tsx`.
