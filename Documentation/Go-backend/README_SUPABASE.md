# Tradistry Backend - Supabase Integration

This document outlines the Supabase database integration for the Tradistry trading journal backend.

## Overview

The backend has been updated to use Supabase as the primary database, replacing the previous database implementation. Supabase provides a PostgreSQL database with real-time capabilities, authentication, and a REST API.

## Setup Instructions

### 1. Supabase Project Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Note your project URL and API keys from the project settings
3. Create the required database tables (see Database Schema section)

### 2. Environment Configuration

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Update the `.env` file with your Supabase credentials:
   ```env
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_ANON_KEY=your_anon_key_here
   SUPABASE_SERVICE_KEY=your_service_role_key_here
   ```

### 3. Database Schema

Create the following tables in your Supabase project:

#### Users Table
```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Trades Table
```sql
CREATE TABLE trades (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('buy', 'sell')),
    status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    quantity DECIMAL(18, 8) NOT NULL,
    entry_price DECIMAL(18, 8) NOT NULL,
    exit_price DECIMAL(18, 8),
    stop_loss DECIMAL(18, 8),
    take_profit DECIMAL(18, 8),
    pnl DECIMAL(18, 8),
    notes TEXT,
    entry_date TIMESTAMP WITH TIME ZONE NOT NULL,
    exit_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 4. Running the Application

```bash
go run main.go
```

The application will:
- Load configuration from environment variables
- Initialize the Supabase client
- Perform a health check on the database connection
- Start the HTTP server on the configured port

## Architecture Changes

### New Components

1. **DatabaseService** (`services/database.go`)
   - Handles Supabase client initialization and connection
   - Provides generic CRUD operations
   - Includes health check functionality

2. **SupabaseUserService** (`services/supabase_user_service.go`)
   - User-specific database operations using Supabase
   - HTTP handlers for user endpoints
   - Implements UserServiceInterface

3. **SupabaseTradeService** (`services/supabase_trade_service.go`)
   - Trade-specific database operations using Supabase
   - HTTP handlers for trade endpoints
   - Implements TradeServiceInterface

4. **Service Interfaces** (`services/interfaces.go`)
   - Defines contracts for user and trade services
   - Enables dependency injection and testing
   - Separates HTTP handlers from repository operations

### Updated Components

1. **Models** (`models/`)
   - Removed GORM tags, added `db` tags for Supabase
   - Changed ID types from `uint` to `int64` for PostgreSQL compatibility
   - Added `omitempty` JSON tags for optional fields

2. **Configuration** (`config/config.go`)
   - Added SupabaseConfig struct
   - Environment variable loading for Supabase credentials

3. **Main Application** (`main.go`)
   - Integrated Supabase service initialization
   - Added database health check
   - Updated service dependency injection

4. **Routers** (`routers/`)
   - Updated to use service interfaces
   - Compatible with both old and new service implementations

## API Endpoints

The API endpoints remain the same:

### Users
- `POST /api/v1/users` - Create user
- `GET /api/v1/users` - Get all users
- `GET /api/v1/users/:id` - Get user by ID
- `PUT /api/v1/users/:id` - Update user
- `DELETE /api/v1/users/:id` - Delete user

### Trades
- `POST /api/v1/trades` - Create trade
- `GET /api/v1/trades` - Get user trades
- `GET /api/v1/trades/:id` - Get trade by ID
- `PUT /api/v1/trades/:id` - Update trade
- `DELETE /api/v1/trades/:id` - Delete trade
- `POST /api/v1/trades/:id/close` - Close trade
- `GET /api/v1/trades/analytics/summary` - Trading summary
- `GET /api/v1/trades/analytics/performance` - Performance metrics

## Dependencies

The following Go packages are used:

- `github.com/supabase-community/supabase-go` - Supabase Go client
- `github.com/gofiber/fiber/v2` - HTTP framework
- `github.com/google/uuid` - UUID generation

## Features

### Database Operations
- **CRUD Operations**: Create, Read, Update, Delete for users and trades
- **Filtering**: Query trades by status, user, date ranges
- **Relationships**: Proper foreign key relationships between users and trades
- **Timestamps**: Automatic created_at and updated_at tracking

### Error Handling
- Comprehensive error handling with meaningful messages
- HTTP status codes for different error scenarios
- Database connection health checks

### Data Validation
- Input validation for API requests
- Type safety with Go structs
- Database constraints for data integrity

### Performance
- Efficient queries using Supabase's PostgreSQL backend
- Connection pooling handled by Supabase client
- Indexed queries for better performance

## Migration from Previous Database

If migrating from a previous database implementation:

1. Export existing data to CSV/JSON format
2. Import data into Supabase tables using the dashboard or SQL scripts
3. Update environment variables to use Supabase credentials
4. Test all endpoints to ensure functionality

## Troubleshooting

### Common Issues

1. **Connection Errors**
   - Verify SUPABASE_URL and API keys are correct
   - Check network connectivity to Supabase
   - Ensure project is not paused in Supabase dashboard

2. **Authentication Errors**
   - Verify SUPABASE_ANON_KEY for read operations
   - Use SUPABASE_SERVICE_KEY for admin operations
   - Check Row Level Security (RLS) policies if enabled

3. **Schema Errors**
   - Ensure tables exist in Supabase project
   - Verify column names and types match the models
   - Check foreign key constraints

### Health Check

The application includes a health check endpoint at `/health` and performs a database health check on startup. Monitor the logs for any connection issues.

## Security Considerations

- Use environment variables for sensitive credentials
- Enable Row Level Security (RLS) in Supabase for production
- Implement proper authentication and authorization
- Validate all user inputs
- Use HTTPS in production

## Future Enhancements

- Real-time subscriptions using Supabase's real-time features
- Advanced analytics using Supabase's built-in functions
- File storage integration for trade attachments
- Multi-tenancy support with RLS policies
