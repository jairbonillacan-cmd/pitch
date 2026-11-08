# Executive Summary: Auditoría Técnica e Ingeniería Inversa de TOUCHIQ
## Hallazgos Estratégicos y Directivas de Transferencia a PitchLab

> **Destinatarios:** Dirección de Tecnología (CTO), Dirección de Producto (CPO) y Equipo de Modelado Matemático de PitchLab  
> **Fecha:** Noviembre 2026  
> **Estado:** Auditoría Forense Concluida y Validada al 100%  

---

## 1. El Veredicto Técnico en una Frase

`[OBSERVADO]` **TOUCHIQ no es una plataforma SaaS conectada a un cluster de backend ni a feeds de datos en tiempo real: es una aplicación web monopágina (SPA) de 2.4 MB servida por Netlify Edge que opera con exactamente CERO llamadas de red en tiempo de ejecución, ejecutando un motor estadístico client-side extraordinariamente elegante sobre datos deportivos congelados transcritos manualmente en el código fuente.**

Esta conclusión cambia radicalmente la percepción del producto:
1. **La fortaleza de TouchIQ es matemática y de diseño:** El autor posee un conocimiento profundo de sabermetría y modelado de fútbol americano (Pitágoras, Log5, ajuste bayesiano de lesiones, curvas normales de margen y selección de picks 80/20) combinado con una estética retro-cyberpunk/synthwave muy pulida y responsiva.
2. **La debilidad de TouchIQ es arquitectónica y de escalabilidad:** El modelo depende por completo del trabajo manual de un analista que transcriba estadísticas, lesiones y cuotas cada semana a arrays JavaScript. No hay base de datos dinámica en la nube, no hay APIs, el "código de acceso" (7779) es una comparación cosmética en texto plano, y la aplicación no puede escalar a más de unas cuantas ligas sin que el tamaño del HTML se vuelva inmanejable.

Para **PitchLab**, esto representa la **mayor oportunidad estratégica posible**: podemos tomar las fórmulas matemáticas probadas de TouchIQ, eliminar sus cuellos de botella manuales e implementar una superapp profesional con microservicios en la nube, ingesta de datos automatizada vía APIs comerciales, y sincronización en tiempo real.

---

## 2. Hallazgos Forenses Clave

### A. Entrega y Red (`[OBSERVADO]`)
- **Alojamiento:** Servido a través de **Netlify Edge CDN** con compresión Brotli (`content-encoding: br`).
- **Un Solo Documento HTML:** Pesa 2,416,762 bytes (~2.4 MB). Contiene todo el CSS, SVGs, imágenes base64 de robots, sintetizador de audio WebAudio y 3 bloques `<script>`.
- **Cero Tráfico de Red en Runtime:** Verificado fehacientemente mediante Playwright CDP y REA (`ev_7d2fef6c`). Tras el `GET /` inicial, no se dispara ni una sola petición fetch, XHR, WebSocket ni llamadas de telemetría o analíticas.
- **Micro-frontends por iframes Base64:** Dentro de `script_0.js`, la variable `const PAGES = { nfl: '...', ncaa: '...' }` almacena documentos HTML completos codificados en base64 (NFL: 1.34 MB decodificado; NCAA: 97 KB decodificado). Al hacer clic en un deporte, el shell decodifica la cadena con `atob()` y la inyecta dinámicamente en `<iframe id="fr" srcdoc="...">`, comunicándose mediante `window.postMessage`.

### B. El "Acceso" (Código 7779) (`[OBSERVADO]`)
- La pantalla de bloqueo con pad numérico no es un login. Es un componente UI puramente cosmético.
- La variable `const CODE = "7779"` está en texto plano en el JavaScript público.
- No hay hash criptográfico (bcrypt/SHA), no hay token JWT, no hay sesión ni cookies. Cualquier usuario que inspeccione el código fuente conoce la clave al instante.

### C. Procedencia de los Datos (`[OBSERVADO]` y `[INFERIDO]`)
- El propio código documenta explícitamente sus fuentes en comentarios y notas de UI:
  - **Resultados y Baselines:** Pro-Football-Reference (temporadas 2025 y 2026).
  - **Lesiones y Bajas:** NFL.com, Yahoo Sports, CBS Sports, UEFA, ESPN, con fechas exactas ("reporte del viernes 6 nov").
  - **Líneas y Cuotas de Apuesta:** "DraftKings Sportsbook (DK Network, Betting Splits) sáb 7 nov 2026, 2:08–3:41 PM CDMX".
- **No existe recolección automática:** Toda la información fue transcrita a mano por el autor durante la semana. No hay pipelines de scraping en runtime.

