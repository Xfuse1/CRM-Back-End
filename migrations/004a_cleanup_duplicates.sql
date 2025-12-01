-- Migration 004a: Clean Duplicates BEFORE Adding Constraints
-- Run this BEFORE 004_prevent_duplicates.sql

-- ============================================
-- 1. Find and Remove Duplicate Messages (Keep Oldest)
-- ============================================

-- Delete duplicate messages, keeping only the oldest one per wa_message_id
DELETE FROM messages
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY wa_message_id 
             ORDER BY created_at ASC, id ASC
           ) as row_num
    FROM messages
    WHERE wa_message_id IS NOT NULL
  ) t
  WHERE t.row_num > 1
);

-- ============================================
-- 2. Find and Remove Duplicate Chats (Keep Oldest)
-- ============================================

-- First, we need to add wa_chat_id if it doesn't exist
ALTER TABLE chats 
ADD COLUMN IF NOT EXISTS wa_chat_id VARCHAR(255);

-- Update wa_chat_id for existing chats (combine owner_id + contact_id as unique identifier)
UPDATE chats
SET wa_chat_id = owner_id || '_' || contact_id
WHERE wa_chat_id IS NULL;

-- Delete duplicate chats, keeping only the oldest one
DELETE FROM chats
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY owner_id, wa_chat_id 
             ORDER BY created_at ASC, id ASC
           ) as row_num
    FROM chats
    WHERE wa_chat_id IS NOT NULL
  ) t
  WHERE t.row_num > 1
);

-- ============================================
-- 3. Find and Remove Duplicate Contacts (Keep Oldest)
-- ============================================

-- Delete duplicate contacts, keeping only the oldest one per owner_id + wa_id
DELETE FROM contacts
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY owner_id, wa_id 
             ORDER BY created_at ASC, id ASC
           ) as row_num
    FROM contacts
    WHERE wa_id IS NOT NULL
  ) t
  WHERE t.row_num > 1
);

-- ============================================
-- 4. Report Results
-- ============================================

DO $$
DECLARE
  msg_count INTEGER;
  chat_count INTEGER;
  contact_count INTEGER;
BEGIN
  -- Count remaining messages
  SELECT COUNT(*) INTO msg_count FROM messages;
  
  -- Count remaining chats
  SELECT COUNT(*) INTO chat_count FROM chats;
  
  -- Count remaining contacts
  SELECT COUNT(*) INTO contact_count FROM contacts;
  
  RAISE NOTICE 'Cleanup complete:';
  RAISE NOTICE '  Messages: % rows remaining', msg_count;
  RAISE NOTICE '  Chats: % rows remaining', chat_count;
  RAISE NOTICE '  Contacts: % rows remaining', contact_count;
END $$;

-- ============================================
-- 5. Verify No More Duplicates
-- ============================================

-- Check for remaining duplicate messages
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT wa_message_id, COUNT(*) as cnt
    FROM messages
    WHERE wa_message_id IS NOT NULL
    GROUP BY wa_message_id
    HAVING COUNT(*) > 1
  ) t;
  
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Still have % duplicate messages!', dup_count;
  ELSE
    RAISE NOTICE '✓ No duplicate messages found';
  END IF;
END $$;

-- Check for remaining duplicate chats
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT owner_id, wa_chat_id, COUNT(*) as cnt
    FROM chats
    WHERE wa_chat_id IS NOT NULL
    GROUP BY owner_id, wa_chat_id
    HAVING COUNT(*) > 1
  ) t;
  
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Still have % duplicate chats!', dup_count;
  ELSE
    RAISE NOTICE '✓ No duplicate chats found';
  END IF;
END $$;

-- Check for remaining duplicate contacts
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT owner_id, wa_id, COUNT(*) as cnt
    FROM contacts
    WHERE wa_id IS NOT NULL
    GROUP BY owner_id, wa_id
    HAVING COUNT(*) > 1
  ) t;
  
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Still have % duplicate contacts!', dup_count;
  ELSE
    RAISE NOTICE '✓ No duplicate contacts found';
  END IF;
END $$;

RAISE NOTICE '✅ Cleanup successful! Now run migration 004_prevent_duplicates.sql';
