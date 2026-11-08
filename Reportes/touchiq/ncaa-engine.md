# Reconstrucción e Ingeniería Inversa del Motor NCAA de TOUCHIQ

> **Evidencia Asociada:** `Reportes/analisis-touchiq/page_ncaa_s1.js`, `src/domain/engine-ncaa.ts`, `tests/domain/batch-verify.test.ts` (32 juegos colegiales, $\Delta_{\max} = 0.000e+0$)  
> **Estado:** 100% `[OBSERVADO]` y `[RECONSTRUIDO]` como motor independiente  

---

## 1. Visión General del Motor NCAA (Colegial)

Siguiendo estrictamente las directrices de investigación, el motor de la **NCAA (Fútbol Americano Universitario)** fue investigado de manera completamente independiente de la NFL.

Aunque en la interfaz del usuario se sugiere que ambos deportes *"utilizan el mismo modelo estadístico"*, el desensamblado forense demostró que **la NCAA cuenta con su propio archivo de motor (`page_ncaa_s1.js`), su propio algoritmo de fuerza de equipo, ajustes de conferencia explícitos, una contracción de probabilidad única y una regla de selección de picks adaptada a la disparidad colegial.**

---

## 2. Las Cuatro Diferencias Fundamentales vs el Motor NFL

| Dimensión | Motor NFL (`page_nfl_s1.js`) | Motor NCAA (`page_ncaa_s1.js`) | Razón Técnica Observada |
|---|---|---|---|
| **1. Baselines y Regresión** | Mezcla baseline 2025 con temporada 2026 ($w=n/(n+6)$) | Promedios por juego de $T$ + Puntos brutos de $R$ con $K=3$ y factor de conferencia $cf$ | El fútbol colegial tiene cientos de equipos con fuerzas abismalmente desiguales. |
| **2. Probabilidad Final ($p_H$)** | Localía como odds-ratio directa sobre Log5 | **Contracción SHR a 50%:** $p_H = 0.50 + 0.85 \cdot (\text{Log5} + \text{HFA} - 0.50)$ | El Log5 crudo sobreestima victorias aplastantes entre universidades desiguales. |
| **3. Dispersión Normal** | Margen $\sigma_M = 13.4$, Total $\sigma_T = 13.3$ | **Márgenes más abiertos:** $\sigma_M = 15.5$, $\sigma_T = 15.0$, $\sigma_P = 11.0$ | Los marcadores colegiales tienen mayor varianza de puntos. |
| **4. Lógica de Selección de Pick** | Bandas 72% / 58% + Capa de Scoring 80/20 | **Regla de 3 Ramas sin 80/20 ni combinadas** | *"NCAA: solo moneyline, sin combinada (marcadores muy disparejos)"* (cita en código). |

---

## 3. Especificación Algorítmica del Motor NCAA

### Constantes Globales
```javascript
const E    = 2.37;  // Mismo exponente pitagórico que NFL
const HFA  = 0.56;  // Ventaja de localía universitaria ligeramente mayor (56% vs 55%)
const K    = 3;     // Factor de regresión menor (K=3 vs K=6 en NFL)
const SHR  = 0.85;  // Factor de contracción hacia la paridad (50%)
const SDM  = 15.5;  // Desviación del margen colegial (puntos)
const SDT  = 15.0;  // Desviación del total de puntos colegial
const SDP  = 11.0;  // Desviación de puntos por equipo
const LGP  = 28.0;  // Puntos promedio de referencia por juego
```

---

### A. Cálculo de Fuerza con Factor de Conferencia (`build`)
La estructura de datos de equipos `T` en la NCAA incluye la conferencia de pertenencia:
`T = [nombre, PF_por_juego, PA_por_juego, Juegos_Jugados, Conferencia]`

1. **Tabla de Factores de Conferencia (`CONF`):**
   - Conferencias Mayores (*Power Conferences*):
     `SEC = 1.00`, `Big Ten (B1G) = 1.00`, `Big 12 (B12) = 1.00`, `ACC = 1.00`, `Independientes Principales (IND) = 1.00`.
   - Conferencia Pac-12 (reducida): `P12 = 0.92`.
   - Conferencias del *Group of Five* (G5): `G5 = 0.88` (default `.90` para otras).

