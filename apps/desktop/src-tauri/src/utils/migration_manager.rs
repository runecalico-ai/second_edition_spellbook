use crate::models::spell::SpellDetail;
use crate::models::{AreaKind, CanonicalSpell, DurationKind, RangeKind};
use crate::utils::spell_parser::SpellParser;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::io::Write;
use std::path::Path;

/// Rotate migration.log if it exceeds 10MB or is older than 30 days.
fn maybe_rotate_log(log_path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    const MAX_SIZE_BYTES: u64 = 10 * 1024 * 1024; // 10MB
    const MAX_AGE_DAYS: i64 = 30;

    if !log_path.exists() {
        return Ok(());
    }
    let meta = std::fs::metadata(log_path)?;
    let size_ok = meta.len() < MAX_SIZE_BYTES;
    let age_ok = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| {
            let now = Utc::now().timestamp();
            let then = d.as_secs() as i64;
            (now - then) < MAX_AGE_DAYS * 24 * 3600
        })
        .unwrap_or(true);
    if size_ok && age_ok {
        return Ok(());
    }
    let rotated = log_path.with_extension("log.old");
    let _ = std::fs::remove_file(&rotated);
    std::fs::rename(log_path, rotated)?;
    Ok(())
}

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
    let _ = maybe_rotate_log(&log_path);
    let mut log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .ok();

    if let Some(ref mut log) = log_file {
        let _ = writeln!(
            log,
            "[{}] Starting backfill for {} spells...",
            Utc::now(),
            count
        );
    }

    // Backup using SQLite backup API (VACUUM INTO does not support parameter placeholders)
    let backup_path = data_dir.join(format!("spells_backup_{}.db", Utc::now().timestamp()));
    eprintln!("Backing up database to {:?}", backup_path);
    {
        let mut backup_conn = Connection::open(&backup_path)?;
        let backup = rusqlite::backup::Backup::new(conn, &mut backup_conn)?;
        backup.step(-1)?;
    }
    // Verify backup integrity before proceeding
    let meta = std::fs::metadata(&backup_path)?;
    if meta.len() == 0 {
        return Err("Backup file is empty".into());
    }
    let verify_conn = Connection::open(&backup_path)?;
    let ok: String = verify_conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    if ok != "ok" {
        let _ = std::fs::remove_file(&backup_path);
        return Err(format!("Backup integrity check failed: {}", ok).into());
    }

    let mut stmt = conn.prepare(
        r#"
        SELECT
            id, name, level, school, sphere, class_list, range, components,
            material_components, casting_time, duration, area, saving_throw,
            reversible, description, tags, source, edition, author, license,
            is_quest_spell, is_cantrip, damage, magic_resistance, schema_version
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
                schema_version: row.get(24)?,
                artifacts: None,
                canonical_data: None,
                content_hash: None,
                ..Default::default()
            })
        })?
        .filter_map(Result::ok)
        .collect();

    let parser = SpellParser::new();

    let mut processed: u32 = 0;
    let mut parse_fallback_count: u32 = 0;
    let mut hash_fail_count: u32 = 0;
    let mut updated_count: u32 = 0;
    let total = spells.len();

    // Using unchecked_transaction to allow transaction on shared reference
    // (safe if we are the only one operating on this connection in this scope)
    let tx = conn.unchecked_transaction()?;

    for detail in spells {
        processed += 1;
        if processed.is_multiple_of(100) {
            let msg = format!("Migrating spell {} of {}...", processed, total);
            if let Some(log) = &mut log_file {
                let _ = writeln!(log, "[{}] {}", Utc::now(), msg);
            }
            eprintln!("{}", msg);
        }

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
        let mut spell_had_parse_fallback = false;

        // Apply parsers to structure the data
        if let Some(range_str) = &detail.range {
            let res = parser.parse_range(range_str);
            if res.kind == RangeKind::Special
                && range_str.to_lowercase() != "special"
                && !range_str.trim().is_empty()
            {
                spell_had_parse_fallback = true;
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
                spell_had_parse_fallback = true;
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
            if res.unit == crate::models::CastingTimeUnit::Special
                && cast_str.to_lowercase() != "special"
                && !cast_str.trim().is_empty()
            {
                spell_had_parse_fallback = true;
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
                    spell_had_parse_fallback = true;
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
        if spell_had_parse_fallback {
            parse_fallback_count += 1;
        }
        if let Some(comp_str) = &detail.components {
            canonical.components = Some(parser.parse_components(comp_str));
        }

        // Normalize BEFORE hashing/serializing to ensure the stored data is clean
        canonical.normalize();

        let hash_result = canonical.compute_hash();
        if let Ok(hash) = hash_result {
            canonical.id = Some(hash.clone()); // Store hash in the record
            let json_result = serde_json::to_string(&canonical); // Full serialization (with metadata)
            if let Ok(json) = json_result {
                let rows = tx.execute(
                    "UPDATE spell SET canonical_data = ?1, content_hash = ?2, schema_version = ?3 WHERE id = ?4",
                    params![json, hash, canonical.schema_version, detail.id],
                )?;
                if rows > 0 {
                    updated_count += 1;
                } else {
                    eprintln!("WARNING: Update for spell {:?} affected 0 rows!", detail.id);
                }
            } else {
                eprintln!("Failed to serialize JSON for spell {:?}", detail.id);
            }
        } else {
            hash_fail_count += 1;
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

    let summary = format!(
        "Backfill complete. Processed: {}, updated: {}, parse fallbacks: {}, hash failures: {}.",
        processed, updated_count, parse_fallback_count, hash_fail_count
    );
    if let Some(log) = &mut log_file {
        let _ = writeln!(log, "[{}] {}", Utc::now(), summary);
    }
    eprintln!("{}", summary);
    let total_u = total as u32;
    if total_u > 0 {
        let pct = (updated_count * 100) / total_u;
        let fallback_pct = (parse_fallback_count * 100) / total_u;
        eprintln!(
            "Successfully updated: {} ({}%), Fallback used: {} ({}%)",
            updated_count, pct, parse_fallback_count, fallback_pct
        );
    }

    if let Err(e) = tx.commit() {
        let msg = e.to_string();
        let is_unique_constraint = msg.contains("UNIQUE constraint failed");
        if is_unique_constraint {
            let collision_msg = "Hash collision: two or more spells produced the same content_hash. Migration aborted. See migration.log. Fix duplicates or run --detect-collisions.";
            if let Some(ref mut log) = log_file {
                let _ = writeln!(log, "[{}] {}", Utc::now(), collision_msg);
            }
            eprintln!("{}", collision_msg);
        }
        return Err(e.into());
    }

    Ok(())
}

pub fn recompute_all_hashes(
    conn: &Connection,
    data_dir: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let log_path = data_dir.join("migration.log");
    let _ = maybe_rotate_log(&log_path);
    let mut log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)?;

    writeln!(log_file, "[{}] Starting hash re-computation...", Utc::now())?;

    let mut stmt = conn.prepare(
        r#"
        SELECT
            id, name, level, school, sphere, class_list, range, components,
            material_components, casting_time, duration, area, saving_throw,
            reversible, description, tags, source, edition, author, license,
            is_quest_spell, is_cantrip, content_hash, damage, magic_resistance, schema_version
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
                schema_version: row.get(25)?,
                artifacts: None,
                canonical_data: None,
                content_hash: None,
                ..Default::default()
            };
            let hash: Option<String> = row.get(22)?;
            Ok((detail, hash))
        })?
        .filter_map(Result::ok)
        .collect();

    let parser = SpellParser::new();
    let tx = conn.unchecked_transaction()?;

    let total = spells.len();
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

        // Normalize BEFORE hashing/serializing to ensure the stored data is clean
        canonical.normalize();

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
        "[{}] Re-computation complete. Recomputed {} hashes, {} updated.",
        Utc::now(),
        total,
        changed_count
    )?;
    eprintln!("Recomputed {} hashes, {} updated.", total, changed_count);

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

    // Hash-vs-canonical verification: recompute hash from canonical_data and compare to stored content_hash
    let mut hash_check_stmt = conn.prepare(
        "SELECT id, name, canonical_data, content_hash FROM spell WHERE canonical_data IS NOT NULL AND content_hash IS NOT NULL",
    )?;
    let hash_check_rows = hash_check_stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
        ))
    })?;
    let mut hash_mismatch_count = 0u32;
    let mut hash_mismatch_examples: Vec<(i64, String)> = Vec::new();
    const MAX_MISMATCH_EXAMPLES: usize = 10;
    for row in hash_check_rows {
        let (id, name, canonical_data, content_hash) = row?;
        if let Ok(canonical) = serde_json::from_str::<CanonicalSpell>(&canonical_data) {
            if let Ok(recomputed) = canonical.compute_hash() {
                if recomputed != content_hash {
                    hash_mismatch_count += 1;
                    if hash_mismatch_examples.len() < MAX_MISMATCH_EXAMPLES {
                        hash_mismatch_examples.push((id, name));
                    }
                }
            }
        }
    }
    if hash_mismatch_count > 0 {
        eprintln!(
            "Hash mismatch (content_hash != recomputed from canonical_data): {} spell(s).",
            hash_mismatch_count
        );
        for (id, name) in &hash_mismatch_examples {
            eprintln!("  - id={}, name={:?}", id, name);
        }
        if hash_mismatch_count as usize > MAX_MISMATCH_EXAMPLES {
            eprintln!(
                "  ... and {} more.",
                hash_mismatch_count as usize - MAX_MISMATCH_EXAMPLES
            );
        }
    } else {
        println!("All stored content_hash values match canonical_data.");
    }

    // Orphan check: character_class_spell referencing non-existent spell
    let orphan_sql = "SELECT ccs.character_class_id, ccs.spell_id FROM character_class_spell ccs LEFT JOIN spell s ON s.id = ccs.spell_id WHERE s.id IS NULL";
    let orphans: Vec<(i64, i64)> = match conn.prepare(orphan_sql) {
        Ok(mut stmt) => stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map(|m| m.filter_map(Result::ok).collect())
            .unwrap_or_default(),
        Err(_) => vec![],
    };
    if !orphans.is_empty() {
        eprintln!(
            "Found {} character_class_spell row(s) referencing non-existent spell.id.",
            orphans.len()
        );
        for (class_id, spell_id) in orphans.iter().take(10) {
            eprintln!("  - character_class_id={}, spell_id={}", class_id, spell_id);
        }
        if orphans.len() > 10 {
            eprintln!("  ... and {} more.", orphans.len() - 10);
        }
    } else {
        println!("No orphan character_class_spell references.");
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

/// Runtime sync-check: compare flat columns to canonical_data and log discrepancies.
pub fn sync_check_spell(conn: &Connection, spell_id: i64) {
    type Row = (
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    );
    let row: Option<Row> = conn
        .query_row(
            "SELECT range, duration, casting_time, area, components, canonical_data FROM spell WHERE id = ?",
            [spell_id],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                ))
            },
        )
        .optional()
        .ok()
        .flatten();
    let Some((
        range_flat,
        duration_flat,
        casting_time_flat,
        area_flat,
        components_flat,
        canonical_json,
    )) = row
    else {
        return;
    };
    let Some(canonical_json) = canonical_json else {
        return;
    };
    let Ok(canonical) = serde_json::from_str::<CanonicalSpell>(&canonical_json) else {
        return;
    };
    let parser = SpellParser::new();
    let mut discrepancies = Vec::new();
    if let Some(ref flat) = range_flat {
        let parsed = parser.parse_range(flat);
        if canonical.range.as_ref() != Some(&parsed) {
            discrepancies.push("range");
        }
    }
    if let Some(ref flat) = duration_flat {
        let parsed = parser.parse_duration(flat);
        if canonical.duration.as_ref() != Some(&parsed) {
            discrepancies.push("duration");
        }
    }
    if let Some(ref flat) = casting_time_flat {
        let parsed = parser.parse_casting_time(flat);
        if canonical.casting_time.as_ref() != Some(&parsed) {
            discrepancies.push("casting_time");
        }
    }
    if let Some(ref flat) = area_flat {
        let parsed = parser.parse_area(flat);
        if canonical.area != parsed {
            discrepancies.push("area");
        }
    }
    if let Some(ref flat) = components_flat {
        let parsed = parser.parse_components(flat);
        if canonical.components.as_ref() != Some(&parsed) {
            discrepancies.push("components");
        }
    }
    if !discrepancies.is_empty() {
        eprintln!(
            "[sync_check] spell_id={}: flat vs canonical mismatch: {:?}",
            spell_id, discrepancies
        );
    }
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
    {
        let backup = rusqlite::backup::Backup::new(&src_conn, conn)?;
        // Perform backup (restore)
        // step(-1) copies the whole pages
        backup.step(-1)?;
    }

    // Verify the restored database (conn is the destination and now holds the backup content).
    let result: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    if result != "ok" {
        eprintln!("Warning: integrity check failed after restore: {}", result);
        return Err(format!("Integrity check failed after restore: {}", result).into());
    }

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
    let collisions: Vec<(String, i64)> = stmt
        .query_map([], |row| {
            let hash: String = row.get(0)?;
            let count: i64 = row.get(1)?;
            Ok((hash, count))
        })?
        .filter_map(Result::ok)
        .collect();

    let mut detail_stmt =
        conn.prepare("SELECT id, name, canonical_data FROM spell WHERE content_hash = ?")?;
    let mut found = false;
    for (hash, count) in collisions {
        let rows: Vec<(i64, String, Option<String>)> = detail_stmt
            .query_map([&hash], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .filter_map(Result::ok)
            .collect();
        let canonical_datas: Vec<&str> =
            rows.iter().filter_map(|(_, _, cd)| cd.as_deref()).collect();
        let all_identical =
            canonical_datas.len() >= 2 && canonical_datas.windows(2).all(|w| w[0] == w[1]);
        let names: Vec<String> = rows
            .iter()
            .map(|(id, name, _)| format!("{} ({})", name, id))
            .collect();
        if all_identical {
            println!(
                "Duplicate content (same spell data): hash {} appears {} times.",
                hash, count
            );
        } else if canonical_datas.len() < 2 {
            println!(
                "Duplicate hash (cannot compare: canonical_data missing for some): {} appears {} times.",
                hash, count
            );
        } else {
            println!(
                "True hash collision (different content, same hash): {} appears {} times.",
                hash, count
            );
        }
        println!("  - Spells: {}", names.join(", "));
        found = true;
    }

    if !found {
        println!("No collisions found.");
    }
    Ok(())
}

