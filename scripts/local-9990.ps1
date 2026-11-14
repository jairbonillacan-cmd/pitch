# PitchLab en http://localhost:9990 con cuentas reales sobre la rama de prueba `local-9990`
# de Neon (copia aparte: nada de lo que hagas aquí toca producción).
#
#   powershell -ExecutionPolicy Bypass -File scripts/local-9990.ps1          -> desarrollo (recarga al guardar)
#   powershell -ExecutionPolicy Bypass -File scripts/local-9990.ps1 -Prod    -> build de producción ya compilado
#
# - La cadena de conexión se pide a la CLI de Neon en cada arranque y nunca se imprime.
# - El secreto de Better Auth y NEON_PROJECT_ID viven en `.env.9990.local` (ignorado por git).
# - Sin Resend, el enlace para entrar se escribe en la consola y en `.local/9990.log` con ACL privada.
# - -Prod necesita compilar antes:
#   $env:PITCHLAB_DIST_DIR='.next-9990'; pnpm --filter @pitchlab/web exec next build
param([switch]$Prod)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env.9990.local'

function New-RandomHexSecret {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

if (-not (Test-Path $envFile)) {
  $authSecret = New-RandomHexSecret
  $cookieSecret = New-RandomHexSecret
  Set-Content -Path $envFile -Encoding ascii -Value @(
    '# Solo para localhost:9990. Define NEON_PROJECT_ID=<id-de-tu-proyecto-neon> aqui o en tu entorno.',
    "BETTER_AUTH_SECRET=$authSecret",
    "PITCHLAB_COOKIE_SECRET=$cookieSecret"
  )
}
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') {
    Set-Item -Path ("Env:" + $Matches[1]) -Value $Matches[2]
  }
}

$projectId = "$env:NEON_PROJECT_ID".Trim()
$dbName = if ("$env:NEON_DATABASE_NAME".Trim()) { "$env:NEON_DATABASE_NAME".Trim() } else { 'neondb' }
if (-not $projectId) {
  throw 'Define NEON_PROJECT_ID en tu entorno o en .env.9990.local antes de iniciar local-9990.'
}

$cadena = (neon connection-string local-9990 --project-id $projectId --database-name $dbName --pooled | Out-String).Trim()
if (-not $cadena.StartsWith('postgres')) {
  throw 'Neon no devolvio la cadena de la rama local-9990. Revisa que sigas con sesion (neon login).'
}
$env:DATABASE_URL = $cadena
$env:BETTER_AUTH_URL = 'http://localhost:9990'
if (-not "$env:PITCHLAB_BETA_CODE".Trim()) {
  $env:PITCHLAB_BETA_CODE = '2026'
}
if (-not "$env:PITCHLAB_COOKIE_SECRET".Trim()) {
  $env:PITCHLAB_COOKIE_SECRET = New-RandomHexSecret
}

$logDir = Join-Path $root '.local'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir '9990.log'
Set-Content -Path $log -Value '' -Encoding utf8
# Restringe lectura de .local y 9990.log al usuario actual en Windows.
if ($env:USERNAME) {
  & icacls $logDir /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" | Out-Null
  & icacls $log /inheritance:r /grant:r "$($env:USERNAME):F" | Out-Null
}
# Texto plano UTF-8 en el archivo (sin colores) para lectura local autorizada.
$env:NO_COLOR = '1'
$env:FORCE_COLOR = '0'
function Write-Log {
  process {
    $line = "$_"
    Write-Host $line
    Add-Content -Path $log -Value $line -Encoding utf8
  }
}

Set-Location $root
# Con 'Stop', Windows PowerShell 5.1 convierte cualquier línea de stderr (p. ej. un aviso de
# webpack) en error fatal y tumba el servidor.
$ErrorActionPreference = 'Continue'
if ($Prod) {
  $env:PITCHLAB_DIST_DIR = '.next-9990'
  Write-Host 'PitchLab (build de produccion) en http://localhost:9990 con cuentas de prueba.'
  pnpm --filter '@pitchlab/web' exec next start --port 9990 2>&1 | Write-Log
} else {
  # Carpeta propia: otro servidor de desarrollo en este repo usa .next y se pisarian.
  $env:PITCHLAB_DIST_DIR = '.next-9990-dev'
  Write-Host 'PitchLab (desarrollo, recarga al guardar) en http://localhost:9990 con cuentas de prueba.'
  pnpm --filter '@pitchlab/web' exec next dev --port 9990 2>&1 | Write-Log
}
