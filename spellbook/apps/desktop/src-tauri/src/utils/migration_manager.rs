use crate::models::spell::SpellDetail;
use crate::models::{AreaKind, CanonicalSpell, DurationKind, RangeKind};
use crate::utils::spell_parser::SpellParser;
use chrono::Utc;
use rusqlite::{params, Connection};
use std::io::Write;
use std::path::Path;

pub fn run_hash_backfill(
    conn: &Connection,
    data_dir: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM spell WHERE content_hash IS NULL",
        [],
        |row| row.get(0),
    )?;

    if count == 0 {
        return Ok(());
    }

    eprintln!("Backfilling hashes for {} spells...", count);

    let log_path = data_dir.join("migration.log");
    let mut log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .ok();

    if let Some(ref mut log) = log_file {
        let _ = writeln!(
            log,
            "[{}] Starting backfill for {} spells...",
            Utc::now(),
            count
        );
    }

    // Backup
    let backup_path = data_dir.join(format!("spells_backup_{}.db", Utc::now().timestamp()));
    eprintln!("Backing up database to {:?}", backup_path);
    conn.execute("VACUUM INTO ?", params![backup_path.to_str().unwrap()])?;

    let mut stmt = conn.prepare(
        r#"
        SELECT
            id, name, level, school, sphere, class_list, range, components,
            material_components, casting_time, duration, area, saving_throw,
            reversible, description, tags, source, edition, author, license,
            is_quest_spell, is_cantrip, damage, magic_resistance
        FROM spell WHERE content_hash IS NULL
    "#,
    )?;

    let spells: Vec<SpellDetail> = stmt
        .query_map([], |row| {
            Ok(SpellDetail {
                id: row.get(0)?,
                name: row.get(1)?,
                level: row.get(2)?,
                school: row.get(3)?,
                sphere: row.get(4)?,
                class_list: row.get(5)?,
                range: row.get(6)?,
                components: row.get(7)?,
                material_components: row.get(8)?,
                casting_time: row.get(9)?,
                duration: row.get(10)?,
                area: row.get(11)?,
                saving_throw: row.get(12)?,
                reversible: row.get(13)?,
                description: row.get(14)?,
                tags: row.get(15)?,
                source: row.get(16)?,
                edition: row.get(17)?,
                author: row.get(18)?,
                license: row.get(19)?,
                is_quest_spell: row.get(20)?,
                is_cantrip: row.get(21)?,
                damage: row.get(22)?,
                magic_resistance: row.get(23)?,
                artifacts: None,
            })
        })?
        .filter_map(Result::ok)
        .collect();

    let parser = SpellParser::new();

    // Using unchecked_transaction to allow transaction on shared reference
    // (safe if we are the only one operating on this connection in this scope)
    let tx = conn.unchecked_transaction()?;

    for detail in spells {
        let canonical_res = CanonicalSpell::try_from(detail.clone());

        if let Err(e) = canonical_res {
            if let Some(log) = &mut log_file {
                let _ = writeln!(
                    log,
                    "[{}] Spell {}: Failed to canonicalize: {}",
                    Utc::now(),
                    detail.id.unwrap_or_default(),
                    e
                );
            }
            eprintln!("Failed to canonicalize spell {:?}: {}", detail.id, e);
            continue;
        }

        let mut canonical = canonical_res.unwrap();

        // Apply parsers to structure the data
        if let Some(range_str) = &detail.range {
            let res = parser.parse_range(range_str);
            if res.kind == RangeKind::Special
                && range_str.to_lowercase() != "special"
                && !range_str.trim().is_empty()
            {
                if let Some(log) = &mut log_file {
                    let _ = writeln!(
                        log,
                        "[{}] Spell {}: Failed to parse range '{}'",
                        Utc::now(),
                        detail.id.unwrap_or_default(),
                        range_str
                    );
                }
            }
            canonical.range = Some(res);
        }
        if let Some(duration_str) = &detail.duration {
            let res = parser.parse_duration(duration_str);
            if res.kind == DurationKind::Special
                && duration_str.to_lowercase() != "special"
                && !duration_str.trim().is_empty()
            {
                if let Some(log) = &mut log_file {
                    let _ = writeln!(
                        log,
                        "[{}] Spell {}: Failed to parse duration '{}'",
                        Utc::now(),
                        detail.id.unwrap_or_default(),
                        duration_str
                    );
                }
            }
            canonical.duration = Some(res);
        }
        if let Some(cast_str) = &detail.casting_time {
            let res = parser.parse_casting_time(cast_str);
            if res.unit == "Special"
                && cast_str.to_lowercase() != "special"
                && !cast_str.trim().is_empty()
            {
                if let Some(log) = &mut log_file {
                    let _ = writeln!(
                        log,
                        "[{}] Spell {}: Failed to parse casting_time '{}'",
                        Utc::now(),
                        detail.id.unwrap_or_default(),
                        cast_str
                    );
                }
            }
            canonical.casting_time = Some(res);
        }
        if let Some(area_str) = &detail.area {
            let res = parser.parse_area(area_str);
            if let Some(spec) = &res {
                if spec.kind == AreaKind::Special
                    && area_str.to_lowercase() != "special"
                    && !area_str.trim().is_empty()
                {
                    if let Some(log) = &mut log_file {
                        let _ = writeln!(
                            log,
                            "[{}] Spell {}: Failed to parse area '{}'",
                            Utc::now(),
                            detail.id.unwrap_or_default(),
                            area_str
                        );
                    }
                }
            }
            canonical.area = res;
        }
        if let Some(comp_str) = &detail.components {
            canonical.components = Some(parser.parse_components(comp_str));
        }

        let hash_result = canonical.compute_hash();
        if let Ok(hash) = hash_result {
            canonical.id = Some(hash.clone()); // Store hash in the record
            canonical.normalize(); // Ensure stored data is normalized
            let json_result = serde_json::to_string(&canonical); // Full serialization (with metadata)
            if let Ok(json) = json_result {
                let rows = tx.execute(
                    "UPDATE spell SET canonical_data = ?1, content_hash = ?2, schema_version = ?3 WHERE id = ?4",
                    params![json, hash, canonical.schema_version, detail.id],
                )?;
                if rows == 0 {
                    eprintln!("WARNING: Update for spell {:?} affected 0 rows!", detail.id);
                }
            } else {
                eprintln!("Failed to serialize JSON for spell {:?}", detail.id);
            }
        } else {
            let err = hash_result.err().unwrap_or_default();
            if let Some(log) = &mut log_file {
                let _ = writeln!(
                    log,
                    "[{}] Spell {}: Hash failure: {}",
                    Utc::now(),
                    detail.id.unwrap_or_default(),
                    err
                );
            }
            eprintln!(
                "Failed to compute hash for spell ID {:?}: {:?}",
                detail.id, err
            );
        }
    }

    tx.commit()?;

    eprintln!("Backfill complete.");

    Ok(())
}

