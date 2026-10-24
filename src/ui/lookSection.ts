import type { EffectDescriptor } from "../scene/look";
import { paramControls, paramLabel, type ParamControl } from "../scene/paramControls";
import { sunAngles, sunFromAngles, type LookTweak, type SceneLook } from "../scene/sceneLook";
import { element, select, slider } from "./controls";

/** The viewer's look choice that means "the scene's own". */
const SCENE_OWN = "";
const EXPOSURE = { min: 0.2, max: 2.5, step: 0.01 } as const;
const SUN_HEIGHT = { min: 5, max: 90, step: 1 } as const;
const SUN_TURN = { min: -180, max: 180, step: 1 } as const;
const RGB = ["red", "green", "blue"] as const;
/** Decimals shown next to a slider: enough for the smallest step. */
const MAX_DECIMALS = 3;

export interface LookSectionState {
  /** Looks to choose from, by id; "none" is the plain look. */
  readonly looks: readonly { readonly id: string; readonly name: string }[];
  /** The viewer's choice, or undefined for the scene's own look. */
  readonly choice: string | undefined;
  /** Name of the scene's own look, for the first entry of the list. */
  readonly sceneLookName: string;
  /** The look drawn now, with the viewer's tweaks laid over it. */
  readonly look: SceneLook;
  /** Where the sun stands now (when the look sets none, the scene's default). */
  readonly sun: readonly [number, number, number];
  /** The effects whose parameters can be tuned, in the panel's order. */
  readonly effects: readonly EffectDescriptor[];
}

export interface LookSectionCallbacks {
  /** A look from the list, or undefined for the scene's own. */
  onChoose(choice: string | undefined): void;
  /** The viewer moved a slider: their tweaks to the current look so far. */
  onTweak(change: LookTweak): void;
  /** Forgets the viewer's tweaks to the current look. */
  onReset(): void;
}

export interface LookSection {
  /** The look to draw with, the picture's own sliders and Reset. */
  readonly root: HTMLElement;
  /**
   * The sliders of one effect, to show under its switch; undefined for an
   * effect with nothing to tune. Refilled on every update.
   */
  effectSettings(effectId: string): HTMLElement | undefined;
  /** Shows another look, or the same after a reset. */
  update(state: LookSectionState): void;
}

function decimalsOf(step: number): number {
  if (step >= 1) return 0;
  return Math.min(Math.ceil(-Math.log10(step)), MAX_DECIMALS);
}

/** A labelled slider row whose value shows beside it. */
function sliderRow(
  name: string,
  label: string,
  range: { readonly min: number; readonly max: number; readonly step: number },
  value: number,
  onInput: (value: number) => void,
): HTMLLabelElement {
  const row = element("label", "panel__row");
  const digits = decimalsOf(range.step);
  const output = element("output", "panel__value", value.toFixed(digits));
  const input = slider(range.min, range.max, range.step, value);
  input.name = name;
  input.addEventListener("input", () => {
    const next = Number(input.value);
    output.textContent = next.toFixed(digits);
    onInput(next);
  });
  row.append(element("span", "panel__label", label), input, output);
  return row;
}

function colorRow(
  name: string,
  label: string,
  value: string,
  onInput: (value: string) => void,
): HTMLLabelElement {
  const row = element("label", "panel__row");
  const input = element("input", "panel__color");
  input.name = name;
  input.type = "color";
  // A color input wants six digits: #abc becomes #aabbcc.
  input.value = value.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3");
  input.addEventListener("input", () => {
    onInput(input.value);
  });
  row.append(element("span", "panel__label", label), input);
  return row;
}

