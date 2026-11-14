# REPORTE MAESTRO — Ingeniería Inversa Profunda de ASTRA AI (`astraanalisis.com`)

> **Objetivo:** `https://astraanalisis.com/` (*Astra AI* / *Astra Analysis*) · **Operador identificado:** `eliasgutierrezhr@gmail.com` (México)  
> **Fecha de auditoría:** 14 de noviembre de 2026 · **Herramienta principal:** REA (`rea-agents@6.8.0`, skill `v49`, 16 registros `ev_...` verificados)  
> **Equipo de análisis:** Coordinador + 6 Subagentes Especialistas en paralelo (*Gemini 4 Carbon High*)  
> **Verificación matemática:** `8/8` suites exactas (`EXIT 0` en [verify_astra_math.py](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/verify_astra_math.py))

---

## Resumen Ejecutivo

**Astra AI (`astraanalisis.com`)** es una plataforma freemium mexicana de pronósticos deportivos cuantitativos, seguimiento en vivo y análisis narrativos generados con IA que cubre **5 deportes**: **Fútbol (48 ligas)**, **NBA**, **NFL**, **NHL** y **MLB**. A diferencia de competidores puramente estáticos en cliente (como *AztecaVet* o *TouchIQ*, cuyos datos y fórmulas viven incrustados en un solo HTML sin backend) o de filtros descriptivos de rachas históricas (como *LineMate*), Astra AI opera una **arquitectura cliente-servidor moderna de tres capas**:

1. **Cliente Universal Multiplataforma (`Expo SDK 58 + React 19.3 + React Compiler`)**: Una aplicación universal escrita en React Native / Expo Router (`slug: "astra-ai"`, `eas.projectId: "f7056bae-387a-4cb8-856d-8504d0735629"`) desplegada en **Expo EAS Hosting (`astra-ai.expo.app`)** detrás de **Cloudflare HTTP/3**, que sirve un diseño adaptable (*3 columnas tipo terminal financiera en escritorio* vs *dock flotante Liquid Glass en móvil*) e impulsa su instalación como **PWA** para evitar el 15%–30% de comisión de Apple/Google.
2. **Backend Serverless en Supabase (`bbfjdshvlcynngjdkvsk.supabase.co`)**: **14 tablas públicas** en PostgreSQL con **Row-Level Security (RLS) real** (patrón *Soft-Null*: calendarios, marcadores en vivo, clasificaciones y momios son públicos; pronósticos, análisis IA y *Astra Picks* de partidos futuros devuelven `null` sin suscripción activa), **4 funciones RPC** (`my_access`, `search_teams`, `record_ai_view`, `admin_dashboard`) y **7 Edge Functions** (`league-standings`, `match-odds`, `nba-players`, `team-profile`, `payments`, `iap-confirm`, `delete-account`).
3. **Workers Batch + Crons Externos de Bajo Costo (`$57–$101 USD/mes` todo incluido)**: Un pipeline offline en Python/Node ingesta **API-Football v3 (`api-sports.io`)** para las 48 ligas de fútbol (`$19–$29 USD/mes`) y explota **APIs públicas gratuitas** (**ESPN Hidden API**, **NHL Web API oficial**, **MLB StatsAPI GUMBO**, más `nflverse` y `pybaseball`/FanGraphs) para los 4 deportes estadounidenses (`$0 USD`), calcula **modelos estadísticos reales** pre-partido (Dixon–Coles con xG en fútbol, Ratings+Elo en NBA, Puntos+EPA+Elo+QB en NFL, xG por tiro propio + Monte Carlo en NHL, y wOBA+FIP+Binomial Negativa en MLB), genera **1 análisis narrativo por partido en lote usando Claude (Anthropic)** (costo marginal `$0` por lector) y actualiza marcadores/momentum cada **2 minutos (`*/2 * * * *`)**. Monetiza mediante un **pase prepagado acumulable de `$199 MXN por 30 días`** (sin cobro recurrente automático, tras **7 días de prueba gratis sin tarjeta**) vía **Stripe** y **Mercado Pago**, alcanzando punto de equilibrio con apenas **6 a 11 clientes activos**.

### Los 5 Descubrimientos Forenses Más Importantes

