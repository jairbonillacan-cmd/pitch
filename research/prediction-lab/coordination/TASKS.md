# Tablero de tareas y contratos

Estados: `pendiente | en progreso | en revision | completada | bloqueada`.
Cada tarea tiene contrato explícito. El orquestador actualiza estados; el agente actualiza su
`status/<ID>.json` y su informe.

## Resumen

| ID | Agente | Tarea | Estado | Depende de |
|---|---|---|---|---|
| A01 | Repository Auditor | Auditoría de arquitectura y motores existentes | completada | — |
| A02 | Scientific Researcher | Revisión científica + paper obligatorio | completada | — |
| A03 | Data Source Researcher | Inventario de fuentes gratuitas y licencias | completada | — |
| A04 | Data Engineer | ETL canónico + calidad de datos | completada | A03, contrato |
| A05 | Feature Engineering | Catálogo y generación de features | completada (halló leakage de priors) | A04 |
| A06 | Motor A | Modelos sin cuotas | en progreso (reejecución v1.1) | A04, A05, A08 |
| A07 | Motor B | Modelos con mercado | completada | A04, A06, A08 |
| A08 | Backtesting | Laboratorio de evaluación + test suite | completada | contrato |
| A09 | Adversarial Auditor | Auditoría adversarial preliminar | completada (legacy) + A09b lab en progreso | — |
| A10 | Integration | Integración TS del motor aprobado | pendiente | A06, A07, A09 |
| A11 | Documentation | Consolidación documental | en progreso | todos |

---

## A01 — REPOSITORY AUDITOR

**TASK ID:** A01
**AGENT:** Repository Auditor (arquitectura, ingeniería de software, auditoría de código)
**OBJECTIVE:** Producir un mapa verificado de la arquitectura actual y del funcionamiento real de
los motores existentes, identificando qué es apto para forecasting, qué es solo paridad con un
tercero, y qué riesgos de regresión existen al añadir un motor nuevo.
**CONTEXT:** Worktree `/Users/jairbonilla/PitchLab-Prediction-Lab` (rama `prediction-lab`).
Leer: `README.md`, `package.json`, `tsconfig.json`, `src/domain/**`, `src/data/index.ts`,
`src/shell/**` (solo para entender consumo), `tests/**`, `docs/*.md`, `Reportes/docs/*.md`,
`Reportes/00-REPORTE-COMPLETO.md`, `Reportes/20-REPORTE-COMPLETO-AZTECAVET.md`,
`reference/`, `scripts/*.mjs` (solo los relevantes a datos).
**INPUTS:** Código y documentación del repo. No hay dataset histórico.
**SCOPE:** Lectura total. **No escribir** fuera de `reports/A01_repository_audit.md` y
`coordination/status/A01.json`. Prohibido modificar `src/`, `tests/`, `docs/`, git.
**CONSTRAINTS:**
- Verificar la implementación real (leer las funciones), no inferir por nombres de archivo.
- Para cada motor: fórmulas, parámetros duros, entradas, salidas, y si está entrenado o es heurístico.
- Distinguir "paridad con el original" de "validez predictiva".
- Citar `archivo:línea` en cada hallazgo.
- No ejecutar comandos destructivos ni de red.
**DELIVERABLES:**
1. `research/prediction-lab/reports/A01_repository_audit.md` con:
   - Arquitectura general y frameworks; módulos y dependencias (grafo textual).
   - Inventario de motores con tabla: motor, archivo, entrada, salida, parámetros, ¿entrenado?,
     ¿calibrado?, ¿evaluado fuera de muestra?, evidencia.
   - Inventario de datos: qué contiene `src/data/*.json`, cobertura, si es serie histórica o
     instantánea.
   - Tests: qué garantizan realmente, qué no.
   - Problemas técnicos y riesgos de regresión al añadir `src/domain/prediction/`.
   - Recomendaciones priorizadas (P0/P1/P2) con criterio de aceptación.
