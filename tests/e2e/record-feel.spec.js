// Record mode's Feel: record a swung line, find home, and in the Rhythm step
// read the same take as Straight (dotted eighths and sixteenths, no Swing
// marking) or Swing (even eighths, marked Swing). Undo takes a re-read back.
// Once the notes are edited by hand, Feel asks before a re-read replaces them.
// Note lengths are read from the tab's saved song: abcjs draws a dot as an
// unclassed path, so the staff has no element to count.
//
// The take is deterministic: Playwright's clock is paused while the keys are
// played and moved forward by exact amounts between presses, so every
// key-down and key-up carries the timestamp the line calls for, however busy
// the runner is. The rhythm math itself is unit-tested (rhythm.test.js); this
// spec checks the UI: the Feel radios, the re-read, the marking, and Undo.

import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

/** A 900 ms beat (about 67 BPM): a quarter, three 2:1 swung pairs, a quarter. */
const BEAT_MS = 900;
const HOLD_MS = 90;
const LINE = [1, 2 / 3, 1 / 3, 2 / 3, 1 / 3, 2 / 3, 1 / 3, 1];
const KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit4", "Digit3", "Digit2"];
const EVEN = "12 6 6 6 6 6 6 12";
const DOTTED = "12 9 3 9 3 9 3 12";

/**
 * Record the swung line as a new tune, choose C as home, and open the Rhythm
 * step.
 * @param {import("@playwright/test").Page} page
 */
async function recordSwungLine(page) {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();
  await page.getByRole("button", { name: /^Record a tune/ }).click();
  const bar = page.getByRole("region", { name: "Your tune" });
  await expect(bar.getByText("Ready to record")).toBeVisible();

  // Time stands still between presses and moves only by the line's amounts.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  for (const [i, beats] of LINE.entries()) {
    await page.keyboard.down(KEYS[i]);
    await page.clock.runFor(HOLD_MS);
    await page.keyboard.up(KEYS[i]);
    await page.clock.runFor(Math.round(beats * BEAT_MS) - HOLD_MS);
  }
  await page.keyboard.press("Escape");
  await page.clock.resume();
  const title = bar.getByLabel("Name your tune");
  await title.fill("Swing check");
  await title.press("Enter");

  const question = page.locator("#key-prompt");
  await question
    .getByRole("group", { name: "Home note" })
    .getByRole("button", { name: "C", exact: true })
    .click();
  await question.getByRole("button", { name: "Next: check the rhythm" }).click();

  const rhythm = page.getByRole("group", { name: "Does this rhythm sound right?" });
  const feel = rhythm.getByRole("group", { name: /^Feel/ });
  const id = await page.getByRole("combobox", { name: "Song" }).inputValue();
  /** The note lengths the staff draws, in ticks, from the tab's saved song. */
  const durations = () =>
    page.evaluate((key) => {
      const entry = JSON.parse(sessionStorage.getItem(key) ?? "null");
      return entry?.song.notes.map((/** @type {{ dur: number }} */ n) => n.dur).join(" ");
    }, `hearhear.song.${id}`);
  return {
    rhythm,
    feel,
    straight: feel.getByRole("radio", { name: "Straight" }),
    swing: feel.getByRole("radio", { name: "Swing" }),
    durations,
  };
}

test("a swung take reads as Swing, and as dotted rhythm when Straight; Undo restores it", async ({
  page,
}) => {
  /** @type {string[]} */
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  const { rhythm, feel, straight, swing, durations } = await recordSwungLine(page);
  const marking = page.locator("#staff .abcjs-tempo");

  // Swing (the guess here, unless the browser's timing blurred it): even
  // eighths, marked Swing. The guess itself is unit-tested; this checks the choice.
  await feel.locator("label", { hasText: "Swing" }).click();
  await expect(swing).toBeChecked();
  await expect(marking).toContainText("Swing");
  await expect.poll(durations).toBe(EVEN);
  await axe(page);

  // Straight writes the pairs as played: dotted eighths, no Swing marking.
  await feel.locator("label", { hasText: "Straight" }).click();
  await expect(straight).toBeChecked();
  await expect(marking).toHaveCount(0);
  await expect.poll(durations).toBe(DOTTED);
  await expect(rhythm).toContainText(/reads as\s+4\/4 at \d+ beats a minute/);
  await axe(page);

  // Undo takes the re-read back.
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(swing).toBeChecked();
  await expect(marking).toContainText("Swing");
  await expect.poll(durations).toBe(EVEN);

  expect(problems).toEqual([]);
});

test("once the notes are edited by hand, Feel asks before a re-read replaces them", async ({
  page,
}) => {
  /** @type {string[]} */
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  const { feel, straight, swing, durations } = await recordSwungLine(page);
  const warning = feel.getByText("Re-reading your recording replaces your note edits.");

  // No edits: Feel re-reads at once, with no question.
  await feel.locator("label", { hasText: "Swing" }).click();
  await expect.poll(durations).toBe(EVEN);
  await feel.locator("label", { hasText: "Straight" }).click();
  await expect.poll(durations).toBe(DOTTED);
  await expect(warning).toHaveCount(0);

  // A hand edit from the note menu: the first note gets shorter.
  const first = page.locator('#staff [role="button"][data-note-id]').first();
  await first.focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: /^Change / });
  await menu.getByRole("menuitem", { name: /^Shorter/ }).click();
  await expect.poll(durations).not.toBe(DOTTED);
  const edited = await durations();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // Feel now asks first, leaving the notes and the radios as they were.
  await feel.locator("label", { hasText: "Swing" }).click();
  await expect(warning).toBeVisible();
  await expect(straight).toBeChecked();
  expect(await durations()).toBe(edited);
  await axe(page);
  await feel.getByRole("button", { name: "Keep my edits" }).click();
  await expect(warning).toHaveCount(0);
  await expect(straight).toBeChecked();
  expect(await durations()).toBe(edited);

  // Confirming re-reads the take, replacing the edit.
  await feel.locator("label", { hasText: "Swing" }).click();
  await feel.getByRole("button", { name: "Re-read as Swing" }).click();
  await expect(swing).toBeChecked();
  await expect.poll(durations).toBe(EVEN);
  await expect(warning).toHaveCount(0);

  expect(problems).toEqual([]);
});
