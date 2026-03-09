/**
 * Common test utilities for E2E tests.
 * Provides helper functions for file management, directory setup, and test data generation.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Ensures a tmp directory exists at the specified location.
 * Creates the directory if it doesn't exist.
 *
 * @param dirname - The directory name (typically __dirname from the test file)
 * @param subdir - Optional subdirectory name within tmp (default: "tmp")
 * @returns The absolute path to the tmp directory
 *
 * @example
 * ```typescript
 * const tmpDir = ensureTmpDir(__dirname);
 * const testFile = path.join(tmpDir, "test.md");
 * ```
 *
 * @example
 * ```typescript
 * // Create a subdirectory for specific test artifacts
 * const backupDir = ensureTmpDir(__dirname, "tmp/backups");
 * ```
 */
export function ensureTmpDir(dirname: string, subdir = "tmp"): string {
  const tmpDir = path.resolve(dirname, subdir);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  return tmpDir;
}

/**
 * Gets the directory name from import.meta.url.
 * This is a helper to avoid repeating the fileURLToPath pattern in every test file.
 *
 * @param importMetaUrl - The import.meta.url from the calling module
 * @returns The directory path of the calling module
 *
 * @example
 * ```typescript
 * const __dirname = getTestDirname(import.meta.url);
 * ```
 */
export function getTestDirname(importMetaUrl: string): string {
  return path.dirname(fileURLToPath(importMetaUrl));
}

/**
 * Generates a unique run ID based on the current timestamp.
 * Useful for creating unique test data that won't collide across test runs.
 *
 * @returns A timestamp-based unique identifier
 *
 * @example
 * ```typescript
 * const runId = generateRunId();
 * const spellName = `Test Spell ${runId}`;
 * const backupFile = `backup-${runId}.zip`;
 * ```
 */
export function generateRunId(): number {
  return Date.now();
}

/**
 * Creates a unique test file path in the tmp directory.
 * Combines ensureTmpDir, generateRunId, and file tracking in one convenient function.
 *
 * @param dirname - The directory name (typically __dirname from the test file)
 * @param filename - The base filename (will be prefixed with runId)
 * @param fileTracker - Optional file tracker to automatically track the file for cleanup
 * @returns The absolute path to the unique test file
 *
 * @example
 * ```typescript
 * const backupPath = createTmpFilePath(__dirname, "backup.zip", fileTracker);
 * // Returns: /path/to/tests/tmp/backup-1234567890.zip (and tracks it)
 * ```
 */
export function createTmpFilePath(
  dirname: string,
  filename: string,
  fileTracker?: { track: (path: string) => string },
): string {
  const tmpDir = ensureTmpDir(dirname);
  const runId = generateRunId();

  // Insert runId before the file extension
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const uniqueFilename = `${base}-${runId}${ext}`;

  const filePath = path.join(tmpDir, uniqueFilename);

  // Track the file if a tracker was provided
  if (fileTracker) {
    return fileTracker.track(filePath);
  }

  return filePath;
}
