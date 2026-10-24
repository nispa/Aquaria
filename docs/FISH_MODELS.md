# 3D fish models

_Italian version: [MODELLI_PESCI.md](MODELLI_PESCI.md)._

Every species has a body that Aquaria draws by itself. It can also have a
3D model, and the viewer chooses which one to see (the **3D** badge on the
species' card in the panel). The model is only downloaded when it is shown,
and if it fails to load the drawn body stays.

This page covers adding a model you found, and making one in Blender.

## The folder

```
public/assets/species/<id>/
  model.json   how Aquaria should use the model
  model.glb    the model, textures included
  colorings/   optional: one texture per coloring (see Colorings)
```

A `.gltf` with its `.bin` and textures next to it works too. The species
points to the folder with `"model": "<id>"` in `public/species.json`.

## model.json

The platy's, for example:

```json
{
  "name": "Platy",
  "file": "model.glb",
  "forward": "+x",
  "up": "+y",
  "swimAmplitude": 0.08,
  "mouth": { "morphTarget": "MouthOpen" },
  "eyes": { "bones": ["Eye.L", "Eye.R"], "turn": 22 },
  "gills": { "edge": 0.299, "top": 0.069, "bottom": -0.081, "curve": 4 },
  "credit": {
    "author": "Aquaria (fish.json, built by scripts/blender/fishbuild.py)",
    "source": "https://github.com/nispa/Aquaria/blob/main/public/assets/species/platy/fish.json",
    "license": "CC0-1.0"
  }
}
```

(The real file also has `fins` and `colorings`, explained below.)

- `forward` and `up`: which axes of the model point to the snout and to
  the back. Aquaria turns, centres and scales the model to the species'
  length, so any size and orientation will do.
- `swimAmplitude`: how far the tail sweeps, in body lengths (default 0.07).
  The model needs no swimming animation: Aquaria bends it.
- `mouth`, `eyes`, `gills`, `fins`: optional, see below. Without them the
  mouth stays shut, the eyes stay still and the gills and fins do not move.
- `colorings`: optional, see [Colorings](#colorings-one-model-many-strains).
- `credit`: who made it, where it comes from, and the license. Only
  licenses that allow reuse, changes and commercial use are accepted:
  `CC0-1.0`, `CC-BY-3.0`, `CC-BY-4.0`, `MIT`, `Apache-2.0`, `BSD-2-Clause`,
  `BSD-3-Clause`, `0BSD`, `Unlicense`. List the model in `ASSETS.md` too;
  a test checks it.

The model keeps its own materials and textures, unless its species wears
a coloring.

## Looking at it: the fish on the grid

Run `pnpm dev` and open `/model-viewer.html?id=<species>` (or pick it from
`/debug.html`). It shows the fish from its right side, exactly as the
aquarium draws it, over a grid in body lengths: the tail at -0.5, the snout
at +0.5, the back up.

Sliders on the side move the eyes, the mouth, the gills, the bend of a
turn, the tail and the swimming. Tick **auto** and a slider moves back and
forth on its own. The **3D** box switches between the model and the drawn
body.

This is where you read the positions that `mouth.jaw`, `eyes.painted`,
`gills` and `fins.pectoral` ask for. Two sliders move the pectoral fins:
**Pectoral spread** folds them (-1) and spreads them (1), **Pectoral
beats/s** makes them beat. With `&view=top` in the address the fish is
seen from above, and the grid's horizontal lines read z: that is where you
measure how far the fin stands out from the body.

## A model you found

Downloaded models are often heavy. Before adding one, compress it with
[glTF Transform](https://gltf-transform.dev) (it needs KTX-Software on the
`PATH`, see [Making a new texture](SCENES.md#making-a-new-texture)):

```bash
pnpm dlx @gltf-transform/cli@4.5.1 optimize source.glb public/assets/species/<id>/model.glb --compress meshopt --texture-compress ktx2 --texture-size 1024
```

Aim for 5,000 to 20,000 triangles. Scans of real specimens are usually
much heavier, and tend to look dead in the water: they often work badly.

Such a model usually has its eyes painted on, and no open-mouth pose. You
can still make it look around, eat and breathe, with positions read on the
grid:

```json
"mouth": { "jaw": { "start": 0.43, "line": -0.01, "drop": 0.02 } },
"eyes": { "painted": { "center": [0.37, 0.137], "radius": 0.024, "pupil": 0.72, "iris": "#d6dee6" } },
"gills": { "edge": 0.28, "top": 0.17, "bottom": -0.06, "curve": 3 }
```

- `mouth.jaw`: everything in front of `start` and below `line` (where the
  lips meet) drops, up to `drop` at the tip of the snout.
- `eyes.painted`: a new eye drawn over the painted one, on both sides. Make
  `radius` big enough to cover the old pupil. `pupil` is the pupil's share
  of the eye (default 0.65); it moves with the gaze.
- `gills`: the back edge of the gill cover (`edge`), how high and low it
  goes (`top`, `bottom`), and how curved it is (`curve`, 0 is straight). It
  lifts by `open` (default 0.006) about once a second (`rate`), each fish
  at its own moment.

### Pectoral fins

The pectoral fins are the ones behind the gills. A clownfish hovering over
its anemone beats them one after the other, three or four times a second;
swimming, it pushes with its tail and the pectoral fins row along together,
more gently; in a dash it folds them against its body; to brake it spreads
both, and in a turn it spreads the one on the inside. This holds for every
fish: the same shader moves the fins of every model and every drawn body.
A model only has to say where they are, like the clownfish:

```json
"fins": {
  "pectoral": {
    "root": [[0.21, 0.04], [0.17, -0.095]],
    "side": 0.095,
    "front": 0.225,
    "back": 0.025,
    "top": 0.12,
    "bottom": -0.11,
    "rest": 35,
    "sweep": 35
  }
}
```

- `front`, `back`, `top`, `bottom`: a box on the side (x and y) that holds
  the whole fin and no other.
- `side`: how far from the middle of the body (z, on the view from above)
  the fin starts. In the box only what stands out beyond it moves: the
  flank stays still. Aquaria blends the fin into the body over the last
  0.015 before `side`, so set it about 0.017 beyond the widest skin in the
  box, not on the skin: there, the flank swings out with the fin like a
  wing (seen from above, with **Pectoral spread** at 1).
- `root`: the top and bottom ends of the fin's base, the line it swings
  about.
- `rest`: how many degrees the model's fin stands out from the body
  (default 30); folded, it swings back by that much and lies on the flank.
- `sweep`: how many degrees it swings in a full beat (default 35).

Check it on the viewer with **Pectoral spread** at -1 (the fin should lie
on the body without going through it) and at 1. The drawn body has
pectoral fins of its own, moving the same way. A model made in Blender
can have them as sheets apart from the body: the box finds them all the
same. The sheet must start on the skin, not inside it, or `side` cannot
tell it from the flank: `pectoral_fin` in `scripts/blender/fishkit.py`
sets its base on the skin and leans it out by 30 degrees, as on the
royal gramma, and the scripts print the whole `fins.pectoral` block.

A fish whose mouth pushes forward when it opens, like the seabream or the
barramundi, looks wrong with `jaw`. It needs a real open-mouth pose made in
Blender: `scripts/blender/seabream.py` takes it from the model's own jaw
animation, `scripts/blender/barramundi.py` shapes it by hand.

## Making a fish in Blender

### From a recipe

The guppy, platy, angelfish, royal gramma, sardine and harlequin rasbora
are recipes: a
`fish.json` in their folder says what the fish is, and
`scripts/blender/fishbuild.py` builds it in Blender. The platy's, cut
short:

```jsonc
{
  "name": "Platy",
  "body": {
    "top": [
      [0.3, 0.018],
      [0.25, 0.07],
      [0.11, 0.128],
      /* … */ [-0.16, 0.058],
    ],
    "bottom": [
      [0.3, 0.004],
      [0.25, -0.058],
      [0.09, -0.125],
      /* … */ [-0.16, -0.052],
    ],
    "thickness": {
      "half": 0.06,
      "rise": 0.3,
      "power": 0.5,
      "taper": 0.55,
      "taperFrom": 0.35,
      "min": 0.014,
    },
    "roundness": 0.8,
  },
  "eye": {
    "x": 0.235,
    "z": 0.03,
    "radius": 0.027,
    "depth": 0.5,
    "rim": "#3a2a20",
    "iris": "#e0a830",
    "pupil": "#080808",
    "irisEdge": [55, 65],
    "pupilEdge": [28, 34],
  },
  "fins": [
    {
      "id": "dorsal",
      "type": "body",
      "upper": true,
      "start": 0.07,
      "end": -0.085,
      "outline": [
        [0.05, 0.19],
        [0.0, 0.215],
        [-0.06, 0.205],
        [-0.1, 0.15],
        [-0.105, 0.095],
      ],
    },
    {
      "id": "pectoral",
      "type": "pectoral",
      "root": [0.19, -0.035],
      "base": [-0.004, 0.04],
      "length": 0.072,
      "angles": [20, -40],
    },
    // … the tail, the anal and pelvic fins
  ],
  "strains": [
    {
      "id": "mickey-mouse",
      "name": "Mickey Mouse",
      "body": [
        { "type": "fill", "color": "#f6b83a" },
        { "type": "patch", "color": "#d68a18", "bands": [{ "axis": "up", "range": [0.1, 0.85] }] },
        {
          "type": "marks",
          "color": "#111111",
          "amount": 0.95,
          "marks": [
            [-0.1, 0.0, 0.026],
            [-0.132, 0.03, 0.015],
            [-0.132, -0.03, 0.015],
          ],
        },
        { "type": "scales", "size": 0.018, "rim": 0.08 },
      ],
      "fins": {
        "dorsal": {
          "rayed": {
            "web": "#f8c860",
            "ray": "#e0a030",
            "root": "#f0a030",
            "alphaRoot": 0.7,
            "alphaEdge": 0.35,
            "rays": 22,
          },
        } /* … */,
      },
    },
  ],
}
```

- `body`: the outline seen from the side, top and bottom, as (x, z)
  points from the snout to the caudal peduncle, in body lengths (Blender's
  +X is the snout, +Z the back); how thick it is (half the thickness at
  the widest, how far back it grows, how much it tapers) and how round in
  section.
- `eye`, `mouth` (the shape key's reach and drop) and `gills` (where the
  gill cover ends, for `model.json`).
- `fins`: each with an id, its rectangle in the texture, and a type:
  `body` (a dorsal, anal or gonopodium along the top or the bottom),
  `tail`, `pectoral`, `pelvic` (a fan or a blade) or `filament` (the
  angelfish's).
- `texture`: its size and where each part lies on it.
- `strains`: each paints the body with a stack of layers (`fill`,
  `patch`, `edge`, `marks`, `noise`, `noiseLines`, `eyeLine`, `rays`,
  `gillCurve`, `shape`, `scales`) and each fin with a rayed web and layers
  over it (`tint`, `dots`, `noiseLines`, `marks`, `shape`). A `shape` is
  any polygon of side-view points with a soft edge: the harlequin
  rasbora's black wedge, the stripes on its tail. `finPaint` holds fins
  every strain paints the same.

Every field is in `src/scene/fishRecipe.ts`, which a test checks every
recipe against; the layers are drawn by `scripts/blender/fishpaint.py`.
Build into a folder of your own, compress the model into the species'
folder, copy `colorings/`, and merge `model-values.json` (gills, pectoral
fins, colorings) into `model.json`:

```bash
blender --background --python scripts/blender/fishbuild.py -- public/assets/species/platy/fish.json out/platy
pnpm dlx @gltf-transform/cli@4.5.1 optimize out/platy/model.glb public/assets/species/platy/model.glb --compress meshopt --simplify false
```

Without a folder the builder writes into the recipe's own folder,
uncompressed. The red cherry shrimp is still a script of its own,
`scripts/blender/shrimp.py`, on the same building blocks
(`fishkit.py`, `paintkit.py`).

### With the fish maker

With `pnpm dev`, open `/fish-designer.html` (also from `/debug.html`). On
the left the recipe is drawn from the side over a grid in body lengths:
the body in blue, the fins in orange, the eye and the edge of the gill
cover. Choose a photograph of the real fish, seen from the side, and lay
it under the drawing with the sliders (centre, width, opacity, and
_facing left_ for a fish looking the other way). Then drag the points
until the outline follows the photograph: the body's outline, each fin's
outline and where it starts and ends, the roots of the pectoral and
pelvic fins, the eye, and the corners of the open strain's shapes (in
pink).

On the right, _Shape and fins_ holds the numbers you type rather than
drag (thickness, roundness, the eye's size, the fins' angles), and
_Strains_ the paint: a strain's body layers from first to last, which you
move, remove or add, and each fin's painter. _Copy as a new fish_ starts a
new species from the one open.

**Save** checks the recipe and writes it. **Build** saves it, runs Blender
(`$BLENDER`, or the newest one installed where installers put it, or
`blender` on the `PATH`), compresses the model into the species' folder,
writes the colorings, lays the measured values over `model.json`, and
shows the result in the model viewer under the drawing. A new species
also needs its entry in `public/species.json` before the viewer and the
tank can show it.

### By hand

If you model by hand:

1. **Shape.** Snout towards Blender's +X, back towards +Z; then
   `model.json` says `"forward": "+x", "up": "+y"`. Size does not matter.
   Keep the head in the front half: Aquaria keeps the front fifth of the
   body stiff and bends the rest. Fins can be single sheets.
2. **Colors.** Principled BSDF materials, with image textures or vertex
   colors in _Base Color_. Fins look best a little see-through (alpha
   below 1, blend mode _Blended_).
3. **Mouth.** A shape key with the mouth wide open, for example
   `MouthOpen`, named in `"mouth": { "morphTarget": "MouthOpen" }`.
4. **Eyes.** Each eyeball a separate piece. An armature with a root bone
   and one bone per eye (`Eye.L`, `Eye.R`), the head of each eye bone at
   the centre of its eyeball. Weight each eyeball fully to its bone and the
   rest to the root. Then `"eyes": { "bones": ["Eye.L", "Eye.R"] }`. The
   eyes glance the way the fish is about to turn.
5. **Export** as glTF Binary (`.glb`), with +Y Up, shape keys and armature
   on, _Apply Modifiers_ off, and animation off. Then compress it:

   ```bash
   pnpm dlx @gltf-transform/cli@4.5.1 optimize model.glb public/assets/species/<id>/model.glb --compress meshopt --simplify false
   ```

   `--simplify false` keeps the bones, shape keys and colors intact.

6. **Check it** on the grid, then in a tank: press `A` and watch a fish
   turn. Its eyes should move first. If they do not, the eyeballs are
   probably weighted to the root bone.

## Colorings: one model, many strains

Fish of the same shape differ in their colors. A model can list
colorings, each a base-color texture laid on its UVs, and a species
wears one of them or mixes several. The guppy's `model.json`:

```json
"colorings": {
  "half-black-red": { "name": "Half Black Red", "texture": "colorings/half-black-red.webp" },
  "blue-grass": { "name": "Blue Grass", "texture": "colorings/blue-grass.webp" },
  "full-red": { "name": "Full Red", "texture": "colorings/full-red.webp" },
  "yellow-cobra": { "name": "Yellow Cobra", "texture": "colorings/yellow-cobra.webp" }
}
```

and in `public/species.json`:

```json
"model": "guppy",
"coloring": [
  { "id": "half-black-red", "weight": 3 },
  { "id": "blue-grass", "weight": 2 },
  { "id": "full-red", "weight": 2 },
  { "id": "yellow-cobra", "weight": 2 }
]
```

Each fish wears one, three Half Black Red for every two of the others,
and keeps it. A species that wears only one writes
`"coloring": "full-red"`. The shape is downloaded once and the whole
school stays one draw on the GPU: the textures become the layers of one
texture array.

- The textures are PNG, WebP or JPEG files in the model folder, all of
  the same size. Up to 8 colorings per model.
- They replace the texture of every material of the model that has one
  (body and fins); materials without one (the guppy's eyes, colored by
  vertex) stay as they are.
- A coloring the model does not list, or a texture that does not load,
  leaves the model in its own colors, with a warning.
- The fish's card shows the first coloring. To look at another one on
  the grid: `/model-viewer.html?id=guppy&coloring=1`.

**Painting them in code.** A recipe lays the fish out on one square
texture: the body unrolled (along it, and once round it), each fin in its
own rectangle (`Atlas` in `scripts/blender/paintkit.py`). The builder
paints that atlas once per strain with numpy: countershading, faint
scales, rays, fin edges that thin out instead of ending, dots and
snakeskin from noise. A new strain is one more entry in the recipe's
`strains`. The builder writes `model.glb`, `colorings/*.webp` and the
gills and pectoral values for `model.json`, since the fish frame changes
whenever the outline does.

A fish with a single look paints the same way and wears it as its only
coloring: the royal gramma (`"coloring": "classic"`), the angelfish
(`"albino"`) and the sardine (`"silver"`). The builder puts only a tiny
copy of the texture inside `model.glb`, for a species that wears no
coloring.

**Size.** Paint colorings at 1024 × 1024. WebP keeps the download small,
but on the GPU a texture is unpacked: at 1024 a coloring takes about 5 MB
of video memory with its mipmaps, and a species takes that once per
coloring it wears. So Aquaria brings them down as they load, to what the
resolution the tank starts at can show (`src/render/fishTextures.ts`):
whole from 2160 pixels up (4K), 512 from 1440 (QHD), 256 below. The
cards in the panel always use 256, the grid of `/model-viewer.html` the
whole texture.

## Animals that walk

Aquaria does not play animations on fish: it draws a whole school in one
go and bends the bodies itself. Animals that walk are different. If
`model.json` names a walking clip, every individual is drawn as its own
animated model:

```json
"animations": { "walk": "Walk", "hide": "Hide", "speed": 0.4 }
```

- `walk`: the clip played while it walks. It plays at its own pace when the
  animal goes `speed` body lengths a second, faster or slower with it, and
  stops when the animal stops.
- `hide` (optional): a pose it slips into when scared, like a hermit crab
  pulling into its shell.

Each one costs more than a fish, so give such species a `maxCount`.
`scripts/blender/shrimp.py` rigs and animates the shrimp from scratch;
`scripts/blender/hermit_crab.py` gives a downloaded hermit crab a better
walk and its hiding pose.
