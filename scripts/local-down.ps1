param(
  [switch]$SkipDocker,
  [switch]$SkipPorts
)

$ErrorActionPreference = "Stop"

function Stop-ListeningProcess {
  param([int]$Port)

  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $connections) {
    return
  }

  $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $pids) {
    try {
      $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
      if ($proc) {
        Write-Host ([string]::Format("Stopping process on port {0} - {1} ({2})", $Port, $proc.ProcessName, $procId)) -ForegroundColor Yellow
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      }
    } catch {
    }
  }
}

if (-not $SkipPorts) {
  Write-Host "Stopping local dev processes on ports 5173, 3002, 3001..." -ForegroundColor Cyan
  Stop-ListeningProcess -Port 5173
  Stop-ListeningProcess -Port 3002
  Stop-ListeningProcess -Port 3001
}

if (-not $SkipDocker) {
  Write-Host "Stopping Docker services..." -ForegroundColor Cyan
  docker compose down

  # Remove zero-cache replica volume so next local:up rebuilds fresh
  try {
    $volumeName = (docker volume ls -q --filter "name=zero-data" 2>&1) | Where-Object { $_ -match "zero-data" }
    if ($volumeName) {
      Write-Host "Removing zero-cache replica volume..." -ForegroundColor Cyan
      docker volume rm $volumeName 2>&1 | Out-Null
    }
  } catch {}
}

Write-Host "Local development services stopped." -ForegroundColor Green
