# ADR-053 · Sensación 100 % App Nativa, Gestos Táctiles, PWA Offline y Shell Progresivo

- **Estado:** Aceptada
- **Fecha:** 2026-11-20
- **Relacionadas:** `ADR-035` (Vidrio falso y recorte RSC), `ADR-041` (PWA y Push), `ADR-050` (Portabilidad sin lock-in), `ADR-051` (Server-First, CSS modular y Cero-Jank), `ADR-052` (Experiencia móvil tipo app nativa y navegación `Explorar`).

---

## Contexto

Tras consolidar la arquitectura *Server-First*, la poda y modularización de CSS y la gobernanza cero-jank (`ADR-051`/`ADR-052`), quedaron cuatro brechas claras para que PitchLab se sienta en iOS y Android exactamente como una aplicación nativa rápida sin sacrificar portabilidad (`ADR-050`) ni seguridad (`Cero-Fuga`):

1. **Latencia percibida y continuidad espacial al navegar:** las fichas de partido, liga, equipo y jugador esperaban el clic completo sin precarga por intención táctil/puntero, carecían de skeletons contextuales (`loading.tsx`), carecían de botón `← Atrás` dedicado y el regreso forzaba siempre `scrollTo(0, 0)` perdiendo la posición en la lista.
2. **Física táctil móvil:** las hojas inferiores (`Explorar`, `Menú de tu cuenta`, `MobileParlaySheet`) dependían solo de botones o `Escape` sin gesto real de arrastre hacia abajo (*swipe-to-dismiss*); en iOS Safari faltaban reglas preventivas de auto-zoom en `<input>` `< 16 px` y `user-select: none` sobre el chrome de app; y faltaba feedback háptico sutil en acciones clave.
3. **PWA instalada «de verdad» sin romper desarrollo local:** el `manifest.ts` aún incluía copy heredado, faltaba ruta pública `/offline` con respaldo de red en producción, indicadores no bloqueantes de desconexión/actualización de SW y soporte nativo para App Badging, Web Share con archivos PNG, Screen Wake Lock en vivo y guía visual de instalación en iOS Safari — todo preservando **100 %** el bloqueo y purga del Service Worker en `localhost`/`127.0.0.1`.
4. **Velocidad profunda en primer pintado y rutas públicas:** el shell RSC inicial (`/app/**`) seguía serializando ~`1,920 KB` (`311` partidos y `771` equipos), listas largas como `/app`, `/app/picks` y `/app/social` montaban demasiados nodos DOM iniciales, y páginas públicas de lectura (`/`, `/resultados`, `/motores`, `/blog/*`, `/legal/*`) forzaban `dynamic = "force-dynamic"` solo por leer cookies en SSR para el CTA de la barra pública.

---

## Decisión

### 1. Navegación «0 ms» y continuidad espacial
- **Prefetch deduplicado por intención (`prefetchRoute(href)`):** expuesto desde `PlatformClientBridge` / `usePlatformActions` con un `Set` acotado (`80` entradas máx.) y disparado únicamente en `onPointerEnter` / `onTouchStart` sobre tarjetas/filas de partido (`HomeMatchCard`, `MatchListRow`, `AstroMatchRow`), encabezados de liga, equipos (`/t/`), jugadores (`/p/`), `PicksFinderView` y navegación principal de `ShellChrome` (nunca precargar listas completas al montar).
- **Skeletons contextuales (`loading.tsx`):** cinco rutas (`[league]/g/[gameSlug]`, `[league]`, `[league]/t/[teamSlug]`, `parlays`, `comparar`) usan `@pitchlab/ui/route-skeletons` con silueta real, tokens `--pl-*`, `0 backdrop-filter` y sin salto de layout.
- **Botón `← Atrás` contextual + restauración de scroll:** `ContextualBackButton` (`>= 44×44 px`, respaldo seguro hacia la liga o `/app` en enlaces directos) en fichas de partido, equipo y jugador. `navigation-helpers.ts` guarda `window.scrollY` por ruta en `sessionStorage` (con `try/catch`, validación de números finitos y tope de `40` entradas) al navegar hacia `/g/`, `/t/` o `/p/`; `ClubShellBridge` restaura esa posición en `popstate`/regreso en lugar de forzar `scrollTo(0, 0)`.
- **View Transitions API progresiva:** `runWithViewTransition` envuelve transiciones de ruta con `document.startViewTransition` únicamente cuando el navegador lo soporta y `!prefers-reduced-motion`, con cross-fade de `140 ms` en `pitchlab-v4.css` (`0 KB` de dependencias).

