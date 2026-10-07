// The beginner tour at a laptop size, walked as a beginner would. Every tip
// names one action, and only doing it moves on: a tune, Play, Help me find
// it, a note on the number row, a note's chords, a chord key, the key tools,
// and a question to the tutor. There is no Next. Every tip stays off the
// controls a beginner needs while reading it: the song list, the key
// question's buttons and chips, Play, the masthead toggles, the staff's
// notes, the key tools, and the tutor's heading, question box, and replies. A
// tip anchored in the keyboard dock never overlaps the dock and stays on
// screen. "Turn tips off" and Escape are ways out that don't finish a tip.

import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

const { callouts } = JSON.parse(
  readFileSync(new URL("../../content/callouts.json", import.meta.url), "utf8"),
);
const ode = JSON.parse(
  readFileSync(new URL("../../content/songs/ode-to-joy.json", import.meta.url), "utf8"),
);
// The held E that ends bar 4: a half note, with chords that fit it.
const heldE = ode.notes.find((/** @type {{ dur: number }} */ n) => n.dur === 24);
/** Titles of the tips anchored in the keyboard dock. */
const DOCKED = new Set(
  callouts
    .filter((/** @type {{ anchor: string }} */ c) => c.anchor === "piano")
    .map((/** @type {{ title: string }} */ c) => c.title),
);

/** The controls no tip may cover (Callouts.svelte keeps these clear). */
const CONTROLS = [
  "#song-chooser button",
  "#key-prompt button",
  "#key-prompt label",
  "#staff [aria-label='Playback']",
  ".masthead-tools",
  "#staff [role='button'][data-note-id]",
  "#toolbar summary",
  "#tutor > h2",
  "#tutor .log",
  "#tutor .ask",
].join(", ");

/**
 * Click a note by its head, above the staff line across its middle (as the
 * golden path does).
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
 * The tip's box, once it has stopped moving.
 * @param {import("@playwright/test").Page} page
 */
async function settledTip(page) {
  const tip = page.locator("aside.callout");
  await expect(tip).toBeVisible();
  let last = "";
  await expect
    .poll(async () => {
      const box = JSON.stringify(await tip.boundingBox());
      const still = box === last;
      last = box;
      return still;
    })
    .toBe(true);
  return tip;
}

/**
 * Names of the controls the visible tip overlaps, in viewport coordinates.
 * @param {import("@playwright/test").Page} page
 */
function covered(page) {
  return page.evaluate((selector) => {
    const tip = document.querySelector("aside.callout")?.getBoundingClientRect();
    if (!tip) return [];
    return [...document.querySelectorAll(selector)]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        return r.left < tip.right && tip.left < r.right && r.top < tip.bottom && tip.top < r.bottom;
      })
      .map((el) => el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName);
  }, CONTROLS);
}

/**
 * The settled tip's title, after checking it covers no control and, for a
 * tip anchored in the dock, that it stays clear of the dock and on screen.
 * @param {import("@playwright/test").Page} page
 */
async function checkTip(page) {
  const tip = await settledTip(page);
  const title = (await tip.locator("h2").textContent()) ?? "";
  expect(await covered(page), `tip "${title}"`).toEqual([]);
  if (DOCKED.has(title)) {
    const tipBox = await tip.boundingBox();
    const dockBox = await page.locator(".keyboard-dock").boundingBox();
    if (!tipBox || !dockBox) throw new Error("tip or dock not on screen");
    expect(tipBox.y + tipBox.height, `tip "${title}" above the dock`).toBeLessThanOrEqual(
      dockBox.y,
    );
    expect(tipBox.y, `tip "${title}" on screen`).toBeGreaterThanOrEqual(0);
    expect(tipBox.x, `tip "${title}" on screen`).toBeGreaterThanOrEqual(0);
    expect(tipBox.x + tipBox.width, `tip "${title}" on screen`).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
  }
  return title;
}

/**
 * Press and release a key on the computer keyboard, as a player would.
 * @param {import("@playwright/test").Page} page
 * @param {string} key
 */
async function play(page, key) {
  await page.keyboard.down(key);
  await expect(page.locator("#piano .key.held").first()).toBeAttached();
  await page.keyboard.up(key);
}

/**
 * Ids of the tips remembered as done.
 * @param {import("@playwright/test").Page} page
 */
function doneIds(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("hearhear.callouts.dismissed") ?? "[]"),
  );
}

