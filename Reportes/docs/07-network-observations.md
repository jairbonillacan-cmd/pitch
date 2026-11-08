# 07 — Red y backend observable
**Resultado: CERO comunicaciones de red en runtime** (Evidence ev_7d2fef6c: requests=[]).
- Entrega: Netlify static (server: Netlify, cache-status Netlify Edge, etag -ssl).
- No hay REST/GraphQL/WebSocket/SSE/polling. No hay dependencia de servicios externos en runtime.
- Los datos (PFR, DK Network, CBS/Yahoo/NFL.com) están transcritos a mano dentro del JS con fecha citada.
- Persistencia: localStorage azteca_av (o Claude DB si el host provee window.claude — no presente en la web pública).
- Clasificación por función: TODO el cálculo (1) se ejecuta en el navegador.
- Límites respetados: solo observación pública; sin enumeración de endpoints ni carga.
