-- Create trade_note_type enum to distinguish between stock and option trades
CREATE TYPE trade_note_type AS ENUM ('stock', 'option');

-- trade_notes table for storing trade-related notes
CREATE TABLE public.trade_notes (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Polymorphic association fields
  trade_id INTEGER NOT NULL,
  trade_type trade_note_type NOT NULL,

  -- Note content
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Foreign key constraint for user
  CONSTRAINT fk_user
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
);

-- Create index for faster lookups
CREATE INDEX idx_trade_notes_user ON public.trade_notes(user_id);
CREATE INDEX idx_trade_notes_trade ON public.trade_notes(trade_type, trade_id);

-- Enable Row Level Security
ALTER TABLE public.trade_notes ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to view only their own notes
CREATE POLICY "Users can view own trade notes"
  ON public.trade_notes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy for authenticated users to insert their own notes
CREATE POLICY "Users can insert own trade notes"
  ON public.trade_notes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy for authenticated users to update only their own notes
CREATE POLICY "Users can update own trade notes"
  ON public.trade_notes
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy for authenticated users to delete only their own notes
CREATE POLICY "Users can delete own trade notes"
  ON public.trade_notes
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_trade_note_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_trade_notes_updated_at
BEFORE UPDATE ON public.trade_notes
FOR EACH ROW
EXECUTE FUNCTION update_trade_note_updated_at();

-- Function to validate trade ownership when inserting/updating
CREATE OR REPLACE FUNCTION validate_trade_ownership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.trade_type = 'stock' AND NOT EXISTS (
    SELECT 1 FROM public.stocks
    WHERE id = NEW.trade_id AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Stock trade not found or access denied';
  ELSIF NEW.trade_type = 'option' AND NOT EXISTS (
    SELECT 1 FROM public.options
    WHERE id = NEW.trade_id AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Option trade not found or access denied';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate trade ownership
CREATE TRIGGER validate_trade_ownership_trigger
BEFORE INSERT OR UPDATE ON public.trade_notes
FOR EACH ROW
EXECUTE FUNCTION validate_trade_ownership();


--
-- Enhancements added based on user request
--

-- Add a 'tags' column to store a list of tags
ALTER TABLE public.trade_notes
ADD COLUMN tags TEXT[];

-- Add an index for the new tags column for faster searching
CREATE INDEX idx_trade_notes_tags ON public.trade_notes USING GIN(tags);

-- Add a 'rating' column for self-assessment (e.g., 1-5)
ALTER TABLE public.trade_notes
ADD COLUMN rating INTEGER;

-- Add a check constraint to ensure the rating is within a valid range
ALTER TABLE public.trade_notes
ADD CONSTRAINT rating_range CHECK (rating >= 1 AND rating <= 5);

-- Create a new ENUM type for the trade phase
CREATE TYPE trade_phase AS ENUM ('planning', 'execution', 'reflection');

-- Add a 'phase' column to the table
ALTER TABLE public.trade_notes
ADD COLUMN phase trade_phase;

-- Add a column to link to an image (e.g., a chart screenshot)
ALTER TABLE public.trade_notes
ADD COLUMN image_id UUID;

-- Add a foreign key constraint to the images table
-- This assumes you have a 'public.images' table with an 'id' primary key
ALTER TABLE public.trade_notes
ADD CONSTRAINT fk_image
  FOREIGN KEY (image_id)
  REFERENCES public.images(id)
  ON DELETE SET NULL;

-- Function to upsert a trade note
CREATE OR REPLACE FUNCTION public.upsert_trade_note(
  p_trade_id INTEGER,
  p_trade_type trade_note_type,
  p_title VARCHAR(255),
  p_content TEXT,
  p_note_id INTEGER DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_rating INTEGER DEFAULT NULL,
  p_phase trade_phase DEFAULT NULL,
  p_image_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_note_id INTEGER;
  v_result JSONB;
  v_trade_exists BOOLEAN;
BEGIN
  -- Validate user is authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User is not authenticated',
      'note_id', NULL
    );
  END IF;

  -- Validate trade ownership
  IF p_trade_type = 'stock' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.stocks
      WHERE id = p_trade_id AND user_id = v_user_id
    ) INTO v_trade_exists;
  ELSIF p_trade_type = 'option' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.options
      WHERE id = p_trade_id AND user_id = v_user_id
    ) INTO v_trade_exists;
  ELSE
    RAISE EXCEPTION 'Invalid trade type: %', p_trade_type;
  END IF;

  IF NOT v_trade_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Trade not found or access denied',
      'note_id', NULL
    );
  END IF;

  -- Insert or update the note
  IF p_note_id IS NULL THEN
    -- Insert new note
    INSERT INTO public.trade_notes (
      user_id, trade_id, trade_type, title, content, tags, rating, phase, image_id
    ) VALUES (
      v_user_id, p_trade_id, p_trade_type, p_title, p_content, p_tags, p_rating, p_phase, p_image_id
    )
    RETURNING id INTO v_note_id;

    v_result := jsonb_build_object(
      'success', true,
      'action', 'inserted',
      'note_id', v_note_id
    );
  ELSE
    -- Update existing note
    UPDATE public.trade_notes
    SET
      trade_id = p_trade_id,
      trade_type = p_trade_type,
      title = p_title,
      content = p_content,
      tags = p_tags,
      rating = p_rating,
      phase = p_phase,
      image_id = p_image_id,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = p_note_id
    AND user_id = v_user_id
    RETURNING id INTO v_note_id;

    IF v_note_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Note not found or access denied',
        'note_id', NULL
      );
    END IF;

    v_result := jsonb_build_object(
      'success', true,
      'action', 'updated',
      'note_id', v_note_id
    );
  END IF;

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', SQLERRM,
      'note_id', NULL
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.upsert_trade_note(INTEGER, trade_note_type, VARCHAR, TEXT, INTEGER, TEXT[], INTEGER, trade_phase, UUID)
TO authenticated;

