# Simulación de uso y costo: 100 usuarios con DeepSeek V4.1 Flash 1017

> **Fecha:** 2026-11-08 · **Modelo:** `deepseek/deepseek-v4.1-flash-1017` (snapshot 2026-10-17)
> **Generado por:** `services/ai-eval/simulate-usage.mjs` · semilla `20261108` · 2000 meses simulados
> **Precios:** catálogo de OpenRouter consultado el 2026-11-08; no son una cotización.

## 1. Respuesta corta

**Sí, OpenRouter con `deepseek/deepseek-v4.1-flash-1017` es una elección razonable para PitchLab**, con tres condiciones: fijar el snapshot, apagar el razonamiento que viene encendido y pasar la evaluación de 40 preguntas de `AI_ARCHITECTURE.md` §6 antes de encender el flag.

Con 100 cuentas y las funciones esperadas, el costo es **US$0.496 al mes** con la tarifa de DeepSeek (US$0.0009 por consulta). El supuesto conservador de `COST_MODEL.md` (US$1 por suscriptor activo al mes) queda **87× por encima** de lo medido: el riesgo de esta pieza no es el dinero, es la calidad de las respuestas.

| Dato | Valor simulado |
|---|---:|
| Consultas / mes (100 registrados) | 554 |
| Costo / mes (DeepSeek) | US$0.496 |
| Costo / consulta | US$0.0009 |
| Costo por cuenta que usa IA | US$0.0115 |
| Tope prepagado de US$10 | cubre ~11,158 consultas / mes al costo promedio |

## 2. Qué se simuló (y qué no)

Se modela el bucle real de `AI_ARCHITECTURE.md` §1: pregunta + `SportContext`, hasta 4 pasos de herramientas, resultados agregados (no tablas crudas), respuesta corta, validador de grounding con un reintento y caché de prefijo.

**Sí se modela:** distribución de planes y activación, consultas por usuario con cola larga, 8 intenciones que cubren las 9 herramientas, tokens de system + esquemas + contexto, resultados de herramientas, salida por paso, razonamiento, caché, reintentos y cuatro rutas de precio reales.

**No se modela:** la calidad de las respuestas (eso es la evaluación de 40 preguntas), la latencia, el costo de las otras piezas (Vercel, Neon, datos), ni usuarios nuevos durante el mes. Los precios cambian: el catálogo es de un día concreto.

## 3. Precio del modelo (catálogo real, 2026-11-08)

| Ruta | Proveedor | Entrada /M | Salida /M | Caché /M |
|---|---|---:|---:|---:|
| Ruta más barata (fp4) | Relace fp4 | 0.006 | 0.50 | 0.0050 |
| Ruta económica flex | Particle AI flex | 0.025 | 0.25 | 0.0015 |
| DeepSeek oficial | DeepSeek | 0.150 | 0.60 | 0.0030 |
| Proveedor fp8 premium | Fireworks / Together fp8 | 0.300 | 1.20 | 0.0060 |

El mismo snapshot se sirve en **50 endpoints de 40 proveedores**, entre **US$0.006 y US$0.60** por millón de entrada y entre **US$0.25 y US$2.40** por millón de salida (hasta 100× de diferencia en entrada). A esta escala eso son dólares al mes, no cientos: lo que cambia entre rutas es la cuantización (fp4/fp8), la latencia y la política de datos.

Dos detalles del catálogo que afectan el costo más que el precio:

1. **El razonamiento viene encendido** (`reasoning.default_enabled: true`, `default_effort: "high"`). Con `max_tokens: 800` y razonamiento alto, la respuesta se corta o se encarece. Hay que enviar `reasoning: { effort: "low" }` (o `"none"`).
2. **DeepSeek oficial cobra hora pico**: en días hábiles, ciertas franjas UTC duplican la tarifa (US$0.30 / US$1.20). En hora de México eso cae en la tarde-noche (19:00–22:00) y en la madrugada (00:00–04:00), justo cuando se usa. La simulación usa la tarifa base; la sección 6 lo ajusta al +30 %.

## 4. Funciones esperadas y costo por consulta

Cada intención usa las herramientas de `AI_ARCHITECTURE.md` §3 y produce una respuesta breve. El prefijo (system + 9 esquemas + contexto) es de unos **3,200 tokens** y es lo que se cachea.

| Función | Peso | Pasos | Costo / consulta |
|---|---:|---:|---:|
| Analizar un prop | 22 % | 3.0 | US$0.0011 |
| Comparar cuotas y valor | 18 % | 2.3 | US$0.0009 |
| Explicar una predicción | 16 % | 2.5 | US$0.0010 |
| Stats de equipo | 12 % | 1.5 | US$0.0006 |
| Buscar y abrir un partido | 10 % | 2.5 | US$0.0009 |
| Glosario / métrica | 10 % | 1.0 | US$0.0004 |
| Resumen de la jornada | 7 % | 3.5 | US$0.0015 |
| Fuera de alcance (rechazo) | 5 % | 1.0 | US$0.0003 |

