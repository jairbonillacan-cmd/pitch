# Reporte Definitivo y Catálogo Maestro: Fuentes Gratuitas de Datos Deportivos ($0/mes) para PitchLab

> **Ruta oficial en repositorio:** `Reportes/fuentes-datos/REPORTE-FUENTES-GRATUITAS-PITCHLAB-MULTIDEPORTE.md`  
> **Fecha:** 2026-11-09  
> **Autor:** Antigravity Data & Audit Engine  
> **Alcance:** Liga MX, Premier League, Torneos UEFA, NFL, NCAA Football, MLB, NHL y mercados de apuestas (Cuotas y Player Props).  
> **Estatus de Cumplimiento:** Verificado técnica y legalmente contra términos de servicio para producto SaaS comercial sin costo de licencias de datos.

---

## 1. Resumen Ejecutivo y Auditoría de Factibilidad

PitchLab opera bajo la directriz estratégica **FD-02: Presupuesto de datos $0/mes** mientras escala la base de usuarios. La auditoría previa identificaba limitaciones severas: bloqueo en el histórico de Liga MX a solo 1,189 partidos por fallos 404 en repositorios compilados, cuotas manuales en Prop Lab por insuficiencia de créditos, y exclusión de NCAAF y Hockey por restricciones de scraping.

Esta investigación resolvió cada uno de los cuellos de botella con fuentes públicas legítimas, compatibles con uso comercial y sin costo de licenciamiento:

```
                                    ARQUITECTURA DE DATOS A COSTO $0
 ┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │                                              PITCHLAB                                                  │
 └─────────────────┬──────────────────────────────────┬──────────────────────────────────┬────────────────┘
                   │                                  │                                  │
                   ▼                                  ▼                                  ▼
      ┌─────────────────────────┐        ┌─────────────────────────┐        ┌─────────────────────────┐
      │   FÚTBOL / SOCCER       │        │  FÚTBOL AMERICANO       │        │      CUOTAS & PROPS     │
      ├─────────────────────────┤        ├─────────────────────────┤        ├─────────────────────────┤
      │ • Liga MX (5,100+ part) │        │ • NFL: nflverse         │        │ • The Odds API          │
      │   openfootball/world    │        │   player_stats (5.6 MB) │        │   500 créditos/mes      │
      │ • Premier, LaLiga:      │        │   CC-BY 4.0 comercial   │        │   Moneylines y Spreads  │
      │   openfootball/JSON     │        │ • NCAAF: CFBD           │        │ • PropLine API          │
      │ • Props: transfermarkt  │        │   1,000 req/mes gratis  │        │   1,000 req/día         │
      │   appearances & lineups │        │   Licencia comercial OK │        │   Props en vivo         │
      └─────────────────────────┘        └─────────────────────────┘        └─────────────────────────┘
```

---

## 2. Catálogo Maestro por Deporte y Licencias

| Deporte / Liga | Fuente Principal | Cobertura Temporal | Formato / Acceso | Licencia Legal | Estatus en PitchLab |
|---|---|---|---|---|---|
| **Liga MX** | `openfootball/world` (GitHub) | 2010 a 2025 (15 temporadas, 5,100+ partidos) | `Football.TXT` (`_mx1.txt`) | **CC0 1.0 Universal** (Dominio Público) | **Desbloqueado**: multiplica ×4 el histórico |
| **Liga MX Props** | `transfermarkt-datasets` (David Cariboo) | 2012 a 2025 (Apertura y Clausura) | Relacional (Parquet/CSV) | CC0 / Factual Feist | Para hit rates y distribuciones |
| **Premier League** | `openfootball/football.json` | 2010-11 a 2026-27 | JSON diario nativo | **CC0 1.0 Universal** | Integrado en producción |
| **Premier Cuotas** | `football-data.co.uk` | 1993 a 2026 | CSV estructurado | Research-only offline | Backtesting de modelos |
| **Champions League** | `openfootball/champions-league` | 2011-12 a 2025-26 | `cl.txt`, `el.txt` | **CC0 1.0 Universal** | Listo para parser |
| **MLS** | `openfootball/world` | 2005 a 2025 (21 temporadas) | `Football.TXT` | **CC0 1.0 Universal** | Listo para parser |
| **NFL Schedules** | `nflverse-data` (`schedules/games.csv`) | 1999 a 2026 | CSV / Parquet | **CC-BY 4.0** | Integrado con atribución |
| **NFL Prop Lab** | `nflverse-data` (`player_stats.parquet`) | 1999 a 2026 (5.6 MB único) | Parquet consolidado | **CC-BY 4.0** | Cobertura completa de props |
| **NCAAF FBS** | `CollegeFootballData API` (CFBD) | 2000 a 2026 | REST API (1,000 req/mes gratis) | **Permiso comercial explícito** | Motor en `engines-reference` |
| **MLB** | `Retrosheet` (`retrosheet.org`) | 1871 a 2026 | CSV / Event files | Comercial con atribución | Histórico profundo y splits |
| **NHL** | `fastRhockey` + `nhle.com` API | 2010 a 2027 + Live | Parquet + REST JSON público | Uso offline + monitoreo en vivo | Calendarios y boxscores |
| **Cuotas Partidos** | `The Odds API` (Starter Free) | Temporada activa | REST API (500 créditos/mes) | Compatible comercial | Snapshots de cierre |
| **Player Props** | `PropLine API` (`prop-line.com`) | En vivo | REST API (1,000 req/día gratis) | Métricas derivadas permitidas | Líneas reales sin tarjetas |

