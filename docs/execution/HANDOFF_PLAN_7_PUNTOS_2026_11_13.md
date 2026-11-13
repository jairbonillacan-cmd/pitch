# Handoff · Plan de 7 puntos (Récord, Insignias, Comunidad, Parlay del día, Mercados v3.2, Antes del partido, @handle sugerido)

> **Fecha:** 2026-11-13
> **Rama:** `mi_record_backend_api` (basada en `e3803e1`)
> **Estado general:** Punto 1 (**Mi récord**) completado al 100 % en código, migración, API, UI, stories, pruebas unitarias y build (`≤ 319 kB` en toda la app); puntos 2 al 7 documentados con diseño cerrado (sesión de preguntas Q1–Q23) listos para ejecutar en orden al retomar en casa.

---

## 1. Lo que ya se hizo en esta sesión (Punto 1 · Mi récord)

### 1.1. Estadísticas compartidas y motor de privacidad (`@pitchlab/ui`)
- **Archivo:** `packages/ui/src/platform/record-stats.ts` (exportado también en `@pitchlab/ui/record-stats` y `@pitchlab/ui`).
- **Qué calcula (`computeRecordStats`):**
  1. Curva de saldo en el tiempo (`curve`, punto por pick cerrado ordenado cronológicamente).
  2. Acierto por liga (`byLeague`), por mercado (`byMarket`: resultado, goles/puntos, ambos anotan, hándicap, doble oportunidad, marcador exacto, otros) y por tipo de pick (`byType`: individual vs parlay).
  3. **Rendimiento** sobre unidades jugadas (`yieldPct`) y **ROI** opcional sobre banca inicial en unidades (`roiOnBankrollPct`, cuando el socio configura su banca privada en MXN).
  4. **CLV promedio** (`avgClvPct`).
  5. **Racha actual** (`currentStreak`) y **mejor racha ganadora** (`bestWinStreak`).
  6. **Momio promedio** (`avgUserDecimal`).
  7. **Mejor mes y peor mes** (`bestMonth`, `worstMonth`).
  - Cero proyecciones futuras de banca.
- **Privacidad (`RECORD_PRIVACY_BLOCKS`, `DEFAULT_RECORD_PRIVACY`, `normalizeRecordPrivacy`, `isShared`, `publicRecordView`):**
  - 4 bloques independientes con interruptor por bloque y por dato individual:
    - `record`: `record`, `hitRate`, `byLeague`, `byMarket`, `streaks` (encendido por defecto).
    - `performance`: `yield`, `roi`, `clv`, `avgOdds`, `extremes` (encendido por defecto, salvo `roi: false`).
    - `bank`: `netUnits`, `curve` (**apagado por defecto**).
    - `history`: `closedPicks` (encendido por defecto).
  - **Invariante estricta:** los montos en pesos (`bankrollStartMxn` y equivalencias MXN) y los picks abiertos **nunca** salen en `publicRecordView` ni en la API pública, aunque el socio encienda todos los interruptores.

### 1.2. Base de datos y endpoints (`@pitchlab/db` + `apps/web`)
- **Migración:** `packages/db/migrations/0017_mi_record_privacidad.sql` + entrada en `packages/db/migrations/meta/_journal.json`:
  - `user_preferences.record_privacy jsonb`
  - `user_preferences.bankroll_start_mxn_centavos integer` (con `CHECK` `NULL` o `1000..1000000000`, es decir `$10` a `$10,000,000 MXN`).
- **Esquema y repositorio:** `packages/db/src/schema.ts`, `packages/db/src/preferences.ts` y `packages/db/src/index.ts`.
- **Preferencias del socio:** `apps/web/app/api/me/preferences/route.ts` acepta y persiste `recordPrivacy` (normalizado con `normalizeRecordPrivacy`) y `bankrollStartMxn` / `bankrollStartMxnCentavos` (`null` para borrar).
- **Récord público de otros socios:**
  - `apps/web/src/server/public-record.ts` (`loadPublicRecord(handle)`): lee `users.public_profile`, `user_preferences` y `journal_entries` selladas del socio; si el perfil o récord es privado devuelve `{ visible: false, settled: 0, view: null }`; si es público devuelve solo lo permitido por `publicRecordView` y nunca expone pesos ni picks abiertos.
  - `apps/web/app/api/u/[handle]/record/route.ts` (`GET /api/u/[handle]/record`, `Cache-Control: private, no-store`).

