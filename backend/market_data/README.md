# Market Data Fetching System

A comprehensive, reusable Python system for fetching financial market data from multiple providers with automatic fallback capabilities.

## Features

- **6 Provider Support**: Alpha Vantage, Finnhub, Polygon.io, TwelveData, Financial Modeling Prep, and Tiingo
- **Automatic Fallback**: If one provider fails or doesn't have data, automatically tries the next provider
- **Comprehensive Data Types**: Quotes, historical prices, options chains, company info, fundamentals, earnings, dividends, news, and technical indicators
- **Caching System**: Built-in caching to reduce API calls and improve performance
- **Async/Await Support**: Fully asynchronous for high performance
- **Database Ready**: Easy integration with your existing database upsert functions
- **Batch Operations**: Fetch data for multiple symbols concurrently
- **Configurable**: Priority-based provider ordering and rate limiting

## Quick Start

### 1. Install Dependencies

```bash
pip install aiohttp pydantic python-dotenv
```

### 2. Set Up Environment Variables

Create a `.env` file in your backend directory:

```env
# API Keys (get free keys from each provider)
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
FINNHUB_API_KEY=your_finnhub_key
POLYGON_API_KEY=your_polygon_key
TWELVE_DATA_API_KEY=your_twelve_data_key
FMP_API_KEY=your_fmp_key
TIINGO_API_KEY=your_tiingo_key
```

### 3. Basic Usage

```python
import asyncio
from services.market_data import MarketDataOrchestrator

async def main():
    # Initialize the orchestrator
    orchestrator = MarketDataOrchestrator()
    
    # Fetch a stock quote with automatic fallback
    result = await orchestrator.get_quote("AAPL")
    
    if result.success:
        quote = result.data
        print(f"{quote.symbol}: ${quote.price} ({quote.change:+.2f})")
        print(f"Data from: {result.provider}")
    else:
        print(f"Failed to fetch quote: {result.error}")

asyncio.run(main())
```

## Data Types Supported

### Stock Quotes
- Current price, change, volume
- Open, high, low, previous close
- Real-time or delayed depending on provider

### Historical Data
- Daily, intraday (1min, 5min, 15min, 30min, 1h)
- OHLCV data with adjustments
- Dividend and split information

### Options Data
- Options chains with strikes and expirations
- Bid/ask spreads, volume, open interest
- Greeks (delta, gamma, theta, vega)
- Implied volatility

### Company Information
- Basic company profile
- Sector, industry classification
- Market cap, employee count
- Executive information

### Fundamental Data
- Financial ratios (P/E, P/B, ROE, etc.)
- Revenue, earnings, margins
- Balance sheet metrics
- Cash flow data

### Market News
- Company-specific news
- General market news
- Earnings announcements

### Technical Indicators
- Moving averages (SMA, EMA)
- Momentum indicators (RSI, MACD)
- Volatility indicators (Bollinger Bands)
- Volume indicators (OBV)

## Provider Comparison

| Provider | Free Tier | Strengths | Limitations |
|----------|-----------|-----------|-------------|
| **Alpha Vantage** | 5 req/min | Comprehensive data, technical indicators | Low rate limit |
| **Finnhub** | 60 req/min | Real-time data, good fundamentals | Options require premium |
| **Polygon.io** | 5 req/min | High-quality data, options support | Low free tier limit |
| **TwelveData** | 800 req/day | Good coverage, options data | Daily limit |
| **FMP** | 250 req/day | Strong fundamentals, earnings | Limited free tier |
| **Tiingo** | Varies | Good historical data, news | Limited real-time |

## Integration with Database

The system is designed to work seamlessly with your existing database upsert functions:

```python
from services.market_data.examples import MarketDataService

async def update_stock_data(symbol: str):
    service = MarketDataService()
    
    # Fetch quote data
    quote_result = await service.fetch_and_store_quote(symbol)
    
    if quote_result['success']:
        # Use your existing upsert function
        await your_stock_upsert_function(quote_result['data'])
        print(f"Updated {symbol} from {quote_result['provider']}")
    
    # Fetch historical data
    historical_result = await service.fetch_and_store_historical(symbol, days_back=30)
    
    if historical_result['success']:
        # Use your existing historical upsert function
        await your_historical_upsert_function(historical_result['data'])
        print(f"Updated {len(historical_result['data'])} historical records")
```

