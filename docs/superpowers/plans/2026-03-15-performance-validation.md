# Performance Validation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement benchmarking tests for vault GC and FTS rebuild (Migration 0014) to verify performance limits on 10,000 spells.

**Architecture:** Add two ignored cargo tests (`#[test] #[ignore]`) that synthesize large datasets and measure timings. One in `src/commands/vault.rs` to measure `run_vault_gc_with_root` performance. One in `src/db/migrations.rs` to measure `PRAGMA user_version = 13` -> `14` update.

**Tech Stack:** Rust `std::time::Instant`, `tempfile::TempDir`, `rusqlite` for DB setup.

---

## Chunk 1: Vault GC Benchmark

### Task 1: Vault GC Benchmark Test

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/vault.rs:1880-1894`

- [ ] **Step 1: Write the vault GC benchmark test structure**

Add the following benchmark test to the `mod tests` block at the end of `apps/desktop/src-tauri/src/commands/vault.rs`:

```rust
    #[test]
    #[ignore]
    fn test_bench_vault_gc_10000() {
        use crate::models::canonical_spell::CanonicalSpell;
        use std::time::Instant;

        let env = VaultTestEnvGuard::new_temp().expect("temp env");
        let conn = rusqlite::Connection::open_in_memory().expect("open db");
        
        // Minimal schema for vault logic compatibility
        conn.execute("CREATE TABLE spell (id INTEGER PRIMARY KEY, content_hash TEXT, canonical_data TEXT)", []).unwrap();
        conn.execute("CREATE TABLE character_class_spell (id INTEGER PRIMARY KEY, spell_content_hash TEXT)", []).unwrap();
        conn.execute("CREATE TABLE artifact (id INTEGER PRIMARY KEY, spell_content_hash TEXT)", []).unwrap();
        
        let mut total_files_generated = 0;
        
        // 1. Generate 9000 Live Spells
        for i in 0..9000 {
            let spell = CanonicalSpell::new(
                format!("Live Spell {i}"),
                1,
                "ARCANE".to_string(),
                "Test".to_string()
            );
            let hash = spell.compute_hash().unwrap();
            let json = serde_json::to_string(&spell).unwrap();
            conn.execute(
                "INSERT INTO spell (content_hash, canonical_data) VALUES (?1, ?2)", 
                rusqlite::params![&hash, &json]
            ).unwrap();
            super::write_spell_json_atomically(env.path(), &hash, &json).unwrap();
            total_files_generated += 1;
        }

        // 2. Generate 1000 Orphan Files
        for i in 0..1000 {
            let orphan_hash = format!("orphan-hash-{i:06}");
            let orphan_path = super::spell_file_path_in_root(env.path(), &orphan_hash);
            // Write a dummy file to the directory (we ensure the spells dir exists)
            if i == 0 {
                std::fs::create_dir_all(orphan_path.parent().unwrap()).unwrap();
            }
            std::fs::write(&orphan_path, "{}").unwrap();
            total_files_generated += 1;
        }

        assert_eq!(total_files_generated, 10000, "Ensure 10k files exist");

        // Benchmark
        let start = Instant::now();
        let summary = super::run_vault_gc_with_root(&conn, env.path()).expect("gc finished");
        let elapsed = start.elapsed();

        assert_eq!(summary.deleted_count, 1000);
        assert_eq!(summary.retained_count, 9000);
        
        // We assert the timeout condition (must complete in < 30 seconds)
        assert!(
            elapsed.as_secs() < 30,
            "Vault GC on 10k files must complete in < 30 seconds, took {:?}",
            elapsed
        );
    }
```

- [ ] **Step 2: Run test to verify it executes and passes benchmark**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml test_bench_vault_gc_10000 -- --ignored --nocapture`
Expected: PASS and finishes in under 30 seconds.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/vault.rs
git commit -m "test: add vault gc benchmark for 10000 files"
```

## Chunk 2: FTS Rebuild Benchmark

### Task 2: Migration 0014 Benchmark Test

**Files:**
- Modify: `apps/desktop/src-tauri/src/db/migrations.rs:490-497`

- [ ] **Step 1: Write the FTS rebuild benchmark test**

Add the following benchmark to the `mod tests` block at the end of `apps/desktop/src-tauri/src/db/migrations.rs`:

```rust
    #[test]
    #[ignore]
    fn test_bench_fts_rebuild_10000_spells_migration_0014() {
        use std::time::Instant;

        let mut conn = Connection::open_in_memory().expect("open db");
        // We simulate a database at user_version 13.
        // For accurate tests, we just create the spell table with canonical_data
        // and any triggers/fts5 tables that existed prior to 14 might not be strictly necessary 
        // to setup, BUT M0014 executes DROP TRIGGER IF EXISTS and DROP TABLE IF EXISTS spell_fts.
        // The core operation that takes time is inserting 10k rows into the NEW FTS table via json_extract.
        conn.execute_batch(r#"
            CREATE TABLE spell (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content_hash TEXT,
                name TEXT,
                description TEXT,
                material_components TEXT,
                tags TEXT,
                source TEXT,
                author TEXT,
                canonical_data TEXT
            );
            PRAGMA user_version = 13;
        "#).unwrap();

        // Generate 10000 spells with large canonical_data
        let sample_canonical_data = r#"{
            "name": "Dummy Spell",
            "description": "A very long detailed description representing a realistic spell size...",
            "materialComponents": "Bat guano and sulfur.",
            "tags": ["Fire", "Evocation", "Wizard"],
            "source": "Player's Handbook",
            "author": "Gygax",
            "range": { "type": "touch" },
            "duration": { "type": "instantaneous" },
            "area": { "type": "singleTarget" },
            "castingTime": { "type": "action", "value": 1 },
            "savingThrow": { "type": "none" },
            "damage": [],
            "magicResistance": false,
            "experienceComponent": false
        }"#;

        let mut stmt = conn.prepare("INSERT INTO spell (name, description, canonical_data) VALUES (?1, ?2, ?3)").unwrap();
        for i in 0..10000 {
            stmt.execute(rusqlite::params![
                format!("Dummy Spell {}", i),
                "A very long detailed description representing a realistic spell size...",
                sample_canonical_data
            ]).unwrap();
        }

        let sql = include_str!("../../../../../db/migrations/0014_fts_extend_canonical.sql");
        
        // Benchmark Migration 0014
        let start = Instant::now();
        conn.execute_batch(sql).expect("apply migration 0014");
        let elapsed = start.elapsed();

        let count: i32 = conn.query_row("SELECT COUNT(*) FROM spell_fts", [], |row| row.get(0)).unwrap();
        assert_eq!(count, 10000, "Should have repopulated 10000 spells into FTS");

        // Check timeout condition (< 60 seconds)
        assert!(
            elapsed.as_secs() < 60,
            "FTS rebuild for 10k spells must take < 60 seconds, took {:?}",
            elapsed
        );
    }
```

- [ ] **Step 2: Run test to verify it executes and passes benchmark**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml test_bench_fts_rebuild_10000_spells_migration_0014 -- --ignored --nocapture`
Expected: PASS and finishes in under 60 seconds.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/db/migrations.rs
git commit -m "test: add fts rebuild benchmark for migration 0014"
```
