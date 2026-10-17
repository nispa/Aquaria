# Plants and objects as files

_Italian version: [OGGETTI.md](OGGETTI.md)._

A plant or an object of the tank is a folder of data, like a species: a
standard 3D model any program opens (Blender, Godot, a glTF viewer), plus
`object.json`, which says what Aquaria does with it. The model is optional:
an object may be drawn instead by one of Aquaria's generators, the
procedural plants and objects it builds in code, a different variant each
time.

> Status: the contract below is defined and validated (`src/scene/`). The
> tank starts reading object folders in roadmap step E2, when today's kinds
> (`rock`, `kelp`…) become folders; exporting recipes to `.glb` is E3.

## The folder

```
public/assets/objects/<id>/
  object.json      what it is and what Aquaria does with it (required)
  model.glb        the 3D model (optional)
public/assets/materials/<id>/
  material.json    name, tile size, credit
  normal.ktx2      normal map
  surface.ktx2     R displacement, G roughness, B brightness detail
```

The folder name is the object's id, the `kind` a scene uses for it.
`object.json` is the source of truth: a model without one is not an object.

## object.json

```json
{
  "name": "Ludwigia",
  "category": "plant",
  "model": "model.glb",
  "material": "../../materials/mossy-wood/material.json",
  "recipe": { "generator": "stem", "seeds": [0, 999] },
  "traits": {
    "sway": { "amount": 0.08 },
    "collision": { "solid": false },
    "tags": ["plant", "shelter"],
    "placement": { "on": ["sand"], "bands": [1, 3], "height": [0.2, 0.4] }
  },
  "credit": { "author": "…", "source": "https://…", "license": "CC0-1.0" }
}
```

| Field      | Meaning                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `name`     | Shown in the panel and the editor's palette.                                                                                          |
| `category` | `plant` (grows, sways, has a height) or `object` (set down, has a size).                                                              |
| `model`    | A `.glb` or `.gltf` file inside the folder.                                                                                           |
| `material` | A `material.json`, by a path relative to this file. It must stay inside `assets/`.                                                    |
| `recipe`   | One of Aquaria's generators (`generator`, any flora or prop kind of today), the `seeds` variants are drawn from, and its `params`.    |
| `traits`   | Aquaria features by id, see below.                                                                                                    |
| `credit`   | Required with a model: author, source URL and a license that allows reuse, changes and redistribution, also commercially (see below). |

An object needs a `model` or a `recipe`. With both, Aquaria draws the
recipe's variants and the model is what other programs see, and the
fallback.

Licenses: `CC0-1.0`, `CC-BY-3.0`, `CC-BY-4.0`, `MIT`, `Apache-2.0`,
`BSD-2-Clause`, `BSD-3-Clause`, `0BSD`, `Unlicense`. Every third-party model
is also listed in `ASSETS.md`.

## Traits

A trait is a feature a 3D file cannot say. Each is one file in
`src/scene/traits/`, registered by id in `TRAITS`, with a default for every
parameter: `"sway": {}` is a valid trait. A trait Aquaria does not know
(another program's, or a newer Aquaria's) is skipped with a warning in the
console; a known one with wrong parameters stops the load with a message
saying where.

### `sway`: sways in the current like a plant

| Parameter   | Default   | Meaning                                                  |
| ----------- | --------- | -------------------------------------------------------- |
| `amount`    | `0.05`    | How far the tips move, as a share of the height (0..1).  |
| `speed`     | `0.6`     | Sways per second at a steady current.                    |
| `attribute` | `"_SWAY"` | The model's per-point sway weights, see _Painting sway_. |

### `collision`: fish swim round it

An ellipsoid, each measure a share of the object's size (its rough
diameter).

| Parameter | Default | Meaning                                                    |
| --------- | ------- | ---------------------------------------------------------- |
| `solid`   | `true`  | `false` for soft things fish swim through, like plants.    |
| `across`  | `0.5`   | Half the width (x).                                        |
| `up`      | `0.5`   | Half the height (y).                                       |
| `along`   | `0.5`   | Half the depth (z).                                        |
| `sink`    | `0`     | How far the base sinks into the sand (negative sinks).     |
| `lift`    | `0`     | Height of the middle above the base (a table coral's top). |

### `tags`: what it is to a fish

A list, default empty: `shelter`, `anemone`, `coral`, `plant`, `algae`,
`rock`, `wood`… Fish look for places by tag, never by object (a clownfish
keeps to an `anemone`); a scene entry may retag its items. See
[Swimming styles](SWIMMING.md).

### `placement`: where it goes and how big it comes

Used when a scene asks for a number of them and leaves the spots to chance;
a scene entry may override any of it.

| Parameter | Default    | Meaning                                       |
| --------- | ---------- | --------------------------------------------- |
| `on`      | `["sand"]` | What it may stand on: `sand`, `rock`.         |
| `bands`   | `[0, 4]`   | Depth bands, 0 at the glass to 4 at the back. |
| `size`    | none       | Rough diameter range, m (objects).            |
| `height`  | none       | Height range, m (plants).                     |

### Adding a trait

1. A file in `src/scene/traits/` built with `defineTrait`: id, a one-line
   summary, a Zod schema with a default for every parameter.
2. Its line in `TRAITS` (`src/scene/traits/index.ts`) and a test.
3. The code that carries it out, in `sim/` or `render/`, reading
   `manifest.traits.<id>`.
4. A section in this file.

## material.json

```json
{
  "name": "Basalt",
  "tileSize": 1,
  "credit": { "author": "…", "source": "https://…", "license": "CC0-1.0" }
}
```

`textures` (`normal`, `surface`) defaults to `normal.ktx2` and
`surface.ktx2` in the folder. `tileSize` is the size of one texture tile in
meters; a scene entry's own `tileSize` wins.

## Making an object in Blender

1. Model at real size, in meters, standing on its base at the origin, with
   +Y up (the glTF exporter turns Blender's +Z up into +Y).
2. For a plant, paint how much each point sways: add a generic attribute
   named `_SWAY` (Object Data, Attributes, Float, Point) and paint it from 0
   at the base to 1 at the tips. Without it, points sway more the higher
   they are.
3. Export as glTF Binary (`.glb`) with Data, Mesh, _Attributes_ ticked, so
   `_SWAY` goes into the file.
4. Make the folder, put the `.glb` in it and write `object.json`; add the
   credit to `ASSETS.md` if the model is not your own.