### 2. Física táctil 100 % app móvil (iOS + Android)
- **Swipe-to-dismiss en GPU (`useSheetSwipeDismiss`):** hook reutilizable (`packages/ui/src/platform/components/use-sheet-swipe-dismiss.ts`) con función pura `shouldDismissSheetSwipe` (umbral de distancia o velocidad hacia abajo), conectado al tirador `.pl-bottom-sheet-handle` y cabecera táctil de **`Explorar`**, **`Menú de tu cuenta`** y **`MobileParlaySheet`**, animando exclusivamente `transform: translateY(...)` y devolviendo a `0` con resorte si no cruza el umbral.
- **Reglas táctiles y anti-zoom (`pitchlab-v4.css`):** `overscroll-behavior-x: none` global, `overscroll-behavior-y: contain` dentro de hojas/diálogos, `user-select: none` sobre chrome de navegación/botones (conservando selección en prosa, artículos y códigos), anti-zoom iOS Safari (`font-size: max(1rem, 1em)` en controles de texto `< 768 px`), atributos de teclado móvil (`inputMode`, `enterKeyHint`, `autoCorrect="off"`, `spellCheck={false}`), y `scroll-snap-type: x proximity` en tiras de días, ligas y Player Props.
- **Háptica y UI optimista con rollback:** helper seguro `triggerHaptic()` (`navigator.vibrate`, sin error en iOS ni navegadores sin soporte) al añadir/quitar piernas de parlay, sellar picks/parlays, marcar favoritos, dar «me gusta» y copiar enlaces/códigos/CLABE; `toggleWatchlistGame` ejecuta rollback silencioso y mantiene la interfaz a `0 ms`.

### 3. PWA instalada «de verdad» (conservando el bloqueo estricto en desarrollo local)
- **Manifiesto y standalone:** `apps/web/app/manifest.ts` actualiza `name: "PitchLab"` y `display_override: ["standalone", "minimal-ui"]`; `@media (display-mode: standalone)` aplica `env(safe-area-inset-top)` al encabezado superior para Dynamic Island / notch.
- **Protección inamovible en desarrollo local (`sw.js` y `pwa-runtime.tsx`):** en `localhost`, `127.0.0.1`, `[::1]` o `NODE_ENV !== "production"`, el Service Worker sigue desactivado y purga cachés `pitchlab-*` + registros previos automáticamente.
- **Respaldo `/offline` y aviso de actualización (solo producción remota):**
  - Nueva ruta pública `apps/web/app/offline/page.tsx` con recarga automática al volver `online`.
  - `apps/web/public/sw.js` precachea únicamente `/offline` (`pitchlab-offline-v1`) fuera de loopback y lo devuelve **solo** cuando falla la red en una navegación; **prohibido cachear HTML autenticado de `/app`**.
  - `NetworkAndSwBanners` muestra un pill no bloqueante `Sin conexión` (`navigator.onLine`) y un banner discreto `Nueva versión lista · Actualizar` que envía `{ type: "SKIP_WAITING" }` al SW en espera.
- **APIs nativas sin dependencias npm adicionales:**
  - **App Badging (`NotificationInbox.tsx`):** `navigator.setAppBadge(unreadCount)` / `clearAppBadge()`.
  - **Web Share con archivos PNG (`share-ticket-raster.ts` + `PlatformOverlays.tsx`):** prioriza `navigator.canShare({ files })` → `navigator.share({ files })` al compartir boletos con respaldo automático de descarga PNG.
  - **Screen Wake Lock (`LiveMatchCenter.tsx`):** solicita `navigator.wakeLock.request("screen")` únicamente mientras el partido está en vivo y la pestaña visible, liberando al ocultar o desmontar.
  - **Guía iOS Safari (`PwaAndPushSection.tsx`):** tarjeta visual de 2 pasos («Compartir → Agregar a pantalla de inicio») mostrada solo en iOS Safari no instalado.

### 4. Velocidad profunda (Shell en 2 etapas, paginación progresiva, ISR público y consolidación headless)
- **Shell RSC en 2 etapas (`apps/web/src/server/platform-data.ts` + `GET /api/shell/extend`):**
  - **Etapa 1 (SSR inicial):** `splitInitialShellDataset()` envía únicamente partidos `LIVE`, destacados/tipster, hoy y ligas prioritarias de mañana (máx. `52` partidos), omite `parlayCandidates` y filtra `teams` a los clubes presentes en la ventana inicial, reduciendo `slimMemberShell` de **`1,920.0 KB` → `281.5 KB`** (**−85.3 %**).
  - **Etapa 2 (diferida o bajo demanda):** `PlatformClientBridge` solicita `GET /api/shell/extend` vía `requestIdleCallback` (o de inmediato vía `requestFullShell()` al abrir Parlays, Picks, Comparador, calendario o filtros de Inicio). El endpoint valida estrictamente `getViewerAccess()` (`401` sin sesión, `slimVisitorShell` redactado para visitantes y `slimMemberShell` para socios — `Cero-Fuga` intacto).
