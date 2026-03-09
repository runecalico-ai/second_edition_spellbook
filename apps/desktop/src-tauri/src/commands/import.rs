use crate::commands::spells::{
    apply_spell_update_with_conn, canonicalize_spell_detail, get_spell_from_conn, log_changes,
};
use crate::commands::vault::{
    export_spell_to_vault_by_hash, optimize_vault_with_root, VaultMaintenanceState,
};
use crate::db::Pool;
use crate::error::AppError;
use crate::models::canonical_spell::{
    CanonicalSpell, SourceRef, BUNDLE_FORMAT_VERSION, CURRENT_SCHEMA_VERSION,
};
use crate::models::{
    ConflictsResolved, DuplicatesSkipped, ImportArtifact, ImportConflict, ImportConflictField,
    ImportConflictResolution, ImportFile, ImportResult, ImportSpell, ImportSpellJsonConflict,
    ImportSpellJsonConflictResolution, ImportSpellJsonFailure, ImportSpellJsonResolveOptions,
    ImportSpellJsonResult, ParseConflict, PreviewImportSpellJsonResult, PreviewResult,
    PreviewSpell, PreviewSpellJsonItem, ResolveImportResult, SpellDetail, SpellUpdate,
};
use crate::sidecar::call_sidecar;
use crate::utils::migration_manager;
use chrono::Utc;
use dirs::data_dir as system_data_dir;
use regex::Regex;
use rusqlite::params;
use rusqlite::OptionalExtension;
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tracing::warn;

use tauri::State;

// --- JSON spell import (Task 2.1: parse, classify, normalize, hash) ---

const MAX_TAGS: usize = 100;
const MAX_SOURCE_REFS: usize = 50;

/// Allowed URL schemes for SourceRef (import allowlist). Rejects javascript:, data:, ipfs:, etc.
const ALLOWED_URL_SCHEMES: &[&str] = &["http", "https", "mailto"];

/// Validates a SourceRef URL: allowlist http, https, mailto; rejects javascript, data, ipfs, and any other protocol.
pub fn validate_source_ref_url(url: &str) -> bool {
    let s = url.trim();
    if s.is_empty() {
        return false;
    }
    let scheme_end = match s.find(':') {
        Some(i) => i,
        None => return false,
    };
    let scheme = s[..scheme_end].trim().to_lowercase();
    ALLOWED_URL_SCHEMES.contains(&scheme.as_str())
}

/// Sanitizes a URL string for storage/display: strips HTML/script (e.g. angle-bracket tags and dangerous protocol text).
pub fn sanitize_url_for_display(s: &str) -> String {
    let mut out = s.trim().to_string();
    // Strip angle-bracket tags (e.g. <script>, <img ...>)
    let re = Regex::new(r"<[^>]*>").expect("static regex");
    out = re.replace_all(&out, "").to_string();
    // Collapse repeated whitespace
    let re_ws = Regex::new(r"\s+").expect("static regex");
    out = re_ws.replace_all(&out, " ").trim().to_string();
    out
}

/// SourceRef URL policy: drop invalid refs with warning, or reject the entire spell.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SourceRefUrlPolicy {
    DropRef,
    RejectSpell,
}

impl Default for SourceRefUrlPolicy {
    fn default() -> Self {
        SourceRefUrlPolicy::DropRef
    }
}

fn parse_source_ref_url_policy(s: Option<&str>) -> SourceRefUrlPolicy {
    match s.map(str::trim) {
        Some("reject-spell") => SourceRefUrlPolicy::RejectSpell,
        _ => SourceRefUrlPolicy::DropRef,
    }
}

/// Returns true if two SourceRefs are duplicates per spec:
/// "dedup by URL only when both refs have non-empty URL; otherwise dedup by (system, book, page, note)".
pub fn is_duplicate_source_ref(a: &SourceRef, b: &SourceRef) -> bool {
    if let (Some(u1), Some(u2)) = (a.url.as_deref(), b.url.as_deref()) {
        let u1 = u1.trim();
        let u2 = u2.trim();
        if !u1.is_empty() && !u2.is_empty() {
            return u1 == u2;
        }
    }
    // Tuple fallback (system, book, page, note)
    let system_a = a.system.as_deref().unwrap_or("");
    let system_b = b.system.as_deref().unwrap_or("");
    let note_a = a.note.as_deref().unwrap_or("");
    let note_b = b.note.as_deref().unwrap_or("");

    system_a == system_b && a.book.trim() == b.book.trim() && a.page == b.page && note_a == note_b
}

/// Merge tags and source_refs into existing canonical_data JSON.
/// Tags: union, sorted, deduped, cap 100.
/// SourceRefs: existing first, then append new, dedup by Spec #1 policy, cap 50.
/// Returns (Option<merged_tags_string>, updated_canonical_data_json).
fn merge_canonical_metadata(
    existing_canonical_json: &str,
    incoming_tags: &[String],
    incoming_refs: &[SourceRef],
) -> Result<(Option<String>, String), AppError> {
    let mut canon: CanonicalSpell = serde_json::from_str(existing_canonical_json)
        .map_err(|e| AppError::Import(format!("Parse canonical_data for merge: {}", e)))?;

    // 1. Merge Tags
    for t in incoming_tags {
        let t = t.trim();
        if !t.is_empty() && !canon.tags.iter().any(|existing| existing == t) {
            canon.tags.push(t.to_string());
        }
    }
    canon.tags.sort();
    canon.tags.dedup();
    canon.tags.truncate(MAX_TAGS);
    let tags_col = if canon.tags.is_empty() {
        None
    } else {
        Some(canon.tags.join(", "))
    };

    // 2. Merge Source Refs (re-dedup existing just in case, then append new)
    let existing_refs = std::mem::take(&mut canon.source_refs);
    for r in existing_refs {
        if !canon
            .source_refs
            .iter()
            .any(|seen| is_duplicate_source_ref(seen, &r))
        {
            canon.source_refs.push(r);
        }
        if canon.source_refs.len() >= MAX_SOURCE_REFS {
            break;
        }
    }
    if canon.source_refs.len() < MAX_SOURCE_REFS {
        for r in incoming_refs {
            if !canon
                .source_refs
                .iter()
                .any(|seen| is_duplicate_source_ref(seen, r))
            {
                canon.source_refs.push(r.clone());
            }
            if canon.source_refs.len() >= MAX_SOURCE_REFS {
                break;
            }
        }
    }

    let updated_json =
        serde_json::to_string(&canon).map_err(|e| AppError::Import(e.to_string()))?;
    Ok((tags_col, updated_json))
}

/// Normalize and truncate metadata before validation/hash: tags max 100 unique sorted,
/// source_refs max 50 unique (dedup by Spec #1 logic).
fn normalize_truncate_metadata(spell: &mut CanonicalSpell) {
    // Tags: unique, alphabetically sorted, max 100
    let mut tags: Vec<String> = spell.tags.iter().cloned().collect();
    tags.sort();
    tags.dedup();
    spell.tags = tags.into_iter().take(MAX_TAGS).collect();

    // Source_refs: dedup per spec, take first 50
    let mut out = Vec::with_capacity(spell.source_refs.len().min(MAX_SOURCE_REFS));
    for r in spell.source_refs.drain(..) {
        if !out
            .iter()
            .any(|existing| is_duplicate_source_ref(existing, &r))
        {
            out.push(r);
        }
        if out.len() >= MAX_SOURCE_REFS {
            break;
        }
    }
    spell.source_refs = out;
}

/// Parse JSON payload and classify as bundle (top-level `spells` array) or single spell.
/// Bundle: requires bundle_format_version; rejects if missing or > supported; rejects if spells not array.
/// Returns flat list of CanonicalSpell (one for single, or bundle.spells for bundle).
fn parse_and_classify_payload(payload: &str) -> Result<Vec<CanonicalSpell>, AppError> {
    let value: serde_json::Value = serde_json::from_str(payload)
        .map_err(|e| AppError::Import(format!("Invalid JSON: {}", e)))?;

    let obj = value
        .as_object()
        .ok_or_else(|| AppError::Import("Payload must be a JSON object".into()))?;

    if let Some(spells_val) = obj.get("spells") {
        // Bundle: spells must be array
        let arr = spells_val.as_array().ok_or_else(|| {
            AppError::Import("Bundle format requires 'spells' to be an array".into())
        })?;
        let version = obj
            .get("bundle_format_version")
            .or(obj.get("bundleFormatVersion"));
        let version = version.ok_or_else(|| {
            AppError::Import("Bundle format requires 'bundle_format_version'".into())
        })?;
        let version = version
            .as_i64()
            .ok_or_else(|| AppError::Import("bundle_format_version must be a number".into()))?;
        if version > BUNDLE_FORMAT_VERSION {
            return Err(AppError::Import(format!(
                "Unsupported bundle_format_version {} (max supported {})",
                version, BUNDLE_FORMAT_VERSION
            )));
        }
        let mut spells = Vec::with_capacity(arr.len());
        for (i, item) in arr.iter().enumerate() {
            let spell: CanonicalSpell = serde_json::from_value(item.clone())
                .map_err(|e| AppError::Import(format!("Spell at index {}: {}", i, e)))?;
            spells.push(spell);
        }
        Ok(spells)
    } else {
        // Single spell (re-use the parsed object as Value)
        let spell: CanonicalSpell = serde_json::from_value(value)
            .map_err(|e| AppError::Import(format!("Single spell: {}", e)))?;
        Ok(vec![spell])
    }
}

/// Sanitize and validate source_ref URLs; apply policy (drop-ref or reject-spell).
/// Returns Ok(warnings) or Err(()) when policy is reject-spell and at least one URL is invalid.
fn process_source_ref_urls(
    spell: &mut CanonicalSpell,
    policy: SourceRefUrlPolicy,
    warnings: &mut Vec<String>,
) -> Result<(), ()> {
    // 1) Sanitize all URLs in place
    for r in &mut spell.source_refs {
        if let Some(u) = &r.url {
            let sanitized = sanitize_url_for_display(u);
            r.url = if sanitized.is_empty() {
                None
            } else {
                Some(sanitized)
            };
        }
    }

    // 2) Find invalid refs (have url but not allowed scheme)
    let invalid_indices: Vec<usize> = spell
        .source_refs
        .iter()
        .enumerate()
        .filter_map(|(i, r)| {
            r.url
                .as_ref()
                .filter(|u| !validate_source_ref_url(u))
                .map(|_| i)
        })
        .collect();

    if invalid_indices.is_empty() {
        return Ok(());
    }

    match policy {
        SourceRefUrlPolicy::RejectSpell => {
            let urls: Vec<String> = invalid_indices
                .iter()
                .filter_map(|&i| spell.source_refs.get(i).and_then(|r| r.url.clone()))
                .collect();
            warnings.push(format!(
                "Spell '{}': invalid SourceRef URL(s) (policy reject-spell): {}",
                spell.name,
                urls.join("; ")
            ));
            return Err(());
        }
        SourceRefUrlPolicy::DropRef => {
            // Remove invalid refs in reverse index order to preserve indices
            for &i in invalid_indices.iter().rev() {
                let dropped_url = spell.source_refs.get(i).and_then(|r| r.url.clone());
                if let Some(u) = dropped_url {
                    warnings.push(format!(
                        "Spell '{}': dropped SourceRef with invalid URL: {}",
                        spell.name, u
                    ));
                }
                spell.source_refs.remove(i);
            }
        }
    }
    Ok(())
}

/// Per-spell schema_version check: warn if > CURRENT_SCHEMA_VERSION (forward-compat), continue best-effort.
fn check_schema_version_warn(spell: &CanonicalSpell, warnings: &mut Vec<String>) {
    if spell.schema_version > CURRENT_SCHEMA_VERSION {
        let msg = format!(
            "Spell '{}' has schema_version {} (app supports up to {}); forward compatibility best-effort",
            spell.name, spell.schema_version, CURRENT_SCHEMA_VERSION
        );
        warn!("{}", msg);
        warnings.push(msg);
    }
}

/// Run normalize(), compute_hash(); if imported id/content_hash present and differs from recomputed, add tamper warning.
/// Returns (content_hash, warnings). Uses recomputed hash for all subsequent steps.
fn process_spell(spell: &mut CanonicalSpell) -> Result<(String, Vec<String>), AppError> {
    let mut warnings = Vec::new();
    check_schema_version_warn(spell, &mut warnings);

    let imported_hash: Option<String> = spell
        .id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(String::from);
    let res = spell.normalize(None);
    if res.notes_truncated {
        return Err(AppError::Import(
            "Saving throw notes truncated during migration (exceeded limit)".into(),
        ));
    }
    let hash = spell
        .compute_hash()
        .map_err(|e| AppError::Import(format!("Hash/validation: {}", e)))?;
    if let Some(prev) = &imported_hash {
        if prev.as_str() != hash {
            warnings.push(format!(
                "Spell '{}': imported id/content_hash differs from recomputed (possible tampering); using recomputed hash",
                spell.name
            ));
        }
    }
    Ok((hash, warnings))
}

