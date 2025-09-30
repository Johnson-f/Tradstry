-- Create folders table
CREATE TABLE IF NOT EXISTS public.folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add comments
COMMENT ON TABLE public.folders IS 'Stores note folders, including system and user-created folders';
COMMENT ON COLUMN public.folders.is_system IS 'Indicates if this is a system folder that cannot be modified';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_folders_slug ON public.folders(slug);
CREATE INDEX IF NOT EXISTS idx_folders_is_system ON public.folders(is_system);

-- Enable Row Level Security
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow read access to all folders" 
ON public.folders 
FOR SELECT 
USING (true);

-- Fixed policy - use WITH CHECK for INSERT operations
CREATE POLICY "Prevent all inserts"
ON public.folders
FOR INSERT
WITH CHECK (false);

-- Prevent updates to system folders
CREATE POLICY "Prevent updates to system folders"
ON public.folders
FOR UPDATE
USING (is_system = false);

-- Prevent all deletes
CREATE POLICY "Prevent all deletes"
ON public.folders
FOR DELETE
USING (false);

-- Create trigger function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;   
END;
$$ language 'plpgsql';

-- Create trigger
CREATE TRIGGER update_folders_updated_at
    BEFORE UPDATE ON public.folders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create secure function to insert system folders
CREATE OR REPLACE FUNCTION create_system_folder(
    folder_name TEXT,
    folder_slug TEXT,
    folder_description TEXT DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    folder_id UUID;
BEGIN
    -- Validate inputs
    IF folder_name IS NULL OR trim(folder_name) = '' THEN
        RAISE EXCEPTION 'Folder name cannot be empty';
    END IF;
    
    IF folder_slug IS NULL OR trim(folder_slug) = '' THEN
        RAISE EXCEPTION 'Folder slug cannot be empty';
    END IF;
    
    -- Insert the folder
    INSERT INTO public.folders (name, slug, description, is_system)
    VALUES (trim(folder_name), trim(folder_slug), folder_description, true)
    RETURNING id INTO folder_id;
    
    RETURN folder_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Folder with slug "%" already exists', folder_slug;
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to create system folder: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users (adjust as needed)
GRANT EXECUTE ON FUNCTION create_system_folder TO authenticated;

-- Create helper function to get folder by slug
CREATE OR REPLACE FUNCTION get_folder_by_slug(folder_slug TEXT)
RETURNS TABLE (
    id UUID,
    name TEXT,
    slug TEXT,
    description TEXT,
    is_system BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT f.id, f.name, f.slug, f.description, f.is_system, f.created_at, f.updated_at
    FROM public.folders f
    WHERE f.slug = folder_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION get_folder_by_slug TO authenticated;

-- Insert default system folders using the secure function
SELECT create_system_folder('Home', 'home', 'Contains all your notes');
SELECT create_system_folder('Favorites', 'favorites', 'Your favorite notes'); -- use favorite function to fetch favorites notes on this folder 
SELECT create_system_folder('Notes', 'notes', 'Contain all your notes'); -- need a table
SELECT create_system_folder('Calendar', 'calendar', 'Contain all your reminders & planned activity');
SELECT create_system_folder('Templates', 'templates', 'Contain all in-built templates with your custom templates'); -- need a table
SELECT create_system_folder('Tags', 'tags', 'Contains all your tags'); -- need a table
SELECT create_system_folder('Files', 'files', 'Contain all your files uploads'); -- need a table
SELECT create_system_folder('Trash', 'trash', 'Contain all recently deleted files, templates, tags, & notes'); -- use recently delete function to fetch recently detelted notes on this folder - so users can restore or permanently delete
SELECT create_system_folder('Shared With Me', 'shared-with-me', 'Contains all notes another user shares with you or you share with them');



/*
TO DO LIST
  * Work on the Files
  * Work on the Calendar
  * Work on the Shared with me 
*/


-- Create notes table
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Note',
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    is_favorite BOOLEAN NOT NULL DEFAULT false,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    metadata JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add comments
COMMENT ON TABLE public.notes IS 'Stores user notes with rich text content';
COMMENT ON COLUMN public.notes.content IS 'Stores the rich text content in JSON format (compatible with Lexical editor)';
COMMENT ON COLUMN public.notes.is_favorite IS 'Indicates if the note is marked as favorite by the user';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_folder_id ON public.notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_notes_is_favorite ON public.notes(user_id, is_favorite) WHERE is_favorite = true;

-- Enable Row Level Security
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own notes"
ON public.notes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create notes"
ON public.notes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notes"
ON public.notes FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notes"
ON public.notes FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger function to update timestamps (updated)
CREATE OR REPLACE FUNCTION update_note_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;   
END;
$$ language 'plpgsql';

-- Create trigger
CREATE TRIGGER update_notes_timestamps
BEFORE UPDATE ON public.notes
FOR EACH ROW
EXECUTE FUNCTION update_note_timestamps();

-- Function to move note to trash
CREATE OR REPLACE FUNCTION move_note_to_trash(note_id UUID)
RETURNS VOID AS $$
DECLARE
    trash_folder_id UUID;
BEGIN
    -- Get the trash folder ID
    SELECT id INTO trash_folder_id FROM public.folders WHERE slug = 'trash' LIMIT 1;
    
    -- Update the note
    UPDATE public.notes
    SET folder_id = trash_folder_id, is_deleted = true, deleted_at = now()
    WHERE id = note_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION move_note_to_trash TO authenticated;

-- Function to restore a note from trash (updated)
CREATE OR REPLACE FUNCTION restore_note_from_trash(
    note_id UUID,
    target_folder_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    target_id UUID;
    note_record RECORD;
BEGIN
    -- Get the note to restore
    SELECT * INTO note_record 
    FROM public.notes 
    WHERE id = note_id 
    AND user_id = auth.uid()
    AND is_deleted = true
    FOR UPDATE;
    
    IF note_record IS NULL THEN
        RAISE EXCEPTION 'Note not found in trash or access denied';
    END IF;
    
    -- Determine target folder
    IF target_folder_id IS NULL THEN
        -- Default to 'Notes' folder if no target specified
        SELECT id INTO target_id 
        FROM public.folders 
        WHERE slug = 'notes' 
        AND user_id = auth.uid()
        LIMIT 1;
        
        IF target_id IS NULL THEN
            RAISE EXCEPTION 'Default notes folder not found';
        END IF;
    ELSE
        -- Verify the target folder exists and user has access
        PERFORM 1 FROM public.folders 
        WHERE id = target_folder_id 
        AND (is_system = true OR user_id = auth.uid())
        LIMIT 1;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Target folder not found or access denied';
        END IF;
        
        target_id := target_folder_id;
    END IF;
    
    -- Restore the note
    UPDATE public.notes
    SET 
        folder_id = target_id,
        is_deleted = false,
        deleted_at = NULL,
        updated_at = now()
    WHERE id = note_id
    RETURNING id INTO note_id;
    
    RETURN note_id;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to restore note: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION restore_note_from_trash TO authenticated;

-- Function to toggle favorite status of a note (updated)
CREATE OR REPLACE FUNCTION toggle_note_favorite(note_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    new_favorite_status BOOLEAN;
BEGIN
    -- Toggle the favorite status and return the new status
    UPDATE public.notes
    SET 
        is_favorite = NOT is_favorite,
        updated_at = now()
    WHERE id = note_id 
    AND user_id = auth.uid()
    RETURNING is_favorite INTO new_favorite_status;
    
    IF new_favorite_status IS NULL THEN
        RAISE EXCEPTION 'Note not found or access denied';
    END IF;
    
    RETURN new_favorite_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION toggle_note_favorite TO authenticated;

-- Function to get all favorite notes for the current user
CREATE OR REPLACE FUNCTION get_favorite_notes()
RETURNS TABLE (
    id UUID,
    title TEXT,
    folder_id UUID,
    folder_name TEXT,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n.id,
        n.title,
        n.folder_id,
        f.name as folder_name,
        n.updated_at
    FROM public.notes n
    JOIN public.folders f ON n.folder_id = f.id
    WHERE n.user_id = auth.uid()
    AND n.is_favorite = true
    AND n.is_deleted = false
    ORDER BY n.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_favorite_notes TO authenticated;

/*
-- View deleted notes 
SELECT * FROM notes 
WHERE is_deleted = true 
AND user_id = auth.uid();

-- Testing restore note from trash
-- Restore to default 'Notes' folder
SELECT restore_note_from_trash('note-id-here');

-- Restore to specific folder
SELECT restore_note_from_trash('note-id-here', 'target-folder-id');

-- Testing Toggle favorite status 
SELECT toggle_note_favorite('note-id-here');
SELECT * FROM get_favorite_notes();
*/


/* 
SELECT * FROM upsert_note(
    p_folder_id := '33951791-4677-427e-854d-8f3c6b92b729',
    p_title := 'Test Note',
    p_content := '{"root":{"children":[]}}'::jsonb
);
*/

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
    user_id UUID,  -- ADD THIS LINE
    note_count BIGINT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) LANGUAGE sql SECURITY DEFINER AS $$
    SELECT
        t.id,
        t.name,
        t.color,
        t.user_id,  -- ADD THIS LINE
        COUNT(nt.note_id)::BIGINT as note_count,
        t.created_at,
        t.updated_at
    FROM public.tags t
    LEFT JOIN public.note_tags nt ON t.id = nt.tag_id
    WHERE t.user_id = auth.uid()
    GROUP BY t.id, t.name, t.color, t.user_id, t.created_at, t.updated_at  -- ADD user_id HERE TOO
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
    user_id UUID,  -- ADD THIS LINE
    note_count BIGINT
) LANGUAGE sql SECURITY DEFINER AS $$
    SELECT
        t.id,
        t.name,
        t.color,
        t.user_id,  -- ADD THIS LINE
        COUNT(nt.note_id)::BIGINT as note_count
    FROM public.tags t
    LEFT JOIN public.note_tags nt ON t.id = nt.tag_id
    WHERE t.user_id = auth.uid()
    AND t.name ILIKE '%' || p_search_term || '%'
    GROUP BY t.id, t.user_id  -- ADD user_id HERE TOO
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

-- Function to delete a tag
CREATE OR REPLACE FUNCTION delete_tag(
    p_tag_id UUID
) RETURNS TABLE (success BOOLEAN, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Check if tag exists and belongs to user
    IF NOT EXISTS (SELECT 1 FROM public.tags WHERE id = p_tag_id AND user_id = auth.uid()) THEN
        RETURN QUERY SELECT false, 'Tag not found or access denied';
        RETURN;
    END IF;

    -- Delete the tag (cascade will handle note_tags)
    DELETE FROM public.tags
    WHERE id = p_tag_id AND user_id = auth.uid();

    RETURN QUERY SELECT true, 'Tag deleted successfully';
EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 'Error deleting tag: ' || SQLERRM;
END;
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
GRANT EXECUTE ON FUNCTION delete_tag(UUID) TO authenticated;


-- More codes for tags
-- -- Function to get tags for a specific note
CREATE OR REPLACE FUNCTION get_note_tags(p_note_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    color TEXT,
    user_id UUID,  -- ADD THIS LINE
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) LANGUAGE sql SECURITY DEFINER AS $$
    SELECT
        t.id,
        t.name,
        t.color,
        t.user_id,  -- ADD THIS LINE
        t.created_at,
        t.updated_at
    FROM public.tags t
    JOIN public.note_tags nt ON t.id = nt.tag_id
    WHERE nt.note_id = p_note_id
    AND t.user_id = auth.uid()
    ORDER BY t.name;
$$;

-- RLS policies for note_tags junction table
CREATE POLICY "Users can view note_tags for their notes"
ON public.note_tags FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.id = note_tags.note_id
        AND n.user_id = auth.uid()
    )
);

CREATE POLICY "Users can create note_tags for their notes"
ON public.note_tags FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.id = note_tags.note_id
        AND n.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete note_tags for their notes"
ON public.note_tags FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.id = note_tags.note_id
        AND n.user_id = auth.uid()
    )
);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_note_tags(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION get_or_create_tag(
    p_name TEXT,
    p_user_id UUID
) RETURNS TABLE (
    id UUID,
    name TEXT,
    color TEXT,
    user_id UUID,  -- ADD THIS LINE
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tag_id UUID;
    v_tag_record RECORD;
BEGIN
    -- First try to get existing tag
    SELECT t.id INTO v_tag_id
    FROM public.tags t
    WHERE t.name = p_name
    AND t.user_id = p_user_id;

    -- If tag doesn't exist, create it
    IF v_tag_id IS NULL THEN
        INSERT INTO public.tags (user_id, name, color)
        VALUES (p_user_id, p_name, '#6B7280')
        RETURNING tags.id INTO v_tag_id;
    END IF;

    -- Return the tag record
    SELECT
        t.id,
        t.name,
        t.color,
        t.user_id,  -- ADD THIS LINE
        t.created_at,
        t.updated_at
    INTO v_tag_record
    FROM public.tags t
    WHERE t.id = v_tag_id;

    RETURN QUERY SELECT
        v_tag_record.id,
        v_tag_record.name,
        v_tag_record.color,
        v_tag_record.user_id,  -- ADD THIS LINE
        v_tag_record.created_at,
        v_tag_record.updated_at;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_tag(TEXT, UUID) TO authenticated;

-- Templates table with RLS
CREATE TABLE IF NOT EXISTS public.templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    content JSONB NOT NULL DEFAULT '{"root": {"children": []}}'::jsonb,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, name) DEFERRABLE
);

