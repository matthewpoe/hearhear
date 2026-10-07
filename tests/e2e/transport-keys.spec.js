// The transport's keys, anywhere in the app: Space plays from the top,
// pauses (the playhead holds), and resumes; Left while playing goes back to
// the bar's start, and a quick second Left to the top. After a mouse click a
// control keeps focus but Space still reaches the transport; a control with
// keyboard focus keeps its own Space.

import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

const ode = JSON.parse(
  readFileSync(new URL("../../content/songs/ode-to-joy.json", import.meta.url), "utf8"),
);
/** @type {Map<string, number>} */
const startOf = new Map(
  ode.notes.map((/** @type {{ id: string, start: number }} */ n) => [n.id, n.start]),
);
const BAR = (ode.meter.beatsPerBar * 48) / ode.meter.beatUnit;

/** @param {import("@playwright/test").Page} page */
const playhead = (page) =>
  page.evaluate(
    () => document.querySelector("#staff .is-playing")?.getAttribute("data-note-id") ?? null,
  );

/**
 * Record the playhead's notes from now on; the returned function reads them.
 * @param {import("@playwright/test").Page} page
 */
async function watchPlayhead(page) {
  await page.evaluate(() => {
    const seen = /** @type {string[]} */ ([]);
    /** @type {any} */ (window).seenNotes = seen;
    new MutationObserver((records) => {
      for (const record of records) {
        const el = /** @type {Element} */ (record.target);
        const id = el.getAttribute("data-note-id");
        if (id && el.classList.contains("is-playing")) seen.push(id);
      }
    }).observe(document.querySelector("#staff") ?? document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  });
  return () => page.evaluate(() => /** @type {string[]} */ (/** @type {any} */ (window).seenNotes));
}

test("Space plays, pauses and resumes; Left goes to the bar's start, Left Left to the top", async ({
  page,
}) => {
  /** @type {string[]} */
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Beginner tips" }).click();
  await page.getByRole("button", { name: /Ode to Joy/ }).click();
  const transport = page.locator("#staff [aria-label='Playback']");
  await expect(transport.getByText("Loading the piano…")).toHaveCount(0, { timeout: 15_000 });
  const stopButton = transport.getByRole("button", { name: "Stop" });
  const playButton = transport.getByRole("button", { name: "Play", exact: true });
  await expect(playButton).toHaveAccessibleDescription(
    /Space: play from the top, pause, or resume/,
  );

  // Space plays from the top.
  await page.keyboard.press("Space");
  await expect(stopButton).toBeVisible();
  await expect.poll(() => playhead(page)).not.toBeNull();
  // Let it reach bar 2.
  await expect
    .poll(async () => startOf.get((await playhead(page)) ?? "") ?? 0)
    .toBeGreaterThanOrEqual(BAR);

  // Space pauses: Play is back, and the playhead holds on its note.
  await page.keyboard.press("Space");
  await expect(playButton).toBeVisible();
  await expect(transport.getByText("Paused. Space resumes.")).toBeVisible();
  const held = await playhead(page);
  expect(held).not.toBeNull();
  await page.waitForTimeout(500);
  expect(await playhead(page)).toBe(held);

  // Space resumes from there, not from the top.
  const resumed = await watchPlayhead(page);
  await page.keyboard.press("Space");
  await expect(stopButton).toBeVisible();
  await expect.poll(async () => (await resumed()).length).toBeGreaterThan(0);
  expect(startOf.get((await resumed())[0])).toBe(startOf.get(held ?? ""));

  // Left: back to the start of the bar under the playhead, still playing.
  await expect
    .poll(async () => startOf.get((await playhead(page)) ?? "") ?? 0)
    .toBeGreaterThanOrEqual(2 * BAR);
  const before = startOf.get((await playhead(page)) ?? "") ?? 0;
  const barStart = Math.floor(before / BAR) * BAR;
  const afterLeft = await watchPlayhead(page);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await afterLeft()).length).toBeGreaterThan(0);
  expect([barStart, barStart + BAR]).toContain(startOf.get((await afterLeft())[0]));
  await expect(stopButton).toBeVisible();

  // Left twice, quickly: the top of the song.
  await page.waitForTimeout(500);
  const afterDouble = await watchPlayhead(page);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await afterDouble()).includes(ode.notes[0].id)).toBe(true);
  const seen = await afterDouble();
  expect(startOf.get(seen[seen.length - 1])).toBeLessThan(BAR);
  await stopButton.click();
  await expect(playButton).toBeVisible();

  expect(problems).toEqual([]);
});

test("Space plays after a mouse click on a control, and activates a control with keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Beginner tips" }).click();
  await page.getByRole("button", { name: /Ode to Joy/ }).click();
  const transport = page.locator("#staff [aria-label='Playback']");
  await expect(transport.getByText("Loading the piano…")).toHaveCount(0, { timeout: 15_000 });

  // A mouse click leaves focus on the label style, but Space is the transport's.
  await page
    .locator("#staff label")
    .filter({ hasText: /^\s*Letters\s*$/ })
    .click();
  await expect(page.getByRole("radio", { name: "Letters", exact: true })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(transport.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Letters", exact: true })).toBeChecked();
  await page.keyboard.press("Space");
  await expect(transport.getByText("Paused. Space resumes.")).toBeVisible();

  // A mouse-clicked button: Space still plays, and doesn't press the button.
  const dark = page.getByRole("button", { name: "Dark mode" });
  await dark.click();
  await expect(dark).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(transport.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(dark).toHaveAttribute("aria-pressed", "true");
  await transport.getByRole("button", { name: "Stop" }).click();

  // Tab to a button: Space activates it, and nothing plays.
  await page.getByRole("button", { name: "Beginner tips" }).focus();
  await page.keyboard.press("Tab");
  await expect(dark).toBeFocused();
  await page.keyboard.press("Space");
  await expect(dark).toHaveAttribute("aria-pressed", "false");
  await expect(transport.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});
