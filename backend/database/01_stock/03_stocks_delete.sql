-- Optimized delete function for stocks table
-- This function safely deletes a stock record for the authenticated user

CREATE OR REPLACE FUNCTION delete_stock(p_id integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    deleted_record RECORD;
BEGIN
    -- Get the current user ID once and validate
    v_user_id := auth.uid();
    
    -- Early return if user is not authenticated
    IF v_user_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'User not authenticated',
            'deleted_record', null
        );
    END IF;
    
    -- Single query: delete and return data atomically
    DELETE FROM stocks 
    WHERE id = p_id 
      AND user_id = v_user_id
    RETURNING 
        id,
        user_id,
        symbol,
        trade_type,
        order_type,
        entry_price,
        exit_price,
        stop_loss,
        commissions,
        number_shares,
        take_profit,
        entry_date,
        exit_date,
        created_at,
        updated_at
    INTO deleted_record;
    
    -- Return structured response based on deletion result
    IF FOUND THEN
        RETURN json_build_object(
            'success', true,
            'deleted_record', json_build_object(
                'id', deleted_record.id,
                'user_id', deleted_record.user_id,
                'symbol', deleted_record.symbol,
                'trade_type', deleted_record.trade_type,
                'order_type', deleted_record.order_type,
                'entry_price', deleted_record.entry_price,
                'exit_price', deleted_record.exit_price,
                'stop_loss', deleted_record.stop_loss,
                'commissions', deleted_record.commissions,
                'number_shares', deleted_record.number_shares,
                'take_profit', deleted_record.take_profit,
                'entry_date', deleted_record.entry_date,
                'exit_date', deleted_record.exit_date,
                'created_at', deleted_record.created_at,
                'updated_at', deleted_record.updated_at
            )
        );
    ELSE
        RETURN json_build_object(
            'success', false,
            'error', 'Record not found or access denied',
            'deleted_record', null
        );
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Handle any unexpected errors
        RETURN json_build_object(
            'success', false,
            'error', 'Database error: ' || SQLERRM,
            'deleted_record', null
        );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_stock TO authenticated;

-- Optional: Create an index to optimize the delete operation if not already present
-- This is especially important for tables with many records per user
CREATE INDEX IF NOT EXISTS idx_stocks_user_id_id ON stocks(user_id, id);

-- Example usage and expected responses:

-- Successful deletion:
-- SELECT delete_stock(123);
-- Returns: {"success": true, "deleted_record": {"id": 123, "user_id": "uuid-here", "symbol": "AAPL", "trade_type": "BUY", "order_type": "MARKET", "entry_price": 150.50, "exit_price": null, "stop_loss": 140.00, "commissions": 0.99, "number_shares": 100, "take_profit": 160.00, "entry_date": "2024-01-15T10:30:00", "exit_date": null, "created_at": "2024-01-15T10:30:00", "updated_at": "2024-01-15T10:30:00"}}

-- Record not found or access denied:
-- SELECT delete_stock(999);
-- Returns: {"success": false, "error": "Record not found or access denied", "deleted_record": null}

-- User not authenticated:
-- Returns: {"success": false, "error": "User not authenticated", "deleted_record": null}


-- Testing on suoabase SQL Editor 
-- DELETE FROM stocks
-- WHERE user_id = '99369696-8c65-43bb-96bc-5999275e8be1'
-- RETURNING *;
