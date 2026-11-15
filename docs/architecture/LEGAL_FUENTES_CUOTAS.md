# Auditoría Legal y Técnica de Fuentes de Cuotas (`v3.2` · `DATOS-AUTO-1`)

> **Fecha de inspección:** `2026-11-12` (sincronizada en `DATOS-AUTO-1` el `2026-11-14`)  
> **Principio rector:** Ningún flujo automatizado de PitchLab ejecuta evasión de medidas tecnológicas de protección (`Cloudflare Turnstile`, challenges JS, spoofing TLS ni cabeceras encubiertas) ni viola directivas explícitas de `robots.txt` o Términos de Servicio (ToS). Toda petición saliente se identifica con `User-Agent: PitchLab-Bot/1.0 (+https://pitchlab.mx; data-research)` y aborta de inmediato ante cualquier reto anti-bot (`HTTP 403` / `CF-Mitigated: challenge`).

---

## 1. Matriz de clasificación legal por fuente

| ID fuente (`source_id`) | Rol de mercado | Endpoint / dominio auditado | `robots.txt` | Respuesta HTTP limpia | Términos de Servicio (ToS) | Estado asignado | Credencial oficial requerida |
|---|---|---|---|---|---|---|---|
| `the_odds_api` | Agregador (sharp + recreativas) | `https://api.the-odds-api.com/v4/sports/` | N/A (API REST dedicada) | `HTTP 200` / `401` sin llave; `cf-mitigated: ""` | API comercial/developer con plan gratuito (500 créditos/mes) que autoriza ingesta programática de cuotas (`pinnacle`, `smarkets`, `betfair_ex_eu`, `bet365`, `draftkings`, `fanduel`, `betmgm`, `codere_it`). | **`api_only`** | `THE_ODDS_API_KEY` |
| `bzzoiro_odds` | Agregador (sharp + recreativas) | `https://sports.bzzoiro.com/api/v2/odds/` | N/A (API REST con token) | `HTTP 200`; `401` sin token | Licencia v4.0 de Bzzoiro: permite mostrar momios dentro de la app y prohíbe revenderlos como feed. Fuente principal de las 6 ligas de fútbol desde 2026-11 (`pinnacle`, `bet365`, `bwin`, `william_hill`, `unibet`, `codere`…); The Odds API queda para la NFL. | **`api_only`** | `BZZOIRO_API_KEY` |
| `betfair_exchange` | Sharp (exchange) | `https://api.betfair.com/exchange/betting/rest/v1.0/` | Web: `HTTP 403` | API-NG JSON-RPC oficial documentada | Betfair provee **Exchange API-NG** oficial para lectura programática de libros de órdenes (`EX_BEST_OFFERS`). El scraping web de `www.betfair.com` está prohibido. | **`api_only`** | `BETFAIR_APP_KEY`, `BETFAIR_SESSION_TOKEN` |
| `pinnacle` | Sharp (línea de cierre) | `https://www.pinnacle.com` / `guest.api.arcadia.pinnacle.com` | `Allow` parcial web; `/config/` restringido | Arcadia guest API bloqueada sin acuerdo B2B | Los ToS de Pinnacle prohíben la extracción automatizada del sitio y del endpoint invitado Arcadia salvo acuerdo comercial B2B (`Lines API`). | **`blocked_pending_owner_decision`** | `PINNACLE_B2B_API_KEY` |
| `smarkets` | Sharp (exchange 0–2 % comisión) | `https://smarkets.com` / `https://api.smarkets.com/v3/events/` | Permite rutas públicas web | `api.smarkets.com/v3/events/` responde `HTTP 403` (`cf-mitigated: challenge`) | El acceso automatizado sin sesión autenticada ni aprobación de Smarkets activa protección Cloudflare. | **`blocked_pending_owner_decision`** | `SMARKETS_SESSION_TOKEN` |
| `caliente` | Recreativa MX | `https://sports.caliente.mx` | `HTTP 403` (`cf-mitigated: challenge`) | `HTTP 403` (`cf-mitigated: challenge`) | Caliente bloquea todo cliente automatizado con reto Cloudflare en el borde y prohíbe scraping en sus ToS. Sin API pública. | **`blocked_pending_owner_decision`** | Acuerdo comercial B2B |
| `codere` | Recreativa MX | `https://apuestas.codere.mx` | **`User-agent: *` → `Disallow: /`** | `HTTP 200` en `robots.txt` con prohibición total | `apuestas.codere.mx/robots.txt` declara `Disallow: /` para todo agente automatizado; sus ToS prohíben extracción de cuotas. | **`blocked_pending_owner_decision`** | Acuerdo comercial B2B |
| `action_network` | Consenso / tickets públicos | `https://www.actionnetwork.com` | `Disallow: /api/` | Web tras CDN | ToS prohíben scraping automatizado de líneas y porcentajes de dinero público. | **`blocked_pending_owner_decision`** | Licencia de datos B2B |

---

## 2. Reglas técnicas obligatorias en `services/ingest/src/odds/`

1. **Compuerta de registro (`legal-registry.ts`):**
   - Solo las fuentes con `legalStatus === "api_only"` y cuyas variables de entorno requeridas estén presentes se instancian en `.github/workflows/odds-refresh.yml` y `odds-refresh-cli.ts`.
   - Cualquier intento de instanciar una fuente `blocked_pending_owner_decision` lanza `SourceBlockedError` de forma determinista.
2. **Transporte HTTP transparente:**
   - Identificación explícita `PitchLab-Bot/1.0`, sin rotación de proxies, sin suplantación de huella TLS y sin resolución ni evasión de retos anti-bot.
   - Respeto estricto de `robots.txt` (`RobotsTxtPolicy`), limitador de tasa por fuente (`PerSourceRateLimiter`) y backoff exponencial solo en `429` / `5xx` transitorios.
3. **Preservación ante falta de credenciales o falla:**
   - Si no hay llaves configuradas (`BZZOIRO_API_KEY`, `THE_ODDS_API_KEY` o `BETFAIR_APP_KEY` + `BETFAIR_SESSION_TOKEN`) o una fuente falla, jamás se inventan momios: se conservan las cuotas previas que sigan vigentes (`< 72 h`) y el modelo opera honestamente con probabilidad deportiva pura cuando caducan.
