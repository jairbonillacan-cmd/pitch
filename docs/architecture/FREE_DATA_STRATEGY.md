# Estrategia de datos a costo $0 (Fase de datos 0)

> **Propósito:** operar PitchLab sin pagar APIs de datos mientras no haya ingresos, con fuentes **legales**, honestidad sobre sus límites y una ruta de migración sin reescribir nada.
> **Decisión del fundador (2026-11-08):** «Por ahora no quiero pagar APIs de datos». Esto actualiza **FD-02**: datos US$0/mes.
> **Consumidores:** `services/ingest`, `DATA_ARCHITECTURE.md` (F3), autores de prompts y fundador.
> **Fecha:** 2026-11-08 · No es asesoría legal.

## 1. Fuentes elegidas

| Necesidad | Fuente gratuita | Licencia / términos | Uso permitido en PitchLab | Etiqueta |
|---|---|---|---|---|
| **NFL**: calendarios, resultados, rosters, stats semanales de jugador, play-by-play e histórico desde 1999 | **nflverse** (releases públicos en GitHub, en Parquet y CSV) | Mayoría **CC-BY 4.0**. Los datos de **FTN** (2023+) son **CC-BY-SA 4.0**. | ✅ Producto comercial **con atribución** («Datos: nflverse»). ⛔ **No usar los datasets de FTN** (ShareAlike contaminaría los derivados). | ✅ licencia verificada (README de nflreadpy / nfl_data_py) |
| **Premier League**: calendario y resultados | **openfootball/football.json** (`2026-27/en.1.json`, actualizado a diario) | **CC0 / dominio público** | ✅ Sin restricciones | ✅ verificado (LICENSE del repo) |
| **Cuotas** (moneyline, spread y totales de NFL, Premier League y Liga MX) | **The Odds API, plan Starter gratis** (500 créditos al mes) | Términos del 31 ago 2026: permite mostrar los datos en apps **incluso comerciales** si los datos no son el producto principal. Permite **almacenarlos indefinidamente** y **entrenar modelos**. **Prohíbe** revenderlos o redistribuirlos como feed crudo. Atribución opcional. | ✅ Comparador y snapshots propios. ⛔ Ninguna exportación ni API pública de cuotas crudas. | ✅ verificado (página de términos) |
| **Liga MX**: calendario, resultados, tabla y stats | **API-Football, plan Free** (100 requests al día) | Los términos trasladan al usuario la obtención de licencias para publicar y **no otorgan derechos comerciales sobre las competiciones** | ◐ **Solo beta privada sin cobro** mientras no haya confirmación por escrito. Histórico 2022-2024 integrado como research-only (el plan Free bloquea 2021, 2025 y 2026) | ✅ probado (fixtures por temporada) |
| Premier League: stats de jugadores | API-Football Free (mismo cupo) | Ídem | ◐ Ídem | 🔎 |
| Investigación interna (backtests de fútbol con cuotas de cierre históricas) | football-data.co.uk | Términos no localizados | ◐ **Solo investigación offline**: no se muestra en la app ni se redistribuye | ✅ integrado (2026-11-09) como dataset research-only: resultados 1993-94–2026-27, cuotas 1X2 y O/U 2.5, tiros y córners de las cinco grandes ligas |
| xG por partido (investigación y ratings) | Understat, vía snapshots de Wayback Machine (el sitio en vivo estaba en mantenimiento el 2026-11-09) | Sin licencia de reutilización declarada | ◐ **Solo investigación**: no se muestra en la app ni se redistribuye | ✅ integrado (2026-11-09): 18,693 partidos, 2014-15 a 2026-27 |
| Estadísticas de partido de Liga MX (investigación) | ESPN (`site.api.espn.com`), calendarios + summaries | Sin licencia de reutilización declarada | ◐ **Solo investigación** | ✅ integrado (2026-11-09): 278 partidos de 2024-25 (tiros, córners, posesión, tarjetas) |

**Descartadas en esta fase:**

- APIs públicas de MLB y NHL (no comerciales, según fuentes secundarias).
- APIs «ocultas» de ESPN y NFL.com (los términos de NFL.com solo permiten uso personal y no comercial).
- FBref y Sports-Reference (prohíben el scraping).
- **Cualquier scraping de casas de apuestas.**

## 2. Qué cambia en el producto (honestidad ante todo)

