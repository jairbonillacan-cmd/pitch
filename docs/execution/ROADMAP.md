# Roadmap

> **Propósito:** el orden de construcción con gates, no con fechas fijas (las fechas dependen de FD-02, FD-06 y FD-10).
> **Consumidores:** fundador y `AGENT_EXECUTION_PLAN.md` (F6).
> **Fecha:** 2026-11-08

## Etapa de planificación (actual)

| Fase | Estado | Gate |
|---|---|---|
| F0 Auditoría | ✅ | — |
| F1 Spikes (datos, legal, costos) | ✅ escritorio / ⏳ contactos FD-14 | — |
| F2 Product blueprint | ✅ | Revisión del fundador |
| F3 Arquitectura y ADRs | Siguiente | Revisión cruzada sin contradicciones |
| **⛔ Gate del fundador** | — | FD-01…FD-06 confirmadas |
| F4 Walking skeleton | — | CI en verde, Storybook y los 24 tests de engines-reference |
| F5 Prompts (por wave) | — | Linter de prompts en verde |

## Etapa de construcción (waves)

| Wave | Contenido (IDs) | Paralelizable dentro de la wave | Requiere |
|---|---|---|---|
| **W0** Foundations | 00 (DS, Shell, `sports-ui` base y charts base) | Primitivas ∥ componentes deportivos ∥ charts (owners distintos) | F4 |
| **W1** Público y crecimiento | 01, 02, 03, 04, 28 (cuenta y billing básico), 35, 38 | 01∥02∥35 · 03→04 · 03→38 · 03→28 | W0 y la pasarela en sandbox |
| **W2** Deportes | 05, 06◐, 07, 08, 11b, 12, 33 | 08∥11b (después de 07) · 12 después de 07 · 33∥07 | W1 (auth) y la ingesta de calendario |
| **W3** Investigación | 13, 14, 15 (NFL), 16 | 13∥16 · 14 después de 13 · 15 después de 14 | W2 y la ingesta de game logs |
| **W4** Mercados y comunidad | 17, 25, 36, 37 | 17∥36 · 25 después de 36 · 37 después de 36 | Ingesta de odds y snapshots, feed de resultados |
| **— Beta pública (MVP) —** | | | Criterios de `MVP_DEFINITION.md` §4 |
| **W5** Inteligencia | 20, 21, 22, 23, 24 | 22→21 · 20∥24 · 23 después de 20 y 22 | Modelo que pase el gate e histórico as-of |
| **W6** Personal | 26, 34 | 26∥34 | — |
| **W7** Admin completo | 29, 30, 31, 32 (versiones mínimas ya en W1–W4) | Todos ∥ | — |
| **W8+** Expansión | 09 NCAAF, 10 NHL, 11 MLB, props de fútbol | Por deporte | Licencias Pro |

## Hitos de datos en paralelo (no dependen de la UI)

1. **Al cerrar F4:** el adaptador del proveedor de calendario y resultados escribe en Postgres canónico (staging).
2. **Antes de W4:** captura de snapshots de cuotas encendida (mínimo 4 semanas antes de la beta).
3. **Durante W2–W4:** pipeline de backtest con el Baseline 0 sobre el histórico licenciado (Python), que prepara el gate de W5.
