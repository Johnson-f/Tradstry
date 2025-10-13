# Tradistry API - Turso & Clerk Setup Guide

This guide will help you set up the Tradistry API with Turso database and Clerk authentication.

## Architecture Overview

This system implements a multi-tenant architecture where:
- **Clerk** handles user authentication and sends webhooks when users sign up
- **Turso** provides individual databases for each user
- A **central registry database** stores mappings between users and their databases
- Each user gets their own isolated database upon signup

## Prerequisites

1. **Turso Account**: Sign up at https://turso.tech
2. **Clerk Account**: Sign up at https://clerk.com
3. **Rust**: Latest stable version

## Step 1: Set Up Turso

### 1.1 Install Turso CLI
```bash
curl -sSfL https://get.tur.so/install.sh | bash
```

### 1.2 Login to Turso
```bash
turso auth login
```

### 1.3 Create Organization (if needed)
```bash
turso org create your-org-name
```

### 1.4 Create Central Registry Database
```bash
# Create the main database for storing user database mappings
turso db create registry-db

# Get the database URL and create a token
turso db show registry-db
turso db tokens create registry-db
```

### 1.5 Initialize Registry Database Schema
```bash
# Connect to your registry database
turso db shell registry-db

# Run the SQL from database/01_users_table.sql
.read database/01_users_table.sql
.exit
```

### 1.6 Get API Token
```bash
turso auth api-tokens mint your-token-name
```

## Step 2: Set Up Clerk

### 2.1 Create Clerk Application
1. Go to https://dashboard.clerk.com
2. Create a new application
3. Choose your preferred authentication methods

### 2.2 Configure Webhook
1. In the Clerk dashboard, go to "Webhooks"
2. Create a new webhook endpoint pointing to: `https://your-domain.com/webhooks/clerk`
3. Subscribe to the `user.created` event
4. Copy the webhook signing secret

### 2.3 Get Clerk Configuration
From your Clerk dashboard, copy:
- Publishable Key (for frontend)
- Secret Key (for backend JWT verification)
- Webhook Signing Secret

## Step 3: Environment Configuration

Create a `.env` file in your project root:

```bash
# Turso Configuration
REGISTRY_DB_URL=libsql://registry-db-[your-org].turso.io
REGISTRY_DB_TOKEN=your-registry-db-token-here

# Turso API Configuration (for creating new databases)
TURSO_API_TOKEN=your-turso-api-token-here
TURSO_ORG=your-turso-organization-name

# Clerk Configuration
CLERK_WEBHOOK_SECRET=your-clerk-webhook-signing-secret-here

# Server Configuration
PORT=3000
RUST_LOG=debug
```

**Important Notes:**
- Replace `[your-org]` with your actual Turso organization name
- Replace all placeholder values with your actual tokens and secrets
- Keep these values secure and never commit them to version control

## Step 4: User Database Schema Planning

When ready to implement your user database schema, you'll need to:

1. **Define Your Schema**: Create SQL files for your user tables (trades, portfolios, etc.)

2. **Update Schema Initialization**: Modify the `initialize_user_database_schema` function in `src/turso/client.rs` to create your tables

3. **Example Schema Structure**:
   ```sql
   -- Example user database schema
   CREATE TABLE IF NOT EXISTS trades (
       id INTEGER PRIMARY KEY,
       user_id TEXT NOT NULL,
       symbol TEXT NOT NULL,
       quantity REAL NOT NULL,
       price REAL NOT NULL,
       trade_type TEXT NOT NULL,
       executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   
   CREATE TABLE IF NOT EXISTS portfolios (
       id INTEGER PRIMARY KEY,
       user_id TEXT NOT NULL,
       name TEXT NOT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```

## Step 5: Running the Application

### 5.1 Build and Run
```bash
# Install dependencies and build
cargo build

# Run the application
cargo run
```

### 5.2 Test the Setup

1. **Health Check**: `GET http://localhost:3000/health`
2. **Root Endpoint**: `GET http://localhost:3000/`

### 5.3 Test User Creation Flow

1. **Configure Clerk**: Set up your frontend with Clerk
2. **User Signup**: When a user signs up through Clerk, it should trigger the webhook
3. **Database Creation**: Check logs to see if user database is created successfully
4. **Verify Registry**: Check your registry database to see if the user entry was created

## Step 6: API Endpoints

### Public Endpoints
- `GET /` - API information
- `GET /health` - Health check
- `POST /webhooks/clerk` - Clerk webhook handler

### Protected Endpoints (require Clerk JWT)
- `GET /me` - Get current user info
- `GET /my-data` - Get user's personal data from their database

### Optional Auth Endpoints
- `GET /profile` - Get profile (works with or without auth)

## Step 7: Production Deployment

For production deployment:

1. **Environment Variables**: Set all required environment variables
2. **HTTPS**: Ensure your webhook endpoint uses HTTPS
3. **Database Security**: Use strong tokens and rotate them regularly
4. **Monitoring**: Set up logging and monitoring for database operations
5. **Backup**: Configure Turso database backups

## Troubleshooting

### Common Issues

1. **Webhook Signature Verification Fails**
   - Check that `CLERK_WEBHOOK_SECRET` matches the one in Clerk dashboard
   - Ensure webhook URL is correct and accessible

2. **Database Connection Issues**
   - Verify `REGISTRY_DB_URL` and `REGISTRY_DB_TOKEN` are correct
   - Check Turso organization name and database exists

3. **User Database Creation Fails**
   - Verify `TURSO_API_TOKEN` has correct permissions
   - Check `TURSO_ORG` name is correct
   - Ensure API token isn't expired

4. **Compilation Errors**
   - Run `cargo clean && cargo build` to rebuild from scratch
   - Check that all dependencies are properly installed

### Logs to Check

Enable debug logging with `RUST_LOG=debug` to see:
- Webhook signature verification
- Database creation attempts
- Registry database operations
- User database connections

## Security Considerations

1. **Never expose database tokens** in logs or error messages
2. **Rotate API tokens** regularly
3. **Use HTTPS** for all webhook endpoints
4. **Validate all user inputs** before database operations
5. **Implement rate limiting** for API endpoints
6. **Monitor database usage** to prevent abuse

## Next Steps

Once you have the basic system running:

1. Implement your trading journal schema
2. Add CRUD operations for trades and portfolios
3. Implement data analytics endpoints
4. Add user settings management
5. Set up automated backups
6. Implement data export functionality

## Support

If you encounter issues:
1. Check the logs for error messages
2. Verify all environment variables are set correctly
3. Test webhook delivery in Clerk dashboard
4. Check Turso dashboard for database status
