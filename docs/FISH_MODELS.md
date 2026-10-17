# Making a fish in Blender

A species may have a 3D model next to its procedural body: a folder in
`public/assets/species/<id>/` with a `model.glb` and a `model.json` (the
fields are in the README, "3D fish models"). This guide tells how to make
one in Blender so that Aquaria can swim it, open its mouth and turn its
eyes. `scripts/blender/angelfish.py` builds the freshwater angelfish this
way, from code; read it as a worked example.

## What Aquaria does with the model

Aquaria draws every fish of a species in one go on the GPU (instancing), so
it does not play skeletal animations. It takes the model as it stands in
its rest pose and does the rest in its shaders:

- it turns, centres and scales the model to the species' length;
- it bends the rear of the body to swim and to turn (`swimAmplitude`);
- it opens the mouth with a shape key, when the fish eats (`mouth`);
- it turns the eyeballs the way the fish is about to turn (`eyes`).

An armature is welcome, for the eyes and for other programs, but no
animation is needed.

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

To run the angelfish script:

```bash
blender --background --python scripts/blender/angelfish.py -- public/assets/species/freshwater-angelfish
```
