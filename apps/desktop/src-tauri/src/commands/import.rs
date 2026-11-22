use crate::commands::embeddings::{enqueue_import_embeddings_if_ready, EmbeddingState};
use crate::commands::spells::{
    apply_spell_update_with_conn, canonicalize_spell_detail, diff_spells, get_spell_from_conn,
    log_changes, validate_epic_and_quest_spells,
};
use crate::commands::vault::{
    run_vault_gc_with_root, write_spell_json_atomically, VaultMaintenanceState,
};
use crate::db::Pool;
use crate::error::AppError;
use crate::models::canonical_spell::{
    validate_tradition_school_sphere_consistency, CanonicalSpell, SourceRef, SpellComponents,
    BUNDLE_FORMAT_VERSION, CURRENT_SCHEMA_VERSION,
};
use crate::models::{
    ConflictsResolved, DuplicatesSkipped, ImportArtifact, ImportConflict, ImportConflictField,
    ImportConflictResolution, ImportFile, ImportMarkdownFile, ImportResult, ImportSpell,
    ImportSpellJsonConflict, ImportSpellJsonConflictResolution, ImportSpellJsonFailure,
    ImportSpellJsonResolveOptions, ImportSpellJsonResult, MaterialComponentSpec, ParseConflict,
    PreviewImportSpellJsonResult, PreviewResult, PreviewSpell, PreviewSpellJsonItem,
    ResolveImportResult, SpellDetail, SpellUpdate,
};
use crate::sidecar::call_sidecar;
use crate::utils::migration_manager;
use chrono::Utc;
use dirs::data_dir as system_data_dir;
use regex::Regex;
use rusqlite::params;
use rusqlite::OptionalExtension;
use serde::de::{self, Deserializer, IgnoredAny, MapAccess, SeqAccess, Visitor};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tracing::warn;

use tauri::State;

// --- JSON spell import (Task 2.1: parse, classify, normalize, hash) ---

const MAX_TAGS: usize = 100;
const MAX_SOURCE_REFS: usize = 50;
const MAX_IMPORT_PAYLOAD_BYTES: usize = 100 * 1024 * 1024;
const MAX_IMPORT_BUNDLE_SPELLS: usize = 10_000;
const MAX_IMPORT_JSON_DEPTH: usize = 50;

/// Allowed URL schemes for SourceRef (import allowlist). Rejects javascript:, data:, ipfs:, etc.
const ALLOWED_URL_SCHEMES: &[&str] = &["http", "https", "mailto"];

fn validate_import_payload_size(payload: &str) -> Result<(), AppError> {
    let payload_bytes = payload.len();
    if payload_bytes > MAX_IMPORT_PAYLOAD_BYTES {
        return Err(AppError::Import(format!(
            "Import payload exceeds 100 MB limit ({} bytes)",
            payload_bytes
        )));
    }
    Ok(())
}

fn validate_import_json_depth(payload: &str) -> Result<(), AppError> {
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;

    for ch in payload.chars() {
        if in_string {
            if escaped {
                escaped = false;
                continue;
            }

            match ch {
                '\\' => escaped = true,
                '"' => in_string = false,
                _ => {}
            }
            continue;
        }

        match ch {
            '"' => in_string = true,
            '{' | '[' => {
                depth += 1;
                if depth > MAX_IMPORT_JSON_DEPTH {
                    return Err(AppError::Import(format!(
                        "Import JSON nesting depth exceeds limit of {}",
                        MAX_IMPORT_JSON_DEPTH
                    )));
                }
            }
            '}' | ']' => depth = depth.saturating_sub(1),
            _ => {}
        }
    }

    Ok(())
}

fn validate_import_payload_guardrails(payload: &str) -> Result<(), AppError> {
    validate_import_payload_size(payload)?;
    validate_import_json_depth(payload)?;
    Ok(())
}

macro_rules! ignore_scalar_visits {
    () => {
        fn visit_bool<E>(self, _v: bool) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_i64<E>(self, _v: i64) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_u64<E>(self, _v: u64) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_i128<E>(self, _v: i128) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_u128<E>(self, _v: u128) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_f64<E>(self, _v: f64) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_str<E>(self, _v: &str) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_none<E>(self) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_unit<E>(self) -> Result<Self::Value, E> {
            Ok(None)
        }
    };
}

struct SpellCountSeed;

impl<'de> de::DeserializeSeed<'de> for SpellCountSeed {
    type Value = Option<usize>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_any(SpellCountVisitor)
    }
}

struct SpellCountVisitor;

impl<'de> Visitor<'de> for SpellCountVisitor {
    type Value = Option<usize>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a JSON value")
    }

    ignore_scalar_visits!();

    fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut count = 0usize;
        while seq.next_element::<IgnoredAny>()?.is_some() {
            count += 1;
            if count > MAX_IMPORT_BUNDLE_SPELLS {
                return Err(de::Error::custom(format!(
                    "Bundle exceeds maximum of 10,000 spells (received more than {})",
                    MAX_IMPORT_BUNDLE_SPELLS
                )));
            }
        }
        Ok(Some(count))
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        while map.next_entry::<IgnoredAny, IgnoredAny>()?.is_some() {}
        Ok(None)
    }
}

struct TopLevelBundleSpellCountVisitor;

impl<'de> Visitor<'de> for TopLevelBundleSpellCountVisitor {
    type Value = Option<usize>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a JSON value")
    }

    ignore_scalar_visits!();

    fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        while seq.next_element::<IgnoredAny>()?.is_some() {}
        Ok(None)
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut spell_count = None;

        while let Some(key) = map.next_key::<String>()? {
            if key == "spells" {
                spell_count = map.next_value_seed(SpellCountSeed)?;
            } else {
                let _: IgnoredAny = map.next_value()?;
            }
        }

        Ok(spell_count)
    }
}

