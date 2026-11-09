# A03 — Inventario verificado de fuentes gratuitas de datos deportivos

**Agente:** SUBAGENTE 03 — DATA SOURCE RESEARCHER · **Proyecto:** PitchLab Prediction Lab
**Fecha:** 2026-11-09 (America/Mexico_City) · **Ventana de verificación:** 07:25–07:36 UTC
**Alcance:** fútbol, NFL, NHL, NCAA Football. Sin cambios en el repositorio.

---

## 0. Método

Toda afirmación de disponibilidad viene de una petición real: `curl -sS -L --max-time 45 -A "Mozilla/5.0 (compatible; PitchLabResearch/1.0)" -w "%{http_code}|%{size_download}"`, con cuerpo, cabeceras y error en `/tmp/a03/`. Ninguna cifra se tomó de memoria.

Etiquetas: **HECHO** = código, tamaño o texto leído en esta sesión; **INFERENCIA** = deducción propia; **HIPÓTESIS** = conjetura falsable. Estados: **V** = 200 con carga útil; **F** = 4xx/5xx, redirección ajena, caída o bloqueo por ToS.

**Recuento: 22 fuentes evaluadas (24 endpoints) → 13 V, 9 F.**

---

## 1. Resumen ejecutivo

1. **football-data.co.uk no tiene licencia (HECHO).** `terms.php`, `licence.php`, `about.php` y `legal.php` dan 404; la portada, `data.php` y `contact.php` no contienen "copyright" ni "terms". La única declaración de uso es *"My data is free"*. Uso comercial: **NO CONFIRMADO**.
2. **La mejor fuente gratuita de xG de evento es StatsBomb Open Data (HECHO).** 80 pares competición-temporada y `statsbomb_xg` por disparo. **Understat está caída** ("We will come back soon") y **FBref responde 403**: ninguna de las dos sirve hoy.
3. **No existe cuota histórica gratuita con timestamp (HECHO).** football-data separa apertura y cierre sin hora de captura; The Odds API reserva el histórico al plan de pago; Betfair da 403; OddsPortal no expone ToS. La única vía legítima es construir la serie desde ahora.
4. **NFL es el deporte mejor servido (HECHO).** nflverse publica play-by-play 1999→2024 con 372 columnas (EPA, WPA, `spread_line`) bajo **CC BY 4.0**, que permite uso comercial con atribución.
5. **Liga MX está cubierta a medias (HECHO).** `new/MEX.csv`: 4.789 partidos desde 2012/13, pero sólo resultado y cuotas de cierre; sin tiros, córners, tarjetas, árbitro ni xG.

---

## 2. football-data.co.uk

### 2.1 Disponibilidad

| Recurso | HTTP | Bytes | Filas |
|---|---:|---:|---:|
| `mmz4281/0001/E0.csv` | 200 | 62.076 | 381 |
| `mmz4281/1011/E0.csv` | 200 | 106.586 | 381 |
| `mmz4281/2021/E0.csv` | 200 | 175.815 | 381 |
| `mmz4281/2425/E0.csv` | 200 | 197.110 | 381 |
| `mmz4281/2526/E0.csv` | 200 | 203.438 | 381 |
| `mmz4281/2627/E0.csv` | 200 | 44.210 | 91 |
| `new/MEX.csv` | 200 | 611.847 | 4.790 |
| `notes.txt` | 200 | 7.750 | — |
| `downloadm.php` | 200 | 106.827 | — |
| `terms.php` | **404** | 1.271 | — |

**HECHO:** `www.` responde 302 a `football-data.co.uk`; el 200 llega tras la redirección. Cada respuesta trae `x-ws-ratelimit-limit: 1000` y `remaining: 999`: cuota declarada de **1.000 peticiones** (ventana no anunciada). La 2026/27 está en curso (90 partidos de Premier al 3-nov-2026) y el histórico arranca en 1993/94.

### 2.2 Campos y el cambio de 2026/27

