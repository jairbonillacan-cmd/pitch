# Estado del proyecto PitchLab

> **Propósito:** que cualquier sesión retome el trabajo sin reconstruir el contexto. Se actualiza al cerrar cada fase.
> **Última actualización:** 2026-11-13 · **Rama:** `mi_record_backend_api`

## Estado actual

- **F0 (auditoría):** ✅ completa.
- **F1 (spikes y decisiones):** ✅ completa como investigación de escritorio. Las cotizaciones y la confirmación de términos dependen de que el fundador haga los contactos (FD-14).
- **F2 (product blueprint):** ✅ completa, pendiente de revisión del fundador.
- **Decisión 2026-11-08:** datos a US$0 por ahora → `docs/architecture/FREE_DATA_STRATEGY.md` (FD-02 decidida).
- **F3 (arquitectura y ADRs):** ✅ completa y actualizada al 2026-11-13: **38 ADRs aceptadas** (`ADR-001`…`ADR-038`; `ADR-028`…`ADR-038` cubren coexistencia UI, histórico vs `research-only`, pulso de mercado y momios gratuitos, `@pitchlab/db` + `PGlite`, cuentas en 2 pasos + PIN, Stripe REST + Connect Express + CFDI, `Cortex IA` validado, vidrio falso `0 blur` + shell persistente, flujo *Canvas-First* + `Pase PitchLab Ultra`, reputación por `Saldo` y tarjeta 3D + `/i/[code]`) y 8 documentos base de arquitectura. Auditoría del proyecto: `docs/execution/PROJECT_AUDIT_2026_11_13.md`.
- **F3b (preparación de ejecución):** ✅ completa: frontend, contratos, ownership, integración, plan multiagente, quality gates y plantilla de prompts.
- **Pre-MVP para socios:** ✅ implementado originalmente en `feat/pre-mvp` (`docs/product/PRE_MVP.md` y `docs/product/PRE_MVP_DEPLOY.md`). Desde 2026-11-11 ese trabajo vive íntegro en `gemini-reestructura`, la rama que va a producción; `feat/pre-mvp` se eliminó y su PR #1 se cerró como sustituido.
- **D1 diseño base:** ✅ aprobado (2026-11-08, iteración 4). Contrato en `docs/design/DESIGN_SYSTEM.md`, `INTERACTION_PATTERNS.md` y `RESPONSIVE_RULES.md`. Prototipos en `design/d1/`.
- **UI-MAESTRO-V4.1 (paridad 1:1 con `Prototipo Maestro PitchLab`):** ✅ implementada en `gemini-reestructura` (2026-11-10) sobre `PitchLab Spacetime Suite v2.1`: física *Smoked Glass* real sobre obsidiana (`--pl-glass-lens`, `--pl-glass-card`, `.glass-ring` de bisel único), orbes radiales internos por club/motor (`<LensGlowOrbs>`), primitivas compartidas (`MaestroPrimitives.tsx` + `<TopLayerModalDialog>` sobre `<dialog>` nativo), 7 superficies públicas con redacción `Cero-Fuga` SSR + 11 vistas del club con barra flotante rápida colapsable, artefacto canónico archivado en `design/prototipo-maestro/prototipo-maestro-pitchlab.html`, ADRs `ADR-023`…`ADR-026`, visión rectora `docs/product/PLATFORM_VISION_GEMINI_REESTRUCTURA.md` + `docs/product/VISION_REESTRUCTURA_CLAUDE_{DS_UX,QUANT,GROWTH}.md` y guías de handoff en `docs/execution/`.
- **SPACETIME-V3 + datos verificables (ADR-027):** ✅ 2026-11-11 en `gemini-reestructura`: motores Spacetime Suite v3.0 desde `prediction-lab` (`packages/spacetime`), inferencia en servidor con momios reales y vigencia de 72 h, mercados derivados (totales, ambos anotan, hándicaps), cero datos inventados en la UI, contenido de demostración marcado «Ejemplo», herramientas de preview fuera de producción, descarga real de boletos PNG y Liga MX real desde ESPN.
- **UI-SIMPLE (simplificar y pulir la UI de Gemini):** ✅ 2026-11-11 (ver bitácora «UI-SIMPLE»). Prioridad del fundador desde hoy: UI/UX y datos/motores gratuitos antes que cuentas y cobro.
- **LANDING-2 (nueva landing pública y 6 páginas de menú desde el lienzo):** ✅ 2026-11-11 en `gemini-reestructura`: `/` + `/como-funciona`, `/motores`, `/resultados`, `/parlays`, `/comunidad`, `/precio` + redirecciones `308` (`/metodologia`, `/tecnologia`, `/pricing`), `170 kB` First Load JS, `0` `backdrop-filter`, `AxeBuilder` AA y paridad visual 1:1 verificada en oscuro y claro (`1440 px` y `375 px`).
- **LOGIN-2 (nuevo `/login` desde el lienzo):** ✅ 2026-11-11 en `gemini-reestructura`: `next build` y `pnpm e2e` en verde (pruebas 2 y 3 con PIN). Se corrigió en `TopLayerModalDialog` el cierre inmediato de diálogos en desarrollo (StrictMode montaba el efecto dos veces).
- **SIGNUP-2 (`/signup` en dos pasos desde el lienzo):** ✅ 2026-11-11. `SignupSurfaceV4` + `SignupPreviewPanel` (servidor): paso 1 (Google/Apple/correo, sin contraseña ni campo de código), paso 2 (fecha en 3 selectores, regla de 18 años, Términos obligatorio, analítica y novedades opcionales) y «Confirma tu correo» con reenvío cada 30 s. Invitación por `?code=` («Sofía te invitó»). Vista previa «Tu momio»: doble oportunidad del partido principal contra −200 de ejemplo, calculada. E2E 2 actualizada (aviso, correo temporal, normalización y axe en ambos pasos). **Pendiente F4:** guardar fecha, consentimientos con versión y `trial_claim` (hoy `submitSignupDetails` solo deja el objeto en `sessionStorage`); decidir si el paso 2 se pide siempre al volver de Google/Apple o solo la primera vez.
- **PROFILE-2 (perfil `/app/u/[handle]` desde el lienzo):** ✅ 2026-11-11. Récord de 4 cifras (Saldo, Cumplidos, Contra el cierre, Puesto) con helpers puros en `packages/ui/src/platform/profile-stats.ts` (`profileRecord`, `monthlyNetUnits`, `hitRateByLeague`, `calibrationBuckets`, `rankAnalysts`, `analystRank`; `journalRecord` ahora usa `profileRecord`). Pestañas WAI-ARIA en `?tab=`, `VerifiedSeal` y `TipsterVerifiedBadge`, estados propio / ajeno / «Este perfil aún no es público». Perfiles de ejemplo con bitácora determinista que cuadra con su récord (`community-examples.ts`). `JournalEntry.sealedAtIso` para ventanas reales. La API pública y «Editar perfil» se completaron en SESION-PERFIL. **Pendiente F4:** guardar momio de cierre en el journal, piernas del parlay como lista y pantalla «Privacidad».
- **SOCIAL-2 (Comunidad `/app/social` desde el lienzo):** ✅ 2026-11-11. `CommunityClubView`: Para ti · Siguiendo · Consenso · Ranking. Pick adjunto real (`SocialPost.pick`), que se registra en la bitácora; «Copiar a mi bitácora» copia ese pick; se quitaron `copiedCounts`, factores de ventana y la tabla con ROI. Consenso calculado (`community-stats.ts`, mínimo 10 picks; hoy queda vacío con datos reales). Ranking con podio, tabla y tu fila. Móvil con editor en drawer, carrusel del top y tu fila fija. **Pendiente F4:** guardar en servidor publicaciones, me gusta, comentarios y seguidos (hoy viven en el navegador); moderación (reportar y bloquear); decidir si Siguiendo incluye tipsters no seguidos con pick gratis.
- **CUENTAS-1 (cuentas reales listas para encender):** ✅ 2026-11-12.
  - `/app` acepta cuentas de Better Auth además del PIN (`middleware.ts` revisa la cookie de sesión y `app/app/layout.tsx` valida con `getViewerAccess`).
  - Quien no completó el paso 2 regresa a `/signup?paso=2&via=cuenta`.
  - `POST /api/me/signup` (llamado desde `/onboarding`) guarda la fecha de nacimiento y los consentimientos con versión (migración `0004`), da la prueba de 7 días una vez por correo canónico (`trial_fingerprints`) y registra el referido (`referral_grants`, `trial_started`).
  - Turnstile protege `/sign-in/magic-link` con el plugin `captcha` cuando existen `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`.
  - Cerrar sesión también cierra la sesión de la cuenta.
  - El paso 2 pide nombre y usuario (@handle, único, con revisión en `GET /api/handles/check`). La app muestra el nombre, el @usuario, las iniciales y el código de referido de la cuenta (`ViewerIdentity` en `PlatformProvider`); con el PIN siguen los de ejemplo. Las cuentas sin usuario regresan al paso 2 para elegirlo.
  - Pasos del fundador: `docs/product/GUIA_CUENTAS_Y_DESPLIEGUE.md`.
- **NOTIF-1 (notificaciones, Fase 1 sin backend):** ✅ 2026-11-12. Propuesta completa en el artifact «Notificaciones PitchLab».
  - `NotificationBell` (`packages/ui/src/platform/components/NotificationInbox.tsx`) reemplaza a `AlertsDrawer` y a `alertsOpen` del provider. Es un popover bajo la campana en escritorio y una hoja en móvil (reusa `.pl-profile-menu`), con filtros por tipo y grupos Ahora / Hoy / Antes.
  - Avisos derivados en `packages/ui/src/platform/notifications.ts` (con pruebas): inicio en 60 min, resultado final y valor (la casa paga más que la cuota justa), todos solo de partidos vigilados; picks bloqueados o calificados de la bitácora; y cierre de jornada de las ligas favoritas.
  - El contador cuenta solo las no leídas (sin resúmenes, tope «9+»). Lo leído se guarda en `localStorage` (`pl-notif-read-v1`).
  - Stories: `Platform v4 / Notificaciones` (oscuro y claro) y `ClubJornadaConEncabezado`.
  - **Pendiente Fase 2:** tabla `notifications` y `GET/POST /notifications`, ruta `/app/notifications`, ajustes en `/app/account/notifications`, avisos de movimiento de línea (requiere historial de cuotas) y de Cuenta (prueba, pago, referidos).
  - **Pendiente Fase 3:** correo de resumen y push.
- **SESION-PERFIL (confirmación por correo, sesión y perfil):** 2026-11-12.
  - Login y registro confirman el enlace en su propia pantalla y avisan a la pestaña original. El paso 2 guarda perfil, consentimientos y prueba en una transacción que admite reintentos.
  - Login y el paso inicial de registro redirigen cuando ya hay sesión. La barra pública usa la presencia de cookies para mostrar «Ir a la app».
  - El editor de perfil actualiza el nombre, el @usuario y la bio en el encabezado, el perfil y Comunidad. La API pública devuelve solo los campos del perfil. El @usuario anterior deja de resolver.
  - Migración `0005_perfil_y_conexion_x` aplicada en Neon `local-9990`. X queda disponible al configurar ambas claves. Antes del próximo deploy, aplicar `0005` a producción y probar la conexión y desconexión con las claves reales. La foto de perfil sigue pendiente.
  - Verificado en el 9990 con una cuenta `@example.com`: registro y login en dos pestañas, enlace vencido, redirecciones con sesión, cierre desde «Salir» y regreso de «Entrar», edición del perfil sin recargar, autor y enlace actualizados en una publicación de Comunidad, `404` del usuario anterior, `409` por usuario ocupado y X desactivado con `503`. Se revisaron la hoja y el perfil a 1440 y 390 px en ambos temas. La conexión y desconexión de X también se comprobaron con un proveedor simulado.
  - Pasaron 24 pruebas de DB, 20 de web y 20 de UI en serie, los tres chequeos de tipos y el linter. Se ampliaron los tiempos de espera de Vitest por los arranques de PGlite en esta PC.
- **COMUNIDAD-1 (Comunidad compartida en el servidor):** ✅ 2026-11-12.
  - Antes, publicaciones, comentarios, «me gusta» y seguidos vivían en el navegador de cada socio. Ahora, con cuentas, se guardan en Neon y los ven todos los socios. Sin cuentas (PIN de beta) sigue el modo local.
  - Base: migración `0007_comunidad` (tablas `social_likes` y `social_follows`; `social_posts.game_id` opcional y `pick` en JSON). Funciones en `packages/db/src/social.ts`: el récord y el CLV del autor salen de su bitácora sellada, límite de 10 publicaciones y 60 comentarios por hora, texto repetido bloqueado, solo el autor borra y lo moderado se oculta.
  - Rutas: `GET/POST /api/social/posts` (feed, `?author=`, `?following=1`, `?before=`), `DELETE /api/social/posts/[id]`, `POST …/[id]/comments`, `PUT …/[id]/like` y `GET/POST /api/social/follows`. Exigen registro completo y Pase vigente. El servidor vuelve a validar largo y enlaces externos (`apps/web/src/server/social.ts`).
  - Interfaz: el proveedor carga el feed al entrar, al abrir Comunidad y al volver a la pestaña; publica, comenta y da «me gusta» al instante y lo deshace si el servidor lo rechaza (`social-sync.ts`). «Seguir» va al servidor para socios reales; los perfiles de ejemplo siguen en el navegador. Botón para borrar lo propio con confirmación en el renglón. El perfil muestra seguidores y seguidos reales y trae las publicaciones del socio.
  - Verificado en el 9990 con dos cuentas: Lupita publica, Prueba Local la ve, la sigue, le da «me gusta» y comenta; Lupita ve el comentario y el «me gusta» tras recargar; borrar funciona y el servidor rechaza un enlace de Telegram con `400`.
  - **Pendiente:** resuelto en **COMUNIDAD-2** (avisos en la campana, reportes y moderación, paginación contra el servidor y foto de perfil).
- **COMUNIDAD-2 (avisos sociales, moderación, paginación y foto de perfil):** ✅ 2026-11-12.
  - **Migraciones de producción listas sin ejecutar:** `scripts/migrate-prod.ps1` consulta la rama `main` de Neon sin imprimir la cadena, compara `packages/db/migrations` contra `drizzle.__drizzle_migrations` en solo lectura, pide escribir `MIGRAR` y corre `pnpm --filter @pitchlab/db migrate`. Guía actualizada en `docs/product/GUIA_CUENTAS_Y_DESPLIEGUE.md` («Antes de cada deploy»: primero migrar `0005`…`0010`, luego desplegar).
  - **Avisos en la campana (`0008_notificaciones`):** tabla `notifications` (`comment`, `follow`, `like`), avisos al comentar (no a uno mismo), al seguir (solo la primera vez por par de socios) y agrupados por publicación al dar «me gusta» («A @ana y N más les gustó tu publicación»), rutas `GET /api/me/notifications` y `POST /api/me/notifications/read`, y mezcla en `NotificationInbox.tsx` (tipo `comunidad`, clic lleva a publicación o perfil, marca leídos al abrir, carga inicial + `visibilitychange` sin sondeo constante).
  - **Reportes y moderación (`0009_moderacion_comunidad`):** tabla `social_reports` con 4 motivos (`spam_enlaces`, `ofensivo`, `apuesta_riesgosa`, `otro`), sin doble reporte, límite de 20 reportes por hora, ocultamiento automático al llegar a 3 reportantes distintos, menú «Reportar» en publicaciones y comentarios ajenos, y sección «Moderación» en `/app/admin` detrás de `requireAdmin` (ocultar, restaurar, descartar reporte y pausar/reactivar socio con `users.social_pause_enabled`, ocultando su contenido a terceros y bloqueándole publicar/comentar, con bitácora en `social_moderation_logs`).
  - **Paginación «Ver más» contra el servidor:** `loadOlderSocialPosts` en `PlatformProvider` (`?before=<createdAtIso>&limit=30`, `following=1` y `author=`), botón con «Cargando…» que desaparece al agotar resultados manteniendo las publicaciones de ejemplo al final; verificado en `local-9990` con 65 publicaciones sintéticas sin repetidos ni saltos.
  - **Foto de perfil (`0010_avatar_perfil`):** columna `users.avatar_url`, `@vercel/blob@2.8.2` + `sharp@0.35.5`, `POST/DELETE /api/me/avatar` (valida firma binaria `jpeg`/`png`/`webp`, máx. 2 MB, recorta a cuadrado `256×256` WebP, borra el blob anterior y usa uploader sustituible en pruebas), estado «Pronto» sin `BLOB_READ_WRITE_TOKEN`, control en «Editar perfil» y avatar visible con respaldo de iniciales en encabezado, menú de cuenta, Mi cuenta, perfil, publicaciones y comentarios.
  - **Pendiente:** (recorrido en vivo hecho el 2026-11-12, ver INTEGRACION-SEC) correr `scripts/migrate-prod.ps1` antes del próximo deploy y crear el Blob Store (`BLOB_READ_WRITE_TOKEN`) en Vercel cuando se quiera encender la subida de foto.
