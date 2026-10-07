// The golden path, end to end on fixtures, as a reviewer would click it:
// load a tune, find home (the ear finder, then one click on a chip), audition
// and choose a chord under the melody, place another from the chord row,
// switch songs and come back to the same work, and hear from the tutor.
// Fails on any console error (which includes CSP violations and the chord
// dropdown's containing-block guard) and on any axe violation, in both themes
// and with the chord dropdown open.

import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ode = JSON.parse(
  readFileSync(new URL("../../content/songs/ode-to-joy.json", import.meta.url), "utf8"),
);
// Half notes: the held E that ends bar 4, then the next one (bar 8's D).
const [heldE, laterHeld] = ode.notes.filter((/** @type {{ dur: number }} */ n) => n.dur === 24);

/**
 * Click a note by its head. The note's group has gaps where the SVG takes the
 * click, and a head on a line has the staff line across its middle, so aim
 * above the middle.
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
  expect(
    violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target).join(" | ")})`),
  ).toEqual([]);
}

test("golden path: tune, key by ear and by chip, chords, song memory, tutor", async ({ page }) => {
  /** @type {string[]} */
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hear Hear", level: 1 })).toBeVisible();
  await axe(page);
  // The core path, without the beginner tour; tips have their own spec.
  await page.getByRole("button", { name: "Beginner tips" }).click();

  // 1. Load the demo. Its key is hidden until the user commits a guess.
  await page.getByRole("button", { name: /Ode to Joy/ }).click();
  const question = page.locator("#key-prompt");
  await expect(question.getByRole("heading", { name: "What key is this tune in?" })).toBeVisible();

  // 2. The ear finder: three tonic chords, each playable.
  await question.getByRole("button", { name: "Help me find it" }).click();
  const finder = page.locator("#key-finder");
  await expect(finder.getByRole("button", { name: /^Chord \d sounds like home$/ })).toHaveCount(3);
  await finder.getByRole("button", { name: "Play the tune over chord 1" }).click();
  const stop = finder.getByRole("button", { name: /^Stop/ });
  await expect(stop).toBeVisible();
  await stop.click();
  await finder.getByRole("button", { name: "Close" }).click();
  await expect(finder).toHaveCount(0);

  // 3. One click on D commits D major; again takes it back; a third re-commits.
  const d = question.getByRole("group", { name: "Home note" }).getByRole("button", {
    name: "D",
    exact: true,
  });
  await d.click();
  await expect(d).toHaveAttribute("aria-pressed", "true");
  await expect(question).toContainText("Home is D major.");
  await d.click();
  await expect(d).toHaveAttribute("aria-pressed", "false");
  await expect(question).not.toContainText("Home is D major.");
  await d.click();
  await expect(d).toHaveAttribute("aria-pressed", "true");
  await expect(question).toContainText("Home is D major.");

  // "Check it by ear", then the chord already chosen: confirms, never un-commits.
  const check = question.getByRole("button", { name: "Check it by ear" });
  await check.click();
  await finder.locator('button[aria-pressed="true"]').click();
  await expect(finder).toHaveCount(0);
  await expect(d).toHaveAttribute("aria-pressed", "true");
  await expect(check).toBeFocused();
  await expect(question.getByRole("status")).toHaveText("Home is still D major.");

  // A focused radio (a label style) keeps only its arrows: number keys still play.
  // The radios are visually hidden inside their labels, so click the label as a viewer does.
  await page.locator("#staff label").filter({ hasText: "Nashville" }).click();
  await expect(page.getByRole("radio", { name: "Nashville" })).toBeFocused();
  await page.keyboard.down("Digit1");
  await expect(page.locator("#piano .key.held")).toHaveCount(1);
  await page.keyboard.up("Digit1");
  await page
    .locator("#staff label")
    .filter({ hasText: /^\s*Roman\s*$/ })
    .click();
  await expect(page.getByRole("radio", { name: "Roman", exact: true })).toBeChecked();

  // The voice-leading explainer passes axe while open.
  const explain = page.locator('#staff button[aria-controls="voice-leading-explainer"]');
  await explain.click();
  await expect(page.locator("#voice-leading-explainer")).toBeVisible();
  await axe(page);
  await explain.click();

  // 4. Click the held E in bar 4: V and ii fit best and come first. The open
  // dropdown has to pass axe in light theme too.
  await clickNote(page, heldE.id);
  const options = page.locator("#chords button").filter({ hasText: /Melody is/ });
  await expect(options.first()).toContainText("V");
  await expect(options.first()).toBeInViewport();
  await axe(page);
  await options.first().hover();
  await options.first().click();
  const placed = page.getByRole("list", { name: "Placed chords" }).getByRole("button");
  await expect(placed).toHaveCount(1);

  // 5. The chord row: with another note's dropdown open, G places V on it.
  await clickNote(page, laterHeld.id);
  await expect(options.first()).toBeVisible();
  await page.keyboard.press("g");
  await expect(placed).toHaveCount(2);
  await expect(placed.nth(1)).toHaveAccessibleName(/^V\b/);
  await page.keyboard.press("Escape");

  // 6. Switching songs and back brings back the key and the chords.
  const picker = page.getByRole("group", { name: "Song" });
  await picker.getByRole("button", { name: "St. James Infirmary" }).click();
  // St. James starts fresh: no home chosen, no chords.
  await expect(question.locator('button[aria-pressed="true"]')).toHaveCount(0);
  await expect(placed).toHaveCount(0);
  await picker.getByRole("button", { name: "Ode to Joy" }).click();
  await expect(d).toHaveAttribute("aria-pressed", "true");
  await expect(question).toContainText("Home is D major.");
  await expect(placed).toHaveCount(2);

  // 7. Ask the tutor; the fixture reply ends with numbered listening steps,
  // each on its own line.
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  const reply = page.locator("#tutor .turn.tutor p").last();
  await expect(reply).toContainText("3.", { timeout: 10_000 });
  // innerText follows layout: the steps keep their line breaks only if they render.
  const lines = (await reply.innerText()).split("\n").map((line) => line.trim());
  for (const step of ["1.", "2.", "3."]) {
    expect(lines.some((line) => line.startsWith(step))).toBe(true);
  }

  // Both themes stay accessible after the whole path.
  await axe(page);
  await page.getByRole("button", { name: "Dark mode" }).click();
  await axe(page);

  expect(problems).toEqual([]);
});
