# Vercel Deployment Guide for Cleanup Route

## ✅ Will Work on Vercel

Your dev cleanup route is **fully compatible** with Vercel! Here's what you need to know:

### Vercel Compatibility
- ✅ Next.js API Routes - Native support
- ✅ Environment Variables - Full support via Vercel dashboard
- ✅ Database Connections - Works with external databases
- ✅ Execution Time Tracking - Added for monitoring
- ✅ Vercel Detection - Automatically detects Vercel environment

## 🚀 Deployment Steps

### 1. Set Environment Variables in Vercel

In your Vercel dashboard:
1. Go to Project Settings → Environment Variables
2. Add the following variables:

```
Variable Name: DEV_CRON_KEY
Value: your-secure-cron-key-here
Environment: Production (or all environments)
```

### 2. Database Configuration

Ensure your database connection string is set in Vercel:
```
Variable Name: DATABASE_URL
Value: your-database-connection-string
Environment: Production
```

### 3. Test the Deployment

After deploying to Vercel, test your endpoints:

**Status Check:**
```bash
curl https://your-app.vercel.app/api/dev
```

**Perform Cleanup:**
```bash
curl -X POST https://your-app.vercel.app/api/dev \
  -H "Authorization: Bearer your-secure-cron-key-here"
```

## 🔄 Cron Job Options for Vercel

Since Vercel doesn't support traditional cron jobs, use one of these options:

### Option 1: Vercel Cron (Recommended - Pro Plan Required)

Create `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/dev",
    "schedule": "0 */6 * * *"
  }]
}
```

### Option 2: GitHub Actions (Free)

Create `.github/workflows/cleanup-cron.yml`:
```yaml
name: Database Cleanup
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:  # Manual trigger

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Cleanup
        run: |
          curl -X POST https://your-app.vercel.app/api/dev \
            -H "Authorization: Bearer ${{ secrets.DEV_CRON_KEY }}" \
            -H "Content-Type: application/json"
```

Add `DEV_CRON_KEY` to your GitHub repository secrets.

### Option 3: External Cron Service

Use services like:
- **cron-job.org** (Free)
- **EasyCron**
- **Zapier** (with webhooks)

Configure them to make POST requests to:
```
URL: https://your-app.vercel.app/api/dev
Headers: Authorization: Bearer your-secure-cron-key-here
Method: POST
```

## 📊 Vercel-Specific Features

Your route now includes:

### Enhanced Logging
- Vercel environment detection: `[production-vercel]`
- Execution time tracking for monitoring
- Region and deployment URL info in responses

### Monitoring Response
```json
{
  "success": true,
  "message": "Expired rows deleted successfully.",
  "timestamp": "2025-09-02T21:45:55.649Z",
  "environment": "production-vercel",
  "processedTables": ["sessions", "imposter", "password", "shadesSignals"],
  "executionTimeMs": 1247,
  "vercelInfo": {
    "region": "iad1",
    "deployment": "your-app.vercel.app"
  }
}
```

## ⚠️ Vercel Limitations to Consider

### Function Timeout Limits
- **Hobby Plan**: 10 seconds max
- **Pro Plan**: 60 seconds max
- **Enterprise**: 900 seconds max

Your cleanup should complete well within these limits.

### Logging
- Console logs are available in Vercel's function logs
- For better monitoring, consider using external logging services

### Cold Starts
- First request after inactivity may be slower
- Subsequent requests are faster due to function warming

## 🔒 Security Best Practices

1. **Always set DEV_CRON_KEY** in production
2. **Use strong, unique tokens** (32+ characters)
3. **Rotate keys periodically**
4. **Monitor function logs** for unauthorized attempts
5. **Consider IP restrictions** if using external cron services

## 🧪 Testing on Vercel

1. Deploy your app to Vercel
2. Set environment variables
3. Test both endpoints:
   - GET: Status check
   - POST: Actual cleanup
4. Check function logs in Vercel dashboard
5. Monitor execution times

Your cleanup route is now **production-ready for Vercel**! 🎉
