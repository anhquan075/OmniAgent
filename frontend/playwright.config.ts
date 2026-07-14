import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: true,
    actionTimeout: 10000,
    launchOptions: {
      args: ['--disable-web-security'],
    },
    storageState: undefined,
  },
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  webServer: [
    {
      command: 'OMNIAGENT_SKIP_ENV_FILE=true CASPER_LIVE_SUBMIT_ENABLED=false CASPER_AGENT_LOOP_ENABLED=false CASPER_DECISION_LEDGER_PATH=playwright-casper-dashboard-log uv run --project . uvicorn app.main:app --host 127.0.0.1 --port 8020',
      url: 'http://127.0.0.1:8020/api/health',
      timeout: 120000,
      reuseExistingServer: false,
      cwd: resolve(__dirname, '../backend'),
    },
    {
      command: 'VITE_PLAYWRIGHT=true VITE_API_URL=http://127.0.0.1:8020 VITE_DEFAULT_NETWORK=casper-test pnpm exec vite --host 127.0.0.1 --port 5174',
      url: 'http://127.0.0.1:5174',
      timeout: 120000,
      reuseExistingServer: false,
      cwd: resolve(__dirname, '.'),
    },
  ],

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
      },
    },
  ],
});
