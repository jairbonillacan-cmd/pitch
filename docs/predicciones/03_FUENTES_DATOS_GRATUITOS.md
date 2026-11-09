# 03 — Fuentes de datos gratuitas: inventario, licencias y límites

**Documento:** consolidación de A03 (inventario verificado de fuentes).
**Ventana de verificación HTTP:** 2026-11-09, 07:25–07:36 UTC · **Autor:** SUBAGENTE 11 — DOCUMENTATION & REPRODUCIBILITY.
**Fuente:** [`A03_data_sources.md`](../../research/prediction-lab/reports/A03_data_sources.md).
**Método:** toda afirmación de disponibilidad viene de una petición real — `curl -sS -L --max-time 45 -A "Mozilla/5.0 (compatible; PitchLabResearch/1.0)" -w "%{http_code}|%{size_download}"` — con cuerpo, cabeceras y error guardados fuera del repo. **22 fuentes (24 endpoints) → 13 V (200 con carga útil), 9 F (4xx/5xx, caída o bloqueo por ToS).**
**Etiquetas:** `HECHO` = código, tamaño o texto leído; `INFERENCIA` = deducción propia. **Ninguna cifra se tomó de memoria.**

---

## 1. Cinco hallazgos que condicionan el proyecto

1. **football-data.co.uk no tiene licencia (`HECHO`).** `terms.php`, `licence.php`, `about.php` y `legal.php` dan **404**; la portada, `data.php` y `contact.php` no contienen «copyright» ni «terms». La única declaración de uso es *«My data is free»*. **Uso comercial: NO CONFIRMADO.**
2. **La mejor fuente gratuita de xG de evento es StatsBomb Open Data (`HECHO`).** 80 pares competición-temporada y `statsbomb_xg` por disparo, con licencia **redactada para investigación**. Understat está caída y FBref responde 403: ninguna de las dos sirve hoy.
3. **No existe cuota histórica gratuita con timestamp (`HECHO`).** football-data separa apertura y cierre **sin hora de captura**; The Odds API reserva `/v4/historical` al plan de pago; Betfair da 403; OddsPortal no expone ToS. La única vía legítima es **capturar snapshots propios desde ahora**.
4. **NFL es el deporte mejor servido (`HECHO`).** nflverse publica play-by-play 1999→2024 con **372 columnas** (EPA, WPA, `spread_line`) bajo **CC BY 4.0**, que permite uso comercial con atribución.
5. **Liga MX está cubierta a medias (`HECHO`).** `new/MEX.csv`: **4.790 filas (4.789 partidos + cabecera)** desde 2012/13, solo resultado y cuotas de cierre; sin tiros, córners, tarjetas, árbitro ni xG.

---

## 2. football-data.co.uk (backbone del laboratorio)

### 2.1 Disponibilidad verificada

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

`www.` responde 302 a `football-data.co.uk`; el 200 llega tras la redirección. Cada respuesta trae `x-ws-ratelimit-limit: 1000` y `remaining: 999`: cuota declarada de **1.000 peticiones** (ventana no anunciada). El histórico arranca en **1993/94**; la 2026/27 está en curso (90 partidos de Premier al 3-nov-2026).

### 2.2 Campos y el cambio de 2026/27

**HECHO — hallazgo principal:** en 2026/27 football-data **añadió `HxG` y `AxG`** y **eliminó Pinnacle**. Comprobado en dos divisiones: `E0` **90/90** partidos con xG y `SP1` **109/109**. En 2024/25 no hay xG, pero la estadística está completa (`HS`, `AS`, `HST`, `AST`, `HC`, `AC`, `HY`, `AY`, `HR`, `AR`, `Referee`, `Time` = 380/380). Columnas por temporada: 45 (2000/01) → 106 (2020/21) → 120 (2024/25) → 114 (2026/27).

**HECHO — las cuotas:**

> «Since 2019/20 I have collected two sets of odds. The first set is collected after market opening at times specified on my fixtures page. The second set are the closing odds ('C' included the data column headings). Closing home-draw-away odds are also available for Pinnacle bookmaker only back to 2012/13). In earlier seasons, there are only the pre-closing odds.» — `downloadm.php`

Sin timestamp de cuota: `Date` y `Time` son **del partido**. Lo único temporal:

> «Betting odds for weekend games are collected Friday afternoons, and on Tuesday afternoons for midweek games.» — `notes.txt`

**INFERENCIA:** alcanza para usar la cuota de cierre como **target/benchmark**, pero **no permite CLV** ni estudiar el movimiento intra-semana. Esta carencia se propaga a [`11_LIMITACIONES_Y_RIESGOS.md`](11_LIMITACIONES_Y_RIESGOS.md) y a [`12_REPRODUCIBILIDAD.md`](12_REPRODUCIBILIDAD.md).

