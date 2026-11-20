# ADR-046 · Cancha táctica SVG, Player Props deslizables, Curva de calibración, Parlay bottom-sheet móvil y Tarjetas 9:16

- **Estado:** Aceptada
- **Fecha:** 2026-11-19
- **Contexto:** Para sostener retención diaria móvil y cumplir la promesa editorial de transparencia matemática (`PRODUCT.md`), el Club necesitaba herramientas visuales nativas sin introducir librerías pesadas ni `backdrop-filter` (`ADR-035`).

## Decisión
1. **Cancha táctica responsiva (`<TacticalPitchSvg>`):**
   - Renderiza XI confirmados o estimados sobre un campo SVG con tokens puros y `@container (min-width: 560px)` (`size-aware-styling`): vista alternable Local/Visita en móvil y espejo lado a lado en escritorio, integrado en `PreMatchModule.tsx`.
2. **Player Props y racha U5/U10/U20 (`<PlayerPropStreakCard>` + `/app/props`):**
   - Usa `<input type="range">` nativo estilizado conforme a `modern-web-guidance` (`slider`, con `--attr-min`/`--attr-max`/`--control-value` sincronizados por JS como respaldo en Safari) sobre barras de actuaciones reales de `squads.json`.
   - Disponible tanto en `PlayerProfileClubView` como en el explorador multi-deporte `/app/props` (`apps/web/src/server/props-explorer.ts` + `PropsLabClubView`).
3. **Curva de calibración real (`<CalibrationCurveChart>`):**
   - `computeModelCalibration` calcula cubetas de probabilidad anunciada vs porcentaje observado, Brier score y ECE sobre partidos finalizados reales, con aviso explícito cuando `n < 20`. Se integra en `/app/historial` y `/resultados`.
4. **Experiencia móvil nativa («Mis equipos» / «Para ti» + `<MobileParlaySheet>`):**
   - Botón `Seguir ★` en perfiles de equipo sincronizado con `followedTopics.teams`, alimentando la vista «Para ti» en `HomeClubView` junto a partidos vigilados y valor `≥ +2 pts`.
   - `<MobileParlaySheet>` monta una píldora flotante sobre el tab bar móvil cuando hay selecciones en el boleto y abre un `<dialog closedby="any">` animado en top-layer (`@starting-style`, `transition-behavior: allow-discrete`, respaldo `data-closing` + `getAnimations()`).
5. **Tarjetas compartibles 9:16 (`share-story-card.ts`):**
   - Generación Canvas 2D `1080×1920` leyendo tokens CSS vivos (cero hex fuera de `@pitchlab/tokens`) para partidos (`MatchHeroAndRail`) y comparativas H2H (`CompareHubView`), usando Web Share API con descarga PNG como respaldo.

## Consecuencias
- Todos los componentes atómicos incluyen stories en oscuro y claro (`atomic-club-v3.stories.tsx`), 0 hex fuera de tokens y 0 `backdrop-filter`.
