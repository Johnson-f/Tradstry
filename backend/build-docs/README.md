# Tradistry - Trading Journal & Analytics Platform

![Rust](https://img.shields.io/badge/Rust-2024-orange.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-Python-green.svg)
![Next.js](https://img.shields.io/badge/Next.js-React-blue.svg)
![Supabase](https://img.shields.io/badge/Supabase-Auth-purple.svg)
![Turso](https://img.shields.io/badge/Turso-Database-teal.svg)

## Overview

Tradistry is a comprehensive full-stack trading journal and analytics platform designed to help traders track, analyze, and improve their trading performance. The platform features a **multi-tenant architecture** where each user gets their own isolated database while maintaining a centralized user registry.

## Architecture

### Multi-Tenant Database Architecture
- **Central Registry Database**: Stores user-to-database mappings and system metadata
- **Individual User Databases**: Each user gets their own isolated Turso database
- **Authentication**: Supabase Auth with JWT-based user identification
- **API Layer**: Rust-based backend with ActixWeb framework

### Technology Stack

#### Backend (Rust)
- **Framework**: ActixWeb 4.4
- **Database**: Turso (libSQL) with multi-tenant architecture
- **Authentication**: Supabase Auth with JWT validation
- **ORM**: libSQL native driver
- **Error Handling**: anyhow + thiserror
- **Async Runtime**: Tokio via ActixWeb

#### Frontend (Next.js)
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn/ui
- **State Management**: React Context + hooks
- **Authentication**: Supabase client-side SDK

#### Database & Infrastructure
- **Primary Database**: Turso (distributed SQLite)
- **Authentication**: Supabase Auth
- **Deployment**: TBD (supports Vercel, Railway, etc.)

## Project Structure

```
/
├── src/                          # Rust backend source
│   ├── main.rs                   # Main application entry
│   ├── turso/                    # Database & auth modules
│   │   ├── mod.rs                # Module exports
│   │   ├── client.rs             # Turso client & user DB management
│   │   ├── auth.rs               # JWT validation (Supabase + legacy Clerk)
│   │   ├── config.rs             # Configuration structures
│   │   └── webhooks.rs           # Webhook handlers
│   ├── models/                   # Data models (trading domain)
│   ├── routes/                   # API route handlers
│   └── service/                  # Business logic services
├── build-docs/                   # Documentation & setup guides
│   ├── README.md                 # This comprehensive guide
│   ├── SETUP_GUIDE.md            # Detailed setup instructions
│   ├── SUPABASE_AUTH_IMPLEMENTATION_GUIDE.md
│   └── CLERK_MIGRATION_GUIDE.md  # Legacy migration docs
├── Database/                     # SQL schemas and migrations
├── Cargo.toml                    # Rust dependencies
├── .env.example                  # Environment variables template
└── README.md                     # Project root readme
```

## Key Features

### User Management
- **Secure Authentication**: Supabase Auth with email/password, OAuth providers
- **Automatic Database Provisioning**: Each user gets a dedicated Turso database
- **User Isolation**: Complete data separation between users
- **Profile Management**: User settings and preferences

### Trading Journal (Planned)
- **Trade Tracking**: Record buy/sell orders with detailed metadata
- **Portfolio Management**: Multiple portfolios per user
- **Position Tracking**: Real-time position calculations
- **P&L Analysis**: Detailed profit/loss tracking
- **Tag System**: Categorize trades with custom tags
- **Strategy Tracking**: Link trades to trading strategies

### Analytics & Reporting (Planned)
- **Performance Metrics**: Win rate, Sharpe ratio, maximum drawdown
- **Trade Analysis**: Pattern recognition and trade quality scoring
- **Risk Management**: Position sizing and risk metrics
- **Custom Reports**: Exportable reports in multiple formats
- **Data Visualization**: Interactive charts and graphs

## API Endpoints

### Public Endpoints
- `GET /` - API information and version
- `GET /health` - System health check
- `POST /webhooks/supabase` - Supabase Auth webhooks
- `POST /webhooks/clerk` - Legacy Clerk webhooks (migration period)
- `GET /profile` - User profile (works with/without auth)

### Protected Endpoints (Require JWT)
- `GET /me` - Current user information
- `GET /my-data` - User's personal database data

### Planned Trading Endpoints
- `POST /trades` - Create new trade
- `GET /trades` - List user's trades
- `PUT /trades/:id` - Update trade
- `DELETE /trades/:id` - Delete trade
- `GET /portfolio` - Portfolio summary
- `GET /analytics` - Trading analytics

## Authentication Flow

### User Registration
1. User signs up via Supabase Auth (frontend)
2. Supabase generates UUID for user
3. Supabase sends webhook to `/webhooks/supabase`
4. Backend creates dedicated Turso database for user
5. Database URL + token stored in central registry
6. User can immediately start using their isolated database

### Request Authentication
1. Frontend includes Supabase JWT in `Authorization: Bearer <token>`
2. Backend validates JWT using Supabase JWKS endpoint
3. User ID extracted from JWT `sub` claim
4. User's database connection retrieved from registry
5. Request proceeds with user-specific database context

## Environment Variables

```bash
# Turso Configuration
REGISTRY_DB_URL=libsql://registry-db-[org].turso.io
REGISTRY_DB_TOKEN=your-registry-token
TURSO_API_TOKEN=your-turso-api-token
TURSO_ORG=your-organization-name

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Server Configuration
PORT=6000
RUST_LOG=info

# Legacy (Migration Period)
CLERK_WEBHOOK_SECRET=your-clerk-secret  # Optional
```

## Database Schema Design

### Central Registry (`registry-db`)
```sql
-- User database registry
CREATE TABLE user_databases (
    user_id TEXT PRIMARY KEY,      -- Supabase UUID
    email TEXT NOT NULL,
    db_name TEXT NOT NULL,         -- user_[sanitized_id]
    db_url TEXT NOT NULL,          -- libsql://...
    db_token TEXT NOT NULL,        -- Database access token
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

### User Databases (Individual per user)
```sql
-- User profile and settings
CREATE TABLE user_profile (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL,         -- Links to Supabase UUID
    display_name TEXT,
    timezone TEXT DEFAULT 'UTC',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trading accounts (brokers)
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,            -- "Interactive Brokers", "TD Ameritrade"
    account_number TEXT,
    account_type TEXT,             -- "margin", "cash", "ira"
    currency TEXT DEFAULT 'USD',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trading strategies
CREATE TABLE strategies (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    rules TEXT,                    -- JSON or text
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Individual trades
CREATE TABLE trades (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id INTEGER REFERENCES accounts(id),
    strategy_id INTEGER REFERENCES strategies(id),
    
    -- Trade basics
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,            -- "buy", "sell"
    quantity DECIMAL(15,8) NOT NULL,
    price DECIMAL(15,8) NOT NULL,
    
    -- Trade metadata
    trade_type TEXT,               -- "market", "limit", "stop"
    order_id TEXT,                 -- Broker order ID
    execution_time TIMESTAMP NOT NULL,
    
    -- P&L calculation
    commission DECIMAL(10,4) DEFAULT 0,
    fees DECIMAL(10,4) DEFAULT 0,
    realized_pnl DECIMAL(15,4),
    
    -- Trade analysis
    setup_quality INTEGER,         -- 1-5 rating
    notes TEXT,
    tags TEXT,                     -- JSON array
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Portfolio positions (derived from trades)
CREATE TABLE positions (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id INTEGER REFERENCES accounts(id),
    symbol TEXT NOT NULL,
    quantity DECIMAL(15,8) NOT NULL,
    avg_cost DECIMAL(15,8) NOT NULL,
    market_value DECIMAL(15,4),
    unrealized_pnl DECIMAL(15,4),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(account_id, symbol)
);

-- Trade tags for categorization
CREATE TABLE trade_tags (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT,                    -- Hex color code
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, name)
);
```

## Development Workflow

### Prerequisites
- Rust 1.75+ (edition 2024)
- Node.js 18+ (for frontend)
- Turso CLI
- Supabase account

### Setup Process
1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd tradistry
   ```

2. **Backend Setup**
   ```bash
   # Install Rust dependencies
   cargo build
   
   # Set up environment variables
   cp .env.example .env
   # Edit .env with your credentials
   
   # Run the backend
   cargo run
   ```

3. **Database Setup**
   ```bash
   # Install Turso CLI
   curl -sSfL https://get.tur.so/install.sh | bash
   
   # Create registry database
   turso db create registry-db
   turso db tokens create registry-db
   
   # Initialize schema (run SQL from Database/ folder)
   ```

4. **Authentication Setup**
   - Create Supabase project
   - Configure authentication providers
   - Set up webhooks pointing to your backend
   - Update environment variables

### Running in Development
```bash
# Backend (Rust)
cargo run
# Serves on http://localhost:6000

# Frontend (Next.js) - when implemented
npm run dev
# Serves on http://localhost:3000
```

## Security Considerations

### Authentication Security
- **JWT Validation**: Proper signature verification using Supabase JWKS
- **Token Expiration**: Automatic token expiration handling
- **Secure Headers**: CORS and security headers properly configured

### Database Security
- **User Isolation**: Complete database separation per user
- **Token Management**: Individual database tokens with appropriate permissions
- **Input Validation**: All user inputs sanitized and validated
- **SQL Injection**: Parameterized queries throughout

### API Security
- **Rate Limiting**: (Planned) Implement rate limiting on API endpoints
- **HTTPS Only**: Production deployment requires HTTPS
- **Error Handling**: No sensitive information in error responses

## Migration from Clerk to Supabase

The application supports both Clerk and Supabase authentication during the migration period:

- **Dual Authentication**: JWT validator tries Supabase first, falls back to Clerk
- **Gradual Migration**: Users can be migrated incrementally
- **Data Preservation**: Existing user databases remain intact
- **Legacy Support**: Clerk webhooks still functional during transition

See `CLERK_MIGRATION_GUIDE.md` for detailed migration instructions.

## Performance Considerations

### Database Performance
- **Connection Pooling**: libSQL handles connection pooling automatically
- **Query Optimization**: Proper indexing on frequently queried columns
- **Database Proximity**: Turso's edge network reduces latency

### Application Performance
- **Async Everything**: Full async/await pattern throughout
- **Efficient Serialization**: serde for fast JSON processing
- **Memory Management**: Rust's zero-cost abstractions

## Monitoring & Observability

### Logging
- **Structured Logging**: JSON logs with proper log levels
- **Request Tracing**: All API requests logged with timing
- **Error Tracking**: Comprehensive error logging with context

### Health Checks
- **Database Health**: `/health` endpoint checks database connectivity
- **Service Status**: Version and configuration information available
- **Webhook Status**: Webhook processing success/failure tracking

## Future Roadmap

### Phase 1 - Core Trading Journal
- [ ] Complete schema implementation
- [ ] CRUD operations for trades
- [ ] Basic portfolio tracking
- [ ] Frontend implementation

### Phase 2 - Advanced Features
- [ ] Trading strategy tracking
- [ ] Advanced analytics
- [ ] Data import/export
- [ ] Mobile-responsive design

### Phase 3 - Analytics & Insights
- [ ] Machine learning insights
- [ ] Performance benchmarking
- [ ] Risk analysis tools
- [ ] Custom dashboard builder

### Phase 4 - Community & Sharing
- [ ] Strategy sharing (opt-in)
- [ ] Community insights
- [ ] Leaderboards (anonymous)
- [ ] Educational content integration

## Contributing

### Code Style
- **Rust**: Follow rustfmt and clippy recommendations
- **TypeScript**: ESLint + Prettier configuration
- **Documentation**: Comprehensive inline documentation
- **Testing**: Unit tests for all business logic

### Development Process
1. Create feature branch from `main`
2. Implement feature with tests
3. Update documentation
4. Create pull request
5. Code review and merge

## Support & Documentation

### Additional Documentation
- **[SETUP_GUIDE.md](./SETUP_GUIDE.md)**: Detailed setup instructions
- **[SUPABASE_AUTH_IMPLEMENTATION_GUIDE.md](./SUPABASE_AUTH_IMPLEMENTATION_GUIDE.md)**: Authentication implementation
- **[CLERK_MIGRATION_GUIDE.md](./CLERK_MIGRATION_GUIDE.md)**: Migration from Clerk

### Getting Help
- **Issues**: Create GitHub issues for bugs and feature requests
- **Discussions**: Use GitHub Discussions for questions
- **Documentation**: Check the `build-docs/` folder for detailed guides

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Built with ❤️ for traders, by traders**

*Tradistry aims to democratize trading analytics and help every trader improve their performance through data-driven insights.*
