# Picks, lecturas IA y datos previos al partido

> **Propósito:** cómo convertir la retroalimentación de socios (2026-11-08) en funciones del pre-MVP, en qué orden y con qué límites.
> **Consumidores:** fundador (decisiones marcadas con **FD**), agentes de producto, modelo e IA.
> **Estado:** fase A implementada (2026-11-09). Fases B, C y D: propuesta.

### Fase A: qué quedó y qué se aprendió

- **Picks por perfil**, **confianza**, **marcador proyectado coherente**, **«Por qué este pick»**, **historial y descanso**, **mejores selecciones** e indicador **Hoy / En juego**. Código en `packages/models/src/picks.ts`, `services/ingest/src/pick-context.ts` y `packages/ui` (`PicksPanel`, `BestPicks`, `ConfidenceBadge`).
- **Validado fuera de muestra** (`Reportes/modelos/BACKTEST-BLEND.md`, 6 ligas, 2023-24 a 2026-27): los perfiles están calibrados (conservadora 83.7 % anunciado / 82.4 % real; intermedia 65.9 / 65.2; arriesgada 48.0 / 49.0).
- **La confianza mide la claridad del favorito**, no el acierto de un pick: el favorito acierta 64 % con confianza alta, 48 % con media y 46 % con baja. Así se explica en la UI y en `/metodologia`.
- **Regla nueva: picks solo antes del inicio.** Cada pick lleva `picksAt`, y uno sin constancia previa se retira. Si el análisis se genera con el partido ya empezado, se publica sin picks.
- **Hallazgo de datos:** en Bundesliga, LaLiga, Serie A y Ligue 1 la fuente abierta solo trae resultados hasta el 20 sep 2026. Hay jornadas ya jugadas que siguen apareciendo como «programadas» y el modelo va ~7 semanas atrasado. La solución propuesta (football-data.org gratis cubre esas ligas) entra en la fase B.
- NFL tiene picks, pero su calibración por perfil todavía no se valida.

## 0. Resumen

| # | Pedido | Respuesta | Fase |
|---|---|---|---|
| 1 | Dar el pick, no solo la estadística | **Sí.** «Pick PitchLab» por partido, derivado del modelo con reglas fijas | A |
| 2 | Conservadora / intermedia / arriesgada | **Sí.** Tres perfiles por rango de probabilidad | A |
| 3 | Ranking de confianza | **Sí.** Índice Alta / Media / Baja por partido | A |
| 4 | Mejores selecciones | **Sí.** Lista de la jornada por perfil (probabilidad × confianza) | A |
| 5 | Congruencia de proyecciones | **Es un problema real** (22 de 57 análisis de fútbol se contradicen a la vista). Se corrige | A |
| 6 | Factores del modelo | **Rediseñar:** «por qué» en lenguaje claro y menos índices sueltos | A |
| 7 | «Que diga cuál está ahora» | El pick visible en la tarjeta, sin abrir el partido, más indicadores «Hoy» y «En juego» | A |
| 8 | Datos históricos | **Sí.** Historial entre ambos equipos y nivel por temporada, desde `data/history` | A |
| 9 | Alineaciones antes del partido | **Sí, con fuente gratis.** Sección «Alineaciones», que aparece cuando se publican (≈ 1 h antes) | B |
| 10 | Analizar noticias (bajas) | **Sí.** Bajas confirmadas por API y noticias resumidas por IA | B + C |
| 11 | Lecturas IA | **Sí.** Texto corto que explica el pick con las cifras del modelo | C |
| 12 | Generador de picks con búsqueda en línea | **Sí, acotado.** La IA busca contexto, pero las probabilidades salen del modelo | C |
| 13 | Mejorar el motor | Siguientes mejoras medibles y una decisión pendiente (cuotas de mercado) | D |

**Orden recomendado:** A (no requiere datos nuevos, ni costo, ni riesgo) → B → C → D. A se puede mostrar a los socios en días.

---

## 1. Qué es un pick en PitchLab (reglas fijas)

Un pick es **la selección que el modelo considera más probable dentro de un perfil de riesgo**, con su probabilidad, su cuota justa y su confianza. No es una promesa ni una instrucción de apuesta.

### 1.1 Perfiles

| Perfil | Probabilidad de la selección | Mercados elegibles | Ejemplo |
|---|---|---|---|
| **Conservadora** | ≥ 70 % | Doble oportunidad, más de 1.5, menos de 3.5, goles por equipo | «Betis o empate · 72 %» |
| **Intermedia** | 52–70 % | 1X2, más/menos de 2.5, ambos anotan, doble oportunidad | «Más de 2.5 · 61 %» |
| **Arriesgada** | 30–52 % y cuota justa ≥ 1.9 | 1X2 del no favorito, hándicap, empate | «Betis gana · 44 %» |

- Dentro de cada perfil gana la selección con la **mayor probabilidad × confianza** (§3). Si ninguna cumple, el perfil queda vacío y se dice «sin pick en este perfil». No se fuerza un pick.
- **Pick PitchLab** (el destacado) = el pick **intermedio**. Si no existe, el conservador.
- Las selecciones de un mismo partido deben ser **compatibles entre sí**: no se puede proponer «Local gana» y «Visita o empate» a la vez. Hay un test que lo verifica.
- NFL: ganador, spread y total con los mismos rangos.

