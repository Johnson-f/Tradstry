# Google Calendar Integration - Cron Configuration

## Overview

The Google Calendar integration includes a cron endpoint for automatic synchronization of external calendar events. This endpoint is designed to be called by an external cron service to keep calendar events up-to-date.

## Endpoint Details

- **URL**: `POST /api/notebook/calendar/sync-all`
- **Authentication**: Requires `X-Cron-Secret` header
- **Purpose**: Syncs all active Google Calendar connections for all users

## Environment Variables

Add these to your backend `.env` file:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback/google

# Cron Security
CRON_SECRET=your_secure_random_string_here
```

## Cron Job Setup

### Using a Cron Service (Recommended)

You can use any cron service like:
- **GitHub Actions** (free for public repos)
- **Cron-job.org** (free tier available)
- **EasyCron** (paid service)
- **Your own server** with crontab

### Example Cron Job Configuration

#### GitHub Actions (`.github/workflows/sync-calendars.yml`)

```yaml
name: Sync Calendar Events
on:
  schedule:
    - cron: '0 * * * *'  # Every hour
  workflow_dispatch:  # Allow manual trigger

jobs:
  sync-calendars:
    runs-on: ubuntu-latest
    steps:
      - name: Sync Calendar Events
        run: |
          curl -X POST \
            -H "X-Cron-Secret: ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json" \
            https://your-backend-url.com/api/notebook/calendar/sync-all
```

#### Crontab (Linux/Mac)

```bash
# Add to crontab: crontab -e
0 * * * * curl -X POST -H "X-Cron-Secret: your_cron_secret" -H "Content-Type: application/json" https://your-backend-url.com/api/notebook/calendar/sync-all
```

#### Cron-job.org Configuration

1. Go to [cron-job.org](https://cron-job.org)
2. Create a new cron job
3. Set URL: `https://your-backend-url.com/api/notebook/calendar/sync-all`
4. Set method: `POST`
5. Add header: `X-Cron-Secret: your_cron_secret`
6. Set schedule: Every hour (`0 * * * *`)

## Response Format

The endpoint returns sync statistics:

```json
{
  "success": true,
  "total_synced": 150,
  "success_count": 25,
  "failure_count": 2
}
```

## Security Considerations

1. **Cron Secret**: Use a strong, random string for `CRON_SECRET`
2. **HTTPS**: Always use HTTPS for the cron endpoint
3. **Rate Limiting**: The endpoint includes built-in rate limiting
4. **Error Handling**: Failed syncs are logged but don't stop the process

## Monitoring

The endpoint logs:
- Total events synced
- Success/failure counts
- Individual connection errors
- Performance metrics

## Troubleshooting

### Common Issues

1. **401 Unauthorized**: Check `CRON_SECRET` header
2. **500 Internal Server Error**: Check Google OAuth credentials
3. **No events synced**: Verify user connections are active

### Manual Testing

Test the endpoint manually:

```bash
curl -X POST \
  -H "X-Cron-Secret: your_cron_secret" \
  -H "Content-Type: application/json" \
  https://your-backend-url.com/api/notebook/calendar/sync-all
```

## Frequency Recommendations

- **Production**: Every hour (`0 * * * *`)
- **Development**: Every 6 hours (`0 */6 * * *`)
- **Testing**: Manual trigger only

## Cost Considerations

- Google Calendar API has quotas
- Each sync counts against API limits
- Consider user activity patterns for optimization
