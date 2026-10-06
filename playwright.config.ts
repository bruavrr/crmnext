import { defineConfig } from "@playwright/test";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
if (
  !process.env.TEST_DATABASE_URL ||
  !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error("Configure TEST_DATABASE_URL em base dedicada _test");
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3001",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3001",
    url: "http://localhost:3001/login",
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      NEXTAUTH_URL: "http://localhost:3001",
    },
  },
});
