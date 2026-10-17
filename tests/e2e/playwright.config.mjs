// End-to-end tests against the local dev server (tools/dev-server.mjs) and a mock Meta Model API.
//   npm run test:e2e                         # chromium (+ firefox in CI)
//   PW_CHROMIUM_PATH=/path/to/headless_shell npm run test:e2e
//   PW_FIREFOX_PATH=/path/to/firefox npm run test:e2e    # add firefox locally
import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CI = !!process.env.CI;
const PORT = +(process.env.E2E_PORT || 8898);
const KV = path.join(os.tmpdir(), 'muse-e2e-kv-' + PORT + '.json');
const chromium = process.env.PW_CHROMIUM_PATH, firefox = process.env.PW_FIREFOX_PATH;

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs$/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: CI ? 1 : 0,
  workers: 1,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: path.join(ROOT, 'tests/e2e/global-setup.mjs'),
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1440, height: 900 }, acceptDownloads: true, trace: CI ? 'retain-on-failure' : 'off' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: chromium ? { executablePath: chromium } : {} } },
    ...(CI || firefox ? [{ name: 'firefox', use: { browserName: 'firefox', launchOptions: firefox ? { executablePath: firefox } : {} } }] : []),
  ],
  webServer: [
    { command: 'node tests/fixtures/mock-meta.mjs', port: 8799, cwd: ROOT, reuseExistingServer: !CI },
    { command: `node tools/dev-server.mjs --port ${PORT} --env tests/fixtures/test.vars`, url: `http://127.0.0.1:${PORT}/api/ping`, cwd: ROOT, reuseExistingServer: !CI, env: { DEV_KV_FILE: KV } },
  ],
});
export { KV };
