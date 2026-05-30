use crate::commands::search::{search_rag_spells_with_conn, RAG_RETRIEVAL_LIMIT};
use crate::error::AppError;
use crate::models::llm::LlmChatGrounding;
use std::collections::HashSet;

const MAX_SEARCH_TERMS: usize = 3;

const DOMAIN_SHORT_TOKENS: &[&str] = &["hd", "hp", "ac", "mr"];

const STOPWORDS: &[&str] = &[
    "spell",
    "spells",
    "level",
    "what",
    "does",
    "the",
    "a",
    "an",
    "how",
    "many",
    "of",
    "for",
    "is",
    "are",
    "do",
    "can",
    "you",
    "me",
    "about",
    "and",
];

fn stopword_set() -> HashSet<&'static str> {
    STOPWORDS.iter().copied().collect()
}

fn is_domain_short_token(token: &str) -> bool {
    DOMAIN_SHORT_TOKENS.contains(&token)
}

fn keep_token(token: &str, stopwords: &HashSet<&'static str>) -> bool {
    if stopwords.contains(token) {
        return false;
    }
    token.len() >= 3 || is_domain_short_token(token)
}

/// Extract up to three deduplicated FTS search terms from a user chat query.
///
/// Tokenization is ASCII-only (`is_ascii_alphanumeric`); non-ASCII letters are treated
/// as delimiters. This matches the v1 English AD&D corpus expectation.
pub fn extract_search_terms(query: &str) -> Vec<String> {
    let stopwords = stopword_set();
    let mut seen = HashSet::new();
    let mut terms = Vec::new();

    for token in query
        .to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|segment| !segment.is_empty())
    {
        if !keep_token(token, &stopwords) {
            continue;
        }
        if seen.insert(token.to_string()) {
            terms.push(token.to_string());
            if terms.len() >= MAX_SEARCH_TERMS {
                break;
            }
        }
    }

    terms
}

/// Loads FTS-grounded spell context for a user chat message.
pub fn retrieve_rag_context(
    conn: &rusqlite::Connection,
    user_query: &str,
) -> Result<LlmChatGrounding, AppError> {
    let search_terms = extract_search_terms(user_query);
    let grounded_spells =
        search_rag_spells_with_conn(conn, &search_terms, RAG_RETRIEVAL_LIMIT)?;
    Ok(LlmChatGrounding {
        search_terms,
        grounded_spells,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_terms_strips_stopwords_and_keeps_domain_words() {
        let terms = extract_search_terms("What does a fireball spell do for damage?");
        assert_eq!(terms, vec!["fireball", "damage"]);
    }

    #[test]
    fn extract_terms_caps_at_three() {
        let terms = extract_search_terms("fire cold lightning acid poison evocation");
        assert_eq!(terms, vec!["fire", "cold", "lightning"]);
    }

    #[test]
    fn extract_terms_keeps_domain_short_tokens() {
        let terms = extract_search_terms("hd hp ac mr");
        assert_eq!(terms, vec!["hd", "hp", "ac"]);
    }

    #[test]
    fn extract_terms_deduplicates_preserving_order() {
        let terms = extract_search_terms("fireball fireball damage fireball");
        assert_eq!(terms, vec!["fireball", "damage"]);
    }

    #[test]
    fn extract_terms_returns_empty_for_stopword_only_query() {
        let terms = extract_search_terms("what is the of and");
        assert!(terms.is_empty());
    }

    #[test]
    fn extract_terms_returns_empty_for_empty_query() {
        assert!(extract_search_terms("").is_empty());
    }

    #[test]
    fn extract_terms_returns_empty_for_whitespace_only_query() {
        assert!(extract_search_terms("   \t\n  ").is_empty());
    }

    #[test]
    fn extract_terms_handles_punctuation_boundaries() {
        let terms = extract_search_terms("fireball?");
        assert_eq!(terms, vec!["fireball"]);
    }

    #[test]
    fn retrieve_rag_context_grounds_fireball_query() {
        use super::retrieve_rag_context;
        use rusqlite::Connection;

        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE spell (
                id               INTEGER PRIMARY KEY,
                name             TEXT NOT NULL DEFAULT '',
                description      TEXT NOT NULL DEFAULT '',
                material_components TEXT DEFAULT '',
                tags             TEXT DEFAULT '',
                source           TEXT DEFAULT '',
                author           TEXT DEFAULT '',
                school           TEXT DEFAULT '',
                sphere           TEXT DEFAULT '',
                level            INTEGER DEFAULT 0,
                class_list       TEXT DEFAULT '',
                components       TEXT DEFAULT '',
                duration         TEXT DEFAULT '',
                is_quest_spell   INTEGER DEFAULT 0,
                is_cantrip       INTEGER DEFAULT 0,
                canonical_data   TEXT
            );
            "#,
        )
        .unwrap();
        let migration_sql =
            include_str!("../../../../../db/migrations/0014_fts_extend_canonical.sql");
        conn.execute_batch(migration_sql).unwrap();
        conn.execute(
            "INSERT INTO spell (id, name, description, school, level, canonical_data) \
             VALUES (1, 'Fireball', 'A blazing orb of fire', 'Evocation', 3, NULL)",
            [],
        )
        .unwrap();

        let grounding = retrieve_rag_context(&conn, "What does a fireball spell do?").unwrap();
        assert_eq!(grounding.search_terms, vec!["fireball"]);
        assert_eq!(grounding.grounded_spells.len(), 1);
        assert_eq!(grounding.grounded_spells[0].name, "Fireball");
        assert!(grounding.grounded_spells[0].description_snippet.len() <= 200);
    }
}
