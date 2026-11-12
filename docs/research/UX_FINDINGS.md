# Hallazgos de UX

> **Propósito:** patrones que adoptar y que evitar, tomados de las referencias. Regla: **patrón, nunca pieza**. Ningún elemento distintivo de terceros se copia.
> **Consumidores:** prompt 00 (Design System y Shell), `INTERACTION_PATTERNS.md` y agentes de sección.
> **Fecha:** 2026-11-08

## 1. Draftea (referencia de energía visual)

**Alcance de la revisión:** solo la landing pública `https://www.draftea.mx/` (2026-11-08, en el navegador del agente). La app requiere una cuenta de apuestas con depósito, así que **no se revisó**: no abrimos cuentas en operadores.

| Observación | Etiqueta | Lectura para PitchLab |
|---|---|---|
| Lienzo casi negro, acento morado saturado en pills de CTA y un marquee promocional fijo («apuestas gratis con tu primer depósito») | OBSERVADO | ⚠ **La marca PitchLab también usa morado (Pulso #B49AFF) sobre oscuro.** Para no parecer casa de apuestas: nada de marquees promocionales, nada de lenguaje de «ganar» o «cobrar», y Pulso reservado a un CTA por región (regla de la marca). |
| Display en mayúsculas, condensado y de peso alto | OBSERVADO | Se descarta. PitchLab usa Inter con la escala de la marca y mayúsculas solo en captions o eyebrows puntuales. |
| Mockups de teléfono como protagonista de la landing | OBSERVADO | Patrón válido (producto real en contexto), pero con capturas reales de PitchLab, nunca inventadas. |
| Pie con permiso DGJS, aviso de menores y juego responsable | OBSERVADO | PitchLab no es un operador y no necesita permiso. Sí tendrá un aviso de 18+ y juego responsable (`COMPLIANCE_REGISTER.md`). |
| Testimonios de «ganancias» | OBSERVADO | Prohibido en PitchLab (voz de marca: sin promesas de ganancia). |

**Energía que sí tomamos:** contraste alto, acento único y decidido, sensación móvil-first y rapidez. Todo eso ya está en la marca de GPT; no hace falta nada de Draftea.

## 2. Patrones a adoptar (de LineMate, el más maduro)

| Patrón | Evidencia | Versión PitchLab |
|---|---|---|
| Workstation de jugador: selector de mercado, scrubber de línea, barras por juego y tabla de game log | `Reportes/analisis-linemate/workstation.md`, `ux-and-design.md` §3.3 | Igual de denso, más histograma de distribución, n, IC y la cuota implícita en la misma vista. Barras acierto/fallo diferenciadas por **forma o patrón**, no solo por opacidad o color. |
| Números tabulares con Inter | `ux-and-design.md` §1 | Ya es regla de la marca |
| Sport switcher en la barra superior | `page-inventory.md` §3.1 | Selector de deporte persistente en el shell. El contexto vive en la URL. |
| Freemium con vista previa honesta | `auth-and-subscriptions.md` §2.2 | Filas de vista previa reales (no difuminadas), con el motivo del candado y el plan que lo desbloquea |
| Glosario | `page-inventory.md` | Ayuda y Metodología con glosario enlazado desde cada métrica (tooltip «¿qué es esto?») |

## 3. Fricciones de las referencias que hay que evitar

| Fricción | Fuente | Regla PitchLab |
|---|---|---|
| Tarjetas de tendencia con 4–5 badges redundantes | `ux-and-design.md` §4.1 | Una sola línea de señal resumida y el detalle al expandir |
| Frecuencias del 100 % sin contexto de precio | `ux-and-design.md` §4.2 | Siempre con n, IC y la probabilidad implícita de la cuota |
| Intros teatrales de 4 s para cálculos de 2 ms, audio y mascotas | `aztecavet/ux-and-design.md` | Sin splash salvo en la carga real. Movimiento según los tokens de la marca y `prefers-reduced-motion`. |
| Shell oscuro con dashboards blancos (choque) | `aztecavet/PITCHLAB_HANDOFF.md` §3 | Un solo tema oscuro en toda la app |
| Paywall que trunca sin explicar | LineMate | Estado «bloqueado» como componente del DS con motivo y acción |
| Información distinta entre sub-apps (3 HTML independientes) | AztecaVet | SportHub paramétrico: mismos componentes, configuración por deporte |

## 4. Implicaciones para el Design System (entradas del prompt 00)

- Densidad: filas de 44 px (token `--layout-tableRow`), con densidad compacta opcional de 36 px solo en tablas de escritorio.
- Componentes nuevos derivados de estos hallazgos: `HitRateBars` (con forma y patrón), `DistributionHistogram`, `SampleSizeBadge` (n e IC), `ImpliedProbabilityTag`, `LockedPreview` y `SignalSummary`.
- Cada métrica lleva un tooltip de definición enlazado al glosario.
