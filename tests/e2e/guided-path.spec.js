// The guided path at a laptop size, walked as a reviewer would: start it from
// the landing, do each step (with its "Try this" button where it helps), see
// it advance on its own, leave and resume it mid-way, step back and forward,
// and finish. Beginner tips stay quiet while it runs and come back after.
// Fails on any console error and on any axe violation, in both themes.

import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** @param {string} file */
const json = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const { steps } = json("../../content/guided-path.json");
const plan = json("../../content/lessons/plan.json");
const ode = json("../../content/songs/ode-to-joy.json");
/** The last note: bar 8, beat 3 (tick 360 at 12 ticks per quarter in 4/4). */
const lastNote = ode.notes.find((/** @type {{ start: number }} */ n) => n.start === 360);

/** @param {string} id */
const titleOf = (id) => steps.find((/** @type {{ id: string }} */ s) => s.id === id).title;

/**
 * Click a note by its head, above the middle (a staff line crosses heads on lines).
 * @param {import("@playwright/test").Page} page
 * @param {string} id
 */
async function clickNote(page, id) {
  const head = page.locator(`#staff [role="button"][data-note-id="${id}"] .abcjs-notehead`);
  const box = await head.boundingBox();
  if (!box) throw new Error(`note ${id} isn't on the staff`);
  await head.click({ position: { x: box.width / 2, y: box.height / 4 } });
}

/**
 * The docked panel's overlap with the controls it must keep clear, by selector.
 * @param {import("@playwright/test").Page} page
 */
