# Redis Cloud Setup for Tradistry Scheduler

This guide walks you through setting up Redis Cloud for your Celery & Redis integration.

## 1. Create Redis Cloud Account

1. Go to [Redis Cloud](https://cloud.redis.io/)
2. Sign up for a free account
3. Create a new subscription (Free tier available)

## 2. Create Redis Database

1. In the Redis Cloud dashboard, click **"New Database"**
2. Choose your cloud provider and region
3. Configure database settings:
   - **Name**: `tradistry-scheduler`
   - **Memory**: 30MB (free tier)
   - **Modules**: None required
   - **Eviction Policy**: `allkeys-lru` (recommended)

## 3. Get Connection Details

After creating the database, you'll get:

- **Endpoint**: `your-endpoint.redis.cloud`
- **Port**: Usually `12345` (varies)
- **Password**: Auto-generated secure password

## 4. Configure Environment Variables

Create your `.env` file from the example:

```bash
cp .env.example .env
```

Update the Redis configuration in `.env`:

```env
# Redis Cloud Configuration
REDIS_URL=rediss://default:your_password@your-endpoint.redis.cloud:12345
CELERY_BROKER_URL=rediss://default:your_password@your-endpoint.redis.cloud:12345
CELERY_RESULT_BACKEND=rediss://default:your_password@your-endpoint.redis.cloud:12345
```

**Important Notes:**
- Use `rediss://` (with double 's') for SSL connections
- Replace `your_password`, `your-endpoint`, and port with actual values
- The username is typically `default` for Redis Cloud

## 5. Test Connection

Test your Redis Cloud connection:

```bash
python3 -c "
import redis
import os
from dotenv import load_dotenv

load_dotenv()
r = redis.from_url(os.getenv('REDIS_URL'), ssl_cert_reqs=None)
print('Testing Redis Cloud connection...')
r.ping()
print('✅ Connection successful!')
r.set('test_key', 'hello_redis')
print(f'Test value: {r.get(\"test_key\").decode()}')
r.delete('test_key')
print('✅ Redis Cloud is ready for Celery!')
"
```

## 6. Start Celery Services

With Redis Cloud configured, start your Celery services:

```bash
# Load environment variables and start services
source .env
./scripts/start_celery.sh
```

## 7. Monitor Your Database

### Redis Cloud Dashboard
- Monitor memory usage
- View connection statistics
- Check performance metrics
- Set up alerts

### Flower Monitoring
- Access Flower at `http://localhost:5555`
- Monitor task queues and workers
- View task history and results

## Security Best Practices

### Environment Variables
```bash
# Never commit these to version control
echo ".env" >> .gitignore
```

### Connection Security
- Redis Cloud uses TLS/SSL by default
- Connections are encrypted in transit
- Use strong passwords (auto-generated recommended)

### Access Control
- Limit database access to your application IPs
- Use Redis Cloud's built-in firewall rules
- Rotate passwords periodically

## Troubleshooting

### Connection Issues

**SSL Certificate Errors:**
```python
# Add to your Redis client configuration
ssl_cert_reqs=None
```

**Timeout Issues:**
```env
# Increase timeout in .env
CELERY_BROKER_CONNECTION_TIMEOUT=30
CELERY_RESULT_BACKEND_TIMEOUT=30
```

**Authentication Errors:**
- Verify username is `default`
- Check password is correct
- Ensure endpoint and port are accurate

### Performance Optimization

**Memory Management:**
- Monitor memory usage in Redis Cloud dashboard
- Set appropriate eviction policies
- Use TTL for temporary data

**Connection Pooling:**
```env
# Optimize connection pooling
CELERY_BROKER_POOL_LIMIT=10
CELERY_BROKER_CONNECTION_MAX_RETRIES=3
```

## Free Tier Limitations

Redis Cloud free tier includes:
- **30MB memory**
- **30 connections**
- **Limited bandwidth**
- **Single database**

For production workloads, consider upgrading to a paid plan.

## Monitoring & Alerts

### Set Up Alerts
1. Go to Redis Cloud dashboard
2. Navigate to "Alerts" section
3. Configure alerts for:
   - Memory usage > 80%
   - Connection count > 25
   - High latency

### Key Metrics to Monitor
- Memory usage
- Connection count
- Operations per second
- Network throughput
- Latency

## Backup & Recovery

Redis Cloud automatically handles:
- **Persistence**: Data is persisted to disk
- **Backups**: Automatic daily backups (paid plans)
- **High Availability**: Multi-zone redundancy (paid plans)

## Cost Optimization

### Free Tier Usage
- Monitor memory usage carefully
- Use efficient data structures
- Set appropriate TTLs
- Clean up old task results

### Upgrade Considerations
Upgrade when you need:
- More memory (>30MB)
- More connections (>30)
- Higher throughput
- Advanced features (clustering, modules)

## Integration with CI/CD

### Environment Variables in CI
```yaml
# GitHub Actions example
env:
  REDIS_URL: ${{ secrets.REDIS_URL }}
  CELERY_BROKER_URL: ${{ secrets.REDIS_URL }}
  CELERY_RESULT_BACKEND: ${{ secrets.REDIS_URL }}
```

### Testing with Redis Cloud
```python
# Use separate database for testing
REDIS_URL_TEST=rediss://default:password@endpoint.redis.cloud:port/1
```

## Migration from Local Redis

1. **Parallel Setup**: Run both local and cloud Redis
2. **Test Thoroughly**: Verify all functionality works
3. **Update Configuration**: Switch environment variables
4. **Monitor Performance**: Check latency and throughput
5. **Remove Local Redis**: Clean up local installation

Your Redis Cloud setup is now complete and ready for production use with Celery!
