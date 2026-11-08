# Matriz de proveedores de datos y licencias (spike F1)

> **Propósito:** elegir proveedores legales para el MVP y saber qué falta confirmar. Incluye las fuentes de datos observadas en las referencias.
> **Consumidores:** fundador (FD-02), `DATA_ARCHITECTURE.md` (F3) y owner de `services/ingest`.
> **Fecha:** 2026-11-08 · **Método:** investigación de escritorio (búsqueda web sobre páginas oficiales y secundarias). **No hay cotizaciones firmadas.**
> **Etiquetas de costo:** `PÚBLICO` (página oficial) · `SECUNDARIO` (review o competidor; verificar) · `COTIZACIÓN` (no público).

## 1. De dónde sacan los datos las referencias

| Referencia | Fuente | Etiqueta |
|---|---|---|
| TouchIQ | Transcripción manual (Pro-Football-Reference, DraftKings y medios) congelada en el HTML | OBSERVADO el resultado; INFERIDO el origen |
| AztecaVet | Scraping y curación manual de medios deportivos y fantasy, congelados al 6 nov 2026 | OBSERVADO (fuentes citadas en los textos de lesiones) |
| LineMate | IDs de Sportradar, Sleeper y Kalshi en los payloads, más un feed B2B de cuotas de 19 casas | OBSERVADO (IDs). El contrato concreto es INFERIDO. |

**Lección:** dos de las tres referencias viven de datos manuales y congelados. La ventaja estructural de PitchLab empieza por **datos con licencia y automáticos**.

## 2. Requisitos de licencia (checklist por proveedor)

Cada proveedor que se elija debe confirmar **por escrito**:

1. Uso comercial en un SaaS de pago.
2. Mostrar datos a usuarios finales en México y otros países.
3. **Almacenar** y conservar el histórico (incluso tras terminar el contrato).
4. **Derivar** métricas y **entrenar modelos** con los datos.
5. Mostrar cuotas junto a contenido analítico sin obligación de afiliación.
6. Requisitos de atribución.
7. Límites de rate y de redistribución (las share cards con datos ¿cuentan como redistribución?).

## 3. Candidatos

### 3.1 Estadísticas, calendarios y resultados

| Proveedor | Deportes relevantes | Histórico | Licencia comercial | Costo | Notas | Veredicto |
|---|---|---|---|---|---|---|
| **SportsDataIO** | NFL, NCAAF, NHL, MLB y soccer | Archivo completo con licencia comercial (producto «Vault» para backtesting, solo vía ventas) | Sí, por cotización según ligas, feeds y uso. El volumen de llamadas no afecta el precio. Permite cachear y almacenar para operar el producto. | `COTIZACIÓN`. `SECUNDARIO`: mediana de compradores ≈ US$16.5k/año (Vendr). Los planes de $99–149/mes del portal de desarrolladores son **no comerciales**. | Cubre los 5 deportes de PitchLab con un solo proveedor y trae odds | **Candidato principal** para NFL, NCAAF, NHL y MLB (pedir cotización) |
| **Sportradar** | Todos (socio oficial de NFL, NHL, MLB…) | Profundo | Enterprise B2B | `COTIZACIÓN`. `SECUNDARIO`: rangos de 4–5 cifras al mes | Trial de desarrollador de 30 días (90 días según el deporte). Producción solo para clientes. | Fase de escala, no MVP |
| **API-Sports** (API-Football y API-American-Football) | Fútbol (todas las ligas), NFL y NCAA por separado | Varias temporadas (por verificar) | **Por verificar** (los términos no aparecen en las búsquedas) | `PÚBLICO` por niveles de requests/día (Free 100/día; Pro 7,500; Ultra 75,000; Mega 150,000). `SECUNDARIO`: Pro ≈ US$19/mes | Barato. Cada deporte es una suscripción aparte. | **Candidato para fútbol en el MVP** (confirmar la licencia comercial y de entrenamiento) |
| **Sportmonks** | Solo fútbol, cricket y F1. **No tiene NFL.** | 10+ años de fútbol (`SECUNDARIO`) | Planes comerciales | `SECUNDARIO`: World Plan desde €269/mes | La recomendación del handoff de LineMate «Sportmonks para NFL» es **incorrecta** | Alternativa para fútbol |
| MLB Stats API / NHL API (públicas) | MLB y NHL | Profundo | MLB: según fuentes secundarias, **personal y no comercial** (aviso de copyright de MLBAM). NHL: términos no encontrados. | Gratis | Riesgo legal en uso comercial | **No usar en producción** sin una licencia explícita. Sí sirven para investigación interna offline si los términos lo permiten. |

