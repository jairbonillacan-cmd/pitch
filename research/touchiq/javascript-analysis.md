# Análisis Forense de Código JavaScript, AST y Módulos

> **Evidencia Asociada:** Scripts extraídos en `research/touchiq/evidence/javascript/`, análisis estático de REA (`ev_b9a88162…`), árbol AST de 12,796 nodos  
> **Objetivo:** Desensamblar y documentar las funciones matemáticas, algoritmos, validaciones y estructuras de datos del cliente  

---

## 1. Inventario de Archivos JavaScript Extraídos

Al analizar la estructura de scripts en el documento principal y los documentos embebidos en base64, se identifican 5 unidades de código fundamentales:

| Archivo Extraído | Rol en el Sistema | Tamaño | SHA-256 Digest |
|---|---|---|---|
| `script_0.js` | Shell, Puerta PIN, Canvas, Boleto, Bankroll, Datos Globales | 2,050,575 B | `fc07f55785725ca11d4e7a13ee126b7b3b37ba8236f1b670fba144548e0fd280` |
| `script_1.js` | Assets multimedia (Inyección de imágenes Base64 de Robots) | 28,829 B | `9a3b8e71c990b76e2798f0907e59c25ff8544978a3c8e5480746bfa33f674991` |
| `script_2.js` | Asistente de IA (Dual-Mode: Claude API vs Local Scraping) | 4,531 B | `c439f0e137c62bb1758c067e411b0bbfae7275d27b9ea325d2be5822f79024f0` |
| `page_nfl_s1.js` | Motor predictivo NFL, simulador, tablas de datos, 15 mercados | 88,129 B | `d829e0839e240a6b7cc996e46571b07be9e7e7807eaecff2d5145b23b5d19a3b` |
| `page_ncaa_s1.js`| Motor predictivo NCAA colegial, factores de conferencia | 66,826 B | `a5f4c28479e099684175b9f71bfb5c215d2a8439e6a9f074a3f2b1d5ec4294c1` |

---

## 2. Mapa de Funciones Principales y Especificación Algorítmica

### Módulo: Funciones Matemáticas Fundamentales

#### `Function ID: MATH-01 — phi(x)` (Función de Distribución Acumulada Normal Estándar $\Phi(x)$)
- **Ubicación Observada:** `page_nfl_s1.js` línea 45; `page_ncaa_s1.js` línea 38.
- **Propósito:** Calcular la probabilidad acumulada de una variable normal estándar $X \sim \mathcal{N}(0,1)$. Utilizada para determinar la probabilidad de cubrir hándicaps y rebasar totales de puntos.
- **Algoritmo Observado:** Aproximación polinomial racional de Abramowitz & Stegun (fórmula 26.2.17):
  ```javascript
  function phi(x) {
    if (x < -8) return 0;
    if (x > 8) return 1;
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
          a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    return 0.5 * (1.0 + sign * y);
  }
  ```
- **Precisión Observada:** Error máximo $|\epsilon| < 1.5 \times 10^{-7}$.
- **Nivel de Confianza:** `[OBSERVADO]` - 100%.

---

#### `Function ID: MATH-02 — invPhi(p)` (Inversa de la Normal / Función Probit $\Phi^{-1}(p)$)
- **Ubicación Observada:** `page_nfl_s1.js` línea 52.
- **Propósito:** Obtener el z-score correspondiente a una probabilidad dada. Esencial para proyectar el margen de victoria esperado $\mu$ a partir de la probabilidad de victoria local $p_H$:
  $$\mu = 13.4 \cdot \Phi^{-1}(p_H)$$
- **Algoritmo Observado:** Búsqueda por bisección numérica iterativa (16 pasos) acotada entre $[-4, 4]$:
  ```javascript
  function invPhi(p) {
    let lo = -4, hi = 4;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (phi(mid) < p) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  ```
- **Nivel de Confianza:** `[OBSERVADO]` - 100%.

---

#### `Function ID: MATH-03 — log5(x, y)` (Fórmula Log5 de Bill James)
- **Ubicación Observada:** `page_nfl_s1.js` línea 62; `page_ncaa_s1.js` línea 50.
- **Propósito:** Calcular la probabilidad de que el equipo con porcentaje de victoria intrínseco $x$ derrote al equipo con porcentaje $y$ en campo neutral:
  $$P(A \text{ vence a } B) = \frac{x - x \cdot y}{x + y - 2 \cdot x \cdot y}$$
- **Validación de Casos Límite:** Si $x = y$, devuelve exactamente $0.50$ (50%). Si $x=1$ y $y < 1$, devuelve $1.00$.
- **Nivel de Confianza:** `[OBSERVADO]` - 100%.

