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



SELECT * FROM upsert_note(
    p_folder_id := '33951791-4677-427e-854d-8f3c6b92b729',
    p_title := 'Test Note',
    p_content := '{"root":{"children":[]}}'::jsonb
);
