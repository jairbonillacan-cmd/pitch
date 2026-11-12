# 03 · Investigación de proveedores (alcance: fuentes gratuitas)

> Decisión que acota esta investigación: **FD-02, datos a US$0/mes** mientras no haya
> ingresos (`docs/architecture/FREE_DATA_STRATEGY.md`, 2026-11-08). Los proveedores
> comerciales se listan solo como referencia de migración; **no se contrata nada sin
> autorización del fundador**.
> **Fecha:** 2026-11-08 · Etiquetas: OBSERVADO (verificado contra la fuente o el repo) / PENDIENTE.

## 1. Fuentes aprobadas en uso

| Fuente | Qué da a PitchLab | Verificación |
|---|---|---|
| **openfootball/football.json** — CC0 1.0 | Calendario + resultados de 6 ligas de fútbol (2010-11 →). Liga MX: `mx.1` solo en 2018-19, 2019-20, 2020-21, 2024-25; Apertura/Clausura/liguilla distinguibles por `round` («Apertura, Matchday 1», «Clausura Playoffs, …») | Licencia en el repo de la fuente; contenido descargado y auditado en `data/history/manifest.json` (sha256 por archivo) |
| **nflverse** (`nflverse-data` releases) — CC-BY 4.0 | `games.csv`: 7,407 partidos 1999→2026 con marcador, semana, sede y **cuotas de cierre** (spread, total, moneylines). Los datasets de FTN (CC-BY-SA) quedan **excluidos** por ShareAlike | Licencia en README de nflreadpy/nfl_data_py; atribución «Datos: nflverse (CC-BY 4.0)» obligatoria y visible |
| **The Odds API, plan Starter gratis** (500 créditos/mes) | Cuotas pre-partido (h2h, spreads, totals) por snapshot; los términos (31-ago-2026) permiten **almacenar indefinidamente y entrenar modelos**, prohiben redistribuir el feed crudo | Página de términos citada en `FREE_DATA_STRATEGY.md`; presupuesto de créditos §3 de esa estrategia |
| **API-Football, plan Free** (100 req/día) | Snapshots de Liga MX para la UI (beta privada). Sonda propia del 2026-11-08: temporadas históricas **2019 y 2021 → `errors=plan`** (bloqueadas); **2023 → 340 fixtures completos** (44 rondas, `Apertura - 1` … `Clausura - Final`) | Respuesta real de la API con la clave del proyecto; términos en api-football.com/terms exigen confirmación de licencia para uso comercial (FD-14) |
| **football-data.org, plan Free** | Snapshots de Premier League en vivo (adaptador nuevo `services/ingest/src/adapters/football-data.ts`) | Adaptador OBSERVADO; **clasificación de términos: PENDIENTE** — no está en `FREE_DATA_STRATEGY.md` y falta verificar atribución/uso comercial antes de ampliar su uso |

## 2. Fuentes con permiso restringido (solo investigación offline)

| Fuente | Restricción | Regla interna |
|---|---|---|
| **football-data.co.uk** | Términos no localizados; se sabe que restringen el uso gratuito en productos comerciales y entrenamiento automatizado | No se integra al pipeline; si algún día se descarga algo, es un CSV manual de investigación que **no se muestra ni se redistribuye** |
| **Cuotas de cierre de nflverse** | CC-BY 4.0 permite todo con atribución, pero el proyecto las declara `usage: research-only` | Comparar el modelo contra el mercado; nunca publicarlas como cuotas propias |

## 3. Descartadas (OBSERVADO en `FREE_DATA_STRATEGY.md`)

- APIs públicas de **MLB y NHL** (no comerciales).
- APIs «ocultas» de **ESPN y NFL.com** (términos de uso personal/no comercial).
- **FBref / Sports-Reference** (prohíben scraping).
- **Cualquier scraping de casas de apuestas** (Caliente, Codere, etc. — triage REA §4: RECHAZAR).

## 4. Proveedores comerciales (fuera de alcance por FD-02; referencia de migración)

| Proveedor | Utilidad futura | Estado |
|---|---|---|
| Sportmonks | Histórico profundo de fútbol + stats | No aplica: **no ofrece NFL** (hallazgo F1) y su costo es recurrente |
| Sportradar | Datos en vivo premium | `COTIZACIÓN`; contratos enterprise; solo cuando haya ingresos |
| SportsDataIO | Alternativa comercial multi-deporte (Liga MX, NCAAF, NHL, MLB) | `COTIZACIÓN` |
| StatsBomb Open Data | Event data/xG de investigación | **PENDIENTE**: verificar términos de su licencia (investigación vs comercial) antes de cualquier descarga |
| Pinnacle | Benchmark de mercado | API pública **cerrada el 23-jul-2025**; el benchmark será el consenso sin vig de casas con licencia (hallazgo F1) |

## 5. Conclusión

Con datos $0, el set **aprobado y ya integrado** es openfootball + nflverse + The Odds
API (cuotas) + API-Football Free (Liga MX en vivo). El siguiente incremento gratuito de
alto valor es el **relleno de Liga MX con API-Football Free (temporadas 2022 y 2023,
2-3 solicitudes)**, documentado como paso siguiente en `06-historical-data-strategy.md`.
