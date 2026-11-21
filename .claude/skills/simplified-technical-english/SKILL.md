---
name: simplified-technical-english
description: Use when writing technical documentation, user guides, maintenance manuals, or installation procedures for global or multilingual audiences, non-native English speakers, or safety-critical contexts. Also use when ASD-STE100 or controlled-language compliance is required, when translation quality is poor or inconsistent, or when documentation produces frequent misunderstandings or reader questions.
---

# Simplified Technical English (ASD-STE100)

## Overview

ASD-STE100 is an international controlled language standard for technical documentation (Issue 9, January 2025: 53 writing rules, ~900 approved words). Core principle: **one word — one meaning — one part of speech**.

STE is primarily used in **aerospace, aviation, defense**, and **MRO** (maintenance, repair, overhaul) documentation, including **S1000D** and **ATA iSpec 2200** compliant content. Also called **controlled language** or plain English for technical writing.

> **Note:** STE is designed to be used alongside a style guide, not as a replacement. Per ASD: "Can STE be used alone? No."

## When to Use

- Maintenance manuals, installation guides, operational procedures
- Documentation for global or multilingual audiences
- Any technical content where misunderstanding causes safety risk
- When improving translation quality (human or machine)

**Not for:** Marketing copy, narrative writing, or general non-technical content.

---

## The Two Parts of ASD-STE100

| Part | Content |
|------|---------|
| **Part 1 – Writing Rules** | 53 rules covering grammar, style, and structure |
| **Part 2 – Dictionary** | ~900 approved general words; approved = UPPERCASE entry |

Technical names and verbs not in the dictionary are permitted **if** they follow the rules in Part 1, Section 1 (rules 1.5 and 1.12).

> **Before applying rules, also load [`references/vocabulary.md`](references/vocabulary.md)** — it contains approved substitutions, unapproved words, and synonym exclusion lists required for compliance.

---

## Writing Rules by Category

### 1. Words
- Use each word only as the **part of speech** defined in the dictionary
- One word = **one meaning** — never use context-dependent meanings
- Do not use synonyms for the same concept; choose one word and use it throughout
- **Make instructions as clear and specific as possible**
- Give every technical name a **brief description on first use**
- Use American English spelling (Merriam-Webster)
- Use **articles** (`a`, `an`, `the`) and demonstrative adjectives before nouns where applicable — do not omit them to save space

### 2. Noun Clusters (Multi-Word Nouns)
- Maximum **3 words** in a noun cluster (do not write multi-word nouns with more than 3 words)
- Break longer clusters with prepositions or articles

| ❌ Not STE | ✅ STE |
|-----------|-------|
| fuel pump pressure indicator light | indicator light for the fuel pump pressure |
| safety valve inspection procedure | procedure for the inspection of the safety valve |

### 3. Verbs
- Use **active voice**: identify who or what performs the action
- Use passive only in descriptive writing **when the agent is unknown**
- Use **only these 6 approved forms:**

| Form | Use For | Example |
|------|---------|---------|
| Imperative | Instructions | "Remove the cover." |
| Simple present | Facts, descriptions | "The valve closes the circuit." |
| Simple past | Descriptive narratives | "The sensor detected the fault." |
| Simple future (`will`) | Expected outcomes | "The system will restart." |
| Infinitive | Purpose, options | "To close the valve, turn the handle." |
| Past participle | Adjective modifier; also permitted in simple passive voice (descriptive writing, agent unknown) | "the installed component" / "The sensor was replaced." / "The data is transmitted." |

- **Do not** use auxiliary verbs to form **progressive** (`is removing`), **perfect** (`has been removed`), or **compound modal** (`could have been`) constructions. Simple passive (`is`/`are`/`was`/`were` + past participle) is permitted in descriptive writing when the agent is unknown.
- **Do not** use the `-ing` form except as a technical noun or modifier in a recognized technical compound
  - ✅ "the operating temperature" — a recognized technical compound ("operating" modifies "temperature"; for project-specific terms, see vocabulary.md §Technical Names and Verbs)
  - ❌ "Before cleaning the part, remove it from the assembly." → ✅ "Remove the part from the assembly. Then clean the part."

### 4. Sentences
- Procedural sentences: maximum **20 words**
- Descriptive sentences: maximum **25 words**
- **Classification:** A sentence is **procedural** if it is in the imperative mood (direct instruction, implied "you"). All other sentences — facts, results, explanations — are **descriptive** and follow the 25-word limit.
- Write **one instruction per sentence**
- Do not omit sentence parts (verb, subject, article) to shorten text
- Use **vertical lists** for complex or multi-part information
- In conditional steps, **place the condition before the action** (so the reader checks the condition before starting)

  ❌ "Press the button if the light is green." → ✅ "If the light is green, press the button."

- Use **connecting words** (`then`, `so`, `but`) to link related sentences and improve flow
- Do not use **semicolons** (`;`) — use a period and a new sentence, or a vertical list instead

### 5. Procedures
- Number each step
- Use **imperative mood** for every instruction
- One **action** per step
- Place safety instructions **before** the step they apply to
- Use `must` only in descriptive requirement statements ("The torque must be within limits."); use the imperative for all procedural steps ("Tighten the bolt.")

