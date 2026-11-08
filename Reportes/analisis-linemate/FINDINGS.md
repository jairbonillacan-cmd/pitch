# Linemate.io — Análisis con REA (registro de hallazgos)

Fecha: 2026-11-08 · Método: REA `capture_browser_scenario` (Playwright) + extracción de red + análisis estático del bundle + greps dirigidos.
Artefactos: `captures/landing-capture.json` (ev_6f80b2…), `captures/js-analysis.json` (en curso), `app/{index.html, main.1f0201a8.js, config-v3.json}`.

## 1. Arquitectura
- **Frontend**: SPA React (Create React App) — un solo bundle `/static/js/main.1f0201a8.js` (3.36 MB, sin code splitting), CSS `/static/css/main.f806c574.css` (Bootstrap 4.3 + Inter). PWA con `manifest.json` (short_name "LM"). Router: React Router con esquema `/:sport/...` programático.
- **Backend API**: `api.linemate.io` — REST JSON, sin auth para endpoints públicos de lectura; auth por `Authorization: Bearer <Firebase ID token>` para endpoints de usuario.
- **Auth**: Firebase Auth (proyecto `linemate-321320`, appId `1:869193450072:web:66c378da0e41d9d9e5802d`). Opciones: Google OAuth, Apple OAuth, email/contraseña. REST de Firebase `identitytoolkit` (`/v1/accounts:lookup|update|delete`, `/v1/token`) + reCAPTCHA Enterprise.
- **Móvil**: apps iOS `id1635246793` y Android `com.linemate`; suscripciones via IAP nativo (App Store / Play Store).

## 2. Modelo de datos (API pública GET, sin auth)
- `GET /api/configuration/v3?platform=web` — config global: features por región, 45 ligas, lista de operadores por país/estado, ofertas de afiliado, publicidad, orden de afiliados, eventos a loggear (Braze/GA).
- `GET /api/localization/v1/getCurrentLocation` — geolocaliza por IP → `{country:{code}, region:{code}}` (MX-PUE en la prueba).
- `GET /api/{sport}/v3/games/current|upcoming?recordType=REGULAR&format=daily` — calendario de juegos (~150–425 KB).
- `GET /api/{sport}/v3/teams` — equipos (1.7 MB NFL; IDs UUID, SRID SportsRadar).
- `GET /api/{sport}/v1/trends/straights?limit&lineTypes=MAIN|ALTERNATE&outcomes=OVER,UNDER,YES,NO,COVER&trendTypes=PLAYER|TEAM&signals=...&preview=true` — motor de tendencias: picks con jugador/equipo, mercado (OVER_UNDER, p. ej. RUSHING_YARDS_1Q), odds por sportsbook (prizepicks, underdog, draftkings, betmgm…) con valores current/opening/alternates, y señales: RECENT_FORM (x/y), HEAD_TO_HEAD, HOME_SPLIT, AWAY_SPLIT, INJURY_IMPACT, OPPONENT_RANK (rank del rival), WEATHER, STARTING_PITCHER_IMPACT, SPLITS.
- `GET /api/{sport}/v1/trends/parlays?limit&parlayType=SAME_GAME|CROSS_GAME&lineTypes=MAIN` y `/preview` — parlays SGP/multi-juego con legs y hit-rate de cada leg.
- `GET /api/{sport}/v1/trends/straights/trending` — trending.
- `GET /api/{sport}/v1/discovery/preview/straights?groups=SAFE,RISKY,FIRST_Q` — descubrimiento agrupado.
- `GET /api/{sport}/v4/players/{uuid}` y `/v4/players/{uuid}/games?sortingOrder=DESC&timeframe=RANGE_2024_2026` — perfil y game logs (preload on hover).
- `GET /api/{sport}/v3/teams/{id}/rankings|injuries` — rankings defensivos e lesiones.

## 3. Endpoints autenticados
- `GET /api/users/v1/current`, `POST /api/users/v1/update`, `POST /api/users/v1/delete`; `/api/users/v1/current/emailSubscriptionStatus` (Bearer).
- `GET /api/payment/v1/portal` → redirect a Stripe Billing Portal. `GET /api/payment/v1/checkout?id={plan}&origin&clientReferenceId&promotionCodeId` → `{redirect}` a Stripe Checkout ("Linemate partners with Stripe").
- `POST /api/betslip/v1/operatorLinks` `{operator, operatorOutcomeData, location}` → deep links iOS/Android/web del sportsbook (tracking de afiliado). `POST /api/betslip/v2/details` `{operators, location}` → detalles/CTA por operador.
- `POST /api/imageAnalysis/v1?preferredProviders&supportedActions` `{base64}` — análisis de capturas de pantalla con IA para detectar apuestas/tendencias.

