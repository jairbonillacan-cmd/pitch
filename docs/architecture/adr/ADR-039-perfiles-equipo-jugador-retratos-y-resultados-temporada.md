---
status: accepted
date: 2026-11-18
extends:
  - ADR-017
  - ADR-027
  - ADR-029
  - ADR-035
---

# ADR-039: Perfiles multi-deporte de equipo/jugador, retratos opacos con respaldo y resultados de temporada separados del corpus canónico

- **Estado:** Aceptada (`accepted` e implementada en `gemini-dos`).
- **Fecha:** 2026-11-18.

## Contexto

Al construir los perfiles completos de liga (`/app/[league]`), equipo (`/app/[league]/teams/[teamId]`) y jugador (`/app/[league]/teams/[teamId]/players/[playerSlug]`) con cobertura en 19 competiciones (6 ligas de clubes de fútbol, 10 competiciones de selecciones, NBA, NFL y NHL), surgieron tres tensiones estructurales:

1. **Frontera de licencias (`ADR-029`) vs. forma reciente (`Últimas 5` y `Partido anterior`):** el corpus histórico `data/history/*.jsonl` contiene únicamente fuentes abiertas (`openfootball` CC0 / `nflverse` CC-BY 4.0) y en Liga MX termina en `2024-25` (y en Europa va rezagado respecto a la jornada en curso). Sin marcadores recientes de la temporada vigente, 17 de 18 clubes de Liga MX quedaban sin racha `Últimas 5` en clasificación y sin partidos recientes del Apertura 2026 en su ficha.
2. **Retratos de jugadores y entrenadores sin filtrar proveedores (`FD-16`) ni romper el bundle:** las imágenes públicas externas devuelven ocasionalmente PNG centinela `1×1` o `204/404`, mientras que alojar miles de retratos en `apps/web/public/` inflaría el repositorio y violaría políticas de redistribución.
3. **Reglas reales de clasificación por competición:** cada liga tiene zonas y criterios de desempate distintos (Liga MX eliminó el Play-In desde el Apertura 2026 y clasifica 1–8 directo a Cuartos de final de Liguilla; Premier League no asigna 6.º fijo a Conference League; NHL no tiene Play-In; los torneos de selecciones con tabla global multi-grupo y los amistosos no admiten corchetes de grupo único).

## Decisión

1. **Resultados de temporada y forma `form` fuera de `data/history/`:**
   - Se mantiene intacto el corpus canónico `data/history/*.jsonl` y su manifiesto SHA-256 (`ADR-029`).
   - Se añade el campo opcional `form?: Array<"W" | "D" | "L">` (máximo 5 entradas en orden cronológico) a `StandingRow` / `StandingRowSchema` en `packages/contracts/src/analysis.ts`, calculado automáticamente por `computeStandings()` en `services/ingest/src/pipeline.ts`.
   - Se persiste `data/snapshots/<league>/season-results.json` (generado por `writeSeasonResultsFile` en `services/ingest/src/cli.ts` y `season-form-cli.ts`) con los partidos cerrados de la temporada vigente alineados al sello temporal de `latest.json`.
   - `loadLeagueStandingsMeta()` y `loadTeamProfile()` en `apps/web/src/server/team-profile.ts` fusionan en servidor `season-results.json`, snapshots fechados, histórico canónico y `StandingRow.form`, respetando la frontera `Cero-Fuga` y pasando `lastMatch` + `nextFixture` a `PlayerProfileData`.
2. **Claves opacas de retrato y cascada resiliente (`<PersonAvatar>`):**
   - `services/ingest/src/enrich-people-cli.ts` enriquece `squads.json` (100 % de clubes de fútbol, 8 torneos de selecciones y NBA/NFL/NHL) guardando únicamente claves opacas internas (`pl-p:<id>`, `pl-m:<id>`, `espn-<deporte>:<id>`) sin exponer nombres de proveedores en respuestas ni DOM (`FD-16`).
   - `<PersonAvatar>` (`packages/ui/src/platform/club/team/PersonAvatar.tsx`) resuelve las URLs al renderizar, rechaza imágenes vacías (`naturalWidth <= 2`), cae a `fallbackPhotoKey` y finalmente a una silueta SVG editorial; el retrato principal del héroe de jugador usa `priority` (`fetchPriority="high"`).
3. **Reglas de tabla verificadas y arquitectura editorial unificada:**
   - `resolveLeagueStandingsZones` y `resolveLeagueTieBreakers` (`packages/ui/src/platform/club/CoreMatchViews.tsx`) centralizan las reglas vigentes 2026/27 por liga, eliminando el selector `Todos | Local | Visitante` y el Play-In de Liga MX.
   - Los perfiles de equipo, liga y jugador comparten la hoja unificada en 2 columnas (`Resumen`, tabla única de `Estadísticas`, `Plantilla` agrupada por demarcación, tarjetas `En Vivo` / `Partido anterior` / `Partido siguiente` en cabecera, tira biográfica horizontal con fecha larga + edad y restauración automática del scroll al tope en cambios de ruta).

## Alternativas descartadas

- **Inyectar partidos de ESPN en `data/history/liga-mx.jsonl`:** descartado porque rompe la frontera de licencias de `ADR-029` e invalida la reproducibilidad SHA-256 del corpus abierto.
- **Descargar y versionar retratos en `apps/web/public/`:** descartado por peso del repositorio/bundle y restricciones de redistribución de imágenes deportivas.
- **Usar zonas de clasificación genéricas o conservar el filtro `Local / Visitante`:** descartado porque introducía ruido visual y reglas incorrectas (Play-In obsoleto en Liga MX, Play-In inexistente en NHL y zonas falsas en selecciones).

## Consecuencias

- Las 6 ligas de fútbol de clubes muestran racha real completa de `Últimas 5` (18/18 clubes en Liga MX y 100 % en Europa) y partidos recientes vigentes en perfiles de equipo y jugador sin contaminar `data/history/`.
- Cuando una federación modifique su formato de clasificación o desempate, solo se requiere actualizar `resolveLeagueStandingsZones` y `resolveLeagueTieBreakers` junto con sus pruebas unitarias en `packages/ui/tests/team-profile.test.tsx`.
- La integridad de retratos depende de la disponibilidad de los hosts de imagen en cliente; `<PersonAvatar>` garantiza degradación limpia sin huecos ni iconos rotos.
