---
name: rust-regex
description: Use when writing, testing, or troubleshooting Rust regular expressions using the regex crate. Use when regex patterns don't match expected text, when choosing between regex vs regex-lite, when escaping user input for literal matching, when optimizing regex performance with static compilation, or when dealing with unsupported features like lookahead or backreferences.
---

# Rust Regex

## Overview

The `regex` crate is Rust's standard regex library. It guarantees linear-time matching, forbids catastrophic backtracking, and omits features that require backtracking (lookahead, lookbehind, backreferences). All patterns use `r"..."` raw strings to avoid double-escaping.

## Quick Reference

| Operation | Method | Returns |
|-----------|--------|---------|
| Test match | `re.is_match(text)` | `bool` |
| First match | `re.find(text)` | `Option<Match>` |
| All matches | `re.find_iter(text)` | iterator of `Match` |
| First capture | `re.captures(text)` | `Option<Captures>` |
| All captures | `re.captures_iter(text)` | iterator of `Captures` |
| Replace first | `re.replace(text, rep)` | `Cow<str>` |
| Replace all | `re.replace_all(text, rep)` | `Cow<str>` |
| Split | `re.split(text)` | iterator of `&str` |
| Split (limit) | `re.splitn(text, n)` | iterator of `&str` |
| Escape literal | `regex::escape(text)` | `String` |
| Multi-pattern | `RegexSet::new([...])` | `RegexSet` |
| Byte matching | `bytes::Regex::new(pat)` | operates on `&[u8]` |
| Builder config | `RegexBuilder::new(pat).build()` | `Result<Regex>` |

### Flags (Inline)

| Flag | Effect |
|------|--------|
| `(?i)` | Case-insensitive |
| `(?m)` | `^`/`$` match line boundaries |
| `(?s)` | `.` matches `\n` |
| `(?x)` | Verbose mode (whitespace + `#` comments) |
| `(?ims)` | Combine multiple flags |

### Unsupported Features

The `regex` crate does **NOT** support:
- Lookahead `(?=...)` / lookbehind `(?<=...)`
- Backreferences `\1`
- Atomic groups `(?>...)`
- Possessive quantifiers `a++`

These require backtracking, which violates the crate's linear-time guarantee. If you need these, consider the `fancy-regex` crate.

## Dependencies

```toml
[dependencies]
regex = "1"           # Full-featured, Unicode support
# regex-lite = "0.1"  # Smaller binary, no Unicode tables
```

Use `regex-lite` when binary size matters and you don't need Unicode character classes (`\p{Greek}`, `\p{Letter}`). API is identical.

## Core Patterns

### Basic Matching

```rust
use regex::Regex;

let re = Regex::new(r"hello").unwrap();
assert!(re.is_match("say hello world"));

// Case-insensitive
let re = Regex::new(r"(?i)hello").unwrap();
assert!(re.is_match("HELLO"));

// Find with position
let re = Regex::new(r"\d+").unwrap();
let m = re.find("abc 123 def").unwrap();
assert_eq!(m.as_str(), "123");
assert_eq!((m.start(), m.end()), (4, 7));

// All matches
let matches: Vec<&str> = re.find_iter("a1 b2 c3")
    .map(|m| m.as_str()).collect();
assert_eq!(matches, vec!["1", "2", "3"]);
```

### Capture Groups

```rust
use regex::Regex;

// Named captures
let re = Regex::new(r"(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})").unwrap();
let caps = re.captures("Date: 2026-02-14").unwrap();
assert_eq!(&caps["year"], "2026");
assert_eq!(&caps["month"], "02");
assert_eq!(&caps["day"], "14");

// Numbered captures (0 = full match)
let re = Regex::new(r"(\w+)@(\w+)\.(\w+)").unwrap();
let caps = re.captures("user@example.com").unwrap();
assert_eq!(&caps[1], "user");
assert_eq!(&caps[2], "example");

// Optional capture group
let re = Regex::new(r"(\w+)(?:\s+(\w+))?").unwrap();
let caps = re.captures("hello").unwrap();
assert_eq!(&caps[1], "hello");
assert!(caps.get(2).is_none()); // use .get() for optional groups

// Iterate captures
let re = Regex::new(r"(?P<key>\w+)=(?P<value>\w+)").unwrap();
let pairs: Vec<_> = re.captures_iter("name=Alice age=30")
    .map(|c| (c["key"].to_string(), c["value"].to_string()))
    .collect();
// [("name", "Alice"), ("age", "30")]
```

