-- Function to upsert a note (automatically detects insert vs update)
-- Fixed for system-only folders
CREATE OR REPLACE FUNCTION upsert_note(
    p_folder_id UUID,
    p_title TEXT DEFAULT 'Untitled Note',
    p_content JSONB DEFAULT '{}'::jsonb,
    p_is_pinned BOOLEAN DEFAULT false,
    p_is_favorite BOOLEAN DEFAULT false,
    p_is_archived BOOLEAN DEFAULT false,
    p_metadata JSONB DEFAULT NULL,
    p_id UUID DEFAULT NULL
)
RETURNS TABLE(note_id UUID, was_created BOOLEAN) AS $$
DECLARE
    v_note_id UUID;
    v_user_id UUID := auth.uid();
    v_folder_exists BOOLEAN;
    v_existing_note_id UUID;
    v_was_created BOOLEAN := false;
BEGIN
    -- Validate folder exists (system folders only, no user ownership check needed)
    SELECT EXISTS (
        SELECT 1 FROM public.folders 
        WHERE id = p_folder_id
    ) INTO v_folder_exists;
    
    IF NOT v_folder_exists THEN
        RAISE EXCEPTION 'Folder not found';
    END IF;

    -- If ID is provided, try to update that specific note
    IF p_id IS NOT NULL THEN
        -- Check if the note exists and user owns it
        SELECT id INTO v_existing_note_id
        FROM public.notes
        WHERE id = p_id 
        AND user_id = v_user_id
        AND is_deleted = false;
        
        IF v_existing_note_id IS NOT NULL THEN
            -- Update existing note
            UPDATE public.notes
            SET 
                folder_id = p_folder_id,
                title = COALESCE(NULLIF(TRIM(p_title), ''), 'Untitled Note'),
                content = p_content,
                is_pinned = p_is_pinned,
                is_favorite = p_is_favorite,
                is_archived = p_is_archived,
                updated_at = now(),
                version = version + 1,
                metadata = COALESCE(p_metadata, metadata)
            WHERE id = p_id 
            AND user_id = v_user_id
            RETURNING id INTO v_note_id;
            
            v_was_created := false;
        ELSE
            -- ID provided but note doesn't exist, treat as new note
            p_id := NULL; -- Clear the invalid ID
        END IF;
    END IF;
    
    -- If no ID provided or ID was invalid, create new note
    IF p_id IS NULL THEN
        INSERT INTO public.notes (
            folder_id,
            user_id,
            title,
            content,
            is_pinned,
            is_favorite,
            is_archived,
            metadata
        ) VALUES (
            p_folder_id,
            v_user_id,
            COALESCE(NULLIF(TRIM(p_title), ''), 'Untitled Note'),
            p_content,
            p_is_pinned,
            p_is_favorite,
            p_is_archived,
            p_metadata
        )
        RETURNING id INTO v_note_id;
        
        v_was_created := true;
    END IF;
    
    RETURN QUERY SELECT v_note_id, v_was_created;
    
EXCEPTION
    WHEN foreign_key_violation THEN
        RAISE EXCEPTION 'Invalid folder reference';
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to upsert note: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION upsert_note TO authenticated;