### 3.2 Cuotas y props

| Proveedor | Cobertura | Histórico | Costo | Notas | Veredicto |
|---|---|---|---|---|---|
| **The Odds API** | Casas de EE. UU., UK, UE y AU. Props por evento. | Snapshots desde ~2020 (`SECUNDARIO`), con 10× de créditos | `SECUNDARIO`: Free 500 créditos; 20K ≈ $30; 100K ≈ $59; hasta 15M ≈ $249/mes. Créditos = mercados × regiones. | Su propia documentación indica que obtiene Pinnacle del sitio público y puede llegar con retraso | **Candidato para el MVP** de odds actuales. Presupuestar créditos para props e histórico. |
| SportsDataIO Odds | Odds y line movement (histórico >30 días en su warehouse) | Sí | Parte de la cotización | Un solo contrato con stats | Evaluar junto con 3.1 |
| Pinnacle | Línea sharp de referencia | — | — | **API pública cerrada desde el 23 de julio de 2025.** Solo socios selectos (api@pinnacle.com). | No contar con ella. Usar el consenso sin vig de las casas disponibles como benchmark. |
| Casas mexicanas (Caliente, Codere MX) | — | — | — | **Ningún proveedor confirma la cobertura** (odds-api.io la tiene como solicitud abierta; OddsPapi solo tiene codere.es) | **No hay fuente legal hoy.** El MVP muestra las casas disponibles por licencia y declara la cobertura. Hay que preguntar directamente a los proveedores y a los propios operadores (acuerdo de datos). |
| Sportradar Odds | Global | Sí | `COTIZACIÓN` | Para la fase de escala | Posterior |

## 4. Recomendación para el MVP (supuesto pendiente de FD-02)

| Necesidad | Opción «Lean» | Opción «Pro» |
|---|---|---|
| NFL stats, game logs y props | API-American-Football (si la licencia lo permite) | **SportsDataIO** (NFL más los deportes de la siguiente fase) |
| Liga MX y Premier League | API-Football | SportsDataIO soccer o API-Football |
| Cuotas y props | The Odds API (plan medio) | The Odds API + SportsDataIO Odds |
| Histórico de cuotas | Snapshots propios desde el día 1 + histórico puntual de The Odds API | + histórico del proveedor |
| Costo de datos estimado | ≈ US$100–300/mes (`SECUNDARIO`) | `COTIZACIÓN` (orden de US$1.5k+/mes según la mediana de Vendr) |

**Acciones concretas** (las ejecuta el fundador: implican contacto comercial):

1. Pedir cotización a SportsDataIO (NFL, NCAAF y soccer; Vault/histórico; uso: SaaS analítico de suscripción en México; entrenamiento de modelos).
2. Confirmar con API-Sports los términos comerciales y de entrenamiento por escrito.
3. Confirmar con The Odds API los términos comerciales, la lista de casas en las regiones relevantes, la profundidad histórica y si los datos se pueden mostrar sin afiliación.
4. Preguntar a 2–3 proveedores de odds por la cobertura de Caliente y Codere MX.

## 5. Decisiones de arquitectura que no dependen del proveedor

- Adaptadores por proveedor detrás de `ProviderAdapter` y mapeo a IDs canónicos (`provider_ref`). Cambiar de proveedor no toca la UI.
- Captura propia de snapshots de cuotas desde el día 1 (es nuestro activo histórico, sujeto a los términos de almacenamiento).
- `source` y `observedAt` en cada dato mostrado.
- Cero scraping de casas de apuestas y cero datos de APIs públicas sin licencia en producción.

## Fuentes consultadas

- https://sportsdata.io/help/data-rights-and-licensing-questions · https://sportsdata.io/developers · https://vendr.com/marketplace/sportsdataio
- https://www.api-football.com/pricing
- https://sportmonks.com/products · https://datarade.ai/data-categories/sports-data/apis
- https://sportsapis.dev/apis/the-odds-api · https://oddspapi.io/blog/?p=2498 (secundarias)
- https://github.com/pinnacleapi/pinnacleapi-documentation · https://dev.to/ryankr/pinnacle-killed-its-public-api-heres-how-to-get-pinnacle-odds-in-2026-with-code-39pe
- https://feedback.odds-api.io/p/add-codere-and-caliente-mx-bookmakers · https://oddspapi.io/sportsbooks/codere.es
- https://developer.sportradar.com/getting-started/docs/your-account · https://sportsapis.dev/apis/sportradar
- https://appac.github.io/mlb-data-api-docs · https://anythingmcp.com/marketplace/mlb (secundarias)