### Replacement

```rust
use regex::Regex;

let re = Regex::new(r"\d+").unwrap();
// Replace first
assert_eq!(re.replace("a1 b2", "X"), "aX b2");
// Replace all
assert_eq!(re.replace_all("a1 b2", "X"), "aX bX");

// Back-references in replacement (named)
let re = Regex::new(r"(?P<first>\w+)\s+(?P<last>\w+)").unwrap();
assert_eq!(re.replace("John Doe", "$last, $first"), "Doe, John");

// Back-references (numbered)
let re = Regex::new(r"(\d{3})-(\d{4})").unwrap();
assert_eq!(re.replace("Call 555-1234", "($1) $2"), "Call (555) 1234");

// Closure for dynamic replacement
let re = Regex::new(r"\d+").unwrap();
let result = re.replace_all("a1 b22", |caps: &regex::Captures| {
    let n: i32 = caps[0].parse().unwrap();
    (n * 2).to_string()
});
assert_eq!(result, "a2 b44");
```

### Static Compilation (Performance)

Compile regex once, reuse everywhere. Use `std::sync::LazyLock` (stable since Rust 1.80):

```rust
use regex::Regex;
use std::sync::LazyLock;

static EMAIL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap()
});

static DATE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})").unwrap()
});

// Use anywhere without re-compiling
fn validate_email(email: &str) -> bool {
    EMAIL_RE.is_match(email)
}
```

### RegexSet (Multi-Pattern)

Match against multiple patterns simultaneously in a single pass:

```rust
use regex::RegexSet;

let set = RegexSet::new([
    r"\d+",       // 0: has digits
    r"[a-z]+",    // 1: has lowercase
    r"[A-Z]+",    // 2: has uppercase
]).unwrap();

let matches: Vec<usize> = set.matches("Hello 42").into_iter().collect();
assert_eq!(matches, vec![0, 1, 2]); // all three matched

// Classification
let categories = RegexSet::new([
    r"^[A-Z]{2}\d{3}$",     // 0: product code
    r"^INV-\d{6}$",         // 1: invoice number
]).unwrap();
assert!(categories.matches("AB123").matched(0));
assert!(categories.matches("INV-000042").matched(1));
```

### Splitting

```rust
use regex::Regex;

let re = Regex::new(r"[,;\s]+").unwrap();
let fields: Vec<&str> = re.split("a,b; c  d").collect();
assert_eq!(fields, vec!["a", "b", "c", "d"]);

// Limit splits
let re = Regex::new(r"\s+").unwrap();
let fields: Vec<&str> = re.splitn("one two three four", 3).collect();
assert_eq!(fields, vec!["one", "two", "three four"]);
```

### Error Handling and User Input

```rust
use regex::Regex;

// Always handle invalid patterns from user input
fn search(pattern: &str, text: &str) -> Result<Vec<String>, String> {
    let re = Regex::new(pattern).map_err(|e| format!("Invalid regex: {e}"))?;
    Ok(re.find_iter(text).map(|m| m.as_str().to_string()).collect())
}

// Escape user input to match literally
let user_input = "price is $5.00 (USD)";
let escaped = regex::escape(user_input);  // escapes $, ., (, )
let re = Regex::new(&escaped).unwrap();
assert!(re.is_match("the price is $5.00 (USD) today"));
```

### Byte Regex

Use `regex::bytes::Regex` to match against `&[u8]` — for binary data or non-UTF-8 content:

