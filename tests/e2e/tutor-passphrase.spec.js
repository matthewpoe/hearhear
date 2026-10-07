// The live tutor's passphrase, asked up front. With /api/health saying the
// server is live and no code saved, the tutor panel shows the passphrase form
// above the question box before anything is asked. A code hides it behind a
// "Change passphrase" link; a code the server turns away brings it back with
// "didn't match". Health and the tutor are mocked, so nothing calls Claude, and
// the codes here are stand-ins, never the real passphrase. Passes axe.

import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

const RIGHT = "test-code-right";
const WRONG = "test-code-wrong";

/** @param {string} event @param {unknown} data */
const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

test("a live tutor asks for the passphrase before the first question", async ({ page }) => {
  /** @type {string[]} */
  const problems = [];
  page.on("console", (msg) => {
    // The mocked 401 is expected; the browser logs it as a failed resource.
    if (msg.type() === "error" && !msg.text().includes("401")) problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.route("/api/health", (route) =>
    route.fulfill({ json: { status: "ok", tutor_mode: "live" } }),
  );
  /** @type {string[]} the access code each tutor request carried */
  const sent = [];
  await page.route("/api/tutor", (route) => {
    const request = route.request();
    const code = decodeURIComponent(request.headers()["x-tutor-access"] ?? "");
    sent.push(code);
    if (code !== RIGHT) {
      return route.fulfill({
        status: 401,
        json: { error: { code: "access_required", message: "Passphrase required." } },
      });
    }
    const { snapshot } = request.postDataJSON();
    return route.fulfill({
      headers: { "content-type": "text/event-stream" },
      body:
        sse("message", { delta: "Listen to where bar 4 lands." }) +
        sse("suggestions", {
          hint_level: "nudge",
          suggestions: [],
          snapshot_version: snapshot.version,
          dropped: 0,
          withheld: 0,
          served_by: "test",
          fallback: false,
        }) +
        sse("done", {}),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();
  await page.getByRole("button", { name: /Ode to Joy/ }).click();

  const tutor = page.locator("#tutor");
  const field = tutor.getByLabel("Passphrase");
  const box = tutor.getByLabel("Your question");
  const change = tutor.getByRole("button", { name: "Change passphrase" });

  // Up front, before any question, sitting on top of the question box.
  await expect(field).toBeVisible();
  await expect(tutor.getByText(/The live tutor is for invited listeners/)).toBeVisible();
  await expect(tutor.getByText(/didn't match/)).toHaveCount(0);
  await expect(tutor.getByText(/^Demo mode:/)).toHaveCount(0);
  const fieldBox = await field.boundingBox();
  const questionBox = await box.boundingBox();
  expect(fieldBox && questionBox && fieldBox.y < questionBox.y).toBe(true);
  expect(sent).toEqual([]);
  await axe(page);

  // A code hides the form behind a small link.
  await field.fill(WRONG);
  await tutor.getByRole("button", { name: "Unlock the tutor" }).click();
  await expect(field).toHaveCount(0);
  await expect(change).toBeVisible();

  // The server turns it away: the form comes back and says so.
  await box.fill("Why does bar 4 feel unfinished?");
  await tutor.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(tutor.getByText(/That one didn't match/)).toBeVisible();
  await expect(field).toBeFocused();
  await expect(change).toHaveCount(0);

  // The right one asks the question again.
  await field.fill(RIGHT);
  await tutor.getByRole("button", { name: "Unlock the tutor" }).click();
  await expect(tutor.locator(".turn.tutor").last()).toContainText("Listen to where bar 4 lands.");
  await expect(field).toHaveCount(0);
  await expect(change).toBeVisible();
  expect(sent).toEqual([WRONG, RIGHT]);

  // Kept for the tab: a reload doesn't ask again.
  await page.reload();
  await expect(change).toBeVisible();
  await expect(field).toHaveCount(0);

  // Change passphrase reopens the form; keeping the current one closes it.
  await change.click();
  await expect(field).toBeFocused();
  await expect(tutor.getByText(/didn't match/)).toHaveCount(0);
  await axe(page);
  await tutor.getByRole("button", { name: "Keep the current one" }).click();
  await expect(field).toHaveCount(0);
  await expect(change).toBeVisible();

  expect(problems).toEqual([]);
});

test("the demo tutor asks for no passphrase", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();
  await page.getByRole("button", { name: /Ode to Joy/ }).click();
  const tutor = page.locator("#tutor");
  await expect(tutor.getByText(/^Demo mode:/)).toBeVisible();
  await expect(tutor.getByLabel("Passphrase")).toHaveCount(0);
  await expect(tutor.getByRole("button", { name: "Change passphrase" })).toHaveCount(0);
});