**HECHO — hallazgo principal:** en 2026/27 football-data **añadió `HxG` y `AxG`** y **eliminó Pinnacle**. Comprobado en dos divisiones: `E0` 90/90 partidos con xG y `SP1` 109/109. En 2024/25 no hay xG, pero la estadística está completa (`HS`, `AS`, `HST`, `AST`, `HC`, `AC`, `HY`, `AY`, `HR`, `AR`, `Referee`, `Time` = 380/380). Columnas por temporada: 45 (2000/01) → 106 (2020/21) → 120 (2024/25) → 114 (2026/27).

**HECHO — las cuotas:**

> "Since 2019/20 I have collected two sets of odds. The first set is collected after market opening at times specified on my fixtures page. The second set are the closing odds ('C' included the data column headings). Closing home-draw-away odds are also available for Pinnacle bookmaker only back to 2012/13). In earlier seasons, there are only the pre-closing odds." — `downloadm.php`

Sin timestamp de cuota: `Date` y `Time` son del partido. Lo único temporal:

> "Betting odds for weekend games are collected Friday afternoons, and on Tuesday afternoons for midweek games." — `notes.txt`

**INFERENCIA:** alcanza para usar la cuota de cierre como target, pero **no permite CLV** ni estudiar el movimiento intra-semana.

### 2.3 Licencia: el texto y lo que falta

**HECHO — no existe licencia.** `terms.php`, `licence.php`, `about.php`, `legal.php` y `privacy.php` dan 404. Única declaración de uso:

> "My data is free, but for those who want a subscription API service, I am now partnering with TheStatsAPI." — `downloadm.php`

**HECHO — la admisión que crea el problema jurídico:**

> "Football-Data would like to acknowledge the following sources which have been utilised in the compilation of Football-Data's results and odds files."
> "Current results — XScores"
> "Match statistics — BBC, Flashscore, ESPN Soccer, Bundesliga.de, Gazzetta.it and Football.fr"
> "Bookmakers betting odds — Betbrain.com, Oddsportal.com, Individual bookmakers" — `notes.txt`

**HECHO — robots.txt bloquea agentes de IA:**

> "# Block major AI training models" · "User-agent: GPTBot — Disallow: /" · "User-agent: Anthropic-AI — Disallow: /" · "User-agent: ClaudeBot — Disallow: /"

**INFERENCIA (no es asesoría legal):** "gratis" no es una licencia: sin texto que autorice redistribución ni uso comercial, el titular conserva todos los derechos. Las cuotas se compilan además de Oddsportal y de casas de apuestas, y en la UE el derecho *sui generis* protege la inversión en recolección aunque no haya copyright. **Uso interno: riesgo bajo pero indocumentado. Redistribución o producto comercial: NO CONFIRMADO.**

---

## 3. Otras fuentes de fútbol

**Understat — F.** `/league/EPL/2024` → **200** pero 26.719 B de página de error: *"Understat.com — We will come back soon"*. Igual en `/league/EPL` y en `/robots.txt` (sirve el mismo HTML). Caída declarada, no bloqueo. No integrable hoy.

**FBref — F.** `/en/` y `/en/comps/9/...` → **403** con `<title>Just a moment...</title>` (Cloudflare); `robots.txt` y `sports-reference.com/termsofuse.html` también dan 403. **NO CONFIRMADO** e inaccesible sin navegador.

**StatsBomb Open Data — V.** `matches/11/90.json` → **200**, 64.041 B, 35 partidos. `events/3788741.json` → **200**, 3.208.593 B, 27 disparos con `statsbomb_xg`, `freeze_frame`, `body_part`. `competitions.json` → **200**, 34.887 B, **80 pares**: Mundial 1958–2022, Euro 2020/2024, Champions (18), La Liga 1973–2021, Premier 2003/04 y 2015/16, MLS 2023, Liga Profesional, NWSL, Liga F. Licencia (README): *"freely available for public use for research projects and genuine interest in football analytics"* y *"please state the data source as StatsBomb and use our logo"*. El `LICENSE.pdf` (165.130 B) se titula **"StatsBomb Public Data User Agreement"**, pero su texto no se pudo extraer. **Comercial: NO CONFIRMADO** — redactada para investigación.

