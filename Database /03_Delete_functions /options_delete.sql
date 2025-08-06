-- Optimized delete function for options table
-- This function safely deletes an option record for the authenticated user

CREATE OR REPLACE FUNCTION delete_option(p_id integer)
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
    DELETE FROM options 
    WHERE id = p_id 
      AND user_id = v_user_id
    RETURNING 
        id,
        user_id,
        symbol,
        strategy_type,
        trade_direction,
        number_of_contracts,
        option_type,
        strike_price,
        expiration_date,
        entry_price,
        exit_price,
        total_premium,
        commissions,
        implied_volatility,
        entry_date,
        exit_date,
        status,
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
                'strategy_type', deleted_record.strategy_type,
                'trade_direction', deleted_record.trade_direction,
                'number_of_contracts', deleted_record.number_of_contracts,
                'option_type', deleted_record.option_type,
                'strike_price', deleted_record.strike_price,
                'expiration_date', deleted_record.expiration_date,
                'entry_price', deleted_record.entry_price,
                'exit_price', deleted_record.exit_price,
                'total_premium', deleted_record.total_premium,
                'commissions', deleted_record.commissions,
                'implied_volatility', deleted_record.implied_volatility,
                'entry_date', deleted_record.entry_date,
                'exit_date', deleted_record.exit_date,
                'status', deleted_record.status,
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
GRANT EXECUTE ON FUNCTION delete_option TO authenticated;

-- Optional: Create an index to optimize the delete operation if not already present
-- This is especially important for tables with many records per user
CREATE INDEX IF NOT EXISTS idx_options_user_id_id ON options(user_id, id);

-- Example usage and expected responses:

-- Successful deletion:
-- SELECT delete_option(123);
-- Returns: {"success": true, "deleted_record": {"id": 123, "user_id": "uuid-here", "symbol": "AAPL", "strategy_type": "Covered Call", "trade_direction": "Bullish", "number_of_contracts": 5, "option_type": "Call", "strike_price": 155.00, "expiration_date": "2024-02-16T16:00:00", "entry_price": 2.50, "exit_price": null, "total_premium": 1250.00, "commissions": 10.00, "implied_volatility": 0.25, "entry_date": "2024-01-15T10:30:00", "exit_date": null, "status": "open", "created_at": "2024-01-15T10:30:00", "updated_at": "2024-01-15T10:30:00"}}

-- Record not found or access denied:
-- SELECT delete_option(999);
-- Returns: {"success": false, "error": "Record not found or access denied", "deleted_record": null}

-- User not authenticated:
-- Returns: {"success": false, "error": "User not authenticated", "deleted_record": null}

-- Testing on Supabase SQL Editor 
-- DELETE FROM options
-- WHERE user_id = '99369696-8c65-43bb-96bc-5999275e8be1'
-- RETURNING *;
