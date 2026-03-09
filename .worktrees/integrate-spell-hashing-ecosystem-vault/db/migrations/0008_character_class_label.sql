-- Migration: Add class_label to character_class
-- Part of remediation for Character Profiles Foundation

-- 1. Add class_label column
ALTER TABLE character_class ADD COLUMN class_label TEXT;

-- 2. Update existing data: if it was "Other", the current class_name holds the custom label.
-- We want class_name to be "Other" and class_label to hold the specific user-provided name.
-- However, for simple core classes, class_label will be NULL.

-- Note: We don't have an easy way to perfectly distinguish if a value was originally "Other"
-- since we were saving everything into class_name. We'll default to class_name as is,
-- and future "Other" adds will use the label properly.

-- 3. Add index for unique constraint check (character_id, class_name, class_label)
-- Note: SQLite allows multiple NULLs in unique indexes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_char_class_unique ON character_class(character_id, class_name, IFNULL(class_label, ''));
