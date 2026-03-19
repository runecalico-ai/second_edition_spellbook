# Troubleshooting Rust Regex

Debugging strategies and common mistakes when using the `regex` crate.

## Table of Contents

- [Common Mistakes](#common-mistakes)
- [Debugging Strategy](#debugging-strategy)
- [Unsupported Features](#unsupported-features)
- [Performance](#performance)
- [Crate Selection Guide](#crate-selection-guide)

## Common Mistakes

### 1. Unescaped Dots

`.` matches **any** character, not just a literal dot.

```rust
// BUG: matches "192X168Y1Z1" because . = any char
let bad = Regex::new(r"192.168.1.1").unwrap();
assert!(bad.is_match("192X168Y1Z1")); // true!

// FIX: escape dots for literal matching
let good = Regex::new(r"192\.168\.1\.1").unwrap();
assert!(!good.is_match("192X168Y1Z1"));
assert!(good.is_match("192.168.1.1"));
```

**Other metacharacters that need escaping:** `\` `.` `^` `$` `*` `+` `?` `(` `)` `[` `{` `|`

### 2. Missing Anchors

Without `^` and `$`, regex matches substrings anywhere in the text.

```rust
// BUG: matches "123" inside "abc12345"
let no_anchor = Regex::new(r"\d{3}").unwrap();
assert!(no_anchor.is_match("abc12345")); // true!

// FIX: anchor to match entire string
let anchored = Regex::new(r"^\d{3}$").unwrap();
assert!(!anchored.is_match("abc12345"));
assert!(anchored.is_match("123"));
```

### 3. Greedy vs Lazy Quantifiers

Greedy quantifiers (`+`, `*`) grab as much as possible; lazy versions (`+?`, `*?`) grab as little as possible.

```rust
let text = r#"{"a": "hello", "b": "world"}"#;

// Greedy: grabs everything between first and last quote
let greedy = Regex::new(r#""(.+)""#).unwrap();
let cap = greedy.captures(text).unwrap();
assert_eq!(&cap[1], r#"a": "hello", "b": "world"#);

// Lazy: stops at first closing quote
let lazy = Regex::new(r#""(.+?)""#).unwrap();
let cap = lazy.captures(text).unwrap();
assert_eq!(&cap[1], "a");

// BEST: negated character class (clearer and faster)
let negated = Regex::new(r#""([^"]+)""#).unwrap();
let cap = negated.captures(text).unwrap();
assert_eq!(&cap[1], "a");
```

**Prefer negated character classes** (`[^"]+`) over lazy quantifiers (`.+?`) - they're more explicit and can be faster.

### 4. Compiling Regex in a Loop

`Regex::new()` compiles the pattern each call. In hot loops this is wasteful.

```rust
// BAD: recompiles on every call
fn is_valid_email(email: &str) -> bool {
    let re = Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap();
    re.is_match(email)
}

// GOOD: compile once with LazyLock
use std::sync::LazyLock;

static EMAIL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap()
});

fn is_valid_email_fast(email: &str) -> bool {
    EMAIL_RE.is_match(email)
}
```

### 5. Forgetting `(?m)` for Multiline

By default, `^` and `$` match start/end of the **entire string**, not line boundaries.

```rust
let text = "line1\nline2\nline3";

// Without (?m): only matches if entire string is one word
let re = Regex::new(r"^\w+$").unwrap();
assert!(!re.is_match(text));

// With (?m): ^ and $ match at line boundaries
let re = Regex::new(r"(?m)^\w+$").unwrap();
let matches: Vec<&str> = re.find_iter(text).map(|m| m.as_str()).collect();
assert_eq!(matches, vec!["line1", "line2", "line3"]);
```

### 6. Not Escaping User Input

User-provided strings may contain regex metacharacters.

```rust
// User types "$5.00" — this is a regex with special chars!
let user_input = "$5.00";

// BAD: regex injection
// Regex::new(user_input) — $ and . have special meaning

// GOOD: escape first for literal matching
let escaped = regex::escape(user_input);
let re = Regex::new(&escaped).unwrap();
```

## Debugging Strategy

When a regex doesn't match what you expect, break it down:

### Step 1: Isolate Components

```rust
let text = "2026-02-14";

// Test each part independently
assert!(Regex::new(r"\d{4}").unwrap().is_match(text));  // year OK?
assert!(Regex::new(r"\d{2}").unwrap().is_match("02"));  // month OK?
assert!(Regex::new(r"-").unwrap().is_match(text));       // separator OK?

// Then combine
assert!(Regex::new(r"\d{4}-\d{2}-\d{2}").unwrap().is_match(text));
```

### Step 2: Check What Actually Matched

```rust
let re = Regex::new(r"\w+").unwrap();
let text = "hello-world";

// See the actual match
let m = re.find(text).unwrap();
println!("Matched: '{}' at {}..{}", m.as_str(), m.start(), m.end());
// "hello" at 0..5 — stopped at hyphen because \w doesn't include -
```

### Step 3: Use find_iter to See All Matches

```rust
let re = Regex::new(r"\d+").unwrap();
for m in re.find_iter("abc123def456ghi789") {
    println!("'{}' at {}..{}", m.as_str(), m.start(), m.end());
}
// '123' at 3..6
// '456' at 9..12
// '789' at 15..18
```

### Step 4: Check the Error Message

```rust
match Regex::new(r"[unclosed") {
    Ok(_) => println!("Valid"),
    Err(e) => println!("Error: {e}"),
    // Error: regex parse error: [unclosed
    //                           ^
    // error: unclosed character class
}
```

The error messages from the `regex` crate are detailed and show exactly where parsing failed.

## Unsupported Features

| Feature | Syntax | Status | Alternative |
|---------|--------|--------|-------------|
| Lookahead | `(?=...)` | Not supported | Restructure pattern or use `fancy-regex` |
| Lookbehind | `(?<=...)` | Not supported | Restructure pattern or use `fancy-regex` |
| Backreference | `\1` | Not supported | Use captures and compare in code |
| Atomic group | `(?>...)` | Not supported | Use `fancy-regex` |
| Possessive quantifier | `a++` | Not supported | Use `fancy-regex` |
| Conditional | `(?(1)a\|b)` | Not supported | Use multiple regexes with code logic |

### Working Around Missing Lookahead

```rust
// Instead of: \d+(?= dollars)  (lookahead)
// Use captures and extract:
let re = Regex::new(r"(\d+) dollars").unwrap();
let caps = re.captures("costs 50 dollars").unwrap();
let amount = &caps[1]; // "50" — equivalent to lookahead result
```

### Working Around Missing Backreferences

```rust
// Instead of: (\w+)\s+\1  (backreference for repeated word)
// Match and compare in code:
let re = Regex::new(r"(\w+)\s+(\w+)").unwrap();
for caps in re.captures_iter("the the cat sat sat") {
    if &caps[1] == &caps[2] {
        println!("Duplicate: {}", &caps[1]);
    }
}
```

## Performance

### Tips

1. **Compile once** — Use `LazyLock<Regex>` for patterns used more than once
2. **Literal prefix** — Patterns starting with a literal string are faster (`hello\s+\w+` > `\w+\s+hello`)
3. **Avoid `.*`** — Use specific character classes (`[^"]*` instead of `.*?`)
4. **Use `RegexSet`** — When matching against multiple patterns, `RegexSet` is faster than testing each regex individually
5. **Check literal first** — For simple substring checks, `str::contains()` is faster than regex
6. **Consider `regex-lite`** — If you don't need Unicode support, it has faster compile times

### When Regex is Overkill

| Task | Use Instead |
|------|-------------|
| Fixed substring search | `str::contains()`, `str::starts_with()` |
| Single char search | `str::find(char)` |
| Simple split | `str::split()`, `str::split_whitespace()` |
| Trim whitespace | `str::trim()` |
| Case conversion | `str::to_lowercase()` |

## Crate Selection Guide

| Crate | When to Use |
|-------|-------------|
| `regex` | Default choice. Unicode support, pattern caching, full API |
| `regex-lite` | Smaller binary, faster compilation. Same API, no `\p{...}` Unicode classes |
| `fancy-regex` | Need lookahead, lookbehind, backreferences. Slower, allows backtracking |
| `aho-corasick` | Searching for many fixed strings simultaneously |
| `memchr` | Single/few byte search in byte slices |

### regex vs regex-lite

```rust
// regex — full Unicode support
use regex::Regex;
let re = Regex::new(r"\p{Greek}+").unwrap(); // works

// regex-lite — identical API, no Unicode classes
use regex_lite::Regex as LiteRegex;
let re = LiteRegex::new(r"\d+").unwrap();    // works
// LiteRegex::new(r"\p{Greek}+") — would fail
```

Both crates have the same API. You can swap `use regex::Regex` for `use regex_lite::Regex` and everything compiles (unless you use `\p{...}` classes or `RegexSet`).

## Dynamic Pattern Pitfalls

### Forgetting to Escape Runtime Values

```rust
// BAD: user_input may contain regex metacharacters
let pattern = format!(r"\b{}\b", user_input);

// GOOD: always escape runtime values
let pattern = format!(r"\b{}\b", regex::escape(user_input));
```

### Building Alternations Safely

```rust
let keywords = vec!["error", "warn", "$special"];
let alt = keywords.iter()
    .map(|k| regex::escape(k))  // escapes $ in "$special"
    .collect::<Vec<_>>()
    .join("|");
let re = Regex::new(&format!(r"(?i)\b(?:{})\b", alt)).unwrap();
```

## When to Use Byte Regex

Use `regex::bytes::Regex` instead of `regex::Regex` when:

| Scenario | Why |
|----------|-----|
| Binary file content | Data may not be valid UTF-8 |
| Network protocol data | Raw byte sequences |
| Mixed encoding files | Some sections non-UTF-8 |
| Matching specific byte values | `\xff`, `\x00`, etc. |

```rust
use regex::bytes::Regex as BytesRegex;

// (?-u) disables Unicode mode for byte-level matching
let re = BytesRegex::new(r"(?-u)\xff\xfe").unwrap();
let data: &[u8] = &[0x00, 0xff, 0xfe, 0x00];
assert!(re.is_match(data));
```

> **Note:** `regex::bytes::Regex` has the same API as `regex::Regex`, but operates on `&[u8]` and returns `&[u8]` from matches.
