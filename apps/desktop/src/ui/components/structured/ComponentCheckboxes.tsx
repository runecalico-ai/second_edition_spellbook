import { useCallback } from "react";
import type { SpellComponents, MaterialComponentSpec } from "../../../types/spell";
import { VALIDATION, clampScalar, parseNumericInput } from "../../../lib/validation";

interface ComponentCheckboxesProps {
  components: SpellComponents | null | undefined;
  materialComponents: MaterialComponentSpec[] | null | undefined;
  onChange: (components: SpellComponents, materialComponents: MaterialComponentSpec[]) => void;
  onUncheckMaterialConfirm?: () => Promise<boolean>;
}

const DEFAULT_COMPONENTS: SpellComponents = {
  verbal: false,
  somatic: false,
  material: false,
  focus: false,
  divineFocus: false,
  experience: false,
};

export function ComponentCheckboxes({
  components,
  materialComponents,
  onChange,
  onUncheckMaterialConfirm,
}: ComponentCheckboxesProps) {
  const comp = components ?? DEFAULT_COMPONENTS;
  const materials = materialComponents ?? [];

  const updateComponents = useCallback(
    (next: SpellComponents) => {
      onChange(next, materials);
    },
    [onChange, materials],
  );

  const updateMaterials = useCallback(
    (next: MaterialComponentSpec[]) => {
      onChange(comp, next);
    },
    [onChange, comp],
  );

  const handleMaterialChange = useCallback(
    async (checked: boolean) => {
      if (!checked && materials.length > 0) {
        const confirm =
          onUncheckMaterialConfirm ??
          (() =>
            new Promise<boolean>((resolve) => {
              // Fallback: use window.confirm if no provider
              resolve(window.confirm("Clear all material component data?"));
            }));
        const ok = await confirm();
        if (!ok) return;
        updateMaterials([]);
      }
      updateComponents({ ...comp, material: checked });
    },
    [comp, materials.length, updateComponents, updateMaterials, onUncheckMaterialConfirm],
  );

  const textPreview = [
    comp.verbal && "V",
    comp.somatic && "S",
    comp.material && "M",
    comp.focus && "F",
    comp.divineFocus && "DF",
    comp.experience && "XP",
  ]
    .filter(Boolean)
    .join(", ") || "—";

  return (
    <div className="space-y-2" data-testid="component-checkboxes">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            data-testid="component-checkbox-verbal"
            checked={comp.verbal}
            onChange={(e) => updateComponents({ ...comp, verbal: e.target.checked })}
            className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-blue-600"
          />
          <span className="text-sm">Verbal (V)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            data-testid="component-checkbox-somatic"
            checked={comp.somatic}
            onChange={(e) => updateComponents({ ...comp, somatic: e.target.checked })}
            className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-blue-600"
          />
          <span className="text-sm">Somatic (S)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            data-testid="component-checkbox-material"
            checked={comp.material}
            onChange={(e) => handleMaterialChange(e.target.checked)}
            className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-blue-600"
          />
          <span className="text-sm">Material (M)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            data-testid="component-checkbox-focus"
            checked={comp.focus}
            onChange={(e) => updateComponents({ ...comp, focus: e.target.checked })}
            className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-blue-600"
          />
          <span className="text-sm">Focus (F)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            data-testid="component-checkbox-divine-focus"
            checked={comp.divineFocus}
            onChange={(e) => updateComponents({ ...comp, divineFocus: e.target.checked })}
            className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-blue-600"
          />
          <span className="text-sm">Divine Focus (DF)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            data-testid="component-checkbox-experience"
            checked={comp.experience}
            onChange={(e) => updateComponents({ ...comp, experience: e.target.checked })}
            className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-blue-600"
          />
          <span className="text-sm">Experience (XP)</span>
        </label>
      </div>
      <p className="text-sm text-neutral-500 italic" data-testid="component-text-preview">
        {textPreview}
      </p>

      {comp.material && (
        <MaterialSubForm
          materials={materials}
          onChange={updateMaterials}
        />
      )}
    </div>
  );
}

