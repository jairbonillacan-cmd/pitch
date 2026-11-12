# Reporte de Extracción, Enriquecimiento Situacional y Auditoría de Datos Multideporte

**Fecha:** 2026-11-09  
**Proyecto:** Pitch Lab — Motor Cuantitativo y Modelado Predictivo de Deportes  
**Alcance:** Fútbol Americano (NFL) y Fútbol Soccer (Liga MX, Premier League, LaLiga, Serie A, Bundesliga, Ligue 1)  
**Ubicación del Documento:** `Reportes/datos/REPORTE-EXTRACCION-DATOS-SITUACIONALES.md`

---

## 1. Resumen Ejecutivo

En cumplimiento de la directiva de investigación y extracción masiva fuera de la caja, se implementó un pipeline end-to-end de recopilación, auditoría empírica y feature engineering situacional sobre los deportes objetivo de Pitch Lab.

El objetivo central consistió en transformar los modelos predictivos —que previamente operaban sobre marcadores brutos o identidades estáticas de equipos (sufriendo techos de LogLoss frente a las líneas de cierre del mercado)— en **motores cuantitativos de alta resolución** alimentados por variables situacionales causales (sin data leakage):
1. **Fútbol Americano (NFL):** Inclusión de ratings as-of de mariscales de campo (QB) con encogimiento Bayesiano, clima severo y velocidad de viento continua, tipo de recinto (domos climatizados vs. exterior), descanso asimétrico y probabilidades implícitas de mercado libres de comisión (vig-free).
2. **Liga MX (Fútbol Mexicano):** Recuperación histórica completa de 1,670 partidos (2022–2026) mediante la API pública de ESPN, incorporando formaciones tácticas, alineaciones titulares, altitud exacta de las 19 sedes geográficas (efecto fisiológico de hipoxia en segundos tiempos), suite estadística ampliada (pases, tackles, intercepciones, despejes) y cuotas de cierre Bet365 aisladas.
3. **Fútbol Europeo (5 Ligas Mayores):** Construcción de un corpus situacional de 41,581 partidos (2000–2026) con calibración empírica de Proxy xG ($r = 0.508$ frente a goles reales), ventanas móviles as-of de 5 partidos para métricas ofensivas/defensivas, congestión de calendario ($\le 3$ días de descanso) y líneas de hándicap y totales de Pinnacle/Bet365.

Todos los datos fueron validados al 100% mediante auditorías automáticas de integridad física, paridad entre formatos y pruebas unitarias de regresión.

---

## 2. Inventario de Datasets Generados y Certificados en Disco

Para garantizar la interoperabilidad con la arquitectura híbrida de Pitch Lab (modelado cuantitativo en Python/DuckDB y orquestación/backtesting en Node.js/TypeScript), cada dataset fue materializado tanto en formato binario columnar optimizado (`.parquet`) como en streaming de texto delimitado por líneas (`.jsonl`):

| Dataset | Ruta en Disco | Formato | Tamaño | Registros | Columnas | Cobertura Temporal |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **NFL Situational (Parquet)** | `data/history/nfl-situational-features.parquet` | Parquet | 0.71 MB | 7,407 | 65 | 1999–2026 |
| **NFL Situational (JSONL)** | `data/history/nfl-situational-features.jsonl` | JSONL | 10.75 MB | 7,407 | 65 | 1999–2026 |
| **Liga MX Enriquecida (JSONL)** | `data/history/research/liga-mx-enriched.jsonl` | JSONL | 8.19 MB | 1,670 | 17 | 2022–2026 |
| **Fútbol Europeo (Parquet)** | `data/history/soccer-situational-features.parquet` | Parquet | 3.01 MB | 41,581 | 76 | 2000–2026 |
| **Fútbol Europeo (JSONL)** | `data/history/soccer-situational-features.jsonl` | JSONL | 80.77 MB | 41,581 | 76 | 2000–2026 |

---

## 3. Desglose Técnico por Deporte

