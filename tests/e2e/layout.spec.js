// The workspace layout: the staff is the hero, its tool row is one line on a
// laptop, and the lower left is the step path (Key, then Rhythm, then
// Chords) with the current step open.

import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

for (const [width, height] of [
  [1280, 800],
  [1440, 900],
]) {
  test(`the tool row is one line at ${width}x${height}, and the staff leads`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Beginner tips" }).click();
    await page.getByRole("button", { name: /Ode to Joy/ }).click();
    await expect(page.locator("#staff svg")).toBeVisible();
    await expect(page.locator("#staff").getByText("Loading the piano…")).toHaveCount(0, {
      timeout: 15_000,
    });

    // One row: the row is as tall as its tallest control, and every control
    // shares its vertical middle.
    const row = await page.locator("#staff .header").evaluate((el) => {
      const box = el.getBoundingClientRect();
      const controls = [...el.querySelectorAll("button, label")]
        .map((c) => c.getBoundingClientRect())
        .filter((r) => r.height > 0);
      return {
        height: box.height,
        tallest: Math.max(...controls.map((r) => r.height)),
        middles: controls.map((r) => r.top + r.height / 2 - box.top),
        overflows: el.scrollWidth > el.clientWidth,
      };
    });
    expect(row.height).toBeLessThanOrEqual(row.tallest + 1);
    for (const middle of row.middles) expect(Math.abs(middle - row.height / 2)).toBeLessThan(3);
    expect(row.overflows).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

    // The staff comes first under the masthead, wholly above the keyboard.
    const staff = await page.locator("#staff").boundingBox();
    const dock = await page.locator(".keyboard-dock").boundingBox();
    expect(staff && dock && staff.y < 80 && staff.y + staff.height <= dock.y).toBe(true);

    // The step path: the key is current, rhythm settled from the meter.
    const steps = page.getByRole("list", { name: "Steps" });
    await expect(steps.locator('[aria-current="step"]')).toContainText("Key");
    await expect(steps).toContainText("4/4, set from the tune");

    // Settle the key, then collapse it: chords become current, and the key
    // reopens from its one-line summary.
    const question = page.locator("#key-prompt");
    await question
      .getByRole("group", { name: "Home note" })
      .getByRole("button", { name: "D", exact: true })
      .click();
    await question.getByRole("button", { name: "Done: on to chords" }).click();
    await expect(question).toHaveCount(0);
    await expect(steps.locator('[aria-current="step"]')).toContainText("Chords");
    await expect(steps).toContainText("D major");
    await steps.getByRole("button", { name: "Change the key" }).click();
    await expect(question).toBeVisible();
    await axe(page);
  });
}