interface MaterialSubFormProps {
  materials: MaterialComponentSpec[];
  onChange: (m: MaterialComponentSpec[]) => void;
}

function MaterialSubForm({ materials, onChange }: MaterialSubFormProps) {
  const addMaterial = () => {
    onChange([
      ...materials,
      {
        name: "",
        quantity: VALIDATION.quantityMinDecimal,
        isConsumed: false,
      },
    ]);
  };

  const removeMaterial = (index: number) => {
    onChange(materials.filter((_, i) => i !== index));
  };

  const updateMaterial = (index: number, updates: Partial<MaterialComponentSpec>) => {
    const next = [...materials];
    if (index >= 0 && index < next.length) {
      next[index] = { ...next[index], ...updates };
      onChange(next);
    }
  };

  return (
    <div className="space-y-2 p-2 bg-neutral-900/50 rounded border border-neutral-800">
      <div className="flex justify-between items-center">
        <span className="text-xs text-neutral-500">Material components</span>
        <button
          type="button"
          data-testid="material-component-add"
          onClick={addMaterial}
          className="px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 rounded"
        >
          Add
        </button>
      </div>

      {materials.map((m, idx) => (
        <div
          key={`material-${idx}-${m.name || 'unnamed'}-${m.quantity || 0}`}
          className="grid gap-2 p-2 bg-neutral-900 rounded text-sm"
          data-testid="material-component-row"
        >
          <div className="flex gap-2 items-start">
            <input
              type="text"
              data-testid="material-component-name"
              aria-label="Material name"
              placeholder="Name (required)"
              value={m.name}
              onChange={(e) => updateMaterial(idx, { name: e.target.value })}
              className="flex-1 min-w-[120px] bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-neutral-100"
            />
            <input
              type="text"
              inputMode="decimal"
              data-testid="material-component-quantity"
              aria-label="Quantity"
              placeholder="1"
              value={m.quantity ?? 1}
              onChange={(e) => {
                const v = parseNumericInput(e.target.value);
                const clamped = Math.max(VALIDATION.quantityMinDecimal, clampScalar(v));
                updateMaterial(idx, { quantity: clamped });
              }}
              className="w-16 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-neutral-100"
            />
            <input
              type="text"
              inputMode="decimal"
              data-testid="material-component-gp-value"
              aria-label="GP value"
              placeholder="GP"
              value={m.gpValue ?? ""}
              onChange={(e) => {
                const v = parseNumericInput(e.target.value);
                updateMaterial(idx, {
                  gpValue: Number.isNaN(v) || v < 0 ? undefined : v,
                });
              }}
              className="w-16 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-neutral-100"
            />
            <label className="flex items-center gap-1 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                data-testid="material-component-consumed"
                checked={m.isConsumed ?? false}
                onChange={(e) => updateMaterial(idx, { isConsumed: e.target.checked })}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-blue-600"
              />
              <span className="text-xs">Consumed</span>
            </label>
            <button
              type="button"
              data-testid="material-component-remove"
              onClick={() => removeMaterial(idx)}
              className="px-2 py-1 text-xs text-red-400 hover:bg-neutral-800 rounded"
            >
              Remove
            </button>
          </div>
          <input
            type="text"
            data-testid="material-component-unit"
            aria-label="Unit"
            placeholder="Unit (e.g. grams)"
            value={m.unit ?? ""}
            onChange={(e) => updateMaterial(idx, { unit: e.target.value || undefined })}
            className="w-full max-w-[200px] bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100"
          />
          <textarea
            data-testid="material-component-description"
            aria-label="Description"
            placeholder="Description (optional)"
            value={m.description ?? ""}
            onChange={(e) => updateMaterial(idx, { description: e.target.value || undefined })}
            className="w-full min-h-[40px] bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100"
          />
        </div>
      ))}
    </div>
  );
}