-- Add a comment for the function
COMMENT ON FUNCTION public.upsert_trade_note(INTEGER, trade_note_type, VARCHAR, TEXT, INTEGER, TEXT[], INTEGER, trade_phase, UUID) IS 'Upsert function for trade_notes table.
Automatically uses the authenticated user''s ID.

Parameters:
- p_trade_id: ID of the trade (stock or option)
- p_trade_type: ''stock'' or ''option''
- p_title: Note title
- p_content: Note content
- p_note_id: Note ID for updates, NULL for inserts (optional)
- p_tags: Array of tags (optional)
- p_rating: Integer rating from 1-5 (optional)
- p_phase: Trade phase (''planning'', ''execution'', ''reflection'') (optional)
- p_image_id: UUID of a linked image (optional)

Returns JSON with success status, action performed, and note ID.';


-- Function to select trade notes for the authenticated user
CREATE OR REPLACE FUNCTION public.select_trade_notes(
  p_note_id INTEGER DEFAULT NULL,
  p_trade_id INTEGER DEFAULT NULL,
  p_trade_type trade_note_type DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_phase trade_phase DEFAULT NULL,
  p_rating INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result JSONB;
BEGIN
  -- Ensure user is authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User is not authenticated', 'data', '[]'::jsonb);
  END IF;

  -- Aggregate matching notes into a JSONB array with trade symbols
  SELECT jsonb_agg(t)
  FROM (
    SELECT
      tn.id,
      tn.user_id,
      tn.trade_id,
      tn.trade_type,
      tn.title,
      tn.content,
      tn.created_at,
      tn.updated_at,
      tn.tags,
      tn.rating,
      tn.phase,
      tn.image_id,
      CASE 
        WHEN tn.trade_type = 'stock' THEN s.symbol
        WHEN tn.trade_type = 'option' THEN o.symbol
        ELSE NULL
      END as trade_symbol
    FROM public.trade_notes tn
    LEFT JOIN public.stocks s ON tn.trade_type = 'stock' AND tn.trade_id = s.id AND s.user_id = v_user_id
    LEFT JOIN public.options o ON tn.trade_type = 'option' AND tn.trade_id = o.id AND o.user_id = v_user_id
    WHERE tn.user_id = v_user_id
      AND (p_note_id IS NULL OR tn.id = p_note_id)
      AND (p_trade_id IS NULL OR tn.trade_id = p_trade_id)
      AND (p_trade_type IS NULL OR tn.trade_type = p_trade_type)
      AND (p_tags IS NULL OR tn.tags && p_tags) -- Check for tag overlap
      AND (p_phase IS NULL OR tn.phase = p_phase)
      AND (p_rating IS NULL OR tn.rating = p_rating)
    ORDER BY tn.created_at DESC
  ) t
  INTO v_result;

  RETURN jsonb_build_object('success', true, 'data', COALESCE(v_result, '[]'::jsonb));
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM, 'data', '[]'::jsonb);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.select_trade_notes(INTEGER, INTEGER, trade_note_type, TEXT[], trade_phase, INTEGER)
TO authenticated;

