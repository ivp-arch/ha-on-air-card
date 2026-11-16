import assert from "node:assert/strict";
import test from "node:test";

import { loadFixture, openCard } from "./harness.mjs";

const ALPHABETICAL = [
  "sensor.on_air_canale_5",
  "sensor.on_air_gap",
  "sensor.on_air_ghost",
  "sensor.on_air_italia_1",
  "sensor.on_air_rai_1",
  "sensor.on_air_rai_2",
  "sensor.on_air_rai_3",
  "sensor.on_air_rete_4",
  "sensor.on_air_sky_atlantic",
  "sensor.on_air_sky_cinema_uno",
  "sensor.on_air_sky_serie",
  "sensor.on_air_sky_sport_uno",
  "sensor.on_air_sky_uno",
];

const inCard = (page, fn, arg) => page.evaluate(fn, arg);
const text = (page, selector) =>
  inCard(page, (sel) => window.__card.shadowRoot.querySelector(sel)?.textContent.trim() ?? null, selector);
const switchState = (page) =>
  inCard(page, () =>
    [...window.__card.shadowRoot.querySelectorAll(".switch button")].map((b) => [
      b.textContent.trim(),
      b.getAttribute("aria-pressed"),
    ])
  );
const channelIds = (page) => inCard(page, () => window.__card._channels().map((s) => s.entity_id));

async function withCard(config, states, fn) {
  const opened = await openCard(config, states);
  try {
    await fn(opened.page);
  } finally {
    await opened.close();
  }
}

test("default and custom title, last update from the first channel", async () => {
  const states = await loadFixture();
  await withCard({}, states, async (page) => {
    assert.equal(await text(page, ".title"), "Guida TV");
    assert.equal(await text(page, ".updated"), "Aggiornata alle 12:05");
  });
  await withCard({ title: "Stasera in TV" }, states, async (page) => {
    assert.equal(await text(page, ".title"), "Stasera in TV");
  });
});

test("no updated_at: no last-update line", async () => {
  const states = await loadFixture();
  for (const s of Object.values(states)) s.attributes.updated_at = null;
  await withCard({}, states, async (page) => {
    assert.equal(await text(page, ".updated"), null);
  });
});

test("view switch: two buttons with aria-pressed, clickable", async () => {
  const states = await loadFixture();
  await withCard({}, states, async (page) => {
    assert.deepEqual(await switchState(page), [["Adesso", "true"], ["Stasera", "false"]]);
    await inCard(page, async () => {
      window.__card.shadowRoot.querySelectorAll(".switch button")[1].click();
      await window.__card.updateComplete;
    });
    assert.deepEqual(await switchState(page), [["Adesso", "false"], ["Stasera", "true"]]);
    const tags = await inCard(page, () =>
      [...window.__card.shadowRoot.querySelectorAll(".switch button")].map((b) => b.tagName)
    );
    assert.deepEqual(tags, ["BUTTON", "BUTTON"]);
  });
  await withCard({ view: "tonight" }, states, async (page) => {
    assert.deepEqual(await switchState(page), [["Adesso", "false"], ["Stasera", "true"]]);
  });
  await withCard({ view: "later" }, states, async (page) => {
    assert.deepEqual(await switchState(page), [["Adesso", "true"], ["Stasera", "false"]]);
  });
});

test("auto-discovery: no entities or an empty list give every On Air channel by name", async () => {
  const states = await loadFixture();
  states["sensor.other"] = { entity_id: "sensor.other", state: "1", attributes: { friendly_name: "Other" } };
  await withCard({}, states, async (page) => {
    assert.deepEqual(await channelIds(page), ALPHABETICAL);
  });
  await withCard({ entities: [] }, states, async (page) => {
    assert.deepEqual(await channelIds(page), ALPHABETICAL);
  });
});

test("explicit entities keep their order and skip missing ones", async () => {
  const states = await loadFixture();
  const entities = ["sensor.on_air_sky_uno", "sensor.on_air_missing", "sensor.on_air_rai_1"];
  await withCard({ entities }, states, async (page) => {
    assert.deepEqual(await channelIds(page), ["sensor.on_air_sky_uno", "sensor.on_air_rai_1"]);
  });
});

test("no channels: explanatory message", async () => {
  await withCard({}, {}, async (page) => {
    assert.equal(await text(page, ".empty"), "Nessun canale di On Air. Aggiungi l'integrazione o scegli le entità.");
  });
});