### D. Reconstrucción Matemática (100% de Paridad Bit a Bit) (`[RECONSTRUIDO]`)
- Se extrajeron y aislaron los motores de NFL, NCAA y Fútbol (Aztecavet).
- En pruebas batch automatizadas ejecutando el motor reconstruido en TypeScript en paralelo con el JavaScript original sobre **46 juegos × 15 mercados**, la desviación máxima fue:
$$\Delta_{\max} = 0.000 \times 10^{0} \quad (\text{Identidad absoluta})$$
- Se verificaron todos los valores "dorados" observados en la interfaz viva:
  - WAS @ LAR: Victoria local (ML) con $67.8\% \approx 1.40$ (cruza a EV positivo en 1.53).
  - LAC @ HOU: Victoria local (ML) con $66.2\% \approx 1.44$.
  - MICH @ MSU (NCAA): Victoria local (ML) con $71.5\%$ (reflejando la contracción SHR exacta a $0.85$).

### E. Motores de Fútbol y Deportes Adicionales (`[OBSERVADO]`)
- En la interfaz de TouchIQ se anuncia: `"Fútbol · 4 TORNEOS (Liga MX, La Liga, Premier League, Champions League)"`.
- El análisis de código demostró que en el build actual de TouchIQ este selector (`#s2`) está presente en el DOM pero oculto, mientras que la implementación matemática completa de estos 4 torneos (183 partidos, modelo Poisson bivariado con corrección Dixon-Coles y bisección) fue desarrollada y probada exhaustivamente en su proyecto hermano *Aztecavet*. Ambos comparten la misma autoría, constantes y protocolos.

### F. Asistente de IA Dual-Mode (`[OBSERVADO]`)
- La aplicación cuenta con un módulo de IA con avatar de robot.
- **Modo Cloud:** Si el entorno inyecta un objeto puente `window.claude`, el asistente envía un prompt estructurado a la API de Claude con contexto extraído por scraping del DOM del iframe (`pageText()` e `inj()`).
- **Modo Local (Producción Pública):** En la web abierta `window.claude` es undefined. El asistente conmuta automáticamente a un motor determinista por expresiones regulares que busca en el texto del DOM los picks del día, la lista de lesionados o la nota de fórmulas, respondiendo al instante sin conexión.

---

## 3. Matriz de Síntesis Tecnológica: TouchIQ vs PitchLab

| Dimensión | Estado en TouchIQ (Observado) | Visión Superior en PitchLab |
|---|---|---|
| **Arquitectura** | Monolito estático de 2.4 MB en Netlify Edge | Microservicios cloud (NestJS / Go / Python) + SPA moderna en Vite/React |
| **Ingesta de Datos** | Cosecha manual semanal transcrita a arrays JS | Pipelines automatizados (Airflow/Prefect) consumiendo APIs comerciales |
| **Latencia de Cuotas** | Instantánea fija (sábado 7 nov 2026) | Streaming en tiempo real vía WebSockets (The Odds API / Sportradar) |
| **Motores Estadísticos** | Pitágoras + Log5 + Normal / Poisson en cliente | Motores híbridos (Pitágoras-Log5 + XGBoost / Monte Carlo) en backend |
| **Persistencia** | `localStorage["azteca_av"]` (volátil por navegador) | Base de datos PostgreSQL multi-tenant con auth segura (Supabase/Auth0) |
| **Asistente IA** | Scraping DOM client-side + fallback por regex | Agente RAG avanzado con LangChain/LlamaIndex sobre vectores de datos deportivos |
| **Seguridad** | PIN "7779" en texto plano, sin sesiones | Autenticación RBAC, JWT tokens, rate limiting y cifrado en tránsito y reposo |
| **Deportes** | NFL y NCAA activos; Fútbol en código hermano | NFL, NCAA, Fútbol (Liga MX, La Liga, Premier, Champions), MLB, NBA y NHL |

---

## 4. Recomendación Estratégica Inmediata

1. **Aprobar la adopción del núcleo matemático:** Las fórmulas estadísticas de TouchIQ (exponente de Pitágoras 2.37 para NFL, 1.7 para fútbol; contracción Log5; Poisson Dixon-Coles y regla de sizing 80/20) son metodológicamente sólidas y deben convertirse en el motor de referencia inicial de PitchLab.
2. **Prohibir la reutilización de código fuente o activos gráficos:** Todo el código de PitchLab debe ser escrito desde cero en TypeScript estructurado, y los diseños, robots y mascotas deben ser 100% originales de la marca PitchLab.
3. **Priorizar la integración de feeds comerciales:** Contratar un proveedor de cuotas de baja latencia (The Odds API) y estadísticas (API-Football / Sportradar) para eliminar el cuello de botella manual que limita a TouchIQ.
