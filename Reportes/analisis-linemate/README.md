# Análisis Linemate.io — Índice de la investigación

Fecha: 2026-11-08 · Herramienta principal: REA (Reverse Engineer Anything) + experimentación controlada contra la API pública.
Repo del análisis: `Reportes/analisis-linemate/`

## Qué es Linemate
Plataforma freemium de investigación para apuestas deportivas (web + iOS + Android): tendencias de props ("Hit in 8 of last 10"), parlays, señales contextuales y odds de 30+ sportsbooks. Monetización: suscripción Linemate+ (Stripe/IAP) + afiliación de operadores (FirstPromoter, deep links) + publicidad regional.

## Contenido

### Fase 1 — Cómo opera (análisis operativo)
- [`FINDINGS.md`](FINDINGS.md) — arquitectura, modelo de datos, endpoints, monetización, compliance, telemetría, rutas.
- [`captures/`](captures) — capturas REA (Playwright) del landing, trends, login/pricing, perfil de jugador.
- [`app/`](app) — bundle `main.1f0201a8.js` y `config-v3.json` descargados (análisis estático).

### Fase 2 — Reconstrucción del motor de predicciones (informes técnicos)
| Informe | Contenido |
|---|---|
| [`REPORT-GLOBAL.md`](REPORT-GLOBAL.md) | **Informe maestro**: pipeline etapa por etapa, fórmulas confirmadas, validación numérica, frecuencia de actualización, trazabilidad (identificado/inferido/indeterminado), MLB (fuera de temporada) |
| [`REPORT-NFL.md`](REPORT-NFL.md) | NFL: fuentes (Sportradar/Sleeper), mercados, registro de mercados client-side, pruebas |
| [`REPORT-NBA.md`](REPORT-NBA.md) | NBA: mapeo de stats, validación 46/46 |
| [`REPORT-EPL.md`](REPORT-EPL.md) | Fútbol (StatsPerform/Opta): mapeo CARDS/SHOTS/TACKLES, validación 50/50 |
| [`REPORT-NHL.md`](REPORT-NHL.md) | NHL: mercados por periodo, porteros, validación 44/45 |

### Código (motor independiente + validación)
- [`engine.py`](engine.py) — motor independiente: hit-rule, ventanas por señal, mapeo stat↔mercado NFL (player/team/injury/parlay).
- [`validate.py`](validate.py) — valida NFL contra la API en vivo (player + injury + team).
- [`validate_other.py`](validate_other.py) — valida NBA/NHL/EPL con sus mapeos.
- [`parlays.py`](parlays.py) — reproduce señales conjuntas de parlays.
- [`opp_rank.py`](opp_rank.py) — verificación de OPPONENT_RANK con positionalStats.
- [`hashid.py`](hashid.py) — intento documentado de invertir el hash de `trendId` (344 candidatos).
- [`recover.py`](recover.py) — re-descarga todos los payloads de referencia (genera `api/`).

### Evidencia compacta
- [`api-snapshot2/`](api-snapshot2) — **segundo snapshot completo** (2026-11-08 19:2x UTC): NFL trends/games/rankings/injuries + NBA/EPL/NHL trends + lookup por trendId. Evidencia de que las fórmulas se mantienen entre snapshots.
- `api/` (fase 1, ya en el repo) — snapshot NFL completo del primer análisis.
- **No incluido en el repo**: los game logs crudos (~58 MB: `api/players*`, `api/teams`) — se regeneran con `python3 recover.py` en un directorio de trabajo (tarda ~1 min).

## Resultados de validación (motor independiente vs API en vivo)

| Suite | Resultado |
|---|---|
| NFL player signals (2 snapshots independientes) | 112/112 counts exactos (97/112 con `average`; 15 divergencias = bug reproducible del API: `average:0.0` en HEAD_TO_HEAD) |
| NFL INJURY_IMPACT | 13/13 |
| NFL team trends (TOTAL/1H/1Q/ML/SPREAD) | 30/30 |
| Parlays NFL | 14/15 |
| NBA | 46/46 |
| NHL | 44/45 (1 edge case de portero) |
| EPL | 50/50 |
| **Total** | **310/312 señales reproducidas exactamente** |

## Cómo reproducir
```bash
mkdir trabajo && cd trabajo
cp <esta-carpeta>/{recover.py,engine.py,validate.py,validate_other.py,parlays.py,opp_rank.py} .
python3 recover.py        # descarga los payloads (~1 min)
python3 validate.py       # NFL: player/injury/team vs API
python3 validate_other.py # NBA/NHL/EPL vs API
python3 parlays.py        # señales de parlays
```

## Advertencia
Esto es una reconstrucción de la **capa de cálculo observable** del motor de Linemate, no del motor completo: no incluye la selección de qué trends publicar, el modelo de `winPercentage` (server-side, no invertible desde el cliente), la ingesta upstream ni la derivación del hash `trendId`. Los informes distinguen explícitamente lo confirmado de lo inferido.
