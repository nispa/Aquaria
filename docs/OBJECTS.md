# Plants and objects

_Italian version: [OGGETTI.md](OGGETTI.md)._

Every plant and object in the tank is a folder: an `object.json` that says
what it is, and, if you like, a 3D model that Blender or any glTF viewer
can open. Without a model, Aquaria draws the object itself with one of its
generators, a little different each time.

A new folder is a new kind of object, usable in any scene. No code needed.

## The folder

```
public/assets/objects/<id>/
  object.json      what it is (required)
  model.glb        the 3D model (optional)
```

The folder name is the `kind` scenes use, for example `driftwood`.

## object.json

The driftwood's:

```json
{
  "name": "Driftwood",
  "category": "object",
  "color": "#5a4636",
  "material": { "file": "../../materials/mossy-wood/material.json", "tileSize": 0.35 },
  "recipe": { "generator": "driftwood" },
  "traits": {
    "collision": { "across": 0.55, "up": 0.5, "along": 0.48, "sink": -0.02, "lift": 0 },
    "tags": ["wood", "shelter"],
    "placement": { "bands": [1, 3], "size": [0.5, 1.1] }
  }
}
```

| Field      | What it is                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------- |
| `name`     | The name in the panel and in the editor                                                       |
| `category` | `plant` (sways, has a height) or `object` (has a size)                                        |
| `model`    | A `.glb` or `.gltf` file in the folder                                                        |
| `recipe`   | Which of Aquaria's generators draws it, and optionally `seeds` and `params`                   |
| `color`    | Its color, or a list of colors to pick from. `tipColor` tints the tips of a plant             |
| `material` | A surface texture (`file`: the path to a `material.json`, plus `tileSize` and `displacement`) |
| `traits`   | What else Aquaria should know, see below                                                      |
| `credit`   | Needed with a model made by someone else: author, source and license                          |

An object needs a `model` or a `recipe`. With both, Aquaria draws the
recipe and other programs see the model.

A model keeps its own materials; `color` only tints what a recipe draws,
unless the object has the `tint` trait.
If the model has several pieces side by side at the top level, each item
in the tank uses one of them, for variety.

