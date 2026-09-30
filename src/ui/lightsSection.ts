import { formatHour } from "../core/time";
import {
  LIGHT_CHANNELS,
  MAX_SPOTS,
  type CycleMode,
  type LightChannel,
  type Lights,
} from "../scene/lights";
import { element, select, slider } from "./controls";

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const HOUR_STEP = 0.25;
const PERCENT = 100;
const MAX_MOON_PERCENT = 30;
const DAY_MINUTES = { min: 1, max: 240 } as const;
const RAMP_HOURS = { min: 0.25, max: 6 } as const;

const CHANNEL_LABELS: Readonly<Record<LightChannel, string>> = {
  white: "White",
  blue: "Actinic blue",
  violet: "Violet / UV",
  accent: "Accent",
};

const MODES: readonly (readonly [CycleMode, string])[] = [
  ["fixed", "Fixed hour"],
  ["clock", "Real clock"],
  ["accelerated", "Accelerated day"],
];

const FIXTURES = [
  ["sun", "Open sky (sun)"],
  ["spots", "LED spots"],
] as const;

const SETUPS = [
  ["recommended", "Recommended"],
  ["custom", "Custom"],
] as const;

export interface LightsSectionState {
  /** What the panel shows now: the custom setup, or the scene's recommended one. */
  readonly lights: Lights;
  /** The scene's own (recommended) setup, restored by "Recommended". */
  readonly recommended: Lights;
  readonly custom: boolean;
}

export interface LightsSection {
  readonly element: HTMLElement;
  /** Shows the aquarium's current time; cheap to call every frame. */
  setHour(hour: number): void;
}

interface Control {
  readonly row: HTMLElement;
  /** Shows a setup's value without notifying anyone. */
  show(lights: Lights): void;
}

/**
 * LED channels and daily cycle. "Recommended" uses the scene's setup; changing
 * any control switches to "Custom", which is passed on as a whole setup.
 * Choosing "Recommended" again passes `undefined` and restores the controls.
 */
