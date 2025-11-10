# Brokerage Page Endpoints Flow

This document outlines all API endpoints used in the brokerage page (`app/app/brokerage/page.tsx`) from initialization through connection and data fetching.

## Base URL
All endpoints are prefixed with: `{API_BASE_URL}/api`

---

## 1. Page Initialization (Auto-fetch on Mount)

When the brokerage page loads, these endpoints are automatically called to fetch existing data:

### 1.1 List Connections
- **Endpoint**: `GET /api/brokerage/connections`
- **Method**: `GET`
- **Purpose**: Fetch all brokerage connections for the user
- **Called by**: `useBrokerage()` hook on mount
- **Response**: Array of `BrokerageConnection` objects

### 1.2 List Accounts
- **Endpoint**: `GET /api/brokerage/accounts`
- **Method**: `GET`
- **Purpose**: Fetch all brokerage accounts
- **Called by**: `useBrokerage()` hook on mount
- **Response**: Array of `BrokerageAccount` objects

### 1.3 List Transactions
- **Endpoint**: `GET /api/brokerage/transactions`
- **Method**: `GET`
- **Purpose**: Fetch all brokerage transactions
- **Called by**: `useBrokerage()` hook on mount
- **Query Params**: Optional `account_id` filter
- **Response**: Array of `BrokerageTransaction` objects

### 1.4 List Holdings
- **Endpoint**: `GET /api/brokerage/holdings`
- **Method**: `GET`
- **Purpose**: Fetch all brokerage holdings (positions)
- **Called by**: `useBrokerage()` hook on mount
- **Query Params**: Optional `account_id` filter
- **Response**: Array of `BrokerageHolding` objects

---

## 2. Connection Flow

### 2.1 Initiate Connection
- **Endpoint**: `POST /api/brokerage/connections/initiate`
- **Method**: `POST`
- **Purpose**: Start a new brokerage connection
- **Triggered by**: "Initiate Connection" button click
- **Request Body**:
  ```json
  {
    "brokerage_id": "alderaan" | "questrade" | etc.,
    "connection_type": "read" | "trade"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "redirect_url": "https://app.snaptrade.com/...",
      "connection_id": "session-id-here"
    }
  }
  ```
- **What happens**: 
  - Creates/gets SnapTrade user
  - Generates connection portal URL
  - Opens portal in new tab
  - Stores connection as "pending" in database

### 2.2 Check Connection Status
- **Endpoint**: `GET /api/brokerage/connections/{id}/status`
- **Method**: `GET`
- **Purpose**: Check the current status of a connection
- **Triggered by**: Status check button (Activity icon)
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "status": "pending" | "connected" | "disconnected"
    }
  }
  ```
- **What happens**: 
  - Checks actual status from SnapTrade
  - Updates local database if status changed to "connected"

### 2.3 Complete Connection Sync
- **Endpoint**: `POST /api/brokerage/connections/{id}/complete`
- **Method**: `POST`
- **Purpose**: Complete the post-connection sync flow (fetch and store all data)
- **Triggered by**: "Continue" button (shown for "connected" or "pending" connections)
- **What happens**:
  1. Checks connection status from SnapTrade (updates if needed)
  2. Calls `/api/v1/accounts/sync` (Go service) to list accounts
  3. For each account:
     - Gets account detail
     - Gets equity positions (`/api/v1/accounts/{id}/holdings`)
     - Gets option positions (`/api/v1/accounts/{id}/holdings/options`)
     - Gets transactions (`/api/v1/accounts/{id}/transactions`)
  4. Stores all data in database
  5. Updates `last_sync_at` timestamp
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "accounts_synced": 1,
      "holdings_synced": 5,
      "transactions_synced": 152,
      "last_sync_at": "2025-11-09T20:18:48Z"
    }
  }
  ```

### 2.4 Delete Connection
- **Endpoint**: `DELETE /api/brokerage/connections/{id}`
- **Method**: `DELETE`
- **Purpose**: Delete a brokerage connection
- **Triggered by**: Delete button (Trash icon)
- **What happens**: 
  - Deletes connection from local database
  - Optionally deletes from SnapTrade (if connection_id exists)

---

## 3. Manual Sync & Refresh

