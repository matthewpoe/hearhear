// The guided walkthrough at two laptop sizes, walked as a first-time visitor
// would. It starts on its own on a first visit and teaches the real
// interface: the strip has no button that does a step, only the way out
// (Finish on the last step). Each step spotlights the real control, and the
// viewer uses it: a tune's card, Play, the key box, the number row, a note on
// the staff, the chord row, the key tools, the tutor, Record. A step advances
// only when it's done. It can be left and resumed mid-way, never starts on
// its own again in the tab once left, and restarts fresh. At every step the
// strip on the keyboard dock stays in view and off what the step asks the
// viewer to use. Fails on any console error and on any axe violation, in
// both themes.

import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

/** @param {string} file */
const json = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const { steps } = json("../../content/guided-path.json");
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
  "number-keys": ["#piano .key"],
  "chord-keys": ["#piano .key"],
  transpose: ["#toolbar summary"],
  ask: ["#tutor > h2", "#tutor .demo", "#tutor .ask"],
  record: ["#record-button"],
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

/**
 * Whether the step's spotlight is on the real control: an element carrying
 * data-spotlight that matches `selector`, or for a note, the note's own
 * elements carrying the staff's spotlight class.
 * @param {import("@playwright/test").Page} page
 * @param {{ selector?: string, text?: string, noteId?: string }} want
 */
