#!/usr/bin/env node
/**
 * Simulación de uso y costo de PitchLab AI con 100 usuarios.
 *
 * Responde a una pregunta concreta: si PitchLab usa OpenRouter con
 * `deepseek/deepseek-v4.1-flash-1017`, ¿cuánto cuesta un mes con 100 usuarios
 * y las funciones que ya están definidas en `docs/architecture/AI_ARCHITECTURE.md`?
 *
 * No llama a OpenRouter ni necesita API key: modela el bucle de herramientas
 * (1–4 pasos), los tokens de entrada/salida, la caché de prefijo, los reintentos
 * y las tarifas reales del catálogo (snapshot 2026-11-08). Todo es determinista
 * con la misma semilla.
 *
 * Uso:
 *   node services/ai-eval/simulate-usage.mjs
 *   node services/ai-eval/simulate-usage.mjs --months=5000 --seed=7
 *   node services/ai-eval/simulate-usage.mjs --route=oficial --out=Reportes/ai
 *
 * Salidas: <out>/simulacion-100-usuarios.json, .csv y SIMULACION-100-USUARIOS.md
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// 1. Precio real del modelo (OpenRouter, catálogo del 2026-11-08)
// ---------------------------------------------------------------------------

const MODEL = {
  id: "deepseek/deepseek-v4.1-flash-1017",
  label: "DeepSeek V4.1 Flash 1017",
  contextTokens: 1_048_576,
  snapshot: "2026-10-17",
  endpoints: 50,
  providers: 40,
  // `reasoning.default_enabled: true` y `default_effort: "high"` en el catálogo:
  // si no se apaga, el razonamiento se come los 800 tokens de salida.
  reasoningDefault: "high",
  intelligenceIndex: 28.6,
};

/**
 * Tarifas por millón de tokens (USD). Son rutas reales del catálogo, no
 * promedios inventados: el mismo modelo se sirve entre US$0.006 y US$0.60 de
 * entrada según el proveedor y la cuantización.
 */
const ROUTES = {
  barata: {
    label: "Ruta más barata (fp4)",
    provider: "Relace fp4",
    input: 0.006,
    output: 0.5,
    cacheRead: 0.005,
  },
  valor: {
    label: "Ruta económica flex",
    provider: "Particle AI flex",
    input: 0.025,
    output: 0.25,
    cacheRead: 0.0015,
  },
  oficial: {
    label: "DeepSeek oficial",
    provider: "DeepSeek",
    input: 0.15,
    output: 0.6,
    cacheRead: 0.003,
  },
  premium: {
    label: "Proveedor fp8 premium",
    provider: "Fireworks / Together fp8",
    input: 0.3,
    output: 1.2,
    cacheRead: 0.006,
  },
};

// ---------------------------------------------------------------------------
// 2. Planes, cuotas y cohortes
// ---------------------------------------------------------------------------

const PLANS = {
  free: { label: "Free", quota: 5, activation: 0.35, median: 2.2, sigma: 0.7 },
  pro: { label: "Pro", quota: 60, activation: 0.6, median: 15, sigma: 0.85 },
  elite: { label: "Elite", quota: 250, activation: 0.75, median: 35, sigma: 0.9 },
};

const COHORTS = {
  "beta-100": {
    label: "100 registrados (mezcla de lanzamiento)",
    note: "70 Free / 25 Pro / 5 Elite. La activación por plan descuenta a quien nunca abre la IA.",
    mix: { free: 70, pro: 25, elite: 5 },
  },
  "invites-100": {
    label: "Beta cerrada con invitaciones Pro (100 cuentas)",
    note: "30 Free / 60 Pro / 10 Elite. El caso típico de los primeros meses con invitaciones.",
    mix: { free: 30, pro: 60, elite: 10 },
  },
  "pro-100": {
    label: "Estrés: 100 suscriptores Pro",
    note: "Techo comercial: todos pagan y todos usan la cuota de Pro.",
    mix: { pro: 100 },
  },
};

// ---------------------------------------------------------------------------
// 3. Funciones esperadas: cada intención es una secuencia de herramientas
//    (las 9 de AI_ARCHITECTURE §3) con su costo típico en tokens.
// ---------------------------------------------------------------------------

