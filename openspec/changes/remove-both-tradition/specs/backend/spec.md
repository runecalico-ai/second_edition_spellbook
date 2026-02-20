## MODIFIED Requirements

### Requirement: Tradition-Specific Integrity
The backend MUST enforce strict logical dependencies between traditions and metadata fields.

#### Scenario: School and Sphere Co-presence Rejection
- GIVEN a spell record with both `school` and `sphere` set (co-present)
- WHEN the backend attempts to infer tradition and construct a `CanonicalSpell`
- THEN the backend MUST return an error
- AND the error message MUST identify the spell name and state that school and sphere are mutually exclusive.

#### Scenario: Prohibited Field Omission for Canonical Output
- GIVEN an Arcane spell (with or without `sphere` set in source data)
- WHEN canonicalized for hashing
- THEN the canonical output MUST omit the `sphere` key
- AND the hash MUST be identical to the same spell where `sphere` was never present.
- GIVEN a Divine spell (with or without `school` set in source data)
- WHEN canonicalized for hashing
- THEN the canonical output MUST omit the `school` key
- AND the hash MUST be stable regardless of source data for the other tradition's field.

## REMOVED Requirements

### Requirement: BOTH Tradition Validation Scenario
**Reason**: The `BOTH` tradition value is removed. School and sphere are mutually exclusive; a spell with both fields set is now invalid data and rejected at ingest rather than accepted as a third tradition.
**Migration**: Split any spell that currently has both `school` and `sphere` into two separate records — one Arcane record (school only) and one Divine record (sphere only). Each receives its own content-addressed hash.
