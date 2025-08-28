-- Function to delete a trade note for the authenticated user
CREATE OR REPLACE FUNCTION public.delete_trade_note(
  p_note_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