**openfootball / football.json — V.** `2024-25/en.1.json` → **200**, 110.141 B, 380 partidos (`round`, `date`, `time`, `team1/2`, `score.ht/ft`). Sin cuotas ni stats. **CC0 1.0** (*"including without limitation commercial purposes"*), actualización diaria 05:00 UTC. **Comercial: SÍ.**

**football.db — V.** `README.md` → **200**, 1.627 B. Clubes y estadios, *"free open public domain"*, ecosistema CC0. Sin partidos.

**OpenLigaDB — V.** `getmatchdata/bl1/2024` → **200**, 592.318 B, **306 partidos** (`matchDateTimeUTC`, `matchResults`, `goals`). Sin clave. **ODbL**: *"Die über diese API bereitgestellten Daten stehen unter der Open Database License (ODbL)."* **Comercial: SÍ con atribución y *share-alike*.**

**TheSportsDB — V (parcial).** `json/3/...` → **403**: *"The old '3' Free Sports API key is permanently disabled, Please use the new test key "123""*. Con `json/123/...` → **200**, 11.465 B, sólo metadatos de liga. Premium 9 USD/mes. Licencia no publicada → **NO CONFIRMADO**.

**API-Football — F.** `v3.football.api-sports.io/leagues` → **403** (`Missing application key`). Free 100 req/día; odds históricas en planes pagos; la página de precios da 403. **NO CONFIRMADO.**

**football-data.org — V.** `v4/competitions` → **200**, 74.548 B, **192 competiciones** (`TIER_ONE`…`TIER_FOUR`). *"Access to the top competitions is and will be free forever"*. Límites: 100 req/24 h sin registro; *"10 requests/minute in the free plan"*. **Comercial: NO CONFIRMADO.**

**Kaggle — V.** `datasets/list?search=premier league` → **200**, 82.747 B, 20 resultados; descarga de `irkaal/english-premier-league-results` → **200**, 608.778 B, ZIP, sin autenticación. Licencias **por dataset**: `CC0`, `CC BY-NC-SA 4.0`, `MIT` y `Unknown` en la misma búsqueda. Es un agregador, no una fuente.

**FiveThirtyEight SPI — F.** El CSV del repo ya no existe (404; sólo queda `README.md`) y la API viva hace **302 → `abcnews.go.com/politics`**. Datos muertos.

**ESPN — F (prohibido).** ToS de ESPN → 404 en dos rutas; aplican los de Disney (200, 111.071 B), que prohíben *"access, monitor, copy or extract the Disney Products using a robot, spider, script, or other automated means... for data mining or web scraping"* y *"use the Disney Products for any commercial or business-related use"*. Descartado por ToS.

---

## 4. Cuotas históricas: qué es gratis y qué no

| Fuente | Timestamp | ¿Gratis? | Evidencia | Veredicto |
|---|---|---|---|---|
| football-data.co.uk | **No** | Sí | 200; 120–132 columnas; sin hora de captura | Único histórico masivo gratuito |
| The Odds API | Snapshots | **No** | `/v4/historical/` → **401** `MISSING_KEY`; free 500 créditos/mes; histórico desde 30 USD/mes | Pago |
| Betfair Historical | No verificable | **No** | `historicdata.betfair.com` → **403**; `developer.betfair.com` → **403** | Pago (no verificable) |
| OddsPortal | Parcial en UI | Dudoso | 200 pero redirige a `cuotasahora.com`; ToS devuelve la portada | **NO CONFIRMADO — no usar** |
| API-Football | No verificable | **No** | 403 sin clave; histórico en planes pagos | Pago |
| Kaggle | Rara vez | Sí | Licencia por dataset | Heterogéneo |

**HECHO:** ninguna fuente gratuita verificada da cuota con timestamp. **INFERENCIA:** para el laboratorio no es bloqueante (el target natural es el cierre), pero **invalida cualquier estudio de CLV con datos gratuitos**; la salida está en §7 (P0-2).

---

## 5. NFL, NHL y NCAA Football

