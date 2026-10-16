import type { Rng } from "../core/rng";
import {
  FEED_SOUND,
  nextBubble,
  SWITCH_SOUNDS,
  TAP_SOUND,
  WATER_HUSH,
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

export function createSoundBoard(rng: Rng): SoundBoard {
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let hush: GainNode | undefined;
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
    const bubble = nextBubble(rng, bubbling);
    bubbleTimer = window.setTimeout(() => {
      if (enabled) tone(bubble.startHz, bubble.endHz, bubble.seconds, bubble.level);
      scheduleBubble();
    }, bubble.delaySeconds * MS_PER_SECOND);
  };

  const hushLevel = (): number => (bubbling ? WATER_HUSH.bubblingLevel : WATER_HUSH.stillLevel);

  const ramp = (node: GainNode | undefined, level: number): void => {
    if (context === undefined || node === undefined) return;
    node.gain.setTargetAtTime(level, context.currentTime, RAMP_SECONDS / 3);
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
      // The water's hush: looped noise, band-passed down to a soft rush.
      const source = context.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = WATER_HUSH.centerHz;
      filter.Q.value = WATER_HUSH.q;
      hush = context.createGain();
      hush.gain.value = hushLevel();
      source.connect(filter).connect(hush).connect(master);
      source.start();
      scheduleBubble();
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
    setVolume(next) {
      volume = next;
      ramp(master, masterLevel());
    },
    setEnabled(next) {
      enabled = next;
      ramp(master, masterLevel());
    },
    dispose() {
      window.clearTimeout(bubbleTimer);
      void context?.close();
    },
  };
}
