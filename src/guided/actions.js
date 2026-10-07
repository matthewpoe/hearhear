/**
 * Small pure helpers for the walkthrough's copy and facts: the `[[action]]`
 * marker each step's line carries, and facts read from the page by selector.
 */

/**
 * A step's text split at its action marker: `[[Press Play]] and hum along`
 * gives the action (shown in the accent color) and the plain text around it.
 * No HTML: each part renders as text.
 * @param {string} text
 * @returns {{ text: string, act: boolean }[]}
 */
export function actionParts(text) {
  return text
    .split(/(\[\[.*?\]\])/)
    .filter((part) => part !== "")
    .map((part) =>
      part.startsWith("[[") && part.endsWith("]]")
        ? { text: part.slice(2, -2), act: true }
        : { text: part, act: false },
    );
}

/**
 * The text with its action markers removed.
 * @param {string} text
 */
export function plainText(text) {
  return actionParts(text)
    .map((part) => part.text)
    .join("");
}

/**
 * The page facts content names (`pageFacts`: fact name to CSS selector),
 * each true while something on the page matches its selector. A new step
 * whose action shows on the page needs only a selector, no code.
 * @param {Record<string, string>} selectors
 * @param {(selector: string) => boolean} present
 * @returns {Record<string, boolean>}
 */
export function pageFacts(selectors, present) {
  return Object.fromEntries(
    Object.entries(selectors).map(([fact, selector]) => [fact, present(selector)]),
  );
}
