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
}
