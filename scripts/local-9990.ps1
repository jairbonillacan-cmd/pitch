# PitchLab en http://localhost:9990 con cuentas reales sobre la rama de prueba `local-9990`
# de Neon (copia aparte: nada de lo que hagas aquí toca producción).
#
#   powershell -ExecutionPolicy Bypass -File scripts/local-9990.ps1          -> desarrollo (recarga al guardar)
#   powershell -ExecutionPolicy Bypass -File scripts/local-9990.ps1 -Prod    -> build de producción ya compilado
#
# - La cadena de conexión se pide a la CLI de Neon en cada arranque y nunca se imprime.
# - El secreto de Better Auth vive en `.env.9990.local` (ignorado por git); se crea solo.
#   Ahí también puedes poner PITCHLAB_ADMIN_EMAILS, RESEND_API_KEY o las claves de X/Google de prueba.
# - Sin Resend, el enlace para entrar se escribe en la consola y en `.local/9990.log`
#   (cualquier agente puede leerlo: busca la línea que empieza con "[auth]").
# - -Prod necesita compilar antes:
#   $env:PITCHLAB_DIST_DIR='.next-9990'; pnpm --filter @pitchlab/web exec next build
param([switch]$Prod)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env.9990.local'

if (-not (Test-Path $envFile)) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
  Set-Content -Path $envFile -Encoding ascii -Value @(
    '# Solo para localhost:9990. Puedes agregar PITCHLAB_ADMIN_EMAILS=tu@correo.com',
    "BETTER_AUTH_SECRET=$secret"
  )
}
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') {
    Set-Item -Path ("Env:" + $Matches[1]) -Value $Matches[2]
  }
}

$cadena = (neon connection-string local-9990 --project-id lively-cloud-08121218 --database-name neondb --pooled | Out-String).Trim()
if (-not $cadena.StartsWith('postgres')) {
  throw 'Neon no devolvio la cadena de la rama local-9990. Revisa que sigas con sesion (neon login).'
}
$env:DATABASE_URL = $cadena
$env:BETTER_AUTH_URL = 'http://localhost:9990'
$env:PREVIEW_ACCESS_CODE = '2026'
$env:BETA_COOKIE_SECRET = 'local-9990-pitchlab-beta-cookie-secret-32chars!'

$logDir = Join-Path $root '.local'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir '9990.log'
Set-Content -Path $log -Value '' -Encoding utf8
# Texto plano UTF-8 en el archivo (sin colores) para que cualquier agente lo pueda leer.
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
