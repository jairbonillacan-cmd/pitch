# Registro de cumplimiento (México primero)

> **Propósito:** listar las obligaciones y riesgos legales y de plataformas, con su estado. **No es asesoría legal.** Los puntos marcados como «abogado» requieren revisión profesional antes del lanzamiento público.
> **Consumidores:** fundador, arquitectura (auth, billing, social) y Help/Legal.
> **Fecha:** 2026-11-08
> **Estados:** ✅ verificado con fuente · 🔎 investigado, pendiente de confirmar · ⚖ requiere abogado · ⛔ bloqueante

## 1. Registro

| ID | Tema | Hallazgo | Estado | Impacto en la arquitectura | Acción |
|---|---|---|---|---|---|
| C-01 | **Pagos: Stripe** | Stripe incluye entre sus negocios prohibidos *«sports forecasting or odds-making with a monetary or material prize»*. Puede apoyar negocios de la lista con **aprobación previa explícita**. LineMate (análisis sin premios) cobra con Stripe en EE. UU. (OBSERVADO). | 🔎 | `BillingProvider` abstracto. **Ninguna función de PitchLab da premios monetarios o materiales por pronosticar** (los leaderboards sin premios; las recompensas de referidos atadas al referido, no al acierto). | Solicitar revisión de cuenta a Stripe MX describiendo el producto (SaaS analítico, sin apuestas ni premios) |
| C-02 | Pagos: Mercado Pago | Suscripciones con `preapproval_plan`, `free_trial` en `auto_recurring` y medios de pago en MX (tarjeta, CLABE, OXXO). Los ejemplos de la documentación usan ARS. | 🔎 | Segundo adaptador de `BillingProvider` | Probar en sandbox MX. Revisar su política de categorías restringidas. |
| C-03 | Ley Federal de Juegos y Sorteos (1947) y su reglamento | Regula los juegos con apuesta mediante permisos de SEGOB/DGJS. El art. 9 del reglamento exige permiso previo para la **publicidad de juegos con apuestas**. SEGOB tiene una propuesta de nueva ley (oct 2026, no publicada) e iniciativas sobre publicidad y menores (dic 2025). | 🔎⚖ | PitchLab **no acepta apuestas ni fondos**. Sin afiliados ni publicidad de operadores en el MVP. Los leaderboards y share cards hablan de análisis, no de casas. | Confirmar con un abogado que el Pick Journal, los leaderboards y las share cards no constituyen «publicidad de juegos con apuesta». Monitorear la nueva ley. |
| C-04 | Datos personales: **nueva LFPDPPP** | La nueva ley se publicó en el DOF el 20 de marzo de 2025 y entró en vigor el 21 de marzo de 2025. Abroga la de 2010. La autoridad pasa a la Secretaría Anticorrupción y Buen Gobierno. El aviso de privacidad debe detallar los datos tratados (identificando los sensibles) y separar las finalidades que requieren consentimiento. Para una finalidad nueva hace falta un nuevo consentimiento. | ✅ (ley) / 🔎 (reglamento) | Consentimiento granular (analítica de PostHog, marketing). Registro de finalidades. Derechos ARCO desde Cuenta. Retención definida. | Redactar el aviso de privacidad integral y simplificado. Verificar si ya se publicó el reglamento nuevo. |
| C-05 | Protección al consumidor (PROFECO) | Suscripción con renovación automática: informar el precio con IVA, la periodicidad, cómo cancelar y la fecha del cobro tras el trial. | ⚖ | Pricing muestra precios finales con IVA. Cancelación en 2 clics desde Cuenta. Email antes del fin del trial (día 5) y antes de cada renovación anual. | Revisar los términos con un abogado |
| C-06 | Facturación CFDI 4.0 e IVA | Servicios digitales gravados con el 16 % de IVA. Hay que emitir CFDI a quien lo solicite. | ⚖ | Datos fiscales opcionales en Cuenta. Integración con un PAC (por ejemplo, Facturapi) en la Wave de billing. | Definir con un contador la persona moral y el régimen |
| C-07 | Mayoría de edad | Contenido relacionado con apuestas: restringir a mayores de 18 | 🔎 | Fecha de nacimiento en el registro (rechazo si < 18). Términos lo exigen. | Decidir si basta la autodeclaración (default) o hace falta verificación |
| C-08 | Juego responsable | Buenas prácticas: sin promesas de ganancia, mensajes de riesgo y enlaces de ayuda | ✅ (voz de marca) | Aviso persistente en el módulo social. Autoexclusión del módulo social. Sin rachas que incentiven. | Contenido de Ayuda |
| C-09 | **Marca PitchLab** | Coincidencia exacta con una app de análisis de béisbol (`pitchlab-brand/VALIDATION.md`). IMPI pendiente. | ⛔⚖ | Ninguno técnico | FD-09: búsqueda fonética y registro en el IMPI (clases a definir con un abogado) |
| C-10 | **Emblemas de clubes y ligas** | Arte propio redibujado; los motivos, nombres y colores pueden ser marcas de terceros. GPT declara que la comparación de semejanza fue «visual y preliminar». | ⚖ | Interruptor `assets.emblems.<league>` y fallback neutro. Aviso de «ilustraciones editoriales». | Revisión legal antes del lanzamiento público (FD-08) |
| C-11 | Licencias de datos deportivos | Ver `DATA_PROVIDER_MATRIX.md` §2. Las APIs públicas de MLB y NHL no son aptas para uso comercial sin licencia (MLB: SECUNDARIO). | 🔎 | `provider_ref`, `source` en cada dato y nada de APIs sin licencia en producción | Obtener los términos por escrito |
| C-12 | Políticas de redes sociales | Contenido sobre apuestas restringido en Meta, TikTok, X y YouTube, sobre todo en anuncios | 🔎 | Las share cards muestran análisis y unidades simuladas, nunca casas, montos ni promociones | Revisar las políticas de anuncios antes de pautar |
| C-13 | Contenido de usuarios (perfiles y picks) | Responsabilidad por contenido, moderación, prohibición de afiliados y spam | 🔎 | Reportes, moderación en Admin, filtro de links y sanciones | Términos de uso con política de contenido |
| C-14 | IA (asistente) | Transparencia: identificar que es IA. Sin consejo financiero ni de apuestas. | ✅ (diseño) | System prompt y guardrails. Disclaimer en la UI. Logs. | — |
| C-15 | Tiendas de apps (futuro) | Apple y Google tienen reglas propias para contenido de apuestas y suscripciones | — | Fuera del MVP (web y PWA) | Revisar al planear apps nativas |