### 3.1 Sync Accounts (Manual)
- **Endpoint**: `POST /api/brokerage/accounts/sync`
- **Method**: `POST`
- **Purpose**: Manually sync all accounts, holdings, and transactions for all connected connections
- **Triggered by**: "Sync Accounts" button
- **What happens**:
  - For each "connected" connection:
    - Calls Go service `/api/v1/accounts/sync`
    - Stores accounts, holdings, and transactions in database
    - Updates `last_sync_at` timestamp
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "accounts_synced": 1,
      "holdings_synced": 5,
      "transactions_synced": 152,
      "last_sync_at": "2025-11-09T20:18:48Z"
    }
  }
  ```

### 3.2 Refresh Connections
- **Endpoint**: `GET /api/brokerage/connections`
- **Method**: `GET`
- **Triggered by**: "Refresh" button in Connections section
- **Same as**: 1.1 List Connections

### 3.3 Refresh Accounts
- **Endpoint**: `GET /api/brokerage/accounts`
- **Method**: `GET`
- **Triggered by**: "Refresh" button in Accounts section
- **Same as**: 1.2 List Accounts

### 3.4 Refresh Transactions
- **Endpoint**: `GET /api/brokerage/transactions`
- **Method**: `GET`
- **Triggered by**: "Refresh" button in Transactions section
- **Same as**: 1.3 List Transactions

### 3.5 Refresh Holdings
- **Endpoint**: `GET /api/brokerage/holdings`
- **Method**: `GET`
- **Triggered by**: "Refresh" button in Holdings section
- **Same as**: 1.4 List Holdings

---

## Complete Flow Summary

### Initialization Flow
```
Page Load
  ├─> GET /api/brokerage/connections
  ├─> GET /api/brokerage/accounts
  ├─> GET /api/brokerage/transactions
  └─> GET /api/brokerage/holdings
```

### New Connection Flow
```
1. User enters brokerage ID
2. User clicks "Initiate Connection"
   └─> POST /api/brokerage/connections/initiate
       ├─> Creates/gets SnapTrade user (if needed)
       ├─> Generates connection portal URL
       └─> Returns redirect_url
3. User redirected to SnapTrade portal (new tab)
4. User completes authentication in portal
5. User returns to app
6. User clicks "Continue" button
   └─> POST /api/brokerage/connections/{id}/complete
       ├─> Checks connection status
       ├─> Lists accounts from SnapTrade
       ├─> For each account:
       │   ├─> Gets account detail
       │   ├─> Gets equity positions
       │   ├─> Gets option positions
       │   └─> Gets transactions
       └─> Stores all data in database
7. Page auto-refreshes:
   ├─> GET /api/brokerage/connections
   ├─> GET /api/brokerage/accounts
   ├─> GET /api/brokerage/transactions
   └─> GET /api/brokerage/holdings
```

### Manual Sync Flow
```
User clicks "Sync Accounts" button
  └─> POST /api/brokerage/accounts/sync
      ├─> For each connected connection:
      │   ├─> Calls Go service to sync
      │   └─> Stores data in database
      └─> Returns sync summary
  └─> Auto-refreshes:
      ├─> GET /api/brokerage/accounts
      ├─> GET /api/brokerage/transactions
      └─> GET /api/brokerage/holdings
```

---

## Backend Routes (Rust)

All endpoints are handled in `backend/src/routes/brokerage.rs`:

- `initiate_connection` → `POST /api/brokerage/connections/initiate`
- `list_connections` → `GET /api/brokerage/connections`
- `get_connection_status` → `GET /api/brokerage/connections/{id}/status`
- `complete_connection_sync` → `POST /api/brokerage/connections/{id}/complete`
- `delete_connection` → `DELETE /api/brokerage/connections/{id}`
- `list_accounts` → `GET /api/brokerage/accounts`
- `sync_accounts` → `POST /api/brokerage/accounts/sync`
- `get_transactions` → `GET /api/brokerage/transactions`
- `get_holdings` → `GET /api/brokerage/holdings`

---

## Go Service Endpoints (Called by Rust Backend)

The Rust backend calls these Go service endpoints (in `backend/snaptrade-service/`):

- `POST /api/v1/users` - Create SnapTrade user
- `POST /api/v1/connections/initiate` - Generate connection portal URL
- `GET /api/v1/connections/{id}/status` - Check connection status
- `POST /api/v1/accounts/sync` - List and sync accounts
- `GET /api/v1/accounts/{id}` - Get account detail
- `GET /api/v1/accounts/{id}/holdings` - Get equity positions
- `GET /api/v1/accounts/{id}/holdings/options` - Get option positions
- `GET /api/v1/accounts/{id}/transactions` - Get transactions

---

## Authentication

All endpoints require authentication via Supabase JWT token:
- Header: `Authorization: Bearer {supabase_access_token}`
- Token is obtained from: `supabase.auth.getSession()`

