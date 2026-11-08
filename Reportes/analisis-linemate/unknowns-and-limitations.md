# Documented Limitations, Unknowns, and Ethical Boundaries

## 1. Ethical & Legal Boundaries Observed

During this technical investigation, the engineering team adhered strictly to authorized, non-invasive reverse engineering protocols:
1. **No Evading Paywalls or Security**: We did not attempt to bypass Firebase token verification, exploit authorization flaws, or inject false subscription claims into the server.
2. **No Scraping or Database Dumping**: We made bounded, minimal sampling calls to observe schemas and endpoints, never executing mass database dumps or scraping runs that would burden LineMate's servers.
3. **No Private User Data Collected**: We did not access, probe, or harvest user credentials, session cookies, payment tokens, or personally identifiable information (PII).
4. **Legitimate Source Map Usage**: Source maps were delivered publicly by the production web server to standard browser DevTools clients without authentication, representing public client-side artifacts.

---

## 2. Explicitly Documented Unknowns [DESCONOCIDO]

To maintain rigorous scientific honesty, the following areas are formally documented as private internal implementation details that cannot be observed from client-facing reverse engineering:

### 2.1 Backend Microservice Implementation:
- **Programming Language**: The client communicates over REST/JSON. While the API path structures and error formats suggest Node.js / Express or Python / FastAPI, the exact backend programming language and framework are unconfirmed.
- **Database Engine**: The internal database technology (PostgreSQL, MongoDB, CockroachDB, or Google Cloud Spanner) is unobserved. We infer a relational model from entity relationships, but do not claim proof.
- **Cron Scheduling Cadence**: The exact interval at which the server re-computes the static trend lists (e.g. every 5 minutes, every 15 minutes, or on-demand via event triggers) remains an internal server implementation detail.

### 2.2 Private Commercial Agreements:
- The exact commercial contract rates, commission percentages, and CPA bounties agreed between LineMate and bookmakers (DraftKings, FanDuel, Underdog) are private B2B matters and were not investigated.

---

## 3. Methodological Limitations

1. **Seasonal Availability**: The investigation was conducted during the active NFL season. Certain off-season views (e.g. NFL Draft props, preseason games) could only be evaluated through static source code rather than live scheduled matchups.
2. **Geolocation Constraints**: Certain prediction markets (Kalshi) and sportsbooks (FanDuel) restrict market display based on US state borders. Geolocation parameters were simulated using client-side configuration parameters to confirm schema behavior.
