# Backend Integration Guide

This guide explains how to connect your Next.js frontend to the FastAPI backend.

## Overview

Your Tradistry application uses:
- **Frontend**: Next.js 15 with TypeScript, Tailwind CSS, and shadcn/ui components
- **Backend**: FastAPI with Supabase database
- **Authentication**: Supabase Auth with JWT tokens
- **Data Fetching**: SWR for caching and real-time updates
- **HTTP Client**: Axios with automatic token handling

## Quick Start

### 1. Backend Setup

First, ensure your FastAPI backend is running:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

The backend will be available at `http://localhost:8000`

### 2. Frontend Environment Configuration

Create a `.env.local` file in your project root:

```env
# Supabase Configuration (same as backend)
NEXT_PUBLIC_SUPABASE_URL=https://swywnrbzailhvgfqvezr.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3eXducmJ6YWlsaHZnZnF2ZXpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMzM1ODYsImV4cCI6MjA2OTcwOTU4Nn0.Hw1MsASq6s8Dzb1GKwtysXcmym2EPRS3axdzYvWKMJM

# API Configuration
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### 3. Install Dependencies

If not already installed, add the following to your package.json:

```bash
npm install axios swr
```

### 4. Test the Connection

Visit the example dashboard at `/dashboard-example` to see the integration in action.

## Architecture Overview

### API Client (`lib/services/api-client.ts`)

The API client handles:
- Automatic JWT token attachment from Supabase auth
- Token refresh when expired
- Error handling and retries
- Request/response interceptors

```typescript
import { apiClient } from '@/lib/services/api-client';

// Automatically adds Authorization header
const stocks = await apiClient.get('/stocks');
```

### Service Layer

Each domain has its own service class:

- **StockService** (`lib/services/stock-service.ts`) - Stock trading operations
- **OptionService** (`lib/services/options-service.ts`) - Options trading operations

```typescript
import { stockService } from '@/lib/services/stock-service';

// Create a new stock trade
const newStock = await stockService.createStock({
  symbol: 'AAPL',
  trade_type: 'BUY',
  entry_price: 150.00,
  // ...other fields
});
```

### React Hooks

Custom hooks provide data fetching with SWR caching:

```typescript
import { useStocks, useStockMutations } from '@/lib/hooks/use-stocks';

function MyComponent() {
  const { stocks, isLoading, error } = useStocks();
  const { createStock, updateStock, deleteStock } = useStockMutations();

  // Component logic...
}
```

### Type Safety

TypeScript types in `lib/types/trading.ts` ensure type safety across the entire application, matching your FastAPI Pydantic models.

## Available Hooks

### Stock Trading Hooks

- `useStocks(filters?)` - Get all stocks with optional filtering
- `useStock(stockId)` - Get a single stock by ID
- `useOpenStockPositions()` - Get open stock positions
- `useClosedStockPositions()` - Get closed stock positions
- `useStocksBySymbol(symbol)` - Get stocks by symbol
- `useStockTradingStats()` - Get trading statistics
- `useStockMutations()` - Create, update, delete operations

### Options Trading Hooks

- `useOptions(filters?)` - Get all options with optional filtering
- `useOption(optionId)` - Get a single option by ID
- `useOpenOptionPositions()` - Get open option positions
- `useClosedOptionPositions()` - Get closed option positions
- `useOptionsBySymbol(symbol)` - Get options by symbol
- `useOptionsByStrategy(strategy)` - Get options by strategy
- `useOptionsExpiringWithin(days)` - Get options expiring within X days
- `useOptionTradingStats()` - Get options trading statistics
- `useOptionMutations()` - Create, update, delete operations

## Authentication Flow

1. User authenticates with Supabase Auth (login/signup)
2. Supabase provides JWT access token
3. API client automatically attaches token to requests
4. FastAPI backend validates token with Supabase
5. If token expires, client automatically refreshes it

```typescript
// Authentication is handled automatically
// Just use the hooks and services normally

const { stocks } = useStocks(); // Token automatically included
```

## Error Handling

The API client includes comprehensive error handling:

```typescript
try {
  const result = await stockService.createStock(stockData);
} catch (error) {
  // error.message contains user-friendly message
  // error.status contains HTTP status code
  console.error('API Error:', error.message);
}
```

## Real-time Updates

SWR provides automatic revalidation:

```typescript
const { stocks, mutate } = useStocks();

