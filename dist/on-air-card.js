// On Air card: what is on TV now and tonight, from the On Air integration.
// Presentation only: every value comes from the integration's attributes
// (contract v1, docs/attributes-contract.md in ivp-arch/ha-on-air).
// Home Assistant may load the resource before the Lovelace panel is defined (e.g. a
// page opened outside a dashboard): wait for it. Needs the resource as a JavaScript module.
await customElements.whenDefined("ha-panel-lovelace");
const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

const CARD_VERSION = "0.1.1";
const VIEWS = ["now", "tonight"];
const DEFAULT_TITLE = "Guida TV";

// "2026-11-15T21:15:00+01:00" -> "21:15". Contract times are already in HA's time zone.
const hhmm = (iso) => (typeof iso === "string" ? iso.slice(11, 16) : "");

// Generic TV glyph (no channel logos), same drawing as the approved mockup.
const TV_ICON = html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="12" rx="2"></rect><polyline points="8 3 12 7 16 3"></polyline></svg>`;
const CHEVRON = html`<svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

class OnAirCard extends LitElement {
  static get properties() {
    return { hass: {}, _config: {}, _view: {}, _open: {} };
  }

  setConfig(config) {
    const entities = config?.entities;
    if (entities !== undefined && !(Array.isArray(entities) && entities.every((e) => typeof e === "string"))) {
      throw new Error("entities deve essere un elenco di entità.");
    }
    this._config = {
      show_category: true,
      ...config,
      // The visual editor writes "" when the field is cleared: that means "default".
      title: config?.title || DEFAULT_TITLE,
      view: VIEWS.includes(config?.view) ? config.view : "now",
    };
    this._view = this._config.view;
  }

  getCardSize() {
    return 3;
  }

  static getStubConfig() {
    return {};
  }