function covered(page) {
  return page.evaluate(() => {
    const panel = document.querySelector("section[aria-label='Guided tour']");
    if (!panel) return ["no panel"];
    const p = panel.getBoundingClientRect();
    const dockTop = document.querySelector(".keyboard-dock")?.getBoundingClientRect().top ?? 0;
    const problems = [];
    if (p.top < 0 || p.bottom > dockTop || p.right > innerWidth) problems.push("off screen");
    for (const selector of ["#tutor .ask", "#chords [role='dialog']"]) {
      for (const el of document.querySelectorAll(selector)) {
        const r = el.getBoundingClientRect();
        if (r.left < p.right && p.left < r.right && r.top < p.bottom && p.top < r.bottom)
          problems.push(selector);
      }
    }
    return problems;
  });
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

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  test(`the guided path runs start to finish, can be left and resumed, and hushes the tips (${viewport.width}x${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    /** @type {string[]} */
    const problems = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") problems.push(msg.text());
    });
    page.on("pageerror", (error) => problems.push(error.message));

    await page.goto("/");
    const tips = page.getByRole("button", { name: "Beginner tips" });
    const tip = page.locator("aside.callout");
    const entry = page.getByRole("button", { name: /^(Take|Resume) the guided tour$/ });
    await expect(tips).toHaveAttribute("aria-pressed", "true");
    await expect(tip).toBeVisible();
    await expect(entry).toHaveText("Take the guided tour");

    // Started from the landing's invitation.
    await page.getByRole("button", { name: "Show me how" }).click();
    const tour = page.getByRole("region", { name: "Guided tour" });
    await expect(tour).toBeVisible();
    const heading = page.locator("#guided-step-title");
    await expect(heading).toBeFocused();
    const count = tour.getByText(/^Step \d of \d$/);
    await expect(count).toHaveText(`Step 1 of ${steps.length}`);
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
    await expect(page.getByText(/^placeholder: pending Matthew's ear check/i)).toBeVisible();
    await expect(entry).toHaveCount(0);
    // Tips are hushed while it runs; the toggle keeps the viewer's setting.
    await expect(tip).toHaveCount(0);
    await expect(tips).toHaveAttribute("aria-pressed", "true");
    await axe(page);

    /** @param {string} id */
    const expectStep = async (id) => {
      const at = steps.findIndex((/** @type {{ id: string }} */ s) => s.id === id);
      await expect(heading).toHaveText(titleOf(id));
      await expect(count).toHaveText(`Step ${at + 1} of ${steps.length}`);
      await expect(tip).toHaveCount(0);
      await expect(tips).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => covered(page)).toEqual([]);
    };
    const tryThis = (/** @type {string} */ label) => page.getByRole("button", { name: label });

    // 1. Load the tune: the step advances on its own.
    await tryThis("Load Ode to Joy").click();
    await expectStep("home");

    // 2. The drone chords open from the step; a wrong home points back to them.
    await tryThis("Open the drone chords").click();
    const finder = page.locator("#key-finder");
    await expect(finder).toBeVisible();
    await finder.getByRole("button", { name: "Close" }).click();
    const homes = page.locator("#key-prompt").getByRole("group", { name: "Home note" });
    await homes.getByRole("button", { name: "A", exact: true }).click();
    await expect(page.getByText(/Choose 'Check it by ear'/)).toBeVisible();
    await expectStep("home");
    await homes.getByRole("button", { name: "D", exact: true }).click();
    await expectStep("half-cadence");

    // 3. The step opens bar 4's chords; G places V (the chord row's letters).
    await tryThis("Show the chords for bar 4").click();
    await expect(page.locator("#chords [role='dialog']")).toBeFocused();
    await expect.poll(() => covered(page)).toEqual([]);
    await page.keyboard.press("g");
    await page.keyboard.press("Escape");
    await expectStep("set-up-ending");

    // Folds to a chip and back.
    await page.getByRole("button", { name: "Fold" }).click();
    const chip = page.getByRole("button", { name: /^Guided tour · 4\/\d$/ });
    await expect(chip).toBeFocused();
    await expect(heading).toHaveCount(0);
    await chip.click();
    await expect(heading).toBeFocused();

    // Leave mid-way: the tips come back; resume where it was left.
    await page.getByRole("button", { name: "Leave the tour" }).click();
    await expect(heading).toHaveCount(0);
    await expect(entry).toHaveText("Resume the guided tour");
    await expect(entry).toBeFocused();
    await expect(tips).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("aside.callout, .masthead-tools button.chip")).not.toHaveCount(0);
    await entry.click();
    await expectStep("set-up-ending");

    // 4. V under the 2 of "3 2 1".
    await tryThis("Show the chords for bar 8").click();
    await expect(page.locator("#chords [role='dialog']")).toBeFocused();
    await page.keyboard.press("g");
    await page.keyboard.press("Escape");
    await expectStep("wrong-ish");

    // 5. Hear vi through the step's audition, then place it (H).
    await tryThis("Hear vi under the last note").click();
    await clickNote(page, lastNote.id);
    await page.keyboard.press("h");
    await page.keyboard.press("Escape");
    await expectStep("land");

    // 6. Then I (A): the V-I landing.
    await tryThis("Hear I under the last note").click();
    await clickNote(page, lastNote.id);
    await page.keyboard.press("a");
    await page.keyboard.press("Escape");
    await expectStep("ask");
    await page.screenshot({ path: test.info().outputPath(`ask-step-${viewport.width}.png`) });

    // 7. The step asks the lesson plan's question; the reply completes the tour.
    await tryThis("Ask the tutor").click();
    const ending = plan.exchanges.find((/** @type {{ id: string }} */ e) => e.id === "ode-ending");
    await expect(page.locator("#tutor .turn.student p").first()).toHaveText(ending.question);
    await expect(page.getByText("Done. That's the tour.")).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => covered(page)).toEqual([]);

    // Back shows an earlier step as done, without bouncing forward; Next returns.
    await page.getByRole("button", { name: "Back" }).click();
    await expectStep("land");
    await expect(page.getByText("Done. On to the next step.")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await expectStep("ask");

    await axe(page);
    await page.getByRole("button", { name: "Dark mode" }).click();
    await axe(page);

    // Finishing puts the tips back and starts the next tour from the top.
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(heading).toHaveCount(0);
    await expect(entry).toHaveText("Take the guided tour");
    await expect(tips).toHaveAttribute("aria-pressed", "true");

    expect(problems).toEqual([]);
  });
}
