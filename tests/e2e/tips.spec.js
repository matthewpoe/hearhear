// The beginner tour at a laptop size, walked as a beginner would: the welcome,
// then a tune, Play, find home, a key, a chord, and Next through the rest to
// the tutor. Every tip stays off the controls a beginner needs while reading
// it: the key question's buttons and chips, Play, the masthead toggles, the
// staff's notes, and the tutor's heading, question box, and replies. A tip
// anchored in the keyboard dock never overlaps the dock and stays on screen.

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
  "#key-prompt button",
  "#key-prompt label",
  "#staff [aria-label='Playback']",
  ".masthead-tools",
  "#staff [role='button'][data-note-id]",
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
 * The tip's box, once it has stopped moving (Next may scroll smoothly).
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

test("the beginner tour walks from the welcome to the tutor without covering a control", async ({
  page,
}) => {
  /** @type {string[]} */
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Beginner tips" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const tip = page.locator("aside.callout");
  const next = tip.getByRole("button", { name: /^(Next|Got it)$/ });
  /** @type {string[]} */
  const seen = [];

  // The welcome, before any song. It has no Next: it waits for a tune.
  seen.push(await checkTip(page));
  expect(seen).toEqual(["Start here"]);
  await expect(next).toHaveCount(0);
  await page.getByRole("button", { name: /Ode to Joy/ }).click();

  // The staff tip: pressing Play finishes it.
  seen.push(await checkTip(page));
  expect(seen.at(-1)).toBe("The tune, written out");
  const play = page.locator("#staff [aria-label='Playback']").getByRole("button", { name: "Play" });
  await play.click();

  // Then find home, and Next to the ear finder's tip.
  seen.push(await checkTip(page));
  expect(seen.at(-1)).toBe("Your first job: find home");
  await page
    .locator("#staff [aria-label='Playback']")
    .getByRole("button", { name: "Stop" })
    .click();
  await next.click();
  seen.push(await checkTip(page));
  expect(seen.at(-1)).toBe("Don't read music? Use your ear.");

  // Choose D: that finishes both key tips.
  await page
    .locator("#key-prompt")
    .getByRole("group", { name: "Home note" })
    .getByRole("button", { name: "D", exact: true })
    .click();

  // Number keys, in the dock; Next to "Hover a chord", which a chord finishes.
  seen.push(await checkTip(page));
  expect(DOCKED.has(seen.at(-1))).toBe(true);
  await next.click();
  seen.push(await checkTip(page));
  expect(seen.at(-1)).toBe("Hover a chord to hear it under the tune.");
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

  // The rest with Next, the shapes tip among them, ending on the tutor's Got it.
  for (let step = 0; step < 6; step++) {
    seen.push(await checkTip(page));
    const last = (await next.textContent())?.trim() === "Got it";
    await next.click();
    if (last) break;
  }
  await expect(tip).toHaveCount(0);
  expect(seen.at(-1)).toBe("Stuck? Ask the tutor.");
  expect(seen).toContain("Blue circle means home; red square means tension.");
  expect(seen).toContain("Same tune, any key");
  expect(new Set(seen).size).toBe(seen.length);

  expect(problems).toEqual([]);
});