### 1.3. Interfaz de «Mi récord» (`/app/lab`), Perfil público y Navegación
- **Ruta `/app/lab` conservada** (`apps/web/app/app/lab/page.tsx` importa desde subruta `@pitchlab/ui/record` para cuidar el presupuesto de JS).
- **Renombre en navegación:** «Bitácora» / «Mi bitácora» pasa a **«Mi récord»** (etiqueta corta móvil **«Récord»**) en `ShellChrome.tsx`, `HomeClubView.tsx`, `PlatformOverlays.tsx` y `apps/web/scripts/perf.mjs`. Se mantuvo intacto el valor literal `originType: "Bitácora Propia"` en `social_posts`.
- **Tres pestañas WAI-ARIA subrayadas** (`UnderlineTabs` + `useUrlTab` + `TabPanel` sincronizadas con `?tab=picks|banca|privacidad`) en `BitacoraClubView.tsx`:
  1. **`Picks` (`RecordPicksTab.tsx`):** chips de filtro (`Todos`, `Abiertos`, `Cerrados`), tabla semántica accesible de picks y parlays sellados, apertura de `WinningTicketDialog` en ganados, compartir boleto y bloque «Partidos en vigilancia».
  2. **`Banca y estadísticas` (`RecordBankStatsTab.tsx`):** formulario de banca inicial opcional en MXN con validación `onBlur`/`onInput` y sello explícito *«Siempre privado · Nadie más ve pesos»*, resumen privado de banca actual estimada y ROI, curva de saldo con `<figure>` SVG + `<table>` `sr-only` alternativa, tarjetas de Rendimiento/ROI, CLV/momio promedio, Rachas/mejor y peor mes, y barras de acierto por liga, mercado y tipo de pick.
  3. **`Privacidad` (`RecordPrivacyTab.tsx`):** interruptor maestro («Mostrar mi récord en mi perfil público»), interruptor de ranking («Aparecer en el ranking de Comunidad»), los 4 bloques con interruptor general y desglose dato por dato (`<Switch>` + `<Switch.Content>` + `<Switch.Control>` de `@heroui/react@3.2.7`), y columna lateral con **vista previa en vivo** («Así ven los demás tu récord») alimentada por la misma función `publicRecordView` que usa el servidor.
- **Estilos:** `apps/web/app/record-v2.css` (importado en `apps/web/app/globals.css` dentro de `@layer components`), cero literales hex fuera de `packages/tokens` y cero `backdrop-filter`.
- **Perfil público (`/app/u/[handle]`):** `apps/web/app/app/u/[handle]/page.tsx` hidrata `publicRecord` en SSR y `AnalystProfileClubView.tsx` muestra el récord compartido del socio respetando cada bloque/dato (o el estado honesto «Este socio mantiene su récord en privado»), además de enlazar el botón «Privacidad» del propio perfil a `/app/lab?tab=privacidad`.
- **Storybook:** `packages/ui/src/platform/record.stories.tsx` con 10 stories en oscuro y claro (`Picks`, `Banca y estadísticas` con y sin banca MXN, `Privacidad` pública y privada, y vista previa de perfil ajeno).

