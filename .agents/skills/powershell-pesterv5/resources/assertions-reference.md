# Pester v5 Should Assertions — Complete Reference

All operators support `-Not` for negation and `-Because 'reason'` for custom failure messages.

```powershell
$value | Should -Be 'expected' -Because 'reason shown on failure'
$value | Should -Not -Be 'unexpected'
```

---

## Equality & Identity

| Operator | Description | Example |
|----------|-------------|---------|
| `-Be` | Case-insensitive equality | `$r \| Should -Be 'hello'` |
| `-BeExactly` | Case-sensitive equality | `$r \| Should -BeExactly 'Hello'` |
| `-BeNullOrEmpty` | Null, empty string, or empty collection | `$r \| Should -BeNullOrEmpty` |
| `-BeTrue` | Truthy value | `$r \| Should -BeTrue` |
| `-BeFalse` | Falsy value | `$r \| Should -BeFalse` |

---

## Numeric Comparisons

| Operator | PowerShell Equivalent | Example |
|----------|-----------------------|---------|
| `-BeGreaterThan` | `-gt` | `$n \| Should -BeGreaterThan 5` |
| `-BeGreaterOrEqual` | `-ge` | `$n \| Should -BeGreaterOrEqual 5` |
| `-BeLessThan` | `-lt` | `$n \| Should -BeLessThan 10` |
| `-BeLessOrEqual` | `-le` | `$n \| Should -BeLessOrEqual 10` |

---

## Collections

| Operator | Description | Example |
|----------|-------------|---------|
| `-Contain` | Collection contains item | `$list \| Should -Contain 'apple'` |
| `-BeIn` | Value exists in a collection | `$v \| Should -BeIn @('a','b','c')` |
| `-HaveCount` | Collection has exact count | `$list \| Should -HaveCount 3` |

---

## Pattern Matching

| Operator | Description | Example |
|----------|-------------|---------|
| `-BeLike` | Wildcard match (case-insensitive) | `$s \| Should -BeLike '*error*'` |
| `-BeLikeExactly` | Wildcard match (case-sensitive) | `$s \| Should -BeLikeExactly '*Error*'` |
| `-Match` | Regex match (case-insensitive) | `$s \| Should -Match '\d{4}-\d{2}'` |
| `-MatchExactly` | Regex match (case-sensitive) | `$s \| Should -MatchExactly '^[A-Z]'` |

---

## Type Checks

| Operator | Description | Example |
|----------|-------------|---------|
| `-BeOfType` | Type check using `-is` | `$obj \| Should -BeOfType [hashtable]` |
| `-HaveParameter` | Function has named parameter | `Get-Command fn \| Should -HaveParameter 'Name'` |

---

## Exceptions

```powershell
# Basic throw check
{ Risky-Cmd } | Should -Throw

# Match message — uses wildcard (-like) matching, not regex
{ Risky-Cmd } | Should -Throw -ExpectedMessage '*Access denied*'

# Match exception type
{ Risky-Cmd } | Should -Throw -ExceptionType ([System.IO.IOException])

# Match ErrorId
{ Risky-Cmd } | Should -Throw -ErrorId 'MyModule.NotFound'

# Ensure no throw
{ Safe-Cmd } | Should -Not -Throw
```

---

## File System

| Operator | Description | Example |
|----------|-------------|---------|
| `-Exist` | Path exists (Test-Path) | `'C:\file.txt' \| Should -Exist` |
| `-FileContentMatch` | File content regex (case-insensitive) | `$path \| Should -FileContentMatch 'pattern'` |
| `-FileContentMatchExactly` | File content regex (case-sensitive) | `$path \| Should -FileContentMatchExactly 'Pattern'` |
| `-FileContentMatchMultiline` | Multiline content regex (case-insensitive) | `$path \| Should -FileContentMatchMultiline '(?s)start.*end'` |
| `-FileContentMatchMultilineExactly` | Multiline content regex (case-sensitive) | `$path \| Should -FileContentMatchMultilineExactly 'Start.*End'` |

---

## Mock Verification

```powershell
# Called exactly N times
Should -Invoke Get-Item -Times 1 -Exactly

# Called at least once (default)
Should -Invoke Get-Item

# Never called
Should -Invoke Get-Item -Times 0 -Exactly

# Called with specific parameters (some calls may not match filter)
Should -Invoke Set-Content -ParameterFilter { $Path -eq 'C:\out.txt' }

# ALL calls must match the filter (stricter — no calls outside it allowed)
Should -Invoke Set-Content -ExclusiveFilter { $Path -like '*.txt' }

# Scope: count calls across the whole Describe block
Should -Invoke Write-Log -Times 3 -Scope Describe

# When mock is in a module, specify which module
Should -Invoke Get-Item -ModuleName MyModule -Times 1

# All verifiable mocks were called
Should -InvokeVerifiable
```

---

## Multiple Assertion Failures

By default, a first failed assertion stops the `It` block. To accumulate all failures:

```powershell
BeforeAll {
    $PesterPreference = New-PesterConfiguration
    $PesterPreference.Should.ErrorAction = 'Continue'
}
```

Or per-assertion:
```powershell
$r | Should -Be 'a' -ErrorAction Continue
$r | Should -Not -BeNullOrEmpty -ErrorAction Continue
```
