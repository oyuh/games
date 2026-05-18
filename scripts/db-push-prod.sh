#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load PROD_DB_URL from root .env
if [ -f "$ROOT_DIR/.env" ]; then
  PROD_DB_URL=$(grep '^PROD_DB_URL=' "$ROOT_DIR/.env" | cut -d'=' -f2-)
fi

if [ -z "${PROD_DB_URL:-}" ]; then
  echo "ERROR: PROD_DB_URL not found in .env"
  exit 1
fi

# Mask the URL for display (show host only)
MASKED_URL=$(echo "$PROD_DB_URL" | sed 's|://[^@]*@|://***@|')

echo ""
echo "=== PRODUCTION DATABASE PUSH ==="
echo "Target: $MASKED_URL"
echo ""
echo "This will push the current Drizzle schema to the PRODUCTION database."
echo "Changes are applied directly (no migration files)."
echo ""
read -p "Are you sure? (y/N): " confirm

if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "Pushing schema to production..."
cd "$ROOT_DIR/packages/shared"
DATABASE_URL="$PROD_DB_URL" npx drizzle-kit push
echo ""
echo "Done! Schema pushed to production."
