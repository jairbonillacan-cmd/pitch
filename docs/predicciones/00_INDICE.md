# Documentación del motor de predicciones — índice y estado

Esta carpeta contiene los 14 documentos exigidos por la misión. Cada uno se apoya en artefactos
reproducibles del laboratorio (`research/prediction-lab/`), no en afirmaciones.

**Estado global (2026-11-09 03:05, America/Mexico_City):** 8 de 14 documentos escritos y verificados
por A11; los 6 restantes dependen de artefactos que aún no están cerrados (Motor B definitivo,
cierre de `test`, integración TS y roadmap del orquestador).

| Doc | Contenido | Fuente principal | Estado | Enlace |
|---|---|---|---|---|
| `01_AUDITORIA_ACTUAL.md` | Arquitectura, motores, paridad vs validez, leakage legacy, build y datos | A01, A09 | **completado** | [abrir](01_AUDITORIA_ACTUAL.md) |
| `02_INVESTIGACION_CIENTIFICA.md` | Paper obligatorio (Sallis et al. 2026), literatura verificada y 17 experimentos | A02 | **completado** | [abrir](02_INVESTIGACION_CIENTIFICA.md) |
| `03_FUENTES_DATOS_GRATUITOS.md` | Inventario verificado, licencias, límites y riesgos legales | A03 | **completado** | [abrir](03_FUENTES_DATOS_GRATUITOS.md) |
| `04_ARQUITECTURA_MOTORES.md` | Motor A/Motor B: contratos, features, artefactos, integración | A06, A07, A10 | pendiente (A10 en curso, sin tests ni cierre) | — |
| `05_FEATURE_ENGINEERING.md` | Catálogo de 198 columnas, fórmulas, leakage S+1→S−1 y ablación | A05 | **completado** | [abrir](05_FEATURE_ENGINEERING.md) |
| `06_METODOLOGIA_BACKTESTING.md` | Particiones, métricas, bootstrap por bloques, permutación y 83 tests | A08 | **completado** | [abrir](06_METODOLOGIA_BACKTESTING.md) |
| `07_EXPERIMENTOS_RESULTADOS.md` | EXP01–EXP17 con cifras reales y veredictos | A06, A07, orquestador | pendiente (EXP01_final en ejecución) | — |
| `08_COMPARACION_CON_MERCADO.md` | Motor A vs mercado vs Motor B | A07 | pendiente (Motor B en revisión) | — |
| `09_MEJORAS_IMPLEMENTADAS.md` | Cambios aceptados y su evidencia | orquestador, A10 | pendiente (A10 en curso) | — |
| `10_ROADMAP_PREDICCIONES.md` | Siguientes ciclos y prioridades | orquestador | pendiente (decisión del orquestador) | — |
| `11_LIMITACIONES_Y_RIESGOS.md` | Licencias, cobertura de cuotas, timestamps, xG, leakage, sobreajuste y mercados no operables | A03, A04, A05, A09 | **completado** | [abrir](11_LIMITACIONES_Y_RIESGOS.md) |
| `12_REPRODUCIBILIDAD.md` | Comandos, versiones, semilla 20261109, hashes y verificación del leakage corregido | A11 | **completado** | [abrir](12_REPRODUCIBILIDAD.md) |
| `13_COORDINACION_SUBAGENTES.md` | Contratos, reparto real, paralelismo, hallazgos cruzados y estados | A11 | **completado** | [abrir](13_COORDINACION_SUBAGENTES.md) |
| `14_AUDITORIA_ADVERSARIAL.md` | Hallazgos adversariales y su resolución | A09 | pendiente (fase 2 no ejecutada) | — |

## Hechos de la versión documentada

- **Datos:** `matches.parquet` **182.414 × 88** (23 divisiones, 42 etiquetas de temporada, 182.410 con
  resultado); `features.parquet` **182.410 × 198**; `features_market.parquet` **181.268 × 192**
  (anterior al ETL v1.1: **pendiente de regenerar**).
- **Modelos:** Motor A con 5 familias (`base_rate`, `elo_ordered`, `logit`, `poisson_dc`, `hgb`) y
  Motor B con de-vig *power* + capas de calibración. `test` (2024/25 + 2025/26, 16.126 partidos)
  **no se ha usado**.
- **Verificación:** 83/83 tests de `eval/` OK; 10/11 tests del validador ETL (la aserción de filas
  está desactualizada, ver doc 12 §6).
- **Corrección clave:** el leakage de priors S+1 → S−1 está corregido en código y datos; la
  ablación post-corrección está **pendiente** y así se marca en los docs 05 y 11.

## Convenciones

- Cada cifra debe poder reproducirse con un comando listado en el propio documento.
- Estados de evidencia: `OBSERVADO` (salida de comando/archivo), `INFERIDO` (razonamiento),
  `DESCONOCIDO` (no verificado). No se mezclan.
- Si un dato no existe en un informe o artefacto, se escribe **«pendiente de cierre»** o
  **«no verificado»**; no se estima.
- Los números de test solo aparecen una vez congelados los candidatos; lo anterior a esa fecha es
  exploratorio y no puede usarse para seleccionar modelo.
- Rutas del laboratorio relativas a `research/prediction-lab/`; documentos enlazados entre sí.
