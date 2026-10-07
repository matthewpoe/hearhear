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

    // Before the demo's key is guessed, the chord row waits: A plays no chord
    // (the placeholder key isn't home), while the number row still plays.
    await expect(page.locator("#chord-row-help")).toHaveText(
      "Chords follow the key you choose. Find home first.",
    );
    await page.keyboard.down("KeyA");
    await expect(page.locator("#piano .key.held")).toHaveCount(0);
    await page.keyboard.up("KeyA");
    await page.keyboard.down("Digit1");
    await expect(page.locator("#piano .key.held")).toHaveCount(1);
    await page.keyboard.up("Digit1");

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
    // Focus lands on the collapsed row, and the drone and degrees stay there.
    await expect(steps.getByRole("button", { name: "Change the key" })).toBeFocused();
    const drone = steps.getByRole("switch", { name: "Drone on home" });
    await expect(drone).toHaveAttribute("aria-checked", "false");
    await drone.click();
    await expect(drone).toHaveAttribute("aria-checked", "true");
    await drone.click();
    await expect(drone).toHaveAttribute("aria-checked", "false");
    await expect(steps.getByRole("switch", { name: "Scale degrees" })).toBeVisible();
    await steps.getByRole("button", { name: "Change the key" }).click();
    await expect(question).toBeVisible();

    // The chosen label style and the pressed home chip take --accent.
    const accent = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.background = "var(--accent)";
      document.body.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    });
    const fill = (/** @type {import("@playwright/test").Locator} */ el) =>
      el.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(
      await fill(
        page
          .locator("#staff .header label")
          .filter({ has: page.locator("input:checked") })
          .first(),
      ),
    ).toBe(accent);
    expect(
      await fill(
        question.getByRole("group", { name: "Home note" }).locator('[aria-pressed="true"]'),
      ),
    ).toBe(accent);
    await axe(page);
  });
}