### 3.1. Fútbol Americano (NFL)
- **Script Generador:** `tools/generate_nfl_situational.py`
- **Métricas Situacionales Clave:**
  - **QBs As-Of Causales (Anti-Leakage):** Se corrigió la fuga de datos y el colapso a 0 intentos en las temporadas 2025 y 2026 mediante un join acumulativo de historial previo (`qs.season < gq.season OR (qs.season = gq.season AND qs.week < gq.week)`).
  - **Encogimiento Bayesiano de Eficiencia:** 
    $$\text{EPA}_{\text{shrunk}} = w \cdot \frac{\text{Prior EPA}}{\text{Prior Att}} + (1 - w) \cdot \mu_{\text{NFL}}$$
    donde $w = \frac{\text{Prior Att}}{\text{Prior Att} + 150}$ y $\mu_{\text{NFL}} = +0.0400$ EPA/intento.
  - **Meteorología Efectiva:** Detección de domos cerrados (`effective_wind = 0.0` mph, `effective_temp = 70.0` °F) vs. partidos al aire libre con viento real y temperatura ambiente. Indicadores discretos de frío extremo (`is_cold` $\le 32$ °F, 510 juegos) y viento severo (`is_windy` $\ge 15$ mph, 1,180 juegos).
  - **Ventaja de Descanso:** Diferencial `rest_diff = home_rest - away_rest` e indicador de semana de descanso (`post_bye` $\ge 10$ días).
  - **Mercado Vig-Free:** Probabilidades implícitas normalizadas de local y visita (`implied_prob_home`, `implied_prob_away`) calculadas a partir de los momios de cierre.

### 3.2. Liga MX (Fútbol Mexicano)
- **Script Extractor:** `tools/extract_espn_ligamx.py`
- **Fuente de Datos:** API pública REST de ESPN (`https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1/`).
- **Innovaciones Metodológicas Fuera de la Caja:**
  - **Eliminación del Límite de Cuota:** Al utilizar la API abierta de ESPN se eliminó la restricción de 100 req/día y la omisión de temporadas de API-Football, descargando 1,670 partidos en 36.5 segundos mediante un pool concurrente de 16 hilos.
  - **Altitud Exacta de Sedes (100% de Cobertura):** Mapeo exhaustivo de las 19 sedes geográficas de México. Se identificó el impacto fisiológico de la altitud en estadios extremos como Nemesio Díez (Toluca, 2,667 msnm), Hidalgo (Pachuca, 2,426 msnm), Azteca / Ciudad de los Deportes / Olímpico Universitario (CDMX, 2,240–2,284 msnm), Cuauhtémoc (Puebla, 2,175 msnm), frente a sedes a nivel de mar (Tijuana 40 msnm, Mazatlán 10 msnm).
  - **Resolución de Colisiones de Identificador:** Generación de claves primarias ISO compuestas (`liga-mx:YYYY-MM-DD:home:away`), eliminando por completo 220 colisiones previas.
  - **Alineaciones y Formaciones Tácticas:** 1,670 partidos con alineaciones oficiales de 11 titulares y banca, más formaciones tácticas (e.g., `4-2-3-1`, `5-3-2`).
  - **Aislamiento Estricto de Totales Bet365:** Validación rigurosa de líneas para asignar `over25` y `under25` únicamente cuando la línea base es exactamente 2.5 goles (previniendo la corrupción de cuotas provocada por líneas secundarias de 4.5 o 1.5 goles).

### 3.3. Fútbol Europeo (Premier League, LaLiga, Serie A, Bundesliga, Ligue 1)
- **Script Generador:** `tools/generate_soccer_situational.py`
- **Muestra Histórica:** 41,581 partidos oficiales de liga (2000–2026).
- **Métricas Situacionales Clave:**
  - **Proxy xG Calibrado:**
    $$\text{Proxy xG} = 0.2731 \times \text{Tiros a Puerta} + 0.035 \times \max(\text{Tiros Totales} - \text{Tiros a Puerta}, 0)$$
    Calibrado sobre 83,162 actuaciones de equipo con una correlación $r = 0.508$ frente a los goles reales, reduciendo sustancialmente el ruido Poisson de muestras pequeñas.
  - **Ventana Móvil As-Of de 5 Partidos:** Cálculo causal estricto (`ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING`) de goles anotados/recibidos, proxy xG neto, precisión de tiros a puerta y tasa de conversión.
  - **Congestión de Calendario:** Indicador `is_congested` ($\le 3$ días desde el último juego oficial).
  - **Cuotas de Cierre Desvigadas:** Momios 1X2 de Pinnacle y Bet365 convertidos a probabilidades implícitas analíticas sin margen de casa.

---

