# 02 — Arquitectura Serverless, Enrutamiento Next.js, Autenticación Firebase/MongoDB, Economía de Pick Energy y Suscripciones

> **Objetivo Auditado:** `https://www.pickbot.mx/` (`dpl_7NUCdW69BaU9CMQePVhfQtRBwC3n`)  
> **Motor Forense:** REA (`reverse-engineer-anything`, **49 registros `ev_*` retenidos**)  
> **Referencias Cruzadas:** [01-executive-summary.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/reports/01-executive-summary.md) · [05-evidence-register.md](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/reports/05-evidence-register.md) · [rea-evidence-summary.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/rea-evidence-summary.json)

---

## 1. Infraestructura Edge, Despliegue en Vercel y Cabeceras HTTP (`[OBSERVADO]`)

Las 20 capturas de escenario de navegador ejecutadas por REA (`ev_2448975c...` a `ev_58ce3728...`) confirman que `https://www.pickbot.mx/` opera íntegramente sobre **Vercel** ejecutando **Next.js App Router** empaquetado con **Turbopack** ([turbopack-53868f62491e71f2.js](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/javascript/route-chunks/turbopack-53868f62491e71f2.js)).

| Atributo de Infraestructura | Valor / Firma Observada | Clasificación | Evidencia Fuente |
|---|---|---|---|
| **Plataforma Edge / Serverless** | `server: Vercel`, `x-vercel-id: cle1::iad1::...` y `sfo1::iad1::...` (nodos de borde en Cleveland/San Francisco enrutando funciones dinámicas `/api/*` a la región de cómputo **`iad1` — AWS `us-east-1` N. Virginia**). | `[OBSERVADO]` | [01-home-scenario-capture.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/captures/01-home-scenario-capture.json), [19-soporte-and-match-details-capture.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/captures/19-soporte-and-match-details-capture.json) |
| **Identificador de Despliegue (`dpl`)** | Todos los chunks JS/CSS e imágenes locales llevan `?dpl=dpl_7NUCdW69BaU9CMQePVhfQtRBwC3n` (protección *Skew Protection* de Vercel). | `[OBSERVADO]` | [scripts-index.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/javascript/scripts-index.json) |
| **Origen de Scaffolding UI** | `<meta name="generator" content="v0.app"/>` presente en el `<head>` global de todas las rutas SSR/prerenderizadas. | `[OBSERVADO]` | [01-home.html](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/captures/01-home.html), [09-privacidad-document.html](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/captures/09-privacidad-document.html) |
| **App Móvil Compañera (iOS)** | `<meta name="apple-itunes-app" content="app-id=6776936420"/>` (Smart App Banner de Apple App Store) + soporte de suscripción móvil en `/api/auth/me` (`mobileSubscription`, `subscriptionProvider`). | `[OBSERVADO]` | [01-home.html](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/captures/01-home.html), [21-authenticated-endpoints-redacted.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/21-authenticated-endpoints-redacted.json) |
| **Caché RSC y Prerenderizado** | Rutas estáticas (`/`, `/picks`, `/privacidad`, `/terminos`, `/soporte`) devuelven `x-nextjs-prerender: 1`, `x-nextjs-stale-time: 300`, `x-vercel-cache: HIT` y `vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch`. | `[OBSERVADO]` | [17-leaderboard-export-pickbot30d-soporte-capture.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/captures/17-leaderboard-export-pickbot30d-soporte-capture.json) |
| **Política CORS y HSTS** | `strict-transport-security: max-age=63072000` (2 años) y `access-control-allow-origin: *` en documentos prerenderizados y assets. | `[OBSERVADO]` | [17-leaderboard-export-pickbot30d-soporte-capture.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/captures/17-leaderboard-export-pickbot30d-soporte-capture.json) |
| **Analítica y AdTech** | **Vercel Web Analytics** (`/_vercel/insights/script.js` + beacon `/_vercel/insights/view`) y **Google Tag Manager / Google Ads Conversion** (`https://www.googletagmanager.com/gtag/js?id=AW-18023655475` + `googleadservices.com/pagead/conversion/18023655475/`). | `[OBSERVADO]` | [01-home-export-web-scripts.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/captures/01-home-export-web-scripts.json), [16-infra-and-pickbot-30d-capture.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/captures/16-infra-and-pickbot-30d-capture.json) |

