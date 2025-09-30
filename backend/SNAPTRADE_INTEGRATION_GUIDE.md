# SnapTrade Broker Integration Guide

**Complete implementation guide for integrating SnapTrade API to fetch users' historical brokerage transaction data.**

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Database Setup](#database-setup)
5. [Backend Implementation](#backend-implementation)
6. [Integration Workflow](#integration-workflow)
7. [API Endpoints](#api-endpoints)
8. [Security](#security)
9. [Testing & Monitoring](#testing--monitoring)

---

## Overview

### What is SnapTrade?

SnapTrade provides unified API access to **20+ brokerages** (TD Ameritrade, Robinhood, Fidelity, Schwab, Interactive Brokers, etc.) enabling:
- Historical transaction imports (BUY, SELL, DIVIDEND, etc.)
- Real-time account data (positions, balances, orders)
- Multi-broker aggregation via single API

### Benefits for Tradistry

- ✅ **Eliminate manual trade entry** - Automatic sync from brokers
- ✅ **100% accuracy** - No typos or missing trades
- ✅ **Historical imports** - Complete trading history
- ✅ **Real-time updates** - Keep journal synchronized
- ✅ **Better analytics** - More complete data

**Documentation:**
- Main Docs: https://docs.snaptrade.com/docs
- API Reference: https://docs.snaptrade.com/reference
- Python SDK: https://pypi.org/project/snaptrade-python-sdk/11.0.139/

---

## Architecture

### High-Level Flow

```
┌─────────────┐
│  Frontend   │  1. User clicks "Connect Broker"
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Backend   │  2. Create SnapTrade user + Get OAuth URL
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Browser   │  3. User completes OAuth (logs into broker)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  SnapTrade  │  4. Stores encrypted credentials + Sends webhook
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Backend   │  5. Fetches transactions + Saves to database
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Database   │  6. Store transactions for journal integration
└─────────────┘
```

### Component Structure

```
backend/
├── config/
│   └── snaptrade_config.py          # Configuration settings
├── services/
│   └── brokerage/
│       ├── snaptrade_client.py      # SnapTrade SDK wrapper
│       ├── brokerage_service.py     # Orchestration service
│       └── transaction_sync_service.py
├── dal/
│   └── brokerage/
│       ├── connection_dal.py        # Connection CRUD
│       ├── account_dal.py           # Account CRUD
│       └── transaction_dal.py       # Transaction CRUD
├── models/
│   └── brokerage.py                 # Pydantic models
└── routers/
    └── brokerage.py                 # API endpoints

Database /
└── 05_Brokerage_Integration/
    ├── 01_tables.sql                # Create tables
    ├── 02_functions.sql             # SQL functions
    └── 03_indexes.sql               # Performance indexes
```

---

## Prerequisites

### 1. SnapTrade Account

**Sign up:** https://snaptrade.com/

**Get credentials:**
- Navigate to Dashboard → API Keys
- Create new key
- Save `Client ID` and `Consumer Key`

**Configure environment:**

```bash
# Add to backend/.env
SNAPTRADE_CLIENT_ID=your_client_id_here
SNAPTRADE_CONSUMER_KEY=your_consumer_key_keep_secure
SNAPTRADE_ENV=production  # or 'sandbox'
SNAPTRADE_WEBHOOK_SECRET=your_webhook_secret_optional
```

### 2. Install SDK

```bash
cd backend
uv add snaptrade-python-sdk==11.0.139
```

---

## Database Setup

### Table 1: `brokerage_connections`

Stores user ↔ broker connections and SnapTrade credentials.

```sql
-- Database /05_Brokerage_Integration/01_tables.sql

CREATE TABLE public.brokerage_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- SnapTrade credentials
    snaptrade_user_id TEXT NOT NULL,
    snaptrade_user_secret TEXT NOT NULL, -- ⚠️ Encrypt in production
    authorization_id UUID, -- SnapTrade connection ID
    
    -- Broker info
    brokerage_name TEXT NOT NULL,
    brokerage_type TEXT,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending', -- pending, active, disconnected, error
    connection_type TEXT DEFAULT 'oauth',
    
    -- Sync tracking
    last_sync_at TIMESTAMPTZ,
    next_sync_at TIMESTAMPTZ,
    sync_frequency_minutes INTEGER DEFAULT 60,
    auto_sync_enabled BOOLEAN DEFAULT true,
    
    -- Error handling
    error_message TEXT,
    error_details JSONB,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, snaptrade_user_id),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'active', 'disconnected', 'error'))
);

-- Enable RLS
ALTER TABLE public.brokerage_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own connections" 
ON public.brokerage_connections FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_brokerage_connections_user_id ON public.brokerage_connections(user_id);
CREATE INDEX idx_brokerage_connections_status ON public.brokerage_connections(status);
CREATE INDEX idx_brokerage_connections_next_sync 
    ON public.brokerage_connections(next_sync_at) 
    WHERE status = 'active' AND auto_sync_enabled = true;

-- Auto-update trigger
CREATE TRIGGER update_brokerage_connections_updated_at
    BEFORE UPDATE ON public.brokerage_connections
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

### Table 2: `brokerage_accounts`

Individual brokerage accounts under connections.

```sql
CREATE TABLE public.brokerage_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES public.brokerage_connections(id) ON DELETE CASCADE,
    
    -- SnapTrade ID
    snaptrade_account_id UUID NOT NULL,
    
    -- Account details
    account_name TEXT,
    account_number TEXT, -- Masked: '****1234'
    account_type TEXT, -- margin, cash, rrsp, tfsa, ira, etc.
    
    -- Balances (in account currency)
    cash_balance DECIMAL(20, 4),
    total_value DECIMAL(20, 4),
    buying_power DECIMAL(20, 4),
    currency TEXT DEFAULT 'USD',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    sync_enabled BOOLEAN DEFAULT true,
    
    -- Metadata
    institution_name TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    balance_updated_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(connection_id, snaptrade_account_id)
);

ALTER TABLE public.brokerage_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own accounts" 
ON public.brokerage_accounts FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_brokerage_accounts_user_id ON public.brokerage_accounts(user_id);
CREATE INDEX idx_brokerage_accounts_connection_id ON public.brokerage_accounts(connection_id);

CREATE TRIGGER update_brokerage_accounts_updated_at
    BEFORE UPDATE ON public.brokerage_accounts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

### Table 3: `brokerage_transactions`

Historical transactions from brokerages.

```sql
CREATE TABLE public.brokerage_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.brokerage_accounts(id) ON DELETE CASCADE,
    
    -- SnapTrade ID
    snaptrade_activity_id TEXT NOT NULL,
    
    -- Transaction details
    transaction_type TEXT NOT NULL, -- BUY, SELL, DIVIDEND, etc.
    symbol TEXT,
    security_name TEXT,
    security_type TEXT, -- stock, option, etf, mutual_fund, crypto
    description TEXT,
    
    -- Financial data
    quantity DECIMAL(20, 8),
    price DECIMAL(20, 4),
    amount DECIMAL(20, 4),
    fee DECIMAL(20, 4) DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    
    -- Dates
    trade_date DATE NOT NULL,
    settlement_date DATE,
    
    -- Status
    status TEXT DEFAULT 'settled', -- pending, settled, canceled
    
    -- Broker metadata
    broker_transaction_id TEXT,
    broker_order_id TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Journal integration
    synced_to_journal BOOLEAN DEFAULT false,
    journal_trade_id UUID, -- Links to stocks/options table
    sync_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(account_id, snaptrade_activity_id),
    CONSTRAINT valid_transaction_type CHECK (
        transaction_type IN (
            'BUY', 'SELL', 'DIVIDEND', 'CONTRIBUTION', 'WITHDRAWAL',
            'REI', 'STOCK_DIVIDEND', 'INTEREST', 'FEE',
            'OPTIONEXPIRATION', 'OPTIONASSIGNMENT', 'OPTIONEXERCISE',
            'TRANSFER', 'SPLIT', 'OTHER'
        )
    )
);

ALTER TABLE public.brokerage_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" 
ON public.brokerage_transactions FOR ALL USING (auth.uid() = user_id);

-- Performance indexes
CREATE INDEX idx_brokerage_transactions_user_id ON public.brokerage_transactions(user_id);
CREATE INDEX idx_brokerage_transactions_account_id ON public.brokerage_transactions(account_id);
CREATE INDEX idx_brokerage_transactions_symbol ON public.brokerage_transactions(symbol) WHERE symbol IS NOT NULL;
CREATE INDEX idx_brokerage_transactions_trade_date ON public.brokerage_transactions(trade_date DESC);
CREATE INDEX idx_brokerage_transactions_not_synced ON public.brokerage_transactions(synced_to_journal) WHERE synced_to_journal = false;

CREATE TRIGGER update_brokerage_transactions_updated_at
    BEFORE UPDATE ON public.brokerage_transactions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

### Table 4: `transaction_sync_log`

Tracks sync operations for monitoring.

```sql
CREATE TABLE public.transaction_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    connection_id UUID REFERENCES public.brokerage_connections(id) ON DELETE SET NULL,
    account_id UUID REFERENCES public.brokerage_accounts(id) ON DELETE SET NULL,
    
    -- Sync details
    sync_type TEXT NOT NULL, -- full, incremental, manual, scheduled
    status TEXT NOT NULL, -- started, completed, failed, partial
    
    -- Date range
    start_date DATE,
    end_date DATE,
    
    -- Results
    transactions_fetched INTEGER DEFAULT 0,
    transactions_new INTEGER DEFAULT 0,
    transactions_updated INTEGER DEFAULT 0,
    
    -- Errors
    error_message TEXT,
    error_details JSONB,
    
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.transaction_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync logs" 
ON public.transaction_sync_log FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_transaction_sync_log_user_id ON public.transaction_sync_log(user_id);
CREATE INDEX idx_transaction_sync_log_started_at ON public.transaction_sync_log(started_at DESC);
```

### SQL Functions

```sql
-- Database /05_Brokerage_Integration/02_functions.sql

-- Upsert transaction
CREATE OR REPLACE FUNCTION upsert_brokerage_transaction(
    p_user_id UUID,
    p_account_id UUID,
    p_snaptrade_activity_id TEXT,
    p_transaction_type TEXT,
    p_symbol TEXT,
    p_quantity DECIMAL,
    p_price DECIMAL,
    p_amount DECIMAL,
    p_fee DECIMAL,
    p_trade_date DATE,
    p_metadata JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_transaction_id UUID;
BEGIN
    INSERT INTO brokerage_transactions (
        user_id, account_id, snaptrade_activity_id,
        transaction_type, symbol, quantity, price, amount, fee,
        trade_date, metadata
    ) VALUES (
        p_user_id, p_account_id, p_snaptrade_activity_id,
        p_transaction_type, p_symbol, p_quantity, p_price, p_amount, p_fee,
        p_trade_date, p_metadata
    )
    ON CONFLICT (account_id, snaptrade_activity_id) 
    DO UPDATE SET
        transaction_type = EXCLUDED.transaction_type,
        symbol = EXCLUDED.symbol,
        quantity = EXCLUDED.quantity,
        price = EXCLUDED.price,
        amount = EXCLUDED.amount,
        fee = EXCLUDED.fee,
        trade_date = EXCLUDED.trade_date,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    RETURNING id INTO v_transaction_id;
    
    RETURN v_transaction_id;
END;
$$;

-- Get transactions with filters
CREATE OR REPLACE FUNCTION get_brokerage_transactions(
    p_user_id UUID,
    p_account_id UUID DEFAULT NULL,
    p_symbol TEXT DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
    id UUID, symbol TEXT, transaction_type TEXT,
    quantity DECIMAL, price DECIMAL, amount DECIMAL,
    trade_date DATE, synced_to_journal BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT t.id, t.symbol, t.transaction_type, t.quantity, t.price, 
           t.amount, t.trade_date, t.synced_to_journal
    FROM brokerage_transactions t
    WHERE t.user_id = p_user_id
        AND (p_account_id IS NULL OR t.account_id = p_account_id)
        AND (p_symbol IS NULL OR t.symbol = p_symbol)
        AND (p_start_date IS NULL OR t.trade_date >= p_start_date)
        AND (p_end_date IS NULL OR t.trade_date <= p_end_date)
    ORDER BY t.trade_date DESC, t.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;
```

---

## Backend Implementation

### 1. Configuration

```python
# backend/config/snaptrade_config.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class SnapTradeSettings(BaseSettings):
    client_id: str
    consumer_key: str
    environment: str = "production"
    webhook_secret: str = ""
    default_sync_frequency_minutes: int = 60
    
    model_config = SettingsConfigDict(
        env_prefix="SNAPTRADE_",
        env_file=".env",
        case_sensitive=False
    )

snaptrade_settings = SnapTradeSettings()
```

### 2. SnapTrade Client

```python
# backend/services/brokerage/snaptrade_client.py
import logging
from typing import Dict, List, Optional
from datetime import date
from snaptrade_client import SnapTrade
from snaptrade_client.exceptions import ApiException
from backend.config.snaptrade_config import snaptrade_settings

logger = logging.getLogger(__name__)

class SnapTradeClient:
    def __init__(self):
        self.client = SnapTrade(
            consumer_key=snaptrade_settings.consumer_key,
            client_id=snaptrade_settings.client_id,
        )
        logger.info("SnapTrade client initialized")
    
    async def register_user(self, user_id: str) -> Dict:
        """Register new SnapTrade user."""
        try:
            response = self.client.authentication.register_snap_trade_user(
                body={"userId": user_id}
            )
            return {
                "userId": response.body.get("userId"),
                "userSecret": response.body.get("userSecret"),
            }
        except ApiException as e:
            logger.error(f"Failed to register user: {e}")
            raise
    
    async def get_redirect_uri(self, user_id: str, user_secret: str) -> str:
        """Get OAuth redirect URL for broker connection."""
        try:
            response = self.client.authentication.login_snap_trade_user(
                query_params={"userId": user_id, "userSecret": user_secret}
            )
            return response.body.get("redirectURI")
        except ApiException as e:
            logger.error(f"Failed to get redirect URI: {e}")
            raise
    
    async def list_accounts(self, user_id: str, user_secret: str) -> List[Dict]:
        """List all accounts for user."""
        try:
            response = self.client.account_information.list_user_accounts(
                query_params={"userId": user_id, "userSecret": user_secret}
            )
            return response.body if isinstance(response.body, list) else []
        except ApiException as e:
            logger.error(f"Failed to list accounts: {e}")
            raise
    
    async def get_account_activities(
        self,
        user_id: str,
        user_secret: str,
        account_id: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        offset: int = 0,
        limit: int = 1000,
    ) -> Dict:
        """Fetch account transactions (paginated, max 1000 per request)."""
        try:
            response = self.client.account_information.get_account_activities(
                account_id=account_id,
                user_id=user_id,
                user_secret=user_secret,
                start_date=start_date.isoformat() if start_date else None,
                end_date=end_date.isoformat() if end_date else None,
                offset=offset,
                limit=min(limit, 1000),
            )
            return {
                "data": response.body.get("data", []),
                "pagination": response.body.get("pagination", {}),
            }
        except ApiException as e:
            logger.error(f"Failed to fetch activities: {e}")
            raise
```

### 3. Pydantic Models

```python
# backend/models/brokerage.py
from datetime import datetime, date
from decimal import Decimal
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field

class BrokerageConnectionCreate(BaseModel):
    snaptrade_user_id: str
    snaptrade_user_secret: str
    brokerage_name: str
    status: str = "pending"

class BrokerageConnectionResponse(BaseModel):
    id: UUID
    brokerage_name: str
    status: str
    last_sync_at: Optional[datetime] = None
    created_at: datetime

class BrokerageTransactionCreate(BaseModel):
    account_id: UUID
    snaptrade_activity_id: str
    transaction_type: str
    symbol: Optional[str] = None
    quantity: Optional[Decimal] = None
    price: Optional[Decimal] = None
    amount: Decimal
    fee: Decimal = Decimal("0")
    trade_date: date
    metadata: dict = Field(default_factory=dict)

class BrokerageTransactionResponse(BaseModel):
    id: UUID
    symbol: Optional[str]
    transaction_type: str
    quantity: Optional[Decimal]
    price: Optional[Decimal]
    amount: Decimal
    trade_date: date
    synced_to_journal: bool
    created_at: datetime
```

### 4. API Router

```python
# backend/routers/brokerage.py
from fastapi import APIRouter, Depends, HTTPException
from backend.services.brokerage.snaptrade_client import SnapTradeClient
from backend.utils.auth import get_current_user
import logging

router = APIRouter(prefix="/api/brokerage", tags=["brokerage"])
logger = logging.getLogger(__name__)

snaptrade_client = SnapTradeClient()

@router.post("/connect/initiate")
async def initiate_connection(user: dict = Depends(get_current_user)):
    """Start broker connection flow."""
    try:
        user_id = user.get("id")
        
        # Register SnapTrade user (or get existing)
        registration = await snaptrade_client.register_user(str(user_id))
        
        # Get OAuth redirect URL
        redirect_url = await snaptrade_client.get_redirect_uri(
            registration["userId"],
            registration["userSecret"]
        )
        
        # Save connection to database (implement DAL)
        # connection = await connection_dal.create(...)
        
        return {
            "redirectUrl": redirect_url,
            "status": "pending"
        }
    except Exception as e:
        logger.error(f"Connection initiation failed: {e}")
        raise HTTPException(500, "Failed to initiate connection")

@router.get("/connections")
async def list_connections(user: dict = Depends(get_current_user)):
    """List user's brokerage connections."""
    # Implement: fetch from database
    pass

@router.get("/transactions")
async def list_transactions(
    account_id: Optional[str] = None,
    symbol: Optional[str] = None,
    start_date: Optional[date] = None,
    limit: int = 100,
    user: dict = Depends(get_current_user)
):
    """Fetch transaction history with filters."""
    # Implement: query database using SQL function
    pass
```

---

## Integration Workflow

### User Flow

1. **User initiates**: Clicks "Connect Broker" in frontend
2. **Backend creates**: SnapTrade user + generates OAuth URL
3. **User completes OAuth**: Logs into brokerage (TD Ameritrade, etc.)
4. **SnapTrade stores**: Encrypted broker credentials
5. **Webhook received**: SnapTrade notifies Tradistry (optional)
6. **Backend syncs**: Fetches accounts + transactions
7. **Database stores**: Transactions available for journal

### Sync Strategy

**Initial Sync:** Fetch all historical transactions (paginated)
**Incremental Sync:** Fetch only new transactions since last sync
**Scheduled Sync:** Background job runs every hour (configurable)
**Manual Sync:** User can trigger on-demand

---

## API Endpoints

### `POST /api/brokerage/connect/initiate`
Start broker connection process.

**Response:**
```json
{
  "redirectUrl": "https://connect.snaptrade.com/...",
  "status": "pending"
}
```

### `GET /api/brokerage/connections`
List user's connections.

**Response:**
```json
{
  "connections": [{
    "id": "uuid",
    "brokerageName": "TD Ameritrade",
    "status": "active",
    "lastSyncAt": "2025-09-30T00:00:00Z"
  }]
}
```

### `GET /api/brokerage/transactions`
Fetch transactions with filters.

**Query params:** `account_id`, `symbol`, `start_date`, `end_date`, `limit`, `offset`

**Response:**
```json
{
  "transactions": [{
    "id": "uuid",
    "symbol": "AAPL",
    "transactionType": "BUY",
    "quantity": 10,
    "price": 150.25,
    "tradeDate": "2025-09-25"
  }],
  "pagination": { "total": 150, "limit": 100, "offset": 0 }
}
```

### `POST /api/brokerage/sync/manual`
Trigger manual sync.

### `DELETE /api/brokerage/connections/{id}`
Disconnect broker.

---

## Security

### 1. Encrypt User Secrets

```python
# backend/utils/encryption.py
from cryptography.fernet import Fernet
import os

cipher = Fernet(os.getenv("ENCRYPTION_KEY"))

def encrypt_secret(secret: str) -> str:
    return cipher.encrypt(secret.encode()).decode()

def decrypt_secret(encrypted: str) -> str:
    return cipher.decrypt(encrypted.encode()).decode()
```

### 2. Webhook Signature Verification

```python
import hmac
import hashlib

def verify_webhook_signature(signature: str, body: bytes) -> bool:
    expected = hmac.new(
        snaptrade_settings.webhook_secret.encode(),
        body,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

### 3. Rate Limiting

```python
from fastapi_limiter.depends import RateLimiter

@router.post("/sync/manual", dependencies=[Depends(RateLimiter(times=5, seconds=60))])
async def manual_sync(...):
    pass
```

### 4. Environment Variables

```bash
# Never commit these!
SNAPTRADE_CONSUMER_KEY=keep_secure
ENCRYPTION_KEY=generate_with_Fernet.generate_key()
```

---

## Testing & Monitoring

### Testing

```python
# backend/tests/test_snaptrade.py
import pytest
from backend.services.brokerage.snaptrade_client import SnapTradeClient

@pytest.mark.asyncio
async def test_register_user():
    client = SnapTradeClient()
    result = await client.register_user("test-user-123")
    assert "userId" in result
    assert "userSecret" in result
```

### Monitoring

**Structured Logging (follows Tradistry patterns):**

```python
logger.info(
    "Transaction sync completed",
    extra={
        "user_id": user_id,
        "account_id": account_id,
        "transactions_fetched": count,
        "duration_seconds": duration,
        "success": True
    }
)
```

**Key Metrics:**
- Sync success rate
- Transaction fetch latency
- Failed connections count
- API error rates

### Health Check

```python
@router.get("/health")
async def brokerage_health():
    return {
        "status": "healthy",
        "connections_active": await count_active_connections(),
        "last_sync": await get_last_sync_time()
    }
```

---

## Next Steps

1. **Create database tables**: Run SQL migration scripts
2. **Implement DAL layer**: Connection, Account, Transaction DALs
3. **Build sync service**: Transaction synchronization logic
4. **Add frontend**: Connect broker UI component
5. **Setup webhook**: Configure SnapTrade webhook endpoint
6. **Test integration**: Use SnapTrade sandbox environment
7. **Deploy**: Production deployment with monitoring

## Support

- **SnapTrade Discord**: https://discord.gg/rkYWBxb8Qu
- **Docs**: https://docs.snaptrade.com/docs
- **Demo**: https://docs.snaptrade.com/demo

---

**Status:** Ready for implementation ✅
**Last Updated:** 2025-09-30
