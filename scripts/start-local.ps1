param(
  [string]$Token = "",
  [int]$Port = 8890,
  [string]$CodexExecutable = "codex.exe"
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$backendRoot = Join-Path $projectRoot "backend"

if (-not $Token) {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $Token = [Convert]::ToBase64String($bytes).Replace("+", "A").Replace("/", "B").TrimEnd("=")
}

$env:CPDEX_BRIDGE_TOKEN = $Token
$env:CPDEX_HOST = "127.0.0.1"
$env:CPDEX_PORT = "$Port"
$env:CPDEX_CODEX_EXECUTABLE = $CodexExecutable

Write-Host "Starting backend on http://127.0.0.1:$Port ..." -ForegroundColor Cyan
Start-Process -FilePath "node" -ArgumentList "src/server.js" -WorkingDirectory $backendRoot

Start-Sleep -Seconds 2
$health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -Method Get

Write-Host "`nBackend health: $($health.data.status)" -ForegroundColor Green
Write-Host "Backend Base URL: http://127.0.0.1:$Port"
Write-Host "Bearer Token: $Token"
Write-Host "Frontend file: $(Join-Path $projectRoot 'frontend\index.html')"
Write-Host "`nOpen frontend and paste Base URL + Token." -ForegroundColor Yellow
