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