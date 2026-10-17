import { pingPong } from "../core/oscillation";

/** One slider of a debug page. */
export interface DebugSliderSpec {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly value: number;
  /** One swing from `min` to `max` and back while on auto, s; without it the slider has no auto. */
  readonly periodSeconds?: number;
}

export interface DebugSliders {
  /** The slider's current value. */
  value(id: string): number;
  /** Moves the sliders on auto to where they are at `seconds`. */
  update(seconds: number): void;
}

const DECIMALS = 2;

interface Row {
  readonly spec: DebugSliderSpec;
  readonly input: HTMLInputElement;
  readonly auto: HTMLInputElement | undefined;
  readonly readout: HTMLElement;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function createRow(spec: DebugSliderSpec): { row: Row; node: HTMLElement } {
  const node = element("div", "debug-slider");
  const label = element("label", "debug-slider__label", spec.label);
  const input = element("input", "debug-slider__range");
  input.type = "range";
  input.min = String(spec.min);
  input.max = String(spec.max);
  // Any value: auto swings smoothly, and a value from the URL is kept as it is.
  input.step = "any";
  input.value = String(spec.value);
  input.id = `slider-${spec.id}`;
  label.htmlFor = input.id;
  const readout = element("output", "debug-slider__value", spec.value.toFixed(DECIMALS));
  node.append(label, input, readout);
  let auto: HTMLInputElement | undefined;
  if (spec.periodSeconds !== undefined) {
    const autoLabel = element("label", "debug-slider__auto", "auto");
    auto = element("input", "");
    auto.type = "checkbox";
    autoLabel.prepend(auto);
    node.append(autoLabel);
  }
  input.addEventListener("input", () => {
    readout.textContent = Number(input.value).toFixed(DECIMALS);
  });
  return { row: { spec, input, auto, readout }, node };
}

/**
 * A column of labelled sliders in `parent`. A slider with a period also has
 * an "auto" switch: on, it swings from its minimum to its maximum and back
 * by itself, so a motion can be watched hands free.
 */
export function createDebugSliders(
  parent: HTMLElement,
  specs: readonly DebugSliderSpec[],
): DebugSliders {
  const rows = new Map<string, Row>();
  for (const spec of specs) {
    const { row, node } = createRow(spec);
    rows.set(spec.id, row);
    parent.append(node);
  }
  return {
    value(id) {
      const row = rows.get(id);
      return row === undefined ? 0 : Number(row.input.value);
    },
    update(seconds) {
      for (const { spec, input, auto, readout } of rows.values()) {
        if (auto?.checked !== true || spec.periodSeconds === undefined) continue;
        const value = spec.min + (spec.max - spec.min) * pingPong(seconds, spec.periodSeconds);
        input.value = String(value);
        readout.textContent = value.toFixed(DECIMALS);
      }
    },
  };
}