1. **Exposición completa de hiperparámetros internos en partidos finalizados (`[OBSERVADO]`):** Aunque Supabase RLS protege los pronósticos de partidos futuros, **abre lectura pública completa (`SELECT *`) en cuanto un partido termina** para alimentar el resumen de equipo (`fetchTeamModel` -> `modelTeamSummary`). Como la columna JSONB `context` guarda toda la telemetría interna del worker, fue posible **reconstruir con precisión de 4 decimales las ecuaciones exactas y pesos de los 5 motores deportivos** (validado en `verify_astra_math.py`).
2. **Desconexión total entre probabilidades y momios — Cero cálculo de Valor Esperado (`EV`) ni *de-vig* (`[OBSERVADO]`):** La Edge Function `match-odds` extrae cuotas de **Marathonbet** (`id=2` en API-Sports, *overround* `+8.64%`) para fútbol y de **DraftKings** (`id="100"` en ESPN Pickcenter, *overround* `+4.16%`) para NBA/NFL/NHL, pero el cliente **oculta la casa de apuestas, descarta la hora de captura, no elimina el margen (*vig*) y jamás cruza la probabilidad del modelo contra la cuota** (`EV`, `fairOdds = 1/p` y `CLV` son inexistentes).
3. **Cero auditoría de calibración incluso en su propio panel de administración (`[OBSERVADO en código cliente]`):** Pese a anunciar en su Paywall *">75% de aciertos en pronósticos de alta confianza"*, el código del panel privado `/administracion` (`mod_0755`, exclusivo para `eliasgutierrezhr@gmail.com`) revela que `admin_dashboard()` mide únicamente **14 KPIs comerciales, altas, ingresos MXN y lecturas de IA** — no tiene **ni una sola métrica de Brier Score, Log-Loss, ECE, ROI o hit-rate real**.
4. **Alucinación grave de Claude detectada en producción por falta de validación post-LLM (`[OBSERVADO]`):** En el juego `NFL 401873052` (*NY Giants vs Washington*), mientras el modelo matemático daba `52.82%` y `+0.9` puntos al local NY Giants, **Claude invirtió completamente local y visitante en los 5 bloques del análisis** y afirmó que el QB *Jayden Daniels* jugaba para los Giants.
5. **Dependencia sin caché servidor sobre endpoints públicos no comerciales y `@supabase/realtime-js` muerto (`[OBSERVADO]`):** Las Edge Functions deportivas consultan ESPN/NHL/MLB en vivo sin caché en base de datos, y todo el tiempo real del frontend funciona por *HTTP polling* cada `25–60 s` (`@supabase/realtime-js` viaja entero en el bundle sin usarse jamás).

---

## 1. Arquitectura Integral de Extremo a Extremo

