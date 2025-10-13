# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is a Rust backend API service built with Actix Web that integrates with both Supabase (primary) and Turso databases. The system implements a multi-tenant architecture where each user gets their own dedicated Turso database, with Supabase handling authentication and user management.

## Development Commands

### Building and Running
```bash
# Build the project
cargo build

# Run the development server (default port 3000)
cargo run

# Run with custom port via start script
./start.sh  # Runs on port 9000 with info-level logging

# Run with custom environment
PORT=8080 RUST_LOG=debug cargo run
```

### Testing and Quality
```bash
# Run tests
cargo test

# Check code formatting
cargo fmt --check

# Apply code formatting
cargo fmt

# Run clippy for linting
cargo clippy

# Run clippy with all targets and features
cargo clippy --all-targets --all-features
```

### Dependency Management
```bash
# Add a new dependency (recommended approach from GEMINI.MD)
cargo add package_name

# Add with specific features
cargo add reqwest --features json

# Remove a dependency
cargo remove package_name

# Update dependencies
cargo update
```

### Database Operations
```bash
# Test database connection health
curl http://localhost:3000/health

# Check registry database status (requires proper env setup)
RUST_LOG=debug cargo run
```

## Architecture Overview

### Core Architecture Pattern
The system implements a **multi-tenant database-per-user architecture**:
- **Central Registry**: A Turso database storing user-to-database mappings
- **User Databases**: Individual Turso databases created per user for data isolation
- **Authentication**: Supabase Auth with JWT validation
- **Migration Support**: Dual authentication support for Clerk (legacy) and Supabase

### Key Components

#### Authentication Flow
1. **Frontend**: Users authenticate via Supabase Auth
2. **Token Validation**: Backend validates Supabase JWT tokens
3. **Fallback**: Clerk JWT validation during migration period
4. **Authorization**: User-specific database access based on validated identity

#### Module Structure
- **`turso/`**: Database client, configuration, auth validation, webhook handling
- **`routes/`**: API endpoint handlers (user routes, options routes)  
- **`models/`**: Data structures and database schemas
- **`main.rs`**: Application bootstrap, middleware setup, route configuration

#### Database Architecture
- **Registry Database**: Stores user metadata and database mappings
- **User Databases**: Per-user isolated data storage
- **Connection Pooling**: Managed via libsql connections
- **Health Monitoring**: Built-in health checks for all database connections

### Configuration Requirements

The application requires several environment variables for proper operation:

**Turso Configuration:**
- `REGISTRY_DB_URL`: Central registry database URL
- `REGISTRY_DB_TOKEN`: Registry database authentication token  
- `TURSO_API_TOKEN`: API token for creating new user databases
- `TURSO_ORG`: Organization name in Turso

**Supabase Configuration:**
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Public API key
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for admin operations

**Server Configuration:**
- `PORT`: Server port (defaults to 3000 or 6000)
- `RUST_LOG`: Logging level (debug, info, warn, error)

### Key API Endpoints

**Public Endpoints:**
- `GET /`: API information and health
- `GET /health`: Database connectivity check
- `GET /profile`: Authentication status (works with or without auth)

**Webhook Endpoints:**
- `POST /webhooks/supabase`: Handles Supabase Auth events
- `POST /webhooks/clerk`: Legacy Clerk webhook support

**Protected Endpoints (JWT Required):**
- `GET /me`: Current authenticated user info
- `GET /my-data`: User's personal database data
- `GET /users`: List all users (paginated)
- `GET /users/:id`: Get specific user by ID

### Development Guidelines

#### Code Style (from GEMINI.MD)
- Write idiomatic Rust code following existing patterns
- Add comments explaining complex logic (the "why", not the "what")
- Use `cargo add`/`cargo remove`/`cargo update` for dependency management
- Never modify Cargo.toml directly
- Ensure all changes include appropriate tests
- Research current syntax - avoid outdated patterns

#### Authentication Patterns
- Always handle both Supabase and Clerk claims during migration period
- Extract user ID using appropriate helper functions (`get_supabase_user_id`, `get_user_id`)
- Store authentication claims in request extensions
- Use proper error handling for authentication failures

#### Database Patterns
- Access user databases through `AppState.get_user_db_connection()`
- Always check for database existence before querying
- Use proper error handling for database operations
- Implement health checks for new database connections

### Testing Strategy

When adding new features:
1. **Unit Tests**: Test individual functions and modules
2. **Integration Tests**: Test API endpoints with mock authentication
3. **Database Tests**: Test database operations with test databases
4. **Webhook Tests**: Test webhook handlers with sample payloads

### Deployment Notes

The application is designed for containerized deployment:
- Uses standard Rust build patterns
- Requires environment variables for configuration
- Supports health check endpoints for orchestration
- Implements graceful error handling for production use

### Migration Considerations

The system currently supports a migration from Clerk to Supabase:
- Dual authentication support in middleware
- Webhook handlers for both systems
- User ID extraction methods for both providers
- Gradual migration path without service interruption