pub fn recompute_all_hashes(
    conn: &Connection,
    data_dir: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let log_path = data_dir.join("migration.log");
    let mut log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)?;

    writeln!(log_file, "[{}] Starting hash re-computation...", Utc::now())?;

    let mut stmt = conn.prepare(
        r#"
        SELECT
            id, name, level, school, sphere, class_list, range, components,
            material_components, casting_time, duration, area, saving_throw,
            reversible, description, tags, source, edition, author, license,
            is_quest_spell, is_cantrip, content_hash, damage, magic_resistance
        FROM spell
    "#,
    )?;

    let spells: Vec<(SpellDetail, Option<String>)> = stmt
        .query_map([], |row| {
            let detail = SpellDetail {
                id: row.get(0)?,
                name: row.get(1)?,
                level: row.get(2)?,
                school: row.get(3)?,
                sphere: row.get(4)?,
                class_list: row.get(5)?,
                range: row.get(6)?,
                components: row.get(7)?,
                material_components: row.get(8)?,
                casting_time: row.get(9)?,
                duration: row.get(10)?,
                area: row.get(11)?,
                saving_throw: row.get(12)?,
                reversible: row.get(13)?,
                description: row.get(14)?,
                tags: row.get(15)?,
                source: row.get(16)?,
                edition: row.get(17)?,
                author: row.get(18)?,
                license: row.get(19)?,
                is_quest_spell: row.get(20)?,
                is_cantrip: row.get(21)?,
                damage: row.get(23)?,
                magic_resistance: row.get(24)?,
                artifacts: None,
            };
            let hash: Option<String> = row.get(22)?;
            Ok((detail, hash))
        })?
        .filter_map(Result::ok)
        .collect();

    let parser = SpellParser::new();
    let tx = conn.unchecked_transaction()?;

    let mut changed_count = 0;

    for (detail, old_hash) in spells {
        let canonical_res = CanonicalSpell::try_from(detail.clone());
        if let Err(e) = canonical_res {
            writeln!(
                log_file,
                "[{}] Spell {}: Failed to canonicalize during recompute: {}",
                Utc::now(),
                detail.id.unwrap_or_default(),
                e
            )?;
            continue;
        }
        let mut canonical = canonical_res.unwrap();

        if let Some(s) = &detail.range {
            canonical.range = Some(parser.parse_range(s));
        }
        if let Some(s) = &detail.duration {
            canonical.duration = Some(parser.parse_duration(s));
        }
        if let Some(s) = &detail.casting_time {
            canonical.casting_time = Some(parser.parse_casting_time(s));
        }
        if let Some(s) = &detail.area {
            canonical.area = parser.parse_area(s);
        }
        if let Some(s) = &detail.components {
            canonical.components = Some(parser.parse_components(s));
        }

        if let Ok(new_hash) = canonical.compute_hash() {
            if Some(&new_hash) != old_hash.as_ref() {
                canonical.id = Some(new_hash.clone());
                if let Ok(json) = serde_json::to_string(&canonical) {
                    tx.execute(
                        "UPDATE spell SET canonical_data = ?1, content_hash = ?2, schema_version = ?3 WHERE id = ?4",
                        params![json, new_hash, canonical.schema_version, detail.id],
                    )?;
                    writeln!(
                        log_file,
                        "[{}] Updated hash for spell ID {}: {} -> {}",
                        Utc::now(),
                        detail.id.unwrap_or_default(),
                        old_hash.unwrap_or("NULL".into()),
                        new_hash
                    )?;
                    changed_count += 1;
                }
            }
        }
    }

    tx.commit()?;
    writeln!(
        log_file,
        "[{}] Re-computation complete. {} spells updated.",
        Utc::now(),
        changed_count
    )?;
    eprintln!("Recomputed hashes. {} updated.", changed_count);

    Ok(())
}

