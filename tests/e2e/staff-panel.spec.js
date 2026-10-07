// The dark theme's staff panel: a "Staff: Slate / Paper" control beside the
// Dark mode toggle, slate by default, remembered across a reload, and absent
// in the light theme, where the staff draws straight on the page. Themes are
// switched with the app's own toggle. Passes axe on both panels.

import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

const SLATE = "rgb(43, 33, 53)";
const PAPER = "rgb(233, 225, 207)";
const NONE = "rgba(0, 0, 0, 0)";

test("dark mode offers a slate or paper staff, and light mode doesn't", async ({ page }) => {
  /** @type {string[]} */
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();
  // A tune with degrees and a function-colored chord on it, so axe sees them.
  await page.getByRole("button", { name: /Ode to Joy/ }).click();
  await page
    .locator("#key-prompt")
    .getByRole("group", { name: "Home note" })
    .getByRole("button", { name: "D", exact: true })
    .click();
  await expect(page.locator("#staff text.abcjs-lyric").first()).toBeVisible();

  const frame = page.locator("#staff .frame");
  const background = () => frame.evaluate((el) => getComputedStyle(el).backgroundColor);
  const control = page.getByRole("group", { name: "Staff", exact: true });
  const slate = control.getByRole("radio", { name: "Slate" });
  const paper = control.getByRole("radio", { name: "Paper" });
  const darkMode = page.getByRole("button", { name: "Dark mode" });

  // Light: no control, no panel.
  await expect(control).toHaveCount(0);
  expect(await background()).toBe(NONE);

  // Dark: the control appears beside the toggle, on slate.
  await darkMode.click();
  await expect(control).toBeVisible();
  await expect(slate).toBeChecked();
  await expect.poll(background).toBe(SLATE);
  await axe(page);

  // Paper. The radios are visually hidden in their labels: click as a viewer does.
  await control.locator("label").filter({ hasText: "Paper" }).click();
  await expect(paper).toBeChecked();
  await expect.poll(background).toBe(PAPER);
  await axe(page);

  // Remembered across a reload, applied before the app mounts.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-staff-panel", "paper");
  await expect(paper).toBeChecked();
  await expect.poll(background).toBe(PAPER);

  // Back to slate.
  await control.locator("label").filter({ hasText: "Slate" }).click();
  await expect(slate).toBeChecked();
  await expect.poll(background).toBe(SLATE);

  // Light again: the control goes away and the staff is back on the page.
  await darkMode.click();
  await expect(control).toHaveCount(0);
  await expect.poll(background).toBe(NONE);
  await axe(page);

  expect(problems).toEqual([]);
});
