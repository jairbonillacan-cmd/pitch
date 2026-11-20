# ADR-043: Expansión de +37 competencias de fútbol, árbitros verificados, filtro de 30 días y navegación categorizada por región

- **Estado:** Aceptada
- **Fecha:** 2026-11-19
- **Contexto:** PitchLab contaba con 20 competencias (6 ligas principales de fútbol, 4 ligas US incluyendo `MLB` en mayúsculas y 10 torneos de selecciones). Con la disponibilidad del catálogo completo de Bzzoiro Sports Data v2 y los endpoints públicos gratuitos de clubes CONCACAF en ESPN, es posible cubrir las principales copas continentales, ligas de Norteamérica, Sudamérica, segundas divisiones/copas del Top 5 europeo, resto de Europa, Medio Oriente y Asia — además de enriquecer cada partido con el árbitro asignado y sus promedios disciplinarios. Sin embargo, mostrar 57 ligas planas saturaría las barras horizontales en móvil y mostraría torneos sin actividad (como selecciones fuera de fecha FIFA).

## Decisión

1. **Catálogo homogéneo de 57 competencias (`packages/contracts/src/competitions.ts`):**
   - Se añaden **37 nuevas competencias de fútbol de clubes**:
     - *Norteamérica y CONCACAF:* `mls` (18), `concacaf-champions` (ESPN), `leagues-cup` (ESPN).
     - *Copas internacionales:* `champions-league` (7), `europa-league` (8), `conference-league` (83), `uefa-super-cup` (90), `libertadores` (32), `sudamericana` (33), `caf-champions` (29).
     - *Sudamérica:* `liga-argentina` (85), `brasileirao` (9), `brasileirao-b` (34), `copa-do-brasil` (35), `primera-a-colombia` (80), `copa-colombia` (81), `primera-chile` (111), `ligapro-ecuador` (112), `liga-1-peru` (113).
     - *Copas y 2.ª división Top 5 europeo:* `championship` (12), `fa-cup` (39), `carabao-cup` (40), `segunda-espana` (38), `copa-del-rey` (41), `liga-f` (36), `bundesliga-2` (94), `dfb-pokal` (43), `serie-b` (100), `coppa-italia` (42), `ligue-2` (89), `coupe-de-france` (44).
     - *Otras 1.ª divisiones europeas, Medio Oriente y Asia:* `eredivisie` (10), `liga-portugal` (2), `pro-league-belgica` (14), `super-lig` (11), `saudi-pro-league` (17), `j1-league` (49).
   - `packages/sports-assets/src/bzzoiro.ts` registra los 35 IDs de liga para emblemas oficiales (`/img/league/<id>/`) y escudos de clubes (`/img/team/<id>/?bg=transparent`) con respaldo local.
2. **Pipeline unificado de hidratación y árbitros (`services/ingest/src/bzzoiro-expansion-cli.ts`):**
   - Genera de forma homogénea `latest.json`, `<fecha>.json`, `season-results.json`, `squads.json`, `injuries.json` y `market-lines.json` para cada nueva competencia, con respaldo automático a motor `v1` en copas de eliminación directa o grafos con `< 20` partidos terminados (evitando `NaN` en calibración).
   - Enriquece `MatchPreGameContextSchema` (`packages/contracts/src/injuries-lineups.ts`) con `RefereeStatsSchema` (`/api/v2/referees/<id>/`: país, partidos, promedio de amarillas, rojas, faltas y goles por partido), sede completa (`venueCity`, `venueCountry`, `venueCapacity`), marcadores al descanso/prórroga/penales (`halfTimeScore`, `extraTimeScore`, `penaltyShootout`), llave previa (`previousLegEventId`), fase/grupo (`stageName`, `groupName`), retratos opacos (`pl-p:<id>`, `pl-m:<id>`) y `head_to_head`.
   - Integrado al flujo diario `.github/workflows/pre-mvp-snapshot.yml` (`snapshot:expansion` y `snapshot:referees`).
3. **Ocultamiento automático de ligas sin actividad en 30 días (`isLeagueActiveInWindow`):**
   - Las competencias sin partidos en vivo ni programados en los próximos 30 días se ocultan por defecto de las tiras activas de `Inicio`, menú `Ligas`, móvil `Más`, `/app/momios` y `/app/comparar`.
   - Sus URLs directas siguen funcionando y el socio puede activarlas manualmente mediante el interruptor «Ver en pausa» en `Preferencias → Tus ligas` o dentro de `<LeagueCategorySheet>`.
4. **Motor de relevancia en `Tendencias` (`getTrendingMatches`) y navegación por región:**
   - Cuando `Inicio` está en `Todos` los deportes (o `Fútbol → Todas`), `Tendencias` selecciona los partidos más próximos y relevantes en todo el alcance activo ordenando por estado en vivo, inminencia, prestigio de la competencia (`prestigeTier`), derbi local y confianza/valor, equilibrando variedad multi-deporte y multi-liga.
   - La tira horizontal de ligas en `Inicio` muestra hasta 7 competencias curadas en línea más el botón `Más ligas (+N)` que abre `<LeagueCategorySheet>` (hoja inferior en móvil `< 768 px`, modal en escritorio) organizado en las 7 regiones de `LEAGUE_REGIONS` con buscador instantáneo.

## Alternativas descartadas

- **Mostrar las 57 ligas en una sola barra horizontal:** descartado por saturación cognitiva y scroll horizontal infinito en móvil.
- **Usar un único script que recalcule todo secuencialmente en cada corrida `matchday-only`:** descartado para proteger el presupuesto mensual de minutos de GitHub Actions; la expansión corre en la corrida diaria programada y a demanda.

## Consecuencias

- Las 37 competencias nuevas ya cuentan con snapshots vivos y enriquecidos en `data/snapshots/<league>/`, junto con 72 árbitros hidratados en las ligas núcleo.
- `MLB` se mantiene en mayúsculas de forma consistente en todos los catálogos, pestañas y etiquetas de UI.
- Los partidos en `MatchContextPanel` muestran datos verificados del árbitro, capacidad de sede y marcadores parciales sin filtrar proveedores (`FD-16`).