pub fn check_integrity(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    println!("Checking integrity...");

    let null_hashes: i64 = conn.query_row(
        "SELECT COUNT(*) FROM spell WHERE content_hash IS NULL",
        [],
        |r| r.get(0),
    )?;
    if null_hashes > 0 {
        eprintln!("Found {} spells with NULL content_hash.", null_hashes);
    } else {
        println!("No spells with NULL content_hash.");
    }

    // Check collisions
    let mut stmt = conn.prepare("SELECT content_hash, COUNT(*) as c FROM spell WHERE content_hash IS NOT NULL GROUP BY content_hash HAVING c > 1")?;
    let collisions = stmt.query_map([], |row| {
        let hash: String = row.get(0)?;
        let count: i64 = row.get(1)?;
        Ok((hash, count))
    })?;

    for c in collisions {
        let (hash, count) = c?;
        eprintln!(
            "Collision detected: Hash {} has {} duplicates.",
            hash, count
        );
    }

    Ok(())
}

use std::path::PathBuf;

pub fn list_backups(data_dir: &Path) -> Result<Vec<PathBuf>, Box<dyn std::error::Error>> {
    let mut backups = Vec::new();
    if data_dir.exists() {
        for entry in std::fs::read_dir(data_dir)? {
            let entry = entry?;
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("spells_backup_") && name.ends_with(".db") {
                    backups.push(path);
                }
            }
        }
    }
    // Sort by name (timestamp) descending
    backups.sort_by(|a, b| b.cmp(a));
    Ok(backups)
}

