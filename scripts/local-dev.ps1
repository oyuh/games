param(
  [switch]$SkipDocker,
  [switch]$SkipDbPush,
  [switch]$SkipDev,
  [switch]$SkipPorts,
  [switch]$PreserveDbData
)

$ErrorActionPreference = "Stop"
$ROOT_DIR = Split-Path -Parent $PSScriptRoot
$DEV_PORTS = @(5173, 3002, 3001)

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

function Stop-ListeningProcess {
  param([int]$Port)

  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $connections) {
    return
  }

  $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $pids) {
    if ($procId -eq $PID) {
      continue
    }

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

function Stop-DevPorts {
  Write-Host "Clearing local dev ports 5173, 3002, 3001..." -ForegroundColor Cyan
  foreach ($port in $DEV_PORTS) {
    Stop-ListeningProcess -Port $port
  }
}

function Get-DotEnvValue {
  param([string]$Name)

  $envFile = Join-Path $ROOT_DIR ".env"
  if (-not (Test-Path $envFile)) {
    return $null
  }

  foreach ($line in Get-Content $envFile) {
    if ($line -match "^\s*$Name\s*=\s*(.+?)\s*$") {
      return ($matches[1] -replace '^["'']|["'']$', "")
    }
  }

  return $null
}

function Test-LocalDatabaseUrl {
  param([string]$DatabaseUrl)

  if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    return $true
  }

  try {
    $uri = [System.Uri]$DatabaseUrl
    return @("localhost", "127.0.0.1", "::1").Contains($uri.Host)
  } catch {
    return $false
  }
}

function Invoke-LocalDbPush {
  $databaseUrl = $env:DATABASE_URL
  if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    $databaseUrl = Get-DotEnvValue -Name "DATABASE_URL"
  }

  $sharedDir = Join-Path $ROOT_DIR "packages\shared"
  if ((-not $PreserveDbData) -and (Test-LocalDatabaseUrl -DatabaseUrl $databaseUrl)) {
    Write-Host "Auto-approving local Drizzle data-loss prompts." -ForegroundColor Yellow
    Push-Location $sharedDir
    try {
      bun run drizzle-kit push --force
    } finally {
      Pop-Location
    }
    return
  }

  if (-not (Test-LocalDatabaseUrl -DatabaseUrl $databaseUrl)) {
    throw "DATABASE_URL does not point at a local database. Refusing to auto-approve schema changes. Run 'bun db:push' manually or rerun local-dev with -SkipDbPush."
  }

  bun db:push
}

Write-Host "Checking required tools..." -ForegroundColor Cyan
if (-not $SkipDocker) {
  Assert-CommandAvailable -CommandName "docker"
}
if ((-not $SkipDbPush) -or (-not $SkipDev)) {
  Assert-CommandAvailable -CommandName "bun"
}

if ((-not $SkipDev) -and (-not $SkipPorts)) {
  Stop-DevPorts
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
  Invoke-LocalDbPush
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
  bun dev
}
