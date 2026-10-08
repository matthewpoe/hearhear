// The three calls to action a brand-new user follows, at a laptop and a
// phone width: 1 pick a song (the song list alone), 2 find the key (with
// "Give me a hint", one clue per press, and the drone's keys lit), 3 place a
// chord (one specific note suggested, then the relationship described, never
// graded). Screens for the PR land in docs/screens/three-steps/ when
// SCREENS=1.

import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

const SCREENS = process.env.SCREENS === "1";

/**
 * The viewport as a viewer sees it, with `focus` scrolled into view (the
 * pointer moved off so no tooltip is left open).
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 * @param {string} [focus] a selector
 */
async function screen(page, name, focus) {
  if (!SCREENS) return;
  await page.mouse.move(0, 0);
  if (focus) {
    await page
      .locator(focus)
      .first()
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
  }
  await page.screenshot({ path: `docs/screens/three-steps/${name}.png` });
}

for (const [width, height] of [
  [1280, 800],
  [390, 844],
]) {
  test(`three steps at ${width}px: song, key, chords`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Leave lesson" }).click();

    // 1. The song list leads the full interface (the tutor shows too), with
    // the line about recording your own.
    const landing = page.locator("#landing");
    await expect(landing.getByRole("heading", { name: "Pick a song" })).toBeVisible();
    await expect(landing).toContainText("You can record your own once you get the hang of it.");
    await expect(page.locator("#tutor")).toBeVisible();
    await expect(page.locator("#staff")).toHaveCount(0);
    await axe(page);
    await screen(page, `1-song-${width}`);

    await page.getByRole("button", { name: /Ode to Joy/ }).click();
    await expect(page.locator("#staff svg")).toBeVisible();
    const steps = page.getByRole("list", { name: "Steps" });
    await expect(steps.locator('[aria-current="step"]')).toContainText("Key");
    await expect(steps.locator("li").first()).toContainText("Ode to Joy");

    // 2. Hints: one clue per press, marking notes on the staff, never a key.
    const question = page.locator("#key-prompt");
    const hints = question.getByRole("list", { name: "Hints" }).locator("li");
    await expect(hints).toHaveCount(0);
    await question.getByRole("button", { name: "Give me a hint" }).click();
    await expect(hints).toHaveCount(1);
    await expect(hints.first()).toContainText("Where does it come to rest?");
    await expect(page.locator("#staff .is-hint").first()).toBeAttached();
    await screen(page, `2-key-hint-${width}`, "#key-prompt-title");
    await question.getByRole("button", { name: "Another hint" }).click();
    await expect(hints).toHaveCount(2);
    await expect(hints.nth(1)).toContainText("sharps or flats");
    await expect(question.getByRole("button", { name: /hint/ })).toHaveCount(0);
    for (const text of await hints.allTextContents()) {
      expect(text).not.toMatch(/\b[A-G][♯♭]? (major|minor)\b/);
    }

    // The drone's keys light green while a finder chord plays (PR #46).
    await question.getByRole("button", { name: "Help me find it" }).click();
    await page.getByRole("button", { name: "Play the tune over chord 1" }).click();
    await expect(page.locator("#piano .key.drone")).toHaveCount(3);
    await page.locator("#key-finder").getByRole("button", { name: /^Stop/ }).click();
    await page.locator("#key-finder").getByRole("button", { name: "Close" }).click();
    await axe(page);

    // Choose D major, then move on to chords.
    await question
      .getByRole("group", { name: "Home note" })
      .getByRole("button", { name: "D", exact: true })
      .click();
    await question.getByRole("button", { name: "Next: find the chords" }).click();
    await expect(page.locator("#staff .is-hint")).toHaveCount(0);

    // 3. One specific place to start, ringed on the staff.
    const chordsStep = page.locator("#chords-step");
    await expect(steps.locator('[aria-current="step"]')).toContainText("Chords");
    await expect(chordsStep).toContainText("Try a chord under the first note of bar 1");
    const start = page.locator('#staff [role="button"].is-start .abcjs-notehead');
    await expect(start).toHaveCount(1);
    await screen(page, `3-chords-${width}`, "#staff");
    const box = await start.boundingBox();
    if (!box) throw new Error("the start note isn't on the staff");
    await start.click({ position: { x: box.width / 2, y: box.height / 4 } });
    const options = page.locator("#chords button").filter({ hasText: /Melody is/ });
    await options.first().click();
    if (await options.first().isVisible()) await options.first().click();

    // The relationship, described: no verdict, and one thing to try next.
    const said = chordsStep.getByRole("status");
    await expect(said).toContainText(/The melody note \(F♯\) is this chord's (root|3rd|5th)\./);
    await expect(said).not.toContainText(/right|wrong|correct|✓|✗/i);
    await expect(said.getByRole("button", { name: "Hear it again" })).toBeVisible();
    await expect(chordsStep).toContainText("bar 2");
    await axe(page);
    await screen(page, `4-placed-${width}`, "#chords-step");
  });
}
