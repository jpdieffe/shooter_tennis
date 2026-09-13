import { defineConfig } from '@playwright/test';
const remoteURL = process.env.GAME_TEST_URL;
export default defineConfig({
  testDir: './test/browser', timeout: remoteURL || process.env.CI ? 90000 : 60000, workers: 1,
  use: { baseURL: remoteURL || 'http://127.0.0.1:3000', channel: process.env.PLAYWRIGHT_CHANNEL || undefined, viewport: process.env.CI ? { width: 960, height: 720 } : { width: 1440, height: 1000 }, headless: true,
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: { args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: remoteURL ? undefined : { command: 'node server/index.js', url: 'http://127.0.0.1:3000/health', reuseExistingServer: !process.env.CI }
});