```mermaid
flowchart TB
    subgraph Fuentes["1. Fuentes de Datos y Servicios Externos"]
        APIS["API-Sports v3 (Fútbol: 48 ligas + Marathonbet odds)"]
        ESPN["ESPN Public Site API (NBA/NFL + DraftKings odds + NBA Boxscores)"]
        NHLA["NHL Web API api-web.nhle.com (NHL PBP 116k tiros + Live)"]
        MLBA["MLB StatsAPI GUMBO statsapi.mlb.com (MLB + Umpires/Clima)"]
        ADV["nflverse (EPA/Dropbacks) + pybaseball/FanGraphs (wOBA/FIP)"]
        CLAUDE["Anthropic Claude API (Generación batch de análisis IA)"]
        PAY["Stripe + Mercado Pago (Web $199 MXN) / RevenueCat (IAP apagado)"]
        RESEND["Resend SMTP (Confirmación y Reset)"]
    end

    subgraph Workers["2. Workers Offline / Crons Privados"]
        CRON_PRE["Pipeline Pre-Partido (24h-72h antes): Modelos v3 + Digest + Claude"]
        CRON_LIVE["Cron En Vivo (*/2 * * * * a :01s UTC): Marcadores + match_live + Momentum"]
    end

    subgraph Supabase["3. Backend Supabase (bbfjdshvlcynngjdkvsk.supabase.co)"]
        PG_PUB[("Tablas Públicas (anon/auth):\nleagues, teams, fixtures, match_marks,\nstandings, sport_teams, games, match_live")]
        PG_RLS[("Tablas Protegidas por RLS (has_access o Finalizado):\npredictions, analyses, game_predictions,\ngame_analyses, astra_picks")]
        PG_USR[("Usuarios y Storage:\nauth.users (>=18 trigger), profiles,\nbucket privado profile-avatars, orders")]
        RPCS["4 RPCs PostgreSQL:\nmy_access, search_teams,\nrecord_ai_view, admin_dashboard"]
        EF["7 Edge Functions (us-east-2):\nleague-standings, match-odds, nba-players,\nteam-profile, payments, iap-confirm, delete-account"]
    end

    subgraph Edge["4. Distribución y Cliente Universal"]
        CF["Cloudflare HTTP/3 + RUM beacon.min.js\n(astraanalisis.com <- redirect astra-ai.expo.app)"]
        APP["Expo SDK 58 + React 19.3 (React Compiler)\n22 Rutas Expo Router | 98 Módulos Propios\nDesktop 3 Columnas / Móvil Liquid Glass PWA"]
    end

    APIS & ESPN & NHLA & MLBA & ADV --> CRON_PRE
    CRON_PRE --> CLAUDE
    CRON_PRE --> PG_PUB & PG_RLS
    APIS & ESPN & NHLA & MLBA --> CRON_LIVE --> PG_PUB
    APIS & ESPN & NHLA & MLBA --> EF
    PAY <--> EF
    RESEND <--> PG_USR
    PG_PUB & PG_RLS & PG_USR <--> RPCS & EF
    CF --> APP
    APP <-->|"PostgREST + Auth + Polling 25-60s"| PG_PUB & PG_RLS & RPCS & EF
```

---

## 2. Frontend, Rutas y Experiencia de Usuario (`01` y `02`)

> Detalle completo en [01-arquitectura-frontend-y-rutas.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/01-arquitectura-frontend-y-rutas.md), [02-ux-diseno-y-funcionalidades-cliente.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/02-ux-diseno-y-funcionalidades-cliente.md) y [module-map.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/module-map.json).

- **Stack exacto (`[OBSERVADO]`):** **Expo SDK `58.0.0`** + **React `19.3.0`** con **React Compiler habilitado en producción** (`experiments.reactCompiler: true` en `mod_0393`; memoización automática granular con `useMemoCache` y `Symbol.for("react.memo_cache_sentinel")`).
- **Radiografía del bundle (`1.92 MB`, `25` chunks JS, `1,030` módulos Metro):**
  - `entry-*.js` (`1.11 MB`): runtime React/React Native Web, Expo Router y tabla maestra de rutas (`mod_0009`).
  - `__common-*.js` (`662 KB`): **98 módulos propios de negocio/UI de Astra AI**, cliente `@supabase/supabase-js@2.118.0` (incluyendo `@supabase/realtime-js` sin usar), `expo-image`, `expo-blur` y `react-native-svg`.
  - **22 chunks asíncronos de rutas (`148.8 KB` en total, analizados al 100% con REA `ev_06e64c17...`):** mapeados 1:1 a sus archivos `.tsx` originales:
    - **Carteleras (`/(tabs)/*`)**: `index.tsx` (Fútbol), `nba.tsx`, `nfl.tsx`, `nhl.tsx`, `mlb.tsx`.
    - **Detalle Deportivo**: `partido/[id].tsx` (Fútbol), `juego/[sport]/[id].tsx` (US Sports), `equipo/[sport]/[id].tsx` (Perfil e historial de equipo; exige el slug `'futbol'` en español), `historial/[sport]/[teamId]/[matchId].tsx` (visor dual de partido histórico en BD o sintetizado al vuelo), `siguiendo.tsx` (monitor local de hasta `20` partidos y `6` métricas en vivo por partido).
    - **Cuenta, Pagos y Operación**: `cuenta.tsx` (carga perezosa de `expo-image-picker` y `expo-image-manipulator` para avatares), `pago/[id].tsx`, `confirmado.tsx`, `restablecer.tsx`, `eliminar-cuenta.tsx`, `administracion.tsx`.
    - **PWA e Institucional**: `instalar.tsx`, `nosotros.tsx` (metodología y FAQ), `privacidad.tsx`, `terminos.tsx`.