pub fn restore_backup(
    conn: &mut Connection,
    backup_path: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    if !backup_path.exists() {
        return Err(format!("Backup file not found: {:?}", backup_path).into());
    }

    // Use SQLite online backup API to copy validation
    println!("Restoring from {:?}...", backup_path);

    let src_conn = Connection::open(backup_path)?;

    // Create a backup object to copy FROM src (backup) TO conn (main)
    // new(from, to) -> from=backup, to=main
    let backup = rusqlite::backup::Backup::new(&src_conn, conn)?;

    // Perform backup (restore)
    // step(-1) copies the whole pages
    backup.step(-1)?;

    println!("Restore complete.");

    Ok(())
}

pub fn rollback_migration(
    conn: &mut Connection,
    data_dir: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let backups = list_backups(data_dir)?;
    if let Some(latest) = backups.first() {
        restore_backup(conn, latest)?;
        Ok(())
    } else {
        Err("No backups found to rollback to.".into())
    }
}

pub fn detect_collisions(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    println!("Scanning for hash collisions...");
    let mut stmt = conn.prepare("SELECT content_hash, COUNT(*) as c FROM spell WHERE content_hash IS NOT NULL GROUP BY content_hash HAVING c > 1")?;
    let collisions = stmt.query_map([], |row| {
        let hash: String = row.get(0)?;
        let count: i64 = row.get(1)?;
        Ok((hash, count))
    })?;

    let mut found = false;
    for c in collisions {
        let (hash, count) = c?;
        println!("COLLISION: Hash {} appears {} times.", hash, count);
        let mut detail_stmt = conn.prepare("SELECT id, name FROM spell WHERE content_hash = ?")?;
        let names: Vec<String> = detail_stmt
            .query_map([&hash], |r| {
                let id: i64 = r.get(0)?;
                let name: String = r.get(1)?;
                Ok(format!("{} ({})", name, id))
            })?
            .filter_map(Result::ok)
            .collect();
        println!("  - Spells: {}", names.join(", "));
        found = true;
    }

    if !found {
        println!("No collisions found.");
    }
    Ok(())
}