---

#### `Function ID: MATH-04 — dec(oddStr)` / `decO(oddStr)` (Conversión Universal de Cuotas)
- **Ubicación Observada:** `script_0.js` línea 128; `src/domain/stats.ts`.
- **Propósito:** Normalizar entradas del usuario que pueden venir en formato decimal europeo (`1.85`), americano positivo (`+120`) o americano negativo (`-150`), tolerando comas como punto decimal.
- **Algoritmo Observado:**
  ```javascript
  function dec(v) {
    if (!v) return null;
    let s = String(v).trim().replace(",", ".");
    let n = parseFloat(s);
    if (isNaN(n)) return null;
    if (s.startsWith("+") || n >= 100) return 1 + n / 100; // Americana positiva
    if (s.startsWith("-") || n <= -100) return 1 + 100 / Math.abs(n); // Americana negativa
    if (n > 1) return n; // Decimal válida
    return null; // Inválida (<= 1)
  }
  ```
- **Nivel de Confianza:** `[OBSERVADO]` - 100%.

---

#### `Function ID: MATH-05 — ev(p, decimalOdds)` (Cálculo de Expected Value)
- **Ubicación Observada:** `script_0.js` línea 142.
- **Propósito:** Evaluar la rentabilidad matemática de una apuesta respecto al modelo:
  $$EV = p \cdot d - 1$$
  donde $p$ es la probabilidad del modelo y $d$ es la cuota decimal de la casa.
- **Nivel de Confianza:** `[OBSERVADO]` - 100%.

---

#### `Function ID: MATH-06 — sizing(p, ev, threshold)` (Criterio de Asignación de Capital)
- **Ubicación Observada:** `script_0.js` línea 150.
- **Propósito:** Determinar el porcentaje del bankroll virtual a recomendar al usuario.
- **Regla Observada:**
  - Si $EV < +0.04$ ($+4\%$): devuelve `0` ("No apostar").
  - Si $EV \ge +0.04$ y $p \ge \text{threshold}$ (donde threshold por defecto es $0.60$): devuelve `10%`.
  - Si $EV \ge +0.04$ y $p < \text{threshold}$: devuelve `5%`.
- **Nivel de Confianza:** `[OBSERVADO]` - 100%.

---

#### `Function ID: MATH-07 — noVig(oddsGroup)` (Remoción del Margen de la Casa)
- **Ubicación Observada:** `script_0.js` línea 165.
- **Propósito:** Calcular la probabilidad implícita pura de las cuotas de la casa sumando el overround y normalizando:
  $$p_i^{\text{fair}} = \frac{\frac{1}{d_i}}{\sum_{j} \frac{1}{d_j}}, \quad \text{Margen} = \left(\sum_j \frac{1}{d_j}\right) - 1$$
- **Nivel de Confianza:** `[OBSERVADO]` - 100%.

---

## 3. Estructuras de Datos Globales en `script_0.js`

El estado general de la aplicación se centraliza en el objeto global `window.AV`:

```javascript
const AV = {
  cfg: {
    start: 1000,    // Capital inicial ($1,000 MXN)
    th: 0.60,       // Umbral de alta confianza para sizing al 10%
  },
  odds: {},         // Mapa clave-valor de cuotas guardadas: { "NFL:...": 1.45 }
  slip: [],         // Selecciones activas en el boleto actual
  bets: [],         // Historial de apuestas registradas (pendientes y resueltas)
  tab: "b",         // Pestaña activa en el boleto ("b" boleto, "h" historial, "c" bankroll)
};
```

---

## 4. Persistencia en `localStorage` y Detección de Fugas

`[OBSERVADO]` La persistencia se realiza bajo la clave única `localStorage["azteca_av"]`:
- **Serialización:** Cada vez que el usuario ingresa una cuota, agrega un pick al boleto o califica una apuesta como ganada/perdida, se ejecuta:
  ```javascript
  function save(key) {
    try {
      localStorage.setItem("azteca_av", JSON.stringify({
        cfg: AV.cfg,
        odds: AV.odds,
        slip: AV.slip,
        bets: AV.bets
      }));
    } catch(e) {
      console.warn("Storage write failed", e);
    }
  }
  ```
- **Límite FIFO de Cuotas:** Para evitar exceder la cuota de 5 MB de `localStorage`, el array de cuotas guardadas `AV.odds` implementa una poda automática tipo FIFO cuando supera las 800 entradas.
- **Ausencia de Fugas de Memoria:** Los event listeners de teclado y clics se registran a nivel de `document` de forma estática y nunca se acumulan recursivamente en runtime.
