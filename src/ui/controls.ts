/** Small DOM helpers shared by the control panel sections. */

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function slider(min: number, max: number, step: number, value: number): HTMLInputElement {
  const input = element("input", "panel__slider");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  return input;
}

export function checkbox(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLLabelElement {
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

/** A labelled drop-down; `options` are [value, label] pairs. */
export function select(
  label: string,
  options: readonly (readonly [string, string])[],
  value: string,
): { readonly row: HTMLLabelElement; readonly input: HTMLSelectElement } {
  const row = element("label", "panel__row panel__row--select");
  const input = element("select", "panel__select");
  for (const [optionValue, optionLabel] of options) {
    const option = element("option", "", optionLabel);
    option.value = optionValue;
    input.append(option);
  }
  input.value = value;
  row.append(element("span", "panel__label", label), input);
  return { row, input };
}
