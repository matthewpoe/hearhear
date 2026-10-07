// The listening tools the tutor's steps point to: Play with its scope toggle
// ("From the top", or "This bar" from a clicked or focused note, which makes
// Play read "Play bar N"), and "Drone on
// home", which holds the
// home chord under playback once the key is chosen.
// Fails on any console error and on any axe violation, in both themes.

import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ode = JSON.parse(
  readFileSync(new URL("../../content/songs/ode-to-joy.json", import.meta.url), "utf8"),
);
const BAR = 48; // 4/4 at 12 ticks per quarter
/** Bar 4: F#, E, and the held E that ends the first phrase. */
const bar4 = ode.notes
  .filter((/** @type {{ start: number }} */ n) => n.start >= 3 * BAR && n.start < 4 * BAR)
  .map((/** @type {{ id: string }} */ n) => n.id);
const heldE = ode.notes.find((/** @type {{ dur: number }} */ n) => n.dur === 24);
/** The piano starts at C2 (MIDI 36); D major's drone under Ode to Joy is D3 F#3 A3. */
const LOWEST = 36;
const D_MAJOR = [50, 54, 57];

/**
 * Click a note by its head, above the middle (a staff line crosses it).
 * @param {import("@playwright/test").Page} page
 * @param {string} id
 */
async function clickNote(page, id) {
  const head = page.locator(`#staff [role="button"][data-note-id="${id}"] .abcjs-notehead`);
  const box = await head.boundingBox();
  if (!box) throw new Error(`note ${id} isn't on the staff`);
  await head.click({ position: { x: box.width / 2, y: box.height / 4 } });
}

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

/**
 * Record every note the staff playhead lights from now on.
 * @param {import("@playwright/test").Page} page
 */
async function watchPlayhead(page) {
  await page.evaluate(() => {
    const seen = /** @type {string[]} */ ([]);
    Object.assign(window, { playheadSeen: seen });
    new MutationObserver((records) => {
      for (const record of records) {
        const el = /** @type {Element} */ (record.target);
        const id = el.getAttribute("data-note-id");
        if (id && el.classList.contains("is-playing") && !seen.includes(id)) seen.push(id);
      }
    }).observe(document.querySelector("#staff") ?? document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  });
  return () => page.evaluate(() => /** @type {any} */ (window).playheadSeen);
}

test("play the whole tune or bar N, and the drone on home", async ({ page }) => {
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

  // Click the held E in bar 4, then close its chords: the place stays, and
  // "This bar" beside "From the top" turns Play into "Play bar 4".
  await clickNote(page, heldE.id);
  await page.keyboard.press("Escape");
  const fromTop = transport.getByRole("radio", { name: "From the top" });
  const thisBar = transport.getByRole("radio", { name: "This bar" });
  await expect(fromTop).toBeChecked();
  await expect(thisBar).toBeEnabled();
  await expect(thisBar).toHaveAccessibleDescription(/Now: bar 4\./);

  // This bar, then "Play bar 4": bar 4 and nothing past it.
  const seen = await watchPlayhead(page);
  await transport.locator("label").filter({ hasText: "This bar" }).click();
  await expect(thisBar).toBeChecked();
  const barOnly = transport.getByRole("button", { name: "Play bar 4", exact: true });
  await barOnly.click();
  await expect(transport.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(barOnly).toBeVisible({ timeout: 10_000 });
  const played = await seen();
  expect(played.length).toBeGreaterThan(0);
  expect(played.every((/** @type {string} */ id) => bar4.includes(id))).toBe(true);
  expect(played).toContain(heldE.id);
  // The drone checks below need playback that lasts: back to the top.
  await transport.locator("label").filter({ hasText: "From the top" }).click();
  await expect(fromTop).toBeChecked();
  const fromBar = transport.getByRole("button", { name: "Play", exact: true });

  // With the drone on, Play lights the D-major triad under the melody...
  await drone.click();
  await expect(drone).toHaveAttribute("aria-checked", "true");
  for (const key of droneKeys) await expect(key).not.toHaveClass(/\bmelody\b/);
  await fromBar.click();
  for (const key of droneKeys) await expect(key).toHaveClass(/\bmelody\b/);
  // ...turning it off mid-play lets go at once...
  await drone.click();
  for (const key of droneKeys) await expect(key).not.toHaveClass(/\bmelody\b/);
  // ...and on again brings it back while the tune plays on.
  await drone.click();
  for (const key of droneKeys) await expect(key).toHaveClass(/\bmelody\b/);
  // Stop clears it.
  await transport.getByRole("button", { name: "Stop" }).click();
  for (const key of droneKeys) await expect(key).not.toHaveClass(/\bmelody\b/);

  // The keyboard moves the place too: focus a note in bar 1, with This bar chosen.
  await transport.locator("label").filter({ hasText: "This bar" }).click();
  await page.locator(`#staff [role="button"][data-note-id="${ode.notes[0].id}"]`).focus();
  await expect(transport.getByRole("button", { name: "Play bar 1", exact: true })).toBeVisible();

  // Both themes stay accessible with the place set and the drone on.
  await axe(page);
  await page.getByRole("button", { name: "Dark mode" }).click();
  await axe(page);

  expect(problems).toEqual([]);
});