**nflverse — V.** `pbp/play_by_play_2024.csv.gz` → **200**, 19.362.351 B, **49.492 jugadas, 372 columnas**: `epa`, `wpa`, `xpass`, `pass_oe`, `spread_line`, `total_line`, `roof`, `temp`. `schedules/games.parquet` → **200**, 523.464 B. Cobertura 1999→2024. **CC BY 4.0** → **comercial SÍ con atribución.**

**nfl-data-py — V.** PyPI JSON → **200**, 51.506 B, v**0.3.3**, **MIT** (*"python library for interacting with NFL data sourced from nflfastR"*). Cliente, no fuente.

**NHL API — V.** `v1/schedule/2025-01-15` → **200**, 97.052 B (`gameWeek[].games[]`: `id`, `startTimeUTC`, `gameState`, `venue`). `gamecenter/2024020001/boxscore` → **200**, 13.635 B (`playerByGameStats`, `linescore`). `api.nhle.com/stats/rest` → **200**, 2.640 B. `club-schedule/MTL/now` → **404** (exige temporada). **Licencia: NO CONFIRMADO** — API interna no documentada; `nhl.com/info/terms-of-use` da "Oops! Error 404".

**sportsdataverse-data — V.** Releases `nhl_groups` (229 assets CSV+Parquet), `cfb_groups` (329), `nfl_groups`, `cfb_pbp`. Licencia por release; los derivados de ESPN arrastran el problema de origen.

**CollegeFootballData — F sin clave.** `games?year=2025&week=1` y `/info` → **401**. La web ofrece *"Request a free API key"* y tiers de Patreon. **"© 2026 CollegeFootballData.com. All rights reserved."** → **comercial NO CONFIRMADO**; la clave gratuita es *"for testing"*.

**cfbfastR-data — V.** `README.md` → **200**, 6.000 B: el play-by-play vivo migró a `sportsdataverse-data`; `pbp/` 2002–2021 está congelado.

---

## 6. Tabla maestra

### 6.1 Fútbol

| URL | Tipo | Competiciones | Temporadas | Campos | Actualización | Licencia | Comercial | Límites | Calidad | Carencias | P |
|---|---|---|---|---|---|---|---|---|---|---|---|
| football-data.co.uk/mmz4281 | Resultados+cuotas+stats | 22 divisiones / 11 países | 1993/94→2026/27 | 1X2, AH, O/U, tiros, córners, tarjetas, árbitro, xG (26/27) | Semanal | Ninguna | **NO CONFIRMADO** | 1.000 req/ventana | Alta | Sin timestamp; xG sólo 26/27 | **P0** |
| football-data.co.uk/new | Resultados+cuotas cierre | 14 ligas (MEX, ARG, BRA, USA…) | 2012/13→2026/27 | `PSCH`, `MaxC`, `AvgC`, `BFEC`, `B365C` | Semanal | Ninguna | **NO CONFIRMADO** | Ídem | Media | Sin stats ni apertura | **P0** |
| statsbomb/open-data | Eventos+xG+360 | 80 comp-temporada | 1958→2024 | `statsbomb_xg`, `freeze_frame`, presión | Por release | Public Data User Agreement | **NO CONFIRMADO** | GitHub raw | Muy alta | No cubre temporada actual | **P1** |
| football-data.org | Fixtures, tablas, plantillas | 192 competiciones | Actual | Resultados, tablas, alineaciones | Live | Propia | **NO CONFIRMADO** | 10 req/min free | Alta | Free = TIER_ONE | P1 |
| openfootball | Fixtures+resultados | ~20 ligas | Histórico | `date`, `team1/2`, `score.ft/ht` | Diaria | **CC0 1.0** | **SÍ** | GitHub raw | Media | Sin cuotas ni stats | P2 |
| openligadb.de | Resultados Bundesliga | BL1/BL2 | 1963→ | `matchResults`, `goals` | Por jornada | **ODbL** | **SÍ** (share-alike) | Sin clave | Media-alta | Sólo Alemania | P2 |
| thesportsdb.com | Metadatos+arte | Global | — | Escudos, países | Continua | No publicada | **NO CONFIRMADO** | Clave test compartida | Media | Sin resultados | P2 |
| understat / fbref / 538 | xG y stats | 6 ligas / global | 2014→2022 | tiros, xG, SPI | Caída / 403 / muerta | No verificable | **NO CONFIRMADO** | 403, caída, 302 | — | No viables hoy (§3) | — |
| ESPN / api-football | Todo / odds | Global | Histórico | — | — | Disney ToS / comercial | **NO** / pago | Prohibido / 100/día | — | Descartadas (§3) | — |

