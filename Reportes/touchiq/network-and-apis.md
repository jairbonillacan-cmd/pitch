# Análisis Forense de Tráfico de Red, APIs y Backend Observable

> **Evidencia Asociada:** `research/touchiq/evidence/browser-traces/network-requests.json`, `http-contracts.json`, capturas CDP REA (`ev_7d2fef6c`)  
> **Herramientas:** Playwright CDP Network Listener, Chrome DevTools Protocol, REA CLI  
> **Objetivo:** Auditar exhaustivamente todas las solicitudes HTTP/WS generadas por la aplicación  

---

## 1. El Veredicto de Red: Zero-Runtime Network

`[OBSERVADO]` Durante una sesión completa y exhaustiva de interacción con TouchIQ (navegando por todas las pantallas, desbloqueando con el PIN, cambiando pestañas en la NFL, realizando simulaciones, modificando el estado e impacto de lesiones, registrando apuestas en el boleto, resolviendo apuestas en el historial, consultando el bankroll y conversando con el Asistente de IA), **el número total de peticiones de red realizadas después de la carga inicial fue exactamente CERO (0).**

Este hallazgo es definitivo y refuta cualquier hipótesis sobre llamadas a APIs privadas, microservicios en la nube o WebSockets en el cliente público.

---

## 2. Inventario de Peticiones HTTP Observadas

La captura forense de Playwright registró únicamente 2 transacciones en el ciclo de vida completo de la sesión:

### Petición 01: Carga del Documento Primario
- **Request ID:** `NET-01`
- **Disparador:** Navegación inicial del usuario a `https://touchiq.com.mx/`.
- **Método:** `GET`
- **URL:** `https://touchiq.com.mx/`
- **Protocolo:** HTTP/2 sobre TLS 1.3
- **Headers de Solicitud Relevantes:**
  ```http
  accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8
  accept-encoding: gzip, deflate, br
  user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...
  ```
- **Headers de Respuesta del Servidor:**
  ```http
  HTTP/2 200 OK
  server: Netlify
  content-type: text/html; charset=UTF-8
  content-encoding: br
  content-length: 1590623
  cache-control: public, max-age=0, must-revalidate
  cache-status: "Netlify Edge"; hit; ttl=31519509
  strict-transport-security: max-age=31536000
  etag: W/"a303e685d0b2941c465089eb03f3265f-ssl"
  x-nf-request-id: 01M6YB8QRXTWDE4WYJFS92J4MD
  ```
- **Tamaño de Transferencia:** ~1.59 MB comprimido en Brotli (2.41 MB descomprimido en memoria).
- **Tiempo de Respuesta (TTFB):** 84 ms.

---

### Petición 02: Búsqueda del Favicon por el Navegador
- **Request ID:** `NET-02`
- **Disparador:** Comportamiento predeterminado del motor Chromium al renderizar un documento HTML sin `<link rel="icon">`.
- **Método:** `GET`
- **URL:** `https://touchiq.com.mx/favicon.ico`
- **Status de Respuesta:** `404 Not Found` (generado por la plantilla estándar 404 de Netlify, 3,449 bytes).
- **Impacto:** Ninguno. Advertencia inocua en la consola del desarrollador.

---

## 3. Comprobación de Tecnologías Ausentes en Runtime

| Tecnología de Red | Estado en TouchIQ | Evidencia |
|---|---|---|
| **REST APIs (`fetch` / `XMLHttpRequest`)** | **Ausente al 100%** | Búsqueda AST en REA: familia `request` = 0 relaciones. Trazas CDP: 0 llamadas. |
| **GraphQL** | **Ausente al 100%** | Sin queries, sin endpoints `/graphql`. |
| **WebSockets (`ws://` / `wss://`)** | **Ausente al 100%** | Cero conexiones socket abiertas. |
| **Server-Sent Events (`EventSource`)** | **Ausente al 100%** | Cero streams unidireccionales. |
| **Píxeles de Rastreo / Analíticas** | **Ausente al 100%** | Sin Google Analytics, Segment, Mixpanel, Meta Pixel ni telemetría. |
| **Llamadas a Modelos de IA Externos** | **Ausente en Web Pública** | El asistente opera en modo local determinista. Solo invocaría a Claude si el contenedor host inyecta `window.claude`. |

---

## 4. El Puente Host `window.claude` (Contenedor Opcional)

`[OBSERVADO]` En el código de `script_0.js` y `script_2.js` se identificaron bloques defensivos que intentan consultar un objeto global llamado `window.claude`:

```javascript
// En script_0.js (persistencia alternativa en la nube)
try {
  if (window.claude && claude.use) {
    AV.db = await claude.use("db");
    AV.user = await claude.use("user");
  }
} catch(e) {}

// En script_2.js (asistente de IA conectado)
try {
  if (window.claude && claude.use) {
    sample = await claude.use("sample");
  }
} catch(e) {}
```

### Interpretación Forense
- **¿Qué es `window.claude`?** Es una API puente propietaria proporcionada por entornos de ejecución de Anthropic Claude Artifacts o contenedores de agentes.
- Si la aplicación se ejecuta dentro de dicho entorno especial, delega la persistencia a una base de datos documental (`db.doc()`, similar a Firestore) y las consultas del asistente a la API de Claude (`sample([{role: "user", content: prompt}])`).
- **En la web pública (`https://touchiq.com.mx/`)**: Este puente **no existe** (`window.claude === undefined`). La aplicación se degrada elegantemente a `localStorage` y al motor de asistente local por regex, sin arrojar errores.

---

## 5. Arquitectura de Red Recomendada para PitchLab

A diferencia del modelo estático de TouchIQ, **PitchLab debe construirse sobre una infraestructura de red moderna y orientada a eventos**:

```mermaid
flowchart TD
    subgraph Data_Ingestion_Layer[Capa de Ingesta y Cuotas]
        OddsAPI[The Odds API / Sportradar] -->|WebSockets / REST| IngestionWorker[Ingestion Worker Service]
        StatsAPI[API-Football / NFL Data] -->|Scheduled Cron| IngestionWorker
    end

    subgraph Core_Backend[Cluster Backend PitchLab]
        IngestionWorker --> Kafka[(Kafka / Redis Streams)]
        Kafka --> EngineService[Predictive Engine Service (Go/Python)]
        EngineService --> Postgres[(PostgreSQL + TimescaleDB)]
        EngineService --> RedisCache[(Redis Pub/Sub)]
    end

    subgraph API_Gateway_Layer[Capa de Distribución]
        Postgres --> GraphQL[GraphQL / REST API Gateway]
        RedisCache --> WSGateway[WebSocket Gateway]
    end

    subgraph PitchLab_Client[Cliente PitchLab Superapp]
        GraphQL -->|Consultas de Partidos / Datos| ClientApp[PitchLab Web / Mobile App]
        WSGateway -->|Cuotas en Vivo y Variaciones de EV| ClientApp
    end
```

### Beneficios para PitchLab
1. **Actualizaciones en Sub-segundo:** Cuando una casa de apuestas mueva una línea de $+3.5$ a $+2.5$, el cliente de PitchLab actualizará el EV al instante sin requerir recargar la página.
2. **Escalabilidad Global:** Separar la ingesta del frontend permite atender a millones de usuarios concurrentes mediante balanceo de carga y caché distribuida en Redis.
3. **Persistencia Multiplataforma:** Las apuestas del boleto y el historial del bankroll se guardan en la nube del usuario, sincronizándose entre la computadora y el teléfono móvil.
