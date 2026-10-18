import { z } from "zod";

/**
 * The controls a panel can offer for an effect's parameters, read from the
 * Zod schema the effect declares (every parameter has a default and, most
 * often, bounds). The panel needs no code per effect: a new effect, or one
 * made of files, gets its sliders as soon as it is registered.
 */
export type ParamControl =
  | {
      readonly key: string;
      readonly kind: "number";
      readonly min: number;
      readonly max: number;
      readonly step: number;
      readonly value: number;
    }
  | {
      readonly key: string;
      readonly kind: "numbers";
      readonly min: number;
      readonly max: number;
      readonly step: number;
      readonly value: readonly number[];
    }
  | { readonly key: string; readonly kind: "color"; readonly value: string };

/** Slider positions between the bounds. */
const STEPS = 200;
/** A number without bounds gets a range this many times its default. */
const OPEN_RANGE = 4;

interface Range {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

function rangeOf(schema: z.ZodNumber, fallback: number): Range {
  const reach = Math.max(Math.abs(fallback) * OPEN_RANGE, 1);
  const lower = schema.minValue;
  const upper = schema.maxValue;
  const bounded = lower !== null && Number.isFinite(lower);
  // Without bounds the range is centred on zero; with a lower bound only, it
  // reaches a few times the default above it.
  const min = bounded ? lower : -reach;
  const max =
    upper !== null && Number.isFinite(upper)
      ? upper
      : bounded
        ? Math.max(fallback * OPEN_RANGE, lower + 1)
        : reach;
  return { min, max, step: schema.format === "safeint" ? 1 : (max - min) / STEPS };
}

function controlOf(key: string, field: z.ZodType, given: unknown): ParamControl | undefined {
  const inner = field instanceof z.ZodDefault ? (field.def.innerType as z.ZodType) : field;
  const fallback: unknown = field instanceof z.ZodDefault ? field.def.defaultValue : undefined;
  const value = given ?? fallback;
  if (inner instanceof z.ZodNumber && typeof value === "number") {
    return { key, kind: "number", ...rangeOf(inner, value), value };
  }
  if (inner instanceof z.ZodTuple && Array.isArray(value)) {
    const items = inner.def.items as readonly z.ZodType[];
    const first = items[0];
    const numbers = value.filter((item): item is number => typeof item === "number");
    if (!(first instanceof z.ZodNumber) || numbers.length !== items.length) return undefined;
    return { key, kind: "numbers", ...rangeOf(first, Math.max(...numbers)), value: numbers };
  }
  if (inner instanceof z.ZodString && typeof value === "string" && value.startsWith("#")) {
    return { key, kind: "color", value };
  }
  return undefined;
}

/**
 * The controls for an effect's parameters, in the order the schema declares
 * them, showing `values` where given and the defaults elsewhere. Parameters
 * that are neither numbers, lists of numbers nor colors are left out.
 */
export function paramControls(
  schema: z.ZodType,
  values: Readonly<Record<string, unknown>>,
): ParamControl[] {
  if (!(schema instanceof z.ZodObject)) return [];
  const shape = schema.shape as Readonly<Record<string, z.ZodType>>;
  return Object.entries(shape)
    .map(([key, field]) => controlOf(key, field, values[key]))
    .filter((control): control is ParamControl => control !== undefined);
}

/** A parameter's label: "sunFocus" reads "Sun focus". */
export function paramLabel(key: string): string {
  const words = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
