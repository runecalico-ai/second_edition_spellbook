export type ProvisionerErrorKind = "network" | "disk" | "ram" | "generic";

export interface ParsedProvisionerError {
  kind: ProvisionerErrorKind;
  heading: string;
  description: string;
  /** Raw backend message preserved for debugging copy */
  rawMessage: string;
  requiredBytes?: number;
  availableBytes?: number;
}

const DISK_RE =
  /Insufficient disk space: required (\d+) MiB \((\d+) bytes\), available (\d+) MiB \((\d+) bytes\)/;

const RAM_RE = /Insufficient RAM/i;
const NETWORK_RE =
  /download (request|stream) failed|connection|timed out|dns|resolve|unreachable|broken pipe/i;

export function parseProvisionerError(rawMessage: string | null | undefined): ParsedProvisionerError | null {
  if (!rawMessage?.trim()) return null;
  const raw = rawMessage.trim();

  const disk = DISK_RE.exec(raw);
  if (disk) {
    const requiredBytes = Number(disk[2]);
    const availableBytes = Number(disk[4]);
    return {
      kind: "disk",
      heading: "Not enough disk space",
      description: `This model needs at least ${disk[1]} MiB (${requiredBytes.toLocaleString()} bytes). You have ${disk[3]} MiB (${availableBytes.toLocaleString()} bytes) free. Free up space or choose Add Local Model.`,
      rawMessage: raw,
      requiredBytes,
      availableBytes,
    };
  }

  if (RAM_RE.test(raw)) {
    return {
      kind: "ram",
      heading: "Not enough memory",
      description:
        "Close other applications to free at least 1.5 GB of RAM, then try again. The chat model needs roughly 900 MB while loaded.",
      rawMessage: raw,
    };
  }

  if (NETWORK_RE.test(raw)) {
    return {
      kind: "network",
      heading: "Download failed",
      description:
        "Check your internet connection and try again. Partial progress is saved — the download will resume where it left off.",
      rawMessage: raw,
    };
  }

  return {
    kind: "generic",
    heading: "Model setup failed",
    description: raw,
    rawMessage: raw,
  };
}

export function formatChatSystemError(rawMessage: string): string {
  const parsed = parseProvisionerError(rawMessage);
  if (!parsed) return rawMessage;
  if (parsed.kind === "ram") {
    return `${parsed.heading}. ${parsed.description}`;
  }
  return rawMessage;
}