fn validate_import_bundle_spell_count(payload: &str) -> Result<(), AppError> {
    let mut deserializer = serde_json::Deserializer::from_str(payload);
    let spell_count = deserializer
        .deserialize_any(TopLevelBundleSpellCountVisitor)
        .map_err(|e| AppError::Import(format!("Invalid JSON: {}", e)))?;
    deserializer
        .end()
        .map_err(|e| AppError::Import(format!("Invalid JSON: {}", e)))?;

    if let Some(count) = spell_count {
        if count > MAX_IMPORT_BUNDLE_SPELLS {
            return Err(AppError::Import(format!(
                "Bundle exceeds maximum of 10,000 spells (received {})",
                count
            )));
        }
    }

    Ok(())
}

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
#[derive(Clone, Copy, PartialEq, Eq, Default)]
pub enum SourceRefUrlPolicy {
    #[default]
    DropRef,
    RejectSpell,
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
    let mut tags: Vec<String> = spell.tags.to_vec();
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

#[derive(Debug)]
pub(crate) struct ClassifiedSpell {
    pub spell: CanonicalSpell,
    pub warnings: Vec<String>,
}

#[derive(Debug)]
pub(crate) struct ClassifiedImportPayload {
    pub spells: Vec<ClassifiedSpell>,
    pub failures: Vec<ImportSpellJsonFailure>,
}

/// Parse JSON payload and classify as SpellScribe list, canonical bundle, or single spell.
/// Classification order:
/// 1. `spells` present and not an array -> reject.
/// 2. `spellscribe_version` and `bundle_format_version`/`bundleFormatVersion` both present -> reject as ambiguous.
/// 3. `spellscribe_version` present and `spells` absent -> reject naming missing `spells` array.
/// 4. `spellscribe_version` present and not a major-version-1 string -> reject before spell mapping.
/// 5. `spellscribe_version` (major 1) and `spells` array -> SpellScribe source list.
/// 6. `spells` array without `spellscribe_version` -> canonical bundle (requires `bundle_format_version`).
/// 7. Neither -> single-spell `CanonicalSpell`.
fn parse_and_classify_payload(payload: &str) -> Result<ClassifiedImportPayload, AppError> {
    validate_import_bundle_spell_count(payload)?;

    let value: serde_json::Value = serde_json::from_str(payload)
        .map_err(|e| AppError::Import(format!("Invalid JSON: {}", e)))?;

    let obj = value
        .as_object()
        .ok_or_else(|| AppError::Import("Payload must be a JSON object".into()))?;

    let spells_val = obj.get("spells");
    // Step 1: `spells` present and not an array.
    let spells_arr = match spells_val {
        Some(v) => Some(v.as_array().ok_or_else(|| {
            AppError::Import("Bundle format requires 'spells' to be an array".into())
        })?),
        None => None,
    };

    let spellscribe_val = obj.get("spellscribe_version");
    let bundle_ver_val = obj
        .get("bundle_format_version")
        .or_else(|| obj.get("bundleFormatVersion"));

    // Step 2: Both `spellscribe_version` and `bundle_format_version` (or camelCase alias) present.
    if spellscribe_val.is_some() && bundle_ver_val.is_some() {
        return Err(AppError::Import(
            "Ambiguous import envelope: payload contains both 'spellscribe_version' and 'bundle_format_version'"
                .into(),
        ));
    }

    // Steps 3–5: `spellscribe_version` present.
    if let Some(sv_val) = spellscribe_val {
        let Some(arr) = spells_arr else {
            return Err(AppError::Import(
                "SpellScribe source list requires a 'spells' array".into(),
            ));
        };

        let sv_str = sv_val.as_str().ok_or_else(|| {
            AppError::Import(
                "Unsupported SpellScribe version: 'spellscribe_version' must be a string".into(),
            )
        })?;
        let major_str = sv_str.split('.').next().unwrap_or("");
        let major = if !major_str.is_empty() && major_str.bytes().all(|b| b.is_ascii_digit()) {
            major_str.parse::<u64>().ok()
        } else {
            None
        };
        if major != Some(1) {
            return Err(AppError::Import(format!(
                "Unsupported SpellScribe version '{}' (only major version 1 is supported)",
                sv_str
            )));
        }

        // Step 5: SpellScribe source list.
        return crate::commands::source_list::parse_spellscribe_json_list(arr);
    }

    // Step 6: Canonical bundle (`spells` array without `spellscribe_version`).
    if let Some(arr) = spells_arr {
        let version = bundle_ver_val.ok_or_else(|| {
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
            spells.push(ClassifiedSpell {
                spell,
                warnings: Vec::new(),
            });
        }
        Ok(ClassifiedImportPayload {
            spells,
            failures: Vec::new(),
        })
    } else {
        // Step 7: Single spell (re-use the parsed object as Value)
        let spell: CanonicalSpell = serde_json::from_value(value)
            .map_err(|e| AppError::Import(format!("Single spell: {}", e)))?;
        Ok(ClassifiedImportPayload {
            spells: vec![ClassifiedSpell {
                spell,
                warnings: Vec::new(),
            }],
            failures: Vec::new(),
        })
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

    let imported_hash = spell.id.take().filter(|s| !s.is_empty());
    validate_tradition_school_sphere_consistency(
        &spell.name,
        &spell.tradition,
        spell.school.as_deref(),
        spell.sphere.as_deref(),
    )
    .map_err(AppError::Import)?;
    let res = spell.normalize(None);
    if res.notes_truncated {
        return Err(AppError::Import(
            "Saving throw notes truncated during migration (exceeded limit)".into(),
        ));
    }
    let class_list = if spell.class_list.is_empty() {
        None
    } else {
        Some(spell.class_list.join(", "))
    };
    validate_epic_and_quest_spells(
        spell.level,
        &class_list,
        spell.is_quest_spell.unwrap_or(0) != 0,
        spell.is_cantrip.unwrap_or(0) != 0,
    )?;
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
    spell.id = Some(hash.clone());
    Ok((hash, warnings))
}

fn preview_classified_payload(
    classified: ClassifiedImportPayload,
    policy: SourceRefUrlPolicy,
) -> PreviewImportSpellJsonResult {
    let mut global_warnings = Vec::new();
    let mut items = Vec::with_capacity(classified.spells.len());
    let mut failures = classified.failures;
    for ClassifiedSpell {
        mut spell,
        warnings: mut item_warnings,
    } in classified.spells
    {
        let mut url_warnings = Vec::new();
        if process_source_ref_urls(&mut spell, policy, &mut url_warnings).is_err() {
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
        normalize_truncate_metadata(&mut spell);
        match process_spell(&mut spell) {
            Ok((content_hash, proc_warnings)) => {
                for w in &item_warnings {
                    global_warnings.push(format!("Spell '{}': {}", spell.name, w));
                }
                for pw in &proc_warnings {
                    global_warnings.push(pw.clone());
                }
                item_warnings.extend(proc_warnings);
                items.push(PreviewSpellJsonItem {
                    spell,
                    content_hash,
                    warnings: item_warnings,
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
    PreviewImportSpellJsonResult {
        spells: items,
        warnings: global_warnings,
        failures,
    }
}

fn classify_import_input(
    payload: Option<String>,
    markdown_files: Option<Vec<ImportMarkdownFile>>,
) -> Result<ClassifiedImportPayload, AppError> {
    let md_files = markdown_files.filter(|files| !files.is_empty());
    match (payload, md_files) {
        (Some(_), Some(_)) => Err(AppError::Import(
            "Provide either payload or markdownFiles, not both".to_string(),
        )),
        (None, None) => Err(AppError::Import(
            "Provide either payload or non-empty markdownFiles".to_string(),
        )),
        (Some(json_payload), None) => {
            validate_import_payload_guardrails(&json_payload)?;
            parse_and_classify_payload(&json_payload)
        }
        (None, Some(files)) => {
            let mut total_bytes: usize = 0;
            for file in &files {
                total_bytes = total_bytes.saturating_add(file.content.len());
                if total_bytes > MAX_IMPORT_PAYLOAD_BYTES {
                    return Err(AppError::Import(format!(
                        "Import payload exceeds maximum allowed size of 100 MB (received {} bytes)",
                        total_bytes
                    )));
                }
            }

            let mut total_sections: usize = 0;
            for file in &files {
                total_sections = total_sections.saturating_add(
                    crate::commands::source_list::count_markdown_spell_sections(
                        &file.name,
                        &file.content,
                    )?,
                );
                if total_sections > MAX_IMPORT_BUNDLE_SPELLS {
                    return Err(AppError::Import(format!(
                        "Bundle exceeds maximum of 10,000 spells (received {})",
                        total_sections
                    )));
                }
            }

            let mut all_spells = Vec::new();
            let mut all_failures = Vec::new();
            for file in &files {
                let parsed = crate::commands::source_list::parse_markdown_spell_list(
                    &file.name,
                    &file.content,
                )?;
                all_spells.extend(parsed.spells);
                all_failures.extend(parsed.failures);
            }

            Ok(ClassifiedImportPayload {
                spells: all_spells,
                failures: all_failures,
            })
        }
    }
}

#[tauri::command]
pub async fn preview_import_spell_json(
    payload: Option<String>,
    markdown_files: Option<Vec<ImportMarkdownFile>>,
    source_ref_url_policy: Option<String>,
) -> Result<PreviewImportSpellJsonResult, AppError> {
    let policy = parse_source_ref_url_policy(source_ref_url_policy.as_deref());
    let classified = classify_import_input(payload, markdown_files)?;
    Ok(preview_classified_payload(classified, policy))
}

fn format_flat_components(components: Option<&SpellComponents>) -> Option<String> {
    let comp = components?;
    let mut parts = Vec::new();
    if comp.verbal {
        parts.push("V");
    }
    if comp.somatic {
        parts.push("S");
    }
    if comp.material {
        parts.push("M");
    }
    if comp.focus {
        parts.push("F");
    }
    if comp.divine_focus {
        parts.push("DF");
    }
    if comp.experience {
        // ComponentsParser::parse_components parses an undelimited single token
        // char-by-char except "df"; emit "E" when experience is the sole flag so
        // sync_check_spell round-trips cleanly.
        if parts.is_empty() {
            parts.push("E");
        } else {
            parts.push("XP");
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(", "))
    }
}

fn format_flat_material_components(materials: Option<&[MaterialComponentSpec]>) -> Option<String> {
    let items = materials.filter(|list| !list.is_empty())?;
    let formatted: Vec<String> = items
        .iter()
        .map(|m| {
            let q = m.quantity.unwrap_or(1.0);
            let qty_str = if (q - 1.0).abs() > f64::EPSILON {
                if q.fract() == 0.0 {
                    format!(" x{}", q as i64)
                } else {
                    format!(" x{}", q)
                }
            } else {
                String::new()
            };
            let gp_str = match m.gp_value {
                Some(gp) => {
                    if gp.fract() == 0.0 {
                        format!(" ({} gp)", gp as i64)
                    } else {
                        format!(" ({} gp)", gp)
                    }
                }
                None => String::new(),
            };
            let consumed_str = if m.is_consumed.unwrap_or(false) {
                " (consumed)"
            } else {
                ""
            };
            format!("{}{}{}{}", m.name, qty_str, gp_str, consumed_str)
        })
        .collect();
    Some(formatted.join("; "))
}

/// Build flat column values from CanonicalSpell for INSERT (name, level, description, etc.).
#[allow(clippy::type_complexity)]
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
    let components = format_flat_components(spell.components.as_ref());
    let material_components = format_flat_material_components(spell.material_components.as_deref());
    let source = spell.source_refs.first().map(|r| r.book.clone());
    (
        spell.name.clone(),
        spell.school.clone(),
        spell.sphere.clone(),
        class_list,
        spell.level,
        range,
        components,
        material_components,
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
    let components = format_flat_components(incoming.components.as_ref());
    let material_components =
        format_flat_material_components(incoming.material_components.as_deref());
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
    push_opt(&mut changes, "components", &old.components, &components);
    push_opt(
        &mut changes,
        "material_components",
        &old.material_components,
        &material_components,
    );
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

/// Normalize a clone of `spell`, preserve `schema_version`, set `id = Some(hash)`,
/// and serialize the full `CanonicalSpell` JSON for SQLite `canonical_data` and vault storage.
fn serialize_full_normalized_canonical_spell(
    spell: &CanonicalSpell,
    hash: &str,
) -> Result<String, AppError> {
    let mut normalized = spell.clone();
    let res = normalized.normalize(None);
    if res.notes_truncated {
        return Err(AppError::Import(
            "Saving throw notes truncated during migration (exceeded limit)".into(),
        ));
    }
    if normalized.schema_version < CURRENT_SCHEMA_VERSION {
        normalized.schema_version = CURRENT_SCHEMA_VERSION;
    }
    normalized.id = Some(hash.to_string());
    serde_json::to_string(&normalized).map_err(|e| AppError::Import(e.to_string()))
}

/// Replace existing spell row with incoming data; cascade spell_content_hash if columns exist; log changes.
/// Fails if new content_hash already exists as a different spell. Call inside an open transaction.
/// Returns `(stored_hash, canonical_json)` (with `stored_hash` from spell's `compute_hash` and
/// `canonical_json` as full normalized JSON) so callers can refresh the vault for that hash.
fn replace_with_new_impl(
    tx: &rusqlite::Connection,
    existing_id: i64,
    old_hash: Option<&str>,
    _incoming_hash_unused: &str,
    item: &PreviewSpellJsonItem,
) -> Result<(String, String), AppError> {
    if existing_id <= 0 {
        return Err(AppError::Import(
            "replace_with_new: invalid existing_id".into(),
        ));
    }
    // We recompute the hash from the canonical payload rather than trusting _incoming_hash_unused
    // to ensure complete integrity before saving to the DB and vault.
    let stored_hash = item.spell.compute_hash().map_err(AppError::Import)?;
    let canonical_json = serialize_full_normalized_canonical_spell(&item.spell, &stored_hash)?;
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
        components,
        material_components,
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
            components,
            material_components,
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
        if crate::db::table_has_column(tx, "character_class_spell", "spell_content_hash") {
            let n = tx.execute(
                "UPDATE character_class_spell SET spell_content_hash = ? WHERE spell_content_hash = ?",
                params![&stored_hash, old_h],
            )?;
            if n > 0 {
                // optional: log if we want
            }
        }
        if crate::db::table_has_column(tx, "artifact", "spell_content_hash") {
            let _ = tx.execute(
                "UPDATE artifact SET spell_content_hash = ? WHERE spell_content_hash = ?",
                params![&stored_hash, old_h],
            )?;
        }
    }
    log_changes(tx, existing_id, changes)?;
    Ok((stored_hash, canonical_json))
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
    let mut vault_spell_json_to_refresh: HashMap<String, String> = HashMap::new();

    let mut tx = conn.unchecked_transaction().map_err(AppError::Database)?;

    for mut item in items {
        let res = (|| -> Result<(), AppError> {
            let (content_hash, _warnings) = process_spell(&mut item.spell)?;
            item.content_hash = content_hash.clone();
            let name = item.spell.name.clone();
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
                    vault_spell_json_to_refresh
                        .insert(content_hash.clone(), merged_canonical.clone());
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
            let skip_merge_for_replace_resolution =
                existing_by_hash.as_ref().is_some_and(|(spell_id, _, _)| {
                    resolve_options.as_ref().is_some_and(|o| {
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
                        vault_spell_json_to_refresh
                            .insert(content_hash.clone(), merged_canonical.clone());
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
                                let (stored_hash, canon_json) = replace_with_new_impl(
                                    &sp,
                                    existing_id,
                                    old_h,
                                    &content_hash,
                                    &item,
                                )?;
                                seen_hash_in_batch.insert(stored_hash.clone(), existing_id);
                                conflicts_resolved.replace_count += 1;
                                vault_spell_json_to_refresh.insert(stored_hash.clone(), canon_json);
                                migration_manager::sync_check_spell(&sp, existing_id);
                                if let Ok(Some(detail)) = get_spell_from_conn(&sp, existing_id) {
                                    imported_spells.push(detail);
                                }
                            }
                            "keep_both" => {
                                let unique_name =
                                    find_unique_name_for_keep_both(&sp, &name, &keep_both_names)?;
                                keep_both_names.insert(unique_name.clone());
                                let mut spell_clone = item.spell.clone();
                                spell_clone.name = unique_name;
                                spell_clone.id = None;
                                let (keep_both_hash, _warnings) = process_spell(&mut spell_clone)?;
                                let canon_json = serialize_full_normalized_canonical_spell(
                                    &spell_clone,
                                    &keep_both_hash,
                                )?;
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
                                        row.22, canon_json, keep_both_hash.clone(), row.23,
                                    ],
                                )?;
                                let new_id = sp.last_insert_rowid();
                                seen_hash_in_batch.insert(keep_both_hash.clone(), new_id);
                                conflicts_resolved.keep_both_count += 1;
                                imported_count += 1;
                                vault_spell_json_to_refresh
                                    .insert(keep_both_hash.clone(), canon_json.clone());
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

            // 4) New spell: INSERT. Use processed full normalized JSON and computed hash.
            let canon_json = serialize_full_normalized_canonical_spell(&item.spell, &content_hash)?;
            let stored_hash = content_hash.clone();
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
            vault_spell_json_to_refresh.insert(content_hash.clone(), canon_json.clone());

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

    // Commit the database transaction first so the DB is consistent before touching the filesystem.
    tx.commit().map_err(AppError::Database)?;

    let root = app_data_dir()?;
    // Best-effort: vault files are non-critical metadata; surface the error but do not
    // attempt to roll back the already-committed DB transaction.
    write_pending_vault_files(
        &root,
        vault_spell_json_to_refresh
            .iter()
            .map(|(content_hash, canonical_json)| (content_hash.as_str(), canonical_json.as_str())),
    )?;

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
    let import_guard = maintenance_state.start_import()?;
    let result = apply_import_spell_json_impl(conn, items, resolve_options)?;
    let changed_count = result.imported_count
        + result.duplicates_skipped.merged_count
        + result
            .conflicts_resolved
            .as_ref()
            .map_or(0, |resolved| resolved.replace_count);
    if changed_count == 0 {
        drop(import_guard);
        return Ok(result);
    }

    let _gc_guard = import_guard.into_gc_guard()?;
    run_post_import_gc_if_needed(conn, root, changed_count)?;
    Ok(result)
}

fn run_post_import_gc_if_needed(
    conn: &rusqlite::Connection,
    root: &std::path::Path,
    changed_count: usize,
) -> Result<(), AppError> {
    if changed_count == 0 {
        return Ok(());
    }

    let _ = run_vault_gc_with_root(conn, root)?;
    Ok(())
}

fn cleanup_written_vault_files(paths: &[PathBuf]) {
    for path in paths {
        let _ = fs::remove_file(path);
    }
}

fn write_pending_vault_files<I, H, J>(
    root: &std::path::Path,
    entries: I,
) -> Result<Vec<PathBuf>, AppError>
where
    I: IntoIterator<Item = (H, J)>,
    H: AsRef<str>,
    J: AsRef<str>,
{
    let mut written_paths = Vec::new();
    for (content_hash, canonical_json) in entries {
        match write_spell_json_atomically(root, content_hash.as_ref(), canonical_json.as_ref()) {
            Ok(path) => written_paths.push(path),
            Err(err) => {
                cleanup_written_vault_files(&written_paths);
                return Err(err);
            }
        }
    }
    Ok(written_paths)
}

#[cfg(test)]
fn run_legacy_import_chunk_transaction<T>(
    conn: &rusqlite::Connection,
    operation: impl FnOnce(&rusqlite::Connection) -> Result<T, AppError>,
) -> Result<T, AppError> {
    conn.execute_batch("BEGIN IMMEDIATE TRANSACTION")
        .map_err(AppError::Database)?;

    match operation(conn) {
        Ok(value) => {
            conn.execute_batch("COMMIT").map_err(AppError::Database)?;
            Ok(value)
        }
        Err(err) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(err)
        }
    }
}

fn run_legacy_import_chunk_with_vault_writes<T>(
    conn: &rusqlite::Connection,
    root: &std::path::Path,
    operation: impl FnOnce(&rusqlite::Connection) -> Result<(T, Vec<PendingVaultSpellWrite>), AppError>,
) -> Result<T, AppError> {
    conn.execute_batch("BEGIN IMMEDIATE TRANSACTION")
        .map_err(AppError::Database)?;

    match operation(conn) {
        Ok((value, pending_vault_writes)) => {
            let written_paths = match write_pending_vault_files(
                root,
                pending_vault_writes.iter().map(|pending| {
                    (
                        pending.content_hash.as_str(),
                        pending.canonical_json.as_str(),
                    )
                }),
            ) {
                Ok(paths) => paths,
                Err(err) => {
                    let _ = conn.execute_batch("ROLLBACK");
                    return Err(err);
                }
            };

            if let Err(err) = conn.execute_batch("COMMIT").map_err(AppError::Database) {
                cleanup_written_vault_files(&written_paths);
                let _ = conn.execute_batch("ROLLBACK");
                return Err(err);
            }

            Ok(value)
        }
        Err(err) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(err)
        }
    }
}

struct PendingVaultSpellWrite {
    content_hash: String,
    canonical_json: String,
}

fn spell_update_from_import_spell(id: i64, spell: &ImportSpell) -> SpellUpdate {
    SpellUpdate {
        id,
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
        ..Default::default()
    }
}

fn upsert_import_artifact(
    conn: &rusqlite::Connection,
    spell_id: i64,
    spell_content_hash: &str,
    artifact: &ImportArtifact,
) -> Result<(), AppError> {
    if crate::db::table_has_column(conn, "artifact", "spell_content_hash") {
        let updated = conn.execute(
            "UPDATE artifact
             SET type = ?, hash = ?, imported_at = ?, spell_content_hash = ?
             WHERE spell_id = ? AND path = ?",
            params![
                artifact.r#type,
                artifact.hash,
                artifact.imported_at,
                spell_content_hash,
                spell_id,
                artifact.path
            ],
        )?;
        if updated == 0 {
            conn.execute(
                "INSERT INTO artifact (spell_id, type, path, hash, imported_at, spell_content_hash)
                 VALUES (?, ?, ?, ?, ?, ?)",
                params![
                    spell_id,
                    artifact.r#type,
                    artifact.path,
                    artifact.hash,
                    artifact.imported_at,
                    spell_content_hash
                ],
            )?;
        }
        return Ok(());
    }

    let updated = conn.execute(
        "UPDATE artifact
         SET type = ?, hash = ?, imported_at = ?
         WHERE spell_id = ? AND path = ?",
        params![
            artifact.r#type,
            artifact.hash,
            artifact.imported_at,
            spell_id,
            artifact.path
        ],
    )?;
    if updated == 0 {
        conn.execute(
            "INSERT INTO artifact (spell_id, type, path, hash, imported_at) VALUES (?, ?, ?, ?, ?)",
            params![
                spell_id,
                artifact.r#type,
                artifact.path,
                artifact.hash,
                artifact.imported_at
            ],
        )?;
    }
    Ok(())
}

fn apply_legacy_conflict_resolution_update(
    conn: &rusqlite::Connection,
    spell: &SpellUpdate,
) -> Result<PendingVaultSpellWrite, AppError> {
    let old_spell = get_spell_from_conn(conn, spell.id)?
        .ok_or_else(|| AppError::Validation("conflict resolution spell not found".into()))?;
    let old_hash = old_spell.content_hash.clone();
    let changes = diff_spells(&old_spell, spell);

    let detail = SpellDetail {
        id: Some(spell.id),
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
        schema_version: None,
        artifacts: None,
        canonical_data: None,
        content_hash: None,
        range_spec: spell.range_spec.clone(),
        components_spec: spell.components_spec.clone(),
        material_components_spec: spell.material_components_spec.clone(),
        casting_time_spec: spell.casting_time_spec.clone(),
        duration_spec: spell.duration_spec.clone(),
        area_spec: spell.area_spec.clone(),
        saving_throw_spec: spell.saving_throw_spec.clone(),
        damage_spec: spell.damage_spec.clone(),
        magic_resistance_spec: spell.magic_resistance_spec.clone(),
    };
    let (canonical, new_hash, canonical_json) = canonicalize_spell_detail(detail)?;

    conn.execute(
        "UPDATE spell SET name=?, school=?, sphere=?, class_list=?, level=?, range=?,
         components=?, material_components=?, casting_time=?, duration=?, area=?,
         saving_throw=?, damage=?, magic_resistance=?, reversible=?, description=?,
         tags=?, source=?, edition=?, author=?, license=?, is_quest_spell=?,
         is_cantrip=?, updated_at=?, canonical_data=?, content_hash=?,
         schema_version=? WHERE id=?",
        params![
            spell.name,
            spell.school,
            spell.sphere,
            spell.class_list,
            spell.level,
            spell.range,
            spell.components,
            spell.material_components,
            spell.casting_time,
            spell.duration,
            spell.area,
            spell.saving_throw,
            spell.damage,
            spell.magic_resistance,
            spell.reversible.unwrap_or(0),
            spell.description,
            spell.tags,
            spell.source,
            spell.edition,
            spell.author,
            spell.license,
            spell.is_quest_spell,
            spell.is_cantrip,
            Utc::now().to_rfc3339(),
            canonical_json.clone(),
            new_hash.clone(),
            canonical.schema_version,
            spell.id,
        ],
    )?;

    if let Some(old_hash) = old_hash.as_deref() {
        if old_hash != new_hash {
            if crate::db::table_has_column(conn, "character_class_spell", "spell_content_hash") {
                conn.execute(
                    "UPDATE character_class_spell SET spell_content_hash = ? WHERE spell_content_hash = ?",
                    params![new_hash, old_hash],
                )?;
            }
            if crate::db::table_has_column(conn, "artifact", "spell_content_hash") {
                conn.execute(
                    "UPDATE artifact SET spell_content_hash = ? WHERE spell_content_hash = ?",
                    params![new_hash, old_hash],
                )?;
            }
        }
    }

    log_changes(conn, spell.id, changes)?;
    migration_manager::sync_check_spell(conn, spell.id);

    Ok(PendingVaultSpellWrite {
        content_hash: new_hash,
        canonical_json,
    })
}

fn resolve_import_conflicts_with_conn_and_root(
    conn: &rusqlite::Connection,
    root: &std::path::Path,
    resolutions: Vec<ImportConflictResolution>,
) -> Result<ResolveImportResult, AppError> {
    run_legacy_import_chunk_with_vault_writes(conn, root, |tx| {
        let mut resolved = Vec::new();
        let mut skipped = Vec::new();
        let warnings = Vec::new();
        let mut pending_vault_writes = Vec::new();

        for resolution in resolutions {
            let step = match resolution.action.as_str() {
                "skip" => {
                    if let Some(existing_spell) = get_spell_from_conn(tx, resolution.existing_id)? {
                        skipped.push(existing_spell.name);
                    }
                    Ok(())
                }
                "overwrite" | "merge" => {
                    let spell = resolution.spell.ok_or_else(|| {
                        AppError::Validation("missing spell for conflict resolution".into())
                    })?;
                    if spell.id != resolution.existing_id {
                        return Err(AppError::Validation(
                            "conflict resolution id mismatch".into(),
                        ));
                    }

                    let vault_write = apply_legacy_conflict_resolution_update(tx, &spell)?;
                    pending_vault_writes.push(vault_write);
                    resolved.push(spell.name.clone());

                    if let Some(artifact) = resolution.artifact {
                        upsert_import_artifact(
                            tx,
                            spell.id,
                            &pending_vault_writes
                                .last()
                                .expect("pending vault write for resolved spell")
                                .content_hash,
                            &artifact,
                        )?;
                    }
                    Ok(())
                }
                _ => Err(AppError::Validation(format!(
                    "Unknown conflict resolution action: {}",
                    resolution.action
                ))),
            };

            step?;
        }

        Ok((
            ResolveImportResult {
                resolved,
                skipped,
                warnings,
            },
            pending_vault_writes,
        ))
    })
}

#[cfg(test)]
fn run_with_import_maintenance<T>(
    maintenance_state: &VaultMaintenanceState,
    operation: impl FnOnce() -> Result<T, AppError>,
) -> Result<T, AppError> {
    let _import_guard = maintenance_state.start_import()?;
    operation()
}

/// Dedup spell embedding enqueue rows by spell id; later entries win.
fn dedup_import_embedding_rows(rows: Vec<(i64, String, String)>) -> Vec<(i64, String, String)> {
    let mut by_id: HashMap<i64, (i64, String, String)> = HashMap::new();
    for row in rows {
        by_id.insert(row.0, row);
    }
    by_id.into_values().collect()
}

#[tauri::command]
pub async fn import_spell_json(
    state: State<'_, Arc<Pool>>,
    embedding_state: State<'_, Arc<EmbeddingState>>,
    maintenance_state: State<'_, Arc<VaultMaintenanceState>>,
    payload: Option<String>,
    markdown_files: Option<Vec<ImportMarkdownFile>>,
    source_ref_url_policy: Option<String>,
) -> Result<ImportSpellJsonResult, AppError> {
    let preview = preview_import_spell_json(payload, markdown_files, source_ref_url_policy).await?;
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
    let imported_for_embeddings = dedup_import_embedding_rows(
        out.imported_spells
            .iter()
            .filter_map(|spell| {
                spell
                    .id
                    .map(|id| (id, spell.name.clone(), spell.description.clone()))
            })
            .collect(),
    );
    enqueue_import_embeddings_if_ready(
        Arc::clone(embedding_state.inner()),
        Arc::clone(state.inner()),
        imported_for_embeddings,
    )
    .await?;
    Ok(out)
}

/// Resolve JSON import conflicts: same payload/markdownFiles as import_spell_json, plus resolutions and optional default_action.
/// Runs preview then apply with the given resolve options (per-conflict resolutions and/or skip_all/replace_all/keep_all).
#[tauri::command]
pub async fn resolve_import_spell_json(
    state: State<'_, Arc<Pool>>,
    embedding_state: State<'_, Arc<EmbeddingState>>,
    maintenance_state: State<'_, Arc<VaultMaintenanceState>>,
    payload: Option<String>,
    markdown_files: Option<Vec<ImportMarkdownFile>>,
    resolve_options: ImportSpellJsonResolveOptions,
    source_ref_url_policy: Option<String>,
) -> Result<ImportSpellJsonResult, AppError> {
    let preview = preview_import_spell_json(payload, markdown_files, source_ref_url_policy).await?;
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
    let imported_for_embeddings = dedup_import_embedding_rows(
        out.imported_spells
            .iter()
            .filter_map(|spell| {
                spell
                    .id
                    .map(|id| (id, spell.name.clone(), spell.description.clone()))
            })
            .collect(),
    );
    enqueue_import_embeddings_if_ready(
        Arc::clone(embedding_state.inner()),
        Arc::clone(state.inner()),
        imported_for_embeddings,
    )
    .await?;
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

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn import_files(
    state: State<'_, Arc<Pool>>,
    embedding_state: State<'_, Arc<EmbeddingState>>,
    maintenance_state: State<'_, Arc<VaultMaintenanceState>>,
    files: Vec<ImportFile>,
    allow_overwrite: bool,
    spells: Option<Vec<ImportSpell>>,
    artifacts: Option<Vec<ImportArtifact>>,
    conflicts: Option<Vec<ImportConflict>>,
) -> Result<ImportResult, AppError> {
    let pool = state.inner().clone();
    let gc_pool = pool.clone();
    let embedding_pool = Arc::clone(&pool);
    let embedding_state = embedding_state.inner().clone();
    let maintenance_state = maintenance_state.inner().clone();
    let import_guard = maintenance_state.start_import()?;
    let result = async move {
        let dir = app_data_dir()?.join("imports");
        fs::create_dir_all(&dir)?;

        // BATCH SIZE CONFIGURATION
        const BATCH_SIZE: usize = 10;

        let mut all_imported_spells = vec![];
        let mut all_artifacts = vec![];
        let mut all_conflicts = vec![];
        let mut all_warnings = vec![];
        let mut all_skipped = vec![];
        let mut mutated_spell_count = 0usize;

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
            let pool = pool.clone();
            let allow_overwrite_clone = allow_overwrite;

            let result = tokio::task::spawn_blocking(move || {
                let conn = pool.get()?;
                let root = app_data_dir()?;
                run_legacy_import_chunk_with_vault_writes(&conn, &root, |conn| {
                    let mut local_skipped = vec![];
                    let mut local_imported = vec![];
                    let mut local_vault_refresh = HashMap::new();
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
                        let vault_hash = hash.clone();
                        let vault_json = json.clone();

                        let existing_id: Option<i64> = conn.query_row(
                            "SELECT id FROM spell WHERE name = ? AND level = ? AND source IS ?",
                            params![spell.name, spell.level, spell.source],
                            |row| row.get(0),
                        ).optional()?;

                        let (spell_id, current_content_hash) = if let Some(id) = existing_id {
                            if !allow_overwrite_clone {
                                let existing_spell = get_spell_from_conn(conn, id)?.ok_or_else(|| {
                                    AppError::NotFound("Failed to fetch existing spell".into())
                                })?;

                                let source_path = spell.source_file.clone();
                                let artifact_opt = source_path
                                    .as_ref()
                                    .map(|p| normalize_key(p))
                                    .and_then(|p| artifacts_by_path.get(&p).cloned())
                                    .or_else(|| {
                                        spell_sources
                                            .get(i)
                                            .and_then(|s| s.as_ref())
                                            .and_then(|p| artifacts_by_path.get(p).cloned())
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

                            let update = spell_update_from_import_spell(id, spell);
                            let pending_write =
                                apply_legacy_conflict_resolution_update(conn, &update)?;
                            local_vault_refresh.insert(
                                pending_write.content_hash.clone(),
                                pending_write.canonical_json.clone(),
                            );
                            (id, pending_write.content_hash)
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
                            let spell_id = conn.last_insert_rowid();
                            local_vault_refresh.insert(vault_hash.clone(), vault_json.clone());
                            (spell_id, vault_hash.clone())
                        };

                        migration_manager::sync_check_spell(conn, spell_id);
                        local_imported.push(SpellDetail {
                            id: Some(spell_id),
                            name: spell.name.clone(),
                            school: spell.school.clone(),
                            level: spell.level,
                            description: spell.description.clone(),
                            source: spell.source.clone(),
                            sphere: spell.sphere.clone(),
                            class_list: spell.class_list.clone(),
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
                            tags: spell.tags.clone(),
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
                        });

                        let source_path = spell.source_file.clone();
                        let artifact_val = source_path
                            .as_ref()
                            .map(|p| normalize_key(p))
                            .and_then(|p| artifacts_by_path.get(&p))
                            .or_else(|| {
                                artifacts_by_path
                                    .get(&spell_sources.get(i).cloned().flatten().unwrap_or_default())
                            });

                        if let Some(artifact_val) = artifact_val {
                            upsert_import_artifact(
                                conn,
                                spell_id,
                                &current_content_hash,
                                artifact_val,
                            )?;
                        }
                    }

                    Ok::<(ImportResult, Vec<PendingVaultSpellWrite>), AppError>((
                        ImportResult {
                            spells: local_imported,
                            artifacts: serde_json::to_value(&parsed_artifacts)
                                .unwrap_or_default()
                                .as_array()
                                .cloned()
                                .unwrap_or_default(),
                            conflicts: local_conflicts,
                            warnings: vec![],
                            skipped: local_skipped,
                        },
                        local_vault_refresh
                            .into_iter()
                            .map(|(content_hash, canonical_json)| PendingVaultSpellWrite {
                                content_hash,
                                canonical_json,
                            })
                            .collect(),
                    ))
                })

            }).await.map_err(|e| AppError::Unknown(e.to_string()))??;

                mutated_spell_count += result.spells.len();
                all_imported_spells.extend(result.spells);
                all_conflicts.extend(result.conflicts);
                all_skipped.extend(result.skipped);
                all_artifacts.extend(result.artifacts);
            }
        } else {
            // --- PATH B: CONFIRMATION (Offsets provided) ---
            let override_spells = spells.unwrap_or_default();
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
                let pool = pool.clone();
                let chunk_spells = chunk.to_vec();
                let allow_overwrite_clone = allow_overwrite;
                let artifacts_map_clone = artifacts_by_path.clone();

                let result = tokio::task::spawn_blocking(move || {
                let conn = pool.get()?;
                let root = app_data_dir()?;
                run_legacy_import_chunk_with_vault_writes(&conn, &root, |conn| {
                    let mut local_imported = vec![];
                    let mut local_skipped = vec![];
                    let mut local_conflicts = vec![];
                    let mut local_vault_refresh = HashMap::new();

                    for spell in chunk_spells.iter() {
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
                        let vault_hash = hash.clone();
                        let vault_json = json.clone();

                        let existing_id: Option<i64> = conn.query_row(
                            "SELECT id FROM spell WHERE name = ? AND level = ? AND source IS ?",
                            params![spell.name, spell.level, spell.source],
                            |row| row.get(0),
                        ).optional()?;

                        let (spell_id, current_content_hash) = if let Some(id) = existing_id {
                            if !allow_overwrite_clone {
                                let existing_spell = get_spell_from_conn(conn, id)?
                                    .ok_or_else(|| AppError::NotFound("Failed to fetch existing spell".into()))?;
                                let fields = build_conflict_fields(&existing_spell, spell);
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
                                        artifact: artifact_opt,
                                    });
                                }
                                continue;
                            }

                            let update = spell_update_from_import_spell(id, spell);
                            let pending_write =
                                apply_legacy_conflict_resolution_update(conn, &update)?;
                            local_vault_refresh.insert(
                                pending_write.content_hash.clone(),
                                pending_write.canonical_json.clone(),
                            );
                            (id, pending_write.content_hash)
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
                            let spell_id = conn.last_insert_rowid();
                            local_vault_refresh.insert(vault_hash.clone(), vault_json.clone());
                            (spell_id, vault_hash.clone())
                        };

                        migration_manager::sync_check_spell(conn, spell_id);
                        local_imported.push(SpellDetail {
                            id: Some(spell_id),
                            name: spell.name.clone(),
                            school: spell.school.clone(),
                            level: spell.level,
                            description: spell.description.clone(),
                            source: spell.source.clone(),
                            sphere: spell.sphere.clone(),
                            class_list: spell.class_list.clone(),
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
                            tags: spell.tags.clone(),
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
                        });

                        let source_path = spell.source_file.clone();
                        if let Some(p) = source_path {
                            if let Some(artifact_val) = artifacts_map_clone.get(&normalize_key(&p)) {
                                upsert_import_artifact(
                                    conn,
                                    spell_id,
                                    &current_content_hash,
                                    artifact_val,
                                )?;
                            }
                        }
                    }

                    Ok::<(ImportResult, Vec<PendingVaultSpellWrite>), AppError>((
                        ImportResult {
                            spells: local_imported,
                            artifacts: vec![],
                            conflicts: local_conflicts,
                            warnings: vec![],
                            skipped: local_skipped,
                        },
                        local_vault_refresh
                            .into_iter()
                            .map(|(content_hash, canonical_json)| PendingVaultSpellWrite {
                                content_hash,
                                canonical_json,
                            })
                            .collect(),

                    ))
                })

                }).await.map_err(|e| AppError::Unknown(e.to_string()))??;

                mutated_spell_count += result.spells.len();
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

        Ok((ImportResult {
            spells: all_imported_spells,
            artifacts: all_artifacts,
            conflicts: all_conflicts,
            warnings: all_warnings,
            skipped: all_skipped,
        }, mutated_spell_count))
    }
    .await;

    let (result, changed_count) = match result {
        Ok(value) => value,
        Err(err) => return Err(err),
    };

    let imported_for_embeddings = dedup_import_embedding_rows(
        result
            .spells
            .iter()
            .filter_map(|spell| {
                spell
                    .id
                    .map(|id| (id, spell.name.clone(), spell.description.clone()))
            })
            .collect(),
    );
    enqueue_import_embeddings_if_ready(embedding_state, embedding_pool, imported_for_embeddings)
        .await?;

    if changed_count == 0 {
        drop(import_guard);
        return Ok(result);
    }

    let _gc_guard = import_guard.into_gc_guard()?;
    tokio::task::spawn_blocking(move || {
        let conn = gc_pool.get()?;
        let root = app_data_dir()?;
        run_post_import_gc_if_needed(&conn, &root, changed_count)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn resolve_import_conflicts(
    state: State<'_, Arc<Pool>>,
    embedding_state: State<'_, Arc<EmbeddingState>>,
    maintenance_state: State<'_, Arc<VaultMaintenanceState>>,
    resolutions: Vec<ImportConflictResolution>,
) -> Result<ResolveImportResult, AppError> {
    let imported_for_embeddings = dedup_import_embedding_rows(
        resolutions
            .iter()
            .filter(|resolution| matches!(resolution.action.as_str(), "overwrite" | "merge"))
            .filter_map(|resolution| {
                resolution
                    .spell
                    .as_ref()
                    .map(|spell| (spell.id, spell.name.clone(), spell.description.clone()))
            })
            .collect(),
    );

    let pool = state.inner().clone();
    let gc_pool = pool.clone();
    let maintenance_state = maintenance_state.inner().clone();
    let import_guard = maintenance_state.start_import()?;
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let root = app_data_dir()?;
        resolve_import_conflicts_with_conn_and_root(&conn, &root, resolutions)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    enqueue_import_embeddings_if_ready(
        Arc::clone(embedding_state.inner()),
        Arc::clone(state.inner()),
        imported_for_embeddings,
    )
    .await?;

    if result.resolved.is_empty() {
        drop(import_guard);
        return Ok(result);
    }

    let changed_count = result.resolved.len();
    let _gc_guard = import_guard.into_gc_guard()?;
    tokio::task::spawn_blocking(move || {
        let conn = gc_pool.get()?;
        let root = app_data_dir()?;
        run_post_import_gc_if_needed(&conn, &root, changed_count)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(result)
}

/// Resolves the spell ID and artifact path for a given artifact row.
///
/// Uses `artifact.spell_content_hash` as the primary identifier (hash-first) and falls back
/// to `artifact.spell_id` during the migration period before `spell_id` is officially dropped.
///
/// Returns `AppError::NotFound` when neither column resolves to a live spell.
fn resolve_artifact_spell_id(
    conn: &rusqlite::Connection,
    artifact_id: i64,
) -> Result<(i64, String), AppError> {
    let has_hash_col = crate::db::table_has_column(conn, "artifact", "spell_content_hash");

    let (db_spell_id, db_spell_hash, path): (Option<i64>, Option<String>, String) = if has_hash_col
    {
        conn.query_row(
            "SELECT spell_id, spell_content_hash, path FROM artifact WHERE id = ?",
            [artifact_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(AppError::Database)?
    } else {
        conn.query_row(
            "SELECT spell_id, path FROM artifact WHERE id = ?",
            [artifact_id],
            |row| Ok((row.get::<_, Option<i64>>(0)?, None::<String>, row.get(1)?)),
        )
        .map_err(AppError::Database)?
    };

    // Hash-first: look up spell.id by content_hash; fall back to spell_id (migration period).
    // When spell_id is dropped: remove the `.or(db_spell_id)` fallback arm.
    let spell_id = if let Some(hash) = db_spell_hash {
        let found: Option<i64> = conn
            .query_row(
                "SELECT id FROM spell WHERE content_hash = ?",
                [hash.as_str()],
                |row| row.get(0),
            )
            .optional()?;
        found.or(db_spell_id).ok_or_else(|| {
            AppError::NotFound(
                "The spell referenced by this artifact is no longer in the library".into(),
            )
        })?
    } else {
        db_spell_id.ok_or_else(|| {
            AppError::NotFound(
                "The spell referenced by this artifact is no longer in the library".into(),
            )
        })?
    };

    Ok((spell_id, path))
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
            resolve_artifact_spell_id(&conn, artifact_id)
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
        .ok_or_else(|| {
            AppError::NotFound(
                "The spell referenced by this artifact is no longer in the library".to_string(),
            )
        })?
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
    use crate::commands::vault::{
        optimize_vault_with_root, VaultMaintenanceState, VaultTestEnvGuard,
    };
    use crate::models::canonical_spell::{CanonicalSpell, SourceRef};
    use rusqlite::{params, Connection};

    #[test]
    fn dedup_import_embedding_rows_keeps_last_entry_per_spell_id() {
        let rows = vec![
            (1_i64, "First".to_string(), "A".to_string()),
            (2_i64, "Two".to_string(), "B".to_string()),
            (1_i64, "Last".to_string(), "C".to_string()),
        ];
        let deduped = dedup_import_embedding_rows(rows);
        assert_eq!(deduped.len(), 2);
        let spell_one = deduped
            .iter()
            .find(|(id, _, _)| *id == 1)
            .expect("spell 1 present");
        assert_eq!(spell_one.1, "Last");
        assert_eq!(spell_one.2, "C");
    }

    fn minimal_spell_json(name: &str) -> String {
        format!(
            r#"{{"name":"{}","tradition":"ARCANE","level":1,"description":"X","school":"Abjuration"}}"#,
            name
        )
    }

    fn payload_with_exact_bytes(target_bytes: usize) -> String {
        let prefix = "{\"name\":\"Sized\",\"tradition\":\"ARCANE\",\"level\":1,\"description\":\"X\",\"school\":\"Abjuration\",\"artifacts\":[{\"id\":1,\"type\":\"source\",\"path\":\"";
        let suffix = "\",\"hash\":\"artifact-hash\"}]}";
        let path_len = target_bytes
            .checked_sub(prefix.len() + suffix.len())
            .expect("target bytes must fit minimal json envelope");
        format!("{prefix}{}{suffix}", "a".repeat(path_len))
    }

    fn bundle_payload_with_spell_count(count: usize) -> String {
        let spells: Vec<String> = (0..count)
            .map(|index| minimal_spell_json(&format!("Spell {index}")))
            .collect();
        format!(
            r#"{{"bundle_format_version":1,"spells":[{}]}}"#,
            spells.join(",")
        )
    }

    fn payload_with_total_json_depth(total_depth: usize) -> String {
        assert!(total_depth >= 1, "json depth must be at least 1");
        let mut nested = "null".to_string();
        for _ in 1..total_depth {
            nested = format!("[{nested}]");
        }
        format!(
            r#"{{"name":"Depth","tradition":"ARCANE","level":1,"description":"X","school":"Abjuration","artifacts":{nested}}}"#
        )
    }

    fn repeated_text(len: usize) -> String {
        "x".repeat(len)
    }

    fn url_with_length(len: usize) -> String {
        let prefix = "https://example.com/";
        assert!(len >= prefix.len(), "url length must include scheme prefix");
        format!("{prefix}{}", "u".repeat(len - prefix.len()))
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

    fn test_hash(spell: &CanonicalSpell) -> String {
        let mut spell = spell.clone();
        normalize_truncate_metadata(&mut spell);
        let (hash, _warnings) = process_spell(&mut spell).expect("process spell");
        hash
    }

    fn spell_update_for_test(id: i64, spell: &CanonicalSpell) -> SpellUpdate {
        SpellUpdate {
            id,
            name: spell.name.clone(),
            school: spell.school.clone(),
            sphere: None,
            class_list: None,
            level: spell.level,
            range: None,
            components: None,
            material_components: None,
            casting_time: None,
            duration: None,
            area: None,
            saving_throw: None,
            damage: None,
            magic_resistance: None,
            reversible: Some(spell.reversible.unwrap_or(0)),
            description: spell.description.clone(),
            tags: None,
            source: None,
            edition: None,
            author: None,
            license: None,
            is_quest_spell: spell.is_quest_spell.unwrap_or(0),
            is_cantrip: spell.is_cantrip.unwrap_or(0),
            ..Default::default()
        }
    }

    fn preview_item_for_test(mut spell: CanonicalSpell) -> PreviewSpellJsonItem {
        normalize_truncate_metadata(&mut spell);
        let (content_hash, warnings) = process_spell(&mut spell).expect("process spell");
        PreviewSpellJsonItem {
            spell,
            content_hash,
            warnings,
        }
    }

    fn insert_spell_for_apply_test(
        conn: &Connection,
        id: i64,
        spell: &CanonicalSpell,
        content_hash: &str,
    ) {
        let mut spell = spell.clone();
        normalize_truncate_metadata(&mut spell);
        let (_computed_hash, _warnings) = process_spell(&mut spell).expect("process spell");
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
                serde_json::to_string(&spell).expect("serialize canonical spell"),
                content_hash,
                CURRENT_SCHEMA_VERSION
            ],
        )
        .expect("insert seed spell");
    }

    #[test]
    fn test_parse_classify_single() {
        let json = minimal_spell_json("Single Spell");
        let classified = parse_and_classify_payload(&json).unwrap();
        assert_eq!(classified.spells.len(), 1);
        assert!(classified.failures.is_empty());
        assert_eq!(classified.spells[0].spell.name, "Single Spell");
    }

    #[test]
    fn test_parse_classify_bundle() {
        let json = format!(
            r#"{{"bundle_format_version":1,"spells":[{}]}}"#,
            minimal_spell_json("A")
        );
        let classified = parse_and_classify_payload(&json).unwrap();
        assert_eq!(classified.spells.len(), 1);
        assert_eq!(classified.spells[0].spell.name, "A");

        let json2 = format!(
            r#"{{"bundle_format_version":1,"spells":[{},{}]}}"#,
            minimal_spell_json("A"),
            minimal_spell_json("B")
        );
        let classified2 = parse_and_classify_payload(&json2).unwrap();
        assert_eq!(classified2.spells.len(), 2);
        assert_eq!(classified2.spells[0].spell.name, "A");
        assert_eq!(classified2.spells[1].spell.name, "B");
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
        assert_eq!(
            err.to_string(),
            "Import error: Bundle format requires 'spells' to be an array"
        );
    }

    #[test]
    fn test_classify_spellscribe_list_without_bundle_format_version() {
        let json = r#"{"version":"1.1","exported_at":"2026-06-18T13:11:31Z","spellscribe_version":"1.0.3","spells":[]}"#;
        let classified = parse_and_classify_payload(json)
            .expect("SpellScribe 1.0.3 envelope without bundle_format_version should be accepted");
        assert!(classified.spells.is_empty());
        assert!(classified.failures.is_empty());
    }

    #[test]
    fn test_classify_spells_without_spellscribe_or_bundle_version_fails() {
        let json = format!(r#"{{"spells":[{}]}}"#, minimal_spell_json("X"));
        let err = parse_and_classify_payload(&json).unwrap_err();
        assert!(
            err.to_string().contains("bundle_format_version"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn test_classify_rejects_ambiguous_envelope_snake_and_camel() {
        for key in ["bundle_format_version", "bundleFormatVersion"] {
            let json = format!(r#"{{"spellscribe_version":"1.0.3","{key}":1,"spells":[]}}"#);
            let err = parse_and_classify_payload(&json)
                .expect_err("envelope with both version keys must be rejected as ambiguous");
            assert!(
                err.to_string().to_lowercase().contains("ambiguous"),
                "expected ambiguous error for {key}, got: {err}"
            );
        }
    }

    #[test]
    fn test_classify_rejects_invalid_spellscribe_version_before_mapping() {
        let cases = [
            r#"{"spellscribe_version":1,"spells":[{"bad":"spell"}]}"#,
            r#"{"spellscribe_version":1.0,"spells":[{"bad":"spell"}]}"#,
            r#"{"spellscribe_version":null,"spells":[{"bad":"spell"}]}"#,
            r#"{"spellscribe_version":"abc.0.0","spells":[{"bad":"spell"}]}"#,
            r#"{"spellscribe_version":"","spells":[{"bad":"spell"}]}"#,
            r#"{"spellscribe_version":".1.0","spells":[{"bad":"spell"}]}"#,
            r#"{"spellscribe_version":"2.0.0","spells":[{"bad":"spell"}]}"#,
            r#"{"spellscribe_version":"0.9.0","spells":[{"bad":"spell"}]}"#,
        ];

        for json in cases {
            let err = parse_and_classify_payload(json)
                .expect_err("unsupported spellscribe_version must reject before mapping");
            let msg = err.to_string().to_lowercase();
            assert!(
                msg.contains("spellscribe") && msg.contains("version"),
                "expected unsupported SpellScribe version error for {json}, got: {err}"
            );
        }
    }

    #[test]
    fn test_classify_rejects_spellscribe_without_spells_array() {
        let json = r#"{"spellscribe_version":"1.0.3","name":"Single","tradition":"ARCANE","level":1,"description":"X","school":"Abjuration"}"#;
        let err = parse_and_classify_payload(json)
            .expect_err("spellscribe_version without spells must not fall through to single spell");
        let msg = err.to_string().to_lowercase();
        assert!(
            msg.contains("spells") && msg.contains("array"),
            "expected missing spells array error, got: {err}"
        );
    }

    #[test]
    fn test_classify_rejects_non_array_spells_with_and_without_spellscribe() {
        for json in [
            r#"{"spellscribe_version":"1.0.3","spells":"not-an-array"}"#,
            r#"{"spellscribe_version":"1.0.3","spells":null}"#,
            r#"{"spellscribe_version":"1.0.3","spells":{"a":1}}"#,
            r#"{"spellscribe_version":"1.0.3","spells":123}"#,
            r#"{"spellscribe_version":"1.0.3","spells":true}"#,
            r#"{"bundle_format_version":1,"spells":"not-an-array"}"#,
            r#"{"bundle_format_version":1,"spells":null}"#,
            r#"{"bundle_format_version":1,"spells":{"nested":[1,2]},"extra":"after"}"#,
            r#"{"bundle_format_version":1,"spells":-5}"#,
            r#"{"bundle_format_version":1,"spells":1.5}"#,
            r#"{"bundle_format_version":1,"spells":false}"#,
            r#"{"spells":"not-an-array"}"#,
            r#"{"bundle_format_version":1,"spells":[],"spells":"not-an-array"}"#,
        ] {
            let err =
                parse_and_classify_payload(json).expect_err("non-array spells must be rejected");
            assert_eq!(
                err.to_string(),
                "Import error: Bundle format requires 'spells' to be an array",
                "expected Bundle format spells-array error for {json}, got: {err}"
            );
        }

        let dup_valid = r#"{"bundle_format_version":1,"spells":"not-an-array","spells":[]}"#;
        let classified = parse_and_classify_payload(dup_valid)
            .expect("duplicate spells key ending in empty array should parse as empty bundle");
        assert!(classified.spells.is_empty());
    }

    #[test]
    fn test_parse_classify_rejects_non_object_json_roots() {
        for json in [
            "[]",
            r#"[1,{"spells":[1,2]}]"#,
            r#""text""#,
            "123",
            "-5",
            "1.5",
            "null",
            "true",
            "false",
        ] {
            let err = parse_and_classify_payload(json)
                .expect_err("non-object JSON root must be rejected");
            assert_eq!(
                err.to_string(),
                "Import error: Payload must be a JSON object",
                "expected JSON object error for {json}, got: {err}"
            );
        }
    }

    #[test]
    fn test_parse_classify_rejects_invalid_json_syntax() {
        for json in [
            "",
            "{",
            "[1, 2",
            "{} trailing",
            "[] trailing",
            r#"{"spells":[1,]}"#,
            r#"{"spells":{"a":}}"#,
        ] {
            let err =
                parse_and_classify_payload(json).expect_err("invalid JSON syntax must be rejected");
            assert!(
                err.to_string().starts_with("Import error: Invalid JSON:"),
                "expected Invalid JSON error for {json}, got: {err}"
            );
        }
    }

    #[test]
    fn test_classify_canonical_single_and_bundle_still_deny_unknown_fields() {
        let single_err = parse_and_classify_payload(
            r#"{"name":"Single","tradition":"ARCANE","level":1,"description":"X","school":"Abjuration","extra_unknown":1}"#,
        )
        .expect_err("canonical single spell must continue rejecting unknown fields");
        assert!(single_err.to_string().contains("unknown field"));

        let bundle_err = parse_and_classify_payload(
            r#"{"bundle_format_version":1,"spells":[{"name":"Bundled","tradition":"ARCANE","level":1,"description":"X","school":"Abjuration","extra_unknown":1}]}"#,
        )
        .expect_err("canonical bundle spell must continue rejecting unknown fields");
        assert!(bundle_err.to_string().contains("unknown field"));
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
    fn test_process_spell_rejects_tradition_inconsistent_school_sphere_without_rewriting() {
        let mut spell = test_spell("Malformed Import", 1, "Desc");
        spell.sphere = Some("Combat".to_string());

        let err = process_spell(&mut spell).expect_err(
            "import processing should reject mutually exclusive school/sphere instead of normalizing them away",
        );

        assert!(
            err.to_string().contains("mutually exclusive"),
            "unexpected error: {err}"
        );
        assert_eq!(
            spell.sphere.as_deref(),
            Some("Combat"),
            "rejected import payload must not be silently rewritten"
        );
        assert_eq!(
            spell.id, None,
            "rejected import should not stamp a content hash"
        );
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
        let json = r#"{"name":"WithBadUrl","tradition":"ARCANE","level":1,"description":"X","school":"Abjuration","sourceRefs":[{"book":"PHB","url":"javascript:alert(1)"}]}"#.to_string();
        let result = tauri::async_runtime::block_on(preview_import_spell_json(
            Some(json),
            None,
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
        let json = r#"{"name":"RejectMe","tradition":"ARCANE","level":1,"description":"X","school":"Abjuration","sourceRefs":[{"book":"PHB","url":"data:text/html,evil"}]}"#.to_string();
        let result = tauri::async_runtime::block_on(preview_import_spell_json(
            Some(json),
            None,
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
        let json = r#"{"name":"Good","tradition":"ARCANE","level":1,"description":"X","school":"Abjuration","sourceRefs":[{"book":"PHB","url":"https://example.com/ref"}]}"#.to_string();
        let result =
            tauri::async_runtime::block_on(preview_import_spell_json(Some(json), None, None))
                .unwrap();
        assert_eq!(result.spells.len(), 1);
        assert_eq!(result.spells[0].spell.source_refs.len(), 1);
        assert_eq!(
            result.spells[0].spell.source_refs[0].url.as_deref(),
            Some("https://example.com/ref")
        );
    }

    #[test]
    fn test_preview_rejects_payload_larger_than_100_mb() {
        let payload = payload_with_exact_bytes((100 * 1024 * 1024) + 1);

        let err =
            tauri::async_runtime::block_on(preview_import_spell_json(Some(payload), None, None))
                .expect_err("payloads over 100 MB should be rejected");

        assert!(
            err.to_string().contains("100 MB"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn test_preview_accepts_payload_just_below_100_mb() {
        let payload = payload_with_exact_bytes((100 * 1024 * 1024) - 1);

        let result =
            tauri::async_runtime::block_on(preview_import_spell_json(Some(payload), None, None))
                .expect("payload just below 100 MB should be accepted");

        assert_eq!(result.spells.len(), 1);
        assert!(
            result.failures.is_empty(),
            "unexpected failures: {:?}",
            result.failures
        );
    }

    #[test]
    fn test_preview_accepts_payload_exactly_100_mb() {
        let payload = payload_with_exact_bytes(100 * 1024 * 1024);

        let result =
            tauri::async_runtime::block_on(preview_import_spell_json(Some(payload), None, None))
                .expect("payload at exactly 100 MB should be accepted");

        assert_eq!(result.spells.len(), 1);
        assert!(
            result.failures.is_empty(),
            "unexpected failures: {:?}",
            result.failures
        );
    }

    #[test]
    fn test_preview_import_rejects_oversized_top_level_text_fields() {
        let cases = [
            (
                "name",
                json!({
                    "name": repeated_text(257),
                    "tradition": "ARCANE",
                    "level": 1,
                    "description": "X",
                    "school": "Abjuration"
                }),
                "/name",
            ),
            (
                "description",
                json!({
                    "name": "Oversized Description",
                    "tradition": "ARCANE",
                    "level": 1,
                    "description": repeated_text(16_385),
                    "school": "Abjuration"
                }),
                "/description",
            ),
            (
                "author",
                json!({
                    "name": "Oversized Author",
                    "tradition": "ARCANE",
                    "level": 1,
                    "description": "X",
                    "school": "Abjuration",
                    "author": repeated_text(257)
                }),
                "/author",
            ),
        ];

        for (field_name, payload, expected_path) in cases {
            let result = tauri::async_runtime::block_on(preview_import_spell_json(
                Some(payload.to_string()),
                None,
                None,
            ))
            .expect("preview should classify oversized fields as failures");

            assert!(
                result.spells.is_empty(),
                "{field_name} should be rejected before preview output"
            );
            assert_eq!(
                result.failures.len(),
                1,
                "{field_name} should produce exactly one failure"
            );
            assert!(
                result.failures[0].reason.contains(expected_path),
                "expected {field_name} failure to mention {expected_path}, got: {}",
                result.failures[0].reason
            );
        }
    }

    #[test]
    fn test_preview_import_rejects_oversized_source_ref_text_fields() {
        let cases = [
            (
                "system",
                json!({
                    "name": "Oversized SourceRef System",
                    "tradition": "ARCANE",
                    "level": 1,
                    "description": "X",
                    "school": "Abjuration",
                    "sourceRefs": [{
                        "system": repeated_text(129),
                        "book": "PHB"
                    }]
                }),
                "/source_refs/0/system",
            ),
            (
                "book",
                json!({
                    "name": "Oversized SourceRef Book",
                    "tradition": "ARCANE",
                    "level": 1,
                    "description": "X",
                    "school": "Abjuration",
                    "sourceRefs": [{
                        "system": "AD&D 2e",
                        "book": repeated_text(513)
                    }]
                }),
                "/source_refs/0/book",
            ),
            (
                "note",
                json!({
                    "name": "Oversized SourceRef Note",
                    "tradition": "ARCANE",
                    "level": 1,
                    "description": "X",
                    "school": "Abjuration",
                    "sourceRefs": [{
                        "system": "AD&D 2e",
                        "book": "PHB",
                        "note": repeated_text(2_049)
                    }]
                }),
                "/source_refs/0/note",
            ),
            (
                "url",
                json!({
                    "name": "Oversized SourceRef Url",
                    "tradition": "ARCANE",
                    "level": 1,
                    "description": "X",
                    "school": "Abjuration",
                    "sourceRefs": [{
                        "system": "AD&D 2e",
                        "book": "PHB",
                        "url": url_with_length(2_049)
                    }]
                }),
                "/source_refs/0/url",
            ),
        ];

        for (field_name, payload, expected_path) in cases {
            let result = tauri::async_runtime::block_on(preview_import_spell_json(
                Some(payload.to_string()),
                None,
                None,
            ))
            .expect("preview should classify oversized SourceRef fields as failures");

            assert!(
                result.spells.is_empty(),
                "{field_name} should not survive preview"
            );
            assert_eq!(
                result.failures.len(),
                1,
                "{field_name} should produce exactly one failure"
            );
            assert!(
                result.failures[0].reason.contains(expected_path),
                "expected {field_name} failure to mention {expected_path}, got: {}",
                result.failures[0].reason
            );
        }
    }

    #[test]
    fn test_import_accepts_exact_boundary_text_fields() {
        let temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");

        let conn = setup_import_apply_test_db();
        create_change_log_table(&conn);
        create_hash_reference_tables(&conn);
        let maintenance_state = VaultMaintenanceState::default();

        let mut spell = CanonicalSpell::new(
            repeated_text(256),
            2,
            "ARCANE".to_string(),
            repeated_text(16_384),
        );
        spell.school = Some("Abjuration".to_string());
        spell.author = Some(repeated_text(256));
        spell.source_refs = vec![SourceRef {
            system: Some(repeated_text(128)),
            book: repeated_text(512),
            page: None,
            note: Some(repeated_text(2_048)),
            url: Some(url_with_length(2_048)),
        }];

        let preview = tauri::async_runtime::block_on(preview_import_spell_json(
            Some(serde_json::to_string(&spell).expect("serialize boundary spell")),
            None,
            None,
        ))
        .expect("preview should accept exact-boundary spell");

        assert_eq!(preview.spells.len(), 1);
        assert!(
            preview.failures.is_empty(),
            "unexpected preview failures: {:?}",
            preview.failures
        );

        let result = apply_import_spell_json_with_maintenance(
            &conn,
            temp_dir.path(),
            &maintenance_state,
            preview.spells,
            None,
        )
        .expect("import should accept exact-boundary spell");

        assert_eq!(result.imported_count, 1);
        assert!(
            result.failures.is_empty(),
            "unexpected import failures: {:?}",
            result.failures
        );
    }

    #[test]
    fn test_apply_import_rejects_oversized_top_level_text_fields_on_execution_path() {
        let conn = setup_import_apply_test_db();

        let oversized_item = PreviewSpellJsonItem {
            spell: CanonicalSpell {
                name: repeated_text(257),
                tradition: "ARCANE".to_string(),
                level: 1,
                description: "Valid description".to_string(),
                school: Some("Abjuration".to_string()),
                version: "2.0.0".to_string(),
                ..Default::default()
            },
            content_hash: "a".repeat(64),
            warnings: vec![],
        };

        let result = apply_import_spell_json_impl(&conn, vec![oversized_item], None)
            .expect("execution path should classify oversized fields as failures");

        assert_eq!(result.imported_count, 0);
        assert_eq!(result.failures.len(), 1);
        assert!(
            result.failures[0].reason.contains("/name"),
            "unexpected failure: {}",
            result.failures[0].reason
        );

        let spell_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM spell", [], |row| row.get(0))
            .expect("query spell count");
        assert_eq!(spell_count, 0, "rejected import must not insert a row");
    }

    #[test]
    fn test_apply_import_rejects_epic_divine_spell_on_execution_path() {
        let conn = setup_import_apply_test_db();

        let invalid_item = PreviewSpellJsonItem {
            spell: CanonicalSpell {
                name: "Improper Epic Priest Spell".to_string(),
                tradition: "ARCANE".to_string(),
                level: 10,
                description: "Should be rejected by shared business rules".to_string(),
                school: Some("Abjuration".to_string()),
                class_list: vec!["Priest".to_string()],
                version: "2.0.0".to_string(),
                ..Default::default()
            },
            content_hash: "b".repeat(64),
            warnings: vec![],
        };

        let result = apply_import_spell_json_impl(&conn, vec![invalid_item], None)
            .expect("execution path should classify shared rule violations as failures");

        assert_eq!(result.imported_count, 0);
        assert_eq!(result.failures.len(), 1);
        assert!(
            result.failures[0]
                .reason
                .contains("restricted to Arcane casters"),
            "unexpected failure: {}",
            result.failures[0].reason
        );

        let spell_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM spell", [], |row| row.get(0))
            .expect("query spell count");
        assert_eq!(spell_count, 0, "invalid import must not insert a row");
    }

    #[test]
    fn test_parse_and_classify_payload_rejects_bundle_larger_than_10000_spells() {
        let payload = bundle_payload_with_spell_count(10_001);

        let err = parse_and_classify_payload(&payload)
            .expect_err("bundles over 10,000 spells should be rejected");

        assert!(
            err.to_string().contains("10,000"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn test_parse_and_classify_payload_accepts_bundle_with_10000_spells() {
        let payload = bundle_payload_with_spell_count(10_000);

        let classified = parse_and_classify_payload(&payload)
            .expect("bundle at 10,000 spells should be accepted");

        assert_eq!(classified.spells.len(), 10_000);
        assert!(classified.failures.is_empty());
    }

    #[test]
    fn test_canonical_spell_to_flat_row_populates_components_and_roundtrips_sync_check() {
        let _temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");
        let conn = setup_import_apply_test_db();
        create_change_log_table(&conn);
        create_hash_reference_tables(&conn);

        let mut spell = test_spell("Component Roundtrip", 3, "VSM test");
        spell.components = Some(SpellComponents {
            verbal: true,
            somatic: true,
            material: true,
            focus: false,
            divine_focus: false,
            experience: false,
        });
        spell.material_components = Some(vec![MaterialComponentSpec {
            name: "a pinch of sulfur".to_string(),
            quantity: Some(1.0),
            unit: None,
            gp_value: Some(50.0),
            is_consumed: Some(true),
            description: None,
        }]);

        let row = canonical_spell_to_flat_row(&spell);
        assert_eq!(row.6.as_deref(), Some("V, S, M"));
        assert_eq!(
            row.7.as_deref(),
            Some("a pinch of sulfur (50 gp) (consumed)")
        );

        let result = apply_import_spell_json_impl(&conn, vec![preview_item_for_test(spell)], None)
            .expect("apply import");
        assert_eq!(result.imported_count, 1);

        let (stored_components, stored_materials): (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT components, material_components FROM spell WHERE name = 'Component Roundtrip'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .expect("query inserted flat components");
        assert_eq!(stored_components.as_deref(), Some("V, S, M"));
        assert_eq!(
            stored_materials.as_deref(),
            Some("a pinch of sulfur (50 gp) (consumed)")
        );

        // Verify sole-experience component formats as "E" so SpellParser::parse_components roundtrips.
        let exp_only = SpellComponents {
            verbal: false,
            somatic: false,
            material: false,
            focus: false,
            divine_focus: false,
            experience: true,
        };
        let exp_flat = format_flat_components(Some(&exp_only)).expect("sole experience");
        assert_eq!(exp_flat, "E");
        assert_eq!(
            crate::utils::spell_parser::SpellParser::new().parse_components(&exp_flat),
            exp_only
        );
    }

    #[test]
    fn test_preview_rejects_json_nesting_deeper_than_50_levels() {
        let payload = payload_with_total_json_depth(51);

        let err =
            tauri::async_runtime::block_on(preview_import_spell_json(Some(payload), None, None))
                .expect_err("json deeper than 50 levels should be rejected");

        assert!(err.to_string().contains("depth"), "unexpected error: {err}");
        assert!(err.to_string().contains("50"), "unexpected error: {err}");
    }

    #[test]
    fn test_validate_import_json_depth_accepts_50_levels() {
        let payload = payload_with_total_json_depth(50);

        validate_import_json_depth(&payload).expect("json at 50 levels should be accepted");
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
            tauri::async_runtime::block_on(preview_import_spell_json(Some(json_id), None, None))
                .unwrap();
        let res_hash =
            tauri::async_runtime::block_on(preview_import_spell_json(Some(json_hash), None, None))
                .unwrap();
        let res_camel =
            tauri::async_runtime::block_on(preview_import_spell_json(Some(json_camel), None, None))
                .unwrap();

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

        assert_eq!(
            res_id.spells[0].spell.id,
            Some(res_id.spells[0].content_hash.clone())
        );
        assert_eq!(
            res_hash.spells[0].spell.id,
            Some(res_hash.spells[0].content_hash.clone())
        );
        assert_eq!(
            res_camel.spells[0].spell.id,
            Some(res_camel.spells[0].content_hash.clone())
        );
    }

    #[test]
    fn test_apply_import_conflict_same_name_different_level_different_hash() {
        let _temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");

        let conn = setup_import_apply_test_db();
        let existing_spell = test_spell("Mirror Veil", 1, "Existing spell");
        let incoming_spell = test_spell("Mirror Veil", 5, "Incoming spell with different content");
        let existing_hash = test_hash(&existing_spell);
        let incoming_hash = test_hash(&incoming_spell);

        insert_spell_for_apply_test(&conn, 1, &existing_spell, &existing_hash);

        let result = apply_import_spell_json_impl(
            &conn,
            vec![preview_item_for_test(incoming_spell.clone())],
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
        let temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");

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
    }

    #[test]
    fn test_apply_import_db_commit_before_vault_write() {
        // DB is committed first; vault write is a best-effort follow-up.
        // If vault write fails, the error is surfaced but the DB row remains committed.
        let long_root = std::env::temp_dir()
            .join("spellbook-import")
            .join("a".repeat(240));
        let _env = VaultTestEnvGuard::with_root(long_root.clone()).expect("set isolated vault env");

        let conn = setup_import_apply_test_db();
        create_artifact_table_for_get_spell(&conn);
        let incoming_item = preview_item_for_test(test_spell(
            "Vault Import Failure",
            4,
            "DB committed even when vault write fails",
        ));

        let err = apply_import_spell_json_impl(&conn, vec![incoming_item], None)
            .expect_err("vault write failure should surface an error");
        assert!(err.to_string().contains("Windows path length"));

        // DB row should be committed even though vault file write failed
        let spell_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM spell", [], |row| row.get(0))
            .expect("query spell count");
        assert_eq!(
            spell_count, 1,
            "DB transaction is committed before vault write; spell row must be present"
        );
    }

    #[test]
    fn test_manual_gc_is_blocked_while_import_guard_is_active() {
        let temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");

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
    fn test_run_with_import_maintenance_blocks_manual_gc_for_legacy_flows() {
        let temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");

        let conn = setup_import_apply_test_db();
        let maintenance_state = VaultMaintenanceState::default();

        let err = run_with_import_maintenance(&maintenance_state, || {
            let _ = optimize_vault_with_root(&conn, temp_dir.path(), Some(&maintenance_state))?;
            Ok::<(), AppError>(())
        })
        .expect_err("legacy import wrapper should block manual gc during active import");

        assert!(
            err.to_string().contains("import"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn test_run_post_import_gc_if_needed_removes_orphans_for_legacy_imports() {
        let temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");

        let conn = setup_import_apply_test_db();
        let live_spell = test_spell("Legacy Import Live", 2, "Live spell");
        let live_hash = test_hash(&live_spell);
        insert_spell_for_apply_test(&conn, 1, &live_spell, &live_hash);

        let orphan_hash = "l".repeat(64);
        let spells_dir = temp_dir.path().join("spells");
        std::fs::create_dir_all(&spells_dir).expect("create spells dir");
        std::fs::write(
            spells_dir.join(format!("{live_hash}.json")),
            serde_json::to_string(&live_spell).expect("serialize live spell"),
        )
        .expect("write live spell file");
        std::fs::write(
            spells_dir.join(format!("{orphan_hash}.json")),
            r#"{"name":"Orphan","tradition":"ARCANE","level":1,"description":"Orphan","school":"Abjuration"}"#,
        )
        .expect("write orphan file");

        run_post_import_gc_if_needed(&conn, temp_dir.path(), 1).expect("post-import gc should run");

        assert!(spells_dir.join(format!("{live_hash}.json")).exists());
        assert!(!spells_dir.join(format!("{orphan_hash}.json")).exists());
    }

    #[test]
    fn test_run_post_import_gc_if_needed_skips_gc_when_no_legacy_mutation() {
        let temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");

        let conn = setup_import_apply_test_db();
        let orphan_hash = "m".repeat(64);
        let spells_dir = temp_dir.path().join("spells");
        std::fs::create_dir_all(&spells_dir).expect("create spells dir");
        std::fs::write(
            spells_dir.join(format!("{orphan_hash}.json")),
            r#"{"name":"Orphan","tradition":"ARCANE","level":1,"description":"Orphan","school":"Abjuration"}"#,
        )
        .expect("write orphan file");

        run_post_import_gc_if_needed(&conn, temp_dir.path(), 0)
            .expect("post-import gc should be skipped cleanly");

        assert!(
            spells_dir.join(format!("{orphan_hash}.json")).exists(),
            "gc should not run when no legacy mutations were applied"
        );
    }

    #[test]
    fn test_resolve_import_conflicts_with_conn_and_root_overwrite_cascades_hash_references() {
        let temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");
        let conn = setup_import_apply_test_db();
        create_change_log_table(&conn);
        create_hash_reference_tables(&conn);

        let existing_spell = test_spell("Legacy Resolve", 2, "Original description");
        let updated_spell = test_spell("Legacy Resolve", 2, "Updated description");
        let old_hash = test_hash(&existing_spell);
        let new_hash = test_hash(&updated_spell);
        insert_spell_for_apply_test(&conn, 1, &existing_spell, &old_hash);
        conn.execute(
            "INSERT INTO character_class_spell (id, spell_id, spell_content_hash) VALUES (1, 1, ?)",
            params![old_hash.clone()],
        )
        .expect("seed character_class_spell hash reference");
        conn.execute(
            "INSERT INTO artifact (id, spell_id, type, path, hash, imported_at, spell_content_hash)
             VALUES (1, 1, 'pdf', 'legacy-resolve.pdf', 'artifact-hash', '2026-01-01T00:00:00Z', ?)",
            params![old_hash.clone()],
        )
        .expect("seed artifact hash reference");

        let spells_dir = temp_dir.path().join("spells");
        std::fs::create_dir_all(&spells_dir).expect("create spells dir");
        std::fs::write(
            spells_dir.join(format!("{old_hash}.json")),
            serde_json::to_string(&existing_spell).expect("serialize existing spell"),
        )
        .expect("write existing spell file");

        let result = resolve_import_conflicts_with_conn_and_root(
            &conn,
            temp_dir.path(),
            vec![ImportConflictResolution {
                action: "overwrite".to_string(),
                existing_id: 1,
                spell: Some(spell_update_for_test(1, &updated_spell)),
                artifact: None,
            }],
        )
        .expect("conflict resolution should succeed");

        assert_eq!(result.resolved.len(), 1);
        let ccs_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM character_class_spell WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query character_class_spell hash");
        assert_eq!(
            ccs_hash, new_hash,
            "legacy overwrite should cascade hash references in character_class_spell"
        );
        let artifact_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM artifact WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query artifact hash");
        assert_eq!(
            artifact_hash, new_hash,
            "legacy overwrite should cascade hash references in artifact rows"
        );
        assert!(
            spells_dir.join(format!("{new_hash}.json")).exists(),
            "updated spell should still have a live vault file"
        );
        assert!(
            spells_dir.join(format!("{old_hash}.json")).exists(),
            "helper-level resolution should leave old hash cleanup to the command-level post-import GC"
        );
    }

    #[test]
    fn test_upsert_import_artifact_persists_spell_content_hash_when_available() {
        let conn = setup_import_apply_test_db();
        create_hash_reference_tables(&conn);
        let expected_hash = "a".repeat(64);

        upsert_import_artifact(
            &conn,
            1,
            &expected_hash,
            &ImportArtifact {
                r#type: "pdf".to_string(),
                path: "spell.pdf".to_string(),
                hash: "artifact-hash".to_string(),
                imported_at: "2026-01-01T00:00:00Z".to_string(),
            },
        )
        .expect("upsert artifact");

        let stored_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM artifact WHERE spell_id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query artifact spell_content_hash");
        assert_eq!(stored_hash, expected_hash);
    }

    #[test]
    fn test_resolve_import_conflicts_with_conn_and_root_rolls_back_batch_on_error() {
        let temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");
        let conn = setup_import_apply_test_db();
        create_change_log_table(&conn);
        create_hash_reference_tables(&conn);

        let existing_spell = test_spell("Legacy Partial Resolve", 4, "Original description");
        let updated_spell = test_spell("Legacy Partial Resolve", 4, "Updated description");
        let old_hash = test_hash(&existing_spell);
        let new_hash = test_hash(&updated_spell);
        insert_spell_for_apply_test(&conn, 1, &existing_spell, &old_hash);
        conn.execute(
            "INSERT INTO character_class_spell (id, spell_id, spell_content_hash) VALUES (1, 1, ?)",
            params![old_hash.clone()],
        )
        .expect("seed character_class_spell hash reference");
        conn.execute(
            "INSERT INTO artifact (id, spell_id, type, path, hash, imported_at, spell_content_hash)
             VALUES (1, 1, 'pdf', 'legacy-partial.pdf', 'artifact-hash', '2026-01-01T00:00:00Z', ?)",
            params![old_hash.clone()],
        )
        .expect("seed artifact hash reference");

        let spells_dir = temp_dir.path().join("spells");
        std::fs::create_dir_all(&spells_dir).expect("create spells dir");
        std::fs::write(
            spells_dir.join(format!("{old_hash}.json")),
            serde_json::to_string(&existing_spell).expect("serialize existing spell"),
        )
        .expect("write existing spell file");

        let err = resolve_import_conflicts_with_conn_and_root(
            &conn,
            temp_dir.path(),
            vec![
                ImportConflictResolution {
                    action: "overwrite".to_string(),
                    existing_id: 1,
                    spell: Some(spell_update_for_test(1, &updated_spell)),
                    artifact: None,
                },
                ImportConflictResolution {
                    action: "bogus".to_string(),
                    existing_id: 1,
                    spell: None,
                    artifact: None,
                },
            ],
        )
        .expect_err("helper should still return the later validation error");

        assert!(
            err.to_string()
                .contains("Unknown conflict resolution action"),
            "unexpected error: {err}"
        );
        let stored_hash: String = conn
            .query_row("SELECT content_hash FROM spell WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("query stored spell hash");
        assert_eq!(
            stored_hash, old_hash,
            "failed legacy resolution batch must roll back spell row mutations"
        );
        let ccs_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM character_class_spell WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query character_class_spell hash after rollback");
        assert_eq!(
            ccs_hash, old_hash,
            "failed legacy resolution batch must roll back character_class_spell cascades"
        );
        let artifact_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM artifact WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query artifact hash after rollback");
        assert_eq!(
            artifact_hash, old_hash,
            "failed legacy resolution batch must roll back artifact cascades"
        );
        assert!(
            !spells_dir.join(format!("{new_hash}.json")).exists(),
            "failed legacy resolution batch must not materialize a new vault file"
        );
        assert!(
            spells_dir.join(format!("{old_hash}.json")).exists(),
            "helper-level resolution should leave old hash cleanup to the command-level post-import GC"
        );
    }

    #[test]
    fn test_resolve_import_conflicts_with_conn_and_root_rolls_back_when_vault_write_fails() {
        let long_root = std::env::temp_dir()
            .join("spellbook-legacy-import")
            .join("b".repeat(400));
        let _env = VaultTestEnvGuard::with_root(long_root.clone()).expect("set isolated vault env");
        let conn = setup_import_apply_test_db();
        create_change_log_table(&conn);
        create_hash_reference_tables(&conn);

        let existing_spell = test_spell("Legacy Resolve Failure", 4, "Original description");
        let updated_spell = test_spell("Legacy Resolve Failure", 4, "Updated description");
        let old_hash = test_hash(&existing_spell);
        insert_spell_for_apply_test(&conn, 1, &existing_spell, &old_hash);
        conn.execute(
            "INSERT INTO character_class_spell (id, spell_id, spell_content_hash) VALUES (1, 1, ?)",
            params![old_hash.clone()],
        )
        .expect("seed character_class_spell hash reference");
        conn.execute(
            "INSERT INTO artifact (id, spell_id, type, path, hash, imported_at, spell_content_hash)
             VALUES (1, 1, 'pdf', 'legacy-resolve-failure.pdf', 'artifact-hash', '2026-01-01T00:00:00Z', ?)",
            params![old_hash.clone()],
        )
        .expect("seed artifact hash reference");
        let err = resolve_import_conflicts_with_conn_and_root(
            &conn,
            &long_root,
            vec![ImportConflictResolution {
                action: "overwrite".to_string(),
                existing_id: 1,
                spell: Some(spell_update_for_test(1, &updated_spell)),
                artifact: None,
            }],
        )
        .expect_err("vault write failure should roll back conflict resolution");
        assert!(err.to_string().contains("Windows path length"));

        let stored_description: String = conn
            .query_row("SELECT description FROM spell WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("query spell description");
        let stored_hash: String = conn
            .query_row("SELECT content_hash FROM spell WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("query spell hash");
        let class_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM character_class_spell WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query character_class_spell hash");
        let artifact_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM artifact WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query artifact hash");

        assert_eq!(stored_description, "Original description");
        assert_eq!(stored_hash, old_hash);
        assert_eq!(class_hash, old_hash);
        assert_eq!(artifact_hash, old_hash);
    }

    #[test]
    fn test_run_legacy_import_chunk_transaction_rolls_back_partial_mutations() {
        let _temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");
        let conn = setup_import_apply_test_db();
        create_change_log_table(&conn);
        create_hash_reference_tables(&conn);
        let existing_spell = test_spell("Legacy Chunk Rollback", 3, "Original description");
        let existing_hash = test_hash(&existing_spell);
        let updated_spell = test_spell("Legacy Chunk Rollback", 3, "Updated description");
        let updated_hash = test_hash(&updated_spell);
        insert_spell_for_apply_test(&conn, 1, &existing_spell, &existing_hash);

        let err = run_legacy_import_chunk_transaction(&conn, |conn| {
            conn.execute(
                "UPDATE spell SET description = ?, canonical_data = ?, content_hash = ? WHERE id = 1",
                params![
                    updated_spell.description,
                    serde_json::to_string(&updated_spell).expect("serialize updated spell"),
                    updated_hash
                ],
            )?;
            Err::<(), AppError>(AppError::Validation("boom".to_string()))
        })
        .expect_err("transaction helper should return the operation error");

        assert!(err.to_string().contains("boom"), "unexpected error: {err}");

        let stored_hash: String = conn
            .query_row("SELECT content_hash FROM spell WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("query stored hash");
        assert_eq!(
            stored_hash, existing_hash,
            "failed chunk should roll back to the original live hash"
        );
    }

    #[test]
    fn test_successful_import_triggers_post_import_gc() {
        let temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");

        let conn = setup_import_apply_test_db();
        create_change_log_table(&conn);
        create_hash_reference_tables(&conn);
        let maintenance_state = VaultMaintenanceState::default();
        let orphan_hash = "y".repeat(64);
        let spells_dir = temp_dir.path().join("spells");
        std::fs::create_dir_all(&spells_dir).expect("create spells dir");
        std::fs::write(
            spells_dir.join(format!("{orphan_hash}.json")),
            r#"{"name":"Orphan","tradition":"ARCANE","level":1,"description":"Orphan","school":"Abjuration"}"#,
        )
        .expect("write orphan file");
        let imported_item = preview_item_for_test(test_spell("GC Trigger", 2, "Should trigger GC"));

        let result = apply_import_spell_json_with_maintenance(
            &conn,
            temp_dir.path(),
            &maintenance_state,
            vec![imported_item],
            None,
        )
        .expect("import should succeed");

        assert_eq!(result.imported_count, 1);
        assert!(
            !spells_dir.join(format!("{orphan_hash}.json")).exists(),
            "post-import gc should remove orphaned spell files"
        );
    }

    #[test]
    fn test_import_conflict_does_not_trigger_post_import_gc() {
        let temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");

        let conn = setup_import_apply_test_db();
        create_artifact_table_for_get_spell(&conn);
        let maintenance_state = VaultMaintenanceState::default();
        let existing_spell = test_spell("Conflict Spell", 1, "Existing");
        let existing_hash = test_hash(&existing_spell);
        insert_spell_for_apply_test(&conn, 1, &existing_spell, &existing_hash);

        let orphan_hash = "2".repeat(64);
        let spells_dir = temp_dir.path().join("spells");
        std::fs::create_dir_all(&spells_dir).expect("create spells dir");
        std::fs::write(
            spells_dir.join(format!("{orphan_hash}.json")),
            r#"{"name":"Orphan","tradition":"ARCANE","level":1,"description":"Orphan","school":"Abjuration"}"#,
        )
        .expect("write orphan file");
        let incoming_item =
            preview_item_for_test(test_spell("Conflict Spell", 3, "Incoming conflict"));

        let result = apply_import_spell_json_with_maintenance(
            &conn,
            temp_dir.path(),
            &maintenance_state,
            vec![incoming_item],
            None,
        )
        .expect("conflict-only import should return result");

        assert_eq!(result.imported_count, 0);
        assert_eq!(result.conflicts.len(), 1);
        assert!(
            spells_dir.join(format!("{orphan_hash}.json")).exists(),
            "conflict-only import should not trigger post-import gc"
        );
    }

    #[test]
    fn test_replace_only_import_triggers_post_import_gc() {
        let temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");

        let conn = setup_import_apply_test_db();
        let maintenance_state = VaultMaintenanceState::default();
        create_change_log_table(&conn);
        create_hash_reference_tables(&conn);

        let existing_spell = test_spell("Replace GC", 4, "Original description");
        let existing_hash = test_hash(&existing_spell);
        insert_spell_for_apply_test(&conn, 1, &existing_spell, &existing_hash);

        let spells_dir = temp_dir.path().join("spells");
        std::fs::create_dir_all(&spells_dir).expect("create spells dir");
        std::fs::write(
            spells_dir.join(format!("{existing_hash}.json")),
            serde_json::to_string(&existing_spell).expect("serialize existing spell"),
        )
        .expect("write existing spell file");

        let incoming_item =
            preview_item_for_test(test_spell("Replace GC", 4, "Updated description"));
        let new_hash = incoming_item.content_hash.clone();
        let resolve_options = ImportSpellJsonResolveOptions {
            resolutions: vec![ImportSpellJsonConflictResolution {
                existing_id: 1,
                incoming_content_hash: new_hash.clone(),
                action: "replace_with_new".to_string(),
            }],
            default_action: None,
        };

        let result = apply_import_spell_json_with_maintenance(
            &conn,
            temp_dir.path(),
            &maintenance_state,
            vec![incoming_item],
            Some(resolve_options),
        )
        .expect("replace import should succeed");

        assert_eq!(
            result.imported_count, 0,
            "replace should not count as a new insert"
        );
        assert_eq!(
            result
                .conflicts_resolved
                .as_ref()
                .expect("resolved counts")
                .replace_count,
            1
        );
        assert!(
            !spells_dir.join(format!("{existing_hash}.json")).exists(),
            "replace-only imports should still trigger post-import GC"
        );
        assert!(
            spells_dir.join(format!("{new_hash}.json")).exists(),
            "new hash file should remain after replace"
        );
    }

    #[test]
    fn test_preview_import_rewrites_tampered_id_to_recomputed_hash() {
        let mut incoming_spell = test_spell("Tampered Id", 2, "Import payload");
        incoming_spell.id = Some("x".repeat(64));
        let payload = serde_json::to_string(&incoming_spell).expect("serialize incoming spell");

        let preview =
            tauri::async_runtime::block_on(preview_import_spell_json(Some(payload), None, None))
                .expect("preview import");

        assert_eq!(preview.spells.len(), 1);
        let stored_spell = &preview.spells[0].spell;
        assert_eq!(
            stored_spell.id.as_deref(),
            Some(preview.spells[0].content_hash.as_str()),
            "preview items should carry the trusted recomputed content hash in spell.id"
        );
    }

    #[test]
    fn test_apply_import_same_hash_dedups_before_name_conflict() {
        let _temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");

        let conn = setup_import_apply_test_db();
        let existing_spell = test_spell("Storm Cage", 1, "Existing spell");
        let mut incoming_spell = test_spell("Storm Cage", 1, "Existing spell");
        incoming_spell.source_refs = vec![SourceRef {
            system: Some("AD&D 2e".to_string()),
            book: "PHB".to_string(),
            page: Some(serde_json::json!("42")),
            url: None,
            note: None,
        }];
        let shared_hash = test_hash(&existing_spell);
        let incoming_item = preview_item_for_test(incoming_spell);

        insert_spell_for_apply_test(&conn, 1, &existing_spell, &shared_hash);

        let result = apply_import_spell_json_impl(&conn, vec![incoming_item], None)
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
        let _temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");

        let conn = setup_import_apply_test_db();
        let existing_spell = test_spell("Echo Ward", 2, "Existing spell");
        let shared_hash = test_hash(&existing_spell);

        insert_spell_for_apply_test(&conn, 1, &existing_spell, &shared_hash);

        let mut first_incoming = test_spell("Echo Ward", 2, "Existing spell");
        first_incoming.source_refs = vec![SourceRef {
            system: Some("AD&D 2e".to_string()),
            book: "Tome of Magic".to_string(),
            page: Some(serde_json::json!("55")),
            url: None,
            note: None,
        }];
        let mut second_incoming = test_spell("Echo Ward", 2, "Existing spell");
        second_incoming.source_refs = first_incoming.source_refs.clone();
        let first_item = preview_item_for_test(first_incoming);
        let second_item = preview_item_for_test(second_incoming);

        let result = apply_import_spell_json_impl(&conn, vec![first_item, second_item], None)
            .expect("apply import should succeed");

        assert_eq!(
            result.imported_count, 0,
            "dedup path should not insert rows"
        );
        assert_eq!(result.duplicates_skipped.total, 2);
        assert_eq!(result.duplicates_skipped.merged_count, 1);
        assert_eq!(result.duplicates_skipped.no_change_count, 1);
    }

    #[test]
    fn test_apply_import_conflict_resolution_branches_keep_replace_keep_both() {
        let _temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");
        let conn = setup_import_apply_test_db();
        create_change_log_table(&conn);
        create_hash_reference_tables(&conn);

        let keep_existing_spell = test_spell("Aegis Shell", 1, "Keep me");
        let replace_existing_spell = test_spell("Moon Lance", 3, "Old replace target");
        let keep_both_existing_spell = test_spell("Twin Flame", 4, "Original twin");
        let keep_existing_hash = test_hash(&keep_existing_spell);
        let replace_old_hash = test_hash(&replace_existing_spell);
        let keep_both_existing_hash = test_hash(&keep_both_existing_spell);

        insert_spell_for_apply_test(&conn, 1, &keep_existing_spell, &keep_existing_hash);
        insert_spell_for_apply_test(&conn, 2, &replace_existing_spell, &replace_old_hash);
        insert_spell_for_apply_test(
            &conn,
            3,
            &keep_both_existing_spell,
            &keep_both_existing_hash,
        );
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
        let keep_existing_item = preview_item_for_test(keep_existing_incoming);
        let replace_item = preview_item_for_test(replace_incoming.clone());
        let keep_both_item = preview_item_for_test(keep_both_incoming.clone());
        let keep_existing_incoming_hash = keep_existing_item.content_hash.clone();
        let _replace_new_hash_prev = replace_item.content_hash.clone();
        let _keep_both_new_hash_prev = keep_both_item.content_hash.clone();
        let mut renamed_keep_both_spell = keep_both_item.spell.clone();
        renamed_keep_both_spell.name = "Twin Flame (1)".to_string();
        let renamed_keep_both_hash = test_hash(&renamed_keep_both_spell);
        let replace_new_hash = replace_incoming.compute_hash().expect("replace spell hash");
        let mut keep_both_spell_with_suffix = keep_both_incoming.clone();
        keep_both_spell_with_suffix.name = "Twin Flame (1)".to_string();
        let _keep_both_new_hash = keep_both_spell_with_suffix
            .compute_hash()
            .expect("keep_both spell hash");

        let resolve_options = ImportSpellJsonResolveOptions {
            resolutions: vec![
                ImportSpellJsonConflictResolution {
                    existing_id: 1,
                    incoming_content_hash: keep_existing_incoming_hash.clone(),
                    action: "keep_existing".to_string(),
                },
                ImportSpellJsonConflictResolution {
                    existing_id: 2,
                    incoming_content_hash: replace_new_hash.clone(),
                    action: "replace_with_new".to_string(),
                },
                ImportSpellJsonConflictResolution {
                    existing_id: 3,
                    incoming_content_hash: keep_both_item.content_hash.clone(),
                    action: "keep_both".to_string(),
                },
            ],
            default_action: None,
        };

        let result = apply_import_spell_json_impl(
            &conn,
            vec![keep_existing_item, replace_item, keep_both_item],
            Some(resolve_options),
        )
        .expect("apply import should succeed");

        assert!(
            result.conflicts.is_empty(),
            "all conflicts should be resolved"
        );
        assert_eq!(result.imported_count, 1, "keep_both should insert one row");

        let resolved = result
            .conflicts_resolved
            .expect("resolution counters should be present");
        assert_eq!(resolved.keep_existing_count, 1);
        assert_eq!(resolved.replace_count, 1);
        assert_eq!(resolved.keep_both_count, 1);

        let kept_hash: String = conn
            .query_row("SELECT content_hash FROM spell WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("query keep_existing hash");
        assert_eq!(
            kept_hash, keep_existing_hash,
            "keep_existing should not mutate row"
        );

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
                params![renamed_keep_both_hash],
                |row| row.get(0),
            )
            .expect("query keep_both row");
        assert_eq!(keep_both_name, "Twin Flame (1)");
    }

    #[test]
    fn test_keep_both_suffix_is_name_global_across_levels() {
        let _temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");
        let conn = setup_import_apply_test_db();

        let base_spell = test_spell("Cross Fire", 1, "Original");
        let existing_suffixed_other_level = test_spell("Cross Fire (1)", 9, "Higher level variant");
        let base_hash = test_hash(&base_spell);
        let existing_suffixed_hash = test_hash(&existing_suffixed_other_level);
        insert_spell_for_apply_test(&conn, 1, &base_spell, &base_hash);
        insert_spell_for_apply_test(
            &conn,
            2,
            &existing_suffixed_other_level,
            &existing_suffixed_hash,
        );

        let incoming_item = preview_item_for_test(test_spell("Cross Fire", 3, "Incoming variant"));
        let mut renamed_incoming_spell = incoming_item.spell.clone();
        renamed_incoming_spell.name = "Cross Fire (2)".to_string();
        let renamed_hash = test_hash(&renamed_incoming_spell);

        let incoming = test_spell("Cross Fire", 3, "Incoming variant");
        let mut incoming_suffixed = incoming.clone();
        incoming_suffixed.name = "Cross Fire (2)".to_string();
        let _new_hash = incoming_suffixed
            .compute_hash()
            .expect("keep_both stored hash");
        let resolve_options = ImportSpellJsonResolveOptions {
            resolutions: vec![ImportSpellJsonConflictResolution {
                existing_id: 1,
                incoming_content_hash: incoming_item.content_hash.clone(), // Use original incoming hash to match conflict resolution
                action: "keep_both".to_string(),
            }],
            default_action: None,
        };

        let result =
            apply_import_spell_json_impl(&conn, vec![incoming_item], Some(resolve_options))
                .expect("apply import should succeed");

        assert_eq!(result.imported_count, 1, "keep_both should insert one row");
        let inserted_name: String = conn
            .query_row(
                "SELECT name FROM spell WHERE content_hash = ?",
                params![renamed_hash],
                |row| row.get(0),
            )
            .expect("query inserted keep_both spell");
        assert_eq!(
            inserted_name, "Cross Fire (2)",
            "suffix should increment globally by name even when (1) exists at another level"
        );
    }

    #[test]
    fn test_keep_both_rewrites_stored_id_to_renamed_hash() {
        let _temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");
        let conn = setup_import_apply_test_db();
        let existing_spell = test_spell("Keep Both Id", 3, "Existing spell");
        let existing_hash = test_hash(&existing_spell);
        insert_spell_for_apply_test(&conn, 1, &existing_spell, &existing_hash);

        let incoming_item =
            preview_item_for_test(test_spell("Keep Both Id", 4, "Incoming variant"));
        let resolve_options = ImportSpellJsonResolveOptions {
            resolutions: vec![ImportSpellJsonConflictResolution {
                existing_id: 1,
                incoming_content_hash: incoming_item.content_hash.clone(),
                action: "keep_both".to_string(),
            }],
            default_action: None,
        };

        let result =
            apply_import_spell_json_impl(&conn, vec![incoming_item], Some(resolve_options))
                .expect("apply import should succeed");

        assert_eq!(result.imported_count, 1);
        let (stored_json, stored_hash): (String, String) = conn
            .query_row(
                "SELECT canonical_data, content_hash FROM spell WHERE name = 'Keep Both Id (1)'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("query keep_both canonical json");
        let stored_spell: CanonicalSpell =
            serde_json::from_str(&stored_json).expect("deserialize keep_both spell");

        // Ensure the computed hash and stored metadata match the renamed spell's DB content_hash
        let recomputed_hash = stored_spell.compute_hash().expect("compute keep_both hash");
        assert_eq!(
            stored_hash,
            recomputed_hash,
            "keep_both should compute the renamed spell hash matching the recomputed DB content_hash"
        );
        assert_eq!(
            stored_spell.id.as_deref(),
            Some(stored_hash.as_str()),
            "keep_both canonical_data should store the renamed hash in id"
        );
        assert_eq!(
            stored_spell.schema_version, CURRENT_SCHEMA_VERSION,
            "keep_both canonical_data should retain CURRENT_SCHEMA_VERSION"
        );
    }

    #[test]
    fn test_apply_import_replace_failure_rolls_back_item_and_keeps_other_rows() {
        let _temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");
        let conn = setup_import_apply_test_db();
        create_change_log_table(&conn);
        create_hash_reference_tables(&conn);

        let replace_existing_spell = test_spell("Rune Chain", 5, "Old rune chain");
        let keep_both_existing_spell = test_spell("Solar Knot", 2, "Original knot");

        let replace_old_hash = "n".repeat(64);
        let keep_both_old_hash = "o".repeat(64);
        let _keep_both_new_hash = "q".repeat(64);

        let replace_incoming = test_spell("Rune Chain", 5, "Incoming replace should rollback");
        let replace_new_hash = replace_incoming
            .compute_hash()
            .expect("replace incoming hash");

        insert_spell_for_apply_test(&conn, 1, &replace_existing_spell, &replace_old_hash);
        insert_spell_for_apply_test(&conn, 2, &keep_both_existing_spell, &keep_both_old_hash);
        insert_spell_for_apply_test(&conn, 3, &replace_incoming.clone(), &replace_new_hash);
        conn.execute(
            "INSERT INTO character_class_spell (id, spell_id, spell_content_hash) VALUES (1, 1, ?)",
            params![replace_old_hash.clone()],
        )
        .expect("seed old character_class_spell hash reference");
        conn.execute(
            "INSERT INTO artifact (id, spell_id, type, path, hash, imported_at, spell_content_hash)
             VALUES (1, 1, 'pdf', 'dummy.pdf', 'dummyhash', '2026-01-01', ?)",
            params![replace_old_hash.clone()],
        )
        .expect("seed old artifact hash reference");
        let replace_item = preview_item_for_test(test_spell(
            "Rune Chain",
            5,
            "Incoming replace should rollback",
        ));
        let keep_both_item =
            preview_item_for_test(test_spell("Solar Knot", 2, "Incoming keep both"));
        let replace_new_hash = replace_item.content_hash.clone();
        let keep_both_new_hash = keep_both_item.content_hash.clone();
        conn.execute(
            "INSERT INTO character_class_spell (id, spell_id, spell_content_hash) VALUES (2, 99, ?)",
            params![replace_new_hash.clone()],
        )
        .expect("seed conflicting character_class_spell hash reference");

        let _keep_both_incoming = test_spell("Solar Knot", 2, "Incoming keep both");

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
            vec![keep_both_item, replace_item],
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
        assert_eq!(
            final_hash, replace_old_hash,
            "failed replace must rollback hash"
        );
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
        let artifact_rolled_back_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM artifact WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query artifact hash after rollback");
        assert_eq!(
            artifact_rolled_back_hash, replace_old_hash,
            "failed replace must rollback cascaded artifact hash update"
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
        let _temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");

        let conn = setup_import_apply_test_db();
        let existing_a = test_spell("Twin Sigil", 1, "Existing row A");
        let existing_b = test_spell("Twin Sigil", 4, "Existing row B");
        let incoming_spell = test_spell("Twin Sigil", 7, "Incoming row");
        let hash_a = test_hash(&existing_a);
        let hash_b = test_hash(&existing_b);

        insert_spell_for_apply_test(&conn, 1, &existing_a, &hash_a);
        insert_spell_for_apply_test(&conn, 2, &existing_b, &hash_b);

        let result =
            apply_import_spell_json_impl(&conn, vec![preview_item_for_test(incoming_spell)], None)
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
        let _temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");

        let conn = setup_import_apply_test_db();
        let existing_spell = test_spell("Mirror Ward", 2, "Existing target spell");
        let conflicting_spell = test_spell("Prismatic Net", 6, "Spell already using incoming hash");
        let incoming_spell = test_spell("Mirror Ward", 2, "Incoming replacement spell");
        let _old_hash = test_hash(&existing_spell);
        let _collision_hash = test_hash(&conflicting_spell);
        let collision_hash = conflicting_spell
            .compute_hash()
            .expect("conflicting spell hash");
        let old_hash = "0".repeat(64);

        insert_spell_for_apply_test(&conn, 1, &existing_spell, &old_hash);
        insert_spell_for_apply_test(&conn, 2, &conflicting_spell, &collision_hash);

        let mut item = preview_item_for_test(incoming_spell);
        item.content_hash = collision_hash.clone();
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

    // -----------------------------------------------------------------------
    // resolve_artifact_spell_id tests
    // -----------------------------------------------------------------------

    fn setup_resolve_artifact_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "CREATE TABLE spell (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '',
                level INTEGER NOT NULL DEFAULT 1,
                description TEXT NOT NULL DEFAULT '',
                content_hash TEXT
            );
            CREATE TABLE artifact (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                spell_id INTEGER,
                spell_content_hash TEXT,
                path TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'source',
                hash TEXT NOT NULL DEFAULT 'h',
                imported_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00Z'
            );",
        )
        .expect("create test schema");
        conn
    }

    #[test]
    fn test_resolve_artifact_spell_id_by_hash() {
        let conn = setup_resolve_artifact_db();
        conn.execute(
            "INSERT INTO spell (id, content_hash) VALUES (42, 'hash-xyz')",
            [],
        )
        .expect("insert spell");
        conn.execute(
            "INSERT INTO artifact (id, spell_id, spell_content_hash, path) VALUES (1, NULL, 'hash-xyz', 'a.md')",
            [],
        )
        .expect("insert artifact with hash only");

        let (spell_id, path) = resolve_artifact_spell_id(&conn, 1).expect("resolve ok");
        assert_eq!(spell_id, 42, "should resolve spell_id from hash");
        assert_eq!(path, "a.md");
    }

    #[test]
    fn test_resolve_artifact_spell_id_hash_fallback_to_spell_id() {
        // Hash set but no matching spell row → fall back to spell_id column
        let conn = setup_resolve_artifact_db();
        conn.execute(
            "INSERT INTO spell (id, content_hash) VALUES (7, 'different-hash')",
            [],
        )
        .expect("insert spell");
        conn.execute(
            "INSERT INTO artifact (id, spell_id, spell_content_hash, path) VALUES (1, 7, 'stale-hash', 'b.md')",
            [],
        )
        .expect("insert artifact with stale hash but valid spell_id");

        let (spell_id, path) = resolve_artifact_spell_id(&conn, 1).expect("resolve ok");
        assert_eq!(
            spell_id, 7,
            "should fall back to spell_id when hash not found"
        );
        assert_eq!(path, "b.md");
    }

    #[test]
    fn test_resolve_artifact_spell_id_not_found_returns_error() {
        // Neither hash nor spell_id resolves to an existing spell
        let conn = setup_resolve_artifact_db();
        conn.execute(
            "INSERT INTO artifact (id, spell_id, spell_content_hash, path) VALUES (1, NULL, 'orphan-hash', 'c.md')",
            [],
        )
        .expect("insert orphaned artifact");

        let result = resolve_artifact_spell_id(&conn, 1);
        assert!(
            matches!(result, Err(AppError::NotFound(_))),
            "should return NotFound when spell is gone"
        );
    }

    #[test]
    fn test_resolve_artifact_spell_id_legacy_no_hash_column() {
        // Old schema without spell_content_hash column — uses spell_id directly
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "CREATE TABLE spell (
                id INTEGER PRIMARY KEY,
                content_hash TEXT
            );
            CREATE TABLE artifact (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                spell_id INTEGER,
                path TEXT NOT NULL
            );",
        )
        .expect("create legacy schema");
        conn.execute("INSERT INTO spell (id, content_hash) VALUES (5, 'h')", [])
            .expect("insert spell");
        conn.execute(
            "INSERT INTO artifact (id, spell_id, path) VALUES (1, 5, 'legacy.md')",
            [],
        )
        .expect("insert legacy artifact");

        let (spell_id, path) = resolve_artifact_spell_id(&conn, 1).expect("resolve ok");
        assert_eq!(spell_id, 5);
        assert_eq!(path, "legacy.md");
    }

    #[test]
    fn test_spellscribe_netheril_json_karsus_and_proctiv_parity() {
        let payload = include_str!(
            "../../tests/fixtures/source-lists/Nethril - Empire of Magic - Wizard.json"
        );
        let classified =
            parse_and_classify_payload(payload).expect("Nethril SpellScribe JSON should classify");
        assert_eq!(
            classified.spells.len(),
            9,
            "expected all 9 Netheril spells to succeed"
        );
        assert!(
            classified.failures.is_empty(),
            "expected 0 failures in Netheril JSON, got {:?}",
            classified.failures
        );

        let parser = crate::utils::spell_parser::SpellParser::new();

        // Karsus's Avatar (first spell)
        let karsus_entry = &classified.spells[0];
        let karsus = &karsus_entry.spell;
        assert_eq!(karsus.name, "Karsus's Avatar");
        assert_eq!(karsus.tradition, "ARCANE");
        assert_eq!(karsus.level, 12);
        assert_eq!(karsus.school.as_deref(), Some("Invocation/Evocation"));
        assert_eq!(
            karsus.subschools,
            vec!["Enchantment/Charm".to_string(), "Alteration".to_string()]
        );
        assert_eq!(karsus.class_list, vec!["Wizard".to_string()]);
        let comps = karsus.components.as_ref().expect("components parsed");
        assert!(comps.verbal && comps.somatic && comps.material);
        assert!(
            karsus.material_components.is_none(),
            "Netheril V/S/M spell must not mine material components from description prose"
        );
        assert_eq!(
            karsus.casting_time,
            Some(
                crate::commands::source_list::parse_casting_time_with_editor_fallback(
                    &parser, "6 hours"
                )
            )
        );
        assert_eq!(karsus.reversible, None);
        let save = karsus.saving_throw.as_ref().expect("saving_throw present");
        assert_eq!(
            save.kind,
            crate::models::saving_throw::SavingThrowKind::DmAdjudicated
        );
        assert_eq!(save.raw_legacy_value.as_deref(), Some("Special"));
        assert_eq!(karsus.source_refs.len(), 1);
        assert_eq!(karsus.source_refs[0].book, "Nethril - Empire of Magic");
        assert_eq!(karsus.source_refs[0].page, Some(serde_json::json!(10)));
        let note = karsus.source_refs[0]
            .note
            .as_deref()
            .expect("review_notes stored in SourceRef.note");
        assert!(note.contains("Field: Mentalism"));
        assert!(
            karsus_entry.warnings.iter().any(|w| w.contains(note)),
            "warnings must include review note: {:?}",
            karsus_entry.warnings
        );
        assert!(
            !karsus.description.contains("Field: Mentalism"),
            "review_notes must be excluded from spell description"
        );

        // SpellParser parity across Netheril spells (range, duration, casting_time, area)
        assert_eq!(
            karsus.range,
            Some(
                crate::commands::source_list::parse_range_with_editor_fallback(
                    &parser,
                    "Unlimited"
                )
            )
        );
        assert_eq!(
            karsus.duration,
            Some(
                crate::commands::source_list::parse_duration_with_editor_fallback(
                    &parser,
                    "Unlimited"
                )
            )
        );
        assert_eq!(
            karsus.area,
            Some(crate::commands::source_list::parse_area_with_editor_fallback(&parser, "One god"))
        );

        // Lefeber's Weave Mythal: "3 days" casting time
        let lefeber = &classified.spells[1].spell;
        assert_eq!(lefeber.name, "Lefeber's Weave Mythal");
        assert_eq!(
            lefeber.casting_time,
            Some(parser.parse_casting_time("3 days"))
        );
        assert_eq!(
            lefeber.casting_time.as_ref().and_then(|c| c.per_level),
            None
        );

        // Proctiv's Breach Crystal Sphere: "1 turn" casting time + reversible == Some(1)
        let proctiv = &classified.spells[5].spell;
        assert_eq!(proctiv.name, "Proctiv's Breach Crystal Sphere");
        assert_eq!(
            proctiv.casting_time,
            Some(parser.parse_casting_time("1 turn"))
        );
        assert_eq!(
            proctiv.casting_time.as_ref().and_then(|c| c.per_level),
            None
        );
        assert_eq!(proctiv.reversible, Some(1));

        // Explicit check that "6 hours per level" matches SpellParser::parse_casting_time with no added per_level
        let per_level_json = r#"{
            "spellscribe_version": "1.0.0",
            "spells": [{
                "name": "Per Level Duration Casting Check",
                "tradition": "Arcane",
                "level": 3,
                "school": ["Alteration"],
                "casting_time": "6 hours per level",
                "description": "Test."
            }]
        }"#;
        let per_level_classified =
            parse_and_classify_payload(per_level_json).expect("valid per-level casting check");
        let parsed_ct = per_level_classified.spells[0]
            .spell
            .casting_time
            .as_ref()
            .expect("casting_time present");
        let expected_ct = parser.parse_casting_time("6 hours per level");
        assert_eq!(parsed_ct, &expected_ct);
        assert_eq!(parsed_ct.per_level, None);
    }

    #[test]
    fn test_spellscribe_edge_cases_divine_tradition_flags_materials_truncation_warnings() {
        let long_note = "R".repeat(crate::models::canonical_spell::SOURCE_REF_NOTE_MAX_CHARS + 50);
        let payload = serde_json::json!({
            "spellscribe_version": "1.0.3",
            "spells": [
                {
                    "name": "Omitted Arcane Inference",
                    "level": "cantrip",
                    "school": ["Abjuration", "NotASchool"],
                    "components": "V, S, M (a diamond)",
                    "description": "Cantrip with inferred Arcane tradition and dropped unknown school.",
                    "review_notes": long_note,
                    "extra_meta": "ignored"
                },
                {
                    "name": "Omitted Divine Quest",
                    "level": "quest",
                    "sphere": "All",
                    "class_list": ["Priest"],
                    "description": "Quest spell with inferred Divine tradition."
                },
                {
                    "name": "Divine Numeric Quest",
                    "tradition": "Divine",
                    "level": 8,
                    "sphere": "Healing",
                    "description": "Divine level 8 maps to quest spell."
                },
                {
                    "name": "No Material Line Prose",
                    "tradition": "Arcane",
                    "level": 1,
                    "school": "Evocation",
                    "components": ["V", "S", "M"],
                    "description": "Requires a pinch of sulfur in prose only."
                }
            ]
        })
        .to_string();

        let classified = parse_and_classify_payload(&payload).expect("classify edge cases");
        assert!(classified.failures.is_empty());
        assert_eq!(classified.spells.len(), 4);

        // 1. Omitted tradition -> ARCANE, cantrip, dropped school warning, M (...) material extraction, >2048 note truncation, Unknown book fallback
        let s0 = &classified.spells[0];
        assert_eq!(s0.spell.tradition, "ARCANE");
        assert_eq!(s0.spell.level, 0);
        assert_eq!(s0.spell.is_cantrip, Some(1));
        assert_eq!(s0.spell.school.as_deref(), Some("Abjuration"));
        assert!(s0.spell.subschools.is_empty());
        assert!(s0
            .warnings
            .iter()
            .any(|w| w.contains("NotASchool") && w.contains("unrecognized")));
        let mats = s0
            .spell
            .material_components
            .as_ref()
            .expect("M (a diamond) must extract material");
        assert!(mats.iter().any(|m| m.name.contains("diamond")));
        assert_eq!(s0.spell.source_refs.len(), 1);
        assert_eq!(s0.spell.source_refs[0].book, "Unknown");
        let stored_note = s0.spell.source_refs[0]
            .note
            .as_deref()
            .expect("note stored");
        assert_eq!(
            stored_note.chars().count(),
            crate::models::canonical_spell::SOURCE_REF_NOTE_MAX_CHARS
        );
        assert!(s0.warnings.iter().any(|w| w.contains("truncated")));

        // 2. Omitted tradition with sphere -> DIVINE + quest level
        let s1 = &classified.spells[1];
        assert_eq!(s1.spell.tradition, "DIVINE");
        assert_eq!(s1.spell.level, 8);
        assert_eq!(s1.spell.is_quest_spell, Some(1));
        assert_eq!(s1.spell.sphere.as_deref(), Some("All"));

        // 3. Explicit Divine level 8 -> is_quest_spell = Some(1)
        let s2 = &classified.spells[2];
        assert_eq!(s2.spell.tradition, "DIVINE");
        assert_eq!(s2.spell.level, 8);
        assert_eq!(s2.spell.is_quest_spell, Some(1));

        // 4. Plain M component without explicit material_components or M (...) parenthetical does not mine description prose
        let s3 = &classified.spells[3];
        assert!(s3.spell.components.as_ref().is_some_and(|c| c.material));
        assert!(s3.spell.material_components.is_none());
    }

    #[tokio::test]
    async fn test_spellscribe_synthetic_partial_failure_preview() {
        let payload =
            include_str!("../../tests/fixtures/source-lists/synthetic-spellscribe-partial.json");
        let preview = preview_import_spell_json(Some(payload.to_string()), None, None)
            .await
            .expect("partial SpellScribe list should return preview instead of hard error");

        assert_eq!(preview.spells.len(), 2, "2 of 3 synthetic spells succeed");
        assert_eq!(preview.spells[0].spell.name, "Synthetic Spark");
        assert!(preview.spells[0]
            .warnings
            .iter()
            .any(|w| w.contains("Needs review (flagged by source)")));
        assert!(preview.spells[0]
            .warnings
            .iter()
            .any(|w| w.contains("Check casting time.")));
        assert_eq!(preview.spells[1].spell.name, "Synthetic Balm");
        assert_eq!(preview.spells[1].spell.tradition, "DIVINE");

        assert_eq!(
            preview.failures.len(),
            1,
            "Synthetic Broken Arcane should fail"
        );
        assert_eq!(preview.failures[0].spell_name, "Synthetic Broken Arcane");
        assert!(!preview.warnings.is_empty());
    }

    #[tokio::test]
    async fn test_ipc_markdown_input_guardrails_and_no_json_depth_limit() {
        let md = "## Plain Spell\n- Tradition: Arcane\n- Level: 1\n- School: Abjuration\n\nBody.\n";
        let md_files = vec![ImportMarkdownFile {
            name: "plain.md".to_string(),
            content: md.to_string(),
        }];

        // Reject both payload and markdown_files
        let both_err =
            preview_import_spell_json(Some(minimal_spell_json("X")), Some(md_files.clone()), None)
                .await
                .expect_err("providing both payload and markdownFiles must fail");
        assert!(both_err.to_string().contains("not both"));

        // Reject neither / empty markdown_files
        let none_err = preview_import_spell_json(None, None, None)
            .await
            .expect_err("providing neither input must fail");
        assert!(none_err.to_string().contains("either"));

        let empty_md_err = preview_import_spell_json(None, Some(vec![]), None)
            .await
            .expect_err("empty markdownFiles must fail");
        assert!(empty_md_err.to_string().contains("either"));

        // Reject combined Markdown > 100 MB across files
        let half_over = "a".repeat((50 * 1024 * 1024) + 1);
        let oversized_files = vec![
            ImportMarkdownFile {
                name: "one.md".to_string(),
                content: format!(
                    "## One\n- Tradition: Arcane\n- Level: 1\n- School: Abjuration\n\n{half_over}"
                ),
            },
            ImportMarkdownFile {
                name: "two.md".to_string(),
                content: format!(
                    "## Two\n- Tradition: Arcane\n- Level: 1\n- School: Abjuration\n\n{half_over}"
                ),
            },
        ];
        let size_err = preview_import_spell_json(None, Some(oversized_files), None)
            .await
            .expect_err("combined markdown > 100 MB must fail");
        assert!(size_err.to_string().contains("100 MB"));

        // Reject combined Markdown > 10,000 spells across multiple files
        let make_n_spells = |prefix: &str, count: usize| {
            (0..count)
                .map(|i| {
                    format!(
                        "## {prefix} {i}\n- Tradition: Arcane\n- Level: 1\n- School: Abjuration\n\nBody.\n"
                    )
                })
                .collect::<Vec<_>>()
                .join("\n")
        };
        let too_many_md = vec![
            ImportMarkdownFile {
                name: "part1.md".to_string(),
                content: make_n_spells("PartA", 6_000),
            },
            ImportMarkdownFile {
                name: "part2.md".to_string(),
                content: make_n_spells("PartB", 4_001),
            },
        ];
        let cap_err = preview_import_spell_json(None, Some(too_many_md), None)
            .await
            .expect_err("combined markdown > 10,000 spells must fail");
        assert!(cap_err.to_string().contains("10,000"));

        // Deep JSON-like braces inside Markdown description must NOT trigger JSON depth rejection
        let deep_braces = format!("{}{}", "{".repeat(65), "}".repeat(65));
        let brace_md = vec![ImportMarkdownFile {
            name: "braces.md".to_string(),
            content: format!(
                "## Deep Braces\n- Tradition: Arcane\n- Level: 1\n- School: Abjuration\n\nText {deep_braces} end.\n"
            ),
        }];
        let ok_preview = preview_import_spell_json(None, Some(brace_md), None)
            .await
            .expect("markdown must bypass JSON depth check");
        assert_eq!(ok_preview.spells.len(), 1);
    }

    #[tokio::test]
    async fn test_multifile_markdown_preview_apply_sync_check_and_conflict_resolution() {
        let file1 = ImportMarkdownFile {
            name: "Book One.md".to_string(),
            content: "## First Spell\n- Tradition: Arcane\n- Class: Wizard\n- Level: 2\n- School: Evocation\n- Range: 30 yards\n- Components: V, S, M (a sapphire)\n- Duration: 1 round/level\n- Casting Time: 2 segments\n- Area of Effect: 10' radius\n- Saving Throw: Half\n- Source: markdown.md, p. 4\n\nFirst body.\n".to_string(),
        };
        let file2 = ImportMarkdownFile {
            name: "Book Two.md".to_string(),
            content: "## Second Spell\n- Tradition: Divine\n- Class: Priest\n- Level: 3\n- Sphere: Healing\n- Components: V, S\n- Source: markdown.md, p. 19\n\nSecond body.\n".to_string(),
        };

        let preview = preview_import_spell_json(None, Some(vec![file1, file2]), None)
            .await
            .expect("multi-file markdown preview succeeds");
        assert!(preview.failures.is_empty());
        assert_eq!(preview.spells.len(), 2);
        assert_eq!(preview.spells[0].spell.name, "First Spell");
        assert_eq!(preview.spells[0].spell.source_refs[0].book, "Book One");
        assert_eq!(
            preview.spells[0].spell.source_refs[0].page,
            Some(serde_json::json!(4))
        );
        assert_eq!(preview.spells[1].spell.name, "Second Spell");
        assert_eq!(preview.spells[1].spell.source_refs[0].book, "Book Two");
        assert_eq!(
            preview.spells[1].spell.source_refs[0].page,
            Some(serde_json::json!(19))
        );

        let _temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");
        let conn = setup_import_apply_test_db();
        create_change_log_table(&conn);
        create_hash_reference_tables(&conn);

        let first_apply = apply_import_spell_json_impl(&conn, preview.spells, None)
            .expect("apply multi-file markdown spells");
        assert_eq!(first_apply.imported_count, 2);
        assert!(first_apply.conflicts.is_empty());

        let (id1, comp1, mat1): (i64, Option<String>, Option<String>) = conn
            .query_row(
                "SELECT id, components, material_components FROM spell WHERE name = 'First Spell'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .expect("query inserted First Spell");
        assert_eq!(comp1.as_deref(), Some("V, S, M"));
        assert_eq!(mat1.as_deref(), Some("a sapphire"));
        migration_manager::sync_check_spell(&conn, id1);

        // Re-import modified "First Spell" across all three conflict resolutions
        let updated_md = vec![ImportMarkdownFile {
            name: "Book One.md".to_string(),
            content: "## First Spell\n- Tradition: Arcane\n- Class: Wizard\n- Level: 2\n- School: Evocation\n- Range: 30 yards\n- Components: V, S\n- Duration: Instantaneous\n- Casting Time: 1 segment\n- Area of Effect: One creature\n- Saving Throw: None\n- Source: Book One, p. 5\n\nUpdated body.\n".to_string(),
        }];
        let updated_preview = preview_import_spell_json(None, Some(updated_md), None)
            .await
            .expect("updated markdown preview");
        let incoming_hash = updated_preview.spells[0].content_hash.clone();

        let conflict_res =
            apply_import_spell_json_impl(&conn, updated_preview.spells.clone(), None)
                .expect("conflict detection");
        assert_eq!(conflict_res.conflicts.len(), 1);
        assert_eq!(conflict_res.conflicts[0].existing_id, id1);

        // keep_existing
        let keep_existing = apply_import_spell_json_impl(
            &conn,
            updated_preview.spells.clone(),
            Some(ImportSpellJsonResolveOptions {
                resolutions: vec![ImportSpellJsonConflictResolution {
                    existing_id: id1,
                    incoming_content_hash: incoming_hash.clone(),
                    action: "keep_existing".to_string(),
                }],
                default_action: None,
            }),
        )
        .expect("keep_existing resolution");
        assert_eq!(
            keep_existing
                .conflicts_resolved
                .as_ref()
                .expect("resolved")
                .keep_existing_count,
            1
        );

        // keep_both
        let keep_both = apply_import_spell_json_impl(
            &conn,
            updated_preview.spells.clone(),
            Some(ImportSpellJsonResolveOptions {
                resolutions: vec![ImportSpellJsonConflictResolution {
                    existing_id: id1,
                    incoming_content_hash: incoming_hash.clone(),
                    action: "keep_both".to_string(),
                }],
                default_action: None,
            }),
        )
        .expect("keep_both resolution");
        assert_eq!(
            keep_both
                .conflicts_resolved
                .as_ref()
                .expect("resolved")
                .keep_both_count,
            1
        );

        // replace_with_new
        let replace_res = apply_import_spell_json_impl(
            &conn,
            updated_preview.spells,
            Some(ImportSpellJsonResolveOptions {
                resolutions: vec![ImportSpellJsonConflictResolution {
                    existing_id: id1,
                    incoming_content_hash: incoming_hash,
                    action: "replace_with_new".to_string(),
                }],
                default_action: None,
            }),
        )
        .expect("replace_with_new resolution");
        assert_eq!(
            replace_res
                .conflicts_resolved
                .as_ref()
                .expect("resolved")
                .replace_count,
            1
        );
    }

    #[tokio::test]
    async fn test_markdown_netheril_fixture_and_cross_format_hash_parity() {
        let md =
            include_str!("../../tests/fixtures/source-lists/Nethril - Empire of Magic - Wizard.md");
        let json = include_str!(
            "../../tests/fixtures/source-lists/Nethril - Empire of Magic - Wizard.json"
        );

        let md_preview = preview_import_spell_json(
            None,
            Some(vec![ImportMarkdownFile {
                name: "Nethril - Empire of Magic - Wizard.md".to_string(),
                content: md.to_string(),
            }]),
            None,
        )
        .await
        .expect("Netheril markdown preview succeeds");

        assert!(
            md_preview.failures.is_empty(),
            "expected 0 failures in Netheril markdown, got {:?}",
            md_preview.failures
        );
        assert_eq!(md_preview.spells.len(), 9);
        assert_eq!(md_preview.spells[0].spell.name, "Karsus's Avatar");
        assert_eq!(md_preview.spells[8].spell.name, "Valdick's Spheresail");

        let karsus = &md_preview.spells[0];
        assert!(karsus
            .spell
            .description
            .contains("Karsus spent well over a decade researching this spell."));
        assert!(!karsus.spell.description.contains("### Review"));
        assert!(!karsus.spell.description.contains("Field: Mentalism"));
        assert_eq!(karsus.spell.source_refs.len(), 1);
        assert_eq!(
            karsus.spell.source_refs[0].book,
            "Nethril - Empire of Magic - Wizard"
        );
        assert_eq!(
            karsus.spell.source_refs[0].page,
            Some(serde_json::json!(10))
        );
        let karsus_note = karsus.spell.source_refs[0]
            .note
            .as_deref()
            .expect("Karsus review note stored");
        assert!(karsus_note.contains("Field: Mentalism"));
        assert!(karsus.warnings.iter().any(|w| w.contains(karsus_note)));

        let worldweave = md_preview
            .spells
            .iter()
            .find(|item| item.spell.name == "Mavin's Worldweave")
            .expect("Mavin's Worldweave present");
        assert!(worldweave
            .spell
            .description
            .contains("| | Tropic | Subtropic | Temperate | Subarctic |"));
        assert!(worldweave
            .spell
            .description
            .contains("| Arctic | 4 | 3 | 2 | 1 |"));

        let json_preview = preview_import_spell_json(Some(json.to_string()), None, None)
            .await
            .expect("Netheril JSON preview succeeds");
        assert_eq!(json_preview.spells.len(), 9);

        let json_by_name: HashMap<&str, &PreviewSpellJsonItem> = json_preview
            .spells
            .iter()
            .map(|item| (item.spell.name.as_str(), item))
            .collect();

        for md_item in &md_preview.spells {
            let name = md_item.spell.name.as_str();
            let json_item = json_by_name
                .get(name)
                .unwrap_or_else(|| panic!("missing spell '{name}' in JSON preview"));

            if name == "Proctiv's Breach Crystal Sphere" {
                assert_eq!(json_item.spell.reversible, Some(1));
                assert_eq!(md_item.spell.reversible, None);
                assert_ne!(
                    json_item.content_hash, md_item.content_hash,
                    "Proctiv differs on reversible flag between JSON and Markdown"
                );
            } else {
                assert_eq!(
                    json_item.content_hash, md_item.content_hash,
                    "Spell '{name}' must produce identical content_hash across JSON and Markdown"
                );
            }
        }
    }

    #[tokio::test]
    async fn test_markdown_synthetic_partial_failure_and_front_matter_exclusion() {
        let md = include_str!("../../tests/fixtures/source-lists/synthetic-markdown-partial.md");
        let preview = preview_import_spell_json(
            None,
            Some(vec![ImportMarkdownFile {
                name: "synthetic-markdown-partial.md".to_string(),
                content: md.to_string(),
            }]),
            None,
        )
        .await
        .expect("partial markdown preview should succeed with named failure");

        assert_eq!(preview.spells.len(), 2);
        assert_eq!(preview.spells[0].spell.name, "Synthetic Ember");
        assert_eq!(
            preview.spells[0].spell.source_refs[0].book,
            "synthetic-markdown-partial"
        );
        assert_eq!(
            preview.spells[0].spell.source_refs[0].page,
            Some(serde_json::json!(5))
        );

        assert_eq!(preview.spells[1].spell.name, "Synthetic Ward");
        assert_eq!(preview.spells[1].spell.tradition, "DIVINE");
        assert_eq!(
            preview.spells[1].spell.sphere.as_deref(),
            Some("Protection")
        );
        assert_eq!(
            preview.spells[1].spell.source_refs[0].book,
            "Synthetic Tome, Vol. 2"
        );
        assert_eq!(
            preview.spells[1].spell.source_refs[0].page,
            Some(serde_json::json!(19))
        );
        let ward_note = preview.spells[1].spell.source_refs[0]
            .note
            .as_deref()
            .expect("Synthetic Ward review note present");
        assert!(ward_note.contains("Verify sphere assignment against the supplement table."));
        assert!(preview.spells[1]
            .warnings
            .iter()
            .any(|w| w.contains(ward_note)));

        assert_eq!(preview.failures.len(), 1);
        assert_eq!(preview.failures[0].spell_name, "Synthetic Invalid Section");

        // Front-matter Markdown (with or without ## subheadings) is excluded from spell-list mode
        let fm_with_h2 = "---\nname: Single Note\n---\n\n## Subheading\nBody.\n";
        let fm_plain = "---\nname: Single Note\n---\n\nBody.\n";
        for content in [fm_with_h2, fm_plain] {
            assert!(!crate::commands::source_list::is_markdown_spell_list(
                content
            ));
            assert!(preview_import_spell_json(
                None,
                Some(vec![ImportMarkdownFile {
                    name: "single.md".to_string(),
                    content: content.to_string(),
                }]),
                None,
            )
            .await
            .is_err());
        }
    }

    fn read_persisted_spell_from_db_and_vault(
        conn: &Connection,
        vault_root: &std::path::Path,
        spell_name: &str,
    ) -> (CanonicalSpell, CanonicalSpell, String) {
        let (canonical_data, content_hash): (String, String) = conn
            .query_row(
                "SELECT canonical_data, content_hash FROM spell WHERE name = ?",
                params![spell_name],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap_or_else(|e| panic!("query persisted spell '{spell_name}': {e}"));
        let db_canon: CanonicalSpell = serde_json::from_str(&canonical_data)
            .unwrap_or_else(|e| panic!("deserialize DB canonical_data for '{spell_name}': {e}"));
        let vault_path = vault_root
            .join("spells")
            .join(format!("{content_hash}.json"));
        let vault_raw = std::fs::read_to_string(&vault_path).unwrap_or_else(|e| {
            panic!(
                "read vault file '{}' for '{spell_name}': {e}",
                vault_path.display()
            )
        });
        let vault_canon: CanonicalSpell = serde_json::from_str(&vault_raw)
            .unwrap_or_else(|e| panic!("deserialize vault JSON for '{spell_name}': {e}"));

        assert_eq!(db_canon.id.as_deref(), Some(content_hash.as_str()));
        assert_eq!(vault_canon.id.as_deref(), Some(content_hash.as_str()));
        assert_eq!(db_canon.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(vault_canon.schema_version, CURRENT_SCHEMA_VERSION);
        (db_canon, vault_canon, content_hash)
    }

    #[test]
    fn test_apply_import_retains_metadata_and_source_refs_across_insert_keep_both_and_replace() {
        let netheril_json = include_str!(
            "../../tests/fixtures/source-lists/Nethril - Empire of Magic - Wizard.json"
        );
        let netheril_md =
            include_str!("../../tests/fixtures/source-lists/Nethril - Empire of Magic - Wizard.md");
        let replace_karsus_md = "## Karsus's Avatar\n\n- Tradition: Arcane\n- Class: Wizard\n- Level: 12\n- School: Invocation/Evocation, Enchantment/Charm, Alteration\n- Range: Unlimited\n- Components: V, S, M\n- Duration: Unlimited\n- Casting Time: 6 hours\n- Area of Effect: One god\n- Saving Throw: Special\n- Source: Updated Markdown, p. 42\n\nUpdated description for replace verification.\n\n### Review\nUpdated review note for replace.\n";

        let json_preview = tauri::async_runtime::block_on(preview_import_spell_json(
            Some(netheril_json.to_string()),
            None,
            None,
        ))
        .expect("Netheril JSON preview succeeds");
        let md_preview = tauri::async_runtime::block_on(preview_import_spell_json(
            None,
            Some(vec![ImportMarkdownFile {
                name: "Nethril - Empire of Magic - Wizard.md".to_string(),
                content: netheril_md.to_string(),
            }]),
            None,
        ))
        .expect("Netheril MD preview succeeds");
        let replace_md_preview = tauri::async_runtime::block_on(preview_import_spell_json(
            None,
            Some(vec![ImportMarkdownFile {
                name: "Updated Markdown.md".to_string(),
                content: replace_karsus_md.to_string(),
            }]),
            None,
        ))
        .expect("replace MD preview succeeds");

        let temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");
        let conn = setup_import_apply_test_db();
        create_change_log_table(&conn);
        create_hash_reference_tables(&conn);

        // 1) New insert from Netheril JSON list
        let insert_res = apply_import_spell_json_impl(&conn, json_preview.spells, None)
            .expect("insert Netheril JSON spells");
        assert_eq!(insert_res.imported_count, 9);

        let (karsus_db, karsus_vault, _) =
            read_persisted_spell_from_db_and_vault(&conn, temp_dir.path(), "Karsus's Avatar");
        for canon in [&karsus_db, &karsus_vault] {
            assert_eq!(canon.source_refs.len(), 1);
            assert_eq!(canon.source_refs[0].book, "Nethril - Empire of Magic");
            assert_eq!(canon.source_refs[0].page, Some(serde_json::json!(10)));
            assert!(canon.source_refs[0]
                .note
                .as_deref()
                .is_some_and(|n| n.contains("Field: Mentalism")));
        }

        // 2) keep_both from Netheril Markdown list (Proctiv conflicts due to reversible flag difference)
        let md_proctiv = md_preview
            .spells
            .into_iter()
            .find(|item| item.spell.name == "Proctiv's Breach Crystal Sphere")
            .expect("Proctiv in MD preview");
        let md_proctiv_hash = md_proctiv.content_hash.clone();
        let existing_proctiv_id: i64 = conn
            .query_row(
                "SELECT id FROM spell WHERE name = ?",
                params!["Proctiv's Breach Crystal Sphere"],
                |row| row.get(0),
            )
            .expect("query existing Proctiv id");
        let keep_both_res = apply_import_spell_json_impl(
            &conn,
            vec![md_proctiv],
            Some(ImportSpellJsonResolveOptions {
                resolutions: vec![ImportSpellJsonConflictResolution {
                    existing_id: existing_proctiv_id,
                    incoming_content_hash: md_proctiv_hash,
                    action: "keep_both".to_string(),
                }],
                default_action: None,
            }),
        )
        .expect("keep_both MD Proctiv");
        assert_eq!(keep_both_res.imported_count, 1);

        let (proctiv_kb_db, proctiv_kb_vault, _) = read_persisted_spell_from_db_and_vault(
            &conn,
            temp_dir.path(),
            "Proctiv's Breach Crystal Sphere (1)",
        );
        for canon in [&proctiv_kb_db, &proctiv_kb_vault] {
            assert_eq!(canon.source_refs.len(), 1);
            assert_eq!(
                canon.source_refs[0].book,
                "Nethril - Empire of Magic - Wizard"
            );
            assert_eq!(canon.source_refs[0].page, Some(serde_json::json!(11)));
            assert!(canon.source_refs[0]
                .note
                .as_deref()
                .is_some_and(|n| n.contains("reverse of the spell was used")));
        }

        // 3) replace_with_new from Markdown list with ### Review
        let existing_karsus_id: i64 = conn
            .query_row(
                "SELECT id FROM spell WHERE name = ?",
                params!["Karsus's Avatar"],
                |row| row.get(0),
            )
            .expect("query existing Karsus id");
        let replace_item = replace_md_preview.spells.into_iter().next().unwrap();
        let replace_hash = replace_item.content_hash.clone();
        let replace_res = apply_import_spell_json_impl(
            &conn,
            vec![replace_item],
            Some(ImportSpellJsonResolveOptions {
                resolutions: vec![ImportSpellJsonConflictResolution {
                    existing_id: existing_karsus_id,
                    incoming_content_hash: replace_hash,
                    action: "replace_with_new".to_string(),
                }],
                default_action: None,
            }),
        )
        .expect("replace_with_new Karsus");
        assert_eq!(
            replace_res
                .conflicts_resolved
                .as_ref()
                .expect("resolved")
                .replace_count,
            1
        );

        let (karsus_rep_db, karsus_rep_vault, _) =
            read_persisted_spell_from_db_and_vault(&conn, temp_dir.path(), "Karsus's Avatar");
        for canon in [&karsus_rep_db, &karsus_rep_vault] {
            assert_eq!(canon.source_refs.len(), 1);
            assert_eq!(canon.source_refs[0].book, "Updated Markdown");
            assert_eq!(canon.source_refs[0].page, Some(serde_json::json!(42)));
            assert_eq!(
                canon.source_refs[0].note.as_deref(),
                Some("Updated review note for replace.")
            );
        }

        // 4) Non-hashed metadata (author, edition, license, source_text) also survives insert, keep_both, and replace_with_new
        let make_rich_item = |desc: &str, book: &str, page: i64, note: &str, author: &str| {
            let mut s = test_spell("Rich Metadata Spell", 3, desc);
            s.author = Some(author.to_string());
            s.edition = Some("AD&D 2e".to_string());
            s.license = Some("OGL-1.0".to_string());
            s.source_refs = vec![SourceRef {
                system: Some("AD&D 2e".to_string()),
                book: book.to_string(),
                page: Some(serde_json::json!(page)),
                note: Some(note.to_string()),
                url: None,
            }];
            s.magic_resistance = Some(crate::models::magic_resistance::MagicResistanceSpec {
                kind: crate::models::magic_resistance::MagicResistanceKind::Normal,
                source_text: Some("Yes (MR applies)".to_string()),
                ..Default::default()
            });
            preview_item_for_test(s)
        };

        let assert_rich_metadata = |spell_name: &str,
                                    expected_book: &str,
                                    expected_page: i64,
                                    expected_note: &str,
                                    expected_author: &str| {
            let (db_c, vault_c, _) =
                read_persisted_spell_from_db_and_vault(&conn, temp_dir.path(), spell_name);
            for canon in [&db_c, &vault_c] {
                assert_eq!(canon.author.as_deref(), Some(expected_author));
                assert_eq!(canon.edition.as_deref(), Some("AD&D 2e"));
                assert_eq!(canon.license.as_deref(), Some("OGL-1.0"));
                assert_eq!(canon.source_refs[0].book, expected_book);
                assert_eq!(
                    canon.source_refs[0].page,
                    Some(serde_json::json!(expected_page))
                );
                assert_eq!(canon.source_refs[0].note.as_deref(), Some(expected_note));
                assert_eq!(
                    canon
                        .magic_resistance
                        .as_ref()
                        .and_then(|mr| mr.source_text.as_deref()),
                    Some("Yes (MR applies)")
                );
            }
        };

        let rich_base = make_rich_item("Base desc", "Book A", 5, "Base note", "Author A");
        apply_import_spell_json_impl(&conn, vec![rich_base], None).expect("insert rich spell");
        assert_rich_metadata("Rich Metadata Spell", "Book A", 5, "Base note", "Author A");
        let rich_id: i64 = conn
            .query_row(
                "SELECT id FROM spell WHERE name = 'Rich Metadata Spell'",
                [],
                |row| row.get(0),
            )
            .expect("query rich spell id");

        let rich_kb = make_rich_item("KB desc", "Book B", 7, "KB note", "Author B");
        let rich_kb_hash = rich_kb.content_hash.clone();
        apply_import_spell_json_impl(
            &conn,
            vec![rich_kb],
            Some(ImportSpellJsonResolveOptions {
                resolutions: vec![ImportSpellJsonConflictResolution {
                    existing_id: rich_id,
                    incoming_content_hash: rich_kb_hash,
                    action: "keep_both".to_string(),
                }],
                default_action: None,
            }),
        )
        .expect("keep_both rich spell");
        assert_rich_metadata(
            "Rich Metadata Spell (1)",
            "Book B",
            7,
            "KB note",
            "Author B",
        );

        let rich_rep = make_rich_item("Rep desc", "Book C", 9, "Rep note", "Author C");
        let rich_rep_hash = rich_rep.content_hash.clone();
        apply_import_spell_json_impl(
            &conn,
            vec![rich_rep],
            Some(ImportSpellJsonResolveOptions {
                resolutions: vec![ImportSpellJsonConflictResolution {
                    existing_id: rich_id,
                    incoming_content_hash: rich_rep_hash,
                    action: "replace_with_new".to_string(),
                }],
                default_action: None,
            }),
        )
        .expect("replace rich spell");
        assert_rich_metadata("Rich Metadata Spell", "Book C", 9, "Rep note", "Author C");
    }

    #[test]
    fn test_source_list_import_preserves_experience_cost_and_prevents_false_dedup() {
        use crate::models::experience::ExperienceKind;

        let temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");
        let conn = setup_import_apply_test_db();
        create_change_log_table(&conn);
        create_hash_reference_tables(&conn);

        // Two otherwise-identical spells in a source-list JSON array differing only in XP cost
        let payload = r#"{
            "spellscribe_version": "1.0",
            "spells": [
                {
                    "name": "Limited Wish XP Test",
                    "tradition": "Arcane",
                    "class_list": ["Wizard"],
                    "level": 7,
                    "school": "Conjuration/Summoning",
                    "range": "Unlimited",
                    "components": "V, S, XP (500 XP)",
                    "casting_time": "1 round",
                    "duration": "Special",
                    "area_of_effect": "Special",
                    "saving_throw": "Special",
                    "magic_resistance": "Yes",
                    "reversible": false,
                    "description": "Fulfills a limited request at an experience cost.",
                    "source_document": "PHB",
                    "source_page": 230
                },
                {
                    "name": "Limited Wish XP Test",
                    "tradition": "Arcane",
                    "class_list": ["Wizard"],
                    "level": 7,
                    "school": "Conjuration/Summoning",
                    "range": "Unlimited",
                    "components": "V, S, XP (1000 XP)",
                    "casting_time": "1 round",
                    "duration": "Special",
                    "area_of_effect": "Special",
                    "saving_throw": "Special",
                    "magic_resistance": "Yes",
                    "reversible": false,
                    "description": "Fulfills a limited request at an experience cost.",
                    "source_document": "PHB",
                    "source_page": 230
                }
            ]
        }"#;

        let classified =
            classify_import_input(Some(payload.to_string()), None).expect("classify xp list");
        let preview = preview_classified_payload(classified, SourceRefUrlPolicy::DropRef);

        assert!(preview.failures.is_empty());
        assert_eq!(
            preview.spells.len(),
            2,
            "both spells with different XP costs must appear in preview"
        );
        assert_ne!(
            preview.spells[0].content_hash,
            preview.spells[1].content_hash
        );

        // Apply both spells: 500 XP imports, and 1000 XP surfaces as a name conflict rather than deduplicating
        let apply_res = apply_import_spell_json_impl(&conn, preview.spells, None)
            .expect("apply 500 XP and 1000 XP spells");
        assert_eq!(apply_res.imported_count, 1);
        assert_eq!(
            apply_res.duplicates_skipped.total, 0,
            "1000 XP spell must not deduplicate against 500 XP spell"
        );
        assert_eq!(
            apply_res.conflicts.len(),
            1,
            "different-XP spell with same name should surface as a name conflict, not a duplicate"
        );

        let flat_components: Option<String> = conn
            .query_row(
                "SELECT components FROM spell WHERE name = 'Limited Wish XP Test'",
                [],
                |row| row.get(0),
            )
            .expect("query flat components column");
        assert_eq!(flat_components.as_deref(), Some("V, S, XP"));

        let (db_canon, vault_canon, _) =
            read_persisted_spell_from_db_and_vault(&conn, temp_dir.path(), "Limited Wish XP Test");
        for canon in [&db_canon, &vault_canon] {
            let xp = canon
                .experience_cost
                .as_ref()
                .expect("persisted canonical spell must retain experience_cost");
            assert_eq!(xp.kind, ExperienceKind::Fixed);
            assert_eq!(xp.amount_xp, Some(500));
            assert_eq!(canon.components.as_ref().map(|c| c.experience), Some(true));
        }
    }
}