- **Paginación progresiva en listas largas (`< 1,500` nodos DOM iniciales):**
  - `/app` (`HomeClubView.tsx`): `INITIAL_HOME_CARDS_LIMIT` baja de `32` → **`14`** partidos iniciales con reseteo automático al cambiar filtros y botón «Ver más partidos».
  - `/app/picks` (`PicksFinderView.tsx`): `INITIAL_VISIBLE_PICKS` baja de `30` → **`12`** picks iniciales (paso `+16`).
  - `/app/social` (`CommunityClubView.tsx`): `FEED_PAGE` baja de `20` → **`8`** publicaciones iniciales conservando paginación contra servidor.
- **Caché real / ISR independiente de proveedor en rutas públicas (`ADR-050`):**
  - Se retira `export const dynamic = "force-dynamic"` y las lecturas de cookies SSR de `/`, `/resultados`, `/motores`, `/blog`, `/blog/[slug]`, `/blog/categoria/[categoria]` y `/legal/*`, reemplazándolas por `export const revalidate = 300` (dinámico de portada/resultados/listado blog) y `export const revalidate = 3600` (motores/artículos/legal), más cabeceras HTTP estándar `Cache-Control: public, max-age=0, s-maxage=..., stale-while-revalidate=...` en `next.config.mjs` (solo fuera de `dev`).
  - `PublicNavBarClient` consulta el endpoint ligero `GET /api/public/session` (`{ authenticated: boolean }`, `Cache-Control: private, no-store`) únicamente en cliente para actualizar el CTA a «Ir a la app» sin contaminar HTML cacheado.
  - `/precio` conserva `force-dynamic` de forma deliberada porque renderiza referencia SPEI y estado de pase específicos del socio autenticado.
- **Consolidación headless (`@base-ui/react` vs `@heroui/react`) y Web Vitals agnósticos:**
  - `packages/ui/src/components/ui/badge.tsx` migra a `<span>` nativo sin `@base-ui/react` (`merge-props`/`use-render` eliminados de `sports.tsx`, `primitives.tsx` y `market-pulse.tsx`).
  - **Hoja de ruta de retiro total de `@base-ui/react` (~120–150 KB JS estimados):** quedan únicamente 5 wrappers (`toggle-group.tsx` sin usos en producción, `dialog.tsx`/`tabs.tsx` solo en D1 legado/Storybook, `tooltip.tsx` en `sports.tsx` y `button.tsx` en `primitives.tsx`/D1). Cuando se archive D1 de Storybook, los 5 archivos pueden reemplazarse por HTML nativo (`popover` / `<dialog>` / `<button>`) y `@heroui/react` (ya presente en 10 componentes activos), desinstalando `@base-ui/react`.
  - **Telemetría Core Web Vitals (`ADR-050`):** toda medición futura de `LCP`, `INP` y `CLS` usará `PerformanceObserver` nativo o `web-vitals` reportando por `navigator.sendBeacon("/api/analytics/vitals")` únicamente cuando el socio otorgó `analyticsConsent === true`, sin SDKs propietarios de Vercel/Cloudflare/Google.

---

## Alternativas descartadas

1. **Instalar librerías externas de gestos/animaciones (`framer-motion`, `vaul`, `next-pwa`):** añaden decenas de KB de JS cliente y acoplamiento de build cuando Pointer Events + `transform`, View Transitions nativa y un `sw.js` propio de 120 líneas cubren 100 % de los requisitos con `0 KB` extra.
2. **Cachear HTML de `/app` en `sw.js` para «modo offline total»:** violaría la frontera `Cero-Fuga` y arriesgaría servir datos de un socio previo o cuotas vencidas; solo se precachea `/offline` y activos inmutables fuera de loopback.
3. **Cachear públicamente `/precio`:** contiene `speiReferenceCode`, estado de transferencias y `activePass` por cuenta; mantenerlo dinámico evita cualquier riesgo de fuga entre sesiones.

---

## Consecuencias

- **Positivas:** `-85.3 %` en payload RSC inicial del shell (`1,920.0 KB` → `281.5 KB`), listas principales bajo `< 1,500` nodos DOM, transición percibida inmediata con prefetch + 5 skeletons + View Transitions + restauración real de scroll, gestos táctiles nativos en hojas inferiores, PWA completa con `/offline` sin romper desarrollo local y rutas públicas cacheables en cualquier CDN/reverse proxy estándar.
- **Trade-offs:** las vistas que requieren el catálogo completo de 8 días (`/app/parlays`, `/app/picks`, `/app/comparar` o cambiar a días lejanos en `/app`) dependen de la carga en segundo plano o bajo demanda de `/api/shell/extend` (mitigado disparando `requestFullShell()` tanto en `requestIdleCallback` como al montar/interactuar).