pub fn export_migration_report(
    conn: &Connection,
    data_dir: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let log_path = data_dir.join("migration.log");
    if !log_path.exists() {
        return Err("No migration log found.".into());
    }

    let content = std::fs::read_to_string(&log_path)?;
    let lines: Vec<&str> = content.lines().collect();

    let spell_count: i64 = conn.query_row("SELECT COUNT(*) FROM spell", [], |r| r.get(0))?;

    let mut parse_failures = serde_json::Map::new();
    let range_fail = lines
        .iter()
        .filter(|l| l.contains("Failed to parse range"))
        .count();
    let duration_fail = lines
        .iter()
        .filter(|l| l.contains("Failed to parse duration"))
        .count();
    let casting_time_fail = lines
        .iter()
        .filter(|l| l.contains("Failed to parse casting_time"))
        .count();
    let area_fail = lines
        .iter()
        .filter(|l| l.contains("Failed to parse area"))
        .count();
    parse_failures.insert(
        "range".to_string(),
        serde_json::Value::Number(serde_json::Number::from(range_fail)),
    );
    parse_failures.insert(
        "duration".to_string(),
        serde_json::Value::Number(serde_json::Number::from(duration_fail)),
    );
    parse_failures.insert(
        "casting_time".to_string(),
        serde_json::Value::Number(serde_json::Number::from(casting_time_fail)),
    );
    parse_failures.insert(
        "area".to_string(),
        serde_json::Value::Number(serde_json::Number::from(area_fail)),
    );

    let export_path = data_dir.join(format!("migration_report_{}.json", Utc::now().timestamp()));
    use serde_json::json;
    let json_output = json!({
        "timestamp": Utc::now().to_rfc3339(),
        "spell_count": spell_count,
        "parse_failures": parse_failures,
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
                name, level, school, class_list, description, range, duration, casting_time, is_quest_spell, is_cantrip
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"#,
            params![
                "Test Mapping Spell",
                5,
                "Conjuration",
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

    /// Regression test: recompute_all_hashes SELECT column order and row mapping must stay in sync.
    /// Builds a minimal spell table with the same column order as the SELECT and asserts one spell's hash/json.
    #[test]
    fn test_recompute_all_hashes_select_row_mapping_regression(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let db = Connection::open_in_memory()?;
        // Table columns must match recompute_all_hashes SELECT list order (id, name, level, school, ...).
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
                damage TEXT,
                magic_resistance TEXT,
                schema_version INTEGER,
                canonical_data TEXT
            );
            "#,
        )?;
        db.execute(
            r#"INSERT INTO spell (name, level, description, school, range)
               VALUES (?1, ?2, ?3, ?4, ?5)"#,
            params![
                "Recompute Test",
                3,
                "A test description.",
                "Evocation",
                "60 feet"
            ],
        )?;

        let temp = tempdir()?;
        recompute_all_hashes(&db, temp.path())?;

        let (hash, json): (Option<String>, Option<String>) = db.query_row(
            "SELECT content_hash, canonical_data FROM spell WHERE name = 'Recompute Test'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        let hash = hash.expect("content_hash should be set");
        let json = json.expect("canonical_data should be set");

        assert!(!hash.is_empty());
        assert!(json.contains(r#""name":"Recompute Test""#));
        assert!(json.contains(r#""level":3"#));
        assert!(json.contains(r#""school":"Evocation"#));

        Ok(())
    }

    /// Integration test: two spells with identical content produce the same content_hash;
    /// backfill hits UNIQUE constraint on commit and transaction rolls back.
    #[test]
    fn test_hash_collision_unique_constraint_rollback() -> Result<(), Box<dyn std::error::Error>> {
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
            CREATE UNIQUE INDEX idx_spell_content_hash ON spell(content_hash) WHERE content_hash IS NOT NULL;
            "#,
        )?;

        // Two spells with identical legacy data so they produce the same content_hash
        let same_desc = "Identical spell data for collision test.";
        let same_name = "Collision Spell";
        db.execute(
            r#"INSERT INTO spell (name, level, description, school, range, components, casting_time, duration)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
            params![
                same_name,
                1,
                same_desc,
                "Evocation",
                "60 feet",
                "V, S, M",
                "1 action",
                "Instantaneous"
            ],
        )?;
        db.execute(
            r#"INSERT INTO spell (name, level, description, school, range, components, casting_time, duration)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
            params![
                same_name,
                1,
                same_desc,
                "Evocation",
                "60 feet",
                "V, S, M",
                "1 action",
                "Instantaneous"
            ],
        )?;

        let temp = tempdir()?;
        let result = run_hash_backfill(&db, temp.path());

        assert!(
            result.is_err(),
            "Backfill should fail with UNIQUE constraint"
        );
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("UNIQUE") || err_msg.contains("unique"),
            "Error should indicate UNIQUE constraint: {}",
            err_msg
        );

        // Transaction must have rolled back: no spell should have content_hash set
        let with_hash: i64 = db.query_row(
            "SELECT COUNT(*) FROM spell WHERE content_hash IS NOT NULL",
            [],
            |r| r.get(0),
        )?;
        assert_eq!(
            with_hash, 0,
            "After collision, transaction should roll back and no rows should have content_hash"
        );

        Ok(())
    }
}
