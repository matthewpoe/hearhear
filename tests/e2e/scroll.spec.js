// Picking a chord must not move the page: closing the dropdown hands focus
// back to the note that opened it, and that focus once scrolled the page to
// bring the note into view (docs/overnight-report.md, known gaps: the
// masthead cut off). Here the note is scrolled just off the top of the window
// while the dropdown is open, so a scrolling focus would move the page.
// Clicks go through page.mouse, as a user's do: a locator click scrolls its
// target into view itself, which would hide the page's own scroll.

import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

const ode = JSON.parse(
  readFileSync(new URL("../../content/songs/ode-to-joy.json", import.meta.url), "utf8"),
);
// The held E that ends bar 4.
const [heldE] = ode.notes.filter((/** @type {{ dur: number }} */ n) => n.dur === 24);

test.use({ viewport: { width: 1280, height: 800 } });

/**
 * Click an element where it is now, without scrolling.
 * @param {import("@playwright/test").Page} page
 * @param {import("@playwright/test").Locator} locator
 * @param {number} [yFraction] how far down the element to aim
 */
async function clickInPlace(page, locator, yFraction = 0.5) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("nothing to click");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * yFraction);
}

test("a dropdown pick leaves the page where it was", async ({ page }) => {
  page.setDefaultTimeout(5000);
  await page.goto("/");
  await page.getByRole("button", { name: "Beginner tips" }).click();
  await page.getByRole("button", { name: /Ode to Joy/ }).click();
  await page.locator("#staff .abcjs-notehead").first().waitFor();
  await page
    .locator("#key-prompt")
    .getByRole("group", { name: "Home note" })
    .getByRole("button", { name: "D", exact: true })
    .click();

  const head = page.locator(`#staff [role="button"][data-note-id="${heldE.id}"] .abcjs-notehead`);
  await page.waitForTimeout(600); // the guess result's smooth scroll
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  // A head on a line has the staff line across its middle, so aim above it.
  await clickInPlace(page, head, 0.25);
  const option = page
    .locator("#chords button")
    .filter({ hasText: /Melody is/ })
    .first();
  await expect(option).toBeVisible();

  // Scroll the note just off the top, as a user reading down the options
  // might. The dropdown stays open, its first option on screen.
  await head.evaluate((el) =>
    window.scrollBy({ top: el.getBoundingClientRect().bottom + 2, behavior: "instant" }),
  );
  await expect(option).toBeInViewport({ ratio: 1 });

  const before = await page.evaluate(() => window.scrollY);
  await clickInPlace(page, option);
  await expect(page.getByRole("list", { name: "Placed chords" }).getByRole("button")).toHaveCount(
    1,
  );
  // Let any scroll the pick started finish before measuring.
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});