2. `coordination/status/A01.json` con el esquema de estado.
**VALIDATION:** El orquestador muestrea ≥5 afirmaciones contra el código; todas deben ser
reproducibles. Debe incluir al menos 10 referencias `archivo:línea` correctas.
**DEPENDENCIES:** Ninguna.
**STATUS:** pendiente.

---

## A02 — SCIENTIFIC RESEARCHER

**TASK ID:** A02
**AGENT:** Scientific Researcher (estadística deportiva, literatura académica)
**OBJECTIVE:** Revisión crítica y verificable de la literatura que sustenta el motor: qué funciona,
qué no, con qué números, y qué experimentos concretos debe ejecutar PitchLab.
**CONTEXT:** Artículo obligatorio: **Morfis Sallis, George Georgoulas, Ioannis G. Tsoulos,
“Predicting Football Match Outcomes Using Machine Learning”, *Computation* 14(9):195 (2026)**,
DOI `10.3390/computation14090195`. PDF directo verificado:
`https://mdpi-res.com/d_attachment/computation/computation-14-00195/article_deploy/computation-14-00195.pdf`
(la página HTML de MDPI responde 403 a clientes automatizados; el PDF responde 200).
**INPUTS:** Web (Crossref API, arXiv, DOI, PDFs). Sin credenciales.
**SCOPE:** Escribir solo `reports/A02_scientific_research.md` y `coordination/status/A02.json`.
**CONSTRAINTS:**
- **No inventar** papers, autores, fechas, DOI ni cifras. Toda referencia debe verificarse por DOI
  o URL accesible; si no se pudo abrir, marcarlo `NO VERIFICADO`.
- Para el paper obligatorio extraer, con números exactos: dataset, ventana temporal, nº partidos,
  split, features, 6 clasificadores, método de de-vig (power + Newton-Raphson), formulación binaria
  y 3-clases, resultados (accuracy, log-loss, Brier, RPS), IC bootstrap, y limitaciones declaradas.
- Separar **HECHO** (citado del paper), **INFERENCIA** e **HIPÓTESIS**.
- Cada metodología propuesta debe ligarse a una hipótesis falsable + experimento del plan (EXP01–17).
- Cubrir como mínimo: Elo y variantes, Glicko, Bradley-Terry, Poisson, Dixon-Coles, modelos
  jerárquicos/bayesianos, GAM, RF/GBM/XGBoost/LightGBM/CatBoost, ensembles, calibración
  (temperature/isotonic/beta), de-vig (proporcional, power, Shin, logarithmic), eficiencia de
  mercado, forecast combination, validación temporal, concept drift, leakage en deportes,
  RPS/Brier/log-loss y sus propiedades.
**DELIVERABLES:** Informe ≤3.500 palabras, con tablas, referencias verificables (DOI/URL + fecha de
consulta), y una sección final “Experimentos recomendados para PitchLab” (mapeados a EXP01–17).
**VALIDATION:** El orquestador comprobará 3 DOIs y 3 cifras del paper contra el PDF.
**DEPENDENCIES:** Ninguna.
**STATUS:** pendiente.

---

## A03 — DATA SOURCE RESEARCHER

**TASK ID:** A03
**AGENT:** Data Source Researcher (fuentes deportivas gratuitas)
**OBJECTIVE:** Inventario exhaustivo y verificado de fuentes gratuitas utilizables, con licencia y
límites, y una propuesta de integración priorizada.
**CONTEXT:** Prioridad fútbol (PitchLab es mexicano: la Liga MX importa). Después NFL, NHL, NCAAF.
**INPUTS:** Web. Verificar cada URL con petición real (código HTTP, tamaño, muestra de campos).
**SCOPE:** Escribir solo `reports/A03_data_sources.md` y `coordination/status/A03.json`.
**CONSTRAINTS:**
- Solo fuentes gratuitas. **No** recomendar scraping que viole ToS ni APIs de pago.
- Para cada fuente: URL, tipo de datos, competiciones, temporadas, campos, actualización, licencia,
  uso comercial (sí/no/no confirmado), límites técnicos, calidad, carencias, integración potencial.
