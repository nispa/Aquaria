import type { Logger } from "../core/logger";
import type { Rng } from "../core/rng";
import type { TankSize } from "../scene/tankMeasures";
import {
  AMBIENCES,
  FEED_SOUND,
  nextBubble,
  recordingLevel,
  SWITCH_SOUNDS,
  TAP_SOUND,
  type SwitchSoundId,
} from "./recipes";

/**
 * Plays the aquarium's sounds with Web Audio (recipes in audio/recipes):
 * the bubbling of the water all along, and short sounds for taps, food and
 * the tools. Browsers only allow sound after the viewer's first click or key,
 * so nothing plays before `unlock`.
 */

export type SoundId = "tap" | "feed" | SwitchSoundId;

export interface SoundBoard {
  /** Starts the sound on the viewer's first gesture; harmless to call again. */
  unlock(): void;
  play(id: SoundId): void;
  /** Whether the water bubbles (more bubbles) or is still. */
  setBubbling(bubbling: boolean): void;
  /** The size of the tank, which the water's sound follows (recipes' AMBIENCES). */
  setTankSize(size: TankSize): void;
  /**
   * A recording that loops instead of the synthesized hush, at its
   * manifest's `level`; undefined goes back to the hush. One that cannot be
   * loaded is skipped with a warning, and the hush plays.
   */
  setRecording(url: string | undefined, level?: number): void;
  /** 0 silent .. 1 full. */
  setVolume(volume: number): void;
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

/** Seconds of noise looped for the water's hush. */
const NOISE_SECONDS = 2;
/** Volume ramps take this long, s, so changes never click. */
const RAMP_SECONDS = 0.15;
/** A gain this small counts as silence for exponential ramps. */
const SILENT = 0.0001;
const MS_PER_SECOND = 1000;

export function createSoundBoard(rng: Rng, logger?: Logger): SoundBoard {
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let hush: GainNode | undefined;
  let hushFilter: BiquadFilterNode | undefined;
  let ambience = AMBIENCES.medium;
  let size: TankSize = "medium";
  let recordingUrl: string | undefined;
  let recordingManifestLevel = 1;
  let recording: { source: AudioBufferSourceNode; gain: GainNode } | undefined;
  let noise: AudioBuffer | undefined;
  let bubbling = true;
  let volume = 1;
  let enabled = true;
  let bubbleTimer: number | undefined;

  const masterLevel = (): number => (enabled ? volume : 0);

  /** A sine sweeping from `fromHz` to `toHz` with a quick attack and a fading tail. */
  const tone = (fromHz: number, toHz: number, seconds: number, level: number, delay = 0): void => {
    if (context === undefined || master === undefined) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    oscillator.frequency.setValueAtTime(fromHz, start);
    oscillator.frequency.exponentialRampToValueAtTime(toHz, start + seconds);
    const gain = context.createGain();
    gain.gain.setValueAtTime(SILENT, start);
    gain.gain.exponentialRampToValueAtTime(level, start + seconds * 0.1);
    gain.gain.exponentialRampToValueAtTime(SILENT, start + seconds);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + seconds);
  };

  /** A short burst of filtered noise: a click or a tick. */
  const tick = (hz: number, seconds: number, level: number, delay = 0): void => {
    if (context === undefined || master === undefined || noise === undefined) return;
    const start = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = hz;
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(SILENT, start + seconds);
    source.connect(filter).connect(gain).connect(master);
    source.start(start, rng.range(0, NOISE_SECONDS - seconds));
    source.stop(start + seconds);
  };

  const scheduleBubble = (): void => {
    const bubble = nextBubble(rng, bubbling, ambience);
    bubbleTimer = window.setTimeout(() => {
      if (enabled) tone(bubble.startHz, bubble.endHz, bubble.seconds, bubble.level);
      scheduleBubble();
    }, bubble.delaySeconds * MS_PER_SECOND);
  };

  // A recording takes the hush's place.
  const hushLevel = (): number =>
    recording !== undefined ? 0 : bubbling ? ambience.hush.bubblingLevel : ambience.hush.stillLevel;