  // Visual editor: Home Assistant renders this schema with its own controls
  // (static getConfigForm). Labels are Italian like the rest of the card.
  static getConfigForm() {
    const labels = {
      title: "Titolo",
      entities: "Canali (opzionale)",
      view: "Vista iniziale",
      show_category: "Mostra la categoria",
    };
    const helpers = {
      title: "Se lo lasci vuoto: «Guida TV».",
      entities: "Lascia vuoto per mostrare tutti i canali di On Air.",
      // A select does not display its schema default: say it.
      view: "Se non scegli nulla si apre su Adesso.",
    };
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "entities", selector: { entity: { multiple: true, filter: { domain: "sensor", integration: "on_air" } } } },
        {
          type: "grid",
          name: "",
          schema: [
            {
              name: "view",
              selector: {
                select: {
                  mode: "dropdown",
                  options: [
                    { value: "now", label: "Adesso" },
                    { value: "tonight", label: "Stasera" },
                  ],
                },
              },
            },
            { name: "show_category", default: true, selector: { boolean: {} } },
          ],
        },
      ],
      computeLabel: (schema) => labels[schema.name],
      computeHelper: (schema) => helpers[schema.name],
      // Throwing switches the editor to YAML (config the form cannot represent).
      assertConfig: (config) => {
        const { entities, view, show_category: showCategory, title } = config;
        if (entities !== undefined && !(Array.isArray(entities) && entities.every((e) => typeof e === "string"))) {
          throw new Error("entities deve essere un elenco di entità.");
        }
        if (view !== undefined && !VIEWS.includes(view)) throw new Error("view deve essere now o tonight.");
        if (showCategory !== undefined && typeof showCategory !== "boolean") {
          throw new Error("show_category deve essere vero o falso.");
        }
        if (title !== undefined && typeof title !== "string") throw new Error("title deve essere un testo.");
      },
    };
  }

  // Explicit entities in the given order; otherwise (absent or [] from the editor)
  // every On Air sensor, sorted by the displayed name. With the entity registry
  // (hass.entities) sensors are found by integration, so an unavailable one without
  // contract attributes still gets its row; hidden ones are left out. Without it,
  // by the contract attributes.
  _channels() {
    const states = this.hass?.states ?? {};
    const manual = Array.isArray(this._config.entities) && this._config.entities.length > 0;
    if (manual) return this._config.entities.map((id) => states[id]).filter(Boolean);
    const registry = this.hass?.entities;
    const found = registry
      ? Object.values(registry)
          .filter((e) => e.platform === "on_air" && !e.hidden && e.entity_id.startsWith("sensor."))
          .map((e) => states[e.entity_id])
          .filter(Boolean)
      : Object.values(states).filter(
          (s) =>
            s.entity_id.startsWith("sensor.") &&
            s.attributes?.channel_name !== undefined &&
            s.attributes?.tonight_window !== undefined
        );
    return found.sort((a, b) => this._name(a).localeCompare(this._name(b), "it", { sensitivity: "base" }));
  }

  _toggle(entityId) {
    this._open = this._open === entityId ? null : entityId;
  }

  _renderTonight(channels) {
    const span = channels.find((s) => s.attributes?.tonight_window)?.attributes.tonight_window;
    return html`
      ${span ? html`<p class="window">STASERA · ${hhmm(span.start)}–${hhmm(span.end)}</p>` : ""}
      <ul class="list tonight-list">${channels.map((s, i) => this._tonightRow(s, i))}</ul>
    `;
  }

  _tonightRow(state, index) {
    const kind = this._kind(state);
    if (kind !== "ok") {
      const missing = kind === "unavailable" ? "Non disponibile" : "Nessun dato per stasera";
      return html`
        <li class="block static off" data-entity=${state.entity_id}>
          <div class="row-static">
            <span class="icon">${TV_ICON}</span>
            <span class="info">
              <span class="channel">${this._name(state)}</span>
              <span class="summary muted">${missing}</span>
            </span>
          </div>
        </li>
      `;
    }
    const { channel_name: name, now, tonight } = state.attributes;
    const open = this._open === state.entity_id;
    const panelId = `oa-tonight-${index}`;
    return html`
      <li class="block ${open ? "open" : ""}" data-entity=${state.entity_id}>
        <button
          type="button"
          class="row-button"
          aria-expanded=${open ? "true" : "false"}
          aria-controls=${panelId}
          @click=${() => this._toggle(state.entity_id)}
        >
          <span class="icon">${TV_ICON}</span>
          <span class="info">
            <span class="channel">${name}</span>
            <span class="summary">${now
              ? `In onda: ${now.title} · ${hhmm(now.start)}–${hhmm(now.end)}`
              : "Nessun programma in onda"}</span>
          </span>
          ${CHEVRON}
        </button>
        <ul class="programmes" id=${panelId} ?hidden=${!open}>
          ${(tonight ?? []).map((p) => this._programme(p, now))}
        </ul>
      </li>
    `;
  }

  // The programme on air is the one equal to `now` (a comparison, not a computation).
  _programme(programme, now) {
    const live = Boolean(now) && programme.start === now.start && programme.title === now.title;
    return html`
      <li class="programme ${live ? "live" : ""}">
        <span class="p-time">${hhmm(programme.start)}</span>
        <span class="p-title">${programme.title}</span>
        ${live ? html`<span class="pill live-pill">In onda</span>` : ""}
        ${this._config.show_category && programme.category ? html`<span class="p-cat">${programme.category}</span>` : ""}
      </li>
    `;
  }

  _setView(view) {
    this._view = view;
  }

  // "unavailable": no contract attributes (e.g. the integration has no data at all);
  // "empty": contract present but nothing now, next or tonight; otherwise "ok".
  _kind(state) {
    const a = state.attributes ?? {};
    if (a.channel_name === undefined) return "unavailable";
    if (!a.now && !a.next && !(a.tonight?.length > 0)) return "empty";
    return "ok";
  }

  _name(state) {
    return state.attributes?.channel_name ?? state.attributes?.friendly_name ?? state.entity_id;
  }

  _pill(category) {
    return this._config.show_category && category ? html`<span class="pill">${category}</span>` : "";
  }

  _renderNow(channels) {
    return html`<ul class="list now-list">${channels.map((s) => this._nowRow(s))}</ul>`;
  }

  _nowRow(state) {
    const kind = this._kind(state);
    const { now, next } = kind === "ok" ? state.attributes : {};
    const missing = { unavailable: "Non disponibile", empty: "Nessun dato per quest'ora" }[kind];
    return html`
      <li class="row ${kind === "ok" ? "" : "off"}" data-entity=${state.entity_id}>
        <span class="icon">${TV_ICON}</span>
        <div class="info">
          <span class="channel">${this._name(state)}</span>
          ${missing
            ? html`<span class="headline"><span class="prog-title muted">${missing}</span></span>`
            : now
            ? html`<span class="headline"><span class="prog-title">${now.title}</span>${this._pill(now.category)}</span>
                <span class="time">${hhmm(now.start)}–${hhmm(now.end)}</span>`
            : html`<span class="headline"><span class="prog-title muted">Nessun programma in onda</span></span>`}
          ${next ? html`<span class="next">Poi ${hhmm(next.start)} · ${next.title}</span>` : ""}
        </div>
      </li>
    `;
  }

  render() {
    const channels = this._channels();
    const updated = channels.find((s) => s.attributes?.updated_at)?.attributes.updated_at;
    return html`
      <ha-card>
        <div class="header">
          <h2 class="title">${this._config.title}</h2>
          ${updated ? html`<span class="updated">Aggiornata alle ${hhmm(updated)}</span>` : ""}
        </div>
        <div class="switch">
          <button type="button" aria-pressed=${this._view === "now" ? "true" : "false"} @click=${() => this._setView("now")}>Adesso</button>
          <button type="button" aria-pressed=${this._view === "tonight" ? "true" : "false"} @click=${() => this._setView("tonight")}>Stasera</button>
        </div>
        ${channels.length
          ? this._view === "now"
            ? this._renderNow(channels)
            : this._renderTonight(channels)
          : html`<p class="empty">Nessun canale di On Air. Aggiungi l'integrazione o scegli le entità.</p>`}
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      /* Public tokens: --oa-*. By default they follow the Home Assistant theme and can be
         overridden from a theme or card-mod. The --_* values are derived, not public. */
      :host {
        --oa-bg: var(--ha-card-background, var(--card-background-color, #ffffff));
        --oa-text: var(--primary-text-color, #212121);
        --oa-muted: var(--secondary-text-color, #727272);
        --oa-divider: var(--divider-color, #e0e0e0);
        --oa-accent: var(--primary-color, #03a9f4);
        /* Text-safe variants: theme colours alone can be too light on tinted surfaces. */
        --_muted: color-mix(in srgb, var(--oa-muted) 80%, var(--oa-text));
        --_accent: color-mix(in srgb, var(--oa-accent) 50%, var(--oa-text));
        --_surface: color-mix(in srgb, var(--oa-text) 5%, var(--oa-bg));
        --_tint: color-mix(in srgb, var(--oa-accent) 16%, transparent);
        --_neutral: color-mix(in srgb, var(--oa-text) 8%, transparent);
        --_shadow: color-mix(in srgb, var(--oa-text) 22%, transparent);
        display: block;
      }
      ha-card {
        color: var(--oa-text);
        overflow: hidden;
      }
      button {
        font: inherit;
        color: inherit;
      }
      button:focus-visible {
        outline: 2px solid var(--_accent);
        outline-offset: 2px;
      }
      .header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 4px 12px;
        padding: 16px 16px 12px;
      }
      .title {
        margin: 0;
        font-size: 22px;
        font-weight: 400;
        line-height: 1.2;
      }
      .updated,
      .muted,
      .channel,
      .next,
      .summary,
      .window,
      .empty,
      .p-time,
      .p-cat,
      .chevron {
        color: var(--_muted);
      }
      .updated {
        font-size: 13px;
      }
      .switch {
        display: flex;
        gap: 4px;
        margin: 0 16px 12px;
        padding: 4px;
        border-radius: 26px;
        background: var(--_surface);
      }
      .switch button {
        flex: 1;
        min-height: 44px;
        border: 0;
        border-radius: 22px;
        background: transparent;
        color: var(--_muted);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      .switch button[aria-pressed="true"] {
        background: var(--oa-bg);
        color: var(--oa-text);
        box-shadow: 0 1px 2px var(--_shadow);
      }
      .list,
      .programmes {
        list-style: none;
        margin: 0;
      }
      .list {
        padding: 0 8px 8px;
      }
      .list > li {
        border-top: 1px solid var(--oa-divider);
      }
      .row,
      .row-static {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        min-height: 72px;
        box-sizing: border-box;
        padding: 12px 8px;
      }
      .row-static {
        align-items: center;
        min-height: 64px;
      }
      .icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        flex: none;
        border-radius: 10px;
        background: var(--_tint);
        color: var(--_accent);
      }
      .off .icon {
        background: var(--_neutral);
        color: var(--_muted);
      }
      .info {
        display: flex;
        flex-direction: column;
        gap: 3px;
        flex: 1;
        min-width: 0;
      }
      .channel {
        font-size: 12px;
        font-weight: 500;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .tonight-list .channel {
        font-size: 15px;
        letter-spacing: 0;
        text-transform: none;
        color: var(--oa-text);
      }
      .tonight-list .off .channel {
        color: var(--_muted);
      }
      .headline {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px 8px;
      }
      .prog-title {
        font-size: 16px;
        font-weight: 500;
      }
      .prog-title.muted {
        font-weight: 400;
      }
      .prog-title,
      .next,
      .summary,
      .p-title {
        overflow-wrap: anywhere;
      }
      .time,
      .next,
      .summary {
        font-size: 13px;
      }
      .pill {
        flex: none;
        padding: 2px 8px;
        border-radius: 99px;
        background: var(--_neutral);
        color: var(--_muted);
        font-size: 12px;
        font-weight: 500;
      }
      .live-pill {
        background: var(--_tint);
        color: var(--_accent);
      }
      .window {
        margin: 0;
        padding: 0 16px 10px;
        font-size: 11px;
        letter-spacing: 0.06em;
      }
      .block {
        padding: 4px 0;
      }
      .block.open .row-button,
      .block.open .programmes {
        background: var(--_surface);
      }
      .row-button {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        min-height: 64px;
        box-sizing: border-box;
        padding: 10px 8px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        text-align: left;
        cursor: pointer;
      }
      .block.open .row-button {
        border-radius: 10px 10px 0 0;
      }
      .chevron {
        flex: none;
        transition: transform 0.2s ease;
      }
      .block.open .chevron {
        transform: rotate(180deg);
      }
      .programmes {
        padding: 0 8px 10px;
        border-radius: 0 0 10px 10px;
      }
      .programmes[hidden] {
        display: none;
      }
      .programme {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 4px 12px;
        padding: 6px 0 6px 52px;
        font-size: 14px;
      }
      .p-time {
        width: 44px;
        flex: none;
        font-variant-numeric: tabular-nums;
      }
      .p-title {
        flex: 1;
        min-width: 0;
      }
      .live .p-time {
        color: var(--_accent);
      }
      .live .p-title {
        font-weight: 500;
      }
      .p-cat {
        flex: none;
        font-size: 12px;
      }
      .empty {
        margin: 0;
        padding: 0 16px 16px;
      }
      @media (prefers-reduced-motion: reduce) {
        .chevron {
          transition: none;
        }
      }
    `;
  }
}

customElements.define("on-air-card", OnAirCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "on-air-card",
  name: "On Air Card",
  description: "Cosa c'è in TV adesso e stasera sui canali di On Air.",
  preview: true,
  documentationURL: "https://github.com/ivp-arch/ha-on-air-card",
});

console.info(`%c ON-AIR-CARD %c ${CARD_VERSION} `, "background:#12658a;color:#fff", "");