Una consulta promedio gasta **8,912 tokens de entrada** (de los cuales 6,238 son caché) y **794 de salida**. La entrada queda por debajo del supuesto de 12k de `AI_ARCHITECTURE.md` §7 y la salida casi igual (800), así que la estimación de US$0.002–0.005 por consulta era conservadora: la real es US$0.0009.

## 5. Resultados con 100 usuarios

| Cohorte | Consultas / mes | Cuentas que usan IA | Costo / mes | Costo / consulta | Costo / cuenta activa | % del tope de US$10 |
|---|---:|---:|---:|---:|---:|---:|
| 100 registrados (mezcla de lanzamiento) | 554 | 43.2 | US$0.496 | US$0.0009 | US$0.0115 | 5.0 % |
| Beta cerrada con invitaciones Pro (100 cuentas) | 1,125 | 54.0 | US$1.01 | US$0.0009 | US$0.0187 | 10.1 % |
| Estrés: 100 suscriptores Pro | 1,195 | 60.0 | US$1.07 | US$0.0009 | US$0.0179 | 10.7 % |

El escenario primario son **100 registrados** con la mezcla de planes del producto (70 Free / 25 Pro / 5 Elite): 43 de las 100 cuentas usan la IA al menos una vez, en línea con el 40 % de activación que supone `COST_MODEL.md`. El segundo es la beta cerrada con invitaciones, que es el caso realista de los primeros meses. El tercero es un estrés comercial: todos Pro.

### Distribución del gasto mensual (DeepSeek oficial)

| Cohorte | p50 | p90 | p95 | p99 | Peor mes |
|---|---:|---:|---:|---:|---:|
| 100 registrados (mezcla de lanzamiento) | US$0.484 | US$0.651 | US$0.705 | US$0.820 | US$1.10 |
| Beta cerrada con invitaciones Pro (100 cuentas) | US$0.999 | US$1.23 | US$1.30 | US$1.45 | US$1.74 |
| Estrés: 100 suscriptores Pro | US$1.07 | US$1.24 | US$1.30 | US$1.41 | US$1.50 |

La cola es corta: incluso el peor mes de 2,000 simulados se queda en unos pocos dólares. No hay riesgo de factura sorpresa con este volumen; el riesgo está en el techo de cuotas (sección 7).

### Desglose por plan (escenario primario)

| Plan | Cuentas | Con IA | Consultas | Consultas / cuenta | Uso de cuota | Costo |
|---|---:|---:|---:|---:|---:|---:|
| Free | 70 | 24.4 | 62 | 2.5 | 17.8 % | US$0.0557 |
| Pro | 25 | 15.0 | 300 | 20.0 | 20.0 % | US$0.269 |
| Elite | 5 | 3.8 | 192 | 51.1 | 15.4 % | US$0.172 |

El gasto sigue al volumen: Pro aporta 300 consultas y US$0.269; Elite, con 5 cuentas y una cuota 4× mayor, aporta 192 y US$0.172; Free es marginal. No hay ninguna cuenta que se dispare: la cuota hace su trabajo.

### Comparación de rutas (escenario primario)

| Ruta | Media | p50 | p95 | Por consulta |
|---|---:|---:|---:|---:|
| Ruta más barata (fp4) | US$0.246 | US$0.240 | US$0.350 | US$0.0004 |
| Ruta económica flex | US$0.152 | US$0.148 | US$0.216 | US$0.0003 |
| **DeepSeek oficial** | US$0.496 | US$0.484 | US$0.705 | US$0.0009 |
| Proveedor fp8 premium | US$0.993 | US$0.968 | US$1.41 | US$0.0018 |

La ruta "más barata" (fp4) **no** es la más barata para este perfil: con ~800 tokens de salida, la flex de Particle (US$0.25/M de salida) sale 38 % por debajo. Cuando la salida pesa más que la entrada, el precio de entrada no manda.

## 6. Sensibilidad: qué mueve el costo

| Cambio | Costo mensual (DeepSeek oficial) | vs base |
|---|---:|---:|
| Base (razonamiento `low`, caché, reintentos) | US$0.496 | — |
| Razonamiento en `high` (el default) | US$0.894 | +80.2 % |
| Sin caché de prefijo | US$1.00 | +102.3 % |
| Sin reintentos | US$0.459 | -7.6 % |
| Prefijo de 4,800 tokens (+50 %) | US$0.567 | +14.3 % |
| Ruta más barata (fp4) | US$0.246 | -50.4 % |
| Ruta premium (fp8) | US$0.993 | +100.0 % |
| Recarga con 5.5 % de comisión | US$0.524 | +5.5 % |
| Hora pico de DeepSeek (+100 % en 30 % de las consultas) | US$0.645 | +30.0 % |

