import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser', timeout: 60000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3000', channel: process.env.PLAYWRIGHT_CHANNEL || undefined, viewport: { width: 1440, height: 1000 }, headless: true,
    launchOptions: { args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: { command: 'node server/index.js', url: 'http://127.0.0.1:3000/health', reuseExistingServer: !process.env.CI }
});
