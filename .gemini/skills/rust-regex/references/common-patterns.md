# Common Regex Patterns

Verified working patterns for the Rust `regex` crate. All patterns tested against `regex 1.x`.

## Table of Contents

- [Email Validation](#email-validation)
- [IPv4 Address](#ipv4-address)
- [URL Extraction](#url-extraction)
- [Semantic Versioning](#semantic-versioning)
- [Hex Color Code](#hex-color-code)
- [US Phone Number](#us-phone-number)
- [Date Formats](#date-formats)
- [Log Line Parsing](#log-line-parsing)
- [Key-Value Pairs](#key-value-pairs)
- [Nested Capture Groups](#nested-capture-groups)
- [Verbose Mode for Complex Patterns](#verbose-mode)

## Email Validation

```rust
let re = Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap();
assert!(re.is_match("user@example.com"));
assert!(re.is_match("first.last@domain.co.uk"));
assert!(!re.is_match("invalid@"));
assert!(!re.is_match("@domain.com"));
```

> **Note:** This is a practical pattern, not RFC 5322 compliant. For strict validation, validate the domain separately.

## IPv4 Address

```rust
let re = Regex::new(
    r"^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$"
).unwrap();
assert!(re.is_match("192.168.1.1"));
assert!(re.is_match("255.255.255.255"));
assert!(re.is_match("0.0.0.0"));
assert!(!re.is_match("256.1.1.1"));
assert!(!re.is_match("1.2.3"));
assert!(!re.is_match("1.2.3.4.5"));
```

Breakdown with verbose mode:

```rust
let re = Regex::new(r"(?x)
    ^
    (?:
        (?:25[0-5] | 2[0-4]\d | [01]?\d\d?)  # octet: 0-255
        \.                                      # dot separator
    ){3}                                         # first three octets
    (?:25[0-5] | 2[0-4]\d | [01]?\d\d?)         # fourth octet
    $
").unwrap();
```

## URL Extraction

```rust
let re = Regex::new(r"https?://[^\s]+").unwrap();
let text = "Visit https://example.com or http://test.org for info";
let urls: Vec<&str> = re.find_iter(text).map(|m| m.as_str()).collect();
assert_eq!(urls, vec!["https://example.com", "http://test.org"]);
```

## Semantic Versioning

Matches SemVer 2.0.0 format with optional pre-release and build metadata:

```rust
let re = Regex::new(
    r"^(?P<major>0|[1-9]\d*)\.(?P<minor>0|[1-9]\d*)\.(?P<patch>0|[1-9]\d*)(?:-(?P<pre>[a-zA-Z0-9.]+))?(?:\+(?P<build>[a-zA-Z0-9.]+))?$"
).unwrap();

let caps = re.captures("1.23.4-beta.1+build.567").unwrap();
assert_eq!(&caps["major"], "1");
assert_eq!(&caps["minor"], "23");
assert_eq!(&caps["patch"], "4");
assert_eq!(&caps["pre"], "beta.1");
assert_eq!(&caps["build"], "build.567");

assert!(re.is_match("0.1.0"));
assert!(re.is_match("2.0.0-rc.1"));
assert!(!re.is_match("1.2"));       // missing patch
assert!(!re.is_match("v1.0.0"));    // leading 'v'
```

## Hex Color Code

```rust
let re = Regex::new(r"^#(?:[0-9a-fA-F]{3}){1,2}$").unwrap();
assert!(re.is_match("#fff"));
assert!(re.is_match("#FF00aa"));
assert!(!re.is_match("#gg00aa"));
assert!(!re.is_match("FF00aa"));   // missing #
```

## US Phone Number

```rust
let re = Regex::new(r"^\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$").unwrap();
assert!(re.is_match("555-123-4567"));
assert!(re.is_match("(555) 123-4567"));
assert!(re.is_match("+1-555-123-4567"));
assert!(re.is_match("5551234567"));
```

## Date Formats

### ISO 8601 (YYYY-MM-DD)

```rust
let re = Regex::new(r"(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})").unwrap();
let caps = re.captures("2026-02-14").unwrap();
assert_eq!(&caps["year"], "2026");
assert_eq!(&caps["month"], "02");
assert_eq!(&caps["day"], "14");
```

### US Date (MM/DD/YYYY)

```rust
let re = Regex::new(r"(?P<month>\d{1,2})/(?P<day>\d{1,2})/(?P<year>\d{4})").unwrap();
let caps = re.captures("2/14/2026").unwrap();
assert_eq!(&caps["month"], "2");
assert_eq!(&caps["day"], "14");
assert_eq!(&caps["year"], "2026");
```

## Log Line Parsing

```rust
let re = Regex::new(
    r"(?P<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\s+(?P<level>\w+)\s+(?P<message>.+)"
).unwrap();

let line = "2026-02-14T10:30:00 ERROR Connection refused to database";
let caps = re.captures(line).unwrap();
assert_eq!(&caps["timestamp"], "2026-02-14T10:30:00");
assert_eq!(&caps["level"], "ERROR");
assert_eq!(&caps["message"], "Connection refused to database");
```

## Key-Value Pairs

```rust
let re = Regex::new(r"(?P<key>\w+)=(?P<value>\w+)").unwrap();
let text = "name=Alice age=30 city=NYC";
let pairs: Vec<(String, String)> = re.captures_iter(text)
    .map(|caps| (caps["key"].to_string(), caps["value"].to_string()))
    .collect();
assert_eq!(pairs, vec![
    ("name".to_string(), "Alice".to_string()),
    ("age".to_string(), "30".to_string()),
    ("city".to_string(), "NYC".to_string()),
]);
```

## Verbose Mode

Use `(?x)` for complex patterns. Whitespace is ignored and `#` starts comments:

```rust
let re = Regex::new(r"(?x)
    (\d{4})   # year
    -
    (\d{2})   # month
    -
    (\d{2})   # day
").unwrap();
let caps = re.captures("2026-02-14").unwrap();
assert_eq!(&caps[1], "2026");
assert_eq!(&caps[2], "02");
assert_eq!(&caps[3], "14");
```

## Unicode Character Classes

The full `regex` crate supports Unicode property escapes:

```rust
// Greek letters
let re = Regex::new(r"\p{Greek}+").unwrap();
let matches: Vec<&str> = re.find_iter("hello αβγ world δεζ")
    .map(|m| m.as_str()).collect();
assert_eq!(matches, vec!["αβγ", "δεζ"]);

// Any letter (all scripts)
let re = Regex::new(r"\p{Letter}+").unwrap();
let words: Vec<&str> = re.find_iter("hello мир 世界")
    .map(|m| m.as_str()).collect();
assert_eq!(words, vec!["hello", "мир", "世界"]);
```

> **Note:** `regex-lite` does NOT support `\p{...}` Unicode classes.

## Nested Capture Groups

Groups are numbered by the position of their opening `(` from left to right. Non-capturing groups `(?:...)` are skipped in numbering.

### Outer + Inner Groups

```rust
// Outer captures full match, inner captures parts
let re = Regex::new(r"((\w+)\s+(\d{4}))").unwrap();
let caps = re.captures("Born in May 2026 here").unwrap();
assert_eq!(&caps[1], "May 2026");   // outer group
assert_eq!(&caps[2], "May");         // inner: word
assert_eq!(&caps[3], "2026");        // inner: year
```

### Named Nested Groups

Prefer named groups in complex patterns — numbering gets confusing fast:

```rust
let re = Regex::new(
    r"(?P<full>(?P<proto>https?)://(?P<host>[^/\s]+)(?P<path>/[^\s]*)?)" 
).unwrap();
let caps = re.captures("visit https://example.com/page?q=1 now").unwrap();
assert_eq!(&caps["full"], "https://example.com/page?q=1");
assert_eq!(&caps["proto"], "https");
assert_eq!(&caps["host"], "example.com");
assert_eq!(&caps["path"], "/page?q=1");
```

### Optional Nested Groups

Use `.get(n)` to safely access groups that may not participate in the match:

```rust
// version: major.minor with optional .patch
let re = Regex::new(r"((\d+)\.(\d+)(?:\.(\d+))?)").unwrap();

let caps = re.captures("version 1.2.3").unwrap();
assert_eq!(&caps[1], "1.2.3");
assert_eq!(&caps[4], "3");       // patch present

let caps = re.captures("version 1.2").unwrap();
assert_eq!(&caps[1], "1.2");
assert!(caps.get(4).is_none());   // no patch — use .get() not &caps[4]
```

### Group Numbering Rules

Numbered by opening `(` left to right; `(?:...)` doesn't count:

```rust
//            1         2      3       4      5
//            (         (      (       (      (
let re = Regex::new(r"(((\w+)@(\w+))\.(\w+))").unwrap();
let caps = re.captures("user@example.com").unwrap();
assert_eq!(&caps[1], "user@example.com"); // outermost
assert_eq!(&caps[2], "user@example");      // second (
assert_eq!(&caps[3], "user");              // third (
assert_eq!(&caps[4], "example");           // fourth (
assert_eq!(&caps[5], "com");               // fifth (

// (?:...) skipped in numbering
let re = Regex::new(r"(?:https?://)?([\w.-]+)(?:/(\S+))?").unwrap();
let caps = re.captures("https://example.com/path").unwrap();
assert_eq!(&caps[1], "example.com");  // group 1, not 2
assert_eq!(&caps[2], "path");          // group 2, not 4
```

### Practical Example: Structured Log Parsing

```rust
let re = Regex::new(
    r"\[(?P<level>\w+)\]\s+(?P<module>(?P<top>\w+)(?:::(?P<sub>\w+))*)\s+-\s+(?P<msg>.+?)(?:\s+\((?P<detail>[^)]+)\))?$"
).unwrap();

let caps = re.captures("[ERROR] net::http - connection refused (timeout=30s)").unwrap();
assert_eq!(&caps["level"], "ERROR");
assert_eq!(&caps["module"], "net::http");
assert_eq!(&caps["top"], "net");
assert_eq!(&caps["sub"], "http");
assert_eq!(&caps["msg"], "connection refused");
assert_eq!(&caps["detail"], "timeout=30s");

// Without optional parts
let caps = re.captures("[INFO] app - started").unwrap();
assert_eq!(&caps["top"], "app");
assert!(caps.name("sub").is_none());
assert!(caps.name("detail").is_none());
```

### Iterating Nested Captures

```rust
let re = Regex::new(r"(?P<pair>(?P<key>\w+)=(?P<val>[^,\s]+))").unwrap();
let text = "a=1, b=hello, c=true";
let results: Vec<_> = re.captures_iter(text)
    .map(|c| (c["pair"].to_string(), c["key"].to_string(), c["val"].to_string()))
    .collect();
assert_eq!(results, vec![
    ("a=1".into(), "a".into(), "1".into()),
    ("b=hello".into(), "b".into(), "hello".into()),
    ("c=true".into(), "c".into(), "true".into()),
]);
```
