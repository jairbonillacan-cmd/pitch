# Reconstrucción e Ingeniería Inversa del Motor NFL de TOUCHIQ

> **Evidencia Asociada:** `Reportes/analisis-touchiq/page_nfl_s1.js`, `src/domain/engine-nfl.ts`, `tests/domain/batch-verify.test.ts` (14 juegos × 15 mercados, $\Delta_{\max} = 0.000e+0$)  
> **Estado:** 100% `[OBSERVADO]` y `[RECONSTRUIDO]` con Identidad Algorítmica Absoluta  

---

## 1. Visión General del Motor NFL

El motor predictivo de la NFL en TouchIQ es un sistema matemático elegante, determinista y autocontenido que proyecta probabilidades para **15 mercados de apuesta por partido**, selecciona picks con base en una regla de bandas y prioriza selecciones mediante una **capa de optimización 80/20** para el "Pick del Día" y parlays.

### Constantes Globales del Motor (`[OBSERVADO]`)
```javascript
const E    = 2.37;  // Exponente pitagórico para fútbol americano (estándar sabermétrico NFL)
const HFA  = 0.55;  // Ventaja de localía estándar (Home Field Advantage: 55% win share)
const HFA_NEUT = 0.50; // Localía en sede neutral (Londres: JAX vs HOU / JAX vs PHI)
const K    = 6;     // Factor de regresión bayesiana a la media (freno de muestra pequeña)
const SDM  = 13.4;  // Desviación estándar del margen de victoria (puntos)
const SDT  = 13.3;  // Desviación estándar del total combinado de puntos
const SDP  = 9.5;   // Desviación estándar de los puntos individuales por equipo
const LGPF = 395;   // Puntos totales de liga de referencia para baselines
```

---

## 2. Pipeline Matemático Paso a Paso

```mermaid
flowchart TD
    Step1[1. Baseline & Regresión Ponderada w = n/(n+6)] --> Step2[2. Ajuste de Fuerza por Lesiones eff]
    Step2 --> Step3[3. Expectativa Pitagórica py = rs^E / rs^E + ra^E]
    Step3 --> Step4[4. Fórmula Log5 de Bill James en Campo Neutral]
    Step4 --> Step5[5. Inyección de Localía como Odds-Ratio HFA=0.55]
    Step5 --> Step6[6. Proyección de Puntos Totales tot y Margen mu = 13.4 * invPhi pH]
    Step6 --> Step7[7. Cálculo de Probabilidades en 15 Mercados por Curvas Normales]
    Step7 --> Step8[8. Selección de Pick de Partido Bandas 72% / 58%]
    Step8 --> Step9[9. Optimización 80/20 Pick del Día y Parlays]
    Step9 --> Step10[10. Evaluación de EV y Sizing de Bankroll 5% / 10%]
```

---

### Paso 1: Fuerza de Equipo y Regresión Bayesiana (`build`)
Para cada equipo, el motor calcula su capacidad ofensiva proyectada ($rs$, puntos a favor por juego) y defensiva ($ra$, puntos permitidos por juego), combinando el historial consolidado de la temporada 2025 con los partidos disputados en 2026:

1. **Peso de la temporada actual ($w$):**
   $$w = \frac{n}{n + K} = \frac{n}{n + 6}$$
   donde $n$ es el número de partidos jugados en la temporada 2026.
   *(A la Semana 9, con $n=8$ juegos, $w = 8/14 \approx 57.1\%$ de peso a 2026 y $42.9\%$ de peso al baseline 2025)*.

2. **Cálculo de $rs$ y $ra$ ponderados:**
   $$rs = \left(\frac{\text{PF}_{2025}}{17}\right) \cdot (1 - w) + \left(\frac{\text{PF}_{2026}}{n}\right) \cdot w$$
   $$ra = \left(\frac{\text{PA}_{2025}}{17}\right) \cdot (1 - w) + \left(\frac{\text{PA}_{2026}}{n}\right) \cdot w$$

3. **Promedio de la Liga ($LG$):**
   $$LG = \frac{1}{32} \sum_{i=1}^{32} rs_i$$

---

### Paso 2: Ajuste por Lesiones y Bajas (`eff`)
Cada lesión registrada en el array `N` contiene un impacto estimado en puntos ($i$) y un estatus de disponibilidad ($st$):
- `st = 1.0`: Descartado / Fuera (Out / IR).
- `st = 0.5`: Cuestionable / Duda (Questionable).
- `st = 0.25`: Probable.
- `st = 0.0`: Activo / Disponible.

**Efecto en la fuerza del equipo:**
- Si el lesionado es **ofensivo** (Quarterback, Receptor, Corredor, Liniero ofensivo):
  $$rs_{\text{ajustado}} = \max\left(8.0, \; rs - i \cdot st\right)$$
- Si el lesionado es **defensivo** (Cornerback, Edge rusher, Linebacker, Safety):
  $$ra_{\text{ajustado}} = ra + i \cdot st$$

*(El piso de $8.0$ puntos garantiza que ninguna penalización por lesión reduzca la ofensiva de un equipo de la NFL por debajo de un mínimo creíble).*