```rust
use regex::bytes::Regex as BytesRegex;

let re = BytesRegex::new(r"\d+").unwrap();
let data: &[u8] = b"abc 123 def";
let m = re.find(data).unwrap();
assert_eq!(m.as_bytes(), b"123");

// Match non-UTF-8 bytes with (?-u)
let re = BytesRegex::new(r"(?-u)\xff\xfe").unwrap();
let data: &[u8] = &[0x00, 0xff, 0xfe, 0x00];
assert!(re.is_match(data));
```

### RegexBuilder

Programmatic configuration — useful when accepting patterns from user input:

```rust
use regex::RegexBuilder;

let re = RegexBuilder::new(r"hello world")
    .case_insensitive(true)
    .multi_line(true)
    .dot_matches_new_line(true)
    .build()
    .unwrap();
assert!(re.is_match("HELLO\nWORLD"));

// Limit compiled size to reject complex user-provided patterns
let result = RegexBuilder::new(r"(\w+){100}")
    .size_limit(50)
    .build();
assert!(result.is_err()); // pattern too complex
```

### Dynamic Pattern Construction

Build patterns from runtime values — **always escape** user input:

```rust
use regex::Regex;

// Word boundary search
let word = "hello";
let pattern = format!(r"\b{}\b", regex::escape(word));
let re = Regex::new(&pattern).unwrap();
assert!(re.is_match("say hello world"));
assert!(!re.is_match("say helloworld"));

// Alternation from a list
let keywords = vec!["error", "warn", "fatal"];
let alt = keywords.iter()
    .map(|k| regex::escape(k))
    .collect::<Vec<_>>()
    .join("|");
let re = Regex::new(&format!(r"(?i)\b(?:{})\b", alt)).unwrap();
assert!(re.is_match("FATAL: disk full"));

// File extension filter
let exts = vec!["rs", "toml", "md"];
let ext_alt = exts.iter().map(|e| regex::escape(e)).collect::<Vec<_>>().join("|");
let re = Regex::new(&format!(r"\.(?:{})$", ext_alt)).unwrap();
assert!(re.is_match("main.rs"));
assert!(!re.is_match("image.png"));
```

### Anchors: `\A`/`\z` vs `^`/`$`

`^`/`$` change meaning with `(?m)`. `\A`/`\z` **always** match absolute start/end:

```rust
use regex::Regex;

let text = "first\nsecond\nthird";

// \A/\z: always absolute, even with (?m)
let re = Regex::new(r"(?m)\A\w+").unwrap();
assert_eq!(re.find(text).unwrap().as_str(), "first");

let re = Regex::new(r"(?m)\w+\z").unwrap();
assert_eq!(re.find(text).unwrap().as_str(), "third");

// ^/$: match line boundaries with (?m)
let re = Regex::new(r"(?m)^\w+$").unwrap();
let all: Vec<&str> = re.find_iter(text).map(|m| m.as_str()).collect();
assert_eq!(all, vec!["first", "second", "third"]);
```

## Common Patterns

See [references/common-patterns.md](references/common-patterns.md) for verified regex patterns for emails, IPs, URLs, semantic versions, hex colors, phone numbers, log parsing, nested capture groups, and more.

## Troubleshooting

See [references/troubleshooting.md](references/troubleshooting.md) for common mistakes and debugging strategies including:
- Unescaped dots matching any character
- Missing anchors causing substring matches
- Greedy vs lazy quantifier confusion
- Unsupported features (lookahead, backreferences)
- Performance tips
- `regex` vs `regex-lite` vs `fancy-regex` decision guide

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| `r"192.168.1.1"` | `.` matches any char | `r"192\.168\.1\.1"` |
| `r"\d+"` without anchors | Matches substrings | `r"^\d+$"` for full match |
| `r"<.+>"` (greedy) | Matches `<a>...<b>` | `r"<[^>]+>"` or `r"<.+?>"` |
| `Regex::new()` in loop | Recompiles every iteration | Use `LazyLock<Regex>` static |
| `r"foo(?=bar)"` | Lookahead unsupported | Restructure pattern or use `fancy-regex` |
| Unescaped user input | Regex injection | Use `regex::escape()` |
| `format!("{}", input)` | Unescaped in pattern | `format!("{}", regex::escape(input))` |