## Configuration

Customize provider priorities and settings:

```python
from services.market_data import MarketDataConfig, ProviderPriority

# Create custom configuration
config = MarketDataConfig()

# Set provider priorities
config.finnhub.priority = ProviderPriority.HIGH
config.polygon.priority = ProviderPriority.HIGH
config.alpha_vantage.priority = ProviderPriority.MEDIUM

# Adjust caching
config.enable_caching = True
config.cache_ttl_seconds = 300  # 5 minutes

# Use custom config
orchestrator = MarketDataOrchestrator(config)
```

## Error Handling

The system provides comprehensive error handling:

```python
result = await orchestrator.get_quote("INVALID")

if not result.success:
    print(f"Error: {result.error}")
    print(f"Last provider tried: {result.provider}")
    
    # Check provider status
    status = orchestrator.get_provider_status()
    print(f"Available providers: {status}")
```

## Batch Operations

Fetch data for multiple symbols efficiently:

```python
# Fetch quotes for multiple symbols
symbols = ["AAPL", "GOOGL", "MSFT", "TSLA"]
results = await orchestrator.get_multiple_quotes(symbols)

for symbol, result in results.items():
    if result.success:
        print(f"{symbol}: ${result.data.price}")
```

## Rate Limiting

Each provider has built-in rate limiting based on their API limits:

- **Alpha Vantage**: 5 requests/minute
- **Finnhub**: 60 requests/minute  
- **Polygon**: 5 requests/minute
- **TwelveData**: ~8 requests/minute (800/day)
- **FMP**: ~5 requests/minute (250/day)
- **Tiingo**: 60 requests/minute

The system automatically respects these limits and falls back to other providers when limits are reached.

## Caching

Built-in caching reduces API calls:

- **Default TTL**: 5 minutes for quotes, longer for static data
- **Automatic Invalidation**: Cache expires based on data type
- **Manual Control**: Clear cache when needed

```python
# Clear all cached data
orchestrator.clear_cache()

# Check cache status
print(f"Cache enabled: {orchestrator.config.enable_caching}")
```

## Examples

See `examples.py` for comprehensive usage examples including:

- Basic data fetching
- Batch processing
- Database integration
- Error handling
- Options data
- Historical data

## API Reference

### MarketDataOrchestrator

Main class for fetching market data with automatic fallback.

#### Methods

- `get_quote(symbol)` - Get current stock quote
- `get_historical(symbol, start_date, end_date, interval)` - Get historical prices
- `get_options_chain(symbol, expiration)` - Get options chain
- `get_company_info(symbol)` - Get company information
- `get_fundamentals(symbol)` - Get fundamental metrics
- `get_earnings(symbol)` - Get earnings data
- `get_dividends(symbol)` - Get dividend history
- `get_news(symbol, limit)` - Get news articles
- `get_technical_indicators(symbol, indicator, interval)` - Get technical indicators

#### Batch Methods

- `get_multiple_quotes(symbols)` - Get quotes for multiple symbols
- `get_multiple_historical(symbols, start_date, end_date, interval)` - Get historical data for multiple symbols

#### Utility Methods

- `clear_cache()` - Clear all cached data
- `get_available_providers()` - Get list of available providers
- `get_provider_status()` - Get status of all providers

## Getting API Keys

### Free Tier API Keys

1. **Alpha Vantage**: [alphavantage.co](https://www.alphavantage.co/support/#api-key)
2. **Finnhub**: [finnhub.io](https://finnhub.io/register)
3. **Polygon**: [polygon.io](https://polygon.io/pricing)
4. **TwelveData**: [twelvedata.com](https://twelvedata.com/pricing)
5. **FMP**: [financialmodelingprep.com](https://financialmodelingprep.com/developer/docs)
6. **Tiingo**: [tiingo.com](https://api.tiingo.com/)

All providers offer free tiers with different rate limits and features.

## Contributing

To add a new provider:

1. Create a new provider class inheriting from `MarketDataProvider`
2. Implement required methods (`get_quote`, `get_historical`, etc.)
3. Add provider to `config.py` and `orchestrator.py`
4. Update documentation

## License

This market data fetching system is part of your Tradistry application.