### 6. Descriptive Writing
- Maximum **25 words** per sentence
- Use active voice; passive only when the agent is unknown

### 7. Safety Instructions
- Start with a clear **command or condition** statement
- Always place the safety instruction **before** the step it applies to

> **Note:** The Warning / Caution / Note alert-level hierarchy is defined by companion specifications (ATA iSpec 2200, S1000D, ANSI Z535), not by ASD-STE100 itself. STE governs only how the text of those instructions is written.

### 8. Paragraphs
- Maximum **6 sentences** per paragraph
- One **topic** per paragraph

---

## Quick Reference

| Rule | Limit / Requirement |
|------|---------------------|
| Procedural sentence length | ≤ 20 words |
| Descriptive sentence length | ≤ 25 words |
| Noun cluster length | ≤ 3 words |
| Paragraph length | ≤ 6 sentences |
| Voice (instructions) | Active / imperative |
| Voice (descriptions) | Active; passive only if agent unknown |
| `-ing` form | Technical nouns and recognized technical compound modifiers only |
| Obligation | `must` (not `shall`) — descriptive statements only; use imperative in procedure steps |
| Capability / possibility | `can` (not `may`) |
| Semicolons | Not permitted — use sentence break or vertical list |
| Phrasal verbs | Not permitted — use a single STE verb |

---

## Before / After Examples

| ❌ Before (non-STE) | ✅ After (STE) |
|--------------------|---------------|
| "It must be ensured that the valve is in the closed position prior to commencement of the procedure." | "Before you start the procedure, make sure the valve is closed." |
| "The utilization of incorrect torque values may result in subsequent component failure." | "If you use incorrect torque values, the component can fail." |
| "Remove and inspect the sealing mechanism." | "Remove the seal. Inspect the seal." |
| "Verify satisfactory completion of pre-operational checks." | "Make sure the pre-operation checks are complete." |
| "Before removing the cover, disconnect the power." | "Disconnect the power. Then remove the cover." *(Fix: -ing gerund connector replaced with two separate imperative sentences)* |
| "Remove bolt from cover." | "Remove the bolt from the cover." |
| "Must tighten the bolt to 25 Nm." | "Tighten the bolt to 25 Nm." |
| "Take off the cover. Go through the checklist." | "Remove the cover. Read the checklist." |

---

## Common Mistakes

| Mistake | Correction |
|---------|-----------|
| Noun cluster > 3 words | Break with prepositions: "indicator for the oil pressure" |
| Passive voice with known actor | Use the imperative: "Tighten the bolt." — not "The bolt was tightened by the technician." |
| Using synonyms | Pick one word: always "remove" — never alternate with "detach" |
| `-ing` as a connector | Rewrite: "Disconnect the power. Then remove the cover." |
| `shall` for obligation | Use `must` |
| `may` for possibility | Use `can` |
| `in order to` | Replace with `to` |
| `prior to` / `subsequent to` | Replace with `before` / `after` |
| `ensure` | Replace with `make sure` |
| `utilize` | Replace with `use` |
| Nominalization (verb-as-noun) | "check" not "perform a check"; "install" not "carry out installation" |
| Phrasal verbs (`go through`, `take off`) | Replace with a single STE verb: "read" (not "go through"), "remove" (not "take off") |
| Ambiguous pronouns (`it`, `this`, `they`) | Replace with the specific noun |
| `must` in a procedure step | Use the imperative: "Tighten the bolt." not "Must tighten the bolt." or "The bolt must be tightened." |
| `should` | Ambiguous — use `must` (obligation) or `can` (possibility) depending on meaning |

---

## Verification Checklist

- [ ] All procedural sentences ≤ 20 words
- [ ] All descriptive sentences ≤ 25 words
- [ ] No noun cluster with more than 3 words
- [ ] Active voice used for all instructions
- [ ] Passive used only where the actor is truly unknown
- [ ] No `-ing` forms except in technical nouns or recognized technical compound modifiers (e.g., "operating temperature")
- [ ] No progressive (`is removing`), perfect (`has been removed`), or compound modal (`could have been`) constructions
- [ ] Same word used for the same thing throughout
- [ ] Technical terms defined on first use
- [ ] Imperative mood for all procedural steps
- [ ] Safety instructions placed before affected steps
- [ ] Conditions placed before actions in conditional steps
- [ ] No nominalizations — use the specific verb directly ("check" not "perform a check"; "install" not "carry out installation")
- [ ] American English spelling used throughout (Merriam-Webster)
- [ ] No `shall`, `should`, `may`, `ensure`, `utilize`, `prior to`, `subsequent to`, `in order to`
- [ ] No semicolons — use sentence breaks or vertical lists
- [ ] No phrasal verbs (e.g., `take off` → `remove`, `go through` → `read`)
- [ ] Articles and demonstrative adjectives used before nouns where applicable
- [ ] No ambiguous pronouns (`it`, `this`, `they`) — use the specific noun
- [ ] Each paragraph: ≤ 6 sentences, one topic only
- [ ] Each procedural step: numbered and contains one action only

---

## Reference

See [vocabulary.md](references/vocabulary.md) for the approved/not-approved substitution table and vocabulary principles.
