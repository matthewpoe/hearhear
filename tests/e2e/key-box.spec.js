// The key box after a choice: undo brings the question back as it was, and a
// pick in the ear finder (opened from "Help me find it", which leaves once a
// key is chosen) hands focus to the result card when the finder closes.

import { test, expect } from "@playwright/test";

test("undo takes a chosen key back, and closing the finder after a pick keeps focus", async ({
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
  await page.getByRole("button", { name: /Ode to Joy/ }).click();
  const question = page.locator("#key-prompt");
  const homes = question.getByRole("group", { name: "Home note" });
  const help = question.getByRole("button", { name: "Help me find it" });
  await expect(help).toBeVisible();

  // Choose D: the result card replaces the two ways in. Undo, by button and
  // by shortcut, brings the provisional question back.
  const d = homes.getByRole("button", { name: "D", exact: true });
  for (const undo of [
    () => page.getByRole("button", { name: "Undo" }).first().click(),
    () => page.keyboard.press("ControlOrMeta+z"),
  ]) {
    await d.click();
    await expect(d).toHaveAttribute("aria-pressed", "true");
    await expect(question.getByRole("button", { name: "Next: find the chords" })).toBeVisible();
    await expect(help).toHaveCount(0);
    await undo();
    await expect(homes.locator('[aria-pressed="true"]')).toHaveCount(0);
    await expect(help).toBeVisible();
    await expect(question.getByRole("button", { name: /^Next:/ })).toHaveCount(0);
    await expect(question.getByRole("status")).toHaveText("No home chosen yet.");
    await expect(question).not.toContainText("You chose");
  }

  // The finder from "Help me find it": picking D major (chord 2 in Ode to
  // Joy's lineup) chooses the key, so the opener leaves; closing the finder
  // puts focus on the result card's "Check it by ear", not on the page.
  await help.click();
  const finder = page.locator("#key-finder");
  await finder.getByRole("button", { name: "Chord 2 sounds like home" }).click();
  await expect(question).toContainText("You chose D major as home.");
  await finder.getByRole("button", { name: "Close" }).click();
  await expect(finder).toHaveCount(0);
  await expect(question.getByRole("button", { name: "Check it by ear" })).toBeFocused();

  expect(problems).toEqual([]);
});
