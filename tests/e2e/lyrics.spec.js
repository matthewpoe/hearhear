// The words under the staff: St. James draws one syllable per note below the
// staff, the "Words" switch hides them, and a song without words has no
// switch. Counts only; the spec never spells the words. Passes axe.

import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

const stJames = JSON.parse(
  readFileSync(new URL("../../content/songs/st-james-infirmary.json", import.meta.url), "utf8"),
);

test("St. James shows its words under the staff, and the Words switch hides them", async ({
  page,
}) => {
  /** @type {string[]} */
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "Beginner tips" }).click();

  const staff = page.locator("#staff");
  const words = staff.getByRole("switch", { name: "Words" });

  // Ode has no words: no switch.
  await page.getByRole("button", { name: /Ode to Joy/ }).click();
  await expect(staff.locator(".abcjs-notehead").first()).toBeVisible();
  await expect(words).toHaveCount(0);

  const picker = page.getByRole("group", { name: "Song" });
  await picker.getByRole("button", { name: "St. James Infirmary" }).click();
  await expect(words).toBeVisible();
  await expect(words).toHaveAttribute("aria-checked", "true");

  // Before a home is chosen the staff shows no degrees, so every lyric
  // element on it is a syllable: one per note.
  const lyrics = staff.locator("text.abcjs-lyric");
  await expect(lyrics).toHaveCount(stJames.notes.length);

  // Under the staff: every syllable sits below the lowest staff line.
  const staffBottom = await staff
    .locator(".abcjs-staff")
    .first()
    .evaluate((el) => el.getBoundingClientRect().bottom);
  const firstLyricTop = await lyrics.first().evaluate((el) => el.getBoundingClientRect().top);
  expect(firstLyricTop).toBeGreaterThan(staffBottom);

  await axe(page);

  await words.click();
  await expect(words).toHaveAttribute("aria-checked", "false");
  await expect(lyrics).toHaveCount(0);
  await words.click();
  await expect(lyrics).toHaveCount(stJames.notes.length);

  expect(problems).toEqual([]);
});
