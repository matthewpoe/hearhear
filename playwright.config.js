import { defineConfig, devices } from "@playwright/test";

const port = 8000;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Smoke runs against the production shape: built dist/ served by FastAPI.
  webServer: {
    command: `uv run uvicorn hearhear.app:app --app-dir server --port ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: { TUTOR_MODE: "fixture" },
  },
});
