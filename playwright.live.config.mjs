// Runs the repo's e2e specs against the deployed site. No local server.
// The site now runs TUTOR_MODE=live, so specs that assume the demo tutor
// (golden path's "Demo mode", the walkthrough's tutor step) are skipped here
// and reported; they still run in CI against fixture mode.
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "/Users/matthewpoe/PycharmProjects/hearhear/.claude/worktrees/live-check/tests/e2e",
  timeout: 45_000,
  retries: 1,
  grepInvert: /golden path|the demo tutor asks for no passphrase|Review my chords reviews the chart/,
  outputDir: "/private/tmp/claude-501/live-check-results",
  use: { baseURL: "https://hearhear.up.railway.app", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
