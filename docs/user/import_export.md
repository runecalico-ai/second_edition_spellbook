# Importing and Exporting

The Spellbook application allows you to freely share characters and spell libraries using standard JSON bundles or `.zip` archives. When importing spells from external sources, the system employs a robust identification and conflict resolution system.

For technical details on bundle formats and deduplication logic, see [Character Bundle Formats](../bundle_format.md).

## Spell Versioning with Hashes
To guarantee consistency across different users, every spell generates a **content hash**—a unique digital fingerprint based purely on the spell's core mechanics (its level, casting time, distance, text, etc.).
- Two spells with the exact same rules will produce the exact same ID (hash).
- Metadata such as source references (book/page citations) do not alter the hash.

## Hash-Based Deduplication
Because of hash tracking, you will never accidentally create duplicate spells when importing identical content:
- **Duplicates Skipped Automatically**: If you import a spell that perfectly matches the hash of a spell already in your library computationally, the system skips it completely.
- **Metadata Merging**: If the skipped incoming spell contains tags or source references you don't possess locally, those are thoughtfully merged onto your local spell automatically.

## Conflict Resolution
If you import a spell that shares a **name** with a spell in your database, but the **content hashes differ**, the system recognizes a version conflict. It halts the import for that spell to let you choose how to proceed:

- **Keep Existing**: The import is skipped, and your current version of the spell remains unchanged.
- **Replace with New**: Your local version of the spell is completely overwritten by the imported version. Characters that memorized the old version will seamlessly use the new one.
- **Keep Both**: The imported version is added as a completely separate spell in your library. To tell them apart, it receives a numeric suffix (e.g., `Fireball (1)`).
- **Apply to All**: Clicking this box applies your chosen action to any other conflicting spells found in your current import batch (for this current session only).

**Large imports:** When 10 or more conflicts are detected, a summary dialog appears first with options: **Skip All**, **Replace All**, **Keep All**, or **Review Each**. Choosing **Review Each** shows the per-spell conflict dialog for each one.

## Examples of Import Scenarios

**Scenario A: Re-importing a Community Bundle**
You download an updated "Vanilla 2e Spells" bundle. Because 98% of the spells are identical to the ones you already have (duplicates), the app rapidly skips all 98%. Only the 2% that were actually altered (updated versions) or brand new (new spells) trigger any action or conflict resolution, making large imports lightning-fast and harmless.

**Scenario B: Receiving a Friend's Homebrew Variation**
Your friend gives you their character holding a modified version of *Magic Missile* (dealing slightly more damage). Your app spots that the name matches but the rules (hash) differ, triggering the conflict dialog. You click **Keep Both**, storing it as *Magic Missile (1)* alongside your official copy.