The accepted licenses are the same as for fish: `CC0-1.0`, `CC-BY-3.0`,
`CC-BY-4.0`, `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `0BSD`,
`Unlicense`. Models by others also go in `ASSETS.md`.

## Traits

A trait is something a 3D file cannot say, like "fish can hide in here".
Every value has a default, so `"sway": {}` is fine. A trait Aquaria does
not know is skipped with a warning; a known one with a wrong value stops
the loading and says where.

### `sway`: moves with the current

| Value       | Default   | What it is                                     |
| ----------- | --------- | ---------------------------------------------- |
| `amount`    | `0.05`    | How far the tips move, in meters               |
| `speed`     | `1`       | How fast it sways (1 = normal)                 |
| `attribute` | `"_SWAY"` | Where the model says how much each point sways |

A model whose points also carry `_STRAND`, one value from 0 to 1 per
tentacle, moves its tentacles one by one: each at its own phase and pace,
in a wave from root to tip, while the whole animal slowly opens and
closes; and they part around a fish that dives in. The anemones of
`scripts/blender/anemone.py` have it.

### `collision`: fish swim around it

A rough ellipsoid. Each value is a share of the object's size.

| Value    | Default | What it is                                           |
| -------- | ------- | ---------------------------------------------------- |
| `solid`  | `true`  | `false` for soft things fish go through, like plants |
| `across` | `0.5`   | Half the width                                       |
| `up`     | `0.5`   | Half the height                                      |
| `along`  | `0.5`   | Half the depth                                       |
| `sink`   | `0`     | How far it sinks into the sand (negative = deeper)   |
| `lift`   | `0`     | How high the middle is above the base                |

### `tags`: what it is to a fish

A list of words: `shelter`, `anemone`, `coral`, `plant`, `algae`, `rock`,
`wood`, `shell`… Fish choose places by these words, never by object: a
clownfish looks for an `anemone`, a scared fish for a `shelter`. See
[Swimming styles](SWIMMING.md#places-and-tags).

### `placement`: where it goes and how big

Used when a scene asks for a number of items and lets Aquaria place them.
A scene entry can override any of it.

| Value    | Default    | What it is                                 |
| -------- | ---------- | ------------------------------------------ |
| `on`     | `["sand"]` | What it can stand on: `sand`, `rock`       |
| `bands`  | `[0, 4]`   | Depth bands, 0 at the glass, 4 at the back |
| `size`   | none       | Size range in meters (objects)             |
| `height` | none       | Height range in meters (plants)            |

`clearance` (meters, default `0.2`) is how far it keeps from the glass and
the side walls: hairgrass and moss say `0.02`, so a carpet grows right up
to the glass.

`hug` (default `false`) lays it along the rock it grows on, its top facing
out of the slope, as an encrusting coral does: the encrusting montipora and
the zoanthids say `true`. On the sand it stays upright.

The zoanthids and the encrusting montipora are made by
`scripts/blender/corals.py`: polyps whose discs carry the colours, and a
plate whose tiny polyp pits are a grey texture multiplied by its colours;
the same script stacks those plates into the plating montipora and makes
the green star polyps.
The colonies come from `scripts/blender/colonies.py`: branching corals
(acropora, the cauliflower coral `pocillopora`, the `table-acropora`,
the finger coral `finger-montipora`)
forking to tips of another colour, their corallites a painted texture; a
living brain coral (`platygyra`) folded into meandering ridges and
valleys; a tube sponge; and the torch coral, a plant whose tentacles sway one by one
like the anemones'.

### `tint`: the color tints the model

The item's color multiplies the model's own colors. Made for the coral
scans: bleached museum skeletons with a light grey texture that keeps every
pore, brought back to a living color by `color`. A tinted model also glows
under actinic light, like the corals Aquaria draws itself.

| Value      | Default | What it is                                           |
| ---------- | ------- | ---------------------------------------------------- |
| `strength` | `1`     | 0 keeps the model's colors, 1 takes the item's color |

The staghorn coral's: `"tint": {}`. Its scan was made into an object by
`scripts/blender/coral_scans.py`, which says how in its first lines.

### Adding a trait

1. A file in `src/scene/traits/` made with `defineTrait`: an id, a one-line
   description, and its values with defaults.
2. A line in `TRAITS` (`src/scene/traits/index.ts`) and a test.
3. The code that uses it, in `sim/` or `render/`.
4. A section on this page.

## Surface textures

A texture folder in `public/assets/materials/<id>/` holds `normal.ktx2`,
`surface.ktx2` and a `material.json`:

```json
{
  "name": "Basalt",
  "tileSize": 1,
  "credit": { "author": "…", "source": "https://…", "license": "CC0-1.0" }
}
```

`tileSize` is how big one repeat of the texture is, in meters; a scene can
set its own. How to make a new one: [Making a new texture](SCENES.md#making-a-new-texture).

## Making an object in Blender

1. Model it at real size, in meters, standing on the origin.
2. For a plant, tell Aquaria which parts sway: add an attribute named
   `_SWAY` (Object Data → Attributes → Float, Point) and paint it from 0 at
   the base to 1 at the tips. Without it, higher points sway more.
3. Export as glTF Binary (`.glb`), with Data → Mesh → _Attributes_ ticked
   so `_SWAY` is saved.
4. Make the folder, put the `.glb` in it and write `object.json`.
5. To compress it, `npx @gltf-transform/cli optimize model.glb model.glb
--compress meshopt --join false --flatten false`: without the last two,
   the variants side by side are merged into one wide plant.
   `--texture-compress webp` keeps a texture small inside the file.

The freshwater plants are made in code this way
(`scripts/blender/freshwater_plants.py` and `epiphytes.py`). A leaf's
points carry its colors, green at the base and red at the tips of the
Rotala; its veins are a grey texture painted by
`scripts/blender/leafpaint.py` (a pale midrib, side veins, a lighter
rim), which Aquaria multiplies by those colors. Each plant says how its
leaves are veined in `LEAVES`, for example the Cryptocoryne:

```python
"cryptocoryne": dict(midrib=1.0, veins="pinnate", count=7, vein=0.72, slope=0.5, mottle=0.08, rim=0.05),
```

## Turning generated objects into files

```bash
pnpm export:objects [scene.json ...]
```

Saves every object drawn by a recipe as a `model.glb` in its folder (three
variants side by side, real size, with `_SWAY` on plants), so it can be
opened and changed in Blender. Scenes with block rock are saved too, as
`<scene>-blocks.glb`.