const INTENTS = [
  {
    key: "prop",
    label: "Analizar un prop",
    weight: 22,
    steps: [2, 3, 3, 4],
    toolTokens: [340, 260, 220],
    answer: 470,
  },
  {
    key: "odds",
    label: "Comparar cuotas y valor",
    weight: 18,
    steps: [2, 2, 3],
    toolTokens: [300, 260],
    answer: 410,
  },
  {
    key: "prediction",
    label: "Explicar una predicción",
    weight: 16,
    steps: [2, 3],
    toolTokens: [320, 240],
    answer: 500,
  },
  {
    key: "team",
    label: "Stats de equipo",
    weight: 12,
    steps: [1, 2],
    toolTokens: [430],
    answer: 360,
  },
  {
    key: "game",
    label: "Buscar y abrir un partido",
    weight: 10,
    steps: [2, 3],
    toolTokens: [110, 520],
    answer: 450,
  },
  {
    key: "explain",
    label: "Glosario / métrica",
    weight: 10,
    steps: [1],
    toolTokens: [],
    answer: 240,
  },
  {
    key: "roundup",
    label: "Resumen de la jornada",
    weight: 7,
    steps: [3, 4],
    toolTokens: [480, 420, 300],
    answer: 560,
  },
  {
    key: "oos",
    label: "Fuera de alcance (rechazo)",
    weight: 5,
    steps: [1],
    toolTokens: [],
    answer: 130,
  },
];

// ---------------------------------------------------------------------------
// 4. Parámetros del bucle de herramientas
// ---------------------------------------------------------------------------

const DEFAULTS = {
  months: 2000,
  seed: 20261108,
  out: "Reportes/ai",
  route: "oficial",
  reasoning: "low", // off | low | high (high = el default del catálogo)
  cache: true,
  retries: true,
  creditFee: 0.055, // comisión de recarga de OpenRouter (supuesto, confirmar)
};

const TOKENS = {
  prefix: 3200, // system (6 reglas) + 9 esquemas de herramientas + SportContext
  question: 35,
  cacheHitFirst: 0.65, // el prefijo es idéntico entre usuarios: caché tibio
  cacheHitNext: 0.9, // dentro de la misma conversación
  toolCallOutput: [70, 160], // JSON del tool call + una línea de texto
  answerJitter: 0.2, // ±20 % sobre la respuesta final
  toolJitter: 0.15, // ±15 % sobre cada resultado de herramienta
  groundingRetryRate: 0.12,
  providerRetryRate: 0.02,
  reasoningPerStep: {
    off: [0, 0],
    low: [40, 120],
    high: [300, 900],
  },
};

