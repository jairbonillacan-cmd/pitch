# Prompt para Gemini · BETA-1.0 (todo funcional, cobro por transferencia y cupones)

Copia todo lo que va debajo de la línea.

---

Eres el agente de desarrollo de PitchLab. Vas a dejar lista la **Beta 1.0**: todo lo que usa un socio funciona de punta a punta con cuentas reales, y el cobro se hace **por transferencia bancaria** con aprobación manual del fundador, o con **cupones** que el socio canjea. Stripe queda apagado para después.

Trabajas en el monorepo de PitchLab, rama `gemini-reestructura`. Primero haz `git pull` de esa rama: hay trabajo reciente (nuevo Inicio, seguridad, renombre a «tipster»). Antes de tocar nada, lee:

- `AGENTS.md` y `docs/execution/PROJECT_STATE.md`, sobre todo las entradas **CUENTAS-1**, **CUENTA-2**, **EMAILS-1**, **COMUNIDAD-2**, **INTEGRACION-SEC**, **TIPSTER** e **INICIO-3**.
- `docs/product/GUIA_CUENTAS_Y_DESPLIEGUE.md`
- `docs/architecture/AUTH_BILLING_GROWTH.md` y `docs/architecture/CORREOS.md`
- `packages/db/src/billing.ts`: `grantDays`, `accessUntil`, `hasActivePaseTotal` y `handleInvoicePaid`.
- `packages/db/src/schema.ts`: `entitlement_grants`, `subscriptions`, `referral_grants`, `admin_audit_logs` y las tablas de tipsters.
- `apps/web/src/server/request-security.ts`: `verifySameOriginMutation`, el limitador de intentos y `trustedClientIp`.

## 0. Reglas (obligatorias)

- **Idioma y nombres:** todo en español de México. Se dice **tipster**, nunca «tipstar». El plan se llama **Pase PitchLab Ultra**: $299 MXN al mes o $2,390 MXN al año, IVA incluido (`MEMBERSHIP_SPEC` en `packages/ui/src/platform/spacetime-catalog.ts`). No hay inicio de sesión con Apple.
- **Costo $0:** no agregues servicios de pago. Si algo necesita una clave nueva, déjalo apagado y con un aviso honesto mientras no exista, como X («Pronto»).
- **Claves y datos bancarios:** nunca en el código ni en git. La CLABE, el banco y el beneficiario salen de variables de entorno. No pidas, crees ni imprimas claves ni cadenas de conexión.
- **Producción no se toca:** ni la base `main` de Neon ni Vercel. Nada de push ni deploy. Haz commits locales por bloque, con mensajes en español en formato convencional.
- **Base de prueba:** usa la rama `local-9990` de Neon. Las migraciones se aplican solo con `scripts/migrate-9990.ps1`. Para levantar el servidor local usa `scripts/local-9990.ps1`; necesita `NEON_PROJECT_ID` en `.env.9990.local`, que está ignorado por git. Si no está configurado en tu PC, avisa y sigue con las pruebas automáticas.
- **Cuentas de prueba:** `prueba.local@example.com` (`@prueba_local`) y `prueba.dos@example.com` (`@lupita_mx`). El enlace para entrar se escribe en `.local/9990.log`. Para probar la consola, agrega solo en `.env.9990.local` la línea `PITCHLAB_ADMIN_EMAILS=prueba.local@example.com` y quítala al terminar.
- **Diseño:** sigue `AGENTS.md` y `docs/design/` al pie de la letra.
  - Solo tokens de `@pitchlab/tokens`: el linter bloquea cualquier hex fuera de ellos.
  - Tema oscuro y claro.
  - A 390 px, sin desplazamiento horizontal.
  - Objetivos táctiles de 44 px.
  - Estados vacío, cargando y error.
  - Cada componente nuevo lleva stories en oscuro y claro.
  - Antes de diseñar, carga los skills de diseño que pide `AGENTS.md`.
- **Seguridad:**
  - Toda ruta que cambia datos usa `verifySameOriginMutation` y el limitador de intentos.
  - Lo del fundador usa `requireAdmin` y queda registrado en `admin_audit_logs`.
  - Las concesiones de acceso son idempotentes, con `idempotencyKey`.
