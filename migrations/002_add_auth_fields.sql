-- Add authentication fields to profiles table
-- Run this in Supabase SQL Editor

-- Add email and password_hash columns if they don't exist
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles(email);

-- Update existing demo profile with email
UPDATE profiles 
SET email = 'demo@awfar-crm.com'
WHERE id = '00000000-0000-0000-0000-000000000000';
