// On Air card: what is on TV now and tonight, from the On Air integration.
// Presentation only: every value comes from the integration's attributes
// (contract v1, docs/attributes-contract.md in ivp-arch/ha-on-air).
const LitElement =
  customElements.get("ha-panel-lovelace") &&
  Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

const CARD_VERSION = "0.1.0";
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
      title: DEFAULT_TITLE,
      show_category: true,
      ...config,
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

  // Explicit entities in the given order; otherwise (absent or [] from the editor)
  // every sensor exposing the On Air contract, sorted by channel name.
  _channels() {
    const states = this.hass?.states ?? {};
    const manual = Array.isArray(this._config.entities) && this._config.entities.length > 0;
    if (manual) return this._config.entities.map((id) => states[id]).filter(Boolean);
    return Object.values(states)
      .filter(
        (s) =>
          s.entity_id.startsWith("sensor.") &&
          s.attributes?.channel_name !== undefined &&
          s.attributes?.tonight_window !== undefined
      )
      .sort((a, b) => a.attributes.channel_name.localeCompare(b.attributes.channel_name, "it", { sensitivity: "base" }));
  }

  _toggle(entityId) {
    this._open = this._open === entityId ? null : entityId;
  }

  _renderTonight(channels) {
    const span = channels.find((s) => s.attributes.tonight_window)?.attributes.tonight_window;
    return html`
      ${span ? html`<p class="window">STASERA · ${hhmm(span.start)}–${hhmm(span.end)}</p>` : ""}
      <ul class="list tonight-list">${channels.map((s, i) => this._tonightRow(s, i))}</ul>
    `;
  }

  _tonightRow(state, index) {
    const { channel_name: name, now, tonight } = state.attributes;
    const open = this._open === state.entity_id;
    const panelId = `oa-tonight-${index}`;
    return html`
      <li class="block ${open ? "open" : ""}" data-entity=${state.entity_id}>
        <button
          type="button"
          class="row row-button"
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

  _pill(category) {
    return this._config.show_category && category ? html`<span class="pill">${category}</span>` : "";
  }

  _renderNow(channels) {
    return html`<ul class="list now-list">${channels.map((s) => this._nowRow(s))}</ul>`;
  }

  _nowRow(state) {
    const { channel_name: name, now, next } = state.attributes;
    return html`
      <li class="row" data-entity=${state.entity_id}>
        <span class="icon">${TV_ICON}</span>
        <div class="info">
          <span class="channel">${name}</span>
          ${now
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
