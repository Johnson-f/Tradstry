-- Function to get all images for the current user
CREATE OR REPLACE FUNCTION public.select_images()
RETURNS TABLE (
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
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
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
    FROM public.images
    WHERE user_id = auth.uid()
    ORDER BY created_at DESC;
$$;

-- Function to get a specific image by ID for the current user
CREATE OR REPLACE FUNCTION public.get_image_by_id(p_image_id uuid)
RETURNS TABLE (
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
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
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
    FROM public.images
    WHERE id = p_image_id
    AND user_id = auth.uid();
$$;

-- Function to get all images for a specific note
CREATE OR REPLACE FUNCTION public.get_images_by_note(p_note_id uuid)
RETURNS TABLE (
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
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
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
    FROM public.images
    WHERE note_id = p_note_id
    AND user_id = auth.uid()
    ORDER BY created_at ASC;
$$;

-- Function to get images with pagination
CREATE OR REPLACE FUNCTION public.get_images_paginated(
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
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
    updated_at timestamp with time zone,
    total_count bigint
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        i.id,
        i.user_id,
        i.note_id,
        i.filename,
        i.original_filename,
        i.file_path,
        i.file_size,
        i.mime_type,
        i.width,
        i.height,
        i.alt_text,
        i.caption,
        i.created_at,
        i.updated_at,
        COUNT(*) OVER() as total_count
    FROM public.images i
    WHERE i.user_id = auth.uid()
    ORDER BY i.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
$$;

-- Function to search images by filename or alt text
CREATE OR REPLACE FUNCTION public.search_images(p_search_term text)
RETURNS TABLE (
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
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
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
    FROM public.images
    WHERE user_id = auth.uid()
    AND (
        filename ILIKE '%' || p_search_term || '%' OR
        original_filename ILIKE '%' || p_search_term || '%' OR
        alt_text ILIKE '%' || p_search_term || '%' OR
        caption ILIKE '%' || p_search_term || '%'
    )
    ORDER BY created_at DESC;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION select_images TO authenticated;
GRANT EXECUTE ON FUNCTION get_image_by_id TO authenticated;
GRANT EXECUTE ON FUNCTION get_images_by_note TO authenticated;
GRANT EXECUTE ON FUNCTION get_images_paginated TO authenticated;
GRANT EXECUTE ON FUNCTION search_images TO authenticated;

-- Example usage:

-- Get all images for current user:
-- SELECT * FROM select_images();

-- Get specific image:
-- SELECT * FROM get_image_by_id('image-uuid-here'::uuid);

-- Get images for a specific note:
-- SELECT * FROM get_images_by_note('note-uuid-here'::uuid);

-- Get paginated images (20 per page, page 1):
-- SELECT * FROM get_images_paginated(20, 0);

-- Search images:
-- SELECT * FROM search_images('landscape');
