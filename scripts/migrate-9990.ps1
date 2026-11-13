# Aplica las migraciones de packages/db/migrations SOLO a la rama de prueba `local-9990` de Neon.
# Producción (rama main) se migra aparte, al desplegar. La cadena nunca se imprime.
#   powershell -ExecutionPolicy Bypass -File scripts/migrate-9990.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env.9990.local'
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*(NEON_PROJECT_ID|NEON_DATABASE_NAME)\s*=\s*(.*)$') {
      Set-Item -Path ("Env:" + $Matches[1]) -Value $Matches[2]
    }
  }
}
$projectId = "$env:NEON_PROJECT_ID".Trim()
$dbName = if ("$env:NEON_DATABASE_NAME".Trim()) { "$env:NEON_DATABASE_NAME".Trim() } else { 'neondb' }
if (-not $projectId) {
  throw 'Define NEON_PROJECT_ID en tu entorno o en .env.9990.local antes de migrar local-9990.'
}
$cadena = (neon connection-string local-9990 --project-id $projectId --database-name $dbName | Out-String).Trim()
if (-not $cadena.StartsWith('postgres')) {
  throw 'Neon no devolvio la cadena de la rama local-9990. Revisa que sigas con sesion (neon login).'
}
Set-Location $root
$env:DATABASE_URL = $cadena
try {
  pnpm --filter '@pitchlab/db' migrate
  if ($LASTEXITCODE -ne 0) { throw 'La migracion fallo (mira el mensaje de arriba).' }
  Write-Host 'Migraciones aplicadas en la rama local-9990.' -ForegroundColor Green
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