- **Pruebas en esta PC:**
  - Base: `cd packages/db; npx vitest run --no-file-parallelism --testTimeout=60000`
  - Web: `cd apps/web; npx vitest run tests --testTimeout=30000`
  - UI: `pnpm --filter @pitchlab/ui test`
  - Tipos: `pnpm typecheck`
  - Linter: `node scripts/lint-codebase.mjs`
  - Secretos: `node scripts/check-no-secrets.mjs`
  - Navegador: `pnpm --filter @pitchlab/web build` y luego `cd apps/web; pnpm e2e`
- **Ignora** los cambios automáticos de `apps/web/next-env.d.ts` y `packages/tokens/src/tokens.generated.ts`: no los incluyas en los commits.

## 1. Qué es «Beta 1.0 funcional»

Con cuentas reales (no PIN), un socio puede hacer todo esto sin ver nada roto ni datos inventados presentados como reales:

1. Registrarse (correo o Google) y recibir los **7 días gratis**, que ya existen.
2. Usar el Inicio, la ficha de partido, los picks, el armador de parlays (sellar incluido), la bitácora en servidor, Comunidad, el perfil y las notificaciones.
3. Ver en **Mi cuenta → Plan** hasta cuándo tiene acceso y cómo renovar.
4. Cuando se le acaba el acceso, llegar a una pantalla clara que le ofrezca **pagar por transferencia** o **canjear un cupón**.
5. Pagar por transferencia, avisar que ya pagó y ver el estado de su pago.
6. Canjear un cupón y tener acceso al instante.

Y el fundador puede, desde `/app/admin`, aprobar o rechazar pagos, dar o quitar días a mano, crear cupones y ver quién los canjeó.

**Fuera de alcance (déjalo apagado, sin romper nada):**
- Stripe Checkout y su portal.
- La factura CFDI automática con Facturapi.
- Los pagos automáticos a tipsters por Stripe Connect. Sus comisiones sí se registran y se pagan a mano.

## 2. Modo de pagos y Stripe apagado

- Agrega la variable `PITCHLAB_PAYMENTS_MODE` con los valores `transfer` (por omisión) o `stripe`. Documéntala en `.env.example`.
- Con `transfer`:
  - `POST /api/billing/checkout` responde `503` con un mensaje claro.
  - Ningún botón de la interfaz lo llama. Revisa `PlanTab.tsx` y `TechAndPricingSurfaces.tsx`, y busca cualquier otra llamada.
  - El código de Stripe y su webhook se quedan como están, sin borrarlos.
- En `/precio` y en Mi cuenta → Plan, el botón de compra lleva al flujo de transferencia (sección 3). El precio y la prueba gratis no cambian.

## 3. Cobro por transferencia

### 3.1 Datos bancarios

Salen de variables de entorno (documéntalas en `.env.example`):
- `PITCHLAB_TRANSFER_BANK`
- `PITCHLAB_TRANSFER_BENEFICIARY`
- `PITCHLAB_TRANSFER_CLABE`

Opcionales: `PITCHLAB_TRANSFER_INSTRUCTIONS` (un texto libre) y el correo de soporte que ya existe (`PITCHLAB_SUPPORT_EMAIL`).

Si falta la CLABE, la pantalla no inventa datos: dice «Escríbenos a soporte para recibir los datos de pago», con el correo.

### 3.2 Flujo del socio

1. **Elegir plan:** mensual ($299) o anual ($2,390).
2. **Pantalla «Pagar por transferencia»:**
   - Monto exacto, banco, beneficiario y CLABE, con botón de copiar.
   - **Concepto o referencia única por socio**, por ejemplo `PL-{@usuario}` con 4 caracteres de control. Debe ser legible y fácil de dictar.
   - Aviso: «Activamos tu acceso cuando confirmamos el depósito, normalmente el mismo día hábil».