#[tauri::command]
pub async fn preview_import_spell_json(
    payload: String,
    source_ref_url_policy: Option<String>,
) -> Result<PreviewImportSpellJsonResult, AppError> {
    let policy = parse_source_ref_url_policy(source_ref_url_policy.as_deref());
    let mut spells = parse_and_classify_payload(&payload)?;
    let mut global_warnings = Vec::new();
    let mut items = Vec::with_capacity(spells.len());
    let mut failures = Vec::new();
    for spell in &mut spells {
        let mut url_warnings = Vec::new();
        if process_source_ref_urls(spell, policy, &mut url_warnings).is_err() {
            let reason = url_warnings
                .last()
                .cloned()
                .unwrap_or_else(|| "Invalid SourceRef URL(s); policy reject-spell".to_string());
            global_warnings.push(reason.clone());
            failures.push(ImportSpellJsonFailure {
                spell_name: spell.name.clone(),
                reason,
            });
            continue;
        }
        global_warnings.extend(url_warnings);
        normalize_truncate_metadata(spell);
        match process_spell(spell) {
            Ok((content_hash, warnings)) => {
                items.push(PreviewSpellJsonItem {
                    spell: spell.clone(),
                    content_hash,
                    warnings,
                });
            }
            Err(e) => {
                let reason = e.to_string();
                global_warnings.push(format!("Spell '{}': {}", spell.name, reason));
                failures.push(ImportSpellJsonFailure {
                    spell_name: spell.name.clone(),
                    reason,
                });
            }
        }
    }
    Ok(PreviewImportSpellJsonResult {
        spells: items,
        warnings: global_warnings,
        failures,
    })
}

/// Build flat column values from CanonicalSpell for INSERT (name, level, description, etc.).
fn canonical_spell_to_flat_row(
    spell: &CanonicalSpell,
) -> (
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    i64,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    i64,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    i64,
    i64,
    i64,
) {
    let class_list = if spell.class_list.is_empty() {
        None
    } else {
        Some(spell.class_list.join(", "))
    };
    let tags_str = if spell.tags.is_empty() {
        None
    } else {
        Some(spell.tags.join(", "))
    };
    let range = spell
        .range
        .as_ref()
        .and_then(|r| r.text.as_deref())
        .map(String::from);
    let duration = spell
        .duration
        .as_ref()
        .and_then(|d| d.text.as_deref())
        .map(String::from);
    let casting_time = spell.casting_time.as_ref().map(|c| c.text.clone());
    let area = spell
        .area
        .as_ref()
        .and_then(|a| a.text.as_deref())
        .map(String::from);
    let damage = spell.damage.as_ref().and_then(|d| d.source_text.clone());
    let magic_resistance = spell
        .magic_resistance
        .as_ref()
        .and_then(|m| m.source_text.clone());
    let saving_throw = spell
        .saving_throw
        .as_ref()
        .and_then(|s| s.raw_legacy_value.clone());
    let source = spell.source_refs.first().map(|r| r.book.clone());
    (
        spell.name.clone(),
        spell.school.clone(),
        spell.sphere.clone(),
        class_list,
        spell.level,
        range,
        None, // components
        None, // material_components
        casting_time,
        duration,
        area,
        saving_throw,
        damage,
        magic_resistance,
        spell.reversible.unwrap_or(0),
        spell.description.clone(),
        tags_str,
        source,
        spell.edition.clone(),
        spell.author.clone(),
        spell.license.clone(),
        spell.is_quest_spell.unwrap_or(0),
        spell.is_cantrip.unwrap_or(0),
        spell.schema_version,
    )
}

/// Returns true if the table has a column with the given name (case-sensitive).
fn table_has_column(conn: &rusqlite::Connection, table: &str, column: &str) -> bool {
    let sql = format!(
        "SELECT 1 FROM pragma_table_info('{}') WHERE name = ?1",
        table.replace('\'', "''")
    );
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return false,
    };
    stmt.query_row(params![column], |_| Ok(())).is_ok()
}

/// Build change_log entries from old spell row vs incoming canonical spell (for Replace with New).
fn diff_canonical_vs_detail(
    old: &SpellDetail,
    incoming: &CanonicalSpell,
) -> Vec<(String, String, String)> {
    let class_list = if incoming.class_list.is_empty() {
        None
    } else {
        Some(incoming.class_list.join(", "))
    };
    let tags_str = if incoming.tags.is_empty() {
        None
    } else {
        Some(incoming.tags.join(", "))
    };
    let range = incoming
        .range
        .as_ref()
        .and_then(|r| r.text.as_deref())
        .map(String::from);
    let duration = incoming
        .duration
        .as_ref()
        .and_then(|d| d.text.as_deref())
        .map(String::from);
    let casting_time = incoming.casting_time.as_ref().map(|c| c.text.clone());
    let area = incoming
        .area
        .as_ref()
        .and_then(|a| a.text.as_deref())
        .map(String::from);
    let damage = incoming.damage.as_ref().and_then(|d| d.source_text.clone());
    let magic_resistance = incoming
        .magic_resistance
        .as_ref()
        .and_then(|m| m.source_text.clone());
    let saving_throw = incoming
        .saving_throw
        .as_ref()
        .and_then(|s| s.raw_legacy_value.clone());
    let source = incoming.source_refs.first().map(|r| r.book.clone());
    let rev = incoming.reversible.unwrap_or(0);
    let q = incoming.is_quest_spell.unwrap_or(0);
    let c = incoming.is_cantrip.unwrap_or(0);

    let mut changes = Vec::new();
    fn push_opt(
        changes: &mut Vec<(String, String, String)>,
        field: &str,
        old: &Option<String>,
        new: &Option<String>,
    ) {
        if old.as_deref() != new.as_deref() {
            changes.push((
                field.to_string(),
                old.as_deref().unwrap_or("").to_string(),
                new.as_deref().unwrap_or("").to_string(),
            ));
        }
    }
    if old.name != incoming.name {
        changes.push(("name".into(), old.name.clone(), incoming.name.clone()));
    }
    push_opt(&mut changes, "school", &old.school, &incoming.school);
    push_opt(&mut changes, "sphere", &old.sphere, &incoming.sphere);
    push_opt(&mut changes, "class_list", &old.class_list, &class_list);
    if old.level != incoming.level {
        changes.push((
            "level".into(),
            old.level.to_string(),
            incoming.level.to_string(),
        ));
    }
    push_opt(&mut changes, "range", &old.range, &range);
    push_opt(
        &mut changes,
        "casting_time",
        &old.casting_time,
        &casting_time,
    );
    push_opt(&mut changes, "duration", &old.duration, &duration);
    push_opt(&mut changes, "area", &old.area, &area);
    push_opt(
        &mut changes,
        "saving_throw",
        &old.saving_throw,
        &saving_throw,
    );
    push_opt(&mut changes, "damage", &old.damage, &damage);
    push_opt(
        &mut changes,
        "magic_resistance",
        &old.magic_resistance,
        &magic_resistance,
    );
    if old.reversible != Some(rev) {
        changes.push((
            "reversible".into(),
            old.reversible.map(|x| x.to_string()).unwrap_or_default(),
            rev.to_string(),
        ));
    }
    if old.description != incoming.description {
        changes.push((
            "description".into(),
            old.description.clone(),
            incoming.description.clone(),
        ));
    }
    push_opt(&mut changes, "tags", &old.tags, &tags_str);
    push_opt(&mut changes, "source", &old.source, &source);
    push_opt(&mut changes, "edition", &old.edition, &incoming.edition);
    push_opt(&mut changes, "author", &old.author, &incoming.author);
    push_opt(&mut changes, "license", &old.license, &incoming.license);
    if old.is_quest_spell != q {
        changes.push((
            "is_quest_spell".into(),
            old.is_quest_spell.to_string(),
            q.to_string(),
        ));
    }
    if old.is_cantrip != c {
        changes.push((
            "is_cantrip".into(),
            old.is_cantrip.to_string(),
            c.to_string(),
        ));
    }
    changes
}

/// Escapes SQL LIKE wildcards (% and _) in `s` so the string can be used safely in a LIKE pattern with ESCAPE '\'.
fn escape_like(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '%' => out.push_str("\\%"),
            '_' => out.push_str("\\_"),
            _ => out.push(c),
        }
    }
    out
}

/// Find a unique name for "Keep Both": base name (e.g. "Fireball"); returns "Fireball (1)" or "Fireball (2)" etc.
/// Uniqueness is name-global: all spells with `name = base` or `name LIKE 'base (%)'` are considered,
/// regardless of level, so that e.g. "Fireball (1)" at another level forces the next suffix to "(2)".
/// Considers existing DB rows and names already inserted in this batch for the same base name.
fn find_unique_name_for_keep_both(
    conn: &rusqlite::Connection,
    base_name: &str,
    batch_inserted_names: &HashSet<String>,
) -> Result<String, AppError> {
    let pattern = format!("{} (%", escape_like(base_name));
    let existing: Vec<String> = conn
        .prepare("SELECT name FROM spell WHERE name = ? OR name LIKE ? ESCAPE '\\'")?
        .query_map(params![base_name, pattern], |row| row.get(0))?
        .filter_map(Result::ok)
        .collect();
    let mut max_n = 0i64;
    for n in existing
        .iter()
        .chain(batch_inserted_names.iter())
        .filter_map(|s| {
            let s = s.trim();
            if s == base_name {
                Some(0)
            } else if s.starts_with(base_name) && s.ends_with(')') {
                let mid = s
                    .strip_prefix(base_name)?
                    .trim_start()
                    .strip_prefix('(')?
                    .trim_end_matches(')')
                    .trim();
                mid.parse::<i64>().ok().filter(|&x| x >= 1)
            } else {
                None
            }
        })
    {
        max_n = max_n.max(n);
    }
    let next = max_n + 1;
    if next == 1 {
        Ok(format!("{} (1)", base_name))
    } else {
        Ok(format!("{} ({})", base_name, next))
    }
}

