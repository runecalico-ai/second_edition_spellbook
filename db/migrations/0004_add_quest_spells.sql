-- Add is_quest_spell column to the spell table
ALTER TABLE spell ADD COLUMN is_quest_spell INTEGER DEFAULT 0;
