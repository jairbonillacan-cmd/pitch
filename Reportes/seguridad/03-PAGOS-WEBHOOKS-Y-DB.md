# 03 — Pagos, Webhooks, Integridad de Base de Datos y Cumplimiento

Este documento cubre Stripe Webhooks, Stripe Connect Express, cron de dispersiones, integridad de picks en DB, CFDI 4.0, checklist de validación externa y matriz de cumplimiento frente a `docs/architecture/SECURITY.md`.

---

## SEC-06 [Alta] — Condiciones de carrera en dispersiones Stripe Connect y penalización doble en reembolsos

- **Ubicaciones:**
  - [`packages/db/src/payouts.ts`](packages/db/src/payouts.ts#L31-L63) (`payableTransfers`, `markCommissionPaid`)
  - [`apps/web/src/server/billing/connect.ts`](apps/web/src/server/billing/connect.ts#L87-L139) (`stripeTransferCreator`, `runTipstarPayouts`)
  - [`apps/web/src/server/billing/stripe-webhook.ts`](apps/web/src/server/billing/stripe-webhook.ts#L202-L220), [`L254-L371`](apps/web/src/server/billing/stripe-webhook.ts#L254-L371) (`processStripeEvent`, `shiftStripeForClawback`)
  - [`packages/db/src/billing.ts`](packages/db/src/billing.ts#L64), [`L130-L190`](packages/db/src/billing.ts#L130-L190) (`handleInvoicePaid`), [`L240-L252`](packages/db/src/billing.ts#L240-L252) (`handleInvoiceRefunded`)
- **Traza de fallos verificados:**
  1. **Carrera TOCTOU entre cron de pagos y `charge.refunded` (`payouts.ts` + `connect.ts`):** `payableTransfers(db)` ejecuta un `SELECT` sin bloqueo (`FOR UPDATE SKIP LOCKED`) ni transición atómica a estado intermedio. Si entre esa lectura y `createTransfer(...)` entra un webhook `charge.refunded` que marca la comisión como `reversed_refund`, el cron ejecuta una transferencia MXN irreversible hacia la cuenta Express del tipstar y luego `markCommissionPaid` (`WHERE status = 'payable'`) actualiza `0` filas, descartando en silencio el `stripe_transfer_id` resultante.
  2. **Doble transferencia tras >24 horas ante fallo transitorio:** Si `createTransfer` triunfa en Stripe y `markCommissionPaid` falla (p. ej. caída de red hacia Neon), la fila queda en `payable` sin `stripe_transfer_id`. Pasadas 24 h expira la ventana de `Idempotency-Key: tipstar-payout:${ledgerId}` en Stripe, causando una segunda transferencia MXN en una corrida posterior.
  3. **Doble recorte de periodo de facturación en reintentos de `charge.refunded` (`stripe-webhook.ts`):** `processStripeEvent` inserta `processed_payment_events` fuera de transacción y, ante cualquier error posterior, borra esa marca (`line 369`). En `charge.refunded`, `shiftStripeForClawback` acorta la fecha en Stripe (`setSubscriptionTrialEnd`) y resta `ms` sobre `subscriptions.currentPeriodEnd` en Postgres **antes** de que `applyReferralClawback` revoque los `entitlement_grants`. Si `applyReferralClawback` falla (o falla el segundo usuario del ciclo), el reintento vuelve a leer los grants sin revocar, recalcula `ms` y vuelve a restarlo del ya reducido `currentPeriodEnd` con una nueva clave `trial_end:${subId}:${unix(newEnd)}`.
  4. **Ventana en entrega concurrente y `handleInvoicePaid` sin bloqueo:** Si Stripe entrega dos veces el mismo `event.id` en paralelo, el segundo worker ve `inserted.length === 0` y responde `200 OK` mientras el primero aún puede fallar y borrar `processed_payment_events`. Además, `handleInvoicePaid` (`billing.ts:130-190`) corre fuera de transacción y sin bloqueo por `userId`, permitiendo que pagos simultáneos de dos referidos distintos del mismo anfitrión superpongan `startsAt` en `grantDays` (`billing.ts:64`) o carezcan de guarda `WHERE status = 'trial_started'`.
- **Impacto:** Pérdida financiera directa por transferencias pagadas sobre cobros reembolsados o duplicadas tras >24 h, y acortamiento injusto de ciclos pagados de suscriptores ante reintentos de webhook.
- **Remediación defensiva:**
  - Introducir estado `'payout_in_progress'` reclamado atómicamente con `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`; persistir `stripe_transfer_id` por `id` sin condicionar al estado previo y conciliar con `GET /v1/transfers?transfer_group=...` antes de reintentar tras fallo.
  - En `charge.refunded`, ejecutar `applyReferralClawback` primero en transacción PostgreSQL (idempotente) y calcular el nuevo `trial_end` de forma absoluta a partir de `grantsUntil(db, userId)` en lugar de restas relativas repetibles.
  - Envolver `handleInvoicePaid` en transacción con `pg_advisory_xact_lock` y `WHERE status = 'trial_started'`.

---

## SEC-07 [Media] — Manipulación de bitácora sellada (`POST /api/me/journal`) y falta de trigger de inmutabilidad

- **Ubicaciones:**
  - [`apps/web/app/api/me/journal/route.ts`](apps/web/app/api/me/journal/route.ts#L15-L48)
  - [`apps/web/src/server/member-data.ts`](apps/web/src/server/member-data.ts#L41-L89)
  - [`packages/db/src/schema.ts`](packages/db/src/schema.ts#L58-L90), [`packages/db/src/client.ts`](packages/db/src/client.ts#L15)
  - `packages/db/migrations/0000_inicial.sql` .. `0006_correos_programados.sql`
- **Traza del flujo:**
  1. `POST /api/me/journal` solo valida el horario de cierre del partido (`findGameKickoff(gameId)`), aceptando directamente del body del cliente `pickId`, `pickLabel`, `matchLabel`, `leagueLabel`, `fairDecimal`, `userDecimal` (`numeric(7,3)` hasta `9999.999`) y `origin` — sin verificar contra el catálogo de `Spacetime` en el servidor y sin verificar `hasActivePaseTotal` ni `signupCompleted`.
  2. `sealHashOf` calcula un SHA-256 sobre esos valores aportados por el cliente, omitiendo además `gameId`, `matchLabel`, `leagueLabel`, `origin` y `note`.
  3. Ninguna migración SQL crea el trigger `pick_immutable` sobre `sealed_picks`, y la app se conecta con un único rol propietario en `DATABASE_URL` con permisos completos de `UPDATE`/`DELETE`.
- **Impacto:** Cualquier usuario autenticado puede sellar picks falsos con momios inflados atribuidos a `Spacetime Suite`, corrompiendo la integridad auditada del historial y métricas ROI/CLV (`SECURITY.md` §1).
- **Remediación defensiva:** Exigir `hasActivePaseTotal`, esquema Zod estricto, derivar `fairDecimal` y etiquetas exclusivamente del snapshot del servidor por `(gameId, pickId)`, agregar clave HMAC e incluir todos los campos inmutables en `sealHashOf`, e implementar el trigger PostgreSQL `BEFORE UPDATE OR DELETE ON sealed_picks` + rol restringido de grading.

---

## SEC-15 (Parte Backend CFDI) [Baja] — Fuga de PII en errores de Facturapi y errores de validación SAT

- **Ubicaciones:**
  - [`apps/web/src/server/billing/cfdi.ts`](apps/web/src/server/billing/cfdi.ts#L11), [`L71`](apps/web/src/server/billing/cfdi.ts#L71), [`L100`](apps/web/src/server/billing/cfdi.ts#L100)
- **Traza del flujo:**
  1. En `cfdi.ts:100`, ante error HTTP se lanza ``new Error(`Facturapi respondió ${res.status}: ${await res.text()}`)``, reflejando en excepciones/logs la respuesta cruda que puede contener RFC y razón social del contribuyente.
  2. `cfdi.ts:71` fija `use: "G03"` de forma rígida (el régimen `616` requiere `"S01"`) sin respetar `cfdiProfiles.cfdiUse`.
  3. `RFC_RE` en `cfdi.ts:11` (`/^([A-ZÑ&]{3,4})(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([A-Z\d]{2})([A\d])$/`) acepta fechas de calendario imposibles (ej. 31 de febrero) y falta validación de `Number.isInteger(totalCentavos) && totalCentavos > 0`. *(Nota: hoy `cfdi.ts` apunta a URL fija de Facturapi y aún no está expuesto en una ruta `/api/*`.)*
- **Remediación defensiva:** Sanitizar errores de Facturapi conservando solo código HTTP y clave SAT sin cuerpo crudo/PII, usar el `cfdiUse` validado según régimen fiscal, validar fechas calendario reales en RFC y asegurar validación de propiedad (`userId`) + regex en `facturapiId` cuando se monten las rutas de facturación.

---

## SEC-17 [Baja] — Múltiples brechas puntuales en Cron, Tipstars, Auth Schema, Suscripciones, Emails y Dependencias

1. **Comparación no constante de `CRON_SECRET` en endpoint financiero ([`apps/web/app/api/cron/tipstar-payouts/route.ts`](apps/web/app/api/cron/tipstar-payouts/route.ts#L14-L18)):** Usa `!==` estándar de JavaScript sobre el header `authorization` antes de disparar dispersiones reales de dinero; debe usar SHA-256 + `crypto.timingSafeEqual` y longitud mínima de secreto, además de consultar una bandera operativa de pausa (`tipstar.payouts.enabled`).
2. **Tipstars inactivos pueden crear cuentas Connect y devengar comisiones ([`apps/web/app/api/tipstar/connect/route.ts`](apps/web/app/api/tipstar/connect/route.ts#L18-L30), [`packages/db/src/payouts.ts`](packages/db/src/payouts.ts#L66-L73), [`packages/db/src/billing.ts`](packages/db/src/billing.ts#L192-L209)):** Ni `POST /api/tipstar/connect` ni `handleInvoicePaid` filtran `eq(tipstarProfiles.isActive, true)`, permitiendo que un tipstar desactivado abra cuenta Express o siga acumulando asientos cobrables ante una futura reactivación.
3. **`createTipstarCode` omite `RESERVED_HANDLES` y regex canónica ([`packages/db/src/admin.ts`](packages/db/src/admin.ts#L127-L135)):** Valida `/^[a-z0-9_]{3,24}$/` en vez de `checkHandleFormat`, permitiendo crear handles reservados (`admin`, `api`, `login`) o incompatibles que luego fallan con `404` en `/api/u/[handle]`.
4. **Falta índice único y cifrado en `auth_account` ([`packages/db/src/schema.ts`](packages/db/src/schema.ts#L608-L628)):** Carece de `UNIQUE (provider_id, account_id)` en Postgres, y a diferencia de X (donde sí se borran en la misma transacción), los `access_token`/`refresh_token`/`id_token` de Google y Apple persisten en texto plano en DB.
5. **`syncSubscription` sin validación de UUID/FK ni `UNIQUE` en cliente Stripe ([`apps/web/src/server/billing/stripe-webhook.ts`](apps/web/src/server/billing/stripe-webhook.ts#L127-L166), [`packages/db/src/schema.ts`](packages/db/src/schema.ts#L176-L190)):** Acepta `metadata.user_id` sin `UUID_RE` ni existencia en `users` (pudiendo provocar tormentas `500` de reintento ante suscripciones manuales o usuarios eliminados) y puede sobrescribir `providerCustomerId` sin restricción única `(provider, provider_customer_id)`.
6. **`cancelTrialEmails` nunca se invoca al convertir a pago ([`apps/web/src/server/billing/stripe-webhook.ts`](apps/web/src/server/billing/stripe-webhook.ts), [`apps/web/src/server/account-emails.ts`](apps/web/src/server/account-emails.ts#L111-L123)):** Usuarios que ya pagaron siguen recibiendo correos programados de «tu prueba terminó».
7. **Fallback a `request.url` en redirecciones de Checkout/Connect/OAuth ([`apps/web/app/api/billing/checkout/route.ts`](apps/web/app/api/billing/checkout/route.ts#L54), [`apps/web/app/api/tipstar/connect/route.ts`](apps/web/app/api/tipstar/connect/route.ts#L33)):** Si `BETTER_AUTH_URL` falta detrás de un proxy que reenvía `Host`/`X-Forwarded-Host`, las URLs de retorno pueden apuntar a un dominio externo.
8. **Piso vulnerable de Next.js en manifiesto ([`apps/web/package.json`](apps/web/package.json#L28) vs [`pnpm-lock.yaml`](pnpm-lock.yaml#L3727)):** El lockfile resuelve `next@15.5.29` (parchado), pero `package.json` declara `"next": "^15.1.7"`, cuyo límite inferior abarca versiones afectadas por CVE-2025-29927 si se instalara sin `--frozen-lockfile`.

---

## (B) Checklist de validación en despliegue (`B-01` a `B-06`)

*(Elementos dependientes de infraestructura externa; sin severidad asignada hasta verificarse en consola.)*

| ID | Qué validar | Dónde en código | Cómo verificar de forma segura |
|---|---|---|---|
| **B-01** | Presencia y entropía real de variables en Vercel Production (`PITCHLAB_COOKIE_SECRET` ≠ `.env.example`, `PITCHLAB_BETA_CODE`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `TURNSTILE_*`, `UPSTASH_REDIS_REST_*`, `CRON_SECRET`, `PITCHLAB_PREVIEW_TOOLS`) | `beta-auth.ts`, `auth.ts`, `tipstar-payouts/route.ts`, `platform-data.ts` | Revisar Vercel Project Settings → Environment Variables (Production y Preview). |
| **B-02** | Headers HTTP / CSP / WAF Rate-Limit en Cloudflare/Edge y sobrescritura de `X-Forwarded-For` | `middleware.ts`, `next.config.mjs`, `unlock/route.ts`, `signup.ts` | Comprobar cabeceras reales de respuesta y reglas Cloudflare Proxy / Transform Rules. |
| **B-03** | Alcance de eventos del endpoint Stripe Connect (`account.updated` exclusivamente o eventos con `event.account`) | `apps/web/app/api/webhooks/stripe/route.ts`, `stripe-webhook.ts` | Revisar Stripe Dashboard → Developers → Webhooks (Connect) y filtrar `event.account` en eventos plataforma. |
| **B-04** | Permisos por defecto de `GITHUB_TOKEN`, visibilidad del repo y protección de `main` y `prediction-lab` | `.github/workflows/ci.yml`, `pre-mvp-snapshot.yml` | Revisar GitHub Repo Settings → Visibility, Actions → General y Branch Protection Rules. |
| **B-05** | Aislamiento de datos y backups PITR/R2 en Neon proyecto `<NEON_PROJECT_ID>` | `scripts/local-9990.ps1:34`, `scripts/migrate-9990.ps1:6`, `SECURITY.md` §5 | Confirmar en consola de Neon que `local-9990` no contiene datos reales y que PITR + export a R2 están activos. |
| **B-06** | Verificación SPF/DKIM/DMARC en Resend (`EMAIL_FROM`) y URIs/alcance de Google & Apple OAuth | `.env.example`, `mailer.ts`, `auth.ts:137-139` | Verificar dominio `pitchlab.mx` en Resend y restringir `trustedProviders: ["google", "apple"]` + redirect URIs exactas. |

---

## (C) Matriz de cumplimiento frente a `docs/architecture/SECURITY.md`

| Control exigido en `SECURITY.md` | Estado actual en código | Brechas asociadas |
|---|---|---|
| **§1 & §2 `Cero-Fuga` / `can()` en servidor y RSC** | **Incumplido** | `SEC-01`, `SEC-02`, `SEC-03`, `SEC-04`, `SEC-05` |
| **§1 Trials (`trial_claim` hashes únicos, Turnstile, antifraude)** | **Parcial** (solo email canónico + `pg_advisory_xact_lock`) | `SEC-08`, `SEC-12` |
| **§1 Historial inmutable de picks (`pick_immutable`, cuota servidor, rol grading)** | **Incumplido** (cuota cliente, sin trigger ni rol separado) | `SEC-07` |
| **§1 Billing (firma + idempotencia + reconciliación diaria)** | **Parcial** (firma sólida; falta atomicidad en clawback/payouts y cron de reconciliación diaria) | `SEC-06`, `SEC-17` |
| **§1 & §2 Claves solo en servidor + `gitleaks` en CI** | **Parcial** (cero secretos propios vivos; falta `gitleaks`, hay claves/bundles terceros) | `SEC-10`, `SEC-14`, `SEC-18` |
| **§1 & §3 Roles DB (`user`/`staff`/`admin`), 2FA obligatoria, sesión 8 h, `audit_log`** | **Incumplido** (lista blanca en env, sesión de 30 días, sin 2FA, sin tabla `audit_log`) | `SEC-11`, `C2` |
| **§1 IA (solo lectura, cuotas, anti-injection, límites) + §4 flag `ai.enabled`** | **Parcial** (`max_tokens`/`MAX_CHARS` ok; ignora `ai.enabled`, mapa local sin cuota, sin `zdr: true`) | `SEC-13` |
| **§2 Validación Zod en todos los límites externos** | **Parcial** (faltan en `beta/unlock`, `admin/flags`, `admin/tipstars`, `watchlist`, `email-preferences`, `checkout`, adapters ESPN) | `SEC-07`, `SEC-13`, `C` |
| **§2 Sin `catch {}` silenciosos y telemetría Sentry sin PII** | **Incumplido** (`catch (err) { void err; }`, sin Sentry SDK, error Facturapi con texto crudo) | `SEC-12`, `SEC-15` |
| **§2 Consultas parametrizadas Drizzle SQL** | **Cumplido** (100 % parametrizado) | — |
| **§2 Cabeceras HTTP estrictas (CSP nonce, HSTS, `nosniff`, `frame-ancestors 'none'`)** | **Incumplido** (0 cabeceras configuradas en app) | `SEC-12` |
| **§2 CSRF (`Origin` check en handlers mutantes)** | **Parcial (1/12)** (solo en `POST /api/me/profile/x`) | `SEC-12` |
| **§2 Rate limiting Upstash en auth, picks, referidos, OG y búsquedas** | **Parcial** (solo en `/api/beta/unlock` con fallos de memoria/XFF) | `SEC-12` |
| **§2 `pnpm audit` en CI + Renovate semanal** | **Incumplido** (sin `pnpm audit` ni Renovate/Dependabot en `.github/`) | `SEC-10` |
| **§4 Flag `league.liga-mx` off por defecto hasta licencia** | **Desalineado** (`liga-mx` activa por defecto vía ESPN en `PRODUCT_LEAGUES`) | `SEC-18` / `C` |
| **§5 Respaldos Neon PITR + `pg_dump` R2 + prueba trimestral** | **No implementado en código/Actions** (sin workflow de backup diario a R2) | `B-05` |
| **§6 LFPDPPP / ARCO (borrado/anonimización ≤ 20 días, mínimo PII)** | **Incumplido** (sin endpoint ARCO, FKs `NO ACTION` bloquean borrado, `localStorage` CFDI PII, `publicProfile` falso, tokens Google/Apple en claro) | `SEC-15`, `SEC-16`, `SEC-17` |
