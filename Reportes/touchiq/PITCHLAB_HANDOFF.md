# PITCHLAB HANDOFF — Transferencia Maestra de Conocimiento

> **Destinatarios:** Equipo de Liderazgo, Arquitectura e Ingeniería de Datos de PitchLab  
> **Autor:** Antigravity / Reverse Engineering Agent  
> **Fecha de Emisión:** Noviembre 2026  
> **Documento Normativo:** Obligatorio para el diseño e implementación de la superapp PitchLab  

---

## 1. Qué Funcionalidades Ofrece TouchIQ

`[OBSERVADO]` TouchIQ se presenta como una suite de analítica deportiva y generación de picks:
- **Pantalla de Acceso con Código:** Pad numérico interactivo que solicita una clave de 4 dígitos ([REDACTED_PIN]).
- **Tablero Home:** Navegación por tarjetas visuales (robots deportivos con efecto 3D tilt).
- **Tableros Deportivos Dedicados (NFL y NCAA):**
  - Vista de partidos con probabilidades calculadas en vivo para 15 mercados de apuesta.
  - Tarjeta destacada de "Pick del Día" y sugerencias por partido.
  - Pestaña de Simulador entre cualquier par de equipos.
  - Feed de bajas y lesiones con editor de impacto en puntos y recálculo en tiempo real.
  - Tablas comparativas de baselines de equipos y estadísticas de jugadores (props).
  - Pestaña de "Dinero" con splits de volumen y boletos de DraftKings.
  - Módulo de auditoría de resultados de partidos concluidos.
- **Selector de Ligas de Fútbol (Staged):** Vista de 4 torneos (Liga MX, La Liga, Premier League, Champions League).
- **Cajón "Mi Boleto":**
  - Armado de apuestas simples y parlays.
  - Detección automática de Valor Esperado ($EV \ge +4\%$) y recomendación de tamaño de apuesta ($5\%$ o $10\%$).
  - Historial de apuestas con liquidación manual (Ganada / Perdida / Nula).
  - Panel de Bankroll virtual con capital, ROI, tasa de acierto y curva de calibración.
- **Asistente de IA Conversacional:** Chatbot con avatar robótico que responde dudas sobre picks y lesiones.
- **Generador de Audio Sintético:** Paisaje sonoro completo sintetizado proceduralmente mediante Web Audio API.

---

## 2. Cuáles Están Realmente Verificadas

| Funcionalidad | Verificación Forense | Nivel de Certeza |
|---|---|---|
| **Motor Matemático NFL** | Verificado en 14 juegos × 15 mercados; $\Delta = 0.000e+0$ | **100% Verificado (Bit a bit)** |
| **Motor Matemático NCAA** | Verificado en 32 juegos colegiales; $\Delta = 0.000e+0$ | **100% Verificado (Bit a bit)** |
| **Motor de Fútbol (Aztecavet)** | Verificado en 183 partidos y 18 mercados; 324 tests passing | **100% Verificado (Bit a bit)** |
| **Cálculo de EV, noVig y Sizing** | Verificado con inputs numéricos en tiempo real | **100% Verificado** |
| **Boleto, Historial y Bankroll** | Probados flujos de adición, liquidación y persistencia | **100% Verificado** |
| **Modo Local del Asistente IA** | Verificado en vivo respondiendo con datos del DOM | **100% Verificado** |
| **Selector de Fútbol en TouchIQ** | El DOM `#s2` existe pero su entrada en `drawHome()` está desconectada | **Verificado (Código en reposo / Staged)** |
| **Conexión a Servidores / Backend** | Verificado con CDP: **CERO requests de red en runtime** | **100% Verificado (Ausencia total)** |
| **Seguridad del PIN [REDACTED_PIN]** | Verificado que es una simple comparación client-side en texto plano | **100% Verificado (Inseguro)** |

---

## 3. Qué Fórmulas se Identificaron

1. **Expectativa Pitagórica:**
   - Para NFL y NCAA: $P = rs^{2.37} / (rs^{2.37} + ra^{2.37})$.
   - Para Fútbol: $P = rs^{1.7} / (rs^{1.7} + ra^{1.7})$.
