import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

// Matches parsed spell with confidence scoring
export type ParsedSpell = {
  name: string;
  level: number;
  school?: string;
  sphere?: string;
  class_list?: string;
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
  _confidence: Record<string, number>; // 0-1 confidence per field
  _source_file: string;
  _raw_text?: string;
};

type FieldMapperProps = {
  spells: ParsedSpell[];
  onConfirm: (spells: ParsedSpell[]) => void;
  onCancel: () => void;
};

const REQUIRED_FIELDS = ["name", "level", "description"];
const CONFIDENCE_THRESHOLDS = { high: 0.8, medium: 0.5 };

function getConfidenceColor(confidence: number): string {
  if (confidence >= CONFIDENCE_THRESHOLDS.high) return "border-green-600";
  if (confidence >= CONFIDENCE_THRESHOLDS.medium) return "border-yellow-500";
  return "border-red-500";
}

function getConfidenceBadge(confidence: number): string {
  if (confidence >= CONFIDENCE_THRESHOLDS.high) return "bg-green-900/50 text-green-400";
  if (confidence >= CONFIDENCE_THRESHOLDS.medium) return "bg-yellow-900/50 text-yellow-400";
  return "bg-red-900/50 text-red-400";
}

export default function FieldMapper({ spells, onConfirm, onCancel }: FieldMapperProps) {
  const [editedSpells, setEditedSpells] = useState<ParsedSpell[]>(spells);
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentSpell = editedSpells[currentIndex];
  const totalSpells = editedSpells.length;

  const updateField = (field: keyof ParsedSpell, value: string | number) => {
    setEditedSpells((prev) =>
      prev.map((spell, i) => (i === currentIndex ? { ...spell, [field]: value } : spell)),
    );
  };

  const nextSpell = () => {
    if (currentIndex < totalSpells - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const prevSpell = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const acceptAll = () => {
    onConfirm(editedSpells);
  };

  const skipLowConfidence = () => {
    const filtered = editedSpells.filter((spell) => {
      // Skip spells where any required field has low confidence
      return REQUIRED_FIELDS.every(
        (field) => (spell._confidence[field] ?? 0) >= CONFIDENCE_THRESHOLDS.medium,
      );
    });
    onConfirm(filtered);
  };

  const useFilenameAsName = () => {
    const filename = currentSpell._source_file
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "")
      ?.replace(/_/g, " ")
      ?.replace(/\b\w/g, (c) => c.toUpperCase());
    if (filename) {
      updateField("name", filename);
    }
  };

  const getFieldConfidence = (field: string): number => {
    return currentSpell._confidence[field] ?? 1.0;
  };

  if (!currentSpell) {
    return <div className="text-neutral-500">No spells to map.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header with progress */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          Field Mapper ({currentIndex + 1} / {totalSpells})
        </h3>
        <div className="space-x-2">
          <button
            type="button"
            onClick={skipLowConfidence}
            className="px-3 py-1 text-xs bg-yellow-900/30 text-yellow-400 rounded hover:bg-yellow-900/50"
          >
            Skip Uncertain
          </button>
          <button
            type="button"
            onClick={acceptAll}
            className="px-3 py-1 text-xs bg-green-900/30 text-green-400 rounded hover:bg-green-900/50"
          >
            Accept All
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 text-xs bg-neutral-800 text-neutral-400 rounded hover:bg-neutral-700"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Source file info */}
      <div className="text-xs text-neutral-500 truncate">Source: {currentSpell._source_file}</div>

      {/* Field editing form */}
      <div className="grid grid-cols-2 gap-3">
        {/* Name - Required */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label htmlFor="fieldmapper-name" className="text-sm text-neutral-400">
              Name *
            </label>
            <span
              className={`text-[10px] px-1 rounded ${getConfidenceBadge(getFieldConfidence("name"))}`}
            >
              {Math.round(getFieldConfidence("name") * 100)}%
            </span>
          </div>
          <div className="flex gap-1">
            <input
              id="fieldmapper-name"
              className={`flex-1 bg-neutral-900 border-2 ${getConfidenceColor(getFieldConfidence("name"))} p-2 rounded text-sm`}
              value={currentSpell.name}
              onChange={(e) => updateField("name", e.target.value)}
            />
            <button
              type="button"
              onClick={useFilenameAsName}
              className="px-2 text-xs bg-neutral-800 rounded hover:bg-neutral-700"
              title="Use filename as name"
            >
              📁
            </button>
          </div>
        </div>

        {/* Level - Required */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label htmlFor="fieldmapper-level" className="text-sm text-neutral-400">
              Level *
            </label>
            <span
              className={`text-[10px] px-1 rounded ${getConfidenceBadge(getFieldConfidence("level"))}`}
            >
              {Math.round(getFieldConfidence("level") * 100)}%
            </span>
          </div>
          <input
            id="fieldmapper-level"
            type="number"
            className={`w-full bg-neutral-900 border-2 ${getConfidenceColor(getFieldConfidence("level"))} p-2 rounded text-sm`}
            value={currentSpell.level}
            onChange={(e) => updateField("level", Number.parseInt(e.target.value) || 0)}
          />
        </div>

        {/* School */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label htmlFor="fieldmapper-school" className="text-sm text-neutral-400">
              School
            </label>
            <span
              className={`text-[10px] px-1 rounded ${getConfidenceBadge(getFieldConfidence("school"))}`}
            >
              {Math.round(getFieldConfidence("school") * 100)}%
            </span>
          </div>
          <input
            id="fieldmapper-school"
            className={`w-full bg-neutral-900 border-2 ${getConfidenceColor(getFieldConfidence("school"))} p-2 rounded text-sm`}
            value={currentSpell.school || ""}
            onChange={(e) => updateField("school", e.target.value)}
          />
        </div>

        {/* Source */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label htmlFor="fieldmapper-source" className="text-sm text-neutral-400">
              Source
            </label>
            <span
              className={`text-[10px] px-1 rounded ${getConfidenceBadge(getFieldConfidence("source"))}`}
            >
              {Math.round(getFieldConfidence("source") * 100)}%
            </span>
          </div>
          <input
            id="fieldmapper-source"
            className={`w-full bg-neutral-900 border-2 ${getConfidenceColor(getFieldConfidence("source"))} p-2 rounded text-sm`}
            value={currentSpell.source || ""}
            onChange={(e) => updateField("source", e.target.value)}
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <label htmlFor="fieldmapper-description" className="text-sm text-neutral-400">
            Description *
          </label>
          <span
            className={`text-[10px] px-1 rounded ${getConfidenceBadge(getFieldConfidence("description"))}`}
          >
            {Math.round(getFieldConfidence("description") * 100)}%
          </span>
        </div>
        <textarea
          id="fieldmapper-description"
          className={`w-full bg-neutral-900 border-2 ${getConfidenceColor(getFieldConfidence("description"))} p-2 rounded text-sm min-h-[100px]`}
          value={currentSpell.description}
          onChange={(e) => updateField("description", e.target.value)}
        />
      </div>

      {/* Raw text preview (collapsible) */}
      {currentSpell._raw_text && (
        <details className="text-xs">
          <summary className="cursor-pointer text-neutral-500 hover:text-neutral-300">
            View Raw Extracted Text
          </summary>
          <pre className="mt-2 p-2 bg-neutral-950 rounded border border-neutral-800 max-h-32 overflow-auto whitespace-pre-wrap">
            {currentSpell._raw_text}
          </pre>
        </details>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t border-neutral-800">
        <button
          type="button"
          onClick={prevSpell}
          disabled={currentIndex === 0}
          className="px-4 py-2 bg-neutral-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-700"
        >
          ← Previous
        </button>
        <div className="flex gap-1">
          {Array.from({ length: Math.min(totalSpells, 10) }, (_, i) => i + 1).map((pageNumber) => (
            <button
              key={`page-${pageNumber}`}
              type="button"
              onClick={() => setCurrentIndex(pageNumber - 1)}
              className={`w-6 h-6 text-xs rounded ${
                pageNumber - 1 === currentIndex
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              {pageNumber}
            </button>
          ))}
          {totalSpells > 10 && <span className="text-neutral-500">...</span>}
        </div>
        <button
          type="button"
          onClick={nextSpell}
          disabled={currentIndex === totalSpells - 1}
          className="px-4 py-2 bg-neutral-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-700"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
