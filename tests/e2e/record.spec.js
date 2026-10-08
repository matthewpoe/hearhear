// Record a tune: arm from the welcome, play a short tune on the number row
// with timed presses, stop with Escape, name it in the inline field, and find
// it on the staff and in the song picker, after a reload too. Then rename it
// by clicking its title, start it over (Undo brings the first take back),
// and discard it (the first demo opens; Undo brings it back). Fails on any console error and any
// axe violation, in both themes.

import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

/** Tapped keys, held about 100 ms like a computer key, on a 500 ms beat. */
const BEAT_MS = 500;
const HOLD_MS = 100;

/**
 * Tap number-row keys one beat apart.
 * @param {import("@playwright/test").Page} page
 * @param {string[]} keys KeyboardEvent.code values, e.g. "Digit1"
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

test("record a tune, name it, and find it on the staff, in the picker, and after a reload", async ({
  page,
}) => {
  // Real-time key presses, a reload, two themes and five axe passes: about
  // 30 s on a busy runner, the default timeout.
  test.setTimeout(60_000);
  /** @type {string[]} */
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();

  // 1. Arm from the welcome's "Play a melody" card: Stop takes focus.
  await page.getByRole("button", { name: /^Record a tune/ }).click();
  const bar = page.getByRole("region", { name: "Your tune" });
  await expect(bar.getByText("Ready to record")).toBeVisible();
  const stop = bar.getByRole("button", { name: /Cancel/ });
  await expect(stop).toBeFocused();
  await axe(page);

  // 2. The first note starts the clock; the take shows on the staff as it grows.
  await tapTune(page, ["Digit1", "Digit2", "Digit3"]);
  await expect(bar.getByText("Recording", { exact: true })).toBeVisible();
  await expect(bar.getByText("3 notes")).toBeVisible();
  await expect(staffNotes(page)).toHaveCount(3);
  // The key question waits for Stop.
  await expect(page.locator("#key-prompt")).toHaveCount(0);
  await axe(page);
  await tapTune(page, ["Digit2", "Digit1"]);

  // 3. Escape stops; the title field opens, prefilled and focused.
  await page.keyboard.press("Escape");
  const title = bar.getByLabel("Name your tune");
  await expect(title).toBeFocused();
  await expect(title).toHaveValue("My tune 1");
  // The tempo follows the presses; under load the browser's timing drifts, so no exact BPM.
  await expect(bar).toContainText(/5\s+notes at \d+ BPM in 4\/4/);
  await expect(staffNotes(page)).toHaveCount(5);
  await axe(page);
  await title.fill("Porch song");
  await title.press("Enter");

  // 4. The title shows, and the picker lists it under "Your tunes".
  const titleButton = bar.getByRole("button", { name: "Rename Porch song" });
  await expect(titleButton).toBeFocused();
  const picker = page.getByRole("combobox", { name: "Song" });
  await expect(picker).toHaveValue(/^mine-/);
  await expect(picker.locator('optgroup[label="Your tunes"] option')).toHaveText(["Porch song"]);
  await expect(page.locator("#staff svg")).toHaveAttribute("aria-label", "Notation: Porch song");
  // Its key is provisional, so the key question comes next.
  await expect(
    page.locator("#key-prompt").getByRole("heading", { name: "What key is this tune in?" }),
  ).toBeVisible();

  // 5. A reload brings it back, still on the staff and in the picker.
  await page.reload();
  await expect(titleButton).toBeVisible();
  await expect(staffNotes(page)).toHaveCount(5);
  await picker.selectOption({ label: "Ode to Joy" });
  await expect(page.locator("#staff svg")).toHaveAttribute("aria-label", "Notation: Ode to Joy");
  await expect(bar).toHaveCount(0);
  await picker.selectOption({ label: "Porch song" });
  await expect(staffNotes(page)).toHaveCount(5);

  // 6. Click the title to rename it.
  await titleButton.click();
  await expect(title).toBeFocused();
  await title.fill("Porch song, take 2");
  await title.press("Enter");
  await expect(bar.getByRole("button", { name: "Rename Porch song, take 2" })).toBeVisible();
  await expect(picker.locator('optgroup[label="Your tunes"] option')).toHaveText([
    "Porch song, take 2",
  ]);

  // 7. Dark theme, with the recording state showing.
  await page.getByRole("button", { name: "Dark mode" }).click();
  await bar.getByRole("button", { name: "Start over" }).click();
  await expect(bar.getByText("Ready to record")).toBeVisible();
  await axe(page);
  await tapTune(page, ["Digit5", "Digit4", "Digit3", "Digit2"]);
  await bar.getByRole("button", { name: /Stop/ }).click();
  await expect(staffNotes(page)).toHaveCount(4);
  await title.press("Enter");
  // Undo brings the first take back.
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(staffNotes(page)).toHaveCount(5);

  // 8. Discard opens the first demo, never the empty welcome; Undo brings the tune back.
  await bar.getByRole("button", { name: "Discard tune" }).click();
  await expect(page.locator("#staff svg")).toHaveAttribute("aria-label", /^Notation: (?!Porch)/);
  await expect(bar).toContainText("Discarded “Porch song, take 2”.");
  await axe(page);
  await bar.getByRole("button", { name: "Undo" }).click();
  await expect(bar.getByRole("button", { name: "Rename Porch song, take 2" })).toBeVisible();
  await expect(staffNotes(page)).toHaveCount(5);

  expect(problems).toEqual([]);
});

test("the masthead's Record button starts a new tune beside a demo, and the bar fits a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();
  await page.getByRole("button", { name: /Ode to Joy/ }).click();
  const record = page.getByRole("button", { name: "Record a tune" });
  await record.click();
  const bar = page.getByRole("region", { name: "Your tune" });
  await expect(bar.getByText("Ready to record")).toBeVisible();
  // Escape before any note cancels, and focus goes back to Record.
  await page.keyboard.press("Escape");
  await expect(bar).toHaveCount(0);
  await expect(record).toBeFocused();
  await record.click();
  await expect(bar.getByText("Ready to record")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Song" })).toBeDisabled();
  await tapTune(page, ["Digit1", "Digit3", "Digit5"]);
  await expect(staffNotes(page)).toHaveCount(3);
  await page.keyboard.press("Escape");
  await bar.getByLabel("Name your tune").press("Enter");
  await expect(bar.getByRole("button", { name: "Rename My tune 1" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // Discarding a tune recorded over a demo goes back to the demo.
  await bar.getByRole("button", { name: "Discard tune" }).click();
  await expect(page.locator("#staff svg")).toHaveAttribute("aria-label", "Notation: Ode to Joy");
  await axe(page);
});

test("while a take records, the staff's Play, Stop, Undo and Redo step aside and come back; Start over blanks the staff", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();
  await page.getByRole("button", { name: /^Record a tune/ }).click();
  const bar = page.getByRole("region", { name: "Your tune" });
  await expect(bar.getByText("Ready to record")).toBeVisible();
  await tapTune(page, ["Digit1", "Digit2", "Digit3"]);
  await expect(bar.getByText("Recording", { exact: true })).toBeVisible();
  await expect(staffNotes(page)).toHaveCount(3);

  // Recording: the record bar's Stop is the one control.
  const staff = page.locator("#staff");
  const play = staff.getByRole("button", { name: "Play" });
  const transportStop = staff.getByRole("button", { name: "Stop", exact: true });
  const undo = staff.getByRole("button", { name: "Undo", exact: true });
  const redo = staff.getByRole("button", { name: "Redo", exact: true });
  for (const control of [play, transportStop, undo, redo]) await expect(control).toHaveCount(0);
  // No empty step card under the staff while the steps wait for Stop.
  await expect(page.locator("#landing")).toBeHidden();
  // Undo's key leaves the take alone too.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(staffNotes(page)).toHaveCount(3);
  await expect(bar.getByText("Recording", { exact: true })).toBeVisible();

  // After Stop they're back: Play works, and Undo and Redo read as disabled.
  await page.keyboard.press("Escape");
  await bar.getByLabel("Name your tune").press("Enter");
  await expect(play).toBeVisible();
  await expect(play).toBeEnabled();
  await expect(transportStop).toBeDisabled();
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await expect(undo).toHaveCSS("cursor", "not-allowed");
  await expect(undo).toHaveCSS("border-top-style", "dashed");
  await expect(page.locator("#landing")).toBeVisible();
  await axe(page);

  // Start over blanks the staff until the first note: the old notes are going.
  const notation = page.locator("#staff svg");
  await expect(notation).toBeVisible();
  await bar.getByRole("button", { name: "Start over" }).click();
  await expect(bar.getByText("Ready to record")).toBeVisible();
  await expect(notation).toBeHidden();
  await expect(play).toHaveCount(0);
  await tapTune(page, ["Digit5"]);
  await expect(notation).toBeVisible();
  await expect(staffNotes(page)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(staffNotes(page)).toHaveCount(1);
});
