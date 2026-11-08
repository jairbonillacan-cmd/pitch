# Modelo de costos y unidad económica (F1)

> **Propósito:** estimar costo, margen y punto de equilibrio con 100, 1,000 y 10,000 usuarios registrados, para decidir FD-02 (datos) y FD-03 (precios).
> **Consumidores:** fundador.
> **Fecha:** 2026-11-08
> **Advertencia:** casi todo es **estimado (supuesto)**. Ningún precio de infraestructura se verificó hoy en la página oficial, y los datos «Pro» requieren cotización. Cambia las celdas de supuestos y recalcula; las fórmulas están en §4.

## 1. Supuestos

| Supuesto | Valor | Base |
|---|---|---|
| Tipo de cambio | 18.5 MXN/USD | Supuesto |
| Precio Pro (hipótesis A) | $149 MXN/mes con IVA | Propuesta del handoff de LineMate (INFERIDO, no validada) |
| Precio Pro (hipótesis B) | $249 MXN/mes con IVA | Alternativa de sensibilidad |
| Ingreso neto por suscriptor | Precio / 1.16 (IVA), menos ~5 % de comisión de pasarela | Comisión: supuesto conservador |
| Activos / registrados | 40 % (100) · 40 % (1k) · 35 % (10k) | Supuesto |
| De pago / registrados | 8 % · 6 % · 5 % | Supuesto (los trials de 7 días y los referidos mueven esta cifra) |
| Costo de IA por suscriptor activo | US$1/mes, con cuota por plan | Supuesto. **Se recalcula con el precio oficial del modelo** (tokens por consulta × consultas × precio) |
| Costo de IA del plan Free | Cuota mínima (por ejemplo, 5 consultas/mes) ≈ US$0.10 por activo | Supuesto |

Ingreso neto mensual por suscriptor:

- A: 149 / 1.16 = 128.4 MXN → US$6.94 → **US$6.59** neto de comisión.
- B: 249 / 1.16 = 214.7 MXN → US$11.60 → **US$11.02**.

## 2. Costos fijos mensuales (USD, estimados)

| Rubro | 100 reg. | 1k reg. | 10k reg. | Nota |
|---|---:|---:|---:|---|
| Vercel (Pro) | 20 | 20 | 40–100 | Asientos más uso |
| Neon Postgres | 0–20 | 20–70 | 70–200 | Crece con el histórico de cuotas (Parquet en R2 contiene el crecimiento) |
| Upstash, R2, Fly (jobs Python) y Trigger.dev | 10–30 | 30–70 | 80–200 | |
| PostHog, Sentry y Resend | 0 | 0–50 | 50–150 | Tiers gratuitos al inicio |
| **Subtotal infraestructura** | **≈30–70** | **≈70–210** | **≈240–650** | |
| Datos «Lean» (API-Sports + The Odds API) | 100–300 | 150–300 | 250–400 | `SECUNDARIO`. Los créditos de props e histórico pesan más con la escala. |
| Datos «Pro» (SportsDataIO u otro) | ≈1,400+ | ≈1,400+ | ≈1,400–3,000 | `COTIZACIÓN`. Referencia: mediana de Vendr ≈ US$16.5k/año |

## 2b. Escenario vigente: datos US$0 (decisión del fundador, 2026-11-08)

| Rubro | Antes de cobrar | Al empezar a cobrar |
|---|---:|---:|
| Datos (nflverse, openfootball, The Odds API Free, API-Football Free) | $0 | $0 (hasta los disparadores de `FREE_DATA_STRATEGY.md` §6) |
| Infraestructura en tiers gratuitos (Vercel Hobby, Neon, R2, Upstash, GitHub Actions) | ≈ $0 | ≈ $20–60 (Vercel Pro obligatorio para uso comercial, más algo de DB) |
| IA | $0 (la IA es W5) | Según cuotas por plan |

**Punto de equilibrio con datos $0 y cobro activo:** ≈ (40 + IA_free) / 5.6 ≈ **8–10 suscriptores** con el precio A, o ≈ **5** con el precio B. El riesgo deja de ser el costo y pasa a ser la **cobertura** (sin cuotas de props ni Liga MX comercial confirmada).

## 3. Resultado por escenario (con datos de pago, para cuando se migre)

**Datos Lean, precio A ($149 MXN):**

| | 100 reg. | 1k reg. | 10k reg. |
|---|---:|---:|---:|
| Activos / de pago | 40 / 8 | 400 / 60 | 3,500 / 500 |
| MRR neto | $53 | $395 | $3,295 |
| IA | $11 | $94 | $800 |
| Infraestructura más datos (punto medio) | $250 | $375 | $770 |
| **Resultado** | **−$208** | **−$74** | **+$1,725** |
| Costo por usuario activo | $6.5 | $1.2 | $0.45 |

**Datos Lean, precio B ($249 MXN):** 1k reg. → MRR $661 → **+$192**. 10k reg. → MRR $5,510 → **+$3,940**.

**Datos Pro (≈$1,400/mes):** con el precio A, el equilibrio llega con ≈ **300 suscriptores**. Con el precio B, con ≈ **165**. Con los supuestos de conversión, eso equivale a ~3,300–6,000 registrados.

## 4. Fórmulas

- `MRR_neto = de_pago × (precio_MXN / 1.16 / FX) × (1 − comisión)`
- `Resultado = MRR_neto − IA − infraestructura − datos`
- `Suscriptores de equilibrio = (infraestructura + datos + IA_free) / (ingreso_neto_por_sub − IA_por_sub)`

## 5. Lectura para el fundador

1. **Arrancar con datos Lean es viable.** El punto de equilibrio está en ~80 suscriptores (precio A) o ~45 (precio B), siempre que API-Sports y The Odds API confirmen la licencia comercial.
2. **Los datos Pro solo se justifican con ~165–300 suscriptores.** Conviene pasar a SportsDataIO o similar cuando la tracción lo pague, o negociar un plan de arranque.
3. **El precio pesa más que la infraestructura.** La infraestructura serverless es menor que el costo de datos en cualquier escenario.
4. **Variables críticas:** conversión de trial a pago, costo de IA por consulta (definir cuotas por plan), créditos de props e histórico de odds, y el precio final.
5. **No hay MRR garantizado.** Todos los porcentajes de conversión son hipótesis que se miden en PostHog desde la beta.