/// Replace existing spell row with incoming data; cascade spell_content_hash if columns exist; log changes.
/// Fails if new content_hash already exists as a different spell. Call inside an open transaction.
/// Returns the stored content_hash (from spell's compute_hash) so callers can refresh the vault for that hash.
fn replace_with_new_impl(
    tx: &rusqlite::Connection,
    existing_id: i64,
    old_hash: Option<&str>,
    _new_hash: &str,
    item: &PreviewSpellJsonItem,
) -> Result<String, AppError> {
    if existing_id <= 0 {
        return Err(AppError::Import(
            "replace_with_new: invalid existing_id".into(),
        ));
    }
    let canonical_json = item
        .spell
        .to_canonical_json()
        .map_err(|e| AppError::Import(e))?;
    let stored_hash = item
        .spell
        .compute_hash()
        .map_err(|e| AppError::Import(e))?;
    let conflicting_row: Option<(i64, String)> = tx
        .query_row(
            "SELECT id, name FROM spell WHERE content_hash = ? AND id != ?",
            params![&stored_hash, existing_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    if let Some((conflicting_id, conflicting_name)) = conflicting_row {
        return Err(AppError::Import(format!(
            "Replace with New failed: incoming content hash '{}' already exists on spell '{}' (id {}). This imported version already exists. Choose Keep Existing to keep the current spell, or Keep Both to import it as a separate copy.",
            stored_hash, conflicting_name, conflicting_id
        )));
    }
    let old_spell = get_spell_from_conn(tx, existing_id)?
        .ok_or_else(|| AppError::Import("replace_with_new: existing spell not found".into()))?;
    let changes = diff_canonical_vs_detail(&old_spell, &item.spell);
    let (
        name_f,
        school,
        sphere,
        class_list,
        level_f,
        range,
        _c,
        _mc,
        casting_time,
        duration,
        area,
        saving_throw,
        damage,
        magic_resistance,
        reversible,
        description,
        tags_str,
        source,
        edition,
        author,
        license,
        is_quest_spell,
        is_cantrip,
        schema_version,
    ) = canonical_spell_to_flat_row(&item.spell);

    tx.execute(
        "UPDATE spell SET name=?, school=?, sphere=?, class_list=?, level=?, range=?,
         components=?, material_components=?, casting_time=?, duration=?, area=?,
         saving_throw=?, damage=?, magic_resistance=?, reversible=?, description=?,
         tags=?, source=?, edition=?, author=?, license=?, is_quest_spell=?, is_cantrip=?,
         updated_at=?, canonical_data=?, content_hash=?, schema_version=? WHERE id=?",
        params![
            name_f,
            school,
            sphere,
            class_list,
            level_f,
            range,
            None::<String>,
            None::<String>,
            casting_time,
            duration,
            area,
            saving_throw,
            damage,
            magic_resistance,
            reversible,
            description,
            tags_str,
            source,
            edition,
            author,
            license,
            is_quest_spell,
            is_cantrip,
            Utc::now().to_rfc3339(),
            canonical_json,
            &stored_hash,
            schema_version,
            existing_id,
        ],
    )?;

    if let Some(old_h) = old_hash {
        if table_has_column(&*tx, "character_class_spell", "spell_content_hash") {
            let n = tx.execute(
                "UPDATE character_class_spell SET spell_content_hash = ? WHERE spell_content_hash = ?",
                params![&stored_hash, old_h],
            )?;
            if n > 0 {
                // optional: log if we want
            }
        }
        if table_has_column(&*tx, "artifact", "spell_content_hash") {
            let _ = tx.execute(
                "UPDATE artifact SET spell_content_hash = ? WHERE spell_content_hash = ?",
                params![&stored_hash, old_h],
            )?;
        }
    }
    log_changes(tx, existing_id, changes)?;
    Ok(stored_hash)
}

/// Resolve action for one conflict: from resolution list or default_action.
fn resolve_action_for_conflict(
    existing_id: i64,
    incoming_content_hash: &str,
    resolutions: &[ImportSpellJsonConflictResolution],
    default_action: Option<&str>,
) -> Option<String> {
    let action = resolutions
        .iter()
        .find(|r| r.existing_id == existing_id && r.incoming_content_hash == incoming_content_hash)
        .map(|r| r.action.clone());
    if let Some(a) = action {
        return Some(a);
    }
    match default_action {
        Some("skip_all") => Some("keep_existing".to_string()),
        Some("replace_all") => Some("replace_with_new".to_string()),
        Some("keep_all") => Some("keep_both".to_string()),
        _ => None,
    }
}

/// Apply phase: process preview items in document order; dedup by hash, conflict by name, insert or merge.
/// When resolve_options is Some, conflicts are resolved using per-conflict resolutions or default_action (skip_all/replace_all/keep_all).
fn apply_import_spell_json_impl(
    conn: &rusqlite::Connection,
    items: Vec<PreviewSpellJsonItem>,
    resolve_options: Option<ImportSpellJsonResolveOptions>,
) -> Result<ImportSpellJsonResult, AppError> {
    let mut imported_count = 0usize;
    let mut merged_count = 0usize;
    let mut no_change_count = 0usize;
    let mut conflicts = Vec::<ImportSpellJsonConflict>::new();
    let mut conflicts_resolved = ConflictsResolved::default();
    let mut failures = Vec::<ImportSpellJsonFailure>::new();
    let mut imported_spells = Vec::<SpellDetail>::new();
    let warnings = Vec::<String>::new();

    let resolutions = resolve_options
        .as_ref()
        .map(|o| o.resolutions.as_slice())
        .unwrap_or(&[]);
    let default_action = resolve_options
        .as_ref()
        .and_then(|o| o.default_action.as_deref());

    // Intra-bundle dedup: first occurrence of a hash gets id; later same hash only merge.
    let mut seen_hash_in_batch: HashMap<String, i64> = HashMap::new();
    // For Keep Both: track names we insert in this batch (base name or "Name (N)") so we pick unique N.
    let mut keep_both_names: HashSet<String> = HashSet::new();
    let mut vault_hashes_to_refresh: HashSet<String> = HashSet::new();

    let mut tx = conn.unchecked_transaction().map_err(AppError::Database)?;

    for item in items {
        let content_hash = item.content_hash.clone();
        let name = item.spell.name.clone();

        let res = (|| -> Result<(), AppError> {
            let sp = tx.savepoint().map_err(AppError::Database)?;

            // 1) Already seen this hash in this batch → merge into that row only (no new insert).
            if let Some(&spell_id) = seen_hash_in_batch.get(&content_hash) {
                let (tags_str, canonical_json): (Option<String>, String) = sp.query_row(
                    "SELECT tags, canonical_data FROM spell WHERE id = ?",
                    params![spell_id],
                    |row| Ok((row.get(0)?, row.get::<_, String>(1)?)),
                )?;
                let (merged_tags, merged_canonical) = merge_canonical_metadata(
                    &canonical_json,
                    &item.spell.tags,
                    &item.spell.source_refs,
                )?;

                let tags_equal = tags_str.as_deref() == merged_tags.as_deref()
                    || (tags_str.is_none() && merged_tags.is_none());
                let canon_unchanged = canonical_json == merged_canonical;
                if tags_equal && canon_unchanged {
                    no_change_count += 1;
                } else {
                    sp.execute(
                        "UPDATE spell SET tags = ?, canonical_data = ?, updated_at = ? WHERE id = ?",
                        params![merged_tags, merged_canonical, Utc::now().to_rfc3339(), spell_id],
                    )?;
                    merged_count += 1;
                    // Skip vault refresh: merged_canonical may not be canonical form; vault file stays as-is until next save.
                }
                sp.commit().map_err(AppError::Database)?;
                return Ok(());
            }

            // 2) Lookup by content_hash (parameterized).
            let existing_by_hash: Option<(i64, Option<String>, String)> = sp
                .query_row(
                    "SELECT id, tags, canonical_data FROM spell WHERE content_hash = ?",
                    params![content_hash],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()?;

            // If a resolution targets a different row with replace_with_new, do not merge here;
            // fall through to by-name so replace_with_new_impl runs and can fail (e.g. hash on another row).
            let skip_merge_for_replace_resolution = existing_by_hash.as_ref().map_or(false, |(spell_id, _, _)| {
                resolve_options.as_ref().map_or(false, |o| {
                    o.resolutions.iter().any(|r| {
                        r.action == "replace_with_new"
                            && r.incoming_content_hash == content_hash
                            && r.existing_id != *spell_id
                    })
                })
            });

            if let Some((spell_id, tags_str, canonical_json)) = existing_by_hash {
                if skip_merge_for_replace_resolution {
                    // Fall through to by-name branch so replace is attempted and can fail.
                } else {
                    seen_hash_in_batch.insert(content_hash.clone(), spell_id);
                    let (merged_tags, merged_canonical) = merge_canonical_metadata(
                    &canonical_json,
                    &item.spell.tags,
                    &item.spell.source_refs,
                )?;

                let tags_equal = tags_str.as_deref() == merged_tags.as_deref()
                    || (tags_str.is_none() && merged_tags.is_none());
                let canon_unchanged = canonical_json == merged_canonical;
                if tags_equal && canon_unchanged {
                    no_change_count += 1;
                } else {
                    sp.execute(
                        "UPDATE spell SET tags = ?, canonical_data = ?, updated_at = ? WHERE id = ?",
                        params![merged_tags, merged_canonical, Utc::now().to_rfc3339(), spell_id],
                    )?;
                    merged_count += 1;
                    // Skip vault refresh: merged_canonical may not be canonical form; vault file stays as-is until next save.
                }
                sp.commit().map_err(AppError::Database)?;
                return Ok(());
                }
            }

            // 3) Hash not found: check name-only for conflict (deterministic row selection).
            let existing_by_name: Option<(i64, Option<String>)> = sp
                .query_row(
                    "SELECT id, content_hash FROM spell WHERE name = ? ORDER BY id ASC LIMIT 1",
                    params![name],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?;

            if let Some((existing_id, existing_hash)) = existing_by_name {
                if existing_hash.as_deref() != Some(content_hash.as_str()) {
                    let action = resolve_action_for_conflict(
                        existing_id,
                        &content_hash,
                        resolutions,
                        default_action,
                    );
                    if let Some(act) = action {
                        match act.as_str() {
                            "keep_existing" => {
                                conflicts_resolved.keep_existing_count += 1;
                            }
                            "replace_with_new" => {
                                let old_h = existing_hash.as_deref();
                                let stored_hash = replace_with_new_impl(
                                    &sp,
                                    existing_id,
                                    old_h,
                                    &content_hash,
                                    &item,
                                )?;
                                seen_hash_in_batch.insert(stored_hash.clone(), existing_id);
                                conflicts_resolved.replace_count += 1;
                                vault_hashes_to_refresh.insert(stored_hash);
                                migration_manager::sync_check_spell(&sp, existing_id);
                                if let Ok(Some(detail)) = get_spell_from_conn(&sp, existing_id) {
                                    imported_spells.push(detail);
                                }
                            }
                            "keep_both" => {
                                let unique_name = find_unique_name_for_keep_both(
                                    &sp,
                                    &name,
                                    &keep_both_names,
                                )?;
                                keep_both_names.insert(unique_name.clone());
                                let mut spell_clone = item.spell.clone();
                                spell_clone.name = unique_name;
                                let canon_json = spell_clone
                                    .to_canonical_json()
                                    .map_err(|e| AppError::Import(e))?;
                                let keep_both_hash = spell_clone
                                    .compute_hash()
                                    .map_err(|e| AppError::Import(e))?;
                                let row = canonical_spell_to_flat_row(&spell_clone);
                                sp.execute(
                                    "INSERT INTO spell (name, school, sphere, class_list, level, range, components,
                                     material_components, casting_time, duration, area, saving_throw, damage,
                                     magic_resistance, reversible, description, tags, source, edition, author,
                                     license, is_quest_spell, is_cantrip, canonical_data, content_hash,
                                     schema_version)
                                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                    params![
                                        row.0, row.1, row.2, row.3, row.4, row.5, row.6, row.7,
                                        row.8, row.9, row.10, row.11, row.12, row.13, row.14,
                                        row.15, row.16, row.17, row.18, row.19, row.20, row.21,
                                        row.22, canon_json, &keep_both_hash, row.23,
                                    ],
                                )?;
                                let new_id = sp.last_insert_rowid();
                                seen_hash_in_batch.insert(keep_both_hash.clone(), new_id);
                                conflicts_resolved.keep_both_count += 1;
                                imported_count += 1;
                                vault_hashes_to_refresh.insert(keep_both_hash);
                                migration_manager::sync_check_spell(&sp, new_id);
                                if let Ok(Some(detail)) = get_spell_from_conn(&sp, new_id) {
                                    imported_spells.push(detail);
                                }
                            }
                            _ => {
                                conflicts.push(ImportSpellJsonConflict {
                                    existing_id,
                                    existing_name: name.clone(),
                                    existing_content_hash: existing_hash.clone(),
                                    incoming_name: name.clone(),
                                    incoming_content_hash: content_hash,
                                });
                            }
                        }
                    } else {
                        conflicts.push(ImportSpellJsonConflict {
                            existing_id,
                            existing_name: name.clone(),
                            existing_content_hash: existing_hash.clone(),
                            incoming_name: name.clone(),
                            incoming_content_hash: content_hash,
                        });
                    }
                    sp.commit().map_err(AppError::Database)?;
                    return Ok(());
                }
            }

            // 4) New spell: INSERT. Use canonical JSON and computed hash so vault export verifies.
            let canon_json = item
                .spell
                .to_canonical_json()
                .map_err(|e| AppError::Import(e))?;
            let stored_hash = item
                .spell
                .compute_hash()
                .map_err(|e| AppError::Import(e))?;
            let row = canonical_spell_to_flat_row(&item.spell);
            sp.execute(
                "INSERT INTO spell (name, school, sphere, class_list, level, range, components,
                 material_components, casting_time, duration, area, saving_throw, damage,
                 magic_resistance, reversible, description, tags, source, edition, author,
                 license, is_quest_spell, is_cantrip, canonical_data, content_hash,
                 schema_version)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    row.0, row.1, row.2, row.3, row.4, row.5, row.6, row.7,
                    row.8, row.9, row.10, row.11, row.12, row.13, row.14,
                    row.15, row.16, row.17, row.18, row.19, row.20, row.21,
                    row.22, canon_json, &stored_hash, row.23,
                ],
            )?;
            let new_id = sp.last_insert_rowid();
            seen_hash_in_batch.insert(stored_hash.clone(), new_id);
            imported_count += 1;
            vault_hashes_to_refresh.insert(stored_hash);

            migration_manager::sync_check_spell(&sp, new_id);

            let detail = get_spell_from_conn(&sp, new_id)?.unwrap_or_else(|| SpellDetail {
                id: Some(new_id),
                name: item.spell.name.clone(),
                level: item.spell.level,
                description: item.spell.description.clone(),
                ..Default::default()
            });
            imported_spells.push(detail);
            sp.commit().map_err(AppError::Database)?;
            Ok(())
        })();

        if let Err(e) = res {
            failures.push(ImportSpellJsonFailure {
                spell_name: item.spell.name.clone(),
                reason: e.to_string(),
            });
        }
    }

    tx.commit().map_err(AppError::Database)?;
    for content_hash in &vault_hashes_to_refresh {
        export_spell_to_vault_by_hash(conn, content_hash)?;
    }

    Ok(ImportSpellJsonResult {
        imported_count,
        imported_spells,
        duplicates_skipped: DuplicatesSkipped {
            total: merged_count + no_change_count,
            merged_count,
            no_change_count,
        },
        conflicts,
        conflicts_resolved: if conflicts_resolved.keep_existing_count
            + conflicts_resolved.replace_count
            + conflicts_resolved.keep_both_count
            > 0
        {
            Some(conflicts_resolved)
        } else {
            None
        },
        failures,
        warnings,
    })
}

fn apply_import_spell_json_with_maintenance(
    conn: &rusqlite::Connection,
    root: &std::path::Path,
    maintenance_state: &VaultMaintenanceState,
    items: Vec<PreviewSpellJsonItem>,
    resolve_options: Option<ImportSpellJsonResolveOptions>,
) -> Result<ImportSpellJsonResult, AppError> {
    let _import_guard = maintenance_state.start_import()?;
    let result = apply_import_spell_json_impl(conn, items, resolve_options)?;
    if result.imported_count > 0 {
        let _ = optimize_vault_with_root(conn, root, None)?;
    }
    Ok(result)
}

#[tauri::command]
pub async fn import_spell_json(
    state: State<'_, Arc<Pool>>,
    maintenance_state: State<'_, Arc<VaultMaintenanceState>>,
    payload: String,
    source_ref_url_policy: Option<String>,
) -> Result<ImportSpellJsonResult, AppError> {
    let preview = preview_import_spell_json(payload, source_ref_url_policy).await?;
    if preview.spells.is_empty() && preview.failures.is_empty() {
        return Ok(ImportSpellJsonResult {
            imported_count: 0,
            imported_spells: vec![],
            duplicates_skipped: DuplicatesSkipped::default(),
            conflicts: vec![],
            conflicts_resolved: None,
            failures: preview.failures,
            warnings: preview.warnings,
        });
    }

    let pool = state.inner().clone();
    let maintenance_state = maintenance_state.inner().clone();
    let items = preview.spells;
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let root = app_data_dir()?;
        apply_import_spell_json_with_maintenance(
            &conn,
            &root,
            maintenance_state.as_ref(),
            items,
            None,
        )
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    let mut out = result;
    out.failures.extend(preview.failures);
    out.warnings.extend(preview.warnings);
    Ok(out)
}

/// Resolve JSON import conflicts: same payload as import_spell_json, plus resolutions and optional default_action.
/// Runs preview then apply with the given resolve options (per-conflict resolutions and/or skip_all/replace_all/keep_all).
#[tauri::command]
pub async fn resolve_import_spell_json(
    state: State<'_, Arc<Pool>>,
    maintenance_state: State<'_, Arc<VaultMaintenanceState>>,
    payload: String,
    resolve_options: ImportSpellJsonResolveOptions,
    source_ref_url_policy: Option<String>,
) -> Result<ImportSpellJsonResult, AppError> {
    let preview = preview_import_spell_json(payload, source_ref_url_policy).await?;
    if preview.spells.is_empty() && preview.failures.is_empty() {
        return Ok(ImportSpellJsonResult {
            imported_count: 0,
            imported_spells: vec![],
            duplicates_skipped: DuplicatesSkipped::default(),
            conflicts: vec![],
            conflicts_resolved: None,
            failures: preview.failures,
            warnings: preview.warnings,
        });
    }

    let pool = state.inner().clone();
    let maintenance_state = maintenance_state.inner().clone();
    let items = preview.spells;
    let options = resolve_options;
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let root = app_data_dir()?;
        apply_import_spell_json_with_maintenance(
            &conn,
            &root,
            maintenance_state.as_ref(),
            items,
            Some(options),
        )
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    let mut out = result;
    out.failures.extend(preview.failures);
    out.warnings.extend(preview.warnings);
    Ok(out)
}

fn normalize_key(path: &str) -> String {
    path.to_lowercase().replace('\\', "/")
}

fn app_data_dir() -> Result<PathBuf, AppError> {
    if let Ok(override_dir) = std::env::var("SPELLBOOK_DATA_DIR") {
        let dir = PathBuf::from(override_dir);
        fs::create_dir_all(&dir)?;
        return Ok(dir);
    }
    let dir = system_data_dir()
        .ok_or_else(|| AppError::Unknown("no data dir".to_string()))?
        .join("SpellbookVault");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn sanitize_import_filename(name: &str) -> (String, bool) {
    let re = Regex::new(r"[^a-zA-Z0-9._-]").expect("static regex");
    let sanitized = re.replace_all(name, "_").to_string();
    let changed = sanitized != name;
    (sanitized, changed)
}

fn build_conflict_fields(
    existing: &SpellDetail,
    incoming: &ImportSpell,
) -> Vec<ImportConflictField> {
    fn push_conflict(
        fields: &mut Vec<ImportConflictField>,
        field: &str,
        existing: Option<String>,
        incoming: Option<String>,
    ) {
        if existing != incoming {
            fields.push(ImportConflictField {
                field: field.to_string(),
                existing,
                incoming,
            });
        }
    }

    let mut fields = Vec::new();

    push_conflict(
        &mut fields,
        "name",
        Some(existing.name.clone()),
        Some(incoming.name.clone()),
    );
    push_conflict(
        &mut fields,
        "school",
        existing.school.clone(),
        incoming.school.clone(),
    );
    push_conflict(
        &mut fields,
        "sphere",
        existing.sphere.clone(),
        incoming.sphere.clone(),
    );
    push_conflict(
        &mut fields,
        "class_list",
        existing.class_list.clone(),
        incoming.class_list.clone(),
    );
    push_conflict(
        &mut fields,
        "level",
        Some(existing.level.to_string()),
        Some(incoming.level.to_string()),
    );
    push_conflict(
        &mut fields,
        "range",
        existing.range.clone(),
        incoming.range.clone(),
    );
    push_conflict(
        &mut fields,
        "components",
        existing.components.clone(),
        incoming.components.clone(),
    );
    push_conflict(
        &mut fields,
        "material_components",
        existing.material_components.clone(),
        incoming.material_components.clone(),
    );
    push_conflict(
        &mut fields,
        "casting_time",
        existing.casting_time.clone(),
        incoming.casting_time.clone(),
    );
    push_conflict(
        &mut fields,
        "duration",
        existing.duration.clone(),
        incoming.duration.clone(),
    );
    push_conflict(
        &mut fields,
        "area",
        existing.area.clone(),
        incoming.area.clone(),
    );
    push_conflict(
        &mut fields,
        "saving_throw",
        existing.saving_throw.clone(),
        incoming.saving_throw.clone(),
    );
    push_conflict(
        &mut fields,
        "reversible",
        existing.reversible.map(|v| v.to_string()),
        incoming.reversible.map(|v| v.to_string()),
    );
    push_conflict(
        &mut fields,
        "description",
        Some(existing.description.clone()),
        Some(incoming.description.clone()),
    );
    push_conflict(
        &mut fields,
        "tags",
        existing.tags.clone(),
        incoming.tags.clone(),
    );
    push_conflict(
        &mut fields,
        "source",
        existing.source.clone(),
        incoming.source.clone(),
    );
    push_conflict(
        &mut fields,
        "edition",
        existing.edition.clone(),
        incoming.edition.clone(),
    );
    push_conflict(
        &mut fields,
        "author",
        existing.author.clone(),
        incoming.author.clone(),
    );
    push_conflict(
        &mut fields,
        "license",
        existing.license.clone(),
        incoming.license.clone(),
    );
    push_conflict(
        &mut fields,
        "is_cantrip",
        Some(existing.is_cantrip.to_string()),
        Some(incoming.is_cantrip.to_string()),
    );

    fields
}

#[tauri::command]
pub async fn preview_import(files: Vec<ImportFile>) -> Result<PreviewResult, AppError> {
    let dir = app_data_dir()?.join("imports");
    fs::create_dir_all(&dir)?;

    let mut paths = vec![];
    let mut seen_names = HashMap::new();
    for file in files {
        let (safe_name, _) = sanitize_import_filename(&file.name);
        if let Some(original) = seen_names.get(&safe_name) {
            return Err(AppError::Validation(format!(
                "Filename collision: '{}' and '{}' both sanitize to '{}'",
                original, file.name, safe_name
            )));
        }
        seen_names.insert(safe_name.clone(), file.name.clone());

        let path = dir.join(&safe_name);
        fs::write(&path, &file.content)?;
        paths.push(path);
    }

    let result = call_sidecar("import", json!({"files": paths})).await?;

    let spells: Vec<PreviewSpell> =
        serde_json::from_value(result.get("spells").cloned().unwrap_or(json!([])))
            .map_err(|e| AppError::Sidecar(format!("Failed to parse preview spells: {}", e)))?;

    let artifacts: Vec<ImportArtifact> =
        serde_json::from_value(result.get("artifacts").cloned().unwrap_or(json!([])))
            .map_err(|e| AppError::Sidecar(format!("Failed to parse preview artifacts: {}", e)))?;

    let parse_conflicts: Vec<ParseConflict> =
        serde_json::from_value(result.get("conflicts").cloned().unwrap_or(json!([])))
            .map_err(|e| AppError::Sidecar(format!("Failed to parse preview conflicts: {}", e)))?;

    let conflicts = parse_conflicts
        .into_iter()
        .map(|conflict| ImportConflict::Parse {
            path: conflict.path,
            reason: conflict.reason,
        })
        .collect();

    Ok(PreviewResult {
        spells,
        artifacts,
        conflicts,
    })
}

#[tauri::command]
pub async fn import_files(
    state: State<'_, Arc<Pool>>,
    files: Vec<ImportFile>,
    allow_overwrite: bool,
    spells: Option<Vec<ImportSpell>>,
    artifacts: Option<Vec<ImportArtifact>>,
    conflicts: Option<Vec<ImportConflict>>,
) -> Result<ImportResult, AppError> {
    let dir = app_data_dir()?.join("imports");
    fs::create_dir_all(&dir)?;

    // BATCH SIZE CONFIGURATION
    const BATCH_SIZE: usize = 10;

    let mut all_imported_spells = vec![];
    let mut all_artifacts = vec![];
    let mut all_conflicts = vec![];
    let mut all_warnings = vec![];
    let mut all_skipped = vec![];

    // Pre-save all files to disk (keep this fast and simple)
    let mut file_paths_map = HashMap::new();
    let mut seen_names = HashMap::new();

    for file in &files {
        let (safe_name, changed) = sanitize_import_filename(&file.name);

        if let Some(original) = seen_names.get(&safe_name) {
            return Err(AppError::Validation(format!(
                "Filename collision: '{}' and '{}' both sanitize to '{}'",
                original, file.name, safe_name
            )));
        }
        seen_names.insert(safe_name.clone(), file.name.clone());

        if changed {
            all_warnings.push(format!(
                "Sanitized import file name '{}' to '{}'.",
                file.name, safe_name
            ));
        }
        let path = dir.join(&safe_name);
        fs::write(&path, &file.content)?;
        file_paths_map.insert(file.name.clone(), path);
    }

    // Branch Process:
    // 1. Initial Import (needs_parsing=true): Chunk files -> Sidecar -> DB
    // 2. Confirmation (needs_parsing=false): Chunk spells (overrides) -> DB

    let needs_parsing = spells.is_none();

    if needs_parsing {
        // --- PATH A: INITIAL IMPORT (Sidecar -> DB) ---
        for chunk in files.chunks(BATCH_SIZE) {
            let chunk_paths: Vec<PathBuf> = chunk
                .iter()
                .filter_map(|f| file_paths_map.get(&f.name).cloned())
                .collect();

            if chunk_paths.is_empty() {
                continue;
            }

            let result = call_sidecar("import", json!({"files": chunk_paths})).await?;

            // Parse Sidecar Result
            let parsed_spells: Vec<ImportSpell> =
                serde_json::from_value(result.get("spells").cloned().unwrap_or(json!([])))
                    .map_err(|e| AppError::Sidecar(format!("Failed to parse spells: {}", e)))?;
            let parsed_artifacts: Vec<ImportArtifact> =
                serde_json::from_value(result.get("artifacts").cloned().unwrap_or(json!([])))
                    .map_err(|e| AppError::Sidecar(format!("Failed to parse artifacts: {}", e)))?;
            let parsed_conflicts_raw: Vec<ParseConflict> =
                serde_json::from_value(result.get("conflicts").cloned().unwrap_or(json!([])))
                    .map_err(|e| AppError::Sidecar(format!("Failed to parse conflicts: {}", e)))?;

            let batch_conflicts: Vec<ImportConflict> = parsed_conflicts_raw
                .into_iter()
                .map(|c| ImportConflict::Parse {
                    path: c.path,
                    reason: c.reason,
                })
                .collect();

            // DB Transaction
            let pool = state.inner().clone();
            let allow_overwrite_clone = allow_overwrite;

            let result = tokio::task::spawn_blocking(move || {
                let conn = pool.get()?;
                let mut local_skipped = vec![];
                let mut local_imported = vec![];
                let mut artifacts_by_path = HashMap::new();

                for artifact in &parsed_artifacts {
                    artifacts_by_path.insert(normalize_key(&artifact.path), artifact.clone());
                }

                let spell_sources: Vec<Option<String>> = parsed_artifacts
                    .iter()
                    .map(|artifact| Some(normalize_key(&artifact.path)))
                    .collect();

                let mut local_conflicts = batch_conflicts;

                for (i, spell) in parsed_spells.iter().enumerate() {

                    let detail = SpellDetail {
                        id: None,
                        name: spell.name.clone(),
                        school: spell.school.clone(),
                        sphere: spell.sphere.clone(),
                        class_list: spell.class_list.clone(),
                        level: spell.level,
                        range: spell.range.clone(),
                        components: spell.components.clone(),
                        material_components: spell.material_components.clone(),
                        casting_time: spell.casting_time.clone(),
                        duration: spell.duration.clone(),
                        area: spell.area.clone(),
                        saving_throw: spell.saving_throw.clone(),
                        damage: spell.damage.clone(),
                        magic_resistance: spell.magic_resistance.clone(),
                        reversible: spell.reversible,
                        description: spell.description.clone(),
                        tags: spell.tags.clone(),
                        source: spell.source.clone(),
                        edition: spell.edition.clone(),
                        author: spell.author.clone(),
                        license: spell.license.clone(),
                        is_quest_spell: spell.is_quest_spell,
                        is_cantrip: spell.is_cantrip,
                        schema_version: spell.schema_version,
                        artifacts: None,
                        canonical_data: None,
                        content_hash: None,
                        ..Default::default()
                    };
                    let (canonical, hash, json) = canonicalize_spell_detail(detail.clone())?;

                    let existing_id: Option<i64> = conn.query_row(
                        "SELECT id FROM spell WHERE name = ? AND level = ? AND source IS ?",
                        params![spell.name, spell.level, spell.source],
                        |row| row.get(0),
                    ).optional()?;

                    let spell_id = if let Some(id) = existing_id {
                        if !allow_overwrite_clone {
                            let existing_spell = get_spell_from_conn(&conn, id)?
                                .ok_or_else(|| AppError::NotFound("Failed to fetch existing spell".into()))?;

                            let source_path = spell.source_file.clone();
                            let artifact_opt = source_path
                                .as_ref()
                                .map(|p| normalize_key(p))
                                .and_then(|p| artifacts_by_path.get(&p).cloned())
                                .or_else(|| {
                                     spell_sources.get(i).and_then(|s| s.as_ref()).and_then(|p| artifacts_by_path.get(p).cloned())
                                });

                            let fields = build_conflict_fields(&existing_spell, spell);
                            if fields.is_empty() {
                                local_skipped.push(spell.name.clone());
                            } else {
                                local_conflicts.push(ImportConflict::Spell {
                                    existing: Box::new(existing_spell),
                                    incoming: Box::new(detail),
                                    fields,
                                    artifact: artifact_opt,
                                });
                            }
                            continue;
                        }

                        conn.execute(
                            "UPDATE spell SET name=?, level=?, source=?, school=?, sphere=?, class_list=?, range=?, components=?,
                            material_components=?, casting_time=?, duration=?, area=?, saving_throw=?,
                            damage=?, magic_resistance=?, reversible=?, description=?, tags=?, edition=?, author=?, license=?,
                            is_quest_spell=?, is_cantrip=?, updated_at=?,
                            canonical_data=?, content_hash=?, schema_version=? WHERE id=?",
                            params![
                                spell.name, spell.level, spell.source,
                                spell.school, spell.sphere, spell.class_list, spell.range, spell.components,
                                spell.material_components, spell.casting_time, spell.duration, spell.area, spell.saving_throw,
                                spell.damage, spell.magic_resistance,
                                spell.reversible.unwrap_or(0), spell.description, spell.tags, spell.edition, spell.author, spell.license,
                                spell.is_quest_spell, spell.is_cantrip, Utc::now().to_rfc3339(),
                                json, hash, canonical.schema_version, id
                            ],
                        )?;
                        id
                    } else {
                        conn.execute(
                            "INSERT INTO spell (name, school, sphere, class_list, level, range, components,
                            material_components, casting_time, duration, area, saving_throw, damage,
                            magic_resistance, reversible, description, tags, source, edition, author,
                            license, is_quest_spell, is_cantrip, canonical_data, content_hash,
                            schema_version)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            params![
                                spell.name, spell.school, spell.sphere, spell.class_list, spell.level, spell.range, spell.components,
                                spell.material_components, spell.casting_time, spell.duration, spell.area, spell.saving_throw,
                                spell.damage, spell.magic_resistance,
                                spell.reversible.unwrap_or(0),
                                spell.description, spell.tags, spell.source, spell.edition, spell.author, spell.license, spell.is_quest_spell, spell.is_cantrip,
                                json, hash, canonical.schema_version
                            ],
                        )?;
                        conn.last_insert_rowid()
                    };

                    migration_manager::sync_check_spell(&conn, spell_id);
                    local_imported.push(SpellDetail {
                        id: Some(spell_id),
                        name: spell.name.clone(),
                        school: spell.school.clone(),
                        level: spell.level,
                        description: spell.description.clone(),
                        source: spell.source.clone(),
                        sphere: spell.sphere.clone(), class_list: spell.class_list.clone(), range: spell.range.clone(), components: spell.components.clone(),
                        material_components: spell.material_components.clone(), casting_time: spell.casting_time.clone(), duration: spell.duration.clone(),
                        area: spell.area.clone(), saving_throw: spell.saving_throw.clone(),
                        damage: spell.damage.clone(),
                        magic_resistance: spell.magic_resistance.clone(),
                        reversible: spell.reversible, tags: spell.tags.clone(),
                        edition: spell.edition.clone(), author: spell.author.clone(), license: spell.license.clone(), is_quest_spell: spell.is_quest_spell,
                        is_cantrip: spell.is_cantrip,
                        schema_version: spell.schema_version,
                        artifacts: None,
                        canonical_data: None,
                        content_hash: None,
                        ..Default::default()
                    });

                     let source_path = spell.source_file.clone();
                     let artifact_val = source_path
                        .as_ref()
                        .map(|p| normalize_key(p))
                        .and_then(|p| artifacts_by_path.get(&p))
                        .or_else(|| artifacts_by_path.get(&spell_sources.get(i).cloned().flatten().unwrap_or_default()));

                    if let Some(artifact_val) = artifact_val {
                        let _ = conn.execute(
                            "INSERT INTO artifact (spell_id, type, path, hash, imported_at) VALUES (?, ?, ?, ?, ?)
                            ON CONFLICT(spell_id, path) WHERE spell_id IS NOT NULL DO UPDATE SET hash=excluded.hash, imported_at=excluded.imported_at",
                            params![spell_id, artifact_val.r#type, artifact_val.path, artifact_val.hash, artifact_val.imported_at],
                        );
                    }

                }

                Ok::<ImportResult, AppError>(ImportResult {
                    spells: local_imported,
                    artifacts: serde_json::to_value(&parsed_artifacts).unwrap_or_default().as_array().cloned().unwrap_or_default(),
                    conflicts: local_conflicts,
                    warnings: vec![],
                    skipped: local_skipped
                })
            }).await.map_err(|e| AppError::Unknown(e.to_string()))??;

            all_imported_spells.extend(result.spells);
            all_conflicts.extend(result.conflicts);
            all_skipped.extend(result.skipped);
            all_artifacts.extend(result.artifacts);
        }
    } else {
        // --- PATH B: CONFIRMATION (Offsets provided) ---
        let override_spells = spells.unwrap();
        let override_artifacts = artifacts.unwrap_or_default();
        let override_conflicts = conflicts.unwrap_or_default();

        // Lookup Setup
        let mut artifacts_by_path = HashMap::new();
        for artifact in &override_artifacts {
            artifacts_by_path.insert(normalize_key(&artifact.path), artifact.clone());
        }

        all_conflicts = override_conflicts;

        // Batch the spells
        for chunk in override_spells.chunks(BATCH_SIZE) {
            let pool = state.inner().clone();
            let chunk_spells = chunk.to_vec();
            let allow_overwrite_clone = allow_overwrite;
            let artifacts_map_clone = artifacts_by_path.clone();

            let result = tokio::task::spawn_blocking(move || {
                let conn = pool.get()?;
                let mut local_imported = vec![];
                let mut local_skipped = vec![];
                let mut local_conflicts = vec![];

                for spell in chunk_spells {
                    let detail = SpellDetail {
                        id: None,
                        name: spell.name.clone(),
                        school: spell.school.clone(),
                        sphere: spell.sphere.clone(),
                        class_list: spell.class_list.clone(),
                        level: spell.level,
                        range: spell.range.clone(),
                        components: spell.components.clone(),
                        material_components: spell.material_components.clone(),
                        casting_time: spell.casting_time.clone(),
                        duration: spell.duration.clone(),
                        area: spell.area.clone(),
                        saving_throw: spell.saving_throw.clone(),
                        damage: spell.damage.clone(),
                        magic_resistance: spell.magic_resistance.clone(),
                        reversible: spell.reversible,
                        description: spell.description.clone(),
                        tags: spell.tags.clone(),
                        source: spell.source.clone(),
                        edition: spell.edition.clone(),
                        author: spell.author.clone(),
                        license: spell.license.clone(),
                        is_quest_spell: spell.is_quest_spell,
                        is_cantrip: spell.is_cantrip,
                        schema_version: spell.schema_version,
                        artifacts: None,
                        canonical_data: None,
                        content_hash: None,
                        ..Default::default()
                    };
                    let (canonical, hash, json) = canonicalize_spell_detail(detail.clone())?;

                     let existing_id: Option<i64> = conn.query_row(
                        "SELECT id FROM spell WHERE name = ? AND level = ? AND source IS ?",
                        params![spell.name, spell.level, spell.source],
                        |row| row.get(0),
                    ).optional()?;

                    let spell_id = if let Some(id) = existing_id {
                         if !allow_overwrite_clone {
                             let existing_spell = get_spell_from_conn(&conn, id)?.ok_or_else(|| AppError::NotFound("Ex".into()))?;
                             let fields = build_conflict_fields(&existing_spell, &spell);
                             if fields.is_empty() {
                                 local_skipped.push(spell.name.clone());
                             } else {
                                 let source_path = spell.source_file.clone();
                                 let artifact_opt = source_path
                                    .as_ref()
                                    .map(|p| normalize_key(p))
                                    .and_then(|p| artifacts_map_clone.get(&p).cloned());
                                 local_conflicts.push(ImportConflict::Spell {
                                     existing: Box::new(existing_spell),
                                     incoming: Box::new(detail),
                                     fields,
                                     artifact: artifact_opt
                                  });
                             }
                             continue;
                         }

                         conn.execute(
                             "UPDATE spell SET name=?, level=?, source=?, school=?, sphere=?, class_list=?, range=?, components=?,
                             material_components=?, casting_time=?, duration=?, area=?, saving_throw=?,
                             damage=?, magic_resistance=?, reversible=?, description=?, tags=?, edition=?, author=?, license=?,
                             is_quest_spell=?, is_cantrip=?, updated_at=?,
                             canonical_data=?, content_hash=?, schema_version=? WHERE id=?",
                             params![
                                 spell.name, spell.level, spell.source,
                                 spell.school, spell.sphere, spell.class_list, spell.range, spell.components,
                                 spell.material_components, spell.casting_time, spell.duration, spell.area, spell.saving_throw,
                                 spell.damage, spell.magic_resistance,
                                 spell.reversible.unwrap_or(0), spell.description, spell.tags, spell.edition, spell.author, spell.license,
                                 spell.is_quest_spell, spell.is_cantrip, Utc::now().to_rfc3339(),
                                 json, hash, canonical.schema_version, id
                             ],
                         )?;
                        id
                    } else {
                        conn.execute(
                            "INSERT INTO spell (name, school, sphere, class_list, level, range, components,
                            material_components, casting_time, duration, area, saving_throw, damage,
                            magic_resistance, reversible, description, tags, source, edition, author,
                            license, is_quest_spell, is_cantrip, canonical_data, content_hash,
                            schema_version)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            params![
                                spell.name, spell.school, spell.sphere, spell.class_list, spell.level, spell.range, spell.components,
                                spell.material_components, spell.casting_time, spell.duration, spell.area, spell.saving_throw,
                                spell.damage, spell.magic_resistance,
                                spell.reversible.unwrap_or(0),
                                spell.description, spell.tags, spell.source, spell.edition, spell.author, spell.license, spell.is_quest_spell, spell.is_cantrip,
                                json, hash, canonical.schema_version
                            ],
                        )?;
                        conn.last_insert_rowid()
                    };

                    migration_manager::sync_check_spell(&conn, spell_id);
                    local_imported.push(SpellDetail {
                        id: Some(spell_id),
                        name: spell.name.clone(),
                        school: spell.school.clone(),
                        level: spell.level,
                        description: spell.description.clone(),
                        source: spell.source.clone(),
                        sphere: spell.sphere.clone(), class_list: spell.class_list.clone(), range: spell.range.clone(), components: spell.components.clone(),
                        material_components: spell.material_components.clone(), casting_time: spell.casting_time.clone(), duration: spell.duration.clone(),
                        area: spell.area.clone(), saving_throw: spell.saving_throw.clone(),
                        damage: spell.damage.clone(),
                        magic_resistance: spell.magic_resistance.clone(),
                        reversible: spell.reversible, tags: spell.tags.clone(),
                        edition: spell.edition.clone(), author: spell.author.clone(), license: spell.license.clone(), is_quest_spell: spell.is_quest_spell,
                        is_cantrip: spell.is_cantrip,
                        schema_version: spell.schema_version,
                        artifacts: None,
                        canonical_data: None,
                        content_hash: None,
                        ..Default::default()
                    });

                     let source_path = spell.source_file.clone();
                     if let Some(p) = source_path {
                         if let Some(artifact_val) = artifacts_map_clone.get(&normalize_key(&p)) {
                            let _ = conn.execute(
                                "INSERT INTO artifact (spell_id, type, path, hash, imported_at) VALUES (?, ?, ?, ?, ?)
                                ON CONFLICT(spell_id, path) WHERE spell_id IS NOT NULL DO UPDATE SET hash=excluded.hash, imported_at=excluded.imported_at",
                                params![spell_id, artifact_val.r#type, artifact_val.path, artifact_val.hash, artifact_val.imported_at],
                            );
                         }
                     }
                }



                Ok::<ImportResult, AppError>(ImportResult {
                    spells: local_imported,
                    artifacts: vec![],
                    conflicts: local_conflicts,
                    warnings: vec![],
                    skipped: local_skipped
                })
            }).await.map_err(|e| AppError::Unknown(e.to_string()))??;

            all_imported_spells.extend(result.spells);
            all_conflicts.extend(result.conflicts);
            all_skipped.extend(result.skipped);
        }

        all_artifacts = serde_json::to_value(override_artifacts)
            .unwrap_or_default()
            .as_array()
            .cloned()
            .unwrap_or_default();
    }

    Ok(ImportResult {
        spells: all_imported_spells,
        artifacts: all_artifacts,
        conflicts: all_conflicts,
        warnings: all_warnings,
        skipped: all_skipped,
    })
}

#[tauri::command]
pub async fn resolve_import_conflicts(
    state: State<'_, Arc<Pool>>,
    resolutions: Vec<ImportConflictResolution>,
) -> Result<ResolveImportResult, AppError> {
    let pool = state.inner().clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let mut resolved = Vec::new();
        let mut skipped = Vec::new();
        let mut warnings = Vec::new();

        for resolution in resolutions {
            match resolution.action.as_str() {
                "skip" => {
                    if let Some(existing_spell) = get_spell_from_conn(&conn, resolution.existing_id)? {
                        skipped.push(existing_spell.name);
                    }
                }
                "overwrite" | "merge" => {
                    let spell = resolution
                        .spell
                        .ok_or_else(|| AppError::Validation("missing spell for conflict resolution".into()))?;
                    if spell.id != resolution.existing_id {
                        return Err(AppError::Validation("conflict resolution id mismatch".into()));
                    }
                    apply_spell_update_with_conn(&conn, &spell)?;
                    resolved.push(spell.name.clone());

                    if let Some(artifact) = resolution.artifact {
                        if let Err(e) = conn.execute(
                            "INSERT INTO artifact (spell_id, type, path, hash, imported_at) VALUES (?, ?, ?, ?, ?)
                             ON CONFLICT(spell_id, path) WHERE spell_id IS NOT NULL DO UPDATE SET hash=excluded.hash, imported_at=excluded.imported_at",
                            params![
                                spell.id,
                                artifact.r#type,
                                artifact.path,
                                artifact.hash,
                                artifact.imported_at
                            ],
                        ) {
                            warnings.push(format!("Artifact error for {}: {}", spell.name, e));
                        }
                    }
                }
                _ => {
                    return Err(AppError::Validation(format!(
                        "Unknown conflict resolution action: {}",
                        resolution.action
                    )));
                }
            }
        }

        Ok::<ResolveImportResult, AppError>(ResolveImportResult {
            resolved,
            skipped,
            warnings,
        })
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn reparse_artifact(
    state: State<'_, Arc<Pool>>,
    artifact_id: i64,
) -> Result<SpellDetail, AppError> {
    let pool = state.inner().clone();

    let (spell_id, artifact_path) = {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || {
            let conn = pool.get()?;
            let row: (i64, String) = conn
                .query_row(
                    "SELECT spell_id, path FROM artifact WHERE id = ?",
                    [artifact_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(AppError::Database)?;
            Ok::<_, AppError>(row)
        })
        .await
        .map_err(|e| AppError::Unknown(e.to_string()))??
    };

    let path = std::path::Path::new(&artifact_path);
    if !path.exists() {
        return Err(AppError::NotFound(format!(
            "Artifact file no longer exists at: {}",
            artifact_path
        )));
    }

    let _original_spell = {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || {
            let conn = pool.get()?;
            get_spell_from_conn(&conn, spell_id)
        })
        .await
        .map_err(|e| AppError::Unknown(e.to_string()))??
        .ok_or_else(|| AppError::NotFound("Original spell not found".to_string()))?
    };

    let result = call_sidecar("import", json!({"files": [artifact_path]})).await?;
    let spells: Vec<SpellDetail> =
        serde_json::from_value(result.get("spells").cloned().unwrap_or(json!([])))
            .map_err(|e| AppError::Sidecar(format!("Failed to parse sidecar response: {}", e)))?;

    let parsed_spell = spells
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Sidecar("Sidecar did not return any parsed spells".to_string()))?;

    let pool = pool.clone();
    let updated_spell = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;

        let update_for_diff = SpellUpdate {
            id: spell_id,
            name: parsed_spell.name.clone(),
            school: parsed_spell.school.clone(),
            sphere: parsed_spell.sphere.clone(),
            class_list: parsed_spell.class_list.clone(),
            level: parsed_spell.level,
            range: parsed_spell.range.clone(),
            components: parsed_spell.components.clone(),
            material_components: parsed_spell.material_components.clone(),
            casting_time: parsed_spell.casting_time.clone(),
            duration: parsed_spell.duration.clone(),
            area: parsed_spell.area.clone(),
            saving_throw: parsed_spell.saving_throw.clone(),
            damage: parsed_spell.damage.clone(),
            magic_resistance: parsed_spell.magic_resistance.clone(),
            reversible: parsed_spell.reversible,
            description: parsed_spell.description.clone(),
            tags: parsed_spell.tags.clone(),
            source: parsed_spell.source.clone(),
            edition: parsed_spell.edition.clone(),
            author: parsed_spell.author.clone(),
            license: parsed_spell.license.clone(),
            is_quest_spell: parsed_spell.is_quest_spell,
            is_cantrip: parsed_spell.is_cantrip,
            ..Default::default()
        };

        apply_spell_update_with_conn(&conn, &update_for_diff)?;

        conn.execute(
            "UPDATE artifact SET imported_at = ? WHERE id = ?",
            params![Utc::now().to_rfc3339(), artifact_id],
        )?;

        get_spell_from_conn(&conn, spell_id)?
            .ok_or_else(|| AppError::NotFound("Failed to fetch updated spell".to_string()))
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(updated_spell)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::vault::{optimize_vault_with_root, VaultMaintenanceState};
    use crate::models::canonical_spell::{CanonicalSpell, SourceRef};
    use rusqlite::{params, Connection};
    use std::sync::{Mutex, OnceLock};

    fn minimal_spell_json(name: &str) -> String {
        format!(
            r#"{{"name":"{}","tradition":"ARCANE","level":1,"description":"X","school":"Abjuration"}}"#,
            name
        )
    }

    fn setup_import_apply_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory sqlite");
        conn.execute(
            "CREATE TABLE spell (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                school TEXT,
                sphere TEXT,
                class_list TEXT,
                level INTEGER NOT NULL,
                range TEXT,
                components TEXT,
                material_components TEXT,
                casting_time TEXT,
                duration TEXT,
                area TEXT,
                saving_throw TEXT,
                damage TEXT,
                magic_resistance TEXT,
                reversible INTEGER,
                description TEXT NOT NULL,
                tags TEXT,
                source TEXT,
                edition TEXT,
                author TEXT,
                license TEXT,
                is_quest_spell INTEGER,
                is_cantrip INTEGER,
                updated_at TEXT,
                canonical_data TEXT,
                content_hash TEXT,
                schema_version INTEGER
            )",
            [],
        )
        .expect("create spell table");
        conn
    }

    /// Creates the artifact table so get_spell_from_conn can run (used by vault-export tests that do not call create_hash_reference_tables).
    fn create_artifact_table_for_get_spell(conn: &Connection) {
        conn.execute(
            "CREATE TABLE artifact (
                id INTEGER PRIMARY KEY,
                spell_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                path TEXT NOT NULL,
                hash TEXT NOT NULL,
                imported_at TEXT NOT NULL
            )",
            [],
        )
        .expect("create artifact table for get_spell_from_conn");
    }

    fn vault_env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn create_change_log_table(conn: &Connection) {
        conn.execute(
            "CREATE TABLE change_log (
                id INTEGER PRIMARY KEY,
                spell_id INTEGER NOT NULL,
                field TEXT NOT NULL,
                old_value TEXT,
                new_value TEXT
            )",
            [],
        )
        .expect("create change_log table");
    }

    fn create_hash_reference_tables(conn: &Connection) {
        conn.execute(
            "CREATE TABLE character_class_spell (
                id INTEGER PRIMARY KEY,
                spell_id INTEGER,
                spell_content_hash TEXT UNIQUE
            )",
            [],
        )
        .expect("create character_class_spell table");
        conn.execute(
            "CREATE TABLE artifact (
                id INTEGER PRIMARY KEY,
                spell_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                path TEXT NOT NULL,
                hash TEXT NOT NULL,
                imported_at TEXT NOT NULL,
                spell_content_hash TEXT
            )",
            [],
        )
        .expect("create artifact table");
    }

    fn test_spell(name: &str, level: i64, description: &str) -> CanonicalSpell {
        let mut spell = CanonicalSpell::new(
            name.to_string(),
            level,
            "ARCANE".to_string(),
            description.to_string(),
        );
        spell.school = Some("Abjuration".to_string());
        spell.version = "2.0.0".to_string();
        spell
    }

    fn insert_spell_for_apply_test(
        conn: &Connection,
        id: i64,
        spell: &CanonicalSpell,
        content_hash: &str,
    ) {
        conn.execute(
            "INSERT INTO spell (
                id, name, level, description, school, canonical_data, content_hash, schema_version,
                is_quest_spell, is_cantrip, reversible
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)",
            params![
                id,
                spell.name,
                spell.level,
                spell.description,
                spell.school,
                serde_json::to_string(spell).expect("serialize canonical spell"),
                content_hash,
                CURRENT_SCHEMA_VERSION
            ],
        )
        .expect("insert seed spell");
    }

    #[test]
    fn test_parse_classify_single() {
        let json = minimal_spell_json("Single Spell");
        let spells = parse_and_classify_payload(&json).unwrap();
        assert_eq!(spells.len(), 1);
        assert_eq!(spells[0].name, "Single Spell");
    }

    #[test]
    fn test_parse_classify_bundle() {
        let json = format!(
            r#"{{"bundle_format_version":1,"spells":[{}]}}"#,
            minimal_spell_json("A")
        );
        let spells = parse_and_classify_payload(&json).unwrap();
        assert_eq!(spells.len(), 1);
        assert_eq!(spells[0].name, "A");

        let json2 = format!(
            r#"{{"bundle_format_version":1,"spells":[{},{}]}}"#,
            minimal_spell_json("A"),
            minimal_spell_json("B")
        );
        let spells2 = parse_and_classify_payload(&json2).unwrap();
        assert_eq!(spells2.len(), 2);
        assert_eq!(spells2[0].name, "A");
        assert_eq!(spells2[1].name, "B");
    }

    #[test]
    fn test_parse_classify_bundle_missing_version() {
        let json = r#"{"spells":[{"name":"X","tradition":"ARCANE","level":1,"description":"Y","school":"Abjuration"}]}"#;
        let err = parse_and_classify_payload(json).unwrap_err();
        assert!(err.to_string().contains("bundle_format_version"));
    }

    #[test]
    fn test_parse_classify_bundle_unsupported_version() {
        let json = format!(
            r#"{{"bundle_format_version":99,"spells":[{}]}}"#,
            minimal_spell_json("X")
        );
        let err = parse_and_classify_payload(&json).unwrap_err();
        assert!(err.to_string().contains("Unsupported"));
        assert!(err.to_string().contains("99"));
    }

    #[test]
    fn test_parse_classify_bundle_spells_not_array() {
        let json = r#"{"bundle_format_version":1,"spells":"not-an-array"}"#;
        let err = parse_and_classify_payload(json).unwrap_err();
        assert!(err.to_string().contains("array"));
    }

    #[test]
    fn test_normalize_truncate_tags() {
        let mut spell = CanonicalSpell::new("T".into(), 1, "ARCANE".into(), "D".into());
        spell.school = Some("Abjuration".into());
        spell.tags = (0..150).map(|i| format!("tag_{}", i)).collect();
        normalize_truncate_metadata(&mut spell);
        assert_eq!(spell.tags.len(), 100, "tags truncated to max 100");
        let mut sorted = spell.tags.clone();
        sorted.sort();
        assert_eq!(spell.tags, sorted, "tags are sorted");
        let unique: std::collections::HashSet<_> = spell.tags.iter().collect();
        assert_eq!(unique.len(), spell.tags.len(), "tags are deduplicated");
    }

    #[test]
    fn test_normalize_truncate_source_refs_dedup() {
        let mut spell = CanonicalSpell::new("S".into(), 1, "ARCANE".into(), "D".into());
        spell.school = Some("Abjuration".into());
        let ref1 = SourceRef {
            system: None,
            book: "PHB".to_string(),
            page: None,
            note: None,
            url: None,
        };
        let ref2 = SourceRef {
            system: None,
            book: "PHB".to_string(),
            page: None,
            note: None,
            url: None,
        };
        spell.source_refs = (0..60).map(|_| ref1.clone()).collect();
        spell.source_refs.push(ref2);
        normalize_truncate_metadata(&mut spell);
        assert_eq!(spell.source_refs.len(), 1);
        assert_eq!(spell.source_refs[0].book, "PHB");

        let mut spell2 = CanonicalSpell::new("S2".into(), 1, "ARCANE".into(), "D".into());
        spell2.school = Some("Abjuration".into());
        spell2.source_refs = (0..55)
            .map(|i| SourceRef {
                system: Some("2e".into()),
                book: format!("Book{}", i),
                page: None,
                note: None,
                url: None,
            })
            .collect();
        normalize_truncate_metadata(&mut spell2);
        assert_eq!(spell2.source_refs.len(), 50);
    }

    #[test]
    fn test_validate_source_ref_url_allowed() {
        assert!(validate_source_ref_url("http://example.com"));
        assert!(validate_source_ref_url("https://example.com/path"));
        assert!(validate_source_ref_url("mailto:user@example.com"));
        assert!(validate_source_ref_url("HTTP://x"));
        assert!(validate_source_ref_url("HTTPS://x"));
        assert!(validate_source_ref_url("  https://x  "));
    }

    #[test]
    fn test_validate_source_ref_url_rejected() {
        assert!(!validate_source_ref_url("javascript:alert(1)"));
        assert!(!validate_source_ref_url("data:text/html,<script>"));
        assert!(!validate_source_ref_url("ipfs://QmX"));
        assert!(!validate_source_ref_url(""));
        assert!(!validate_source_ref_url("  "));
        assert!(!validate_source_ref_url("no-colon-here"));
        assert!(!validate_source_ref_url("file:///etc/passwd"));
    }

    #[test]
    fn test_sanitize_url_for_display() {
        assert_eq!(
            sanitize_url_for_display("https://example.com"),
            "https://example.com"
        );
        assert_eq!(
            sanitize_url_for_display("  https://x.com  "),
            "https://x.com"
        );
        // Strips angle-bracket tags only; text between tags remains (validation will reject bad schemes).
        assert_eq!(
            sanitize_url_for_display("https://x.com<script>alert(1)</script>"),
            "https://x.comalert(1)"
        );
        assert_eq!(sanitize_url_for_display("link <img src=x> end"), "link end");
    }

    #[test]
    fn test_preview_drop_ref_policy_invalid_url() {
        let json = format!(
            r#"{{"name":"WithBadUrl","tradition":"ARCANE","level":1,"description":"X","school":"Abjuration","sourceRefs":[{{"book":"PHB","url":"javascript:alert(1)"}}]}}"#
        );
        let result = tauri::async_runtime::block_on(preview_import_spell_json(
            json,
            Some("drop-ref".to_string()),
        ))
        .unwrap();
        assert_eq!(result.spells.len(), 1);
        assert!(result.spells[0].spell.source_refs.is_empty());
        assert!(result
            .warnings
            .iter()
            .any(|w| w.contains("dropped SourceRef")));
        assert!(result.failures.is_empty());
    }

    #[test]
    fn test_preview_reject_spell_policy_invalid_url() {
        let json = format!(
            r#"{{"name":"RejectMe","tradition":"ARCANE","level":1,"description":"X","school":"Abjuration","sourceRefs":[{{"book":"PHB","url":"data:text/html,evil"}}]}}"#
        );
        let result = tauri::async_runtime::block_on(preview_import_spell_json(
            json,
            Some("reject-spell".to_string()),
        ))
        .unwrap();
        assert_eq!(result.spells.len(), 0);
        assert_eq!(result.failures.len(), 1);
        assert_eq!(result.failures[0].spell_name, "RejectMe");
        assert!(result.failures[0].reason.contains("invalid SourceRef URL"));
    }

    #[test]
    fn test_preview_default_policy_accepts_valid_urls() {
        let json = format!(
            r#"{{"name":"Good","tradition":"ARCANE","level":1,"description":"X","school":"Abjuration","sourceRefs":[{{"book":"PHB","url":"https://example.com/ref"}}]}}"#
        );
        let result = tauri::async_runtime::block_on(preview_import_spell_json(json, None)).unwrap();
        assert_eq!(result.spells.len(), 1);
        assert_eq!(result.spells[0].spell.source_refs.len(), 1);
        assert_eq!(
            result.spells[0].spell.source_refs[0].url.as_deref(),
            Some("https://example.com/ref")
        );
    }
    #[test]
    fn test_is_duplicate_source_ref() {
        use crate::models::canonical_spell::SourceRef;

        // URL match (both present)
        let ref1 = SourceRef {
            url: Some("https://a.com".into()),
            book: "B1".into(),
            ..Default::default()
        };
        let ref2 = SourceRef {
            url: Some("https://a.com".into()),
            book: "B2".into(),
            ..Default::default()
        };
        assert!(is_duplicate_source_ref(&ref1, &ref2), "Should dedup by URL");

        // URL mismatch
        let ref3 = SourceRef {
            url: Some("https://b.com".into()),
            book: "".into(),
            ..Default::default()
        };
        assert!(!is_duplicate_source_ref(&ref1, &ref3), "Different URLs");

        // Mixed (one missing URL) -> Tuple fallback
        let ref4 = SourceRef {
            url: None,
            system: Some("2e".into()),
            book: "B1".into(),
            page: Some(serde_json::Value::String("10".into())),
            ..Default::default()
        };
        let ref5 = SourceRef {
            url: Some("https://a.com".into()),
            system: Some("2e".into()),
            book: "B1".into(),
            page: Some(serde_json::Value::String("10".into())),
            ..Default::default()
        };
        assert!(
            is_duplicate_source_ref(&ref4, &ref5),
            "Missing URL on one -> tuple match"
        );

        // Tuple mismatch
        let ref6 = SourceRef {
            url: None,
            system: Some("2e".into()),
            book: "B1".into(),
            page: Some(serde_json::Value::String("11".into())),
            ..Default::default()
        };
        assert!(
            !is_duplicate_source_ref(&ref4, &ref6),
            "Tuple mismatch (page)"
        );
    }

    #[test]
    fn test_merge_canonical_metadata() {
        let canonical_json = r#"{"name":"Test","tradition":"ARCANE","level":1,"description":"Desc","tags":["existing"],"source_refs":[{"book":"B1"}]}"#;
        let incoming_tags = vec!["new".to_string(), "existing".to_string()];
        let incoming_refs = vec![
            SourceRef {
                book: "B1".into(),
                ..Default::default()
            },
            SourceRef {
                book: "B2".into(),
                url: Some("https://b.com".into()),
                ..Default::default()
            },
        ];

        let (merged_tags, merged_json) =
            merge_canonical_metadata(canonical_json, &incoming_tags, &incoming_refs).unwrap();

        assert_eq!(
            merged_tags.unwrap(),
            "existing, new",
            "Tags merged and sorted"
        );
        let merged_spell: CanonicalSpell = serde_json::from_str(&merged_json).unwrap();
        assert_eq!(
            merged_spell.source_refs.len(),
            2,
            "SourceRefs merged (B1 was dupe, B2 added)"
        );
        assert_eq!(merged_spell.source_refs[0].book, "B1");
        assert_eq!(
            merged_spell.source_refs[1].url.as_deref(),
            Some("https://b.com")
        );
    }

    #[test]
    fn test_import_alias_support() {
        let h1 = "a".repeat(64);
        let base_spell = CanonicalSpell {
            name: "N1".into(),
            tradition: "ARCANE".into(),
            level: 1,
            description: "D1".into(),
            school: Some("Abjuration".into()),
            version: "2.0.0".into(),
            ..Default::default()
        };

        // 1. id
        let mut s1 = base_spell.clone();
        s1.id = Some(h1.clone());
        let json_id = serde_json::to_string(&s1).unwrap();

        // 2. content_hash
        let mut val_hash = serde_json::to_value(&base_spell).unwrap();
        val_hash
            .as_object_mut()
            .unwrap()
            .insert("content_hash".into(), h1.clone().into());
        let json_hash = serde_json::to_string(&val_hash).unwrap();

        // 3. contentHash
        let mut val_camel = serde_json::to_value(&base_spell).unwrap();
        val_camel
            .as_object_mut()
            .unwrap()
            .insert("contentHash".into(), h1.clone().into());
        let json_camel = serde_json::to_string(&val_camel).unwrap();

        let res_id =
            tauri::async_runtime::block_on(preview_import_spell_json(json_id, None)).unwrap();
        let res_hash =
            tauri::async_runtime::block_on(preview_import_spell_json(json_hash, None)).unwrap();
        let res_camel =
            tauri::async_runtime::block_on(preview_import_spell_json(json_camel, None)).unwrap();

        assert!(
            res_id.failures.is_empty(),
            "id failed: {:?}",
            res_id.failures
        );
        assert!(
            res_hash.failures.is_empty(),
            "hash failed: {:?}",
            res_hash.failures
        );
        assert!(
            res_camel.failures.is_empty(),
            "camel failed: {:?}",
            res_camel.failures
        );

        assert_eq!(res_id.spells[0].spell.id, Some(h1.clone()));
        assert_eq!(res_hash.spells[0].spell.id, Some(h1.clone()));
        assert_eq!(res_camel.spells[0].spell.id, Some(h1.clone()));
    }

    #[test]
    fn test_apply_import_conflict_same_name_different_level_different_hash() {
        let conn = setup_import_apply_test_db();
        let existing_spell = test_spell("Mirror Veil", 1, "Existing spell");
        let incoming_spell = test_spell("Mirror Veil", 5, "Incoming spell with different content");
        let existing_hash = "a".repeat(64);
        let incoming_hash = "b".repeat(64);

        insert_spell_for_apply_test(&conn, 1, &existing_spell, &existing_hash);

        let result = apply_import_spell_json_impl(
            &conn,
            vec![PreviewSpellJsonItem {
                spell: incoming_spell.clone(),
                content_hash: incoming_hash.clone(),
                warnings: vec![],
            }],
            None,
        )
        .expect("apply import should succeed");

        assert_eq!(result.imported_count, 0, "conflict should block insert");
        assert_eq!(result.conflicts.len(), 1, "one conflict should be emitted");
        assert_eq!(result.conflicts[0].existing_id, 1);
        assert_eq!(result.conflicts[0].incoming_name, incoming_spell.name);
        assert_eq!(
            result.conflicts[0].incoming_content_hash, incoming_hash,
            "conflict should track incoming hash"
        );
    }

    #[test]
    fn test_apply_import_materializes_vault_file_after_commit() {
        let _guard = vault_env_lock().lock().expect("lock vault env");
        let temp_dir = tempfile::tempdir().expect("temp dir");
        std::env::set_var("SPELLBOOK_DATA_DIR", temp_dir.path());

        let conn = setup_import_apply_test_db();
        create_artifact_table_for_get_spell(&conn);
        let incoming_spell = test_spell("Vault Import", 4, "Imported into vault storage");
        let stored_hash = incoming_spell.compute_hash().expect("hash");

        let result = apply_import_spell_json_impl(
            &conn,
            vec![PreviewSpellJsonItem {
                spell: incoming_spell,
                content_hash: stored_hash.clone(),
                warnings: vec![],
            }],
            None,
        )
        .expect("apply import should succeed");

        assert_eq!(result.imported_count, 1, "spell should be inserted");
        assert!(
            temp_dir
                .path()
                .join("spells")
                .join(format!("{stored_hash}.json"))
                .exists(),
            "json import should write the canonical spell file into the vault"
        );

        std::env::remove_var("SPELLBOOK_DATA_DIR");
    }

    #[test]
    fn test_manual_gc_is_blocked_while_import_guard_is_active() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let conn = setup_import_apply_test_db();
        let maintenance_state = VaultMaintenanceState::default();
        let _guard = maintenance_state
            .start_import()
            .expect("import guard should be acquired");

        let err = optimize_vault_with_root(&conn, temp_dir.path(), Some(&maintenance_state))
            .expect_err("manual gc should be rejected during active import");
        assert!(
            err.to_string().contains("import"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn test_successful_import_triggers_post_import_gc() {
        let _guard = vault_env_lock().lock().expect("lock vault env");
        let temp_dir = tempfile::tempdir().expect("temp dir");
        std::env::set_var("SPELLBOOK_DATA_DIR", temp_dir.path());

        let conn = setup_import_apply_test_db();
        create_artifact_table_for_get_spell(&conn);
        let maintenance_state = VaultMaintenanceState::default();
        let orphan_hash = "y".repeat(64);
        let spells_dir = temp_dir.path().join("spells");
        std::fs::create_dir_all(&spells_dir).expect("create spells dir");
        std::fs::write(
            spells_dir.join(format!("{orphan_hash}.json")),
            r#"{"name":"Orphan","tradition":"ARCANE","level":1,"description":"Orphan","school":"Abjuration"}"#,
        )
        .expect("write orphan file");

        let result = apply_import_spell_json_with_maintenance(
            &conn,
            temp_dir.path(),
            &maintenance_state,
            vec![PreviewSpellJsonItem {
                spell: test_spell("GC Trigger", 2, "Should trigger GC"),
                content_hash: "z".repeat(64),
                warnings: vec![],
            }],
            None,
        )
        .expect("import should succeed");

        assert_eq!(result.imported_count, 1);
        assert!(
            !spells_dir.join(format!("{orphan_hash}.json")).exists(),
            "post-import gc should remove orphaned spell files"
        );

        std::env::remove_var("SPELLBOOK_DATA_DIR");
    }

    #[test]
    fn test_import_conflict_does_not_trigger_post_import_gc() {
        let _guard = vault_env_lock().lock().expect("lock vault env");
        let temp_dir = tempfile::tempdir().expect("temp dir");
        std::env::set_var("SPELLBOOK_DATA_DIR", temp_dir.path());

        let conn = setup_import_apply_test_db();
        let maintenance_state = VaultMaintenanceState::default();
        let existing_spell = test_spell("Conflict Spell", 1, "Existing");
        let existing_hash = "1".repeat(64);
        insert_spell_for_apply_test(&conn, 1, &existing_spell, &existing_hash);

        let orphan_hash = "2".repeat(64);
        let spells_dir = temp_dir.path().join("spells");
        std::fs::create_dir_all(&spells_dir).expect("create spells dir");
        std::fs::write(
            spells_dir.join(format!("{orphan_hash}.json")),
            r#"{"name":"Orphan","tradition":"ARCANE","level":1,"description":"Orphan","school":"Abjuration"}"#,
        )
        .expect("write orphan file");

        let result = apply_import_spell_json_with_maintenance(
            &conn,
            temp_dir.path(),
            &maintenance_state,
            vec![PreviewSpellJsonItem {
                spell: test_spell("Conflict Spell", 3, "Incoming conflict"),
                content_hash: "3".repeat(64),
                warnings: vec![],
            }],
            None,
        )
        .expect("conflict-only import should return result");

        assert_eq!(result.imported_count, 0);
        assert_eq!(result.conflicts.len(), 1);
        assert!(
            spells_dir.join(format!("{orphan_hash}.json")).exists(),
            "conflict-only import should not trigger post-import gc"
        );

        std::env::remove_var("SPELLBOOK_DATA_DIR");
    }

    #[test]
    fn test_apply_import_same_hash_dedups_before_name_conflict() {
        let conn = setup_import_apply_test_db();
        let existing_spell = test_spell("Storm Cage", 1, "Existing spell");
        let mut incoming_spell = test_spell("Storm Cage", 3, "Incoming variant");
        incoming_spell.tags = vec!["arcane".to_string()];
        let shared_hash = "c".repeat(64);

        insert_spell_for_apply_test(&conn, 1, &existing_spell, &shared_hash);

        let result = apply_import_spell_json_impl(
            &conn,
            vec![PreviewSpellJsonItem {
                spell: incoming_spell,
                content_hash: shared_hash,
                warnings: vec![],
            }],
            None,
        )
        .expect("apply import should succeed");

        assert!(
            result.conflicts.is_empty(),
            "hash match should dedup before conflict detection"
        );
        assert_eq!(result.imported_count, 0, "no new rows should be inserted");
        assert_eq!(
            result.duplicates_skipped.total, 1,
            "existing hash should be counted as duplicate handling"
        );
        let spell_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM spell", [], |row| row.get(0))
            .expect("count spells");
        assert_eq!(spell_count, 1, "dedup should keep only one spell row");
    }

    #[test]
    fn test_apply_import_dedup_counters_track_merged_vs_no_change() {
        let conn = setup_import_apply_test_db();
        let existing_spell = test_spell("Echo Ward", 2, "Existing spell");
        let shared_hash = "g".repeat(64);

        insert_spell_for_apply_test(&conn, 1, &existing_spell, &shared_hash);

        let mut first_incoming = test_spell("Echo Ward", 2, "Existing spell");
        first_incoming.tags = vec!["new-tag".to_string()];
        let mut second_incoming = test_spell("Echo Ward", 2, "Existing spell");
        second_incoming.tags = vec!["new-tag".to_string()];

        let result = apply_import_spell_json_impl(
            &conn,
            vec![
                PreviewSpellJsonItem {
                    spell: first_incoming,
                    content_hash: shared_hash.clone(),
                    warnings: vec![],
                },
                PreviewSpellJsonItem {
                    spell: second_incoming,
                    content_hash: shared_hash,
                    warnings: vec![],
                },
            ],
            None,
        )
        .expect("apply import should succeed");

        assert_eq!(result.imported_count, 0, "dedup path should not insert rows");
        assert_eq!(result.duplicates_skipped.total, 2);
        assert_eq!(result.duplicates_skipped.merged_count, 1);
        assert_eq!(result.duplicates_skipped.no_change_count, 1);
    }

    #[test]
    fn test_apply_import_conflict_resolution_branches_keep_replace_keep_both() {
        let conn = setup_import_apply_test_db();
        create_change_log_table(&conn);
        create_hash_reference_tables(&conn);

        let keep_existing_spell = test_spell("Aegis Shell", 1, "Keep me");
        let replace_existing_spell = test_spell("Moon Lance", 3, "Old replace target");
        let keep_both_existing_spell = test_spell("Twin Flame", 4, "Original twin");
        let keep_existing_hash = "h".repeat(64);
        let replace_old_hash = "i".repeat(64);
        let keep_both_existing_hash = "j".repeat(64);

        insert_spell_for_apply_test(&conn, 1, &keep_existing_spell, &keep_existing_hash);
        insert_spell_for_apply_test(&conn, 2, &replace_existing_spell, &replace_old_hash);
        insert_spell_for_apply_test(&conn, 3, &keep_both_existing_spell, &keep_both_existing_hash);
        conn.execute(
            "INSERT INTO character_class_spell (id, spell_id, spell_content_hash) VALUES (1, 2, ?)",
            params![replace_old_hash],
        )
        .expect("seed character_class_spell hash reference");
        conn.execute(
            "INSERT INTO artifact (id, spell_id, type, path, hash, imported_at, spell_content_hash)
             VALUES (1, 2, 'pdf', 'moon-lance.pdf', 'artifact-hash', '2026-01-01T00:00:00Z', ?)",
            params![replace_old_hash],
        )
        .expect("seed artifact hash reference");

        let keep_existing_incoming = test_spell("Aegis Shell", 1, "Incoming but skipped");
        let replace_incoming = test_spell("Moon Lance", 3, "Replacement description");
        let keep_both_incoming = test_spell("Twin Flame", 4, "Imported twin");
        let replace_new_hash = replace_incoming.compute_hash().expect("replace spell hash");
        let mut keep_both_spell_with_suffix = keep_both_incoming.clone();
        keep_both_spell_with_suffix.name = "Twin Flame (1)".to_string();
        let keep_both_new_hash = keep_both_spell_with_suffix.compute_hash().expect("keep_both spell hash");

        let resolve_options = ImportSpellJsonResolveOptions {
            resolutions: vec![
                ImportSpellJsonConflictResolution {
                    existing_id: 1,
                    incoming_content_hash: "m".repeat(64),
                    action: "keep_existing".to_string(),
                },
                ImportSpellJsonConflictResolution {
                    existing_id: 2,
                    incoming_content_hash: replace_new_hash.clone(),
                    action: "replace_with_new".to_string(),
                },
                ImportSpellJsonConflictResolution {
                    existing_id: 3,
                    incoming_content_hash: keep_both_new_hash.clone(),
                    action: "keep_both".to_string(),
                },
            ],
            default_action: None,
        };

        let result = apply_import_spell_json_impl(
            &conn,
            vec![
                PreviewSpellJsonItem {
                    spell: keep_existing_incoming,
                    content_hash: "m".repeat(64),
                    warnings: vec![],
                },
                PreviewSpellJsonItem {
                    spell: replace_incoming,
                    content_hash: replace_new_hash.clone(),
                    warnings: vec![],
                },
                PreviewSpellJsonItem {
                    spell: keep_both_incoming,
                    content_hash: keep_both_new_hash.clone(),
                    warnings: vec![],
                },
            ],
            Some(resolve_options),
        )
        .expect("apply import should succeed");

        assert!(result.conflicts.is_empty(), "all conflicts should be resolved");
        assert_eq!(result.imported_count, 1, "keep_both should insert one row");

        let resolved = result
            .conflicts_resolved
            .expect("resolution counters should be present");
        assert_eq!(resolved.keep_existing_count, 1);
        assert_eq!(resolved.replace_count, 1);
        assert_eq!(resolved.keep_both_count, 1);

        let kept_hash: String = conn
            .query_row("SELECT content_hash FROM spell WHERE id = 1", [], |row| row.get(0))
            .expect("query keep_existing hash");
        assert_eq!(kept_hash, keep_existing_hash, "keep_existing should not mutate row");

        let (replaced_hash, replaced_description): (String, String) = conn
            .query_row(
                "SELECT content_hash, description FROM spell WHERE id = 2",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("query replaced row");
        assert_eq!(replaced_hash, replace_new_hash);
        assert_eq!(replaced_description, "Replacement description");
        let ccs_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM character_class_spell WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query character_class_spell hash after replace");
        assert_eq!(ccs_hash, replace_new_hash);
        let artifact_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM artifact WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query artifact hash after replace");
        assert_eq!(artifact_hash, replace_new_hash);

        let keep_both_name: String = conn
            .query_row(
                "SELECT name FROM spell WHERE content_hash = ?",
                params![keep_both_new_hash],
                |row| row.get(0),
            )
            .expect("query keep_both row");
        assert_eq!(keep_both_name, "Twin Flame (1)");
    }

    #[test]
    fn test_keep_both_suffix_is_name_global_across_levels() {
        let conn = setup_import_apply_test_db();

        let base_spell = test_spell("Cross Fire", 1, "Original");
        let existing_suffixed_other_level = test_spell("Cross Fire (1)", 9, "Higher level variant");
        insert_spell_for_apply_test(&conn, 1, &base_spell, &"r".repeat(64));
        insert_spell_for_apply_test(&conn, 2, &existing_suffixed_other_level, &"s".repeat(64));

        let incoming = test_spell("Cross Fire", 3, "Incoming variant");
        let mut incoming_suffixed = incoming.clone();
        incoming_suffixed.name = "Cross Fire (2)".to_string();
        let new_hash = incoming_suffixed.compute_hash().expect("keep_both stored hash");
        let resolve_options = ImportSpellJsonResolveOptions {
            resolutions: vec![ImportSpellJsonConflictResolution {
                existing_id: 1,
                incoming_content_hash: new_hash.clone(),
                action: "keep_both".to_string(),
            }],
            default_action: None,
        };

        let result = apply_import_spell_json_impl(
            &conn,
            vec![PreviewSpellJsonItem {
                spell: incoming,
                content_hash: new_hash.clone(),
                warnings: vec![],
            }],
            Some(resolve_options),
        )
        .expect("apply import should succeed");

        assert_eq!(result.imported_count, 1, "keep_both should insert one row");
        let inserted_name: String = conn
            .query_row(
                "SELECT name FROM spell WHERE content_hash = ?",
                params![new_hash],
                |row| row.get(0),
            )
            .expect("query inserted keep_both spell");
        assert_eq!(
            inserted_name, "Cross Fire (2)",
            "suffix should increment globally by name even when (1) exists at another level"
        );
    }

    #[test]
    fn test_apply_import_replace_failure_rolls_back_item_and_keeps_other_rows() {
        let conn = setup_import_apply_test_db();
        create_change_log_table(&conn);
        create_hash_reference_tables(&conn);

        let replace_existing_spell = test_spell("Rune Chain", 5, "Old rune chain");
        let keep_both_existing_spell = test_spell("Solar Knot", 2, "Original knot");
        let replace_old_hash = "n".repeat(64);
        let keep_both_old_hash = "o".repeat(64);
        let keep_both_new_hash = "q".repeat(64);

        let replace_incoming = test_spell("Rune Chain", 5, "Incoming replace should rollback");
        let replace_new_hash = replace_incoming.compute_hash().expect("replace incoming hash");

        insert_spell_for_apply_test(&conn, 1, &replace_existing_spell, &replace_old_hash);
        insert_spell_for_apply_test(&conn, 2, &keep_both_existing_spell, &keep_both_old_hash);
        insert_spell_for_apply_test(&conn, 3, &replace_incoming.clone(), &replace_new_hash);
        conn.execute(
            "INSERT INTO character_class_spell (id, spell_id, spell_content_hash) VALUES (1, 1, ?)",
            params![replace_old_hash],
        )
        .expect("seed old character_class_spell hash reference");

        let keep_both_incoming = test_spell("Solar Knot", 2, "Incoming keep both");

        let resolve_options = ImportSpellJsonResolveOptions {
            resolutions: vec![
                ImportSpellJsonConflictResolution {
                    existing_id: 2,
                    incoming_content_hash: keep_both_new_hash.clone(),
                    action: "keep_both".to_string(),
                },
                ImportSpellJsonConflictResolution {
                    existing_id: 1,
                    incoming_content_hash: replace_new_hash.clone(),
                    action: "replace_with_new".to_string(),
                },
            ],
            default_action: None,
        };

        let result = apply_import_spell_json_impl(
            &conn,
            vec![
                PreviewSpellJsonItem {
                    spell: keep_both_incoming,
                    content_hash: keep_both_new_hash.clone(),
                    warnings: vec![],
                },
                PreviewSpellJsonItem {
                    spell: replace_incoming,
                    content_hash: replace_new_hash,
                    warnings: vec![],
                },
            ],
            Some(resolve_options),
        )
        .expect("apply import should return per-item failures, not top-level error");

        assert_eq!(result.imported_count, 1, "keep_both should still commit");
        assert_eq!(result.failures.len(), 1, "replace item should fail");
        assert_eq!(result.failures[0].spell_name, "Rune Chain");

        let (final_hash, final_description): (String, String) = conn
            .query_row(
                "SELECT content_hash, description FROM spell WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("query replace row after failure");
        assert_eq!(final_hash, replace_old_hash, "failed replace must rollback hash");
        assert_eq!(
            final_description, "Old rune chain",
            "failed replace must rollback updated fields"
        );
        let ccs_rolled_back_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM character_class_spell WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query character_class_spell hash after rollback");
        assert_eq!(
            ccs_rolled_back_hash, replace_old_hash,
            "failed replace must rollback cascaded character_class_spell hash update"
        );

        let keep_both_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM spell WHERE name = 'Solar Knot (1)'",
                [],
                |row| row.get(0),
            )
            .expect("query keep_both inserted row");
        assert_eq!(keep_both_count, 1, "other savepoint commits should remain");
    }

    #[test]
    fn test_apply_import_conflict_deterministic_when_name_has_multiple_rows() {
        let conn = setup_import_apply_test_db();
        let existing_a = test_spell("Twin Sigil", 1, "Existing row A");
        let existing_b = test_spell("Twin Sigil", 4, "Existing row B");
        let incoming_spell = test_spell("Twin Sigil", 7, "Incoming row");
        let hash_a = "d".repeat(64);
        let hash_b = "e".repeat(64);
        let incoming_hash = "f".repeat(64);

        insert_spell_for_apply_test(&conn, 1, &existing_a, &hash_a);
        insert_spell_for_apply_test(&conn, 2, &existing_b, &hash_b);

        let result = apply_import_spell_json_impl(
            &conn,
            vec![PreviewSpellJsonItem {
                spell: incoming_spell,
                content_hash: incoming_hash,
                warnings: vec![],
            }],
            None,
        )
        .expect("apply import should succeed");

        assert_eq!(result.imported_count, 0, "conflict should block insert");
        assert_eq!(result.conflicts.len(), 1, "one conflict should be emitted");
        assert_eq!(
            result.conflicts[0].existing_id, 1,
            "name-only conflict should deterministically select the lowest id row"
        );
    }

    #[test]
    fn test_replace_with_new_collision_error_includes_conflicting_spell_name_and_hash() {
        let conn = setup_import_apply_test_db();
        let existing_spell = test_spell("Mirror Ward", 2, "Existing target spell");
        let conflicting_spell = test_spell("Prismatic Net", 6, "Spell already using incoming hash");
        let collision_hash = conflicting_spell.compute_hash().expect("conflicting spell hash");
        let old_hash = "0".repeat(64);

        insert_spell_for_apply_test(&conn, 1, &existing_spell, &old_hash);
        insert_spell_for_apply_test(&conn, 2, &conflicting_spell, &collision_hash);

        let incoming_spell = conflicting_spell.clone();
        let item = PreviewSpellJsonItem {
            spell: incoming_spell,
            content_hash: collision_hash.clone(),
            warnings: vec![],
        };

        let err = replace_with_new_impl(&conn, 1, Some(&old_hash), &collision_hash, &item)
            .expect_err("replace should fail when incoming hash belongs to another spell row");
        let msg = err.to_string();
        assert!(
            msg.contains("Prismatic Net"),
            "error should include conflicting spell name, got: {msg}"
        );
        assert!(
            msg.contains(&collision_hash),
            "error should include conflicting hash, got: {msg}"
        );
        assert!(
            msg.contains("This imported version already exists"),
            "error should include explicit already-exists guidance, got: {msg}"
        );
        assert!(
            msg.contains("Keep Existing"),
            "error should suggest Keep Existing action, got: {msg}"
        );
        assert!(
            msg.contains("Keep Both"),
            "error should suggest Keep Both action, got: {msg}"
        );
    }
}
