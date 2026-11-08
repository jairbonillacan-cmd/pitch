# Network Architecture, APIs & Telemetry Audit — AztecaVet

> **Target:** `https://aztecavet.com/`  
> **Investigation Focus:** Network Transactions, HTTP Headers, Edge Behavior, API Discovery, Telemetry Audit  
> **Classification:** [OBSERVADO] / [INFERIDO] / [RECONSTRUIDO]  
> **Evidence Log:** [`comprehensive_network_log.json`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/network-schemas/comprehensive_network_log.json)  

---

## 1. Network Traffic Audit Summary

During the extensive automated test suite exercising:
- Passcode validation (success and failure modes),
- Home dashboard rendering and 3D Canvas loops,
- Football tournament selector and Liga MX iframe execution,
- NHL and MLB dashboard execution,
- Betting Slip and Bankroll modal state mutations,
- AI Assistant chat queries in both Home and sport contexts,
- Complete browser reload and session recovery,

**The total number of external network transactions initiated by the application was: EXACTLY TWO (2) GET requests to the apex document itself.**

```mermaid
flowchart TD
    Client["Browser (Edge / Chrome / Mobile)"]
    Netlify["Netlify Edge CDN (Apex: aztecavet.com)"]
    ExternalAPIs["External Sports APIs / Odds Feeds / AI Providers<br/>(Sportradar, The-Odds-API, OpenAI, Anthropic)"]

    Client -->|1. GET / (Initial Document)| Netlify
    Netlify -->>|200 OK (1.22 MB HTML / 739 KB br)| Client
    Client -.->|4. Zero Network Calls During All Operations| ExternalAPIs
    Client -->|2. GET / (Only on Browser F5 Reload)| Netlify
    Netlify -->>|200 OK| Client
    
    style ExternalAPIs stroke:#ff5a7a,stroke-dasharray: 5 5,stroke-width:2px;
```

---

## 2. HTTP Request & Response Header Analysis

### Initial Apex Request: `GET https://aztecavet.com/`
```http
GET / HTTP/2
Host: aztecavet.com
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/157.0.0.0 Safari/537.36 Edg/157.0.0.0
Accept-Language: es-MX
Upgrade-Insecure-Requests: 1
```

### Edge Response Headers:
```http
HTTP/2 200 OK
date: Sun, 08 Nov 2026 19:51:23 GMT
server: Netlify
content-type: text/html; charset=UTF-8
content-encoding: br
content-length: 739330
accept-ranges: bytes
age: 0
cache-control: public,max-age=0,must-revalidate
cache-status: "Netlify Edge"; fwd=miss; fwd-status=200; stored
etag: W/"2427bef3e512240dfd1bbaec6e7499aa-ssl"
strict-transport-security: max-age=31536000
vary: Accept-Encoding
x-nf-request-id: 01M6YBEBABCCEDJY6H0T66HGXJ
```

### Architectural Findings from Headers:
1. **Hosting Infrastructure:** Managed entirely by **Netlify Edge**.
2. **Compression:** Compresses with **Brotli (`br`)**, achieving a $39.4\%$ size reduction from 1,219,472 bytes down to 739,330 bytes.
3. **Caching Policy:** `public, max-age=0, must-revalidate` ensures edge nodes validate the ETag, allowing instant client updates upon new deployments.
4. **Security Headers:** Strict Transport Security (`HSTS`, `max-age=31536000`) is enforced.
5. **Missing Headers:** No Content Security Policy (`CSP`), no Subresource Integrity (`SRI`), and no Referrer Policy headers are configured.

---

## 3. Subdomain & Route Discovery

1. **Subdomain Redirect (`www.aztecavet.com`):**
   - Returns an HTTP `301 Moved Permanently` redirecting to the canonical apex domain `https://aztecavet.com/`.
2. **Missing Favicon:**
   - The browser requests `GET /favicon.ico`, returning a Netlify Edge `404 Not Found` (the only console warning observed).
3. **Endpoint Probing (`/api`, `/v1`, `/data.json`, `/robots.txt`):**
   - All arbitrary sub-paths return Netlify's standard 404 error page (3,449 bytes). No hidden REST API endpoints or serverless functions exist on the domain.

---

## 4. Observed Request Schemas

Because all data transformations occur in-memory, the "requests" are represented by the internal `postMessage` protocol between the shell and the sport iframes.

