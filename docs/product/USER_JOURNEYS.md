# Journeys de usuario

> **Propósito:** los flujos completos que el producto debe soportar de punta a punta. Cada uno se convierte en una prueba E2E de Playwright (F4/F6).
> **Consumidores:** autores de prompts, QA y diseño.
> **Fecha:** 2026-11-08 · Rutas según `docs/architecture/ROUTE_MAP.md`.

## J1 · Descubrimiento → registro → trial (P1)

1. Llega a `/` desde una red con `utm_source` (por ejemplo, Instagram).
2. Ve el valor con capturas reales del producto y los deportes y ligas disponibles.
3. Va a `/pricing`, elige Pro y pulsa «Probar 7 días».
4. En `/signup` (email, Google o Apple) declara su fecha de nacimiento (bloqueo si < 18) y acepta los términos y el aviso de privacidad con consentimientos granulares.
5. Verifica su email. Llega a `/app/onboarding` (ligas, equipos con emblemas, intereses).
6. Llega a `/app` con un Dashboard personalizado y el banner de trial («quedan 7 días»).

**E2E:** registro con 18+, rechazo con < 18, trial `trialing`, atribución UTM guardada.

## J2 · Referido → trial sin tarjeta → pago (P3 → P1)

1. P3 comparte `pitchlab.mx/r/ABC123?utm_source=x`.
2. El invitado ve `/r/ABC123`: quién lo invita (nombre público y avatar), «7 días de Pro gratis» y CTA.
3. Registro (J1, pasos 4–5). El trial se activa **sin tarjeta** (FD-04). Se crea `ReferralRedemption(status=trial)`.
4. Emails en el día 0 y el día 5. En el día 7, el invitado elige un plan y paga, o pasa a Free automáticamente.
5. Si paga: `converted`. Al terminar el periodo de reembolso pasa a `rewarded` y el referente recibe 1 mes (FD-05) más una notificación.
6. Antifraude: mismo email normalizado, dispositivo o método de pago → `rejected` y sin recompensa.

**E2E:** canje válido, autorreferido bloqueado, un trial por persona, recompensa diferida.

## J3 · Invitación directa (admin o usuario)

1. Admin crea una `Invite` (beta cerrada, prensa o creador) con su concesión (por ejemplo, 30 días Elite), `maxUses` y expiración.
2. El link `/invite/:token` muestra la concesión. Registro o login y aplicación de la concesión.
3. Token vencido o agotado: mensaje claro y CTA a `/pricing`.

## J4 · Investigar un partido (P1, núcleo del MVP)

1. Desde `/app` o `/app/nfl` toca un partido y llega a `/app/nfl/games/:gameId`.
2. **Resumen**: equipos (emblema o fallback), hora, estado, línea y total con casa y hora, y frescura de datos.
3. Pestaña **Jugadores**: elige un jugador y abre su Prop Lab con el contexto (`?market=rec_yds&line=…`) **sin volver a elegir el partido**.
4. Ve la distribución, el hit rate (n, IC y push), los splits y la cuota implícita.
5. Pestaña **Cuotas**: comparador entre casas, apertura y cierre, y movimiento.
6. Acciones: agregar el jugador a la watchlist, registrar un pick (J5) o preguntar a la IA con el contexto precargado.

**E2E:** el contexto se conserva en la URL; recargar mantiene el estado; el badge *stale* aparece con datos viejos.

## J5 · Registrar un pick → compartir → seguidores (P3)

1. Desde Cuotas o Prop Lab pulsa «Registrar pick» y se abre un drawer: selección, la cuota observada (casa y hora, sellada por el servidor), unidades (0.5–5) y nota opcional.
2. Antes del inicio del evento puede editarlo o borrarlo. Al iniciar el evento queda **bloqueado** (inmutable).
3. «Compartir» genera la share card (`/p/:id`, OG dinámico) con botones de X, Facebook, Threads y LinkedIn, más Web Share o descarga de imagen para Instagram y TikTok, todo con UTM.
4. Cuando el evento termina, el pick se califica solo con el feed de resultados y se calcula el CLV contra el cierre.
5. El perfil público `/u/:handle` actualiza su registro, ROI en unidades con IC y CLV.
6. Con 30 picks o más, el perfil entra en `/leaderboards` (si es público).

**E2E:** el lock impide editar después del inicio; «ocultar» no saca el pick de las métricas; calificación automática con un fixture de resultados.

## J6 · Seguimiento y alertas (P1/P2)

1. Agrega un equipo, jugador o partido a la watchlist.
2. Configura alertas: cambio de línea mayor a X, lesión de un jugador seguido o inicio de partido.
3. Recibe la notificación en `/app/notifications` (y por email si lo eligió). El enlace abre con el contexto.

## J7 · Evaluar un modelo (P2)

1. `/app/predictions`: predicciones de modelos **que pasaron el gate**, con probabilidad, cuota justa y diferencia frente al mercado.
2. Desde «¿Qué tan bueno es este modelo?» va a `/app/models/:modelId`: Brier, log loss, calibración, CLV y comparación con el Baseline 0 y el mercado, por temporada.
3. `/app/backtest`: elige el modelo, la ventana y los filtros, y ejecuta un backtest walk-forward. Obtiene resultados con su intervalo de confianza.
4. `/app/replay/:gameId`: elige un instante antes del partido y ve las stats, cuotas y predicción disponibles en ese momento. Luego avanza y compara con el resultado.

## J8 · Gestionar la suscripción (todos)

1. `/app/account/billing`: plan, estado (trialing, active, past_due, canceled), próximo cargo con IVA y método de pago.
2. Upgrade o downgrade con prorrateo según el proveedor. Cancelación en ≤ 2 clics, con confirmación de la fecha de fin.
3. Datos fiscales opcionales para CFDI.
4. Pago fallido: banner con reintento; el acceso se mantiene durante el periodo de gracia y después pasa a Free.

## J9 · Privacidad y autoexclusión

1. `/app/account/privacy`: consentimientos (analítica y marketing), descarga de datos y solicitud de eliminación (ARCO).
2. «Pausar módulo social»: oculta los leaderboards y el feed y deja el perfil privado, durante 30 o 90 días o de forma indefinida.

## J10 · Operación (P5)

1. `/admin`: salud de los pipelines (última ingesta por proveedor, errores y frescura por liga), usuarios, trials, conversiones y MRR.
2. `/admin/data`: reintentar un job, ver diferencias entre proveedores y resolver la reconciliación de entidades.
3. `/admin/moderation`: reportes de perfiles y picks, con acciones y auditoría.
