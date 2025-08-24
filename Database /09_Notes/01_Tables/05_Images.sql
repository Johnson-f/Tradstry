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