---
status: accepted
date: 2026-11-10
---

# ADR-025: Suscripción única Pase Total, frontera Cero-Fuga en servidor, lanzamiento Mes 1 sin tarjeta ($0 anti-abuso) y motores duales de crecimiento (Tipstar Oficial + Referido Doble Vía)

- **Estado:** Aceptada (`accepted`)
- **Fecha:** 2026-11-10
- **Relación arquitectónica:** Consolida y detalla para producción (Fase 4) los contratos de [ADR-010](ADR-010-autenticacion-con-better-auth.md) (Better Auth), [ADR-011](ADR-011-billing-desacoplado-y-entitlements-por-concesiones.md) (`BillingProvider` + `entitlement_grants`), [ADR-021](ADR-021-arquitectura-cero-fuga-pase-total-unico-y-crecimiento-tipstar.md) (fundamentos Cero-Fuga), [ADR-023](ADR-023-smoked-glass-maestro-ui-physics.md) y [ADR-026](ADR-026-contrato-ejecutable-prototipo-maestro-y-simulacion-roles.md) (`UI-MAESTRO-V4.1`).

## Contexto

PitchLab comercializa en México y Latinoamérica inteligencia cuantitativa deportiva para mayores de 18 años producida por `Spacetime Suite` (`Tachyon v2.1`, `Singularity v2.1`, `Minkowski v2.1`, `Geodesic v1.0` y `Cortex IA`): entre 4 y 5 `Multi-Picks` estructurados por encuentro, `Radiografía Previa` con `Vigilancia 60m`, armado de `Boleto Combinado (Parlay)` con ajuste de correlación `Mismo Partido (SGP)`, `Props Lab`, `Bitácora` auditada en `Unidades Simuladas` y `Comunidad VIP`.

En este mercado convergen cuatro tensiones estructurales que una arquitectura convencional de SaaS no resuelve por defecto:

1. **Riesgo de fragmentación comercial e incentivos tóxicos:** vender picks sueltos por jornada empuja al producto hacia promesas de corto plazo, reclamos por varianza de un solo partido y fricción de pago recurrente; a su vez, dividir el acceso en escalones *Básico / Pro / VIP* amputa la experiencia integrada (p. ej. ver probabilidades sin poder validar correlación SGP ni debatir en la comunidad) y destruye la densidad de red.
2. **Dilema entre liquidez inicial y abuso de pruebas gratuitas:** exigir tarjeta bancaria desde el día uno en un producto nuevo en México frena el arranque en frío de la `Bitácora`, del `Consenso vs. Suite` y de la `Comunidad VIP`; pero abrir pruebas sin tarjeta sin defensas técnicas invita a granjas de multicuentas con alias de Gmail o correos desechables, mientras que verificar por SMS/WhatsApp OTP introduce un costo variable en dólares incompatible con la disciplina `$0` de lanzamiento.
3. **Vulnerabilidad de muros de pago cosméticos y reventa clandestina:** ocultar selecciones futuras con `filter: blur()` en CSS o banderas puramente de cliente deja los picks expuestos en el HTML SSR y en el payload RSC de Next.js, facilitando scraping automatizado o reventa de capturas en canales externos de Telegram y WhatsApp antes del inicio del partido.
4. **Adquisición viral sin fuga de valor ni fricción regulatoria en Stripe MX:** el crecimiento orgánico depende de creadores deportivos en Instagram, TikTok y X y de recomendaciones entre amigos, pero compartir boletos abiertos antes del silbatazo regala el producto; simultáneamente, premiar rankings comunitarios con efectivo o premios materiales expone la cuenta de Stripe MX a reclasificación como concurso o juego con apuesta.

## Decisión

Adoptamos una arquitectura unificada de monetización, protección de contenido y crecimiento viral compuesta por cuatro pilares indivisibles:

### 1. Membresía única `Pase Total` (`$299 MXN/mes` · `$2,390 MXN/año` con CFDI 4.0)

