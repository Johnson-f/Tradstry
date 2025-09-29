# Diagnostic: Check Market Movers Data

## Issue
SQL functions are being called successfully but returning 0 results:
```
INFO:httpx:HTTP Request: POST .../rpc/get_top_gainers "HTTP/2 200 OK"
INFO:services.market_data.movers_service:📊 Retrieved 0 gainers from database
```

## Root Cause
The `get_top_gainers()` function filters by `data_date = CURRENT_DATE`, which means it only returns data for **today's date**.

If your data is from **previous days**, the query will return 0 results.

---

## Quick Fix: Check What Data You Have

### Run these queries in your Supabase SQL Editor:

```sql
-- 1. Check if you have ANY data in market_movers
SELECT COUNT(*) as total_records FROM market_movers;

-- 2. Check what dates you have data for
SELECT DISTINCT data_date, COUNT(*) as count
FROM market_movers
GROUP BY data_date
ORDER BY data_date DESC;

-- 3. Check what mover types you have
SELECT mover_type, COUNT(*) as count
FROM market_movers
GROUP BY mover_type;

-- 4. See the most recent data
SELECT *
FROM market_movers
ORDER BY fetch_timestamp DESC
LIMIT 20;
```

---

## Expected Results

### If you have data:
```
total_records: 75 (or any number > 0)

data_date       | count
----------------|------
2025-09-28      | 75
2025-09-27      | 75

mover_type | count
-----------|------
gainer     | 25
loser      | 25
active     | 25
```

### If data is from previous days:
**Problem:** Your data is from `2025-09-28` but the query looks for `CURRENT_DATE` (2025-09-30).

**Solution:** You need to populate today's data using your Edge Functions.

---

## Solution: Populate Today's Data

### Option 1: Call Edge Functions Manually

```bash
# Call your market movers Edge Function
curl -X POST https://YOUR_SUPABASE_URL/functions/v1/movers

# Call your peers Edge Function  
curl -X POST https://YOUR_SUPABASE_URL/functions/v1/peers
```

### Option 2: Modify Query to Use Latest Data

Temporarily modify the services to fetch the most recent date instead of today:

**Backend Service Modification:**
```python
# In movers_service.py, change:
params = {
    'p_data_date': request.data_date.isoformat() if request.data_date else date.today().isoformat(),
    'p_limit': request.limit
}

# To use most recent date if no data for today:
# (This requires modifying the SQL function)
```

### Option 3: Create a Fallback SQL Function

```sql
CREATE OR REPLACE FUNCTION get_top_gainers_latest(
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    symbol VARCHAR(20),
    name VARCHAR(255),
    rank_position INTEGER,
    fetch_timestamp TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
DECLARE
    latest_date DATE;
BEGIN
    -- Get the most recent data_date
    SELECT MAX(data_date) INTO latest_date
    FROM market_movers
    WHERE mover_type = 'gainer';
    
    -- Return data for that date
    RETURN QUERY
    SELECT 
        m.symbol,
        m.name,
        m.rank_position,
        m.fetch_timestamp
    FROM market_movers m
    WHERE m.mover_type = 'gainer'
      AND m.data_date = latest_date
    ORDER BY m.rank_position ASC NULLS LAST
    LIMIT p_limit;
END;
$$;
```

---

## Next Steps

1. **Run the diagnostic queries above** to see what data you have
2. **Share the results** with me
3. Based on the results, we'll either:
   - Populate today's data
   - Modify the query to use the most recent date
   - Fix any data issues

**Please run those SQL queries and share the output!** 🔍