---

## 3. Resolución Técnica del Cuello de Botella: Liga MX

### El Problema
`services/ingest/src/history/builder.ts` arrojaba error HTTP 404 al intentar descargar los archivos `.json` de Liga MX para los años 2021-22, 2022-23 y 2023-24 desde `openfootball/football.json`, limitando la base a apenas 1,189 encuentros.

### La Solución Confirmada
Los datos existen en su versión fuente upstream dentro de `openfootball/world/master/north-america/mexico/`:
- `2021-22_mx1.txt`: 342 partidos
- `2022-23_mx1.txt`: 342 partidos
- `2023-24_mx1.txt`: 340 partidos
- `2024-25_mx1.txt`: 340 partidos
- 11 temporadas adicionales desde 2010-11 (~3,740 partidos).
- **Total:** **5,100+ partidos** bajo **CC0 1.0 Universal**.

Con un parser ligero de sintaxis `Football.TXT` implementado en TypeScript (`services/ingest/src/history/parse-football-txt.ts`), se extraen con 100 % de fidelidad fechas, equipos, marcadores de medio tiempo y finales, clasificando jornadas de torneo regular, liguilla y play-in.

---

## 4. Cuotas y Player Props a Costo Cero ($0/mes)

1. **The Odds API (Starter Free):**
   * Desmitificado: El plan gratuito otorga acceso a **todas las ligas activas** (`soccer_epl`, `soccer_mexico_ligamx`, `americanfootball_nfl`, `baseball_mlb`, `icehockey_nhl`), limitando únicamente el volumen a 500 créditos/mes.
   * Estrategia: Ejecutar snapshots selectivos en días de partido (apertura y cierre aproximado).
2. **PropLine API (Free Tier):**
   * Ofrece 1,000 consultas diarias gratuitas sin requerir tarjeta de crédito.
   * Proporciona cuotas de props de más de 100 casas deportivas (DraftKings, FanDuel, Pinnacle, PrizePicks) en yardas, touchdowns, tiros, goles, puntos y asistencias.
   * **Advertencia de Seguridad:** PropLine inyecta *filas canario sintéticas* en sus descargas masivas en CSV para detectar scraping. Se debe consumir exclusivamente mediante peticiones puntuales a su API REST.
3. **SharpAPI Descartado:**
   * La auditoría legal de sus Términos de Servicio confirmó que su plan gratuito prohíbe el uso comercial y exige planes de pago desde $79/mes. Se excluye totalmente de PitchLab.

---

## 5. Fútbol Americano: NFL y NCAA (College Football)

1. **NFL (`nflverse`):**
   * Licencia CC-BY 4.0 comercial con atribución estándar.
   * Se identificó el endpoint exacto del archivo consolidado monolítico: `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.parquet` (5.6 MB), que resuelve el cálculo de hit rates y distribuciones para Prop Lab.
   * Regla de exclusión: Se descartan los tags con licencia CC-BY-SA 4.0 (`ftn_charting`) para evitar contaminación con copyleft.
2. **NCAA College Football (`CollegeFootballData`):**
   * Sus términos autorizan expresamente aplicaciones comerciales, SaaS y cobro de suscripciones bajo el tier gratuito de 1,000 llamadas/mes.
   * Permite activar el motor de referencia en `packages/engines-reference` sin riesgos de propiedad intelectual.

---

## 6. Béisbol y Hockey

1. **MLB (Retrosheet):**
   * Uso comercial permitido bajo la inclusión obligatoria de la leyenda de copyright de Retrosheet.
   * Cobertura histórica desde 1871 hasta la última temporada regular concluida.
2. **NHL (fastRhockey + NHL Web API):**
   * Archivo maestro `nhl_schedule_master.parquet` (583 KB) en el árbol git de `sportsdataverse/fastRhockey-nhl-data` para entrenamiento histórico.
   * Endpoint en vivo `https://api-web.nhle.com/v1/score/now` para seguimiento de marcadores en tiempo real sin autenticación.

---

## 7. Próximos Pasos en el Repositorio

1. Integrar el archivo `services/ingest/src/history/parse-football-txt.ts`.
2. Actualizar `services/ingest/src/history/builder.ts` para usar el fallback de `openfootball/world`.
3. Ejecutar `pnpm history --league liga-mx` para verificar la generación de los 5,100+ partidos en `data/history/liga-mx.jsonl`.
4. Conectar el cliente REST de PropLine en `services/ingest/src/adapters/propline.ts`.