**El razonamiento (+80.2 %) y la caché (+102.3 %) son las palancas de configuración.** Cambiar de ruta mueve el total entre 0.3× y 2.0×, pero en todos los casos hablamos de ≈US$1 al mes o menos con 100 cuentas: la ruta se elige por calidad y política de datos, no por precio.

## 7. El techo que sí importa: cuotas y tope de US$10

| Cohorte | Consultas si todos agotan su cuota | Costo (DeepSeek oficial) | Veces que cabe en US$10 |
|---|---:|---:|---:|
| 100 registrados (mezcla de lanzamiento) | 3,100 | US$2.78 | 3.6× |
| Beta cerrada con invitaciones Pro (100 cuentas) | 6,250 | US$5.60 | 1.8× |

Con la configuración recomendada, **incluso el peor caso cabe**: 6,250 consultas (todas las cuotas agotadas en la beta con invitaciones) cuestan ≈ US$5.60, el 56 % del tope. El margen desaparece si el costo por consulta sube: con razonamiento en `high` el techo llega a ≈ US$10.10 y con la ruta premium a ≈ US$11.21; ahí el tope deja de ser un seguro y se convierte en un corte a mitad de mes.

Recomendación: **mantener el tope en US$10 con alerta al 60 %** y revisarlo solo si la evaluación de 40 preguntas obliga a un modelo más caro. Las cuotas provisionales (5/60/250) están bien para la beta; el error sería subirlas sin medir.

## 8. Recomendación

**Usa OpenRouter con `deepseek/deepseek-v4.1-flash-1017` como `AI_MODEL_DEFAULT`**, con esta configuración:

```json
{
  "model": "deepseek/deepseek-v4.1-flash-1017",
  "provider": {
    "require_parameters": true,
    "data_collection": "deny",
    "sort": "throughput",
    "only": ["deepseek", "fireworks", "together"]
  },
  "reasoning": { "effort": "low" },
  "temperature": 0.1,
  "max_tokens": 800
}
```

En el SDK esto viaja en `extraBody` (o en `providerOptions.openrouter`), no como opciones del constructor del modelo. `zdr: true` se añade solo si el proveedor elegido lo soporta: si se exige y ninguno cumple, la petición falla, que es justo lo que pide `AI_ARCHITECTURE` §2 (no degradar la privacidad en silencio).

Y estas reglas:

1. **Fija el snapshot** (`-1017`) y ten un `AI_MODEL_ESCALATION` listo. El catálogo no anuncia retiro (`expiration_date: null`), pero un snapshot se retira algún día y no quieres desplegar código ese día.
2. **Corre la evaluación de 40 preguntas** (§6) antes de encender `ai.enabled`. El índice de inteligencia pública del modelo es 28.6 (Artificial Analysis, vía el catálogo): es un modelo pequeño, y la apuesta es que las herramientas tipadas y el validador de grounding compensan. Eso se mide, no se asume.
3. **Exige `require_parameters: true` + `data_collection: "deny"`**. Verifica que queden al menos dos proveedores con esas condiciones; si solo queda uno, la beta se cae cuando ese proveedor falla.
4. **No optimices al proveedor más barato.** Entre fp4 a US$0.006/M y un proveedor fp8 (o el oficial) a US$0.15/M hay ~US$0.25 al mes de diferencia con 100 cuentas. La calidad del tool calling vale más que eso.
5. **Tope de gasto en US$10** durante la beta y alerta al 60 %. Con los números de arriba, el peor caso cabe; solo un modelo más caro o el razonamiento en `high` lo ponen en riesgo.
6. **Mide el costo real** con el log `ai_usage` que ya está diseñado: el precio del catálogo cambia y la simulación es un supuesto, no una factura.

### Lo que no recomiendo

- **API directa de DeepSeek** en vez de OpenRouter: ata el modelo, pierdes el enrutamiento por privacidad y el fallback entre proveedores, y el precio es el mismo o peor. La decisión de ADR-013 sigue en pie.
- **Empezar por el modelo más barato del catálogo** (fp4 a US$0.006/M): el ahorro es de centavos y el riesgo de tool calling en fp4 es real.
- **Subir las cuotas ahora** para "aprovechar" el precio bajo: primero mide el uso real; las cuotas son el control de abuso, no el control de costo.

## 9. Cómo reproducir

```bash
node services/ai-eval/simulate-usage.mjs
node services/ai-eval/simulate-usage.mjs --months=5000 --seed=7
node services/ai-eval/simulate-usage.mjs --route=valor
```

Salidas en `Reportes/ai/`: `SIMULACION-100-USUARIOS.md` (este documento), `simulacion-100-usuarios.json` (todas las cifras) y `simulacion-100-usuarios.csv` (una fila por usuario de un mes simulado, no del promedio).

Los supuestos están en las constantes `TOKENS`, `INTENTS`, `PLANS` y `ROUTES` del script. Cambia una y vuelve a correr: el reporte se regenera completo.
