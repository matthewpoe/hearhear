// "Review my chords": the tutor panel's one primary action. It waits for a
// chosen key and a placed chord, saying why while it can't be pressed; then it
// asks for a review of the whole chart (mode "review") and the fixture's
// review comes back with suggestion cards. Hovering or focusing a card rings
// its note on the staff, and leaving it clears the ring. Fixture mode, so
// nothing calls Claude. Passes axe.

import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { axe } from "./axe.js";

const ode = JSON.parse(
  readFileSync(new URL("../../content/songs/ode-to-joy.json", import.meta.url), "utf8"),
);
// The held E that ends bar 4: the review fixture's first idea is for it.
const heldE = ode.notes.find((/** @type {{ dur: number }} */ n) => n.dur === 24);

/**
 * Click a note by its head, above its middle (a head on a line has the staff
 * line across it).
 * @param {import("@playwright/test").Page} page
 * @param {string} id
 */
async function clickNote(page, id) {
  const head = page.locator(`#staff [role="button"][data-note-id="${id}"] .abcjs-notehead`);
  const box = await head.boundingBox();
  if (!box) throw new Error(`note ${id} isn't on the staff`);
  await head.click({ position: { x: box.width / 2, y: box.height / 4 } });
}

test("Review my chords reviews the chart, and a suggestion card rings its note", async ({
  page,
}) => {
  /** @type {string[]} */
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  /** @type {{ mode: string, question: string | null }[]} */
  const asked = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/tutor")) asked.push(request.postDataJSON());
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Leave lesson" }).click();
  await page.getByRole("button", { name: /Ode to Joy/ }).click();

  const tutor = page.locator("#tutor");
  const review = tutor.getByRole("button", { name: "Review my chords" });
  await expect(tutor.getByRole("button", { name: /Show me options|Tell me/ })).toHaveCount(0);

  // Before the key is chosen, it says why it can't be pressed.
  await expect(review).toBeDisabled();
  await expect(review).toHaveAccessibleDescription("Choose the key first.");

  // Home is D; then it waits for a chord.
  const question = page.locator("#key-prompt");
  await question
    .getByRole("group", { name: "Home note" })
    .getByRole("button", { name: "D", exact: true })
    .click();
  await expect(review).toHaveAccessibleDescription(/^Place a chord first/);
  await axe(page);

  // Place V under the held E in bar 4: now it can be pressed.
  await clickNote(page, heldE.id);
  const options = page.locator("#chords button").filter({ hasText: /Melody is/ });
  await options.first().click();
  await page.keyboard.press("Escape");
  await expect(review).toBeEnabled();
  await expect(review).not.toHaveAttribute("aria-describedby");

  await review.click();
  // The conversation shows what was asked, then the review and its tests.
  await expect(tutor.locator(".turn.student").last()).toContainText("Review my chords");
  const reply = tutor.locator(".turn.tutor").last();
  await expect(reply.locator("ol.steps > li")).toHaveCount(3, { timeout: 10_000 });
  await expect(reply).toContainText("Bars 5 to 7 repeat bars 1 to 3");
  expect(asked.map(({ mode, question: q }) => ({ mode, question: q }))).toEqual([
    { mode: "review", question: null },
  ]);
  await expect(reply.locator(".level")).toHaveCount(0);

  // The suggestion cards, each with Hear it and Compare.
  const ideas = page.getByRole("region", { name: "Tutor's ideas to try" }).getByRole("listitem");
  await expect(ideas).toHaveCount(4);
  const first = ideas.first();
  await expect(first.getByRole("button", { name: /^Hear / })).toBeVisible();
  await expect(first.getByRole("button", { name: /^Compare / })).toBeVisible();

  // Hovering the first card (ii under bar 4, beat 3) rings that note.
  const note = page.locator(`#staff [role="button"][data-note-id="${heldE.id}"]`);
  const ringed = page.locator("#staff .is-suggested");
  await expect(ringed).toHaveCount(0);
  await first.hover();
  await expect(note).toHaveClass(/\bis-suggested\b/);
  await expect(ringed).toHaveCount(1);
  await page.locator("#tutor > h2").hover();
  await expect(ringed).toHaveCount(0);

  // Focus does the same, for a keyboard user, and blur clears it.
  await first.getByRole("button", { name: /^Hear / }).focus();
  await expect(note).toHaveClass(/\bis-suggested\b/);
  await page.locator("#tutor-question").focus();
  await expect(ringed).toHaveCount(0);

  await axe(page);
  expect(problems).toEqual([]);
});
