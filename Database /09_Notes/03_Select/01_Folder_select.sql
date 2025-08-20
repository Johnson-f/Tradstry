-- Function to get folders with filtering and sorting options
CREATE OR REPLACE FUNCTION get_folders(
    search_term TEXT DEFAULT NULL,
    is_system_param BOOLEAN DEFAULT NULL,
    limit_rows INTEGER DEFAULT 100,
    offset_rows INTEGER DEFAULT 0,
    sort_by TEXT DEFAULT 'name',
    sort_order TEXT DEFAULT 'ASC'
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    slug TEXT,
    description TEXT,
    is_system BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    total_count BIGINT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    valid_sort_columns TEXT[] := ARRAY['name', 'slug', 'created_at', 'updated_at'];
    valid_sort_orders TEXT[] := ARRAY['ASC', 'DESC'];
    order_by_clause TEXT;
    where_conditions TEXT[] := '{}';
    query_text TEXT;
    count_query TEXT;
    total_count_result BIGINT;
BEGIN
    -- Input validation
    IF sort_by IS NOT NULL AND sort_by != ALL(valid_sort_columns) THEN
        RAISE EXCEPTION 'Invalid sort_by parameter. Must be one of: %', array_to_string(valid_sort_columns, ', ');
    END IF;
    
    IF sort_order IS NOT NULL AND upper(sort_order) != ALL(valid_sort_orders) THEN
        RAISE EXCEPTION 'Invalid sort_order parameter. Must be one of: %', array_to_string(valid_sort_orders, ', ');
    END IF;
    
    -- Build WHERE conditions
    IF search_term IS NOT NULL AND trim(search_term) != '' THEN
        search_term := '%' || trim(search_term) || '%';
        where_conditions := array_append(where_conditions, 
            format('(name ILIKE %L OR description ILIKE %L)', search_term, search_term)
        );
    END IF;
    
    IF is_system_param IS NOT NULL THEN
        where_conditions := array_append(where_conditions, 
            format('is_system = %L', is_system_param)
        );
    END IF;
    
    -- Build ORDER BY clause
    order_by_clause := format('ORDER BY %I %s', 
        sort_by, 
        CASE WHEN sort_order IS NOT NULL THEN sort_order ELSE 'ASC' END
    );
    
    -- Build the main query
    query_text := format(
        'SELECT 
            f.id, 
            f.name, 
            f.slug, 
            f.description, 
            f.is_system, 
            f.created_at, 
            f.updated_at,
            (SELECT COUNT(*) FROM public.folders f2 %s) as total_count
        FROM public.folders f
        %s
        %s
        LIMIT %s OFFSET %s',
        CASE WHEN array_length(where_conditions, 1) > 0 
             THEN 'WHERE ' || array_to_string(where_conditions, ' AND ') 
             ELSE '' END,
        CASE WHEN array_length(where_conditions, 1) > 0 
             THEN 'WHERE ' || array_to_string(where_conditions, ' AND ') 
             ELSE '' END,
        order_by_clause,
        limit_rows,
        offset_rows
    );
    
    -- Execute and return the query
    RETURN QUERY EXECUTE query_text;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_folders TO authenticated;

-- Testing on supabase (Get system folder which is what i need on the frontend)
-- SELECT * FROM get_folders(is_system_param := true);