---

### Paso 3: Expectativa Pitagórica y Log5 en Campo Neutral
Con las tasas ajustadas de ambos equipos ($rs_H, ra_H$ para el local; $rs_A, ra_A$ para el visitante):

1. **Porcentajes de Victoria Pitagóricos Intrínsecos ($x, y$):**
   $$x = \frac{rs_H^E}{rs_H^E + ra_H^E} = \frac{rs_H^{2.37}}{rs_H^{2.37} + ra_H^{2.37}}$$
   $$y = \frac{rs_A^{2.37}}{rs_A^{2.37} + ra_A^{2.37}}$$

2. **Probabilidad en Campo Neutral (Log5 de Bill James):**
   $$p_n = \frac{x - x \cdot y}{x + y - 2 \cdot x \cdot y}$$

---

### Paso 4: Ajuste por Localía (`HFA`) como Odds-Ratio
TouchIQ no suma puntos fijos al marcador; en su lugar, transforma la probabilidad en *odds* (momios), multiplica por la razón de localía y reconvierte a probabilidad:

1. **Razón de momios (Odds):**
   $$\text{odds}(p_n) = \frac{p_n}{1 - p_n}$$

2. **Factor de Localía:**
   $$F_{\text{local}} = \frac{\text{HFA}}{1 - \text{HFA}} = \frac{0.55}{0.45} \approx 1.2222 \quad (\text{o } 1.000 \text{ si el juego es en Londres})$$

3. **Probabilidad Final de Victoria Local ($p_H$):**
   $$\text{odds}_{\text{final}} = \text{odds}(p_n) \cdot F_{\text{local}}$$
   $$p_H = \frac{\text{odds}_{\text{final}}}{1 + \text{odds}_{\text{final}}}$$

---

### Paso 5: Proyección de Puntos y Margen Normal
1. **Puntos Proyectados por Equipo:**
   $$lh = \frac{rs_H \cdot ra_A}{LG}, \quad la = \frac{rs_A \cdot ra_H}{LG}$$
   $$\text{tot} = lh + la$$

2. **Margen Proyectado ($\mu$):**
   El margen esperado de victoria del local $\mu$ se deduce directamente de la probabilidad $p_H$ mediante la función cuantil normal (Probit $\Phi^{-1}$ calculada por bisección):
   $$\mu = \sigma_M \cdot \Phi^{-1}(p_H) = 13.4 \cdot \Phi^{-1}(p_H)$$

3. **Líneas del Modelo:**
   - Hándicap Local ($L$): Redondeado al medio punto más cercano $\text{half}(|\mu|)$ con piso de $1.5$.
   - Total de Juego ($\text{line}_{\text{tot}}$): $\text{half}(\text{tot})$.
   - Totales Individuales: $\text{half}(lh)$ y $\text{half}(la)$.

---

### Paso 6: Probabilidades en los 15 Mercados
Cada mercado se calcula a partir de las colas de la distribución normal acumulada $\Phi(z)$:

| Mercado | Fórmula de Probabilidad | Parámetros Observados |
|---|---|---|
| **Moneyline Local (ML H)** | $p = p_H$ | Directo del paso 4 |
| **Moneyline Visita (ML A)** | $p = 1 - p_H$ | Complemento |
| **Spread Favorito (plf)** | $p = 1 - \Phi\left(\frac{L - |\mu|}{13.4}\right)$ | Cubrir línea $L$ |
| **Spread Underdog (pld)** | $p = 1 - \text{plf}$ | Complemento |
| **Total Over (ov)** | $p = 1 - \Phi\left(\frac{\text{line} - \text{tot}}{13.3}\right)$ | Total combinado $\sigma=13.3$ |
| **Total Under (un)** | $p = 1 - \text{ov}$ | Complemento |
| **Team Total Over Local** | $p = 1 - \Phi\left(\frac{\text{line}_H - lh}{9.5}\right)$ | Puntos del local $\sigma=9.5$ |
| **Team Total Under Local** | $p = 1 - p_{\text{over}}$ | Complemento |
| **Team Total Over Visita** | $p = 1 - \Phi\left(\frac{\text{line}_A - la}{9.5}\right)$ | Puntos de la visita $\sigma=9.5$ |
| **Team Total Under Visita** | $p = 1 - p_{\text{over}}$ | Complemento |
| **Alt Line −3.5 Favorito** | $p = 1 - \Phi\left(\frac{3.5 - |\mu|}{13.4}\right)$ | Ganar por más de un gol de campo |
| **Alt Line +3.5 Underdog** | $p = 1 - p_{\text{alt3.5}}$ | Complemento |
| **Alt Line −7.5 Favorito** | $p = 1 - \Phi\left(\frac{7.5 - |\mu|}{13.4}\right)$ | Ganar por más de un touchdown |
| **Alt Line +7.5 Underdog** | $p = 1 - p_{\text{alt7.5}}$ | Complemento |

---

### Paso 7: Regla de Selección de Pick por Partido (Bandas 72% / 58%)

