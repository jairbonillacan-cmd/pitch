# 06. Evidencia Runtime, Proyecciones REA y Catálogo Maestro de Contratos API

> **Clasificación epistemológica:** Se distingue estrictamente entre contratos `[OBSERVADO]` en tráfico real capturado (`scoutpicks_api_only.har`, `scoutpicks_sanitized.har` y sondas en `evidence/live-payloads/`), contratos `[DERIVADO]` de los clientes tipados compilados en `index-BZ3_gLK3.js` (`all_http_calls.json`), e hipótesis `[INFERIDO]` sobre lógica interna del servidor.
>
> **Política de privacidad:** Cero PII y cero secretos activos (`usr_redacted_0000000000000000000`, `[REDACTED_AUTH_TOKEN]`, `user@redacted.example`).

---

## 1. Síntesis Cuantitativa de la Superficie API

El cruce entre la captura de red autenticada procesada por **REA** y la disección estática del bundle de producción (`3,361,584` bytes, `ev_d6aea026e24cc7285f592385c27b572003bb7a591dbda6be9d5c2ff8366790be`) revela la totalidad de la superficie HTTP de `https://api.scoutpicks.aertech-labs.com`:

| Fuente Forense | Artefacto / ID de Evidencia REA | Volumen | Alcance Técnico | Nivel |
| :--- | :--- | :--- | :--- | :--- |
| **Captura HAR Completa** | `scoutpicks_sanitized.har` (`ev_8d1fa2225983ff98a4c350ad528895985cc9cdd8f4efab6f7eceda9da4dc30cd`) | `2,340` registros (`22.8 MB`) | Tráfico integral multi-origen (`657` llamadas a API incluyendo `OPTIONS` CORS, `975` Sportmonks, `229` PostHog, `41` Sentry, `4` RevenueCat). | `[OBSERVADO]` |
| **Captura HAR Solo API** | `scoutpicks_api_only.har` (`ev_03f837b1e4aec03bcac8791498a5d2cbbd06e25f39474bde43e541baa4acff52`) | `403` intercambios `GET 200` (`5.3 MB`) | Navegación orgánica autenticada sobre el backend REST (SHA-256 `cf7b7263...`). | `[OBSERVADO]` |
| **Proyección `api-surface`** | [rea-api-surface.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/scoutpicks/evidence/rea/rea-api-surface.json) (`ev_ed3088dec6d65a5c6d0eefd68c9e7b514067e9949919ea0896ef1ca6b08aed38`) | `50` grupos de ruta (`28` parametrizados) | Agrupación estructural de plantillas URL sobre los `403` registros HAR. | `[INFERIDO]` (REA) |
| **Proyección `environment-manifest`** | [rea-environment-manifest.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/analyze_pitchlab_competitor_rea/Reportes/scoutpicks/evidence/rea/rea-environment-manifest.json) (`ev_7aae1b8faebfaae85bd8513669e557fd705e9a7b85ff530e366823d93f7910d4`) | `50` herramientas `get_*` | Síntesis de parámetros de ruta (`numeric`, `opaque-token`) y nombres de query string. | `[INFERIDO]` (REA) |
| **Proyección `environment-coverage`** | `inspect_analysis_view` (`ev_4d363865fbaf2caebf91a63a3bda37d75cf6d8e5ffb0ba334b45df7c33efd9b3`) | `40` estado + `10` grabadas | Evaluación de reproducibilidad determinista del estado para simulación AgentEnv. | `[INFERIDO]` (REA) |
| **Sondas Puntuales de Lectura/Validación** | `evidence/live-payloads/` (`89` archivos) y `scratch/live_capture/payloads/` (`93` archivos) | `65` endpoints únicos probados en vivo | Incluye respuestas `200 OK` de rutas secundarias (`bracket`, `squad`, `search`, `simulations`) y errores controlados `400 ZodError` / `403`. | `[OBSERVADO]` |
| **Extracción Estática Cliente** | [all_http_calls.json](file:///C:/Users/T490s/.gemini/antigravity/brain/8e1bb7bd-e2dd-4687-97e2-e5f221d4e760/scratch/deep_bundle/all_http_calls.json) + `03_auth_and_axios.js` | **`103` operaciones (`65 GET` + `38 mutaciones`)** sobre **`89` rutas únicas** | Cubre el 100% de lecturas y escrituras (`POST`, `PUT`, `PATCH`, `DELETE`) invocables por la SPA y la landing. | `[DERIVADO]` |

---

## 2. Protocolo de Transporte, Caché, Paginación y Rate-Limiting

### 2.1 Cliente HTTP (`kt`), Cabeceras Obligatorias e Interceptor de Sesión
En `03_auth_and_axios.js` (`ev_abdb3cf1dbd8a7aab2a952ca236449585bd2de775d8200297a3b94e836220fb3`), la SPA instancia un único cliente **Axios** compartido `[OBSERVADO]`:
* **`baseURL`:** `https://api.scoutpicks.aertech-labs.com` (fallback local de desarrollo compilado: `http://localhost:3000`, revelando el puerto local por defecto del servidor Node.js `[OBSERVADO]`).
* **`timeout`:** `10,000 ms` por defecto; elevado explícitamente a `30,000 ms` en `POST /creator/pick-calendar/preview` y `POST /creator/pick-calendar/apply`, y acotado a `4,000 ms` con `AbortController` en la llamada pública de `LandingPage.astro` a `GET /app/pricing` `[OBSERVADO]`.
* **Cabeceras inyectadas por request interceptor:**
  * `Content-Type: application/json`
  * `X-Platform: Web` (permitida explícitamente en `access-control-allow-headers: authorization,x-platform`)
  * `Authorization: Bearer <sp.authToken>` (leído de `localStorage["sp.authToken"]` con fallback en memoria si el almacenamiento está bloqueado)
  * `Accept-Language: <i18n.language>` (determina la localización en servidor de etiquetas como `metricLabel`, `periodLabel`, descripciones de insights y mensajes de error de negocio como `"Las alertas de mercado aún no están disponibles para tu cuenta."` `[DERIVADO]`).
* **Revalidación reactiva ante `401 Unauthorized`:** Un interceptor de respuesta captura cualquier `401` en rutas distintas de `/auth/get-session` y, protegido por el cerrojo booleano `ZN` para evitar tormentas concurrentes, invoca `useAuthStore.getState().checkSession()` `[OBSERVADO]`.

### 2.2 Política de Caché HTTP vs. Caché Reactiva en Cliente (TanStack Query v5)
La auditoría de los `403` registros de `scoutpicks_api_only.har` demuestra una estrategia minimalista de cabeceras `Cache-Control` en el servidor, delegando la caducidad fina a **TanStack Query** en el cliente `[OBSERVADO]` `[DERIVADO]`:

| Directiva `Cache-Control` Servidor | Endpoints Observados | Razón Arquitectónica | `staleTime` / `refetchInterval` en Cliente |
| :--- | :--- | :--- | :--- |
| **`private, no-store`** | `GET /app/pricing`<br/>`GET /bookmakers/offers` | Respuestas dependientes de IP geográfica, experimentos PostHog, código `?promo=` y elegibilidad individual de afiliación. | `pricing`: `30 min` (`60s` si hay `?promo=`)<br/>`offers`: `staleTime: 5 min`, `retry: false` |
| **`public, max-age=60`** | `GET /bookmakers` | Catálogo global de casas de apuestas y códigos ISO de país con baja tasa de cambio. | `staleTime: 3,600,000 ms` (`1 hora`) para logos |
| **Sin cabecera `Cache-Control`** *(51 rutas en HAR)* | Resto de la API (`/insights/*`, `/matches/*`, `/picks/*`, `/subscriptions/me`, `/users/settings`, etc.) | Evita almacenamiento intermedio no deseado y gobierna el refresco mediante polling condicional en vivo desde React Query. | • `matches/:id/events` (live): `refetchInterval: 10s`<br/>• `leagues/:id/matches`: `15s` (si hay partido live) / `60s`<br/>• `leagues/:id/bracket`: `refetchInterval: 60s`<br/>• `market-alerts` y cuotas activas: `staleTime: 30s`, `refetchInterval: 60s`, `refetchOnWindowFocus: "always"`<br/>• `subscriptions/me` y `simulations`: `staleTime: 60s` |

### 2.3 Rate-Limiting (`x-ratelimit-*`, `retry-after`) y Manejo de `429`
1. **Exposición CORS (`api_response_headers_audit.json`):** El backend expone globalmente `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`, `retry-after` y `x-retry-after` `[OBSERVADO]`.
2. **Aplicación selectiva por ruta:** En los `93` payloads capturados de navegación y lectura, los campos `x-ratelimit-*` no fueron emitidos (`null`), lo que demuestra que el middleware de rate-limit **no penaliza lecturas autenticadas ordinarias**, reservándose para endpoints sensibles de autenticación (envío/verificación de OTP), feedback y mutaciones costosas `[DERIVADO]`.
3. **Contrato de degradación en cliente (`03_auth_and_axios.js`, `10_app_core_part4...js`):**
   * En **Autenticación (`AuthRequestError`)**: La función `Nge(err)` parsea `Number(err.response.headers["retry-after"])`. Ante `HTTP 429` al reenviar un código OTP en `/login/verify`, el temporizador de bloqueo salta de los `30s` estándar (`wU = 30`) a `retryAfterSeconds ?? 60` (`vQe = 60`) `[OBSERVADO]`.
   * En **Feedback (`POST /feedback`)**: La función `$rt(status, retryAfter)` detecta `status === 429` y convierte `retry-after` de segundos a minutos redondeados hacia arriba (`Math.max(1, Math.ceil(r / 60))`, con fallback de `60` minutos) para informar al usuario en interfaz `[OBSERVADO]`.
   * En **Telemetría**: `UK(status)` clasifica `429` como `"rate_limited"` en PostHog, y el integrador de Sentry/OpenTelemetry (`Mat`) asigna el código gRPC/OTel `resource_exhausted` `[OBSERVADO]`.

### 2.4 Tres Patrones de Paginación Coexistentes
El backend combina tres esquemas distintos de paginación según la naturaleza cardinal del recurso `[OBSERVADO]`:
1. **Offset-Limit Estandarizado con Objeto `pagination`:** Usado en `GET /picks`, `GET /market-alerts` y `GET /notifications`. Devuelve `{ data: [...], pagination: { limit: 30, offset: 0, total: 1, hasMore: false } }`.Variante plana en `GET /players/:id/matches` (`{ playerId, total, limit, offset, matches }`) y `GET /insights/top` (`{ insights, count, totalCount, hasMore }`).
2. **Paginación Bidimensional por Grupos (`groupOffset` + `perGroupLimit`):** Usada en `GET /insights/grouped` (`groupBy=match&groupLimit=4&perGroupLimit=10&groupOffset=0`), retornando `{ groups: [...], hasMoreGroups: boolean, nextGroupOffset: number }` para cargar 4 partidos a la vez con hasta 10 insights cada uno y paginar después verticalmente dentro de cada partido con `GET /insights?matchIds=<id>&limit=40&offset=<n>` `[OBSERVADO]`.
3. **Paginación por Cursor Opaco + Ventana de Tiempo (`cursor`):** Usada en `GET /leagues/:id/matches` (`startTime`, `endTime`, `limit=20`, `cursor`), retornando `{ league, season, dateGroups, hasMore, hasPrevious, nextCursor }` consumido por `useInfiniteQuery` en TanStack Query (`getNextPageParam: I => I.hasMore && I.nextCursor ? I.nextCursor : undefined`) `[OBSERVADO]`.

---

## 3. Catálogo Maestro de Endpoints REST por Dominio Funcional

A continuación se documentan las **103 operaciones HTTP (`65 GET` + `38 de escritura`)** agrupadas en los **18 dominios funcionales** de `https://api.scoutpicks.aertech-labs.com`.

### 3.1 Dominio 1: `Auth` (8 endpoints)

| Método y Ruta | Evidencia | Request (Query / JSON Body) | Response `200` / Errores Clave |
| :--- | :--- | :--- | :--- |
| `POST /auth/email-otp/send-verification-otp` | `[DERIVADO]` bundle | `{ "email": "user@redacted.example", "type": "sign-in" }` | `200 OK` (dispara email OTP de 6 dígitos vía Resend). `429` con cabecera `Retry-After` (segundos). |
| `POST /auth/sign-in/email-otp` | `[DERIVADO]` bundle | `{ "email": "user@redacted.example", "otp": "123456" }` | `200 OK`: `{ "token": "[REDACTED_AUTH_TOKEN]", "user": { "id": "usr_redacted_...", ... } }` + cabecera opcional `set-auth-token`. Valida `JN(r)`. |
| `POST /auth/sign-in/social` | `[DERIVADO]` bundle | Google: `{ "provider": "google", "idToken": { "token": "<jwt>" } }`<br/>Apple: `{ "provider": "apple", "idToken": { "token": "<jwt>" }, "user": { "name"?: "...", "email"?: "..." } }` | `200 OK`: `{ "token": "[REDACTED_AUTH_TOKEN]", "user": User }`. |
| `POST /auth/web-handoff/redeem` | `[DERIVADO]` bundle | `{ "token": "<43-char-base64url-ott>" }` | `200 OK`: `{ "token": "[REDACTED_AUTH_TOKEN]", "user": User }`. `4xx` si el OTT expiró o ya fue consumido (`web_app_handoff_failed: "rejected"`). |
| `GET /auth/get-session` | `[OBSERVADO]` HAR (`34x`, `ev_ed3088...`) | Sin parámetros (requiere `Authorization: Bearer`). | `200 OK`: `{ "session": { "id", "userId", "token", "expiresAt", "ipAddress", "userAgent", "impersonatedBy", "createdAt", "updatedAt" }, "user": User }` (o `null` si expirada). |
| `POST /auth/sign-out` | `[DERIVADO]` bundle | Body vacío. | `200 OK`: revoca el token activo en tabla `Session`. |
| `PATCH /auth/locale` | `[DERIVADO]` bundle | `{ "locale": "es" \| "en" \| "pt" \| ... }` | `200 OK`: persiste `User.locale` (soporta 13 idiomas en UI). |
| `DELETE /auth/delete-account` | `[DERIVADO]` bundle | Sin body (confirmación `"DELETE"` validada en UI). | `200 OK`: anonimiza PII (`name`, `email`, `image`, onboarding), revoca sesiones y tokens push, conserva transacciones y picks ligados al `id` interno. |

### 3.2 Dominio 2: `Onboarding` (1 endpoint polimórfico)

| Método y Ruta | Evidencia | Request JSON Body | Response |
| :--- | :--- | :--- | :--- |
| `POST /onboarding/complete` | `[DERIVADO]` bundle | **Variante A (`profile_quiz`):** `{ "flowType": "profile_quiz", "bettingStyle": "analytical"\|"intuitive"\|"social"\|"conservative", "bettingGoal": "confidence"\|"value"\|"selection"\|"profitability" }`<br/>**Variante B (`personalization`):** `{ "flowType": "personalization", "source": string, "experience": string, "markets": string[], "leagues": number[], "playStyle": "singles"\|"combos"\|"both", "oddsFormat": "decimal"\|"american", "notificationsEnabled"?: boolean, "bookmakerIds"?: number[] }` | `200 OK`: marca `User.hasCompletedOnboarding = true` y persiste preferencias iniciales. Al finalizar redirige automáticamente a `/dashboard/paywall?source=web_onboarding`. |

### 3.3 Dominio 3: `Users` (2 endpoints)

| Método y Ruta | Evidencia | Request / Body | Response `200 OK` |
| :--- | :--- | :--- | :--- |
| `GET /users/settings` | `[OBSERVADO]` HAR (`40x`, `ev_ed3088...`) | Sin parámetros. | `{ "homeWidgetOrder": ["featured-picks", "market-alerts", "my-picks", "performance", "big-matches"], "homeHiddenWidgets": [], "preferredLeagues": [], "favouriteTeamId": null, "favouritePlayers": [], "favouriteBets": [], "hasSimulatedBet": false, "riskProfile": 50, "oddsFormat": "decimal" }` |
| `PATCH /users/settings` | `[DERIVADO]` bundle | Actualización parcial: `{ "oddsFormat": "decimal" \| "american" }` o `{ "homeWidgetOrder": string[], "homeHiddenWidgets": string[] }`. | Devuelve el objeto actualizado validando persistencia de `homeWidgetOrder` y `homeHiddenWidgets`. |

### 3.4 Dominio 4: `Subscriptions & Pricing` (3 endpoints)

| Método y Ruta | Evidencia | Request (Query / Body) | Response `200 OK` |
| :--- | :--- | :--- | :--- |
| `GET /app/pricing` | `[OBSERVADO]` HAR (`2x`, `ev_ed3088...`) | Query opcional: `?promo=<CODE>&offer=<slug>` (invocable también sin sesión desde la landing Astro). Cabecera respuesta: `Cache-Control: private, no-store`. | `{ "country": "MX", "offering": "pricing-mx-2026q3-v1-treatment", "currency": "MXN", "prices": { "weekly": 149, "monthly": 299, "yearly": 1499 }, "trialDays": { "weekly": null, "monthly": null, "yearly": 7 }, "offer": null \| { "expiresAt", "timeZone", "regularPrices": { "yearly" } }, "promo"?: { "code", "percentOff", "interval", "expiresAt" } }` |
| `GET /subscriptions/me` | `[OBSERVADO]` HAR (`34x`, `ev_ed3088...`) | Sin parámetros. | `{ "tier": "pro"\|"free", "status": "active"\|"cancelled"\|"grace_period"\|"expired", "expiresAt": "2026-11-24T03:09:49.000Z", "period": "yearly", "isTrialing": true, "isContentCreator": false, "productId": "scout_pro_web_yearly", "worldCupPassExpiresAt": null, "planType": "all_leagues", "freeLeagueId": null, "selectedLeagueIds": [], "accessibleLeagueIds": [39, 140, ...], "needsLeagueSelection": false, "requiresFreeLeagueSelection": false, "leagueChangeEligibility": { "canSwap": false, "canSwapAnyLeague": false, "swappableLeagueIds": [], "inactiveLeagueIds": [], "lastChangedAt": null, "nextMonthlyChangeAt": null, "cooldownDays": 30, "inactivityDays": 7 } }` |
| `POST /subscriptions/me/reconcile` | `[DERIVADO]` bundle | Body vacío. Se dispara inmediatamente tras completar checkout web con RevenueCat/Stripe para forzar pull del entitlement antes del webhook. | Devuelve el mismo contrato actualizado que `GET /subscriptions/me`. |

### 3.5 Dominio 5: `Insights & Views` (12 endpoints)

| Método y Ruta | Evidencia | Parámetros Query / Body | Estructura de Respuesta |
| :--- | :--- | :--- | :--- |
| `GET /insights` | `[OBSERVADO]` HAR (`7x`) | `matchIds` (CSV), `playerId`, `teamIds` (CSV), `leagueIds` (CSV), `countryIds` (CSV), `type` (`player`\|`team`), `metric` (CSV), `direction` (`over`\|`under`), `period`, `playerPositions` (`GK,DEF,MID,FWD`), `minOddsValue`, `maxOddsValue`, `minHitRate`, `maxHitRate`, `matchDateStart`, `matchDateEnd`, `statusFilter` (`upcoming`\|`live`), `sortBy` (`recommended`), `sortBySaveCount`, `timezoneOffset`, `limit` (`6`..`1000`), `offset`. | `{ "insights": Insight[], "count": number, "totalCount": number, "filters": Object }` (payload de hasta `6.26 MB` para `limit=500` en un partido). |
| `GET /insights/top` | `[OBSERVADO]` HAR (`15x`) | `limit` (`6` o `40`), `offset`, `statusFilter` (`upcoming`\|`live`), `sortBySaveCount` (`true` para widget "Community Picks", `false` para recomendados), `sortBy` (`recommended`), `timezoneOffset`. | `{ "insights": Insight[], "count": number, "totalCount": number, "hasMore": boolean }` |
| `GET /insights/grouped` | `[OBSERVADO]` HAR (`3x`) | `statusFilter`, `sortBy=recommended`, `timezoneOffset`, `groupBy=match`, `groupLimit=4`, `perGroupLimit=10`, `groupOffset=0` (+ filtros de vista). | `{ "groups": [{ "match": MatchSummary, "insights": Insight[], "totalInsights": number }], "hasMoreGroups": boolean, "nextGroupOffset": number }` |
| `GET /insights/filters` | `[OBSERVADO]` HAR (`3x`) | `statusFilter` (`upcoming`\|`live`), `type` opcional, `timezoneOffset`. | `{ "types", "teams", "leagues", "countries", "matches", "metrics", "directions", "oddsRange", "oddsDistribution", "hitRateRange", "hitRateDistribution", "totalCount" }` (`476 KB`, incluye histogramas de cuotas y acierto). |
| `GET /insights/filter-ranges` | `[OBSERVADO]` HAR (`2x`) | Sin parámetros. | `{ "oddsRange": { "min", "max" }, "hitRateRange": { "min", "max" }, "periodInsightsEnabled": boolean }` |
| `GET /insights/player/:playerId` | `[OBSERVADO]` HAR (`1x`) | `limit=50`. | `{ "playerId": 1113, "insights": Insight[], "count": number }` |
| `GET /insights/team/:teamId` | `[OBSERVADO]` HAR (`1x`) | `limit=50`. | `{ "teamId": 17181, "insights": Insight[], "count": number }` |
| `GET /insights/:insightId` | `[OBSERVADO]` HAR (`1x`) | `:insightId` URL-encoded (ej. `draft%3Ap1113_m54091_tackles_0.5_over`). No reintenta si recibe `403` (insight bloqueado por liga fuera del plan `free`). | Objeto completo `Insight` (`81` campos). Devuelve `403` o `isLocked: true` cuando el usuario no tiene acceso Pro a la liga del partido. |
| `GET /insight-views` | `[OBSERVADO]` HAR (`9x`) | Sin parámetros. | `{ "views": InsightView[] }` |
| `POST /insight-views` | `[DERIVADO]` bundle | `{ "name": string, "timing": "upcoming"\|"live", "filters": FilterSpec, "sortBy"?: string, "showOnHome"?: boolean }` | Objeto `InsightView` creado (`id`, `position`, timestamps). |
| `PATCH /insight-views/:id` | `[DERIVADO]` bundle | Campos parciales `{ "name"?, "timing"?, "filters"?, "showOnHome"?, "position"? }`. | Objeto `InsightView` actualizado. |
| `DELETE /insight-views/:id` | `[DERIVADO]` bundle | Sin body. | `200` / `204` elimina el filtro guardado. |

### 3.6 Dominio 6: `Matches & Odds` (13 endpoints)

| Método y Ruta | Evidencia | Parámetros Query | Estructura de Respuesta / Validación |
| :--- | :--- | :--- | :--- |
| `GET /matches/day/overview` | `[OBSERVADO]` HAR (`8x`) | `startTime` (ISO), `endTime` (ISO), `region` (ej. `419` Latinoamérica), `live` opcional. | `{ "recommended": MatchCard[], "countries": CountryLeagueGroup[], "totalMatches": number, "liveCount": number }` (`292 KB`). |
| `GET /matches/day/grouped` | `[DERIVADO]` bundle | `startTime`, `endTime`, `countryIds` (CSV), `leagueIds` (CSV), `timezoneOffset`, `limit=50`. | Partidos del día paginados/agrupados por competición con filtro explícito de ligas/países. |
| `GET /matches/:id` | `[OBSERVADO]` HAR (`23x`) | Sin parámetros. | Objeto `Match` completo con las **87 propiedades** documentadas en el Capítulo 03 (`playerStats`, `teamStats`, `season`, `homeTeam`, `awayTeam`, etc.). |
| `GET /matches/:id/events` | `[OBSERVADO]` HAR (`1x`) | Sin parámetros (`37222996`). | `{ "match": { "id", "homeTeam", "awayTeam", "status", "elapsed" }, "events": [{ "id", "elapsed", "extraTime", "type", "detail", "team", "player", "assist", "comments" }] }` |
| `GET /matches/:id/lineups` | `[OBSERVADO]` HAR (`1x`) | Sin parámetros (`54091`). | `{ "match": MatchHeader, "lineupsStatus": "pending"\|"confirmed"\|"synced", "home": FormationLineup\|null, "away": FormationLineup\|null }` |
| `GET /matches/:id/players` | `[OBSERVADO]` live payload | Sin parámetros (`54091`). | `{ "match": Match, "players": MatchPlayerStats[] }` |
| `GET /matches/:id/matchup` | `[OBSERVADO]` HAR (`2x`) | Sin parámetros (`54091`). | `{ "match": MatchHeader, "homeTeam": TeamMatchupMetrics, "awayTeam": TeamMatchupMetrics }` |
| `GET /matches/:id/matchup/rankings` | `[OBSERVADO]` HAR (`1x`) | Sin parámetros (`54091`). | `{ "match": MatchHeader, "homeTeam": LeagueMetricRankings, "awayTeam": LeagueMetricRankings }` |
| `GET /props/h2h/:team1Id/:team2Id` | `[OBSERVADO]` HAR (`1x`) | Sin query (`17181`/`14678`). | `{ "team1", "team2", "matchesPlayed": 2, "record": { "team1Wins", "draws", "team2Wins" }, "averages": Object, "matches": HistoricalMatch[] }` |
| `GET /matches/:id/odds/gamelines` | `[OBSERVADO]` HAR (`3x`) | `oddsPeriod`: `"full_match"` \| `"first_half"` \| `"second_half"`. | `{ "tab": "gamelines", "match", "markets": [{ "marketName", "period", "betTypeId", "outcomes" }], "h2h", "teamForm" }` |
| `GET /matches/:id/odds/player-props` | `[OBSERVADO]` live payloads (`5x`) | `category` (**enum estricto Zod v4**): `"attacking"` \| `"cards-fouls"` \| `"passing"` \| `"defense"`. | `200 OK`: `{ "tab": "player-props", "match", "selectedCategory", "categories": [{ "key", "label", "count" }], "props": [...] }`.<br/>`400 Bad Request`: enviar `category=shots` dispara `ZodError` (`invalid_value`). |
| `GET /matches/:id/odds/team-props` | `[OBSERVADO]` live payload | `oddsPeriod` (`full_match` \| `first_half` \| `second_half`). | `{ "tab": "team-props", "match", "periods", "combinedProps", "props", "teamResultOdds" }` |
| `GET /matches/:id/odds/game-props` | `[OBSERVADO]` live payload | `oddsPeriod` (`full_match` \| `first_half` \| `second_half`). | `{ "tab": "game-props", "match", "props": [{ "period", "metric", "metricLabel", "type", "lines" }] }` |

### 3.7 Dominio 7: `Simulations` (1 endpoint de cálculo estadístico bajo demanda)

| Método y Ruta | Evidencia | Request JSON Body (Unión Discriminada Zod) | Response `200 OK` / `400 ZodError` |
| :--- | :--- | :--- | :--- |
| `POST /simulations/calculate` | `[OBSERVADO]` `5` live payloads (`3x 200`, `2x 400`) | **Modo 1 (por Insight):** `{ "insightId": "draft:p1113_m54091_tackles_0.5_over", "timeframe"?: "l5"\|"l10"\|"l20"\|"season"\|"vs" }`<br/>**Modo 2 (Ad-hoc Jugador/Equipo):** `{ "matchId": 54091, "playerId"?: 1113, "teamId"?: 17181, "metric": "tackles"\|"goals"\|..., "comparison": "over"\|"under", "line": 1.5, "period": "full_match", "timeframe": "l20" }` | **`200 OK`:** `{ "probability": 14..100, "confidence": "low"\|"medium"\|"high", "entity", "bet", "match", "analysis": { "summary": string, "keyFactors": string[] }, "charts": { "vsOpponent", "vsTop5", "homeAway", "compliance", "combined"? }, "timeframe", "appliedIsHome", "appliedVenue", "teamContext", "odds": { "available", "bestOdds", "options": [{ "oddsId", "value", "bookmaker", "impliedProbability", "edge" }] }, "defenseChart" }`.<br/>**`400 Bad Request` (`ZodError` custom):** `"Either insightId OR (playerId/teamId + metric + comparison + line) must be provided"` (observado cuando se envía `betType: "btts"` o `match_totals` sin `playerId`/`teamId`). |

### 3.8 Dominio 8: `Teams` (10 endpoints)

| Método y Ruta | Evidencia | Parámetros Query | Respuesta |
| :--- | :--- | :--- | :--- |
| `GET /teams` | `[DERIVADO]` bundle | `league`, `season`. | Lista de equipos filtrada por liga/temporada. |
| `GET /teams/search` | `[DERIVADO]` bundle | `q` (texto de búsqueda). | Coincidencias rápidas de equipos para selectores. |
| `GET /teams/featured` | `[OBSERVADO]` live payload | `limit=20`. | Arreglo de `20` equipos destacados `[{ "id", "name", "logo", "code", "country", "league" }]`. |
| `GET /teams/:id` | `[OBSERVADO]` HAR (`1x`) | Sin parámetros (`17181`). | `{ "id", "name", "shortName", "code", "logo", "country", "isNationalTeam", "venue", "competitions", "founded" }` |
| `GET /teams/:id/squad` | `[OBSERVADO]` live payload | Sin parámetros (`17181`). | `{ "teamId": 17181, "players": [{ "id", "name", "image", "position", "detailedPosition", "positionGroup", "shirtNumber", "captain", "age" }], "total": 26 }` |
| `GET /teams/:id/matches` | `[OBSERVADO]` HAR (`1x`) | `limit` (`10` o `50`), `status` (`finished`). | Arreglo directo `Match[]` (`50` elementos, `203 KB`). |
| `GET /teams/:id/matches/upcoming` | `[OBSERVADO]` live payload | `includeLive="true"` opcional. | `{ "team", "matches": Match[] }` |
| `GET /teams/:id/performance` | `[OBSERVADO]` HAR (`1x`) | `metric` (`goals`, etc.), `metricDirection` (`for` \| `against`), `window` (`l5`\|`l10`\|`l20`\|`season`), `line`, `direction` (`over`\|`under`), `period`, `matchIds` (CSV), `opponentTeamId`. | `{ "teamId", "window", "period", "metric", "metricDirection", "statLabel", "points": [...], "summary", "threshold" }` (usado también en pestaña de jugador con `metricDirection="against"` para medir la defensa rival). |
| `GET /teams/:id/performance/filters` | `[OBSERVADO]` HAR (`1x`) | Sin parámetros. | `{ "leagues": [...], "opponents": [...] }` |
| `GET /teams/:id/odds` | `[OBSERVADO]` HAR (`2x`) | `period` (si distinto de `full_match`), `matchId` opcional. | `{ "matchId", "opponent", "date", "markets", "resultOdds", "matchTotalsMarkets" }` |

### 3.9 Dominio 9: `Players` (6 endpoints)

| Método y Ruta | Evidencia | Parámetros Query | Respuesta |
| :--- | :--- | :--- | :--- |
| `GET /players/:id` | `[OBSERVADO]` HAR (`2x`) | Sin parámetros (`1113`, `3580`). | `{ "id", "name", "firstName", "lastName", "image", "position", "detailedPosition", "nationality", "currentTeam", "nationalTeam", "inNationalTeamSquad", "currentCompetitions", "height", "weight", "age" }` |
| `GET /players/:id/matches` | `[OBSERVADO]` HAR (`1x`) | `limit` (`10` o `20`), `offset`, `opponentTeamId`, `competitionId`, `season`, `from`, `to`. | `{ "playerId", "total", "limit", "offset", "matches": PlayerMatchLog[] }` |
| `GET /players/:id/matches/upcoming` | `[OBSERVADO]` HAR (`1x`) | `includeLive="true"` opcional. | `{ "player", "matches": Match[] }` |
| `GET /players/:id/performance` | `[OBSERVADO]` HAR (`5x`) | `metric` (`tackles`, etc.), `window` (`l5`\|`l10`\|`l20`), `minMinutes` (`45`), `line`, `direction`, `matchIds` (CSV), `opponentTeamId`, `venues`. | `{ "playerId", "window", "metric", "statLabel", "points": [...], "livePoint", "includeSubstitutes", "summary", "threshold" }` |
| `GET /players/:id/performance/filters` | `[OBSERVADO]` HAR (`1x`) | Sin parámetros. | `{ "teams": [...], "opponents": [...], "leagues": [...], "seasons": [...] }` |
| `GET /players/:id/odds` | `[OBSERVADO]` HAR (`2x`) | Sin parámetros. | `{ "matchId", "opponent", "date", "markets": [...] }` |

### 3.10 Dominio 10: `Leagues` (7 endpoints) y Dominio 11: `Referees` (4 endpoints)

| Método y Ruta | Dominio | Evidencia | Parámetros Query | Respuesta |
| :--- | :--- | :--- | :--- | :--- |
| `GET /leagues` | `Leagues` | `[OBSERVADO]` live | Sin parámetros. | `{ "leagues": League[], "count": 176 }` |
| `GET /leagues/:id` | `Leagues` | `[OBSERVADO]` HAR (`3x`) | Sin parámetros (`116`). | `{ "id", "apiId", "name", "type", "logo", "country", "seasons": Season[] }` |
| `GET /leagues/:id/standings` | `Leagues` | `[OBSERVADO]` HAR (`16x`) | `seasonId` (`513`, `89`). | `{ "league", "season", "scope": "table"\|"groups", "groups": [...], "updatedAt", "primaryStageId", "phases": [...] }` (soporta splits `all`, `home`, `away`). |
| `GET /leagues/:id/matches` | `Leagues` | `[OBSERVADO]` HAR (`3x`) | `seasonId`, `phaseStageId`, `groupName`, `roundName`, `teamId`, `startTime`, `endTime`, `timezoneOffset`, `limit`, `cursor`. | `{ "league", "season", "dateGroups", "hasMore", "hasPrevious", "nextCursor"? }` |
| `GET /leagues/:id/filters` | `Leagues` | `[OBSERVADO]` HAR (`3x`) | `seasonId`, `phaseStageId`. | `{ "seasonId", "groups": [...], "rounds": [...], "teams": [...] }` |
| `GET /leagues/:id/bracket` | `Leagues` | `[OBSERVADO]` live | `seasonId`, `phaseStageId`. | `{ "league", "season", "source": "derived", "rounds": [...], "connectors": [...] }` |
| `GET /leagues/:id/referees` | `Leagues` | `[OBSERVADO]` live | `seasonId`. | `{ "league", "season", "referees": [{ "id", "name", "photo", "country", "seasonMatches", "competition", "nextMatch" }] }` (`106` árbitros en Nations League). |
| `GET /referees/:id` | `Referees` | `[OBSERVADO]` HAR (`3x`) | Sin parámetros (`351`). | `{ "id", "name", "photo", "country", "nextMatch", "career": { "matches", "avgYellows", "avgReds", "avgFouls" }, "competitionRank" }` |
| `GET /referees/:id/records` | `Referees` | `[OBSERVADO]` HAR (`3x`) | `year` (`2026`). | `{ "refereeId", "year", "rows": [{ "leagueId", "leagueName", "matches", "yellowCards", "redCards" }], "availableYears": [...] }` |
| `GET /referees/:id/matches` | `Referees` | `[OBSERVADO]` HAR (`2x`) | `metric` (`yellowCards`), `year` (`2026`), `limit` (`20`). | `{ "refereeId", "metric", "points": [...] }` |
| `GET /referees/:id/insights` | `Referees` | `[OBSERVADO]` HAR (`1x`) | `limit` opcional. | `{ "refereeId": 351, "insights": Insight[], "count": number }` (`246 KB`). |

### 3.11 Dominio 12: `Picks & Performance` (8 endpoints)

| Método y Ruta | Evidencia | Parámetros Query / Body | Respuesta |
| :--- | :--- | :--- | :--- |
| `GET /picks` | `[OBSERVADO]` HAR (`7x`) | `status` (`pending`\|`won`\|`lost`\|`void`), `sortBy` (`matchDate`), `sortDir` (`asc`\|`desc`), `limit` (`30`), `offset`, filtros de liga/equipo/betType/fechas. | `{ "data": Pick[], "pagination": { "limit": 30, "offset": 0, "total": 1, "hasMore": false } }` |
| `POST /picks` | `[DERIVADO]` bundle | Especificación del pick (`matchId`, `playerId`\|`teamId`, `metric`, `comparison`, `line`, `period`, `betType`, `selection`, `oddsId`, `insightId`?). | `{ "pick": Pick }` (asigna CUID v1 `cmwk4otqf...` y actualiza el store optimista `savedKeys`). |
| `GET /picks/saved-keys` | `[OBSERVADO]` HAR (`34x`) | Sin parámetros. | `{ "keys": [{ "key": "player_3580_m54091_foulsCommitted_over_0.5_full_match", "id": "cmwk4otqf[REDACTED]", "oddsId": 239803551 }] }` |
| `GET /picks/:pickId` | `[OBSERVADO]` HAR (`1x`) | `:pickId` CUID v1. | `{ "pick": Pick }` |
| `PUT /picks/:pickId/odds` | `[DERIVADO]` bundle | `{ "oddsId": number }` | `{ "pick": Pick }` (permite cambiar de casa/cuota mientras el partido no haya comenzado). |
| `DELETE /picks/:pickId` | `[DERIVADO]` bundle | Sin body. | `{ "deletedKey": string }` (bloqueado si el partido ya inició o el pick está liquidado). |
| `GET /picks/performance` | `[OBSERVADO]` HAR (`7x`) | `dateFrom` (`YYYY-MM-DD`), `dateTo`, `groupBy` (`day`\|`week`\|`month`), `timezoneOffset`, facetas opcionales. | `{ "groupBy": "day", "buckets": [{ "key", "startDate", "endDate", "netUnits", "roi", "won", "lost", "void", "pending", "totalPicks" }], "summary": { "totalPicks", "resolvedPicks", "won", "lost", "void", "pending", "winRate", "totalProfit", "roi" } }` |
| `GET /picks/performance/filters` | `[OBSERVADO]` HAR (`2x`) | `dateFrom`, `dateTo`, `timezoneOffset`. | `{ "competitions": [...], "teams": [...], "betTypes": [...] }` |

### 3.12 Dominio 13: `Market Alerts & Assistant` (8 endpoints)

| Método y Ruta | Evidencia | Parámetros Query / Body | Respuesta / Reglas de Negocio |
| :--- | :--- | :--- | :--- |
| `GET /market-alerts/catalog` | `[OBSERVADO]` HAR (`45x`) | `matchId` opcional (`54091`). | `{ "enabled": boolean, "requiresPro": boolean, "recurring"?: boolean, "bookmakers": [...], "match": null \| { "prematch": boolean, ... } }` |
| `GET /market-alerts/competitions` | `[OBSERVADO]` live (`403`) | `teamId` / `playerId`. | `200 OK`: competiciones elegibles para alertas recurrentes.<br/>`403 Forbidden`: `{ "error": "Las alertas de mercado aún no están disponibles para tu cuenta.", "code": "MARKET_ALERT_DISABLED", "bookmakerIds": [] }`. |
| `GET /market-alerts` | `[OBSERVADO]` live (`200`) | `status` (`active` \| `finished`), `limit` (`20` o `100`), `offset`. | `{ "data": MarketAlert[], "pagination": { "limit", "offset", "status", "total", "hasMore" } }` |
| `POST /market-alerts` | `[DERIVADO]` bundle | Borrador individual de alerta (`scope`, `matchId`, `recurringLeagueIds`, `family`, `period`, `playerId`, `teamId`, `bookmakerIds`). | Crea una alerta; si requiere suscripción devuelve código `MARKET_ALERT_PROREQUIRED`. |
| `POST /market-alerts/batch` | `[DERIVADO]` bundle | Lote de borradores confirmados desde el asistente con claves UUIDv4 de idempotencia (`crypto.randomUUID()`). | Crea múltiples alertas en transacción e invalida cachés `list` y `catalog`. |
| `POST /market-alerts/assistant` | `[DERIVADO]` bundle | `{ "messages": string[] (máx. 6 turnos, 500 chars/mensaje), "context"?: { "matchId": number }, "supportsRecurring"?: true }` | Motor LLM/NLP en backend que traduce lenguaje natural a tarjetas editables: `{ "drafts": AlertDraft[], "notices": [{ "code": string, ... }] }` (mide `latency_ms` en PostHog). |
| `DELETE /market-alerts/:id` | `[DERIVADO]` bundle | Sin body. | Cancela una alerta activa. |
| `GET /market-alerts/:id/history` | `[DERIVADO]` bundle | Paginación opcional (`limit`, `offset`). | Historial cronológico de aperturas y disparos de la alerta. |

### 3.13 Dominio 14: `Bookmakers & Perk Claims` (7 endpoints)

| Método y Ruta | Evidencia | Parámetros Query / Body | Respuesta / Códigos de Error |
| :--- | :--- | :--- | :--- |
| `GET /bookmakers` | `[OBSERVADO]` HAR (`7x`) | Sin parámetros (`Cache-Control: public, max-age=60`). | `{ "bookmakers": [{ "id", "name", "logo", "countryCodes", "recommendedForUser" }], "countryCode": null\|string }` |
| `GET /bookmakers/preferences` | `[OBSERVADO]` live (`200`) | Sin parámetros. | `{ "bookmakers": Bookmaker[], "selectedBookmakerIds": number[], "configured": boolean, "countryCode": string\|null }` |
| `PUT /bookmakers/preferences` | `[DERIVADO]` bundle | `{ "bookmakerIds": number[] }` (mínimo 1 casa seleccionada). | Actualiza las casas preferidas del usuario para el cálculo de mejor cuota disponible. |
| `GET /bookmakers/offers` | `[OBSERVADO]` HAR (`21x`) | `channel=web` (`Cache-Control: private, no-store`). | `{ "eligible": true, "offers": BookmakerOffer[] }` (campañas activas Stake MX y JugaBet MX). |
| `GET /bookmakers/offers/post-save` | `[DERIVADO]` bundle | `bookmakerId=<int>&channel=web`. | `{ "offer": BookmakerOffer \| null }` (modal contextual tras guardar un pick de una casa afiliada). |
| `POST /bookmakers/offers/:bookmakerId/events` | `[DERIVADO]` bundle | `{ "type": "clicked" \| "registered", "surface": string, "campaignId": "bkc_...", "linkId": "bkl_..." }` | Registra telemetría de embudo CPA en servidor. |
| `POST /bookmakers/offers/:bookmakerId/perk-claim` | `[DERIVADO]` bundle | Query: `?channel=web`<br/>Body: `{ "externalUserId": "<4..64 chars [A-Za-z0-9_-]>" }` | `200 OK`: `{ "claim": PerkClaim }`.<br/>Errores tipados: `409` / `PERK_CLAIM_ALREADY_APPROVED`, `PERK_CLAIM_PENDING`, `PERK_CLAIM_ID_IN_USE`, `400` (`invalid_id` o `not_offered`). |

### 3.14 Dominio 15: `Notifications` (6 endpoints) y Dominio 16: `Search` (2 endpoints)

| Método y Ruta | Dominio | Evidencia | Parámetros Query / Body | Respuesta |
| :--- | :--- | :--- | :--- | :--- |
| `GET /notifications` | `Notifications` | `[OBSERVADO]` HAR (`34x`) | `offset=0`, `limit=20`, `unreadOnly="true"` opcional. | `{ "notifications": Notification[], "unreadCount": number, "pagination": Object }` |
| `GET /notifications/unread-count` | `Notifications` | `[OBSERVADO]` live | Sin parámetros. | `{ "unreadCount": 0 }` |
| `POST /notifications/:id/read` | `Notifications` | `[DERIVADO]` bundle | Sin body. | Marca una notificación individual como leída. |
| `POST /notifications/mark-all-read` | `Notifications` | `[DERIVADO]` bundle | Sin body. | Marca toda la bandeja del usuario como leída. |
| `GET /notifications/preferences` | `Notifications` | `[DERIVADO]` bundle | Sin parámetros (`h$`). | Devuelve switches globales, `minMinutesBetweenUpdates` y `pickProgressFrequencies` (16 métricas). |
| `PATCH /notifications/preferences` | `Notifications` | `[DERIVADO]` bundle | Objeto parcial de preferencias de notificación. | Persiste configuración de push móvil y alertas. |
| `GET /search/suggested` | `Search` | `[OBSERVADO]` live | Sin parámetros (`AbortSignal` soportado). | `{ "items": SuggestedEntity[] }` (`19` partidos/entidades sugeridas al abrir el buscador). |
| `GET /search` | `Search` | `[OBSERVADO]` live | `q` (ej. `"Real"`), `type` (`all`\|`players`\|`teams`\|`leagues`\|`matches`\|`referees`), `limit` (`8` rápido o `20` rankeado). | `{ "query": "Real", "type": "all", "items": [{ "type", "id", "name", "logo", ... }] }` |

### 3.15 Dominio 17: `Creator Tools` (4 endpoints) y Dominio 18: `Feedback` (1 endpoint)

| Método y Ruta | Dominio | Evidencia | Request JSON Body | Respuesta / Comportamiento |
| :--- | :--- | :--- | :--- | :--- |
| `GET /creator/access` | `Creator Tools` | `[OBSERVADO]` HAR (`1x`) | Sin parámetros. | `{ "enabled": false, "source": null, "role": null }`. Si `enabled === true`, desbloquea en Perfil la herramienta interna **"Pick Calendar"** para cuentas de influencers/creadores. |
| `POST /creator/pick-calendar/preview` | `Creator Tools` | `[DERIVADO]` bundle | `{ "days": 30\|60\|90, "targetWinRate": 0.55\|0.6\|0.65\|0.7, "minPicksPerDay": 1..3, "maxPicksPerDay": 2..6, "redDayShare": 0.12\|0.22\|0.35, "minOdds": 1.3..1.8, "maxOdds": 1.9..3.5, "timezoneOffset": 0 }` | `200 OK` (timeout `30s`): `{ "seed": string, "planFingerprint": string, "plan": { "summary": { "totalPicks", "winRate", "netUnits" }, "warnings": [{ "code" }], "days": [{ "dateKey", "won", "lost", "netUnits" }] } }`. **Hallazgo crítico `[DERIVADO]`:** Permite sembrar retroactivamente un historial sintético de picks resueltos sobre partidos reales pasados ajustado a un `winRate` objetivo (55%–70%) para demostraciones de creadores de contenido. |
| `POST /creator/pick-calendar/apply` | `Creator Tools` | `[DERIVADO]` bundle | `{ ...previewRequest, "seed": string, "expectedPlanFingerprint": string, "confirm": true }` | Materializa los picks en la cuenta del creador reemplazando corridas previas. Devuelve `409 Conflict` (`pool_changed`) si entraron nuevos resultados desde la previsualización. |
| `DELETE /creator/pick-calendar` | `Creator Tools` | `[DERIVADO]` bundle | Sin body. | `{ "deleted": number }`: elimina exclusivamente los picks sembrados por esta herramienta conservando los guardados manualmente. |
| `POST /feedback` | `Feedback` | `[DERIVADO]` bundle | `{ "kind": "feedback" \| "feature_request", "message": string (10..2000 chars), "platform": "web", "appVersion": "<12-hex-sha>", "locale"?: "es"\|"en"\|"pt" }` | `200 OK` (o `429` con `Retry-After`): almacena el mensaje y lo despacha al canal interno de **Telegram** del equipo de Aertech Labs. |

---

## 4. Evaluación Formal de la Proyección AgentEnv de REA

Al procesar `scoutpicks_api_only.har` (`403` registros, `ev_03f837b1e4aec03bcac8791498a5d2cbbd06e25f39474bde43e541baa4acff52`) mediante `inspect_analysis_view` con las reglas `["after-uid-literal", "opaque-token", "sibling-variance"]`, REA generó tres artefactos complementarios:
1. **`api-surface` (`ev_ed3088dec6d65a5c6d0eefd68c9e7b514067e9949919ea0896ef1ca6b08aed38`):** Consolidó los `403` intercambios HTTP en **`50` plantillas de superficie** (`28` con segmentos dinámicos numéricos inferidos como `{numeric}`), sin descartar ni un solo registro (`excluded: 0`).
2. **`environment-manifest` (`ev_7aae1b8faebfaae85bd8513669e557fd705e9a7b85ff530e366823d93f7910d4`):** Sintetizó **`50` herramientas `get_*`** aplicando además `opaque-token` para parametrizar el CUID `/picks/{uid}` (`get_picks_by_uid`), aunque conservó como ruta literal `/insights/draft%3Ap1113_m54091_tackles_0.5_over` debido al prefijo codificado `draft%3A` con punto decimal `0.5` `[OBSERVADO]`.
3. **`environment-coverage` (`ev_4d363865fbaf2caebf91a63a3bda37d75cf6d8e5ffb0ba334b45df7c33efd9b3`):** Evaluó qué proporción de las `50` herramientas de lectura puede ser servida dinámicamente desde un almacén de estado relacional extraído frente a reproducción literal (*replay*):

| Métrica REA `environment-coverage` | Valor | Interpretación Técnica sobre Scout Picks |
| :--- | :--- | :--- |
| **`reads.state` (Modeladas desde Estado)** | **`40` (`80.0%`)** | 40 de las 50 herramientas `GET` devuelven entidades JSON consistentes con claves de identidad estables (`id`, `matchId`, `playerId`, `teamId`, `leagueId`, `refereeId`) reproducibles directamente desde el grafo de estado inicial. |
| **`reads.recorded` (Servidas como Grabación)** | **`10` (`20.0%`)** | 10 herramientas requieren *replay* de sus grabaciones porque exhiben variaciones dinámicas o estructuras que no son proyecciones puras de una sola tabla de entidades. |
| ↳ Causa `body-unusable` | `4` | Payloads con envolturas escalares/mapas o estructuras agregadas sin colección de entidades canónica identificable por heurística. |
| ↳ Causa `query-varies` | `3` | Endpoints cuya respuesta cambia sustancialmente según query params sobre la misma ruta (ej. `GET /insights/top` con `sortBySaveCount=true` vs `false`, `GET /players/1113/performance` con ventanas `l5`/`l10`/`l20`, `GET /matches/54091/odds/gamelines` con `oddsPeriod=first_half`/`full_match`/`second_half`). |
| ↳ Causa `list-differs` | `2` | Listas repetidas en el tiempo durante los ~3 minutos de sesión cuyo contenido mutó en vivo (p. ej. actualización en tiempo real del partido `37222996` en `2H` minuto `69` o regeneración de insights). |
| ↳ Causa `path-varies` | `1` | Variación de segmento de ruta sobre recursos hermanos con forma heterogénea. |
| **`writes.served` / `writes.withheld`** | `0` / `0` | La sesión HAR capturada ejecutó exclusivamente operaciones idempotentes de lectura (`GET`), preservando intacto el estado de producción; las `38` mutaciones fueron recuperadas íntegramente por análisis estático del bundle (`all_http_calls.json`). |

Finalmente, REA registra tres **`unknowns` estructurales explícitos** en `ev_4d363865fbaf2caebf91a63a3bda37d75cf6d8e5ffb0ba334b45df7c33efd9b3` (`authorization-model`, `response-semantics` y `state-transition`), los cuales han quedado resueltos mediante la triangulación con el código cliente de primera parte (`03_auth_and_axios.js` — modelo `Bearer` + Better Auth, e invalidaciones de mutación en TanStack Query).
