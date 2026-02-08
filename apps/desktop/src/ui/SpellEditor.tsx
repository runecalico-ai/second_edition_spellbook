import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useModal } from "../store/useModal";

// Mirrors SpellDetail struct from backend
type SpellDetail = {
  id?: number;
  name: string;
  school?: string;
  sphere?: string;
  classList?: string;
  level: number;
  range?: string;
  components?: string;
  materialComponents?: string;
  castingTime?: string;
  duration?: string;
  area?: string;
  savingThrow?: string;
  reversible?: number;
  description: string;
  tags?: string;
  source?: string;
  edition?: string;
  author?: string;
  license?: string;
  isQuestSpell: number;
  isCantrip: number;
  artifacts?: {
    id: number;
    type: string;
    path: string;
    hash: string;
    imported_at: string;
  }[];
};

// Mirrors SpellCreate struct
type SpellCreate = Omit<SpellDetail, "id" | "updated_at" | "created_at">;

export default function SpellEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { alert: modalAlert, confirm: modalConfirm } = useModal();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<SpellDetail>({
    name: "",
    level: 1,
    description: "",
    reversible: 0,
    isQuestSpell: 0,
    isCantrip: 0,
  });
  const [printStatus, setPrintStatus] = useState("");
  const [pageSize, setPageSize] = useState<"a4" | "letter">("letter");

  const isNew = id === "new";

  useEffect(() => {
    if (!isNew && id) {
      setLoading(true);
      invoke<SpellDetail>("get_spell", { id: Number.parseInt(id) })
        .then((data) => {
          if (data) setForm(data);
        })
        .finally(() => setLoading(false));
    }
  }, [id, isNew]);

  const handleChange = (field: keyof SpellDetail, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const isNameInvalid = !form.name.trim();
  const isDescriptionInvalid = !form.description.trim();
  const isLevelInvalid = Number.isNaN(form.level) || form.level < 0 || form.level > 12;

  const isArcane = !!form.school;
  const isDivine = !!form.sphere;

  const getLevelDisplay = (level: number) => {
    if (level === 0 && form.isCantrip) return "Cantrip";
    if (level >= 10 && isArcane) {
      const circle = level === 10 ? "10th" : level === 11 ? "11th" : "12th";
      return `${circle} Circle`;
    }
    if (level === 8 && form.isQuestSpell) return "Quest";
    return `Level ${level}`;
  };

  const divineClasses = ["priest", "cleric", "druid", "paladin", "ranger"];
  const classesLower = form.classList?.toLowerCase() || "";
  const hasDivine = divineClasses.some((c) => classesLower.includes(c));

  const isEpicRestricted = form.level >= 10 && (isDivine || !isArcane);
  const isQuestRestricted = form.isQuestSpell === 1 && (isArcane || !isDivine);
  const isConflictRestricted = form.level >= 10 && form.isQuestSpell === 1;
  const isCantripRestricted = form.isCantrip === 1 && form.level !== 0;

  const validationErrors = [
    isNameInvalid && "Name is required",
    isDescriptionInvalid && "Description is required",
    isLevelInvalid && "Level must be between 0 and 12",
    isEpicRestricted && "Levels 10-12 are Arcane (has School) only",
    isQuestRestricted && "Quest spells are Divine (has Sphere) only",
    isConflictRestricted && "A spell cannot be both Epic and Quest",
    isCantripRestricted && "Cantrips must be Level 0",
  ].filter(Boolean) as string[];

  const isInvalid = validationErrors.length > 0;
  const save = async () => {
    try {
      if (isInvalid) {
        await modalAlert(validationErrors, "Validation Errors", "error");
        return;
      }
      setLoading(true);
      if (isNew) {
        // create_spell expects SpellCreate
        const { id, ...createData } = form; // eslint-disable-line @typescript-eslint/no-unused-vars
        await invoke("create_spell", { spell: createData });
      } else {
        // update_spell expects SpellUpdate (which includes id and excludes artifacts)
        const { artifacts, ...updateData } = form; // eslint-disable-line @typescript-eslint/no-unused-vars
        await invoke("update_spell", { spell: updateData });
      }
      navigate("/");
    } catch (e) {
      await modalAlert(`Failed to save: ${e}`, "Save Error", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await modalConfirm(
      "Are you sure you want to delete this spell?",
      "Delete Spell",
    );
    if (!confirmed) return;
    try {
      if (form.id) {
        await invoke("delete_spell", { id: form.id });
        navigate("/");
      }
    } catch (e) {
      await modalAlert(`Failed to delete: ${e}`, "Delete Error", "error");
    }
  };

  const printSpell = async (layout: "compact" | "stat-block") => {
    if (!form.id) return;
    setPrintStatus("Generating print…");
    try {
      const path = await invoke<string>("print_spell", {
        spellId: form.id,
        layout,
        pageSize,
      });
      setPrintStatus(path ? `Print ready: ${path}` : "No output returned");
    } catch (e) {
      setPrintStatus(`Print failed: ${e}`);
    }
  };

  if (loading && !form.name) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 overflow-auto h-full">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{isNew ? "New Spell" : "Edit Spell"}</h1>
          <div className="flex gap-2">
            {form.isQuestSpell === 1 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-yellow-600/30 bg-yellow-600/20 text-yellow-500">
                Quest
              </span>
            )}
            {form.level >= 10 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-purple-600/30 bg-purple-600/20 text-purple-400">
                Epic
              </span>
            )}
            {form.level === 0 && form.isCantrip === 1 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-neutral-600/30 bg-neutral-600/20 text-neutral-400">
                Cantrip
              </span>
            )}
          </div>
        </div>
        <div className="space-x-2">
          {!isNew && (
            <>
              <select
                value={pageSize}
                data-testid="print-page-size-select"
                aria-label="Print page size"
                onChange={(e) => setPageSize(e.target.value as "a4" | "letter")}
                className="bg-neutral-800 text-xs rounded px-2 py-1 border border-neutral-700"
              >
                <option value="letter">Letter</option>
                <option value="a4">A4</option>
              </select>
              <button
                type="button"
                data-testid="btn-print-compact"
                onClick={() => printSpell("compact")}
                className="px-3 py-2 text-xs bg-neutral-800 rounded hover:bg-neutral-700"
              >
                Print Compact
              </button>
              <button
                type="button"
                data-testid="btn-print-stat-block"
                onClick={() => printSpell("stat-block")}
                className="px-3 py-2 text-xs bg-neutral-800 rounded hover:bg-neutral-700"
              >
                Print Stat-block
              </button>
            </>
          )}
          {!isNew && (
            <button
              id="btn-delete-spell"
              data-testid="btn-delete-spell"
              type="button"
              onClick={handleDelete}
              className="px-3 py-2 text-red-400 hover:bg-neutral-800 rounded"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            data-testid="btn-cancel-edit"
            onClick={() => navigate("/")}
            className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded"
          >
            Cancel
          </button>
          <button
            id="btn-save-spell"
            data-testid="btn-save-spell"
            type="button"
            onClick={save}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded font-bold"
          >
            Save Spell
          </button>
        </div>
      </div>
      {printStatus && (
        <div className="text-xs text-neutral-400" data-testid="print-status-message">
          {printStatus}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="spell-name" className="block text-sm text-neutral-400">
            Name
          </label>
          <input
            id="spell-name"
            data-testid="spell-name-input"
            className={`w-full bg-neutral-900 border p-2 rounded ${
              isNameInvalid ? "border-red-500" : "border-neutral-700"
            }`}
            placeholder="Spell Name"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            required
          />
          {isNameInvalid && (
            <p className="text-xs text-red-400 mt-1" data-testid="error-name-required">
              Name is required.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="spell-level" className="block text-sm text-neutral-400">
            Level
          </label>
          <input
            id="spell-level"
            data-testid="spell-level-input"
            className={`w-full bg-neutral-900 border p-2 rounded ${
              isLevelInvalid ? "border-red-500" : "border-neutral-700"
            }`}
            type="number"
            value={form.level}
            onChange={(e) => {
              const val = e.target.valueAsNumber;
              const clamped = Math.max(0, Math.min(12, Number.isNaN(val) ? 0 : Math.floor(val)));
              handleChange("level", clamped);
              if (clamped !== 0) handleChange("isCantrip", 0);
              if (clamped !== 8) handleChange("isQuestSpell", 0);
            }}
          />
          <div className="text-xs text-neutral-500 mt-1" data-testid="spell-level-display">
            {getLevelDisplay(form.level)}
          </div>
          <div className="flex gap-4 mt-2">
            <label
              className={`flex items-center gap-2 cursor-pointer group ${form.level !== 0 ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="checkbox"
                data-testid="chk-cantrip"
                disabled={form.level !== 0}
                checked={form.isCantrip === 1}
                onChange={(e) => handleChange("isCantrip", e.target.checked ? 1 : 0)}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-neutral-900"
              />
              <span className="text-sm text-neutral-400 group-hover:text-neutral-300">Cantrip</span>
            </label>
            <label
              className={`flex items-center gap-2 cursor-pointer group ${form.level !== 8 ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="checkbox"
                data-testid="chk-quest"
                disabled={form.level !== 8}
                checked={form.isQuestSpell === 1}
                onChange={(e) => handleChange("isQuestSpell", e.target.checked ? 1 : 0)}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-neutral-900"
              />
              <span className="text-sm text-neutral-400 group-hover:text-neutral-300">
                Quest Spell
              </span>
            </label>
          </div>
          {isLevelInvalid && (
            <p className="text-xs text-red-400 mt-1" data-testid="error-level-range">
              Level must be 0-12.
            </p>
          )}
          {isEpicRestricted && (
            <p className="text-xs text-yellow-500 mt-1" data-testid="warning-epic-arcane">
              Epic levels (10-12) are Arcane only.
            </p>
          )}
          {isQuestRestricted && (
            <p className="text-xs text-yellow-500 mt-1" data-testid="warning-quest-divine">
              Quest spells are Divine only.
            </p>
          )}
          {isConflictRestricted && (
            <p className="text-xs text-red-400 mt-1" data-testid="error-epic-quest-conflict">
              Cannot be both Epic and Quest spell.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="spell-school" className="block text-sm text-neutral-400">
            School
          </label>
          <input
            id="spell-school"
            data-testid="spell-school-input"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded disabled:opacity-50 disabled:bg-neutral-800"
            value={form.school || ""}
            disabled={isDivine}
            onChange={(e) => handleChange("school", e.target.value)}
          />
          {isDivine && (
            <p className="text-[10px] text-neutral-500 mt-0.5 italic">Disabled for Divine spells</p>
          )}
        </div>
        <div>
          <label htmlFor="spell-sphere" className="block text-sm text-neutral-400">
            Sphere
          </label>
          <input
            id="spell-sphere"
            data-testid="spell-sphere-input"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded disabled:opacity-50 disabled:bg-neutral-800"
            value={form.sphere || ""}
            disabled={isArcane}
            onChange={(e) => handleChange("sphere", e.target.value)}
          />
          {isArcane && (
            <p className="text-[10px] text-neutral-500 mt-0.5 italic">Disabled for Arcane spells</p>
          )}
        </div>
        <div>
          <label htmlFor="spell-classes" className="block text-sm text-neutral-400">
            Classes (e.g. Mage, Cleric)
          </label>
          <input
            id="spell-classes"
            data-testid="spell-classes-input"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.classList || ""}
            onChange={(e) => handleChange("classList", e.target.value)}
          />
        </div>
        {/* Add more fields as needed for MVP */}
        <div>
          <label htmlFor="spell-source" className="block text-sm text-neutral-400">
            Source
          </label>
          <input
            id="spell-source"
            data-testid="spell-source-input"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.source || ""}
            onChange={(e) => handleChange("source", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="spell-edition" className="block text-sm text-neutral-400">
            Edition
          </label>
          <input
            id="spell-edition"
            data-testid="spell-edition-input"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.edition || ""}
            onChange={(e) => handleChange("edition", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="spell-author" className="block text-sm text-neutral-400">
            Author
          </label>
          <input
            id="spell-author"
            data-testid="spell-author-input"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.author || ""}
            onChange={(e) => handleChange("author", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="spell-license" className="block text-sm text-neutral-400">
            License
          </label>
          <input
            id="spell-license"
            data-testid="spell-license-input"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.license || ""}
            onChange={(e) => handleChange("license", e.target.value)}
          />
        </div>
      </div>

      <div>
        <span className="block text-sm text-neutral-400">Details</span>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <input
            placeholder="Range"
            data-testid="spell-range-input"
            aria-label="Range"
            className="bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.range || ""}
            onChange={(e) => handleChange("range", e.target.value)}
          />
          <input
            placeholder="Components (V,S,M)"
            data-testid="spell-components-input"
            aria-label="Components"
            className="bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.components || ""}
            onChange={(e) => handleChange("components", e.target.value)}
          />
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-700 p-2 rounded">
            <input
              id="spell-reversible"
              data-testid="chk-reversible"
              type="checkbox"
              className="h-4 w-4"
              checked={Boolean(form.reversible)}
              onChange={(e) => handleChange("reversible", e.target.checked ? 1 : 0)}
            />
            <label htmlFor="spell-reversible" className="text-xs text-neutral-400">
              Reversible
            </label>
          </div>
          <input
            placeholder="Duration"
            data-testid="spell-duration-input"
            aria-label="Duration"
            className="bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.duration || ""}
            onChange={(e) => handleChange("duration", e.target.value)}
          />
          <input
            placeholder="Casting Time"
            data-testid="spell-casting-time-input"
            aria-label="Casting time"
            className="bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.castingTime || ""}
            onChange={(e) => handleChange("castingTime", e.target.value)}
          />
          <input
            placeholder="Area"
            data-testid="spell-area-input"
            aria-label="Area"
            className="bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.area || ""}
            onChange={(e) => handleChange("area", e.target.value)}
          />
          <input
            placeholder="Save"
            data-testid="spell-save-input"
            aria-label="Saving throw"
            className="bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.savingThrow || ""}
            onChange={(e) => handleChange("savingThrow", e.target.value)}
          />
        </div>
      </div>

      <div>
        <label htmlFor="spell-material-components" className="block text-sm text-neutral-400">
          Material Components
        </label>
        <textarea
          id="spell-material-components"
          data-testid="spell-material-components-input"
          className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded min-h-[80px]"
          value={form.materialComponents || ""}
          onChange={(e) => handleChange("materialComponents", e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="spell-tags" className="block text-sm text-neutral-400">
          Tags
        </label>
        <textarea
          id="spell-tags"
          data-testid="spell-tags-input"
          className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded min-h-[80px]"
          placeholder="Comma-separated tags"
          value={form.tags || ""}
          onChange={(e) => handleChange("tags", e.target.value)}
        />
      </div>

      <div className="flex-1 flex flex-col">
        <label htmlFor="spell-description" className="block text-sm text-neutral-400">
          Description
        </label>
        <textarea
          id="spell-description"
          data-testid="spell-description-textarea"
          className={`w-full flex-1 bg-neutral-900 border p-2 rounded font-mono min-h-[200px] ${
            isDescriptionInvalid ? "border-red-500" : "border-neutral-700"
          }`}
          value={form.description}
          onChange={(e) => handleChange("description", e.target.value)}
          required
        />
        {isDescriptionInvalid && (
          <p className="text-xs text-red-400 mt-1" data-testid="error-description-required">
            Description is required.
          </p>
        )}
      </div>

      {form.artifacts && form.artifacts.length > 0 && (
        <div className="bg-neutral-900/50 p-3 rounded-md border border-neutral-800 space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-neutral-300">Provenance (Imports)</h3>
            <button
              type="button"
              data-testid="btn-reparse-artifact"
              onClick={async () => {
                if (!form.artifacts || form.artifacts.length === 0) return;
                const artifactId = form.artifacts[0].id;

                const confirmed = await modalConfirm(
                  "Re-parse this spell from the original artifact file? This will overwrite manual changes.",
                  "Reparse Spell",
                );
                if (!confirmed) return;

                try {
                  setLoading(true);
                  const updated = await invoke<SpellDetail>("reparse_artifact", { artifactId });
                  setForm(updated);
                  await modalAlert("Spell re-parsed successfully!", "Reparse Complete", "success");
                } catch (e) {
                  await modalAlert(`Reparse failed: ${e}`, "Reparse Error", "error");
                } finally {
                  setLoading(false);
                }
              }}
              className="text-xs px-2 py-1 bg-neutral-800 rounded hover:bg-neutral-700"
            >
              Reparse
            </button>
          </div>
          {form.artifacts.map((art) => (
            <div key={art.id} className="text-xs space-y-1 text-neutral-500">
              <div className="flex justify-between">
                <span className="font-semibold text-neutral-400">
                  Type: {art.type.toUpperCase()}
                </span>
                <span>Imported: {new Date(art.imported_at).toLocaleString()}</span>
              </div>
              <div className="truncate">Path: {art.path}</div>
              <div className="font-mono text-[10px] opacity-70">SHA256: {art.hash}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
