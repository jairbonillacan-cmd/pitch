/**
 * Reporte legible del dataset de native-stats.
 *
 * El reporte es la parte que se puede revisar sin abrir el JSONL: dice qué se agregó,
 * cuánto cubre y —sobre todo— qué no coincide con el corpus. Un reporte que solo
 * presumiera cobertura no serviría para decidir nada.
 */
import type { NativeStatsManifest } from "./schema.js";

function percent(part: number, total: number): string {
  if (total === 0) return "—";
  return `${((part / total) * 100).toFixed(1)} %`;
}

export function renderNativeStatsReport(manifest: NativeStatsManifest): string {
  const lines: string[] = [];
  const generated = manifest.generatedAt.slice(0, 16).replace("T", " ");
  const { totals } = manifest;

  lines.push("# Enriquecimiento desde native-stats.org");
  lines.push("");
  lines.push(
    "> Fuente raspada solo para investigación. `native-stats.org` no publica licencia y sus",
  );
  lines.push(
    "> datos derivan de football-data.org, así que este dataset **no se publica ni se",
  );
  lines.push(
    "> redistribuye** y vive en `data/history/research/native-stats/` junto al resto de",
  );
  lines.push("> material research-only.");
  lines.push("");
  lines.push(`- **Generado:** ${generated} UTC`);
  lines.push(`- **datasetId:** \`${manifest.datasetId}\``);
  lines.push(
    `- **Corpus de referencia:** ${manifest.corpus.rows} partidos, datasetId \`${manifest.corpus.datasetId ?? "desconocido"}\``,
  );
  lines.push(
    `- **Páginas:** ${manifest.source.pagesRetrieved} descargadas y ${manifest.source.pagesCached} de caché (${(manifest.source.bytes / 1024 / 1024).toFixed(1)} MB)`,
  );
  lines.push(
    `- **robots.txt:** ${manifest.source.robotsAllowsCrawl ? "permite el rastreo" : "prohíbe el rastreo"}`,
  );
  lines.push("");

  lines.push("## 1. Qué se agregó");
  lines.push("");
  lines.push("| Aporte | Por qué no se podía derivar del corpus | Estado |");
  lines.push("|---|---|---|");
  lines.push(
    `| Marcador al descanso | openfootball publica solo el resultado final; sin descanso no hay mercados de 1T ni HT/FT | ${totals.halfTimeCaptured} capturados, ${totals.halfTimeAdded} ya emparejados con el corpus |`,
  );
  lines.push(
    `| Percentiles de gol en 1T y 2T (cFHG / cSHG) | requieren la distribución de goles por mitad, que no tenemos | ${totals.formRows} partidos del día |`,
  );
  lines.push(
    `| Agregados de carrera por competición | incluyen temporadas anteriores a 2010-11, fuera del corpus | ${totals.teams} equipos leídos |`,
  );
  lines.push(
    `| Récords de racha de la competición | contexto histórico y poseedor del récord | ${totals.matchedTeams} equipos emparejados |`,
  );
  lines.push(
    "| Auditoría de completitud de la temporada en curso | la fuente declara cuántos partidos jugó cada equipo y el corpus se puede medir contra eso | ver §3 |",
  );
  lines.push("");

  lines.push("## 2. Cobertura por liga");
  lines.push("");
  lines.push(
    "| Liga | Comp. | Equipos | Emparejados | Partidos leídos | Emparejados | Marcador OK | Descanso | Forma |",
  );
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const league of manifest.leagues) {
    lines.push(
      `| ${league.id} | ${league.competitionCode} | ${league.teams} | ${league.matchedTeams} (${percent(league.matchedTeams, league.teams)}) | ${league.matches} | ${league.joinedMatches} | ${league.scoreConfirmed} | ${league.halfTimeCaptured} | ${league.formRows} |`,
    );
  }
  lines.push("");

  lines.push("## 3. Completitud del corpus frente a la fuente");
  lines.push("");
  lines.push(
    "La fuente publica cuántos partidos lleva jugados cada equipo en la temporada en curso. Comparado con lo que el corpus tiene para ese equipo sale un hueco medido, no una impresión: es la lista de trabajo para actualizar la base de datos.",
  );
  lines.push("");
  lines.push("| Liga | Temporada | Equipos medidos | Equipos atrás | Apariciones faltantes |");
  lines.push("|---|---|---:|---:|---:|");
  for (const league of manifest.leagues) {
    const coverage = league.corpusCoverage;
    lines.push(
      `| ${league.id} | ${coverage.seasonLabel ?? "—"} | ${coverage.teamsMeasured} | ${coverage.teamsBehind} | ${coverage.missingTeamAppearances} |`,
    );
  }
  lines.push("");
  if (totals.teamsBehind === 0) {
    lines.push(
      "El corpus está al día con la fuente en todos los equipos medidos de la temporada en curso.",
    );
  } else {
    lines.push(
      `**${totals.teamsBehind} equipos tienen menos partidos que los que la fuente declara jugados**: ${totals.missingTeamAppearances} apariciones faltantes, aproximadamente ${totals.approximateMissingMatches} partidos (cada partido cuenta para dos equipos).`,
    );
    lines.push("");
    lines.push("| Liga | Equipo | Partidos en la fuente | En el corpus | Faltan |");
    lines.push("|---|---|---:|---:|---:|");
    for (const league of manifest.leagues) {
      for (const gap of league.corpusCoverage.gaps.slice(0, 5)) {
        lines.push(
          `| ${league.id} | ${gap.teamId} | ${gap.nativePlayed} | ${gap.corpusPlayed} | ${gap.missing} |`,
        );
      }
    }
  }
  lines.push("");
  lines.push(
    "Causa habitual: el archivo de la temporada en curso todavía no incluye las últimas jornadas. La actualización se hace en el pipeline de ingesta, no aquí.",
  );
  lines.push("");

  lines.push("## 4. Cotejo de rachas contra el corpus");
  lines.push("");
  lines.push(
    "Se recalcula desde nuestros resultados la misma racha vigente que publica la fuente. Solo se compara cuando el corpus tiene la misma cantidad de partidos de la temporada: si va por detrás, la diferencia no es un error de definición.",
  );
  lines.push("");
  lines.push("| Liga | Comparadas | Coinciden | No coinciden | No comparables |");
  lines.push("|---|---:|---:|---:|---:|");
  for (const league of manifest.leagues) {
    const checks = league.streakChecks;
    lines.push(
      `| ${league.id} | ${checks.compared} | ${checks.agree} (${percent(checks.agree, checks.compared)}) | ${checks.disagree} | ${checks.notComparable} |`,
    );
  }
  lines.push("");

  const disagreements = manifest.leagues.flatMap((league) =>
    league.streakChecks.disagreements.map((check) => ({ league: league.id, ...check })),
  );
  if (totals.streakChecksCompared === 0) {
    lines.push(
      "En esta corrida no hubo rachas comparables: el corpus va por detrás de la fuente en todos los equipos medidos (§3), así que la comparación no puede concluir nada — ni a favor ni en contra.",
    );
  } else if (disagreements.length === 0) {
    lines.push(
      "Sin discrepancias entre las rachas comparadas: el corpus reproduce lo que publica la fuente en esta muestra.",
    );
  } else {
    lines.push("### Discrepancias a revisar");
    lines.push("");
    lines.push("| Liga | Equipo | Racha | Fuente | Corpus | Detalle |");
    lines.push("|---|---|---|---:|---:|---|");
    for (const check of disagreements.slice(0, 20)) {
      lines.push(
        `| ${check.league} | ${check.teamId} | ${check.key} | ${check.native ?? "—"} | ${check.corpus ?? "—"} | ${check.reason ?? ""} |`,
      );
    }
  }
  lines.push("");

  const unmatched = manifest.leagues.filter((league) => league.unmatchedNames.length > 0);
  lines.push("## 5. Nombres sin emparejar (curación pendiente)");
  lines.push("");
  if (unmatched.length === 0) {
    lines.push("Todos los nombres de la muestra resolvieron a un id del histórico.");
  } else {
    for (const league of unmatched) {
      lines.push(`- **${league.id}:** ${league.unmatchedNames.map((name) => `\`${name}\``).join(", ")}`);
    }
    lines.push("");
    lines.push(
      "Se agregan a `NATIVE_STATS_ALIASES` en `services/ingest/src/history/native-stats/resolve.ts`. No se adivina un id: un emparejamiento silencioso y equivocado contamina el dataset.",
    );
  }
  lines.push("");

  lines.push("## 6. Límites declarados");
  lines.push("");
  for (const note of manifest.notes) lines.push(`- ${note}`);
  lines.push("");
  lines.push("### Cómo se regenera");
  lines.push("");
  lines.push("```bash");
  lines.push("pnpm history:native-stats                 # descarga y reconstruye");
  lines.push("pnpm history:native-stats --offline       # solo caché local (reproducible)");
  lines.push("pnpm history:native-stats --leagues=premier-league --max-matches=5");
  lines.push("```");
  lines.push("");
  lines.push(
    "La captura es secuencial con pausa (`--delay-ms`, 400 ms por defecto) para no castigar un sitio comunitario. Los bytes crudos quedan en `data/history/raw/native-stats/`.",
  );
  lines.push("");

  lines.push("## 7. Resumen");
  lines.push("");
  lines.push("| Métrica | Valor |");
  lines.push("|---|---:|");
  lines.push(`| Ligas | ${totals.leagues} |`);
  lines.push(`| Equipos leídos | ${totals.teams} |`);
  lines.push(`| Equipos emparejados | ${totals.matchedTeams} |`);
  lines.push(`| Partidos leídos | ${totals.matches} |`);
  lines.push(`| Descansos capturados | ${totals.halfTimeCaptured} |`);
  lines.push(`| Descansos nuevos para el corpus | ${totals.halfTimeAdded} |`);
  lines.push(`| Partidos con forma avanzada | ${totals.formRows} |`);
  lines.push(`| Equipos con el corpus atrasado | ${totals.teamsBehind} |`);
  lines.push(`| Partidos faltantes en la temporada (aprox.) | ${totals.approximateMissingMatches} |`);
  lines.push(`| Rachas comparadas | ${totals.streakChecksCompared} |`);
  lines.push(`| Rachas que no coinciden | ${totals.streakChecksDisagreed} |`);
  lines.push("");

  return lines.join("\n");
}
