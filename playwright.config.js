import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 90000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4187/agc/",
    headless: true,
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
      ],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 4187 --host 127.0.0.1",
    url: "http://127.0.0.1:4187/agc/",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