## 4. Cómo opera (producto)
- **Freemium**: Free ($0) muestra tendencias diarias + hit rates básicos. **Linemate+**: US$14.99/mes o US$59.99/año (anual rebajado de US$149.99) desbloquea todas las señales, análisis completo, lineups/injuries/weather, parlays exclusivos, filtros avanzados y vista de odds configurable. Trial gratis ("Start free trial" → /signup?origin=/pricing; textos de "trial still active").
- **Paywall** por client-side gating + flags en `users/v1/current`; ruta `/paywall` redirige a `/pricing`.
- **Monetización**:
  1. Suscripción Linemate+ (Stripe web / IAP móvil).
  2. **Afiliación de sportsbooks**: ofertas de registro por estado/provincia (`affiliateOffers` en config, links de tracking `linemate.gdcgroup.io/go/...`), `affiliateOrder` prioriza prediction markets: polymarket, novig, kalshi, betrpicks, sleeper, underdog… Deep links vía `/api/betslip/v1/operatorLinks`.
  3. Publicidad regional (`advertising` por estado).
- **Programa de referidos**: FirstPromoter (`fpr.js`), página `/affiliate`.
- **Betslip**: el usuario arma su slip; el botón abre el sportsbook con la línea pre-cargada (operatorOutcomeData).
- **Compliance**: por ubicación IP + selector manual de estado (`locationServices: US, CA, AU`); operadores y ofertas filtrados por jurisdicción (p. ej. estados sin betting legal solo tienen pick-'em: prizepicks, underdog, novig, kalshi…). Consentimiento propio (profiles STRICT_OPT_IN/NOTICE, GPC respetado), CookieConsent.
- **Telemetría**: Amplitude (EU+US), Google Tag Manager/GA, Facebook Pixel, Braze (eventos: checkout_tapped…), AppsFlyer (atribución + OneLink), Sentry, reCAPTCHA Enterprise.
- **Integraciones embebidas**: Polymarket embed (`embed.polymarket.com/sports`), widgets Kalshi — hub de prediction markets.
- **Deportes/ligas (config)**: NFL, NCAAF, AFL, NRL, NHL, NBA, WNBA, NCAAB, MLB + ~35 ligas de fútbol (EPL, LaLiga, Serie A, Bundesliga, Ligue 1, Liga MX, MLS, UCL, Mundial…). Deportes base del bundle: ["nfl","nba","epl","mlb"] + resto via config.

## 5. Rutas web
- Públicas: `/:sport` (home con matchups, cheatsheets 100%-hit, herramientas destacadas), `/:sport/trends`, `/:sport/players/:slug--:id/profile`, `/:sport/cheatsheets/{recent-form|versus-opponent|home-away-games|first-quarter|first-half|alternate-lines|team-form|unders-only|:prop}`, `/:sport/tools/{injury-impact|starting-lineups|starting-pitchers|opponent-defensive-rank|weather-report|standings|props|stats}` (requieren login), `/pricing`, `/download`, `/glossary`, `/privacy`, `/terms`, `/responsible-gambling`, `/support`, `/affiliate`, `/bonuses`, `/picks`, `/generate-trend` (genera imágenes de tendencias por trendId), `/stats/`, `/odds/` (SEO), 404 con CTA.
- Auth: `/login`, `/signup`, `/password-reset`, `/verify-email`, `/authentication/action` (Firebase action handler), `/authentication`.
- Cuenta: `/profile`, `/preferences`, `/manage-subscription`, `/success`, `/paywall`→`/pricing`.

## 7. Cabeceras de cliente (API)
Sin API key: `linemate-client-platform=web`, `linemate-client-locale=en`, `linemate-client-version`, `linemate-client-build`, `linemate-client-country` + CORS `origin: https://linemate.io`. Autenticación de usuario solo vía `Authorization: Bearer <Firebase ID token>`.

## 8. Evidencia / limitaciones
- Capturas REA (`capture_browser_scenario`, provider `rea-playwright-browser-scenario`, Chromium 156 headless): landing (ev_6f80b2…, 459 eventos/91 transacciones), trends-tools, login-pricing, pick-detail (player profile), tools-bonuses, unlock-signup, cheatsheet. Árboles de accesibilidad por paso; pantallas en `captures/screens/`.
- Análisis estático REA del bundle (`analyze_javascript_application` sobre `app/`): el worker agotó 1 GiB de heap (source-unavailable por resource constraint, ev_ parcial) y un reintento con 4 GiB alcanzó el deadline de 900 s; intento final en curso con 2700 s (`captures/js-analysis-final.json`). El inventario de rutas REA quedó parcial; los hallazgos de bundle provienen de greps dirigidos sobre `app/main.1f0201a8.js` (sha256 4d269e33…) y de las capturas dinámicas.
- No autenticado: los flujos internos de cuenta/checkout (sesión real de Stripe) no fueron observados, solo sus llamadas y parámetros en código. El gating server-side completo (preview=true vs. datos plenos) no fue verificado con cuenta de pago.
- No se observó en runtime: betslip real, imageAnalysis, chat AI (gated por login).
- Datos apuntan a Sportradar como proveedor deportivo (SRID/SRGUID en jugadores y equipos), Sleeper para proyecciones (sleeperId, projectionId), y odds agregadas por operador (prizepicks, underdog, draftkings, betmgm, fanduel, caesars, polymarket, kalshi…).
