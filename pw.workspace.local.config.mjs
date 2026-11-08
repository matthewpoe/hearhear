import { defineConfig, devices } from "@playwright/test";

// The repo's config on its own port, so sibling agents' servers on 8000 don't collide.
const root = "/Users/matthewpoe/PycharmProjects/hearhear/.claude/worktrees/agent-a7d210a3155f493ec";
const port = 8947;

export default defineConfig({
  testDir: `${root}/tests/e2e`,
  timeout: 30_000,
  workers: 4,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  outputDir:
    "/private/tmp/claude-501/-Users-matthewpoe-PycharmProjects-hearhear/d54693e3-2cf0-422f-b993-4861ba4a6029/scratchpad/workspace/pw-results",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `uv run uvicorn hearhear.app:app --app-dir server --port ${port}`,
    cwd: root,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: true,
    env: { TUTOR_MODE: "fixture" },
  },
});