---

## 2. Mapa Completo de Enrutamiento Next.js App Router (`[OBSERVADO]`)

Mediante la combinación de cabeceras `x-matched-path`, payloads RSC (`?_rsc=...`), el análisis estático REA `javascript-routes` (`ev_7c9334c3066ed409814c2e91851554c1d48cef96ee261141b40d2d3957afa408` y `ev_bd519a4f63f5a7493b25b5047bebb616128a3cb740a5bada108af02f478a0441`) y la decompilación de los 51 chunks JS, se reconstruyó el árbol completo de **24 rutas de aplicación** de PickBot:

### 2.1 Rutas Principales, Sociales, Legales y Dinámicas

| # | Ruta (`x-matched-path`) | Tipo Next.js | Acceso Real | Chunks Principales Asociados | Propósito Funcional y Comportamiento (`[OBSERVADO]`) | Captura / Screenshot |
|---:|---|---|---|---|---|---|
| 1 | `/` | Prerender (`HIT`) | Público + Auth | `01e832ac972c5620.js`, `edabb558bc566d6c.js`, `f9c2a762374fe321.js` | **Tablero maestro de Mercados (`Mercados`):** selector de deportes/ligas, filtro por fecha, selector de estrategia, tarjetas de partidos con badge de picks generados, vista embebida de detalle de partido (`Pulso de la comunidad`, `Análisis PickBot`, `Simulación`, `Ver momios`, `Comunidad`). | [01-home.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/01-home.png) |
| 2 | `/picks` | Prerender (`HIT`) | Público (UI) / Auth (Build) | `e62978f1d163b3ba.js`, `b297d412266b6464.js`, `edabb558bc566d6c.js` | **Creador de Jugadas con IA (`Pick Builder`):** asistente de 3 pasos (`1. Partidos` -> `2. Jugada` [`single` o `parlay` de 2–6 selecciones, riesgo `conservador`/`balanceado`/`agresivo`] -> `3. Revisar`) que ejecuta `POST /api/bets/build` (`Costo: 2 picks`). | [02-picks.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/02-picks.png) |
| 3 | `/rendimiento` | Dinámico / CSR | Público | `cb5b69c89a2e494c.js`, `e28be9743872cf14.js` | **Auditoría Pública de Rendimiento (`Track Record`):** KPIs de unidades, ROI, % de acierto, momio promedio, gráfica acumulada diaria, desglose por liga/hora, curva de calibración y exportación CSV (`/api/rendimiento/export`). | [03-rendimiento.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/03-rendimiento.png) |
| 4 | `/estrategias` | Dinámico / CSR | Público + Auth | `d2bd7b725bbeda1b.js`, `e28be9743872cf14.js` | **Laboratorio y Comunidad de Estrategias:** constructor visual con auto-etiquetado NLP de ligas/mercados, hasta 6 condiciones numéricas (`edge_pp`, `est_prob`, `implied_prob`, `odds`), preview en vivo (`350ms` debounce) y ranking Top-50 de estrategias públicas (7 días). | [04-estrategias.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/04-estrategias.png) |
| 5 | `/estrategia/[token]` | Dinámico (`SSR/CSR`) | Público | `ac282bd7cb74dc3b.js`, `9f3bf131c0c314ee.js` | **Vista de Estrategia Compartida:** carga `/api/strategies/shared/[token]` (ej. `691d418b0b53b755e4` *"Favoritos Sólidos — Fútbol, Béisbol"*) + `/api/rendimiento/preview`, mostrando ROI de 30 días (`+23.8%`, `66.7%` win rate) y botón *"Guardar en mis estrategias"*. | [14-shared-strategy.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/14-shared-strategy.png) |
| 6 | `/clasificacion` | Dinámico / CSR | Público | `46d33aee8f2857f7.js` | **Leaderboard de Usuarios:** tabla de clasificación por ROI (`7d`, `30d`, `all`) con medallas Top-3, récord `G-P-Push`, picks decididos y enlace al perfil público de cada usuario. | [05-clasificacion.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/05-clasificacion.png) |
| 7 | `/feed` | Dinámico / CSR | Público (`global`) + Auth (`friends`) | `6d05e03f6d9857e7.js` | **Feed Social (`Actividad`):** pestañas `Global` y `Amigos`; soporta eventos `pick_save` (votos a favor/contra de picks del sistema) y publicaciones multimedia `post` (texto + imagen/video bajo `/api/media/...`), likes, guardados y comentarios. | [06-feed.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/06-feed.png) |
| 8 | `/buscar` | Dinámico / CSR | Público | `5d3ff053c1cadced.js` | **Buscador Unificado:** busca partidos próximos (`/api/markets/matches?scope=upcoming&limit=24`) y perfiles de usuarios por nombre o `@handle` (`/api/users/search?q=...`). | [07-buscar.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/07-buscar.png) |
| 9 | `/amigos` | Dinámico / CSR | Gate UI en cliente | `b1a4fab04b669688.js` | **Ranking entre Amigos (`/api/friends`):** compara el ROI del usuario autenticado (`isSelf: true`) contra las cuentas que sigue en periodos de `7d`, `30d` o histórico. | [11-amigos.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/11-amigos.png) |
| 10 | `/perfil` | Dinámico / CSR | Gate UI en cliente | `dbfeeb57e0254ad3.js`, `f9c2a762374fe321.js` | **Perfil Propio:** pestañas de picks guardados (`/api/bets`), actividad, edición de avatar (`emoji` o foto `256×256`), `@handle`, biografía, código de referido y acceso a `/settings`. | — *(omitida captura directa para cero-PII)* |
| 11 | `/profile/[id]` | Dinámico (`SSR/CSR`) | Público | `ec11f1e503e95a75.js`, `f97f9e3beeabf139.js` | **Perfil Público de Usuario:** consulta `/api/users/[mongoId]` y `/api/users/[mongoId]/follow` (ej. `6ac65ae98c9b95b86171133a` `@jorgemartinez`), mostrando seguidores, seguidos, ROI y picks públicos. | [12-public-profile.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/12-public-profile.png) |
| 12 | `/plan` | Prerender (`HIT`) | Público + Auth | `a5f8094c4c08cf24.js`, `25a9d165fa657b38.js` | **Página de Suscripción PickBot Pro (`\$299 MXN / mes`):** tarjeta de beneficios Pro, integración con Stripe Checkout y portal de facturación Stripe. | [08-plan.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/08-plan.png) |
| 13–17 | `/settings`, `/settings/account`, `/settings/notifications`, `/settings/security`, `/settings/legal` | Dinámico / CSR | Gate UI en cliente | `05d2295083ef64ec.js`, `1e2ca6f8d312a2a8.js`, `460a38ce63931d07.js`, `702ff714edc3e029.js`, `968c97a841ab948b.js`, `fb543dd1c9c685b7.js` | **Centro de Ajustes:** edición de cuenta (`PATCH /api/account`), preferencias de correo transaccional/marketing (`/api/notifications/preferences`), cambio de contraseña Firebase, enlaces legales y eliminación permanente de cuenta (`DELETE /api/account`). | [13-settings.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/13-settings.png) |
| 18–20 | `/privacidad`, `/terminos`, `/soporte` | Prerender (`HIT`) | Público | `61cc43b3d7ad2990.js` | **Páginas Estáticas Legales y Soporte:** Política de Privacidad, Términos de Uso (`5 de junio de 2026`) y centro de contacto (`pickbot.mx@gmail.com`). | [09-privacidad.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/09-privacidad.png), [10-terminos.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/10-terminos.png), [15-soporte.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/15-soporte.png) |
| 21 | `/[conversationId]` *(legacy catch-all)* | Dinámico (`SSR`) | Redirección `307/308` -> `/picks` | — | **Ruta dinámica heredada del chatbot original:** captura cualquier ruta raíz de un solo segmento no declarada (¡incluyendo `/robots.txt` y `/chat`!) y redirige automáticamente hacia `/picks`. | `ev_eefb234a...` ([16-infra-and-pickbot-30d-capture.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/captures/16-infra-and-pickbot-30d-capture.json)) |
| 22–24 | `/admin`, `/admin/users`, `/admin/invitations` *(inferidas por APIs/roles)* | Protegidas por `role: "admin"` | Solo Admin | `f9c2a762374fe321.js`, `e28be9743872cf14.js` | **Capacidades de Administración:** `/api/auth/me` expone `role: "user" | "admin"` y `/api/strategies` devuelve `canEditPickbot: boolean` (permite a administradores editar en vivo las reglas globales de la estrategia maestra `pickbot`). | [04-estrategias-api_strategies.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/04-estrategias-api_strategies.json) |

