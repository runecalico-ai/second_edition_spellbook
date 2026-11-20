## ADDED Requirements

### Requirement: Distributable Application Layout

The application SHALL ship as self-contained installable packages on Windows and Linux that include runtime components required for core functionality (UI, database, keyword search, LLM/embedding inference, vector search extension, and document import/export via bundled sidecar), except for user-provisioned model files and user data in `SpellbookVault`.

#### Scenario: Installed app has no repo checkout dependency

- **WHEN** a user installs the application from a release artifact on a clean machine
- **THEN** the application SHALL start without requiring the source repository, a local Node.js installation, or a system Python installation

#### Scenario: sqlite-vec bundled

- **WHEN** the application is installed from a release artifact
- **THEN** the sqlite-vec extension files required for vector search SHALL be present in the application bundle resources
- **AND** SHALL be copied into `SpellbookVault` on first launch if not already present

#### Scenario: Sidecar bundled for import/export

- **WHEN** the application is installed from a release artifact
- **THEN** the Python sidecar executable required for document import and export SHALL be included in the installation
- **AND** SHALL be invocable by the Tauri backend without network access

#### Scenario: PDF import and export without external tools

- **WHEN** the application is installed from a release artifact
- **THEN** PDF import SHALL use `pdfminer.six` bundled in the sidecar
- **AND** PDF export SHALL produce print-optimized HTML for browser print-to-PDF