- **Un solo nivel de acceso total (`MEMBERSHIP_SPEC` en `packages/ui/src/platform/spacetime-catalog.ts`):** PitchLab opera exclusivamente bajo el **Pase Total PitchLab** a **`$299 MXN/mes`** (IVA 16 % incluido) o **`$2,390 MXN/año`** (`$199 MXN/mes` equivalentes, ahorro del `33 %` / 4 meses frente al ciclo mensual).
- **Cero venta de picks unitarios y cero niveles intermedios:** toda cuenta con `Pase Total` vigente (ya sea por suscripción pagada o por concesión activa en `entitlement_grants`) desbloquea sin restricciones las 7 ligas activas, los 4 a 5 `Multi-Picks` por partido, la `Radiografía Previa` y `Vigilancia 60m` de `Cortex IA`, el armador de `Boleto Combinado (Parlay)` y `Mismo Partido (SGP)`, `Props Lab`, `Bitácora` ilimitada y `Comunidad VIP`.
- **Facturación fiscal CFDI 4.0 automatizada:** cada cobro en México incluye timbrado automático CFDI 4.0 (vía Facturapi sobre los regímenes SAT soportados en `/app/account`: `601`, `612`, `626` RESICO y `605`, uso `G03`), consolidando la percepción de software analítico formal y deducible frente a grupos informales.

### 2. Estrategia anti-abuso de prueba gratis en dos fases (stack de costo `$0 MXN`)

- **Fase 1 — Lanzamiento Mes 1 sin pedir tarjeta (`month1NoCardMode = true`):** durante la ventana inicial de tracción se otorgan **7 días gratis de `Pase Total` sin solicitar tarjeta bancaria** para maximizar conversión de registro, poblar el `Consenso vs. Suite` y generar masa crítica de boletos sellados en `Comunidad VIP`.
- **Escudo anti-multicuenta de costo marginal `$0 MXN` (`packages/ui/src/platform/access-guard.ts` + `AuthSurfaceV4`):** se descarta cualquier OTP por SMS/WhatsApp de pago y se impone una cadena determinista de cinco capas sin costo variable:
  1. Autenticación prioritaria con proveedores de alta fricción de creación (**Google OAuth** y **Apple Sign-In** sobre Better Auth, ADR-010).
  2. **Canonicalización estricta de correo (`normalizeTrialEmail`):** conversión a minúsculas, unificación `googlemail.com → gmail.com`, eliminación de todos los puntos `.` en la parte local de cuentas Gmail y recorte de cualquier sufijo `+tag`, persistiendo el hash/correo canónico como llave única de elegibilidad histórica de prueba.
  3. **Bloqueo de dominios temporales (`isDisposableEmailDomain`):** rechazo inmediato en cliente (`role="alert"`) y en servidor de proveedores de correo desechable.
  4. **Mitigación silenciosa de bots con Cloudflare Turnstile (`$0`):** validación server-side previa a emitir cualquier sesión o concesión de prueba.
  5. **Huella de dispositivo y subred (`trial_fingerprints`):** registro de huella de navegador/dispositivo y hash de subred `/24` IPv4 / `/48` IPv6 para denegar pruebas repetidas desde el mismo terminal físico aunque cambie la cuenta de correo.
- **Fase 2 — Conmutación en caliente a verificación bancaria `$0.00 MXN` (`month1NoCardMode = false`):** la consola operativa `/app/admin` (`FounderAdminClubView`) expone el interruptor `month1NoCardMode` que conmuta el flujo de alta sin redespliegue hacia un `SetupIntent` de Stripe MX por **`$0.00 MXN`**, añadiendo deduplicación criptográfica por `card.fingerprint` de Stripe para impedir el reciclaje de tarjetas virtuales o prepago en el Mes 2 en adelante.

### 3. Frontera `Cero-Fuga` ejecutada en servidor + bucles virales controlados

- **Redacción obligatoria en servidor antes de serializar RSC (`redactDatasetForVisitor` en `packages/ui/src/platform/access-guard.ts` e invocación en `apps/web/src/server/platform-data.ts`):** cuando una petición carece de sesión válida de socio (`viewerRole === "visitor"`), el servidor purga de raíz todas las etiquetas de selección (`selectionKey: "locked"`, `label: "Selección reservada Pase Total"`), justificaciones cuantitativas, tablas secundarias de mercados y síntesis pre-partido de `Cortex IA` en todo encuentro no finalizado (`status !== "FT"`), marcando `isServerRedactedForVisitor: true`. Ningún dato confidencial viaja oculto en el DOM ni en el payload de hidratación de Next.js.
- **Únicas tres ventanas públicas autorizadas:**
  1. **Auditoría pública post-partido (`FT`):** el 100 % de los encuentros finalizados permanece abierto en `/` y `/app/historial` con su resultado real (`CUMPLIDO` / `NO CUMPLIDO`) y `0` picks editados o borrados, probando calibración sin regalar valor futuro.
  2. **`Pick Abierto del Día` (`isDailyOpenPromo`):** exactamente 1 selección futura desbloqueada al día en la portada `/`.
  3. **`Pick Abierto de la Semana` en `/p/[slug]` (`isTipstarWeeklyOpen` / `extraUnlockedPickIds` en `loadPublicPlatformState`):** libera públicamente **únicamente 1 pick** del partido elegido por el `Tipstar Oficial` (p. ej. `/p/sofia-sem`, `/p/carlos-sem`, `/p/diego-sem`), manteniendo **explícitamente redactados y con candado los otros 4 picks de ese mismo encuentro** (`[data-locked-pick]`). El visitante recibe una tesis verificable real mientras visualiza los cuatro ángulos restantes bloqueados (*Escudo Conservador*, *Línea de Totales*, *Ángulo Táctico*, *Valor Geodesic*).
- **Sellado de boletos compartibles pre-kickoff (`canRevealPickOnShare`) y marcas de agua de sesión (`getSessionWatermark`):**
  - Cualquier socio regular que comparta en redes un boleto `4:5` o `9:16` antes de que concluya el juego (`NS` o `LIVE`) genera una tarjeta con probabilidad y unidades visibles pero con la **selección exacta sellada**; la selección solo se abre cuando el encuentro pasa a `FT` o cuando quien emite es un `Tipstar Oficial` usando su cupo promocional semanal.
  - Todas las superficies de estudio y tarjetas de comunidad incrustan una marca de agua dinámica por sesión (`@handle · PL-XXXX` / `TIPSTAR-XXXX`) para trazabilidad inmediata ante filtraciones por captura de pantalla.
- **Blindaje de `Comunidad VIP` y cumplimiento estricto con Stripe MX:**
  - `/app/social` exige membresía `Pase Total` activa, adjunta a cada publicación la insignia auditada en `Unidades Simuladas` (`0.25u–5.0u`) y `CLV` con intervalo de confianza al 95 %, permite autoexclusión voluntaria mediante `Modo Pausa Social`, y bloquea determinísticamente cualquier URL externa o invitación a Telegram/WhatsApp/Discord (`containsExternalLink`).
  - **Cero premios monetarios o materiales en rankings:** el `Ranking CLV (IC 95 %)` otorga exclusivamente reputación analítica verificada dentro del club. Queda prohibido entregar dinero, saldo, apuestas gratis o premios físicos en tablas de posiciones, preservando la clasificación regulatoria y bancaria de PitchLab como suscripción pura de software e información estadística (+18) ante Stripe MX.

### 4. Motores duales de crecimiento: `Tipstar Oficial` y `Referido Doble Vía`

- **Motor 1 — Programa de creadores `Tipstar Oficial` (`/app/tipstar` + `/p/[slug]`):**
  - Creadores deportivos verificados (`TIPSTAR_CREATORS`, como `@sofia_nfl`, `@carlos_quant`, `@diego_tactico`) reciben `Pase Total` incluido a costo `$0`, un código promocional personalizado que otorga **5 días gratis** (p. ej. `SOFIA5`, `CARLOS5`, `DIEGO5`), derecho a publicar **1 `Pick Abierto de la Semana`** (originado en `Spacetime Suite` o en un boleto previamente sellado en su `Bitácora`), generador oficial de tarjetas `4:5` (Feed) y `9:16` (Stories/Reels/TikTok) conectadas a `/p/[slug]` y una **comisión recurrente del `25 %`** sobre los pagos netos mensuales o anuales de cada socio atribuido mientras mantenga su suscripción activa.
