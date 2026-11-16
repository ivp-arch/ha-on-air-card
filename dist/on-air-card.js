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

class OnAirCard extends LitElement {
  static get properties() {
    return { hass: {}, _config: {}, _view: {} };
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

  _setView(view) {
    this._view = view;
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
          ? html`<div class="body"></div>`
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
