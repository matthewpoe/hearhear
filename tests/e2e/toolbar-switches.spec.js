// The tool row's switches: Words, Swing and Voice leading sit in the row,
// which still fits one line at 1280 with all three showing (St. James has
// words). Swing off drops the staff's "Swing" marking; Undo brings it back.
// The swung timing itself is unit-tested (tests/audio/swing.test.js).

import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

test("Swing and Voice leading toggle from the tool row, which stays one line", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();
  await page.getByRole("button", { name: /St\. James Infirmary/ }).click();
  await expect(page.locator("#staff svg")).toBeVisible();
  const row = page.locator("#staff .header");
  await expect(row.getByText("Loading the piano…")).toHaveCount(0, { timeout: 15_000 });

  // All three switches, on one line.
  const words = row.getByRole("switch", { name: "Words" });
  const swing = row.getByRole("switch", { name: "Swing" });
  const voice = row.getByRole("switch", { name: "Voice leading" });
  await expect(words).toBeVisible();
  const height = await row.evaluate((el) => {
    const controls = [...el.querySelectorAll("button, label")]
      .map((c) => c.getBoundingClientRect().height)
      .filter((h) => h > 0);
    return { row: el.getBoundingClientRect().height, tallest: Math.max(...controls) };
  });
  expect(height.row).toBeLessThanOrEqual(height.tallest + 1);
  await expect(swing).toHaveAccessibleDescription(/long-short, the jazz feel/);

  // St. James swings: the switch is on and the staff says so.
  const marking = page.locator("#staff svg text", { hasText: /^Swing$/ });
  await expect(swing).toHaveAttribute("aria-checked", "true");
  await expect(marking).toHaveCount(1);
  await swing.click();
  await expect(swing).toHaveAttribute("aria-checked", "false");
  await expect(marking).toHaveCount(0);
  // One undoable step: Undo turns it back on.
  await page.locator("#staff").getByRole("button", { name: "Undo" }).click();
  await expect(swing).toHaveAttribute("aria-checked", "true");
  await expect(marking).toHaveCount(1);

  // Voice leading is in the row again, not on the Chords card.
  await expect(page.locator("#chords").getByRole("switch", { name: "Voice leading" })).toHaveCount(
    0,
  );
  await expect(voice).toHaveAttribute("aria-checked", "false");
  await voice.click();
  await expect(voice).toHaveAttribute("aria-checked", "true");
  await voice.click();
  await expect(voice).toHaveAttribute("aria-checked", "false");
  await axe(page);

  // A straight tune shows the switch too, off, and can swing.
  await page.getByRole("combobox", { name: "Song" }).selectOption({ label: "Ode to Joy" });
  await expect(swing).toHaveAttribute("aria-checked", "false");
  await expect(marking).toHaveCount(0);
  await swing.click();
  await expect(marking).toHaveCount(1);
});
