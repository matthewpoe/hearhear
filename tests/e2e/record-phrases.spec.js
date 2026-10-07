// Build a tune a phrase at a time: record a first phrase, add a second with
// Record next phrase, see it ringed on the staff, redo just that phrase (the
// first stays as it was), then discard the tune: a demo opens in its place,
// the Undo offer stays in the bar, and Undo brings back both phrases.

import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

const BEAT_MS = 500;
const HOLD_MS = 100;

/**
 * Tap number-row keys one beat apart.
 * @param {import("@playwright/test").Page} page
 * @param {string[]} keys
 */
async function tapTune(page, keys) {
  for (const key of keys) {
    await page.keyboard.down(key);
    await page.waitForTimeout(HOLD_MS);
    await page.keyboard.up(key);
    await page.waitForTimeout(BEAT_MS - HOLD_MS);
  }
}

/** @param {import("@playwright/test").Page} page */
const staffNotes = (page) => page.locator('#staff [role="button"][data-note-id]');

/** @param {import("@playwright/test").Page} page */
const noteIds = (page) =>
  staffNotes(page).evaluateAll((els) => els.map((el) => el.getAttribute("data-note-id")));

test("record two phrases, redo the second, and the first stays; Discard keeps an Undo", async ({
  page,
}) => {
  /** @type {string[]} */
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();
  await page.getByRole("button", { name: /^Record a tune/ }).click();
  const bar = page.getByRole("region", { name: "Your tune" });
  await expect(bar.getByText("Ready to record")).toBeVisible();

  // 1. The first phrase, named.
  await tapTune(page, ["Digit1", "Digit2", "Digit3"]);
  await page.keyboard.press("Escape");
  await bar.getByLabel("Name your tune").fill("Two phrases");
  await bar.getByLabel("Name your tune").press("Enter");
  await expect(staffNotes(page)).toHaveCount(3);
  const first = await noteIds(page);

  // 2. Record next phrase: it joins the tune; no name is asked again.
  const next = bar.getByRole("button", { name: "Record next phrase" });
  await next.click();
  await expect(bar.getByText("Ready to record")).toBeVisible();
  await tapTune(page, ["Digit5", "Digit4"]);
  await page.keyboard.press("Escape");
  await expect(staffNotes(page)).toHaveCount(5);
  await expect(bar.getByLabel("Name your tune")).toHaveCount(0);
  await expect(next).toBeFocused();
  await expect(bar).toContainText("2 phrases");
  // The latest phrase is ringed on the staff.
  await expect(page.locator("#staff .latest-phrase .abcjs-notehead")).toHaveCount(2);
  await axe(page);

  // 3. Redo that phrase: only the second is recorded again.
  await bar.getByRole("button", { name: "Redo that phrase" }).click();
  await tapTune(page, ["Digit6", "Digit6", "Digit5"]);
  await bar.getByRole("button", { name: /Stop/ }).click();
  await expect(staffNotes(page)).toHaveCount(6);
  expect((await noteIds(page)).slice(0, 3)).toEqual(first);
  await expect(page.locator("#staff .latest-phrase .abcjs-notehead")).toHaveCount(3);

  // 4. Discard: a demo opens in the tune's place, never the empty welcome,
  //    and the Undo offer stays in the bar.
  await bar.getByRole("button", { name: "Discard tune" }).click();
  await expect(page.locator("#staff svg")).toHaveAttribute("aria-label", "Notation: Ode to Joy");
  await expect(bar).toContainText("Discarded “Two phrases”.");
  const undo = bar.getByRole("button", { name: "Undo" });
  await expect(undo).toBeFocused();
  await axe(page);
  await undo.click();
  await expect(bar.getByRole("button", { name: "Rename Two phrases" })).toBeVisible();
  await expect(staffNotes(page)).toHaveCount(6);
  await expect(bar).toContainText("2 phrases");
  expect((await noteIds(page)).slice(0, 3)).toEqual(first);

  expect(problems).toEqual([]);
});
