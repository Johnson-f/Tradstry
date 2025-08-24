-- Optimized delete function for images table
-- This function safely deletes an image record for the authenticated user
-- Also handles cleanup of the associated file from Supabase Storage

CREATE OR REPLACE FUNCTION delete_image(p_id uuid)
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
    DELETE FROM images 
    WHERE id = p_id 
      AND user_id = v_user_id
    RETURNING 
        id,
        user_id,
        note_id,
        filename,
        original_filename,
        file_path,
        file_size,
        mime_type,
        width,
        height,
        alt_text,
        caption,
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
                'note_id', deleted_record.note_id,
                'filename', deleted_record.filename,
                'original_filename', deleted_record.original_filename,
                'file_path', deleted_record.file_path,
                'file_size', deleted_record.file_size,
                'mime_type', deleted_record.mime_type,
                'width', deleted_record.width,
                'height', deleted_record.height,
                'alt_text', deleted_record.alt_text,
                'caption', deleted_record.caption,
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

-- Function to delete multiple images by note_id
-- Useful when deleting a note and all its associated images
CREATE OR REPLACE FUNCTION delete_images_by_note(p_note_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    deleted_count integer;
    deleted_records json;
BEGIN
    -- Get the current user ID once and validate
    v_user_id := auth.uid();
    
    -- Early return if user is not authenticated
    IF v_user_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'User not authenticated',
            'deleted_count', 0,
            'deleted_records', '[]'::json
        );
    END IF;
    
    -- Delete images and collect deleted records
    WITH deleted AS (
        DELETE FROM images 
        WHERE note_id = p_note_id 
          AND user_id = v_user_id
        RETURNING 
            id, user_id, note_id, filename, original_filename, file_path,
            file_size, mime_type, width, height, alt_text, caption,
            created_at, updated_at
    )
    SELECT 
        COUNT(*), 
        COALESCE(json_agg(row_to_json(deleted)), '[]'::json)
    INTO deleted_count, deleted_records
    FROM deleted;
    
    -- Return structured response
    RETURN json_build_object(
        'success', true,
        'deleted_count', deleted_count,
        'deleted_records', deleted_records
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- Handle any unexpected errors
        RETURN json_build_object(
            'success', false,
            'error', 'Database error: ' || SQLERRM,
            'deleted_count', 0,
            'deleted_records', '[]'::json
        );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_image TO authenticated;
GRANT EXECUTE ON FUNCTION delete_images_by_note TO authenticated;

-- Optional: Create an index to optimize the delete operation if not already present
CREATE INDEX IF NOT EXISTS idx_images_user_id_id ON images(user_id, id);
CREATE INDEX IF NOT EXISTS idx_images_note_id_user_id ON images(note_id, user_id);

-- Example usage and expected responses:

-- Delete single image:
-- SELECT delete_image('image-uuid-here'::uuid);
-- Returns: {"success": true, "deleted_record": {"id": "uuid", "user_id": "uuid", "note_id": "uuid", "filename": "image.jpg", ...}}

-- Delete all images for a note:
-- SELECT delete_images_by_note('note-uuid-here'::uuid);
-- Returns: {"success": true, "deleted_count": 3, "deleted_records": [{"id": "uuid1", ...}, {"id": "uuid2", ...}]}

-- Record not found or access denied:
-- SELECT delete_image('non-existent-uuid'::uuid);
-- Returns: {"success": false, "error": "Record not found or access denied", "deleted_record": null}

-- User not authenticated:
-- Returns: {"success": false, "error": "User not authenticated", "deleted_record": null}
