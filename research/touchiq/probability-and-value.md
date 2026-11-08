# Probabilidades, Edge, Valor Esperado y Criterio de Sizing

> **Evidencia Asociada:** `script_0.js` funciones `dec`, `ev`, `sizing`, `noVig`, tests en `aztecavet-math.test.ts`  
> **Objetivo:** Documentar formalmente todas las operaciones financieras y cuantitativas observables  

---

## 1. Probabilidad Implícita vs Probabilidad del Modelo

`[OBSERVADO]` TouchIQ opera sobre una clara separación entre dos conceptos fundamentales:
1. **Probabilidad del Modelo ($p$):** La probabilidad objetiva estimada por los motores predictivos (Pitágoras, Log5, Poisson, Curvas Normales).
2. **Probabilidad Implícita de la Casa ($p_{\text{implícita}}$):** El inverso directo de la cuota decimal ofrecida por la casa de apuestas:
   $$p_{\text{implícita}} = \frac{1}{d}$$
   *(Ejemplo: si la casa paga $1.50$, la probabilidad implícita con vig es $1 / 1.50 = 66.7\%$)*.

---

## 2. Remoción del Margen de la Casa (Overround / Vig Removal — `noVig`)

Para determinar si una cuota ofrecida por un casino o casa de apuestas es atractiva, el modelo calcula primero la **"Cuota Justa" (*Fair Odds*)** sin comisión.

### Fórmula Multiplicativa Normalizada de noVig (`[OBSERVADO]`)
Dado un mercado con $k$ opciones mutuamente excluyentes (ejemplo: Local, Empate, Visita en fútbol, o Over / Under en NFL), con cuotas decimales $d_1, d_2, \dots, d_k$:

1. **Suma de Probabilidades Implícitas (Overround):**
   $$S = \sum_{j=1}^k \frac{1}{d_j}$$
   *(En un mercado con margen típico del 5%, $S \approx 1.05$)*.

2. **Margen de la Casa (*Vig*):**
   $$\text{Margen} = (S - 1) \cdot 100\%$$
   *(En la interfaz, TouchIQ despliega este valor exacto junto a las cuotas: ej. "Casa Caliente: 4.8% de margen")*.

3. **Probabilidad Justa Normalizada ($p_i^{\text{fair}}$):**
   $$p_i^{\text{fair}} = \frac{\frac{1}{d_i}}{S} = \frac{\frac{1}{d_i}}{\sum_{j=1}^k \frac{1}{d_j}}$$

4. **Cuota Justa (*Fair Odds*):**
   $$d_i^{\text{fair}} = \frac{1}{p_i^{\text{fair}}}$$

---

## 3. Cálculo de Valor Esperado (Expected Value — $EV$) y Edge

`[OBSERVADO]` El cálculo del Valor Esperado por peso apostado se implementa en la función `ev(p, d)`:

$$EV = p \cdot d - 1$$

donde:
- $p$ es la probabilidad calculada por el modelo predictivo.
- $d$ es la cuota decimal ingresada por el usuario (o convertida desde americana).

### El Punto de Equilibrio (*Break-Even Odds*)
TouchIQ calcula la cuota mínima que el usuario debe buscar en su casa de apuestas para que la operación tenga valor ($EV \ge 0$):

$$d_{\text{min}} = \frac{1}{p}$$

**Ejemplo Real Verificado en la UI (WAS @ LAR):**
- Probabilidad del modelo de Los Angeles Rams en Moneyline: $p = 67.8\% = 0.678$.
- Cuota de equilibrio:
  $$d_{\text{min}} = \frac{1}{0.678} \approx 1.4749 \approx 1.48$$
- Cuota para alcanzar el umbral de valor mínimo exigido por la app ($EV \ge +4\%$):
  $$d_{+4\%} = \frac{1.04}{0.678} \approx 1.5339 \approx \mathbf{1.53}$$
- Por esta razón matemática exacta, la tarjeta de TouchIQ despliega textualmente:
  `"Tiene valor si tu casa paga 1.53 o más"`.

---

## 4. Criterio de Asignación de Capital (Bankroll Sizing)

TouchIQ **no utiliza el Criterio de Kelly puro continuo** ($f^* = (b \cdot p - q)/b$), el cual tiende a sugerir fracciones excesivamente volátiles para apostadores recreativos. En su lugar, utiliza un **Criterio de Kelly Discreto en 3 Peldaños (`sizing`)**:

```javascript
function sizing(p, ev, threshold = 0.60) {
  // Peldaño 0: Sin valor o valor marginal
  if (ev < 0.04) {
    return 0; // "No apostar" (0% del bankroll)
  }
  
  // Peldaño 1: Alto valor y alta probabilidad del modelo
  if (p >= threshold) {
    return 10; // "Apostar fuerte" (10% del bankroll virtual)
  }
  
  // Peldaño 2: Valor positivo pero probabilidad moderada
  return 5; // "Apostar moderado" (5% del bankroll virtual)
}
```

### Justificación de Gestión de Riesgo
- **Filtro de Ruido al $+4\%$:** Exigir un $EV \ge +4\%$ previene apostar en situaciones de borde donde el margen de error del modelo estadístico podría anular la ventaja teórica.
- **Acotamiento al $10\%$ Máximo:** Evita la ruina del bankroll (*gambler's ruin*) en rachas negativas de varianza.

---

## 5. Matemática de Parlays y Combinadas

Cuando el usuario agrega 2 o más selecciones a su boleto:

1. **Probabilidad Conjunta Asumiendo Independencia:**
   $$p_{\text{parlay}} = \prod_{i=1}^m p_i = p_1 \cdot p_2 \cdots p_m$$

2. **Cuota Combinada Teórica:**
   $$d_{\text{parlay}} = \prod_{i=1}^m d_i = d_1 \cdot d_2 \cdots d_m$$

3. **Alerta de Correlación Intra-Partido (`[OBSERVADO]`):**
   Si el usuario combina dos selecciones del mismo partido (por ejemplo: *Detroit gana ML* y *Detroit Over 24.5 puntos*), el sistema emite una advertencia formal en la interfaz:
   `"Advertencia: Has seleccionado 2 mercados del mismo partido. La probabilidad combinada calculada como producto simple puede estar inflada o desinflada debido a la correlación entre eventos"`.

---

## 6. Oportunidad Cuantitativa para PitchLab

PitchLab superará el modelo matemático de TouchIQ implementando:
1. **Criterio de Kelly Fraccional Continuo (Quarter-Kelly / Half-Kelly):**
   $$f_{\text{PitchLab}} = 0.25 \cdot \frac{p \cdot d - 1}{d - 1}$$
   Permitiendo asignaciones personalizadas de capital adaptadas al perfil de riesgo del usuario (Conservador, Balanceado, Agresivo).
2. **Copulas Arquimedianas para Same-Game Parlays (SGP):**
   Modelar la dependencia estadística real entre líneas de hándicap y props de jugadores mediante cópulas bivariadas de Frank o Gumbel, en lugar de advertir correlación sin corregirla.
3. **Optimización de Portafolio de Markowitz para Apuestas:**
   Maximizar el retorno esperado del día acotando la varianza total de la cartera de apuestas de la jornada.
