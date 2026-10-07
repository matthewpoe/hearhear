// The listening tools the tutor's steps point to: Play, from the top, and
// "Drone on home", which holds the home chord under playback once the key is
// chosen.
// Fails on any console error and on any axe violation, in both themes.

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** The piano starts at C2 (MIDI 36); D major's drone under Ode to Joy is D3 F#3 A3. */
const LOWEST = 36;
const D_MAJOR = [50, 54, 57];

/** @param {import("@playwright/test").Page} page */
async function axe(page) {
  await page.evaluate(() => {
    const finite = document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
    const settled = Promise.allSettled(finite.map((a) => a.finished));
    return Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 2000))]);
  });
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target).join(" | ")})`),
  ).toEqual([]);
}

test("play the whole tune, and the drone on home", async ({ page }) => {
  /** @type {string[]} */
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();
  await page.getByRole("button", { name: /Ode to Joy/ }).click();

  const transport = page.locator("#staff [aria-label='Playback']");
  const drone = page.getByRole("switch", { name: "Drone on home" });
  const keys = page.locator("#piano .key");
  const droneKeys = D_MAJOR.map((midi) => keys.nth(midi - LOWEST));

  // Before the key is chosen the drone is the finder's: the switch waits, and says why.
  await expect(drone).toBeDisabled();
  await expect(drone).toHaveAccessibleDescription(/^Find home first\. /);
  await expect(transport.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await axe(page);

  // With the staff wholly in view above the dock, Play leaves the page where it is.
  await page.evaluate(() => scrollTo(0, 0));
  const staffInView = await page.locator("#staff").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const dock = document.querySelector(".keyboard-dock")?.getBoundingClientRect().top ?? 0;
    return r.top >= 0 && r.bottom <= dock;
  });
  expect(staffInView).toBe(true);
  await transport.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("#staff .is-playing").first()).toBeAttached();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await transport.getByRole("button", { name: "Stop" }).click();

  // One click on D commits D major.
  const homes = page.locator("#key-prompt").getByRole("group", { name: "Home note" });
  await homes.getByRole("button", { name: "D", exact: true }).click();
  await expect(drone).toBeEnabled();
  await expect(drone).toHaveAttribute("aria-checked", "false");

  const fromBar = transport.getByRole("button", { name: "Play", exact: true });

  // With the drone on, Play lights the D-major triad under the melody...
  await drone.click();
  await expect(drone).toHaveAttribute("aria-checked", "true");
  for (const key of droneKeys) await expect(key).not.toHaveClass(/\bdrone\b/);
  await fromBar.click();
  for (const key of droneKeys) await expect(key).toHaveClass(/\bdrone\b/);
  // ...turning it off mid-play lets go at once...
  await drone.click();
  for (const key of droneKeys) await expect(key).not.toHaveClass(/\bdrone\b/);
  // ...and on again brings it back while the tune plays on.
  await drone.click();
  for (const key of droneKeys) await expect(key).toHaveClass(/\bdrone\b/);
  // Stop clears it.
  await transport.getByRole("button", { name: "Stop" }).click();
  for (const key of droneKeys) await expect(key).not.toHaveClass(/\bdrone\b/);

  // Both themes stay accessible with the drone on.
  await axe(page);
  await page.getByRole("button", { name: "Dark mode" }).click();
  await axe(page);

  expect(problems).toEqual([]);
});
