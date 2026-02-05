/**
 * Standardized timeout and configuration constants for E2E tests.
 */

/** Standard timeouts for different assertion types */
export const TIMEOUTS = {
  /** Quick UI updates, element visibility */
  short: 5000,
  /** Form submissions, navigation */
  medium: 15000,
  /** App startup, complex operations */
  long: 30000,
  /** Batch imports, file processing */
  batch: 120000,
} as const;

/** Base CDP port - workers will use offsets from this to avoid collisions */
export const BASE_CDP_PORT = 9000;

/** Base Vite port - workers will use offsets from this to avoid collisions */
export const BASE_VITE_PORT = 5173;

/** Screenshot output directory name */
export const SCREENSHOT_DIR = "screenshots";
