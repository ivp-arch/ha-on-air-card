import assert from "node:assert/strict";
import test from "node:test";

import { loadFixture, openCard } from "./harness.mjs";

// Text of each part of the "now" row of one channel.
const nowRow = (page, entityId) =>
  page.evaluate((id) => {
    const row = window.__card.shadowRoot.querySelector(`.now-list [data-entity="${id}"]`);
    if (!row) return null;
    const t = (sel) => row.querySelector(sel)?.textContent.trim() ?? null;
    return {
      channel: t(".channel"),
      title: t(".prog-title"),
      pills: [...row.querySelectorAll(".pill")].map((p) => p.textContent.trim()),
      time: t(".time"),
      next: t(".next"),
      iconHidden: row.querySelector("svg")?.getAttribute("aria-hidden"),
    };
  }, entityId);

async function withCard(config, states, fn) {
  const opened = await openCard(config, states);
  try {
    await fn(opened.page);
  } finally {
    await opened.close();
  }
}

test("a channel on air: name, title, category, time and what comes next", async () => {
  await withCard({}, await loadFixture(), async (page) => {
    assert.deepEqual(await nowRow(page, "sensor.on_air_rai_1"), {
      channel: "Rai 1",
      title: "Belgio - Italia",
      pills: ["Sport"],
      time: "20:30–23:20",
      next: "Poi 23:20 · Tg1",
      iconHidden: "true",
    });
  });
});

test("one list item per channel", async () => {
  await withCard({}, await loadFixture(), async (page) => {
    const counts = await page.evaluate(() => ({
      items: window.__card.shadowRoot.querySelectorAll(".now-list > li").length,
      list: window.__card.shadowRoot.querySelector(".now-list")?.tagName,
    }));
    assert.deepEqual(counts, { items: 13, list: "UL" });
  });
});

test("no next programme: no 'Poi' line", async () => {
  await withCard({}, await loadFixture(), async (page) => {
    const row = await nowRow(page, "sensor.on_air_rete_4");
    assert.equal(row.title, "Fuori dal coro");
    assert.equal(row.time, "21:33–00:57");
    assert.equal(row.next, null);
  });
});

test("show_category false hides the pills", async () => {
  await withCard({ show_category: false }, await loadFixture(), async (page) => {
    assert.deepEqual((await nowRow(page, "sensor.on_air_rai_1")).pills, []);
  });
});

test("a programme without category has no pill", async () => {
  await withCard({}, await loadFixture(), async (page) => {
    assert.deepEqual((await nowRow(page, "sensor.on_air_sky_sport_uno")).pills, []);
  });
});

test("gap in the guide: nothing on air, but the next programme is shown", async () => {
  await withCard({}, await loadFixture(), async (page) => {
    const row = await nowRow(page, "sensor.on_air_gap");
    assert.equal(row.title, "Nessun programma in onda");
    assert.equal(row.time, null);
    assert.equal(row.next, "Poi 21:50 · Film della sera");
  });
});

test("the full title comes from now.title, not from the truncated state", async () => {
  const states = await loadFixture();
  const long = "Titolo lunghissimo ".repeat(16).trim(); // > 255 characters
  states["sensor.on_air_rai_1"].attributes.now.title = long;
  states["sensor.on_air_rai_1"].state = long.slice(0, 255);
  await withCard({}, states, async (page) => {
    assert.equal((await nowRow(page, "sensor.on_air_rai_1")).title, long);
  });
});

test("the now list is not shown in the tonight view", async () => {
  await withCard({ view: "tonight" }, await loadFixture(), async (page) => {
    assert.equal(await page.evaluate(() => window.__card.shadowRoot.querySelector(".now-list")), null);
  });
});
