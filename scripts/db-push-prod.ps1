$ErrorActionPreference = "Stop"

$ROOT_DIR = Split-Path -Parent $PSScriptRoot
if (-not $ROOT_DIR) { $ROOT_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path) }

# Load PROD_DB_URL from root .env
$envFile = Join-Path $ROOT_DIR ".env"
$PROD_DB_URL = ""
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^PROD_DB_URL=(.+)$") {
            $PROD_DB_URL = $matches[1]
        }
    }
}

if (-not $PROD_DB_URL) {
    Write-Host "ERROR: PROD_DB_URL not found in .env" -ForegroundColor Red
    exit 1
}

# Mask the URL for display
$MASKED_URL = $PROD_DB_URL -replace "://[^@]*@", "://***@"

Write-Host ""
Write-Host "=== PRODUCTION DATABASE PUSH ===" -ForegroundColor Yellow
Write-Host "Target: $MASKED_URL"
Write-Host ""
Write-Host "This will push the current Drizzle schema to the PRODUCTION database."
Write-Host "Changes are applied directly (no migration files)."
Write-Host ""

$confirm = Read-Host "Are you sure? (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "Aborted."
    exit 0
}

Write-Host ""
Write-Host "Pushing schema to production..." -ForegroundColor Cyan

$env:DATABASE_URL = $PROD_DB_URL
Push-Location (Join-Path $ROOT_DIR "packages\shared")
try {
    npx drizzle-kit push
} finally {
    Pop-Location
    Remove-Item Env:\DATABASE_URL
}

Write-Host ""
Write-Host "Done! Schema pushed to production." -ForegroundColor Green
