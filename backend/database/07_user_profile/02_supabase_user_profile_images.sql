-- Supabase Migration: Create user_profile_images table
-- This table is stored in Supabase (not in user's Turso database) to enable RLS policies
-- Run this migration in Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create user_profile_images table
CREATE TABLE IF NOT EXISTS public.user_profile_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    image_uuid TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    original_filename TEXT,
    bucket_name TEXT NOT NULL DEFAULT 'profile-pictures',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_profile_images_user_id ON public.user_profile_images(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profile_images_uuid ON public.user_profile_images(image_uuid);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_user_profile_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profile_images_timestamp
    BEFORE UPDATE ON public.user_profile_images
    FOR EACH ROW
    EXECUTE FUNCTION update_user_profile_images_updated_at();

-- Enable Row Level Security
ALTER TABLE public.user_profile_images ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own profile images
CREATE POLICY "Users can insert own profile images"
    ON public.user_profile_images
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can view their own profile images
CREATE POLICY "Users can view own profile images"
    ON public.user_profile_images
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Policy: Users can update their own profile images
CREATE POLICY "Users can update own profile images"
    ON public.user_profile_images
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own profile images
CREATE POLICY "Users can delete own profile images"
    ON public.user_profile_images
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Optional: Policy to allow public read access to profile pictures (uncomment if needed)
-- CREATE POLICY "Public can view profile images"
--     ON public.user_profile_images
--     FOR SELECT
--     TO public
--     USING (true);

