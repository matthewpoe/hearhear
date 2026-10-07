// The guided path at two laptop sizes, walked as a reviewer would: start it from
// the landing, do each step (with its button where it helps), see it advance
// only when the step's action is done, leave and resume it mid-way, and
// finish. There is no Next or Back: the only way forward is doing the step,
// and "Leave tour" is the only way out. A step already done when the tour
// reaches it is skipped. At every step the strip on the keyboard dock stays
// in view and off what the step asks the viewer to use. Beginner tips stay
// quiet while it runs and come back after.
// Fails on any console error and on any axe violation, in both themes.

import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

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

/** What each step asks the viewer to use, which the strip must never cover. */
const TARGETS = {
  load: ["#song-chooser button"],
  listen: ["#staff [aria-label='Playback']"],
  home: ["#key-prompt button"],
  "half-cadence": [`#staff [data-note-id="nf"]`],
  "set-up-ending": [`#staff [data-note-id="n1c"]`],
  "wrong-ish": [`#staff [data-note-id="${lastNote.id}"]`],
  land: [`#staff [data-note-id="${lastNote.id}"]`],
  ask: ["#tutor > h2", "#tutor .demo", "#tutor .ask"],
};
/** Kept clear at every step: the tutor's heading, demo notice and question box, and the open dropdown. */
const ALWAYS = ["#tutor > h2", "#tutor .demo", "#tutor .ask", "#chords [role='dialog']"];

/**
 * What's wrong with the strip's place: outside the viewport, or over a step's
 * target or a control it must keep clear. Each element is first scrolled into
 * view as the page would scroll it (the dock's height is the scroll padding).
 * @param {import("@playwright/test").Page} page
 * @param {string} id the step
 */
function stripProblems(page, id) {
  const selectors = [...(TARGETS[/** @type {keyof typeof TARGETS} */ (id)] ?? []), ...ALWAYS];
  return page.evaluate((selectors) => {
    const strip = document.querySelector("section[aria-label='Guided tour']");
    if (!strip) return ["no strip"];
    const problems = [];
    const inside = () => {
      const s = strip.getBoundingClientRect();
      return s.top >= 0 && s.bottom <= innerHeight && s.left >= 0 && s.right <= innerWidth;
    };
    if (!inside()) problems.push("strip outside the viewport");
    // The step's one-line instruction must fit without an ellipsis.
    const line = strip.querySelector(".line:not(.open)");
    if (line && line.scrollWidth > line.clientWidth + 1) problems.push("step line truncated");
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        el.scrollIntoView({ block: "nearest", behavior: "instant" });
        const r = el.getBoundingClientRect();
        const s = strip.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.left < s.right && s.left < r.right && r.top < s.bottom && s.top < r.bottom)
          problems.push(selector);
      }
    }
    if (!inside()) problems.push("strip outside the viewport after scrolling");
    return [...new Set(problems)];
  }, selectors);
}

/**
 * Whether an element is wholly on screen above the keyboard dock.
 * @param {import("@playwright/test").Page} page
 * @param {string} selector
 */
