# Decisiones del fundador

> **Propósito:** registrar las decisiones que corresponden al fundador. Cada una trae un default para no bloquear el trabajo; mientras no se confirme, el default se trata como **supuesto**.
> **Consumidores:** fundador, arquitecto y autores de prompts.
> **Última actualización:** 2026-11-08

| ID | Decisión | Default propuesto | Por qué | Bloquea | Estado |
|---|---|---|---|---|---|
| FD-01 | Deporte y ligas de lanzamiento | NFL + Liga MX + Premier League | Motor NFL verificado, investigación de LineMate profunda y emblemas de ambas ligas | F2 MVP, F1 spike de datos | Supuesto |
| FD-02 | Presupuesto mensual máximo de datos | Por definir (el spike F1 dará opciones con costo real o «cotización requerida») | Define la profundidad histórica y la cobertura de props | F1 → F3 | **Abierta** |
| FD-03 | Planes y precios (Free, Pro, Elite) | Se fijan tras el modelo de costos de F1 | Sin costos reales, cualquier precio es inventado | F2 Pricing | Abierta |
| FD-04 | ¿El trial de 7 días pide tarjeta? | Sin tarjeta para el trial por referido o invitación; con tarjeta para el trial directo desde Pricing (se mide en PostHog) | Equilibra adquisición y abuso | F3 AUTH_BILLING_GROWTH | Supuesto |
| FD-05 | Recompensa por referido | 1 mes gratis al referente cuando el referido paga su primer mes, con tope de 6 al año | Solo se premia la conversión real | F3 | Supuesto |
| FD-06 | Proveedor de pagos | Se decide en el spike legal (Stripe con aprobación escrita, o Mercado Pago, Conekta u Openpay) | Restricción de Stripe a «sports forecasting» | F3 | **Abierta** |
| FD-07 | Leaderboards públicos de picks | Construidos detrás de un flag. Se abren al público solo con visto bueno legal. | Publicidad y regulación de apuestas en México | Lanzamiento público | Supuesto |
| FD-08 | Uso público de emblemas de clubes | Activos por liga detrás de un flag, con el aviso «ilustraciones editoriales». Revisión legal antes del lanzamiento. | Riesgo marcario de los motivos de clubes | Lanzamiento público | Supuesto |
| FD-09 | Registro de la marca PitchLab ante el IMPI | Iniciar la búsqueda y el registro (coincidencia con una app de béisbol) | `pitchlab-brand/VALIDATION.md` | Lanzamiento | **Abierta** |
| FD-10 | Fecha objetivo de la beta cerrada | Por definir tras F3 | Depende de FD-02 | Roadmap | Abierta |
| FD-11 | Destino de `research/` (espejo duplicado) | Archivar en la rama `archive/` y eliminarlo de main | Evita citas duplicadas | Ninguno | Supuesto |
| FD-12 | Versionar en git `pitchlab-brand/football/` y los cambios recientes del handoff | Sí, en un commit del fundador | Hoy no están en git | F4 | Abierta |
