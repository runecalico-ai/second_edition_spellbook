import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  defaultAreaSpec,
  defaultMagicResistanceSpec,
  defaultSavingThrowSpec,
  defaultSpellDamageSpec,
} from "../../../types/spell";
import type {
  AreaSpec,
  MagicResistanceSpec,
  MaterialComponentSpec,
  SavingThrowSpec,
  SpellComponents,
  SpellDamageSpec,
} from "../../../types/spell";
import {
  AreaForm,
  ComponentCheckboxes,
  DamageForm,
  MagicResistanceInput,
  SavingThrowInput,
  StructuredFieldInput,
} from "./index";
import { fn } from "./storybook-utils";

/**
 * Canon-first Details block: default view is single-line text inputs with per-field expand.
 * These stories illustrate the UI pattern and stable test IDs used in SpellEditor.
 */
const meta = {
  title: "SpellEditor/CanonFirstDetails",
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Simplified illustrative row used only by Storybook canon-first stories.
 * Real production behavior lives in SpellEditor.tsx and includes additional
 * logic such as focus management, dirty tracking, and loading/async parser state.
 */
function CanonRow({
  label,
  testIdPrefix,
  value,
  onValueChange,
  expanded,
  onExpandToggle,
  children,
  isSpecial,
}: {
  label: string;
  testIdPrefix: string;
  value: string;
  onValueChange: (v: string) => void;
  expanded: boolean;
  onExpandToggle: () => void;
  children?: React.ReactNode;
  isSpecial?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${testIdPrefix}-input`} className="text-xs text-neutral-500">
        {label}
      </label>
      <div className="flex flex-col gap-1">
        <input
          id={`${testIdPrefix}-input`}
          data-testid={`${testIdPrefix}-input`}
          type="text"
          aria-label={label}
          className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded text-sm"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid={`${testIdPrefix}-expand`}
            aria-expanded={expanded}
            aria-controls={expanded ? `${testIdPrefix}-panel` : undefined}
            onClick={onExpandToggle}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          {isSpecial && !expanded && (
            <span className="text-xs text-amber-500" title="Stored as text; not fully structured">
              (special)
            </span>
          )}
        </div>
      </div>
      {expanded && (
        <section
          id={`${testIdPrefix}-panel`}
          aria-label={`Structured ${label}`}
          className="mt-2 p-3 rounded border border-neutral-700 bg-neutral-900/80"
        >
          {children}
        </section>
      )}
    </div>
  );
}

/** Default (collapsed) state: all detail fields as single-line inputs and expand controls visible. */
export const DefaultCollapsed: Story = {
  render: function DefaultCollapsedStory() {
    const [range, setRange] = useState("Touch");
    const [duration, setDuration] = useState("1 round/level");
    const [area, setArea] = useState("Special");
    return (
      <div className="space-y-3 text-sm max-w-md">
        <span className="block text-sm text-neutral-400">Details</span>
        <CanonRow
          label="Range"
          testIdPrefix="detail-range"
          value={range}
          onValueChange={setRange}
          expanded={false}
          onExpandToggle={() => {}}
        />
        <CanonRow
          label="Duration"
          testIdPrefix="detail-duration"
          value={duration}
          onValueChange={setDuration}
          expanded={false}
          onExpandToggle={() => {}}
        />
        <CanonRow
          label="Area of Effect"
          testIdPrefix="detail-area"
          value={area}
          onValueChange={setArea}
          expanded={false}
          onExpandToggle={() => {}}
        />
      </div>
    );
  },
};

/** One field expanded: Duration expanded showing StructuredFieldInput. */
export const OneFieldExpanded: Story = {
  render: function OneFieldExpandedStory() {
    const [range, setRange] = useState("Touch");
    const [duration, setDuration] = useState("1 round/level");
    const [expanded, setExpanded] = useState<"duration" | null>("duration");
    const [durationSpec, setDurationSpec] = useState<{
      kind: string;
      unit?: string;
      duration?: { mode: string; value?: number };
    } | null>({
      kind: "time",
      unit: "round",
      duration: { mode: "per_level", value: 1, perLevel: 1 },
    });
    return (
      <div className="space-y-3 text-sm max-w-md">
        <span className="block text-sm text-neutral-400">Details</span>
        <CanonRow
          label="Range"
          testIdPrefix="detail-range"
          value={range}
          onValueChange={setRange}
          expanded={false}
          onExpandToggle={() => {}}
        />
        <CanonRow
          label="Duration"
          testIdPrefix="detail-duration"
          value={duration}
          onValueChange={setDuration}
          expanded={expanded === "duration"}
          onExpandToggle={() => setExpanded(expanded === "duration" ? null : "duration")}
        >
          <StructuredFieldInput
            fieldType="duration"
            value={durationSpec ?? undefined}
            onChange={fn((spec) => setDurationSpec(spec as typeof durationSpec))}
          />
        </CanonRow>
      </div>
    );
  },
};

/** Collapsed field with "special" indicator (unparseable / stored as text). */
export const CollapsedWithSpecialIndicator: Story = {
  render: function CollapsedWithSpecialIndicatorStory() {
    return (
      <div className="space-y-3 text-sm max-w-md">
        <span className="block text-sm text-neutral-400">Details</span>
        <CanonRow
          label="Range"
          testIdPrefix="detail-range"
          value="Special (see description)"
          onValueChange={() => {}}
          expanded={false}
          onExpandToggle={() => {}}
          isSpecial
        />
      </div>
    );
  },
};

/** Expanded field in loading state: matches production canon-first loading indicator. */
export const LoadingState: Story = {
  render: function LoadingStateStory() {
    return (
      <div className="space-y-3 text-sm max-w-md">
        <span className="block text-sm text-neutral-400">Details</span>
        <CanonRow
          label="Range"
          testIdPrefix="detail-range"
          value="30 ft"
          onValueChange={() => {}}
          expanded
          onExpandToggle={() => {}}
        >
          <div className="text-sm text-neutral-500" data-testid="detail-range-loading">
            Loading…
          </div>
        </CanonRow>
      </div>
    );
  },
};

/** Range expanded: StructuredFieldInput for range. */
export const RangeExpanded: Story = {
  render: function RangeExpandedStory() {
    const [range, setRange] = useState("30 ft");
    const [expanded, setExpanded] = useState(true);
    const [rangeSpec, setRangeSpec] = useState<{
      kind: string;
      unit?: string;
      distance?: { mode: string; value?: number };
    } | null>({
      kind: "distance",
      unit: "ft",
      distance: { mode: "fixed", value: 30 },
    });
    return (
      <div className="space-y-3 text-sm max-w-md">
        <span className="block text-sm text-neutral-400">Details</span>
        <CanonRow
          label="Range"
          testIdPrefix="detail-range"
          value={range}
          onValueChange={setRange}
          expanded={expanded}
          onExpandToggle={() => setExpanded(!expanded)}
        >
          <StructuredFieldInput
            fieldType="range"
            value={rangeSpec ?? undefined}
            onChange={fn((spec) => setRangeSpec(spec as typeof rangeSpec))}
          />
        </CanonRow>
      </div>
    );
  },
};

/** Casting Time expanded: StructuredFieldInput for casting_time. */
export const CastingTimeExpanded: Story = {
  render: function CastingTimeExpandedStory() {
    const [castingTime, setCastingTime] = useState("1 action");
    const [expanded, setExpanded] = useState(true);
    const [castingTimeSpec, setCastingTimeSpec] = useState<{
      text?: string;
      unit?: string;
      baseValue?: number;
    } | null>({
      text: "1 action",
      unit: "action",
      baseValue: 1,
    });
    return (
      <div className="space-y-3 text-sm max-w-md">
        <span className="block text-sm text-neutral-400">Details</span>
        <CanonRow
          label="Casting Time"
          testIdPrefix="detail-casting-time"
          value={castingTime}
          onValueChange={setCastingTime}
          expanded={expanded}
          onExpandToggle={() => setExpanded(!expanded)}
        >
          <StructuredFieldInput
            fieldType="casting_time"
            value={castingTimeSpec ?? undefined}
            onChange={fn((spec) => setCastingTimeSpec(spec as typeof castingTimeSpec))}
          />
        </CanonRow>
      </div>
    );
  },
};

/** Components expanded: ComponentCheckboxes with material list. */
export const ComponentsExpanded: Story = {
  render: function ComponentsExpandedStory() {
    const [components, setComponents] = useState("V, S, M");
    const [expanded, setExpanded] = useState(true);
    const [comp, setComp] = useState<SpellComponents>({
      verbal: true,
      somatic: true,
      material: true,
      focus: false,
      divineFocus: false,
      experience: false,
    });
    const [mats, setMats] = useState<MaterialComponentSpec[]>([
      { name: "ruby dust", quantity: 1, gpValue: 50 },
    ]);
    return (
      <div className="space-y-3 text-sm max-w-md">
        <span className="block text-sm text-neutral-400">Details</span>
        <CanonRow
          label="Components"
          testIdPrefix="detail-components"
          value={components}
          onValueChange={setComponents}
          expanded={expanded}
          onExpandToggle={() => setExpanded(!expanded)}
        >
          <ComponentCheckboxes
            components={comp}
            materialComponents={mats}
            onChange={(c, m) => {
              setComp(c);
              setMats(m);
            }}
            onUncheckMaterialConfirm={() => Promise.resolve(true)}
            variant="vsm"
          />
        </CanonRow>
      </div>
    );
  },
};

/** Area of Effect expanded: AreaForm. */
export const AreaExpanded: Story = {
  render: function AreaExpandedStory() {
    const [area, setArea] = useState("30 ft radius");
    const [expanded, setExpanded] = useState(true);
    const [areaSpec, setAreaSpec] = useState<AreaSpec | null>(() => defaultAreaSpec());
    return (
      <div className="space-y-3 text-sm max-w-md">
        <span className="block text-sm text-neutral-400">Details</span>
        <CanonRow
          label="Area of Effect"
          testIdPrefix="detail-area"
          value={area}
          onValueChange={setArea}
          expanded={expanded}
          onExpandToggle={() => setExpanded(!expanded)}
        >
          <AreaForm value={areaSpec ?? undefined} onChange={fn((spec) => setAreaSpec(spec))} />
        </CanonRow>
      </div>
    );
  },
};

/** Saving Throw expanded: SavingThrowInput. */
export const SavingThrowExpanded: Story = {
  render: function SavingThrowExpandedStory() {
    const [savingThrow, setSavingThrow] = useState("Spell");
    const [expanded, setExpanded] = useState(true);
    const [saveSpec, setSaveSpec] = useState<SavingThrowSpec | null>(() =>
      defaultSavingThrowSpec(),
    );
    return (
      <div className="space-y-3 text-sm max-w-md">
        <span className="block text-sm text-neutral-400">Details</span>
        <CanonRow
          label="Saving Throw"
          testIdPrefix="detail-saving-throw"
          value={savingThrow}
          onValueChange={setSavingThrow}
          expanded={expanded}
          onExpandToggle={() => setExpanded(!expanded)}
        >
          <SavingThrowInput
            value={saveSpec ?? undefined}
            onChange={fn((spec) => setSaveSpec(spec))}
          />
        </CanonRow>
      </div>
    );
  },
};

/** Damage expanded: DamageForm. */
export const DamageExpanded: Story = {
  render: function DamageExpandedStory() {
    const [damage, setDamage] = useState("1d6 fire");
    const [expanded, setExpanded] = useState(true);
    const [damageSpec, setDamageSpec] = useState<SpellDamageSpec | null>(() =>
      defaultSpellDamageSpec(),
    );
    return (
      <div className="space-y-3 text-sm max-w-md">
        <span className="block text-sm text-neutral-400">Details</span>
        <CanonRow
          label="Damage"
          testIdPrefix="detail-damage"
          value={damage}
          onValueChange={setDamage}
          expanded={expanded}
          onExpandToggle={() => setExpanded(!expanded)}
        >
          <DamageForm
            value={damageSpec ?? undefined}
            onChange={fn((spec) => setDamageSpec(spec))}
          />
        </CanonRow>
      </div>
    );
  },
};

/** Magic Resistance expanded: MagicResistanceInput. */
export const MagicResistanceExpanded: Story = {
  render: function MagicResistanceExpandedStory() {
    const [magicResistance, setMagicResistance] = useState("Normal");
    const [expanded, setExpanded] = useState(true);
    const [mrSpec, setMrSpec] = useState<MagicResistanceSpec | null>(() =>
      defaultMagicResistanceSpec(),
    );
    return (
      <div className="space-y-3 text-sm max-w-md">
        <span className="block text-sm text-neutral-400">Details</span>
        <CanonRow
          label="Magic Resistance"
          testIdPrefix="detail-magic-resistance"
          value={magicResistance}
          onValueChange={setMagicResistance}
          expanded={expanded}
          onExpandToggle={() => setExpanded(!expanded)}
        >
          <MagicResistanceInput
            value={mrSpec ?? undefined}
            onChange={fn((spec) => setMrSpec(spec))}
          />
        </CanonRow>
      </div>
    );
  },
};

/** Material Component expanded: shares ComponentCheckboxes with Components. */
export const MaterialComponentsExpanded: Story = {
  render: function MaterialComponentsExpandedStory() {
    const [materialComponents, setMaterialComponents] = useState("ruby dust 50 gp");
    const [expanded, setExpanded] = useState(true);
    const [comp, setComp] = useState<SpellComponents>({
      verbal: false,
      somatic: false,
      material: true,
      focus: false,
      divineFocus: false,
      experience: false,
    });
    const [mats, setMats] = useState<MaterialComponentSpec[]>([
      { name: "ruby dust", quantity: 1, gpValue: 50 },
    ]);
    return (
      <div className="space-y-3 text-sm max-w-md">
        <span className="block text-sm text-neutral-400">Details</span>
        <CanonRow
          label="Material Component"
          testIdPrefix="detail-material-components"
          value={materialComponents}
          onValueChange={setMaterialComponents}
          expanded={expanded}
          onExpandToggle={() => setExpanded(!expanded)}
        >
          <ComponentCheckboxes
            components={comp}
            materialComponents={mats}
            onChange={(c, m) => {
              setComp(c);
              setMats(m);
            }}
            onUncheckMaterialConfirm={() => Promise.resolve(true)}
            variant="vsm"
          />
        </CanonRow>
      </div>
    );
  },
};
