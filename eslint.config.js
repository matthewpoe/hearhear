import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";

export default [
  { ignores: ["dist/", "media/", "node_modules/", ".venv/", "test-results/", "playwright-report/"] },
  js.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Claude's text renders only as text (PRD: prompt injection posture).
      "svelte/no-at-html-tags": "error",
    },
  },
  {
    // The theory core is pure: no DOM, audio, store, or framework imports.
    files: ["src/theory/**/*.js"],
    languageOptions: { globals: { ...globals["shared-node-browser"] } },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/audio/**", "**/store/**", "**/staff/**", "**/*.svelte"], message: "src/theory is pure functions." },
            { group: ["svelte", "svelte/*", "tone", "abcjs"], message: "src/theory is pure functions." },
          ],
        },
      ],
      "no-restricted-globals": ["error", "window", "document", "AudioContext", "localStorage"],
    },
  },
];