/** Rows for one parameter: a slider, one slider per item of a list, or a color. */
function controlRows(
  name: string,
  control: ParamControl,
  onChange: (value: unknown) => void,
): HTMLLabelElement[] {
  const label = paramLabel(control.key);
  if (control.kind === "color") return [colorRow(name, label, control.value, onChange)];
  if (control.kind === "number") {
    return [sliderRow(name, label, control, control.value, onChange)];
  }
  const values = [...control.value];
  // Three values are a red, a green and a blue (absorption by colour).
  const names = values.length === RGB.length ? RGB : values.map((_, index) => String(index + 1));
  return values.map((value, index) =>
    sliderRow(
      `${name}-${String(index)}`,
      `${label} ${names[index] ?? ""}`,
      control,
      value,
      (next) => {
        values[index] = next;
        onChange([...values]);
      },
    ),
  );
}

/**
 * The panel's Look section: which composition of water and light the tank
 * draws with (the scene's own, a look from looks/, or none), and a slider
 * for every parameter of it: exposure and sun here, each effect's
 * parameters (read from the effect's own schema, scene/paramControls)
 * under the effect's switch, through `effectSettings`. Changes are the
 * viewer's tweaks, kept per look and undone by Reset.
 */
export function createLookSection(
  initial: LookSectionState,
  callbacks: LookSectionCallbacks,
): LookSection {
  const root = element("div", "panel__look");
  let tweak: LookTweak = {};
  // One box per effect that has something to tune, kept across updates so the panel can hold it.
  const settings = new Map<string, HTMLElement>();
  for (const effect of initial.effects) {
    if (paramControls(effect.params, {}).length === 0) continue;
    const box = element("div", "panel__effect-settings");
    box.dataset.lookEffect = effect.id;
    settings.set(effect.id, box);
  }

  const tweakEffect = (effectId: string, key: string, value: unknown): void => {
    const effects = { ...(tweak.effects ?? {}) };
    effects[effectId] = { ...(effects[effectId] ?? {}), [key]: value };
    tweak = { ...tweak, effects };
    callbacks.onTweak(tweak);
  };

  const render = (state: LookSectionState): void => {
    tweak = {};
    root.replaceChildren();
    const choice = select(
      "Look",
      [
        [SCENE_OWN, `Scene's own (${state.sceneLookName})`],
        ...state.looks.map((look) => [look.id, look.name] as const),
      ],
      state.choice ?? SCENE_OWN,
    );
    choice.input.name = "look-choice";
    choice.input.addEventListener("change", () => {
      callbacks.onChoose(choice.input.value === SCENE_OWN ? undefined : choice.input.value);
    });
    const reset = element("button", "panel__button panel__button--wide", "Reset this look");
    reset.type = "button";
    reset.name = "look-reset";
    reset.addEventListener("click", () => {
      callbacks.onReset();
    });

    const angles = sunAngles(state.sun);
    let height = angles.height;
    let turn = angles.turn;
    const moveSun = (): void => {
      tweak = { ...tweak, sun: sunFromAngles(height, turn) };
      callbacks.onTweak(tweak);
    };
    const picture = element("div", "panel__group");
    picture.append(
      element("p", "panel__subheading", "Picture"),
      sliderRow("look-exposure", "Exposure", EXPOSURE, state.look.exposure, (value) => {
        tweak = { ...tweak, exposure: value };
        callbacks.onTweak(tweak);
      }),
      sliderRow("look-sun-height", "Sun height", SUN_HEIGHT, Math.round(height), (value) => {
        height = value;
        moveSun();
      }),
      sliderRow("look-sun-turn", "Sun turn", SUN_TURN, Math.round(turn), (value) => {
        turn = value;
        moveSun();
      }),
    );
    root.append(choice.row, picture);

    root.append(reset);

    for (const effect of state.effects) {
      const box = settings.get(effect.id);
      if (box === undefined) continue;
      const controls = paramControls(effect.params, state.look.effects[effect.id] ?? {});
      box.replaceChildren(
        ...controls.flatMap((control) =>
          controlRows(`look-${effect.id}-${control.key}`, control, (value) => {
            tweakEffect(effect.id, control.key, value);
          }),
        ),
      );
    }
  };

  render(initial);
  return { root, effectSettings: (effectId) => settings.get(effectId), update: render };
}
