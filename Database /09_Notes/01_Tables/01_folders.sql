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