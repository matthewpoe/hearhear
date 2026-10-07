// The golden path, end to end on fixtures, as a reviewer would click it:
// load a tune, find home with the drone comparison, audition and choose a
// chord under the melody, and hear from the tutor. Fails on any console error
// (which includes CSP violations and the chord dropdown's containing-block
// guard) and on any axe violation, in both themes.

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** @param {import("@playwright/test").Page} page */
async function axe(page) {
  // Let theme and hover transitions settle, so contrast is measured on final colors.
  // Cancelled animations reject `finished`, and infinite ones never settle.
  await page.evaluate(() => {
    const finite = document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
    const settled = Promise.allSettled(finite.map((a) => a.finished));
    return Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 2000))]);
  });
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test("golden path: tune, key guess with the drone, chord audition, tutor exchange", async ({
  page,
}) => {
  /** @type {string[]} */
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hear Hear", level: 1 })).toBeVisible();
  await axe(page);
  // The core path, without the beginner tour; tips have their own checks.
  await page.getByRole("button", { name: "Beginner tips" }).click();

  // 1. Load the demo: the key is hidden, so the staff has no key signature yet.
  await page.getByRole("button", { name: /Ode to Joy/ }).click();
  await expect(page.getByText("Is 1 really home?", { exact: false })).toBeVisible();

  // 2. Easy mode: the explainer, then the two-drone comparison.
  await page.getByRole("button", { name: /help me find it/i }).click();
  await expect(page.getByText("What's a key?")).toBeVisible();
  await page.getByRole("button", { name: "Drone 2 feels like home" }).click();
  await expect(page.getByRole("button", { name: "Check it by ear" })).toBeVisible();

  // 3. Click the held E in bar 4 and audition: V and ii fit best and come first.
  const notes = page.locator("#staff [data-note-id]");
  await notes.nth(14).click();
  const options = page.locator("#chords button").filter({ hasText: /Melody is/ });
  await expect(options.first()).toContainText("V");
  await expect(options.first()).toBeInViewport();
  await options.first().hover();
  await options.first().click();

  // 4. Ask the tutor; the fixture reply streams in as plain text.
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.locator("#tutor")).toContainText(/listen/i, { timeout: 10_000 });

  // Both themes stay accessible after the whole path.
  await axe(page);
  await page.getByRole("button", { name: "Dark mode" }).click();
  await axe(page);

  expect(problems).toEqual([]);
});