3. **Botón «Ya transferí»:** abre un formulario con plan, monto, fecha, banco de origen y clave de rastreo o folio (opcional). Al enviarlo se crea una **solicitud de pago** en estado `pendiente`.
   - Solo una pendiente por socio a la vez.
   - Límite de 5 por hora.
   - El servidor valida el monto contra el plan elegido. Puede guardar un monto distinto, pero lo marca.
4. **Estado en Mi cuenta → Plan:**
   - «En revisión», «Aprobado» (con fechas) o «Rechazado» (con el motivo del fundador).
   - Historial de sus pagos.
   - Si la pestaña tiene facturas «Ejemplo», reemplázalas por este historial real.

### 3.3 Flujo del fundador (`/app/admin`, sección «Pagos y accesos»)

- **Cola de pagos pendientes:** socio, plan, monto, fecha, referencia y folio.
  - **Aprobar:** confirma el plan y otorga 30 o 365 días con `grantDays`, usando el tipo nuevo `transfer_payment` y la clave idempotente `transfer:{id}`. Así, aprobar dos veces no duplica días.
  - **Rechazar:** pide un motivo, que ve el socio.
- **Buscador de socios** por correo o @usuario. Muestra:
  - hasta cuándo tiene acceso (`accessUntil`) y de qué viene (prueba, pago, cupón, referido, concesión);
  - un botón para **dar días a mano** (`admin_grant`, con nota);
  - un botón para **quitar una concesión** (`revokedAt` y `revokeReason`).
- Todo queda en `admin_audit_logs`.

### 3.4 Efectos de un pago aprobado

- **Referidos y tipsters:** el primer pago de un invitado premia a ambos, y el tipster genera su comisión. Hoy eso sale de `handleInvoicePaid` (Stripe). Reutilízalo con un identificador sintético `transfer:{id}`:
  - monto bruto en centavos = lo pagado;
  - IVA = 16 % incluido;
  - comisión de pasarela = 0.

  Si algo de esa función depende de Stripe y no aplica, sepáralo con cuidado y pruébalo. Que aprobar dos veces no premie dos veces.
- **Correos:**
  - Al aprobar, envía `payment-receipt`.
  - Programa `renewal-reminder` 3 días antes del fin del acceso y `access-expired` al terminar, con la tabla `scheduled_emails` que ya existe.
  - Cancela los avisos de fin de prueba (`cancelTrialEmails`) si el pago llega durante la prueba.
  - Actualiza su estado en `packages/emails/src/wiring.ts` y en `docs/architecture/CORREOS.md`.

## 4. Cupones

### 4.1 Base de datos

Tabla `access_coupons`:
- `code` único, en mayúsculas, legible, sin 0/O ni 1/I;
- `days`;
- `max_redemptions` (null = sin límite);
- `redeemed_count`;
- `expires_at` (opcional);
- `active`;
- `note`;
- `created_by`.

Tabla `coupon_redemptions`, con `(coupon_id, user_id)` único.

### 4.2 Canje

- `POST /api/me/redeem`, con límite de 10 intentos por hora.
- Valida que el cupón exista, esté activo, no haya vencido, tenga cupo y que el socio no lo haya canjeado antes. Hazlo en transacción, con bloqueo para que dos canjes simultáneos no superen el cupo.
- Otorga días con `grantDays`, tipo nuevo `coupon` y clave `coupon:{couponId}:{userId}`. Los días se suman al acceso que ya tenga.
- Mensajes claros para cada error: no existe, vencido, agotado, ya canjeado.
- **Dónde se canjea:** en Mi cuenta → Plan, en la pantalla de acceso vencido y con un enlace `/canjear?codigo=XXXX`, que pide entrar si no hay sesión y luego canjea.

### 4.3 Consola del fundador

- Crear cupones: código automático o propio, días, usos máximos, vencimiento y nota.
- Lista con usos, botón para desactivar y quién canjeó cada uno.

## 5. Lo demás que falta para que todo sea funcional

