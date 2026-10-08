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
  numbers: ["#piano .key"],
  "half-cadence": [`#staff [data-note-id="nf"]`],
  land: [`#staff [data-note-id="${lastNote.id}"]`],
  review: ["#tutor > h2", "#tutor .demo", "#tutor .ask"],
  transpose: ["#toolbar summary"],
  "your-turn": ["#record-button"],
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
    const strip = document.querySelector("section[aria-label='Guided lesson']");
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
        // Only what a viewer can see and use. A closed <details> (the key
        // box's "Play it in another key") keeps layout boxes for its hidden
        // keys, but scrollIntoView can't reach them, so they'd read as under
        // the strip wherever the page happens to be scrolled.
        if (!el.checkVisibility({ visibilityProperty: true })) continue;
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
 * @param {{ selector?: string, text?: string, noteId?: string, count?: number }} want
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
      lit.length === (want.count ?? 1) &&
      lit.every((el) => el.matches(want.selector ?? "*")) &&
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
    // Nothing the walkthrough does reaches Anthropic from the page.
    page.on("request", (request) => {
      if (/anthropic/i.test(new URL(request.url()).hostname)) problems.push(request.url());
    });

    // A first visit: the walkthrough starts on its own in the dock, with no
    // choice screen and without taking focus.
    await page.goto("/");
    const tour = page.getByRole("region", { name: "Guided lesson" });
    await expect(tour).toBeVisible();
    const entry = page.getByRole("button", { name: "Guided lesson" });
    await expect(entry).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show me how" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Beginner tips" })).toHaveCount(0);
    const heading = page.locator("#guided-step-title");
    await expect(heading).not.toBeFocused();
    const count = tour.getByText(/^Guided lesson · step \d+\/\d+$/);
    await expect(count).toHaveText(`Guided lesson · step 1/${steps.length - 1}`);
    // No "Draft" badge, and the content's status note stays out of the page.
    await expect(tour.getByText("Draft", { exact: true })).toHaveCount(0);
    await expect(tour.getByText(/placeholder: pending/i)).toHaveCount(0);
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
     * @param {{ selector?: string, text?: string, noteId?: string, count?: number }} target
     */
    const expectStep = async (id, target) => {
      const at = steps.findIndex((/** @type {{ id: string }} */ s) => s.id === id);
      await expect(heading).toHaveText(`${titleOf(id)}:`);
      await expect(count).toHaveText(`Guided lesson · step ${at + 1}/${steps.length - 1}`);
      // No button does the step: only moving between steps, and the way out.
      await expect(tour.getByRole("button")).toHaveText([
        "Back",
        "Next",
        "Restart",
        "Leave lesson",
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
    await tour.getByRole("button", { name: "Leave lesson" }).click();
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

    // 4. Count from home: 3 3 4 5 on the number row, its 3, 4 and 5 keys
    // spotlit on the piano. One 3 is not enough.
    await expectStep("numbers", { selector: "#piano button.key", count: 3 });
    await playKey("Digit3");
    await expect(heading).toHaveText(`${titleOf("numbers")}:`);
    await playKey("Digit3");
    await playKey("Digit4");
    await playKey("Digit5");

    // 5. V under bar 4's long note: the note is ringed; the viewer clicks it
    // and picks V (the chord row's letters: G is V).
    await expectStep("half-cadence", { noteId: "nf" });
    await clickNote(page, "nf");
    await expect(page.locator("#chords [role='dialog']")).toBeVisible();
    await expect.poll(() => stripProblems(page, "half-cadence")).toEqual([]);
    await page.keyboard.press("g");
    await page.keyboard.press("Escape");

    // 6. vi, then I, under the last note: vi alone doesn't finish it.
    await expectStep("land", { noteId: lastNote.id });
    await clickNote(page, lastNote.id);
    await page.keyboard.press("h");
    await page.keyboard.press("Escape");
    await expectStep("land", { noteId: lastNote.id });
    await clickNote(page, lastNote.id);
    await page.keyboard.press("a");
    await page.keyboard.press("Escape");

    // 7. Get a review: Review my chords is spotlit and pressing it is the step.
    await expectStep("review", { selector: "#tutor .ask button", text: "Review my chords" });
    // The step needs no passphrase, so the live tutor doesn't ask for one here.
    await expect(page.locator("#tutor-gate-ask")).toHaveCount(0);
    // In either mode it replays the step's review lesson (the review sample
    // until it's recorded): anyone gets a review, with no access code and no
    // Claude call. Never a question's recorded answer.
    const replied = page.waitForResponse("**/api/tutor");
    await page.locator("#tutor").getByRole("button", { name: "Review my chords" }).click();
    const reply = await replied;
    expect(reply.status()).toBe(200);
    expect(reply.request().headers()["x-tutor-fixture"]).toBe("lesson:ode-review");
    expect(reply.request().postDataJSON().mode).toBe("review");
    expect(reply.request().headers()["x-tutor-access"]).toBeUndefined();
    // The notice says the reply is a recorded sample (in live mode, that one reply).
    await expect(page.locator("#tutor .demo")).toContainText("recorded sample");

    // 8. Play it in another key, from the disclosure in the key box. Opening
    // it isn't enough; moving the tune is.
    await expectStep("transpose", { selector: "#toolbar > summary" });
    await page.locator("#toolbar > summary").click();
    await expect(heading).toHaveText(`${titleOf("transpose")}:`);
    await page.getByRole("button", { name: "Play in E major" }).click();

    // The send-off: not a step, just the way on. Finish ends it, and so does
    // pressing Record.
    await expect(heading).toHaveText(`${titleOf("your-turn")}:`);
    await expect(tour.getByText("Guided lesson · done")).toBeVisible();
    await expect(tour.getByRole("button")).toHaveText(["Back", "Restart", "Finish"]);
    await expect.poll(() => spotlit(page, { selector: "#record-button" })).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`send-off-${viewport.width}.png`) });
    await axe(page);
    await page.getByRole("button", { name: "Dark mode" }).click();
    await axe(page);
    await page.getByRole("button", { name: "Record a tune" }).click();
    await expect(heading).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel" }).click();

    // Ending takes the spotlight away; it doesn't start on its own again.
    await expect(entry).toBeVisible();
    await expect(page.locator("[data-spotlight], #staff .spotlight")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("region", { name: "Guided lesson" })).toHaveCount(0);
    await expect(entry).toBeVisible();

    // Started again with the tune open, a fresh run reloads it bare (no key,
    // no chords), which is its first step done, and asks for Play again.
    await entry.click();
    await expectStep("listen", { selector: "#staff [aria-label='Playback'] button" });
    await expect(page.getByRole("list", { name: "Placed chords" })).toHaveCount(0);
    await tour.getByRole("button", { name: "Leave lesson" }).click();

    expect(problems).toEqual([]);
  });
}