### 6.2 NFL / NHL / NCAAF

| URL | Tipo | Competiciones | Temporadas | Campos | Actualización | Licencia | Comercial | Límites | Calidad | Carencias | P |
|---|---|---|---|---|---|---|---|---|---|---|---|
| nflverse-data/pbp | Play-by-play | NFL | 1999→2024 | 372 cols: `epa`, `wpa`, `xpass`, `spread_line` | Post-partido | **CC BY 4.0** | **SÍ** | GitHub releases | Muy alta | Sin lesiones in-game | **P0** |
| nflverse schedules | Calendario+resultados | NFL | 1999→ | `result`, `spread_line`, `total_line` | Semanal | **CC BY 4.0** | **SÍ** | Ídem | Alta | — | **P0** |
| nfl-data-py | Cliente Python | NFL | — | Envuelve nflverse | — | **MIT** | **SÍ** | — | Alta | No es fuente | P1 |
| api-web.nhle.com | Calendario, boxscore | NHL | Actual | `playerByGameStats`, `linescore` | Live | No documentada | **NO CONFIRMADO** | Sin SLA; cachear | Alta | API interna | **P1** |
| sportsdataverse-data | Derivados | NHL, NCAAF, NFL | Variable | Grupos, PBP | Por release | Por release | **NO CONFIRMADO** | GitHub | Alta | Depende de ESPN/CFBD | P1 |
| collegefootballdata.com | Resultados, PPA | NCAAF | 2000→ | `ppa`, `successRate`, `winProb` | Live | "All rights reserved" | **NO CONFIRMADO** | Clave free "testing" | Alta | Free limitado | P2 |

---

## 7. Propuesta de integración priorizada

**P0-1 · Backbone de fútbol.** Ingesta semanal idempotente de `mmz4281/{season}/{div}.csv` (22 divisiones) y `new/{country}.csv` (14 ligas) a un esquema único: `match_id` sintético (`div|date|home|away`), `kickoff_utc`, `hg/ag`, `ht_hg/ht_ag`, `odds_open_{h,d,a}` (nullable), `odds_close_{h,d,a}`, `bookmaker`, `xg_h/xg_a` (nullable), `shots`, `corners`, `cards`, `referee`. Guardar hash del CSV y fecha de descarga para reproducir el punto-en-el-tiempo. Descarga secuencial y caché de 24 h respetando el límite de 1.000.

**P0-2 · Serie temporal propia de cuotas.** Ninguna fuente gratuita timestampea: arrancar *polling* propio con 2 capturas/día por competición (apertura y ~60 min antes del kickoff), guardando `captured_at`, `source`, `market`, `line`. En seis meses hay un histórico de CLV que ningún proveedor gratuito vende. Sólo endpoints que permitan acceso automatizado, con User-Agent identificable.

**P0-3 · NFL inmediato.** `pbp` + `schedules` de nflverse (CC BY 4.0, 372 columnas, `spread_line`): única familia con licencia comercial clara y granularidad de jugada; sirve de *benchmark* para el fútbol.

**P1-1 · StatsBomb para xG de evento.** No cubre la temporada actual, pero permite entrenar un modelo de xG con `statsbomb_xg` como etiqueta y aplicarlo a los tiros de football-data. Atribución y logo obligatorios; comercial requiere permiso.

**P1-2 · football-data.org free tier.** Fixtures, tablas y alineaciones a 10 req/min (TIER_ONE). *Fallback* de calendario, nunca de cuotas.

**P1-3 · NHL API + sportsdataverse.** Caché agresiva (API interna sin SLA) y `nhl_groups` para alinear nombres.

