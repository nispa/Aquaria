import type { SurfaceMaterialSpec } from "../scene/schema";
import { element, select, slider } from "./controls";

/**
 * Labelled form rows for scene settings: a slider with its value, a color,
 * a text, a choice, a switch and a surface material. Each reports changes
 * through its callback; the caller keeps the state.
 */

type Range = readonly [number, number];

const NO_MATERIAL = "none";
const TILE_RANGE: Range = [0.05, 3];
const TILE_STEP = 0.05;
const RELIEF_RANGE: Range = [0, 0.2];
const RELIEF_STEP = 0.005;

/** A copy of `value` without `key`: clears an optional scene field. */
export function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key)) as Omit<T, K>;
}

/** #abc → #aabbcc: color inputs only accept the long form. */
export function longHex(hex: string): string {
  return hex.length === 4 ? `#${hex.slice(1).replace(/./g, "$&$&")}` : hex;
}

export function heading(text: string): HTMLElement {
  return element("h3", "form__heading", text);
}

export function numberRow(
  label: string,
  value: number,
  range: Range,
  step: number,
  onChange: (value: number) => void,
  format: (value: number) => string = (shown) => String(shown),
): HTMLElement {
  const row = element("label", "panel__row");
  const output = element("output", "panel__value", format(value));
  const input = slider(range[0], range[1], step, value);
  input.addEventListener("input", () => {
    output.textContent = format(Number(input.value));
    onChange(Number(input.value));
  });
  row.append(element("span", "panel__label", label), input, output);
  return row;
}

export function colorRow(
  label: string,
  value: string,
  onChange: (value: string) => void,
): HTMLElement {
  const row = element("label", "panel__row panel__row--color");
  const input = element("input", "panel__color");
  input.type = "color";
  input.value = longHex(value);
  input.addEventListener("input", () => {
    onChange(input.value);
  });
  row.append(element("span", "panel__label", label), input);
  return row;
}

export function textRow(
  label: string,
  value: string,
  onChange: (value: string) => void,
): HTMLElement {
  const row = element("label", "panel__row panel__row--select");
  const input = element("input", "panel__text");
  input.type = "text";
  input.value = value;
  input.addEventListener("input", () => {
    onChange(input.value);
  });
  row.append(element("span", "panel__label", label), input);
  return row;
}

export function selectRow(
  label: string,
  options: readonly (readonly [string, string])[],
  value: string,
  onChange: (value: string) => void,
): HTMLElement {
  const choice = select(label, options, value);
  choice.input.addEventListener("change", () => {
    onChange(choice.input.value);
  });
  return choice.row;
}

export function checkRow(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const row = element("label", "panel__row panel__row--check");
  const input = element("input", "panel__check");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => {
    onChange(input.checked);
  });
  row.append(input, element("span", "panel__label", label));
  return row;
}

export function buttonRow(label: string, onClick: () => void): HTMLButtonElement {
  const node = element("button", "panel__button", label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

/** A surface material: none (the plain color) or one of `materials`, with its tile size and relief. */
export function materialRows(
  materials: readonly string[],
  value: SurfaceMaterialSpec | undefined,
  withRelief: boolean,
  onChange: (value: SurfaceMaterialSpec | undefined) => void,
): HTMLElement[] {
  let current = value;
  const details = element("div", "form__group");
  const renderDetails = (): void => {
    details.replaceChildren();
    if (current === undefined) return;
    details.append(
      numberRow("Tile size (m)", current.tileSize, TILE_RANGE, TILE_STEP, (tileSize) => {
        if (current === undefined) return;
        current = { ...current, tileSize };
        onChange(current);
      }),
    );
    if (withRelief) {
      details.append(
        numberRow("Relief (m)", current.displacement, RELIEF_RANGE, RELIEF_STEP, (displacement) => {
          if (current === undefined) return;
          current = { ...current, displacement };
          onChange(current);
        }),
      );
    }
  };
  const choice = selectRow(
    "Material",
    [[NO_MATERIAL, "Plain color"], ...materials.map((id) => [id, id] as const)],
    current?.id ?? NO_MATERIAL,
    (id) => {
      current =
        id === NO_MATERIAL
          ? undefined
          : { id, tileSize: current?.tileSize ?? 1, displacement: current?.displacement ?? 0 };
      onChange(current);
      renderDetails();
    },
  );
  renderDetails();
  return [choice, details];
}
