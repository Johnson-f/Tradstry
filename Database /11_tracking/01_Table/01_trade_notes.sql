-- Create trade_note_type enum to distinguish between stock and option trades
CREATE TYPE trade_note_type AS ENUM ('stock', 'option');

-- trade_notes table for storing trade-related notes
CREATE TABLE public.trade_notes (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Polymorphic association fields
  trade_id INTEGER NOT NULL,
  trade_type trade_note_type NOT NULL,

  -- Note content
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Foreign key constraint for user
  CONSTRAINT fk_user
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
);

-- Create index for faster lookups
CREATE INDEX idx_trade_notes_user ON public.trade_notes(user_id);
CREATE INDEX idx_trade_notes_trade ON public.trade_notes(trade_type, trade_id);

-- Enable Row Level Security
ALTER TABLE public.trade_notes ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to view only their own notes
CREATE POLICY "Users can view own trade notes"
  ON public.trade_notes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy for authenticated users to insert their own notes
CREATE POLICY "Users can insert own trade notes"
  ON public.trade_notes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy for authenticated users to update only their own notes
CREATE POLICY "Users can update own trade notes"
  ON public.trade_notes
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy for authenticated users to delete only their own notes
CREATE POLICY "Users can delete own trade notes"
  ON public.trade_notes
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_trade_note_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_trade_notes_updated_at
BEFORE UPDATE ON public.trade_notes
FOR EACH ROW
EXECUTE FUNCTION update_trade_note_updated_at();

-- Function to validate trade ownership when inserting/updating
CREATE OR REPLACE FUNCTION validate_trade_ownership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.trade_type = 'stock' AND NOT EXISTS (
    SELECT 1 FROM public.stocks
    WHERE id = NEW.trade_id AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Stock trade not found or access denied';
  ELSIF NEW.trade_type = 'option' AND NOT EXISTS (
    SELECT 1 FROM public.options
    WHERE id = NEW.trade_id AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Option trade not found or access denied';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate trade ownership
CREATE TRIGGER validate_trade_ownership_trigger
BEFORE INSERT OR UPDATE ON public.trade_notes
FOR EACH ROW
EXECUTE FUNCTION validate_trade_ownership();


--
-- Enhancements added based on user request
--

-- Add a 'tags' column to store a list of tags
ALTER TABLE public.trade_notes
ADD COLUMN tags TEXT[];

-- Add an index for the new tags column for faster searching
CREATE INDEX idx_trade_notes_tags ON public.trade_notes USING GIN(tags);

-- Add a 'rating' column for self-assessment (e.g., 1-5)
ALTER TABLE public.trade_notes
ADD COLUMN rating INTEGER;

-- Add a check constraint to ensure the rating is within a valid range
ALTER TABLE public.trade_notes
ADD CONSTRAINT rating_range CHECK (rating >= 1 AND rating <= 5);

-- Create a new ENUM type for the trade phase
CREATE TYPE trade_phase AS ENUM ('planning', 'execution', 'reflection');

-- Add a 'phase' column to the table
ALTER TABLE public.trade_notes
ADD COLUMN phase trade_phase;

-- Add a column to link to an image (e.g., a chart screenshot)
ALTER TABLE public.trade_notes
ADD COLUMN image_id UUID;

-- Add a foreign key constraint to the images table
-- This assumes you have a 'public.images' table with an 'id' primary key
ALTER TABLE public.trade_notes
ADD CONSTRAINT fk_image
  FOREIGN KEY (image_id)
  REFERENCES public.images(id)
  ON DELETE SET NULL;