- **Motor 2 — `Referido Doble Vía` entre socios (`/app/account`):**
  - Todo socio dispone de un enlace y código único (p. ej. `SOCIO-8842`). El amigo invitado recibe **7 días gratis + `30 %` de descuento en su primer mes (`$209 MXN` en lugar de `$299 MXN`)**.
  - La recompensa es estrictamente condicional a cobro efectivo: únicamente al liquidarse la **primera factura pagada** del invitado (`amount_paid > 0`), el motor acredita automáticamente **`+15 días gratis` tanto al socio anfitrión como al amigo invitado** mediante filas `entitlement_grants` y ajuste de corte sin prorrateo.
  - Al acumular **5 amigos con primer mes pagado**, el socio anfitrión recibe un bono adicional único de **`+30 días gratis`** (`105 días` acumulados en total) y desbloquea la insignia verificada **`Embajador PitchLab`** en su perfil del Club.
  - **Exclusividad de atribución en el alta:** un registro nuevo redime o bien un código de `Tipstar Oficial` (5d gratis + 25 % comisión recurrente al creador) o bien una invitación de `Referido Doble Vía` (7d gratis + 30 % off Mes 1 + `+15d/+15d`), nunca ambos simultáneamente sobre la misma suscripción, protegiendo el margen unitario.

## Alternativas descartadas

- **Escalonamiento *Free / Básico ($149) / Pro ($299) / VIP ($599)* o venta de picks individuales por jornada:** descartado porque fragmenta la propuesta de valor de `Spacetime Suite`, complica la matriz de autorización, incentiva la mentalidad de "apuesta segura del día" y reduce el LTV frente a un club integral de precio accesible (`$299 MXN/mes` o `$199 MXN/mes` eq. anual).
- **Exigir tarjeta bancaria desde el día 1 del Mes 1 de lanzamiento:** descartado para las primeras semanas porque frena la densidad comunitaria inicial antes de contar con prueba social suficiente; el interruptor `month1NoCardMode` permite capturar liquidez en el Mes 1 con escudo anti-abuso de `$0 MXN` y activar `SetupIntent` `$0.00 MXN` en el Mes 2 en un clic.
- **Verificación telefónica por SMS o WhatsApp Business API durante el trial:** descartada en el arranque porque introduce un costo directo por intento (vulnerable a ataques de *SMS pumping*) que rompe la premisa de infraestructura `$0` previa a tracción pagada.
- **Muro de pago en cliente (difuminado CSS sobre datos reales) o compartir boletos pre-partido con selección visible para todos los socios:** descartado porque basta una sola cuenta en periodo de prueba para extraer por DevTools o redistribuir en grupos externos todas las selecciones futuras de la jornada.
- **Torneos mensuales de pronósticos con bolsas en efectivo o premios materiales:** descartados de forma definitiva porque contaminan el encuadre legal y de riesgo en Stripe MX y atraen cuentas especulativas de alta varianza en lugar de suscriptores enfocados en `CLV` sostenido.

## Consecuencias

- **Seguridad verificable de ingresos:** ninguna ruta pública (`/`, `/tecnologia`, `/pricing`, `/login`, `/signup`, `/p/[pickId]`) serializa picks pagados por jugarse hacia visitantes no autenticados; el servidor entrega únicamente marcadores redactados más la ventana promocional exacta permitida.
- **Alineación nativa con `entitlement_grants` (ADR-011):** el trial sin tarjeta del Mes 1 (7 días), el código de `Tipstar Oficial` (5 días), las recompensas bilaterales (`+15 días` ambos) y el bono `Embajador PitchLab` (`+30 días`) se modelan uniformemente como concesiones auditables con fecha de inicio, vencimiento e idempotencia por factura, desacoplando las reglas de acceso de los ciclos internos de la pasarela.
- **Economía unitaria protegida bajo viralidad máxima:** incluso en el escenario más intensivo de atribución (`25 %` de comisión recurrente a `Tipstar Oficial` o amortización de `+30 días` bilaterales tras el primer pago de `$209 MXN` en `Referido Doble Vía`), PitchLab nunca desembolsa CAC en efectivo por registros gratuitos no convertidos y mantiene margen bruto positivo desde el primer ciclo cobrado.
- **Contrato listo para implementación backend en Fase 4:** la especificación completa de máquinas de estado, tablas PostgreSQL/Drizzle (`subscriptions`, `trial_fingerprints`, `referral_grants`, `tipstar_attributions`, `public_weekly_picks`, `social_posts`, `cfdi_invoices`), webhooks de Stripe MX y timbrado Facturapi queda detallada en `docs/product/VISION_REESTRUCTURA_CLAUDE_GROWTH.md`.