### 2.3 Licencia: el texto y lo que falta

**HECHO — no existe licencia.** `terms.php`, `licence.php`, `about.php`, `legal.php` y `privacy.php` dan **404**. Única declaración de uso:

> «My data is free, but for those who want a subscription API service, I am now partnering with TheStatsAPI.» — `downloadm.php`

**HECHO — la admisión que crea el problema jurídico (`notes.txt`):**

> «Football-Data would like to acknowledge the following sources which have been utilised in the compilation of Football-Data's results and odds files.»
> «Current results — XScores»
> «Match statistics — BBC, Flashscore, ESPN Soccer, Bundesliga.de, Gazzetta.it and Football.fr»
> «Bookmakers betting odds — Betbrain.com, Oddsportal.com, Individual bookmakers»

**HECHO — `robots.txt` bloquea agentes de IA:** `Disallow: /` para `GPTBot`, `Anthropic-AI` y `ClaudeBot`, bajo el comentario «Block major AI training models».

**INFERENCIA (no es asesoría legal):** «gratis» no es una licencia: sin texto que autorice redistribución ni uso comercial, el titular conserva todos los derechos. Las cuotas se compilan además de Oddsportal y de casas de apuestas, y en la UE el derecho *sui generis* protege la inversión en recolección aunque no haya copyright.

| Escenario | Riesgo | Decisión documentada |
|---|---|---|
| Uso interno de investigación (lo que hace el lab) | bajo pero **indocumentado** | aceptable con atribución y sin redistribuir el crudo |
| Redistribución de CSV | alto | **no** |
| Producto comercial / API pública | **NO CONFIRMADO** | bloqueado hasta resolver licencia |

---

## 3. Otras fuentes de fútbol (verificadas una a una)

| Fuente | HTTP | Evidencia | Licencia | Comercial | Veredicto |
|---|---:|---|---|---|---|
| **Understat** | 200 (error) | 26.719 B con *«We will come back soon»*; igual en `/league/EPL` y `/robots.txt` | no verificable | NO CONFIRMADO | **caída**, no integrable hoy |
| **FBref** | **403** | `<title>Just a moment...</title>` de Cloudflare; `robots.txt` y terms también 403 | no verificable | NO CONFIRMADO | inaccesible sin navegador |
| **StatsBomb Open Data** | 200 | `matches/11/90.json` 64.041 B (35 partidos); `events/3788741.json` 3.208.593 B, 27 disparos con `statsbomb_xg`; `competitions.json` 34.887 B, **80 pares** | *Public Data User Agreement* + README «research projects» | **NO CONFIRMADO** (redactada para investigación) | P1: xG offline |
| **openfootball / football.json** | 200 | `2024-25/en.1.json` 110.141 B, **380 partidos** (`round`, `date`, `time`, `team1/2`, `score.ht/ft`) | **CC0 1.0** («including without limitation commercial purposes») | **SÍ** | P2 |
| **football.db** | 200 | `README.md` 1.627 B; clubes y estadios | dominio público (ecosistema CC0) | **SÍ** | P2 |
| **OpenLigaDB** | 200 | `getmatchdata/bl1/2024` 592.318 B, **306 partidos** con `matchDateTimeUTC` | **ODbL** | **SÍ** con atribución y *share-alike* | P2 |
| **TheSportsDB** | 403 / 200 | clave `3` muerta («permanently disabled»); con `123` 11.465 B, solo metadatos | no publicada | NO CONFIRMADO | P2 |
| **API-Football** | **403** | `Missing application key`; free 100 req/día; histórico en planes pagos | comercial | pago | descartada |
| **football-data.org** | 200 | `v4/competitions` 74.548 B, **192 competiciones**; «top competitions free forever», 10 req/min | propia | NO CONFIRMADO | P1 (calendario) |
| **Kaggle** | 200 | 20 resultados; descarga sin autenticación de `irkaal/english-premier-league-results` (608.778 B, ZIP) | **por dataset** (CC0, CC BY-NC-SA 4.0, MIT, Unknown) | heterogéneo | agregador, no fuente |
| **FiveThirtyEight SPI** | **404 / 302** | el CSV ya no existe; la API viva redirige a `abcnews.go.com/politics` | — | — | muerta |
| **ESPN** | 404 ToS → Disney 200 | prohíbe «access, monitor, copy or extract … using a robot, spider, script … for data mining or web scraping» y el uso comercial | Disney ToS | **NO** | **descartada por ToS** |

---

## 4. Cuotas históricas: qué es gratis y qué no

