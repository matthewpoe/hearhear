// Record mode's Feel: record a swung line, find home, and in the Rhythm step
// read the same take as Straight (dotted eighths and sixteenths, no Swing
// marking) or Swing (even eighths, marked Swing). Undo takes a re-read back.
// Note lengths are read from the tab's saved song: abcjs draws a dot as an
// unclassed path, so the staff has no element to count.

import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

/**
 * A slow 900 ms beat (about 67 BPM), so browser timing under load can't blur
 * a 2:1 pair: a quarter, three swung pairs, then a quarter.
 */
const BEAT_MS = 900;
const HOLD_MS = 90;
const LINE = [1, 2 / 3, 1 / 3, 2 / 3, 1 / 3, 2 / 3, 1 / 3, 1];
const KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit4", "Digit3", "Digit2"];

test("a swung take reads as Swing, and as dotted rhythm when Straight; Undo restores it", async ({
  page,
}) => {
  /** @type {string[]} */
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();
  await page.getByRole("button", { name: /^Record a tune/ }).click();
  const bar = page.getByRole("region", { name: "Your tune" });
  for (const [i, beats] of LINE.entries()) {
    await page.keyboard.down(KEYS[i]);
    await page.waitForTimeout(HOLD_MS);
    await page.keyboard.up(KEYS[i]);
    await page.waitForTimeout(beats * BEAT_MS - HOLD_MS);
  }
  await page.keyboard.press("Escape");
  const title = bar.getByLabel("Name your tune");
  await title.fill("Swing check");
  await title.press("Enter");

  const question = page.locator("#key-prompt");
  await question
    .getByRole("group", { name: "Home note" })
    .getByRole("button", { name: "C", exact: true })
    .click();
  await question.getByRole("button", { name: "Done: on to chords" }).click();

  const rhythm = page.getByRole("group", { name: "Does this rhythm sound right?" });
  const feel = rhythm.getByRole("group", { name: /^Feel/ });
  const straight = feel.getByRole("radio", { name: "Straight" });
  const swing = feel.getByRole("radio", { name: "Swing" });
  const staff = page.locator("#staff");
  const marking = staff.locator(".abcjs-tempo");
  const picker = page.getByRole("combobox", { name: "Song" });
  const id = await picker.inputValue();
  /** The note lengths the staff draws, in ticks, from the tab's saved song. */
  const durations = () =>
    page.evaluate((key) => {
      const entry = JSON.parse(sessionStorage.getItem(key) ?? "null");
      return entry?.song.notes.map((/** @type {{ dur: number }} */ n) => n.dur).join(" ");
    }, `hearhear.song.${id}`);
  const EVEN = "12 6 6 6 6 6 6 12";
  const DOTTED = "12 9 3 9 3 9 3 12";

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
