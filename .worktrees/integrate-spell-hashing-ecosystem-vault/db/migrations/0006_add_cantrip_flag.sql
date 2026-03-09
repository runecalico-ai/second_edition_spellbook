-- Migration: Add is_cantrip flag
ALTER TABLE spell ADD COLUMN is_cantrip INTEGER NOT NULL DEFAULT 0;
