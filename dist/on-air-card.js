// On Air card: what is on TV now and tonight, from the On Air integration.
// Presentation only: every value comes from the integration's attributes
// (contract v1, docs/attributes-contract.md in ivp-arch/ha-on-air).
const LitElement =
  customElements.get("ha-panel-lovelace") &&
  Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

const CARD_VERSION = "0.1.0";

class OnAirCard extends LitElement {
  static get properties() {
    return { hass: {}, _config: {} };
  }

  setConfig(config) {
    const entities = config?.entities;
    if (entities !== undefined && !(Array.isArray(entities) && entities.every((e) => typeof e === "string"))) {
      throw new Error("entities deve essere un elenco di entità.");
    }
    this._config = { ...config };
  }

  getCardSize() {
    return 3;
  }

  static getStubConfig() {
    return {};
  }

  render() {
    return html`<ha-card></ha-card>`;
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
