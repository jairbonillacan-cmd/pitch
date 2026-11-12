# FOOTBALL DATA MASTER REPORT — PitchLab

> Respuesta consolidada a las 20 preguntas de la directiva, con evidencia verificada en
> el repositorio. **Fecha:** 2026-11-08 · Restricción del fundador aplicada: **solo
> datos gratuitos** (FD-02). Detalles en `01-…17-*.md` de esta carpeta.

## 0. Resultado en una frase

Con fuentes 100 % gratuitas y licenciadas, PitchLab ya tiene un **corpus histórico
auditable de 34,168 partidos en 7 ligas (2010→2026) con 0 errores de calidad**, un
pipeline reproducible con trazabilidad a nivel byte, y la primera evaluación rigurosa:
**el modelo del corpus vence al ingenuo en 7/7 ligas con IC95 concluyente, y pierde de
forma medible contra el mercado sin vig en NFL (+0.0421 LogLoss)** — que es exactamente
el tipo de verdad que la directiva pidió no maquillar.

## 1. Las 20 preguntas

| # | Pregunta | Respuesta corta | Evidencia |
|---|---|---|---|
| 1 | ¿Qué ligas tenemos realmente? | 6 de fútbol (PL, LaLiga, Bundesliga, Serie A, Ligue 1, Liga MX con Apertura/Clausura/liguilla) + NFL; Champions/UEL y NCAA planeadas sin datos; MLB/NHL descartadas | `01-existing-leagues.md` |
| 2 | ¿Qué histórico existía ya? | Antes: snapshots de 1 día + motores con constantes transcritas (REA H4: «ninguna referencia tiene histórico real»). Ahora: corpus completo con manifiesto | `02-existing-data-audit.md` |
| 3 | ¿Qué temporadas faltan? | Liga MX 2021-22→2023-24 (6 torneos; 4 llenables con 2 solicitudes Free, 2 bloqueadas por plan); stats de fútbol de cualquier tipo | `04-provider-coverage-matrix.md` |
| 4 | ¿Qué proveedores cubren cada competición? | openfootball (6 ligas, verificado), nflverse (NFL 1999→), API-Football Free (Liga MX en vivo + 2023 histórica comprobada), The Odds API (cuotas), football-data.org (PL en vivo, términos PENDIENTES) | `03/04-*.md` |
| 5 | ¿Qué podemos usar comercialmente? | openfootball y nflverse sin restricciones (con atribución); The Odds API con reglas propias; API-Football solo beta hasta FD-14 | `05-licensing-and-commercial-use.md` |
| 6 | ¿Qué fuentes descartamos? | football-data.co.uk (pipeline), scraping de casas, ESPN/NFL.com ocultas, MLB/NHL públicas, FBref | `03-provider-research.md` §3 |
| 7 | ¿Cuánto cuesta conseguir los históricos? | Escenario A vigente: **US$0** y ya ejecutado. B: desde US$30/mes (The Odds API 20K). C: cotizaciones (Sportradar ~3.5-8k/mes es cifra INFERIDA) | `16-cost-comparison.md` |
| 8 | ¿Qué datos aportan más valor predictivo? | Con lo disponible: identidad+localía+goles recientes (ya capturados por DC). El siguiente salto es calibración y ensemble con mercado, no más variables sin validar | `10/12-*.md` |
| 9 | ¿Qué variables están incompletas? | Stats de equipo/jugador, alineaciones, lesiones, xG, cuotas de fútbol históricas: **ausencia declarada, no imitada** | `10-feature-engineering.md` |
| 10 | ¿Cómo almacenaremos? | Hoy JSONL+manifiesto+SHA-256 en `data/history/`; plan ADR-007 (Neon/R2/Parquet) sin cambiar el schema | `07-canonical-data-model.md` §4 |
| 11 | ¿Cómo evitamos duplicados? | IDs deterministas con torneo incluido + 7 checks (errores bloquean) + detector de variantes de identidad; corregido en vivo: 10 IDs duplicados → 0 | `09-data-quality.md` |
| 12 | ¿Cómo evitamos data leakage? | `availableAt` como frontera, walk-forward por fecha, mercado solo como referencia, calibración fuera del holdout; tests de invariantes pendientes | `10/13-*.md` |
| 13 | ¿Cómo entrenamos? | DC (ξ, ρ, contracción) / ratings ridge NFL, ajuste walk-forward con ventana 1,095 días; determinista y reproducible | `11-model-audit.md` |
| 14 | ¿Cómo validamos? | Protocolo §13: bloques por jornada, 3 referencias (ingenuo, Baseline 0, mercado), bootstrap pareado sembrado | `13-validation-protocol.md` |
| 15 | ¿Cómo medimos la mejora? | Δ LogLoss/Brier con IC95 por liga y temporada + gate de promoción; retro ≠ track record | `12/13-*.md` |
| 16 | ¿Cómo mantenemos actualizado? | Snapshot diario en CI (ya corre), history semanal planificada, presupuesto de créditos con parada anticipada | `15-automation.md` |
| 17 | ¿Qué implementamos primero? | Hecho: pipeline+corpus+auditoría+benchmark. Siguiente: filtro postseason, calibración, backfill Liga MX 2022/2023, anclaje de `datasetId` en el benchmark | `12-model-improvement-plan.md` |
| 18 | ¿Qué datos/licencias adquirir? | Nada hoy. Cuando haya ingresos: The Odds API 20K (US$30) → Liga MX comercial (FD-14 primero) → stats enriquecidas con matriz verificada | `16-cost-comparison.md` §4 |
| 19 | ¿Riesgos? | 13 registrados con mitigación; los top: cambio de términos de The Odds API, FD-14 sin confirmar, leakage, identidad de equipos | `17-risk-register.md` |
| 20 | ¿Siguiente paso ejecutable? | (1) backfill Liga MX 2022/2023 con API-Football Free; (2) calibración con IC; (3) workflow semanal history+benchmark con `datasetId` anclado; (4) clasificar términos de football-data.org | Este informe §2 |