## 2. Reglas de producto que se derivan (vinculantes para los prompts)

1. Cero dinero real: sin depósitos, sin apuestas y sin deep-links de apuesta.
2. **Cero premios monetarios o materiales vinculados a pronósticos** (leaderboards, insignias y concursos). Las recompensas de referidos dependen de la conversión, no del acierto.
3. Sin afiliados ni promociones de operadores en el MVP.
4. 18+ obligatorio. Aviso de juego responsable en las superficies de picks.
5. Consentimiento granular y aviso de privacidad conforme a la nueva LFPDPPP.
6. Precio final con IVA, cancelación simple y aviso previo a cualquier cargo.

## Fuentes

- https://stripe.com/legal/restricted-businesses · https://support.stripe.com/questions/prohibited-and-restricted-businesses-list-faqs
- https://www.mercadopago.com.mx/developers/es/docs/subscriptions · https://mercadopago.com.mx/developers/en/docs/subscriptions/integration-configuration/subscription-associated-plan
- https://mley.mx/Reg_LFJS/articulo/9/ · https://www.elimparcial.com/dinero/2026/10/13/la-reforma-a-la-ley-federal-de-juegos-y-sorteos-un-obstaculo-para-el-sector-del-juego-y-las-apuestas-deportivas-onlinep/ · https://gaceta.diputados.gob.mx/PDF/66/2025/dic/20251217-II-6-1.pdf · https://focusgn.com/latinoamerica/presentan-iniciativa-para-endurecer-la-regulacion-de-las-apuestas-en-mexico
- https://www.garrigues.com/es_ES/noticia/mexico-nueva-ley-federal-proteccion-datos-personales-posesion-particulares-introduce · https://idconline.mx/corporativo/2025/03/31/ajustes-en-el-aviso-de-privacidad-con-la-ley-de-proteccion-de-datos