test("at phone width the step's whole line shows, wrapped, not cut off (390x844)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const tour = page.getByRole("region", { name: "Guided lesson" });
  await expect(tour).toBeVisible();
  const line = tour.locator(".line");
  const whole = () => line.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(await whole(), "step line truncated").toBe(true);
  await page
    .locator("#song-chooser")
    .getByRole("button", { name: /Ode to Joy/ })
    .click();
  await expect(page.locator("#guided-step-title")).toHaveText(`${titleOf("listen")}:`);
  expect(await whole(), "step line truncated").toBe(true);
});

test("another song mid-walk asks for the tour's tune back, and spotlights the song select", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const tour = page.getByRole("region", { name: "Guided lesson" });
  await page
    .locator("#song-chooser")
    .getByRole("button", { name: /Ode to Joy/ })
    .click();
  const heading = page.locator("#guided-step-title");
  await expect(heading).toHaveText(`${titleOf("listen")}:`);

  await page.locator("#song-select").selectOption({ label: "St. James Infirmary" });
  const hint = tour.locator(".hint");
  await expect(hint).toContainText("This step is about Ode to Joy, and another song is open.");
  await expect.poll(() => spotlit(page, { selector: "#song-select" })).toBe(true);
  await expect(heading).toHaveText(`${titleOf("listen")}:`);

  await page.locator("#song-select").selectOption({ label: "Ode to Joy" });
  await expect(hint).toHaveCount(0);
  await expect
    .poll(() => spotlit(page, { selector: "#staff [aria-label='Playback'] button" }))
    .toBe(true);

  // Further on, "Back to Ode to Joy" reopens the tune with the work kept (the
  // key chosen), on the same step.
  await page
    .locator("#staff [aria-label='Playback']")
    .getByRole("button", { name: "Play", exact: true })
    .click();
  await expect(heading).toHaveText(`${titleOf("home")}:`);
  await page
    .locator("#staff [aria-label='Playback']")
    .getByRole("button", { name: "Stop" })
    .click();
  const homes = page.locator("#key-prompt").getByRole("group", { name: "Home note" });
  await homes.getByRole("button", { name: "D", exact: true }).click();
  await expect(heading).toHaveText(`${titleOf("numbers")}:`);
  await page.locator("#song-select").selectOption({ label: "St. James Infirmary" });
  const back = tour.getByRole("button", { name: "Back to Ode to Joy" });
  await expect(back).toBeVisible();
  await axe(page);
  await back.click();
  await expect(hint).toHaveCount(0);
  await expect(page.locator("#song-select")).toHaveValue("ode-to-joy");
  await expect(heading).toHaveText(`${titleOf("numbers")}:`);
  await expect(homes.getByRole("button", { name: "D", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(heading).toBeFocused();
});

test("Back, Next and Restart move through the lesson; Back never bounces forward", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const tour = page.getByRole("region", { name: "Guided lesson" });
  const heading = page.locator("#guided-step-title");
  const back = tour.getByRole("button", { name: "Back a step" });
  const next = tour.getByRole("button", { name: "Next step" });
  const restart = tour.getByRole("button", { name: "Restart lesson" });
  const count = tour.getByText(/^Guided lesson · step \d+\/\d+$/);
  const at = (/** @type {string} */ id) =>
    steps.findIndex((/** @type {{ id: string }} */ s) => s.id === id);
  const onStep = async (/** @type {string} */ id) => {
    await expect(heading).toHaveText(`${titleOf(id)}:`);
    await expect(count).toHaveText(`Guided lesson · step ${at(id) + 1}/${steps.length - 1}`);
  };
  await expect(back).toBeDisabled();

  const transport = page.locator("#staff [aria-label='Playback']");
  await page
    .locator("#song-chooser")
    .getByRole("button", { name: /Ode to Joy/ })
    .click();
  await onStep("listen");
  await transport.getByRole("button", { name: "Play", exact: true }).click();
  await onStep("home");
  await transport.getByRole("button", { name: "Stop" }).click();
  const homes = page.locator("#key-prompt").getByRole("group", { name: "Home note" });
  await homes.getByRole("button", { name: "D", exact: true }).click();
  await onStep("numbers");

  // Back to a done step: it stays there, marked done, its target spotlit again.
  await back.click();
  await onStep("home");
  await expect(tour.getByText("Done.")).toBeVisible();
  await expect.poll(() => spotlit(page, { selector: "#key-prompt" })).toBe(true);
  await page.waitForTimeout(500);
  await onStep("home");
  await expect(back).toBeFocused();

  // Back again, by keyboard, to Play: doing it again moves forward naturally,
  // past the home already chosen.
  await page.keyboard.press("Enter");
  await onStep("listen");
  await expect
    .poll(() => spotlit(page, { selector: "#staff [aria-label='Playback'] button" }))
    .toBe(true);
  await transport.getByRole("button", { name: "Play", exact: true }).click();
  await onStep("numbers");
  await transport.getByRole("button", { name: "Stop" }).click();

  // Next moves on without doing the step.
  await next.click();
  await onStep("half-cadence");
  await expect.poll(() => spotlit(page, { noteId: "nf" })).toBe(true);
  await next.click();
  await onStep("land");

  // Restart: step 1 done with a fresh Ode to Joy (no key, no chords), so
  // it asks for Play again.
  await restart.click();
  await onStep("listen");
  await expect(
    page.locator("#key-prompt").getByRole("button", { name: "Help me find it" }),
  ).toBeVisible();
  await expect(homes.getByRole("button", { name: "D", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await back.click();
  await onStep("load");
  await expect(back).toBeDisabled();
  await expect(heading).toBeFocused();
  await axe(page);
});

test("during the review step, a typed question never carries the review lesson", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const at = steps.findIndex((/** @type {{ id: string }} */ s) => s.id === "review");
  await page.addInitScript((at) => localStorage.setItem("hearhear.guided.step", String(at)), at);
  /** @type {{ fixture: string | undefined, mode: string }[]} */
  const sent = [];
  await page.route("**/api/tutor", async (route) => {
    sent.push({
      fixture: route.request().headers()["x-tutor-fixture"],
      mode: route.request().postDataJSON().mode,
    });
    await route.abort();
  });
  await page.goto("/");
  await page
    .locator("#song-chooser")
    .getByRole("button", { name: /Ode to Joy/ })
    .click();
  await expect(page.locator("#guided-step-title")).toHaveText(`${titleOf("review")}:`);
  await page.locator("#tutor-question").fill("Why does the ending land?");
  await page.locator("#tutor").getByRole("button", { name: "Ask", exact: true }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toEqual({ fixture: undefined, mode: "question" });
});

test("while the lesson is on a step with no note, the Chords step still suggests one", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page
    .locator("#song-chooser")
    .getByRole("button", { name: /Ode to Joy/ })
    .click();
  const transport = page.locator("#staff [aria-label='Playback']");
  await transport.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("#guided-step-title")).toHaveText(`${titleOf("home")}:`);
  await transport.getByRole("button", { name: "Stop" }).click();
  const question = page.locator("#key-prompt");
  await question
    .getByRole("group", { name: "Home note" })
    .getByRole("button", { name: "D", exact: true })
    .click();
  // The lesson is on Count from home, which rings piano keys, not a note.
  await expect(page.locator("#guided-step-title")).toHaveText(`${titleOf("numbers")}:`);
  await question.getByRole("button", { name: "Next: find the chords" }).click();
  // Step 3's heading never shows with nothing under it: its own first note.
  const chordsStep = page.locator("#chords-step");
  await expect(chordsStep).toContainText("Try a chord under the first note of bar 1");
  await expect(page.locator("#staff [role='button'].is-start")).toHaveCount(1);
});

test("while the lesson runs, the Chords step suggests the lesson's note, not one of its own", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // The notation library arrives after the clicks below, as on a slow
  // network: the staff's first draw then follows the lesson's last look for
  // its note, and the ring has to survive it.
  await page.route(/\/abcjs-[^/]*\.js$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  // Resume the lesson at its V-at-bar-4 step.
  const at = steps.findIndex((/** @type {{ id: string }} */ s) => s.id === "half-cadence");
  await page.addInitScript((at) => localStorage.setItem("hearhear.guided.step", String(at)), at);
  await page.goto("/");
  await page
    .locator("#song-chooser")
    .getByRole("button", { name: /Ode to Joy/ })
    .click();
  await expect(page.locator("#guided-step-title")).toHaveText(`${titleOf("half-cadence")}:`);
  const question = page.locator("#key-prompt");
  await question
    .getByRole("group", { name: "Home note" })
    .getByRole("button", { name: "D", exact: true })
    .click();
  await question.getByRole("button", { name: "Next: find the chords" }).click();

  // One place on the page: the lesson's spotlit note is step 3's ringed note.
  const chordsStep = page.locator("#chords-step");
  const ringed = page.locator("#staff [role='button'].is-start");
  await expect(chordsStep).toContainText(/Try a chord under the note at bar 4/);
  await expect(ringed).toHaveCount(1);
  await expect(ringed).toHaveAttribute("data-note-id", "nf");
  await expect.poll(() => spotlit(page, { noteId: "nf" })).toBe(true);

  // Out of the lesson, step 3 picks its own note again: bar 1's first.
  await page.getByRole("button", { name: "Leave lesson" }).click();
  await expect(chordsStep).toContainText("Try a chord under the first note of bar 1");
  await expect(ringed).toHaveCount(1);
  await expect(ringed).not.toHaveAttribute("data-note-id", "nf");
});