2. **Fórmula de Tasa Ofensiva y Defensiva:**
   $$rs_{\text{crudo}} = \frac{\text{avg}_{\text{PF}} \cdot G + \text{LGP} \cdot K + \text{pts}_R}{G + K + n}$$
   $$ra_{\text{crudo}} = \frac{\text{avg}_{\text{PA}} \cdot G + \text{LGP} \cdot K + \text{ptsCon}_R}{G + K + n}$$
   donde $G$ son los partidos del baseline, $\text{pts}_R$ son los puntos reales anotados en el array $R$, y $n$ son los juegos disputados en $R$.

3. **Escalamiento por Conferencia:**
   $$rs = rs_{\text{crudo}} \cdot cf$$
   $$ra = \frac{ra_{\text{crudo}}}{cf}$$
   *(Para un equipo de conferencia débil como G5 con $cf=0.88$, su ofensiva proyectada se reduce en un 12% y su defensa se castiga aumentando los puntos permitidos en $1/0.88 \approx +13.6\%$)*.

---

### B. Contracción SHR de la Probabilidad
Tras calcular los porcentajes pitagóricos $x, y$ y aplicar la fórmula Log5:

$$\text{Log5}_{\text{raw}} = \frac{x - x \cdot y}{x + y - 2 \cdot x \cdot y}$$
$$p_{\text{base}} = \text{Log5}_{\text{raw}} + (\text{HFA} - 0.50)$$

El motor aplica la **contracción SHR ($0.85$)**:
$$p_H = 0.50 + \text{SHR} \cdot (p_{\text{base}} - 0.50) = 0.50 + 0.85 \cdot (p_{\text{base}} - 0.50)$$

**Impacto Numérico Medido:**
- En el partido emblemático de la jornada colegial **Michigan vs Michigan State (MICH @ MSU)**:
  - Probabilidad Log5 cruda con localía: $\approx 75.3\%$.
  - Tras contracción SHR: $0.50 + 0.85 \cdot (0.7528 - 0.50) = \mathbf{71.5\%}$.
  - Este $71.5\%$ coincide exactamente con el valor desplegado en la UI viva: *"PICK DEL DÍA: MICH gana (ML) 71.5%"*.

---

### C. La Regla del Pick Colegial de Tres Ramas

A diferencia de la NFL, la NCAA descarta la optimización 80/20 y aplica una regla de decisión jerárquica estricta:

```javascript
function pickNcaa(dom, pH, markets) {
  const pFav = Math.max(pH, 1 - pH);
  
  // Rama 1: Dominio total y probabilidad decente
  if (dom && pFav >= 0.52) {
    return { market: "ML", label: "ML · DOMINA EN OFENSIVA Y DEFENSIVA" };
  }
  
  // Rama 2: Favorito claro sin dominio en ambos costados
  if (pFav >= 0.58) {
    return { market: "ML", label: "ML FAVORITO (sin dominio total)" };
  }
  
  // Rama 3: Partido parejo o cerrado -> Buscar la opción más segura
  // Compara { ML Favorito, Underdog +L, Over, Under } y elige el de mayor probabilidad
  const best = selectMaxProbability(markets);
  return { market: best.id, label: "FAVORITO LIGERO · PARTIDO PAREJO / OPCIÓN MÁS SEGURA" };
}
```

---

## 4. Validación Batch de Paridad (32 Partidos Colegiales)

En `tests/domain/batch-verify.test.ts`, el motor NCAA TypeScript reconstruido se contrastó contra el `page_ncaa_s1.js` original sobre los **32 juegos del calendario colegial**:

$$\Delta_{\max} = 0.000 \times 10^0 \quad (\text{Identidad total en probabilidades y márgenes})$$

### Récord Auditado Oficial
- El array `AUD` contiene 5 partidos concluidos de la Semana 10.
- El registro oficial almacenado en el artefacto es **4-1 (80% de efectividad)**:
  - `MASS @ BALL`: MASS gana ML (80.4%) $\rightarrow$ Ganó 31-30 `[✓]`
  - `SAC @ TOL`: TOL gana ML (78.5%) $\rightarrow$ Ganó 20-17 `[✓]`
  - `EMU @ CMU`: EMU gana ML (61.1%) $\rightarrow$ Perdió 7-35 `[✗]`
  - `FAU @ UTSA`: FAU +1.5 $\rightarrow$ Ganó 60-29 `[✓]`
  - `SMU @ VT`: SMU +1.5 $\rightarrow$ Ganó 51-28 `[✓]`
