# Price Alert Push Notifications - Cron Configuration

## Overview

The Price Alert system includes a cron endpoint for automatic checking of price alerts and sending push notifications to users when price thresholds are crossed. This endpoint is designed to be called by an external cron service to keep price alerts up-to-date and notify users in real-time.

## Endpoint Details

- **URL**: `POST /api/price-alerts/check-all`
- **Authentication**: Requires `X-Cron-Secret` header
- **Purpose**: Checks all users' price alerts, updates prices, detects threshold crossings, and sends push notifications

## Environment Variables

Add these to your backend `.env` file:

```env
# Web Push (VAPID) Configuration
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
WEB_PUSH_SUBJECT=mailto:admin@example.com

# Cron Security
CRON_SECRET=your_secure_random_string_here
```

## How It Works

1. **Price Updates**: The endpoint fetches current prices from the external market data API for all symbols in users' price alerts
2. **Alert Detection**: Compares current prices with alert thresholds to detect crossings
3. **Notification Sending**: Sends push notifications to users via Web Push API for triggered alerts
4. **Duplicate Prevention**: Tracks sent notifications to prevent duplicate alerts for the same threshold crossing

## Cron Job Setup

### Using a Cron Service (Recommended)

You can use any cron service like:
- **GitHub Actions** (free for public repos)
- **Cron-job.org** (free tier available)
- **EasyCron** (paid service)
- **Your own server** with crontab

### Recommended Frequency

- **During Market Hours**: Every 1-5 minutes
- **After Market Hours**: Every 15-30 minutes (optional, for pre-market/post-market alerts)

### Example Cron Job Configuration

#### GitHub Actions (`.github/workflows/price-alerts.yml`)

```yaml
name: Check Price Alerts
on:
  schedule:
    - cron: '*/5 * * * 1-5'  # Every 5 minutes, Monday-Friday
  workflow_dispatch:  # Allow manual trigger

jobs:
  check-price-alerts:
    runs-on: ubuntu-latest
    steps:
      - name: Check Price Alerts
        run: |
          curl -X POST \
            -H "X-Cron-Secret: ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json" \
            https://your-backend-url.com/api/price-alerts/check-all
```

#### Crontab (Linux/Mac)

```bash
# Add to crontab: crontab -e
# Check every 5 minutes during market hours (9:30 AM - 4:00 PM ET, Mon-Fri)
*/5 9-16 * * 1-5 curl -X POST -H "X-Cron-Secret: your_cron_secret" -H "Content-Type: application/json" https://your-backend-url.com/api/price-alerts/check-all
```

#### Cron-job.org Configuration

1. Go to [cron-job.org](https://cron-job.org)
2. Create a new cron job
3. Set URL: `https://your-backend-url.com/api/price-alerts/check-all`
4. Set Method: `POST`
5. Add Header: `X-Cron-Secret: your_cron_secret`
6. Set Schedule: Every 5 minutes
7. Save and activate

## Response Format

The endpoint returns a summary of the processing:

```json
{
  "success": true,
  "data": {
    "total_users_processed": 42,
    "total_alerts_triggered": 15,
    "success_count": 40,
    "failure_count": 2
  }
}
```

## Notification Format

When a price alert is triggered, users receive a push notification with:

- **Title**: "Price Alert: {SYMBOL}"
- **Body**: "{Stock Name} is now ${price} ({above/below} ${alert_price}) ({change}%)"
- **URL**: Deep link to the stock detail page
- **Data**: JSON payload with alert details (alert_id, symbol, prices, alert_type)

## Duplicate Prevention

The system tracks sent notifications in the `alert_notifications_sent` table to prevent duplicate notifications for the same threshold crossing. When a user updates an alert price, the notification status is reset so the new threshold can trigger notifications.

## Error Handling

- Individual user processing failures don't stop the entire batch
- Failed notifications are logged but don't prevent other alerts from being processed
- Invalid push subscriptions are automatically cleaned up

## Testing

You can manually trigger the endpoint for testing:

```bash
curl -X POST \
  -H "X-Cron-Secret: your_cron_secret" \
  -H "Content-Type: application/json" \
  https://your-backend-url.com/api/price-alerts/check-all
```

## Monitoring

Monitor the endpoint logs for:
- Total users processed
- Alerts triggered
- Notifications sent
- Processing errors

The endpoint logs detailed information about each user's processing status.

