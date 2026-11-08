# Límites Metodológicos, Incertidumbres y Aspectos Desconocidos

> **Principio Forense:** Mantener la honestidad intelectual distinguiendo con total claridad lo que fue demostrado mediante evidencia de lo que permanece inaccesible o sujeto a hipótesis  

---

## 1. Lo que NO es Posible Observar desde el Cliente Público

Por la naturaleza de la arquitectura observada (aplicación estática servida por CDN), existen aspectos del sistema que residen fuera del alcance de la ingeniería inversa web y deben ser clasificados formalmente como **`[DESCONOCIDO]`**:

### A. El Entorno de Cosecha Manual del Autor (`[DESCONOCIDO]`)
- **Pregunta sin respuesta observable:** ¿Cómo recolectó el autor las 154 lesiones o los 121 resultados? ¿Utilizó scripts de Python con BeautifulSoup/Selenium en su máquina personal, o transcribió los datos manualmente mirando la pantalla de Pro-Football-Reference y DraftKings?
- **Evidencia en el artefacto:** El código solo contiene los arrays resultantes ya serializados en JavaScript. Los scripts de recolección previos no forman parte del bundle web.

### B. El Pipeline de Empaquetado y Despliegue (`[INFERIDO]`)
- **Pregunta:** ¿Qué herramienta utilizó para generar los bloques base64 de `PAGES`?
- **Inferencia fundada:** Es muy probable que haya utilizado un script simple de Node.js o Python (`btoa(readFileSync(...))`) que compila los HTMLs secundarios y los inyecta en la plantilla del shell antes del `git push` hacia Netlify.

### C. La Infraestructura del Puente `window.claude` (`[DESCONOCIDO]`)
- **Pregunta:** ¿Dónde se ejecuta la aplicación cuando `window.claude` está activo?
- **Inferencia:** El código está diseñado para ser compatible con la plataforma Anthropic Claude Artifacts o un entorno de prototipado rápido donde el host inyecta una base de datos documental y un endpoint de inferencia de LLM. En la web pública comercial (`touchiq.com.mx`), este entorno no existe.

### D. Datos Históricos de Temporadas Previas (`[DESCONOCIDO]`)
- El servidor de Netlify no expone una base de datos SQL o NoSQL con temporadas 2020–2024.
- Solo se conocen los datos de la temporada 2026 (hasta el 7 de noviembre) y los baselines consolidados de 2025.

---

## 2. Limitaciones Matemáticas y Metodológicas Detectadas en TouchIQ

Aunque el motor de TouchIQ es sumamente competente para una aplicación client-side, adolece de limitaciones estadísticas estructurales:

### A. Ausencia de Modelado de Clima y Factores Ambientales
- Las constantes de puntos y márgenes asumen condiciones estándar o domo.
- El modelo no incorpora temperatura, velocidad del viento, lluvia o nieve, los cuales en partidos de noviembre/diciembre en Buffalo, Green Bay o Chicago tienen un impacto masivo sobre los totales de puntos y la eficiencia del pase.

### B. Distribución Normal Continua para Marcadores Discretos
- En el fútbol americano, los puntos se anotan en múltiplos discretos característicos (touchdown = 6/7 puntos, gol de campo = 3 puntos, safety = 2 puntos).
- Por esta razón, existen números clave de margen en la NFL (3, 7, 6, 10, 14, 4).
- TouchIQ modela el margen con una curva normal gaussiana continua ($\sigma = 13.4$), la cual no captura la acumulación de probabilidad en los números clave. En márgenes cercanos a 3 o 7 puntos, el modelo puede presentar pequeñas distorsiones frente a un modelo Poisson o copula discreta.

### C. Parámetro de Localía Estático
- El factor de localía se fija rígidamente en $HFA = 0.55$ ($55\%$) para todos los estadios (excepto Londres en $0.50$).
- En la realidad de la NFL, la ventaja de local varía significativamente por equipo (ej. Seattle en Lumen Field, Kansas City en Arrowhead o Denver por altitud tienen ventajas históricas muy superiores a estadios con afición dividida).

### D. Falta de Calibración Dinámica en Temporada
- Los exponentes pitagóricos ($E = 2.37$ para NFL y $1.7$ para fútbol) y las desviaciones estándar ($\sigma_M = 13.4$) son constantes estáticas quemadas en el código.
- No existe un proceso de optimización estocástica (como descenso de gradiente o inferencia bayesiana Markov Chain Monte Carlo - MCMC) que ajuste estos hiperparámetros a medida que avanza la temporada.

---

## 3. Matriz de Certeza Científica

| Afirmación sobre TouchIQ | Estado Epistemológico | Nivel de Certeza |
|---|---|---|
| Fórmulas de Pitágoras, Log5 y curvas normales | `[OBSERVADO]` | 100% (Verificado en código y batch test) |
| Parámetros y constantes ($E=2.37, HFA=0.55, K=6$) | `[OBSERVADO]` | 100% (Constantes leídas en JS) |
| Cero llamadas de red en tiempo de ejecución | `[OBSERVADO]` | 100% (Demostrado vía CDP y REA) |
| El código de acceso 7779 es client-side | `[OBSERVADO]` | 100% (Leído en texto plano) |
| Frecuencia de actualización semanal | `[INFERIDO]` | 95% (Deducido de timestamps de DK y fechas) |
| Recolección manual humana de datos | `[INFERIDO]` | 90% (Consistente con notas, fuentes y formato) |
| Scripts privados de compilación del autor | `[DESCONOCIDO]` | Inaccesibles (No forman parte del bundle) |
| Servidores backend privados del autor | `[DESCONOCIDO]` | No detectados (La web pública corre en CDN pura) |
