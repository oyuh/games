param(
  [switch]$SkipDocker,
  [switch]$SkipDbPush,
  [switch]$SkipDev
)

$ErrorActionPreference = "Stop"

function Assert-CommandAvailable {
  param([string]$CommandName)

  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "Required command '$CommandName' is not installed or not on PATH."
  }
}

function Wait-ForPort {
  param(
    [string]$HostName,
    [int]$Port,
    [int]$TimeoutSeconds = 60
  )

  $start = Get-Date
  while ((Get-Date) -lt $start.AddSeconds($TimeoutSeconds)) {
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $async = $client.BeginConnect($HostName, $Port, $null, $null)
      $connected = $async.AsyncWaitHandle.WaitOne(1000, $false)
      if ($connected -and $client.Connected) {
        $client.EndConnect($async)
        $client.Close()
        return
      }
      $client.Close()
    } catch {
    }
    Start-Sleep -Milliseconds 750
  }

  throw "Timed out waiting for $HostName`:$Port"
}

Write-Host "Checking required tools..." -ForegroundColor Cyan
if (-not $SkipDocker) {
  Assert-CommandAvailable -CommandName "docker"
}
if ((-not $SkipDbPush) -or (-not $SkipDev)) {
  Assert-CommandAvailable -CommandName "pnpm"
}

if (-not $SkipDocker) {
  # Start postgres first (zero-cache depends on it)
  Write-Host "Starting Postgres..." -ForegroundColor Cyan
  docker compose up -d postgres

  Write-Host "Waiting for Postgres on localhost:5432..." -ForegroundColor Cyan
  Wait-ForPort -HostName "127.0.0.1" -Port 5432 -TimeoutSeconds 90
}

if (-not $SkipDbPush) {
  Write-Host "Pushing database schema..." -ForegroundColor Cyan
  pnpm db:push
}

if (-not $SkipDocker) {
  # Reset zero-cache so it rebuilds its replica from the latest DB schema.
  # Without this, adding new tables/columns won't be visible to clients.
  Write-Host "Resetting zero-cache replica..." -ForegroundColor Cyan
  try { docker compose stop zero-cache 2>&1 | Out-Null } catch {}
  try { docker compose rm -f zero-cache 2>&1 | Out-Null } catch {}

  # Remove the zero-data volume so the replica rebuilds from scratch
  try {
    $volumeName = (docker volume ls -q --filter "name=zero-data" 2>&1) | Where-Object { $_ -match "zero-data" }
    if ($volumeName) {
      docker volume rm $volumeName 2>&1 | Out-Null
    }
  } catch {}

  Write-Host "Starting zero-cache (fresh replica)..." -ForegroundColor Cyan
  docker compose up -d zero-cache

  Write-Host "Waiting for Zero cache on localhost:4848..." -ForegroundColor Cyan
  Wait-ForPort -HostName "127.0.0.1" -Port 4848 -TimeoutSeconds 90
}

if (-not $SkipDev) {
  Write-Host "Starting local dev servers..." -ForegroundColor Green
  pnpm dev
}
