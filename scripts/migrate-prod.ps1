# Revisa y aplica las migraciones pendientes de packages/db/migrations en PRODUCCIÓN (rama `main` de Neon).
# La cadena de conexión nunca se imprime y se borra al terminar.
#   powershell -ExecutionPolicy Bypass -File scripts/migrate-prod.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cadena = (neon connection-string main --project-id lively-cloud-08121218 --database-name neondb | Out-String).Trim()
if (-not $cadena.StartsWith('postgres')) {
  throw 'Neon no devolvio la cadena de la rama main. Revisa que sigas con sesion (neon login).'
}

$checkScript = @'
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import postgres from "postgres";

const journal = JSON.parse(readFileSync("./migrations/meta/_journal.json", "utf8"));
const sqlFiles = readdirSync("./migrations").filter((f) => f.endsWith(".sql")).sort();
const entries = journal.entries.map((entry) => {
  const file = `${entry.tag}.sql`;
  const body = readFileSync(`./migrations/${file}`, "utf8");
  return {
    tag: entry.tag,
    when: Number(entry.when),
    hash: createHash("sha256").update(body).digest("hex"),
  };
});
const unindexed = sqlFiles
  .map((f) => f.replace(/\.sql$/, ""))
  .filter((tag) => !entries.some((e) => e.tag === tag));

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  let rows = [];
  try {
    rows = await sql.begin("read only", (tx) =>
      tx.unsafe('SELECT hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC'),
    );
  } catch (err) {
    if (!err || err.code !== "42P01") throw err;
  }
  const lastWhen = rows.length > 0 ? Number(rows[0].created_at) : null;
  const appliedHashes = new Set(rows.map((r) => r.hash));
  const pending = entries
    .filter((e) => (lastWhen === null ? !appliedHashes.has(e.hash) : e.when > lastWhen))
    .map((e) => e.tag);
  console.log(JSON.stringify({ appliedCount: rows.length, pending, unindexed }));
} finally {
  await sql.end({ timeout: 5 });
}
'@

Set-Location $root
$env:DATABASE_URL = $cadena
try {
  $salidaJson = ($checkScript | pnpm --filter '@pitchlab/db' exec node --input-type=module - | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw 'No se pudieron consultar las migraciones actuales en la rama main.'
  }
  $lineaJson = ($salidaJson -split "`r?`n" | Where-Object { $_.Trim().StartsWith('{') } | Select-Object -Last 1)
  if (-not $lineaJson) {
    throw 'Respuesta inesperada al revisar las migraciones de produccion.'
  }
  $estado = $lineaJson | ConvertFrom-Json
  if ($estado.unindexed.Count -gt 0) {
    Write-Host 'Atencion: archivos SQL fuera de _journal.json:' -ForegroundColor Yellow
    foreach ($u in $estado.unindexed) { Write-Host "  - $u" -ForegroundColor Yellow }
  }
  if ($estado.pending.Count -eq 0) {
    Write-Host 'Produccion (rama main) ya esta al dia: no faltan migraciones.' -ForegroundColor Green
    return
  }

  Write-Host ''
  Write-Host "Migraciones pendientes en produccion (rama main) [$($estado.pending.Count)]:" -ForegroundColor Cyan
  foreach ($m in $estado.pending) {
    Write-Host "  - $m"
  }
  Write-Host ''
  $confirmacion = Read-Host 'Escribe MIGRAR (en mayusculas) para aplicarlas en produccion'
  if ($confirmacion -cne 'MIGRAR') {
    Write-Host 'Cancelado. No se aplico ningun cambio en produccion.' -ForegroundColor Yellow
    return
  }

  pnpm --filter '@pitchlab/db' migrate
  if ($LASTEXITCODE -ne 0) { throw 'La migracion en produccion fallo (mira el mensaje de arriba).' }
  Write-Host 'Migraciones aplicadas en produccion (rama main).' -ForegroundColor Green
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