-- Enable RLS
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON public.templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_is_system ON public.templates(is_system);

-- RLS Policies
-- Users can view system templates and their own templates
CREATE POLICY "Users can view system templates and their own" 
ON public.templates FOR SELECT 
USING (is_system = true OR user_id = auth.uid());

-- Users can insert their own templates
CREATE POLICY "Users can insert their own templates"
ON public.templates FOR INSERT
WITH CHECK (user_id = auth.uid() AND is_system = false);

-- Users can update their own templates and system templates (but can't change is_system flag)
CREATE POLICY "Users can update their own templates"
ON public.templates FOR UPDATE
USING (user_id = auth.uid() OR is_system = true)
WITH CHECK (
    (user_id = auth.uid() AND is_system = false) OR
    (is_system = true AND user_id IS NULL)
);

-- Users can only delete their own non-system templates
CREATE POLICY "Users can delete their own templates"
ON public.templates FOR DELETE
USING (user_id = auth.uid() AND is_system = false);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_templates_updated_at
BEFORE UPDATE ON public.templates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to create a new template
CREATE OR REPLACE FUNCTION create_template(
    p_name TEXT,
    p_description TEXT DEFAULT NULL,
    p_content JSONB DEFAULT '{"root": {"children": []}}'::jsonb
) RETURNS UUID 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_template_id UUID;
BEGIN
    INSERT INTO public.templates (
        user_id,
        name,
        description,
        content
    ) VALUES (
        auth.uid(),
        p_name,
        p_description,
        p_content
    )
    RETURNING id INTO v_template_id;
    
    RETURN v_template_id;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error creating template: %', SQLERRM;
END;
$$;

-- Function to update a template
CREATE OR REPLACE FUNCTION update_template(
    p_template_id UUID,
    p_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_content JSONB DEFAULT NULL
) RETURNS BOOLEAN 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.templates
    SET 
        name = COALESCE(p_name, name),
        description = COALESCE(p_description, description),
        content = COALESCE(p_content, content)
    WHERE id = p_template_id
    AND (user_id = auth.uid() OR is_system = true);
    
    RETURN FOUND;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error updating template: %', SQLERRM;
END;
$$;

-- Function to delete a template (only user's own non-system templates)
CREATE OR REPLACE FUNCTION delete_template(p_template_id UUID)
RETURNS BOOLEAN 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    DELETE FROM public.templates
    WHERE id = p_template_id
    AND user_id = auth.uid()
    AND is_system = false;
    
    RETURN FOUND;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error deleting template: %', SQLERRM;
END;
$$;

-- Function to get all templates (user's templates + system templates)
CREATE OR REPLACE FUNCTION get_templates()
RETURNS TABLE (
    id UUID,
    user_id UUID,
    name TEXT,
    description TEXT,
    content JSONB,
    is_system BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE sql SECURITY DEFINER AS $$
    SELECT 
        id,
        user_id,
        name,
        description,
        content,
        is_system,
        created_at,
        updated_at
    FROM public.templates
    WHERE user_id = auth.uid() OR is_system = true
    ORDER BY is_system DESC, updated_at DESC;
$$;

-- Function to get a single template by ID
CREATE OR REPLACE FUNCTION get_template(p_template_id UUID)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    name TEXT,
    description TEXT,
    content JSONB,
    is_system BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE sql SECURITY DEFINER AS $$
    SELECT 
        id,
        user_id,
        name,
        description,
        content,
        is_system,
        created_at,
        updated_at
    FROM public.templates
    WHERE id = p_template_id
    AND (user_id = auth.uid() OR is_system = true);
$$;

-- Function to create system templates (for admin use only)
CREATE OR REPLACE FUNCTION create_system_template(
    p_name TEXT,
    p_description TEXT,
    p_content JSONB DEFAULT '{"root": {"children": []}}'::jsonb
) RETURNS UUID 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_template_id UUID;
BEGIN
    -- Only allow system templates to be created by superuser
    IF current_user != 'postgres' THEN
        RAISE EXCEPTION 'Only system administrators can create system templates';
    END IF;
    
    INSERT INTO public.templates (
        name,
        description,
        content,
        is_system
    ) VALUES (
        p_name,
        p_description,
        p_content,
        true
    )
    RETURNING id INTO v_template_id;
    
    RETURN v_template_id;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error creating system template: %', SQLERRM;
END;
$$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;
GRANT EXECUTE ON FUNCTION create_template(TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_template(UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_template(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_templates() TO authenticated;
GRANT EXECUTE ON FUNCTION get_template(UUID) TO authenticated;



SELECT create_system_template(
    'Market Research',
    'Template for comprehensive market analysis and research notes',
    $json${"root": {"children": [{"type": "heading", "level": 1, "children": [{"text": "Market Research"}]}, {"type": "paragraph", "children": [{"text": "Research Date: "}]}, {"type": "paragraph", "children": [{"text": "Market Focus: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Macro Environment Analysis"}]}, {"type": "paragraph", "children": [{"text": "GDP Growth: "}]}, {"type": "paragraph", "children": [{"text": "Inflation Rate: "}]}, {"type": "paragraph", "children": [{"text": "Interest Rates: "}]}, {"type": "paragraph", "children": [{"text": "Central Bank Policy: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Market Sentiment"}]}, {"type": "paragraph", "children": [{"text": "VIX Level: "}]}, {"type": "paragraph", "children": [{"text": "Put/Call Ratio: "}]}, {"type": "paragraph", "children": [{"text": "Institutional Flow: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Sector Analysis"}]}, {"type": "table", "children": [{"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": "Sector"}]}, {"type": "table-cell", "children": [{"text": "Performance"}]}, {"type": "table-cell", "children": [{"text": "Outlook"}]}]}, {"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}]}, {"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}]}]}, {"type": "heading", "level": 2, "children": [{"text": "Technical Analysis"}]}, {"type": "paragraph", "children": [{"text": "S&P 500 Levels - Support: ___ | Resistance: ___"}]}, {"type": "paragraph", "children": [{"text": "Market Breadth: "}]}, {"type": "paragraph", "children": [{"text": "Key Patterns: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Trading Implications"}]}, {"type": "bulleted-list", "children": [{"type": "list-item", "children": [{"text": "High Probability Setups: "}]}, {"type": "list-item", "children": [{"text": "Setups to Avoid: "}]}, {"type": "list-item", "children": [{"text": "Risk Level: "}]}, {"type": "list-item", "children": [{"text": "Position Sizing: "}]}]}]}}$json$
);

SELECT create_system_template(
    'Trade Exit Review',
    'Template for analyzing completed trades and lessons learned',
    $json${"root": {"children": [{"type": "heading", "level": 1, "children": [{"text": "Trade Exit Review"}]}, {"type": "paragraph", "children": [{"text": "Symbol: "}]}, {"type": "paragraph", "children": [{"text": "Exit Date: "}]}, {"type": "paragraph", "children": [{"text": "Exit Time: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Trade Results"}]}, {"type": "table", "children": [{"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": "Exit Price"}]}, {"type": "table-cell", "children": [{"text": "P&L ($)"}]}, {"type": "table-cell", "children": [{"text": "P&L (%)"}]}, {"type": "table-cell", "children": [{"text": "R Multiple"}]}]}, {"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}]}]}, {"type": "paragraph", "children": [{"text": "Reason for Exit: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Trade Analysis"}]}, {"type": "paragraph", "children": [{"text": "What went right: "}]}, {"type": "paragraph", "children": [{"text": "What went wrong: "}]}, {"type": "paragraph", "children": [{"text": "Execution quality (1-10): "}]}, {"type": "heading", "level": 2, "children": [{"text": "Lessons Learned"}]}, {"type": "bulleted-list", "children": [{"type": "list-item", "children": [{"text": "Key insight: "}]}, {"type": "list-item", "children": [{"text": "Rule to follow: "}]}, {"type": "list-item", "children": [{"text": "Mistake to avoid: "}]}]}, {"type": "heading", "level": 2, "children": [{"text": "Emotional Review"}]}, {"type": "paragraph", "children": [{"text": "Emotions during trade: "}]}, {"type": "paragraph", "children": [{"text": "Stress level (1-10): "}]}, {"type": "paragraph", "children": [{"text": "Decision quality: "}]}]}}$json$
);

SELECT create_system_template(
    'Weekly Performance Review',
    'Template for weekly trading performance analysis and planning',
    $json${"root": {"children": [{"type": "heading", "level": 1, "children": [{"text": "Weekly Performance Review"}]}, {"type": "paragraph", "children": [{"text": "Week of: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Performance Summary"}]}, {"type": "table", "children": [{"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": "Total Trades"}]}, {"type": "table-cell", "children": [{"text": "Winners"}]}, {"type": "table-cell", "children": [{"text": "Losers"}]}, {"type": "table-cell", "children": [{"text": "Win Rate"}]}]}, {"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}]}]}, {"type": "paragraph", "children": [{"text": "Weekly P&L: $"}]}, {"type": "paragraph", "children": [{"text": "Best Trade: "}]}, {"type": "paragraph", "children": [{"text": "Worst Trade: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Strategy Performance"}]}, {"type": "bulleted-list", "children": [{"type": "list-item", "children": [{"text": "Most successful setup: "}]}, {"type": "list-item", "children": [{"text": "Least successful setup: "}]}, {"type": "list-item", "children": [{"text": "Market conditions: "}]}]}, {"type": "heading", "level": 2, "children": [{"text": "Rule Adherence"}]}, {"type": "paragraph", "children": [{"text": "Risk management score (1-10): "}]}, {"type": "paragraph", "children": [{"text": "Discipline score (1-10): "}]}, {"type": "paragraph", "children": [{"text": "Major violations: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Goals for Next Week"}]}, {"type": "numbered-list", "children": [{"type": "list-item", "children": [{"text": ""}]}, {"type": "list-item", "children": [{"text": ""}]}, {"type": "list-item", "children": [{"text": ""}]}]}, {"type": "heading", "level": 2, "children": [{"text": "Watchlist"}]}, {"type": "bulleted-list", "children": [{"type": "list-item", "children": [{"text": ""}]}, {"type": "list-item", "children": [{"text": ""}]}, {"type": "list-item", "children": [{"text": ""}]}]}]}}$json$
);

SELECT create_system_template(
    'Earnings Event Analysis',
    'Template for tracking earnings plays and event-driven trades',
    $json${"root": {"children": [{"type": "heading", "level": 1, "children": [{"text": "Earnings Event Analysis"}]}, {"type": "paragraph", "children": [{"text": "Company: "}]}, {"type": "paragraph", "children": [{"text": "Earnings Date: "}]}, {"type": "paragraph", "children": [{"text": "Quarter: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Pre-Earnings Setup"}]}, {"type": "table", "children": [{"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": "Consensus EPS"}]}, {"type": "table-cell", "children": [{"text": "Revenue Est."}]}, {"type": "table-cell", "children": [{"text": "Expected Move"}]}, {"type": "table-cell", "children": [{"text": "IV Rank"}]}]}, {"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}]}]}, {"type": "heading", "level": 2, "children": [{"text": "Trade Strategy"}]}, {"type": "paragraph", "children": [{"text": "Strategy Type: "}]}, {"type": "paragraph", "children": [{"text": "Entry Price: "}]}, {"type": "paragraph", "children": [{"text": "Position Size: "}]}, {"type": "paragraph", "children": [{"text": "Risk Amount: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Key Levels"}]}, {"type": "bulleted-list", "children": [{"type": "list-item", "children": [{"text": "Support: "}]}, {"type": "list-item", "children": [{"text": "Resistance: "}]}, {"type": "list-item", "children": [{"text": "Breakout level: "}]}, {"type": "list-item", "children": [{"text": "Breakdown level: "}]}]}, {"type": "heading", "level": 2, "children": [{"text": "Results"}]}, {"type": "paragraph", "children": [{"text": "Actual EPS: "}]}, {"type": "paragraph", "children": [{"text": "Actual Revenue: "}]}, {"type": "paragraph", "children": [{"text": "Initial Reaction: "}]}, {"type": "paragraph", "children": [{"text": "Final P&L: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Post-Analysis"}]}, {"type": "paragraph", "children": [{"text": "What drove the move: "}]}, {"type": "paragraph", "children": [{"text": "Lessons learned: "}]}, {"type": "paragraph", "children": [{"text": "Future improvements: "}]}]}}$json$
);

SELECT create_system_template(
    'Psychology Check-in',
    'Template for monitoring trading psychology and emotional state',
    $json${"root": {"children": [{"type": "heading", "level": 1, "children": [{"text": "Psychology Check-in"}]}, {"type": "paragraph", "children": [{"text": "Date: "}]}, {"type": "paragraph", "children": [{"text": "Time: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Mental State Assessment"}]}, {"type": "table", "children": [{"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": "Confidence"}]}, {"type": "table-cell", "children": [{"text": "Stress Level"}]}, {"type": "table-cell", "children": [{"text": "Focus"}]}, {"type": "table-cell", "children": [{"text": "Energy"}]}]}, {"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": "(1-10)"}]}, {"type": "table-cell", "children": [{"text": "(1-10)"}]}, {"type": "table-cell", "children": [{"text": "(1-10)"}]}, {"type": "table-cell", "children": [{"text": "(1-10)"}]}]}, {"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}]}]}, {"type": "heading", "level": 2, "children": [{"text": "Recent Performance Impact"}]}, {"type": "paragraph", "children": [{"text": "Recent wins affecting mindset: "}]}, {"type": "paragraph", "children": [{"text": "Recent losses affecting mindset: "}]}, {"type": "paragraph", "children": [{"text": "Account drawdown concerns: "}]}, {"type": "heading", "level": 2, "children": [{"text": "External Factors"}]}, {"type": "bulleted-list", "children": [{"type": "list-item", "children": [{"text": "Life stress level: "}]}, {"type": "list-item", "children": [{"text": "Sleep quality: "}]}, {"type": "list-item", "children": [{"text": "Financial pressure: "}]}, {"type": "list-item", "children": [{"text": "Health status: "}]}]}, {"type": "heading", "level": 2, "children": [{"text": "Trading Rule Adherence"}]}, {"type": "paragraph", "children": [{"text": "Temptation to break rules (1-10): "}]}, {"type": "paragraph", "children": [{"text": "Most challenging rule: "}]}, {"type": "paragraph", "children": [{"text": "Emotional triggers today: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Action Plan"}]}, {"type": "paragraph", "children": [{"text": "Position sizing adjustment needed: "}]}, {"type": "paragraph", "children": [{"text": "Mental exercises to do: "}]}, {"type": "paragraph", "children": [{"text": "Should I trade today? Why: "}]}]}}$json$
);

-- Images table for storing image metadata and references to Supabase Storage
CREATE TABLE IF NOT EXISTS images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_path TEXT NOT NULL, -- Path in Supabase Storage (notebook bucket)
    file_size BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    alt_text TEXT,
    caption TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_images_user_id ON images(user_id);
CREATE INDEX IF NOT EXISTS idx_images_note_id ON images(note_id);
CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at);

-- Enable RLS on the images table
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own images
CREATE POLICY "Users can view their own images" ON images
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own images" ON images
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own images" ON images
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own images" ON images
    FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket policy for 'notebook' bucket
-- Note: These policies should be applied in Supabase Dashboard or via SQL in the Storage section

-- Policy 1: Allow authenticated users to upload images to their own folder
-- Bucket: notebook
-- Policy Name: "Users can upload images to their own folder"
-- Operation: INSERT
-- Target roles: authenticated
-- Policy definition:
-- bucket_id = 'notebook' AND (storage.foldername(name))[1] = auth.uid()::text

-- Policy 2: Allow users to view their own images
-- Bucket: notebook  
-- Policy Name: "Users can view their own images"
-- Operation: SELECT
-- Target roles: authenticated
-- Policy definition:
-- bucket_id = 'notebook' AND (storage.foldername(name))[1] = auth.uid()::text

-- Policy 3: Allow users to update their own images
-- Bucket: notebook
-- Policy Name: "Users can update their own images" 
-- Operation: UPDATE
-- Target roles: authenticated
-- Policy definition:
-- bucket_id = 'notebook' AND (storage.foldername(name))[1] = auth.uid()::text

-- Policy 4: Allow users to delete their own images
-- Bucket: notebook
-- Policy Name: "Users can delete their own images"
-- Operation: DELETE  
-- Target roles: authenticated
-- Policy definition:
-- bucket_id = 'notebook' AND (storage.foldername(name))[1] = auth.uid()::text

-- SQL commands to create storage policies (run these in Supabase SQL editor):

-- Create storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('notebook', 'notebook', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the notebook bucket
CREATE POLICY "Users can upload images to their own folder" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'notebook' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view their own images" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'notebook' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own images" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'notebook' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own images" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'notebook' AND (storage.foldername(name))[1] = auth.uid()::text);


-- Trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_images_updated_at
    BEFORE UPDATE ON images
    FOR EACH ROW
    EXECUTE FUNCTION update_images_updated_at();


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

