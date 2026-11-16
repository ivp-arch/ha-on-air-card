import assert from "node:assert/strict";
import test from "node:test";

import { loadFixture, openCard } from "./harness.mjs";

test("registers the element, the card picker entry and the version banner", async () => {
  const { page, logs, close } = await openCard({}, await loadFixture());
  try {
    assert.equal(await page.evaluate(() => Boolean(customElements.get("on-air-card"))), true);
    const entry = await page.evaluate(() => window.customCards.find((c) => c.type === "on-air-card"));
    assert.equal(entry.name, "On Air Card");
    assert.equal(entry.preview, true);
    // The exact version is checked against the tag by the release workflow.
    assert.ok(logs.some((line) => /ON-AIR-CARD.*\d+\.\d+\.\d+/.test(line)), logs.join("\n"));
    assert.ok(!logs.some((line) => line.startsWith("pageerror")), logs.join("\n"));
  } finally {
    await close();
  }
});

test("rejects entities that are not a list of strings", async () => {
  const { page, close } = await openCard({}, {});
  try {
    const message = await page.evaluate(() => {
      try {
        document.createElement("on-air-card").setConfig({ entities: "sensor.on_air_rai_1" });
        return null;
      } catch (err) {
        return err.message;
      }
    });
    assert.ok(message, "setConfig should throw");
  } finally {
    await close();
  }
});

test("stub config is empty: all On Air channels", async () => {
  const { page, close } = await openCard({}, {});
  try {
    assert.deepEqual(await page.evaluate(() => customElements.get("on-air-card").getStubConfig()), {});
  } finally {
    await close();
  }
});

test("loads even when the Lovelace panel is defined after the card script", async () => {
  const { page, logs, close } = await openCard({}, {}, { late: true });
  try {
    assert.equal(await page.evaluate(() => Boolean(customElements.get("on-air-card"))), true);
    assert.ok(!logs.some((line) => line.startsWith("pageerror")), logs.join("\n"));
  } finally {
    await close();
  }
});
