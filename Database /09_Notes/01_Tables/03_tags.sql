-- Tags table with RLS
CREATE TABLE IF NOT EXISTS public.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6B7280',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, name)
);

-- Enable RLS
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their tags" 
ON public.tags 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Note-Tags junction table
CREATE TABLE IF NOT EXISTS public.note_tags (
    note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (note_id, tag_id)
);

-- RLS for junction table
ALTER TABLE public.note_tags ENABLE ROW LEVEL SECURITY;

-- Helper function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_tags_updated_at
BEFORE UPDATE ON public.tags
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Get tags with note counts
CREATE OR REPLACE FUNCTION get_tags_with_counts()
RETURNS TABLE (
    id UUID,
    name TEXT,
    color TEXT,
    note_count BIGINT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) LANGUAGE sql SECURITY DEFINER AS $$
    SELECT 
        t.id,
        t.name,
        t.color,
        COUNT(nt.note_id)::BIGINT as note_count,
        t.created_at,
        t.updated_at
    FROM public.tags t
    LEFT JOIN public.note_tags nt ON t.id = nt.tag_id
    WHERE t.user_id = auth.uid()
    GROUP BY t.id, t.name, t.color, t.created_at, t.updated_at
    ORDER BY t.name;
$$;

-- Rename a tag
CREATE OR REPLACE FUNCTION rename_tag(
    p_tag_id UUID,
    p_new_name TEXT
) RETURNS TABLE (success BOOLEAN, message TEXT) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Check if tag exists and belongs to user
    IF NOT EXISTS (SELECT 1 FROM public.tags WHERE id = p_tag_id AND user_id = auth.uid()) THEN
        RETURN QUERY SELECT false, 'Tag not found or access denied';
        RETURN;
    END IF;
    
    -- Check if new name already exists
    IF EXISTS (SELECT 1 FROM public.tags WHERE name = p_new_name AND user_id = auth.uid() AND id != p_tag_id) THEN
        RETURN QUERY SELECT false, 'A tag with this name already exists';
        RETURN;
    END IF;
    
    -- Update the tag name
    UPDATE public.tags 
    SET name = p_new_name
    WHERE id = p_tag_id AND user_id = auth.uid();
    
    RETURN QUERY SELECT true, 'Tag renamed successfully';
EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 'Error renaming tag: ' || SQLERRM;
END;
$$;

-- Search tags by name
CREATE OR REPLACE FUNCTION search_tags(
    p_search_term TEXT,
    p_limit INT DEFAULT 10
) RETURNS TABLE (
    id UUID,
    name TEXT,
    color TEXT,
    note_count BIGINT
) LANGUAGE sql SECURITY DEFINER AS $$
    SELECT 
        t.id,
        t.name,
        t.color,
        COUNT(nt.note_id)::BIGINT as note_count
    FROM public.tags t
    LEFT JOIN public.note_tags nt ON t.id = nt.tag_id
    WHERE t.user_id = auth.uid()
    AND t.name ILIKE '%' || p_search_term || '%'
    GROUP BY t.id
    ORDER BY 
        CASE 
            WHEN t.name ILIKE p_search_term || '%' THEN 0
            ELSE 1
        END,
        t.name
    LIMIT p_limit;
$$;

-- Tag a note 
CREATE OR REPLACE FUNCTION tag_note(
    p_note_id UUID,
    p_tag_name TEXT,
    p_tag_color TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tag_id UUID;
BEGIN
    -- Get or create tag
    INSERT INTO public.tags (user_id, name, color)
    VALUES (auth.uid(), p_tag_name, COALESCE(p_tag_color, '#6B7280'))
    ON CONFLICT (user_id, name) 
    DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_tag_id;
    
    -- Add tag to note
    INSERT INTO public.note_tags (note_id, tag_id)
    SELECT p_note_id, v_tag_id
    WHERE EXISTS (
        SELECT 1 FROM public.notes 
        WHERE id = p_note_id AND user_id = auth.uid()
    )
    ON CONFLICT DO NOTHING;
END;
$$;

-- Remove tag from note 
CREATE OR REPLACE FUNCTION untag_note(
    p_note_id UUID,
    p_tag_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    DELETE FROM public.note_tags nt
    WHERE nt.note_id = p_note_id 
    AND nt.tag_id = p_tag_id
    AND EXISTS (
        SELECT 1 FROM public.notes n 
        WHERE n.id = p_note_id AND n.user_id = auth.uid()
    );
END;
$$;

-- Get notes by tag
CREATE OR REPLACE FUNCTION get_notes_by_tag(
    p_tag_id UUID
) RETURNS SETOF public.notes 
LANGUAGE sql SECURITY DEFINER AS $$
    SELECT n.*
    FROM public.notes n
    JOIN public.note_tags nt ON n.id = nt.note_id
    WHERE nt.tag_id = p_tag_id 
    AND n.user_id = auth.uid()
    AND n.is_deleted = false;
$$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.note_tags TO authenticated;
GRANT EXECUTE ON FUNCTION get_tags_with_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION tag_note(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION untag_note(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_notes_by_tag(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rename_tag(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION search_tags(TEXT, INTEGER) TO authenticated;