  const tuneHush = (): void => {
    if (hushFilter === undefined) return;
    hushFilter.type = ambience.hush.filter;
    hushFilter.frequency.value = ambience.hush.hz;
    hushFilter.Q.value = ambience.hush.q;
  };

  const ramp = (node: GainNode | undefined, level: number): void => {
    if (context === undefined || node === undefined) return;
    node.gain.setTargetAtTime(level, context.currentTime, RAMP_SECONDS / 3);
  };

  const stopRecording = (): void => {
    recording?.source.stop();
    recording?.source.disconnect();
    recording?.gain.disconnect();
    recording = undefined;
  };

  /** Loads and loops the wanted recording, if it is still wanted once it has arrived. */
  const startRecording = (): void => {
    stopRecording();
    ramp(hush, hushLevel());
    const url = recordingUrl;
    if (context === undefined || master === undefined || url === undefined) return;
    const audio = context;
    fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
        return audio.decodeAudioData(await response.arrayBuffer());
      })
      .then((buffer) => {
        if (url !== recordingUrl || master === undefined) return;
        const source = audio.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gain = audio.createGain();
        gain.gain.value = SILENT;
        source.connect(gain).connect(master);
        source.start();
        recording = { source, gain };
        ramp(gain, recordingLevel(recordingManifestLevel, size));
        ramp(hush, hushLevel());
      })
      .catch((error: unknown) => {
        logger?.warn("The recorded ambience could not be played; the synthesized hush plays.", {
          url,
          error: String(error),
        });
      });
  };

  return {
    unlock() {
      if (context !== undefined) {
        void context.resume();
        return;
      }
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = masterLevel();
      master.connect(context.destination);
      noise = context.createBuffer(1, context.sampleRate * NOISE_SECONDS, context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) samples[index] = rng.range(-1, 1);
      // The water's hush: looped noise, filtered down to a rumble or a soft rush.
      const source = context.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      hushFilter = context.createBiquadFilter();
      tuneHush();
      hush = context.createGain();
      hush.gain.value = hushLevel();
      source.connect(hushFilter).connect(hush).connect(master);
      source.start();
      scheduleBubble();
      startRecording();
    },
    play(id) {
      if (!enabled || context === undefined) return;
      if (id === "tap") {
        tone(TAP_SOUND.thudHz, TAP_SOUND.thudEndHz, TAP_SOUND.thudSeconds, TAP_SOUND.thudLevel);
        tick(TAP_SOUND.clickHz, TAP_SOUND.clickSeconds, TAP_SOUND.clickLevel);
        return;
      }
      if (id === "feed") {
        for (let index = 0; index < FEED_SOUND.ticks; index += 1) {
          tick(
            rng.range(FEED_SOUND.tickHz[0], FEED_SOUND.tickHz[1]),
            FEED_SOUND.tickSeconds,
            FEED_SOUND.level,
            rng.range(0, FEED_SOUND.spreadSeconds),
          );
        }
        return;
      }
      const sound = SWITCH_SOUNDS[id];
      tone(sound.hz, sound.endHz, sound.seconds, sound.level);
    },
    setBubbling(next) {
      bubbling = next;
      ramp(hush, hushLevel());
    },
    setTankSize(next) {
      size = next;
      ambience = AMBIENCES[next];
      tuneHush();
      ramp(hush, hushLevel());
      ramp(recording?.gain, recordingLevel(recordingManifestLevel, size));
    },
    setRecording(url, level = 1) {
      if (url === recordingUrl && level === recordingManifestLevel) return;
      recordingUrl = url;
      recordingManifestLevel = level;
      startRecording();
    },
    setVolume(next) {
      volume = next;
      ramp(master, masterLevel());
    },
    setEnabled(next) {
      enabled = next;
      ramp(master, masterLevel());
    },
    dispose() {
      stopRecording();
      window.clearTimeout(bubbleTimer);
      void context?.close();
    },
  };
}