| Fuente | Timestamp | ¿Gratis? | Evidencia | Veredicto |
|---|---|---|---|---|
| football-data.co.uk | **No** | Sí | 200; 114–132 columnas; sin hora de captura | único histórico masivo gratuito |
| The Odds API | Snapshots | **No** | `/v4/historical/` → **401** `MISSING_KEY`; free 500 créditos/mes; histórico desde **30 USD/mes** | pago |
| Betfair Historical | no verificable | **No** | `historicdata.betfair.com` → **403**; `developer.betfair.com` → 403 | pago (no verificable) |
| OddsPortal | parcial en UI | dudoso | 200 pero redirige a `cuotasahora.com`; ToS devuelve la portada | **NO CONFIRMADO — no usar** |
| API-Football | no verificable | **No** | 403 sin clave; histórico en planes pagos | pago |
| Kaggle | rara vez | Sí | licencia por dataset | heterogéneo |

**HECHO:** ninguna fuente gratuita verificada da cuota con timestamp.
**INFERENCIA:** para el laboratorio no es bloqueante —el target natural es el cierre—, pero **invalida cualquier estudio de CLV con datos gratuitos**; la salida es el *polling* propio (§7, P0-2).

---

## 5. NFL, NHL y NCAA Football

| Fuente | HTTP | Datos | Licencia | Comercial | Veredicto |
|---|---:|---|---|---|---|
| **nflverse** | 200 | `pbp/play_by_play_2024.csv.gz` 19.362.351 B, **49.492 jugadas, 372 columnas** (`epa`, `wpa`, `xpass`, `pass_oe`, `spread_line`, `total_line`, `roof`, `temp`); `schedules/games.parquet` 523.464 B; 1999→2024 | **CC BY 4.0** | **SÍ** con atribución | **P0** |
| **nfl-data-py** | 200 | PyPI JSON 51.506 B, v0.3.3 | **MIT** | **SÍ** | P1 (cliente) |
| **NHL API** | 200 / 404 | `v1/schedule/2025-01-15` 97.052 B; `gamecenter/…/boxscore` 13.635 B; `club-schedule/MTL/now` 404 | **no documentada**; `nhl.com/info/terms-of-use` → 404 | NO CONFIRMADO | P1 (caché) |
| **sportsdataverse-data** | 200 | releases `nhl_groups` (229 assets), `cfb_groups` (329), `nfl_groups`, `cfb_pbp` | por release | NO CONFIRMADO | P1 (derivados) |
| **CollegeFootballData** | **401** | `/games` y `/info` sin clave; «© 2026 CollegeFootballData.com. All rights reserved.»; free «for testing» | propietaria | **NO CONFIRMADO** | P2 |
| **cfbfastR-data** | 200 | `README.md` 6.000 B; el PBP vivo migró a sportsdataverse | — | — | P2 |

**Consecuencia:** NFL es la única familia con **licencia comercial clara y granularidad de jugada**; sirve de *benchmark* metodológico, no de mercado para PitchLab.

---

## 6. Tabla maestra (resumen operativo)

| Fuente | Tipo | Cobertura | Temporadas | Licencia | Comercial | Límite | Prioridad |
|---|---|---|---|---|---|---|---|
| football-data.co.uk/mmz4281 | resultados + cuotas + stats | 22 divisiones / 11 países (la fuente) | 1993/94→2026/27 | **ninguna** | **NO CONFIRMADO** | sin timestamp; xG solo 26/27; 1.000 req | **P0** |
| football-data.co.uk/new | resultados + cuotas cierre | 14 ligas (MEX, ARG, BRA, USA…) | 2012/13→2026/27 | **ninguna** | **NO CONFIRMADO** | sin stats ni apertura | **P0** |
| statsbomb/open-data | eventos + xG + 360 | 80 comp-temporada | 1958→2024 | Public Data User Agreement | **NO CONFIRMADO** | no cubre temporada actual | **P1** |
| football-data.org | fixtures, tablas | 192 competiciones | actual | propia | NO CONFIRMADO | 10 req/min | P1 |
| openfootball | fixtures + resultados | ~20 ligas | histórico | **CC0 1.0** | **SÍ** | sin cuotas ni stats | P2 |
| openligadb.de | resultados Bundesliga | BL1/BL2 | 1963→ | **ODbL** | **SÍ** (share-alike) | solo Alemania | P2 |
| nflverse-data | play-by-play | NFL | 1999→2024 | **CC BY 4.0** | **SÍ** | sin lesiones in-game | **P0** |
| api-web.nhle.com | calendario, boxscore | NHL | actual | no documentada | NO CONFIRMADO | API interna sin SLA | P1 |
| ESPN / api-football | todo / odds | global | histórico | Disney ToS / comercial | **NO** / pago | prohibido / 100 req/día | excluidas |

