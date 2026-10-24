# Writing scenes and species

_Italian version: [SCRIVERE_SCENE.md](SCRIVERE_SCENE.md)._

The scene editor (`E`) covers most of what a scene can hold. This page is
for when you want to open the files themselves: to ship a new scene with
Aquaria, to add a species, or to set something the editor does not show.

Every file is checked when it loads. If something is wrong, the aquarium
stops and tells you which field, in which file.

## Where things are

| File                            | What it holds                                          |
| ------------------------------- | ------------------------------------------------------ |
| `public/scenes/<id>.json`       | One scene                                              |
| `public/scenes/index.json`      | The scenes in the panel, in groups; first = default    |
| `public/species.json`           | Every species                                          |
| `public/assets/objects/<id>/`   | One plant or object ([Plants and objects](OBJECTS.md)) |
| `public/assets/species/<id>/`   | A species' 3D model ([3D fish models](FISH_MODELS.md)) |
| `public/assets/materials/<id>/` | A surface texture: sand, rock, wood                    |
| `public/looks/<id>.json`        | A look: exposure, sun, effect settings ([Look](#look)) |

On a phone, Aquaria opens the scene named `phone` in `index.json` (the
Nano reef, a small tank a phone draws well) unless the URL or the viewer's
last choice names another.

A scene you save in the editor lives in the browser, not in these files.
To ship it, use **Export JSON** in the editor's Scene tab, copy the file to
`public/scenes/` and add its id to `index.json`.

## Measures

Everything is in meters. `x` runs along the glass, `y` from the sand up to
the surface, `z` from the glass towards the back.

Depth is also split into five **bands**: 0 is right behind the glass, 4 is
at the back. Plants, objects and fish use bands to say where they belong.

## A scene

A short but complete one:

```jsonc
{
  "id": "reef",
  "name": "Tropical reef",
  "seed": 20260929,
  "tank": { "width": 5.4, "height": 3, "depth": 4 },
  "water": { "color": "#0a5a7a", "fogDensity": 0.13 },
  "light": { "color": "#fff4dc", "intensity": 1.3, "caustics": { "intensity": 0.9, "scale": 1.4 } },
  "current": { "direction": [1, 0, 0.2], "strength": 0.04, "turbulence": 0.35 },
  "backdrop": { "type": "gradient", "top": "#1a86a8", "bottom": "#021a2a" },
  "floor": { "color": "#d8c49a" },
  "flora": [
    { "kind": "kelp", "count": 10, "bands": [3, 4], "height": [1.4, 2.7], "color": "#5a9a3e" },
  ],
  "props": [{ "kind": "brain-coral", "count": 4, "color": "#b8a05a" }],
  "fauna": [{ "species": "sardine", "count": 45 }],
}
```

- `seed` decides the random layout. Same seed, same tank.
- `water.fogDensity` is how murky the water is. `water.surface` (0 to 1)
  is how much you see of the surface from below; keep it low for
  aquariums. `water.bubbles: false` removes the bubble streams.
- `current` bends the plants, moves the particles and pushes the fish a
  little.

### Plants and objects

`flora` holds plants, `props` holds everything else. Each entry is a group
of the same kind:

```json
{ "kind": "driftwood", "count": 3, "bands": [1, 2], "color": "#5a4636" }
```

- `kind` is the name of a folder in `public/assets/objects/`: `kelp`,
  `seagrass`, `anemone`, `carpet`, `fern`, `stem`, `rock`, `shell`,
  `brain-coral`, `driftwood`, `pebble` and more. Look at the folder for the
  full list. A new folder is a new kind.
- `count`, `bands` and `color` say how many, where and in what color.
  `color` can also be a list: each item picks one.
- `height` (plants) or `size` (objects) is a `[min, max]` range in meters.
  Without it, the object's own default is used.
- `tipColor` tints the top of a plant's leaves.
- `name` is the label in the panel.
- `tags` replaces what the item means to the fish, for example to turn a
  pile of rocks into a hiding place: `"tags": ["rock", "shelter"]`. See
  [Swimming styles](SWIMMING.md#places-and-tags).

Items go to random spots in their bands. To choose the spots yourself, list
them in `at`; the entry then places one item per spot:

```json
{
  "kind": "anemone",
  "count": 2,
  "at": [
    { "x": -0.8, "z": -0.6 },
    { "x": 1.2, "z": -1.1, "rotation": 30 }
  ]
}
```

`x` is measured from the middle of the tank, `z` from the glass. A spot may
also set `height`, `size`, or `y` to raise the item off the sand (in a cave,
for example). Otherwise it stands on whatever is below it.

### Surfaces

The floor, and any entry of rocks or wood, can use a photographic texture:

```json
"floor": { "color": "#c8b48a", "material": { "id": "fine-sand", "tileSize": 0.6 } }
```

`tileSize` is how big one repeat of the texture is, in meters.
`displacement` (meters) makes the surface bumpy. The `color` still sets the
tint. The textures available are the folders in `public/assets/materials/`:
sands and gravels (`fine-sand`, `coarse-sand`, `aquarium-gravel`,
`black-gravel`, `aqua-soil`), rocks (`reef-rock`, `limestone`, `dark-slate`,
`layered-rock`, `basalt`, `red-rock`, `mossy-rock`) and woods (`driftwood`,
`rough-bark`, `mossy-wood`).

### Rock

There are two ways to build rock:

- `blocks`: rock made of cubes, smoothed into stone with caves and
  overhangs. This is what the editor builds. You will rarely write it by
  hand: build it in the editor and export the scene.
- `rockwork`: an older, generated reef ridge that winds across the tank. It
  takes `bands`, a crest `height` range, `coverage` (how much of the width
  it covers), `thickness`, `rocks`, `color` and `material`. The editor can
  turn it into blocks.

Plants and objects with `"on": "rockwork"` grow on the rock instead of the
sand, within their entry's `bands`: a bank in the middle and the tops of the
pillars behind it can each have their own corals. Where the rock has no
spot in the bands, they grow on the sand.

Both can be live rock: `growth` paints algae on the faces turned to the
light, crusts of pink coralline algae in patches, and darker crevices under
the overhangs. `"growth": {}` takes the defaults; the Hero scene uses them.

| Value            | Default   | What it is                               |
| ---------------- | --------- | ---------------------------------------- |
| `algae`          | `0.6`     | How much of the upward faces algae cover |
| `algaeColor`     | `#4d6b2c` | Their color                              |
| `coralline`      | `0.3`     | How much of the rock coralline crusts    |
| `corallineColor` | `#b4708e` | Their color                              |
| `patch`          | `0.35`    | Size of the patches, m                   |

The Hero scene's pillars are generated by `scripts/hero_pillars.py`: change
the pillars there and run it again on `public/scenes/hero.json`.

### Lights

A scene can suggest its own lights. The viewer can change them in the
panel; this is what **Recommended** goes back to.

```jsonc
"lights": {
  "channels": { "white": { "level": 1 }, "blue": { "level": 0.2 }, "violet": { "level": 0 } },
  "moon": 0.05,
  "fixture": { "type": "sun" },
  "cycle": { "mode": "clock", "sunrise": 8, "sunset": 20, "ramp": 1.5 }
}
```

- `channels`: white, blue, violet and a free `accent` color, each with a
  `level` and optionally a `color`.
- `fixture`: `{ "type": "sun" }` for an open sea, or
  `{ "type": "spots", "spots": 6 }` for a row of LED spots over the tank.
- `cycle.mode`: `startup` (the hour the aquarium was opened, then still),
  `fixed` (always `hour`), `clock` (the real time) or `accelerated` (a whole
  day every `minutes`). `sunrise` and `sunset` are hours; `ramp` is how long
  dawn and dusk last, in hours.

All fields are optional; the [User guide](USER_GUIDE.md#light)
explains what they look like.

### Look

A scene can name a look, a file in `public/looks/`: `"look": "hero"`. The
look says how the scene is drawn: how bright, where the sun is, and the
settings of the effects. The Hero scene uses `public/looks/hero.json`:

```jsonc
{
  "name": "Hero",
  "exposure": 0.72,
  "sun": [0.02, 0.62, -1],
  "features": { "waves": true },
  "effects": {
    "underwater": { "strength": 1, "absorption": [0.5, 0.24, 0.2], "shafts": 0.9 },
    "finish": { "vignette": 0.75, "contrast": 1.15, "saturation": 1.15 },
  },
}
```

- `exposure`: below 1 is darker. Without a look it is 1.05.
- `snow`: how much marine snow drifts in the water, from 0 (crystal
  clear, a home tank) through 1 (the open sea, also without a look) to 3
  (murky).
- `sun`: where the sunlight comes from, seen from the middle of the tank
  (`x` right, `y` up, `z` towards the glass). Here it is high and behind,
  so it shines through the surface at the top of the picture.
- `features`: what the scene starts with on (`true`) or off (`false`).
  The viewer's own switches in the panel still win.
- `effects`: settings by effect id. What is left out keeps its default.
  The [effects](EFFECTS.md) list their settings.

The Planted tank and the Iwagumi wear `public/looks/planted.json`, a home
tank of fresh water: clear water that hardly fades, no marine snow, no
sunbeams, no waves, a white light from straight above. The look alone is
not enough for that: the scene also gives the water a dark grey-green
`color` with little fog (`fogDensity` 0.12), a quiet `surface` (0.08), a
near-black backdrop and a `"sun"` fixture, so no row of spots shows above
the water.

The looks listed in `public/looks/index.json` can also be chosen in the
panel's Look section for any scene, with a slider for every setting.

The `underwater` effect is what makes open water: red fades first, far
things melt into the water's own light, and sunbeams fan out from the sun.
It stays off unless a look sets its `strength`.

## A species

Species are in `public/species.json`. This is the royal gramma, as it is in the file:

```json
{
  "id": "royal-gramma",
  "name": "Royal gramma",
  "body": {
    "type": "procedural",
    "shape": "slender",
    "pattern": "split",
    "colors": { "base": "#8a2bd8", "accent": "#ffc21a" }
  },
  "model": "royal-gramma",
  "length": { "mean": 0.08, "standardDeviation": 0.008 },
  "speed": { "cruise": 0.15, "max": 0.45 },
  "schooling": 0,
  "bands": [0, 2],
  "heightRange": [0.08, 0.35],
  "behavior": { "appetite": 0.6, "curiosity": 0.2, "shyness": 0.8, "hiding": 0.9, "torch": -0.8 },
  "swim": { "style": "hover" },
  "activities": { "inspect": { "weight": 0.6, "tags": { "shelter": 1, "rock": 0.4 } } }
}
```

- `body` is the fish drawn by Aquaria itself, always there and light on the
  GPU. `shape`: `disc`, `round`, `slender`, `tall` or `banner`. `pattern`:
  `belly`, `tail`, `bands`, `split`, `eye-bar`, `stripes`, `bars` or `idol`.
  Shrimps and crabs use `"category": "crustacean"` with shape `shrimp`,
  `crab` or `hermit-crab`.
- `model` (optional) is a folder with a 3D model. The viewer can switch
  between the model and the procedural body for each species.
- `coloring` (optional) is which colorings of the model the fish wear: one
  id, or several with weights, so a school mixes strains (see
  [FISH_MODELS.md](FISH_MODELS.md)).
- `length` is the real length in meters. Each fish gets its own, around the
  `mean`.
- `speed` is in meters per second: the usual pace and the top speed.
- `schooling`: 0 swims alone, 1 stays in a tight school.
- `bands` and `heightRange` (0 = sand, 1 = surface) are where it lives.
- `maxCount` (optional) caps how many the panel lets you add.
- `behavior`, each from 0 to 1: `appetite`, `curiosity` (how many come to
  look at your finger), `shyness` (how far away a tap scares it), `hiding`
  (how many run to a shelter when scared), `torch` (-1 flees the torch, 1
  loves it) and `active` (`day`, `night` or `always`). They are explained
  in [Playing with the fish](INTERACTION.md#who-reacts-and-how-much).
- `swim` and `activities` say how it moves and what it does all day. They
  have [their own page](SWIMMING.md).

### Fish size

Real lengths are kept in the file. How big fish look is the viewer's
choice: **Fish size** in the panel's Fauna section pulls every species
towards the same size. At 0% fish are true to life, so a neon tetra next to
a tang is tiny; at 100% they are all the same size. The default is 60%.

## Making a new texture

Surface textures are KTX2 files, which stay compressed on the GPU and take
about a quarter of the memory of a PNG. A script makes them from CC0
photos:

```bash
python scripts/build_materials.py            # all of them
python scripts/build_materials.py reef-rock  # just one
```

It needs Python 3 with Pillow and NumPy, and the `ktx` tool from
KTX-Software (install it, or unpack it into the ignored `tools/ktx/`
folder). To add one, add its source to `MATERIALS` in the script, run it,
and credit the source in `ASSETS.md`.
