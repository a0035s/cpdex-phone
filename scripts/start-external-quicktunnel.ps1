param(
  [string]$Token = "",
  [int]$Port = 8890,
  [string]$CodexExecutable = "codex.exe",
  [switch]$SkipTunnel
)

$ErrorActionPreference = "Stop"

function New-StrongToken {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).Replace("+", "A").Replace("/", "B").TrimEnd("=")
}

function Ensure-Cloudflared([string]$TargetPath) {
  if (Test-Path $TargetPath) {
    return
  }

  $parent = Split-Path -Parent $TargetPath
  if (-not (Test-Path $parent)) {
    New-Item -ItemType Directory -Path $parent | Out-Null
  }

  $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
  Write-Host "Downloading cloudflared from $url" -ForegroundColor Cyan
  Invoke-WebRequest -Uri $url -OutFile $TargetPath
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$backendRoot = Join-Path $projectRoot "backend"
$toolsRoot = Join-Path $projectRoot "tools"
$cloudflaredPath = Join-Path $toolsRoot "cloudflared.exe"

if (-not $Token) {
  $Token = New-StrongToken
}

$env:CPDEX_BRIDGE_TOKEN = $Token
$env:CPDEX_HOST = "127.0.0.1"
$env:CPDEX_PORT = "$Port"
$env:CPDEX_CODEX_EXECUTABLE = $CodexExecutable

$backendProc = $null

try {
  Write-Host "Starting backend on http://127.0.0.1:$Port ..." -ForegroundColor Cyan
  $backendProc = Start-Process -FilePath "node" -ArgumentList "src/server.js" -WorkingDirectory $backendRoot -PassThru
  Start-Sleep -Seconds 2

  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -Method Get
  if ($health.data.status -ne "ok") {
    throw "Backend health check failed."
  }

  Write-Host "`nBackend is ready." -ForegroundColor Green
  Write-Host "Backend Base URL: http://127.0.0.1:$Port"
  Write-Host "Bearer Token: $Token"
  Write-Host "Frontend file: $(Join-Path $projectRoot 'frontend\index.html')"

  if ($SkipTunnel) {
    Write-Host "`nSkipTunnel mode enabled. Tunnel was not started." -ForegroundColor Yellow
    return
  }

  Ensure-Cloudflared -TargetPath $cloudflaredPath

  Write-Host "`nStarting Cloudflare Quick Tunnel..." -ForegroundColor Cyan
  Write-Host "Copy the https://*.trycloudflare.com URL from output below." -ForegroundColor Yellow
  Write-Host "Press Ctrl+C to stop tunnel and backend." -ForegroundColor Yellow
  & $cloudflaredPath tunnel --url "http://127.0.0.1:$Port" --protocol http2
}
finally {
  if ($backendProc -and -not $backendProc.HasExited) {
    Stop-Process -Id $backendProc.Id -Force
  }
}
