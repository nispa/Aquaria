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
