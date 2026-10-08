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
    await page.getByRole("button", { name: "Leave lesson" }).click();
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

    // The staff comes right under the step banner, wholly above the keyboard.
    const staff = await page.locator("#staff").boundingBox();
    const dock = await page.locator(".keyboard-dock").boundingBox();
    expect(staff && dock && staff.y < 380 && staff.y + staff.height <= dock.y).toBe(true);

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

    // The step path: the song done, the key current (a demo's rhythm is given).
    const steps = page.getByRole("list", { name: "Steps" });
    await expect(steps.locator('[aria-current="step"]')).toContainText("Key");
    await expect(steps).toContainText("Ode to Joy");

    // Settle the key, then collapse it: chords become current, and the key
    // reopens from its one-line summary.
    const question = page.locator("#key-prompt");
    await question
      .getByRole("group", { name: "Home note" })
      .getByRole("button", { name: "D", exact: true })
      .click();
    await question.getByRole("button", { name: "Next: find the chords" }).click();
    await expect(question).toHaveCount(0);
    await expect(steps.locator('[aria-current="step"]')).toContainText("Chords");
    await expect(steps).toContainText("D major");
    // Focus lands on the collapsed row, and the drone stays there.
    await expect(steps.getByRole("button", { name: "Change the key" })).toBeFocused();
    const drone = steps.getByRole("switch", { name: "Drone on home" });
    await expect(drone).toHaveAttribute("aria-checked", "false");
    await drone.click();
    await expect(drone).toHaveAttribute("aria-checked", "true");
    await drone.click();
    await expect(drone).toHaveAttribute("aria-checked", "false");
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

test("a recorded tune asks Rhythm to confirm its guess once the key is chosen", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();

  // Record five notes a beat apart, stop, and name the tune.
  await page.getByRole("button", { name: /^Record a tune/ }).click();
  const bar = page.getByRole("region", { name: "Your tune" });
  for (const key of ["Digit1", "Digit2", "Digit3", "Digit2", "Digit1"]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(100);
    await page.keyboard.up(key);
    await page.waitForTimeout(400);
  }
  await page.keyboard.press("Escape");
  const title = bar.getByLabel("Name your tune");
  await title.fill("Rhythm check");
  await title.press("Enter");

  // Choose a key, then collapse the key step: Rhythm is next, and asks.
  const question = page.locator("#key-prompt");
  await question
    .getByRole("group", { name: "Home note" })
    .getByRole("button", { name: "C", exact: true })
    .click();
  await question.getByRole("button", { name: "Next: check the rhythm" }).click();
  const steps = page.getByRole("list", { name: "Steps" });
  await expect(steps.locator('[aria-current="step"]')).toContainText("Rhythm");
  const rhythm = page.getByRole("group", { name: "Does this rhythm sound right?" });
  await expect(rhythm).toContainText(/The recording reads as\s+\d\/\d at \d+ beats a minute/);
  await rhythm.getByRole("button", { name: "Sounds right" }).click();
  await expect(steps.locator('[aria-current="step"]')).toContainText("Chords");
  // The card moves straight on to step 3's prompt: never an empty card.
  await expect(page.locator("#chords-step")).toContainText("Try a chord under");
  await expect(page.locator('#staff [role="button"].is-start')).toHaveCount(1);
  await axe(page);
});