2. **Fórmula Log5 (Bill James):**
   $$P(A \text{ vs } B) = \frac{x - x \cdot y}{x + y - 2 \cdot x \cdot y}$$
3. **Localía como Odds-Ratio:**
   $$P_{\text{local}} = \frac{\text{odds}(p_n) \cdot \frac{\text{HFA}}{1 - \text{HFA}}}{1 + \text{odds}(p_n) \cdot \frac{\text{HFA}}{1 - \text{HFA}}}$$
   ($HFA=0.55$ en NFL estándar, $0.50$ en Londres, $0.56$ en NCAA, $0.54$ en fútbol).
4. **Contracción SHR Colegial:**
   $$p_{\text{NCAA}} = 0.50 + 0.85 \cdot (p_{\text{base}} - 0.50)$$
5. **Margen Normal en NFL:**
   $$\mu = 13.4 \cdot \Phi^{-1}(p_H) \quad (\Phi^{-1} \text{ calculada por bisección numérica})$$
6. **Probabilidades de Mercado por Colas Normales:**
   $$p(\text{cover } L) = 1 - \Phi\left(\frac{L - |\mu|}{13.4}\right), \quad p(\text{over}) = 1 - \Phi\left(\frac{\text{line} - \text{tot}}{13.3}\right)$$
7. **Scoring de Selección 80/20 (Pick del Día):**
   $$P_{\text{cons}}(p) = 0.50 + 0.85 \cdot (p - 0.50)$$
   $$SC = 0.80 \cdot p + 0.20 \cdot (P_{\text{cons}}(p) \cdot d) + \text{bonus}$$
8. **Poisson Bivariado con Corrección Dixon-Coles ($\tau$):**
   Matriz $15 \times 15$ corregida en marcadores bajos $(0,0), (0,1), (1,0), (1,1)$ con $\rho = -0.14$ (Liga MX) y $-0.08$ (Europa).
9. **Expected Value y Remoción de Vig:**
   $$EV = p \cdot d - 1, \quad p_i^{\text{fair}} = \frac{\frac{1}{d_i}}{\sum_j \frac{1}{d_j}}$$

---

## 4. Qué Motores NO Pudieron Observarse

- **`[DESCONOCIDO]` Scripts Privados de Cosecha del Autor:** Los programas con los que el desarrollador extrajo la información de Pro-Football-Reference o DraftKings no forman parte del artefacto servido por Netlify.
- **`[DESCONOCIDO]` Entorno de Producción de `window.claude`:** La infraestructura que aloja la base de datos documental (`claude.use("db")`) o la API de inferencia en streaming cuando la app corre en contenedores cerrados de Anthropic no está disponible en la web abierta.

---

## 5. Qué Datos Utiliza o Parece Utilizar

- **Utilizados Comprobados:** Puntos anotados y permitidos 2025/2026, 154 reportes médicos de lesiones con fechas, cuotas de DraftKings al 7 nov 2026, promedios de yardas/TDs por jugador para props, conferencias colegiales y factores de fuerza de ligas de fútbol.
- **Datos Ausentes No Utilizados:** El modelo **no utiliza** clima (viento/lluvia), datos de rastreo de jugadores por GPS (Next Gen Stats), métricas avanzadas de EPA/DVOA jugada a jugada ni movimientos de cuotas intradía.

---

## 6. Qué APIs se Identificaron

- **En Runtime:** **Ninguna.** Cero endpoints REST, GraphQL o WebSockets.
- **En la Red de Distribución:** `https://touchiq.com.mx/` (Netlify Edge CDN).
- **Puente Interno de Mensajes:** Canal `window.postMessage` entre iframe y ventana madre.

---

## 7. Qué Cobertura Histórica Tiene

- Solo la temporada en curso (2026, hasta la Semana 9 de NFL y 10 de NCAA) más los baselines totales de 2025.
- Cero histórico de temporadas 2020–2024.
- Cero histórico de cuotas pasadas (solo un snapshot estático).
- Auditoría embebida limitada a 6 partidos recientes.