- **Arquitectura adaptable "Dos Apps en Una" (`DESKTOP_MIN = 1024px`, `mod_0775`):**
  - **Escritorio (`>= 1024px`)**: Terminal maestro-detalle de **3 columnas** (`CompetitionSidebar` izquierda de `218px` con ligas fijadas + cartelera central al `40%` + panel derecho de detalle embebido con `?partido=<id>` o `?juego=<id>`).
  - **Móvil (`< 1024px`)**: Navegación inferior flotante `GlassSportsBar` (`mod_1014`) estilo *Liquid Glass* (`backdrop-filter: blur(26px) saturate(165%)`) con lente arrastrable (`PanResponder` + `Animated.spring`) e íconos 3D vectoriales metálicos propios (`mod_1007`).
- **Cachés en memoria y ahorro de peticiones (`mod_0779`, `mod_1009`):** Todo el *polling* se detiene automáticamente cuando la pestaña pasa a segundo plano (`document.visibilityState === 'hidden'`), combinando TTLs en memoria de `30 s` (carteleras, máx. 14 días), `60 s / 5 min` (`nba-players` live/final), `2 min` (`team-profile`), `15 min` (`match-odds`) y `30 min` (`record_ai_view`).

---

## 3. Backend Supabase, Esquema de Base de Datos y APIs (`03`, `04` y `05`)

> Detalle completo en [03-backend-supabase-y-esquema-bd.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/03-backend-supabase-y-esquema-bd.md), [04-edge-functions-rpcs-y-operacion.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/04-edge-functions-rpcs-y-operacion.md), [05-evidencia-runtime-y-payloads-reales.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/05-evidencia-runtime-y-payloads-reales.md) y [database-and-api-contracts.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/database-and-api-contracts.json).

### 3.1 Las 14 Tablas Públicas de PostgreSQL y el Patrón RLS *Soft-Null*

Astra AI divide su modelo relacional en dos esquemas paralelos (Fútbol histórico original + Deportes US lanzados el `2026-10-17`):

| Dominio | Tabla | Acceso RLS | Rol y Campos Clave Observados |
|---|---|---|---|
| **Fútbol** | `leagues` (`48` filas) | Público | Catálogo de ligas (`id`, `name`, `country`, `logo`, `flag`, `sort_order`). |
| **Fútbol** | `teams` (`1,692` filas) | Público | Equipos con IDs nativos de API-Football (`id`, `name`, `logo`). |
| **Fútbol** | `fixtures` (`30,891` filas) | Público | Calendario (`2024-10` a `2027-06`), marcador total (`home_goals`/`away_goals`), **marcador 90 min (`ft_home`/`ft_away`)** y banderas de señuelo comercial `forecast_ready` / `analysis_ready`. |
| **Fútbol** | `match_marks` | Público | Etiquetas cian en cartelera (`"Ambos marcan"`, `"Más de 2.25 goles"`). |
| **Fútbol** | `predictions` | **RLS `has_access` o Finalizado** | Salidas Poisson/Dixon–Coles (`lambda_home`, `lambda_away`, `p_home`, `p_draw`, `p_away`, `over_05/15/25`, `btts`, `correct_score_top3`) + JSONB `context` completo. |
| **Fútbol** | `analyses` | **RLS `has_access` o Finalizado** | Narrativa de Claude estructurada en 4 secciones (`panorama`, `tactica`, `factores`, `proyeccion`). |
| **Fútbol** | `standings` (`905` filas) | Público | Clasificación persistida en BD para ligas regulares. |
| **Deportes US** | `sport_teams` (`124` filas) | Público | `30` NBA, `32` NFL, `32` NHL, `30` MLB (`PK(sport, id)`). |
| **Deportes US** | `games` (`485` filas) | Público | Juegos NBA/NFL/NHL/MLB desde `2026-10-17` (`PK(sport, id)` con IDs nativos ESPN/NHL/MLB, `scores` por cuarto/periodo/entrada, `forecast_ready`, `analysis_ready`). |
| **Deportes US** | `game_predictions` | **RLS `has_access` o Finalizado** | Probabilidades `win`, tabla `rows` (Moneyline, Spread/Puck/Run Line, Totales) y `context` (`model_components` + `digest` del LLM). |
| **Deportes US** | `game_analyses` | **RLS `has_access` o Finalizado** | Arreglo de 5 secciones narrativas `[{titulo, texto}]` generadas por Claude. |
| **Transversal** | `astra_picks` | **RLS `has_access` o Finalizado** | Picks editoriales manuales en texto libre (`pick`, `confidence_pct`, `tier`, `outcome`). |
| **Transversal** | `match_live` (`2,193` filas) | Público | Estadísticas en vivo, eventos y curva `momentum` actualizada cada 2 min. |
| **Usuarios** | `profiles` + `profile-avatars` | **RLS `auth.uid() = id`** | `display_name`, `created_at`, `avatar_path` (`<uid>/avatar.jpg` privado con URLs firmadas de 1h). |