pub fn export_migration_report(data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let log_path = data_dir.join("migration.log");
    if !log_path.exists() {
        return Err("No migration log found.".into());
    }

    let content = std::fs::read_to_string(&log_path)?;
    let export_path = data_dir.join(format!("migration_report_{}.json", Utc::now().timestamp()));

    // Simple JSON wrapping of log lines for now
    use serde_json::json;
    let lines: Vec<&str> = content.lines().collect();
    let json_output = json!({
        "timestamp": Utc::now().to_rfc3339(),
        "log_lines": lines
    });

    let file = std::fs::File::create(&export_path)?;
    serde_json::to_writer_pretty(file, &json_output)?;

    println!("Exported migration report to {:?}", export_path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_migration_column_mapping_regression() -> Result<(), Box<dyn std::error::Error>> {
        let db = Connection::open_in_memory()?;
        db.execute_batch(
            r#"
            CREATE TABLE spell (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                level INTEGER NOT NULL,
                school TEXT,
                sphere TEXT,
                class_list TEXT,
                range TEXT,
                components TEXT,
                material_components TEXT,
                casting_time TEXT,
                duration TEXT,
                area TEXT,
                saving_throw TEXT,
                reversible INTEGER,
                description TEXT NOT NULL,
                tags TEXT,
                source TEXT,
                edition TEXT,
                author TEXT,
                license TEXT,
                is_quest_spell INTEGER DEFAULT 0,
                is_cantrip INTEGER DEFAULT 0,
                content_hash TEXT,
                canonical_data TEXT,
                schema_version INTEGER,
                damage TEXT,
                magic_resistance TEXT
            );
            "#,
        )?;

        // Insert a spell with distinct values to verify mapping
        db.execute(
            r#"INSERT INTO spell (
                name, level, school, sphere, class_list, description, range, duration, casting_time, is_quest_spell, is_cantrip
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"#,
            params![
                "Test Mapping Spell",
                5,
                "Conjuration",
                "Creation",
                "Wizard, Cleric",
                "Detailed description here.",
                "100.5 feet",
                "1 hour",
                "1 segment",
                1,
                0
            ],
        )?;

        let temp = tempdir()?;
        run_hash_backfill(&db, temp.path())?;

        let (hash, json, schema_version, qs, ct): (Option<String>, Option<String>, Option<i64>, i64, i64) = db.query_row(
            "SELECT content_hash, canonical_data, schema_version, is_quest_spell, is_cantrip FROM spell WHERE name='Test Mapping Spell'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )?;

        let hash_val = hash.expect("Hash should be populated");
        let json_val = json.expect("JSON should be populated");
        let schema_val = schema_version.expect("Schema version should be populated");

        assert!(!hash_val.is_empty(), "Hash should not be empty");
        assert_eq!(schema_val, 1, "Schema version should be 1");
        assert_eq!(qs, 1);
        assert_eq!(ct, 0);

        // Verify critical fields were mapped correctly
        assert!(
            json_val.contains(r#""name":"Test Mapping Spell""#),
            "Name mismatch, JSON: {}",
            json_val
        );
        assert!(
            json_val.contains(r#""level":5"#),
            "Level mismatch, JSON: {}",
            json_val
        );
        assert!(
            json_val.contains(r#""school":"Conjuration""#),
            "School mismatch, JSON: {}",
            json_val
        );
        assert!(
            json_val.contains(r#""sphere":"Creation""#),
            "Sphere mismatch, JSON: {}",
            json_val
        );
        assert!(
            json_val.contains(r#""class_list":["Cleric","Wizard"]"#),
            "Class list mismatch, JSON: {}",
            json_val
        );

        // Verify parser results (range structure)
        assert!(
            json_val.contains(r#""kind":"distance""#),
            "Range kind mismatch, JSON: {}",
            json_val
        );
        assert!(
            json_val.contains(r#""value":100.5"#),
            "Range distance value mismatch, JSON: {}",
            json_val
        );
        assert!(
            json_val.contains(r#""unit":"ft""#),
            "Range unit mismatch, JSON: {}",
            json_val
        );

        Ok(())
    }

    #[test]
    fn test_metadata_persistence_and_id_storage_regression(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let db = Connection::open_in_memory()?;
        db.execute_batch(
            r#"
            CREATE TABLE spell (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                level INTEGER NOT NULL,
                tradition TEXT,
                description TEXT NOT NULL,
                school TEXT,
                sphere TEXT,
                class_list TEXT,
                range TEXT,
                components TEXT,
                material_components TEXT,
                casting_time TEXT,
                duration TEXT,
                area TEXT,
                saving_throw TEXT,
                reversible INTEGER,
                tags TEXT,
                source TEXT,
                edition TEXT,
                author TEXT,
                license TEXT,
                is_quest_spell INTEGER DEFAULT 0,
                is_cantrip INTEGER DEFAULT 0,
                content_hash TEXT,
                canonical_data TEXT,
                schema_version INTEGER,
                damage TEXT,
                magic_resistance TEXT
            );
            "#,
        )?;

        db.execute(
            r#"INSERT INTO spell (name, level, tradition, description, school, edition, author)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#,
            params![
                "Preserve Me",
                1,
                "ARCANE",
                "Desc",
                "Abjuration",
                "2e",
                "Test Author"
            ],
        )?;

        let temp = tempdir()?;
        run_hash_backfill(&db, temp.path())?;

        let (hash, json): (String, String) =
            db.query_row("SELECT content_hash, canonical_data FROM spell", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })?;

        // Verify JSON contains Metadata (edition/author) and ID (hash)
        assert!(
            json.contains("\"edition\":\"2e\""),
            "Metadata 'edition' was lost!"
        );
        assert!(
            json.contains("\"author\":\"Test Author\""),
            "Metadata 'author' was lost!"
        );
        assert!(
            json.contains(&format!("\"id\":\"{}\"", hash)),
            "Hash ID was not stored in JSON!"
        );

        // Verify hashing still works (checking stability)
        let canon: CanonicalSpell = serde_json::from_str(&json)?;
        let recomputed = canon.compute_hash()?;
        assert_eq!(
            hash, recomputed,
            "Stored hash should match computation from stored JSON"
        );

        // Verify canonical JSON for hashing EXCLUDES metadata and ID
        let canonical_json = canon.to_canonical_json()?;
        assert!(!canonical_json.contains("\"edition\""));
        assert!(!canonical_json.contains("\"author\""));
        assert!(!canonical_json.contains("\"id\""));

        Ok(())
    }
}
