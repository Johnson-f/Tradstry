-- Function to get notes with filtering and sorting options
CREATE OR REPLACE FUNCTION get_notes(
    p_note_id UUID DEFAULT NULL,
    p_folder_slug TEXT DEFAULT NULL,
    p_search_term TEXT DEFAULT NULL,
    p_is_favorite BOOLEAN DEFAULT NULL,
    p_is_pinned BOOLEAN DEFAULT NULL,
    p_is_archived BOOLEAN DEFAULT false,
    p_is_deleted BOOLEAN DEFAULT NULL,
    p_include_deleted BOOLEAN DEFAULT false,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0,
    p_sort_by TEXT DEFAULT 'updated_at',
    p_sort_order TEXT DEFAULT 'DESC'
)
RETURNS TABLE (
    id UUID,
    folder_id UUID,
    title TEXT,
    content_preview TEXT,
    is_pinned BOOLEAN,
    is_favorite BOOLEAN,
    is_archived BOOLEAN,
    is_deleted BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    total_count BIGINT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_valid_sort_columns TEXT[] := ARRAY['title', 'created_at', 'updated_at', 'is_pinned', 'is_favorite'];
    v_valid_sort_orders TEXT[] := ARRAY['ASC', 'DESC'];
    v_where_conditions TEXT[] := '{}';
    v_query TEXT;
    v_count_query TEXT;
    v_order_by TEXT;
BEGIN
    -- Input validation
    IF p_sort_by IS NOT NULL AND p_sort_by != ALL(v_valid_sort_columns) THEN
        RAISE EXCEPTION 'Invalid sort_by parameter. Must be one of: %', 
            array_to_string(v_valid_sort_columns, ', ');
    END IF;
    
    IF p_sort_order IS NOT NULL AND upper(p_sort_order) != ALL(v_valid_sort_orders) THEN
        RAISE EXCEPTION 'Invalid sort_order parameter. Must be one of: %', 
            array_to_string(v_valid_sort_orders, ', ');
    END IF;
    
    -- Build WHERE conditions
    v_where_conditions := array_append(v_where_conditions, 'n.user_id = ' || quote_literal(v_user_id));
    
    -- Handle note ID (highest priority)
    IF p_note_id IS NOT NULL THEN
        -- If we have a note ID, we'll automatically get its folder
        v_where_conditions := array_append(v_where_conditions, 
            'n.id = ' || quote_literal(p_note_id));
        
        -- If folder_slug was also provided, validate it matches the note's folder
        IF p_folder_slug IS NOT NULL THEN
            v_where_conditions := array_append(v_where_conditions, 
                'n.folder_id = (SELECT id FROM public.folders WHERE slug = ' || 
                quote_literal(p_folder_slug) || ' AND user_id = ' || 
                quote_literal(v_user_id) || ' LIMIT 1)');
        END IF;
    -- Handle folder slug only (when no note ID is provided)
    ELSIF p_folder_slug IS NOT NULL THEN
        v_where_conditions := array_append(v_where_conditions, 
            'n.folder_id = (SELECT id FROM public.folders WHERE slug = ' || 
            quote_literal(p_folder_slug) || ' AND user_id = ' || 
            quote_literal(v_user_id) || ' LIMIT 1)');
    END IF;
    
    IF p_search_term IS NOT NULL AND trim(p_search_term) != '' THEN
        v_where_conditions := array_append(v_where_conditions, 
            format('(title ILIKE %L OR content::text ILIKE %L)', 
                '%' || trim(p_search_term) || '%', 
                '%' || trim(p_search_term) || '%'));
    END IF;
    
    IF p_is_favorite IS NOT NULL THEN
        v_where_conditions := array_append(v_where_conditions, 
            'is_favorite = ' || p_is_favorite);
    END IF;
    
    IF p_is_pinned IS NOT NULL THEN
        v_where_conditions := array_append(v_where_conditions, 
            'is_pinned = ' || p_is_pinned);
    END IF;
    
    v_where_conditions := array_append(v_where_conditions, 
        'is_archived = ' || p_is_archived);
    
    -- Handle deleted notes filtering
    IF p_is_deleted IS NOT NULL THEN
        v_where_conditions := array_append(v_where_conditions, 
            'is_deleted = ' || p_is_deleted);
    ELSIF NOT p_include_deleted THEN
        v_where_conditions := array_append(v_where_conditions, 'is_deleted = false');
    END IF;
    
    -- Build ORDER BY clause
    v_order_by := format('ORDER BY %I %s', 
        p_sort_by, 
        CASE WHEN p_sort_order IS NOT NULL THEN p_sort_order ELSE 'DESC' END);
    
    -- Add secondary sort for consistent ordering
    v_order_by := v_order_by || ', updated_at DESC';
    
    -- Build the query
    v_query := format('
        WITH filtered_notes AS (
            SELECT 
                id,
                folder_id,
                title,
                content,
                CASE 
                    WHEN jsonb_typeof(content->''root''->''children'') = ''array'' 
                    THEN substr(
                        (SELECT string_agg(
                            CASE 
                                WHEN elem->>''type'' = ''text'' THEN elem->>''text''
                                WHEN elem->>''text'' IS NOT NULL THEN elem->>''text''
                                ELSE ''''
                            END, 
                            '' ''
                        )
                        FROM jsonb_array_elements(
                            CASE 
                                WHEN jsonb_typeof(content->''root''->''children'') = ''array'' 
                                THEN content->''root''->''children''
                                ELSE ''[]''::jsonb
                            END
                        ) AS elem
                        WHERE jsonb_typeof(elem) = ''object''
                    ), 1, 200)
                    ELSE ''No text content''
                END as content_preview,
                is_pinned,
                is_favorite,
                is_archived,
                is_deleted,
                created_at,
                updated_at,
                COUNT(*) OVER() as total_count
FROM public.notes n
            WHERE %s
            %s
            LIMIT %s OFFSET %s
        )
        SELECT 
            id,
            folder_id,
            title,
            content,
            content_preview,
            is_pinned,
            is_favorite,
            is_archived,
            is_deleted,
            created_at,
            updated_at,
            (SELECT COUNT(*) FROM public.notes n WHERE %s) as total_count
        FROM filtered_notes
        %s',
        array_to_string(v_where_conditions, ' AND '),
        v_order_by,
        p_limit,
        p_offset,
        array_to_string(v_where_conditions, ' AND '),
        v_order_by
    );
    
    -- Execute and return the query
    RETURN QUERY EXECUTE v_query;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to fetch notes: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_notes TO authenticated;

/*
-- Example usage:

-- Get a specific note by ID (no need to know folder)
-- The function will automatically find the note by ID
SELECT * FROM get_notes(
    p_note_id := 'note-uuid-here'
);

-- You can also still provide folder_slug for additional validation if needed
SELECT * FROM get_notes(
    p_note_id := 'note-uuid-here',
    p_folder_slug := 'notes'  -- Optional: adds validation that note is in this folder
);

-- Get notes in a folder by slug (paginated)
SELECT * FROM get_notes(
    p_folder_slug := 'notes',
    p_limit := 20,
    p_offset := 0
);

-- Search for notes containing a term
SELECT * FROM get_notes(
    p_search_term := 'important',
    p_limit := 50
);

-- Get favorite notes
SELECT * FROM get_notes(
    p_is_favorite := true,
    p_sort_by := 'title',
    p_sort_order := 'ASC'
);

-- Get pinned notes in a specific folder
SELECT * FROM get_notes(
    p_folder_slug := 'notes',
    p_is_pinned := true
);

-- Get archived notes (including deleted ones)
SELECT * FROM get_notes(
    p_is_archived := true,
    p_include_deleted := true
);
*/
