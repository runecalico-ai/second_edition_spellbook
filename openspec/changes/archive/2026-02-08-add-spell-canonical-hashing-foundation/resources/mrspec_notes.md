In SpellDamageSpec.parts[], keep a small optional override:
```json
{
  "mr_override": {
    "type": "string",
    "enum": ["inherit", "normal", "ignores_mr", "special", "unknown"],
    "default": "inherit"
  }
}
```

Default behavior: each part uses the spell’s MagicResistanceSpec.

If a part differs, set mr_override accordingly.

If mr_override="special", use parts[].notes (or add mr_special_rule) to state the exception.


## Decision rule you can adopt (simple and consistent)

-   **If MR affects whether the spell takes hold at all** → spell-level `MagicResistanceSpec.kind="normal"`.

-   **If spell text says “unaffected by MR” / “ignores MR”** → `ignores_mr`.

-   **If only some effects are checked by MR** → `partial` at spell-level, and (optionally) annotate part overrides.

-   **If it’s weird** (e.g., MR applies only to creatures, not objects; or only to extraplanar beings) → `special`.