# ADR-021: Arquitectura Cero-Fuga en servidor, Pase Total único y motor de crecimiento Tipstar + Referidos

- **Estado:** Aceptada (2026-11-10). Extiende ADR-010 y ADR-011.
- **Decisión del fundador:** membresía única *Pase Total PitchLab* (\$299 MXN/mes o \$2,390 MXN/año), prueba gratis del Mes 1 sin tarjeta con escudo anti-abuso \$0 MXN, redacción Cero-Fuga desde el servidor, boletos pre-kickoff sellados, Comunidad VIP sin enlaces externos y programa de Tipstars Oficiales + referidos doble vía.

## Contexto

PitchLab monetiza inteligencia cuantitativa por suscripción: radiografías previas, de 4 a 5 picks estructurados por partido y un armador de parlays correlacionados. Ocultar selecciones únicamente con `filter: blur()` en CSS permite que cualquier visitante extraiga los picks desde el HTML SSR o el payload de hidratación de Next.js. Al mismo tiempo, el negocio requiere canales virales de adquisición (boletos compartibles en redes, creadores deportivos *Tipstars* y referidos entre amigos) y un primer mes de lanzamiento sin pedir tarjeta bancaria sin abrir la puerta a granjas de cuentas gratuitas ni fuga de picks antes del inicio del partido.

## Decisión

1. **Redacción Cero-Fuga en el servidor (`redactDatasetForVisitor` en `packages/ui/src/platform/access-guard.ts` y `apps/web/src/server/platform-data.ts`):**
   - Cuando la solicitud carece de sesión activa de socio (`viewerRole === "visitor"`), el servidor redacta las etiquetas, probabilidades exactas, momios justos y síntesis previas de todos los partidos no finalizados (`status !== "FT"`) **antes de serializar el árbol RSC/SSR**, reemplazándolos por marcadores neutros (`"Selección reservada Pase Total"`).
   - Solo permanecen abiertos para visitantes: (a) el 100 % de los partidos finalizados `FT` para auditoría pública transparente, (b) exactamente **1 Pick Abierto del Día** en portada, y (c) **1 Pick Abierto de la Semana** por Tipstar Oficial en `/p/[pickId]` (manteniendo protegidos los otros 4 picks de ese mismo encuentro).
2. **Sellado pre-kickoff en boletos de redes (`canRevealPickOnShare`) y marca de agua de sesión:**
   - Si un socio regular genera un boleto 4:5 o 9:16 antes de que el encuentro termine (`NS` o `LIVE`), el boleto exporta la confianza y las unidades pero **sella la selección exacta** hasta el silbatazo final (`FT`). Únicamente los boletos promocionales semanales de un *Tipstar Oficial* pueden mostrar la selección abierta antes del kickoff.
   - Toda vista de estudio y boleto incorpora una marca de agua determinista de sesión (`getSessionWatermark`) para trazabilidad ante capturas filtradas.
3. **Un solo *Pase Total PitchLab* y escudo anti-abuso \$0 MXN en Mes 1:**
   - Se eliminan los niveles escalonados (Free / Pro / Club) en favor de un único **Pase Total PitchLab** (\$299 MXN/mes o \$2,390 MXN/año, IVA y CFDI 4.0 incluidos).
   - Un interruptor operativo en `/app/admin` alterna entre **Mes 1 (7 días gratis sin tarjeta)** —protegido a costo \$0 mediante OAuth Google/Apple, normalización canónica de alias Gmail/Googlemail (`normalizeTrialEmail`: elimina puntos y sufijos `+tag`) y bloqueo de dominios desechables (`isDisposableEmailDomain`), sin SMS/WhatsApp de pago— y **Mes 2+ (verificación bancaria \$0.00 MXN)**.
4. **Comunidad VIP cerrada y filtro anti-spam (`containsExternalLink`):**
   - Solo socios con *Pase Total* leen y comentan en `/app/social`, mostrando junto a su nombre su récord verificado en unidades simuladas y CLV. El compositor rechaza automáticamente URLs externas y enlaces a Telegram/WhatsApp/Discord para impedir venta clandestina o spam.
5. **Adquisición por *Tipstars Oficiales* y Referidos Doble Vía:**
   - Cada *Tipstar Oficial* recibe *Pase Total* incluido, código promocional de **5 días gratis** (p. ej. `SOFIA5`), derecho a liberar 1 pick semanal (del motor o de su Bitácora sellada) y **25 % de comisión mensual recurrente**.
   - En referidos socio ↔ socio, el invitado recibe **7 días gratis + 30 % de descuento en su primer mes (\$209 MXN)** y, al liquidarse ese primer pago mensual, **ambas cuentas reciben +15 días gratis** automáticos (+30 días extra e insignia *Embajador* al alcanzar 5 amigos activos).

## Alternativas descartadas

- **Paywall puramente visual en cliente (CSS blur sobre datos reales):** descartado por permitir extracción trivial desde DevTools o scraping del HTML inicial.
- **Verificación por WhatsApp/SMS OTP en el Mes 1:** descartada por costo variable por mensaje; la combinación OAuth + normalización canónica de correo + bloqueo de dominios temporales mantiene costo operativo \$0 MXN.
- **Múltiples planes (Básico / Pro / VIP):** descartados por fricción comercial; el valor diferencial de PitchLab reside en entregar el paquete completo (radiografía + multi-picks + parlays + comunidad) bajo una sola llave.

## Consecuencias

- Ninguna ruta pública filtra selecciones futuras pagadas en el DOM ni en el JSON hidratado (verificado con pruebas unitarias sobre `redactDatasetForVisitor` y E2E en Playwright).
- Cuando se conecten Drizzle/Neon y Stripe/Conekta en producción (ADR-010, ADR-011), las concesiones de días gratis por referidos (`+15d` doble vía) y atribución de códigos Tipstar (`25 %`) se materializarán directamente como filas `entitlement_grants`.