-- Add a comment for the function
COMMENT ON FUNCTION public.select_trade_notes(INTEGER, INTEGER, trade_note_type, TEXT[], trade_phase, INTEGER) IS 'Selects trade notes for the authenticated user with optional filters.

Parameters:
- p_note_id: Filter by a specific note ID (optional).
- p_trade_id: Filter by a specific trade ID (optional).
- p_trade_type: Filter by trade type (''stock'' or ''option'') (optional).
- p_tags: Filter by notes containing any of the specified tags (optional).
- p_phase: Filter by trade phase (optional).
- p_rating: Filter by rating (optional).

Returns a JSONB object with a success flag and a data array of trade notes.';


-- Function to delete a trade note for the authenticated user
CREATE OR REPLACE FUNCTION public.delete_trade_note(
  p_note_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_deleted_note_id INTEGER;
BEGIN
  -- Ensure user is authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User is not authenticated');
  END IF;

  -- Attempt to delete the note, returning the ID if successful
  DELETE FROM public.trade_notes
  WHERE id = p_note_id
    AND user_id = v_user_id
  RETURNING id INTO v_deleted_note_id;

  -- Check if the deletion was successful
  IF v_deleted_note_id IS NULL THEN
    -- No note was deleted, either because it doesn't exist or RLS prevented it
    RETURN jsonb_build_object('success', false, 'message', 'Note not found or access denied');
  ELSE
    -- Note was successfully deleted
    RETURN jsonb_build_object('success', true, 'message', 'Note deleted successfully', 'deleted_note_id', v_deleted_note_id);
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    -- Catch any other errors
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.delete_trade_note(INTEGER)
TO authenticated;

-- Add a comment for the function
COMMENT ON FUNCTION public.delete_trade_note(INTEGER) IS 'Deletes a trade note for the authenticated user.

Parameters:
- p_note_id: The ID of the note to delete.

Returns a JSONB object with a success flag and a message.';

-- Comprehensive Tracking Summary Function
-- Combines trade notes with their associated stock/option trades for AI consumption
CREATE OR REPLACE FUNCTION public.get_tracking_summary(
    p_user_id UUID DEFAULT NULL,
    p_trade_type trade_note_type DEFAULT NULL,
    p_phase trade_phase DEFAULT NULL,
    p_rating_min INTEGER DEFAULT NULL,
    p_rating_max INTEGER DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
    v_user_id UUID;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    -- Set user_id (use provided or authenticated user)
    v_user_id := COALESCE(p_user_id, auth.uid());
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User authentication required';
    END IF;

    -- Calculate date range based on time_range parameter
    CASE p_time_range
        WHEN '7d' THEN
            v_start_date := CURRENT_DATE - INTERVAL '7 days';
            v_end_date := CURRENT_DATE;
        WHEN '30d' THEN
            v_start_date := CURRENT_DATE - INTERVAL '30 days';
            v_end_date := CURRENT_DATE;
        WHEN '90d' THEN
            v_start_date := CURRENT_DATE - INTERVAL '90 days';
            v_end_date := CURRENT_DATE;
        WHEN '1y' THEN
            v_start_date := CURRENT_DATE - INTERVAL '1 year';
            v_end_date := CURRENT_DATE;
        WHEN 'ytd' THEN
            v_start_date := DATE_TRUNC('year', CURRENT_DATE);
            v_end_date := CURRENT_DATE;
        WHEN 'custom' THEN
            v_start_date := p_custom_start_date;
            v_end_date := p_custom_end_date;
        ELSE -- 'all_time'
            v_start_date := NULL;
            v_end_date := NULL;
    END CASE;

    -- Build comprehensive JSON summary
    SELECT json_build_object(
        'summary_metadata', json_build_object(
            'generated_at', NOW(),
            'user_id', v_user_id,
            'time_range', p_time_range,
            'start_date', v_start_date,
            'end_date', v_end_date,
            'filters', json_build_object(
                'trade_type', p_trade_type,
                'phase', p_phase,
                'rating_range', CASE 
                    WHEN p_rating_min IS NOT NULL OR p_rating_max IS NOT NULL 
                    THEN json_build_object('min', p_rating_min, 'max', p_rating_max)
                    ELSE NULL 
                END,
                'tags', p_tags
            )
        ),
        'tracking_overview', json_build_object(
            'total_notes', (
                SELECT COUNT(*)
                FROM trade_notes tn
                WHERE tn.user_id = v_user_id
                    AND (p_trade_type IS NULL OR tn.trade_type = p_trade_type)
                    AND (p_phase IS NULL OR tn.phase = p_phase)
                    AND (p_rating_min IS NULL OR tn.rating >= p_rating_min)
                    AND (p_rating_max IS NULL OR tn.rating <= p_rating_max)
                    AND (p_tags IS NULL OR tn.tags && p_tags)
                    AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                    AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
            ),
            'notes_by_asset_type', (
                SELECT json_build_object(
                    'stock_notes', COUNT(*) FILTER (WHERE trade_type = 'stock'),
                    'option_notes', COUNT(*) FILTER (WHERE trade_type = 'option')
                )
                FROM trade_notes tn
                WHERE tn.user_id = v_user_id
                    AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                    AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
            ),
            'notes_by_phase', (
                SELECT json_object_agg(
                    COALESCE(phase::text, 'unspecified'),
                    phase_count
                )
                FROM (
                    SELECT phase, COUNT(*) as phase_count
                    FROM trade_notes tn
                    WHERE tn.user_id = v_user_id
                        AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                        AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
                    GROUP BY phase
                ) phase_stats
            ),
            'average_rating', (
                SELECT ROUND(AVG(rating), 2)
                FROM trade_notes tn
                WHERE tn.user_id = v_user_id
                    AND rating IS NOT NULL
                    AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                    AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
            ),
            'rating_distribution', (
                SELECT json_object_agg(rating::text, rating_count)
                FROM (
                    SELECT rating, COUNT(*) as rating_count
                    FROM trade_notes tn
                    WHERE tn.user_id = v_user_id
                        AND rating IS NOT NULL
                        AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                        AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
                    GROUP BY rating
                    ORDER BY rating
                ) rating_stats
            )
        ),
        'detailed_trade_notes', (
            SELECT json_agg(
                json_build_object(
                    'note_info', json_build_object(
                        'id', tn.id,
                        'title', tn.title,
                        'content', tn.content,
                        'trade_type', tn.trade_type,
                        'phase', tn.phase,
                        'rating', tn.rating,
                        'tags', tn.tags,
                        'created_at', tn.created_at,
                        'updated_at', tn.updated_at
                    ),
                    'trade_details', CASE 
                        WHEN tn.trade_type = 'stock' THEN (
                            SELECT json_build_object(
                                'asset_type', 'stock',
                                'symbol', s.symbol,
                                'trade_type', s.trade_type,
                                'order_type', s.order_type,
                                'entry_price', s.entry_price,
                                'exit_price', s.exit_price,
                                'stop_loss', s.stop_loss,
                                'take_profit', s.take_profit,
                                'number_shares', s.number_shares,
                                'commissions', s.commissions,
                                'entry_date', s.entry_date,
                                'exit_date', s.exit_date,
                                'pnl', CASE 
                                    WHEN s.exit_price IS NOT NULL THEN 
                                        CASE s.trade_type
                                            WHEN 'BUY' THEN (s.exit_price - s.entry_price) * s.number_shares - s.commissions
                                            WHEN 'SELL' THEN (s.entry_price - s.exit_price) * s.number_shares - s.commissions
                                        END
                                    ELSE NULL
                                END,
                                'is_closed', s.exit_price IS NOT NULL,
                                'hold_time_hours', CASE 
                                    WHEN s.exit_date IS NOT NULL THEN 
                                        EXTRACT(EPOCH FROM (s.exit_date - s.entry_date)) / 3600
                                    ELSE 
                                        EXTRACT(EPOCH FROM (NOW() - s.entry_date)) / 3600
                                END
                            )
                            FROM stocks s
                            WHERE s.id = tn.trade_id AND s.user_id = v_user_id
                        )
                        WHEN tn.trade_type = 'option' THEN (
                            SELECT json_build_object(
                                'asset_type', 'option',
                                'symbol', o.symbol,
                                'strategy_type', o.strategy_type,
                                'trade_direction', o.trade_direction,
                                'option_type', o.option_type,
                                'strike_price', o.strike_price,
                                'expiration_date', o.expiration_date,
                                'entry_price', o.entry_price,
                                'exit_price', o.exit_price,
                                'number_of_contracts', o.number_of_contracts,
                                'total_premium', o.total_premium,
                                'commissions', o.commissions,
                                'implied_volatility', o.implied_volatility,
                                'entry_date', o.entry_date,
                                'exit_date', o.exit_date,
                                'status', o.status,
                                'pnl', CASE 
                                    WHEN o.exit_price IS NOT NULL THEN 
                                        (o.exit_price - o.entry_price) * o.number_of_contracts * 100 - o.commissions
                                    ELSE NULL
                                END,
                                'is_closed', o.status = 'closed',
                                'days_to_expiration', CASE 
                                    WHEN o.expiration_date IS NOT NULL THEN 
                                        EXTRACT(DAYS FROM (o.expiration_date - NOW()))
                                    ELSE NULL
                                END,
                                'hold_time_hours', CASE 
                                    WHEN o.exit_date IS NOT NULL THEN 
                                        EXTRACT(EPOCH FROM (o.exit_date - o.entry_date)) / 3600
                                    ELSE 
                                        EXTRACT(EPOCH FROM (NOW() - o.entry_date)) / 3600
                                END
                            )
                            FROM options o
                            WHERE o.id = tn.trade_id AND o.user_id = v_user_id
                        )
                        ELSE NULL
                    END
                )
                ORDER BY tn.created_at DESC
            )
            FROM trade_notes tn
            WHERE tn.user_id = v_user_id
                AND (p_trade_type IS NULL OR tn.trade_type = p_trade_type)
                AND (p_phase IS NULL OR tn.phase = p_phase)
                AND (p_rating_min IS NULL OR tn.rating >= p_rating_min)
                AND (p_rating_max IS NULL OR tn.rating <= p_rating_max)
                AND (p_tags IS NULL OR tn.tags && p_tags)
                AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
            LIMIT p_limit
        ),
        'tag_analysis', (
            SELECT json_build_object(
                'most_common_tags', (
                    SELECT json_agg(
                        json_build_object(
                            'tag', tag,
                            'count', tag_count,
                            'percentage', ROUND((tag_count::numeric / total_notes) * 100, 2)
                        )
                        ORDER BY tag_count DESC
                    )
                    FROM (
                        SELECT 
                            unnest(tags) as tag,
                            COUNT(*) as tag_count,
                            (SELECT COUNT(*) FROM trade_notes WHERE user_id = v_user_id AND tags IS NOT NULL) as total_notes
                        FROM trade_notes tn
                        WHERE tn.user_id = v_user_id
                            AND tags IS NOT NULL
                            AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                            AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
                        GROUP BY unnest(tags)
                        ORDER BY COUNT(*) DESC
                        LIMIT 20
                    ) tag_stats
                ),
                'unique_tags_count', (
                    SELECT COUNT(DISTINCT unnest(tags))
                    FROM trade_notes tn
                    WHERE tn.user_id = v_user_id
                        AND tags IS NOT NULL
                        AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                        AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
                )
            )
        ),
        'performance_correlation', (
            SELECT json_build_object(
                'high_rated_trades_performance', (
                    SELECT json_build_object(
                        'average_pnl', AVG(trade_pnl),
                        'win_rate', AVG(CASE WHEN trade_pnl > 0 THEN 1.0 ELSE 0.0 END),
                        'trade_count', COUNT(*)
                    )
                    FROM (
                        SELECT 
                            CASE 
                                WHEN tn.trade_type = 'stock' THEN 
                                    CASE s.trade_type
                                        WHEN 'BUY' THEN (COALESCE(s.exit_price, s.entry_price) - s.entry_price) * s.number_shares - s.commissions
                                        WHEN 'SELL' THEN (s.entry_price - COALESCE(s.exit_price, s.entry_price)) * s.number_shares - s.commissions
                                    END
                                WHEN tn.trade_type = 'option' THEN 
                                    (COALESCE(o.exit_price, o.entry_price) - o.entry_price) * o.number_of_contracts * 100 - o.commissions
                            END as trade_pnl
                        FROM trade_notes tn
                        LEFT JOIN stocks s ON tn.trade_type = 'stock' AND tn.trade_id = s.id AND s.user_id = v_user_id
                        LEFT JOIN options o ON tn.trade_type = 'option' AND tn.trade_id = o.id AND o.user_id = v_user_id
                        WHERE tn.user_id = v_user_id
                            AND tn.rating >= 4
                            AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                            AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
                    ) high_rated_trades
                ),
                'low_rated_trades_performance', (
                    SELECT json_build_object(
                        'average_pnl', AVG(trade_pnl),
                        'win_rate', AVG(CASE WHEN trade_pnl > 0 THEN 1.0 ELSE 0.0 END),
                        'trade_count', COUNT(*)
                    )
                    FROM (
                        SELECT 
                            CASE 
                                WHEN tn.trade_type = 'stock' THEN 
                                    CASE s.trade_type
                                        WHEN 'BUY' THEN (COALESCE(s.exit_price, s.entry_price) - s.entry_price) * s.number_shares - s.commissions
                                        WHEN 'SELL' THEN (s.entry_price - COALESCE(s.exit_price, s.entry_price)) * s.number_shares - s.commissions
                                    END
                                WHEN tn.trade_type = 'option' THEN 
                                    (COALESCE(o.exit_price, o.entry_price) - o.entry_price) * o.number_of_contracts * 100 - o.commissions
                            END as trade_pnl
                        FROM trade_notes tn
                        LEFT JOIN stocks s ON tn.trade_type = 'stock' AND tn.trade_id = s.id AND s.user_id = v_user_id
                        LEFT JOIN options o ON tn.trade_type = 'option' AND tn.trade_id = o.id AND o.user_id = v_user_id
                        WHERE tn.user_id = v_user_id
                            AND tn.rating <= 2
                            AND (v_start_date IS NULL OR tn.created_at::date >= v_start_date)
                            AND (v_end_date IS NULL OR tn.created_at::date <= v_end_date)
                    ) low_rated_trades
                )
            )
        )
    ) INTO result;

    RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_tracking_summary(UUID, trade_note_type, trade_phase, INTEGER, INTEGER, TEXT[], TEXT, DATE, DATE, INTEGER) TO authenticated;

-- Add comprehensive documentation
COMMENT ON FUNCTION public.get_tracking_summary IS 'Generates a comprehensive tracking summary combining trade notes with their associated stock/option trades for AI consumption.

This function provides a complete view of user trading notes and their relationship to actual trades, including:

1. **Summary Metadata**: Timestamp, user context, filters applied
2. **Tracking Overview**: Note counts by asset type, phase, ratings distribution
3. **Detailed Trade Notes**: Full note content with associated trade details
4. **Tag Analysis**: Most common tags and usage patterns
5. **Performance Correlation**: How note ratings correlate with trade performance

Parameters:
- p_user_id: User ID (defaults to authenticated user)
- p_trade_type: Filter by asset type (''stock'', ''option'')
- p_phase: Filter by trade phase (''planning'', ''execution'', ''reflection'')
- p_rating_min/max: Filter by rating range (1-5)
- p_tags: Filter by tags (array overlap)
- p_time_range: Time range filter (''7d'', ''30d'', ''90d'', ''1y'', ''ytd'', ''custom'', ''all_time'')
- p_custom_start_date/end_date: Custom date range
- p_limit: Maximum number of detailed notes to return

Returns:
- Comprehensive JSON object with tracking analytics and trade correlations

Example usage:
-- Get all tracking data for authenticated user
SELECT get_tracking_summary();

-- Get high-rated notes from last 30 days
SELECT get_tracking_summary(NULL, NULL, NULL, 4, 5, NULL, ''30d'');

-- Get reflection phase notes for options
SELECT get_tracking_summary(NULL, ''option'', ''reflection'');';


-- Migration to update trade_phase enum to match frontend values
-- This updates the enum from ('planning', 'execution', 'reflection') 
-- to ('pre_entry', 'entry', 'management', 'exit', 'post_analysis')

BEGIN;

-- First, drop the functions that depend on the trade_phase enum
DROP FUNCTION IF EXISTS public.upsert_trade_note(INTEGER, trade_note_type, VARCHAR, TEXT, INTEGER, TEXT[], INTEGER, trade_phase, UUID);
DROP FUNCTION IF EXISTS public.select_trade_notes(INTEGER, INTEGER, trade_note_type, TEXT[], trade_phase, INTEGER);
DROP FUNCTION IF EXISTS public.get_tracking_summary(UUID, trade_note_type, trade_phase, INTEGER, INTEGER, TEXT[], TEXT, DATE, DATE, INTEGER);

-- Update existing data to map old values to new ones
UPDATE public.trade_notes 
SET phase = CASE 
    WHEN phase = 'planning' THEN 'pre_entry'::text
    WHEN phase = 'execution' THEN 'entry'::text
    WHEN phase = 'reflection' THEN 'post_analysis'::text
    ELSE phase::text
END::trade_phase
WHERE phase IN ('planning', 'execution', 'reflection');

-- Add the new enum values to the existing enum
ALTER TYPE trade_phase ADD VALUE IF NOT EXISTS 'pre_entry';
ALTER TYPE trade_phase ADD VALUE IF NOT EXISTS 'entry';
ALTER TYPE trade_phase ADD VALUE IF NOT EXISTS 'management';
ALTER TYPE trade_phase ADD VALUE IF NOT EXISTS 'exit';
ALTER TYPE trade_phase ADD VALUE IF NOT EXISTS 'post_analysis';

COMMIT;

-- Recreate the functions with updated enum values
-- Function to upsert a trade note
CREATE OR REPLACE FUNCTION public.upsert_trade_note(
  p_trade_id INTEGER,
  p_trade_type trade_note_type,
  p_title VARCHAR(255),
  p_content TEXT,
  p_note_id INTEGER DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_rating INTEGER DEFAULT NULL,
  p_phase trade_phase DEFAULT NULL,
  p_image_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_note_id INTEGER;
  v_result JSONB;
  v_trade_exists BOOLEAN;
BEGIN
  -- Validate user is authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User is not authenticated',
      'note_id', NULL
    );
  END IF;

  -- Validate trade ownership
  IF p_trade_type = 'stock' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.stocks
      WHERE id = p_trade_id AND user_id = v_user_id
    ) INTO v_trade_exists;
  ELSIF p_trade_type = 'option' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.options
      WHERE id = p_trade_id AND user_id = v_user_id
    ) INTO v_trade_exists;
  ELSE
    RAISE EXCEPTION 'Invalid trade type: %', p_trade_type;
  END IF;

  IF NOT v_trade_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Trade not found or access denied',
      'note_id', NULL
    );
  END IF;

  -- Insert or update the note
  IF p_note_id IS NULL THEN
    -- Insert new note
    INSERT INTO public.trade_notes (
      user_id, trade_id, trade_type, title, content, tags, rating, phase, image_id
    ) VALUES (
      v_user_id, p_trade_id, p_trade_type, p_title, p_content, p_tags, p_rating, p_phase, p_image_id
    )
    RETURNING id INTO v_note_id;

    v_result := jsonb_build_object(
      'success', true,
      'action', 'inserted',
      'note_id', v_note_id
    );
  ELSE
    -- Update existing note
    UPDATE public.trade_notes
    SET
      trade_id = p_trade_id,
      trade_type = p_trade_type,
      title = p_title,
      content = p_content,
      tags = p_tags,
      rating = p_rating,
      phase = p_phase,
      image_id = p_image_id,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = p_note_id
    AND user_id = v_user_id
    RETURNING id INTO v_note_id;

    IF v_note_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Note not found or access denied',
        'note_id', NULL
      );
    END IF;

    v_result := jsonb_build_object(
      'success', true,
      'action', 'updated',
      'note_id', v_note_id
    );
  END IF;

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', SQLERRM,
      'note_id', NULL
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.upsert_trade_note(INTEGER, trade_note_type, VARCHAR, TEXT, INTEGER, TEXT[], INTEGER, trade_phase, UUID)
TO authenticated;

