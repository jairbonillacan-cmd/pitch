# Visión de producto PitchLab

> **Propósito:** definir para quién es PitchLab, qué problema resuelve y qué no hará. Toda sección y todo prompt debe poder justificarse contra este documento.
> **Consumidores:** todos los agentes, el fundador y la landing.
> **Fecha:** 2026-11-08 · **Fase:** F2

## 1. Tesis

En México, quien sigue la NFL, la Liga MX o la Premier League y quiere decidir con datos tiene dos opciones malas:

- Apps de picks con datos congelados y modelos opacos (TouchIQ, AztecaVet).
- Herramientas estadounidenses sin casas, idioma ni ligas locales (LineMate).

**PitchLab es el laboratorio de investigación deportiva para ese usuario:** datos con licencia que se actualizan solos, histórico consultable «tal como se sabía antes del partido», cuotas con hora y fuente, modelos que publican su calibración y una comunidad cuyo historial no se puede maquillar.

**Eslogan (marca):** *Lee el juego con datos.*

## 2. Propuesta de valor

| Para… | PitchLab ofrece… | En lugar de… |
|---|---|---|
| Investigar un partido | Game Center con contexto encadenado (equipo → jugador → prop → cuotas → histórico) | Abrir 5 pestañas y 3 apps |
| Evaluar un prop | Distribución, hit rate con n e IC, y probabilidad implícita de la cuota en la misma vista | «100 % en los últimos 10» sin denominador ni precio |
| Saber si una cuota es buena | Comparación entre casas, apertura y cierre, y movimiento con hora | Una cuota sin fecha |
| Confiar en un modelo | Brier, calibración y CLV publicados frente a un baseline | «90 % de acierto» |
| Demostrar criterio | Pick Journal inmutable, calificado solo y con CLV | Capturas de boletos editables |
| Aprender | Metodología, glosario y asistente que cita sus fuentes | Chatbots que inventan |

## 3. Personas

| ID | Persona | Contexto | Necesita | Paga por |
|---|---|---|---|---|
| **P1** | **Fan analítico** (25–40 años, NFL y Liga MX, móvil) | Revisa partidos del fin de semana y a veces apuesta poco | Entender rápido un partido y un prop, con un lenguaje claro | Props completos, histórico y alertas |
| **P2** | **Investigador serio** (escritorio, varias horas a la semana) | Compara líneas y lleva un registro de su rendimiento | Densidad, filtros, cuotas con hora, CLV y backtesting | Histórico de cuotas, Model Lab, backtest y exportaciones |
| **P3** | **Creador / tipster** (redes sociales) | Publica análisis y quiere demostrar su historial | Perfil público verificable, share cards y leaderboard | Pro/Elite, más los referidos que trae |
| **P4** | **Fan de datos / fantasy** (no apuesta) | Disfruta estadísticas y comparaciones | Perfiles de jugadores y equipos, game logs y comparadores | Pro (si encuentra profundidad) |
| **P5** | **Operador interno** (fundador o staff) | Mantiene los datos, modelos, usuarios y moderación | Admin claro con el estado de pipelines y auditoría | — |

P1 y P2 definen el MVP. P3 es el motor de crecimiento (referidos y redes). P4 amplía la audiencia sin depender de las apuestas.

## 4. Diferenciadores (objetivos y medibles)

1. **Datos con licencia y automáticos**, con frescura visible (frente a datos congelados).
2. **Histórico de cuotas propio** desde el día 1: apertura, cierre, movimiento y CLV (ninguna referencia lo tiene).
3. **Honestidad estadística**: n, IC, calibración y baseline siempre visibles.
4. **Integridad temporal**: Replay y backtest sin leakage.
5. **Comunidad verificable**: picks inmutables y leaderboard por CLV con muestra mínima.
6. **México primero**: español, ligas locales, emblemas propios, precios en MXN, IVA y CFDI.
7. **Una sola app coherente**: un shell, un sistema de diseño y contexto compartido entre secciones.

## 5. No-objetivos (lo que PitchLab no hace)

- No acepta apuestas, depósitos ni dinero de usuarios. No es operador.
- No da recomendaciones de apuesta ni sizing («apuesta X»). Muestra datos, probabilidades y diferencias.
- No otorga premios por acertar pronósticos (`COMPLIANCE_REGISTER.md` C-01).
- No hace afiliación con casas en el MVP.
- No hace scraping de casas ni usa datos sin licencia.
- No promete ganancias ni usa testimonios de ganancias.
- No usa teatralidad (intros, audio, mascotas) que retrase el acceso a los datos.

## 6. Métricas norte

| Nivel | Métrica |
|---|---|
| Valor | **Investigaciones completadas por usuario activo a la semana** (abrir un partido o prop y consultar al menos 2 vistas de contexto) |
| Retención | Activos semanales / registrados (W4 y W8) |
| Negocio | Conversión trial → pago, MRR neto y churn mensual |
| Crecimiento | % de registros por referido o invitación y K-factor de share cards |
| Confianza | % de cifras con hora de actualización y n (meta: 100 %), y calibración publicada de cada modelo activo |