- **EMAILS-1 (correos con la marca, por Resend):** ✅ 2026-11-12. Paquete `@pitchlab/emails` (React Email, tokens de la landing, 24 plantillas) y envío por Resend con correos programados y cancelables (`apps/web/src/server/mailer.ts`, tabla `scheduled_emails`, migración `0006`). **Conectados (4):** enlace de acceso, bienvenida al terminar el paso 2, y los avisos del día 5 y 7 de la prueba (programados en Resend al registrarse). **Hecho pero sin disparador:** pick calificado (`settleAndNotify`, preferencia `email_pick_results` apagada por defecto y `PUT /api/me/email-preferences`); falta el calificador de picks y el interruptor en Mi cuenta. El resto y qué falta construir antes de cada uno: `docs/architecture/CORREOS.md` (estado en `packages/emails/src/wiring.ts`). **Pendiente:** llamar `cancelTrialEmails` desde el webhook de Stripe (F4), adjuntos en el envío para el CFDI, probar en Gmail/Outlook/Apple Mail y verificar el dominio en Resend.
- **CUENTA-2 (Mi cuenta `/app/account` y enlace corto `/i/[code]` desde el lienzo):** ✅ 2026-11-12. Vista dividida en `AccountReferralsClubView.tsx` (encabezado compartido con avatar y `@usuario` de sesión, `UltraTag` y 4 pestañas WAI-ARIA subrayadas en `?tab=referrals|plan|prefs|cfdi` + `ACCOUNT_TAB_EVENT`) y `packages/ui/src/platform/club/account/{InviteTab,PlanTab,PrefsTab,BillingTab,LazyReferralCard3D,account-helpers}.tsx`. `InviteTab`: `ReferralCard3D` volteable por clic/teclado con respaldo 2D sin WebGL, descarga PNG `1080×1350`, oferta derivada de `MEMBERSHIP_SPEC`, enlace corto `pitchlab.mx/i/{CÓDIGO}`, compartir en WhatsApp/X/`navigator.share`, 5 lugares de embajador (`referralEarnedDays`), lista honesta y `Simulador` aislado tras `allowRoleSimulation`. Ruta pública `/i/[code]` + `opengraph-image.tsx` (`1200×630`, `noindex`, `twitter:card = summary_large_image`) hacia `/pricing/referral`. `PlanTab` + `GET /api/me/plan` (`accessUntil`, `hasActivePaseTotal`), ahorro anual `$1,198` (`annualSavingsMxn`), diálogos `TopLayerModalDialog` y facturas con `Ejemplo`. `PrefsTab`: 6 grupos con índice fijo / fila de chips en móvil, guardado automático (`pl-prefs-v1` en `localStorage` con `try/catch`), aviso inline al intentar quitar la última liga, momio/tema/zona horaria, riesgo/saldo en pesos (`Ejemplo` sin cuentas), alertas y privacidad con `Switch` de HeroUI y pausa de Juego responsable. `BillingTab` sin RFC ni razón social de relleno. Peso de `/app/account`: `401 kB` → `416 kB` First Load JS (`ReferralCard3D` diferida con `React.lazy`). **Pendiente F4 / fundador:** guardar en la base preferencias nuevas, lista de invitados por amigo y aperturas del enlace; conectar cambiar tarjeta, cancelar, reactivar y cambiar de ciclo con Stripe Customer Portal; decidir si pausar la cuenta congela el cobro y si se puede deshacer; rediseñar Facturación (CFDI) con su propio lienzo.
- **INTEGRACION-SEC (seguridad y páginas rotas):** ✅ 2026-11-12. Se fusionaron en `gemini-reestructura` las ramas `detect_broken_outdated_pages` (páginas rotas, redirecciones `308`, sesión/referidos y SEO; la app ya se puede indexar) y `ciberseguridad` (auditoría `Reportes/seguridad/` y remediación SEC-01…18).
  - Las migraciones de seguridad se renumeraron a `0011_pagos_connect_atomicos`, `0012_ola2_integridad_y_auditoria` y `0013_ola3_privacidad_y_restricciones` (los números `0007`…`0010` ya eran de Comunidad, avisos, moderación y avatar).
  - `getViewerAccess` da `isAdmin` solo con correo verificado y añade `isTipster`. `/app/admin` responde `404` salvo administrador verificado o herramientas de vista previa; `/app/tipster` exige tipster o admin. `/p/[pickId]` solo acepta picks semanales públicos.
  - Se quitaron los ganchos `after` que vaciaban tokens OAuth con `options.db` fuera de la transacción de Better Auth: colgaban la vinculación con X. Los `before` ya guardan los tokens en `null`.
  - Se borraron ~760 archivos de `Reportes/analisis-linemate/` y `research/linemate/` (código de terceros con claves); siguen en el historial de git.
  - **Producción exige ahora** `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (o `PITCHLAB_ALLOW_NO_TURNSTILE_IN_PROD=1`), `BETTER_AUTH_URL` que no sea localhost y un `BETTER_AUTH_SECRET` real de 32+ caracteres.
  - **Verificación 2026-11-12:** tipos, pruebas unitarias (db 33, web 130, ui 66, ingest 117, emails 56, contracts 5), linter, `check-no-secrets` y `next build` en verde. `pnpm e2e`: 10/10 (escritorio y móvil) tras tres ajustes:
    - La guardia CSRF (`verifySameOriginMutation`) acepta también el `Host` de la solicitud: `next start` arma `request.url` con `localhost` aunque el navegador entre por `127.0.0.1`.
    - `playwright.config.ts` genera un `BETA_COOKIE_SECRET` aleatorio por corrida (producción rechaza secretos `e2e-test-…`) y los `POST` directos de las pruebas mandan `Origin`.
    - CFDI: la prueba espera «Datos fiscales validados para esta sesión.» y campos vacíos al recargar (ya no se guardan en el navegador por privacidad).
  - **Revisión en vivo (modo PIN, `localhost:3000`):** `/app/tipster`, Comunidad, Mi cuenta y Admin sin «tipstar» en el HTML. **Recorrido con cuentas en el 9990 (Neon `local-9990`, migraciones hasta `0014` aplicadas):** `@prueba_local` publica y comenta; `@lupita_mx` da «me gusta», comenta, sigue y reporta (segundo reporte `409`, borrar lo ajeno `404`); la campana de `@prueba_local` muestra los 3 avisos con enlaces; un enlace de Telegram se rechaza con `400`; con `PITCHLAB_ADMIN_EMAILS` local, el panel «Moderación» de `/app/admin` recibe el reporte, ocultar saca la publicación del feed y restaurar la devuelve; sin admin la API responde `403`. Foto y X aparecen en «Pronto» y `POST /api/me/avatar` responde `503` sin `BLOB_READ_WRITE_TOKEN`. La publicación de prueba se borró.
    - **Hallazgo investigado (sin acción):** en desarrollo, `/app/u/[handle]` avisó 4 veces seguidas de un *hydration mismatch* en los `useId` de `NotificationBell` y del menú de cuenta (servidor `_R_cjeitmlb_`, cliente `_R_34ritmlb_`). Después no se volvió a reproducir en 4 cargas más (recarga y navegación). El servidor genera el mismo id en todas las páginas del Club, la estructura de hijos sobre el encabezado es idéntica en el perfil y en `/app/premier-league`, y `ClubWorkspaceShell` no monta un segundo encabezado (`ShellMountedContext`). La divergencia está por encima de `ClubWorkspaceShellImpl`, en los envoltorios del router de Next, y parece de tiempo de carga en modo desarrollo. Sin efecto para el usuario: React conserva los ids del servidor en el DOM, y la campana y el menú abren bien. Si reaparece en producción, la salida es pasar ids fijos al encabezado.
    - `scripts/local-9990.ps1` ahora usa `$ErrorActionPreference = 'Continue'` al arrancar Next: con `Stop`, Windows PowerShell 5.1 tumbaba el servidor con cualquier aviso de webpack en stderr.
  - **`scripts/local-9990.ps1` ya no trae el id del proyecto de Neon:** se define `NEON_PROJECT_ID` en `.env.9990.local` (ignorado por git) y se necesita la CLI de Neon con sesión (`npm i -g neonctl`, `neonctl auth`). En esta PC ya está configurado (proyecto `pitchlab`, organización PitchLab).
- **TIPSTER (renombre):** ✅ 2026-11-12. «Tipstar» pasó a «tipster» en código, textos, rutas (`/app/tipster`, `/api/tipster/connect`, `/api/admin/tipsters`, `/api/cron/tipster-payouts`), docs y lienzos. `/app/tipstar` redirige a `/app/tipster` con el alias del Club (`club-route-guard.ts`), conservando la consulta. La migración `0014_tipster` renombra tablas, columnas, restricciones e índices y los valores `trial_tipster_5d`, `tipster_comp_pass` y `tipster_payouts_enabled`. Las migraciones `0000`…`0013` y sus snapshots conservan el nombre viejo porque son historia.
- **INICIO-3 (nuevo Inicio `/app`):** ✅ 2026-11-12. Diseño aprobado en el lienzo de Claude «PitchLab · Nuevo Inicio» (https://claude.ai/artifact/SBhkQqMS58ykPuDh4wKU5U, privado del fundador).
  - `HomeClubView` (`packages/ui/src/platform/club/home/`) reemplaza a `JornadaClubView`, que queda como alias. Barra de días con «Próximos 7 días», cada día con partidos y los resultados de días pasados. Selector de deporte (tarjetas con ícono, conteo y escudos de sus ligas) y de liga (tarjetas con escudo). Secciones Fútbol → Fútbol americano, cada una por liga con su jornada y, en «Próximos 7 días», por día.
  - `HomeMatchCard` (`components/`): hora y confianza con medidor → equipos con escudo, récord y marcador proyectado → barra 1·X·2 (`ProbSplit`) → «Resultado más probable» con su momio justo → «Pick principal del modelo» con `PBar`, momio justo y una alternativa → Parlay y Ver partido. Respeta picks bloqueados, marca de agua y el formato de momio del socio.
  - Columna derecha: «Picks con mayor probabilidad» arriba; a la derecha «Tu parlay» (selecciones, probabilidad combinada, momio justo, armado automático por perfil), «Donde la casa paga más» (solo si hay momio de casa por encima del justo) y «Mi bitácora».
  - Lógica pura en `home-model.ts` con 9 pruebas. Stories en oscuro y claro (`ClubInicioOscuro`, `ClubInicioClaro`, `ClubInicioVisitante`, `TarjetaPartido*`). `pnpm e2e` 10/10 con Axe AA del Inicio en ambos temas.
  - El armado automático del Inicio pasa a `generateAutoParlay` los partidos visibles (`games`, opcional): respeta día, deporte y liga. Sin `games`, el armador de `/app/parlays` sigue usando toda la jornada.
  - **Resuelto en Beta 1.0:** bajo acceso PIN (`viewerVia === "beta"`), el proveedor y `PlanTab` omiten las llamadas protegidas a `/api/social/*`, `/api/me/*` y `/api/tipster/me`, eliminando los `401` repetidos.
- **BETA-1.0 (transferencias SPEI, cupones, preferencias en DB y cierre operativo sin Stripe):** implementado en `gemini-reestructura` (ver detalle en `Handoffs` al finalizar verificación).
- **BLOG-1 (blog público para SEO):** ✅ 2026-11-13 en `crear_sitemap_web`. Artículos en Markdown (`apps/web/content/blog/*.md`, plantilla `_plantilla.md`) leídos por `apps/web/src/server/blog.ts` (`marked@15.0.12`, encabezado validado, HTML crudo escapado, borradores y fechas futuras como programación). Rutas `/blog`, `/blog/categoria/[categoria]`, `/blog/[slug]` y `/blog/rss.xml`, con canónicas, Open Graph `article`, imagen OG generada, JSON-LD `Blog`/`BlogPosting`/`BreadcrumbList` y sitemap con `lastModified` (se regenera cada hora). Pantallas `BlogIndexSurface` y `BlogPostSurface` en `@pitchlab/ui` con stories en ambos temas (`PitchLab v4 / Blog`) y estilos en `apps/web/app/blog.css`. Enlace «Blog» en el pie público. 3 artículos iniciales (momio justo, probabilidad de un parlay, juego responsable). Guía para el equipo: `docs/content/BLOG.md`. **Pendiente:** decidir si «Blog» entra a la barra pública y revisar en Search Console tras el primer deploy.
- **MOTOR-V3.2 (2026-11-13):** `@pitchlab/spacetime` pasa de v3.0 a **v3.2** (`prediction-lab` `2960d77`: 18 módulos, 19 artefactos, 18 suites). La pestaña «Mercados» de la ficha usa el panorama `MatchOutlook` (11 mercados de fútbol, ganador NFL) con la franja «Lo más probable · Marcadores más probables · Calidad de los datos» (`MatchOutlookStrip`, stories en oscuro y claro). Cobertura: 65 de 72 partidos por jugar; los 7 restantes conservan los mercados del snapshot. **Inicio, Picks, parlays y landing** también leen v3.2 (`applyOutlook` en el dataset del servidor). Sin stake, Kelly ni EV (se quitó «Sugerencia calibrada: Xu» de los picks); la columna «Casa» queda vacía mientras no haya captura legal de menos de 72 h (`capture_status: prospective_capture_pending`). Detalle en `Handoffs`.
- **CLUB-V2 (2026-11-13):** tarjetas sin recorte al hover, marca contra filtraciones con identidad real (trama + huella invisible al copiar), chip de confianza explicable (v3.2: favorito 50 %, datos 30 %, muestra 20 %), sede y local/visita; ficha con Cortex IA a lo ancho y animación de generación, votos de la comunidad (`0016`), simulador y contexto nuevo; boleto PNG para picks y parlays ganados; referidos +7 días; sin Facturación en la beta; editor de perfil con ligas favoritas y privacidad; /picks como buscador, /momios como «Compara tu momio» y /historial nuevo. Detalle en `Handoffs`.
- **DATOS-P0 (2026-11-13):** escudos y nombres sin cruces (P0-03), ligas europeas al día con respaldo ESPN y jornada activa que avanza (P0-02), atribución de tipsters al crear cuenta (P0-05) y fallas de sincronización visibles en Actions (P0-01). P0-08 (peso) resuelto: todas las páginas debajo de 326 kB. Detalle en `Handoffs`.
- **MI-RECORD-1 (2026-11-13, punto 1/7 en `mi_record_backend_api`):** ✅ «Bitácora» pasa a **«Mi récord»** (`/app/lab`, `311 kB` First Load JS) con 3 pestañas WAI-ARIA (`Picks` · `Banca y estadísticas` · `Privacidad`), banca inicial opcional en MXN siempre privada (`0017_mi_record_privacidad`), 7 estadísticas y gráficas accesibles (`record-stats.ts`), privacidad por bloque y por dato con vista previa en vivo (`publicRecordView`) y récord compartido en `/app/u/[handle]` (`GET /api/u/[handle]/record`). Puntos 2 al 7 documentados para continuar en casa en `docs/execution/HANDOFF_PLAN_7_PUNTOS_2026_11_13.md`.
- **Siguiente:** retomar puntos 2–7 en `docs/execution/HANDOFF_PLAN_7_PUNTOS_2026_11_13.md` y ver «Pendiente (en orden)».

El clon previo de TouchIQ (Vite + `src/domain` con 24 tests dorados) quedó archivado en la rama `archive/touchiq-reconstruction` (ADR-018) y sus motores matemáticos viven ahora en `packages/engines-reference` con adaptadores limpios para snapshots reales.

## Documentos creados

| Documento | Fase | Estado |
|---|---|---|
| `docs/PITCHLAB_MASTER_PLAN.md` | — | v2 aprobado |
| `docs/DIRECTIVE_CHANGELOG.md` | — | Completo |
| `docs/brand/BRAND_AUDIT.md` | F0 | Completo |
| `docs/brand/ASSET_MANIFEST.md` | F0 | Completo |
| `docs/research/REA_REPORT_INVENTORY.md` | F0 | Completo |
| `docs/research/COMPETITIVE_FEATURE_MATRIX.md` | F0 | Completo (26 funcionalidades y benchmarks) |
| `docs/research/PREDICTION_ENGINE_FINDINGS.md` | F0 | Completo |
| `docs/research/UX_FINDINGS.md` | F0 | Completo (Draftea: solo la landing pública) |
| `docs/architecture/DATA_PROVIDER_MATRIX.md` | F1 | Completo (reemplaza `DATA_SOURCE_FINDINGS.md`: incluye la procedencia de datos de las referencias) |
| `docs/architecture/COMPLIANCE_REGISTER.md` | F1 | Completo (15 puntos) |
| `docs/product/COST_MODEL.md` | F1 | Completo (supuestos explícitos) |
| `docs/execution/FOUNDER_DECISIONS.md` | F1 | 14 decisiones |
| `docs/product/PRODUCT_VISION.md` | F2 | Completo (tesis, 5 personas, diferenciadores, no-objetivos y métricas norte) |
| `docs/product/USER_JOURNEYS.md` | F2 | Completo (J1–J10, base de los E2E) |
| `docs/product/INFORMATION_ARCHITECTURE.md` | F2 | Completo (navegación, `SportContext` y entitlements provisionales) |
| `docs/architecture/ROUTE_MAP.md` | F2 | Completo (fuente única de rutas) |
| `docs/product/SECTION_INDEX.md` | F2 | Completo (38 IDs + 11b; 18, 19 y 27 fusionadas) |
| `docs/product/MVP_DEFINITION.md` | F2 | Completo (Lean+ con ecosistema) |
| `docs/execution/ROADMAP.md` | F2 | Completo (waves W0–W8 con dependencias) |
| `docs/architecture/FREE_DATA_STRATEGY.md` | F2→F3 | Vigente: nflverse, openfootball, The Odds API Free y API-Football Free |
| `docs/architecture/adr/` (ADR-001…038) | F3 / UI-V4 / F4 / Canvas-First | 38 ADRs aceptadas (incluye `ADR-027`…`ADR-038`: Spacetime v3.0, librerías UI, histórico vs research, pulso de mercado, `@pitchlab/db`, cuentas 2 pasos, Stripe REST + Connect, `Cortex IA`, vidrio falso `0 blur`, lienzos + `Pase PitchLab Ultra`, `Saldo` y tarjeta 3D WebGL SDF) |
| `GLOSSARY.md` | Dominio vigente | Glosario canónico alineado a código (`Spacetime Suite`, `Multi-Picks`, `Momio Justo`, `Bitácora`, `Saldo`, `Consenso`, `Pase PitchLab Ultra`, `Cero-Fuga`, `Tipster Verificado`, `Referido Doble Vía`, `Embajador PitchLab`) |
| `docs/architecture/SYSTEM_ARCHITECTURE.md` | F3 | Módulos, límites, flujo y API `/api/v1` |
| `docs/architecture/DATA_ARCHITECTURE.md` | F3 | Modelo canónico, ingesta, R2, frescura y as-of (incluye HISTORICAL_STORAGE) |
| `docs/architecture/PREDICTION_ARCHITECTURE.md` | F3 | Live frente a retro, tablas, gate de publicación |
| `docs/architecture/AUTH_BILLING_GROWTH.md` | F3 | Auth, entitlements por concesiones, trial, referidos, invitaciones y `BillingProvider` |
| `docs/architecture/SOCIAL_ARCHITECTURE.md` | F3 | Integridad de picks, métricas, leaderboards y moderación |
| `docs/architecture/AI_ARCHITECTURE.md` | F3 | OpenRouter + modelo barato, herramientas, validador de grounding, selección por evaluación y costo |
| `docs/architecture/SECURITY.md` | F3 | Amenazas, reglas de código, roles, flags legales y respaldos |
| `docs/architecture/DEPLOYMENT.md` | F3 | Entornos, CI/CD, variables, DNS y correo, presupuestos y acciones del fundador |
| `docs/product/PRE_MVP.md` | Pre-MVP | Landing + panel de partidos y análisis para socios, con su plan de 8 pasos |
| `docs/architecture/FRONTEND_ARCHITECTURE.md` | F3b | Estructura de `apps/web`, server frente a client, componentes, estilo, responsive y pruebas |
| `docs/architecture/SHARED_CONTRACTS.md` | F3b | IDs, `DataState`, deportes, odds, análisis, predicciones, social, billing, API y URLs |
| `docs/execution/AGENT_OWNERSHIP.md` | F3b | Globs por owner de plataforma y por sección |
| `docs/execution/INTEGRATION_STRATEGY.md` | F3b | Ramas, worktrees, PRs, merges por wave, contratos y releases |
| `docs/execution/AGENT_EXECUTION_PLAN.md` | F3b | Ciclo de sesión, paralelismo por wave y handoff |
| `docs/execution/QUALITY_GATES.md` | F3b | Gates de CI, checklist de PR, criterios de aceptación y linter de prompts |
| `prompts/_TEMPLATE.md` | F3b | Plantilla A–R para los prompts de F5 |
| `docs/product/PRE_MVP_DEPLOY.md` | Pre-MVP | Guía paso a paso de despliegue en Vercel Free + GitHub Actions |
| `design/prototipo-maestro/prototipo-maestro-pitchlab.html` | UI-MAESTRO-V4.1 | Artefacto HTML maestro canónico (6,960 líneas; referencia visual y funcional 1:1 de las 11 vistas) |
| `docs/architecture/adr/ADR-023-smoked-glass-maestro-ui-physics.md` | UI-MAESTRO-V4.1 | Física *Smoked Glass* sobre obsidiana, `<LensGlowOrbs>`, `MaestroPrimitives` y `<dialog>` nativo (`accepted`) |
| `docs/architecture/adr/ADR-024-hybrid-snapshot-spacetime-quant-engine.md` | UI-MAESTRO-V4.1 | Motor cuantitativo híbrido sobre snapshots reales + `Spacetime Suite` determinística auditable (`accepted`) |
| `docs/architecture/adr/ADR-025-zero-leak-subscription-tipster-referrals.md` | UI-MAESTRO-V4.1 | Membresía única `Pase Total`, frontera `Cero-Fuga` SSR, Mes 1 sin tarjeta, Tipsters y Referidos Doble Vía (`accepted`) |
| `docs/architecture/adr/ADR-026-contrato-ejecutable-prototipo-maestro-y-simulacion-roles.md` | UI-MAESTRO-V4.1 | Contrato ejecutable del Prototipo Maestro, simulación de roles sin romper Cero-Fuga y paridad 1:1 (`accepted`) |
| `docs/product/PLATFORM_VISION_GEMINI_REESTRUCTURA.md` | UI-MAESTRO-V4.1 | Visión unificada de producto, negocio, motores `Spacetime Suite v2.1`, mapa de rutas y hoja de ruta F4 para Claude |
| `docs/product/VISION_REESTRUCTURA_CLAUDE_DS_UX.md` | UI-MAESTRO-V4.1 | Visión ejecutiva de Design System, jerarquía de las 11 superficies y evolución UX para Claude |
| `docs/product/VISION_REESTRUCTURA_CLAUDE_QUANT.md` | UI-MAESTRO-V4.1 | Visión cuantitativa y hoja de ruta hacia pipelines de producción en F4 (`Spacetime Suite`, líneas, Props, `Cortex IA`) |
| `docs/product/VISION_REESTRUCTURA_CLAUDE_GROWTH.md` | UI-MAESTRO-V4.1 | Visión de crecimiento, tablas y máquinas de estado F4, Stripe MX, Facturapi CFDI 4.0 y embudos virales 4:5 / 9:16 |
| `docs/execution/CLAUDE_HOME_SESSION_BRIEF.md` | UI-MAESTRO-V4.1 | Guía ejecutiva de incorporación en 60 segundos para Claude y el fundador en la sesión desde casa |
| `docs/execution/HANDOFF_MAESTRO_UI_TOKENS_PUBLIC.md` | UI-MAESTRO-V4.1 | Handoff técnico de tokens *Smoked Glass*, `MaestroPrimitives` y superficies públicas (`/`…`/p/[pickId]`) |
| `docs/execution/HANDOFF_MAESTRO_CLUB_QUANT_SOCIAL.md` | UI-MAESTRO-V4.1 | Handoff técnico de shell `/app`, partidos, quant/parlays SGP, Comunidad VIP, Portal Tipster, Cuenta y Admin |
| `docs/execution/HANDOFF_PLAN_7_PUNTOS_2026_11_13.md` | MI-RECORD-1 | Estado cerrado del punto 1 («Mi récord») y especificación lista para continuar en casa los puntos 2 al 7 |

## Hallazgos de F3

- Con Sonnet y las cuotas de F2, la IA costaría más que el ingreso de Pro. Se ajustaron las cuotas (Pro 60 consultas al mes).
- **Decisión del fundador (2026-11-08):** la IA usará OpenRouter con un modelo muy barato (ADR-013 rev. 2, FD-15 decidida). El modelo concreto se elige con la evaluación de `AI_ARCHITECTURE.md` §6.

## Hallazgos de F1 que cambian supuestos

- **Stripe** prohíbe los pronósticos deportivos *con premio monetario o material*, y admite excepciones con aprobación previa. Regla derivada: **ningún premio por acertar** (leaderboards sin premios).
- **Pinnacle** cerró su API pública el 23 de julio de 2025. El benchmark de mercado será el consenso sin vig de las casas con licencia.
- **Sportmonks no ofrece NFL** (el handoff de LineMate estaba equivocado).
- **Ningún proveedor confirma cuotas de Caliente o Codere MX.**
- Las APIs públicas de MLB y NHL no son aptas para uso comercial sin licencia.
- La **nueva LFPDPPP** está vigente desde el 21 de marzo de 2025.
- Una nueva Ley de Juegos y Sorteos está en preparación (SEGOB, octubre de 2026).

## Decisiones tomadas

- La arquitectura va antes que los prompts (F0→F4 antes de F5).
- Stack del §3 del plan maestro (las ADRs formales se escriben en F3).
- URLs con la Opción A (un solo origen, pitchlab.mx).
- `Reportes/` es la carpeta canónica de investigación.
- Emblemas: la fuente es `pitchlab-brand/football/<edición>/`, con un fallback neutro.
- Cero premios vinculados a pronósticos. Cero scraping. Cero afiliados en el MVP.

## Pendiente (en orden)

1. **Acciones del fundador (bloquean F4 y publicar):** crear cuentas y cargar secretos según `docs/architecture/DEPLOYMENT.md` §6: Vercel, Neon (`DATABASE_URL`), proveedores de login (Google y correo; Apple descartado porque cobra), variables SPEI (`PITCHLAB_PAYMENTS_MODE=transfer`, `PITCHLAB_TRANSFER_*`), `CRON_SECRET`, Cloudflare Turnstile y DNS de pitchlab.mx (Stripe MX y Facturapi se encienden después cambiando `PITCHLAB_PAYMENTS_MODE=stripe`). Ningún agente debe crear cuentas ni manejar claves. Antes del deploy: correr `scripts/migrate-prod.ps1` (aplica `0005`…`0017`: incluye `0016_votos_partido` y `0017_mi_record_privacidad`).
2. **Plan de 7 puntos en curso (`mi_record_backend_api`):** punto 1 («Mi récord») terminado; faltan en orden **2. Insignias**, **3. Comunidad** (ranking 7d/30d por acierto/CLV, copiar a parlay, consenso, seguir ligas/equipos), **4. Parlay del día** + generador en `/app/parlays`, **5. Mercados derivados v3.2** (goles equipo, 1T, marcador top 6, NFL spread/totales σ 13.5/10.5), **6. Antes del partido** y **7. `@handle` sugerido en `/signup`**. Detalle completo en `docs/execution/HANDOFF_PLAN_7_PUNTOS_2026_11_13.md`.
2. **Decisiones del fundador:** ✅ revisadas el 2026-11-11 (ver «Decisiones tomadas» en [`docs/product/DECISIONES_FUNDADOR_F4.md`](../product/DECISIONES_FUNDADOR_F4.md)). Abiertas: persona que factura (con el contador) y umbral para apagar la prueba sin tarjeta (al ver datos). Trabajo que derivó: ✅ Stripe Connect para tipsters; pendientes: momios solo de fuentes gratuitas (decisión del 11 nov), cupón del referido y borradores legales.
3. **Momios del día:** regenerar `live_matchday_v3_snapshot.json` en `prediction-lab` (scrapers de `web-scraping`) de forma recurrente; el workflow diario de esta rama ya sincroniza lo que se publique allá. Sin eso, a las 72 h la app deja de mostrar momios.
4. **F4 en código:** ✅ listo y probado sin servicios externos: Better Auth (enlace mágico y Google), Stripe Checkout + webhook (suscripción, gracia, referidos, embajador, comisiones, reembolsos), CFDI 4.0 con Facturapi, Turnstile, consola del fundador con datos reales (`PITCHLAB_ADMIN_EMAILS`), Bitácora/vigilancia/referidos en la base y Cortex IA con LLM validado. Se enciende con las variables de `.env.example`.
5. **Publicar en Vercel y llevar `gemini-reestructura` a `main`** con PR (el workflow diario de snapshots solo corre en la rama por defecto).
6. **Motores:** props de jugadores bloqueados por datos (faltan registros partido a partido para validarlos; ver decisión 3.2).
7. **F5:** prompts (`prompts/INDEX.md`). **F6:** ejecución multiagente (`AGENT_EXECUTION_PLAN.md`).

## Bloqueos

- FD-14: confirmación de API-Football para Liga MX comercial y revisión de cuenta de Stripe MX (solo bloquean el cobro, no el desarrollo).
- Falta el archivo Inter WOFF2 en el paquete de marca (se resuelve en F4).

## Cambios del fundador sin commit (no incluidos en los commits del plan)

- `pitchlab-brand/PITCHLAB_BRAND_HANDOFF.md` y `README.md`
- `pitchlab-brand/football/` y `pitchlab-brand/social/instagram-lanzamiento/` (sin seguimiento)
- `pitchlab-brand.zip` y los ZIP de emblemas

## Handoffs

_(Cada sesión de agente agrega aquí su entrada con el formato de `AGENT_EXECUTION_PLAN.md` §4.)_

### PREMVP-01 · Construir el pre-MVP de PitchLab (landing + acceso beta + panel de análisis) — 2026-11-08 — Rama `feat/pre-mvp`
- **Hecho:**
  - Creación de la rama de archivo `archive/touchiq-reconstruction` (ADR-018) y de la rama de trabajo `feat/pre-mvp`.
  - Monorepo con `pnpm` + Turborepo (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.env.example`, `scripts/check-no-demo-prod.mjs`, `scripts/lint-codebase.mjs`).
  - `@pitchlab/tokens`: generador desde `pitchlab-brand/tokens/tokens.json` hacia `tokens.css` (con tema oscuro por defecto, `html[data-theme="light"]` y aliases semánticos D1) y `dist/index.{js,d.ts}`.
  - `@pitchlab/contracts`: esquemas Zod e interfaces TypeScript de `DataState<T>`, `LeagueSlug`, `TeamRef`, `MarketOdds`, `Prediction1X2`, `Prediction2Way`, `GameSummary`, `GameDetail` y `LeagueSnapshot`.
  - `@pitchlab/sports-assets`: manifiesto tipado de emblemas de `pitchlab-brand/football/` con copia automática a `apps/web/public/brand/` y componente `<TeamCrest />` con fallback determinístico.
  - `@pitchlab/engines-reference`: migración de los motores matemáticos de referencia (386 tests en verde, incluidos los 24 tests dorados y los 324 de paridad) y adaptadores puros `computeSoccerMatchPrediction` y `computeNflMatchPrediction` con factores explicables en español y cero jerga interna (FD-16).
  - `@pitchlab/ingest` (`services/ingest`): CLI `pnpm snapshot` con adaptadores reales para `nflverse` (`games.csv` CC-BY 4.0), `openfootball` (`en.1.json` CC0), `API-Football` (opcional para Liga MX con `API_FOOTBALL_KEY`) y `The Odds API` (opcional con `ODDS_API_KEY`). Generados snapshots reales verificados en `data/snapshots/nfl/2026-11-08.json` (15 partidos, Semana 9) y `data/snapshots/premier-league/2026-11-08.json` (10 partidos, Jornada 10) más sus respectivos `latest.json`.
  - `@pitchlab/ui` y `@pitchlab/web` (`apps/web`, Next.js 15 App Router): rutas `/`, `/login`, `/signup`, `/app`, `/app/[league]`, `/app/[league]/games/[gameId]`, `/legal/{privacidad,terminos,juego-responsable,creditos}`, `/robots.txt`, endpoints `POST /api/beta/unlock` (comparación constante `timingSafeEqual`, cookie `pl_beta` firmada con HMAC-SHA256 `httpOnly` y rate-limit 5 intentos / 15 min → `429`) y `POST /api/beta/logout`, más `middleware.ts` para proteger `/app/**` con `X-Robots-Tag: noindex, nofollow`.
  - Workflow `.github/workflows/pre-mvp-snapshot.yml` y guía operativa `docs/product/PRE_MVP_DEPLOY.md`.
- **No hecho / fuera de alcance:**
  - Base de datos transaccional, cuentas individuales por correo, pagos con Stripe, picks sociales, asistente de IA en vivo, MLB/NHL/NCAA y comparador multi-casa completo (reservados para F4 y waves W1–W5).
  - Snapshot en vivo de Liga MX sin `API_FOOTBALL_KEY`: la pestaña Liga MX aparece como «Pronto» y se activa automáticamente al configurar `API_FOOTBALL_KEY`.
- **Contratos, tablas o componentes pedidos a otros owners:**
  - Ninguno para el pre-MVP; `@pitchlab/contracts` exporta `LeagueSnapshot`, `GameSummary`, `GameDetail` y `DataState<T>` listos para reutilizarse en W0/W2.
- **Decisiones tomadas (y por qué):**
  - En `services/ingest/src/adapters/openfootball.ts`, se aceptó `"score": []` además de `"score": {}` porque `openfootball` serializa partidos futuros como arreglo vacío en jornadas aún no disputadas.
  - En `apps/web/next.config.mjs`, se configuró `extensionAlias` en Webpack para resolver imports ESM con extensión `.js` hacia archivos `.ts`/`.tsx` de los paquetes del monorepo.
  - Se añadieron aliases semánticos de superficie (`--bg-canvas`, `--bg-subtle`, `--bg-elev-1`, `--text-primary`, `--text-secondary`, `--text-muted`) en `@pitchlab/tokens` para mantener 0 literales hex fuera de `packages/tokens` y pasar contraste WCAG AA (`axe-core`) tanto en modo oscuro como en modo claro.
- **Riesgos o deuda:**
  - El limitador de intentos de `/api/beta/unlock` usa memoria de proceso (suficiente para socios en el pre-MVP; en F4 se reemplaza por almacenamiento distribuido / Auth.js).
  - La fuente `Inter` usa `next/font/google` con fallback de sistema mientras el archivo `Inter.woff2` local entra al paquete de marca en F4.
- **Cómo probarlo:**
  - Comandos ejecutados y verificados en verde:
    - `pnpm install` (0 errores)
    - `pnpm snapshot` (genera `data/snapshots/nfl/latest.json` con 15 partidos y `data/snapshots/premier-league/latest.json` con 10 partidos)
    - `pnpm build` (7 paquetes compilados + `scripts/check-no-demo-prod.mjs` + `scripts/lint-codebase.mjs` con 0 hex fuera de tokens y 0 `catch` vacíos; First Load JS compartido `103 kB` < `180 kB`)
    - `pnpm test` (12 tareas Vitest en verde: `@pitchlab/tokens` 3, `@pitchlab/contracts` 4, `@pitchlab/sports-assets` 3, `@pitchlab/engines-reference` 386, `@pitchlab/ui` 2, `@pitchlab/ingest` 5, `@pitchlab/web` 4)
    - `pnpm e2e` (8/8 tests de Playwright en `desktop` `1440×900` y `mobile` `390×844`, incluyendo auditoría `axe` WCAG 2A/2AA en oscuro y claro, verificación FD-16 de cero nombres internos/proveedores en DOM, cero overflow horizontal en `375, 390, 768, 1024, 1280, 1440 px`, bloqueo `429` tras 5 intentos fallidos, desbloqueo con PIN, deep-link `/app/premier-league/games/[gameId]` y cierre de sesión)
  - Capturas generadas e inspeccionadas en `test-results/screenshots/`: `landing-{desktop,mobile}-{dark,light}.png`, `login-{desktop,mobile}-dark.png`, `signup-{desktop,mobile}-dark.png`, `panel-pl-{desktop,mobile}-{dark,light}.png`, `modal-pl-{desktop,mobile}-dark.png`.

### HIST-01 · Corpus histórico y benchmark walk-forward — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `services/ingest/src/history/`: catálogo de ligas, normalización de openfootball (con `stage` para Apertura/Clausura y alias de equipos), normalización de nflverse (identidad por franquicia: `STL`/`LA`, `OAK`/`LV`, `SD`/`LAC`), auditoría de calidad, constructor determinista con caché y manifiesto de digests, y CLI `pnpm history`.
  - Corpus generado en `data/history/`: **34,168 partidos** de **7 ligas** y **108 temporadas** (NFL 1999–2026; fútbol 2010-11–2026-27), `datasetId` `0ddb5936…`, **0 errores** y 1 advertencia (Ligue 1 2019-20 cancelada por COVID). Reporte: `Reportes/datos/HISTORICO-QUALITY.md`.
  - Benchmark `pnpm backtest:history` (walk-forward con ventana móvil de 1,095 días, bootstrap 2,000): en las 6 ligas de fútbol el log loss del modelo supera al ingenuo con IC 95 % que excluye el 0 (Premier League n=5,898, **0.9748** vs 1.0653, Δ −0.0905 [−0.1002, −0.0799]; Serie A la mayor mejora, Δ −0.1029; Liga MX n=781, Δ −0.0499). NFL n=7,204, log loss **0.6545** vs ingenuo 0.6860 (Δ −0.0315) y **+0.0421 frente al mercado sin vig** (n=5,426). Reportes en `Reportes/modelos/BACKTEST-HISTORICO.*`.
  - Corrección en `packages/models/src/nfl/ratings.ts`: el centrado por medias distintas hacía divergir el solver con muestras > ~240 partidos (intercepto ~1e38). Se eliminó el centrado (el ridge identifica el modelo) y se añadió una prueba de regresión con 320 partidos.
  - Documentación: `docs/architecture/HISTORICAL_DATA.md` (contrato, licencias, límites) y `docs/architecture/STACK_REVIEW.md` (recomendación recibida frente al stack real).
- **No hecho / fuera de alcance:**
  - Persistencia en Postgres (`packages/db` sigue sin existir) y export a Parquet/R2.
  - Histórico de Liga MX anterior a 2018-19 y posterior a 2024-25 (openfootball no publica; la vía es API-Football, con reserva de licencia).
  - Elo explícito, regresión y GBM: el corpus queda listo, los modelos no.
- **Contratos, tablas o componentes pedidos a otros owners:**
  - `packages/db`: tablas `team`, `game`, `game_result` y `model_version`/`prediction` para cargar el corpus (ADR-007). Mientras tanto, `data/history/*.jsonl` es la fuente.
- **Decisiones tomadas (y por qué):**
  - Identidad de equipos propia (`<liga>.<slug>`) y no el manifiesto de emblemas: un club relegado o una franquicia mudada debe conservar historial.
  - `availableAt` = fin del día del partido + 24 h, el lag conservador de `DATA_ARCHITECTURE.md` §6.
  - Las líneas de cierre de nflverse se guardan como `research-only`: sirven para comparar contra el mercado, no para publicarlas.
  - Los 404 de openfootball se cachean como `<archivo>.missing` para que `--offline` sea reproducible.
- **Riesgos o deuda:**
  - El corpus son 14.4 MB de JSONL en el repo; si crece, mover a Parquet/R2 (ADR-007).
  - La temporada en curso de openfootball llega a 2026-09-20; la frescura diaria depende de los adaptadores en vivo.
  - El benchmark NFL solo cubre 5,426 partidos con moneyline de cierre (nflverse no las publica para todos los años).
- **Cómo probarlo:**
  - `pnpm history` (2ª corrida usa caché; 0 errores, 1 advertencia), `pnpm backtest:history`, `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (22 tests) y `pnpm --filter @pitchlab/models exec vitest run --pool=threads` (13 tests).

### DATA-DOCS-01 · Investigación de datos históricos de fútbol y evidencia de validación — 2026-11-08 — Rama `feat/pre-mvp` (complementa HIST-01, sin tocar `services/ingest`)
- **Hecho:**
  - Carpeta completa `docs/data/football/` (18 documentos): ligas reales, auditoría de datos previos, investigación de proveedores (solo fuentes gratuitas, FD-02), matriz de cobertura verificada, clasificación de licencias (13 derechos), estrategia descubrimiento→piloto→backfill, modelo canónico explicado, arquitectura de ingesta, quality gates, feature engineering con reglas anti-leakage, auditoría de motores con números, plan de mejora, protocolo de validación, cuotas históricas, automatización, costos (3 escenarios), registro de riesgos y `FOOTBALL_DATA_MASTER_REPORT.md` (las 20 preguntas + checklist de aceptación).
  - Correcciones de ingesta verificadas con rebuild completo (cotejado con HIST-01, mismo `datasetId` `0ddb5936…`): `phase: "postseason"` para liguilla en `normalize-openfootball.ts` (antes toda la liguilla quedaba como `regular`) y `expectedGamesPerSeason: 306` para Liga MX. Resultado: **0 errores / 1 advertencia** (Ligue 1 2019-20, COVID).
  - Sonda del plan Free de API-Football (3 solicitudes del presupuesto del usuario): Liga MX histórica **2023 accesible** (340 fixtures, 44 rondas `Apertura - 1` … `Clausura - Final`), **2019 y 2021 bloqueadas por plan** (`errors=plan`). Conclusión: el hueco Liga MX 2021-22→2023-24 se llena con 2 solicitudes (temporadas 2022 y 2023) salvo el Ap2021+Cl2022, que requiere plan de pago o FD-14. Plan de implementación documentado en `docs/data/football/06-*.md` §3 (pendiente de codificar para no chocar con la sesión de HIST-01).
  - Benchmark walk-forward re-ejecutado en las 7 ligas tras el fix de `nfl/ratings.ts` (mismos números que HIST-01; football 6/6 Δ concluyente, NFL 0.6545 vs ingenuo, mercado sin vig 0.6106 gana al modelo) y números capturados como evidencia citable en los docs.
- **No hecho / fuera de alcance:**
  - El backfill de Liga MX 2022/2023 (código del normalizador API-Football histórico) quedó especificado, no implementado.
  - Tests automatizados de invariantes anti-leakage como parte de `pnpm test`.
- **Decisiones tomadas (y por qué):**
  - Monarcas Morelia → Mazatlán FC se trata como **una franquicia** (misma identidad, regla NFL STL→LA); Atlante sigue siendo otro club. Quedó señalado el mapeo de marca `Mazatlán→atlante` como bug del manifest de emblemas (no afecta al histórico).
  - football-data.org (adaptador nuevo de HIST-01) queda clasificado **PENDIENTE** en la matriz de licencias hasta clasificar sus términos.
- **Riesgos o deuda:**
  - Archivos temporales de otra sesión sin limpiar: `.tmp-probe*.mjs` (raíz) y `services/ingest/tests/.tmp-bench.test.ts`.
- **Cómo probarlo:**
  - Leer `docs/data/football/FOOTBALL_DATA_MASTER_REPORT.md` (§2 próximos pasos, §3 checklist); re-verificar números con `pnpm backtest:history --leagues=premier-league,la-liga,bundesliga,serie-a,ligue-1,liga-mx,nfl`.

### DATA-02 · Cuotas de cierre, estadísticas de partido y benchmark contra el mercado — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `pnpm history:odds` (`services/ingest/src/history/football-data-co-uk.ts`, `research.ts`, `odds-cli.ts`): descarga 85 CSV de football-data.co.uk (5 ligas × 17 temporadas), normaliza y empareja contra el corpus. Resultado: **28,827 filas**, 28,825 con cuotas, **25,503 con cuotas de cierre** (desde 2020-21; antes pre-partido), **28,824 con tiros, tiros a puerta, córners y tarjetas**, y **25,572 emparejadas = 100 % del corpus de las cinco grandes ligas**.
  - Dataset separado `data/history/research/` (research-only, en `.gitignore`), con `manifest.json` de digests/cobertura y `Reportes/datos/ODDS-QUALITY.md`. El corpus canónico no se contamina: la licencia de football-data.co.uk no está localizada.
  - Benchmark con mercado sin vig integrado en `history-backtest.ts`: fútbol 0.9737–1.0034 frente a mercado 0.9500–0.9813 (Δ **+0.0175 a +0.0237**); NFL 0.6545 vs 0.6106 (Δ **+0.0421**). El modelo gana al ingenuo y **todavía pierde contra el mercado**, que es justo la referencia que faltaba.
  - Identidades corregidas en el corpus: `Bor. Mönchengladbach`→`borussia-monchengladbach`, `FC Internazionale Milano`→`inter`, `ES Troyes AC`→`estac-troyes`. El corpus queda en 34,168 partidos y **235 equipos** (datasetId `35fea620…`; research `649c0cba…`).
  - Refactor: caché HTTP y `mapLimit` extraídos a `history/http.ts` (los usan ambos constructores).
- **No hecho / fuera de alcance:**
  - Extender los resultados de 1993-94 a 2009-10 con la misma fuente (≈ 17 temporadas más de entrenamiento).
  - Cuotas para Liga MX (football-data.co.uk no la cubre).
  - Features de GBM con tiros/córners y un Elo explícito.
- **Decisiones tomadas (y por qué):**
  - Dataset research **separado** y fuera de git: se puede usar para backtests y features, pero no se publica ni se redistribuye (licencia sin localizar).
  - Prioridad de cuota: Pinnacle > B365 > promedio; `timing: closing` cuando la fuente lo publica y `pre-match` antes de 2020-21, declarado en cada fila.
  - Sin cuotas no se inventan precios (`odds: null`); los clubes de temporadas antiguas fuera del corpus se reportan como no emparejados.
- **Riesgos o deuda:**
  - El dataset research son ~18 MB locales; se regenera con `pnpm history:odds` (85 descargas) o `--offline` con la caché.
  - Depende de la tasa del sitio: el constructor usa concurrencia 2–3 y caché; no hay scraping agresivo.
- **Cómo probarlo:**
  - `pnpm history:odds` (cobertura 100 %), `pnpm backtest:history --leagues=premier-league,la-liga,bundesliga,serie-a,ligue-1,liga-mx,nfl`, `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (31 tests) y `pnpm --filter @pitchlab/models exec vitest run --pool=threads` (13).

### DATA-03 · Histórico research 1993-2026 y experimento de entrenamiento extendido — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `pnpm history:odds` amplía el dataset research a **1993-94–2026-27**: **59,531 partidos** (5 ligas × 34 temporadas), 43,754 con cuotas, **25,689 de cierre**, 41,596 con tiros/córners/tarjetas; 25,572 emparejados = 100 % del corpus. Manifest `af8e893a…`; ~31 MB locales (gitignored).
  - Los clubes antiguos que no existen en el corpus reciben un slug derivado (`Wimbledon` → `premier-league.wimbledon`) y se reportan en `fallbackNames` (9–15 por liga). Cero filas descartadas por nombres en las cinco ligas.
  - El benchmark puede entrenar con ese histórico (`--include-research-history`) sin tocar la evaluación. El benchmark público sigue siendo determinista y solo con el corpus versionado; el experimento se guarda aparte en `Reportes/modelos/BACKTEST-HISTORICO-RESEARCH.md`.
  - Resultado del experimento: más volumen **no** cierra la brecha. PL 0.9748→0.9771, LaLiga 0.9752→0.9728, Bundesliga 0.9951→0.9982, Serie A 0.9737→0.9735, Ligue 1 1.0034→1.0021; Δ frente al mercado se mantiene en 0.017–0.025. n sube porque las primeras jornadas ya alcanzan el mínimo de entrenamiento.
- **No hecho / fuera de alcance:**
  - Histórico de Liga MX por API-Football (2022 y 2023 accesibles con el plan Free; queda para la siguiente ronda).
  - Elo y features as-of (siguiente paso de modelado).
- **Decisiones tomadas (y por qué):**
  - El benchmark público **no** usa research por defecto: debe reproducirse sin descargar datos de licencia incierta. El experimento es opt-in y queda en un reporte separado.
  - Más datos no justifican cambiar el modelo por sí solos; la mejora tiene que venir de features y de un GBM.
- **Riesgos o deuda:**
  - El dataset research pesa ~31 MB y crece con cada temporada; sigue fuera de git.
  - La evaluación con research cambia `n`, así que las comparaciones con el benchmark público no son exactamente sobre el mismo conjunto de partidos (queda anotado en `HISTORICAL_DATA.md` §8).
- **Cómo probarlo:**
  - `pnpm history:odds` (1993-2026), `pnpm backtest:history` (público, mismos números), `pnpm backtest:history --include-research-history` (experimento) y `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (32 tests).

### DATA-04 · Liga MX histórica vía API-Football (research-only) — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `services/ingest/src/history/api-football-history.ts`: descarga una temporada por solicitud respetando la caché y el presupuesto diario (90), normaliza rondas `Apertura - N` / `Clausura - N` y liguilla (`Reclasificacion`, `Quarter-finals`, `Semi-finals`, `Final`), y mapea 18 clubes a los slugs del corpus (incluye variantes con acento y `U.N.A.M. - Pumas`).
  - `pnpm history:odds` integra Liga MX: **1,022 partidos** de 2022-23, 2023-24 y 2024-25 (312 emparejados con el corpus); **2021, 2025 y 2026 bloqueados por el plan Free** («try from 2022 to 2024»). Dataset research total: **60,553 filas, 6 ligas**, 25,884 emparejadas y 100 % de cobertura de cuotas sobre las cinco grandes.
  - Benchmark research: Liga MX pasa de 781 a **982 predicciones** y Δ frente al ingenuo de −0.0499 a **−0.0522** al entrenar con los 710 partidos extra; el resto de ligas no cambia.
  - Se conserva `stage`, `period` y `phase` en las filas research para poder filtrar liguilla o construir features después.
- **No hecho / fuera de alcance:**
  - Cuotas para Liga MX (el endpoint de fixtures no las trae).
  - Temporadas 2021, 2025 y 2026 (requieren plan de pago o FD-14).
  - Elo/GBM con las features ya disponibles.
- **Decisiones tomadas (y por qué):**
  - Liga MX histórica va al dataset **research-only**, no al corpus publicable: la licencia de API-Football sigue sin confirmar para uso comercial.
  - Se cachean las temporadas accesibles y se registran las bloqueadas en el manifiesto; no se reintentan en cada corrida para no gastar presupuesto.
- **Riesgos o deuda:**
  - Presupuesto Free: 100 solicitudes/día compartidas con el snapshot de Liga MX; la corrida consume 6 y deja margen.
  - El plan Free puede cambiar de temporadas accesibles; el manifiesto deja la evidencia de lo observado el 2026-11-09.
- **Cómo probarlo:**
  - `pnpm history:odds` (6 solicitudes, 1,022 filas de Liga MX), `pnpm backtest:history --include-research-history` (reporte research con Liga MX n=982) y `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (36 tests).

### MODEL-01 · Elo calibrado y mezcla con Dixon-Coles — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `packages/models/src/football/elo.ts`: Elo incremental para clubes con ventaja de local, multiplicador por diferencia de goles, regresión a la media al cambiar de temporada y modelo de empate decreciente. API `createEloTracker` (predice antes de actualizar, sin fuga) y helpers `eloExpectedScore` / `goalDifferenceMultiplier`.
  - Hiperparámetros elegidos con **validación temporal** en Premier League: ajuste en 2010-11…2018-19 y evaluación en 2019-20…2026-27 (K=15, localía 65, regresión 0.10, empate 0.30 − 0.0005·|Δ|). 540 combinaciones evaluadas; 8 pruebas unitarias.
  - `history-backtest` incorpora Elo y una **mezcla 50/50** con Dixon-Coles; el reporte muestra DC, Elo, mezcla, ingenuo, mercado y los Δ con bootstrap.
  - Resultado: Elo solo queda a la par de Dixon-Coles, pero la mezcla gana en las 6 ligas. Δ mezcla−DC de −0.0012 a −0.0025; IC 95 % excluye 0 en PL, LaLiga, Bundesliga y Ligue 1. Frente al mercado, la brecha baja de 0.0175–0.0237 a **0.0152–0.0225** (cierra 10–15 %).
  - En el benchmark research (entrena con 1993-2010): mezcla 0.9744 en PL (DC 0.9771) y 0.9703 en LaLiga (DC 0.9728).
- **No hecho / fuera de alcance:**
  - La mezcla no se publica: sigue siendo candidata hasta pasar el gate de `PREDICTION_ARCHITECTURE.md` §5.
  - El peso de la mezcla está fijo en 0.5 (elegido a priori, no ajustado sobre el test).
  - GBM/features as-of (siguiente paso).
- **Decisiones tomadas (y por qué):**
  - Elo se selecciona en una ventana anterior al periodo evaluado para no contaminar la comparación.
  - La mezcla se evalúa sin optimizar el peso en el test; un peso aprendido queda para cuando exista un GBM que lo haga con validación propia.
- **Riesgos o deuda:**
  - Elo no aporta por sí solo; su valor está en la mezcla y como feature futura. Si el GBM no usa Elo, la mezcla 50/50 es el candidato actual más fuerte.
  - La mejora de 0.002 en log loss es real pero pequeña: la brecha frente al mercado sigue en ~0.02.
- **Cómo probarlo:**
  - `pnpm backtest:history` (público, tabla DC/Elo/mezcla) y `pnpm backtest:history --include-research-history`; `pnpm --filter @pitchlab/models exec vitest run --pool=threads` (21 tests) y `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (36 tests).

### MODEL-02 · Regresión logística y stacking con features as-of — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `packages/models/src/football/logistic.ts`: regresión logística multinomial (softmax) con estandarización de features, L2 y descenso de gradiente determinista; `fitMultinomialLogistic` / `predictMultinomialLogistic` y 4 pruebas unitarias.
  - `history-backtest` construye features as-of por partido: probabilidades de Dixon-Coles y Elo, descanso (días desde el último partido), forma (puntos de los últimos 5) y diferencia de tiros a puerta (cuando el dataset research tiene estadísticas). El modelo se reajusta cada 10 jornadas y predice las siguientes; evaluación solo con partidos posteriores.
  - Resultado del experimento (`--with-stack`): **no supera a la mezcla 50/50** salvo en Bundesliga (0.9941 vs 0.9957). PL 0.9748 vs 0.9744; LaLiga 0.9743 vs 0.9703; Serie A 0.9729 vs 0.9707; Ligue 1 1.0050 vs 0.9993; Liga MX 1.0104 vs 1.0020. La mezcla sigue siendo el mejor candidato.
  - Stack desactivado por defecto para que el benchmark público siga siendo rápido y reproducible; se activa con `--with-stack`.
- **No hecho / fuera de alcance:**
  - GBM real (LightGBM) con las mismas features y más capacidad.
  - Optimizar el peso de la mezcla o el número de iteraciones del stack con validación propia.
- **Decisiones tomadas (y por qué):**
  - El stack se descarta como candidato publicado: con 12 features lineales no aporta sobre la mezcla y añade complejidad.
  - Se conserva el código y el flag porque son la base del GBM y permiten repetir el experimento.
- **Riesgos o deuda:**
  - Las features de tiros dependen del dataset research (big-five); Liga MX y las temporadas antiguas no las tienen.
  - El stack reajusta sobre muestras de predicciones pasadas; con pocos datos al inicio es ruidoso (primeros ~400 partidos sin stack).
- **Cómo probarlo:**
  - `pnpm backtest:history --include-research-history --with-stack` (reporte research con columna Stack); `pnpm --filter @pitchlab/models exec vitest run --pool=threads` (25 tests) y `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (36 tests).

### MODEL-03 · GBM (LightGBM) sobre features as-of — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `pnpm backtest:history --export-features` exporta una fila por partido evaluado con features as-of (Elo, Dixon-Coles, descanso, forma, tiros a puerta), probabilidades base y cuota de mercado. Archivo `Reportes/modelos/features-asof.jsonl` (25,554 filas, gitignored).
  - `services/models/train_gbm.py` (LightGBM 4.7 vía API nativa, sin scikit-learn): walk-forward por temporada con entrenamiento agrupado entre ligas y one-hot de liga; compara GBM contra DC, Elo, mezcla y mercado con bootstrap pareado.
  - `services/models/README.md` y `requirements.txt`; dependencias locales en `services/models/.deps` (gitignored) porque el sandbox bloquea `pip install` global/temporal.
  - Resultado: el GBM **no supera a la mezcla**. Premier League 0.9710 vs 0.9695, LaLiga 0.9729 vs 0.9703, Bundesliga 0.9930 vs 0.9915, Serie A 0.9726 vs 0.9707, Ligue 1 1.0019 vs 0.9993; Δ +0.0015 a +0.0027 con IC 95 % que incluye el 0. Frente al mercado sigue a +0.017–0.024.
- **No hecho / fuera de alcance:**
  - Features nuevas (xG, alineaciones, lesiones, cuotas de apertura) que sí podrían mover la aguja.
  - Integrar el GBM al pipeline de predicción live (sigue siendo experimento).
- **Decisiones tomadas (y por qué):**
  - Entrenamiento agrupado entre ligas: con una sola liga hay muy pocas filas por temporada y el GBM sobreajusta (log loss 1.02–1.06). El one-hot de liga recupera la escala y lo deja cerca de la mezcla.
  - No se toca el benchmark público: GBM y stacking son experimentos opt-in; la mezcla 50/50 sigue siendo el candidato.
- **Riesgos o deuda:**
  - `services/models/.deps` son ~112 MB locales; no se versiona. El README documenta la instalación.
  - LightGBM sin scikit-learn: se usa `lgb.train`, no el wrapper `LGBMClassifier`.
- **Cómo probarlo:**
  - `pnpm backtest:history --include-research-history --export-features=Reportes/modelos/features-asof.jsonl`; `$env:PYTHONPATH="services/models/.deps"; python services/models/train_gbm.py`; reporte `Reportes/modelos/BACKTEST-GBM.md`.

### DATA-05 · xG histórico (Understat vía Wayback) y Elo-xG — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `services/ingest/src/history/understat.ts` + `xg.ts`: scrapea Understat a través de la Wayback Machine (el sitio en vivo respondía «We will come back soon»), elige el snapshot más reciente con ≥90 % de los partidos, decodifica `datesData`, normaliza ids con los slugs del corpus y cachea el HTML en `data/history/raw/understat/`.
  - Dataset `data/history/research/xg/`: **18,241 partidos** de las cinco grandes (2014-15 a 2025-26), 18,209 emparejados con el corpus; cobertura 62–79 % (Understat empieza en 2014 y algunos snapshots son parciales). Reporte: `Reportes/datos/XG-QUALITY.md`.
  - Nuevo candidato **Elo-xG**: ratings actualizadas con xG en vez de goles y su mezcla con Dixon-Coles (50/50). En el benchmark research: Premier League **0.9720** vs 0.9744 de la mezcla 50/50; LaLiga 0.9673 vs 0.9703; Bundesliga 0.9933 vs 0.9957; Serie A 0.9670 vs 0.9707; Ligue 1 0.9985 vs 0.9993. Δ de −0.0036 a −0.0065, IC 95 % que excluye el 0 en las cinco ligas.
  - La brecha frente al mercado baja a **0.012–0.018** (antes 0.017–0.025). Es la mayor mejora del motor y proviene de datos nuevos.
  - xG también entra como feature del GBM (`xg_home`, `xg_away`): mejora poco (+0.001–0.002), así que el valor está en las ratings xG.
- **No hecho / fuera de alcance:**
  - xG para Liga MX (Understat no la cubre) y temporadas previas a 2014-15.
  - Poisson sobre xG (afinar Dixon-Coles) y xG por tiro/periodo.
  - Publicar el dataset: es research-only por licencia.
- **Decisiones tomadas (y por qué):**
  - Wayback en lugar de scraping directo: el sitio estaba caído y el archivo conserva el HTML con los datos.
  - xG solo entra al benchmark research (igual que el histórico 1993-2010): el benchmark público sigue reproducible sin datos research.
  - La mezcla con xG se evalúa con peso fijo 0.5; no se ajusta sobre el test.
- **Riesgos o deuda:**
  - Depende de Wayback: si un snapshot falta o es parcial, esa temporada queda incompleta (Ligue 1 2024-25: 171/306).
  - Understat no declara licencia; el dataset no se versiona y no debe publicarse.
  - El Elo-xG necesita goles como fallback cuando no hay xG (Liga MX, pretemporadas).
- **Cómo probarlo:**
  - `pnpm history:xg` (18,241 filas, 5 ligas); `pnpm backtest:history --include-research-history` (reporte con columnas Elo-xG y Mezcla-xG); `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (41 tests, 5 nuevos de Understat).

### MODEL-04 · Dixon-Coles sobre xG y totales con xG — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `fitDixonColes` acepta goles fraccionarios (xG): la rejilla de ρ redondea al marcador entero. Prueba de regresión con xG en `packages/models/tests/models.test.ts`.
  - Benchmark: se ajusta un segundo Dixon-Coles sobre xG (solo filas con xG) y se evalúan **totales O/U 2.5 con xG** frente a goles y mercado; nueva columna `totalsXg` en el reporte research.
  - Experimentos: (a) mezcla DC-goles + DC-xG = 0.9682 vs 0.9712 de DC-goles en Premier League, pero combinada con Elo-xG solo mejora 0.0003 → no se integra; (b) totales xG mixtos: mejora Serie A y Ligue 1 (~0.004), empeora LaLiga y PL; (c) hiperparámetros del Elo-xG no estables con validación temporal (K=8 gana en validación y pierde en test).
- **No hecho / fuera de alcance:**
  - Poisson bivariado con xG por equipo y covariables.
  - xG por tiro/periodo (requeriría páginas de partido de Understat).
- **Decisiones tomadas (y por qué):**
  - No se cambia el candidato publicado: la mejora de DC-xG en 1X2 es marginal y no consistente; se documenta el experimento.
  - Los totales xG quedan como evaluación, no como modelo de producción, hasta verlos consistentes en más ligas.
- **Riesgos o deuda:**
  - El modelo xG se ajusta solo con partidos que tienen xG (2014+), así que su ventana efectiva es menor que la del modelo de goles.
  - Understat sigue caído; las temporadas 2025-26 están incompletas.
- **Cómo probarlo:**
  - `pnpm backtest:history --include-research-history` (columna LogLoss xG en totales); `pnpm --filter @pitchlab/models exec vitest run --pool=threads` (32 tests).

### DATA-06 · xG de 2026-27 y descargador incremental de estadísticas de Liga MX — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - El dataset xG incorpora la temporada **2026-27** con las columnas `HxG`/`AxG` de football-data.co.uk (la única temporada en que las publica). Total: **18,693 partidos**, 18,442 emparejados con el corpus; cobertura 63.4–80.1 % por liga.
  - `services/ingest/src/history/api-football-stats.ts` + `pnpm history:api-stats`: descarga `/fixtures/statistics` de Liga MX de forma incremental y reanudable, con caché por fixture, presupuesto diario (90) y reconstrucción de `liga-mx-stats.jsonl`.
  - Hallazgo: API-Football devuelve `expected_goals = null` para Liga MX (sí trae xG en otras competiciones). Sí entrega tiros, tiros a puerta, córners, posesión y tarjetas.
  - La cuota diaria se agotó durante la prueba (90/90) y quedaron 10 partidos cacheados; el descargador continuará en las siguientes corridas sin repetir trabajo.
- **No hecho / fuera de alcance:**
  - Liga MX sigue sin xG: habría que buscar otra fuente o confirmar que API-Football lo habilite.
  - Integrar las estadísticas de Liga MX al benchmark cuando la cobertura sea suficiente (hoy 10 partidos).
- **Decisiones tomadas (y por qué):**
  - El xG de 2026-27 entra por football-data.co.uk en vez de Understat: son los mismos datos y no depende de Wayback.
  - El descargador de API-Football se diseñó incremental para no agotar cuota ni repetir fixtures ya cacheados.
- **Riesgos o deuda:**
  - Presupuesto Free compartido con el snapshot de Liga MX; 90 solicitudes/día para ~340 fixtures por temporada.
  - Las estadísticas de Liga MX no incluyen xG, así que no mejoran el Elo-xG de esa liga.
- **Cómo probarlo:**
  - `pnpm history:xg --offline` (18,693 filas), `pnpm history:api-stats --build-only` (dataset desde caché) y `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (45 tests, 3 nuevos de estadísticas).

### DATA-07 · Estadísticas de Liga MX desde ESPN — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `services/ingest/src/history/espn-liga-mx.ts` + `pnpm history:espn`: enumera los calendarios de los 18 equipos en ESPN, deduplica eventos y descarga el `summary` de cada partido terminado (sin API key ni cuota). Parsea tiros, tiros a puerta, córners, posesión y tarjetas, y empareja con el corpus por equipos y fecha (±2 días).
  - Dataset `data/history/research/liga-mx-espn-stats.jsonl`: **278 de 340 partidos** de 2024-25 emparejados; research-only por licencia.
  - Integración como features del benchmark (tiros a puerta) para Liga MX y experimentos: Elo de tiros 1.0032 vs mezcla actual 1.0030; GBM con features ESPN 1.0056 vs 1.0020. **Sin mejora**, documentado.
  - Understat sigue caído; el xG de 2026-27 ya entra por football-data.co.uk.
- **No hecho / fuera de alcance:**
  - Ampliar ESPN a 2021-2023 (el adaptador lo permite con `--seasons`).
  - xG para Liga MX: ESPN no lo trae y API-Football devuelve `null`.
- **Decisiones tomadas (y por qué):**
  - Se conserva el dataset ESPN aunque no mejore el candidato: cubre un hueco de datos del producto y sirve para features cuando haya más temporadas.
  - No se cambia la mezcla publicada; los experimentos quedan fuera del reporte público.
- **Riesgos o deuda:**
  - Sin cuota, pero ESPN puede cambiar el esquema o bloquear; el adaptador cachea todo y tolera fallos por evento.
  - Solo 2024-25 está cubierto; 2021-2023 requeriría otra corrida (~340 summaries por temporada).
- **Cómo probarlo:**
  - `pnpm history:espn --seasons=2024 --offline` (278 partidos desde caché) y `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (50 tests, 2 nuevos de ESPN).

### DATA-08 · ESPN ampliado a cuatro temporadas de Liga MX — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - El constructor ESPN ahora mergea con el dataset existente y empareja contra los ids del **corpus canónico y del research** (las temporadas 2021-22…2023-24 solo existen en research).
  - Dataset: **1,054 partidos** de Liga MX con tiros, tiros a puerta, córners, posesión y tarjetas: 2020-21 (135), 2022-23 (308), 2023-24 (305), 2024-25 (306). Research-only.
  - Experimento con histórico ampliado: Elo de tiros 1.0072; DC + Elo de tiros 1.0022 (igual que la mezcla actual); mezcla triple DC + Elo + Elo-tiros **1.0016** (mejora 0.0006). No se cambia el candidato por una diferencia tan pequeña.
- **No hecho / fuera de alcance:**
  - xG real para Liga MX (ESPN/API-Football no lo dan).
  - Integrar el Elo-tiros al reporte público; la mejora no supera el ruido.
- **Decisiones tomadas (y por qué):**
  - Merge incremental en el constructor: cada corrida conserva las temporadas anteriores.
  - Se prioriza cobertura de datos sobre un cambio de modelo marginal.
- **Riesgos o deuda:**
  - 2020-21 solo tiene 135 de 342 partidos emparejados (los summaries de esa temporada están incompletos en ESPN).
  - La licencia de ESPN sigue sin clasificar; el dataset no se versiona.
- **Cómo probarlo:**
  - `pnpm history:espn --seasons=2024,2023,2022,2021 --offline` (1,054 partidos desde caché) y `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (50 tests).

### MODEL-05 · xG estimado por tiros y Elo-xG en todas las ligas — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `services/ingest/src/history/xg-estimate.ts`: regresión lineal tiros/SOT → xG ajustada sobre **18,692 partidos** de las cinco grandes con xG y estadísticas (R² ≈ 0.51). Coeficientes documentados.
  - `pnpm history:xg` rellena con xG estimado (`estimated-from-shots`) los partidos sin xG real: 2010-2014, 2025-26 incompleto y toda Liga MX. Dataset xG: **41,718 filas**, cobertura **100 %** del corpus en las cinco grandes y 34.7 % en Liga MX.
  - Benchmark research: la mezcla Elo-xG gana a la mezcla 50/50 en todas las ligas (Δ −0.0034 a −0.0075; IC 95 % excluye el 0 en cuatro de cinco) y Liga MX mejora de 1.0020 a **1.0011**. Brecha frente al mercado: **0.0116–0.0171**.
- **No hecho / fuera de alcance:**
  - El xG estimado no sustituye al real en la published model; el benchmark público sigue sin datos research.
  - La estimación es lineal con tiros/SOT; un GBM de xG podría afinarla.
- **Decisiones tomadas (y por qué):**
  - Estimar xG desde tiros permite extender el Elo-xG a temporadas sin proveedor y a Liga MX, con mejora medida.
  - Se marca la fuente en cada fila (`estimated-from-shots`) para no confundirla con xG observado.
- **Riesgos o deuda:**
  - El Elo-xG con xG estimado empeora solo (0.9866 en PL), pero su mezcla con DC sigue ganando; el ruido lo absorbe la mezcla.
  - La regresión se ajustó en las cinco grandes y se transfiere a Liga MX; puede tener sesgo de liga.
- **Cómo probarlo:**
  - `pnpm history:xg --offline` (41,718 filas) y `pnpm backtest:history --include-research-history` (reporte con Elo-xG y mezcla-xG en Liga MX); `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (50 tests).

### MODEL-06 · GBM y DC-xG con cobertura completa de xG — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - GBM reentrenado con el xG estimado (cobertura 100 % en las cinco grandes): empata con la mezcla en Bundesliga (0.9917 vs 0.9915) y Serie A (0.9708 vs 0.9707); pierde en Premier League (+0.0015), LaLiga (+0.0031), Ligue 1 (+0.0028) y Liga MX (+0.0030). No se adopta.
  - Nueva evaluación **DC-xG** (promedio DC-goles + DC-xG) mezclada con Elo-xG: mejora LaLiga (0.9658 vs 0.9670), Bundesliga (0.9917 vs 0.9928) y Serie A (0.9655 vs 0.9660); neutral en PL/Ligue 1 y peor en Liga MX (1.0025 vs 1.0011). Se añade como columna/tabla de evaluación, no como candidato.
  - Reporte research regenerado con la tabla "Mezcla con DC-xG".
- **No hecho / fuera de alcance:**
  - Elegir por liga el mejor candidato (sería selección sobre test).
  - Poisson bivariado con xG y covariables.
- **Decisiones tomadas (y por qué):**
  - No se adopta DC-xG global: la ganancia aparece en tres ligas pero desaparece/negativa en las otras dos, sin un criterio previo que diga cuál usar.
  - El GBM se mantiene como experimento documentado.
- **Riesgos o deuda:**
  - El xG estimado en Liga MX añade ruido al DC-xG; por eso empeora allí.
  - La tabla DC-xG del reporte público repite la mezcla-xG porque no hay xG en ese benchmark.
- **Cómo probarlo:**
  - `pnpm backtest:history --include-research-history` (tabla "Mezcla con DC-xG") y `$env:PYTHONPATH="services/models/.deps"; python services/models/train_gbm.py` (reporte GBM).

### MODEL-07 · Validación temporal del peso de mezcla — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - Se evaluó el peso de la mezcla DC + Elo-xG (0.3–0.8) eligiendo en 2010-2019 y midiendo en 2020-2026. El peso óptimo por liga no generaliza: Ligue 1 −0.0029 y Serie A −0.0011 a favor; Bundesliga +0.0012 y Liga MX +0.0023 en contra; Premier League y LaLiga neutras.
  - Decisión: mantener el peso fijo 0.5 y no introducir parámetros por liga elegidos sobre el test.
  - Understat sigue caído (verificado dos veces); no se pudo completar 2025-26.
- **No hecho / fuera de alcance:**
  - Peso global único (se descartó por la mezcla de signos por liga).
  - Recalibrar Elo-xG con el peso como parámetro del modelo.
- **Decisiones tomadas (y por qué):**
  - No adoptar pesos por liga: la validación temporal muestra que la ganancia en validación no se transfiere.
- **Riesgos o deuda:**
  - La mezcla con peso 0.5 puede ser subóptima en Ligue 1/Serie A, pero no hay evidencia estable para cambiarla.
- **Cómo probarlo:**
  - `pnpm backtest:history --include-research-history`; el experimento de pesos está documentado en este handoff (no se añadió CLI para no fijar parámetros sobre test).

### MODEL-08 · Peso global de mezcla: Elo-xG 0.7/0.3, Elo de goles 0.5 — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - Validación temporal (elección 2010-2019, test 2020-2026) del peso de la mezcla **DC + Elo-xG**: el óptimo global es **0.7/0.3**. En test mejora PL (−0.0009), LaLiga (−0.0004), Serie A (−0.0012), Ligue 1 (−0.0029) y Liga MX (−0.0006); empeora Bundesliga (+0.0012). Neto ≈ −0.0009 por partido.
  - La misma validación para **DC + Elo de goles** (modelo público) da **0.5**, sin cambio.
  - No se adopta el 0.7/0.3 todavía: implica cambiar el candidato research y regenerar reportes; queda como siguiente paso.
  - Understat sigue caído.
- **No hecho / fuera de alcance:**
  - Implementar `blendXgTuned` (0.7/0.3) y regenerar el reporte research.
  - Pesos por liga (no generalizan).
- **Decisiones tomadas (y por qué):**
  - No tocar el modelo público: su peso óptimo validado es 0.5.
  - El 0.7/0.3 se documenta antes de adoptarlo para no romper comparabilidad del reporte.
- **Riesgos o deuda:**
  - Bundesliga empeora con 0.7; el peso global es una media, no el óptimo de cada liga.
- **Cómo probarlo:**
  - `pnpm backtest:history --include-research-history` (comparar columnas de mezcla); los experimentos de peso están descritos aquí.

### MODEL-09 · Mezcla-xG ponderada 0.7/0.3: implementada y descartada — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - Se implementó `blendXgTuned` (0.7 DC / 0.3 Elo-xG) en el benchmark research y se regeneró el reporte con la tabla "Mezcla-xG con peso validado".
  - Resultado sobre toda la historia: **no mejora** el 0.5/0.5. LaLiga 0.9678 vs 0.9670, Bundesliga 0.9936 vs 0.9928, Serie A 0.9672 vs 0.9660, Liga MX 1.0017 vs 1.0011; solo Ligue 1 mejora (0.9984 vs 0.9987). El peso 0.7 solo funcionaba en la ventana 2020-2026, no en el benchmark completo.
  - Se mantiene 0.5 como peso del candidato; `blendXgTuned` queda como columna de evaluación.
- **No hecho / fuera de alcance:**
  - Peso dependiente de la temporada (0.5 antes de 2020, 0.7 después); sería otro parámetro sobre test.
- **Decisiones tomadas (y por qué):**
  - No adoptar 0.7/0.3: la mejora no se sostiene al evaluar toda la historia.
  - Documentar el resultado negativo para no repetir el experimento.
- **Riesgos o deuda:**
  - El reporte research incluye una columna que pierde; puede confundir si no se lee la nota.
- **Cómo probarlo:**
  - `pnpm backtest:history --include-research-history` (tabla "Mezcla-xG con peso validado").

### DATA-09 · ESPN 2020-21 completo y prueba de clima — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - ESPN Liga MX: se añadió la temporada 2020 (Apertura 2020) y la cobertura subió a **1,274 partidos**: 2019-20 (80), 2020-21 (275), 2022-23 (308), 2023-24 (305), 2024-25 (306).
  - El xG estimado de Liga MX cubre ahora **633 partidos del corpus (53.2 %)** y el dataset xG total llega a **41,938 filas**. La mezcla-xG de Liga MX mejora de 1.0011 a **1.0003** (DC 1.0050; IC del Δ incluye 0).
  - Prueba de señal de **clima** (Open-Meteo) en 4,691 partidos de Premier League: over 2.5 del 52.8 % en seco vs 55.7–56.1 % con lluvia, sin control de confusión; no se integra como feature.
- **No hecho / fuera de alcance:**
  - Dataset de clima: la API gratuita limita solicitudes/minuto y la señal no justifica el pipeline.
  - ESPN 2025-26/2026-27: el corpus canónico de Liga MX no tiene esas temporadas.
- **Decisiones tomadas (y por qué):**
  - Priorizar cobertura de estadísticas ESPN (gratis, sin cuota) sobre clima (señal débil y API limitada).
- **Riesgos o deuda:**
  - La mejora de Liga MX sigue sin IC que excluya el 0; el xG es estimado, no observado.
- **Cómo probarlo:**
  - `pnpm history:espn --seasons=2024,2023,2022,2021,2020 --offline` (1,274 partidos) y `pnpm history:xg --offline` (41,938 filas); `pnpm backtest:history --include-research-history`.

### DATA-10 · ESPN 2018-19 y 2019-20: más cobertura, sin mejora de modelo — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - ESPN Liga MX suma 2018-19 (210 partidos) y completa 2019-20 (88). Total: **1,492 partidos** en seis temporadas.
  - xG estimado de Liga MX: **851 partidos del corpus (71.6 %)**; dataset xG total **42,156 filas**.
  - La mezcla-xG de Liga MX pasa a **1.0012** (DC 1.0050; mezcla 1.0020). Con 1,274 partidos había dado 1.0003: **más cobertura antigua no mejora el modelo**, porque el xG estimado de temporadas viejas añade ruido al Elo-xG.
  - Probado sin éxito: Understat (caído), Wayback 2025-26 (solo snapshots de mantenimiento), SofaScore/FotMob/ESPN para xG real de Liga MX.
- **No hecho / fuera de alcance:**
  - xG real de Liga MX: ninguna fuente gratuita probada lo ofrece.
  - Revertir la cobertura antigua: el dataset es más completo y la diferencia es pequeña; se documenta el efecto.
- **Decisiones tomadas (y por qué):**
  - Se conserva 2018-19/2019-20 pese al empeoramiento de 0.0009: la cobertura es un activo y el IC del Δ incluye 0.
  - No se integra xG estimado de temporadas antiguas con más peso que el reciente (sería otro parámetro sobre test).
- **Riesgos o deuda:**
  - El xG estimado de Liga MX mezcla temporadas con y sin estadísticas; el Elo-xG puede estar sobreajustado a las recientes.
- **Cómo probarlo:**
  - `pnpm history:espn --seasons=2024,2023,2022,2021,2020,2019,2018 --offline` (1,492 partidos) y `pnpm history:xg --offline` (42,156 filas); reporte research regenerado.

### DATA-11 · Auditoría del dataset xG y reproducibilidad offline — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - Auditoría manual de todos los JSONL research: **0 duplicados** en xG (42,156 filas), 0 xG negativos o >10, fechas y temporadas válidas; ESPN (1,492) sin duplicados ni outliers; datasets research sin duplicados.
  - `validateXgGames` en `services/ingest/src/history/xg.ts`: el constructor comprueba ids únicos, xG finito y en [0,10], fecha `YYYY-MM-DD`, temporada `YYYY-YY` y equipos no vacíos; lanza error con muestra de problemas.
  - Nuevas pruebas: `tests/xg-validation.test.ts` (4 casos) y `tests/xg-offline.test.ts` (reconstruye dos veces desde caché y verifica `datasetId` estable; se omite si no hay caché).
  - El 50 % de las filas de las cinco grandes es xG estimado por tiros (5,600 en Premier League), no xG observado; queda documentado para no sobreinterpretar el Elo-xG.
- **No hecho / fuera de alcance:**
  - Validación de los JSONL de fútbol research (cuotas/estadísticas) más allá de duplicados.
  - Limpieza de la caché raw (crece con cada corrida).
- **Decisiones tomadas (y por qué):**
  - La validación vive en el constructor, no en un script aparte: cualquier regeneración falla rápido si el dataset se corrompe.
  - La prueba offline se omite sin caché para no romper CI.
- **Riesgos o deuda:**
  - La proporción de xG estimado es alta; el Elo-xG de temporadas antiguas es más ruidoso.
- **Cómo probarlo:**
  - `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads tests/xg-validation.test.ts tests/xg-offline.test.ts`; `pnpm history:xg --offline`.

### DATA-12 · Validación de los datasets research y tamaño de caché — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - Auditoría de los JSONL research (60,553 filas): sin duplicados, cuotas en rango y marcadores razonables. Se detectaron 6 casos de tiros a puerta > tiros (Premier League 5, Serie A 1) que la fuente publica mal.
  - `validateResearchGames` en `services/ingest/src/history/research.ts`: bloquea ids duplicados, fechas/temporadas inválidas, marcadores >15, cuotas fuera de (1, 1000) y over/under incompletas; registra como **aviso** los tiros a puerta > tiros y valores atípicos. El constructor falla antes de escribir si hay errores.
  - 4 pruebas nuevas en `tests/research-validation.test.ts`.
  - Medición de caché raw: **~2.2 GB** (`data/history/raw/`), sobre todo ESPN (1.5 GB de summaries) y nflverse (605 MB). Documentado como borrable si no se reconstruyen datasets.
- **No hecho / fuera de alcance:**
  - Política automática de retención/limpieza de caché.
  - Compactar los summaries de ESPN (se guardan completos, ~400 KB cada uno).
- **Decisiones tomadas (y por qué):**
  - Los avisos de estadísticas no bloquean la reconstrucción: son 6 de 60 mil filas y la fuente no es corregible.
  - No se borra caché automáticamente para no romper `--offline`.
- **Riesgos o deuda:**
  - 2.2 GB de caché local; si el disco aprieta, borrar `data/history/raw/espn/summaries` y `nflverse`.
- **Cómo probarlo:**
  - `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads tests/research-validation.test.ts`; `pnpm history:odds --offline` reconstruye y aplica la validación.

### DATA-13 · Bug de pruning en research y restauración de datasets — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - Detectado un bug destructivo: `pruneStaleFiles` borraba **cualquier** `.jsonl` del directorio research que no se hubiera construido en la corrida, incluidos `liga-mx-enriched.jsonl` (otro agente), `liga-mx-espn-stats.jsonl`, `liga-mx-stats.jsonl` y `liga-mx.jsonl`, y también ligas no pedidas en builds parciales.
  - Corregido: la poda solo se ejecuta en construcciones completas y solo sobre los JSONL de ligas que el constructor posee; los datasets auxiliares quedan intactos.
  - Restaurados los archivos perdidos: research de Liga MX (`liga-mx.jsonl`), estadísticas ESPN (1,492), stats de API-Football (10) y `liga-mx-enriched.jsonl` (1,671) regenerado con `tools/extract_espn_ligamx.py`.
  - Prueba de regresión `tests/research-prune.test.ts`: la poda elimina ligas viejas y conserva datasets auxiliares.
- **No hecho / fuera de alcance:**
  - Mover los datasets auxiliares a un subdirectorio propio (`research/aux/`) para aislarlos por diseño.
- **Decisiones tomadas (y por qué):**
  - Se mantiene todo en `research/` por compatibilidad, pero con lista blanca de nombres podables.
  - La poda no corre en builds parciales para no borrar ligas no solicitadas.
- **Riesgos o deuda:**
  - Cualquier nuevo dataset auxiliar en `research/` debe añadirse a la lista blanca si se quiere podar; por defecto se conserva.
- **Cómo probarlo:**
  - `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads tests/research-prune.test.ts`; `pnpm history:odds --offline` (build completo) y comprobar que los auxiliares siguen.

### DATA-14 · Caché de ESPN compactada (1.5 GB → 82 MB) — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - Los summaries de ESPN se guardaban completos (~400 KB por partido, 1.5 GB en total). Ahora se cachea solo `{ names, stats }` (~0.2 KB) con `compactEspnSummary`; el constructor escribe compacto al descargar y lee ambos formatos.
  - `compactEspnSummaries(rootDir)` convierte cachés antiguas in situ. Ejecutado sobre 1,492 summaries: **1.5 GB → 82 MB** (~1.4 GB ahorrados). La caché raw total baja de **2.2 GB a 823 MB**.
  - Reconstrucción offline verificada tras compactar: 1,492 partidos, mismo dataset.
  - Nueva prueba en `tests/espn.test.ts` para el formato compacto.
- **No hecho / fuera de alcance:**
  - Compactar nflverse (605 MB) o native-stats; no se usan tanto como ESPN.
- **Decisiones tomadas (y por qué):**
  - Se conservan nombres y estadísticas, no el payload completo: es todo lo que el constructor necesita y mantiene la reconstrucción offline.
  - Formato retrocompatible: si el archivo no tiene `stats`/`names`, se parsea como summary completo.
- **Riesgos o deuda:**
  - Otros scripts que esperasen el JSON completo de ESPN en `raw/espn/.../summaries` ya no lo encontrarán; los nuestros leen compacto.
- **Cómo probarlo:**
  - `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads tests/espn.test.ts`; `pnpm history:espn --seasons=2024,2023,2022,2021,2020,2019,2018 --offline` (1,492 partidos).

### DATA-15 · Catálogo e integridad de datasets (`pnpm data:catalog`) — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `scripts/data-catalog.mjs` + `pnpm data:catalog`: recorre los 22 datasets (corpus, research, xG, auxiliares), cuenta filas, tamaño, duplicados y rango de fechas, y escribe `Reportes/datos/DATA-CATALOG.md` y `data-catalog.json`.
  - Resultado: **140,050 filas, 65.3 MB, 0 duplicados** en 22 datasets. No se modifica ningún dataset; el script solo lee.
  - El catálogo incluye licencia y builder de cada archivo, y avisa si hay duplicados o errores de parseo.
- **No hecho / fuera de alcance:**
  - Verificación de integridad de parquet NFL (otro pipeline) y de los manifests de corpus/research.
  - Checksum por archivo en el catálogo (se puede añadir con sha256).
- **Decisiones tomadas (y por qué):**
  - Un script de solo lectura en vez de un builder: el catálogo debe poder correr en cualquier momento sin efectos.
  - Incluir datasets auxiliares (ESPN, API, enriquecido) para detectar borrados accidentales como el de la ronda 20.
- **Riesgos o deuda:**
  - El catálogo crece con cada dataset nuevo; hay que añadirlo a las listas del script.
- **Cómo probarlo:**
  - `pnpm data:catalog` (0 duplicados, 140,050 filas) y abrir `Reportes/datos/DATA-CATALOG.md`.

### DATA-16 · Checksums SHA-256 y verificación de manifiestos en el catálogo — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `pnpm data:catalog` ahora calcula **SHA-256** de cada archivo y lo compara con el hash y las filas declarados en los manifiestos de corpus, research y xG.
  - El manifiesto de xG incluye `fileSha256` por liga (antes solo filas).
  - Resultado: **22 datasets, 140,050 filas, 0 duplicados y 0 discrepancias** de manifiesto (hashes y filas coinciden).
  - El catálogo avisa por consola y en el reporte si un hash o el número de filas no coincide.
- **No hecho / fuera de alcance:**
  - Checksums de los auxiliares sin manifiesto (ESPN, API stats, enriquecido): aparecen con `—` en la columna Manifiesto.
  - Firma de los manifiestos (solo se comparan hashes de contenido).
- **Decisiones tomadas (y por qué):**
  - El hash se calcula al vuelo en el catálogo en vez de guardarse aparte: siempre refleja el archivo real.
  - Se compara también el número de filas para detectar cambios de formato sin cambio de hash aparente.
- **Riesgos o deuda:**
  - Si se regenera un dataset sin actualizar su manifiesto, el catálogo lo marcará como discrepancia (comportamiento deseado).
- **Cómo probarlo:**
  - `pnpm data:catalog` (debe imprimir 0 discrepancias) y revisar la columna Manifiesto en `Reportes/datos/DATA-CATALOG.md`.

### DATA-17 · Manifiestos con hash para datasets auxiliares — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - Los manifiestos de **ESPN** (`liga-mx-espn-stats.manifest.json`) y **API-Football** (`liga-mx-stats.manifest.json`) incluyen ahora `fileSha256`.
  - El catálogo lee ambos manifiestos y verifica hash y filas: las dos filas pasan de `—` a **ok**.
  - `liga-mx-enriched.jsonl` sigue sin manifiesto porque lo genera un tool de otro agente; aparece con `—` y se documenta.
- **No hecho / fuera de alcance:**
  - Manifiesto para `liga-mx-enriched.jsonl`: habría que añadirlo al script Python que lo genera.
- **Decisiones tomadas (y por qué):**
  - No se toca el tool de otro agente; el catálogo marca el hueco en vez de inventar un hash.
- **Riesgos o deuda:**
  - Si se regenera ESPN/API sin pasar por el builder, el manifiesto quedará desactualizado y el catálogo lo detectará.
- **Cómo probarlo:**
  - `pnpm data:catalog` (0 discrepancias; ESPN y API en `ok`).

### DATA-18 · Verificación offline del pipeline (`pnpm verify:data`) — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `scripts/data-catalog.mjs` acepta `--verify`: además del catálogo, comprueba umbrales mínimos (≥20 datasets, ≥130,000 filas, >10,000 research PL, >9,000 xG PL, >1,000 ESPN, >6,000 corpus PL) y falla con código 1 si algo no cuadra.
  - Nuevo script `pnpm verify:data`. Resultado actual: OK con 22 datasets, 140,050 filas, 0 duplicados y 0 discrepancias.
  - Es un chequeo **offline y de solo lectura**: no descarga ni reconstruye nada.
- **No hecho / fuera de alcance:**
  - Verificar la caché raw (solo datasets publicados/research).
  - Integrarlo en CI (requiere los datos, que están gitignored).
- **Decisiones tomadas (y por qué):**
  - Umbrales mínimos en vez de igualdad exacta: detectan pérdidas grandes (como el borrado de la ronda 20) sin fallar por regeneraciones legítimas.
- **Riesgos o deuda:**
  - Los umbrales hay que actualizarlos si cambia el tamaño esperado de un dataset.
- **Cómo probarlo:**
  - `pnpm verify:data` (debe imprimir `[verify:data] OK`).

### DATA-19 · Datasets situacionales en el catálogo + experimento NFL — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - El catálogo incluye los dos datasets del pipeline situacional de otro agente: `nfl-situational-features.jsonl` (7,407 partidos) y `soccer-situational-features.jsonl` (41,581). Total: **24 datasets, 189,038 filas, 0 duplicados, 0 discrepancias**.
  - `pnpm verify:data` sigue en OK con los umbrales actuales.
  - Experimento NFL: LightGBM multiclass (local/empate/visita) walk-forward por temporada con las features situacionales (descanso, bye, techo, clima, puntos rolling, EPA de QB). Log loss 3 clases **0.6646** frente a **0.6545** del motor actual de ratings: no mejora. El mercado binario sin empates queda en 0.6099 como referencia.
- **No hecho / fuera de alcance:**
  - Ajuste fino del GBM NFL (rondas/hojas) y features propias; no se justifica con la diferencia actual.
  - Manifiestos de los datasets situacionales (los genera otro pipeline).
- **Decisiones tomadas (y por qué):**
  - No se adopta el GBM NFL: pierde 0.010 frente al motor de ratings.
  - Se documenta el experimento y el detalle de que `result` es el margen de puntos, no el signo (un error de interpretación inicial dio cifras imposibles).
- **Riesgos o deuda:**
  - Los datasets situacionales no tienen manifiesto propio; el catálogo los muestra con `—`.
- **Cómo probarlo:**
  - `pnpm verify:data` (24 datasets) y revisar la tabla del catálogo; el experimento NFL quedó como script temporal, no integrado.

### MODEL-12 · GBM NFL tuneado: sin mejora — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - Búsqueda de hiperparámetros del GBM NFL (learning rate 0.02–0.05, hojas 7–31, min_data 100–300, rondas 100–350) con walk-forward por temporada sobre las features situacionales.
  - Mejor configuración: lr 0.03, 7 hojas, min_data 200, 100 rondas → **0.6610** de log loss 3 clases. El motor actual de ratings da **0.6545**: el GBM sigue perdiendo 0.0065 incluso tuneado.
  - Se documenta el registro de fuentes descartadas (Understat caído, SofaScore/FotMob sin API, ESPN/API-Football sin xG de Liga MX, clima no concluyente) en `FREE_DATA_STRATEGY.md`.
- **No hecho / fuera de alcance:**
  - Blend ratings + GBM NFL: requeriría exportar probabilidades por partido del motor actual.
  - Más features propias de NFL (injurias semanales, viajes).
- **Decisiones tomadas (y por qué):**
  - No se adopta el GBM NFL: la diferencia es consistente y no hay señal para integrarlo.
  - Se cierra la exploración de xG/estadísticas con las fuentes actuales; Understat sigue caído.
- **Riesgos o deuda:**
  - La comparación 0.6610 vs 0.6545 no es exactamente el mismo conjunto de evaluación; aun así la diferencia es pequeña y no justifica integrar.
- **Cómo probarlo:**
  - Reproducir el script de tuning (temporal) o revisar los resultados en este handoff.

### MODEL-13 · Blend NFL ratings + GBM situacional (mejora 0.024 en test) — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - El benchmark NFL expone ahora `onNflPrediction` y el flag `--export-nfl=<ruta>`: exporta cada predicción del motor de ratings (7,204 filas).
  - `services/models/nfl_blend.py` entrena un LightGBM walk-forward con las features situacionales y mezcla con los ratings; elige el peso en validación (<2020) y evalúa en test (2020-2026).
  - Resultado (moneyline, empates = no local, comparable al reporte público): ratings **0.6691** → blend **0.6433** (peso 0.4); GBM solo 0.6452; mercado 0.6091. Sin empates: ratings 0.6682 → blend 0.6428. Mejora de **≈0.026** frente a ratings.
  - Reportes: `Reportes/modelos/NFL-BLEND.md` y `nfl-blend.json`. Sección nueva en `services/models/README.md`.
- **No hecho / fuera de alcance:**
  - Integrar el GBM en el producto: requeriría un job batch (Python) que genere las predicciones NFL con las features situacionales.
  - Reentrenar el GBM con datos posteriores a 2026 o añadir lesiones semanales.
- **Decisiones tomadas (y por qué):**
  - Se documenta como experimento research-only, no como candidato publicado: el blend depende de un pipeline externo y de features de otro agente.
  - El peso se elige en validación temporal para no seleccionar sobre test.
- **Riesgos o deuda:**
  - La comparación es sobre no-empates y un subconjunto; no es directamente el 0.6545 del reporte público. En moneyline sobre el subconjunto el motor da 0.6691, así que la mejora relativa del blend es lo relevante.
  - El GBM no está versionado como artefacto: se reentrena en cada corrida del script.
- **Cómo probarlo:**
  - `pnpm backtest:history --leagues=nfl --export-nfl=Reportes/modelos/nfl-ratings-predictions.jsonl`; `$env:PYTHONPATH="services/models/.deps"; python services/models/nfl_blend.py`.

### MODEL-14 · Artefacto versionado e inferencia del GBM NFL — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `nfl_blend.py --save-artifact` entrena el GBM final sobre todos los partidos etiquetados y guarda `services/models/artifacts/nfl_blend/model.txt` (276 KB) + `metadata.json` (features, params, seed, 6,630 filas, temporada máxima 2026, peso de mezcla 0.4 y métricas).
  - `services/models/nfl_predict.py` carga el artefacto y un JSONL de features pre-partido; emite por partido `pHome`, `pDraw`, `pAway` y `pHomeBinary`.
  - Probado con los últimos 25 partidos: 25 predicciones válidas (suman 1, binaria en rango).
- **No hecho / fuera de alcance:**
  - Integración en la web/DB: el artefacto y el script son la base del job batch, pero no hay endpoint ni tabla todavía.
  - Features de partidos futuros: el pipeline situacional solo cubre partidos jugados.
- **Decisiones tomadas (y por qué):**
  - Se versiona el modelo (texto + metadata) para reproducibilidad, en vez de reentrenar en cada inferencia.
  - La inferencia depende del contrato de features del pipeline situacional; cualquier cambio de features exige regenerar el artefacto (la metadata guarda el orden).
- **Riesgos o deuda:**
  - `model.txt` está atado a LightGBM 4.7.0; otra versión puede cambiar el formato.
  - Las features futuras deben construirse con el mismo pipeline (rest, EPA, clima) para que las predicciones sean válidas.
- **Cómo probarlo:**
  - `python services/models/nfl_predict.py --features <jsonl>` (sin `--out` imprime por stdout); validar que las probabilidades suman 1.

### MODEL-15 · Totales NFL calibrados (Platt walk-forward) — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - Diagnóstico: el modelo de totales NFL está sobreconfiado. En la línea de cierre da **0.7155** de log loss; la tasa base (over 48.8 %) da 0.693 y un GBM con features situacionales 0.6936.
  - Implementada calibración Platt walk-forward en el benchmark (`fitPlatt` + `totalsCalibrated`): 0.7155 → **0.6949** (pendiente 0.047, intercepto −0.052). La pendiente casi nula confirma que el `pOver` del modelo apenas aporta sobre la línea.
  - El reporte NFL muestra ahora dos filas: totales sin calibrar y calibrados. Reportes público y research regenerados.
- **No hecho / fuera de alcance:**
  - Sustituir el `pOver` del producto por el calibrado: requiere decidir si se aplica en la web o solo en research.
  - Un modelo de totales nuevo (regresión de puntos con features); el GBM no superó la tasa base.
- **Decisiones tomadas (y por qué):**
  - Se mantiene el modelo de totales sin cambios y se añade la calibración como candidato medido, no como salida publicada.
  - Platt en vez de isotónica: dos parámetros, estable con pocos datos y fácil de auditar.
- **Riesgos o deuda:**
  - La pendiente 0.047 implica que el total calibrado es casi la tasa base; la línea de cierre ya contiene la información.
- **Cómo probarlo:**
  - `pnpm backtest:history --leagues=nfl` y revisar la fila "LogLoss totales calibrados (Platt)" en `Reportes/modelos/BACKTEST-HISTORICO.md`.

### MODEL-16 · Lesiones NFL como feature: sin mejora — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - Agregadas las lesiones semanales de nflverse (parquet 2009-2026, leído con DuckDB): bajas, dudosos, cuestionables, QB fuera y skill players fuera por equipo-semana (9,358 combinaciones).
  - Añadidas como features al GBM NFL: moneyline **0.6435 → 0.6431** (mejora 0.0004). El motor de ratings queda en 0.6545 en el mismo conjunto.
  - No se integran: la señal ya está capturada por el EPA de QB y las líneas de mercado; el coste de mantener el pipeline de lesiones no se justifica.
- **No hecho / fuera de alcance:**
  - Lesiones a nivel de jugador individual (embeddings) o estado de práctica.
  - Integrar lesiones en el artefacto NFL versionado.
- **Decisiones tomadas (y por qué):**
  - No adoptar: mejora dentro del ruido y añade dependencia de un parquet grande.
  - Se documenta el experimento para no repetirlo.
- **Riesgos o deuda:**
  - El join por (season, week, team) asume que el reporte de lesiones es previo al partido; en semanas con jueves puede haber desfase.
- **Cómo probarlo:**
  - El script quedó como experimento temporal; los datos están en `data/history/raw/nflverse/injuries/`.

### DATA-20 · Cierre formal de la línea de adquisición de datos — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - Nuevo documento `docs/architecture/DATA_SOURCES_STATUS.md` con el estado de todas las fuentes (activas, caídas, bloqueadas, agotadas), datos aportados, mejoras de motor atribuibles y qué falta.
  - Resumen: 24 datasets, **189,038 filas**, 0 duplicados, 0 discrepancias. Corpus 34,168; research 63,726; xG 42,156; situacional 48,988.
  - Comprobación final: Understat sigue caído, ClubElo 502, SPI devuelve HTML, SofaScore 403, FotMob sin API, Wayback sin snapshots útiles para 2024-25/2025-26.
  - Enlazado desde `HISTORICAL_DATA.md` §10.
- **No hecho / fuera de alcance:**
  - xG real de Liga MX y 2025-26 completo: dependen de fuentes que no están disponibles.
  - Integración de producto del blend NFL y de los totales calibrados (siguiente fase).
- **Decisiones tomadas (y por qué):**
  - Se cierra la adquisición con las fuentes actuales para no repetir barridos ya agotados; si Understat vuelve, se retoma con `pnpm history:xg`.
  - El trabajo pendiente es de producto, no de datos.
- **Riesgos o deuda:**
  - Los documentos de estado pueden quedar desactualizados si una fuente vuelve; la fecha de comprobación está en el título.
- **Cómo probarlo:**
  - Leer `docs/architecture/DATA_SOURCES_STATUS.md`; `pnpm verify:data` sigue en OK.

### MODEL-17 · Pruebas de la calibración Platt — 2026-11-09 — Rama `feat/pre-pmv`
- **Hecho:**
  - `fitPlatt` exportado y cubierto con 3 pruebas: recupera parámetros conocidos de datos sintéticos, encoge un modelo sin información (pendiente ≈ 0) y no explota con datos cuasi-separables.
  - Las pruebas usan un generador determinista (sin aleatoriedad real) para que no sean frágiles.
- **No hecho / fuera de alcance:**
  - Pruebas de integración del benchmark NFL completo (es lento, ~8 s por corrida).
- **Decisiones tomadas (y por qué):**
  - Exportar `fitPlatt` solo para pruebas: es una función pura y aislada, no forma parte del contrato público.
- **Riesgos o deuda:**
  - El caso de pendiente no identificable (todas las `p` iguales) no se prueba porque la solución no es única; el tercer test cubre estabilidad.
- **Cómo probarlo:**
  - `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads tests/platt.test.ts`.









### MODEL-10 · Calibración por temperatura del blend público — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - Validación temporal (2010-2019 → 2020-2026) de una temperatura `T` sobre el blend DC+Elo de goles (0.8–1.2).
  - El óptimo en validación es **T = 1** (sin cambio): el blend ya está calibrado. En test no hay diferencia (delta 0.0000 en las seis ligas).
  - No se integra ningún parámetro de calibración.
- **No hecho / fuera de alcance:**
  - Calibración por liga o por temporada; no hay señal en validación.
- **Decisiones tomadas (y por qué):**
  - No añadir complejidad sin mejora medible.
- **Riesgos o deuda:**
  - La brecha frente al mercado no viene de mala calibración, sino de información que el modelo no tiene.

### UI-V4 · Plataforma completa Liquid Glass + PitchLab Spacetime Suite v2.1 — 2026-11-10 — Rama `gemini-reestructura`
- **Hecho:**
  - Tokens duales (`data-theme="dark"` y `data-theme="light"`) en `packages/tokens/scripts/generate.mjs` y sistema visual `apps/web/app/pitchlab-v4.css` con estética *Liquid Glass* (`shows.link`: negro obsidiana / alabastro, auras dinámicas por club, bisel óptico `.glass-ring` y cero literales hex fuera de `packages/tokens`).
  - Arquitectura completa en `packages/ui/src/platform/`:
    - Catálogo propietario **`PitchLab Spacetime Suite v2.1`** (`Tachyon v2.1`, `Singularity v2.1`, `Minkowski v2.1`, `Geodesic v1.0`, `Cortex IA` y calibración `Horizon` sobre +358,400 partidos y +12.4M puntos tácticos) con cero jerga interna o proveedores en UI (FD-16).
    - Motor determinístico `match-picks-engine.ts` que genera **5 picks estructurados por partido** (*Pick Principal*, *Escudo Conservador*, *Línea de Totales*, *Lectura Táctica* y *Cuota Alta · Valor*) más síntesis pre-partido y corte 60m de `Cortex IA` desde los snapshots reales de las 7 ligas (`liga-mx`, `premier-league`, `laliga`, `serie-a`, `bundesliga`, `ligue-1`, `nfl`).
    - Guardia de **Cero-Fuga (`access-guard.ts` + `apps/web/src/server/platform-data.ts`)**: visitante público solo ve resultados `FT`, `Tecnología & Precisión`, **1 pick abierto del día** y **1 pick semanal abierto de Tipster** (`/p/sofia-sem`).
    - **Armador Inteligente de Parlays & SGP** (`parlay-engine.ts` + `ParlayFloatingDock`): Auto-Armador por riesgo (*Conservador*, *Medio*, *Arriesgado*), bloqueo de contradicciones e interruptor **Mismo Partido (SGP)** con ajuste de correlación.
    - **Comunidad VIP Exclusiva (`/app/social`)**, **Portal Tipster (`/app/tipster` + `/p/[pickId]` con código `SOFIA5`)**, **Referidos Doble Vía (`/app/account`, +15 días gratis al primer pago de ambos)**, **Escudo Anti-Abuso \$0 MXN** en `/signup` (OAuth Google/Apple, normalización Gmail `+tag`/puntos y bloqueo de dominios desechables), **Player Props Lab (`/app/props`)**, **Momios & Geodesic (`/app/momios`)**, **Mi Bitácora (`/app/lab`)** y **Consola Admin Founder (`/app/admin`)**.
    - Stories duales en `packages/ui/src/platform/platform-v4.stories.tsx` y pruebas unitarias + E2E (`10/10` en `desktop` y `mobile` con `@axe-core/playwright` WCAG 2.1 AA).
- **No hecho / fuera de alcance:**
  - Cobro real con Stripe MX y persistencia transaccional multiusuario en Postgres/Supabase (reservados para F4 tras activar cuentas y llaves en `DEPLOYMENT.md` §6).
- **Cómo probarlo:**
  - `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm build-storybook` y `pnpm e2e` (`10 passed`).

### UI-MAESTRO-V4.1 · Paridad 1:1 con Prototipo Maestro PitchLab (Smoked Glass + Orbes + 11 Vistas) — 2026-11-10 — Rama `gemini-reestructura`
- **Hecho:**
  - **Tokens y física *Smoked Glass* (`packages/tokens/scripts/generate.mjs` + `apps/web/app/pitchlab-v4.css`):** sustitución de superficies carbón opacas por cristal blanco translúcido real sobre obsidiana `#000000` (`--pl-glass-lens: rgba(255,255,255,0.068)`, `--pl-glass-card: rgba(255,255,255,0.052)`, `--pl-glass-rail: rgba(10,10,13,0.72)`, `backdrop-filter: blur(18px)`), atmósfera global saturada (`.pl-atmo-canvas` con `opacity: 0.62; blur(92px) saturate(185%)` + `.pl-atmo-scrim`), aislamiento del bisel óptico `.glass-ring` (eliminando bordes dobles en `.pl-btn-glass` y `.seg-well`), CTAs primarios nítidos (`#FFFFFF` en oscuro / `#09090B` en claro), tokens de píldora AA/AAA para ambos temas, física de orbes `.pl-lens-orb`, `.crest-pedestal`, `.sq-box`, `.avatar-stack`, `.pl-quick-jump-bar`, `.pl-modal-dialog` sobre `<dialog>` nativo y `.share-ticket-card` con aislamiento de tokens oscuros. **0 literales hexadecimales fuera de `packages/tokens`**.
  - **Catálogo y primitivas compartidas (`packages/ui/src/platform/spacetime-catalog.ts` + `components/MaestroPrimitives.tsx`):** expansión de `PRECISION_BUCKETS` a los 4 cubos auditados de calibración (*Confianza Máxima · Escudo* `82 %`, *Confianza Alta · Principal* `72 %`, *Confianza Media · Balanceado* `60 %`, *Alto Valor Arriesgado* `41 %`) con cero fugas internas (FD-16); creación de `MaestroIcon` (33 iconos vectoriales `strokeWidth={1.8}`), `LensGlowOrbs`, `CrestPedestal`, `CalendarSquare`, `StackedAvatars`, `NoticeCard`, `GlassActionRow` y `RoleSwitcherPill` (desbloqueo automático con PIN `2026` cuando `isServerRedactedForVisitor` está activo).
  - **Superficies públicas 1:1 (`packages/ui/src/platform/public/`):**
    - `LandingSurface.tsx` (`/`): barra superior de lanzamiento (`MES 1 LANZAMIENTO · PRUEBA SIN TARJETA`), indicador en vivo de visitante Cero-Fuga frente a socio `@socio_pl · PL-8842` y `<RoleSwitcherPill compact />`; Hero `6+6` con chip hacia `#motores`, `<NoticeCard>` *Suscripción Cero Fuga*, boleto multi-liga interactivo de 5 ligas con `<LensGlowOrbs>` por club, marcador `<CrestPedestal>` (`X.X – Y.Y` desbloqueado vs `🔒 – 🔒` visitante), 4 ranuras de pick y calculadora Geodesic v1.0 en vivo (`#landing-user-odds`, `[data-odds-comparator]`); bloque completo `<TechPrecisionSection />` (`#motores`), pick semanal abierto de `@sofia_nfl` (`SOFIA5` + `/p/sofia-sem`) + fila de auditoría pública `FT` (`CUMPLIDO / NO CUMPLIDO`) y `<PlansAndReferralsSection />` (`#pase-total`).
    - `TechAndPricingSurfaces.tsx` (`/tecnologia`, `/pricing`): caja SHA-256 de reentrenamiento, 4 KPIs (`+358,400`, `+12.4M`, `69.6 %`, `5 Motores`), cuadrícula `3×2` (5 motores `Spacetime Suite` + tarjeta comparativa *PitchLab vs Tipster Tradicional*), los 4 cubos `PRECISION_BUCKETS` (`Desviación media < 1.2 %`), selector `$299` / `$2,390 (Ahorras 4 meses)`, Referidos Doble Vía en 3 pasos (`+15 días gratis`), tarjeta Portal Tipster Oficial (`25 %`) y acordeón accesible de preguntas frecuentes.
    - `AuthAndOnboardingSurfaces.tsx` (`/signup`, `/login`, `/onboarding`, `/p/[pickId]`): pestañas `Prueba / Código` y `PIN Socio`, reconocedor en vivo de códigos (`SOFIA5`/`CARLOS5`/`DIEGO5` 5d; `JAIR`/`SOCIO-8842` 7d + 30 % dto.; vacío Mes 1 sin tarjeta), canonicalización Gmail + bloqueo de correos desechables con `role="alert"`, aviso Turnstile `$0`, teclado interactivo de 4 dígitos (`2026`), probador rápido de 4 roles, personalizador 18+ de ligas/riesgo/unidad simulada `$100–$1,000 MXN` y boleto público semanal `.share-ticket-card` con 1 pick abierto y 4 picks bloqueados `[data-locked-pick]`.
  - **Shell, Partidos, Quant, Parlays SGP, Comunidad VIP, Tipster, Cuenta y Admin (`packages/ui/src/platform/components/` + `club/`):**
    - `ShellChrome.tsx` y `MatchTicketCard.tsx`: Topbar del club con búsqueda `⌘K`, `<RoleSwitcherPill compact />`, campana con badge `2`, `Momio/Decimal`, `<ThemeToggle />` y chip `@jair +6.1u` / `@sofia_nfl +18.4u`; riel izquierdo en 4 grupos exactos (*Spacetime Club*, *Motores & Labs*, *Crecimiento*, *7 Ligas*); dock móvil de 5 ítems; barra flotante colapsable `.pl-quick-jump-bar` de **11 vistas** dentro de `AtmosphereStage`; tarjetas de partido con `<LensGlowOrbs>`, `<CrestPedestal>`, marcador proyectado y cálculo EV en vivo.
    - `CoreMatchViews.tsx` y `ParlayAndQuantViews.tsx`: `JornadaClubView` (`/app`) con spotlight asimétrico `7/5`, `<CalendarSquare>`, `<NoticeCard tone="cortex">`, Auto-Parlay a 1 clic y Top 3 Picks; `MultiPicksClubView` (`/app/picks`) con barra en vivo *"Probar tu momio"*; `LeagueHubClubView` (`/app/[league]`) con chips de jornada y tabla; `MatchStudioClubView` (`/app/[league]/games/[gameId]`) con 3 tarjetas de inteligencia previa (*Cortex IA*, *Alineaciones y Bajas 60m*, *¿Dónde está el dinero?*), 5 picks, *Debate de Suscriptores* anti-enlaces y tabla filtrable de mercados; constructor de Parlays en 4 pasos con bloqueo explícito de contradicciones/SGP y boleto perforado sticky en `/app/parlays`; `Props Lab` (`/app/props`) con stepper de línea, gráfica L10 y calculadora por tarjeta; explorador `/app/momios` con badges `↓ dinero entra` / `↑ valor`.
    - `SocialAndTipsterViews.tsx`, `LedgerAccountAdminViews.tsx` y `PlatformOverlays.tsx`: `SocialVipClubView` (`/app/social`) con 3 pestañas (*Boletos & Debate*, *Consenso vs. Suite*, *Ranking CLV IC 95 %*), compositor anti-spam y sidebar sticky; `TipsterPortalClubView` (`/app/tipster`) con 4 KPIs, configurador 4:5 / 9:16 y simulador modal `/p/sofia-sem` sobre `<TopLayerModalDialog>`; `HistorialClubView` (`/app/historial`) con franja de auditoría pública `FT` (`ECE 0.009`, `0 picks editados o borrados`); `BitacoraClubView` (`/app/lab`) con exportación CSV y *Vigilancia 60m*; `AnalystProfileClubView` (`/app/u/[handle]`); `AccountReferralsClubView` (`/app/account`) con 4 pestañas (*Referidos +15d* activa por defecto conservando todos los selectores E2E, barra Embajador de 5 amigos, *Pase Total*, *Preferencias* y *CFDI 4.0* regímenes SAT `601`/`612`/`626`/`605`); `FounderAdminClubView` (`/app/admin`) con switch Mes 1 sin tarjeta vs Mes 2 `$0 MXN`, emisor de códigos Tipster y telemetría interactiva de los 5 motores.
  - **Artefacto canónico, ADRs, Visión y Handoffs para Claude:** archivo maestro preservado en `design/prototipo-maestro/prototipo-maestro-pitchlab.html` (+ `README.md` y referencia histórica `propuesta-landing-liquid-glass.html`), ADRs aceptadas `ADR-023` (física *Smoked Glass* y `MaestroPrimitives`), `ADR-024` (motor híbrido `Spacetime Suite` sobre snapshots reales), `ADR-025` (membresía única `Pase Total`, `Cero-Fuga`, Tipsters y Referidos Doble Vía) y `ADR-026` (contrato ejecutable del Prototipo Maestro y simulación de roles sin romper Cero-Fuga), visión rectora `docs/product/PLATFORM_VISION_GEMINI_REESTRUCTURA.md`, documentos detallados `docs/product/VISION_REESTRUCTURA_CLAUDE_{DS_UX,QUANT,GROWTH}.md` y guías operativas `docs/execution/{CLAUDE_HOME_SESSION_BRIEF,HANDOFF_MAESTRO_UI_TOKENS_PUBLIC,HANDOFF_MAESTRO_CLUB_QUANT_SOCIAL}.md`.
- **Dónde nos quedamos:**
  - Todo el código de `@pitchlab/tokens`, `@pitchlab/ui` y `@pitchlab/web` compila sin errores (`pnpm typecheck`, `pnpm lint`, `node scripts/lint-codebase.mjs` y `pnpm test` en verde) y las rutas públicas y del club responden `HTTP 200` en el servidor de desarrollo con todos los selectores `data-*` y roles de Playwright preservados.
  - La frontera `Cero-Fuga` opera en servidor (`apps/web/src/server/platform-data.ts` → `redactDatasetForVisitor`), mientras el estado interactivo de cliente (boletos sellados, parlays, posts VIP, preferencias y switches de demo) hidrata desde snapshots reales y persiste en `localStorage` dentro de `PlatformProvider`.
  - Las 3 corridas simultáneas en vivo de auditoría visual en Chromium (`visual-auditor-*`) se detuvieron intencionalmente justo antes de concluir por indicación del fundador para cerrar sesión, subir la rama `gemini-reestructura` a GitHub y continuar inmediatamente desde casa con Claude.
- **Qué falta para la siguiente sesión (Claude):**
  1. **Auditoría E2E, contraste AA y comparación visual 1:1:** ejecutar `pnpm build && pnpm e2e` (`desktop` `1440×900` y `mobile` `390×844`, `@axe-core/playwright` WCAG 2.1 AA en oscuro y claro) y contrastar visualmente todas las rutas públicas, `/app/*` y modales `<dialog>` contra `design/prototipo-maestro/prototipo-maestro-pitchlab.html`.
  2. **Pulido micro-visual y exportación raster:** afinar cualquier detalle tipográfico, de espaciado o responsive detectado en la comparación lado a lado, e implementar la descarga real a PNG/WebP en cliente (canvas/SVG raster) para los boletos 4:5 y 9:16 de `ShareTicketModal` y Portal Tipster.
  3. **Alineación arquitectónica con el fundador:** revisar y validar `ADR-023`…`ADR-026`, `docs/product/PLATFORM_VISION_GEMINI_REESTRUCTURA.md` y los 3 documentos `docs/product/VISION_REESTRUCTURA_CLAUDE_{DS_UX,QUANT,GROWTH}.md` antes de congelar contratos de base de datos.
  4. **Arranque de F4 (infraestructura productiva):** esquemas PostgreSQL/Neon con Drizzle (`subscriptions`, `trial_fingerprints`, `sealed_picks`, `parlays`, `social_posts`, `referral_grants`, `tipster_attributions`, `cfdi_invoices`), autenticación real OAuth Google/Apple + verificación servidor Cloudflare Turnstile, Stripe MX Billing + Promotion Codes + Connect (`25 %`), automatización CFDI 4.0 con Facturapi y ocultación en producción (`NODE_ENV === "production"` sin flag de preview) de `<RoleSwitcherPill>` y `.pl-quick-jump-bar`.
- **Cómo probarlo:**
  - Leer primero `docs/execution/CLAUDE_HOME_SESSION_BRIEF.md` (onboarding ejecutivo de 60 segundos).
  - Verificación rápida sin tocar `.next`: `node scripts/lint-codebase.mjs`, `pnpm lint`, `pnpm typecheck` y `pnpm test`.
  - Desarrollo local: `PREVIEW_ACCESS_CODE=2026 pnpm dev` (abre `http://localhost:3000`; PIN de socio `2026`; códigos demo `SOFIA5`, `CARLOS5`, `DIEGO5`, `JAIR`, `SOCIO-8842`; referencia canónica en `design/prototipo-maestro/prototipo-maestro-pitchlab.html`).
  - Suite E2E completa + auditoría Axe AA: `pnpm build && pnpm e2e`.

### SPACETIME-V3 · Motores v3.0, datos verificables y base de F4 — 2026-11-11 — Rama `gemini-reestructura`
- **Hecho:**
  - `packages/spacetime`: motores Spacetime Suite v3.0 copiados de `prediction-lab` con script de sincronización; error de tipos corregido en `prediction-lab` (`263857a`).
  - `apps/web/src/server/spacetime.ts`: inferencia v3.0 por partido, momios reales con vigencia de 72 h y fecha visible, factores traducidos (FD-16).
  - `packages/ui/src/platform/spacetime-markets.ts`: totales, ambos anotan, goles por equipo, marcador exacto (Poisson + Dixon-Coles) y hándicaps/totales NFL desde v3.0.
  - UI sin datos inventados (ADR-027): momios, ventajas, bajas, alineaciones, props, alertas, récords y cifras de marketing; contenido de demostración marcado «Ejemplo».
  - Herramientas de preview fuera de producción; PIN fuera del cliente. Descarga real de boletos PNG.
  - Liga MX real desde ESPN (temporada actual); snapshots al 11 nov; workflow diario sincroniza Spacetime.
  - `packages/db`: esquema Drizzle de 18 tablas con migración y pruebas en Postgres en memoria; bitácora, vigilancia y publicaciones propias persisten en el navegador.
  - Revisión visual contra el prototipo maestro (escritorio, tableta y móvil) con correcciones.
- **No hecho:** todo lo que requiere cuentas o secretos (ver «Pendiente» 1 y 4); regenerar momios (requiere correr scrapers en `prediction-lab`).
- **Cómo probarlo:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm e2e`.

### UI-SIMPLE · Simplificar y pulir la UI v4.1 de Gemini — 2026-11-11 — Rama `gemini-reestructura`
- **Por qué:** revisión de UX (pedida por el fundador): la UI v4.1 se ve bien y es accesible, pero tenía jerga en todas partes (Tachyon, Singularity, Geodesic, SGP, CLV…), cinco sistemas de navegación para 14 secciones, pantallas muy densas, títulos en inglés y en Title Case, y ~458 kB de JavaScript inicial por página.
- **Hecho:**
  - Navegación: 4 destinos principales (Hoy, Armar parlay, Mi bitácora, Cuenta), luego Ligas y un grupo «Más» (Picks del día, Momios y ventaja, Resultados, Comunidad, Props, Cómo calculamos). El Portal tipster solo para tipster/admin y la Consola solo para admin. El dock móvil usa los mismos 4 destinos + «Más». Encabezados del riel sin MAYÚSCULAS espaciadas.
  - Lenguaje claro: sin nombres de motores en tarjetas de picks, resúmenes ni razones (siguen en «Cómo calculamos» y como `title` de la categoría). Categorías: «Pick principal», «Más seguro», «Goles/Puntos totales», «Lectura del partido», «Valor contra la casa». «Ambos anotan: Sí» en vez de «Sí» suelto. SGP → «mismo partido».
  - Títulos: «Partidos de hoy», «Picks del día», «Armar parlay», «Momios y ventaja», «Props de jugadores», «Mi bitácora», «Mi cuenta», «Resultados», «Comunidad», «Consola del fundador». Portada: «Probabilidades claras para cada partido.» (sin segunda línea en color) y se quitó un «+358k partidos» que había quedado.
  - Hoy: sin la píldora «Spacetime Suite v3.0 · Jornada activa»; tarjetas de pick compactas con el nombre en su propia línea (antes se encimaba con las cifras); nombres de equipo a dos líneas en vez de truncados; «Ver partido».
  - Ficha del partido: sin la píldora del motor; pestañas «Picks / Mercados / Contexto / ¿Dónde está el dinero?»; «Picks de este partido»; «Opiniones de socios»; comentarios de ejemplo sin jerga.
  - JavaScript inicial: `optimizePackageImports` en `apps/web/next.config.mjs` para `@pitchlab/ui`, HeroUI, Base UI y Astryx: de ~458 kB a 326–369 kB por página.
  - Escáner `avoid-ai-design`: 0 P0 antes y después; P1 de 11 a 8.
- **Verificado:** typecheck, lint, todas las pruebas unitarias (incluidas 14 de UI) y build en verde. E2E: 6 de 10 pasaban; los 4 fallos eran selectores con textos viejos («Centro de Mando», «Radiografía»), ya actualizados a «Partidos de hoy» y «Ver partido».
- **Cierre (segunda sesión, 2026-11-11):**
  - Móvil (375 px): la fila de botones de cada tarjeta de partido se desbordaba 16 px (se cortaba «Compartir»); ahora hace salto de línea. «+ + Parlay» (ícono + texto con «+») → «Parlay». En «Mejores picks de la jornada» las selecciones ya no se truncan a 96 px. La ficha del partido no tenía desbordes.
  - Sin «→» de texto en botones; el emoji 🔒 de la portada es ahora `MaestroIcon` con `role="img"`. «Proyección Suite v2.1» → «Marcador proyectado».
  - Se quitaron 43 `uppercase`/`tracking-wider` de `packages/ui/src/platform` (quedan solo en campos de código) y el Title Case de «Pick Principal», «Pick Abierto…», «Momio Justo», «Marcador Proyectado». Jerga de motores fuera de los textos de ejemplo y de los rangos de precisión («Escudos», «+EV», «Radar», «Geodesic»…).
  - `LedgerAccountAdminViews.tsx` (2,471 líneas) partido en un archivo por vista (`ClubTechView`, `HistorialClubView`, `BitacoraClubView`, `AnalystProfileClubView`, `AccountReferralsClubView`, `FounderAdminClubView`); el original queda como barrel. JavaScript inicial: Cuenta 345 kB, Consola 344 kB, Bitácora 347 kB, Historial 319 kB; ninguna página pasa de 348 kB.
  - Verificado: typecheck y lint en verde; `pnpm e2e` 10/10 (escritorio y móvil, incluye axe y cero scroll horizontal). Pruebas unitarias en verde salvo deuda previa de tiempos (abajo).
- **Deuda que quedó:**
  - Pruebas con Postgres en memoria (`packages/db` y `apps/web/tests/auth.test.ts`) tardan 7–14 s cada una y rozan el límite de 5–10 s: fallan con la máquina cargada o corriendo en paralelo con Turbo (`db` pasa sola 15/15). La de rendimiento de `spacetime` (< 1 ms por partido) también falla bajo carga y pasa sola. Subir los `testTimeout`/`hookTimeout` o compartir una sola instancia de PGlite por archivo.
  - Decidir con el fundador si se ocultan del menú Comunidad y el Portal tipster mientras solo tengan contenido de ejemplo.
  - Las vistas de 'Cómo calculamos' conservan a propósito los nombres de los motores.
- **Dónde se había quedado (resuelto arriba):**
  1. **Correr `pnpm e2e`** con los selectores actualizados (la corrida se interrumpió; no está confirmado que pasen los 10).
  2. Revisar en el navegador «Hoy» y la ficha del partido en móvil (375 px) tras los cambios; la última captura fue de escritorio.
  3. Pendientes de esta misma tarea: quitar los «→» pegados a botones y el emoji usado como ícono en la portada (P1 del escáner), reducir las MAYÚSCULAS espaciadas que quedan en las vistas y partir `LedgerAccountAdminViews.tsx` (2,400 líneas, 6 vistas) para bajar más el JavaScript de Cuenta, Bitácora y Consola.
  4. Decidir con el fundador si se ocultan del menú las secciones que hoy solo tienen contenido de ejemplo (Comunidad, Portal tipster) hasta tener datos reales.

### UI-PULIDO-2 · Rendimiento, sidebar, comunidad, perfil, referidos y texto claro — 2026-11-11 — Rama `gemini-reestructura`
- **Rendimiento:** el layout de `/app` manda los partidos sin mercados, enfrentamientos ni factores (`withoutGameDetail`) y la ficha pide su detalle con `loadGameDetail` (misma redacción para visitantes); cada página bajó de 1.6 MB a 0.84–0.97 MB. `buildServerRawPlatformDataset` usa `cache()` de React. Turbopack se probó y fue más lento que Webpack en Next 15.5 (sin caché en disco); queda Webpack. Los imports relativos ya no llevan `.js` (app y paquetes que usa la web; el script de sincronización de `spacetime` los quita al copiar).
- **Navegación y carga:** animación de entrada al cambiar de página (`.pl-page-enter`, respeta movimiento reducido). `loading.tsx` del club muestra `ClubLoadingView`: encabezado y barra lateral se quedan y el contenido es un esqueleto con barra de progreso.
- **Barra lateral:** fija a la ventana (nunca se mueve), plegado animado que se recuerda entre páginas, Ligas como grupo desplegable, sin barra de desplazamiento. Barra de desplazamiento de la página en negro (tema oscuro). Pie compacto del club (`ClubFooter`) y sin hueco al final en escritorio.
- **Encabezado:** el chip de perfil abre un menú (popover nativo) con Ver mi perfil, Mi cuenta, formato de momio, tema y Salir; se quitaron de la barra.
- **Componentes nuevos:** `UltraTag` (borde de luz arcoíris), `VerifiedBadge`, `TipsterBadge` y `UserBadges` en `MaestroPrimitives`; íconos `message`, `heart`, `link`, `users-plus`. Barras de probabilidad con corte diagonal, favorito en verde y leyenda opcional (`ProbSplit showLabels`). «Lo más probable» en la tarjeta destacada de Hoy.
- **Pantallas:** Comunidad como timeline tipo feed; perfil con portada, avatar, insignias y récord en lenguaje claro; Cuenta con tarjeta de regalo de referidos, copiar enlace y compartir por WhatsApp/X.
- **Texto:** la suscripción se llama **Pase PitchLab Ultra** (incluye Stripe Checkout y CFDI). Fuera la jerga y el relleno en portada, acceso, precios, tecnología, Hoy, ficha y comunidad (motores, «Cero Fuga», «$0», Turnstile, CLV, etc.).
- **Verificado:** typecheck y lint en verde; pruebas de UI 14/14 (se actualizaron expectativas de texto). E2E ajustadas (menú del perfil, botón «Publicar», textos nuevos) pero **no se corrieron**.
- **Pendiente:** correr `pnpm e2e`; repasar en móvil las pantallas nuevas (feed, perfil, referidos, menú); texto con jerga que queda en `PlatformOverlays` (paleta de búsqueda, alertas) y en Bitácora/Consola/Portal tipster; pruebas de base de datos que fallan por tiempo bajo carga (ver UI-SIMPLE).

### PERF-1 · Rendimiento en PC y móvil (pintado, dibujo, navegación, datos) — 2026-11-11 — Rama `gemini-reestructura`
- **Cómo se midió:** build de producción en carpeta aparte (`PITCHLAB_DIST_DIR=.next-prod`, servidor `web-prod` en el 3100) y `apps/web/scripts/perf.mjs` con Playwright (Chromium sin interfaz). PC 1440×900; móvil 390×844 con toque y CPU 4× más lenta. Mide `/app` (HTML, JS, LCP), 150 cuadros desplazándose, el clic en «Parlay» (Event Timing) y la navegación Hoy → Parlay → Bitácora → Cuenta → Hoy. Resultados en `apps/web/perf-results/` (ignorado por git).
- **Ojo con el ruido:** «Base» y «1» se midieron con el servidor recién arrancado; desde «2» el script calienta el servidor y usa la mediana de 3 corridas (la final, 5 corridas sin el servidor de desarrollo). En esta laptop el clic y la navegación en móvil varían hasta 2–3× entre corridas con el mismo código; los tiempos de cuadro son estables.

| PC | Base | 1 Pintado | 2 Dibujar menos | 3 Navegación | 4 Datos | Final |
|---|---|---|---|---|---|---|
| HTML de /app (transferido) | 924 KB (98) | 924 (98) | 924 (98) | 900 (97) | 639 (73) | 639 (73) |
| JS cargado | 1,108 KB | 1,108 | 1,111 | 1,254* | 1,254* | 1,254* |
| LCP | 3,756 ms | 1,768 | 1,148 | 720 | 1,416 | 1,404 |
| Cuadro p95 al desplazar | 283 ms | 16.8 | 16.7 | 16.8 | 16.8 | 16.8 |
| Cuadros lentos (>20 ms) | 6.7 % | 0 % | 0 % | 0 % | 0 % | 0 % |
| Clic «Parlay» | 552 ms | 144 | 112 | 104 | 144 | 176 |
| Navegación (mediana) | 1,268 ms | 337 | 265 | 134 | 158 | 233 |

| Móvil (CPU 4×) | Base | 1 Pintado | 2 Dibujar menos | 3 Navegación | 4 Datos | Final |
|---|---|---|---|---|---|---|
| LCP | 7,692 ms | 5,080 | 2,212 | 2,268 | 3,856 | 3,916 |
| Cuadro p95 al desplazar | 83 ms | 16.7 | 16.7 | 16.7 | 16.8 | 16.8 |
| Cuadros lentos (>20 ms) | 6 % | 0 % | 1.3 % | 0.7 % | 0.7 % | 1.3 % |
| CPU al desplazar (150 cuadros) | 1,442 ms | 828 | 616 | 528 | 670 | 773 |
| Recalcular estilos al desplazar | 551 ms | 0 | 35 | 32 | 0 | 0 |
| Clic «Parlay» | 744 ms | 528 | 144 | 184 | 544 | 200 |
| Navegación (mediana) | 3,109 ms | 2,549 | 1,600 | 781 | 995 | 1,188 |

  \* El JS sube porque ahora se precargan los fragmentos de las 4 páginas principales.
- **1. Pintado:** fuera todos los `backdrop-filter` (38) de `pitchlab-v4.css` y `globals.css`; vidrio falso (fondo un poco más denso con `color-mix`, brillo superior y luz interior; barras fijas casi opacas). Auras y orbes con degradados `closest-side` sin `filter: blur`. Sombras más cortas; sin halo desenfocado en Ultra ni resplandor en la barra favorita. Arcoíris, brillo de carga, entrada de página y barras animadas solo en ≥ 768 px y sin movimiento reducido.
- **2. Dibujar menos:** `PlatformProvider` ahora también expone contextos pequeños (`usePlatformCore`, `usePlatformActions` con acciones de identidad estable, `useAuraColors`, `useJournalEntries`) y un almacén externo para el parlay (`useIsPickInParlay`). Hoy, `MatchTicketCard` y `MultiPickRow` (con `React.memo`) los usan: agregar al parlay o pasar el cursor ya no redibuja la página. Rejilla progresiva de partidos (12 y 12 más al acercarse al final) con `content-visibility: auto`. Respuestas, pestañas y modales ya se montaban solo al abrirse.
- **3. Navegación:** `ClubShellBridge` en `apps/web/app/app/layout.tsx` monta escenario, encabezado y barra lateral una sola vez; `AtmosphereStage`/`ClubWorkspaceShell` dentro de las vistas se vuelven transparentes si ya hay uno montado (verificado: mismos nodos del encabezado y la barra antes y después de navegar). Precarga completa de `/app`, `/app/parlays`, `/app/lab` y `/app/account`.
- **4. Datos:** el layout manda solo los partidos por jugar (`upcomingOnly`); Resultados, la página de cada liga y la ficha de un partido terminado piden los suyos (`loadFinishedGames`, `loadGameSummary`) y los inyectan con `PlatformGamesSupplement`. El dataset se guarda 5 min en memoria del servidor.
- **Verificado:** typecheck y lint en verde; unitarias: ui 14, web 37, contracts 4, tokens 3, sports-assets 3, spacetime 97, models 41, engines-reference 394, db 15 (db y web con límites de tiempo amplios, por la lentitud ya conocida); `pnpm e2e` 10/10 contra el build de producción. Se ajustaron 4 expectativas de E2E (títulos nuevos, abrir el grupo Ligas plegado, esperar hidratación antes de un clic).
- **Pendiente / ideas siguientes:** el LCP en móvil sigue en ~2–4 s (JS de ~1.1 MB por página: HeroUI/Astryx/Base UI); el siguiente paso sería cargar en diferido los modales y la paleta de búsqueda. El clic en «Parlay» todavía redibuja el dock del parlay y los overlays que usan `usePlatform()`.

### PROP-REFERRAL-3D · Invitación Pase PitchLab Ultra (tarjeta 3D gris oscuro + escenario Liquid Glass) — 2026-11-11 — Rama `gemini-propuestas`
- **Por qué:** propuesta visual autocontenida inspirada en la invitación de referidos de X/Grok (`/plans/referral?sku=...&interval=MONTHLY&code=...#subscribe`), adaptada a la marca y al sistema Liquid Glass de PitchLab sin tocar pipelines de datos, motores, sesiones ni Stripe.
- **Hecho:**
  - `packages/ui/src/platform/public/ReferralCard3D.tsx`: tarjeta 3D por raymarching OBB en WebGL 1.0 con **8-Rooks supersampling geométrico en silueta/biseles + 4× RGSS subpíxel analítico en tipografía e isotipo** (cero dientes de sierra), normales C1 analíticas, isotipo central evaluado por **SDF vectorial CSG sin ramificaciones** (`sdPitchLabIsotype`) con bisel CNC de 32 bits y texturas POT `4096×2048` en proporción geométrica real `1:1` con `16x` filtrado anisotrópico. Cuerpo en **titanio grafito oscuro anodizado** 100% monocromático y, al mover o abrir la tarjeta (`uPrismMotion`), **solo los íconos, las letras y los bordes biselados 3D** reflejan un espectro arcoíris holográfico curado de 6 paradas (zafiro hielo, violeta Pulso, rosa orquídea, coral cálido, oro champagne y esmeralda aguamarina, sin tonos ácidos), asentándose a `0 fps` en reposo absoluto con física armónica continua `dt`. Composición con alfa premultiplicado transparente para sombra física y reflexión sobre el fondo CSS sin costuras, más fallback estático cuando no hay WebGL.
  - `packages/ui/src/platform/public/ReferralInviteSurface.tsx` y `apps/web/app/pitchlab-v4.css` (`.pl-referral-*`): escenario con los destellos Liquid Glass de `/app` (`closest-side` con `color-mix(in oklab, ...)` sobre `--pl-aura-default-home`, `--pl-aura-default-away` y `--pl-orb-sky`, scrim óptico y horizonte especular, cero `backdrop-filter`, cero `filter: blur()`, cero literales hexadecimales), atribución silenciosa, titular bitono continuo con **`Ultra`** animado en espectro `oklch` vivo a `2.5 s` (`in oklab`, `prefers-reduced-motion: no-preference` + soporte `@media (forced-colors: active)`) y CTA píldora sólido hacia `/signup?code=<CODIGO>`.
  - Rutas públicas `apps/web/app/pricing/referral/page.tsx` y alias `apps/web/app/plans/referral/page.tsx` (`159 kB` First Load JS en `next build`), enlace actualizado en `packages/ui/src/platform/club/AccountReferralsClubView.tsx` (`/pricing/referral?sku=ultra&interval=MONTHLY&code=SOCIO-8842#subscribe` + `Ver invitación`), 8 stories en `packages/ui/src/platform/referral-card-3d.stories.tsx` y 3 pruebas unitarias/SSR en `packages/ui/tests/referral-invite.test.tsx`.
- **Verificado:** `node scripts/lint-codebase.mjs` OK, `pnpm typecheck` OK, `pnpm lint` OK, `pnpm --filter @pitchlab/ui test` (17/17), `next build` OK (`159 kB` First Load JS) y Playwright + Axe WCAG 2.1 A/AA en `web-prod` a `1440 px` y `375 px` en oscuro y claro (`0` violaciones, `0` desbordes, `0` dibujos en reposo y navegación del CTA a `/signup?code=...`).
- **Cómo integrarlo en `gemini-reestructura`:** `git checkout gemini-reestructura && git cherry-pick gemini-propuestas` y verificar con `pnpm typecheck && pnpm lint && pnpm --filter @pitchlab/ui test && pnpm build`.

### LANDING-2 · Nueva landing pública y 6 páginas de menú desde el lienzo — 2026-11-11 — Rama gemini-reestructura
- **Hecho:**
  - Nueva portada `/` y 6 páginas públicas del menú construidas 1:1 desde el lienzo (`design/canvas/landing/Main.dc.html` y `Mobile.dc.html`): `/como-funciona`, `/motores`, `/resultados`, `/parlays`, `/comunidad` y `/precio`, más redirecciones permanentes (`308`) con `permanentRedirect` en `apps/web/app/metodologia/page.tsx` (`/metodologia` → `/motores`), `apps/web/app/tecnologia/page.tsx` (`/tecnologia` → `/motores`) y `apps/web/app/pricing/page.tsx` (`/pricing` → `/precio`).
  - Catálogo tipado en `packages/ui/src/platform/spacetime-catalog.ts` y `packages/ui/src/platform/types.ts`: los 5 motores propietarios nombrados (`Tachyon`, `Singularity`, `Minkowski`, `Geodesic`, `Cortex IA`), las 3 cifras de cabecera en `SPACETIME_METRICS_HEADLINE` y `SPACETIME_ENGINES` (`+100,000` partidos históricos en los motores — respaldados por los `104,320` reales entrenados entre `model_motor_a.json` `98,102` y `model_nfl.json` `6,218` —, `136` variables por partido y `Cero` datos posteriores al partido, conservando `16,126` en la prueba fuera de muestra `2024–25` de `Singularity`), tabla de calibración por bandas, tabla comparativa (PitchLab vs casas, tipsters y hojas de datos), preguntas frecuentes y pie legal.
  - Secciones duales (`teaser` / `page`), barra de 6 enlaces (`aria-current="page"`, cajón móvil con `Escape`/foco/cierre exterior y conmutador de tema) y pie en `packages/ui/src/platform/public/PublicSiteSections.tsx`, `LandingSurface.tsx` y `LandingClientIslands.tsx` (`PublicNavBarClient`, `HeroMatchDemoIsland`, `PricingCardIsland`, `ResultsFilterListIsland` y función pura `compareUserOddsInput` para momio americano con `-`/`−`/`+` y decimal estricto), alimentadas en servidor por `apps/web/src/server/public-site-data.ts`; estilos `.pl-lp-*` en `apps/web/app/pitchlab-v4.css` con vidrio falso sobre obsidiana y papel y `0` declaraciones `backdrop-filter`.
  - Superficies públicas servidas como Server Components con islas cliente mínimas sin montar `<PlatformClientBridge>`, bajando el First Load JS de `/` y de las 6 páginas del menú a **`170 kB`** (frente a `332–351 kB` en `/app`).
  - Hero alimentado por el snapshot real vigente: «Lo más probable» se deriva únicamente del mercado principal `marketGroups[0]` (`h2h` / 1X2 / ganador) con `momio justo = 1 / p`, manteniendo doble oportunidad y totales en «Otros mercados de este partido».
  - Limpieza de texto y controles públicos en `ShellChrome.tsx`, `PlatformOverlays.tsx`, `TechAndPricingSurfaces.tsx` y `AuthAndOnboardingSurfaces.tsx`, más reemplazo de `"Más seguro"` por `"Muy probable"` en `packages/ui/src/platform/match-picks-engine.ts`: eliminados de las vistas públicas `"Primer mes gratis"`, `"ROI"`, `"Kelly"`, `"Por qué ganamos"`, `"más seguro"`, `"Sellar"` y el simulador de rol.
- **Decisiones tomadas:**
  - Actualización de `FD-16` en `docs/design/DESIGN_SYSTEM.md` (§5 y §7), `apps/web/PRODUCT.md` y `docs/design/GUIA_RECREACION_GPT.md` (§2): los 5 motores propietarios de PitchLab sí se nombran en la web pública y en el club; proveedores de datos (`nflverse`, `openfootball`, `api-football`, `Polymarket`, `Kalshi`, `Understat`, `ESPN`) y fórmulas internas crudas (`Poisson`, `Dixon-Coles`, `LightGBM`, `Platt`, `Pitágoras`, `Log5`) permanecen bloqueados.
  - Programa de referidos unificado en `15 días` para ambos lados tras el primer mes pagado del invitado; muestras de parlays, comunidad y tipsters marcadas explícitamente con `Ejemplo`.
- **Pendientes resueltos con el fundador (2026-11-11):**
  - `apps/web/PRODUCT.md` alineado al pase único `Pase PitchLab Ultra` (`$299` mensual / `$2,390` anual en `MEMBERSHIP_SPEC`).
  - Cabecera de motores actualizada a `+100,000` («Partidos históricos en los motores», respaldado por los `104,320` partidos reales entrenados entre `Tachyon v3.0` y `Minkowski v3.0`).
- **Verificado:**
  - `pnpm typecheck` y `pnpm lint` (`node scripts/lint-codebase.mjs`: 0 colores hex fuera de `packages/tokens`, 0 `catch` vacíos, 0 `backdrop-filter` en `apps/web/app/pitchlab-v4.css`) en verde.
  - `pnpm test` 100 % en verde en los 10 paquetes (`tokens` 3, `contracts` 4, `sports-assets` 3, `spacetime` 97, `models` 41, `engines-reference` 394, `ingest` 114, `ui` 15, `db` 15, `web` 38).
  - `pnpm build` y `pnpm e2e` `10/10` en `desktop` y `mobile` (`AxeBuilder` WCAG 2A/2AA en oscuro y claro sobre `/` y las 6 páginas del menú, `#tu-momio`, conmutadores `aria-pressed`, foco visible con `Tab`, redirecciones `308`, PIN + `429`, club intacto y cero scroll horizontal en `375, 390, 768, 1024, 1280, 1440 px`).
  - Capturas verificadas visualmente sección por sección contra `Main.dc.html` y `Mobile.dc.html` (`1440 px` y `375 px`, temas `dark` y `light`, tras validar las correcciones CSS de `#18`): `test-results/screenshots/landing-2/` (`54` archivos PNG: `home-01-barra-hero-{1440,375}-{dark,light}.png`, `home-01b-mobile-menu-375-{dark,light}.png`, `home-02-como-se-lee-{1440,375}-{dark,light}.png`, `home-03-motores-comparativa-{1440,375}-{dark,light}.png`, `home-04-historial-calibracion-{1440,375}-{dark,light}.png`, `home-05-parlays-comunidad-{1440,375}-{dark,light}.png`, `home-06-precio-{1440,375}-{dark,light}.png`, `home-07-preguntas-cierre-pie-{1440,375}-{dark,light}.png` y `menu-{como-funciona,motores,resultados,parlays,comunidad,precio}-{1440,375}-{dark,light}.png`).

### LOGIN-2 · Nuevo `/login` desde el lienzo (escritorio + móvil, oscuro + claro) — 2026-11-11 — Rama `gemini-reestructura`
- **Hecho:**
  - Tokens nuevos en `packages/tokens/scripts/generate.mjs` y `packages/tokens/tests/tokens.test.ts`: `--pl-orb-rose` (oscuro y claro), `--pl-auth-beam`, `--pl-auth-lens`, `--pl-auth-pane`, `--pl-auth-field`, `--pl-auth-field-hover` y colores del isotipo de Google (`--pl-google-*`). Cero colores hex fuera de `packages/tokens`.
  - Datos reales de servidor en `apps/web/src/server/public-site-data.ts` (`loadLoginPreviewData` sobre `buildHeroLeagueCards` + `selectHeroMainCards`) y conexión en `apps/web/app/login/page.tsx` leyendo `next`, `ref`, `invite` y `code`.
  - `packages/ui/src/platform/public/LoginPreviewPanel.tsx` (Server Component): vista previa derecha («Hoy en PitchLab», partido principal `.glass-lens.glass-ring--featured` con `LeagueBadge`, `TeamBadge`, `ProbSplit` y momio justo `1/p` en americano, segundo partido compacto de otra liga y nota al pie; se omite si no hay datos vigentes).
  - `packages/ui/src/platform/public/LoginSurfaceV4.tsx` (Client Component) + delegación en `AuthSurfaceV4` (`AuthAndOnboardingSurfaces.tsx`) sin tocar `/signup`: un único árbol DOM para escritorio y móvil (`1` `<h1>`, `1` `<form>`, `1` `.btn-beta`), estados Correo, Revisa tu correo (tope de reenvío de `30 s`), Contraseña apagado tras `passwordSignInEnabled = false`, aviso `.glass-card` para `?ref=`/`?invite=`, validación accesible (`aria-live="polite"`, `aria-describedby`, `isDisposableEmailDomain`) y diálogo `.pin-dialog` con selectores intactos.
  - Atmósfera `.pl-auth-atmo` / `.pl-auth-beam` / `.pl-auth-grain` y reglas responsive en `apps/web/app/pitchlab-v4.css` (`1040 px` escritorio, colapso `< 900 px` a `460 px`, ocultamiento de segundo partido `< 760 px` de alto y móvil `≤ 640 px` sin scroll vertical desde `667 px`).
  - 7 stories en `packages/ui/src/platform/login-v4.stories.tsx`, pruebas unitarias en `packages/ui/tests/login-v4.test.tsx` (`4/4`) y `apps/web/tests/login-preview.test.ts` (`2/2`), y script de capturas + Axe + flujos `apps/web/scripts/verify-login.mjs`.
- **Verificado hasta el corte:** `pnpm typecheck`, `pnpm lint` (`node scripts/lint-codebase.mjs`) y pruebas unitarias en los 10 paquetes (`tokens` 3, `contracts` 4, `sports-assets` 3, `spacetime` 97, `models` 41, `engines-reference` 394, `ingest` 114, `ui` 22, `db` 15, `web` 39).
- **Pendiente al retomar (ver `docs/execution/REPORT_LOGIN_2_PROGRESS.md`):**
  1. Terminar `pnpm --filter @pitchlab/web build` y confirmar el peso de `/login` (`≤ 326 kB`).
  2. Correr `pnpm e2e` (confirmando pruebas 2 y 3 de PIN en verde).
  3. Ejecutar `node apps/web/scripts/verify-login.mjs` contra `next start` para generar y revisar visualmente las 8 capturas (`1440×900`, `1280×720`, `375×667`, `390×844` en `dark` y `light`).
- **Decisiones pendientes del fundador:**
  - ¿Se habilita correo + contraseña en Better Auth? Hasta entonces, el estado Contraseña queda apagado (`passwordSignInEnabled = false`).
  - ¿El acceso con PIN se retira cuando existan cuentas, o se queda para socios?

### CUENTA-2 · Mi cuenta (`/app/account`) y enlace corto `/i/[code]` desde el lienzo — 2026-11-12 — Rama `gemini-reestructura`
- **Hecho:**
  - **División modular y estilos (`packages/ui/src/platform/club/` + `apps/web/app/account-v2.css`):** `AccountReferralsClubView.tsx` queda como contenedor con encabezado compartido (avatar e iniciales de sesión, `Mi cuenta`, `UltraTag`, `@usuario · Pase PitchLab Ultra`, indicador `aria-live` de guardado en `prefs` y enlace `Ver mi perfil` en el resto) y 4 pestañas WAI-ARIA subrayadas (`Invitar amigos · Mi plan · Preferencias · Facturación`) sincronizadas con `?tab=referrals|plan|prefs|cfdi` y `ACCOUNT_TAB_EVENT`, eliminando `.seg-well` y «Ver portada pública». Cada pestaña vive en su archivo dentro de `packages/ui/src/platform/club/account/` (`InviteTab.tsx`, `PlanTab.tsx`, `PrefsTab.tsx`, `BillingTab.tsx`, `LazyReferralCard3D.tsx`, `account-helpers.ts`), manteniendo intacta la exportación pública de `@pitchlab/ui`. Cero hex fuera de `packages/tokens`, cero `backdrop-filter` y cero `filter: blur`.
  - **Fase A · Invitar amigos (`InviteTab.tsx` + `ReferralCard3D.tsx` + `spacetime-catalog.ts`):** tarjeta 3D interactiva (volteo con clic, toque, `Enter` o `Space`, instantáneo con `prefers-reduced-motion`, y respaldo 2D anverso/reverso cuando no hay WebGL), descarga PNG `1080 × 1350` (`pitchlab-invitacion-{codigo}.png` en WebGL y en respaldo), oferta en 3 líneas derivada de `MEMBERSHIP_SPEC` (`7` días sin costo, `$209` primer mes, `+15` días para ambos al pagar y `+30` de embajador con `referralEarnedDays`), enlace corto `pitchlab.mx/i/{CÓDIGO}` con anuncio `Copiado` (`2 s` + `aria-live`), botones en orden (`Copiar enlace · WhatsApp · X · Copiar mensaje · Más` con `navigator.share` primero en `< 640 px`), 5 lugares de avance hacia embajador, lista honesta de invitaciones (muestra marcada `Ejemplo` sin cuentas; `paidFriends` y `pendingFriends` reales con «Pronto verás aquí a cada amigo» con cuentas) y bloque `Simulador` visible únicamente cuando `allowRoleSimulation` es `true`.
  - **Fase B · Enlace corto y vista previa (`apps/web/app/i/[code]/page.tsx`, `opengraph-image.tsx`, `short-invite.ts`, `middleware.ts`, `ReferralInviteSurface.tsx`):** validación `^[A-Z0-9-]{4,24}$` sin distinguir mayúsculas, redirección a `/pricing/referral?code={CÓDIGO}&from={usuario}` (o `/pricing` si es inválido) sin escribir en la base, `ImageResponse` `1200 × 630` con captura estática frontal (`apps/web/public/brand/referral-card-front.png`), `generateMetadata` con `twitter:card = summary_large_image` y `X-Robots-Tag: noindex, nofollow` en `middleware.ts` sin exigir sesión. Se preservó compatibilidad con enlaces antiguos `?sku=ultra&interval=MONTHLY&code=...#subscribe`.
  - **Fase C · Mi plan (`PlanTab.tsx` + `apps/web/app/api/me/plan/route.ts` + `member-plan.ts`):** estado del pase (`Activo`, `Prueba · quedan {N} días` o `Sin renovación` con acceso hasta fecha) desde `accessUntil()` y `hasActivePaseTotal()` vía `GET /api/me/plan` de solo lectura, 4 datos clave, selector mensual/anual con ahorro calculado `$1,198` (`annualSavingsMxn`), activación desde prueba con `POST /api/billing/checkout`, diálogos `TopLayerModalDialog` para cancelar/reactivar/cambiar tarjeta/ciclo («Disponible cuando se active el cobro.» sin `STRIPE_SECRET_KEY`), beneficios e historial de pagos marcado `Ejemplo`. Eliminados «Cancelar en 1 clic» y «Mantener Mensual».
  - **Fase D · Preferencias (`PrefsTab.tsx`) y Facturación (`BillingTab.tsx`):** 6 grupos (`Tus ligas · Cómo ves los datos · Picks y parlays · Alertas · Privacidad · Juego responsable`) con índice fijo a la izquierda en escritorio y fila de chips con scroll en móvil, guardado automático sin botón (`pl-prefs-v1` en `localStorage` con `try/catch`), bloqueo con aviso inline al intentar quitar la última liga activa, momio/tema/zona horaria (`America/Mexico_City`), 3 perfiles de riesgo + interruptor opcional «Ver mi saldo también en pesos» (`Ejemplo` sin cuentas; eliminado «Simulador de stake»), interruptores `Switch` de HeroUI para alertas y privacidad (reemplaza «Modo Pausa Social»), pausa de cuenta (`24 h`, `7 días`, `30 días` → «La pausa se aplicará cuando se active tu cuenta.») y acciones «Descargar mis datos» / «Eliminar cuenta». En `BillingTab` se eliminaron el RFC (`XAXX010101000`) y la razón social de relleno.
  - **Peso y Storybook:** `ReferralCard3D` se carga con `React.lazy` solo en `referrals` y `plan` (`LazyReferralCard3D.tsx`). First Load JS de `/app/account`: **`401 kB` antes → `416 kB` después** (`2.84 kB` de ruta). 14 stories en `packages/ui/src/platform/account-v2.stories.tsx` (oscuro y claro, con y sin cuentas, y `Mi plan` en prueba, mensual, anual y sin renovación).
- **Verificado:**
  - `pnpm typecheck`, `pnpm lint`, `node scripts/lint-codebase.mjs` y todas las suites unitarias en verde (`account-referrals.test.tsx` 9/9, `referral-invite.test.tsx` 4/4, `short-invite.test.ts` 6/6).
  - `pnpm --filter @pitchlab/web build` y `pnpm e2e` `10/10` en `desktop` y `mobile` (incluye copiar enlace corto, voltear tarjeta con teclado, cambiar pestañas con flechas, redirección `/i/JAIR-2611` → `/pricing/referral?code=JAIR-2611` y `AxeBuilder` WCAG 2 A/AA sin violaciones en las 4 pestañas en oscuro y claro).
  - Capturas comparadas contra el lienzo en `1440×900`, `1280×720`, `390×844` y `375×667` (oscuro y claro), imagen OpenGraph `1200×630` junto a `Compartir.dc.html` y `VistaPrevia.dc.html`, descarga PNG `1080×1350`, WhatsApp/X, cancelar/reactivar, aviso de última liga y respaldo sin WebGL.
- **Pendiente para el fundador (F4):**
  1. Guardar en la base las preferencias nuevas (`pl-prefs-v1`), la lista de invitados por amigo y las aperturas del enlace (eventos nuevos en F4).
  2. Conectar cambiar tarjeta, cancelar, reactivar y cambiar de ciclo con el Customer Portal de Stripe.
  3. Decidir si pausar la cuenta congela el cobro y si se puede deshacer antes de que termine.
  4. Rediseñar Facturación (CFDI) con su propio lienzo.

### COMUNIDAD-2 · Avisos sociales, moderación, paginación y foto de perfil — 2026-11-12 — Rama `gemini-reestructura`
- **Hecho:**
  - **Commits previos cerrados:** separados localmente en `fix(ui)` (`d569f3e`: recarga de URL al cambiar `@usuario`, texto «Ir a la app» con sesión y título raíz) y `feat(comunidad)` (`eb4291f`: cierre completo de COMUNIDAD-1).
  - **Migraciones de producción listas (sin ejecutar):** creado `scripts/migrate-prod.ps1` (vista previa de solo lectura contra `drizzle.__drizzle_migrations` en la rama `main` de Neon sin imprimir `DATABASE_URL`, confirmación explícita `MIGRAR` y limpieza de variable al salir) y documentado el orden obligatorio en `docs/product/GUIA_CUENTAS_Y_DESPLIEGUE.md` («Antes de cada deploy»: primero migrar `0005`…`0010`, después desplegar).
  - **Avisos sociales en la campana (`0008_notificaciones`):** tabla `notifications` con índice `(user_id, created_at)`, generación al comentar (excluyendo auto-comentarios), al seguir (una sola vez por par gracias al historial de `notifications` aunque deje de seguir y vuelva a seguir) y agrupada por publicación al dar «me gusta» (actualizando actor, fecha y `read_at = null`, o borrando el aviso si los likes bajan a `0`). Rutas `GET /api/me/notifications` y `POST /api/me/notifications/read`, e integración en `NotificationInbox.tsx` / `notifications.ts` con categoría `comunidad`, navegación directa a `/app/social?post=<id>` o `/app/u/<handle>`, marcado de lectura al abrir la bandeja y refresco al cargar y en `visibilitychange` sin polling continuo.
  - **Reportar publicaciones/comentarios y panel de moderación (`0009_moderacion_comunidad`):** tabla `social_reports` con unicidad por reportante y objetivo, límite de 20 reportes/hora, auto-ocultamiento al tercer reportante distinto dejando el reporte `pending` para revisión del fundador, menú «Reportar» y diálogo accesible en publicaciones y comentarios ajenos (`CommunityClubView.tsx` y `AnalystProfileClubView.tsx`), rutas `POST /api/social/reports`, `GET /api/admin/moderation` y `POST /api/admin/moderation/action` protegidas con `requireAdmin`, y sección «Moderación» en `/app/admin` (`FounderAdminClubView.tsx`) con acciones de ocultar, restaurar, descartar y pausar/reactivar socio (`users.social_pause_enabled`), registrando cada acción en `social_moderation_logs`.
  - **«Ver más» contra el servidor:** estado de paginación por alcance (`feed`, `following`, `author:<handle>`) y `loadOlderSocialPosts` en `PlatformProvider` pidiendo `/api/social/posts?before=<createdAtIso>&limit=30` y mezclando con `mergeSocialPosts(..., "extra")`; botones «Ver más» / «Cargando…» en Para ti, Siguiendo y Publicaciones del perfil.
  - **Foto de perfil (`0010_avatar_perfil`):** `users.avatar_url`, `@vercel/blob` (`2.8.2`) y `sharp` (`0.35.5`), `apps/web/src/server/avatar-storage.ts` + `POST/DELETE /api/me/avatar` (validación por firma binaria `jpeg`/`png`/`webp`, tope `2 MB`, recorte cuadrado `256×256` WebP, limpieza del blob previo e inyección `setAvatarUploaderForTests`), `BLOB_READ_WRITE_TOKEN` en `.env.example` y guía de Vercel Blob, control en `EditProfileDialog.tsx` («Pronto» cuando no hay token; vista previa, cambio y «Quitar» cuando está activo) y despliegue del avatar con respaldo de iniciales en `ShellChrome.tsx`, `AccountReferralsClubView.tsx`, `AnalystProfileClubView.tsx` y `CommunityClubView.tsx` (publicaciones y comentarios).
- **Verificado:**
  - Migraciones `0008_notificaciones`, `0009_moderacion_comunidad` y `0010_avatar_perfil` aplicadas en Neon `local-9990` con `scripts/migrate-9990.ps1`.
  - Flujo entre las dos cuentas reales de `local-9990` (`@prueba_local` y `@lupita_mx`) verificado de punta a punta contra Neon: foto de perfil en feed, aviso único al seguir aunque se deje de seguir y se vuelva a seguir, avisos de comentario y «me gusta» no leídos en la campana, marcado de lectura, reporte con bloqueo de duplicado, aparición en la cola de `listModerationPanelData` y descarte administrativo (datos de prueba limpiados al cerrar).
  - Paginación verificada contra `local-9990` con 65 publicaciones sintéticas (50 iniciales + 15 vía `before`, `0` duplicadas y `0` saltos, limpiadas al terminar).
  - `pnpm typecheck`, `node scripts/lint-codebase.mjs` (`0` colores hex fuera de `packages/tokens`, `0` `catch` vacíos), suites de pruebas en verde (`contracts` 4/4, `ui` 66/66, `db` 33/33 en serie, `web` 105/105 incluyendo moderación `403`, avisos y avatar `256×256`), Storybook compilado y verificado con Playwright Chromium en `1440×900` y `390×844` en oscuro y claro (`14` stories, `28/28` vistas con `0` errores y `0` scroll horizontal) y compilación aislada `PITCHLAB_DIST_DIR=.next-deploycheck pnpm build` exitosa (limpiando `.next-deploycheck` y `apps/web/tsconfig.json`).
- **Pendiente:**
  1. Levantar `powershell -ExecutionPolicy Bypass -File scripts/local-9990.ps1` (el servidor del `9990` respondió `ERR_CONNECTION_REFUSED` al iniciar la prueba visual en navegador y, por regla de trabajo compartido, no se arrancó automáticamente) para recorrer en navegador las dos cuentas (`@lupita_mx` y `@prueba_local`) a `1440 px` y `390 px` en oscuro y claro.
  2. Antes del próximo deploy a producción: ejecutar `scripts/migrate-prod.ps1` (aplicará `0005`…`0010` en la rama `main` de Neon) y luego desplegar en Vercel.
  3. Crear el Blob Store en Vercel (**Storage → Blob**) conectado a `pitchlab` para inyectar `BLOB_READ_WRITE_TOKEN` cuando se quiera habilitar la subida de fotos de perfil.

### BETA-1.0 · Operación SPEI, cupones, preferencias en Postgres y cierre operativo sin Stripe — 2026-11-12 — Rama `gemini-reestructura`
- **Por qué:** operar Beta 1.0 a costo extra `$0 MXN` mientras Stripe MX y Facturapi quedan en espera, con cobro manual por transferencia SPEI, cupones de acceso, privacidad/portabilidad en DB, portal real de tipsters, consola admin completa y cero falsos `401` bajo PIN beta.
- **Hecho:**
  - **Modo de cobro y DB (`packages/db`, `0015_transferencias_cupones_preferencias.sql`):** `PITCHLAB_PAYMENTS_MODE` (por defecto `"transfer"`): `/api/billing/checkout` responde `503` y `/api/tipster/connect` responde `409`. Tablas `transfer_payment_requests`, `access_coupons`, `coupon_redemptions`; ampliación de `user_preferences` (con sincronización bidireccional `publicRecordVisible`/`showInRanking` ↔ `users.public_profile`), `scheduled_emails.cycle_key`, `entitlement_grants.note` (`'transfer_payment'`, `'coupon'`), `tipster_commission_ledger.payout_note` y liquidación manual.
  - **API Beta 1.0 (`apps/web`):** `GET/POST /api/me/transfers`, `PATCH/DELETE /api/me/transfers/[id]`, `GET /api/me/coupons/preview`, `POST /api/me/redeem`, `GET/PUT /api/me/preferences`, `GET /api/me/export`, `POST /api/me/deletion-request`, `GET /api/tipster/me`, `/api/admin/{transfers,transfers/[id]/approve,transfers/[id]/reject,coupons,coupons/[id],coupons/[id]/redemptions,members,access/grant,access/revoke,tipster-payouts,tipster-payouts/[id]/mark-paid}` y cron diario `/api/cron/tipster-payouts` (promueve comisiones tras 14 días y despacha correos en ventana de 28 días).
  - **Correos y UI (`packages/emails`, `packages/ui`):** plantilla `transfer-rejected` (`25` totales / `12` conectadas en `wiring.ts` y `CORREOS.md`), recibos SPEI, recordatorios (`renewal-reminder`, `access-expired`), recompensa bilateral de referidos `+15 días`, bono embajador `+30 días` y comisiones de tipsters. UI SPEI en `PlanTab` (corregida rehidratación por `activePending.id` al recargar en segundo plano), `/canjear` + `/app/canjear` (`CanjearCouponView`), `ExpiredPassGate`, `PrefsTab` persistido con export/baja, `TipsterPortalClubView` vivo, `AdminPaymentsCouponsSection` en `/app/admin`, textos CFDI 4.0/legales honestos y stories de Beta 1.0 en oscuro y claro.
  - **Aislamiento PIN beta:** `PlatformProvider` y `PlanTab` usan `hasAccountSessionAuth` para omitir peticiones privadas cuando `viewerVia === "beta"`.
- **Verificado:**
  - `local-9990` (Neon con `0015` aplicada): PIN beta sin `401` bajo cuentas activas (`0` errores/`overflow`), flujo completo en navegador entre `@prueba_local` (admin) y `@lupita_mx` (cupón `SMOKE9990`, preferencia en DB, solicitud SPEI + comprobante, aprobación admin y paso del pase a `Activo`).
  - Pruebas unitarias en paquetes (`db`, `emails`, `ui`, `web`), `pnpm -r typecheck`, `pnpm lint`, `lint-codebase.mjs`, `check-no-secrets.mjs`, Storybook (`build-storybook`), `next build` y Playwright E2E (`14/14` en `desktop` y `mobile`, incluyendo `beta1-transfers-coupons.spec.ts` con Axe AA).
- **Pendiente antes del próximo deploy:** ejecutar `scripts/migrate-prod.ps1` (aplicará hasta `0015_transferencias_cupones_preferencias`) y cargar `PITCHLAB_PAYMENTS_MODE=transfer`, `PITCHLAB_TRANSFER_BANK`, `PITCHLAB_TRANSFER_BENEFICIARY`, `PITCHLAB_TRANSFER_CLABE` y `CRON_SECRET` en Vercel antes de desplegar.

### MOTOR-V3.2 · Spacetime v3.2 en la app y panorama por mercado en la ficha — 2026-11-13 — Rama `gemini-reestructura`
- **Hecho:**
  - **Sync completo desde `prediction-lab` `2960d77`** (`pnpm --filter @pitchlab/spacetime sync`): 18 módulos (10 nuevos: `outlook`, `math`, `blend`, `gbm`, `picks`, `clv`, `ledger`, `markets_2way`, `odds`, `stale_lines`), 19 artefactos JSON (snapshot `schema 3.2.0` con `outlooks`) y 18 suites. `@pitchlab/spacetime` sube a `3.2.0` y exporta la API de `outlook` (SYNC_NOTES §3).
  - **Script de sync:** reescribe `../../data/prediction/` → `../data/` en `src/`, la raíz de `prediction-lab` → raíz del paquete y `packages/contracts` en las pruebas; omite con `it.skip` 9 pruebas que solo se verifican en `prediction-lab` (Python en `research/.venv`, `services/models`, `data/ledger`, SHA de la copia CRLF), con el motivo en `SOURCE.json → patches`.
  - **Servidor:** `apps/web/src/server/outlook.ts` empareja cada partido con su `MatchOutlook` (liga + nombres, reutilizando `teamScore`) y `loadGameDetail` entrega, con acceso completo y partido por jugar, las filas de mercado v3.2 (momio justo `1/p`, `currentDecimal` y `edgePts` en `null`) y un `MatchOutlookSummary`. Cobertura: **65 de 72** partidos por jugar (Liga MX 10/10, Premier 10/10, LaLiga 5/10, Bundesliga 8/9, Serie A 9/10, Ligue 1 9/9, NFL 14/14); los demás conservan los mercados del snapshot.
  - **UI:** `MatchOutlookStrip` arriba de la tabla de «Mercados»: lo más probable con `PBar` y momio justo, 3 marcadores más probables (fútbol), calidad de los datos (texto + ícono, no solo color) y «Sin cuota real reciente (menos de 72 h)». 8 stories (`Platform v4 / Panorama del partido`) en oscuro y claro, revisadas a 1440 y 375 px sin desbordamiento. Se evitó la clase `block` por la regla global `.block { padding }`.
- **Verificado:** `pnpm typecheck`, `pnpm lint`, unitarias (`spacetime` 178 + 9 omitidas, `web` 145/145 con 5 nuevas de `outlook.test.ts`, resto en verde), `pnpm build` y `pnpm e2e` (13/14 en la corrida completa; la de móvil falla de forma intermitente en «Copiado» del enlace de invitación por el portapapeles bajo carga y pasa sola).
- **Pendiente:**
  1. Cuotas reales: el snapshot v3.2 trae `market: null` en los 130 partidos (`prospective_capture_pending`) hasta cargar `THE_ODDS_API_KEY` / `BETFAIR_APP_KEY` en `web-scraping` y regenerar con `regenerate_live_snapshot.py`.
  2. ✅ Resuelto el mismo día (ver «Picks, Inicio y landing en v3.2» abajo).
  3. NFL: el panorama v3.2 solo trae ganador; spread y totales siguen del snapshot hasta que `prediction-lab` publique esos mercados.
  4. El workflow `pre-mvp-snapshot.yml` solo corre en `main`: los datos se quedarán en el 12 nov hasta llevar la rama a `main` o correr `pnpm --filter @pitchlab/spacetime sync:data`.

#### Picks, Inicio y landing en v3.2 — 2026-11-13
- **Hecho:**
  - Antes, la rama se puso al día con 4 commits de otros agentes (`c5df390` seguridad OAuth/X, `02a2613` merge, `33015e6` blog, `1264dd0` animaciones de `/login`); conflicto solo en este archivo (se conservaron BLOG-1 y MOTOR-V3.2).
  - `applyOutlook` (`apps/web/src/server/outlook.ts`) se aplica en `buildServerRawPlatformDataset` a cada partido por jugar con panorama: `x12`, `outcomes`, mercados (`h2h`, `double_chance`, `totals` 1.5/2.5/3.5, `btts`, `correct_score` con las mismas claves del snapshot, así la calificación y el parlay no cambian), marcador más probable, proyección desde las lambdas de Dixon-Coles y picks del snapshot descartados para que el armador elija sobre v3.2. La señal queda con `outlookDriven: true` (el armador no recalcula con `probs` ni `expectedTotal`), `market: null` y `value: []` (sin cuotas de fuentes no autorizadas ni pick de «Valor»). NFL: solo el ganador cambia; spread y totales siguen del snapshot.
  - Landing: las tarjetas del hero se arman con los mercados reales (antes se aproximaban desde `x12` con el dataset redactado); una fila por mercado, la más probable, con etiquetas legibles («Ambos anotan: Sí», «Más de 1.5 goles»). El resto de la landing sigue redactado.
  - Se quitó la sugerencia de monto del modelo («Sugerencia calibrada: Xu» en `MatchTicketCard` y «Sugerencia Xu» en el pick público): regla v3.2 de cero stake. Las unidades que el socio elige al sellar en su bitácora no cambian.
- **Verificado:** `apps/web/tests/outlook.test.ts` (7: cada pick de fútbol usa una probabilidad publicada por v3.2, ningún pick de «Valor», `market` nulo; NFL con ganador v3.2), suites completas y capturas con Playwright del Inicio y de la ficha (Querétaro vs Monterrey: 39.7 % · 25.7 % · 34.6 %, pick principal «Querétaro o empate» 65.4 %) y de la landing (Sin empate 74.3 %, Más de 1.5 goles 79.8 %, Ambos anotan: Sí 59.8 %).
- **Pendiente:** el servidor de vista previa `web-prod` de `.claude/launch.json` ya no deja entrar con PIN porque su `BETA_COOKIE_SECRET` de ejemplo es rechazado por la regla de seguridad en producción; usar un secreto aleatorio de 32+ caracteres (como Playwright) si se quiere recorrer el Club ahí.

### CLUB-V2 · Tarjetas, ficha del partido, boleto ganador, cuenta y páginas de picks — 2026-11-13 — Rama `gemini-reestructura`
- **Hecho:**
  - **Tarjetas del Inicio:** `.pl-cv-card` usa `content-visibility: auto`, que recortaba la tarjeta al subir 2 px en hover; se le dio un margen interno de 6 px. Chip de confianza (`ConfidenceChip`) con explicación por factor; sede con ícono y «Local/Visita» (oculto en sede neutral: `neutralSite` llega desde el DTO).
  - **Marca contra filtraciones:** la marca anterior era fija en código (`@sofia_nfl · TIPSTER-8842`, `PL-8842`) y tapaba el contenido. Ahora `getSessionWatermark(rol, identidad)` usa `@usuario · código de invitación`; `ClubWatermarkLayer` dibuja una trama diagonal al 3.5 % sobre todo el Club (máscara SVG, sigue el tema) y al copiar texto agrega «— Visto en PitchLab por @usuario» más una huella invisible de ancho cero (`encodeForensicTag` / `decodeForensicTag`). La imagen para compartir usa la identidad real.
  - **Confianza v3.2:** `outlookConfidence` en `apps/web/src/server/outlook.ts`: favorito (50 %), datos disponibles `coverageRatio` (30 %) y partidos jugados (20 %, tope 10); umbrales 62/45 como el índice anterior. `AnalysisConfidence.factors` nuevo en contratos.
  - **Ficha del partido:** `CortexAnalysisCard` ocupa 2/3 con pasos de «pensando», renglones de espera, texto palabra por palabra y «Ver completo»; claves, factores del motor y firmeza al final. Columna lateral con alineaciones y dinero. `MatchCommunityPoll` («¿Quién gana?» y «¿Se dará el pick principal?», resultados después de votar junto al modelo; tabla `match_votes`, migración `0016_votos_partido`, `GET/POST /api/social/votes` con cierre al inicio del partido). `MatchSimulator` (Poisson con las λ del modelo en fútbol; normales σ 10.5/13.5 sin empate en NFL; 10,000 corridas por lotes y «Jugar un partido» minuto a minuto). Pestañas: «Contexto» con `MatchContextPanel` (forma G/E/P, producción por partido, descanso, bajas, sede, altitud, historial con resumen) y «Comunidad» con las opiniones.
  - **Boleto ganador:** `WinningTicketDialog` + `renderWinningTicketPng` (publicación 4:5 e historia 9:16, sello «PICK/PARLAY GANADO», selecciones con palomita, momio, unidades, ganancia, @usuario, fecha y enlace de invitación). Vista previa = el mismo PNG; «Compartir» con Web Share (archivo) y «Descargar PNG». Se abre desde la Bitácora en las entradas ganadas.
  - **Mi cuenta:** referidos de +15 a **+7 días** para los dos (`REFERRAL_REWARD_DAYS`, `MEMBERSHIP_SPEC.referralBothRewardDays`, textos, correos y pruebas con la constante); embajador sigue en +30. Sin «Descargar tarjeta»; logotipos reales de WhatsApp (token `--social-whatsapp`) y X; «ULTRA» de la tarjeta 3D en canal rojo con arcoíris holográfico en el shader; la pastilla Ultra gira de forma continua y lenta (respeta movimiento reducido). Facturación oculta con `BILLING_TAB_ENABLED = false` (`?tab=cfdi` abre «Mi plan»). El `<dialog>` nativo ahora trae su panel (el de «Pausar tu cuenta» flotaba sin fondo).
  - **Editar perfil:** además de foto, nombre, usuario y bio: ligas favoritas por deporte, perfil público/privado y aparecer en rankings (se guardan con `PUT /api/me/preferences`; sin perfil público no hay ranking).
  - **Páginas:** `/app/picks` es «Buscar picks» (todas las selecciones en una lista, filtros por probabilidad, mercado y liga, orden y parlay); `/app/momios` es «Compara tu momio» (tu momio por selección contra el justo, convertidor americano/decimal/probabilidad; ya no depende de cuotas de casa); `/app/historial` muestra acierto por liga y por tipo de pick, racha reciente y lista por día (se quitaron «0 editados» y la desviación v3.0 que no se podían comprobar).
- **Verificado:** pruebas nuevas (`packages/ui/tests/match-v2.test.ts`, `packages/db/tests/votes.test.ts`, confianza en `apps/web/tests/outlook.test.ts`), suites completas, `build` y e2e (ver resultado de la corrida al cierre), y capturas con Playwright de las stories `Platform v4 / Ficha del partido v2` a 1440 y 375 px en oscuro y claro sin desbordamiento, incluyendo simulación (40.9 % vs 39.7 % del modelo), votación y el PNG del boleto.
- **Pendiente:**
  1. Aplicar `0016_votos_partido` con `scripts/migrate-prod.ps1` antes del deploy.
  2. Las e2e no cubren todavía votos, simulador ni boleto ganador.
  3. Facturación se enciende cambiando `BILLING_TAB_ENABLED` cuando haya Facturapi.

### INTEGRACION-13NOV + DATOS-P0 · Trabajo de otros agentes y bloqueadores de datos de la auditoría — 2026-11-13 — Rama `gemini-reestructura`
- **Integrado:** snapshots automáticos de `main` (12 y 13 nov); ADR-028…ADR-038, `PROJECT_AUDIT_2026_11_13.md`, glosario e índice de ADRs que la sesión de Deska dejó sin commit (con «tipster» en lugar de «tipstar»). Se revisó y **no** se trajo: el worktree de Codex (copia vieja ya integrada por otros commits), `implement_loading_screens` (ya integrada) y las ramas de investigación (`prediction-lab`, `web-scraping`, REA).
- **P0-03 (identidades cruzadas):** `mappings.ts` ya no pinta clubes pasados con el escudo de otro (West Ham→Coventry, Southampton→Sunderland, Wolves→Hull, Leicester y Burnley→Leeds, Mazatlán→Atlante). Ahora resuelven con su nombre real por `HISTORIC_TEAMS` y la app los dibuja con iniciales. Verificado contra la fuente: openfootball 2026-27 trae los 20 clubes del paquete de escudos y ESPN confirma que Atlante sustituye a Mazatlán. Pruebas en `services/ingest/tests/mappings.test.ts`.
- **P0-02 (ligas europeas congeladas):** nuevo `espn-soccer-results.ts` (scoreboard público de ESPN, sin clave, ventana de 21 días atrás y 21 adelante, caché de días cerrados) convertido al formato de football-data y fusionado con `mergeFootballDataIntoSeason`; se usa sin `FOOTBALL_DATA_API_KEY` o si football-data falla. La jornada activa de openfootball ya no es «la más cercana por fecha» sino la primera con partidos sin terminar que no empezaron hace más de 36 h. Snapshots regenerados: Premier, LaLiga, Bundesliga, Serie A y Ligue 1 con 9–10 partidos por jugar, resultados reales de la jornada pasada (40–60 marcadores nuevos por liga), 0 vencidos y pulso de mercado de 9–10 partidos. Pruebas en `services/ingest/tests/espn-soccer-results.test.ts`.
- **P0-05 (atribución de tipsters):** `completeSignup` reconoce el código promocional de un tipster activo y crea `tipster_attributions` (`trial_5d`), con lo que sus pagos ya generan comisión. El invitado conserva la prueba de 7 días.
- **P0-01 (sincronización silenciosa):** el paso de Spacetime del workflow diario ya no usa `continue-on-error`; si algo falla descarta los datos nuevos y deja un `::warning::` visible en Actions. Nombre y commit del bot pasan a v3.2.
- **Ya resueltos antes de esta sesión (verificado en código):** P0-04 (factura antes que suscripción), P0-07 (parlays sellados en servidor) y P0-09 (suite en verde).
- **Pendiente:**
  1. ✅ **P0-08 rendimiento** resuelto el mismo día (ver PESO-P0-08).
  2. El workflow diario solo corre en `main`: hasta llevar `gemini-reestructura` a `main` los arreglos de datos solo llegan con `pnpm snapshot` manual.
  3. Momios de casa siguen vacíos (sin captura legal), sin cambio.

### PESO-P0-08 · First Load JS de 625 kB a 252–317 kB — 2026-11-13 — Rama `gemini-reestructura`
- **Causa:** el código de servidor y las páginas importaban `@pitchlab/ui` (o `@pitchlab/ui/platform`) desde el barril; en RSC eso mete en el JavaScript de la página todos los módulos `"use client"` de la librería (Club, cuenta, tarjeta 3D, HeroUI). `optimizePackageImports` no lo resuelve para un paquete del propio monorepo. Además, Astryx (~110 kB) entraba a todo el Club solo por el selector «Momio / Decimal» del shell.
- **Hecho:** subrutas en `@pitchlab/ui` (`/landing`, `/public-sections`, `/auth`, `/login-preview`, `/signup`, `/signup-preview`, `/home`, `/profile`, `/loading`, `/expired-pass`, `/access-guard`, `/canjear`, `/community-examples`) y las páginas pesadas y `public-site-data.ts` / `club-profile.ts` importan por ellas; `OWN_PROFILE_ALIASES` pasó a un módulo plano; `OddsFormatSegment` usa el `seg-well` de la casa (radio con flechas) en lugar de Astryx; el editor de perfil se carga en diferido; `"sideEffects": false` en `@pitchlab/ui`. Regla documentada en `docs/design/UI_LIBRARIES.md`.
- **Resultado (First Load JS):** `/` 625→253 kB; `/login` 279; `/signup` 273; públicas 252; `/app` 625→263; perfil 625→268; resto del Club 257–317 kB (antes 380–440). Todas debajo del presupuesto de 326 kB.
- **Pruebas:** e2e con marca de hidratación (`html[data-pl-hydrated]`) y fixture que solo la espera en `/app…`; suite completa y 14/14 e2e en verde.

### MI-RECORD-1 · «Mi récord» con banca privada, 7 estadísticas, privacidad y perfil público (Punto 1 de 7) — 2026-11-13 — Rama `mi_record_backend_api`
- **Hecho:**
  - **Cálculo puro y privacidad (`packages/ui/src/platform/record-stats.ts`, subruta `@pitchlab/ui/record-stats`):** `computeRecordStats` calcula curva de saldo (`curve`), acierto por liga (`byLeague`), mercado (`byMarket`) y tipo (`byType`), rendimiento sobre unidades jugadas (`yieldPct`), ROI opcional sobre banca inicial (`roiOnBankrollPct`), CLV promedio (`avgClvPct`), racha actual y mejor racha (`currentStreak`, `bestWinStreak`), momio promedio (`avgUserDecimal`) y mejor/peor mes (`bestMonth`, `worstMonth`), sin proyecciones futuras. `RECORD_PRIVACY_BLOCKS`, `normalizeRecordPrivacy`, `isShared` y `publicRecordView` filtran por bloque (`record`, `performance`, `bank`, `history`) y por campo individual; los montos en pesos y los picks abiertos nunca salen en `publicRecordView`.
  - **Base de datos y API (`packages/db`, `apps/web`):** migración `0017_mi_record_privacidad.sql` (`record_privacy jsonb` y `bankroll_start_mxn_centavos integer` con `CHECK` `$10..$10,000,000 MXN` en `user_preferences`), persistencia en `GET/PUT /api/me/preferences`, cargador `loadPublicRecord` (`apps/web/src/server/public-record.ts`) y ruta pública `GET /api/u/[handle]/record`.
  - **Interfaz `/app/lab` y perfil `/app/u/[handle]`:** renombre en navegación de «Bitácora» a **«Mi récord»** (`Récord` en móvil) conservando `/app/lab` y `originType: "Bitácora Propia"`. Reescritura de `BitacoraClubView.tsx` (subruta `@pitchlab/ui/record`, `apps/web/app/record-v2.css`) con 3 pestañas WAI-ARIA subrayadas (`?tab=picks|banca|privacidad`), componentes `RecordPicksTab`, `RecordBankStatsTab`, `RecordPrivacyTab` (`<Switch>` + `<Switch.Content>` de `@heroui/react@3.2.7` con `role="switch"`) y `PublicRecordSections` (vista previa en vivo idéntica a la salida pública). Integración SSR + cliente en `/app/u/[handle]` (`AnalystProfileClubView.tsx`) y 10 stories en oscuro y claro (`packages/ui/src/platform/record.stories.tsx`).
- **Verificado:**
  - `node scripts/lint-codebase.mjs` (0 hex fuera de `packages/tokens`, 0 `catch` vacíos), `node scripts/check-no-secrets.mjs`, `pnpm lint`, `typecheck` en `ui` y `web`, unitarias (`db` 41/41 con `0017`, `ui` 92/92 incluyendo `record-stats.test.ts` 7/7 y `record-view.test.tsx` 2/2, `web` 28/28 archivos en serie incluyendo `public-record.test.ts` 2/2) y `next build` en verde (`/app/lab` = `311 kB`, `/app/u/[handle]` = `275 kB`, todas `≤ 319 kB` < `326 kB`).
- **Pendiente para continuar en casa (`docs/execution/HANDOFF_PLAN_7_PUNTOS_2026_11_13.md`):**
  1. Correr `pnpm --filter @pitchlab/web build && pnpm --filter @pitchlab/web exec playwright test e2e/mi-record.spec.ts` para validar el clic del `<Switch.Content>` en escritorio y móvil (las revisiones Axe AA en oscuro y claro, banca MXN, cero fuga de pesos, cero `401` y cero overflow ya pasaron en la corrida previa).
  2. Implementar en orden los puntos **2 (Insignias)**, **3 (Comunidad)**, **4 (Parlay del día)**, **5 (Mercados derivados v3.2)**, **6 (Antes del partido)** y **7 (`@handle` sugerido en `/signup`)**.
  3. Antes de desplegar a producción, aplicar `0016_votos_partido` y `0017_mi_record_privacidad` con `scripts/migrate-prod.ps1`.