export function createLightsSection(
  state: LightsSectionState,
  onChange: (lights: Lights | undefined) => void,
): LightsSection {
  const section = element("section", "panel__section");
  section.dataset.section = "lights";
  section.append(element("h2", "panel__heading", "Lights"));
  const clock = element("p", "panel__clock", "");
  let current = state.lights;
  let shownMinute = -1;

  const setup = select("Setup", SETUPS, state.custom ? "custom" : "recommended");
  setup.input.name = "light-setup";

  const change = (next: Lights): void => {
    current = next;
    setup.input.value = "custom";
    onChange(next);
  };

  const cycleSlider = (
    label: string,
    key: "hour" | "sunrise" | "sunset" | "ramp" | "minutes",
    range: { readonly min: number; readonly max: number; readonly step: number },
    format: (value: number) => string,
  ): Control => {
    const row = element("label", "panel__row");
    const value = element("output", "panel__value", "");
    const input = slider(range.min, range.max, range.step, current.cycle[key]);
    input.name = `light-${key}`;
    input.addEventListener("input", () => {
      value.textContent = format(Number(input.value));
      change({ ...current, cycle: { ...current.cycle, [key]: Number(input.value) } });
    });
    row.append(element("span", "panel__label", label), input, value);
    return {
      row,
      show(lights) {
        input.value = String(lights.cycle[key]);
        value.textContent = format(lights.cycle[key]);
      },
    };
  };

  const hourRange = { min: 0, max: HOURS_PER_DAY, step: HOUR_STEP };
  const mode = select("Cycle", MODES, current.cycle.mode);
  mode.input.name = "light-mode";
  mode.input.addEventListener("change", () => {
    change({ ...current, cycle: { ...current.cycle, mode: mode.input.value as CycleMode } });
  });
  const modeControl: Control = {
    row: mode.row,
    show(lights) {
      mode.input.value = lights.cycle.mode;
    },
  };

  const fixtureSelect = select("Fixture", FIXTURES, current.fixture.type);
  fixtureSelect.input.name = "light-fixture";
  fixtureSelect.input.addEventListener("change", () => {
    const type = fixtureSelect.input.value === "spots" ? "spots" : "sun";
    change({ ...current, fixture: { ...current.fixture, type } });
  });
  const fixtureControl: Control = {
    row: fixtureSelect.row,
    show(lights) {
      fixtureSelect.input.value = lights.fixture.type;
    },
  };

  const spotsRow = element("label", "panel__row");
  const spotsValue = element("output", "panel__value", "");
  const spotsSlider = slider(1, MAX_SPOTS, 1, current.fixture.spots);
  spotsSlider.name = "light-spots";
  spotsSlider.addEventListener("input", () => {
    spotsValue.textContent = spotsSlider.value;
    change({ ...current, fixture: { ...current.fixture, spots: Number(spotsSlider.value) } });
  });
  spotsRow.append(element("span", "panel__label", "Spots"), spotsSlider, spotsValue);
  const spotsControl: Control = {
    row: spotsRow,
    show(lights) {
      spotsSlider.value = String(lights.fixture.spots);
      spotsValue.textContent = spotsSlider.value;
    },
  };

  const channelControl = (channel: LightChannel): Control => {
    const row = element("label", "panel__row panel__row--channel");
    row.dataset.channel = channel;
    const color = element("input", "panel__color");
    color.type = "color";
    color.name = `light-${channel}-color`;
    const level = slider(0, PERCENT, 1, 0);
    level.name = `light-${channel}-level`;
    const value = element("output", "panel__value", "");
    const update = (): void => {
      value.textContent = `${level.value}%`;
      change({
        ...current,
        channels: {
          ...current.channels,
          [channel]: { color: color.value, level: Number(level.value) / PERCENT },
        },
      });
    };
    color.addEventListener("input", update);
    level.addEventListener("input", update);
    row.append(element("span", "panel__label", CHANNEL_LABELS[channel]), color, level, value);
    return {
      row,
      show(lights) {
        // Color inputs only accept #rrggbb.
        color.value = expandHex(lights.channels[channel].color);
        level.value = String(Math.round(lights.channels[channel].level * PERCENT));
        value.textContent = `${level.value}%`;
      },
    };
  };

  const moonRow = element("label", "panel__row");
  const moonValue = element("output", "panel__value", "");
  const moon = slider(0, MAX_MOON_PERCENT, 1, 0);
  moon.name = "light-moon";
  moon.addEventListener("input", () => {
    moonValue.textContent = `${moon.value}%`;
    change({ ...current, moon: Number(moon.value) / PERCENT });
  });
  moonRow.append(element("span", "panel__label", "Moonlight"), moon, moonValue);
  const moonControl: Control = {
    row: moonRow,
    show(lights) {
      moon.value = String(Math.round(lights.moon * PERCENT));
      moonValue.textContent = `${moon.value}%`;
    },
  };

  const controls: Control[] = [
    fixtureControl,
    spotsControl,
    modeControl,
    cycleSlider("Hour", "hour", hourRange, formatHour),
    cycleSlider("Day length", "minutes", { ...DAY_MINUTES, step: 1 }, (value) => `${value} min`),
    cycleSlider("Sunrise", "sunrise", hourRange, formatHour),
    cycleSlider("Sunset", "sunset", hourRange, formatHour),
    cycleSlider("Dawn / dusk", "ramp", { ...RAMP_HOURS, step: HOUR_STEP }, (value) => `${value} h`),
    ...LIGHT_CHANNELS.map(channelControl),
    moonControl,
  ];
  const showAll = (lights: Lights): void => {
    controls.forEach((control) => {
      control.show(lights);
    });
  };
  showAll(current);

  setup.input.addEventListener("change", () => {
    if (setup.input.value === "recommended") {
      current = state.recommended;
      showAll(current);
      onChange(undefined);
    } else {
      onChange(current);
    }
  });

  section.append(clock, setup.row, ...controls.map((control) => control.row));

  return {
    element: section,
    setHour(hour) {
      const minute = Math.floor(hour * MINUTES_PER_HOUR);
      if (minute === shownMinute) return;
      shownMinute = minute;
      clock.textContent = `Aquarium time ${formatHour(hour)}`;
    },
  };
}

function expandHex(hex: string): string {
  return hex.length === 4 ? `#${hex.slice(1).replace(/./g, "$&$&")}` : hex;
}