- Verificar explícitamente: football-data.co.uk (licencia y términos), Understat, FBref/Stathead,
  StatsBomb Open Data, openfootball, API-Football free tier, TheSportsDB, OpenLigaDB,
  FiveThirtyEight (archivo), Kaggle datasets (licencia por dataset), repos GitHub de resultados,
  y fuentes de cuotas históricas gratuitas. Para cada una: ¿permite uso comercial?
- No asumir que “público” = “uso comercial permitido”.
**DELIVERABLES:** Tabla comparativa + propuesta de integración priorizada (P0/P1/P2) + riesgos
legales. Registrar fecha/hora de cada verificación HTTP.
**VALIDATION:** El orquestador re-verificará ≥3 URLs y ≥2 declaraciones de licencia.
**DEPENDENCIES:** Ninguna.
**STATUS:** pendiente.

---

## A09 — ADVERSARIAL MODEL AUDITOR (preliminar)

**TASK ID:** A09
**AGENT:** Adversarial Model Auditor (revisión crítica, leakage, errores)
**OBJECTIVE:** Auditar los motores, tests y datos existentes buscando errores metodológicos,
matemáticos y de leakage; entregar un registro de riesgos reproducible y una checklist para el
nuevo laboratorio.
**CONTEXT:** Motores: `src/domain/aztecavet/football.ts` (Poisson+Dixon-Coles τ, Pitágoras 1.7,
Log5, HFA .54, ρ −.08/−.14), `hockey.ts`, `baseball.ts`, `engine-nfl.ts`, `engine-ncaa.ts`,
`stats.ts`, `betting.ts`. Tests: `tests/domain/*.ts`, `tests/linemate_mathematical_validation.test.ts`.
Evidencia: `evidence/statistical-tests/aztecavet-experiments.json`, `src/data/*.json`.
**INPUTS:** Código, tests y datos del repo. Puede ejecutar `npx vitest run` en el worktree.
**SCOPE:** Solo lectura de código; escribir únicamente `reports/A09_adversarial_preliminary.md` y
`coordination/status/A09.json`.
**CONSTRAINTS:**
- Buscar: τ de Dixon-Coles mal normalizado o con signo invertido; truncación de Poisson sin
  renormalizar; uso de GF/GA de temporada completa para predecir partidos de esa misma temporada
  (leakage); parámetros duros sin justificación; “parity tests” presentados como validación
  predictiva; sesgo de selección en experimentos; métricas mal definidas; duplicados.
- Cada hallazgo: severidad (crítico/alto/medio/bajo), evidencia `archivo:línea` o comando, impacto,
  y corrección propuesta. No especular sin evidencia.
- No modificar código ni tests.
**DELIVERABLES:** Registro de riesgos priorizado + checklist anti-leakage para el lab + veredicto
explícito sobre si los motores actuales pueden considerarse “motor de predicciones validado”.
**VALIDATION:** Reproducir ≥3 hallazgos con comandos/ficheros; sin falsos positivos evidentes.
**DEPENDENCIES:** Ninguna.
**STATUS:** pendiente.


---

## Aprobaciones del orquestador (2026-11-09)

**A08 §9 — las 6 decisiones metodológicas quedan APROBADAS** con estas notas:
1. Orden del recorte (renormalizar → suelo 1e-15) aprobado: garantiza log-loss 0 en predicción perfecta.
2. `season_start` como clave temporal aprobado (hay ligas de año natural y de temporada partida).
3. Walk-forward dev/val con corte por fecha aprobado. La generación de predicciones de test se hace
   con el mismo esquema, pero **test no se usa para elegir nada**.
4. Significancia = IC95 % bootstrap por bloques excluye 0 **y** p-permutación < 0,05. Aprobado.
5. `test` agregado 2024/25 + 2025/26, evaluado una vez al congelar candidatos. Aprobado.
6. Bloques = temporada × división con intersección exacta de `match_id`. Aprobado.

**Nota de integridad:** cualquier métrica de test mostrada antes del cierre es exploratoria y no
puede usarse para seleccionar modelo. El cierre de test se hará en un único run final documentado.
