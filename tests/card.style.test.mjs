import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { contrastReport, loadFixture, openCard } from "./harness.mjs";

const openRai1 = (page) =>
  page.evaluate(async () => {
    window.__card.shadowRoot.querySelector('.tonight-list > li[data-entity="sensor.on_air_rai_1"] button').click();
    await window.__card.updateComplete;
  });

for (const theme of ["light", "dark"]) {
  for (const view of ["now", "tonight"]) {
    test(`contrast in the ${theme} theme, ${view} view`, async () => {
      const { page, close } = await openCard({ view }, await loadFixture(), { theme });
      try {
        if (view === "tonight") await openRai1(page);
        const report = await contrastReport(page);
        assert.ok(report.length > 20, `too few elements measured: ${report.length}`);
        const failing = report.filter((r) => r.ratio < (r.kind === "text" ? 4.5 : 3));
        assert.deepEqual(failing, []);
        assert.ok(report.some((r) => r.text === "Nessun dato per quest'ora" || r.text === "Nessun dato per stasera"));
      } finally {
        await close();
      }
    });
  }
}

test("touch targets are at least 44 px tall", async () => {
  const { page, close } = await openCard({ view: "tonight" }, await loadFixture());
  try {
    const heights = await page.evaluate(() =>
      [...window.__card.shadowRoot.querySelectorAll("button")].map((b) => b.getBoundingClientRect().height)
    );
    assert.ok(heights.length > 2);
    assert.ok(heights.every((h) => h >= 44), JSON.stringify(heights));
  } finally {
    await close();
  }
});

test("keyboard focus is visible", async () => {
  const { page, close } = await openCard({}, await loadFixture());
  try {
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(window.__card.shadowRoot.activeElement);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    assert.notEqual(outline.style, "none");
    assert.ok(outline.width >= 2);
  } finally {
    await close();
  }
});

test("long titles wrap inside a 320 px card", async () => {
  const states = await loadFixture();
  const long = `${"Titolo lunghissimo ".repeat(16)}${"Senzaspazi".repeat(8)}`;
  for (const id of ["sensor.on_air_rai_1", "sensor.on_air_sky_serie"]) {
    const a = states[id].attributes;
    a.now.title = long;
    a.tonight = a.tonight.map((p) => (p.start === a.now.start ? { ...p, title: long } : p));
  }
  for (const view of ["now", "tonight"]) {
    const { page, close } = await openCard({ view }, states, { width: 320 });
    try {
      if (view === "tonight") await openRai1(page);
      const overflow = await page.evaluate(() => {
        const card = window.__card.shadowRoot.querySelector("ha-card");
        const right = card.getBoundingClientRect().right + 0.5;
        const wide = [...window.__card.shadowRoot.querySelectorAll("*")].filter(
          (el) => !el.closest("[hidden]") && el.getBoundingClientRect().right > right
        );
        return { scroll: card.scrollWidth - card.clientWidth, wide: wide.map((el) => el.className || el.tagName) };
      });
      assert.deepEqual(overflow, { scroll: 0, wide: [] }, view);
    } finally {
      await close();
    }
  }
});

test("colours only through --oa-* variables (hex values only as their defaults)", async () => {
  const source = await readFile(new URL("../dist/on-air-card.js", import.meta.url), "utf8");
  const offenders = source
    .split("\n")
    .filter((line) => /#[0-9a-fA-F]{3,8}\b/.test(line))
    .filter((line) => !/--oa-[a-z-]+:\s*var\(/.test(line) && !line.includes("console.info"));
  assert.deepEqual(offenders, []);
});
