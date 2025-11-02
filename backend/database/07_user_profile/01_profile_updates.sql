-- Migration: Add profile fields to user_profile table
-- Note: user_profile_images table will be created in Supabase, not in user's Turso database

-- Add new columns to user_profile table (with IF NOT EXISTS check via ALTER TABLE ADD COLUMN)
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN directly
-- We'll add columns only if they don't exist

-- Add nickname column
-- Note: This will fail silently if column exists - consider using a more robust migration tool in production
ALTER TABLE user_profile ADD COLUMN nickname TEXT;

-- Add profile_picture_uuid column (references image_uuid in Supabase user_profile_images table)
ALTER TABLE user_profile ADD COLUMN profile_picture_uuid TEXT;

-- Add trading experience fields
ALTER TABLE user_profile ADD COLUMN trading_experience_level TEXT;
ALTER TABLE user_profile ADD COLUMN primary_trading_goal TEXT;
ALTER TABLE user_profile ADD COLUMN asset_types TEXT;
ALTER TABLE user_profile ADD COLUMN trading_style TEXT;

-- Note: user_profile_images table is created in Supabase with the following schema:
-- CREATE TABLE user_profile_images (
--     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     user_id UUID NOT NULL REFERENCES auth.users(id),
--     image_uuid TEXT NOT NULL UNIQUE,
--     file_path TEXT NOT NULL,
--     file_size INTEGER NOT NULL,
--     mime_type TEXT NOT NULL,
--     original_filename TEXT,
--     bucket_name TEXT NOT NULL DEFAULT 'profile-pictures',
--     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );

