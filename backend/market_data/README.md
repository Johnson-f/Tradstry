# Market Data System Documentation

A comprehensive, multi-provider market data fetching system with automatic fallback, caching, and data formatting capabilities. This system provides a unified interface to access financial data from multiple providers including Alpha Vantage, Finnhub, Polygon, Twelve Data, FMP, Tiingo, API Ninjas, and Fiscal AI.

## 🏗️ System Architecture

The market data system follows a modular architecture with clear separation of concerns:

```
market_data/
├── base.py              # Core data models and abstract provider interface
├── brain.py             # Central orchestrator with automatic fallback
├── config.py            # Configuration management for all providers
├── data_formatter.py    # Database-ready data formatting service
├── providers/           # Individual provider implementations
│   ├── __init__.py      # Provider exports
│   ├── alpha_vantage.py # Alpha Vantage API implementation
│   ├── finnhub.py       # Finnhub API implementation
│   ├── polygon.py       # Polygon.io API implementation
│   ├── twelve_data.py   # Twelve Data API implementation
│   ├── fmp.py           # Financial Modeling Prep API implementation
│   ├── tiingo.py        # Tiingo API implementation
│   ├── api_ninjas.py    # API Ninjas implementation
│   └── fiscal.py        # Fiscal AI implementation
└── README.md            # This documentation file
```

## 📁 File Descriptions

### Core System Files

#### [`base.py`](base.py)
**Purpose**: Defines the foundation of the market data system
- **Data Models**: 25+ Pydantic models for standardized data structures including:
  - `StockQuote` - Real-time stock quotes with price, volume, and change data
  - `HistoricalPrice` - Historical price data with OHLCV information
  - `OptionQuote` - Options data with Greeks and pricing information
  - `CompanyInfo` - Comprehensive company profile and fundamental data
  - `EconomicEvent` - Economic calendar events with importance levels
  - `EarningsCalendar` - Earnings announcement schedules
  - `NewsArticle` - Financial news with metadata
  - And many more specialized models for different data types
- **Abstract Interface**: `MarketDataProvider` base class that all providers must implement
- **Enums**: `MarketDataType` and `Interval` for standardized data categorization
- **Features**: Automatic decimal serialization, timezone handling, and data validation

#### [`brain.py`](brain.py)
**Purpose**: The central orchestrator that manages all providers and implements intelligent fallback
- **Core Features**:
  - **Automatic Fallback**: Tries providers in priority order until data is found
  - **Rate Limit Management**: Tracks and respects provider rate limits
  - **Caching System**: Configurable TTL-based caching to reduce API calls
  - **Concurrent Operations**: Batch processing for multiple symbols
  - **Error Handling**: Comprehensive error tracking and recovery
- **Key Classes**:
  - `MarketDataBrain` - Main orchestrator class
  - `FetchResult` - Standardized result container with success/error information
- **Methods**: Provides unified methods for all data types (quotes, historical, options, etc.)
- **Smart Features**: 
  - Re-enables rate-limited providers after cooldown periods
  - Prioritizes providers based on configuration
  - Maintains provider health status

#### [`config.py`](config.py)
**Purpose**: Centralized configuration management for all providers
- **Configuration Classes**:
  - `ProviderConfig` - Individual provider settings (API keys, rate limits, priorities)
  - `MarketDataConfig` - Global system configuration
- **Features**:
  - Environment variable integration with `.env` support
  - Priority-based provider ordering (HIGH, MEDIUM, LOW)
  - Rate limit specifications for each provider
  - Global settings for caching, fallback behavior, and logging
- **Provider Defaults**: Pre-configured settings for all supported providers with realistic rate limits
- **Validation**: Built-in validation for provider configuration completeness

#### [`data_formatter.py`](data_formatter.py)
**Purpose**: Transforms raw market data into database-ready formats
- **Core Service**: `DataFormattingService` class that bridges Brain data to database storage
- **Formatting Methods**:
  - `format_quote_data()` - Formats stock quotes for database insertion
  - `format_historical_data()` - Processes historical price arrays
  - `format_options_data()` - Structures options chain data
  - `format_company_info()` - Standardizes company information
  - `format_fundamentals()` - Organizes fundamental metrics
  - `format_earnings_calendar()` - Structures earnings events
  - `format_economic_events()` - Processes economic calendar data
- **Database Integration**: 
  - Provides exact parameter mapping for PostgreSQL upsert functions
  - Handles data type conversions (Decimal to float, datetime to ISO strings)
  - Includes metadata like provider source and timestamps
- **Batch Operations**: Concurrent processing for multiple symbols
- **Error Handling**: Graceful handling of missing or invalid data

### Provider Implementations

