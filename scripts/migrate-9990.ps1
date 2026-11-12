# Aplica las migraciones de packages/db/migrations SOLO a la rama de prueba `local-9990` de Neon.
# Producción (rama main) se migra aparte, al desplegar. La cadena nunca se imprime.
#   powershell -ExecutionPolicy Bypass -File scripts/migrate-9990.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cadena = (neon connection-string local-9990 --project-id lively-cloud-08121218 --database-name neondb | Out-String).Trim()
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
