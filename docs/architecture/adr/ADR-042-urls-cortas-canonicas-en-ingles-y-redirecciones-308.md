# ADR-042: URLs cortas canónicas en inglés (`/g/`, `/t/`, `/p/`) y redirecciones permanentes `308`

- **Estado:** Aceptada
- **Fecha:** 2026-11-19
- **Contexto:** Las rutas anteriores de partido, equipo y jugador (`/app/<league>/games/<gameId>`, `/app/<league>/teams/<teamId>`, `/app/<league>/teams/<teamId>/players/<playerSlug>`) resultaban largas al compartirse en móvil y, en partidos cuyo identificador interno contenía prefijos de fuente (`bz-…`, `espn-…`) o fechas largas, podían exponer señales de proveedor en la barra de direcciones (tensión con `FD-16` / `Cero-Fuga`). Al mismo tiempo, la convención del producto mantiene segmentos de ruta del Club en inglés y requiere cero enlaces rotos para marcadores, correos o historiales previos.

## Decisión

1. **Rutas cortas canónicas en inglés:**
   - **Partido:** `/app/<league>/g/<homeSlug>-vs-<awaySlug>-<hash6>` donde `<hash6>` es un código opaco determinista de 6 caracteres hexadecimales (FNV-1a sobre `<league>:<id>` en `packages/contracts/src/urls.ts`, `opaqueShortCode` + `canonicalGameSlug`).
   - **Equipo:** `/app/<league>/t/<teamSlug>` (`canonicalTeamHref`).
   - **Jugador:** `/app/<league>/t/<teamSlug>/p/<playerSlug>` (`canonicalPlayerHref`).
2. **Resolución tolerante y redirecciones permanentes `HTTP 308`:**
   - `resolveGameBySlugOrId` en `@pitchlab/contracts` resuelve tanto el slug corto canónico como un `gameId` legado.
   - Las rutas anteriores (`/app/[league]/games/[gameId]`, `/app/[league]/teams/[teamId]`, `/app/[league]/teams/[teamId]/players/[playerSlug]`) permanecen activas como redirecciones permanentes `permanentRedirect` (`HTTP 308`) preservando los parámetros de consulta (`?tab=…`, etc.).
   - `apps/web/src/server/club-route-guard.ts` y `apps/web/app/app/layout.tsx` validan `/g/`, `/t/` y `/t/.../p/` contra el catálogo activo de 57 ligas antes del streaming SSR.
3. **Cero fuga de casas de apuestas ni proveedores en URLs:**
   - Ninguna ruta, slug o query string incluye identificadores de proveedor (`bzzoiro`, `espn`, `the_odds_api`) ni nombres de casas de apuestas comerciales; las casas habituales del socio viven exclusivamente como etiquetas locales en preferencias.

## Alternativas descartadas

- **Rutas en español (`/partido/`, `/equipo/`):** descartado por preferencia explícita del fundador (mantener URLs cortas en inglés consistentes con `/app/account`, `/app/picks`, `/app/social`).
- **Omitir el hash corto en partidos:** descartado porque dos clubes se enfrentan varias veces por temporada (ida, vuelta, liguilla y copa); el sufijo opaco de 6 caracteres garantiza unicidad estable sin filtrar el ID externo.
- **Eliminar las rutas anteriores sin redirección:** descartado porque rompería enlaces ya guardados, correos enviados y pruebas históricas.

## Consecuencias

- Todos los generadores de enlaces en servidor (`snapshots.ts`, `compare.ts`, `team-profile.ts`, `player-search.ts`, `espn-news.ts`, `league-news.ts`, `live.ts`) y en cliente (`HomeClubView`, `HomeMatchCard`, `MatchList`, `MatchTicketCard`, `CoreMatchViews`, `MatchHeroAndRail`, `MatchContextPanel`, `TeamProfileClubView`, `PlayerProfileClubView`, `TeamSquadSection`, `HistorialClubView`, `OddsCompareView`, `SocialPostCard`, `LiveMatchCenter`, `notifications.ts`, `ShellChrome`, `PlatformOverlays`) emiten únicamente las URLs canónicas cortas.
- Cualquier visita a una URL histórica redirige de forma transparente (`308`) a la URL canónica.