-- Function to select trade notes for the authenticated user
CREATE OR REPLACE FUNCTION public.select_trade_notes(
  p_note_id INTEGER DEFAULT NULL,
  p_trade_id INTEGER DEFAULT NULL,
  p_trade_type trade_note_type DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_phase trade_phase DEFAULT NULL,
  p_rating INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result JSONB;
BEGIN
  -- Ensure user is authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User is not authenticated', 'data', '[]'::jsonb);
  END IF;

  -- Aggregate matching notes into a JSONB array with trade symbols
  SELECT jsonb_agg(t)
  FROM (
    SELECT
      tn.id,
      tn.user_id,
      tn.trade_id,
      tn.trade_type,
      tn.title,
      tn.content,
      tn.created_at,
      tn.updated_at,
      tn.tags,
      tn.rating,
      tn.phase,
      tn.image_id,
      CASE 
        WHEN tn.trade_type = 'stock' THEN s.symbol
        WHEN tn.trade_type = 'option' THEN o.symbol
        ELSE NULL
      END as trade_symbol
    FROM public.trade_notes tn
    LEFT JOIN public.stocks s ON tn.trade_type = 'stock' AND tn.trade_id = s.id AND s.user_id = v_user_id
    LEFT JOIN public.options o ON tn.trade_type = 'option' AND tn.trade_id = o.id AND o.user_id = v_user_id
    WHERE tn.user_id = v_user_id
      AND (p_note_id IS NULL OR tn.id = p_note_id)
      AND (p_trade_id IS NULL OR tn.trade_id = p_trade_id)
      AND (p_trade_type IS NULL OR tn.trade_type = p_trade_type)
      AND (p_tags IS NULL OR tn.tags && p_tags) -- Check for tag overlap
      AND (p_phase IS NULL OR tn.phase = p_phase)
      AND (p_rating IS NULL OR tn.rating = p_rating)
    ORDER BY tn.created_at DESC
  ) t
  INTO v_result;

  RETURN jsonb_build_object('success', true, 'data', COALESCE(v_result, '[]'::jsonb));
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM, 'data', '[]'::jsonb);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.select_trade_notes(INTEGER, INTEGER, trade_note_type, TEXT[], trade_phase, INTEGER)
TO authenticated;

