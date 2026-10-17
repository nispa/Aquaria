# Making a fish in Blender

A species may have a 3D model next to its procedural body: a folder in
`public/assets/species/<id>/` with a `model.glb` and a `model.json` (the
fields are in the README, "3D fish models"). This guide tells how to make
one in Blender so that Aquaria can swim it, open its mouth and turn its
eyes. `scripts/blender/angelfish.py`, `scripts/blender/guppy.py` and `scripts/blender/platy.py` build
the freshwater angelfish, the guppy and the platy this way, from code, with the shared
pieces in `scripts/blender/fishkit.py`; read them as worked examples.

## What Aquaria does with the model

Aquaria draws every fish of a species in one go on the GPU (instancing), so
it does not play skeletal animations. It takes the model as it stands in
its rest pose and does the rest in its shaders:

- it turns, centres and scales the model to the species' length;
- it bends the rear of the body to swim and to turn (`swimAmplitude`);
- it opens the mouth with a shape key, when the fish eats (`mouth`);
- it turns the eyeballs the way the fish is about to turn (`eyes`);
- it lets the gill covers breathe (`gills`).

An armature is welcome, for the eyes and for other programs, but no
animation is needed. A model from elsewhere, with its eyes only painted on
and no shape keys, can do all of it too, with no Blender at all: see
section 7.

## The fish frame and the model viewer

Places on the fish (an eye, the mouth, the gill covers) are given in the
**fish frame**, the one Aquaria brings every model to: one body length
along x, from the tail at -0.5 to the snout at +0.5, the dorsal fin up
(+y), in body lengths. Read them off the model viewer: run `pnpm dev` and
open

```
http://localhost:5173/model-viewer.html?id=<model folder>
```

It draws the model from its right side, as Aquaria prepares it, with the
fish frame's grid over it. Its URL can also hold `gaze` (-1..1), `mouth`
(0..1), `breath` (0..1) and `zoom=x,y,halfWidth`, to look at the eyes,
the mouth and the gills at their extremes, up close.

## 1. Shape and size

- Model the fish along Blender's **+X** (the snout) with the dorsal fin up
  (**+Z**). The glTF exporter turns +Z up into +Y up, so `model.json` says
  `"forward": "+x", "up": "+y"`. Any other orientation works too: say which
  axes point to the snout and to the dorsal fin.
- The size does not matter: Aquaria scales the fish to the species' length,
  measured from the snout to the tip of the tail.
- Keep the head ahead of the middle of the body: Aquaria keeps the front
  fifth of the fish rigid and bends the rest.
- 5,000 to 20,000 triangles are plenty. Fins can be single sheets: Aquaria
  draws both sides.

## 2. Colors and materials

Use Principled BSDF materials: the exporter turns them into glTF PBR
materials, which Aquaria keeps (base color, normal, roughness, metalness,
transparency). Colors can be image textures or a color attribute (vertex
colors) wired into _Base Color_; export it with _Data > Mesh > Vertex Color:
Active_. Fins look best a little see-through: alpha below 1 and _Blend
Mode: Blended_.

## 3. The mouth

Add a shape key, for example `MouthOpen`, with the mouth wide open (the
lower jaw dropped), and name it in `model.json`:

```json
"mouth": { "morphTarget": "MouthOpen" }
```

## 4. The eyes

The eyes glance the way the fish is about to turn, in quick jumps, as a
real fish's do. Aquaria needs to know which vertices are eyeball and where
each eyeball's centre is:

1. Make each eyeball a separate part of the mesh (or a separate object):
   a sphere, or the front of one, with the pupil looking out to its side.
2. Add an armature with a root bone for the body and **one bone per eye**,
   for example `Eye.L` and `Eye.R`. Put each eye bone's **head at the
   centre of its eyeball**: Aquaria turns the eye about that point. Parent
   the eye bones to the root bone. (The fish's left is Blender's +Y.)
