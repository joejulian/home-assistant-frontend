import { mdiPower } from "@mdi/js";
import {
  CSSResultGroup,
  LitElement,
  PropertyValues,
  css,
  html,
  nothing,
} from "lit";
import { property, state } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import { stopPropagation } from "../../../common/dom/stop_propagation";
import {
  computeAttributeNameDisplay,
  computeAttributeValueDisplay,
} from "../../../common/entity/compute_attribute_display";
import { supportsFeature } from "../../../common/entity/supports-feature";
import "../../../components/ha-icon-button-group";
import "../../../components/ha-list-item";
import "../../../components/ha-outlined-button";
import { UNAVAILABLE } from "../../../data/entity";
import { forwardHaptic } from "../../../data/haptics";
import {
  HumidifierEntity,
  HumidifierEntityFeature,
  computeHumidiferModeIcon,
} from "../../../data/humidifier";
import { HomeAssistant } from "../../../types";
import { moreInfoControlStyle } from "../components/ha-more-info-control-style";
import "../components/ha-more-info-state-header";
import "../components/humidifier/ha-more-info-humidifier-humidity";

class MoreInfoHumidifier extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public stateObj?: HumidifierEntity;

  @state() public _mode?: string;

  protected willUpdate(changedProps: PropertyValues): void {
    super.willUpdate(changedProps);
    if (changedProps.has("stateObj")) {
      this._mode = this.stateObj?.attributes.mode;
    }
  }

  private _resizeDebounce?: number;

  protected render() {
    if (!this.stateObj) {
      return nothing;
    }

    const supportModes = supportsFeature(
      this.stateObj,
      HumidifierEntityFeature.MODES
    );

    return html`
      <ha-more-info-state-header
        .hass=${this.hass}
        .stateObj=${this.stateObj}
      ></ha-more-info-state-header>
      <div class="controls">
        <ha-more-info-humidifier-humidity
          .hass=${this.hass}
          .stateObj=${this.stateObj}
        ></ha-more-info-humidifier-humidity>
        <ha-icon-button-group>
          <ha-icon-button
            .disabled=${this.stateObj!.state === UNAVAILABLE}
            .label=${this.hass.localize(
              "ui.dialogs.more_info_control.humidifier.toggle"
            )}
            @click=${this._toggle}
          >
            <ha-svg-icon .path=${mdiPower}></ha-svg-icon>
          </ha-icon-button>
        </ha-icon-button-group>
        ${supportModes && this.stateObj.attributes.mode
          ? html`
              <ha-button-menu
                @action=${this._handleModeChanged}
                @closed=${stopPropagation}
                fixed
                .disabled=${this.stateObj.state === UNAVAILABLE}
              >
                <ha-outlined-button
                  slot="trigger"
                  .disabled=${this.stateObj.state === UNAVAILABLE}
                >
                  ${this._mode
                    ? computeAttributeValueDisplay(
                        this.hass.localize,
                        this.stateObj!,
                        this.hass.locale,
                        this.hass.config,
                        this.hass.entities,
                        "mode",
                        this._mode
                      )
                    : computeAttributeNameDisplay(
                        this.hass.localize,
                        this.stateObj,
                        this.hass.entities,
                        "mode"
                      )}
                  <ha-svg-icon
                    slot="icon"
                    path=${computeHumidiferModeIcon(this._mode)}
                  ></ha-svg-icon>
                </ha-outlined-button>
                ${this.stateObj.attributes.available_modes?.map(
                  (mode) =>
                    html`
                      <ha-list-item
                        graphic="icon"
                        .value=${mode}
                        .activated=${this._mode === mode}
                      >
                        <ha-svg-icon
                          slot="graphic"
                          path=${computeHumidiferModeIcon(mode)}
                        ></ha-svg-icon>
                        ${computeAttributeValueDisplay(
                          this.hass.localize,
                          this.stateObj!,
                          this.hass.locale,
                          this.hass.config,
                          this.hass.entities,
                          "mode",
                          mode
                        )}
                      </ha-list-item>
                    `
                )}
              </ha-button-menu>
            `
          : nothing}
      </div>
    `;
  }

  private _toggle = () => {
    const service = this.stateObj?.state === "on" ? "turn_off" : "turn_on";
    forwardHaptic("light");
    this.hass.callService("humidifier", service, {
      entity_id: this.stateObj!.entity_id,
    });
  };

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);
    if (!changedProps.has("stateObj") || !this.stateObj) {
      return;
    }

    if (this._resizeDebounce) {
      clearTimeout(this._resizeDebounce);
    }
    this._resizeDebounce = window.setTimeout(() => {
      fireEvent(this, "iron-resize");
      this._resizeDebounce = undefined;
    }, 500);
  }

  private _handleModeChanged(ev) {
    ev.stopPropagation();
    ev.preventDefault();

    const index = ev.detail.index;
    const newVal = this.stateObj!.attributes.available_modes![index];
    const oldVal = this._mode;

    if (!newVal || oldVal === newVal) return;

    this._mode = newVal;
    this.hass.callService("humidifier", "set_mode", {
      entity_id: this.stateObj!.entity_id,
      mode: newVal,
    });
  }

  static get styles(): CSSResultGroup {
    return [
      moreInfoControlStyle,
      css`
        :host {
          color: var(--primary-text-color);
        }
        ha-more-info-humidifier-humidity {
          margin: 0 !important;
        }
      `,
    ];
  }
}

customElements.define("more-info-humidifier", MoreInfoHumidifier);

declare global {
  interface HTMLElementTagNameMap {
    "more-info-humidifier": MoreInfoHumidifier;
  }
}
