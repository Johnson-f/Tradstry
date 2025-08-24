-- Create unique constraint for natural upsert logic
-- This ensures one record per user per unique image file path
ALTER TABLE public.images 
ADD CONSTRAINT unique_image_path 
UNIQUE (user_id, file_path);

-- True upsert function for images table
-- This function inserts a new image record or updates an existing one based on natural key
CREATE OR REPLACE FUNCTION upsert_image(
    p_note_id uuid,
    p_filename text,
    p_original_filename text,
    p_file_path text,
    p_file_size bigint,
    p_mime_type text,
    p_width integer DEFAULT NULL,
    p_height integer DEFAULT NULL,
    p_alt_text text DEFAULT NULL,
    p_caption text DEFAULT NULL,
    p_user_id uuid DEFAULT NULL  -- Optional parameter for manual testing
)
RETURNS TABLE(
    id uuid,
    user_id uuid,
    note_id uuid,
    filename text,
    original_filename text,
    file_path text,
    file_size bigint,
    mime_type text,
    width integer,
    height integer,
    alt_text text,
    caption text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id uuid;
BEGIN
    -- Use provided user_id if given, otherwise get from auth context
    IF p_user_id IS NOT NULL THEN
        current_user_id := p_user_id;
    ELSE
        current_user_id := auth.uid();
        
        -- Raise an error if no authenticated user and no manual user_id provided
        IF current_user_id IS NULL THEN
            RAISE EXCEPTION 'No authenticated user found and no user_id provided. Please ensure you are logged in or provide a user_id parameter for testing.';
        END IF;
    END IF;

    RETURN QUERY
    INSERT INTO public.images (
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
        caption
    ) VALUES (
        current_user_id,
        p_note_id,
        p_filename,
        p_original_filename,
        p_file_path,
        p_file_size,
        p_mime_type,
        p_width,
        p_height,
        p_alt_text,
        p_caption
    )
    ON CONFLICT ON CONSTRAINT unique_image_path
    DO UPDATE SET
        note_id = EXCLUDED.note_id,
        filename = EXCLUDED.filename,
        original_filename = EXCLUDED.original_filename,
        file_size = EXCLUDED.file_size,
        mime_type = EXCLUDED.mime_type,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        alt_text = EXCLUDED.alt_text,
        caption = EXCLUDED.caption,
        updated_at = CURRENT_TIMESTAMP
    RETURNING 
        images.id,
        images.user_id,
        images.note_id,
        images.filename,
        images.original_filename,
        images.file_path,
        images.file_size,
        images.mime_type,
        images.width,
        images.height,
        images.alt_text,
        images.caption,
        images.created_at,
        images.updated_at;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION upsert_image TO authenticated;

-- Example usage for testing in Supabase SQL Editor:

-- Method 1: With manual user_id (for testing)
-- SELECT * FROM upsert_image(
--     'note-uuid-here'::uuid,                      -- note_id
--     'processed_image.jpg',                       -- filename
--     'my_photo.jpg',                             -- original_filename
--     'user-uuid/processed_image.jpg',            -- file_path
--     1024000,                                    -- file_size (1MB)
--     'image/jpeg',                               -- mime_type
--     1920,                                       -- width
--     1080,                                       -- height
--     'A beautiful landscape photo',              -- alt_text
--     'Sunset over the mountains',                -- caption
--     'your-uuid-here'::uuid                     -- manual user_id for testing
-- );

-- Method 2: With authenticated user (production usage)
-- SELECT * FROM upsert_image(
--     'note-uuid-here'::uuid,                      -- note_id
--     'processed_image.jpg',                       -- filename
--     'my_photo.jpg',                             -- original_filename
--     'user-uuid/processed_image.jpg',            -- file_path
--     1024000,                                    -- file_size
--     'image/jpeg'                                -- mime_type
--     -- user_id will be automatically retrieved from auth.uid()
-- );

-- To generate test UUIDs:
-- SELECT gen_random_uuid() as user_id, gen_random_uuid() as note_id;