El modelo asigna un pick sugerido para cada partido según el rango de probabilidad del favorito $p_F = \max(p_H, 1-p_H)$:

1. **Banda Alta ($p_F \ge 72\%$):**
   - Sugerencia: Favorito a cubrir un margen que ofrezca aproximadamente $62\%$ de probabilidad.
   - Etiqueta UI: `"FAVORITO CLARO · GANA POR N O MÁS"`.
2. **Banda Media ($58\% \le p_F < 72\%$):**
   - Sugerencia: Victoria directa en Moneyline (ML).
   - Etiqueta UI: Si el equipo domina en ofensiva Y defensiva (`dom === true`), `"ML · DOMINA EN OFENSIVA Y DEFENSIVA"`; si no, `"ML · FAVORITO"`.
3. **Banda Baja / Partido Parejo ($p_F < 58\%$):**
   - Sugerencia: Darle los puntos al no-favorito (Underdog $+L$) buscando una probabilidad cercana al $65\%$.
   - Etiqueta UI: `"JUEGO PAREJO · PUNTOS AL NO FAVORITO"`.

---

### Paso 8: Capa de Optimización 80/20 (Pick del Día y Parlays)

Para elegir el mejor pick de la jornada y armar combinadas de valor, el autor diseñó una fórmula propia llamada en el código **"scoring 80/20"**:

1. **Contracción Conservadora de Probabilidad ($P_{\text{cons}}$):**
   $$P_{\text{cons}}(p) = 0.50 + 0.85 \cdot (p - 0.50)$$
   *(Encoge la probabilidad un 15% hacia el 50% para protegerse de la sobreconfianza del modelo)*.

2. **Función de Scoring ($SC$):**
   $$SC = 0.80 \cdot p + 0.20 \cdot \left(P_{\text{cons}}(p) \cdot d\right) + \text{bonus}$$
   donde:
   - $p$ es la probabilidad del modelo.
   - $d$ es la cuota decimal (debe ser $\ge 1.40$).
   - $\text{bonus} = +0.05$ si esa selección representa el mayor EV dentro de su partido.

3. **Parlay Seguro:** Agrupa las 3 mejores selecciones que tengan $p \ge 0.60$.
4. **Parlay Arriesgado:** Agrupa selecciones con $p \ge 0.52$ buscando que el producto de sus cuotas esté lo más cercano posible a $5.00$ (en el rango $[3.00, 7.00]$).

---

## 3. Pruebas de Sensibilidad y Casos Límite (`[RECONSTRUIDO]`)

Se ejecutaron pruebas controladas en Vitest aislando una sola variable a la vez:

### A. Sensibilidad a Lesiones (On vs Off)
| Partido | Con Lesiones ($p_H$) | Sin Lesiones ($p_H$) | Impacto ($\Delta p$) | Ajustes Aplicados |
|---|---|---|---|---|
| **WAS @ LAR** | 67.8% (LAR) | 70.0% (LAR) | −2.2 pp | 12 ajustes en total |
| **MIA @ DET** | 68.6% (DET) | 70.8% (DET) | −2.2 pp | 8 ajustes |
| **NO @ CLE** | **73.3% (NO)** | **58.4% (NO)** | **+14.9 pp** | 3 bajas críticas de Cleveland |
| **SF @ LV** | 77.1% (SF) | 79.5% (SF) | −2.4 pp | 4 ajustes |

*(El partido New Orleans en Cleveland demostró la mayor sensibilidad del sistema: las bajas clave en la línea y mariscal de los Browns elevaron la probabilidad de los Saints en casi 15 puntos porcentuales).*

### B. Sensibilidad de EV y Sizing ante Variaciones de Cuota (WAS @ LAR ML 67.8%)
| Cuota Ingresada ($d$) | EV Calculado ($p \cdot d - 1$) | Decisión de Sizing | Texto Desplegado en Interfaz |
|---|---|---|---|
| **1.40** | −5.1% | 0% | No apostar |
| **1.45** | −1.7% | 0% | No apostar |
| **1.47** | −0.3% | 0% | No apostar |
| **1.53** | **+3.7%** | **10%** | *"Tiene valor si tu casa paga 1.53 o más"* (Cruce de valor exacto) |
| **1.60** | +8.5% | 10% | Alta recomendación de apuesta |
| **1.80** | +22.0% | 10% | Máximo valor |

---

## 4. Prueba de Identidad Batch: Motor Reconstruido vs Original

En el archivo de prueba `tests/domain/batch-verify.test.ts`, el motor original extraído de TouchIQ (`page_nfl_s1.js`) y la implementación TypeScript de PitchLab (`engine-nfl.ts`) se ejecutaron de forma paralela e independiente sobre los **14 partidos oficiales de la Semana 9 de la NFL across los 15 mercados de apuesta**:

$$\text{Desviación Máxima Absoluta: } |\Delta p|_{\max} = 0.000 \times 10^0$$

Todos los picks seleccionados, probabilidades porcentuales, márgenes proyectados y etiquetas de texto fueron **rigurosamente idénticos bit a bit**.