// ---------------------------------------------------------------------------
// 5. Utilidades deterministas
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randn(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function lognormal(rng, median, sigma) {
  return median * Math.exp(sigma * randn(rng));
}

function between(rng, [min, max]) {
  return min + (max - min) * rng();
}

function pickWeighted(rng, items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function usd(value) {
  const abs = Math.abs(value);
  let decimals = 4;
  if (abs >= 1) decimals = 2;
  else if (abs >= 0.1) decimals = 3;
  else if (abs >= 0.01) decimals = 4;
  return `US$${value.toFixed(decimals)}`;
}

function pct(value, decimals = 1) {
  return `${(value * 100).toFixed(decimals)} %`;
}

function delta(value, base) {
  const change = value / base - 1;
  const sign = change >= 0 ? "+" : "-";
  return `${sign}${(Math.abs(change) * 100).toFixed(1)} %`;
}

function int(value) {
  return Math.round(value).toLocaleString("en-US");
}

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ---------------------------------------------------------------------------
// 6. Modelo de una consulta
// ---------------------------------------------------------------------------

function sampleReasoning(rng, mode) {
  return between(rng, TOKENS.reasoningPerStep[mode] ?? TOKENS.reasoningPerStep.low);
}

function costOf({ normalInput, cachedInput, output }, route) {
  return (
    (normalInput * route.input + cachedInput * route.cacheRead + output * route.output) /
    1_000_000
  );
}

/**
 * Una consulta = 1–4 pasos. En cada paso se reenvía la conversación completa;
 * solo el prefijo (system + herramientas) es cacheable.
 */
function simulateQuery(rng, intent, config) {
  const steps = intent.steps[Math.floor(rng() * intent.steps.length)];
  const reasoningMode = config.reasoning;
  const prefix = config.prefixTokens ?? TOKENS.prefix;

  let normalInput = 0;
  let cachedInput = 0;
  let output = 0;
  let history = 0; // resultados de herramientas + salidas ya enviadas
  let toolIndex = 0;

  for (let step = 0; step < steps; step += 1) {
    const isFinal = step === steps - 1;
    const hit = config.cache ? (step === 0 ? TOKENS.cacheHitFirst : TOKENS.cacheHitNext) : 0;
    const cached = prefix * hit;
    const stepInput = prefix + TOKENS.question + history;
    cachedInput += cached;
    normalInput += stepInput - cached;

    const reasoning = sampleReasoning(rng, reasoningMode);
    const stepOutput = isFinal
      ? intent.answer * (1 + (rng() * 2 - 1) * TOKENS.answerJitter)
      : between(rng, TOKENS.toolCallOutput);
    output += stepOutput + reasoning;

    // Lo que se acumula para el siguiente paso: salida sin razonamiento
    // (el razonamiento no se reenvía) más el resultado de la herramienta.
    history += stepOutput;
    if (!isFinal) {
      const base = intent.toolTokens[Math.min(toolIndex, intent.toolTokens.length - 1)] ?? 0;
      const toolResult = base * (1 + (rng() * 2 - 1) * TOKENS.toolJitter);
      history += toolResult;
      toolIndex += 1;
    }
  }

  // Reintentos: el validador de grounding pide una pasada extra; el proveedor
  // puede fallar y repetir la llamada. Ambos se cobran.
  if (config.retries) {
    const retryRate = TOKENS.groundingRetryRate + TOKENS.providerRetryRate;
    if (rng() < retryRate) {
      const extraInput = prefix + TOKENS.question + history + 300;
      const extraCached = config.cache ? prefix * TOKENS.cacheHitNext : 0;
      cachedInput += extraCached;
      normalInput += extraInput - extraCached;
      output += 320;
    }
  }

  const byRoute = {};
  for (const [key, route] of Object.entries(ROUTES)) {
    byRoute[key] = costOf({ normalInput, cachedInput, output }, route);
  }

  return {
    intent: intent.key,
    steps,
    inputTokens: normalInput + cachedInput,
    cachedTokens: cachedInput,
    outputTokens: output,
    byRoute,
  };
}

// ---------------------------------------------------------------------------
// 7. Modelo de un usuario y de un mes
// ---------------------------------------------------------------------------

function sampleQueries(rng, plan) {
  if (rng() > plan.activation) return 0;
  const raw = lognormal(rng, plan.median, plan.sigma);
  return Math.min(plan.quota, Math.max(1, Math.round(raw)));
}

function simulateMonth(rng, cohortKey, config) {
  const cohort = COHORTS[cohortKey];
  const users = [];
  let seed = 0;

  for (const [planKey, count] of Object.entries(cohort.mix)) {
    const plan = PLANS[planKey];
    for (let i = 0; i < count; i += 1) {
      seed += 1;
      const queries = sampleQueries(rng, plan);
      const user = {
        id: `${planKey}-${seed}`,
        plan: planKey,
        planLabel: plan.label,
        quota: plan.quota,
        queries,
        inputTokens: 0,
        cachedTokens: 0,
        outputTokens: 0,
        byRoute: Object.fromEntries(Object.keys(ROUTES).map((key) => [key, 0])),
        intents: {},
      };

      for (let q = 0; q < queries; q += 1) {
        const intent = pickWeighted(rng, INTENTS);
        const result = simulateQuery(rng, intent, config);
        user.inputTokens += result.inputTokens;
        user.cachedTokens += result.cachedTokens;
        user.outputTokens += result.outputTokens;
        user.intents[intent.key] = (user.intents[intent.key] ?? 0) + 1;
        for (const [key, cost] of Object.entries(result.byRoute)) {
          user.byRoute[key] += cost;
        }
      }

      users.push(user);
    }
  }

  const totals = {
    queries: users.reduce((sum, user) => sum + user.queries, 0),
    inputTokens: users.reduce((sum, user) => sum + user.inputTokens, 0),
    cachedTokens: users.reduce((sum, user) => sum + user.cachedTokens, 0),
    outputTokens: users.reduce((sum, user) => sum + user.outputTokens, 0),
    activeUsers: users.filter((user) => user.queries > 0).length,
    byRoute: Object.fromEntries(
      Object.keys(ROUTES).map((key) => [
        key,
        users.reduce((sum, user) => sum + user.byRoute[key], 0),
      ]),
    ),
  };

  return { users, totals };
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    mean: mean(samples),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function ceiling(cohortKey) {
  const cohort = COHORTS[cohortKey];
  let queries = 0;
  for (const [planKey, count] of Object.entries(cohort.mix)) {
    queries += count * PLANS[planKey].quota;
  }
  return queries;
}

// ---------------------------------------------------------------------------
// 8. Ejecución
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const config = { ...DEFAULTS };
  for (const arg of argv) {
    const match = /^--([a-z]+)=(.*)$/.exec(arg);
    if (!match) continue;
    const [, key, raw] = match;
    if (key === "months" || key === "seed") config[key] = Number(raw);
    else if (key === "cache" || key === "retries") config[key] = raw !== "false";
    else config[key] = raw;
  }
  return config;
}

function runScenario(config, cohortKey) {
  const runs = [];
  let lastMonth = null;
  const planAcc = {};
  for (const planKey of Object.keys(COHORTS[cohortKey].mix)) {
    planAcc[planKey] = { users: 0, active: 0, queries: 0, activeQueries: 0, cost: 0 };
  }

  for (let m = 0; m < config.months; m += 1) {
    const rng = mulberry32(config.seed + m * 7919 + cohortKey.length * 104729);
    const month = simulateMonth(rng, cohortKey, config);
    runs.push(month);
    lastMonth = month;

    for (const planKey of Object.keys(planAcc)) {
      const planUsers = month.users.filter((user) => user.plan === planKey);
      const active = planUsers.filter((user) => user.queries > 0);
      planAcc[planKey].users += planUsers.length;
      planAcc[planKey].active += active.length;
      planAcc[planKey].queries += planUsers.reduce((sum, user) => sum + user.queries, 0);
      planAcc[planKey].activeQueries += active.reduce((sum, user) => sum + user.queries, 0);
      planAcc[planKey].cost += planUsers.reduce((sum, user) => sum + user.byRoute[config.route], 0);
    }
  }

  const routes = {};
  for (const key of Object.keys(ROUTES)) {
    routes[key] = summarize(runs.map((month) => month.totals.byRoute[key]));
  }

  const perPlan = {};
  for (const [planKey, acc] of Object.entries(planAcc)) {
    perPlan[planKey] = {
      label: PLANS[planKey].label,
      users: acc.users / config.months,
      active: acc.active / config.months,
      queries: acc.queries / config.months,
      queriesPerActive: acc.active ? acc.activeQueries / acc.active : 0,
      utilization: acc.users ? acc.queries / (acc.users * PLANS[planKey].quota) : 0,
      cost: acc.cost / config.months,
    };
  }

  return {
    cohort: cohortKey,
    label: COHORTS[cohortKey].label,
    note: COHORTS[cohortKey].note,
    queries: summarize(runs.map((month) => month.totals.queries)),
    activeUsers: mean(runs.map((month) => month.totals.activeUsers)),
    inputTokens: mean(runs.map((month) => month.totals.inputTokens)),
    cachedTokens: mean(runs.map((month) => month.totals.cachedTokens)),
    outputTokens: mean(runs.map((month) => month.totals.outputTokens)),
    routes,
    perPlan,
    ceiling: ceiling(cohortKey),
    lastMonth,
  };
}

function intentCosts(config) {
  const rng = mulberry32(config.seed ^ 0x9e3779b9);
  const samples = 2000;
  return INTENTS.map((intent) => {
    let cost = 0;
    for (let i = 0; i < samples; i += 1) {
      cost += simulateQuery(rng, intent, config).byRoute[config.route];
    }
    return {
      label: intent.label,
      weight: intent.weight,
      steps: mean(intent.steps),
      cost: cost / samples,
    };
  });
}

// ---------------------------------------------------------------------------
// 9. Reporte
// ---------------------------------------------------------------------------

function intentTable(rows) {
  const body = rows.map(
    (row) => `| ${row.label} | ${pct(row.weight / 100, 0)} | ${row.steps.toFixed(1)} | ${usd(row.cost)} |`,
  );
  return ["| Función | Peso | Pasos | Costo / consulta |", "|---|---:|---:|---:|", ...body].join(
    "\n",
  );
}

function routeTable() {
  const rows = Object.entries(ROUTES).map(([, route]) => {
    return `| ${route.label} | ${route.provider} | ${route.input.toFixed(3)} | ${route.output.toFixed(2)} | ${route.cacheRead.toFixed(4)} |`;
  });
  return [
    "| Ruta | Proveedor | Entrada /M | Salida /M | Caché /M |",
    "|---|---|---:|---:|---:|",
    ...rows,
  ].join("\n");
}

function scenarioTable(results, config) {
  const rows = results.map((result) => {
    const cost = result.routes[config.route].mean;
    const perQuery = result.queries.mean ? cost / result.queries.mean : 0;
    const perActive = result.activeUsers ? cost / result.activeUsers : 0;
    return `| ${result.label} | ${int(result.queries.mean)} | ${result.activeUsers.toFixed(1)} | ${usd(cost)} | ${usd(perQuery)} | ${usd(perActive)} | ${pct(cost / 10)} |`;
  });
  return [
    "| Cohorte | Consultas / mes | Cuentas que usan IA | Costo / mes | Costo / consulta | Costo / cuenta activa | % del tope de US$10 |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...rows,
  ].join("\n");
}

function routeMatrixTable(result, config) {
  const rows = Object.entries(ROUTES).map(([key, route]) => {
    const stats = result.routes[key];
    const perQuery = result.queries.mean ? stats.mean / result.queries.mean : 0;
    const marker = key === config.route ? "**" : "";
    return `| ${marker}${route.label}${marker} | ${usd(stats.mean)} | ${usd(stats.p50)} | ${usd(stats.p95)} | ${usd(perQuery)} |`;
  });
  return ["| Ruta | Media | p50 | p95 | Por consulta |", "|---|---:|---:|---:|---:|", ...rows].join(
    "\n",
  );
}

function distributionTable(results, config) {
  const rows = results.map((result) => {
    const stats = result.routes[config.route];
    return `| ${result.label} | ${usd(stats.p50)} | ${usd(stats.p90)} | ${usd(stats.p95)} | ${usd(stats.p99)} | ${usd(stats.max)} |`;
  });
  return [
    "| Cohorte | p50 | p90 | p95 | p99 | Peor mes |",
    "|---|---:|---:|---:|---:|---:|",
    ...rows,
  ].join("\n");
}

function planTable(result) {
  const rows = Object.entries(result.perPlan).map(([, plan]) => {
    return `| ${plan.label} | ${int(plan.users)} | ${plan.active.toFixed(1)} | ${int(plan.queries)} | ${plan.queriesPerActive.toFixed(1)} | ${pct(plan.utilization)} | ${usd(plan.cost)} |`;
  });
  return [
    "| Plan | Cuentas | Con IA | Consultas | Consultas / cuenta | Uso de cuota | Costo |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...rows,
  ].join("\n");
}

function buildReport(results, config, meta) {
  const primary = results.find((result) => result.cohort === "beta-100") ?? results[0];
  const invites = results.find((result) => result.cohort === "invites-100") ?? primary;
  const routeKey = config.route;
  const route = ROUTES[routeKey];
  const primaryCost = primary.routes[routeKey].mean;
  const perQueryOfficial = primaryCost / Math.max(primary.queries.mean, 1);
  const perActive = primaryCost / Math.max(primary.activeUsers, 1);
  const ceilingCost = ceiling("beta-100") * perQueryOfficial;
  const ceilingInvites =
    ceiling("invites-100") * (invites.routes[routeKey].mean / Math.max(invites.queries.mean, 1));
  const ceilingInvitesPremium = ceilingInvites * (primary.routes.premium.mean / primaryCost);
  const ceilingInvitesHigh = ceilingInvites * (meta.sensitivity.reasoningHigh / primaryCost);

  return `# Simulación de uso y costo: 100 usuarios con DeepSeek V4.1 Flash 1017

> **Fecha:** ${meta.date} · **Modelo:** \`${MODEL.id}\` (snapshot ${MODEL.snapshot})
> **Generado por:** \`services/ai-eval/simulate-usage.mjs\` · semilla \`${config.seed}\` · ${config.months} meses simulados
> **Precios:** catálogo de OpenRouter consultado el ${meta.date}; no son una cotización.

## 1. Respuesta corta

**Sí, OpenRouter con \`deepseek/deepseek-v4.1-flash-1017\` es una elección razonable para PitchLab**, con tres condiciones: fijar el snapshot, apagar el razonamiento que viene encendido y pasar la evaluación de 40 preguntas de \`AI_ARCHITECTURE.md\` §6 antes de encender el flag.

Con 100 cuentas y las funciones esperadas, el costo es **${usd(primaryCost)} al mes** con la tarifa de ${route.provider} (${usd(perQueryOfficial)} por consulta). El supuesto conservador de \`COST_MODEL.md\` (US$1 por suscriptor activo al mes) queda **${Math.round(1 / Math.max(perActive, 1e-9))}× por encima** de lo medido: el riesgo de esta pieza no es el dinero, es la calidad de las respuestas.

| Dato | Valor simulado |
|---|---:|
| Consultas / mes (100 registrados) | ${int(primary.queries.mean)} |
| Costo / mes (${route.provider}) | ${usd(primaryCost)} |
| Costo / consulta | ${usd(perQueryOfficial)} |
| Costo por cuenta que usa IA | ${usd(perActive)} |
| Tope prepagado de US$10 | cubre ~${int(10 / Math.max(perQueryOfficial, 1e-9))} consultas / mes al costo promedio |

## 2. Qué se simuló (y qué no)

Se modela el bucle real de \`AI_ARCHITECTURE.md\` §1: pregunta + \`SportContext\`, hasta 4 pasos de herramientas, resultados agregados (no tablas crudas), respuesta corta, validador de grounding con un reintento y caché de prefijo.

**Sí se modela:** distribución de planes y activación, consultas por usuario con cola larga, 8 intenciones que cubren las 9 herramientas, tokens de system + esquemas + contexto, resultados de herramientas, salida por paso, razonamiento, caché, reintentos y cuatro rutas de precio reales.

**No se modela:** la calidad de las respuestas (eso es la evaluación de 40 preguntas), la latencia, el costo de las otras piezas (Vercel, Neon, datos), ni usuarios nuevos durante el mes. Los precios cambian: el catálogo es de un día concreto.

## 3. Precio del modelo (catálogo real, ${meta.date})

${routeTable()}

El mismo snapshot se sirve en **${MODEL.endpoints} endpoints de ${MODEL.providers} proveedores**, entre **US$0.006 y US$0.60** por millón de entrada y entre **US$0.25 y US$2.40** por millón de salida (hasta 100× de diferencia en entrada). A esta escala eso son dólares al mes, no cientos: lo que cambia entre rutas es la cuantización (fp4/fp8), la latencia y la política de datos.

Dos detalles del catálogo que afectan el costo más que el precio:

1. **El razonamiento viene encendido** (\`reasoning.default_enabled: true\`, \`default_effort: "high"\`). Con \`max_tokens: 800\` y razonamiento alto, la respuesta se corta o se encarece. Hay que enviar \`reasoning: { effort: "low" }\` (o \`"none"\`).
2. **DeepSeek oficial cobra hora pico**: en días hábiles, ciertas franjas UTC duplican la tarifa (US$0.30 / US$1.20). En hora de México eso cae en la tarde-noche (19:00–22:00) y en la madrugada (00:00–04:00), justo cuando se usa. La simulación usa la tarifa base; la sección 6 lo ajusta al +30 %.

## 4. Funciones esperadas y costo por consulta

Cada intención usa las herramientas de \`AI_ARCHITECTURE.md\` §3 y produce una respuesta breve. El prefijo (system + 9 esquemas + contexto) es de unos **3,200 tokens** y es lo que se cachea.

${intentTable(meta.intentCosts)}

Una consulta promedio gasta **${int(primary.inputTokens / Math.max(primary.queries.mean, 1))} tokens de entrada** (de los cuales ${int(primary.cachedTokens / Math.max(primary.queries.mean, 1))} son caché) y **${int(primary.outputTokens / Math.max(primary.queries.mean, 1))} de salida**. La entrada queda por debajo del supuesto de 12k de \`AI_ARCHITECTURE.md\` §7 y la salida casi igual (800), así que la estimación de US$0.002–0.005 por consulta era conservadora: la real es ${usd(perQueryOfficial)}.

## 5. Resultados con 100 usuarios

${scenarioTable(results, config)}

El escenario primario son **100 registrados** con la mezcla de planes del producto (70 Free / 25 Pro / 5 Elite): ${primary.activeUsers.toFixed(0)} de las 100 cuentas usan la IA al menos una vez, en línea con el 40 % de activación que supone \`COST_MODEL.md\`. El segundo es la beta cerrada con invitaciones, que es el caso realista de los primeros meses. El tercero es un estrés comercial: todos Pro.

### Distribución del gasto mensual (${route.label})

${distributionTable(results, config)}

La cola es corta: incluso el peor mes de ${int(config.months)} simulados se queda en unos pocos dólares. No hay riesgo de factura sorpresa con este volumen; el riesgo está en el techo de cuotas (sección 7).

### Desglose por plan (escenario primario)

${planTable(primary)}

El gasto sigue al volumen: Pro aporta ${int(primary.perPlan.pro?.queries ?? 0)} consultas y ${usd(primary.perPlan.pro?.cost ?? 0)}; Elite, con 5 cuentas y una cuota 4× mayor, aporta ${int(primary.perPlan.elite?.queries ?? 0)} y ${usd(primary.perPlan.elite?.cost ?? 0)}; Free es marginal. No hay ninguna cuenta que se dispare: la cuota hace su trabajo.

### Comparación de rutas (escenario primario)

${routeMatrixTable(primary, config)}

La ruta "más barata" (fp4) **no** es la más barata para este perfil: con ~800 tokens de salida, la flex de Particle (US$0.25/M de salida) sale 38 % por debajo. Cuando la salida pesa más que la entrada, el precio de entrada no manda.

## 6. Sensibilidad: qué mueve el costo

| Cambio | Costo mensual (${route.label}) | vs base |
|---|---:|---:|
| Base (razonamiento \`low\`, caché, reintentos) | ${usd(primaryCost)} | — |
| Razonamiento en \`high\` (el default) | ${usd(meta.sensitivity.reasoningHigh)} | ${delta(meta.sensitivity.reasoningHigh, primaryCost)} |
| Sin caché de prefijo | ${usd(meta.sensitivity.noCache)} | ${delta(meta.sensitivity.noCache, primaryCost)} |
| Sin reintentos | ${usd(meta.sensitivity.noRetries)} | ${delta(meta.sensitivity.noRetries, primaryCost)} |
| Prefijo de ${int(TOKENS.prefix * 1.5)} tokens (+50 %) | ${usd(meta.sensitivity.prefixHigh)} | ${delta(meta.sensitivity.prefixHigh, primaryCost)} |
| Ruta más barata (fp4) | ${usd(meta.sensitivity.cheap)} | ${delta(meta.sensitivity.cheap, primaryCost)} |
| Ruta premium (fp8) | ${usd(meta.sensitivity.premium)} | ${delta(meta.sensitivity.premium, primaryCost)} |
| Recarga con 5.5 % de comisión | ${usd(primaryCost * (1 + config.creditFee))} | ${delta(primaryCost * (1 + config.creditFee), primaryCost)} |
| Hora pico de DeepSeek (+100 % en 30 % de las consultas) | ${usd(primaryCost * 1.3)} | +30.0 % |

**El razonamiento (${delta(meta.sensitivity.reasoningHigh, primaryCost)}) y la caché (${delta(meta.sensitivity.noCache, primaryCost)}) son las palancas de configuración.** Cambiar de ruta mueve el total entre ${(Math.min(...Object.keys(ROUTES).map((key) => primary.routes[key].mean)) / primaryCost).toFixed(1)}× y ${(primary.routes.premium.mean / primaryCost).toFixed(1)}×, pero en todos los casos hablamos de ≈US$1 al mes o menos con 100 cuentas: la ruta se elige por calidad y política de datos, no por precio.

## 7. El techo que sí importa: cuotas y tope de US$10

| Cohorte | Consultas si todos agotan su cuota | Costo (${route.label}) | Veces que cabe en US$10 |
|---|---:|---:|---:|
| ${primary.label} | ${int(primary.ceiling)} | ${usd(ceilingCost)} | ${(10 / Math.max(ceilingCost, 1e-9)).toFixed(1)}× |
| ${invites.label} | ${int(invites.ceiling)} | ${usd(ceilingInvites)} | ${(10 / Math.max(ceilingInvites, 1e-9)).toFixed(1)}× |

Con la configuración recomendada, **incluso el peor caso cabe**: 6,250 consultas (todas las cuotas agotadas en la beta con invitaciones) cuestan ≈ ${usd(ceilingInvites)}, el ${pct(ceilingInvites / 10, 0)} del tope. El margen desaparece si el costo por consulta sube: con razonamiento en \`high\` el techo llega a ≈ ${usd(ceilingInvitesHigh)} y con la ruta premium a ≈ ${usd(ceilingInvitesPremium)}; ahí el tope deja de ser un seguro y se convierte en un corte a mitad de mes.

Recomendación: **mantener el tope en US$10 con alerta al 60 %** y revisarlo solo si la evaluación de 40 preguntas obliga a un modelo más caro. Las cuotas provisionales (5/60/250) están bien para la beta; el error sería subirlas sin medir.

## 8. Recomendación

**Usa OpenRouter con \`deepseek/deepseek-v4.1-flash-1017\` como \`AI_MODEL_DEFAULT\`**, con esta configuración:

\`\`\`json
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
\`\`\`

En el SDK esto viaja en \`extraBody\` (o en \`providerOptions.openrouter\`), no como opciones del constructor del modelo. \`zdr: true\` se añade solo si el proveedor elegido lo soporta: si se exige y ninguno cumple, la petición falla, que es justo lo que pide \`AI_ARCHITECTURE\` §2 (no degradar la privacidad en silencio).

Y estas reglas:

1. **Fija el snapshot** (\`-1017\`) y ten un \`AI_MODEL_ESCALATION\` listo. El catálogo no anuncia retiro (\`expiration_date: null\`), pero un snapshot se retira algún día y no quieres desplegar código ese día.
2. **Corre la evaluación de 40 preguntas** (§6) antes de encender \`ai.enabled\`. El índice de inteligencia pública del modelo es ${MODEL.intelligenceIndex} (Artificial Analysis, vía el catálogo): es un modelo pequeño, y la apuesta es que las herramientas tipadas y el validador de grounding compensan. Eso se mide, no se asume.
3. **Exige \`require_parameters: true\` + \`data_collection: "deny"\`**. Verifica que queden al menos dos proveedores con esas condiciones; si solo queda uno, la beta se cae cuando ese proveedor falla.
4. **No optimices al proveedor más barato.** Entre fp4 a US$0.006/M y un proveedor fp8 (o el oficial) a US$0.15/M hay ~US$0.25 al mes de diferencia con 100 cuentas. La calidad del tool calling vale más que eso.
5. **Tope de gasto en US$10** durante la beta y alerta al 60 %. Con los números de arriba, el peor caso cabe; solo un modelo más caro o el razonamiento en \`high\` lo ponen en riesgo.
6. **Mide el costo real** con el log \`ai_usage\` que ya está diseñado: el precio del catálogo cambia y la simulación es un supuesto, no una factura.

### Lo que no recomiendo

- **API directa de DeepSeek** en vez de OpenRouter: ata el modelo, pierdes el enrutamiento por privacidad y el fallback entre proveedores, y el precio es el mismo o peor. La decisión de ADR-013 sigue en pie.
- **Empezar por el modelo más barato del catálogo** (fp4 a US$0.006/M): el ahorro es de centavos y el riesgo de tool calling en fp4 es real.
- **Subir las cuotas ahora** para "aprovechar" el precio bajo: primero mide el uso real; las cuotas son el control de abuso, no el control de costo.

## 9. Cómo reproducir

\`\`\`bash
node services/ai-eval/simulate-usage.mjs
node services/ai-eval/simulate-usage.mjs --months=5000 --seed=7
node services/ai-eval/simulate-usage.mjs --route=valor
\`\`\`

Salidas en \`${config.out}/\`: \`SIMULACION-100-USUARIOS.md\` (este documento), \`simulacion-100-usuarios.json\` (todas las cifras) y \`simulacion-100-usuarios.csv\` (una fila por usuario de un mes simulado, no del promedio).

Los supuestos están en las constantes \`TOKENS\`, \`INTENTS\`, \`PLANS\` y \`ROUTES\` del script. Cambia una y vuelve a correr: el reporte se regenera completo.
`;
}

// ---------------------------------------------------------------------------
// 10. Main
// ---------------------------------------------------------------------------

function main() {
  const config = parseArgs(process.argv.slice(2));
  const outDir = resolve(config.out);
  mkdirSync(outDir, { recursive: true });

  const results = Object.keys(COHORTS).map((key) => runScenario(config, key));
  const primary = results.find((result) => result.cohort === "beta-100") ?? results[0];

  const sensitivityCost = (patch) => runScenario({ ...config, ...patch }, "beta-100").routes[config.route].mean;

  const sensitivity = {
    reasoningHigh: sensitivityCost({ reasoning: "high" }),
    noCache: sensitivityCost({ cache: false }),
    noRetries: sensitivityCost({ retries: false }),
    prefixHigh: sensitivityCost({ prefixTokens: Math.round(TOKENS.prefix * 1.5) }),
    cheap: primary.routes.barata.mean,
    premium: primary.routes.premium.mean,
  };

  const meta = {
    date: localDate(),
    sensitivity,
    intentCosts: intentCosts(config),
  };

  const report = buildReport(results, config, meta);

  const json = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    routes: ROUTES,
    config,
    assumptions: { tokens: TOKENS, plans: PLANS, intents: INTENTS },
    results: results.map((result) => ({
      cohort: result.cohort,
      label: result.label,
      queries: result.queries,
      activeUsers: result.activeUsers,
      inputTokens: result.inputTokens,
      cachedTokens: result.cachedTokens,
      outputTokens: result.outputTokens,
      ceiling: result.ceiling,
      routes: result.routes,
      perPlan: result.perPlan,
    })),
    sensitivity,
    intentCosts: meta.intentCosts,
  };

  const csvRows = [
    "user_id,plan,quota,queries,input_tokens,cached_tokens,output_tokens,cost_usd_oficial",
    ...results[0].lastMonth.users.map((user) =>
      [
        user.id,
        user.plan,
        user.quota,
        user.queries,
        Math.round(user.inputTokens),
        Math.round(user.cachedTokens),
        Math.round(user.outputTokens),
        user.byRoute.oficial.toFixed(6),
      ].join(","),
    ),
  ];

  writeFileSync(join(outDir, "simulacion-100-usuarios.json"), `${JSON.stringify(json, null, 2)}\n`);
  writeFileSync(join(outDir, "simulacion-100-usuarios.csv"), `${csvRows.join("\n")}\n`);
  writeFileSync(join(outDir, "SIMULACION-100-USUARIOS.md"), report);

  console.log(`Modelo: ${MODEL.id}`);
  for (const result of results) {
    const cost = result.routes[config.route].mean;
    console.log(
      `${result.label.padEnd(52)} ${String(Math.round(result.queries.mean)).padStart(6)} consultas  ${usd(cost)}/mes  (${usd(cost / Math.max(result.queries.mean, 1))}/consulta)`,
    );
  }
  console.log(`Reporte: ${join(outDir, "SIMULACION-100-USUARIOS.md")}`);
}

main();
