-- Supabase Storage setup for Trade Notes images
-- Run this in the Supabase SQL editor

-- PREREQUISITE: Bucket 'trade-notes' already created via Dashboard ✓

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can insert their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own images" ON storage.objects;

-- RLS Policy: Users can only access their own images in the profile-pictures bucket
CREATE POLICY "Users can view their own profile picture" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'profile-pictures' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can insert their own profile picture" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'profile-pictures' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can update their own profile picture" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'profile-pictures' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can delete their own profile picture" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'profile-pictures' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Notes:
-- - RLS is already enabled on storage.objects by default in Supabase
-- - These policies enforce per-user folder isolation: each user can only access files in {their_user_id}/
-- - Uses storage.foldername() helper function to extract the user folder from the path
-- - When uploading, your backend should use paths like: {user_id}/image-name.jpg