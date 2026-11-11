# Decisiones del fundador antes de activar cobros (F4)

> **Fecha:** 2026-11-11 · **Rama:** `gemini-reestructura`
> **Para qué:** revisar en una sola sesión lo que solo el fundador puede decidir. Cada punto trae la recomendación y qué cambia en el código si se elige otra opción.
> **Contexto:** el código de F4 (cuentas, Stripe, CFDI, Turnstile, consola) ya está hecho y probado; se enciende con las variables de `.env.example`.

## Decisiones tomadas (2026-11-11)

| # | Tema | Decisión | Qué sigue |
|---|---|---|---|
| 1.2 | Prueba «Mes 1 sin tarjeta» | **Se decide al ver datos.** Queda encendida y se apaga a mano desde `/app/admin`. | Nada en código. Revisar conversión y cuentas repetidas en la consola. |
| 1.3 | Hosting al cobrar | **Vercel Pro** desde que haya cobros. | Cambiar de plan antes de pasar Stripe a modo real (primer costo fijo). |
| 1.4 | Persona que factura | **Pendiente: con el contador.** | Configurar Facturapi cuando se defina. |
| 2.1 | Base de la comisión | **25 % sobre el neto** (sin IVA ni comisión de Stripe). | Ya implementado en `computeCommission`. |
| 2.2 | Pago a tipstars | **Stripe Connect desde el inicio** (no SPEI manual). | Programar el alta de creadores en Connect Express y las transferencias automáticas al liquidarse cada comisión. |
| 2.4 | Descuento del referido | **Solo plan mensual, $90 fijos** (primer mes de $209). | Crear el cupón `amount_off: 9000` MXN, `duration: once`, limitado al precio mensual. |
| 3.1 | Fuente de momios | **API con licencia antes de cobrar.** | Integrar el proveedor elegido como fuente de la matriz de momios y dejar de usar scraping en producción. |
| 3.2 | Props de jugadores | **Esperar datos con permiso.** Siguen en «próximamente». | Conseguir registros partido a partido y validar en `prediction-lab`. |
| 3.3 | Cortex IA con LLM | **Activar al lanzar**, revisando el gasto la primera semana. | Cargar `OPENROUTER_API_KEY` y fijar `OPENROUTER_PROVIDER`. |
| 3.4 | Iconografía (ADR-016) | **Aprobado MaestroIcon** (set propio, sin Lucide). | ADR-016 aceptada con esa decisión. |
| 4.x | Legal | **Solo borradores por ahora;** la revisión legal queda para antes de pasar Stripe a modo real. | Preparar borradores de términos, privacidad y juego responsable. |

## 1. Cobro y producto

| # | Decisión | Recomendación | Si eliges otra cosa |
|---|---|---|---|
| 1.1 | Precio del Pase Total: $299/mes y $2,390/año (ADR-025). | Mantenerlo. Ya está en la UI y en el plan de Stripe. | Cambiar `MEMBERSHIP_SPEC` en `spacetime-catalog.ts` y crear otros precios en Stripe. |
| 1.2 | Prueba gratis: Mes 1 sin tarjeta, luego verificación de tarjeta de $0. | Arrancar sin tarjeta y apagarlo desde `/app/admin` al llegar a un número fijo de cuentas activas (el doc de crecimiento propone 250 o 500). Elegir el número. | La bandera ya vive en la base (`month1_no_card_mode`); no hay que tocar código. |
| 1.3 | Hosting al cobrar. | **Cambiar a un plan comercial de Vercel antes de cobrar.** `PRE_MVP.md` justifica Hobby porque «no se cobra»; las condiciones de Hobby son para uso no comercial. Es el primer costo fijo del stack. | Alternativa a evaluar: otro hosting con capa gratuita que permita uso comercial. |
| 1.4 | Persona que factura (Facturapi): física (RESICO 626 / 612) o moral (601). | Decidir con el contador; el código acepta ambas. | Ninguno en código; cambia la configuración de Facturapi. |