#### [`providers/__init__.py`](providers/__init__.py)
**Purpose**: Centralizes provider exports for easy importing
- Exports all provider classes for use throughout the system
- Maintains clean import structure for the providers module

#### [`providers/alpha_vantage.py`](providers/alpha_vantage.py)
**Purpose**: Alpha Vantage API implementation
- **Specialties**: 
  - Comprehensive fundamental data via OVERVIEW endpoint
  - Technical indicators (50+ indicators including SMA, EMA, MACD, RSI, Bollinger Bands)
  - Economic indicators (GDP, inflation, unemployment, etc.)
  - News sentiment analysis
  - Earnings call transcripts
- **Rate Limits**: 5 requests/minute (free tier), 25 requests/day for some endpoints
- **Data Quality**: High-quality fundamental and technical data
- **Unique Features**: 
  - Extensive technical indicator library
  - Economic data access
  - Top gainers/losers endpoint
  - Insider transaction data

#### [`providers/finnhub.py`](providers/finnhub.py)
**Purpose**: Finnhub API implementation with enhanced features
- **Specialties**:
  - Real-time stock quotes with comprehensive market data
  - Company profiles with detailed metrics
  - Earnings calendar and transcripts
  - Financial news with sentiment
  - Insider transactions
  - Company peer analysis
  - Symbol search functionality
- **Rate Limits**: 30 requests/second, 1M requests/month (free tier)
- **Advanced Features**:
  - Sophisticated rate limiting with semaphore control
  - Comprehensive error handling and retry logic
  - Market status monitoring
  - Peer company identification
- **Data Coverage**: Excellent for US equities, good international coverage

#### [`providers/polygon.py`](providers/polygon.py)
**Purpose**: Polygon.io API implementation
- **Specialties**: 
  - High-frequency intraday data
  - Options chain data (premium feature)
  - Cryptocurrency and forex data
  - Market holidays and conditions
  - Aggregated market data
- **Rate Limits**: 5 requests/minute (free tier)
- **Unique Features**: 
  - Tick-level data access
  - Comprehensive options data
  - Multi-asset class support (stocks, crypto, forex)
  - Market microstructure data

#### [`providers/twelve_data.py`](providers/twelve_data.py)
**Purpose**: Twelve Data API implementation
- **Specialties**:
  - International market coverage
  - Technical indicators
  - Fundamental data
  - Economic indicators
  - Cryptocurrency data
- **Rate Limits**: 800 requests/day (free tier)
- **Coverage**: Strong international and emerging market data

#### [`providers/fmp.py`](providers/fmp.py)
**Purpose**: Financial Modeling Prep API implementation
- **Specialties**:
  - Detailed financial statements
  - Valuation metrics
  - Analyst estimates
  - SEC filings
  - Insider trading data
- **Rate Limits**: 250 requests/day (free tier)
- **Strength**: Comprehensive fundamental analysis data

#### [`providers/tiingo.py`](providers/tiingo.py)
**Purpose**: Tiingo API implementation
- **Specialties**:
  - End-of-day price data
  - Fundamental metrics
  - News aggregation
  - Cryptocurrency data
- **Rate Limits**: Varies by endpoint
- **Features**: Clean, reliable data with good historical coverage

#### [`providers/api_ninjas.py`](providers/api_ninjas.py)
**Purpose**: API Ninjas implementation
- **Specialties**:
  - Economic indicators
  - Motivational quotes (for trading psychology)
  - Company search functionality
- **Rate Limits**: 200 requests/minute (free tier)
- **Use Case**: Supplementary data and economic indicators

#### [`providers/fiscal.py`](providers/fiscal.py)
**Purpose**: Fiscal AI implementation
- **Specialties**:
  - AI-powered financial analysis
  - Advanced analytics
  - Custom financial metrics
- **Rate Limits**: 50 requests/minute (estimated)
- **Features**: AI-enhanced financial data processing

## 🚀 Quick Start Guide

### 1. Environment Setup
Create a `.env` file with your API keys:
```bash
ALPHA_VANTAGE_API_KEY=your_key_here
FINNHUB_API_KEY=your_key_here
POLYGON_API_KEY=your_key_here
TWELVE_DATA_API_KEY=your_key_here
FMP_API_KEY=your_key_here
TIINGO_API_KEY=your_key_here
API_NINJAS_API_KEY=your_key_here
FISCAL_API_KEY=your_key_here
```

