import type { z } from "zod";

/**
 * A trait is an Aquaria feature of a plant or object that a standard 3D file
 * cannot say: how it sways, how fish bump into it, what it is to them, where
 * it goes in a tank. Other programs ignore traits; Aquaria carries them out.
 * Each trait is one file in this folder, registered by id in `TRAITS`, with
 * a schema that gives every parameter a default. See docs/OBJECTS.md.
 */
export interface Trait<Schema extends z.ZodType> {
  /** The key in `object.json`'s `traits`. */
  readonly id: string;
  /** One line for the docs and error messages. */
  readonly summary: string;
  readonly schema: Schema;
}

/** Declares a trait; typed, so the parsed parameters keep their types. */
export function defineTrait<Schema extends z.ZodType>(trait: Trait<Schema>): Trait<Schema> {
  return trait;
}
