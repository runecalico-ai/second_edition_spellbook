import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

// Mirrors SpellDetail struct from backend
type SpellDetail = {
  id?: number;
  name: string;
  school?: string;
  sphere?: string;
  class_list?: string;
  level: number;
  range?: string;
  components?: string;
  material_components?: string;
  casting_time?: string;
  duration?: string;
  area?: string;
  saving_throw?: string;
  reversible?: number;
  description: string;
  tags?: string;
  source?: string;
  edition?: string;
  author?: string;
  license?: string;
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
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<SpellDetail>({
    name: "",
    level: 1,
    description: "",
  });

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

  const save = async () => {
    try {
      setLoading(true);
      if (isNew) {
        // create_spell expects SpellCreate
        const { id, ...createData } = form; // eslint-disable-line @typescript-eslint/no-unused-vars
        await invoke("create_spell", { spell: createData });
      } else {
        // update_spell expects SpellUpdate (which includes id)
        await invoke("update_spell", { spell: form });
      }
      navigate("/");
    } catch (e) {
      alert(`Failed to save: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this spell?")) return;
    try {
      if (form.id) {
        await invoke("delete_spell", { id: form.id });
        navigate("/");
      }
    } catch (e) {
      alert(`Failed to delete: ${e}`);
    }
  };

  if (loading && !form.name) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 overflow-auto h-full">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">{isNew ? "New Spell" : "Edit Spell"}</h2>
        <div className="space-x-2">
          {!isNew && (
            <button
              type="button"
              onClick={handleDelete}
              className="px-3 py-2 text-red-400 hover:bg-neutral-800 rounded"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate("/")}
            className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded font-bold"
          >
            Save Spell
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="spell-name" className="block text-sm text-neutral-400">
            Name
          </label>
          <input
            id="spell-name"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
            placeholder="Spell Name"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="spell-level" className="block text-sm text-neutral-400">
            Level
          </label>
          <input
            id="spell-level"
            type="number"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
            placeholder="Level"
            value={form.level}
            onChange={(e) => handleChange("level", Number.parseInt(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="spell-school" className="block text-sm text-neutral-400">
            School
          </label>
          <input
            id="spell-school"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.school || ""}
            onChange={(e) => handleChange("school", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="spell-classes" className="block text-sm text-neutral-400">
            Classes (e.g. Mage, Cleric)
          </label>
          <input
            id="spell-classes"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.class_list || ""}
            onChange={(e) => handleChange("class_list", e.target.value)}
          />
        </div>
        {/* Add more fields as needed for MVP */}
        <div>
          <label htmlFor="spell-source" className="block text-sm text-neutral-400">
            Source
          </label>
          <input
            id="spell-source"
            className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.source || ""}
            onChange={(e) => handleChange("source", e.target.value)}
          />
        </div>
      </div>

      <div>
        <span className="block text-sm text-neutral-400">Details</span>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <input
            placeholder="Range"
            className="bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.range || ""}
            onChange={(e) => handleChange("range", e.target.value)}
          />
          <input
            placeholder="Components (V,S,M)"
            className="bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.components || ""}
            onChange={(e) => handleChange("components", e.target.value)}
          />
          <input
            placeholder="Duration"
            className="bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.duration || ""}
            onChange={(e) => handleChange("duration", e.target.value)}
          />
          <input
            placeholder="Casting Time"
            className="bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.casting_time || ""}
            onChange={(e) => handleChange("casting_time", e.target.value)}
          />
          <input
            placeholder="Area"
            className="bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.area || ""}
            onChange={(e) => handleChange("area", e.target.value)}
          />
          <input
            placeholder="Save"
            className="bg-neutral-900 border border-neutral-700 p-2 rounded"
            value={form.saving_throw || ""}
            onChange={(e) => handleChange("saving_throw", e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <label htmlFor="spell-description" className="block text-sm text-neutral-400">
          Description
        </label>
        <textarea
          id="spell-description"
          className="w-full flex-1 bg-neutral-900 border border-neutral-700 p-2 rounded font-mono min-h-[200px]"
          value={form.description}
          onChange={(e) => handleChange("description", e.target.value)}
        />
      </div>

      {form.artifacts && form.artifacts.length > 0 && (
        <div className="bg-neutral-900/50 p-3 rounded-md border border-neutral-800 space-y-2">
          <h3 className="text-sm font-semibold text-neutral-300">Provenance (Imports)</h3>
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
