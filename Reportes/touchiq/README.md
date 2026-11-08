# Dossier de Investigación Forense y Reverse Engineering: TOUCHIQ (touchiq.com.mx)
## Proyecto Beneficiario: PitchLab — Superapp de Inteligencia Deportiva

> **Autor:** Equipo Senior de Reverse Engineering, Arquitectura de Sistemas y Modelado Estadístico  
> **Fecha de Análisis:** Noviembre 2026  
> **Herramientas Principales:** REA (*Reverse Engineer Anything* - `rea-agents@6.8.0`, Skill v49), Playwright CDP, Chrome DevTools, Vitest  
> **Objetivo:** https://touchiq.com.mx/  
> **Estado de la Aplicación Analizada:** Build en producción (Netlify Edge), snapshot de datos al 7 de noviembre de 2026  

---

## 1. Resumen de la Misión

El presente dossier recoge la investigación forense, desensamblado de código, ingeniería inversa matemática, trazabilidad de red y análisis de datos de la plataforma **TOUCHIQ** (anteriormente desarrollada bajo el linaje *Aztecavet*). El objetivo primordial no es la clonación visual o de marca, sino la **transferencia técnica verificable hacia PitchLab**, permitiendo diseñar una arquitectura superior, desacoplada, con datos en tiempo real y modelos probabilísticos calibrados.

### Clasificación Epistemológica de Hallazgos
Para mantener el máximo rigor forense, cada afirmación a lo largo de este dossier se clasifica formalmente en una de las cuatro categorías:
- **`[OBSERVADO]`**: Hecho directamente verificado en el código fuente descargado, tráfico de red interceptado, DOM en tiempo real o ejecuciones CDP.
- **`[INFERIDO]`**: Deducción lógica fundamentada en patrones observados, convenciones de ingeniería o comentarios del autor, cuya certeza no es del 100% por falta de acceso al entorno privado de desarrollo.
- **`[RECONSTRUIDO]`**: Algoritmo, estructura de datos o modelo matemático reimplementado de forma independiente en TypeScript y probado bit a bit contra la salida del original.
- **`[DESCONOCIDO]`**: Aspecto del sistema inaccesible desde el cliente público (e.g., scripts privados de recolección en la máquina del desarrollador, base de datos histórica previa a la semana 9).

---

## 2. Mapa del Dossier de Investigación

Toda la documentación técnica se encuentra modularizada en `Reportes/touchiq/` con las siguientes áreas de especialidad:

