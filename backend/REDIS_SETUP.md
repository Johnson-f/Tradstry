# Redis Cloud Caching Setup for Tradistry Backend

This document explains the Redis caching implementation for the Tradistry FastAPI backend using **Redis Cloud**.

## Overview

The Redis caching system provides:
- **Redis Cloud Integration**: Optimized for Redis Cloud (redis.com) service
- **SSL/TLS Support**: Secure connections required by Redis Cloud
- **Connection Pooling**: Efficient connection management with async support
- **User-Specific Caching**: Isolated caching per user with proper namespacing
- **AI Response Caching**: Cache AI-generated content to improve performance
- **Trading Data Caching**: Cache market data, analytics, and trading information
- **Health Monitoring**: Built-in health checks and statistics

## Configuration

### Environment Variables

Add the following environment variables to your `.env` file:

```bash
# Redis Cloud Configuration
REDIS_URL=rediss://default:your-password@redis-12345.c123.us-east-1-1.ec2.cloud.redislabs.com:12345

# Optional: Individual settings (if not using URL)
REDIS_HOST=redis-12345.c123.us-east-1-1.ec2.cloud.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=your-redis-cloud-password
REDIS_USERNAME=default

# SSL Configuration (always required for Redis Cloud)
REDIS_SSL=true
REDIS_SSL_CERT_REQS=required

# Performance Settings
REDIS_CONNECTION_POOL_MAX_SIZE=50
REDIS_SOCKET_TIMEOUT=5
REDIS_SOCKET_CONNECT_TIMEOUT=10
REDIS_TTL_DEFAULT=3600
REDIS_KEY_PREFIX=tradistry
```

### Getting Redis Cloud Connection Details

1. **Log in to Redis Cloud Console**: https://app.redislabs.com/
2. **Select your database** from the dashboard
3. **Go to Configuration tab**
4. **Copy the connection details**:
   - **Public endpoint**: `redis-xxxxx.cxxx.region.cloud.redislabs.com:port`
   - **Password**: Available in the "Security" section
   - **Connection URL**: Available as "Redis URL" (use this for `REDIS_URL`)

### Connection URL Format

Redis Cloud uses this connection string format:
```
rediss://[username]:[password]@[host]:[port]/[db]
```

- `rediss://` - SSL enabled (required for Redis Cloud)
- `default` - Default username (Redis Cloud uses "default" user)
- `your-password` - Your database password from Redis Cloud console
- `host:port` - Your Redis Cloud endpoint
- `/0` - Database number (usually 0)

## Usage

### Basic Cache Operations

```python
from services.cache_service import cache_service

# Cache user data
await cache_service.cache_user_data(
    user_id="user_123",
    data_type="profile", 
    data={"name": "John", "preferences": {}},
    ttl=3600
)

# Retrieve user data
profile = await cache_service.get_user_data(
    user_id="user_123",
    data_type="profile"
)

# Cache AI responses
await cache_service.cache_ai_response(
    user_id="user_123",
    prompt_hash="abc123",
    response={"content": "AI generated response"},
    ttl=1800
)

# Cache trading data
await cache_service.cache_trading_data(
    user_id="user_123",
    symbol="AAPL",
    data_type="quote",
    data={"price": 150.25, "volume": 1000000},
    ttl=900
)
```

### Using Cache Decorators

```python
from services.cache_service import cache_result, cache_user_specific

# Cache function results
@cache_result(ttl=3600, namespace="analytics")
async def calculate_portfolio_metrics(user_id: str, timeframe: str):
    # Expensive calculation here
    return {"metrics": "data"}

# Cache user-specific results
@cache_user_specific(ttl=1800, data_type="reports")
async def generate_user_report(user_id: str, report_type: str):
    # Generate report for specific user
    return {"report": "data"}
```

### Manual Redis Operations

```python
from services.redis_client import redis_service

# Direct Redis operations
await redis_service.set("key", "value", ttl=3600, namespace="custom")
value = await redis_service.get("key", namespace="custom")
await redis_service.delete("key", namespace="custom")

# Check key existence and TTL
exists = await redis_service.exists("key", namespace="custom")
ttl = await redis_service.get_ttl("key", namespace="custom")

# Increment counters
count = await redis_service.increment("counter", amount=1, namespace="stats")
```

## Cache Namespaces

The system uses the following namespaces:

- `users`: User-specific profile and preference data
- `ai`: AI-generated responses and conversations
- `trading`: Market data, quotes, and trading information
- `analytics`: Portfolio metrics and performance analytics
- `general`: Generic cached data

## Health Monitoring

### Health Check Endpoints

```bash
# Basic Redis health
GET /api/health/redis

# Comprehensive cache statistics
GET /api/health/cache
```

### Health Check Response Example

```json
{
  "status": "healthy",
  "connected": true,
  "info": {
    "server": {
      "version": "7.0.5",
      "mode": "standalone",
      "uptime": 86400
    },
    "clients": {
      "connected": 5,
      "blocked": 0
    },
    "pool": {
      "max_connections": 50,
      "created_connections": 5,
      "available_connections": 45
    }
  },
  "timestamp": "2024-01-20T10:30:00"
}
```

### Cache Statistics Response

