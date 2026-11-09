# 01 · Ligas y competiciones reales de PitchLab

> **Regla del proyecto:** las competiciones se descubren en el repositorio, no se inventan.
> Fuente canónica del histórico: `services/ingest/src/history/leagues.ts` (registro propio
> `<liga>.<slug>`, independiente del manifiesto de emblemas). Superficie de producto:
> `packages/contracts` (`LeagueSlug`) y `docs/product/PRE_MVP.md`.
> **Fecha:** 2026-11-08 · Etiquetas: OBSERVADO (leído en el código) / INFERIDO.

## 1. Catálogo con histórico (OBSERVADO en `HISTORY_LEAGUES`)

| Competición | País | Tipo | ID interno | Fuente del histórico | Temporadas disponibles | Estado |
|---|---|---|---|---|---|---|
| Premier League | Inglaterra | Liga regular (20 clubes, 38 jornadas) | `premier-league` | openfootball `en.1` (CC0) | 2010-11 → 2026-27 | Activa |
| LaLiga | España | Liga regular (20 clubes) | `la-liga` | openfootball `es.1` (CC0) | 2012-13 → 2026-27 | Activa |
| Bundesliga | Alemania | Liga regular (18 clubes, 306 partidos) | `bundesliga` | openfootball `de.1` (CC0) | 2010-11 → 2026-27 | Activa |
| Serie A | Italia | Liga regular (20 clubes) | `serie-a` | openfootball `it.1` (CC0) | 2013-14 → 2026-27 | Activa |
| Ligue 1 | Francia | Liga regular (18-20 clubes según temporada) | `ligue-1` | openfootball `fr.1` (CC0) | 2014-15 → 2026-27 | Activa |
| Liga MX | México | **Doble torneo**: Apertura + Clausura + liguilla | `liga-mx` | openfootball `mx.1` (CC0) | 2018-19, 2019-20, 2020-21, 2024-25 | Activa (hueco 2021-22 → 2023-24) |
| NFL | EE. UU. | Liga regular (272 partidos) + postseason | `nfl` | nflverse `games.csv` (CC-BY 4.0) | 1999 → 2026 | Activa |

Referencias de partidos esperados por temporada (`expectedGamesPerSeason`): 380 para
ligas de 20 clubes, 306 para las de 18 y para Liga MX (17 jornadas × 9 partidos × 2
torneos; la liguilla es extra y hoy se etiqueta `phase: "postseason"`).

## 2. Formatos especiales que el modelo canónico sí distingue (OBSERVADO en el schema)

- **Liga MX**: campo `stage` = `Apertura` / `Clausura` / `Apertura Playoffs` /
  `Clausura Playoffs`; `phase` = `regular` | `postseason`. Un Apertura y un Clausura no
  se mezclan como una sola "temporada estadística"; la liguilla se puede excluir del
  entrenamiento porque su distribución (eliminación directa, localía invertida en la
  final) es distinta.
- **NFL**: `period` = semana (1-18) o ronda de playoffs; `--no-postseason` excluye
  playoffs en la reconstrucción; franquicias identificadas por entidad (STL→LA, OAK→LV,
  SD→LAC), no por ciudad.
- **Descensos y clubes extintos**: la identidad vive en el registro del histórico, no en
  el manifiesto de marca. Casos observados en los datos: CD Veracruz y Lobos BUAP
  (desaparecidos), Monarcas Morelia → Mazatlán FC (reubicación de franquicia en 2020,
  misma identidad `liga-mx.mazatlan-fc`), Gallos Blancos → Querétaro (alias).

## 3. Superficie de producto en el pre-MVP (OBSERVADO en PREMVP-01 / snapshots)

| Liga en la UI | Datos en vivo | Nota |
|---|---|---|
| Premier League | ✅ openfootball + cuotas The Odds API | pestaña activa |
| NFL | ✅ nflverse | pestaña activa |
| Liga MX | ◐ API-Football Free | aparece como «Pronto» sin `API_FOOTBALL_KEY`; beta privada hasta confirmar licencia (FD-14) |

## 4. Competiciones NO incluidas y por qué (OBSERVADO / INFERIDO)

| Competición | Evidencia en el repo | Estado |
|---|---|---|
| Champions / Europa League | Solo emblemas (`pitchlab-champions-europa-league-2026-27.zip`); fuera del catálogo de `HISTORY_LEAGUES` | Planeada, sin datos ni fuente elegida |
| NCAA FBS | Motor de referencia REA (`Reportes/19-engine-ncaa-report.md`); sin fuente gratuita comercial en `FREE_DATA_STRATEGY.md` | Planeada, bloqueada por licencia (§6 de esa estrategia) |
| MLB / NHL | «Las APIs públicas de MLB y NHL no son aptas para uso comercial sin licencia» (`FREE_DATA_STRATEGY.md`) | Descartadas en esta fase |
| Resto de ligas de openfootball (`nl.1`, `pt.1`, `br.1`…) | Existen en la fuente pero no están en el catálogo | Corpus de entrenamiento potencial; decidir por demanda |

**Discrepancia detectada:** el paquete de marca incluye emblemas de competiciones que el
catálogo de datos aún no cubre (Champions/Europa League, NCAA). No se consideran
competiciones activas de PitchLab hasta que existan en `HISTORY_LEAGUES` y en los
contratos; quedan como «planeadas».
