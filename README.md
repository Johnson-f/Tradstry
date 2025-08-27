# Tradistry Backend API

A Go-based REST API for trading journal and analytics platform using Fiber framework.

## Project Structure

```
tradistry_backend/
├── main.go                 # Application entry point
├── config/                 # Configuration management
│   └── config.go          # Environment-based configuration
├── models/                 # Data models and structures
│   ├── user.go            # User model and DTOs
│   └── trade.go           # Trade model and DTOs
├── routers/               # Route handlers
│   ├── user_router.go     # User-related routes
│   └── trade_router.go    # Trade-related routes
├── services/              # Business logic layer
│   ├── user_service.go    # User business logic
│   └── trade_service.go   # Trade business logic
├── middleware/            # Custom middleware
│   ├── auth.go           # Authentication middleware
│   └── validation.go     # Validation middleware
└── utils/                 # Utility functions
    └── response.go        # Response helpers
```

## API Endpoints

### Health & Info
- `GET /` - Welcome message
- `GET /health` - Health check
- `GET /api/v1/ping` - API ping

### Users
- `POST /api/v1/users` - Create user
- `GET /api/v1/users` - Get all users
- `GET /api/v1/users/:id` - Get user by ID
- `PUT /api/v1/users/:id` - Update user
- `DELETE /api/v1/users/:id` - Delete user

### Trades
- `POST /api/v1/trades` - Create trade
- `GET /api/v1/trades` - Get all trades
- `GET /api/v1/trades/:id` - Get trade by ID
- `PUT /api/v1/trades/:id` - Update trade
- `DELETE /api/v1/trades/:id` - Delete trade
- `POST /api/v1/trades/:id/close` - Close trade

### Analytics
- `GET /api/v1/trades/analytics/summary` - Trading summary
- `GET /api/v1/trades/analytics/performance` - Performance metrics

## Configuration

The application uses environment variables for configuration:

```bash
# Server
PORT=9000
HOST=localhost
ENV=development

# Database (for future implementation)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=tradistry
DB_SSLMODE=disable

# JWT (for future implementation)
JWT_SECRET=your-secret-key
JWT_EXPIRY_HOURS=24
```

## Running the Application

```bash
# Install dependencies
go mod tidy

# Run the application
go run main.go

# Or build and run
go build -o tradistry_backend
./tradistry_backend
```

The server will start on port 9000 by default.

## Development

### Adding New Features

1. **Models**: Add new data structures in `models/`
2. **Services**: Implement business logic in `services/`
3. **Routers**: Define API endpoints in `routers/`
4. **Middleware**: Add custom middleware in `middleware/`

### Architecture

- **Models**: Define data structures and DTOs
- **Services**: Handle business logic and data processing
- **Routers**: Handle HTTP requests and responses
- **Middleware**: Handle cross-cutting concerns (auth, validation, etc.)
- **Config**: Manage application configuration
- **Utils**: Shared utility functions

## Next Steps

1. Integrate database (PostgreSQL/GORM)
2. Implement JWT authentication
3. Add request validation
4. Add comprehensive error handling
5. Add unit tests
6. Add API documentation (Swagger)
7. Add logging and monitoring
