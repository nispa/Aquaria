import { z } from "zod";
import { ALLOWED_MODEL_LICENSES } from "./modelManifest";
import { formatIssues, SceneValidationError } from "./parse";

/**
 * A recorded ambience is a folder in `public/sounds/<id>/`: an audio file
 * that loops (the sea heard from under the water, an aquarium's pump, a
 * stream) and this manifest, `sound.json`, with its name, how loud it plays
 * and who recorded it. A scene names one as its `ambience`.
 */
export const SOUNDS_FOLDER = "sounds";
export const SOUND_MANIFEST_FILE = "sound.json";

const audioFile = z
  .string()
  .regex(
    /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w./-]+\.(?:mp3|ogg|m4a)$/,
    "The audio file must be an .mp3, .ogg or .m4a file inside the sound's folder.",
  );

export const soundManifestSchema = z.object({
  name: z.string().min(1),
  file: audioFile,
  /** How loud it plays, 0..1, before the tank's size and the viewer's volume. */
  level: z.number().min(0).max(1).default(1),
  credit: z.object({
    author: z.string().min(1),
    source: z.url(),
    license: z.enum(ALLOWED_MODEL_LICENSES),
  }),
});

export type SoundManifest = z.output<typeof soundManifestSchema>;

/** Validates a sound's `sound.json`; `id` is its folder, used in messages. */
export function parseSoundManifest(input: unknown, id: string): SoundManifest {
  const result = soundManifestSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues(`sound "${id}"`, result.error));
  }
  return result.data;
}

/** The sound's audio file, relative to the site root. */
export function soundFileUrl(id: string, manifest: SoundManifest): string {
  return `${SOUNDS_FOLDER}/${id}/${manifest.file}`;
}

const soundIndexSchema = z.object({
  sounds: z.array(
    z.string().regex(/^[a-z0-9-]+$/, "Sound ids are folder names: lowercase, digits, dashes."),
  ),
});

/** Validates `public/sounds/index.json`: the recorded ambiences the panel offers. */
export function parseSoundIndex(input: unknown): readonly string[] {
  const result = soundIndexSchema.safeParse(input);
  if (!result.success) {
    throw new SceneValidationError(formatIssues("sound index", result.error));
  }
  return result.data.sounds;
}

/** The viewer's choice of sound: the scene's own, the synthesized water, or the first sound. */
export const SCENE_SOUND = "scene";
export const SYNTH_SOUND = "synth";
export const CLASSIC_SOUND = "classic";

/** A recorded ambience as the panel lists it. */
export interface SoundName {
  readonly id: string;
  readonly name: string;
}

export interface SoundChoice {
  readonly value: string;
  readonly label: string;
}

/** What plays: a recording, the water synthesized by the tank's size, or the first sound. */
export type ChosenSound =
  | { readonly kind: "recording"; readonly id: string }
  | { readonly kind: "synth" }
  | { readonly kind: "classic" };

const SYNTH_LABEL = "Synthesized water + bubbles";
const CLASSIC_LABEL = "Bubbling water (the first sound)";

/** A recording's label: its name, and the bubbles that play over it. */
const recordingLabel = (sound: SoundName): string => `${sound.name} + bubbles`;

/**
 * The sounds the viewer may choose, each named after what plays: the
 * scene's own first, then every recording, the synthesized water and the
 * aquarium's first sound.
 */
export function soundChoices(
  sounds: readonly SoundName[],
  sceneAmbience: string | undefined,
): SoundChoice[] {
  const scenes = sounds.find((sound) => sound.id === sceneAmbience);
  return [
    {
      value: SCENE_SOUND,
      label: `The scene's: ${scenes === undefined ? SYNTH_LABEL : recordingLabel(scenes)}`,
    },
    ...sounds.map((sound) => ({ value: sound.id, label: recordingLabel(sound) })),
    { value: SYNTH_SOUND, label: SYNTH_LABEL },
    { value: CLASSIC_SOUND, label: CLASSIC_LABEL },
  ];
}

/**
 * What plays, from the viewer's choice (the scene's own when absent) and
 * the scene's ambience; a recording that is not there gives way to the
 * synthesized water.
 */
export function chosenSound(
  choice: string | undefined,
  sceneAmbience: string | undefined,
  sounds: readonly SoundName[],
): ChosenSound {
  if (choice === CLASSIC_SOUND) return { kind: "classic" };
  if (choice === SYNTH_SOUND) return { kind: "synth" };
  const wanted = choice === undefined || choice === SCENE_SOUND ? sceneAmbience : choice;
  return sounds.some((sound) => sound.id === wanted) && wanted !== undefined
    ? { kind: "recording", id: wanted }
    : { kind: "synth" };
}
