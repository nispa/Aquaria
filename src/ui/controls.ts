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

/**
 * A panel section the viewer opens and closes by its heading. Content goes
 * into the returned `section`; `onToggle` reports each new state.
 */
export function collapsible(
  id: string,
  title: string,
  open: boolean,
  onToggle: (open: boolean) => void,
): { readonly section: HTMLDetailsElement; readonly summary: HTMLElement } {
  const section = element("details", "panel__section panel__collapsible");
  section.dataset.section = id;
  section.open = open;
  const summary = element("summary", "panel__heading panel__summary");
  summary.append(element("span", "", title));
  section.append(summary);
  section.addEventListener("toggle", () => {
    onToggle(section.open);
  });
  return { section, summary };
}

/** A row of tabs over their panels, one panel showing at a time. */
export interface Tabs<Id extends string> {
  readonly bar: HTMLElement;
  /** Each tab's panel, to fill with sections. */
  readonly panels: Readonly<Record<Id, HTMLElement>>;
  /** Shows a tab, as a click on it would (without reporting it). */
  show(id: Id): void;
}

/**
 * Tabs with their panels; `onSelect` reports a tab the viewer clicked. The
 * buttons and panels carry the ARIA tab roles, so a tab is found by its
 * name and a panel by the tab that controls it.
 */
export function tabs<Id extends string>(
  items: readonly { readonly id: Id; readonly label: string }[],
  selected: Id,
  onSelect: (id: Id) => void,
): Tabs<Id> {
  const bar = element("div", "panel__tabs");
  bar.setAttribute("role", "tablist");
  const buttons = new Map<Id, HTMLButtonElement>();
  const panels = {} as Record<Id, HTMLElement>;
  const show = (id: Id): void => {
    for (const [tabId, button] of buttons) {
      const current = tabId === id;
      button.setAttribute("aria-selected", String(current));
      button.tabIndex = current ? 0 : -1;
      panels[tabId].hidden = !current;
    }
  };
  for (const { id, label } of items) {
    const button = element("button", "panel__tab", label);
    button.type = "button";
    button.id = `panel-tab-${id}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `panel-tabpanel-${id}`);
    button.addEventListener("click", () => {
      show(id);
      onSelect(id);
    });
    const panel = element("div", "panel__tabpanel");
    panel.id = `panel-tabpanel-${id}`;
    panel.dataset.tab = id;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", button.id);
    buttons.set(id, button);
    panels[id] = panel;
    bar.append(button);
  }
  show(selected);
  return { bar, panels, show };
}