### 3.2 Los 4 RPCs y las 7 Edge Functions

| Tipo | Nombre | Autenticación | Función Exacta |
|---|---|---|---|
| **RPC** | `my_access()` | Anónimo / JWT | Devuelve estado de acceso (`logged_in`, `has_access`, `trial_ends_at`, `paid_until`, `is_admin`) y configuración comercial (`price_mxn: 199`, `trial_days: 7`, `period_days: 30`, `leagues: 48`, `iap_ios_key: null`). |
| **RPC** | `search_teams(p_query, p_limit)` | Anónimo / JWT | Búsqueda insensible a acentos (`unaccent`) de equipos de fútbol (para deportes US usa `.ilike` directo sobre `sport_teams`). |
| **RPC** | `record_ai_view(p_sport, p_match_id)` | JWT requerido | Registra lectura de análisis IA con deduplicación cada 30 min para telemetría de consumo y detección de *scraping*. |
| **RPC** | `admin_dashboard()` | Solo `eliasgutierrezhr@gmail.com` | Panel comercial privado (`mod_0755`): 14 KPIs de cuentas, retención, ingresos MXN (`revenue_cents`, `revenue_30d_cents`), últimas 80 vistas IA y últimas 80 órdenes. |
| **Edge Fn** | `league-standings` | Pública | Clasificaciones en vivo; en Fútbol es *fallback* cuando `standings` está vacío (ej. Nations League), y en NBA/NFL/NHL/MLB es la vía primaria. |
| **Edge Fn** | `match-odds` | Pública | Devuelve cuotas pre-partido 1X2 / Moneyline decimal desde Marathonbet (Fútbol) o DraftKings vía ESPN (NBA/NFL/NHL). Se apaga al iniciar el partido. |
| **Edge Fn** | `nba-players` | Pública | Proxy en vivo del boxscore individual de ESPN NBA (`14` métricas por jugador, titulares vs banca). |
| **Edge Fn** | `team-profile` | Pública | Perfil de equipo, historial paginado y reconstrucción al vuelo de partidos históricos no almacenados en BD (`stored: false`). |
| **Edge Fn** | `payments` | JWT requerido | `action: "checkout"` (crea orden de `$199 MXN` en Stripe o Mercado Pago) y `action: "order_status"` (sondeado cada `3 s` x `20` en `/pago/[id]`). |
| **Edge Fn** | `iap-confirm` | JWT requerido | Verificación servidor-a-servidor con RevenueCat para compras nativas (`astra_30_dias`). |
| **Edge Fn** | `delete-account` | JWT requerido | Borra `auth.users`, `profiles` y avatar, anonimizando órdenes pagadas previas bajo `'Cuenta eliminada'`. |

---

## 4. De Dónde Recibe los Datos (*Data Provenance*) y Costos Operativos (`07`)

> Detalle completo en [07-fuentes-de-datos-proveedores-y-momios.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/07-fuentes-de-datos-proveedores-y-momios.md) y [data-provenance-matrix.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/data-provenance-matrix.json).

Astra AI aplica una estrategia de **arbitraje extremo de costos de datos**, pagando únicamente por fútbol y obteniendo los 4 deportes estadounidenses y todos sus momios a costo `$0`:

| Deporte / Capa | Proveedor Confirmado | Evidencia Forense Directa | Costo Estimado |
|---|---|---|---|
| **Fútbol (48 ligas: 29 Tier 1 + 19 Tier 2)** | **API-Football v3 (`api-sports.io`)** | `source: "API-Sports"`, `media.api-sports.io`, estados `matchState`, `"Free Kicks"`, Liga MX `#0` (`id=262`). | **`$19 – $29 USD/mes`** |
| **NBA (calendario, en vivo, lesiones, boxscores)** | **ESPN Hidden Public API** (`site.api.espn.com`) | `eventId` `4019xxxxx`, `a.espncdn.com/combiner/...`, abreviaturas `NO/GS/NY/SA/UTAH`, `"ESPN · Actualizado"`. | **`$0 USD`** *(sin licencia B2B)* |
| **NFL (calendario, en vivo, lesiones + EPA)** | **ESPN Public API** + **`nflverse` (`nflfastR`)** | `eventId` `40187xxxx` + variables exactas `epa_por_dropback` y `techo_estadio: "dome" \| "outdoors"`. | **`$0 USD`** |
| **NHL (calendario, PBP tiros, en vivo, logos)** | **NHL Official Web API (`api-web.nhle.com/v1`)** | `gameId` `202602xxxx`, SVGs `assets.nhle.com`, `116,692` tiros PBP usados para entrenar su modelo xG. | **`$0 USD`** *(sin licencia B2B)* |
| **MLB (calendario, en vivo, clima + sabermetría)** | **MLB StatsAPI (`statsapi.mlb.com`)** + **`pybaseball`/FanGraphs** | `gamePk` 6 dígitos, `mlbstatic.com`, textos GUMBO en inglés + `wOBA`, `FIP` y `park_factor`. | **`$0 USD`** *(sin licencia B2B)* |
| **Momios (`match-odds`)** | **Marathonbet** (`id=2` en API-Sports) + **DraftKings** (`id="100"` en ESPN) | `bookmaker` expuesto en el JSON de red (oculto en UI) + flotantes IEEE-754 exactos (`-620 -> 1.1612903225806452`). | **`$0 USD extra`** |
| **Infraestructura + IA Batch** | **Supabase Pro** + **Anthropic Claude** + **Cloudflare / Worker** | Generación en lote 24h–72h pre-partido (`analyses.created_at` idénticos al microsegundo). | **`$38 – $72 USD/mes`** |
| **TOTAL MENSUAL OPERATIVO** | — | *Break-even* comercial con **6 a 11 suscriptores** de `$199 MXN/mes`. | **`$57 – $101 USD/mes`** |

---

## 5. Qué Modelos Estadísticos y de IA Utiliza (`06`)

> Detalle completo y demostraciones en [06-modelos-estadisticos-picks-e-ia.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/06-modelos-estadisticos-picks-e-ia.md) y [verify_astra_math.py](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence/verify_astra_math.py).

**El 100% del modelado probabilístico ocurre en el backend**; el cliente JS únicamente formatea porcentajes (`pct`), dibuja barras y evalúa marcadores reglamentarios (`ft_home`/`ft_away` en 90 min para `AET`/`PEN`). Gracias a la exposición pública de `predictions.context` y `game_predictions.context` en partidos terminados, reconstruimos los **5 motores exactos**:

### 5.1 Fútbol (`league_v3`, `national_v3`, `cross_league_v3`)
- **Fuerzas de equipo:** Mezcla fija **`70% xG + 30% goles reales`** (`xg_weight = 0.70`) con decaimiento temporal y ancla Elo. En torneos inter-ligas (`cross_league_v3`), ajusta fuerzas con el **coeficiente UEFA de país** elevado a `0.5` (goles) y `0.2` (córners).
- **Tasas de gol esperadas ($\lambda_H, \lambda_A$)** con derrame de dominio territorial $+0.15(\text{net}_H - \text{net}_A)$ *(error máx. vs BD: `0.0010` goles)*:
  $$\lambda_H = \mu_{H,\text{equal}} \exp\!\big(\text{attack}_H - \text{defense}_A + 0.15(\text{net}_H - \text{net}_A)\big), \qquad \lambda_A = \mu_{A,\text{equal}} \exp\!\big(\text{attack}_A - \text{defense}_H - 0.15(\text{net}_H - \text{net}_A)\big)$$
