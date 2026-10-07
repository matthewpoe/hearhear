// The golden path, end to end on fixtures, as a reviewer would click it:
// load a tune, find home (the ear finder, one click on a chip, a guess most
// ears don't share, and a check by ear), audition and choose a chord under the
// melody, place another from the chord row, switch songs and come back to the
// same work, and hear from the tutor.
// Fails on any console error (which includes CSP violations and the chord
// dropdown's containing-block guard) and on any axe violation, in both themes
// and with the chord dropdown open.

import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

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

test("golden path: tune, key by ear and by chip, chords, song memory, tutor", async ({ page }) => {
  // The longest walk in the suite; on a loaded machine it can pass 30 s.
  test.setTimeout(60_000);
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

  // 3. No mode is chosen until the user picks one or a home.
  const bright = question.getByRole("radio", { name: "Bright (major)" });
  const dark = question.getByRole("radio", { name: "Dark (minor)" });
  await expect(bright).not.toBeChecked();
  await expect(dark).not.toBeChecked();

  // One click on D commits D major, which most ears hear; again takes it back.
  const homes = question.getByRole("group", { name: "Home note" });
  const d = homes.getByRole("button", { name: "D", exact: true });
  const chose = "You chose D major as home.";
  const match = "That's the home most ears hear in this tune.";
  await d.click();
  await expect(d).toHaveAttribute("aria-pressed", "true");
  await expect(question).toContainText(chose);
  await expect(question).toContainText(match);
  await expect(bright).toBeChecked();
  await expect(question).toContainText("Major unless you pick Dark.");
  await expect(question.getByRole("button", { name: "Done: on to chords" })).toBeVisible();
  await d.click();
  await expect(d).toHaveAttribute("aria-pressed", "false");
  await expect(question).not.toContainText(chose);

  // A home most ears don't hear gets a gentle invitation, never a verdict.
  const c = homes.getByRole("button", { name: "C", exact: true });
  await c.click();
  await expect(question).toContainText("You chose C major as home.");
  await expect(question).toContainText("Most ears hear home somewhere else in this tune.");
  await expect(question).not.toContainText(/wrong/i);
  await expect(question).not.toContainText(match);
  const keep = question.getByRole("button", { name: "Keep my choice" });
  // The invitation scrolls into view above the keyboard dock; focus stays on the chip.
  await expect
    .poll(() =>
      keep.evaluate((el) => {
        const dock = document.querySelector(".keyboard-dock")?.getBoundingClientRect().top ?? 0;
        return el.getBoundingClientRect().bottom <= dock + 1;
      }),
    )
    .toBe(true);
  await expect(c).toBeFocused();
  await keep.click();
  await expect(keep).toHaveCount(0);
  await expect(question.getByRole("status")).toHaveText("Keeping C major as home.");
  await expect(question.getByRole("button", { name: "Check it by ear" })).toBeFocused();

  // D again: still confirmed as the home most ears hear.
  await d.click();
  await expect(d).toHaveAttribute("aria-pressed", "true");
  await expect(question).toContainText(chose);
  await expect(question).toContainText(match);

  // "Check it by ear" marks no chord. Picking the one that is D major (second
  // in Ode to Joy's lineup) reveals the set and confirms the home, never
  // un-commits it, and the finder stays open until closed.
  const check = question.getByRole("button", { name: "Check it by ear" });
  await check.click();
  await expect(finder.locator('button[aria-pressed="true"]')).toHaveCount(0);
  await finder.getByRole("button", { name: "Chord 2 sounds like home" }).click();
  await expect(finder).toBeVisible();
  await expect(finder).toContainText("Chord 1: F♯ minor");
  await expect(finder).toContainText("Chord 2: D major");
  await expect(finder).toContainText("Chord 3: A major");
  await expect(d).toHaveAttribute("aria-pressed", "true");
  await expect(question.getByRole("status")).toHaveText(
    "Same as your choice. Home is still D major.",
  );
  await finder.getByRole("button", { name: "Close" }).click();
  await expect(finder).toHaveCount(0);
  await expect(check).toBeFocused();

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

  // Every option in the tool row has a tooltip, shown on hover and on
  // keyboard focus, and named by aria-describedby: one gloss per option
  // (content/explainers.json). Voice leading has no separate info bubble.
  const voice = page.getByRole("switch", { name: "Voice leading" });
  await expect(voice).toHaveAccessibleDescription(/^Voice leading is how a pianist moves/);
  await expect(page.locator('[aria-controls="voice-leading-explainer"]')).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Nashville" })).toHaveAccessibleDescription(
    /plain numbers for the same idea/,
  );
  const voiceTip = page.locator("#voice-leading-tip");
  await expect(voiceTip).toBeHidden();
  await voice.hover();
  await expect(voiceTip).toBeVisible();
  await axe(page);
  await page.mouse.move(0, 0);
  await expect(voiceTip).toBeHidden();
  await voice.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(voice).toBeFocused();
  await expect(voiceTip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(voiceTip).toBeHidden();

  // The tool row holds only Play and its scope, the label style, Undo/Redo,
  // and Print; the settings sit with their steps: drone and degrees with the
  // key, voice leading with the chords.
  const row = page.locator("#staff .header");
  await expect(row.getByRole("switch")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Print lead sheet" })).toBeVisible();
  await expect(question.getByRole("switch", { name: "Drone on home" })).toBeVisible();
  await expect(question.getByRole("switch", { name: "Scale degrees" })).toBeVisible();
  await expect(
    page.locator("#chords").getByRole("switch", { name: "Voice leading" }),
  ).toBeVisible();

  // All key handling is in the key box: "Play it in another key" transposes
  // there, and the old toolbar section is gone.
  await expect(page.getByText("Change key or transpose")).toHaveCount(0);
  const transpose = question.locator("summary", { hasText: "Play it in another key" });
  await expect(question).toContainText("Choose a different home");
  await transpose.click();
  await question.getByRole("button", { name: "Play in E major" }).click();
  await expect(d).toHaveAttribute("aria-pressed", "false");
  await expect(question.getByRole("button", { name: "Play in E major" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await question.getByRole("button", { name: "Play in D major" }).click();
  await expect(d).toHaveAttribute("aria-pressed", "true");
  await transpose.click();

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
  // The masthead's song select, grouped into demo tunes and the user's own.
  const picker = page.getByRole("combobox", { name: "Song" });
  await picker.selectOption({ label: "St. James Infirmary" });
  // St. James starts fresh: no home chosen, no chords.
  await expect(question.locator('button[aria-pressed="true"]')).toHaveCount(0);
  await expect(placed).toHaveCount(0);
  await picker.selectOption({ label: "Ode to Joy" });
  await expect(d).toHaveAttribute("aria-pressed", "true");
  await expect(question).toContainText(chose);
  await expect(question).toContainText(match);
  await expect(placed).toHaveCount(2);

  // 7. Ask the tutor, which says it is replaying recorded replies; the fixture
  // reply ends with numbered listening steps, rendered as a list.
  const tutor = page.locator("#tutor");
  await expect(tutor.getByText(/^Demo mode:/)).toBeVisible();
  const ask = tutor.getByRole("button", { name: "Ask", exact: true });
  await expect(ask).toBeDisabled();
  await tutor.getByLabel("Your question").fill("Why does bar 4 feel unfinished?");
  await ask.click();
  const reply = page.locator("#tutor .turn.tutor").last();
  await expect(reply.locator("ol.steps > li")).toHaveCount(3, { timeout: 10_000 });
  await expect(reply.locator("ol.steps > li").first()).toContainText(/bar 4/);
  await expect(reply.locator("p")).not.toContainText("1.");

  // Both themes stay accessible after the whole path.
  await axe(page);
  await page.getByRole("button", { name: "Dark mode" }).click();
  await axe(page);

  expect(problems).toEqual([]);
});
