-- Function to soft delete a note (move to trash)
CREATE OR REPLACE FUNCTION delete_note(p_note_id UUID)
RETURNS TABLE (success BOOLEAN, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_trash_folder_id UUID;
    v_note_title TEXT;
BEGIN
    -- Get trash folder ID
    SELECT id INTO v_trash_folder_id
    FROM public.folders
    WHERE slug = 'trash' AND user_id = v_user_id;
    
    IF v_trash_folder_id IS NULL THEN
        RETURN QUERY SELECT false, 'Trash folder not found';
        RETURN;
    END IF;
    
    -- Update note to mark as deleted and move to trash
    UPDATE public.notes
    SET is_deleted = true,
        deleted_at = now(),
        folder_id = v_trash_folder_id,
        updated_at = now()
    WHERE id = p_note_id AND user_id = v_user_id
    RETURNING title INTO v_note_title;
    
    IF FOUND THEN
        RETURN QUERY SELECT true, format('Moved note to trash: %s', COALESCE(v_note_title, 'Untitled Note'));
    ELSE
        RETURN QUERY SELECT false, 'Note not found or access denied';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 'Error: ' || SQLERRM;
END;
$$;

-- Function to permanently delete a note (only from trash)
CREATE OR REPLACE FUNCTION permanent_delete_note(p_note_id UUID)
RETURNS TABLE (success BOOLEAN, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_note_title TEXT;
BEGIN
    -- Permanently delete the note (only if in trash)
    DELETE FROM public.notes n
    USING public.folders f
    WHERE n.id = p_note_id 
    AND n.user_id = v_user_id
    AND n.folder_id = f.id 
    AND f.slug = 'trash'
    RETURNING n.title INTO v_note_title;
    
    IF FOUND THEN
        RETURN QUERY SELECT true, format('Permanently deleted: %s', COALESCE(v_note_title, 'Note'));
    ELSE
        RETURN QUERY SELECT false, 'Note not found in trash or access denied';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 'Error: ' || SQLERRM;
END;
$$;

-- Function to restore a note from trash
CREATE OR REPLACE FUNCTION restore_note(
    p_note_id UUID,
    p_target_folder_slug TEXT DEFAULT 'notes'
)
RETURNS TABLE (success BOOLEAN, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_target_folder_id UUID;
    v_note_title TEXT;
BEGIN
    -- Get target folder ID
    SELECT id INTO v_target_folder_id
    FROM public.folders
    WHERE slug = p_target_folder_slug AND user_id = v_user_id;
    
    IF v_target_folder_id IS NULL THEN
        RETURN QUERY SELECT false, 'Target folder not found';
        RETURN;
    END IF;
    
    -- Restore the note
    UPDATE public.notes n
    SET is_deleted = false,
        deleted_at = NULL,
        folder_id = v_target_folder_id,
        updated_at = now()
    FROM public.folders f
    WHERE n.id = p_note_id 
    AND n.user_id = v_user_id
    AND n.folder_id = f.id 
    AND f.slug = 'trash'
    RETURNING n.title INTO v_note_title;
    
    IF FOUND THEN
        RETURN QUERY SELECT true, format('Restored note: %s', COALESCE(v_note_title, 'Untitled Note'));
    ELSE
        RETURN QUERY SELECT false, 'Note not found in trash or access denied';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 'Error: ' || SQLERRM;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION delete_note(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION permanent_delete_note(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_note(UUID, TEXT) TO authenticated;

/*
-- Example usage:

-- Move note to trash
SELECT * FROM delete_note('note-uuid-here');

-- Permanently delete from trash
SELECT * FROM permanent_delete_note('note-uuid-here');

-- Restore note to default 'notes' folder
SELECT * FROM restore_note('note-uuid-here');

-- Restore note to specific folder
SELECT * FROM restore_note('note-uuid-here', 'work-notes');
*/
