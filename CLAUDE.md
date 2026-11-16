# CLAUDE.md

Guidance for coding agents working in this repository.
Sections 1–4 adapt the Karpathy-inspired guidelines from
[multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills);
the rest is specific to this project.

**Tradeoff:** these rules favour caution over speed. For trivial changes, use judgment.

## 1. Think before coding

- State assumptions explicitly. If a request has more than one reading, say so and ask; don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- Never invent Home Assistant frontend APIs (selectors, `getConfigForm` options, `hass` fields, MDI icons). Check the frontend source first (selector shapes: `src/data/selector.ts`).

## 2. Simplicity first

- Minimum code that solves the request. No speculative features, options or abstractions.
- One file, no build step. `package.json` exists only for the test tooling.
- If it could be half the length, rewrite it.

## 3. Surgical changes

- Touch only what the request needs. Don't reformat or "improve" adjacent code; match the existing style.
- Remove only what your own change made unused. Mention unrelated dead code, don't delete it.
- Every changed line should trace back to the request.

## 4. Goal-driven execution

- Turn the task into checks: write the test in `tests/`, run it and watch it fail, then implement.
- Check both views (Adesso, Stasera), both HA themes (light, dark) and the states without data.
- Report what was verified (tests run, real HA) separately from what was only read. Never say "works" for something not run.

## Project

Lovelace card `custom:on-air-card` for the On Air integration (separate repo `ivp-arch/ha-on-air`): what is on TV now and tonight, one row per channel. Personal use, private repo; Marketplace-compatible structure (`hacs.json`, file in `dist/`).

### Architecture

- Single source file: `dist/on-air-card.js`. `dist/` is the source, there is no build.
- Lit is taken from Home Assistant (`Object.getPrototypeOf(customElements.get("ha-panel-lovelace"))`); no bundled dependencies.
- The card computes nothing: every value comes from the integration's attributes (contract v1: `channel_name`, `now`, `next`, `tonight`, `tonight_window`, `updated_at`). Times are shown by cutting the ISO strings (`HH:MM`), which are already in Home Assistant's time zone; the browser clock is never used. A new value starts as a new attribute in the integration.
- `CARD_VERSION` must match the release tag; it is logged in the browser console.

### Rules

- Accessibility: controls are `<button>`; the view switch uses `aria-pressed`; expandable rows use `aria-expanded`/`aria-controls`; targets ≥ 44 px; visible `:focus-visible`; text contrast ≥ 4.5:1, graphics ≥ 3:1 in HA light and dark themes.
- No channel or brand logos (one generic TV icon, inline SVG); no external fonts or resources.
- Colours only through `--oa-*` CSS variables, which by default point to the HA theme variables.
- "Off" states (no data) use the secondary text colour, never `opacity`.
- UI text is Italian; code comments, README and tests are English.

### Tests

- `npm ci`, `npx playwright install chromium` (once), then `npm test` (Node 20+). Versions are pinned by `package-lock.json`. `tests/harness.mjs` loads the card in Chromium with a minimal Home Assistant stand-in (Lit exposed through `ha-panel-lovelace`, default HA theme variables).
- `tests/fixtures/evening.json` was generated with the integration's own `contract.channel_attributes` on the mockup data (evening of 2026-11-15, now = 21:40). Regenerate it the same way if the contract changes; don't hand-edit it.
- The harness approximates HA; check on a real Home Assistant before a release.

### Commits

Conventional title only, in English (`feat:`, `fix:`, `test:`, `docs:`, `chore:`): no body, no trailers. The maintainer commits and pushes.
