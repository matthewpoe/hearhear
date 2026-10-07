/**
 * Splits a tutor reply into its prose and the numbered listening steps that
 * close it, so the steps can render as a real list. Only a trailing run of
 * "1. ..." lines counts (blank lines between them are fine); a numbered line
 * followed by more prose stays in the prose. Works on a reply still streaming:
 * a step counts once its number, dot and a space have arrived.
 */

const STEP = /^\s*\d+\.\s+/;

/**
 * @param {string} text
 * @returns {{ prose: string, steps: string[] }}
 */
export function replySteps(text) {
  const lines = text.split("\n");
  let start = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (STEP.test(lines[i])) start = i;
    else if (lines[i].trim() !== "") break;
  }
  if (start === lines.length) return { prose: text, steps: [] };
  const steps = lines
    .slice(start)
    .filter((line) => STEP.test(line))
    .map((line) => line.replace(STEP, "").trim());
  return { prose: lines.slice(0, start).join("\n").trimEnd(), steps };
}
