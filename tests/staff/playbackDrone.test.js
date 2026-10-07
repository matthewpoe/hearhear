// playWithVisuals with "Drone on home": a play that replaces a home-drone play
// keeps its own drone. The check needs module mocks, behind a Node flag, so it
// runs in a child process (playbackDrone.mocked.js).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("a finder play after a home-drone play keeps the finder's chord", () => {
  const script = fileURLToPath(new URL("./playbackDrone.mocked.js", import.meta.url));
  const run = spawnSync(process.execPath, ["--experimental-test-module-mocks", script], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
