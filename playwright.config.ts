import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    launchOptions: {
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-gpu"],
    },
  },
  webServer: {
    command: "npx next dev -p 3000",
    port: 3000,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});