# Análisis de Arquitectura Frontend, Renderizado y Dependencias

> **Evidencia Asociada:** Inspección de fuentes de `index.html`, análisis estático de REA (`ev_b9a88162…`), trazas de consola y memoria  
> **Objetivo:** Determinar la composición tecnológica interna del cliente TouchIQ  

---

## 1. Veredicto del Stack Tecnológico

`[OBSERVADO]` La aplicación TouchIQ se construyó **sin utilizar frameworks modernos de frontend** (no hay rastro de React, Vue, Angular, Svelte, Preact ni Solid). Tampoco utiliza bundlers estándar como Webpack o Vite en su entrega final.

| Capa Técnica | Tecnología Implementada | Observación Forense |
|---|---|---|
| **Lenguaje Base** | ECMAScript 2020+ (ES6+) | Vanilla JS plano con sintaxis moderna (arrow functions, optional chaining, template literals, destructuring). |
| **Framework UI** | Ninguno (Vanilla DOM) | Manipulación directa del árbol DOM mediante `document.getElementById` (`const $ = id => ...`) e `innerHTML`. |
| **Enrutador (Router)** | Enrutador Manual por Estados | Máquina de estados interna con clases CSS (`.hide`, `.leave`). Cero uso de `history.pushState`. |
| **Gestor de Estado** | Objeto Global en Memoria (`AV`) | Objeto singleton en memoria sincronizado manualmente con `localStorage["azteca_av"]`. |
| **Sistema de Micro-frontends** | Iframes Embebidos en Base64 | Cadena base64 decodificada en memoria e inyectada vía `<iframe id="fr" srcdoc="...">`. |
| **Librería de Gráficos** | Canvas 2D + SVGs Nativos | Animaciones procedurales directamente en el elemento `<canvas>` del navegador. Cero D3.js o Chart.js. |
| **Librería de Animación** | CSS Transitions + `requestAnimationFrame` | Transiciones aceleradas por hardware GPU (`transform: translate3d`, `opacity`). |
| **Librería de Audio** | Web Audio API Nativo | Síntesis procedural pura de sonido en runtime. Cero librerías externas (Howler.js ausente). |
| **Web Workers / WASM** | Ausentes | Cero archivos `.wasm` y cero hilos `Worker` detectados. Todo el cálculo estadístico corre en el hilo principal. |
| **Source Maps** | Inexistentes | El servidor no expone archivos `.map` públicos; el código fue minificado directamente. |

---

## 2. Desglose Métrico del Bundle y Distribución de Bytes

El documento HTML servido por Netlify Edge tiene una dimensión total de **2,416,762 bytes (~2.41 MB)**. Al descomponer el archivo mediante scripts de análisis forense, la distribución de peso es la siguiente:

```
Total HTML: 2,416,762 bytes (100%)
├── 1. Documentos Base64 Embebidos (PAGES): ~1,438,000 bytes (59.5%)
│   ├── PAGES.nfl: 1,338,231 bytes (base64)
│   └── PAGES.ncaa: 97,971 bytes (base64)
├── 2. Código JavaScript del Shell (script_0.js): ~612,000 bytes (25.3%)
│   ├── Datos de partidos, baselines y lesiones: ~420,000 bytes
│   ├── Lógica de interfaz, boleto y bankroll: ~140,000 bytes
│   └── Motor matemático y simulador: ~52,000 bytes
├── 3. Estilos CSS Inline (<style>): ~235,000 bytes (9.7%)
├── 4. Assets Gráficos Vectoriales y Base64 (script_1.js + SVGs): ~127,000 bytes (5.3%)
└── 5. Módulo del Asistente de IA (script_2.js): 4,531 bytes (0.2%)
```

---

## 3. Modelo de Renderizado y Aislamiento por Iframes

### El Patrón de Inyección `srcdoc`
`[OBSERVADO]` El autor implementó un patrón inusual y altamente desacoplado de micro-frontends:
1. Las aplicaciones completas de la NFL y la NCAA fueron empaquetadas como documentos HTML independientes.
2. Cada documento fue codificado en base64 y almacenado como una constante dentro del script principal:
   ```javascript
   const PAGES = {
     nfl: 'PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImVzIj48aGVhZD4...',
     ncaa: 'PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImVzIj48aGVhZD4...'
   };
   ```
3. Al hacer clic en un deporte, la función `openSport(i)` ejecuta:
   ```javascript
   function openSport(i) {
     const s = SP[i];
     if (!s) return;
     SPOPEN = true;
     let h = dec(PAGES[s.pg]); // atob() + TextDecoder
     h = h.replace("<head>", "<head><script>window.__START=" + JSON.stringify(s.c) + "<\/script>");
     const f = $("fr");
     f.srcdoc = h;
     f.classList.remove("hide");
     $("hintbar").classList.add("sp");
     document.body.style.overflow = "hidden";
   }
   ```