| Archivo | Área de Investigación | Descripción Clave |
|---|---|---|
| [README.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/README.md) | Índice & Metodología | Guía de lectura, clasificación epistemológica y setup de REA. |
| [executive-summary.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/executive-summary.md) | Resumen Ejecutivo | Veredicto técnico, arquitectura general y síntesis para dirección. |
| [pages-and-navigation.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/pages-and-navigation.md) | Vistas & Navegación | Inventario de pantallas, estados DOM y grafo de transiciones. |
| [ux-components.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/ux-components.md) | Componentes UX/UI | Desglose de interfaz, interactividad, audio sintético y responsive. |
| [frontend-analysis.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/frontend-analysis.md) | Arquitectura Frontend | Modelo de renderizado (Vanilla JS + iframes `srcdoc`), CSS y performance. |
| [javascript-analysis.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/javascript-analysis.md) | Desensamblado JS | Análisis AST, bundles, funciones estadísticas y variables globales. |
| [network-and-apis.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/network-and-apis.md) | Red y APIs Observables | Prueba forense de *Zero-Runtime Network* y protocolo `postMessage`. |
| [data-provenance.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/data-provenance.md) | Origen de los Datos | Auditoría de fuentes citadas, recolección manual y proveedores comerciales. |
| [historical-data.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/historical-data.md) | Datos Históricos | Alcance de auditorías embebidas y limitación de series temporales. |
| [update-mechanisms.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/update-mechanisms.md) | Mecanismos de Actualización | Proceso de compilación estática vs pipeline en tiempo real. |
| [nfl-engine.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/nfl-engine.md) | Motor NFL | Fórmulas Pitágoras, Log5, ajuste por lesiones, curvas normales y 80/20. |
| [ncaa-engine.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/ncaa-engine.md) | Motor NCAA | Ajuste por conferencias, contracción SHR, SDM=15.5 y pick de 3 ramas. |
| [soccer-engines.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/soccer-engines.md) | Motores de Fútbol | 4 torneos, Poisson bivariado con corrección Dixon-Coles y tilt de bisección. |
| [probability-and-value.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/probability-and-value.md) | Probabilidades y Valor | Cuotas justas, remoción de vig (noVig), Expected Value y Sizing. |
| [ticket-history-bankroll.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/ticket-history-bankroll.md) | Boleto & Bankroll | Gestión de apuestas, cálculo de parlay, persistencia y métricas ROI. |
| [ai-assistant.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/ai-assistant.md) | Asistente de IA | Dual-mode: Claude API vs fallback local determinista por scraping DOM. |
| [architecture-inferences.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/architecture-inferences.md) | Arquitectura del Sistema | Topología observada, puente `window.claude` y brechas de seguridad. |
| [functional-tests.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/functional-tests.md) | Pruebas y Validación | Tests dorados, paridad batch con $\Delta=0.000e+0$ y sensibilidad. |
| [evidence-register.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/evidence-register.md) | Registro de Evidencias | Catálogo de capturas, hashes SHA-256, trazas CDP y tests de paridad. |
| [unknowns-and-limitations.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/unknowns-and-limitations.md) | Límites e Incertidumbre | Lo no observable, código no servido y advertencias técnicas. |
| [pitchlab-opportunities.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/pitchlab-opportunities.md) | Oportunidades PitchLab | Hoja de ruta para superar a TouchIQ técnica y comercialmente. |
| [PITCHLAB_HANDOFF.md](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/Reportes/touchiq/PITCHLAB_HANDOFF.md) | Master Handoff | Cuestionario maestro 1-15, matriz de capacidades y blueprint de desarrollo. |

---

## 3. Registro de Evidencias Físicas

Los artefactos primarios recolectados se encuentran resguardados en `Reportes/touchiq/evidence/`:

```text
Reportes/touchiq/evidence/
├── screenshots/
│   ├── 01-desktop-lock-stage1.png
│   ├── 02-desktop-lock-stage2-pad.png
│   ├── 03-desktop-home.png
│   ├── 04-desktop-nfl-dashboard.png
│   ├── 05-desktop-nfl-tab-partidos.png
│   ├── 06-desktop-nfl-tab-simulador.png
│   ├── 07-desktop-nfl-tab-lesiones.png
│   ├── 08-desktop-nfl-tab-dinero.png
│   ├── 09-desktop-ncaa-dashboard.png
│   ├── 10-desktop-futbol-selector.png
│   ├── 11-desktop-boleto-drawer.png
│   ├── 12-desktop-boleto-historial.png
│   ├── 13-desktop-boleto-bankroll.png
│   ├── 14-desktop-assistant-open.png
│   ├── 15-desktop-assistant-response.png
│   ├── 16-mobile-lock-stage1.png
│   ├── 17-mobile-home.png
│   └── 18-mobile-nfl-dashboard.png
├── browser-traces/
│   ├── network-requests.json
│   └── console-logs.json
├── interaction-recordings/
│   └── session-walkthrough.json
├── javascript/
│   ├── script_0.js (2.05 MB: motor + datos + shell)
│   ├── script_1.js (28 KB: robots webp/jpeg en base64)
│   ├── script_2.js (4.5 KB: asistente IA dual-mode)
│   ├── page_nfl_s1.js (88 KB: motor y datos NFL)
│   └── page_ncaa_s1.js (67 KB: motor y datos NCAA)
├── network-schemas/
│   └── http-contracts.json
└── mathematical-tests/
    └── test-execution.log (384 tests pasando, paridad bit a bit)
```

---

## 4. Cómo Reproducir los Resultados
Desde la raíz del proyecto PitchLab:
```bash
# 1. Ejecutar la suite completa de verificación matemática y paridad (384 tests)
npm test

# 2. Correr el harness automatizado de exploración y capturas en vivo
node scripts/record-live-touchiq.mjs

# 3. Correr la verificación batch independiente de paridad de motores
npx vitest run tests/domain/batch-verify.test.ts
```