### 1.4. Verificaciones ejecutadas
- `node scripts/lint-codebase.mjs` → **OK** (0 colores hex fuera de `packages/tokens`, 0 bloques `catch` vacíos).
- `node scripts/check-no-secrets.mjs` → **OK** (0 secretos).
- `pnpm lint` → **OK** en todos los paquetes.
- `pnpm --filter @pitchlab/ui typecheck` y `pnpm --filter @pitchlab/web typecheck` → **OK**.
- `pnpm --filter @pitchlab/db test` → **OK** (7 archivos, 41 pruebas, migración `0017` aplicada en PGlite).
- `pnpm --filter @pitchlab/ui test` → **OK** (15 archivos, 92 pruebas, incluyendo `record-stats.test.ts` 7/7 y `record-view.test.tsx` 2/2).
- `pnpm --filter @pitchlab/web test` (en serie por PGlite) → **OK** (28 archivos en verde, incluyendo `public-record.test.ts` 2/2).
- `pnpm --filter @pitchlab/web build` → **OK**. **First Load JS ≤ 326 kB en todas las rutas:** `/app/lab` = `311 kB`, `/app/u/[handle]` = `275 kB`, `/app` = `265 kB`, máximo global = `319 kB` (`/app/account`).
- **Nota sobre E2E (`apps/web/e2e/mi-record.spec.ts`):** en la corrida previa falló únicamente el clic del `<Switch>` porque en `@heroui/react@3.2.7` `<Switch.Control>` necesitaba ir envuelto en `<Switch.Content>` (`SwitchButton`) para emitir `role="switch"` y manejar eventos de puntero/teclado. Ya quedó corregido en `RecordPrivacyTab.tsx`, verificado en `record-view.test.tsx` y actualizado en `mi-record.spec.ts`; al retomar en casa basta correr `pnpm --filter @pitchlab/web build && pnpm --filter @pitchlab/web exec playwright test e2e/mi-record.spec.ts` para confirmar `2/2` en escritorio y móvil.

---

## 2. Lo que falta por hacer al retomar en casa (Puntos 2 al 7 + despliegue)

### Verificación rápida al abrir en casa (2 min)
1. `git pull origin mi_record_backend_api`
2. `pnpm --filter @pitchlab/web build`
3. `pnpm --filter @pitchlab/web exec playwright test e2e/mi-record.spec.ts` (confirmar `2/2` en `desktop` `1440px` y `mobile` `390px` tras el fix de `<Switch.Content>`).

### Punto 2 · Insignias (Badges)
- **Reglas cerradas (Q6–Q9):**
  - **10 insignias en 4 familias:**
    1. *Precisión:* «Ojo fino» (`≥ 60 %` de acierto en `30+` picks cerrados), «Contra el cierre» (CLV medio `> 0` en 30 días con `20+` picks cerrados), «Especialista {liga}» (`≥ 55 %` en `20+` picks cerrados de esa liga).
    2. *Constancia:* «Racha 5» (`bestWinStreak ≥ 5`), «Bitácora al día» (4 semanas seguidas sellando al menos 1 pick antes del inicio).
    3. *Comunidad:* «Voz útil» (`25+` «me gusta» acumulados en análisis con pick), «Lectura del partido» (acertar el pick más votado del partido), «Embajador» (`5+` referidos con pago).
    4. *Origen:* «Fundador beta», «Tipster verificado».
  - **Antigüedad:** «Socio 30 días», «Socio 90 días», «Socio 1 año».
  - **Top:** «Top 10 semanal», «Top 10 mensual» y contador de semanas en el Top 10.
  - **Prohibiciones:** cero insignias por volumen de apuestas, cero rachas por entrar diario y cero premios monetarios o materiales.
  - **Privacidad y despliegue:** cada insignia hereda la privacidad del bloque de donde sale (`Precisión` / `Racha 5` requieren el bloque correspondiente visible en `RecordPrivacy`). El socio elige hasta **3 destacadas** en su perfil (`AnalystProfileClubView`) y la **1.ª** aparece junto a su nombre en publicaciones de Comunidad (`CommunityClubView`).
- **Archivos a crear/tocar:** `packages/ui/src/platform/badges.ts` (+ subruta `@pitchlab/ui/badges`), migración `0018_insignias_destacadas.sql` (`featured_badges jsonb` en `user_preferences`), `/api/me/preferences`, `AnalystProfileClubView.tsx`, `CommunityClubView.tsx`, stories en oscuro/claro y pruebas unitarias.

### Punto 3 · Comunidad
- **Reglas cerradas (Q10–Q13):**
  1. **Pestaña Ranking semanal (`7d`) y mensual (`30d`)** en `CommunityClubView.tsx` ordenable por **% de acierto** o **CLV** (además de saldo), con muestra mínima de picks cerrados (p. ej. `15` picks) y estricto opt-in (`showInRanking` + `publicRecordVisible`), respaldada por endpoint `/api/social/ranking` y respaldo honesto marcado `Ejemplo`.
  2. **«Copiar a mi parlay»** en tarjetas de publicación (`PostCard` en `CommunityClubView.tsx`) cuando el post tiene un pick abierto adjunto (`addPickToParlay`), conviviendo con «Copiar a mi récord».
  3. **Consenso del partido:** cruzar votos de la comunidad (`match_votes` de migración `0016` + picks publicados) contra la probabilidad del modelo v3.2.
  4. **Seguir ligas y equipos** para filtrar el feed (`Para ti` / `Siguiendo`), persistido en preferencias/`localStorage`.

