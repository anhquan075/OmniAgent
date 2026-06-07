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
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: false,
    actionTimeout: 10000,
    // Inject wagmi mock sessionStorage BEFORE app loads to bypass wallet modal
    launchOptions: {
      args: ['--disable-web-security'],
    },
    storageState: undefined,
  },
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  webServer: {
    command: 'VITE_PLAYWRIGHT=true VITE_API_URL=http://localhost:8000 VITE_DEFAULT_NETWORK=bsc pnpm run dev',
    url: 'http://localhost:5173',
    timeout: 120000,
    reuseExistingServer: true,
    cwd: resolve(__dirname, '.'),
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
      },
    },
  ],
});