> [!NOTE]
> **Explicación Forense de la Anomalía `GET /robots.txt -> /picks` (`[OBSERVADO]`):** En la captura `ev_eefb234a86dce6f8456950bb1d651b25590f4234afc07d76192eab355858a596`, la petición a `https://www.pickbot.mx/robots.txt` no devolvió ni un archivo de texto ni un `404`, sino una redirección HTTP a `/picks` (al igual que `/chat` en el walkthrough). Esto demuestra que PickBot evolucionó desde un **chatbot conversacional de apuestas** (como aún delata su `<meta property="og:title" content="Pickbot.mx — Chatbot de picks y análisis de cuotas"/>` y el campo `messagesPerConversation` en `/api/auth/me`) hacia el actual tablero cuantitativo; la ruta dinámica raíz `app/[conversationId]/page.tsx` permaneció montada sin archivo `public/robots.txt`, interceptando cualquier segmento desconocido de primer nivel y redirigiéndolo al constructor `/picks`.

---

## 3. Arquitectura de Identidad Dual (Firebase Auth + MongoDB) y Superficie de Seguridad (`[OBSERVADO]`)

PickBot separa la autenticación criptográfica del almacenamiento de negocio mediante dos sistemas acoplados en cliente ([f9c2a762374fe321.js](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/javascript/route-chunks/f9c2a762374fe321.js)):

