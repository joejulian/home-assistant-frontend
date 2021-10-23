import { mdiArrowDown, mdiArrowUp } from "@mdi/js";
import {
  css,
  CSSResultGroup,
  html,
  LitElement,
  PropertyValues,
  TemplateResult,
} from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import { applyThemesOnElement } from "../../../common/dom/apply_themes_on_element";
import { fireEvent } from "../../../common/dom/fire_event";
import { computeActiveState } from "../../../common/entity/compute_active_state";
import { computeStateDisplay } from "../../../common/entity/compute_state_display";
import { computeStateDomain } from "../../../common/entity/compute_state_domain";
import { computeStateName } from "../../../common/entity/compute_state_name";
import { isValidEntityId } from "../../../common/entity/valid_entity_id";
import { formatNumber } from "../../../common/number/format_number";
import { round } from "../../../common/number/round";
import { iconColorCSS } from "../../../common/style/icon_color_css";
import "../../../components/ha-card";
import "../../../components/ha-icon";
import { UNAVAILABLE_STATES } from "../../../data/entity";
import { fetchRecent } from "../../../data/history";
import { HomeAssistant } from "../../../types";
import { formatAttributeValue } from "../../../util/hass-attributes-util";
import { computeCardSize } from "../common/compute-card-size";
import { findEntities } from "../common/find-entities";
import { hasConfigOrEntityChanged } from "../common/has-changed";
import { createEntityNotFoundWarning } from "../components/hui-warning";
import { createHeaderFooterElement } from "../create-element/create-header-footer-element";
import {
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceHeaderFooter,
} from "../types";
import { HuiErrorCard } from "./hui-error-card";
import { EntityCardConfig } from "./types";