### 1.2 Integridad (lo que nos protege)

- El pick se **publica y se congela** con el análisis (`publishedAt`). Nunca se cambia después del inicio.
- Cada pick se califica solo al terminar el partido, con el mismo resultado oficial.
- **Historial público de picks** por perfil: aciertos, probabilidad media declarada y calibración. Es la prueba de que los porcentajes significan algo, y es el argumento comercial más fuerte frente a quien vende picks sin historial.
- Copy: «Pick PitchLab», «más probable», «confianza». Nunca «seguro», «fijo», «candado», montos ni stakes. Aviso 18+ y de juego responsable junto a los picks (C-07, C-08).

> **FD-18 (nuevo):** publicar picks cambia la postura de «solo probabilidades» a «selección sugerida». Legalmente sigue siendo información (sin premios, sin casas ni afiliados), pero conviene que el abogado lo vea junto con C-03. **Recomendación:** activarlo en la beta cerrada ya, con el historial público desde el día 1.

---

## 2. Congruencia de proyecciones (bug de presentación)

**Qué pasa hoy.** El análisis muestra tres cifras que miden cosas distintas:
- **Proyección** = goles **esperados** (media), por ejemplo 1.60 – 1.79, total 3.39.
- **Marcador más probable** = la celda más probable de la rejilla, por ejemplo 1–1 (≈ 11 %).
- **Totales** = P(menos de 3.5) = 53 %.

Las tres son correctas, pero juntas parecen contradecirse: «van a meter 3.4 goles, pero el marcador es 1–1 y gana el menos de 3.5». Medí los snapshots actuales: **22 de 57 análisis de fútbol** tienen al menos un caso así. NFL no tiene este problema.

**Corrección:**
1. **Marcador proyectado coherente.** Se elige el marcador más probable **dentro** del resultado favorito (1X2) **y** del lado favorito de goles totales. Si gana la visita y es más probable más de 2.5, sale 1–2, no 1–1. Se muestra con su probabilidad.
2. Renombrar la proyección a **«Goles esperados»** y la rejilla a **«Marcadores más probables»** (top 3 con su %), con una línea de ayuda: «Los goles esperados son un promedio; el marcador más probable suele ser más bajo».
3. **Test de congruencia en CI** sobre cada snapshot:
   - el marcador proyectado pertenece al resultado favorito y al lado favorito de totales;
   - los picks del partido son compatibles entre sí.

---

## 3. Índice de confianza

Va de 0 a 100 y se muestra como **Alta / Media / Baja** con su motivo. Se calcula con lo que ya existe:

| Componente | Mide | Fuente |
|---|---|---|
| Ancho del intervalo del 90 % | Incertidumbre del ajuste | `intervals` del modelo |
| Muestra | Partidos de la temporada de cada equipo | Snapshot |
| Acuerdo entre temporada y memoria larga | Si el modelo de la temporada y las ratings históricas coinciden | Mezcla actual (`HISTORY_BLEND_WEIGHT`) |
| Bajas relevantes (fase B) | Ausencias confirmadas | API de alineaciones y bajas |

- Se **valida con el historial**: los partidos de confianza Alta deben acertar más que los de Baja en el backtest. Si no, el índice no se publica.
- El índice ordena el **ranking de confianza** de la jornada y pondera las **mejores selecciones**.

## 4. Mejores selecciones de la jornada

- Es una vista por liga y una global, con tres pestañas: Conservadora, Intermedia y Arriesgada.
- Ordena por **probabilidad × confianza**, con máximo un pick por partido.
- Cada fila lleva el partido, la selección, el %, la cuota justa, la confianza y el enlace al análisis.
- Cuando haya cuotas (fase D, The Odds API gratis), se añade la columna **«Valor»** (probabilidad del modelo menos la implícita de la cuota). Es lo que de verdad distingue una buena selección de un favorito obvio.

## 5. Factores del modelo: qué cambiar

Hoy son 10 tarjetas con índices sueltos (por ejemplo «índice 1.09»). Propuesta:

| Se queda | Cambia | Se agrega |
|---|---|---|
| Ataque y defensa (en goles/partido, sin «índice») | «Intervalo 90 %» pasa a ser el índice de confianza | **«Por qué este pick»:** 3 frases automáticas con los factores que más mueven el resultado («Betis concede 25 % menos que la media») |
| Localía | Forma y posición se agrupan en «Momento» | **Memoria larga:** nivel histórico de cada club |
| | | **Historial entre ellos:** últimos 5 cruces (fase A) |
| | | **Descanso:** días desde el último partido (fase A) |
| | | **Bajas** (fase B) |

FD-16 sigue vigente: nada de nombres de algoritmos ni de proveedores.

## 6. Datos históricos (fase A)

