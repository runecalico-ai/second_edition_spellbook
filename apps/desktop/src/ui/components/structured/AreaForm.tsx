import type {
  AreaKind,
  AreaSpec,
  AreaUnit,
  CountSubject,
  ShapeUnit,
  TileUnit,
} from "../../../types/spell";
import { defaultAreaSpec } from "../../../types/spell";
import { ScalarInput } from "./ScalarInput";

const AREA_KIND_LABELS: Record<AreaKind, string> = {
  point: "Point",
  radius_circle: "Radius (Circle)",
  radius_sphere: "Radius (Sphere)",
  cone: "Cone",
  line: "Line",
  rect: "Rectangle",
  rect_prism: "Rectangular Prism",
  cylinder: "Cylinder",
  wall: "Wall",
  cube: "Cube",
  volume: "Volume",
  surface: "Surface",
  tiles: "Tiles",
  creatures: "Creatures",
  objects: "Objects",
  region: "Region",
  scope: "Scope",
  special: "Special",
};

const SHAPE_UNIT_OPTIONS: { value: ShapeUnit; label: string }[] = [
  { value: "ft", label: "ft" },
  { value: "yd", label: "yd" },
  { value: "mi", label: "mi" },
  { value: "inch", label: "inch" },
];

const AREA_UNIT_OPTIONS: { value: AreaUnit; label: string }[] = [
  { value: "ft2", label: "ft²" },
  { value: "yd2", label: "yd²" },
  { value: "square", label: "Square" },
  { value: "ft3", label: "ft³" },
  { value: "yd3", label: "yd³" },
  { value: "hex", label: "Hex" },
  { value: "room", label: "Room" },
  { value: "floor", label: "Floor" },
];

const TILE_UNIT_OPTIONS: { value: TileUnit; label: string }[] = [
  { value: "hex", label: "Hex" },
  { value: "room", label: "Room" },
  { value: "floor", label: "Floor" },
  { value: "square", label: "Square" },
];

const COUNT_SUBJECT_OPTIONS: { value: CountSubject; label: string }[] = [
  { value: "creature", label: "Creature" },
  { value: "undead", label: "Undead" },
  { value: "ally", label: "Ally" },
  { value: "enemy", label: "Enemy" },
  { value: "object", label: "Object" },
  { value: "structure", label: "Structure" },
];

const REGION_UNITS = [
  "object",
  "structure",
  "building",
  "bridge",
  "ship",
  "fortress",
  "clearing",
  "grove",
  "field",
  "waterbody",
  "cavesystem",
  "valley",
  "region",
  "domain",
  "demiplane",
  "plane",
];

const SCOPE_UNITS = [
  "los",
  "loe",
  "within_range",
  "within_spell_range",
  "within_sight",
  "within_hearing",
  "aura",
  "sanctified_ground",
  "desecrated_ground",
  "portfolio_defined",
];

interface AreaFormProps {
  value: AreaSpec | null | undefined;
  onChange: (v: AreaSpec) => void;
}

