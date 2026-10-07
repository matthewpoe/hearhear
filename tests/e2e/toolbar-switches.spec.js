// The tool row is short: Play and Stop, the label style, Words (only when
// the song has words), Undo/Redo and More. Swing is the song's own (St. James
// is marked Swing above the staff) and Voice leading lives in the chord
// dropdown, so neither is a switch in the row, which fits one line at 1280.

import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

test("the tool row's one switch is Words, on one line", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();
  await page.getByRole("button", { name: /St\. James Infirmary/ }).click();
  await expect(page.locator("#staff svg")).toBeVisible();
  const row = page.locator("#staff .header");
  await expect(row.getByText("Loading the piano…")).toHaveCount(0, { timeout: 15_000 });

  // St. James has words: Words is the row's one switch, and Play has no scope.
  await expect(row.getByRole("switch")).toHaveCount(1);
  await expect(row.getByRole("switch", { name: "Words" })).toBeVisible();
  await expect(row.getByRole("radio", { name: /From the top|This bar/ })).toHaveCount(0);
  const height = await row.evaluate((el) => {
    const controls = [...el.querySelectorAll("button, label")]
      .map((c) => c.getBoundingClientRect().height)
      .filter((h) => h > 0);
    return { row: el.getBoundingClientRect().height, tallest: Math.max(...controls) };
  });
  expect(height.row).toBeLessThanOrEqual(height.tallest + 1);

  // St. James swings: the staff says so, with no switch in the row.
  await expect(page.locator("#staff svg text", { hasText: /^Swing$/ })).toHaveCount(1);
  await axe(page);
});
