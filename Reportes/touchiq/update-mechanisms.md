# Mecanismos de Actualización, Polling y Ciclo de Vida de los Datos

> **Evidencia Asociada:** Headers de Netlify Edge (`cache-control`, `etag`), código del shell en `script_0.js`, trazas de red  
> **Objetivo:** Analizar cómo se actualiza la información en TouchIQ y diseñar el pipeline en tiempo real de PitchLab  

---

## 1. El Mito del "Tiempo Real" en TouchIQ

`[OBSERVADO]` En el encabezado superior de la interfaz de TouchIQ y en sus animaciones de carga aparecen textos prominentes como:
- *"MODELO ACTIVO · NFL + NCAA · 7 NOV 2026"*
- *"ANALIZANDO EN TIEMPO REAL..."*
- *"ANÁLISIS EN VIVO · DATOS ACTUALIZADOS"*

El análisis forense demuestra que **estas afirmaciones son puramente contextuales o teatrales**:
1. **La animación del "Radar y Escaneo en Tiempo Real":**
   - Al pulsar "Analizar" o abrir un deporte, un script ejecuta una animación de 1,500 ms con partículas, un anillo giratorio y un log de consola ficticio que emite líneas cada 420 ms (*"Cargando Pitágoras… Conectando Log5… Escaneando mercados…"*).
   - El cálculo matemático real toma menos de **2 milisegundos**. La animación es un artificio de UX diseñado para generar expectativa de complejidad y cálculo algorítmico profundo en el usuario.
2. **El reloj superior (`#clk`):**
   - Ejecuta un `setInterval` cada 20 segundos (`setInterval(clk, 20000)`). Solo lee el reloj local de la computadora del usuario (`new Date().toLocaleTimeString("es-MX")`) y actualiza el texto. No consulta ningún servidor.

---

## 2. Mecanismos de Polling y Sockets: Inexistentes

`[OBSERVADO]` Se auditó exhaustivamente el código en busca de mecanismos estándar de actualización periódica:
- **`setInterval` / `setTimeout` de Red:** No existen timers asociados a llamadas `fetch` o `XMLHttpRequest`.
- **WebSockets / SSE:** No hay conexiones persistentes abiertas.
- **Service Workers:** El sitio no registra ningún Service Worker en segundo plano.

---

## 3. El Ciclo de Vida Real de una Actualización en TouchIQ

El ciclo de actualización de TouchIQ es un proceso completamente **artesanal, síncrono y dependiente de un despliegue completo de software**:

1. **Paso 1: Cosecha Manual (Off-line):** El autor recopila resultados y lesiones entre semana.
2. **Paso 2: Edición de Código Local:** El autor edita los archivos fuente en su entorno de desarrollo local, modificando los arrays `R`, `N`, `MONEY` y `D`.
3. **Paso 3: Empaquetado:** Se corre un script de compilación (ej. Python o Node) que toma los HTMLs de NFL y NCAA, los codifica en base64 y los ensambla dentro de `index.html`.
4. **Paso 4: Push a Repositorio y Despliegue en Netlify:** Un comando `git push` activa el pipeline de CI/CD de Netlify. Netlify compila y propaga el nuevo archivo `index.html` a sus nodos de borde (Edge CDN).
5. **Paso 5: Invalidación de Caché del Cliente:**
   - La cabecera HTTP devuelta por Netlify es:
     `cache-control: public, max-age=0, must-revalidate`
   - Esto obliga al navegador del usuario a realizar una validación condicional (`ETag`) en cada recarga. Si hay un nuevo archivo, descarga los 2.4 MB completos.
   - Si el usuario no recarga la pestaña del navegador, **la aplicación nunca se enterará de que hubo una actualización**.

---

## 4. Pipeline en Tiempo Real Automatizado para PitchLab

PitchLab reemplazará este flujo manual por una **arquitectura de datos orientada a eventos (Event-Driven Real-Time Pipeline)**:

```mermaid
flowchart LR
    subgraph Sports_APIs[Feeds Deportivos Externos]
        OddsStream[The Odds API WebSocket]
        InjuriesCron[API-Football Webhook / Cron]
        ScoresFeed[Live Game State Stream]
    end

    subgraph PitchLab_Ingestion[Ingesta y Normalización]
        StreamConsumer[Stream Consumer & Validator]
        KafkaTopic[(Kafka: sports.raw_events)]
    end

    subgraph Math_Engine_Worker[Workers de Cálculo Distribuido]
        KafkaTopic --> EngineWorker[PitchLab Statistical Engine (Go/Rust)]
        EngineWorker --> Cache[(Redis State Store)]
        EngineWorker --> DB[(PostgreSQL TimescaleDB)]
    end

    subgraph Client_Broadcast[Difusión en Tiempo Real]
        Cache --> Centrifugo[Centrifugo / WS Gateway]
        Centrifugo -->|Push Instantáneo| SubscribedClients[Navegadores / App Móvil]
    end

    OddsStream --> StreamConsumer
    InjuriesCron --> StreamConsumer
    ScoresFeed --> StreamConsumer
    StreamConsumer --> KafkaTopic
```

### Ventajas de la Solución PitchLab:
1. **Detección Inmediata de Valor (Arbitraje y Sharp Moves):** Si una lesión clave se anuncia a 15 minutos del inicio del partido, el webhook de PitchLab recalcula el modelo en 50 milisegundos y notifica a los usuarios con alerta push antes de que las casas de apuestas hayan ajustado sus líneas.
2. **Cero Despliegues para Datos:** Los datos residen en la base de datos y la caché Redis; la interfaz de usuario es una aplicación cliente desacoplada que nunca requiere un redeploy para actualizar una estadística.
3. **Optimización de Ancho de Banda:** Los clientes solo reciben diffs JSON ligeros de unos pocos bytes vía WebSockets (`{ gameId: 104, market: "spread", line: -3.5, ev: 0.082 }`), en lugar de recargar un HTML monolítico de 2.4 MB.
