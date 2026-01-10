import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 120000,
    retries: 0,
    reporter: 'list',
    use: {
        trace: 'on-first-retry',
    },
});
