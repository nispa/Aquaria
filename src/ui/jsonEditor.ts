import { element } from "./controls";

/**
 * A plain editor for a piece of a fish recipe: numbers, colors, switches
 * and text, lists and objects of them, nested. It changes the value it is
 * given in place and calls `onChange` after each edit; the recipe's schema
 * checks the result when it is saved.
 */

export interface JsonEditorOptions {
  /** Keys left out, such as outlines the side view edits by dragging. */
  readonly hidden?: ReadonlySet<string>;
  readonly onChange: () => void;
}

type Write = (next: unknown) => void;

const COLOR = /^#[0-9a-f]{6}$/i;
/** Lists of numbers up to this long sit on one row. */
const INLINE_NUMBERS = 4;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function input(value: unknown, write: Write, onChange: () => void): HTMLElement {
  if (typeof value === "number") {
    const field = element("input", "maker__number");
    field.type = "number";
    field.step = "any";
    field.value = String(value);
    field.addEventListener("input", () => {
      const next = Number(field.value);
      if (field.value === "" || !Number.isFinite(next)) return;
      write(next);
      onChange();
    });
    return field;
  }
  if (typeof value === "boolean") {
    const field = element("input", "");
    field.type = "checkbox";
    field.checked = value;
    field.addEventListener("change", () => {
      write(field.checked);
      onChange();
    });
    return field;
  }
  if (typeof value === "string") {
    const color = COLOR.test(value);
    const field = element("input", color ? "maker__color" : "maker__text");
    field.type = color ? "color" : "text";
    field.value = value;
    field.addEventListener("input", () => {
      write(field.value);
      onChange();
    });
    return field;
  }
  return element("span", "", "—");
}

function fields(
  entries: readonly (readonly [string, unknown, Write])[],
  options: JsonEditorOptions,
): HTMLElement {
  const box = element("div", "maker__fields");
  for (const [key, value, write] of entries) {
    if (options.hidden?.has(key) === true) continue;
    const row = element("div", "maker__field");
    row.append(element("span", "maker__key", key), editor(value, write, options));
    box.append(row);
  }
  return box;
}

function entriesOf(
  value: unknown[] | Record<string, unknown>,
): (readonly [string, unknown, Write])[] {
  if (Array.isArray(value)) {
    return value.map(
      (item, index) => [String(index), item, (next: unknown) => (value[index] = next)] as const,
    );
  }
  return Object.entries(value).map(
    ([key, item]) => [key, item, (next: unknown) => (value[key] = next)] as const,
  );
}

function editor(value: unknown, write: Write, options: JsonEditorOptions): HTMLElement {
  if (Array.isArray(value)) {
    const items: unknown[] = value;
    if (items.length <= INLINE_NUMBERS && items.every((item) => typeof item === "number")) {
      const row = element("span", "maker__numbers");
      for (const [, item, writeItem] of entriesOf(items))
        row.append(input(item, writeItem, options.onChange));
      return row;
    }
    return fields(entriesOf(items), options);
  }
  if (isObject(value)) return fields(entriesOf(value), options);
  return input(value, write, options.onChange);
}

/** An editor for an object of a recipe, every field but the hidden ones. */
export function jsonEditor(value: object, options: JsonEditorOptions): HTMLElement {
  return fields(entriesOf(value as Record<string, unknown>), options);
}
