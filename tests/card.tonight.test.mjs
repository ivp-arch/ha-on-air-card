import assert from "node:assert/strict";
import test from "node:test";

import { loadFixture, openCard, setHass } from "./harness.mjs";

async function withCard(config, states, fn) {
  const opened = await openCard({ view: "tonight", ...config }, states);
  try {
    await fn(opened.page);
  } finally {
    await opened.close();
  }
}

// State of every channel block in the tonight list.
const blocks = (page) =>
  page.evaluate(() =>
    [...window.__card.shadowRoot.querySelectorAll(".tonight-list > li")].map((li) => {
      const button = li.querySelector("button");
      const panel = button && li.querySelector(`#${button.getAttribute("aria-controls")}`);
      return {
        entity: li.dataset.entity,
        expanded: button?.getAttribute("aria-expanded") ?? null,
        panelHidden: panel ? panel.hidden : null,
        name: li.querySelector(".channel")?.textContent.trim(),
        summary: li.querySelector(".summary")?.textContent.trim(),
      };
    })
  );

const programmes = (page, entityId) =>
  page.evaluate((id) => {
    const li = window.__card.shadowRoot.querySelector(`.tonight-list > li[data-entity="${id}"]`);
    return [...li.querySelectorAll(".programmes > li")].map((p) => ({
      time: p.querySelector(".p-time")?.textContent.trim(),
      title: p.querySelector(".p-title")?.textContent.trim(),
      category: p.querySelector(".p-cat")?.textContent.trim() ?? null,
      live: p.querySelector(".live-pill")?.textContent.trim() ?? null,
    }));
  }, entityId);

const click = (page, entityId) =>
  page.evaluate(async (id) => {
    window.__card.shadowRoot.querySelector(`.tonight-list > li[data-entity="${id}"] button`).click();
    await window.__card.updateComplete;
  }, entityId);

const expanded = async (page) => (await blocks(page)).filter((b) => b.expanded === "true").map((b) => b.entity);

test("window heading from tonight_window", async () => {
  await withCard({}, await loadFixture(), async (page) => {
    const heading = await page.evaluate(() => window.__card.shadowRoot.querySelector(".window")?.textContent.trim());
    assert.equal(heading, "STASERA · 20:00–00:00");
  });
});

test("closed rows: what is on air now; every panel exists and is hidden", async () => {
  await withCard({}, await loadFixture(), async (page) => {
    const all = await blocks(page);
    const rai1 = all.find((b) => b.entity === "sensor.on_air_rai_1");
    assert.deepEqual(rai1, {
      entity: "sensor.on_air_rai_1",
      expanded: "false",
      panelHidden: true,
      name: "Rai 1",
      summary: "In onda: Belgio - Italia · 20:30–23:20",
    });
    assert.equal(all.find((b) => b.entity === "sensor.on_air_gap").summary, "Nessun programma in onda");
    assert.deepEqual(await expanded(page), []);
  });
});

test("opening a channel lists tonight with the live programme marked", async () => {
  await withCard({}, await loadFixture(), async (page) => {
    await click(page, "sensor.on_air_rai_1");
    const rai1 = (await blocks(page)).find((b) => b.entity === "sensor.on_air_rai_1");
    assert.equal(rai1.expanded, "true");
    assert.equal(rai1.panelHidden, false);
    assert.deepEqual(await programmes(page, "sensor.on_air_rai_1"), [
      { time: "20:00", title: "Tg1", category: "Notizie", live: null },
      { time: "20:30", title: "Belgio - Italia", category: "Sport", live: "In onda" },
      { time: "23:20", title: "Tg1", category: "Notizie", live: null },
    ]);
  });
});

test("a programme that started before the window is listed", async () => {
  await withCard({}, await loadFixture(), async (page) => {
    await click(page, "sensor.on_air_sky_cinema_uno");
    const list = await programmes(page, "sensor.on_air_sky_cinema_uno");
    assert.equal(list[0].time, "19:10");
    assert.equal(list[0].title, "I tre moschettieri - D'Artagnan");
  });
});

test("one channel open at a time; a second click closes it", async () => {
  await withCard({}, await loadFixture(), async (page) => {
    await click(page, "sensor.on_air_rai_1");
    await click(page, "sensor.on_air_sky_atlantic");
    assert.deepEqual(await expanded(page), ["sensor.on_air_sky_atlantic"]);
    await click(page, "sensor.on_air_sky_atlantic");
    assert.deepEqual(await expanded(page), []);
  });
});

test("show_category false hides categories in the list", async () => {
  await withCard({ show_category: false }, await loadFixture(), async (page) => {
    await click(page, "sensor.on_air_rai_1");
    assert.ok((await programmes(page, "sensor.on_air_rai_1")).every((p) => p.category === null));
  });
});

test("a hass update keeps the open channel and the focus", async () => {
  const states = await loadFixture();
  await withCard({}, states, async (page) => {
    await click(page, "sensor.on_air_rai_1");
    await page.evaluate(() =>
      window.__card.shadowRoot.querySelector('.tonight-list > li[data-entity="sensor.on_air_rai_1"] button').focus()
    );
    await setHass(page, structuredClone(states));
    assert.deepEqual(await expanded(page), ["sensor.on_air_rai_1"]);
    const focused = await page.evaluate(
      () => window.__card.shadowRoot.activeElement?.closest("li[data-entity]")?.dataset.entity
    );
    assert.equal(focused, "sensor.on_air_rai_1");
  });
});

test("Tab reaches the switch and then every channel in visual order", async () => {
  const entities = ["sensor.on_air_rai_1", "sensor.on_air_rai_2", "sensor.on_air_sky_atlantic"];
  await withCard({ entities }, await loadFixture(), async (page) => {
    const stops = [];
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press("Tab");
      stops.push(
        await page.evaluate(() => {
          const el = window.__card.shadowRoot.activeElement;
          return el?.closest("li[data-entity]")?.dataset.entity ?? el?.textContent.trim();
        })
      );
    }
    assert.deepEqual(stops, ["Adesso", "Stasera", ...entities]);
  });
});
