// Test harness: loads dist/on-air-card.js in Chromium with a minimal Home Assistant stand-in.
// Like Home Assistant, it exposes Lit through the "ha-panel-lovelace" element and sets
// LitElement.prototype.html/css, which the card relies on.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://harness.local";

// Approximation of Home Assistant's default theme (same values as the approved mockup).
// The real themes are checked on Home Assistant before a release.
export const THEMES = {
  light: {
    "--primary-background-color": "#fafafa",
    "--card-background-color": "#ffffff",
    "--secondary-background-color": "#e5e5e5",
    "--primary-text-color": "#212121",
    "--secondary-text-color": "#727272",
    "--divider-color": "rgba(0, 0, 0, 0.12)",
    "--primary-color": "#03a9f4",
  },
  dark: {
    "--primary-background-color": "#111111",
    "--card-background-color": "#1c1c1c",
    "--secondary-background-color": "#282828",
    "--primary-text-color": "#e1e1e1",
    "--secondary-text-color": "#9b9b9b",
    "--divider-color": "rgba(225, 225, 225, 0.12)",
    "--primary-color": "#03a9f4",
  },
};

const IMPORT_MAP = {
  imports: {
    lit: "/node_modules/lit/index.js",
    "lit/": "/node_modules/lit/",
    "lit-html": "/node_modules/lit-html/lit-html.js",
    "lit-html/": "/node_modules/lit-html/",
    "lit-element/": "/node_modules/lit-element/",
    "@lit/reactive-element": "/node_modules/@lit/reactive-element/reactive-element.js",
    "@lit/reactive-element/": "/node_modules/@lit/reactive-element/",
  },
};

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8">
<script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>
<style>body{margin:0;padding:16px;background:var(--primary-background-color);font-family:Roboto,"Noto Sans",system-ui,sans-serif}</style>
</head><body><div id="root"></div>
<script type="module">
  import { LitElement, html, css } from "lit";
  LitElement.prototype.html = html;
  LitElement.prototype.css = css;
  customElements.define("ha-panel-lovelace", class extends LitElement {});
  customElements.define("ha-card", class extends HTMLElement {
    connectedCallback() {
      Object.assign(this.style, {
        display: "block",
        background: "var(--ha-card-background, var(--card-background-color))",
        borderRadius: "12px",
        border: "1px solid var(--divider-color)",
        overflow: "hidden",
      });
    }
  });
  const script = document.createElement("script");
  script.src = "/dist/on-air-card.js";
  script.onload = () => { window.__harnessReady = true; };
  script.onerror = () => { window.__harnessReady = "error"; };
  document.head.append(script);
</script></body></html>`;

const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json" };

export async function loadFixture(name = "evening") {
  const data = JSON.parse(await readFile(path.join(ROOT, "tests", "fixtures", `${name}.json`), "utf8"));
  delete data._source;
  return data;
}

/** Open a page with one <on-air-card>. Returns { page, card, logs, close }. */
export async function openCard(config, states, { theme = "light", width = 480 } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: width + 32, height: 1000 } });
  const logs = [];
  page.on("console", (msg) => logs.push(msg.text()));
  page.on("pageerror", (err) => logs.push(`pageerror: ${err.message}`));
  await page.route(`${ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/") return route.fulfill({ contentType: "text/html", body: PAGE });
    try {
      const body = await readFile(path.join(ROOT, decodeURIComponent(pathname)));
      return route.fulfill({ body, contentType: TYPES[path.extname(pathname)] ?? "application/octet-stream" });
    } catch {
      return route.fulfill({ status: 404, body: "" });
    }
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.__harnessReady !== undefined);
  if ((await page.evaluate(() => window.__harnessReady)) !== true) {
    await browser.close();
    throw new Error(`Card script failed to load: ${logs.join(" | ")}`);
  }
  await page.evaluate(
    async ({ config, states, theme, vars, width }) => {
      for (const [name, value] of Object.entries(vars)) document.documentElement.style.setProperty(name, value);
      const card = document.createElement("on-air-card");
      card.style.display = "block";
      card.style.width = `${width}px`;
      card.setConfig(config);
      card.hass = { states, themes: { darkMode: theme === "dark" } };
      document.getElementById("root").append(card);
      window.__card = card;
      await card.updateComplete;
    },
    { config, states, theme, vars: THEMES[theme], width }
  );
  const card = await page.evaluateHandle(() => window.__card);
  return { page, card, logs, close: () => browser.close() };
}

/** Replace hass.states on the open card and wait for the render. */
export async function setHass(page, states) {
  await page.evaluate(async (states) => {
    window.__card.hass = { ...window.__card.hass, states };
    await window.__card.updateComplete;
  }, states);
}

/**
 * WCAG contrast of every visible text and of the channel icons, measured on computed styles.
 * Colours go through a 1x1 canvas, so any CSS colour syntax (including color-mix results)
 * is read; semi-transparent backgrounds are composited up to the page.
 * Returns [{ kind: "text" | "graphic", text, cls, ratio }].
 */
export async function contrastReport(page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const rgba = (css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const parentOf = (el) => el.parentElement ?? (el.getRootNode() instanceof ShadowRoot ? el.getRootNode().host : null);
    const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
    const backgroundOf = (el) => {
      const layers = [];
      for (let e = el; e; e = parentOf(e)) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c[3] > 0) layers.push(c);
      }
      return layers.reverse().reduce((base, layer) => over(layer, base), [255, 255, 255, 1]);
    };
    const luminance = ([r, g, b]) => {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const out = [];
    for (const el of window.__card.shadowRoot.querySelectorAll("*")) {
      if (el.closest("[hidden]")) continue;
      const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      const isIcon = el.tagName.toLowerCase() === "svg" && el.closest(".icon");
      if (!hasText && !isIcon) continue;
      const bg = backgroundOf(el);
      const fg = over(rgba(getComputedStyle(el).color), bg);
      out.push({
        kind: isIcon ? "graphic" : "text",
        text: isIcon ? "icon" : el.textContent.trim().slice(0, 40),
        cls: String(el.getAttribute("class") ?? el.tagName),
        ratio: Math.round(ratio(fg, bg) * 100) / 100,
      });
    }
    return out;
  });
}