- **Matriz de marcador:** **Poisson bivariada con corrección exacta de Dixon–Coles (1997)** sobre celdas $(0,0), (1,0), (0,1), (1,1)$ con $\rho$ calibrado por liga (`-0.05` a `-0.09`), reproduciendo `p_home`, `p_draw`, `p_away`, `over_05/15/25`, `btts` y `correct_score_top3` con **error máximo `0.0002`**.
- **Mercados secundarios:** **Binomial Negativa** con parámetro de concentración $r$ por mercado (`shots: 1.708`, `corners: 1.497`, `fouls: 1.095`, `shots_on_target: 1.007`), posesión por diferencia logística exacta (`error 0.00%`) y tarjetas amarillas de árbitro con **Empirical Bayes ($k = 15$ partidos de prior)**.

### 5.2 NBA, NFL, NHL y MLB
- **NBA:** Ensamble lineal **`0.75 * margin_from_ratings + 0.25 * margin_from_elo + rest_adjustment`** (con Elo estilo FiveThirtyEight: `+60` localía y divisor `28.0`), evaluado con Normal efectiva $\sigma_{\text{eff}} \approx 12.25$ pts. **Defecto crítico:** no descuenta numéricamente bajas de estrellas; solo pasa `bajas_reportadas` en texto a Claude.
- **NFL:** Ensamble lineal **`0.35 * margen_puntos + 0.30 * margen_epa + 0.35 * margen_elo + qb_local - qb_visitante + descanso`** (`+0.65` total en domo / `-0.6` exterior), evaluado con Normal exacta **$\sigma_{\text{NFL}} = 13.00$ pts** *(error máx. `0.000107`)*.
- **NHL:** Modelo propio de xG por tiro entrenado sobre `93,598` tiros (`holdout_auc = 0.7477`, `logloss = 0.22524`), sumando tasas por estado de fuerza (`ev5 + pp + sh + evo`) $\times$ `finishing_mult` $\times$ `goalie_goals_mult` del portero probable (`most_starts`), más simulación **Monte Carlo** con `+8.1%` por portería vacía y resolución de OT/SO.
- **MLB:** Proyección ofensiva/pitcheo con `wOBA`, `FIP` de abridor y bullpen, y `park_factor` sobre distribución **Binomial Negativa ($r \approx 5.5$)** para primeras 5 entradas (F5) y 9 entradas.

### 5.3 Picks y Motor Narrativo de IA (`Anthropic Claude`)
- **Picks (`astra_picks` y `match_marks`):** Curaduría manual/semi-editorial en texto libre (incluso con erratas tipográficas como `"tiros de esquinas"` y un `Set([1636276, 1636288])` cableado en `mod_0774`), sin cuota asociada, sin *stake* y sin liquidación cuantitativa verificable.
- **Narrativa con Claude (`mod_1011`):** Un worker serializa las salidas del modelo y un objeto `digest` (rachas, lesiones, contexto) y solicita a **Claude** 4 bloques en fútbol (`panorama`, `tactica`, `factores`, `proyeccion`) o 5 bloques `[{titulo, texto}]` en deportes US. **No existe verificador determinista post-LLM**, lo que provocó la inversión total de equipos y mariscales detectada en `NFL 401873052`.

---

## 6. Autenticación, Pagos, Legal y Estrategia para PitchLab (`08` y `09`)

> Detalle completo en [08-autenticacion-pagos-monetizacion-y-legal.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/08-autenticacion-pagos-monetizacion-y-legal.md) y [09-comparativa-estrategica-vs-pitchlab.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/09-comparativa-estrategica-vs-pitchlab.md).

