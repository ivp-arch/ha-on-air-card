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

async function withCard(config, states, fn, options) {
  const opened = await openCard(config, states, options);
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

// With hass.entities the card finds On Air sensors by integration, so a sensor without
// contract attributes (integration with no data at all) still gets its row.
test("auto-discovery through the entity registry: platform on_air, not hidden", async () => {
  const states = await loadFixture();
  states["sensor.on_air_rai_4"] = {
    entity_id: "sensor.on_air_rai_4",
    state: "unavailable",
    attributes: { friendly_name: "On Air Rai 4" },
  };
  // Looks like the contract but belongs to another integration.
  states["sensor.lookalike"] = { ...states["sensor.on_air_rai_1"], entity_id: "sensor.lookalike" };
  const registry = {};
  for (const id of Object.keys(states)) registry[id] = { entity_id: id, platform: "on_air", labels: [] };
  registry["sensor.lookalike"].platform = "other";
  registry["sensor.on_air_sky_uno"].hidden = true;
  registry["sensor.on_air_not_in_states"] = { entity_id: "sensor.on_air_not_in_states", platform: "on_air", labels: [] };
  registry["select.on_air_thing"] = { entity_id: "select.on_air_thing", platform: "on_air", labels: [] };
  states["select.on_air_thing"] = { entity_id: "select.on_air_thing", state: "x", attributes: {} };
  const expected = [...ALPHABETICAL.filter((id) => id !== "sensor.on_air_sky_uno"), "sensor.on_air_rai_4"];
  await withCard({}, states, async (page) => {
    const ids = await channelIds(page);
    assert.deepEqual([...ids].sort(), [...expected].sort());
    // Sorted by the displayed name; "On Air Rai 4" (no channel_name) sorts as shown.
    assert.equal(ids.indexOf("sensor.on_air_rai_4"), ids.indexOf("sensor.on_air_italia_1") + 1);
    assert.equal(
      await inCard(page, () =>
        window.__card.shadowRoot.querySelector('li[data-entity="sensor.on_air_rai_4"] .muted')?.textContent.trim()
      ),
      "Non disponibile"
    );
  }, { registry });
});

test("only unavailable sensors: rows instead of the empty message", async () => {
  const states = {
    "sensor.on_air_rai_1": { entity_id: "sensor.on_air_rai_1", state: "unavailable", attributes: { friendly_name: "On Air Rai 1" } },
  };
  const registry = { "sensor.on_air_rai_1": { entity_id: "sensor.on_air_rai_1", platform: "on_air", labels: [] } };
  await withCard({}, states, async (page) => {
    assert.equal(await text(page, ".empty"), null);
    assert.deepEqual(await channelIds(page), ["sensor.on_air_rai_1"]);
  }, { registry });
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