function aboveDock(page, selector) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    const dock = document.querySelector(".keyboard-dock");
    if (!el || !dock) return false;
    const r = el.getBoundingClientRect();
    // A pixel of slack: scroll padding rounds the dock's height.
    return r.top >= 0 && r.bottom <= dock.getBoundingClientRect().top + 1;
  }, selector);
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

    // The piano's samples wait until step 2, to press its Play before the piano is ready.
    /** @type {() => void} */
    let releaseSamples = () => {};
    const samplesHeld = new Promise((resolve) => (releaseSamples = () => resolve(undefined)));
    await page.route("**/samples/piano/**", async (route) => {
      await samplesHeld;
      await route.continue();
    });

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
    const count = tour.getByText(/^Guided tour · step \d\/\d$/);
    await expect(count).toHaveText(`Guided tour · step 1/${steps.length}`);
    await expect(tour.getByText("Draft", { exact: true })).toBeVisible();
    // The Draft badge carries the placeholder note, for screen readers too.
    await expect(tour.getByText(/placeholder: pending Matthew's ear check/i)).toBeAttached();
    // One action and one way out; nothing else moves the tour on.
    await expect(tour.getByRole("button")).toHaveText(["Load Ode to Joy", "Leave tour"]);
    await expect(entry).toHaveCount(0);
    // Tips are hushed while it runs; the toggle keeps the viewer's setting.
    await expect(tip).toHaveCount(0);
    await expect(tips).toHaveAttribute("aria-pressed", "true");
    await axe(page);

    /** @param {string} id */
    const expectStep = async (id) => {
      const at = steps.findIndex((/** @type {{ id: string }} */ s) => s.id === id);
      await expect(heading).toHaveText(`${titleOf(id)}:`);
      await expect(count).toHaveText(`Guided tour · step ${at + 1}/${steps.length}`);
      await expect(tip).toHaveCount(0);
      await expect(tips).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => stripProblems(page, id)).toEqual([]);
      for (const name of ["Next", "Back", "Got it"]) {
        await expect(tour.getByRole("button", { name, exact: true })).toHaveCount(0);
      }
    };
    const tryThis = (/** @type {string} */ label) =>
      tour.getByRole("button", { name: label, exact: true });

    // 1. Load the tune: the step advances on its own.
    await expect.poll(() => stripProblems(page, "load")).toEqual([]);
    await tryThis("Load Ode to Joy").click();
    await expectStep("listen");

    // 2. Play it: loading alone doesn't count. Pressed at once, while the
    // piano still loads, it waits for the piano and then plays.
    await expect(page.locator("#staff").getByText("Loading the piano…")).toBeVisible();
    // Left while it waits, it's dropped: the tune doesn't start on its own.
    const transport = page.locator("#staff [aria-label='Playback']");
    await tryThis("Play").click();
    const waiting = tour.getByRole("button", { name: "Loading the piano…" });
    await expect(waiting).toBeVisible();
    await expect(heading).toHaveText(`${titleOf("listen")}:`);
    await tour.getByRole("button", { name: "Leave tour" }).click();
    releaseSamples();
    await expect(transport.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
    await page.waitForTimeout(500);
    await expect(transport.getByRole("button", { name: "Stop" })).toHaveCount(0);
    await entry.click();
    await expectStep("listen");
    // A mouse press on a strip button leaves the page where it is.
    await page.evaluate(() => scrollTo(0, 0));
    const play = tour.getByRole("button", { name: "Play" });
    const box = await play.boundingBox();
    if (!box) throw new Error("no Play button in the strip");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    // 3 arrives with the home chips it asks for in view above the dock.
    await expect(heading).toHaveText(`${titleOf("home")}:`);
    await expect
      .poll(() => aboveDock(page, "#key-prompt [aria-labelledby='key-home-label']"))
      .toBe(true);
    await expectStep("home");
    await page.locator("#staff").getByRole("button", { name: "Stop" }).click();

    // The step's button opens the ear finder; a home that isn't D points back to it.
    await tryThis("Find it by ear").click();
    const finder = page.locator("#key-finder");
    await expect(finder).toBeVisible();
    await finder.getByRole("button", { name: "Close" }).click();
    const homes = page.locator("#key-prompt").getByRole("group", { name: "Home note" });
    await homes.getByRole("button", { name: "A", exact: true }).click();
    await expect(tour.getByText(/Press Check it by ear/)).toBeVisible();
    await expectStep("home");
    await homes.getByRole("button", { name: "D", exact: true }).click();
    await expectStep("half-cadence");

    // 4. The step's button opens bar 4's chords; G places V (the chord row's letters).
    await tryThis("Show me the note").click();
    await expect(page.locator("#chords [role='dialog']")).toBeFocused();
    await expect.poll(() => stripProblems(page, "half-cadence")).toEqual([]);
    await page.keyboard.press("g");
    await page.keyboard.press("Escape");
    await expectStep("set-up-ending");

    // Leave mid-way: the tips come back; resume where it was left.
    await tour.getByRole("button", { name: "Leave tour" }).click();
    await expect(heading).toHaveCount(0);
    await expect(entry).toHaveText("Resume the guided tour");
    await expect(entry).toBeFocused();
    await expect(tips).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("aside.callout, .masthead-tools button.chip")).not.toHaveCount(0);
    await entry.click();
    await expectStep("set-up-ending");

    // 5. V under the 2 of "3 2 1", placed by hand on the note itself.
    await clickNote(page, "n1c");
    await page.keyboard.press("g");
    await page.keyboard.press("Escape");
    await expectStep("wrong-ish");

    // 6. vi under the last note.
    await tryThis("Show me the note").click();
    await page.keyboard.press("h");
    await page.keyboard.press("Escape");
    await expectStep("land");

    // 7. Then I (A): the V-I landing.
    await tryThis("Show me the note").click();
    await page.keyboard.press("a");
    await page.keyboard.press("Escape");
    await expectStep("ask");
    await page.screenshot({ path: test.info().outputPath(`mid-tour-${viewport.width}.png`) });

    // 8. The step asks the lesson plan's question; the reply completes the tour.
    await tryThis("Ask the tutor").click();
    const ending = plan.exchanges.find((/** @type {{ id: string }} */ e) => e.id === "ode-ending");
    await expect(page.locator("#tutor .turn.student p").first()).toHaveText(ending.question);
    await expect(tour.getByText("Done.")).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => stripProblems(page, "ask")).toEqual([]);
    // Done, the last step offers only Finish.
    await expect(tour.getByRole("button")).toHaveText(["Finish"]);

    await axe(page);
    await page.getByRole("button", { name: "Dark mode" }).click();
    await axe(page);

    // Finishing puts the tips back and starts the next tour from the top.
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(heading).toHaveCount(0);
    await expect(entry).toHaveText("Take the guided tour");
    await expect(tips).toHaveAttribute("aria-pressed", "true");

    // Started again, it skips every step already done and stops at the
    // first one that isn't: vi is no longer under the last note (I is).
    await entry.click();
    await expect(heading).toHaveText(`${titleOf("wrong-ish")}:`);
    await tour.getByRole("button", { name: "Leave tour" }).click();

    expect(problems).toEqual([]);
  });
}
