pub mod migrations;
pub mod pool;
pub mod utils;

pub use pool::{app_data_dir, init_db, Pool};
#[cfg(test)]
pub(crate) use utils::load_static_sqlite_vec_for_test;
pub use utils::{spell_vec_is_vec0, table_has_column};