Todo sale de `data/history`, que ya está versionado:
- **Cara a cara:** últimos 5 partidos entre ambos con marcador, fecha y localía.
- **Nivel por temporada:** posición final de cada club en las últimas temporadas.
- **Rachas** simples: invicto en casa, partidos con ambos anotan, etc. Son contexto, no entradas del modelo.

## 7. Alineaciones y bajas (fase B)

| Liga | Fuente gratis | Qué da | Límite |
|---|---|---|---|
| Liga MX, Premier, LaLiga, Bundesliga, Serie A, Ligue 1 | API-Football Free (`/fixtures/lineups`, `/injuries`) | Once titular y formación (≈ 1 h antes) y lesionados/suspendidos | 100 solicitudes al día, compartidas con el snapshot de Liga MX |
| NFL | nflverse `injuries` y `depth_charts` (CC-BY 4.0) | Reporte oficial de lesiones y estatus | Semanal |

- **Presupuesto de API-Football:** solo partidos del día, una llamada de bajas por liga al día y una de alineaciones por partido entre 60 y 30 min antes. Son ≈ 40–60 solicitudes en un día de jornada completa. El cron necesita una corrida extra cerca de los partidos.
- **Sección «Alineaciones»** en el análisis: formación, titulares y suplentes. Antes de publicarse: «Se publica cerca de 1 h antes».
- **Bajas en el modelo:** la primera versión **las muestra y baja la confianza**, pero no cambia las probabilidades. Ajustar la fuerza por jugador ausente requiere datos de minutos y goles por jugador. Se propone en D solo si un backtest lo justifica.
- El análisis publicado no se reescribe: las alineaciones y bajas se **agregan** como «actualización previa al partido» con su hora.

## 8. IA: lecturas, noticias y generador de picks (fase C)

Usa OpenRouter con un modelo barato (FD-15), con `data_collection: "deny"` y tope de gasto prepagado (`AI_ARCHITECTURE.md`).

**Regla de oro:** la IA **no inventa probabilidades ni elige el pick**. Recibe el análisis del modelo (cifras, pick y confianza) y:

1. **Lectura IA** (3–4 frases): explica el pick con las cifras del modelo. Un validador rechaza el texto si menciona una cifra que no está en el análisis (grounding).
2. **Noticias previas:** búsqueda web de OpenRouter, limitada a los partidos del día y a ~5 resultados por partido. Extrae **bajas, dudas y contexto** (técnico nuevo, rotaciones). Cada hallazgo lleva la fuente enlazada y la hora. Si una baja no está confirmada por la API, se marca «reportado, sin confirmar».
3. **Generador de picks:** es la vista de mejores selecciones (§4) con la lectura IA de cada una. Si las noticias detectan una baja importante, el pick conserva la cifra del modelo, pero la confianza baja y la lectura lo advierte.

- **Costo estimado:** 7 ligas × ~10 partidos por jornada, con 1 lectura y 1 búsqueda cada uno. Son centavos de dólar por jornada con un modelo barato. El gasto real se mide con el tope prepagado. **Precio de la búsqueda web por verificar antes de activarla.**
- Etiqueta visible: «Lectura generada por IA a partir del modelo PitchLab». Con esto, decir «IA» en la landing ya es verdad (FD-16 lo permitía solo cuando existiera).

## 9. Mejoras del motor (fase D)

Ya aplicado: memoria larga en fútbol (log loss −0.0043 fuera de muestra, `BACKTEST-BLEND.md`). Lo siguiente, medido igual (walk-forward, peso fijado antes):

1. **Totales con xG estimado por tiros.** El research mostró mejoras en algunas ligas. Habría que reentrenar con datos de licencia clara.
2. **Memoria larga en NFL** con el mismo esquema que fútbol.
3. **Calibración por perfil de pick.** Que el 70 % de la conservadora acierte de verdad ~70 %.
4. **Cuotas de mercado como entrada** — **FD-19.** Es la mejora más grande disponible (el research muestra una brecha de ~0.015 de log loss frente al mercado), pero la metodología pública hoy dice «no usa las cuotas como entrada». Hay dos opciones:
   - (a) mantener el modelo independiente y usar las cuotas solo para la columna «Valor»;
   - (b) mezclar con el mercado y cambiar la metodología.
   **Recomendación: (a).** Un modelo independiente es lo que permite decir «aquí hay valor».

## 10. Fuera de alcance

- Mostrar cuánto apostar, bankroll real o montos.
- Picks de pago o premios por acertar (C-01, Stripe).
- Scraping de casas de apuestas.
- Datos de sitios sin licencia (native-stats.org, Understat) en lo publicado.

## 11. Decisiones del fundador

| ID | Decisión | Recomendación |
|---|---|---|
| FD-18 | Publicar picks por perfil | Sí, con historial público desde el día 1 y revisión legal junto con C-03 |
| FD-19 | ¿Cuotas como entrada del modelo? | No: solo para medir el valor |
| FD-20 | Corrida extra del cron cerca de los partidos (alineaciones) | Sí, 60 min antes, en días de jornada |
| FD-21 | Gasto mensual tope de IA (OpenRouter) | US$ 10 prepagados para la beta |