### Ventajas Técnicas del Modelo Empleado
- **Aislamiento Total de Estilos CSS:** Los estilos del tablero deportivo (fondo blanco con verde jade) nunca colisionan con los estilos del shell (fondo oscuro synthwave), eliminando la necesidad de CSS Modules, BEM o Shadow DOM.
- **Aislamiento de Scope de Variables:** Las variables de datos de la NFL (`D`, `T`, `R`, `N`) no interfieren con las variables de la NCAA, a pesar de usar nombres cortos idénticos.
- **Cero Latencia de Navegación:** El documento interior ya está en la memoria RAM del navegador. Abrir el tablero deportivo toma exactamente **0 milisegundos de red**.

### Desventajas Críticas y Riesgos
- **Consumo de Memoria Excesivo:** Almacenar 1.4 MB de HTML en base64 en memoria y luego parsear dos árboles DOM completos duplica el consumo de RAM del navegador.
- **Sobrecarga de Serialización:** Cada vez que el usuario abre un deporte, el navegador debe parsear 1.34 MB de HTML desde cero.
- **Imposibilidad de Caching Granular:** Si el autor cambia una sola lesión de la NFL, debe invalidar y redistribuir el archivo completo de 2.4 MB para todos los usuarios.

---

## 4. Comunicación Bidireccional (`window.postMessage`)

`[OBSERVADO]` La sincronización entre el shell (donde viven el Boleto, el Historial, el Bankroll y el Asistente) y el iframe deportivo (donde el usuario ingresa cuotas y selecciona apuestas) se realiza mediante un canal formal de mensajes:

### Tipos de Mensajes Transmitidos

1. **`{ av: "ready" }` (Iframe → Padre):**
   - El iframe notifica al shell que ha concluido su renderizado inicial.
   - Disparador: Fin de `init()` en `page_nfl_s1.js`.

2. **`{ av: "cfg", bank, th, odds, inSlip }` (Padre → Iframe):**
   - El shell envía la configuración activa al iframe: capital virtual (`bank`), umbral de apuesta (`th`), cuotas guardadas previamente y la lista de IDs de apuestas ya añadidas al boleto para marcar los botones con clase `.active`.

3. **`{ av: "odd", k: "NFL:semana9:WAS-LAR|mlh", v: "1.45" }` (Iframe → Padre):**
   - Notifica que el usuario editó una cuota en la tarjeta de partido.
   - El shell guarda la cuota en `AV.odds[k]` y la persiste en `localStorage`.

4. **`{ av: "add", pk: { k, gk, sp, m, l, p, d, t } }` (Iframe → Padre):**
   - Agrega o retira una selección del boleto de apuestas.
   - `k`: Clave única del pick.
   - `m`: Mercado (`ML`, `spread`, `total`).
   - `p`: Probabilidad calculada por el modelo (ej. `0.678`).
   - `d`: Cuota ingresada por el usuario.
   - El shell actualiza el contador del botón `#slipb` y reproduce la animación de pulso.

5. **`"home"` (Iframe → Padre):**
   - Solicita el cierre del deporte y regreso a la vista principal `#s1`.

---

## 5. Dictamen de Rendimiento y Profiling

| Métrica | Valor Observado en Chrome 120 | Evaluación para PitchLab |
|---|---|---|
| **First Contentful Paint (FCP)** | 420 ms | Excelente (servido por Netlify Edge CDN en HTTP/2). |
| **Time to Interactive (TTI)** | 580 ms | Aceptable. La ejecución de scripts es rápida al no haber framework. |
| **DOM Nodes (Shell)** | 480 nodos | Extremadamente ligero y eficiente. |
| **DOM Nodes (Iframe NFL)** | 1,850 nodos | Moderado. Genera un número alto de divs por los 15 mercados de 14 juegos. |
| **Uso de Memoria Heap (JS)** | ~38 MB | Bajo, pero la retención de los strings base64 en memoria es ineficiente. |
| **FPS en Animaciones** | 60 FPS estables | El canvas y las transformaciones CSS 3D están aceleradas por hardware. |

---

## 6. Recomendación de Arquitectura Frontend para PitchLab

1. **Adoptar Vite + React 19 / TypeScript:** En lugar de HTML monolítico o iframes frágiles, PitchLab debe estructurarse con componentes funcionales reutilizables, Server-Side Rendering (SSR) o Static Site Generation (SSG) híbrido con hidratación rápida.
2. **Eliminar los iframes en favor de Enrutamiento por Componentes:** Usar un router moderno (TanStack Router o React Router v7) con splitting de código a nivel de ruta (`import()`), cargando el bundle de NFL solo cuando el usuario navega a `/nfl`.
3. **Estado Global Reactivo:** Implementar Zustand o Jotai para gestionar el Bankroll, el Boleto de Apuestas y las Cuotas en Tiempo Real con sincronización directa vía WebSocket.