function spotlit(page, want) {
  return page.evaluate((want) => {
    if (want.noteId) {
      const lit = [...document.querySelectorAll("#staff .spotlight")];
      return (
        lit.length > 0 &&
        lit.every(
          (el) => el.closest("[data-note-id]")?.getAttribute("data-note-id") === want.noteId,
        )
      );
    }
    const lit = [...document.querySelectorAll("[data-spotlight]")];
    return (
      lit.length === 1 &&
      lit[0].matches(want.selector ?? "*") &&
      (!want.text || (lit[0].textContent ?? "").includes(want.text))
    );
  }, want);
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  test(`the walkthrough starts on its own, teaches the real controls, can be left and resumed (${viewport.width}x${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    /** @type {string[]} */
    const problems = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") problems.push(msg.text());
    });
    page.on("pageerror", (error) => problems.push(error.message));

    // A first visit: the walkthrough starts on its own in the dock, with no
    // choice screen and without taking focus.
    await page.goto("/");
    const tour = page.getByRole("region", { name: "Guided tour" });
    await expect(tour).toBeVisible();
    const entry = page.getByRole("button", { name: "Guided lesson" });
    await expect(entry).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show me how" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Beginner tips" })).toHaveCount(0);
    const heading = page.locator("#guided-step-title");
    await expect(heading).not.toBeFocused();
    const count = tour.getByText(/^Guided tour · step \d+\/\d+$/);
    await expect(count).toHaveText(`Guided tour · step 1/${steps.length}`);
    await expect(tour.getByText("Draft", { exact: true })).toBeVisible();
    // The Draft badge carries the placeholder note, for screen readers too.
    await expect(tour.getByText(/placeholder: pending Matthew's ear check/i)).toBeAttached();
    // The step's action is in the accent color.
    const act = tour.locator(".act");
    await expect(act).toHaveText("Load Ode to Joy");
    expect(
      await act.evaluate((el) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--accent)";
        el.append(probe);
        const accent = getComputedStyle(probe).color;
        probe.remove();
        return getComputedStyle(el).color === accent;
      }),
    ).toBe(true);
    await axe(page);

    /**
     * The step is current, its target wears the spotlight, and the strip
     * offers no button but the way out (Finish on the last step).
     * @param {string} id
     * @param {{ selector?: string, text?: string, noteId?: string }} target
     */
    const expectStep = async (id, target) => {
      const at = steps.findIndex((/** @type {{ id: string }} */ s) => s.id === id);
      await expect(heading).toHaveText(`${titleOf(id)}:`);
      await expect(count).toHaveText(`Guided tour · step ${at + 1}/${steps.length}`);
      await expect(tour.getByRole("button")).toHaveText([
        at === steps.length - 1 ? "Finish" : "Leave tour",
      ]);
      await expect.poll(() => spotlit(page, target), `${id} spotlight`).toBe(true);
      await expect.poll(() => stripProblems(page, id)).toEqual([]);
    };
    /**
     * Press and release a key on the computer keyboard, as a player would.
     * @param {string} key
     */
    const playKey = async (key) => {
      await page.locator("h1").click();
      await page.keyboard.down(key);
      await expect(page.locator("#piano .key.held").first()).toBeAttached();
      await page.keyboard.up(key);
    };

    // 1. Load the tune from its card on the welcome.
    await expectStep("load", { selector: "#song-chooser button", text: "Ode to Joy" });
    await page
      .locator("#song-chooser")
      .getByRole("button", { name: /Ode to Joy/ })
      .click();

    // 2. Play, from the staff's own button. Loading alone doesn't count.
    const transport = page.locator("#staff [aria-label='Playback']");
    const play = transport.getByRole("button", { name: "Play", exact: true });
    await expectStep("listen", { selector: "#staff [aria-label='Playback'] button" });
    await expect(page.locator("[data-spotlight]")).toHaveAccessibleName("Play");

    // Leave mid-way: the spotlight goes, and "Guided lesson" resumes where it
    // was left, with focus on the step.
    await tour.getByRole("button", { name: "Leave tour" }).click();
    await expect(heading).toHaveCount(0);
    await expect(page.locator("[data-spotlight]")).toHaveCount(0);
    await expect(entry).toBeFocused();
    await entry.click();
    await expect(heading).toBeFocused();
    await expectStep("listen", { selector: "#staff [aria-label='Playback'] button" });
    await expect(play).toBeEnabled();
    await play.click();

    // 3. Find home: the key box is spotlit and comes into view above the dock.
    await expectStep("home", { selector: "#key-prompt" });
    await expect
      .poll(() => aboveDock(page, "#key-prompt [aria-labelledby='key-home-label']"))
      .toBe(true);
    await transport.getByRole("button", { name: "Stop" }).click();
    await page.locator("#key-prompt").getByRole("button", { name: "Help me find it" }).click();
    const finder = page.locator("#key-finder");
    await expect(finder).toBeVisible();
    await finder.getByRole("button", { name: "Close" }).click();
    // A home that isn't D points back to the ear finder.
    const homes = page.locator("#key-prompt").getByRole("group", { name: "Home note" });
    await homes.getByRole("button", { name: "A", exact: true }).click();
    await expect(tour.getByText(/Press Check it by ear/)).toBeVisible();
    await expectStep("home", { selector: "#key-prompt" });
    await homes.getByRole("button", { name: "D", exact: true }).click();

    // 4. 1 is home: a note on the number row.
    await expectStep("number-keys", { selector: "#piano" });
    await playKey("Digit1");

    // 5–8. Each chord step rings its note on the staff; the viewer clicks it
    // and picks the chord (the chord row's letters: G is V, H is vi, A is I).
    for (const [id, noteId, key] of [
      ["half-cadence", "nf", "g"],
      ["set-up-ending", "n1c", "g"],
      ["wrong-ish", lastNote.id, "h"],
      ["land", lastNote.id, "a"],
    ]) {
      await expectStep(id, { noteId });
      await clickNote(page, noteId);
      await expect(page.locator("#chords [role='dialog']")).toBeVisible();
      await expect.poll(() => stripProblems(page, id)).toEqual([]);
      await page.keyboard.press(key);
      await page.keyboard.press("Escape");
    }

    // 9. Chords by color: a chord key on the A–J row.
    await expectStep("chord-keys", { selector: "#piano" });
    await playKey("KeyA");

    // 10. Same tune, any key: open the key tools.
    await expectStep("transpose", { selector: "#toolbar" });
    await page.locator("#toolbar summary").click();

    // 11. Ask the tutor in the viewer's own words.
    await expectStep("ask", { selector: "#tutor .ask" });
    await page.locator("#tutor-question").fill("Why does the ending land now?");
    await page.locator("#tutor").getByRole("button", { name: "Ask", exact: true }).click();

    // 12. Record: the last step always offers Finish, so it can be skipped.
    await expectStep("record", { selector: "#record-button" });
    await page.screenshot({ path: test.info().outputPath(`record-step-${viewport.width}.png`) });
    await axe(page);
    await page.getByRole("button", { name: "Dark mode" }).click();
    await axe(page);
    await page.getByRole("button", { name: "Record a tune" }).click();
    await expect(tour.getByText("Done.")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    // Finishing takes the spotlight away; it doesn't start on its own again.
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(heading).toHaveCount(0);
    await expect(entry).toBeVisible();
    await expect(page.locator("[data-spotlight], #staff .spotlight")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("region", { name: "Guided tour" })).toHaveCount(0);
    await expect(entry).toBeVisible();

    // Started again with the tune open, a fresh run reloads it bare (no key,
    // no chords), which is its first step done, and asks for Play again.
    await entry.click();
    await expectStep("listen", { selector: "#staff [aria-label='Playback'] button" });
    await expect(page.getByRole("list", { name: "Placed chords" })).toHaveCount(0);
    await tour.getByRole("button", { name: "Leave tour" }).click();

    expect(problems).toEqual([]);
  });
}
