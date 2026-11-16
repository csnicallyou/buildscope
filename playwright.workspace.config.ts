import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./integration",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:8781",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/test-workspace-server.mjs",
    url: "http://127.0.0.1:8781/api/health",
    reuseExistingServer: false,
  },
  reporter: "list",
});
