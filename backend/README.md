# Rust + Supabase Backend

A production-ready Rust backend API with Supabase integration, featuring JWT authentication, database connection pooling, and secure API endpoints.

## 🚀 Features

- **Supabase Integration**: Complete authentication and database connectivity
- **JWT Authentication**: Secure token validation with middleware
- **Database Connection Pool**: Optimized PostgreSQL connections using SQLx
- **RESTful API**: Clean, type-safe API endpoints with Axum
- **CORS & Tracing**: Built-in CORS support and comprehensive logging
- **Type Safety**: Full TypeScript-level type safety in Rust
- **Production Ready**: Error handling, health checks, and proper configuration

## 📋 Prerequisites

- Rust 1.70+ 
- A Supabase project
- PostgreSQL database access

## 🛠️ Quick Start

### 1. Clone and Setup

```bash
git clone <repository>
cd model
```

### 2. Configure Environment

Copy the example environment file and fill in your Supabase credentials:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase project details:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
DATABASE_URL=postgresql://postgres:your-password@db.your-project-ref.supabase.co:5432/postgres
JWT_SECRET=your-jwt-secret-here
PORT=3000
```

### 3. Run the Application

```bash
cargo run
```

The server will start at `http://localhost:3000`

## 🔐 Authentication Flow

This backend is designed to work with Supabase Auth on the frontend:

1. **Frontend**: Users authenticate via Supabase Auth (sign up, sign in, social login, etc.)
2. **Frontend**: Gets JWT token from Supabase client
3. **Frontend**: Sends requests to this API with `Authorization: Bearer <jwt-token>`
4. **Backend**: Validates JWT token and extracts user information
5. **Backend**: Processes authenticated requests with proper authorization

## 📡 API Endpoints

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | API information |
| `GET` | `/health` | Health check |

### Optional Authentication

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/profile` | User profile (shows auth status) |

### Protected Endpoints (Require JWT)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/me` | Current authenticated user |
| `GET` | `/users` | List all users (paginated) |
| `GET` | `/users/:id` | Get user by ID |

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | JWT secret from Supabase settings |
| `PORT` | ❌ | Server port (default: 3000) |
| `RUST_LOG` | ❌ | Log level (default: debug) |

### Getting Supabase Credentials

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Settings** → **API**
4. Copy the values:
   - **URL**: `SUPABASE_URL`
   - **anon/public key**: `SUPABASE_ANON_KEY`  
   - **service_role key**: `SUPABASE_SERVICE_ROLE_KEY`
5. For `JWT_SECRET`: Go to **Settings** → **API** → **JWT Settings** → Copy the **JWT Secret**
6. For `DATABASE_URL`: Go to **Settings** → **Database** → Connection string (URI)

## 🏗️ Architecture

```
src/
├── main.rs              # Application entry point and API routes
└── supabase/           # Supabase integration module
    ├── mod.rs          # Module exports and AppState
    ├── config.rs       # Configuration and JWT structures
    ├── client.rs       # Supabase HTTP API client
    ├── database.rs     # PostgreSQL connection and queries
    ├── auth.rs         # JWT middleware and auth helpers
    └── readme.md       # Supabase module documentation
```

## 🔒 Security Features

- **JWT Validation**: All protected endpoints validate Supabase JWT tokens
- **Row Level Security**: Database queries respect PostgreSQL RLS policies
- **CORS Configuration**: Configurable CORS for frontend integration
- **Error Handling**: Secure error responses without leaking sensitive data
- **Connection Pooling**: Secure, optimized database connections

## 🚀 Frontend Integration

### JavaScript/TypeScript Example

```javascript
// Initialize Supabase client (frontend)
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://your-project-ref.supabase.co',
  'your-anon-key'
)

// Authenticate user
const { data: { session } } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
})

// Make authenticated request to your Rust API
const response = await fetch('http://localhost:3000/me', {
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  }
})

const userData = await response.json()
```

## 🧪 Testing

```bash
# Run tests
cargo test

# Run with coverage
cargo tarpaulin --out html

# Check code formatting
cargo fmt --check

# Run clippy for linting
cargo clippy
```

## 📦 Dependencies

### Core Dependencies
- **axum**: Web framework
- **tokio**: Async runtime
- **sqlx**: Database toolkit
- **jsonwebtoken**: JWT validation
- **serde**: Serialization

### Development Dependencies
- **tower-http**: HTTP middleware
- **tracing**: Structured logging
- **reqwest**: HTTP client
- **dotenvy**: Environment variables

## 🚀 Production Deployment

### Docker

```dockerfile
FROM rust:1.70 as builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/model /app/model
EXPOSE 3000
CMD ["/app/model"]
```

### Environment Setup

Ensure all environment variables are properly set in your production environment.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Related Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Axum Documentation](https://docs.rs/axum)
- [SQLx Documentation](https://docs.rs/sqlx)
- [Rust Book](https://doc.rust-lang.org/book/)
