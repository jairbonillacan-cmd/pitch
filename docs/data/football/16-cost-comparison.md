# 16 · Costos y estrategia de adquisición

> Escenario A es el vigente por decisión del fundador (FD-02, datos US$0). B y C se
> documentan como ruta de migración: **no se contrata nada sin autorización**.
> Precios de referencia de `FREE_DATA_STRATEGY.md` (verificados 2026-11-08) y hallazgos
> de cotización F1. **Fecha:** 2026-11-08.

## 1. Escenario A — Investigación económica (VIGENTE)

| Componente | Fuente | Costo | Límite que importa |
|---|---|---|---|
| Fútbol resultados | openfootball CC0 | $0 | Sin stats avanzadas |
| NFL completo | nflverse CC-BY 4.0 | $0 | Atribución; frescura de horas |
| Cuotas | The Odds API Free | $0 | 500 créditos/mes (presupuesto §3) |
| Liga MX en vivo | API-Football Free | $0 | 100 req/día; **uso comercial sin confirmar** (FD-14) |
| Infra | Vercel Hobby, Neon Free, R2 free, GitHub Actions, Upstash, PostHog, Sentry, Resend | $0 | ⚠ Hobby es no comercial; al cobrar → Vercel Pro ≈ US$20/mes |
| **Total** | | **US$0/mes** | Suficiente para: corpus 34k partidos, modelos v2 validados, comparador de cuotas con snapshots propios |

Con este escenario ya se logró: dataset con 0 errores, mejora significativa sobre el
ingenuo en 7/7 ligas y un benchmark honesto contra el mercado.

## 2. Escenario B — Datos comerciales iniciales (cuando haya ingresos)

| Componente | Fuente | Costo de referencia | Qué desbloquea |
|---|---|---|---|
| Cuotas más frescas y más casas | The Odds API 20K créditos | US$30/mes | CLV real, más casas por región |
| Props con cuotas reales | The Odds API 100K créditos | US$59/mes | Prop Lab con precios de mercado |
| Liga MX comercial | API-Football de pago con licencia confirmada o SportsDataIO | `COTIZACIÓN` | Liga MX pública + stats |
| Histórico de cuotas de fútbol | Proveedor comercial | `COTIZACIÓN` | Apertura/cierre real para backtest de mercado |

## 3. Escenario C — Data platform avanzada

| Componente | Fuente | Costo | Qué desbloquea |
|---|---|---|---|
| Event data / xG | StatsBomb (verificar licencia comercial) u otro | `COTIZACIÓN` | Features Nivel C reales |
| En vivo premium | Sportradar | ~US$3.5-8k/mes (cifra REA **INFERIDA**, sin usar hasta cotizar) | Datos en vivo, lesiones oficiales |
| Multi-deporte | SportsDataIO | `COTIZACIÓN` | NHL, MLB, NCAAF |

## 4. Orden de compra recomendado (cuando haya presupuesto)

1. **The Odds API 20K (US$30)** — máximo beneficio por peso: cuotas es el diferenciador
   central (triage REA: «histórico de cuotas con apertura y cierre, y CLV = ADOPTAR núcleo»).
2. **Liga MX comercial** (FD-14 primero: confirmación escrita) — es el mercado núcleo
   de PitchLab y hoy está limitado por el plan Free.
3. **Vercel Pro** cuando se cobre (obligatorio por términos).
4. Solo después, evaluar stats enriquecidas (Nivel B) con proveedor que confirme
   cobertura real por liga-temporada (matriz `04-provider-coverage-matrix.md`).

Costos recurrentes identificados: solo suscripciones mensuales; sin cargos únicos
conocidos. Toda compra requiere la matriz de cobertura verificada para no pagar por un
catálogo sin datos reales.