1. **Proveedor de Identidad Cliente — Firebase Authentication v12.9.0 (`[OBSERVADO]`):**
   - Proyecto Firebase embebido en el bundle cliente: `projectId: "pickbot-87e95"`, `authDomain: "pickbot-87e95.firebaseapp.com"`.
   - Métodos soportados en el modal de acceso (`Entrar a PickBot`):
     - **Google OAuth** (`GoogleAuthProvider` + `signInWithPopup` / `signInWithRedirect`).
     - **Correo electrónico y contraseña** (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `sendPasswordResetEmail`).
     - **Teléfono celular vía SMS OTP** (`PhoneAuthProvider` + `RecaptchaVerifier` invisible de Firebase).
2. **Sincronización con MongoDB (`POST /api/auth/sync` y `GET /api/auth/me?uid=...`) (`[OBSERVADO]`):**
   - Al completarse `onAuthStateChanged` en el navegador, React envía `POST /api/auth/sync` (respondiendo `{"success": true, "isNewUser": false}`) e inmediatamente consulta `GET /api/auth/me?uid=<firebase_uid>`.
   - El servidor devuelve el documento consolidado de cuenta desde MongoDB, traduciendo el `uid` alfanumérico de Firebase (`28` caracteres) al identificador primario BSON `ObjectId` de 24 caracteres hexadecimales (`mongoId`):