### 2. Basic Usage
```python
from market_data import MarketDataBrain

# Initialize the brain
brain = MarketDataBrain()

# Get a stock quote with automatic fallback
result = await brain.get_quote("AAPL")
if result.success:
    quote = result.data  # StockQuote object
    print(f"AAPL: ${quote.price} ({quote.change_percent}%)")
else:
    print(f"Error: {result.error}")

# Get historical data
historical_result = await brain.get_historical(
    symbol="AAPL",
    start_date=date(2024, 1, 1),
    end_date=date(2024, 12, 31)
)

# Batch operations
quotes = await brain.get_multiple_quotes(["AAPL", "GOOGL", "MSFT"])
```

### 3. Database Integration
```python
from market_data import DataFormattingService

formatter = DataFormattingService()

# Get database-ready quote data
formatted_quote = await formatter.format_quote_data("AAPL")
if formatted_quote['success']:
    # Ready for PostgreSQL upsert
    db_data = formatter.format_for_upsert_functions(
        formatted_quote, 'quote'
    )
```

## 🔧 Configuration Options

### Provider Priorities
- **HIGH**: Alpha Vantage, Finnhub, Polygon (tried first)
- **MEDIUM**: Twelve Data, FMP, API Ninjas, Fiscal AI
- **LOW**: Tiingo (tried last)

### Caching Settings
- **Default TTL**: 5 minutes (300 seconds)
- **Configurable**: Can be adjusted per deployment
- **Smart Invalidation**: Automatic cache cleanup

### Rate Limiting
- **Per-Provider**: Individual rate limit tracking
- **Automatic Backoff**: 1-hour cooldown for rate-limited providers
- **Graceful Degradation**: Falls back to available providers

## 📊 Data Types Supported

| Data Type | Description | Providers |
|-----------|-------------|-----------|
| **Stock Quotes** | Real-time price, volume, change data | All providers |
| **Historical Prices** | OHLCV data with adjustments | All providers |
| **Options Chain** | Strike prices, Greeks, IV | Polygon, Alpha Vantage* |
| **Company Info** | Profiles, fundamentals, metrics | Finnhub, Alpha Vantage, FMP |
| **Earnings** | Calendar, estimates, transcripts | Finnhub, Alpha Vantage |
| **Economic Events** | Calendar, indicators, releases | Alpha Vantage, API Ninjas |
| **News** | Financial news with sentiment | Finnhub, Alpha Vantage |
| **Technical Indicators** | 50+ indicators | Alpha Vantage, Twelve Data |

*Premium features may require paid subscriptions

## 🛡️ Error Handling & Reliability

### Automatic Fallback System
1. **Primary Provider**: Attempts data fetch from highest priority provider
2. **Fallback Chain**: If primary fails, tries next provider in priority order
3. **Rate Limit Handling**: Skips rate-limited providers, re-enables after cooldown
4. **Error Logging**: Comprehensive logging for debugging and monitoring

### Data Validation
- **Pydantic Models**: Automatic data validation and type conversion
- **Decimal Precision**: Financial data uses Decimal type for accuracy
- **Timezone Handling**: Consistent UTC timezone management
- **Null Handling**: Graceful handling of missing or invalid data

### Monitoring & Debugging
- **Provider Status**: Real-time provider health monitoring
- **Request Tracking**: Count and timing of API requests
- **Error Classification**: Categorized error types for better debugging
- **Performance Metrics**: Cache hit rates and response times

## 🔄 System Workflow

1. **Request Initiation**: User requests data through Brain interface
2. **Cache Check**: System checks for valid cached data
3. **Provider Selection**: Selects best available provider based on priority and rate limits
4. **Data Fetching**: Makes API request with error handling
5. **Data Validation**: Validates and standardizes data using Pydantic models
6. **Fallback Logic**: If primary provider fails, tries next available provider
7. **Caching**: Stores successful results for future requests
8. **Response**: Returns standardized FetchResult with data or error information

## 🎯 Best Practices

### For Developers
- Always check `FetchResult.success` before accessing data
- Use batch operations for multiple symbols to improve efficiency
- Configure appropriate cache TTL based on data freshness requirements
- Monitor provider rate limits and adjust request patterns accordingly

### For Production
- Set up monitoring for provider health and error rates
- Configure appropriate logging levels for debugging
- Use environment variables for API key management
- Implement circuit breakers for critical applications
- Regular monitoring of API quota usage across providers

## 🔮 Future Enhancements

- **WebSocket Support**: Real-time streaming data
- **Advanced Caching**: Redis integration for distributed caching
- **Machine Learning**: Predictive provider selection based on success rates
- **GraphQL Interface**: Modern API interface for flexible data queries
- **Metrics Dashboard**: Real-time monitoring and analytics
- **Custom Indicators**: User-defined technical indicators
- **Alternative Data**: Integration with satellite, social media, and other alternative data sources

---

This market data system provides a robust, scalable foundation for financial applications requiring reliable access to market data from multiple sources with intelligent fallback and caching capabilities.