## 4. Auditoría de Calidad y Pruebas Ejecutadas

La integridad de los datos y del código se verificó empíricamente mediante dos baterías de pruebas independientes:

### 4.1. Verificador de Dominio e Integridad (`tools/verify_all_datasets.py`)
```
======================================================================
DATASET INTEGRITY & QUALITY AUDIT
======================================================================
--- Phase 1: Physical File & Schema Inspection ---
[OK] NFL Situational Features (Parquet): 7,407 rows, 65 cols, 0.71 MB
[OK] NFL Situational Features (JSONL): 7,407 rows, 65 cols, 10.75 MB
[OK] Liga MX Enriched (JSONL): 1,670 rows, 17 cols, 8.19 MB
[OK] European Soccer Situational (Parquet): 41,581 rows, 76 cols, 3.01 MB
[OK] European Soccer Situational (JSONL): 41,581 rows, 76 cols, 80.77 MB

--- Phase 2: Domain Integrity Audits ---
[PASS] Liga MX 0 ID collisions verified.
[PASS] Liga MX 0 shot nulls verified (Home=0, Away=0).
[PASS] Liga MX 100% venue altitude coverage verified (1670/1670).
[PASS] Liga MX Bet365 O/U 2.5 line isolation certified (1,211 over25, 1,211 under25, 0 invalid).
[PASS] Liga MX full tactical stats suite certified (1670/1670).
[PASS] Season 2025 QB passing history recovery certified (Home: 99.6%, Away: 99.3%).
[PASS] Season 2026 QB passing history recovery certified (Home: 100.0%, Away: 100.0%).
[PASS] European Soccer 0 ID collisions verified.
[PASS] European Soccer implied probabilities validated within [0, 1].

--- Phase 3: Parquet vs JSONL Parity Audits ---
[PASS] NFL Parquet and JSONL full parity certified: 7,407 rows, 65 cols.
[PASS] Soccer Parquet and JSONL full parity certified: 41,581 rows, 76 cols.
======================================================================
FINAL CERTIFICATION: ALL 5 DATASETS FULLY VALIDATED AND INTEGRITY CERTIFIED
======================================================================
```

### 4.2. Pruebas Unitarias del Monorepo (`pnpm test`)
- Se ejecutaron los tests en los 8 proyectos del workspace (`@pitchlab/contracts`, `@pitchlab/tokens`, `@pitchlab/models`, `@pitchlab/engines-reference`, `@pitchlab/sports-assets`, `@pitchlab/ui`, `@pitchlab/ingest`, `apps/web`).
- **Resultado:** 100% de tests aprobados (0 errores, 0 regresiones).
- **Linter de Código:** Validación completada con 0 fallos de formato ni colores fuera de tokens.

---

## 5. Herramientas y Scripts Incorporados al Repositorio

Los siguientes scripts modulares quedaron disponibles en `tools/` para reejecución, actualización continua y verificación de datos:

1. `tools/extract_espn_ligamx.py`: Extractor multihilo para Liga MX con cuotas de Bet365, alineaciones, altitudes de estadios y estadísticas ampliadas de ESPN.
2. `tools/generate_nfl_situational.py`: Pipeline DuckDB de ingeniería de variables de la NFL con modelo meteorológico y join causal as-of para QBs.
3. `tools/generate_soccer_situational.py`: Pipeline DuckDB de fútbol europeo con cálculo de proxy xG, ventanas móviles de 5 juegos y probabilidades vig-free.
4. `tools/verify_all_datasets.py`: Auditor técnico unificado de integridad, paridad, nulos y colisiones en bases de datos.

---

## 6. Conclusión y Pasos Siguientes

Con la generación y certificación de estos datasets, Pitch Lab dispone de un banco de más de **50,000 partidos históricos** enriquecidos con variables tácticas, situacionales y meteorológicas. 

**Recomendaciones para el entrenamiento de modelos:**
1. **NFL:** Reemplazar el Ridge sobre márgenes brutos por un ensamble regularizado que pondere la ventaja de QB titular (EPA encogido), el viento efectivo en exteriores y el descanso asimétrico.
2. **Fútbol:** Integrar el Proxy xG y el diferencial de altitud en el modelo Dixon-Coles y la regresión logística multinomial de `services/ingest/src/history-backtest.ts`, cerrando la brecha predictiva frente a las cuotas de cierre del mercado.