3. Parent the meshes to the armature (_With Empty Groups_, or with an
   Armature modifier) and **weight paint** each eyeball fully (1.0) to its
   eye bone; the body and the fins go to the root bone. Vertices partly
   weighted to an eye bone turn partly, which smooths a lid or a rim.
4. Leave the armature in its rest pose; there is no need for an animation.
5. Name the bones in `model.json`, and how far the eyes turn at most, in
   degrees (default 20, at most 45):

```json
"eyes": { "bones": ["Eye.L", "Eye.R"], "turn": 22 }
```

Write the bone names as Blender shows them: Aquaria also finds them after
the glTF loader has dropped the dots (`Eye.L` arrives as `EyeL`).

## 5. Export

_File > Export > glTF 2.0_, format **glTF Binary (.glb)**, with:

- _Include_: the fish's objects and the armature;
- _Transform_: **+Y Up** on;
- _Data > Mesh_: _Apply Modifiers_ off (the armature must stay a skin),
  _Vertex Color: Active_ if you painted colors;
- _Data > Shape Keys_ on; _Data > Armature_ on (skins);
- _Animation_ off.

From a script, `scripts/blender/angelfish.py` ends with the same settings:

```python
bpy.ops.export_scene.gltf(
    filepath="model.glb", export_format="GLB", export_yup=True,
    export_skins=True, export_morph=True, export_animations=False,
    export_vertex_color="ACTIVE", export_apply=False,
)
```

Then compress it, which keeps the bones, the shape keys and the colors
and makes it about a tenth of the size:

```bash
pnpm dlx @gltf-transform/cli@4.5.1 optimize model.glb public/assets/species/<id>/model.glb --compress meshopt --simplify false
```

Save `model.glb` in the species' folder, write `model.json`, point the
species to the folder (`"model": "<id>"` in `public/species.json`) and
list the model in `ASSETS.md`. A model made from scratch can be CC0.

## 6. Check it

Run `pnpm dev`, open a scene with the species, press `H` and make sure the
species' card shows the **3D** badge switched on. Press `A` for the
activity overlay and watch a fish turn: its eyes glance first. If the eyes
do not move, the browser console says nothing is wrong, and the bones are
named right, check that the eyeballs are weighted to the eye bones and not
to the root.

## 7. A model from elsewhere

A downloaded model often has its eyes painted on its texture and no shape
keys, and its textures may be in a format Blender cannot open (KTX2).
`model.json` can still give it a mouth, eyes and gills, from places in the
fish frame read off the model viewer:

```json
"mouth": { "jaw": { "start": 0.43, "line": -0.01, "drop": 0.02 } },
"eyes": { "painted": { "center": [0.37, 0.137], "radius": 0.024, "pupil": 0.72, "iris": "#d6dee6" } },
"gills": { "edge": 0.28, "top": 0.17, "bottom": -0.06, "curve": 3 }
```

- `mouth.jaw`: the points ahead of `start` and below the mouth's `line`
  drop by up to `drop` at the tip of the snout when the fish eats; the
  upper lip lifts a little. Put `line` where the lips meet.
- `eyes.painted`: an eye painted over the model's own, on both sides: its
  `center` (x, y), `radius`, `iris` color and the `pupil`'s share of the
  radius (default 0.65). The pupil slides with the gaze. Match the radius
  to the painted eye, so the old pupil is covered.
- `gills`: the gill cover's rear `edge` (x), how far it reaches up and down
  (`top`, `bottom`), and how its edge bends (`curve`: the edge lies at
  `edge + curve * (y - middle)^2`, so a positive curve sets it furthest
  back halfway up, as on most fish). It lifts by up to `open` body lengths
  (default 0.006), `rate` times a second (default 1.1), each fish at its
  own moment, and a dark red slit shows behind it. Fish made in Blender
  take `gills` the same way.

To run the angelfish script:

```bash
blender --background --python scripts/blender/angelfish.py -- public/assets/species/freshwater-angelfish
```