// Manual revalidation
mutate();

// Automatic revalidation on focus/reconnect
// Configured in each hook
```

## Example Usage

### Creating a Stock Trade

```typescript
import { useStockMutations } from '@/lib/hooks/use-stocks';

function AddStockForm() {
  const { createStock, isCreating } = useStockMutations();

  const handleSubmit = async (data) => {
    try {
      await createStock({
        symbol: 'AAPL',
        trade_type: 'BUY',
        order_type: 'MARKET',
        entry_price: 150.00,
        stop_loss: 145.00,
        number_shares: 100,
        commissions: 1.00,
        entry_date: new Date().toISOString(),
      });
      // Success! Data automatically refreshes
    } catch (error) {
      // Handle error
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button disabled={isCreating}>
        {isCreating ? 'Creating...' : 'Add Trade'}
      </button>
    </form>
  );
}
```

### Displaying Stock Positions

```typescript
import { useOpenStockPositions } from '@/lib/hooks/use-stocks';

function OpenPositions() {
  const { openPositions, isLoading, error } = useOpenStockPositions();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {openPositions?.map(stock => (
        <div key={stock.id}>
          <h3>{stock.symbol}</h3>
          <p>{stock.number_shares} shares @ ${stock.entry_price}</p>
          <p>Status: {stock.status}</p>
        </div>
      ))}
    </div>
  );
}
```

## API Endpoints

Your backend provides these main endpoints:

### Stock Endpoints
- `GET /api/stocks` - Get all stocks
- `POST /api/stocks` - Create stock trade
- `GET /api/stocks/{id}` - Get specific stock
- `PUT /api/stocks/{id}` - Update stock trade
- `DELETE /api/stocks/{id}` - Delete stock trade

### Options Endpoints
- `GET /api/options` - Get all options
- `POST /api/options` - Create option trade
- `GET /api/options/{id}` - Get specific option
- `PUT /api/options/{id}` - Update option trade
- `DELETE /api/options/{id}` - Delete option trade

### Query Parameters
Both endpoints support filtering:
- `?status=open|closed`
- `?symbol=AAPL`
- `?start_date=2024-01-01`
- `?end_date=2024-12-31`

## Development vs Production

### Development
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### Production
```env
NEXT_PUBLIC_API_BASE_URL=https://your-backend-domain.com
```

## Troubleshooting

### Backend Connection Issues

1. **Check backend is running**: Visit `http://localhost:8000/api/health`
2. **Check CORS settings**: Ensure your frontend domain is allowed
3. **Check environment variables**: Verify API_BASE_URL is correct

### Authentication Issues

1. **Check Supabase configuration**: Ensure URL and keys match backend
2. **Check JWT token**: Look for token in browser dev tools
3. **Check user authentication**: Ensure user is logged in

### Data Loading Issues

1. **Check network tab**: Look for failed API requests
2. **Check SWR cache**: Clear cache with `mutate()`
3. **Check error boundaries**: Wrap components in error boundaries

## Performance Optimization

### SWR Configuration

```typescript
// Configure SWR globally
import { SWRConfig } from 'swr';

function App({ children }) {
  return (
    <SWRConfig value={{
      refreshInterval: 30000, // Refresh every 30 seconds
      revalidateOnFocus: false,
      dedupingInterval: 2000,
    }}>
      {children}
    </SWRConfig>
  );
}
```

### Pagination

For large datasets, implement pagination:

```typescript
const { stocks } = useStocks({
  limit: 20,
  offset: page * 20,
});
```

## Security Considerations

1. **JWT Tokens**: Handled automatically by Supabase
2. **API Keys**: Never expose secret keys in frontend
3. **HTTPS**: Use HTTPS in production
4. **Input Validation**: Validate data on both frontend and backend

## Next Steps

1. Customize the example components for your needs
2. Add more filtering options to the hooks
3. Implement real-time subscriptions with Supabase
4. Add data visualization with charts
5. Implement advanced trading analytics

## Support

If you encounter issues:
1. Check the browser console for errors
2. Check the network tab for failed requests
3. Verify your backend is running and accessible
4. Ensure environment variables are set correctly

The integration provides a robust foundation for your trading application with type safety, automatic caching, and real-time updates.