test("each tip waits for its action, and the ways out don't finish it", async ({ page }) => {
  /** @type {string[]} */
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Beginner tips" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const tip = page.locator("aside.callout");
  /** @type {string[]} */
  const seen = [];
  const playback = page.locator("#staff [aria-label='Playback']");

  // The welcome, before any song: no Next, only the way out.
  seen.push(await checkTip(page));
  expect(seen).toEqual(["Start here"]);
  await expect(tip.getByRole("button")).toHaveText(["Turn tips off"]);

  // Escape folds it into the chip without finishing it; the chip brings it back.
  await tip.focus();
  await page.keyboard.press("Escape");
  await expect(tip).toHaveCount(0);
  const chip = page.getByRole("button", { name: "Show the tip: Start here" });
  await expect(chip).toBeFocused();
  expect(await doneIds(page)).toEqual([]);
  await chip.click();
  await expect(tip).toBeVisible();

  // Turn tips off is the way out, and it doesn't finish the tip either.
  await tip.getByRole("button", { name: "Turn tips off" }).click();
  await expect(tip).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toBeFocused();
  expect(await doneIds(page)).toEqual([]);
  await toggle.click();
  await expect(tip.locator("h2")).toHaveText("Start here");

  await page.getByRole("button", { name: /Ode to Joy/ }).click();

  // The staff tip: pressing Play finishes it.
  seen.push(await checkTip(page));
  expect(seen.at(-1)).toBe("Hear the tune");
  await playback.getByRole("button", { name: "Play" }).click();

  // Find home by ear: it waits for its button, even after Play stops.
  seen.push(await checkTip(page));
  expect(seen.at(-1)).toBe("Find home by ear");
  await playback.getByRole("button", { name: "Stop" }).click();
  await expect(tip.locator("h2")).toHaveText("Find home by ear");

  // A curious click on a note before choosing the key opens "Choose the key
  // first"; it must not use up the chord tip that comes after the key.
  await clickNote(page, heldE.id);
  await page.keyboard.press("Escape");

  await page.locator("#key-prompt").getByRole("button", { name: "Help me find it" }).click();
  // The finder says what to do next, so no tip sits over it.
  await expect(page.locator("#key-finder")).toBeVisible();
  await expect(tip).toHaveCount(0);
  await page
    .locator("#key-prompt")
    .getByRole("group", { name: "Home note" })
    .getByRole("button", { name: "D", exact: true })
    .click();

  // 1 is home, in the dock: a note on the number row finishes it.
  seen.push(await checkTip(page));
  expect(seen.at(-1)).toBe("1 is home");
  expect(DOCKED.has("1 is home")).toBe(true);
  await page.locator("h1").click();
  await play(page, "Digit1");

  // Try chords: clicking a note finishes it; nothing covers the dropdown.
  seen.push(await checkTip(page));
  expect(seen.at(-1)).toBe("Try chords");
  await clickNote(page, heldE.id);
  await expect(tip).toHaveCount(0);
  await page
    .locator("#chords button")
    .filter({ hasText: /Melody is/ })
    .first()
    .click();
  await expect(page.getByRole("list", { name: "Placed chords" }).getByRole("button")).toHaveCount(
    1,
  );

  // Chords by color, in the dock: a chord key finishes it.
  seen.push(await checkTip(page));
  expect(seen.at(-1)).toBe("Chords by color");
  await page.locator("h1").click();
  await play(page, "KeyA");

  // Same tune, any key: opening the key tools finishes it.
  seen.push(await checkTip(page));
  expect(seen.at(-1)).toBe("Same tune, any key");
  await page.locator("#toolbar summary").click();

  // The tools push the tutor below the fold at this size: its tip waits
  // behind the chip, which scrolls to it.
  const waiting = page.getByRole("button", { name: "Show the tip: Ask the tutor" });
  await expect(tip).toHaveCount(0);
  await waiting.click();
  seen.push(await checkTip(page));
  expect(seen.at(-1)).toBe("Ask the tutor");
  await page.locator("#tutor-question").fill("Why does bar 4 feel unfinished?");
  await page.locator("#tutor").getByRole("button", { name: "Ask", exact: true }).click();
  await expect(tip).toHaveCount(0);
  await expect(page.locator(".masthead-tools button.chip")).toHaveCount(0);

  expect(seen).toEqual(callouts.map((/** @type {{ title: string }} */ c) => c.title));
  expect(await doneIds(page)).toHaveLength(callouts.length);
  expect(problems).toEqual([]);
});
