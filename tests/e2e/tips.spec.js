// The beginner tour at a laptop size: every tip, from the welcome through the
// last one after loading a tune, stays off the controls a beginner needs
// while reading it: the key question's buttons and chips, Play, and the
// masthead toggles.

import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

/** The controls no tip may cover (Callouts.svelte keeps these clear). */
const CONTROLS =
  "#key-prompt button, #key-prompt label, #staff [aria-label='Playback'], .masthead-tools";

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
      .map((el) => el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName);
  }, CONTROLS);
}

test("the beginner tour never covers the key question, Play, or the masthead toggles", async ({
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

  // The welcome tip, before any song.
  const tip = await settledTip(page);
  await expect(tip).toContainText("Start here");
  expect(await covered(page)).toEqual([]);

  // Load the tune and walk the rest of the tour.
  await page.getByRole("button", { name: /Ode to Joy/ }).click();
  await expect(page.locator("#key-prompt")).toBeVisible();
  /** @type {string[]} */
  const seen = [];
  for (let step = 0; step < 12; step++) {
    const current = await settledTip(page);
    const title = (await current.locator("h2").textContent()) ?? "";
    seen.push(title);
    expect(await covered(page), `tip "${title}"`).toEqual([]);
    const next = current.getByRole("button", { name: /^(Next|Got it)$/ });
    const last = (await next.textContent())?.trim() === "Got it";
    await next.click();
    if (last) break;
  }
  await expect(page.locator("aside.callout")).toHaveCount(0);
  // The key question and the tutor tips both showed after loading.
  expect(seen).toContain("Your first job: find home");
  expect(seen).toContain("Stuck? Ask the tutor.");

  expect(problems).toEqual([]);
});
