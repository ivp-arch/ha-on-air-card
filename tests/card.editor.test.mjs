import assert from "node:assert/strict";
import test from "node:test";

import { loadFixture, openCard } from "./harness.mjs";

async function withPage(fn, config = {}) {
  const opened = await openCard(config, await loadFixture());
  try {
    await fn(opened.page);
  } finally {
    await opened.close();
  }
}

// Serializable view of getConfigForm(): schema plus labels and helpers per field.
const form = (page) =>
  page.evaluate(() => {
    const f = customElements.get("on-air-card").getConfigForm();
    const fields = f.schema.flatMap((s) => (s.type === "grid" ? s.schema : [s]));
    return {
      schema: f.schema,
      labels: Object.fromEntries(fields.map((s) => [s.name, f.computeLabel(s)])),
      helpers: Object.fromEntries(fields.map((s) => [s.name, f.computeHelper(s) ?? null])),
    };
  });

const assertConfig = (page, config) =>
  page.evaluate((config) => {
    try {
      customElements.get("on-air-card").getConfigForm().assertConfig(config);
      return null;
    } catch (err) {
      return err.message;
    }
  }, config);

test("form fields, selectors and the On Air filter", async () => {
  await withPage(async (page) => {
    const { schema } = await form(page);
    assert.deepEqual(schema[0], { name: "title", selector: { text: {} } });
    assert.deepEqual(schema[1], {
      name: "entities",
      selector: { entity: { multiple: true, filter: { domain: "sensor", integration: "on_air" } } },
    });
    assert.equal(schema[2].type, "grid");
    const [view, category] = schema[2].schema;
    assert.equal(view.name, "view");
    assert.deepEqual(view.selector.select.options, [
      { value: "now", label: "Adesso" },
      { value: "tonight", label: "Stasera" },
    ]);
    assert.deepEqual(category, { name: "show_category", default: true, selector: { boolean: {} } });
  });
});

test("Italian labels and helpers", async () => {
  await withPage(async (page) => {
    const { labels, helpers } = await form(page);
    assert.deepEqual(labels, {
      title: "Titolo",
      entities: "Canali (opzionale)",
      view: "Vista iniziale",
      show_category: "Mostra la categoria",
    });
    assert.equal(helpers.entities, "Lascia vuoto per mostrare tutti i canali di On Air.");
    assert.equal(helpers.view, "Se non scegli nulla si apre su Adesso.");
    assert.equal(helpers.title, "Se lo lasci vuoto: «Guida TV».");
  });
});

test("assertConfig accepts what the form can represent", async () => {
  await withPage(async (page) => {
    assert.equal(await assertConfig(page, {}), null);
    assert.equal(
      await assertConfig(page, {
        title: "TV",
        entities: ["sensor.on_air_rai_1"],
        view: "tonight",
        show_category: false,
      }),
      null
    );
  });
});

test("assertConfig rejects what the form cannot represent", async () => {
  await withPage(async (page) => {
    for (const bad of [
      { entities: "sensor.on_air_rai_1" },
      { view: "later" },
      { show_category: "yes" },
      { title: 42 },
    ]) {
      assert.ok(await assertConfig(page, bad), JSON.stringify(bad));
    }
  });
});

test("an empty title from the editor falls back to the default", async () => {
  await withPage(
    async (page) => {
      const title = await page.evaluate(() => window.__card.shadowRoot.querySelector(".title").textContent.trim());
      assert.equal(title, "Guida TV");
    },
    { title: "" }
  );
});