| Funcionalidad del MVP | Con datos $0 | Cómo se comunica en la UI |
|---|---|---|
| Calendario y resultados NFL | ✅ nflverse se actualiza a diario en temporada. **No es en vivo**: los resultados llegan horas después. | `DataFreshnessIndicator` con «Actualizado hace X h · nflverse» |
| Game logs y Prop Lab NFL | ✅ Stats semanales por jugador (distribuciones, hit rate, splits e IC) | Atribución a nflverse |
| **Cuotas de props** | ⛔ No caben en 500 créditos (cada prop es una llamada por evento) | Prop Lab trabaja con **línea manual** (scrubber o la línea que escriba el usuario) y **cuota opcional escrita por el usuario**, marcada «cuota ingresada por ti». Sin inventar precios. |
| Comparador de cuotas de partido | ◐ Pocas casas por región y snapshots espaciados (ver §3) | Hora de cada snapshot visible y badge *stale* |
| Apertura, cierre y CLV | ◐ «Apertura» = primer snapshot propio. «Cierre» = **último snapshot antes del inicio** (aproximado). | Etiqueta «cierre aproximado: snapshot a N min del inicio» |
| Liga MX | ◐ API-Football Free | Hasta confirmar la licencia: solo en la beta privada, o detrás del flag `league.liga-mx` |
| Premier League | ✅ Calendario y resultados (openfootball) más cuotas. ◐ Stats de jugador (API-Football). | — |
| Pick Journal y calificación automática | ✅ Calificación con los resultados de nflverse u openfootball. El CLV usa el cierre aproximado. | El CLV lleva la misma etiqueta de aproximación |
| Backtest y Model Lab | ✅ NFL con el histórico de nflverse desde 1999 (Baseline 0 frente a los modelos propios) | — |
| Predicciones públicas | Sin cambios: solo cuando un modelo pase el gate | — |

## 3. Presupuesto de créditos de The Odds API (500 al mes)

Costo de `/odds` = **mercados × regiones** por llamada (cubre todos los partidos próximos de un deporte). Con 3 mercados (h2h, spreads y totals) y 1 región = **3 créditos por snapshot**.

| Liga | Región | Snapshots por semana | Créditos al mes |
|---|---|---|---:|
| NFL | `us` | 5 (apertura del martes, jueves antes del TNF, domingo AM, domingo antes de las 15:00 ET, lunes antes del MNF) | ~65 |
| Premier League | `uk` o `eu` (a validar qué casas trae) | ~6 (apertura y antes de cada bloque de horarios) | ~80 |
| Liga MX | a validar (confirmar con `/sports` que la liga y las casas estén cubiertas) | ~6 | ~80 |
| Reserva (pruebas, catálogo de deportes y eventos, 1–2 consultas históricas puntuales a 10×) | | | ~275 |
| **Total** | | | **≤ 500** |

**Reglas:**

- El scheduler **lee los encabezados de créditos restantes** y se detiene antes de agotarlos.
- Se priorizan los snapshots cercanos al inicio (los que forman el cierre).
- Un cambio de presupuesto es una sola variable de configuración.

## 4. Infraestructura en $0 (o casi)

| Pieza | Opción gratuita | Límite que importa |
|---|---|---|
| Web | **Vercel Hobby** | ⚠ El plan Hobby es para **uso no comercial**. Al empezar a cobrar hay que pasar a Pro (≈ US$20/mes, estimado). |
| DB | Neon Free | Almacenamiento limitado. El histórico pesado de nflverse se guarda en Parquet en R2 y en Postgres solo lo que la app consulta. |
| Objetos | Cloudflare R2 (tier gratis) | Suficiente para Parquet y emblemas |
| Jobs de ingesta y Python | **GitHub Actions programado** (en lugar de Trigger.dev y Fly en esta fase) | Minutos gratis según el plan del repo. Los jobs son cortos (descarga de releases y snapshots). |
| Caché y rate limit | Upstash Free | — |
| Analítica y errores | PostHog Free y Sentry Developer | — |
| Email | Resend Free | Cupo diario bajo, suficiente para la beta |

La arquitectura (adaptadores, `provider_ref`, `DataState.source` y snapshots) **no cambia**: solo cambian los adaptadores registrados y el scheduler.

## 5. Implicaciones legales y de cobro

- **Para cobrar suscripciones** con este set: NFL (nflverse con atribución), Premier League con calendario y resultados (CC0) y cuotas (The Odds API) son compatibles con un producto comercial según sus términos. **Liga MX y las stats de jugador de fútbol (API-Football Free) no lo están confirmadas.** Hasta confirmarlas por escrito, quedan en la beta privada o detrás de un flag.
- La atribución de nflverse va visible en Metodología y en las vistas que la usan.
- Nada de esto cambia `COMPLIANCE_REGISTER.md` (sin premios, sin afiliados y 18+).

## 6. Disparadores para pagar datos (cuando haya ingresos)

| Disparador | Paso | Costo de referencia |
|---|---|---|
| Usuarios que piden cuotas más frescas o más casas | The Odds API, nivel de 20K créditos | US$30/mes (`PÚBLICO`) |
| Prop Lab con cuotas reales de props | The Odds API, nivel de 100K créditos | US$59/mes (`PÚBLICO`) |
| Liga MX comercial | API-Football de pago con licencia confirmada, o SportsDataIO | `COTIZACIÓN` |
| Datos en vivo, lesiones oficiales, NCAAF, NHL o MLB | SportsDataIO u otro (FD-02 Pro) | `COTIZACIÓN` |

## Fuentes

- nflverse: https://github.com/nflverse/nfl_data_py · https://gh.r-mj.com/nflverse/nflreadpy · https://github.com/nflverse/nflreadr/releases
- openfootball: https://github.com/openfootball/football.json · https://github.com/openfootball/football.json/tree/master/2026-27
- The Odds API: https://the-odds-api.com/terms-and-conditions.html · https://the-odds-api.com/#get-access
- API-Football: https://www.api-football.com/terms · https://www.api-football.com/pricing
- football-data.co.uk (términos no localizados): https://sportsapis.dev/free-sports-datasets
