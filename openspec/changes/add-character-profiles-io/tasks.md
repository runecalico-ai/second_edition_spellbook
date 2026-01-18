## C3 – Import/Export
- [ ] C3.1 Define character bundle schemas
  - [ ] C3.1.1 Create JSON schema for character bundles (format_version 1.0.0)
  - [ ] C3.1.2 Create Markdown bundle structure (character.yml + spells/*.md)
  - [ ] C3.1.3 Document dedupe rules (canonical spell keys, class matching)
- [ ] C3.2 Implement JSON import/export
  - [ ] C3.2.1 Add `export_character_bundle` command (JSON format)
  - [ ] C3.2.2 Add `import_character_bundle` command (JSON format)
  - [ ] C3.2.3 Implement spell dedupe logic (match by canonical key)
  - [ ] C3.2.4 Handle collision/merge scenarios (update vs create)
- [ ] C3.3 Implement Markdown import/export
  - [ ] C3.3.1 Add Markdown bundle export
  - [ ] C3.3.2 Add Markdown bundle import
  - [ ] C3.3.3 Parse character.yml and spell references
- [ ] C3.4 Build Import/Export UI
  - [ ] C3.4.1 Add "Export Character" button with format selection
  - [ ] C3.4.2 Add "Import Character" dialog with file picker
  - [ ] C3.4.3 Add collision/merge UI (update existing vs create new)
  - [ ] C3.4.4 Show import preview and validation errors
- [ ] C3.5 Implement artifact recording
  - [ ] C3.5.1 Record imported character bundles in artifact table (or new table)
  - [ ] C3.5.2 Track bundle hash and import timestamp
- [ ] C3.6 Write E2E tests for import/export
  - [ ] C3.6.1 Test JSON export and re-import (round-trip)
  - [ ] C3.6.2 Test Markdown export and re-import
  - [ ] C3.6.3 Test character with 2 classes and 100+ spells
  - [ ] C3.6.4 Test collision handling (update existing character)
  - [ ] C3.6.5 Verify no data loss on round-trip

## Documentation
- [ ] D1 Update developer documentation
  - [ ] D1.1 Document JSON bundle format
  - [ ] D1.2 Document Markdown bundle format
  - [ ] D1.3 Document spell dedupe algorithm
- [ ] D2 Update user documentation
  - [ ] D2.1 Document export workflow
  - [ ] D2.2 Document import workflow
  - [ ] D2.3 Document collision resolution

## Notes
- **Total tasks**: ~20
- **Estimated effort**: 1 week
- **Dependencies**: Part 1 (Foundation) must be completed
- **Enables**: Part 3 (Printing/Search)
