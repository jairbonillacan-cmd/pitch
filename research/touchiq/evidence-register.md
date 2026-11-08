# Registro Central de Evidencias Forenses (Evidence Ledger)

> **Autor:** Antigravity / Reverse Engineering Agent  
> **Fecha de Consolidación:** Noviembre 2026  
> **Ámbito de Cobertura:** Artefactos primarios, trazas de ejecución, hashes SHA-256, capturas visuales y pruebas matemáticas  

---

## 1. Evidencias Generadas por REA (Reverse Engineer Anything)

| Evidence ID | Operación / Herramienta | Sujeto / Ruta Local | Hash SHA-256 del Sujeto | Hallazgo Clave |
|---|---|---|---|---|
| `ev_cf2360a4…` | `analyze_javascript_application` | `Reportes/analisis-touchiq/js-tree/` | `fc07f55785725ca11d4e7a13ee126b7b3b37ba8236f1b670fba144548e0fd280` | 3 archivos JS, 12,796 nodos AST, 0 relaciones en familia `request` (cero llamadas de red). |
| `ev_b9a88162…` | `inspect_analysis_view` | `Reportes/analisis-touchiq/js-tree/` | `fc07f55785725ca11d4e7a13ee126b7b3b37ba8236f1b670fba144548e0fd280` | Resumen de grafo de dependencias, variables globales y funciones estadísticas. |
| `ev_7d2fef6c…` | CDP Live Session (Chrome) | `https://touchiq.com.mx/` | `a303e685d0b2941c465089eb03f3265f` | 0 requests en runtime tras carga inicial, `localStorage` vacío en perfil fresco. |
| `ev_44e130e7…` | `analyze_javascript_application` | `aztecavet.html` / `inline_1.js` | `5afba93d7e82b784a9f9397645063ff4eecab5ffb6c236ad646c1f1ec4f7684c` | Confirmación de código base común (785 KB), PIN 7779 y motor de fútbol. |
| `ev_1b6ea0f4…` | `trace_application_feature` | Semilla: `"azteca_av"` | — | Traza completa de persistencia: `setItem` y `getItem` con degradación a localStorage. |

---

## 2. Catálogo de Capturas Visuales (Screenshots)

Todas las capturas se encuentran almacenadas en formato PNG en `research/touchiq/evidence/screenshots/`:

| Archivo | Resolución | Vista / Estado Capturado | Tamaño (Bytes) |
|---|---|---|---|
| `01-desktop-lock-stage1.png` | 1440x900 | Pantalla de bienvenida con pirámide, Piedra del Sol y canvas synthwave | 1,432,143 B |
| `02-desktop-lock-stage2-pad.png` | 1440x900 | Pad numérico activo (teclas 1-9, 0, retroceso) solicitando PIN | 349,995 B |
| `03-desktop-home.png` | 1440x900 | Home principal desbloqueado con reloj, tarjetas bento de robots y hero | 235,807 B |
| `04-desktop-nfl-dashboard.png` | 1440x900 | Tablero NFL cargado dentro de iframe con 7 pestañas superiores | 237,041 B |
| `05-desktop-nfl-tab-partidos.png` | 1440x900 | Tab Partidos NFL: Pick del Día (WAS@LAR) y tarjetas de los 14 juegos | 236,969 B |
| `06-desktop-nfl-tab-simulador.png` | 1440x900 | Tab Simulador NFL: Selectores de local/visita y proyección instantánea | 149,096 B |
| `07-desktop-nfl-tab-lesiones.png` | 1440x900 | Tab Lesiones NFL: Feed de 154 bajas con editor de estado e impacto | 161,766 B |
| `08-desktop-nfl-tab-dinero.png` | 1440x900 | Tab Dinero NFL: Splits de apuestas de DraftKings (% dinero vs % boletos) | 148,169 B |
| `09-desktop-ncaa-dashboard.png` | 1440x900 | Tablero NCAA cargado dentro de iframe con Pick del Día MICH 71.5% | 211,526 B |
| `10-desktop-futbol-selector.png` | 1440x900 | Sección `#s2`: Selector de los 4 torneos de fútbol ("Elige tu liga") | 195,587 B |
| `11-desktop-boleto-drawer.png` | 1440x900 | Cajón lateral "Mi Boleto" abierto con pestaña Boleto y cálculo de parlay | 270,085 B |
| `12-desktop-boleto-historial.png` | 1440x900 | Cajón lateral abierto en pestaña Historial con filtros de apuestas | 282,676 B |
| `13-desktop-boleto-bankroll.png` | 1440x900 | Cajón lateral abierto en pestaña Bankroll con capital y métricas de ROI | 289,527 B |
| `14-desktop-assistant-open.png` | 1440x900 | Modal del Asistente de IA abierto con chips de preguntas rápidas | 368,239 B |
| `15-desktop-assistant-response.png` | 1440x900 | Respuesta del Asistente en modo local procesando pregunta de NFL | 378,927 B |
| `16-mobile-lock-stage1.png` | 390x844 | Pantalla de bienvenida responsiva en viewport iPhone 14 | 148,349 B |
| `17-mobile-home.png` | 390x844 | Home principal adaptado a pantalla vertical móvil | 167,223 B |
| `18-mobile-nfl-dashboard.png` | 390x844 | Tablero deportivo de la NFL con scroll táctil en móvil | 141,525 B |

---

## 3. Trazas de Red y Logs de Interacción

| Archivo de Registro | Formato | Contenido |
|---|---|---|
| `network-requests.json` | JSON | Registro cronológico de todas las solicitudes de red durante la sesión completa. |
| `console-logs.json` | JSON | Registro de mensajes de consola, avisos y errores (`404 favicon.ico`). |
| `session-walkthrough.json` | JSON | Secuencia de 20 pasos de interacción ejecutados durante la exploración automatizada. |
| `http-contracts.json` | JSON | Esquema formal de peticiones HTTP observadas y headers de Netlify Edge. |

---

## 4. Archivos de Código Extraídos

| Archivo | Ruta Relativa | Hash SHA-256 |
|---|---|---|
| `script_0.js` | `evidence/javascript/script_0.js` | `fc07f55785725ca11d4e7a13ee126b7b3b37ba8236f1b670fba144548e0fd280` |
| `script_1.js` | `evidence/javascript/script_1.js` | `9a3b8e71c990b76e2798f0907e59c25ff8544978a3c8e5480746bfa33f674991` |
| `script_2.js` | `evidence/javascript/script_2.js` | `c439f0e137c62bb1758c067e411b0bbfae7275d27b9ea325d2be5822f79024f0` |
| `page_nfl_s1.js` | `evidence/javascript/page_nfl_s1.js` | `d829e0839e240a6b7cc996e46571b07be9e7e7807eaecff2d5145b23b5d19a3b` |
| `page_ncaa_s1.js` | `evidence/javascript/page_ncaa_s1.js` | `a5f4c28479e099684175b9f71bfb5c215d2a8439e6a9f074a3f2b1d5ec4294c1` |

---

## 5. Pruebas Matemáticas y Logs de Ejecución

- **Archivo de Log:** `research/touchiq/evidence/mathematical-tests/test-execution.log`
- **Resultados Registrados:**
  - 384 tests ejecutados con éxito.
  - Verificación batch NFL: $\Delta_{\max} = 0.000e+0$ en 14 juegos × 15 mercados.
  - Verificación batch NCAA: $\Delta_{\max} = 0.000e+0$ en 32 juegos × 15 mercados.
  - Paridad de fútbol: 324/324 tests pasando.