**Diferencia de alcance que hay que tener presente:** A03 inventaría **22 divisiones disponibles** en `mmz4281`; el laboratorio ingirió **17 divisiones principales + 6 ligas extra = 23 etiquetas de división** ([`12_REPRODUCIBILIDAD.md`](12_REPRODUCIBILIDAD.md) §3). Las 5 divisiones no ingeridas no están en `MAIN` de `etl/download_football_data.py:34-52`: es una decisión de alcance, no una carencia de la fuente.

---

## 7. Propuesta de integración priorizada (y qué se implementó)

| ID | Propuesta | Estado en el laboratorio |
|---|---|---|
| **P0-1** | ingesta semanal idempotente de `mmz4281/{season}/{div}.csv` y `new/{country}.csv` a esquema único (`match_id`, `kickoff_utc`, goles, HT, cuotas open/close, bookmaker, xG, tiros, córners, tarjetas, árbitro), con hash del CSV y fecha de descarga | **HECHO:** 465 CSV, `manifest.json` con sha256, `matches.parquet` de 88 columnas y 182.414 filas; **sin** `kickoff_utc` normalizado (zona horaria desconocida) y **sin** xG |
| **P0-2** | serie temporal propia de cuotas: 2 capturas/día por competición (apertura y ~60 min antes del kickoff), guardando `captured_at`, `source`, `market`, `line` | **NO INICIADO** — es la única vía a un histórico de CLV |
| **P0-3** | NFL inmediato con `pbp` + `schedules` (CC BY 4.0) | **NO INICIADO** — el lab es solo fútbol |
| **P1-1** | StatsBomb para xG de evento (entrenar xG con `statsbomb_xg` y aplicarlo a los tiros de football-data) | **NO INICIADO** |
| **P1-2** | football-data.org free tier como calendario | **NO INICIADO** |
| **P1-3** | NHL API + sportsdataverse con caché agresiva | **NO INICIADO** |
| **P2-1** | OpenLigaDB (ODBdL) para validación cruzada | **NO INICIADO** |
| **P2-2** | CFBD/NCAAF solo con clave y revisión de términos | **NO INICIADO** |
| **P2-3** | openfootball (CC0) y TheSportsDB | **NO INICIADO** |

**Regla de diseño (INFERENCIA, pendiente de implementar):** capa `sources/` con registro de licencias (`ok | no_confirmado | prohibido`) que **rompa el build** si un dataset `no_confirmado` entra en un artefacto público. Hoy la licencia está documentada en prosa, no en código.

**Excluir:** Understat (caída), FBref (403), ESPN (ToS), OddsPortal (ToS no verificable), FiveThirtyEight (muerta), Betfair/API-Football histórico (pago).

---

## 8. Riesgos legales (registro)

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | football-data.co.uk no licencia nada; «free» describe el acceso, no los derechos | uso interno, atribución, **no redistribuir el crudo** |
| 2 | titularidad contaminada: `notes.txt` declara compilación desde Oddsportal, Flashscore, ESPN y BBC | no revender cuotas; solo probabilidades derivadas propias |
| 3 | derecho *sui generis* (UE) sobre la inversión en recolección | extracción parcial y transformación sustancial |
| 4 | `robots.txt` hostil a agentes de IA (GPTBot, ClaudeBot, Anthropic-AI, CCBot) | User-Agent identificable, baja frecuencia, caché (la descarga semanal de 17 CSV no es entrenamiento) |
| 5 | StatsBomb es «research» | uso offline para entrenar y validar, nunca eventos crudos en producto |
| 6 | ESPN/Disney prohíbe extracción automatizada y uso comercial | cero tolerancia |
| 7 | CFBD «All rights reserved» con clave «for testing» | no usar en producción sin acuerdo |
| 8 | NHL API sin licencia ni SLA | caché persistente y plan B (sportsdataverse) |
| 9 | OddsPortal sin ToS accesible | la ausencia de permiso se trata como prohibición: **no usar** |
| 10 | datos personales (StatsBomb incluye `dob` de entrenadores) | GDPR/LFPDPPP al enriquecer perfiles |

---

## 9. Límites de la verificación

- Ventana de ~11 minutos: **Understat, FBref y Betfair merecen reintento en 48 h** antes de descartarlas definitivamente.
- Sin clave no se evaluaron CFBD, API-Football ni el histórico de The Odds API más allá del 401.
- Betfair da 403 desde esta IP: «pago» se reporta como **no verificable**.
- El `LICENSE.pdf` de StatsBomb (165.130 B, «StatsBomb Public Data User Agreement») no se pudo extraer (fuentes subset, sin `pdftotext`); se cita el README.

**Conclusión:** el corpus del laboratorio (football-data, 17+6 divisiones, 2000/01–2026/27) es suficiente para investigación interna de 1X2 y goles, **no** para un producto comercial ni para CLV, y **no** incluye xG con licencia clara. Cualquier afirmación de valor económico queda condicionada por estas tres limitaciones.
