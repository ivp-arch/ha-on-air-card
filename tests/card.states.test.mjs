import assert from "node:assert/strict";
import test from "node:test";

import { loadFixture, openCard } from "./harness.mjs";

async function withCard(config, states, fn) {
  const opened = await openCard(config, states);
  try {
    await fn(opened.page, opened.logs);
  } finally {
    await opened.close();
  }
}

const row = (page, list, entityId) =>
  page.evaluate(
    ({ list, id }) => {
      const li = window.__card.shadowRoot.querySelector(`.${list} > li[data-entity="${id}"]`);
      if (!li) return null;
      const muted = li.querySelector(".muted");
      let opacity = 1;
      for (let el = muted; el && el !== window.__card; el = el.parentElement ?? el.getRootNode().host) {
        opacity = Math.min(opacity, Number(getComputedStyle(el).opacity));
      }
      return {
        name: li.querySelector(".channel")?.textContent.trim(),
        muted: muted?.textContent.trim() ?? null,
        hasButton: Boolean(li.querySelector("button")),
        next: li.querySelector(".next")?.textContent.trim() ?? null,
        opacity,
      };
    },
    { list, id: entityId }
  );

test("channel without any data: 'now' view", async () => {
  await withCard({}, await loadFixture(), async (page) => {
    assert.deepEqual(await row(page, "now-list", "sensor.on_air_ghost"), {
      name: "Ghost TV",
      muted: "Nessun dato per quest'ora",
      hasButton: false,
      next: null,
      opacity: 1,
    });
  });
});

test("channel without any data: static row in the 'tonight' view", async () => {
  await withCard({ view: "tonight" }, await loadFixture(), async (page) => {
    assert.deepEqual(await row(page, "tonight-list", "sensor.on_air_ghost"), {
      name: "Ghost TV",
      muted: "Nessun dato per stasera",
      hasButton: false,
      next: null,
      opacity: 1,
    });
  });
});

test("a gap is not 'no data': it keeps the next programme", async () => {
  await withCard({}, await loadFixture(), async (page) => {
    const gap = await row(page, "now-list", "sensor.on_air_gap");
    assert.equal(gap.muted, "Nessun programma in onda");
    assert.equal(gap.next, "Poi 21:50 · Film della sera");
  });
});

test("unavailable entity listed in the config: 'Non disponibile' in both views", async () => {
  const states = await loadFixture();
  states["sensor.on_air_rai_4"] = {
    entity_id: "sensor.on_air_rai_4",
    state: "unavailable",
    attributes: { friendly_name: "On Air Rai 4" },
  };
  states["sensor.on_air_rai_5"] = { entity_id: "sensor.on_air_rai_5", state: "unavailable", attributes: {} };
  const entities = ["sensor.on_air_rai_1", "sensor.on_air_rai_4", "sensor.on_air_rai_5"];
  await withCard({ entities }, states, async (page) => {
    const rai4 = await row(page, "now-list", "sensor.on_air_rai_4");
    assert.equal(rai4.name, "On Air Rai 4");
    assert.equal(rai4.muted, "Non disponibile");
    assert.equal((await row(page, "now-list", "sensor.on_air_rai_5")).name, "sensor.on_air_rai_5");
  });
  await withCard({ entities, view: "tonight" }, states, async (page) => {
    const rai4 = await row(page, "tonight-list", "sensor.on_air_rai_4");
    assert.equal(rai4.muted, "Non disponibile");
    assert.equal(rai4.hasButton, false);
  });
});

test("entity missing from hass.states: row omitted, no errors", async () => {
  const entities = ["sensor.on_air_missing", "sensor.on_air_rai_1"];
  await withCard({ entities }, await loadFixture(), async (page, logs) => {
    const ids = await page.evaluate(() =>
      [...window.__card.shadowRoot.querySelectorAll(".now-list > li")].map((li) => li.dataset.entity)
    );
    assert.deepEqual(ids, ["sensor.on_air_rai_1"]);
    assert.ok(!logs.some((l) => l.startsWith("pageerror") || /error/i.test(l)), logs.join("\n"));
  });
});