1. **Acceso vencido o sin Pase:** cada candado y cada «Activar Pase» llevan al flujo de la sección 3, nunca a Stripe. El texto es honesto y sin presión.
2. **Preferencias de Mi cuenta en la base:** momio, tema, zona horaria, ligas favoritas, riesgo, alertas y privacidad. Hoy se guardan en `localStorage` (`pl-prefs-v1`). Pásalas a la base, con migración y ruta, y deja `localStorage` como respaldo sin cuenta.
3. **PIN de beta:** en producción con cuentas ya está apagado. Arregla los `401` repetidos: con PIN en un servidor con cuentas, el proveedor pide `/api/social/posts`, `/api/me/journal`, `/api/me/watchlist` y `/api/me/referrals`. Con `via === "beta"` no deben llamarse.
4. **Datos de ejemplo:** recorre las pantallas del Club con una cuenta real y deja marcado como «Ejemplo» todo lo que no sea real, o quítalo. Ninguna cifra inventada debe verse como real.
5. **Facturación (CFDI):** mientras no haya Facturapi, la pestaña dice «Si necesitas factura, escríbenos a {soporte} con tu RFC». Sin formularios que no hagan nada.
6. **Tipsters:** el portal funciona y las comisiones se registran. Los pagos automáticos quedan apagados con la bandera que ya existe (`tipster_payouts_enabled`). La consola muestra lo que hay que pagarle a cada tipster para hacerlo a mano.

## 6. Migraciones

- Una migración nueva, después de la `0014`. Por ejemplo, `0015_beta1_transferencias_cupones`, con su entrada en `meta/_journal.json`. Debe:
  - ampliar el `CHECK` de `entitlement_grants.source_kind` con `transfer_payment` y `coupon`;
  - crear las tablas de solicitudes de pago, cupones, canjes y preferencias.
- Pruébala en PGlite (las pruebas ya aplican todas las migraciones) y en `local-9990`.
- **No la apliques en producción.** `scripts/migrate-prod.ps1` la tomará en el próximo deploy.

## 7. Pruebas y verificación

- **Base:**
  - aprobar dos veces no duplica días;
  - rechazar no da acceso;
  - el canje respeta el cupo con dos canjes simultáneos;
  - un cupón vencido o inactivo falla;
  - el premio del referido llega una sola vez con `transfer:{id}`;
  - `accessUntil` suma bien la prueba, la transferencia y el cupón.
- **Web:**
  - socio común contra admin (`403`);
  - mismo origen (`403` sin `Origin`);
  - límites de intentos (`429`);
  - `503` del checkout en modo `transfer`.
- **UI:** stories en oscuro y claro de pagar por transferencia, «Ya transferí», estado del pago, canjear cupón, acceso vencido y la sección «Pagos y accesos» de la consola.
- **Navegador:** que `pnpm e2e` siga en verde; agrega casos para las pantallas nuevas si es posible.
- **En vivo en el 9990, con las dos cuentas:**
  1. `@lupita_mx` deja de tener acceso. Para simularlo, revoca sus concesiones desde la consola.
  2. Ve la pantalla de acceso vencido.
  3. Avisa una transferencia.
  4. `@prueba_local`, como admin, la aprueba.
  5. `@lupita_mx` recupera el acceso con la fecha correcta.
  6. Repite con un cupón de 30 días.

  Toma capturas a 1440 y 390 px, en ambos temas.

## 8. Documentación y entrega

- **`docs/product/GUIA_CUENTAS_Y_DESPLIEGUE.md`:** nueva sección «Cobro por transferencia (Beta 1.0)» con:
  - las variables que debe cargar el fundador en Vercel;
  - cómo aprobar pagos y crear cupones;
  - el **SQL equivalente**, para la consola de Neon, de: dar N días a un correo, quitar acceso, crear un cupón y ver quién lo canjeó.
- **`docs/execution/PROJECT_STATE.md`:** entrada **BETA-1** con qué se hizo, cómo se verificó y qué queda pendiente.
- **Commits locales por bloque** (modo de pagos, transferencias, cupones, preferencias, arreglos, documentación), sin push.
- **Mensaje final en el chat**, corto:
  - qué quedó funcionando;
  - qué no se pudo hacer y por qué;
  - cómo probarlo en 5 pasos;
  - qué tiene que hacer el fundador: cargar los datos bancarios en Vercel, aplicar las migraciones y desplegar.
