/**
 * Reporte legible del dataset histórico (Markdown).
 *
 * Acompaña al manifiesto: el manifiesto es la fuente de verdad para la máquina y este
 * reporte es lo que revisa una persona antes de entrenar o de publicar cifras.
 */
import type { HistoryManifest, QualityIssue } from "./schema.js";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function decimal(value: number): string {
  return value.toFixed(3);
}

function renderIssues(title: string, issues: readonly QualityIssue[]): string[] {
  if (issues.length === 0) return [`### ${title}`, "", "_Ninguno._", ""];
  const lines = [`### ${title}`, ""];
  for (const issue of issues) {
    const league = issue.league ? ` · \`${issue.league}\`` : "";
    lines.push(`- **${issue.code}**${league}: ${issue.message}`);
    if (issue.sample && issue.sample.length > 0) {
      lines.push(`  - ${issue.sample.join(" · ")}`);
    }
  }
  lines.push("");
  return lines;
}

export function renderHistoryReport(manifest: HistoryManifest): string {
  const allIssues = manifest.leagues.flatMap((league) => league.quality.issues);
  const errors = allIssues.filter((issue) => issue.severity === "error");
  const warnings = allIssues.filter((issue) => issue.severity === "warning");
  const infos = allIssues.filter((issue) => issue.severity === "info");

  const availableSources = manifest.sources.filter((source) => source.status !== "unavailable");
  const unavailableSources = manifest.sources.filter((source) => source.status === "unavailable");
  const totalBytes = availableSources.reduce((sum, source) => sum + source.bytes, 0);

  const lines: string[] = [
    "# Dataset histórico de PitchLab — reporte de calidad",
    "",
    "> Generado automáticamente por `services/ingest/history`. No editar a mano.",
    "",
    `- **datasetId:** \`${manifest.datasetId}\``,
    `- **Generado:** ${manifest.generatedAt}`,
    `- **Ventana de fútbol:** ${manifest.window.soccerSeasons.join(", ") || "sin datos"}`,
    `- **Ventana de NFL:** ${manifest.window.nflSeasons.join(", ") || "sin datos"}`,
    `- **Errores / advertencias:** ${manifest.quality.errors} / ${manifest.quality.warnings}`,
    "",
    "## Resumen",
    "",
    "| Métrica | Valor |",
    "|---|---:|",
    `| Ligas | ${manifest.totals.leagues} |`,
    `| Temporadas | ${manifest.totals.seasons} |`,
    `| Partidos jugados | ${manifest.totals.rows.toLocaleString("es-MX")} |`,
    `| Equipos distintos | ${manifest.totals.teams} |`,
    `| Fuentes registradas | ${manifest.totals.sources} |`,
    `| Fuentes disponibles | ${availableSources.length} |`,
    `| Bytes de origen descargados | ${totalBytes.toLocaleString("es-MX")} |`,
    "",
    "## Cobertura por liga",
    "",
    "| Liga | Deporte | Producto | Temporadas | Partidos | Equipos | Primero | Último | Local | Empate | Visita | Media |",
    "|---|---|:--:|---:|---:|---:|---|---|---:|---:|---:|---:|",
  ];

  for (const league of manifest.leagues) {
    const quality = league.quality;
    const seasonsPlayed = quality.seasons.filter((season) => season.rows > 0).length;
    lines.push(
      `| ${league.name} (\`${league.id}\`) | ${league.sport} | ${league.productLeague ? "sí" : "no"} | ${seasonsPlayed} | ${quality.rows.toLocaleString("es-MX")} | ${quality.teams} | ${quality.firstDate ?? "—"} | ${quality.lastDate ?? "—"} | ${pct(quality.rates.homeWin)} | ${pct(quality.rates.draw)} | ${pct(quality.rates.awayWin)} | ${decimal(quality.rates.avgTotalScore)} |`,
    );
  }

  lines.push("", "## Detalle por liga", "");

  for (const league of manifest.leagues) {
    const quality = league.quality;
    lines.push(`### ${league.name} (\`${league.id}\`)`, "");
    lines.push(
      `Archivo: \`${league.file}\` · SHA-256 \`${league.fileSha256.slice(0, 16)}…\` · ${quality.rows.toLocaleString("es-MX")} filas · goles/puntos por partido ${decimal(quality.rates.avgTotalScore)} (local ${decimal(quality.rates.avgHomeScore)}, visita ${decimal(quality.rates.avgAwayScore)}).`,
      "",
      "| Temporada | Partidos | Estado | Primero | Último |",
      "|---|---:|:--:|---|---|",
    );
    for (const season of quality.seasons) {
      lines.push(
        `| ${season.season} | ${season.rows} | ${season.status} | ${season.firstDate ?? "—"} | ${season.lastDate ?? "—"} |`,
      );
    }
    lines.push("");
  }

  lines.push(
    "## Fuentes",
    "",
    "| Proveedor | Licencia | Atribución | Archivos disponibles | Bytes |",
    "|---|---|---|---:|---:|",
  );
  for (const provider of ["nflverse", "openfootball"] as const) {
    const sources = availableSources.filter((source) => source.provider === provider);
    if (sources.length === 0) continue;
    lines.push(
      `| ${provider} | ${sources[0]!.license} | ${sources[0]!.attribution} | ${sources.length} | ${sources.reduce((sum, source) => sum + source.bytes, 0).toLocaleString("es-MX")} |`,
    );
  }
  lines.push("");

  if (unavailableSources.length > 0) {
    lines.push(
      `Archivos no publicados por la fuente (HTTP 404), ${unavailableSources.length} en total: ${unavailableSources
        .map((source) => `\`${source.id}\``)
        .join(", ")}.`,
      "",
    );
  }

  lines.push("## Hallazgos de calidad", "");
  lines.push(...renderIssues("Errores", errors));
  lines.push(...renderIssues("Advertencias", warnings));
  lines.push(...renderIssues("Información", infos));

  lines.push(
    "## Reglas metodológicas",
    "",
    "- Solo entran partidos **jugados** con marcador final; los programados se descartan.",
    "- `availableAt` = fin del día del partido + 24 h. Es el lag conservador de datos que no capturamos en vivo y lo que usan los features as-of.",
    "- La NFL se identifica por **franquicia**, no por ciudad: `STL` y `LA` son `nfl.los-angeles-rams`; `OAK` y `LV` son `nfl.las-vegas-raiders`; `SD` y `LAC` son `nfl.los-angeles-chargers`.",
    "- Las cuotas de cierre de nflverse (`odds`) son **solo para investigación interna** (`usage: research-only`): no se publican ni se redistribuyen.",
    "- El histórico no usa el manifiesto de emblemas: un club relegado conserva su identidad.",
    "",
    "## Cómo regenerar",
    "",
    "```bash",
    "pnpm history                     # todo el catálogo y todas las temporadas",
    "pnpm history --offline           # solo con la caché de data/history/raw",
    "pnpm history --leagues=premier-league,nfl",
    "pnpm history --soccer-seasons=2024-25,2025-26",
    "```",
    "",
  );

  return lines.join("\n");
}
