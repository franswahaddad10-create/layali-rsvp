$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $repoRoot 'backend'
$frontendPath = Join-Path $repoRoot 'frontend'

if (-not (Test-Path $backendPath)) {
  Write-Error "Backend folder not found: $backendPath"
  exit 1
}

if (-not (Test-Path $frontendPath)) {
  Write-Error "Frontend folder not found: $frontendPath"
  exit 1
}

Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$backendPath'; npm start"
)

Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$frontendPath'; `$env:DANGEROUSLY_DISABLE_HOST_CHECK='true'; npm start"
)

Write-Host 'Started backend and frontend in separate PowerShell windows.'
Write-Host 'Backend:  http://localhost:5000'
Write-Host 'Frontend: http://localhost:7000'