export function AreaForm({ value, onChange }: AreaFormProps) {
  const spec = value ?? defaultAreaSpec();

  const updateSpec = (updates: Partial<AreaSpec>) => {
    onChange({ ...spec, ...updates });
  };

  return (
    <div className="space-y-3" data-testid="area-form">
      <div className="flex flex-wrap items-center gap-2">
        <select
          data-testid="area-form-kind"
          aria-label="Area kind"
          value={spec.kind}
          onChange={(e) => {
            const kind = e.target.value as AreaKind;
            const next: AreaSpec = { ...spec, kind };
            if (kind === "special") {
              next.rawLegacyValue = spec.rawLegacyValue ?? "";
            } else {
              next.rawLegacyValue = undefined;
            }
            if (["radius_circle", "radius_sphere"].includes(kind)) {
              next.radius = spec.radius ?? { mode: "fixed", value: 0 };
              next.shapeUnit = spec.shapeUnit ?? "ft";
            } else if (["cone", "line"].includes(kind)) {
              next.length = spec.length ?? { mode: "fixed", value: 0 };
              next.shapeUnit = spec.shapeUnit ?? "ft";
            } else if (kind === "rect") {
              next.length = spec.length ?? { mode: "fixed", value: 0 };
              next.width = spec.width ?? { mode: "fixed", value: 0 };
              next.shapeUnit = spec.shapeUnit ?? "ft";
            } else if (kind === "rect_prism") {
              next.length = spec.length ?? { mode: "fixed", value: 0 };
              next.width = spec.width ?? { mode: "fixed", value: 0 };
              next.height = spec.height ?? { mode: "fixed", value: 0 };
              next.shapeUnit = spec.shapeUnit ?? "ft";
            } else if (kind === "cylinder") {
              next.radius = spec.radius ?? { mode: "fixed", value: 0 };
              next.height = spec.height ?? { mode: "fixed", value: 0 };
              next.shapeUnit = spec.shapeUnit ?? "ft";
            } else if (kind === "wall") {
              next.length = spec.length ?? { mode: "fixed", value: 0 };
              next.height = spec.height ?? { mode: "fixed", value: 0 };
              next.thickness = spec.thickness ?? { mode: "fixed", value: 0 };
              next.shapeUnit = spec.shapeUnit ?? "ft";
            } else if (kind === "cube") {
              next.edge = spec.edge ?? { mode: "fixed", value: 0 };
              next.shapeUnit = spec.shapeUnit ?? "ft";
            } else if (kind === "surface") {
              next.surfaceArea = spec.surfaceArea ?? { mode: "fixed", value: 0 };
              next.unit = spec.unit ?? "ft2";
            } else if (kind === "volume") {
              next.volume = spec.volume ?? { mode: "fixed", value: 0 };
              next.unit = spec.unit ?? "ft3";
            } else if (kind === "tiles") {
              next.tileUnit = spec.tileUnit ?? "square";
              next.tileCount = spec.tileCount ?? { mode: "fixed", value: 1 };
            } else if (["creatures", "objects"].includes(kind)) {
              next.count = spec.count ?? { mode: "fixed", value: 1 };
              next.countSubject = spec.countSubject ?? "creature";
            } else if (kind === "region") {
              next.regionUnit = spec.regionUnit ?? "region";
            } else if (kind === "scope") {
              next.scopeUnit = spec.scopeUnit ?? "los";
            }
            onChange(next);
          }}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
        >
          {(Object.entries(AREA_KIND_LABELS) as [AreaKind, string][]).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* radius_circle / radius_sphere */}
      {(["radius_circle", "radius_sphere"] as const).includes(
        spec.kind as "radius_circle" | "radius_sphere",
      ) && (
        <div className="flex flex-wrap items-center gap-2">
          <ScalarInput
            value={spec.radius ?? { mode: "fixed", value: 0 }}
            onChange={(r) => updateSpec({ radius: r })}
            data-testid="area-form-radius"
            baseValueTestId="area-form-radius-value"
            perLevelTestId="area-form-radius-per-level"
          />
          <select
            data-testid="area-form-shape-unit"
            aria-label="Shape unit"
            value={spec.shapeUnit ?? "ft"}
            onChange={(e) => updateSpec({ shapeUnit: e.target.value as ShapeUnit })}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          >
            {SHAPE_UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* cone / line */}
      {(["cone", "line"] as const).includes(spec.kind as "cone" | "line") && (
        <div className="flex flex-wrap items-center gap-2">
          <ScalarInput
            value={spec.length ?? { mode: "fixed", value: 0 }}
            onChange={(l) => updateSpec({ length: l })}
            data-testid="area-form-length"
            baseValueTestId="area-form-length-value"
            perLevelTestId="area-form-length-per-level"
          />
          <select
            data-testid="area-form-shape-unit"
            aria-label="Shape unit"
            value={spec.shapeUnit ?? "ft"}
            onChange={(e) => updateSpec({ shapeUnit: e.target.value as ShapeUnit })}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          >
            {SHAPE_UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* rect */}
      {spec.kind === "rect" && (
        <div className="flex flex-wrap items-center gap-2">
          <ScalarInput
            value={spec.length ?? { mode: "fixed", value: 0 }}
            onChange={(l) => updateSpec({ length: l })}
            data-testid="area-form-length"
            baseValueTestId="area-form-length-value"
            perLevelTestId="area-form-length-per-level"
          />
          <ScalarInput
            value={spec.width ?? { mode: "fixed", value: 0 }}
            onChange={(w) => updateSpec({ width: w })}
            data-testid="area-form-width"
            baseValueTestId="area-form-width-value"
            perLevelTestId="area-form-width-per-level"
          />
          <select
            data-testid="area-form-shape-unit"
            aria-label="Shape unit"
            value={spec.shapeUnit ?? "ft"}
            onChange={(e) => updateSpec({ shapeUnit: e.target.value as ShapeUnit })}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          >
            {SHAPE_UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* rect_prism */}
      {spec.kind === "rect_prism" && (
        <div className="flex flex-wrap items-center gap-2">
          <ScalarInput
            value={spec.length ?? { mode: "fixed", value: 0 }}
            onChange={(l) => updateSpec({ length: l })}
            data-testid="area-form-length"
            baseValueTestId="area-form-length-value"
            perLevelTestId="area-form-length-per-level"
          />
          <ScalarInput
            value={spec.width ?? { mode: "fixed", value: 0 }}
            onChange={(w) => updateSpec({ width: w })}
            data-testid="area-form-width"
            baseValueTestId="area-form-width-value"
            perLevelTestId="area-form-width-per-level"
          />
          <ScalarInput
            value={spec.height ?? { mode: "fixed", value: 0 }}
            onChange={(h) => updateSpec({ height: h })}
            data-testid="area-form-height"
            baseValueTestId="area-form-height-value"
            perLevelTestId="area-form-height-per-level"
          />
          <select
            data-testid="area-form-shape-unit"
            aria-label="Shape unit"
            value={spec.shapeUnit ?? "ft"}
            onChange={(e) => updateSpec({ shapeUnit: e.target.value as ShapeUnit })}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          >
            {SHAPE_UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* cylinder */}
      {spec.kind === "cylinder" && (
        <div className="flex flex-wrap items-center gap-2">
          <ScalarInput
            value={spec.radius ?? { mode: "fixed", value: 0 }}
            onChange={(r) => updateSpec({ radius: r })}
            data-testid="area-form-radius"
            baseValueTestId="area-form-radius-value"
            perLevelTestId="area-form-radius-per-level"
          />
          <ScalarInput
            value={spec.height ?? { mode: "fixed", value: 0 }}
            onChange={(h) => updateSpec({ height: h })}
            data-testid="area-form-height"
            baseValueTestId="area-form-height-value"
            perLevelTestId="area-form-height-per-level"
          />
          <select
            data-testid="area-form-shape-unit"
            aria-label="Shape unit"
            value={spec.shapeUnit ?? "ft"}
            onChange={(e) => updateSpec({ shapeUnit: e.target.value as ShapeUnit })}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          >
            {SHAPE_UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* wall */}
      {spec.kind === "wall" && (
        <div className="flex flex-wrap items-center gap-2">
          <ScalarInput
            value={spec.length ?? { mode: "fixed", value: 0 }}
            onChange={(l) => updateSpec({ length: l })}
            data-testid="area-form-length"
            baseValueTestId="area-form-length-value"
            perLevelTestId="area-form-length-per-level"
          />
          <ScalarInput
            value={spec.height ?? { mode: "fixed", value: 0 }}
            onChange={(h) => updateSpec({ height: h })}
            data-testid="area-form-height"
            baseValueTestId="area-form-height-value"
            perLevelTestId="area-form-height-per-level"
          />
          <ScalarInput
            value={spec.thickness ?? { mode: "fixed", value: 0 }}
            onChange={(t) => updateSpec({ thickness: t })}
            data-testid="area-form-thickness"
            baseValueTestId="area-form-thickness-value"
            perLevelTestId="area-form-thickness-per-level"
          />
          <select
            data-testid="area-form-shape-unit"
            aria-label="Shape unit"
            value={spec.shapeUnit ?? "ft"}
            onChange={(e) => updateSpec({ shapeUnit: e.target.value as ShapeUnit })}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          >
            {SHAPE_UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* cube */}
      {spec.kind === "cube" && (
        <div className="flex flex-wrap items-center gap-2">
          <ScalarInput
            value={spec.edge ?? { mode: "fixed", value: 0 }}
            onChange={(e) => updateSpec({ edge: e })}
            data-testid="area-form-edge"
            baseValueTestId="area-form-edge-value"
            perLevelTestId="area-form-edge-per-level"
          />
          <select
            data-testid="area-form-shape-unit"
            aria-label="Shape unit"
            value={spec.shapeUnit ?? "ft"}
            onChange={(e) => updateSpec({ shapeUnit: e.target.value as ShapeUnit })}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          >
            {SHAPE_UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* surface */}
      {spec.kind === "surface" && (
        <div className="flex flex-wrap items-center gap-2">
          <ScalarInput
            value={spec.surfaceArea ?? { mode: "fixed", value: 0 }}
            onChange={(s) => updateSpec({ surfaceArea: s })}
            data-testid="area-form-surface-area"
            baseValueTestId="area-form-surface-area-value"
            perLevelTestId="area-form-surface-area-per-level"
          />
          <select
            data-testid="area-form-unit"
            aria-label="Area unit"
            value={spec.unit ?? "ft2"}
            onChange={(e) => updateSpec({ unit: e.target.value as AreaUnit })}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          >
            {AREA_UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* volume */}
      {spec.kind === "volume" && (
        <div className="flex flex-wrap items-center gap-2">
          <ScalarInput
            value={spec.volume ?? { mode: "fixed", value: 0 }}
            onChange={(v) => updateSpec({ volume: v })}
            data-testid="area-form-volume"
            baseValueTestId="area-form-volume-value"
            perLevelTestId="area-form-volume-per-level"
          />
          <select
            data-testid="area-form-unit"
            aria-label="Volume unit"
            value={spec.unit ?? "ft3"}
            onChange={(e) => updateSpec({ unit: e.target.value as AreaUnit })}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          >
            {AREA_UNIT_OPTIONS.filter((o) =>
              ["ft3", "yd3", "hex", "room", "floor"].includes(o.value),
            ).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* tiles */}
      {spec.kind === "tiles" && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            data-testid="area-form-tile-unit"
            aria-label="Tile unit"
            value={spec.tileUnit ?? "square"}
            onChange={(e) => updateSpec({ tileUnit: e.target.value as TileUnit })}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          >
            {TILE_UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ScalarInput
            value={spec.tileCount ?? { mode: "fixed", value: 1 }}
            onChange={(t) => updateSpec({ tileCount: t })}
            data-testid="area-form-tile-count"
            baseValueTestId="area-form-tile-count-value"
            perLevelTestId="area-form-tile-count-per-level"
          />
        </div>
      )}

      {/* creatures / objects */}
      {(["creatures", "objects"] as const).includes(spec.kind as "creatures" | "objects") && (
        <div className="flex flex-wrap items-center gap-2">
          <ScalarInput
            value={spec.count ?? { mode: "fixed", value: 1 }}
            onChange={(c) => updateSpec({ count: c })}
            data-testid="area-form-count"
            baseValueTestId="area-form-count-value"
            perLevelTestId="area-form-count-per-level"
          />
          <select
            data-testid="area-form-count-subject"
            aria-label="Count subject"
            value={spec.countSubject ?? "creature"}
            onChange={(e) => updateSpec({ countSubject: e.target.value as CountSubject })}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          >
            {COUNT_SUBJECT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* region */}
      {spec.kind === "region" && (
        <select
          data-testid="area-form-region-unit"
          aria-label="Region unit"
          value={spec.regionUnit ?? "region"}
          onChange={(e) => updateSpec({ regionUnit: e.target.value })}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
        >
          {REGION_UNITS.map((u) => (
            <option key={u} value={u}>
              {u.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      )}

      {/* scope */}
      {spec.kind === "scope" && (
        <select
          data-testid="area-form-scope-unit"
          aria-label="Scope unit"
          value={spec.scopeUnit ?? "los"}
          onChange={(e) => updateSpec({ scopeUnit: e.target.value })}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
        >
          {SCOPE_UNITS.map((u) => (
            <option key={u} value={u}>
              {u.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      )}

      {/* special */}
      {spec.kind === "special" && (
        <input
          type="text"
          data-testid="area-form-raw-legacy"
          aria-label="Raw legacy value"
          placeholder="Original text"
          value={spec.rawLegacyValue ?? ""}
          onChange={(e) => updateSpec({ rawLegacyValue: e.target.value || undefined })}
          className="flex-1 min-w-[200px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
        />
      )}

      {spec.kind !== "point" && (
        <textarea
          data-testid="area-form-notes"
          aria-label="Area notes"
          placeholder="Area notes (optional)..."
          value={spec.notes ?? ""}
          onChange={(e) => updateSpec({ notes: e.target.value || undefined })}
          className="w-full min-h-[60px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
        />
      )}
    </div>
  );
}