## 2. Próximos pasos ejecutables (orden)

1. **Backfill Liga MX 2022 y 2023** vía API-Football Free (2 solicitudes, plan en
   `06-historical-data-strategy.md` §3) → corpus de Liga MX pasa de 4 a 6 temporadas.
2. **Calibración** (Platt/isotónica por liga y mercado) evaluada con el protocolo §13.
3. **Anclaje de `datasetId`** en `backtest:history` (leer el manifiesto antes y después;
   fallar si cambió) — cierra el incidente del riesgo #8.
4. **Workflow semanal** `history + backtest:history` con issue automático si
   `errors > 0` o degradación del Δ.
5. **Clasificar términos de football-data.org** antes de ampliar su uso.
6. Al confirmar ingresos: compra ordenada según `16-cost-comparison.md` §4.

## 3. Checklist de aceptación de la directiva

| Criterio | Estado |
|---|---|
| 1-6. Competiciones reales, auditoría previa, proveedores, matriz, licencias, fuentes viables | ✅ `01-05-*.md` |
| 7. Modelo canónico | ✅ `schema.ts` v1 + `07-*.md` |
| 8-9. Estrategia de ingesta y pruebas de calidad | ✅ `08-09-*.md` (implementadas y corridas) |
| 10. Integridad temporal | ✅ `availableAt` + walk-forward (tests de invariantes pendientes) |
| 11. Auditoría del motor actual | ✅ Baseline 0 + v2 en `11-model-audit.md` |
| 12-13. Modelos base y protocolo de validación | ✅ DC/ridge + `13-*.md` |
| 14. Costos cuantificados | ✅ `16-*.md` (A ejecutado; B/C documentados) |
| 15-16. Automatización e integración | ✅ snapshot en CI; history/backtest manuales con plan |
| 17. Importación piloto | ✅ corpus completo con validación y trazabilidad (el piloto **fue** la importación completa, ejecutada y re-verificada tras correcciones) |
| 18. Calidad comprobada | ✅ 0 errores / 1 advertencia real (COVID) |
| 19. Datasets reproducibles | ✅ `datasetId` SHA-256 + modo offline |
| 20. Evaluación inicial de modelos | ✅ 7/7 ligas vs ingenuo (IC concluyente) + vs mercado en NFL (honesto: pierde) |

**Declaración de límites:** no se compraron datos, no se hizo scraping, no se usaron
fuentes no autorizadas, no se inventaron estadísticas ni cuotas, y ninguna cifra de
este informe proviene de planificación: todas provienen de corridas ejecutadas con los
comandos documentados.
