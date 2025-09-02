# Cron-Compatible Dev Cleanup Route

The `/api/dev` route has been enhanced to support both local development and cron job usage.

## Environment Configuration

### Development Environment
- Authentication is **optional** but respected if provided
- No bearer token required for basic usage
- Enhanced logging with environment prefixes

### Production Environment
- Authentication is **required** via Bearer token
- Uses `DEV_CRON_KEY` environment variable
- All requests must include `Authorization: Bearer <token>` header

## Environment Variables

Add to your `.env` file:

```bash
# Optional: Dev cron key for authenticated requests
DEV_CRON_KEY=your-secure-dev-cron-key-here
```

## Usage Examples

### Local Development (No Auth)
```bash
# Status check
curl -X GET "http://localhost:3000/api/dev"

# Perform cleanup
curl -X POST "http://localhost:3000/api/dev"
```

### With Authentication (Dev or Production)
```bash
# Status check
curl -X GET "http://localhost:3000/api/dev" \
  -H "Authorization: Bearer your-secure-dev-cron-key-here"

# Perform cleanup
curl -X POST "http://localhost:3000/api/dev" \
  -H "Authorization: Bearer your-secure-dev-cron-key-here"
```

## Cron Job Setup

### Basic Cron Entry
```bash
# Run cleanup every hour
0 * * * * curl -X POST "http://localhost:3000/api/dev" -H "Authorization: Bearer your-secure-dev-cron-key-here" >/dev/null 2>&1

# Run cleanup every 6 hours with logging
0 */6 * * * curl -X POST "http://localhost:3000/api/dev" -H "Authorization: Bearer your-secure-dev-cron-key-here" >> /var/log/cleanup.log 2>&1
```

### Advanced Cron with Error Handling
```bash
# Create a script for better error handling
#!/bin/bash
# cleanup-cron.sh

CLEANUP_URL="http://localhost:3000/api/dev"
CRON_KEY="your-secure-dev-cron-key-here"
LOG_FILE="/var/log/games-cleanup.log"

echo "$(date): Starting cleanup..." >> "$LOG_FILE"

response=$(curl -s -X POST "$CLEANUP_URL" \
  -H "Authorization: Bearer $CRON_KEY" \
  -H "Content-Type: application/json")

if echo "$response" | grep -q '"success":true'; then
    echo "$(date): Cleanup successful - $response" >> "$LOG_FILE"
    exit 0
else
    echo "$(date): Cleanup failed - $response" >> "$LOG_FILE"
    exit 1
fi
```

Then add to crontab:
```bash
# Run cleanup every 4 hours
0 */4 * * * /path/to/cleanup-cron.sh
```

## Response Format

### Success Response
```json
{
  "success": true,
  "message": "Expired rows deleted successfully.",
  "timestamp": "2025-09-02T21:45:55.649Z",
  "environment": "development",
  "processedTables": ["sessions", "imposter", "password", "shadesSignals"]
}
```

### Error Response
```json
{
  "success": false,
  "error": "Unauthorized: Invalid token.",
  "details": "Token mismatch"
}
```

## Security Features

1. **Environment-aware authentication**: Required in production, optional in development
2. **Token validation**: Secure bearer token authentication
3. **Environment isolation**: Clear logging of which environment is being cleaned
4. **Error handling**: Detailed error messages for debugging

## Monitoring

The route includes enhanced logging:
- `[development]` or `[production]` prefixes
- Timestamp logging
- Individual table processing confirmation
- Error details for troubleshooting

## Migration from Original Route

This dev route can serve as a replacement for the original `/api/cleanup` route during development and testing, while maintaining security for production use.
