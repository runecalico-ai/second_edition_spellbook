pub mod character;
pub mod import;
pub mod search;
pub mod spell;

// Re-export common types for easier access
pub use character::*;
pub use import::*;
pub use search::*;
pub use spell::*;
pub mod bundle;
pub use bundle::*;
pub mod canonical_spell;
pub use canonical_spell::*;

#[cfg(test)]
pub mod canonical_spell_regression_tests;

pub mod scalar;
pub use scalar::*;

pub mod duration_spec;
pub use duration_spec::*;

pub mod range_spec;
pub use range_spec::*;

pub mod area_spec;
pub use area_spec::*;

pub mod damage;
pub use damage::*;

pub mod experience;
pub use experience::*;

pub mod magic_resistance;
pub use magic_resistance::*;

pub mod saving_throw;
pub use saving_throw::*;

pub mod material;
pub use material::*;
