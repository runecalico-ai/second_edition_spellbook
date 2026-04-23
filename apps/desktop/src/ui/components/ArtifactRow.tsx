import type { SpellArtifact } from "../../types/spell";

interface ArtifactRowProps {
  artifact: SpellArtifact;
}

export default function ArtifactRow({ artifact: art }: ArtifactRowProps) {
  return (
    <div className="space-y-1 text-xs text-neutral-300">
      <div className="flex justify-between">
        <span className="font-semibold text-neutral-200">Type: {art.type.toUpperCase()}</span>
        <span>Imported: {new Date(art.importedAt).toLocaleString()}</span>
      </div>
      <div className="truncate">Path: {art.path}</div>
      <div className="font-mono text-[10px] text-neutral-400">SHA256: {art.hash}</div>
      {art.spellContentHash == null && (
        <div
          className="text-[10px] text-amber-200 dark:text-amber-300"
          data-testid="artifact-not-hash-verified"
        >
          <span aria-hidden>⚠ </span>
          <span>
            Not hash-verified (legacy import). Re-import or re-parse to link this artifact.
          </span>
        </div>
      )}
    </div>
  );
}
