/**
 * Reporte legible del dataset de investigación (cuotas y estadísticas).
 */
import type { ResearchManifest } from "./research-schema.js";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function renderOddsReport(manifest: ResearchManifest): string {
  const lines: string[] = [
    "# Dataset de investigación: cuotas de cierre y estadísticas de partido",
    "",
    "> Generado por `services/ingest/history/research`. **Research-only**: no se publica ni se redistribuye.",
    "",
    `- **datasetId:** \`${manifest.datasetId}\``,
    `- **Generado:** ${manifest.generatedAt}`,
    `- **Corpus emparejado:** \`${manifest.corpus.datasetId ?? "sin corpus"}\` (${manifest.corpus.rows.toLocaleString("es-MX")} partidos)`,
    `- **Cobertura de cuotas sobre el corpus:** ${pct(manifest.totals.oddsCoverage)}`,
    "",
    "## Resumen",
    "",
    "| Métrica | Valor |",
    "|---|---:|",
    `| Filas | ${manifest.totals.rows.toLocaleString("es-MX")} |`,
    `| Con cuotas | ${manifest.totals.withOdds.toLocaleString("es-MX")} |`,
    `| Con cuotas de cierre | ${manifest.totals.withClosingOdds.toLocaleString("es-MX")} |`,
    `| Con estadísticas de partido | ${manifest.totals.withStats.toLocaleString("es-MX")} |`,
    `| Emparejadas con el corpus | ${manifest.totals.matchedCorpus.toLocaleString("es-MX")} |`,
    `| Partidos del corpus | ${manifest.totals.corpusRows.toLocaleString("es-MX")} |`,
    "",
    "## Cobertura por liga",
    "",
    "| Liga | Filas | Con cuotas | De cierre | Con stats | Emparejadas | Corpus | Cobertura | Sin mapear | Derivados |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];

  for (const league of manifest.leagues) {
    lines.push(
      `| ${league.id} | ${league.rows} | ${league.withOdds} | ${league.withClosingOdds} | ${league.withStats} | ${league.matchedCorpus} | ${league.corpusRows} | ${pct(league.oddsCoverage)} | ${league.unmatchedNames.length} | ${league.fallbackNames.length} |`,
    );
  }

  lines.push("", "## Temporadas", "");
  for (const league of manifest.leagues) {
    lines.push(
      `### ${league.id}`,
      "",
      "| Temporada | Filas | Con cuotas | Emparejadas |",
      "|---|---:|---:|---:|",
    );
    for (const season of league.seasons) {
      lines.push(`| ${season.season} | ${season.rows} | ${season.withOdds} | ${season.matchedCorpus} |`);
    }
    lines.push("");
  }

  if (manifest.leagues.some((league) => league.unmatchedNames.length > 0)) {
    lines.push("## Nombres sin mapear", "");
    for (const league of manifest.leagues) {
      if (league.unmatchedNames.length === 0) continue;
      lines.push(`- **${league.id}:** ${league.unmatchedNames.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("## Fuentes", "");
  const available = manifest.sources.filter((source) => source.status !== "unavailable");
  const unavailable = manifest.sources.filter((source) => source.status === "unavailable");
  lines.push(
    `Archivos descargados: ${available.length}. No publicados (HTTP 404): ${unavailable.length}.`,
    `Licencia registrada para todo el dataset: **research-only**.`,
    "",
    "## Reglas",
    "",
    "- Las cuotas de cierre (`timing: closing`) existen desde 2020-21; antes se guardan cuotas pre-partido.",
    "- Prioridad de casa: Pinnacle > B365 > promedio; el campo `bookmaker` lo declara en cada fila.",
    "- La probabilidad de mercado se derive sin vig (normalización multiplicativa) en el benchmark.",
    "- Sin cuotas no se inventan precios: la fila queda con `odds: null`.",
    "",
    "## Cómo regenerar",
    "",
    "```bash",
    "pnpm history:odds",
    "pnpm history:odds --offline",
    "pnpm history:odds --leagues=premier-league --seasons=2024-25,2025-26",
    "```",
    "",
  );

  return lines.join("\n");
}
