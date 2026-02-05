//! # Spell Parsers
//!
//! This module contains domain-specific parsers for extracting structured data from legacy spell strings.
//!
//! ## Architecture
//! - Each module (`range`, `area`, `duration`, etc.) handles a specific domain.
//! - The `SpellParser` (in `utils/spell_parser.rs`) acts as a **facade**, delegating calls to these sub-parsers.
//!
//! ## Modules
//! - **range**: Distance, touch, per-level, varying range parsing.
//! - **area**: Shapes (cone, sphere), dimensions, and unit conversion.
//! - **duration**: Rounds, turns, levels, special durations (instantaneous, permanent).
//! - **components**: V, S, M, casting times, and material cost extraction.
//! - **mechanics**: Saving throws, magic resistance, damage, and experience costs.

pub mod area;
pub mod components;
pub mod duration;
pub mod mechanics;
pub mod range;