- **Monetización adaptada a México:** Prueba gratuita de **7 días sin tarjeta** al verificar correo (con validación dual cliente + trigger SQL `>= 18 años`), seguida de pases prepagados acumulables de **`$199 MXN / 30 días` sin cobro recurrente automático** pagables con **Stripe** o **Mercado Pago** (tarjetas/SPEI/OXXO vía polling en `/pago/[id]`). La integración nativa **RevenueCat (`iap-confirm`)** existe en el código pero está desactivada en producción (`iap_ios_key: null`) para empujar la PWA y retener ~94% del ingreso bruto.
- **Cómo gana PitchLab (`v3.2`) frente a Astra AI:**
  1. **Superioridad matemática y de mercado (`EV + De-Vig + CLV + Ledger SHA-256`):** Astra AI vende probabilidades aisladas de las cuotas y presume ">75% de aciertos" sin medir siquiera su propio Brier Score; PitchLab conecta modelo + mercado sin vig, calcula `fairOdds` y valor esperado real, incluye impacto causal de alineaciones/lesiones y audita su calibración con walk-forward estricto.
  2. **Adopción táctica de los aciertos de Astra AI:** (a) Pre-generar **1 análisis LLM por partido en backend** (costo marginal `$0` por lector) añadiendo **validación determinista post-generación** para impedir inversiones local/visitante; (b) ofrecer el **Pase Prepago de `$199 MXN / 30d` con Mercado Pago + Stripe** junto con **Google OAuth en 1 clic**; (c) aplicar el patrón **RLS *Soft-Null*** pero **ocultando los hiperparámetros internos** del JSON público post-partido; y (d) reemplazar el *HTTP polling* por canales push/WebSocket reales.

---

## 7. Índice Completo de Documentos y Evidencia del Dossier

| Archivo / Carpeta | Descripción |
|---|---|
| [README.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/README.md) | Índice navegable y guía rápida del dossier completo. |
| [01-arquitectura-frontend-y-rutas.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/01-arquitectura-frontend-y-rutas.md) | Expo SDK 58, React 19.3 Compiler, las 22 rutas `.tsx` y grafo de los 1,030 módulos Metro. |
| [02-ux-diseno-y-funcionalidades-cliente.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/02-ux-diseno-y-funcionalidades-cliente.md) | Sistema visual *Monochrome Dark Luxury*, layout dual Desktop/Móvil, cachés, `siguiendo` y PWA. |
| [03-backend-supabase-y-esquema-bd.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/03-backend-supabase-y-esquema-bd.md) | Topología Cloudflare + EAS + Supabase, diagrama ER de las 14 tablas públicas, Storage y RLS *Soft-Null*. |
| [04-edge-functions-rpcs-y-operacion.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/04-edge-functions-rpcs-y-operacion.md) | Contratos técnicos de los 4 RPCs (incl. radiografía de `admin_dashboard`) y las 7 Edge Functions. |
| [05-evidencia-runtime-y-payloads-reales.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/05-evidencia-runtime-y-payloads-reales.md) | Bitácora de los 5 escenarios autenticados REA (`130` pasos totales), capturas y payloads en vivo. |
| [06-modelos-estadisticos-picks-e-ia.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/06-modelos-estadisticos-picks-e-ia.md) | Reconstrucción matemática exacta de los 5 deportes, momios IEEE-754, picks y auditoría de Claude. |
| [07-fuentes-de-datos-proveedores-y-momios.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/07-fuentes-de-datos-proveedores-y-momios.md) | Pruebas forenses de proveedores (API-Sports, ESPN, NHL, MLB, Marathonbet, DraftKings), crons y costos. |
| [08-autenticacion-pagos-monetizacion-y-legal.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/08-autenticacion-pagos-monetizacion-y-legal.md) | Ciclo Auth, Stripe + Mercado Pago + RevenueCat, LFPDPPP, telemetría y postura de seguridad pasiva. |
| [09-comparativa-estrategica-vs-pitchlab.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/09-comparativa-estrategica-vs-pitchlab.md) | Benchmarking cara a cara Astra AI vs PitchLab (`v3.2`) + AztecaVet / TouchIQ / LineMate. |
| [10-registro-evidencia-y-limitaciones.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/10-registro-evidencia-y-limitaciones.md) | Ledger de los 16 `evidence_id` de REA, matriz `OBSERVADO / INFERIDO / DESCONOCIDO` y fronteras. |
| [evidence/](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/evidence) | `verify_astra_math.py` (`8/8 OK`), `module-map.json`, `database-and-api-contracts.json`, `data-provenance-matrix.json`, `rea-evidence-ledger.json` y `19` payloads reales en `live-payloads/`. |
| [screenshots/](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/screenshots) | `14` capturas PNG de alta resolución obtenidas en los escenarios REA autenticados. |
| [app/](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/app) y [modules/](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/analisis-astra/modules) | Los `25` chunks JS originales + `index.html` y los `286` módulos Metro desempaquetados e indexados. |