```json
{
  "mongoId": "000000000000000000000000",
  "role": "user",
  "displayName": null,
  "handle": "redacted_user",
  "bio": null,
  "avatarKind": null,
  "avatarEmoji": null,
  "photoURL": null,
  "subscriptionPlan": "gratis",
  "subscriptionProvider": "none",
  "limits": {
    "messagesPerConversation": 10,
    "picksPerMonth": 5,
    "allowedModels": ["fast"]
  },
  "stripeCustomerId": null,
  "mobileSubscription": null,
  "invitation": {
    "access": true,
    "inviteCode": "XXXX-XXXX",
    "inviteCodeRaw": "XXXXXXXX",
    "inviteLimit": null,
    "inviteUsed": 0,
    "inviteRemaining": null,
    "unlimited": true
  }
}
```

### 3.1 Debilidad Arquitectónica Observada: Identidad Pasada por Parámetro Cliente (`IDOR` / Falta de `Bearer` Token) y Gating en Cliente (`[OBSERVADO]`)

Durante la inspección conjunta de [f9c2a762374fe321.js](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/javascript/route-chunks/f9c2a762374fe321.js), [01e832ac972c5620.js](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/javascript/route-chunks/01e832ac972c5620.js), el walkthrough autenticado ([21-authenticated-endpoints-redacted.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/network-schemas/21-authenticated-endpoints-redacted.json)) y las pruebas anónimas en `ev_cbc3003215c32d1934f73b2a1bd3650554bea0953a1ae810f13217f4336a600a`, se verificaron dos hallazgos estructurales de seguridad:

1. **Ausencia de `Authorization: Bearer <idToken>` en las peticiones `fetch` del cliente (`[OBSERVADO]`):**
   En `step_82` del walkthrough autenticado, las cabeceras HTTP reales enviadas por `fetch("https://www.pickbot.mx/api/auth/me?uid=...")`, `GET /api/pick-energy?mongoUserId=...`, `GET /api/pick-energy/unlocks?mongoUserId=...`, `GET /api/bets?uid=...`, `GET /api/feed/saved?uid=...` y `GET /api/friends?period=30d&mongoUserId=...` **no incluyen cookie de sesión de aplicación ni cabecera `Authorization`**. El cliente simplemente adjunta `uid` o `mongoUserId` en la query string o cuerpo JSON. Dado que los `mongoId` de otros usuarios son públicos en `/api/leaderboard`, `/api/feed` y `/api/users/search` (ej. `"id": "6ac65ae98c9b95b86171133a"`), cualquier endpoint que confíe exclusivamente en `mongoUserId` sin verificar un token firmado de Firebase es susceptible a lectura cruzada de estado (*IDOR*). *(En estricto apego a las reglas éticas de esta auditoría, jamás se probó suplantación de IDs de terceros ni mutaciones).*
2. **Exposición Pública íntegra de `pick_set` sin consumir Pick Energy (`[OBSERVADO]`):**
   El flujo oficial en React exige gastar `1` unidad de energía (`POST /api/markets/matches/[eventId]/unlock`) antes de renderizar el pick recomendado, las notas de análisis y la simulación de un partido. Sin embargo, el endpoint de datos `GET /api/markets/matches/[eventId]?sportKey=[sportKey]` **no valida en el servidor si el visitante desbloqueó el partido ni si inició sesión**: devuelve siempre el objeto `pick_set` completo (`bets`, `summary`, `decision_reason`, `entry_condition`, `risk`, `simulation`). El candado de Pick Energy en partidos del tablero opera únicamente como restricción visual en el DOM de React.

---

## 4. Modelo de Monetización: Economía de "Pick Energy", Referidos y Stripe Billing (`[OBSERVADO]`)

La lógica económica completa reside en los módulos `32890` y `39381` dentro de [a5f8094c4c08cf24.js](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/javascript/route-chunks/a5f8094c4c08cf24.js) y en [f9c2a762374fe321.js](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/javascript/route-chunks/f9c2a762374fe321.js):

### 4.1 Constantes Exactas del Motor "Pick Energy" (`module 32890`)

