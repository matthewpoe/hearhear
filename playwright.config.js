import { defineConfig, devices } from "@playwright/test";

const port = 8000;
// The guided path again, against the server in live mode: a dummy key and a
// dummy access code, and the SDK pointed at a closed local port, so no request
// can reach Anthropic. The walkthrough's tutor step must still answer.
const livePort = 8010;
const server = `uv run uvicorn hearhear.app:app --app-dir server --port`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "live-tutor",
      testMatch: "guided-path.spec.js",
      use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${livePort}` },
    },
  ],
  // Smoke runs against the production shape: built dist/ served by FastAPI.
  webServer: [
    {
      command: `${server} ${port}`,
      url: `http://127.0.0.1:${port}/api/health`,
      reuseExistingServer: !process.env.CI,
      env: { TUTOR_MODE: "fixture" },
    },
    {
      command: `${server} ${livePort}`,
      url: `http://127.0.0.1:${livePort}/api/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        TUTOR_MODE: "live",
        ANTHROPIC_API_KEY: "dummy-key-for-e2e",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:9",
        TUTOR_ACCESS_CODE: "dummy-code-for-e2e",
      },
    },
  ],
});
