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