| Constante Exportada | Valor Exacto | Comportamiento Reconstruido (`[OBSERVADO]` & `[RECONSTRUIDO]`) |
|---|---|---|
| `MAX_PICK_ENERGY` | `5` | Tope base de energía recargable mostrado en el indicador superior `⚡ 4/5` ([20-pick-energy-regen-modal.png](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/screenshots/20-pick-energy-regen-modal.png)). |
| `REGEN_CAP` | `5` | La regeneración pasiva por tiempo se detiene al alcanzar `5` unidades (los bonos por invitación pueden superar `5` sin caducar). |
| `REGEN_MS` | `14,400,000` ms | **Exactamente 4 horas (`14,400 s`) por cada +1 pick regenerado**, calculado respecto a `nextRegenAt` en `/api/pick-energy`. |
| `MATCH_UNLOCK_COST` | `1` *(base)* | Costo por desbloquear un partido en UI (`Math.max(1, generated_pick_count)` cuando existen picks publicados). |
| `BUILDER_COST` | `2` | Costo por ejecutar el Creador de Jugadas IA (`POST /api/bets/build`). **Reembolso automático:** si el motor responde `status === "no_bet"`, no descuenta energía. |
| `INVITE_BONUS_ENERGY` | `10` | Al canjear un código de referido (`XXXX-XXXX`) en `/api/invitations/redeem`, **tanto el anfitrión como el invitado reciben `+10` picks permanentes**. |

### 4.2 Catálogo de Planes y Product IDs de Stripe (`module 39381`)

La decompilación del módulo `39381` en [a5f8094c4c08cf24.js](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/explore_pickbot_architecture/pickbot/evidence/javascript/route-chunks/a5f8094c4c08cf24.js) reveló no solo los dos planes activos en `/plan`, sino también **dos niveles intermedios heredados (`principiante` y `esencial`)** junto con sus identificadores exactos de producto en **Stripe Live** y **Stripe Test/Dev**:

| Clave Interna | Nombre Comercial | Estado en UI | Precio Público | Stripe Product ID (`live` / `dev`) | Cuotas Internas (`limits`) | Notas Forenses (`[OBSERVADO]`) |
|---|---|---|---|---|---|---|
| `gratis` | **Gratis** | Activo | `\$0 MXN / mes` | `null` | `messagesPerConversation: 10`, `picksPerMonth: 5` *(regen 4h)*, `allowedModels: ["fast"]` | Plan inicial asignado en `POST /api/auth/sync`. |
| `pro` | **PickBot Pro** | Activo (`/plan`) | **`\$299 MXN / mes`** | **Live:** `prod_U2enelHVVdr9L6`<br/>**Dev:** `prod_U2Z2WtKT5lcFlx` | `messagesPerConversation: 60`, `picksPerMonth: 250`, `allowedModels: ["fast", "enhanced"]` | Aunque la tarjeta comercial anuncia *"Picks ilimitados"* (`unlimited: true` en Pick Energy), el objeto `limits` conserva un tope interno `picksPerMonth: 250` y habilita `"Modo Rápido + Analista"`. |
| `principiante` | *Principiante* | Legacy (oculto en `/plan`) | Legacy | **Live:** `prod_U4UkFwZCraWKEL`<br/>**Dev:** `prod_U4UiJb2ZsXzhgX` | Reconocido por el resolver de planes para suscriptores históricos | Mantenido en el diccionario de Stripe para compatibilidad retroactiva. |
| `esencial` | *Esencial* | Legacy (oculto en `/plan`) | Legacy | **Live:** `prod_U2enSWK2BqKQOR`<br/>**Dev:** `prod_U2Z2jk9pUfSCZp` | Reconocido por el resolver de planes para suscriptores históricos | Mantenido para clientes que contrataron antes de la unificación en un solo plan Pro. |

Además de Stripe Web (`subscriptionProvider: "stripe"`), el esquema de `/api/auth/me` soporta explícitamente suscripciones compradas dentro de la app iOS (`app-id=6776936420`) mediante el subobjeto `mobileSubscription`, evitando doble cobro entre Web e iOS.