---

## 8. Cómo Aparenta Actualizar sus Datos

- Mediante un proceso puramente manual off-line: el autor edita los archivos fuente con un editor de código, regenera los bloques HTML base64 y hace un `git push` a Netlify una vez por semana.
- La presencia de fechas recientes o relojes en pantalla no prueba automatización ni tiempo real.

---

## 9. Qué Limita su Diseño

1. **Cuello de botella humano:** La necesidad de transcribir todo manualmente imposibilita la cobertura de docenas de ligas y la actualización rápida de cuotas.
2. **Monolito de 2.4 MB:** Servir toda la información en un solo documento sobrecarga la memoria del navegador y no escala.
3. **Cero Seguridad:** Acceso en texto plano ([REDACTED_PIN]), datos y modelos expuestos al público y almacenamiento local sin cifrar.
4. **Rigidez Paramétrica:** Desviaciones estándar estáticas que no contemplan números clave de la NFL ni condiciones climáticas adversas.

---

## 10. Qué Capacidades Conviene Incorporar en PitchLab

1. **Adopción del Núcleo Matemático:** Integrar las fórmulas de Pitágoras, Log5, Poisson Dixon-Coles y sizing discreto como motor analítico base.
2. **Ingesta Automatizada de Cuotas:** Streaming en tiempo real vía WebSockets conectando más de 15 casas de apuestas.
3. **Cálculo de Arbitraje y Value Bets Dinámico:** Notificaciones push inmediatas cuando una cuota presente $EV > 5\%$.
4. **Agente IA con Tool Calling:** Asistente conectado a la base de datos real con capacidad de correr simulaciones Monte Carlo personalizadas.
5. **Base de Datos Bi-temporal:** Históricos completos inmutables que permitan backtesting formal y auditorías públicas de rendimiento.

---

## 11. Cómo Construir Alternativas Propias

- Desarrollar la biblioteca matemática en TypeScript moderno bajo arquitectura hexagonal (Clean Architecture):
  - Capa de Dominio pura: `EngineNfl`, `EngineNcaa`, `EngineSoccer`, `OddsCalculator`.
  - Capa de Aplicación: Casos de uso (`SimulateMatch`, `FindValueBets`, `ManageBankroll`).
  - Capa de Infraestructura: Repositorios en PostgreSQL/TimescaleDB y adaptadores de API de cuotas.

---

## 12. Qué Proveedores Comerciales Podrían Servir

1. **The Odds API:** Proveedor prioritario para cuotas en tiempo real, spreads, moneylines y props (~$150 USD/mes).
2. **API-Football (API-Sports):** Cobertura exhaustiva de calendarios, alineaciones y lesiones para torneos de fútbol (~$49 USD/mes).
3. **Sportradar / SportsDataIO:** Proveedores de grado institucional para telemetría oficial de NFL y NCAA en fases avanzadas de PitchLab.

---

## 13. Qué NO se Debe Reutilizar por Licencias o Propiedad Intelectual

> [!CAUTION] Restricciones Críticas de Propiedad Intelectual
> 1. **Prohibido reutilizar los assets gráficos:** No utilizar las imágenes de robots, ilustraciones vectoriales, mascotas o el diseño de la Piedra del Sol azteca. PitchLab debe tener su propio sistema de diseño original.
> 2. **Prohibido reutilizar el texto editorial y la marca:** Nombres comerciales ("TouchIQ", "AztecaVet") y textos explicativos redactados por el autor no deben copiarse.
> 3. **Lo que SÍ es reutilizable:** Las fórmulas matemáticas (Pitágoras de Bill James, Log5, distribución normal, modelo de Dixon-Coles, fórmulas de valor esperado y Criterio de Kelly) son principios matemáticos y científicos de dominio público que no están sujetos a derechos de autor.

---

## 14. Qué Preguntas Permanecen Abiertas

