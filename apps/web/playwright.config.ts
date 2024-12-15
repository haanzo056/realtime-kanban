import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

// Local runs use the dev servers (and reuse them if already up). CI builds
// first and runs the production servers, with env coming from the workflow.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: CI ? 'pnpm --filter server start' : 'pnpm --filter server dev',
      url: 'http://localhost:4000/health',
      cwd: '../..',
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      command: CI ? 'pnpm --filter web start' : 'pnpm --filter web dev',
      url: 'http://localhost:3000',
      cwd: '../..',
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
