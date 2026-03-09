# Proposal: Fix Spell Notes Persistence

## Why
Fix a defect where spell notes were not being saved correctly or distinctively for spells that appeared in both "Known" and "Prepared" lists. This change ensures that each list entry maintains its own independent notes.

## Problem Statement
The application allows characters to have spells in both "Known" and "Prepared" lists. However, the system failed to distinguish notes between these two contexts for the same spell.
1.  The UI failed to pass the list context when saving notes.
2.  The backend query grouped results by spell ID, returning arbitrary note data when a spell existed in multiple lists.

## What Changes
1.  **Backend:** Remove the `GROUP BY` clause in `get_character_class_spells` to return all relevant rows from `character_class_spell`.
2.  **Frontend:** Update `update_character_spell_notes` invocation to include the `listType` (KNOWN/PREPARED).
3.  **Verification:** Add an E2E test to enforce the separation of notes.

## Impact
- **Users**: Will be able to keep separate notes for a spell they know vs. a spell they have prepared.
- **Data**: No schema changes, but existing notes may have been ambiguous. This fix strictly enforces the distinction going forward.
- **Performance**: Negligible impact.