## 2. Crecimiento

| # | Decisión | Recomendación | Si eliges otra cosa |
|---|---|---|---|
| 2.1 | Comisión de tipstars: 25 % sobre el neto (sin IVA ni comisión de Stripe), liquidable a 14 días. | Mantener el neto: es lo que calcula `computeCommission` y protege contra reembolsos. | Cambiar `computeCommission` en `packages/db/src/billing.ts`. |
| 2.2 | Pago a tipstars: SPEI manual el día 5 (fase 4A) antes de Stripe Connect. | Sí, con los primeros 3–10 creadores. | Connect requiere cuenta de plataforma en Stripe. |
| 2.3 | Referido doble vía: +15 días a ambos con el primer cobro ≥ $150; +30 al 5.º amigo. | Mantener (ya implementado e idempotente). | Constantes en `billing.ts`. |
| 2.4 | Descuento al amigo referido: 30 % el primer mes. | Solo en el plan mensual, como cupón de $90 fijo (primer mes de $209). El anual ya ahorra 33 %. | Crear el cupón en Stripe; el código acepta cualquier Promotion Code. |
| 2.5 | Tipstars de ejemplo (Sofía, Carlos, Diego). | Mantenerlos marcados «Ejemplo» hasta tener el primer tipstar real; darlo de alta desde `/app/admin` y quitar `isExample`. | — |

## 3. Datos y motores

| # | Decisión | Recomendación | Riesgo |
|---|---|---|---|
| 3.1 | Fuente de momios en producción. Hoy la matriz de v3.0 sale de scrapers de casas (Caliente, Pinnacle) en `web-scraping`. | **Pasar a una fuente con permiso** (API de momios con licencia o acuerdo con la casa) antes de cobrar. Mientras tanto, la app deja de mostrar momios con más de 72 h. | Raspar casas de apuestas suele violar sus términos; mostrar sus momios en un producto de pago agrava el riesgo. |
| 3.2 | Props de jugadores. | **No publicarlos todavía.** Solo hay totales de temporada por jugador, sin registros partido a partido, y sin ellos no se puede validar la calibración (regla de ADR-027). Conseguir registros por partido con permiso y validar en `prediction-lab`. | Mostrar props sin validar repetiría el problema de los datos inventados. |
| 3.3 | Cortex IA con LLM (DeepSeek vía OpenRouter). | Activarlo con un proveedor fijo y sin retención de datos (ya configurado). Solo se genera al abrir un partido con sesión y se guarda en memoria. Revisar el gasto en OpenRouter la primera semana. | Si el texto trae un número que no está en los datos, se descarta y se usa la plantilla. |
| 3.4 | Iconografía (ADR-016, propuesta). | Aprobarla como está resuelta en v4.1 (`MaestroIcon`, sin librería externa). | — |

## 4. Legal y cumplimiento

| # | Decisión | Recomendación |
|---|---|---|
| 4.1 | Publicidad y pronósticos de apuestas en México (+18, juego responsable). | Revisión legal antes de cobrar: textos de juego responsable, verificación de mayoría de edad y lo que se promete en la portada. |
| 4.2 | Términos y aviso de privacidad. | Actualizar `/legal/*` con cobro recurrente, datos fiscales (CFDI) y uso de correo para el enlace de acceso. |

## 5. Orden sugerido para encender

1. Decidir 1.3 (hosting) y 4.1–4.2 (legal).
2. Crear cuentas y cargar variables: Neon → `DATABASE_URL`, `pnpm --filter @pitchlab/db migrate`; Better Auth + Resend; Turnstile.
3. Stripe en modo prueba: producto, dos precios, cupón 2.4, webhook. Probar un cobro de punta a punta con tarjetas de prueba.
4. Facturapi en modo prueba con la persona elegida en 1.4.
5. Cambiar 3.1 (fuente de momios) y pasar Stripe y Facturapi a modo real.
6. PR de `gemini-reestructura` a `main`.
