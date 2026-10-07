// The newer demo tunes, end to end: each loads from the landing's cards, draws
// every note on the staff with no console error or axe violation, the ear
// finder offers three homes, picking the tune's own home gets the "most ears"
// confirmation, and at a cadence note the chord dropdown leads with the chords
// a musician would try first.

import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

/** @param {string} id */
const load = (id) =>
  JSON.parse(readFileSync(new URL(`../../content/songs/${id}.json`, import.meta.url), "utf8"));

const TUNES = [
  // Amazing Grace's bar-4 E-flat (degree 5, closing the first line) fits I
  // and V; Greensleeves's bar-4 F sharp (degree 2, the half cadence) is V's 5th.
  { song: load("amazing-grace"), home: "A flat", dark: false, cadence: "n9", top: ["I", "V"] },
  { song: load("greensleeves"), home: "E", dark: true, cadence: "n17", top: ["V"] },
];

for (const { song, home, dark, cadence, top } of TUNES) {
  test(`${song.title} loads, draws, and finds its home`, async ({ page }) => {
    /** @type {string[]} */
    const problems = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") problems.push(msg.text());
    });
    page.on("pageerror", (error) => problems.push(error.message));

    await page.goto("/");
    await page.getByRole("button", { name: "Leave tour" }).click();
    await page.getByRole("button", { name: new RegExp(song.title) }).click();

    // Every note has a clickable head on the staff, under a time signature.
    const staff = page.locator("#staff");
    await expect(staff.locator('[role="button"][data-note-id]')).toHaveCount(song.notes.length);
    await expect(staff.locator(".abcjs-time-signature").first()).toBeVisible();
    await axe(page);

    // The ear finder offers three homes.
    const question = page.locator("#key-prompt");
    await question.getByRole("button", { name: "Help me find it" }).click();
    const finder = page.locator("#key-finder");
    await expect(finder.getByRole("button", { name: /^Chord \d sounds like home$/ })).toHaveCount(
      3,
    );
    await finder.getByRole("button", { name: "Close" }).click();

    // The tune's own home is the one most ears hear.
    if (dark) await question.locator("label").filter({ hasText: "Dark (minor)" }).click();
    const chip = question
      .getByRole("group", { name: "Home note" })
      .getByRole("button", { name: home, exact: true });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(question).toContainText("That's the home most ears hear in this tune.");

    // At the cadence note, the dropdown leads with the expected chords.
    const head = page.locator(`#staff [role="button"][data-note-id="${cadence}"] .abcjs-notehead`);
    const box = await head.boundingBox();
    if (!box) throw new Error(`note ${cadence} isn't on the staff`);
    await head.click({ position: { x: box.width / 2, y: box.height / 4 } });
    const options = page.locator("#chords button").filter({ hasText: /Melody is/ });
    for (const [i, numeral] of top.entries()) {
      await expect(options.nth(i)).toContainText(new RegExp(`^\\s*${numeral}\\b`));
    }
    await page.keyboard.press("Escape");

    expect(problems).toEqual([]);
  });
}
