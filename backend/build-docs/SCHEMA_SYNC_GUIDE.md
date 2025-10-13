# Schema Synchronization System

This system automatically synchronizes user database schemas with the current application schema when users sign in, ensuring that existing users get the latest schema changes and new users start with the updated schema.

## How It Works

### 1. Schema Versioning
- Each schema change is versioned (currently at `1.0.0`)
- The system tracks schema versions in a `schema_version` table in each user database
- When you update the schema in `TursoClient::get_expected_schema()`, increment the version in `TursoClient::get_current_schema_version()`

### 2. Automatic Synchronization
- **New Users**: Get the latest schema automatically when their database is created
- **Existing Users**: Schema is synchronized automatically when they call the `/api/user/initialize` endpoint
- **Manual Sync**: Users can manually trigger schema sync via `/api/user/sync-schema/{user_id}`

### 3. Schema Comparison
The system compares:
- **Tables**: Checks if all expected tables exist
- **Columns**: Adds missing columns to existing tables
- **Indexes**: Creates missing indexes
- **Triggers**: Creates missing triggers

## API Endpoints

### Initialize User Database (with Schema Sync)
```http
POST /api/user/initialize
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "email": "user@example.com",
  "user_id": "user_123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User database initialized successfully",
  "database_url": "libsql://user-123.turso.io",
  "database_token": "eyJ...",
  "schema_synced": true,
  "schema_version": "1.0.0"
}
```

### Manual Schema Synchronization
```http
POST /api/user/sync-schema/{user_id}
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Schema synchronized successfully",
  "schema_version": "1.0.0",
  "synced_at": "2024-01-15T10:30:00Z"
}
```

### Check Schema Version
```http
GET /api/user/schema-version/{user_id}
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "user_schema_version": "1.0.0",
  "user_schema_description": "Initial trading schema...",
  "user_schema_created_at": "2024-01-15T10:30:00Z",
  "current_app_version": "1.0.0",
  "current_app_description": "Initial trading schema...",
  "is_up_to_date": true
}
```

## Adding New Schema Changes

### Step 1: Update Schema Definition
Modify the `get_expected_schema()` method in `TursoClient` to include your new tables, columns, indexes, or triggers.

### Step 2: Increment Version
Update the version in `get_current_schema_version()`:

```rust
pub fn get_current_schema_version() -> SchemaVersion {
    SchemaVersion {
        version: "1.1.0".to_string(), // Increment this
        description: "Added new feature X with table Y".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    }
}
```

### Step 3: Deploy
When you deploy the new version:
- **New users** will automatically get the new schema
- **Existing users** will get the schema updates when they next sign in (via `/initialize` endpoint)
- Users can also manually trigger sync via the `/sync-schema` endpoint

## Example: Adding a New Table

```rust
// In get_expected_schema(), add:
TableSchema {
    name: "new_feature_table".to_string(),
    columns: vec![
        ColumnInfo { 
            name: "id".to_string(), 
            data_type: "INTEGER".to_string(), 
            is_nullable: false, 
            default_value: None, 
            is_primary_key: true 
        },
        ColumnInfo { 
            name: "user_data".to_string(), 
            data_type: "TEXT".to_string(), 
            is_nullable: false, 
            default_value: None, 
            is_primary_key: false 
        },
        // ... more columns
    ],
    indexes: vec![
        IndexInfo { 
            name: "idx_new_feature_user_data".to_string(), 
            table_name: "new_feature_table".to_string(), 
            columns: vec!["user_data".to_string()], 
            is_unique: false 
        },
    ],
    triggers: vec![],
},
```

## Benefits

1. **Seamless Updates**: Users automatically get new features without manual intervention
2. **Backward Compatibility**: Existing data is preserved during schema updates
3. **Version Tracking**: Full audit trail of schema changes
4. **Manual Control**: Users can manually trigger sync if needed
5. **Error Handling**: Graceful handling of sync failures with detailed logging

## Monitoring

The system provides detailed logging for:
- Schema synchronization attempts
- Version comparisons
- Migration applications
- Error conditions

Check your application logs to monitor schema sync operations.