```json
{
  "memory": {
    "used_memory": "5MB",
    "used_memory_human": "5.2M",
    "maxmemory": "100MB"
  },
  "keys": {
    "total": 1250,
    "by_namespace": {
      "users": 450,
      "ai": 300,
      "trading": 350,
      "analytics": 100,
      "general": 50
    }
  },
  "timestamp": "2024-01-20T10:30:00"
}
```

## Cache Management

### Clear User Cache

```python
from services.cache_service import cache_service, clear_all_user_cache

# Clear specific user's cache
cleared_count = await cache_service.clear_user_cache("user_123")

# Clear all user's cache across all namespaces
total_cleared = await clear_all_user_cache("user_123")
```

### Clear Namespace

```python
# Clear all keys in a namespace
cleared_count = await redis_service.clear_namespace("analytics")
```

## Best Practices

### 1. TTL Strategy
- **User Data**: 1 hour (3600s) - profiles, preferences
- **AI Responses**: 30 minutes (1800s) - to allow for model improvements
- **Trading Data**: 15 minutes (900s) - market data changes frequently
- **Analytics**: 30 minutes (1800s) - computationally expensive calculations

### 2. Key Naming Convention
```
{prefix}:{namespace}:{specific_key}
tradistry:users:user:123:profile
tradistry:ai:user:123:prompt:abc123
tradistry:trading:user:123:AAPL:quote
```

### 3. Error Handling
```python
try:
    cached_data = await cache_service.get_user_data(user_id, "profile")
    if cached_data is None:
        # Cache miss - fetch from database
        data = await fetch_from_database(user_id)
        await cache_service.cache_user_data(user_id, "profile", data)
        return data
    return cached_data
except Exception as e:
    logger.error(f"Cache error: {str(e)}")
    # Fallback to database
    return await fetch_from_database(user_id)
```

### 4. Memory Management
- Monitor memory usage via health endpoints
- Set appropriate TTLs to prevent memory bloat
- Use eviction policies in Redis configuration (LRU recommended)
- Regular cleanup of expired keys

## Integration Examples

### AI Chat Service Integration
```python
from services.cache_service import cache_service
import hashlib

async def process_ai_chat(user_id: str, message: str):
    # Generate hash for caching
    prompt_hash = hashlib.md5(message.encode()).hexdigest()
    
    # Check cache first
    cached_response = await cache_service.get_ai_response(user_id, prompt_hash)
    if cached_response:
        return cached_response
    
    # Generate new response
    response = await ai_service.generate_response(message)
    
    # Cache the response
    await cache_service.cache_ai_response(
        user_id, prompt_hash, response, ttl=1800
    )
    
    return response
```

### Analytics Service Integration
```python
from services.cache_service import cache_user_specific

@cache_user_specific(ttl=1800, data_type="analytics")
async def calculate_portfolio_performance(user_id: str, timeframe: str):
    # Expensive calculation
    trades = await get_user_trades(user_id, timeframe)
    performance = calculate_metrics(trades)
    
    return {
        "total_return": performance.total_return,
        "win_rate": performance.win_rate,
        "sharpe_ratio": performance.sharpe_ratio,
        "calculated_at": datetime.now().isoformat()
    }
```

## Troubleshooting

### Common Redis Cloud Issues

1. **Connection Timeout**
   - Verify your Redis Cloud endpoint and port number
   - Check if your IP address needs to be whitelisted
   - Increase `REDIS_SOCKET_CONNECT_TIMEOUT` to 15+ seconds
   - Ensure your Redis Cloud instance is active

2. **SSL/TLS Errors**
   - Redis Cloud **always requires SSL** - ensure `REDIS_SSL=true`
   - Use `rediss://` (with 's') in your connection URL
   - Set `REDIS_SSL_CERT_REQS=required`
   - Check if you're using the correct SSL port

3. **Authentication Errors**
   - Get the correct password from Redis Cloud console > Security
   - Use `default` as the username (Redis Cloud default)
   - Ensure no special characters are URL-encoded in the connection string
   - Verify your Redis Cloud instance is not paused/suspended

4. **Memory/Performance Issues**
   - Check your Redis Cloud plan's memory limit
   - Monitor usage in Redis Cloud console
   - Adjust TTL values for your use case
   - Consider upgrading your Redis Cloud plan if hitting limits

### Redis Cloud Specific Checks

1. **Verify Connection Details**
   ```bash
   # Test with Redis CLI (install via: npm install -g redis-cli)
   redis-cli -u "rediss://default:your-password@your-host:port"
   ```

2. **Check Redis Cloud Console**
   - Instance status (should be "Active")
   - Memory usage
   - Connection limits
   - Security settings

3. **Test Connection**
   ```bash
   python test_redis_cloud_connection.py
   ```

### Debug Mode

Enable debug logging to troubleshoot issues:

```python
import logging
logging.getLogger("services.redis_client").setLevel(logging.DEBUG)
logging.getLogger("services.cache_service").setLevel(logging.DEBUG)
```

## Performance Metrics

Expected performance benchmarks:
- **Cache Hit**: < 1ms
- **Cache Miss + Database Fetch**: 10-100ms
- **Connection Pool Creation**: 100-500ms
- **SSL Handshake**: 50-200ms

Monitor these metrics using the health endpoints and adjust configuration as needed.
