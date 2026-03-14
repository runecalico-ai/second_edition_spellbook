import type { SpellArtifact } from "../../types/spell";

interface ArtifactRowProps {
  artifact: SpellArtifact;
}

export default function ArtifactRow({ artifact: art }: ArtifactRowProps) {
  return (
    <div className="text-xs space-y-1 text-neutral-500">
      <div className="flex justify-between">
        <span className="font-semibold text-neutral-400">
          Type: {art.type.toUpperCase()}
        </span>
        <span>Imported: {new Date(art.importedAt).toLocaleString()}</span>
      </div>
      <div className="truncate">Path: {art.path}</div>
      <div className="font-mono text-[10px] opacity-70">SHA256: {art.hash}</div>
      {art.spellContentHash == null && (
        <div
          className="text-yellow-500/70 text-[10px]"
          data-testid="artifact-not-hash-verified"
          title="This artifact was imported before hash-based identity was established. Re-import or re-parse to link it."
        >
          ⚠ Not hash-verified (legacy import)
        </div>
      )}
    </div>
  );
}