### Punto 4 · Parlay del día y generador personal
- **Reglas cerradas (Q14–Q16):**
  1. **Parlay oficial del día** determinista por estilo de riesgo:
     - `Conservador`: 2–3 selecciones con `p ≥ 70 %`.
     - `Medio`: 3–4 selecciones con `p ≥ 55 %`.
     - `Arriesgado`: 4–6 selecciones.
     - Probabilidad combinada y momio justo (`1 / p`), cero selecciones contradictorias.
     - Visible en **Inicio (`/app`)** y calificado automáticamente en **Resultados (`/app/historial`)**.
  2. **Generador personal arriba en `/app/parlays`** (`ParlayBuilderClubView` en `ParlayAndQuantViews.tsx`): elegir 2–6 picks, estilo de riesgo y filtro por liga / deporte / todo en una barra rápida.

### Punto 5 · Mercados nuevos derivados del motor v3.2
- **Reglas cerradas (Q17–Q19):**
  - Etiqueta visible **«derivado del motor»** (sin jerga interna como `Poisson` o `Dixon-Coles` en la UI).
  - **Fútbol** (usando `buildDixonColesScoreMatrix` de `@pitchlab/spacetime` con `dixonColesParams`):
    - Goles por equipo (local/visita más/menos de `0.5`, `1.5`, `2.5`).
    - 1.er tiempo (`1X2` al descanso y goles 1T con fracción de tasa `λ` de primera mitad).
    - Marcador exacto ampliado al **top 6**.
  - **NFL** (usando `normalCdf` de `@pitchlab/spacetime` con `DEFAULT_NFL_SIGMA_MARGIN = 13.5` y `DEFAULT_NFL_SIGMA_TOTAL = 10.5`):
    - Hándicap (`spread`) y totales de puntos derivados cuando el panorama v3.2 solo trae ganador.
  - **Prueba obligatoria de paridad:** test unitario que verifique que la matriz reproduce al decimal los mercados `1X2` y `totals` publicados por v3.2 (`|Δ| < 1e-9`).
  - **UI en la ficha del partido (`CoreMatchViews.tsx`):** agrupar la pestaña `Mercados` en tarjetas (`Resultado · Goles · Hándicap · Marcador · 1er tiempo`) resaltando la opción más probable de cada una.

### Punto 6 · «Antes del partido»
- **Reglas cerradas (Q20–Q21):**
  - Módulo activo horas antes del saque inicial en la ficha del partido (`CoreMatchViews.tsx` / `packages/ui/src/platform/club/match/`):
    - Bajas/lesiones reportadas disponibles en el contexto del partido.
    - Pick principal y probabilidad **congelados 1 h antes del inicio** (con sello horario claro).
    - Integración con la encuesta de la comunidad (`MatchCommunityPoll`).
    - Botón opcional de alerta en la campana **60 min antes** (`toggleWatchlistGame`).
    - Ranura preparada para «Alineación confirmada» que **solo** se enciende cuando exista fuente real verificada (nunca inventada).

### Punto 7 · Usuario (`@handle`) sugerido al crear cuenta
- **Reglas cerradas (Q22–Q23):**
  - En el paso 2 de `/signup` (`SignupSurfaceV4.tsx`), mostrar **3 sugerencias libres** de `@handle` derivadas del nombre o correo.
  - Verificadas en servidor mediante endpoint `GET /api/handles/suggest?name=...&email=...` apoyado en `suggestHandle` / consulta de disponibilidad en `@pitchlab/db` (`handles.ts`).
  - Al tocar un chip se rellena el campo en un toque, manteniendo el input editable.

### Antes de desplegar a producción (recordatorio operativo)
- Ejecutar `scripts/migrate-prod.ps1` en la rama `main` de Neon para aplicar las migraciones pendientes (**`0016_votos_partido`** y **`0017_mi_record_privacidad`**, más las que se sumen en el punto 2) antes de desplegar en Vercel.
