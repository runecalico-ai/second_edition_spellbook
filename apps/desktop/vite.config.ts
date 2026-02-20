import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import type { UserConfig as ViteUserConfig } from "vite";
import type { InlineConfig } from "vitest/node";
const dirname =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));



// https://vitejs.dev/config/
const config = {
  plugins: [react()],
  server: {
    host: "127.0.0.1",
  },
  // More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
  test: {
    reporters: ["verbose", "junit"],
    outputFile: {
      junit: "./test-results/storybook-junit.xml",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [
              {
                browser: "chromium",
              },
            ],
          },
          setupFiles: [".storybook/vitest.setup.ts"],
          // Fail fast on first error to get quick feedback
          bail: 0,
          // Increase timeout for complex stories
          testTimeout: 30000,
        },
      },
    ],
  },
} satisfies ViteUserConfig & { test: InlineConfig };

export default defineConfig(config as unknown as Parameters<typeof defineConfig>[0]);
