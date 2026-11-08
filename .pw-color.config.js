// Scratch, never committed: the repo's config on a private port so parallel agents don't collide.
import base from "./playwright.config.js";

const port = 8732;
export default {
  ...base,
  outputDir:
    "/private/tmp/claude-501/-Users-matthewpoe-PycharmProjects-hearhear/d54693e3-2cf0-422f-b993-4861ba4a6029/scratchpad/color/pw-out",
  use: { ...base.use, screenshot: "only-on-failure", baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    ...base.webServer,
    command: `uv run uvicorn hearhear.app:app --app-dir server --port ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
  },
};
