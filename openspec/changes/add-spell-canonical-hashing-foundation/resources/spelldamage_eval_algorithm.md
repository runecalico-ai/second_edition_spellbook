## Evaluation algorithm (normative, minimal)

Given inputs (at minimum: `caster_level`, `spell_level`, any choices, and tick counts if driven externally):

### Combine Mode Semantics

The `combine_mode` determines how multiple damage parts are combined:
-   **`sum`**: All parts are summed (order-independent)
-   **`max`**: The maximum damage from any part is used (order-independent)
-   **`choose_one`**: Player/DM chooses one part (order-independent)
-   **`sequence`**: Parts execute in array order (order-dependent)

For `sequence` mode, the order of parts in the `parts` array is semantically meaningful and must be preserved during normalization.


For each `DamagePart`:

1.  Start with `DicePool base`.

2.  Apply each `ScalingRule` in array order:

    -   Determine `steps = floor(driver_value / step)` (or whatever your global convention is; for 2E “per level” it’s usually `floor((caster_level)/step)`).

    -   If `max_steps` present: `steps = min(steps, max_steps)`.

    -   If `add_dice_per_step`: add `steps * dice_increment` to the pool (multiply counts).

    -   If `add_flat_per_step`: add `steps * flat_increment` to `flat_modifier`.

    -   If `set_base_by_level_band`: replace base pool with matching band’s `base`.

3.  Apply `application`:

    -   roll/apply the part `ticks` times (or treat as “repeatable” and aggregate as you prefer).

4.  Apply `save` for that part:

    -   `half`: multiply final by 1/2 (use integer rounding policy in your engine, not here)

    -   `partial`: multiply by `numerator/denominator`

    -   `negates`: becomes 0 on successful save

5.  Apply `clamp_total` after save (recommended), unless a spell explicitly clamps pre-save.


You can codify rounding separately as a global engine rule (e.g., “round down after division”).