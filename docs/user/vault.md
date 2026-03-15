# The Spell Vault

Underneath the hood, the Spellbook application physically stores your spells as `.json` files in your app data directory (e.g. `SpellbookVault` under your system's application data folder; see [TROUBLESHOOTING](../TROUBLESHOOTING.md#migration-log-location) for platform-specific paths).

## Hash-Based File Naming
To prevent accidental overwrites and make manual backup painless, the application uses **Hash-Based File Naming**. Every file is stored under `spells/{content_hash}.json` (e.g., `spells/a1b2c3d4...json`). The content hash is the same fingerprint used for [import deduplication](import_export.md#hash-based-deduplication).

Because the filename itself relies on the mathematical breakdown of the file's payload:
- It's impossible for a new spell version to accidentally overwrite another.
- Identical spells automatically reuse the same file securely.

## Vault Integrity Checks
Because the vault is heavily tied to file fingerprints, the application guarantees you never load corrupted or secretly-tampered data:
1. **Background Checks**: Before performing cleanup, the app always comprehensively verifies your files haven't drifted.
2. **Auto-Recovery**: If you accidentally delete a vault file off your hard drive, the database will silently regenerate it when the integrity check runs.
3. **Startup Validation**: You can configure the system to run a hard integrity check dynamically on startup via the `vault.integrityCheckOnOpen` setting toggle in the Vault Maintenance dialog.

## Garbage Collection
If you're often overwriting or deleting spell lists, you might eventually stack up old file revisions in the raw `spells/` folder. **Garbage Collection** (Vault Housekeeping) runs automatically after each successful import and when you use **Optimize Vault** in the Vault Maintenance dialog. It identifies spell files in the folder that are no longer referenced by any database entries and safely purges them to keep your storage tidy. For more details, see [Vault Maintenance and Integrity](../TROUBLESHOOTING.md#vault-maintenance-and-integrity).