1. ¿Qué modelo o heurística utilizó el autor para fijar el impacto de lesiones individuales en puntos (ej. mariscal titular = 4.0 pts, tackle ofensivo = 1.5 pts)?
2. ¿Qué criterios siguió para seleccionar los 121 partidos universitarios de la NCAA entre los más de 800 que se disputan?
3. ¿Cómo calibró los factores de fuerza de conferencia en la NCAA (`cf = 0.88` para G5 vs `1.00` para Power 4)?

---

## 15. Qué Pruebas Permitirían Validar las Decisiones

1. **Backtesting Masivo Out-of-Sample:** Correr los motores sobre las últimas 5 temporadas completas de NFL y NCAA (2020–2025) midiendo Brier Score y calibración empírica.
2. **Prueba de Resistencia de Carga:** Simular 10,000 conexiones concurrentes vía WebSockets en el backend de PitchLab mientras se recalculan cuotas en vivo.
3. **A/B Testing de UX:** Comparar la adopción y retención de usuarios frente a una interfaz financiera moderna (PitchLab Dark) vs interfaces temáticas.

---

## 16. Matriz Maestra de Capacidades

| Capacidad | Evidencia | Calidad Observada | Reimplementación en PitchLab | Prioridad PitchLab |
|---|---|---|---|---|
| **Motor Predictivo NFL** | `page_nfl_s1.js`, Batch Test $\Delta=0$ | Alta (Matemática pura, E=2.37, Log5, SDM=13.4) | Motor TS nativo + capa de ensamble con XGBoost y Monte Carlo | **Alta (Fase 1)** |
| **Motor Predictivo NCAA** | `page_ncaa_s1.js`, Batch Test $\Delta=0$ | Alta (Ajuste conferencias, SHR=0.85, SDM=15.5) | Motor TS nativo con factores de conferencia parametrizables | **Alta (Fase 1)** |
| **Motor de Fútbol 4 Ligas** | `football.html`, Parity Test (324 tests) | Alta (Poisson Dixon-Coles $\rho=-0.14$, bisección tilt) | Motor TS con modelos xG dinámicos vía API-Football | **Alta (Fase 1)** |
| **Cálculo de EV y Sizing** | `script_0.js`, `aztecavet-math.test.ts` | Muy Buena (noVig multiplicativo, Kelly discreto 5/10%) | Kelly Fraccional continuo + Optimización de Portafolio Markowitz | **Alta (Fase 1)** |
| **Boleto y Bankroll** | `script_0.js`, capturas `11`-`13` | Aceptable (Virtual en localStorage, liquidación manual) | Multi-tenant seguro en PostgreSQL + BetSync automático con casas | **Alta (Fase 1)** |
| **Ingesta de Cuotas** | `MONEY` en código (DraftKings 7 nov) | Deficiente (Snapshot estático semanal manual) | Ingesta streaming sub-segundo con The Odds API (15+ casas) | **Crítica (Fase 2)** |
| **Control de Acceso / Auth** | `CODE="[REDACTED_PIN]"` en texto plano | Inexistente / Insegura (Cosmética client-side) | Auth segura OAuth2/JWT con Argon2id, roles y tiers de suscripción | **Crítica (Fase 2)** |
| **Asistente de IA** | `script_2.js`, capturas `14`-`15` | Media (DOM scraping frágil + regex fallback) | Agente RAG sobre base vectorial (pgvector) con Tool Calling | **Media (Fase 3)** |
| **Props de Jugadores** | `PJ` en código (congelado al 19 oct) | Aceptable (Fórmulas Poisson/Normal sobre baselines) | Proyecciones dinámicas actualizadas tras cada práctica médica | **Media (Fase 3)** |
| **Audio Sintético** | `AudioContext` en `script_0.js` | Muy Alta técnica / Nicho en producto | Sistema de diseño profesional con audio sutil desactivado por defecto | **Baja (Fase 4)** |
| **Animación Canvas Intro** | `<canvas id="bg">` en `index.html` | Muy Alta visualmente / Pesada en performance | Dashboard moderno, limpio, con gráficos vectoriales ligeros | **Baja (Fase 4)** |