-- Function to delete a trade note for the authenticated user  
CREATE OR REPLACE FUNCTION public.delete_trade_note(
  p_note_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_deleted_note_id INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User is not authenticated');
  END IF;

  DELETE FROM public.trade_notes
  WHERE id = p_note_id AND user_id = v_user_id
  RETURNING id INTO v_deleted_note_id;

  IF v_deleted_note_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Note not found or access denied');
  ELSE
    RETURN jsonb_build_object('success', true, 'message', 'Note deleted successfully', 'deleted_note_id', v_deleted_note_id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_trade_note(INTEGER) TO authenticated;

-- Simplified get_tracking_summary function
CREATE OR REPLACE FUNCTION public.get_tracking_summary(
    p_user_id UUID DEFAULT NULL,
    p_trade_type trade_note_type DEFAULT NULL,
    p_phase trade_phase DEFAULT NULL,
    p_rating_min INTEGER DEFAULT NULL,
    p_rating_max INTEGER DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
    v_user_id UUID;
BEGIN
    v_user_id := COALESCE(p_user_id, auth.uid());
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User authentication required';
    END IF;

    SELECT json_build_object(
        'summary_metadata', json_build_object(
            'generated_at', NOW(),
            'user_id', v_user_id,
            'time_range', p_time_range
        ),
        'tracking_overview', json_build_object(
            'total_notes', (
                SELECT COUNT(*)
                FROM trade_notes tn
                WHERE tn.user_id = v_user_id
                    AND (p_trade_type IS NULL OR tn.trade_type = p_trade_type)
                    AND (p_phase IS NULL OR tn.phase = p_phase)
                    AND (p_rating_min IS NULL OR tn.rating >= p_rating_min)
                    AND (p_rating_max IS NULL OR tn.rating <= p_rating_max)
                    AND (p_tags IS NULL OR tn.tags && p_tags)
            )
        )
    ) INTO result;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tracking_summary(UUID, trade_note_type, trade_phase, INTEGER, INTEGER, TEXT[], TEXT, DATE, DATE, INTEGER) TO authenticated;