@customElement("hui-entity-card")
export class HuiEntityCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("../editor/config-elements/hui-entity-card-editor");
    return document.createElement("hui-entity-card-editor");
  }

  public static getStubConfig(
    hass: HomeAssistant,
    entities: string[],
    entitiesFill: string[]
  ) {
    const includeDomains = ["sensor", "light", "switch"];
    const maxEntities = 1;
    const foundEntities = findEntities(
      hass,
      maxEntities,
      entities,
      entitiesFill,
      includeDomains
    );

    return {
      entity: foundEntities[0] || "",
    };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: EntityCardConfig;

  @state() private _lastState?: number;

  private _footerElement?: HuiErrorCard | LovelaceHeaderFooter;

  private _date?: Date;

  private _fetching = false;

  public setConfig(config: EntityCardConfig): void {
    if (!config.entity) {
      throw new Error("Entity must be specified");
    }
    if (config.entity && !isValidEntityId(config.entity)) {
      throw new Error("Invalid entity");
    }

    this._config = {
      hours_to_show: 24,
      ...config,
    };

    if (this._config.footer) {
      this._footerElement = createHeaderFooterElement(this._config.footer);
    } else if (this._footerElement) {
      this._footerElement = undefined;
    }
  }

  public async getCardSize(): Promise<number> {
    let size = 2;
    if (this._footerElement) {
      const footerSize = computeCardSize(this._footerElement);
      size += footerSize instanceof Promise ? await footerSize : footerSize;
    }
    return size;
  }

  protected render(): TemplateResult {
    if (!this._config || !this.hass) {
      return html``;
    }

    const stateObj = this.hass.states[this._config.entity];

    if (!stateObj) {
      return html`
        <hui-warning>
          ${createEntityNotFoundWarning(this.hass, this._config.entity)}
        </hui-warning>
      `;
    }

    const domain = computeStateDomain(stateObj);
    const showUnit = this._config.attribute
      ? this._config.attribute in stateObj.attributes
      : !UNAVAILABLE_STATES.includes(stateObj.state);

    const name = this._config.name || computeStateName(stateObj);
    const trend = this._lastState
      ? round((Number(stateObj.state) / this._lastState) * 100, 0)
      : undefined;

    return html`
      <ha-card @click=${this._handleClick} tabindex="0">
        <div class="header">
          <div class="name" .title=${name}>${name}</div>
          <div class="icon">
            ${this._config.show_trend && trend
              ? html`
                  <div class="trend ${classMap({ error: trend < 100 })}">
                    <ha-svg-icon
                      .path=${trend < 100 ? mdiArrowDown : mdiArrowUp}
                    ></ha-svg-icon>
                    ${trend} %
                  </div>
                `
              : html`
                  <ha-icon
                    .icon=${this._config.icon || stateIcon(stateObj)}
                    data-domain=${ifDefined(
                      this._config.state_color ||
                        (domain === "light" &&
                          this._config.state_color !== false)
                        ? domain
                        : undefined
                    )}
                    data-state=${stateObj ? computeActiveState(stateObj) : ""}
                  ></ha-icon>
                `}
          </div>
        </div>
        <div class="info">
          <span class="value"
            >${"attribute" in this._config
              ? stateObj.attributes[this._config.attribute!] !== undefined
                ? formatAttributeValue(
                    this.hass,
                    stateObj.attributes[this._config.attribute!]
                  )
                : this.hass.localize("state.default.unknown")
              : stateObj.attributes.unit_of_measurement
              ? formatNumber(stateObj.state, this.hass.locale)
              : computeStateDisplay(
                  this.hass.localize,
                  stateObj,
                  this.hass.locale
                )}</span
          >${showUnit
            ? html`
                <span class="measurement"
                  >${this._config.unit ||
                  (this._config.attribute
                    ? ""
                    : stateObj.attributes.unit_of_measurement)}</span
                >
              `
            : ""}
        </div>
        ${this._footerElement}
      </ha-card>
    `;
  }

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    // Side Effect used to update footer hass while keeping optimizations
    if (this._footerElement) {
      this._footerElement.hass = this.hass;
    }

    return hasConfigOrEntityChanged(this, changedProps);
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);
    if (
      !this._config ||
      !this.hass ||
      (this._fetching && !changedProps.has("_config"))
    ) {
      return;
    }

    const oldHass = changedProps.get("hass") as HomeAssistant | undefined;
    const oldConfig = changedProps.get("_config") as
      | EntityCardConfig
      | undefined;

    if (
      !oldHass ||
      !oldConfig ||
      oldHass.themes !== this.hass.themes ||
      oldConfig.theme !== this._config.theme
    ) {
      applyThemesOnElement(this, this.hass.themes, this._config!.theme);
    }

    if (changedProps.has("_config")) {
      if (!oldConfig || oldConfig.entity !== this._config.entity) {
        this._lastState = undefined;
      }
      this._getStateHistory();
    } else if (Date.now() - this._date!.getTime() >= 60000) {
      this._getStateHistory();
    }
  }

  private _handleClick(): void {
    fireEvent(this, "hass-more-info", { entityId: this._config!.entity });
  }

  private async _getStateHistory(): Promise<void> {
    if (this._fetching) {
      return;
    }

    this._fetching = true;

    const now = new Date();
    const startTime = new Date(
      new Date().setHours(now.getHours() - this._config!.hours_to_show!)
    );

    const stateHistory = await fetchRecent(
      this.hass!,
      this._config!.entity,
      startTime,
      startTime
    );

    this._lastState = Number(stateHistory[0][0].state);

    this._date = now;
    this._fetching = false;
  }

  static get styles(): CSSResultGroup {
    return [
      iconColorCSS,
      css`
        ha-card {
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          cursor: pointer;
          outline: none;
        }

        .header {
          display: flex;
          padding: 8px 16px 0;
          justify-content: space-between;
        }

        .name {
          color: var(--secondary-text-color);
          line-height: 40px;
          font-weight: 500;
          font-size: 16px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .icon {
          color: var(--state-icon-color, #44739e);
          line-height: 40px;
        }

        .trend {
          font-size: 16px;
          color: var(--success-color);
          display: flex;
          align-items: center;
        }

        .trend.error {
          color: var(--error-color);
        }

        .info {
          padding: 0px 16px 16px;
          margin-top: -4px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          line-height: 28px;
        }

        .value {
          font-size: 28px;
          margin-right: 4px;
        }

        .measurement {
          font-size: 18px;
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-entity-card": HuiEntityCard;
  }
}
