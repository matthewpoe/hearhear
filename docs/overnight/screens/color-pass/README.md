# Color pass: after screenshots

Taken 2026-10-07 from a local production build (`npm run build`, served by FastAPI with the tutor in fixture mode) on the `feature/color-pass` branch. The same Playwright script as the overnight live pass (`../README.md`) drove each state from a fresh page load, with 5-second step timeouts. For comparison, the parent folder holds the earlier live shots of the same states, taken before this pass.

Names follow `<WxH>-<theme>-<n>-<state>.png`.

- `*-1-landing.png`: the landing with beginner tips on.
- `*-2-ode-loaded.png`: Ode to Joy loaded with tips off, and the key question open.

## Checks

The script ran all eight overnight states at 1440x900 and 1280x800 in both themes (32 runs). It also ran the landing and Ode-loaded states at 390x844 in both themes (4 runs). Each run counted console errors (page errors included), CSP violations from a `securitypolicyviolation` listener, and axe violations from `@axe-core/playwright`. All 36 runs came back 0 / 0 / 0. Only the landing and Ode-loaded shots are committed.