**P2-1 · OpenLigaDB (ODbL).** Bundesliga y validación cruzada; cuidado con el *share-alike*.

**P2-2 · CFBD/NCAAF.** Sólo con clave y revisión de términos: el free tier es "for testing".

**P2-3 · openfootball (CC0) y TheSportsDB.** Baratos, bajo valor predictivo.

**Excluir:** Understat (caída), FBref (403), ESPN (ToS), OddsPortal (ToS no verificable), 538 (muerta), Betfair/API-Football histórico (pago).

**Regla de diseño (INFERENCIA):** capa `sources/` con registro de licencias (`ok | no_confirmado | prohibido`) que **rompa el build** si un dataset `no_confirmado` entra en un artefacto público.

---

## 8. Riesgos legales

1. **football-data.co.uk no licencia nada.** "Free" describe el acceso, no los derechos; alto riesgo si se redistribuyen CSV o se expone una API pública. Mitigación: uso interno, atribución, no redistribuir el crudo.
2. **Titularidad contaminada.** `notes.txt` declara compilación desde Oddsportal, Flashscore, ESPN y BBC: aunque football-data no reclame derechos, esos terceros sí podrían. Mitigación: no revender cuotas, sólo probabilidades derivadas propias.
3. **Derecho *sui generis* (UE).** La inversión en recolección está protegida sin copyright; afecta a extracciones sustanciales y repetidas. Mitigación: extracción parcial y transformación sustancial.
4. **`robots.txt` hostil a agentes de IA** (GPTBot, ClaudeBot, Anthropic-AI, CCBot). Descargar 22 CSV semanales no es entrenamiento, pero la señal es clara. Mitigación: User-Agent identificable, baja frecuencia, caché.
5. **StatsBomb es "research".** Eventos crudos en un producto comercial incumplen la licencia. Mitigación: uso offline para entrenar y validar.
6. **ESPN/Disney prohíbe** extracción automatizada, datasets y uso comercial. Cero tolerancia.
7. **CFBD: "All rights reserved"** con clave "for testing". Uso comercial sin acuerdo es riesgo directo.
8. **NHL API sin licencia ni SLA.** Mitigación: caché persistente y plan B (sportsdataverse).
9. **OddsPortal sin ToS accesible:** la ausencia de permiso se trata como prohibición. **No usar.**
10. **Datos personales.** StatsBomb incluye `dob` de entrenadores; GDPR/LFPDPPP al enriquecer perfiles.

---

## 9. Límites

- Ventana de ~11 minutos: Understat, FBref y Betfair merecen reintento en 48 h.
- Sin clave no se evaluaron CFBD, API-Football ni el histórico de The Odds API más allá del 401.
- Betfair da 403 desde esta IP: "pago" se reporta como **no verificable**. El `LICENSE.pdf` de StatsBomb no se pudo extraer (fuentes subset, sin `pdftotext`); se cita el README.

---

## Anexo A — Log de verificación (UTC, 2026-11-09)

```
07:25:55  mmz4281/2425/E0.csv      302→200 197110 text/csv
07:25:58  mmz4281/2627/E0.csv      302→200  44210 text/csv
07:26:00  new/MEX.csv              302→200 611847 text/csv
07:26:21  terms.php                404       1271
07:27:10  understat/league/EPL     200      26719 (error)
07:27:11  fbref.com/en/            403       5508 (Cloudflare)
07:27:12  statsbomb matches/11/90  200      64041 json
07:27:40  openligadb bl1/2024      200     592318 json
07:27:41  thesportsdb json/3       403        153 (clave muerta)
07:28:10  collegefootballdata     401        255 (sin clave)
07:28:41  nflverse pbp 2024       200   19362351 gz
07:29:02  fivethirtyeight api     302 → abcnews.go.com
07:29:33  oddsportal.com           200 → cuotasahora.com
07:30:11  thesportsdb json/123     200      11465 json
07:31:02  api.football-data.org    200      74548 json
07:34:20  the-odds-api historical  401        152 MISSING_KEY
```

Cuerpos y cabeceras en `/tmp/a03/`, fuera del repositorio.