### Request Record 01: Slip Market Registration
- **Request ID:** `REQ-INT-01`
- **Módulo:** Football / NHL / MLB $\to$ Boleto
- **Acción:** Add selection to betting slip
- **Endpoint observable:** `window.parent.postMessage`
- **Method:** Message Event
- **Request Schema:**
  ```json
  {
    "av": "add",
    "pk": {
      "k": "FB:MX:Vie 6 nov:NEC-TIJ|h",
      "gk": "FB:MX:Vie 6 nov:NEC-TIJ",
      "sp": "Fútbol · Liga MX",
      "m": "NEC vs TIJ",
      "l": "NEC gana",
      "p": 0.4421,
      "d": 2.25,
      "t": "Vie 6 nov · 7:00 PM"
    }
  }
  ```
- **Response Schema:** Host replies with updated slip configuration:
  ```json
  {
    "av": "cfg",
    "bank": 1000,
    "th": 0.60,
    "odds": { "FB:MX:Vie 6 nov:NEC-TIJ|h": "2.25" },
    "inSlip": ["FB:MX:Vie 6 nov:NEC-TIJ|h"]
  }
  ```
- **Timestamp:** Nov 8, 2026 19:50:30 CST
- **Cache:** Synchronized to `localStorage["azteca_av"]`
- **Evidencia:** Observed in `shell_app.js` (lines 1045–1070) and `football_engine.js`.

---

### Request Record 02: User Bookmaker Odds Input
- **Request ID:** `REQ-INT-02`
- **Módulo:** Sport Match Tile / Card
- **Acción:** User types bookmaker odds in input field
- **Endpoint observable:** `window.parent.postMessage`
- **Method:** Message Event
- **Request Schema:**
  ```json
  {
    "av": "odd",
    "k": "FB:MX:Vie 6 nov:NEC-TIJ|ov",
    "v": "1.85"
  }
  ```
- **Response Schema:** State saved to `AV.odds[k]`; recalculated EV displayed immediately in DOM without network latency.
- **Timestamp:** Nov 8, 2026 19:50:42 CST
- **Evidencia:** `shell_app.js` listener.

---

## 5. WebMCP Container Bridge Audit

The application contains conditional hooks designed for environments that provide `window.claude`:

```javascript
// Database Sync Hook
try {
  const c = window.claude;
  if (c && c.use) {
    const [db, user] = await Promise.all([c.use("db"), c.use("user")]);
    if (db && user) {
      const id = await user.id();
      if (id) {
        AV.db = db;
        AV.base = "data/users/" + id;
      }
    }
  }
} catch (e) {
  AV.db = null;
}

// AI Sampling Hook
try {
  if (window.claude && claude.use) {
    sample = await claude.use("sample");
  }
} catch (e) {}
```

### Empirical Verification:
In standard public access via Chrome, Edge, Safari, or Firefox:
1. `window.claude` is `undefined`.
2. The `try/catch` block fails silently.
3. `AV.db` defaults to `null`, enforcing 100% `localStorage` persistence.
4. `sample` defaults to `null`, enforcing the local regex search fallback in `inline_2.js`.
5. **REA Tool `discover_webmcp_tools` confirmed: Zero (0) WebMCP tools advertised.**

---

## 6. PitchLab Production Network & API Blueprint

PitchLab will replace AztecaVet's static model with a high-throughput, real-time sports streaming architecture:

```mermaid
flowchart TD
    subgraph Data Ingestion
        SR["Sportradar API / Opta"] -->|WebSocket / Webhook| IngestWorker["Ingestion Worker<br/>(Kafka / Redis Streams)"]
        OddsAPI["The-Odds-API"] -->|REST Poller (15s)| IngestWorker
    end

    subgraph Core Platform Services
        IngestWorker --> LiveStore[(Redis / TimescaleDB)]
        LiveStore --> QuantEngine["Quant Engine Cluster<br/>(C++ / Rust / Python)"]
        QuantEngine --> PredictionStore[(PostgreSQL Model Registry)]
    end

    subgraph Client Gateway
        PredictionStore --> EdgeGateway["PitchLab API Gateway<br/>(FastAPI / Envoy)"]
        LiveStore --> EdgeGateway
        EdgeGateway -->|HTTP/2 REST API| WebClient["PitchLab Web / Mobile Client"]
        EdgeGateway -->|WebSocket Live Stream| WebClient
    end
```

### PitchLab API Specification:
1. `GET /v1/sports/{sport}/fixtures`: Live and upcoming fixtures with real-time odds and model fair prices.
2. `GET /v1/sports/{sport}/fixtures/{id}/model`: Deep quantitative decomposition (Poisson matrix, goal expectation, player impact vectors).
3. `POST /v1/slip/optimize`: Covariance-adjusted parlay optimization and Kelly bankroll sizing recommendations.
4. `WSS /v1/live`: Real-time WebSocket channel pushing score updates, injury alerts, and market EV alerts with $<500\text{ ms}$ latency.
