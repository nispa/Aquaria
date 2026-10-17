"""Gives the downloaded gilthead seabream a MouthOpen shape key, in Blender.

    blender --background --python scripts/blender/seabream.py -- <scene.gltf> <output folder>

<scene.gltf> is BlueMesh's "Bream Fish (Dorade Royale)" (CC-BY-4.0,
see ASSETS.md), unzipped; the output folder defaults to
public/assets/species/gilthead-seabream. Its swim animation also opens and
shuts the mouth with two jaw bones. Aquaria swims a model itself and plays
no animation, so the model is written posed as it comes (its default pose)
with the mouth at its most shut, without skeleton or animation, and the
widest-open pose of the jaw bones becomes the "MouthOpen" shape key Aquaria
opens when the fish eats.
Compress the result as docs/FISH_MODELS.md says.
"""

import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUTPUT = os.path.join(ROOT, "public", "assets", "species", "gilthead-seabream")

# The lower jaw and its hinge, as the glTF importer names them.
JAW_BONES = ("Bone.044_Armature", "Bone.045_Armature")
# Points that move less than this when the jaw opens are not part of it, m.
STILL = 1e-5
# The swim cycle only parts the lips; a fish eating opens wider, by this
# much more than the cycle's widest (small turns of the jaw stay true).
OPEN_MORE = 1.6


def jaw_poses(armature):
    """The jaw bones' rotation at every frame of the swim animation."""
    scene = bpy.context.scene
    action = armature.animation_data.action
    start, end = (int(frame) for frame in action.frame_range)
    poses = []
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        poses.append({name: armature.pose.bones[name].rotation_quaternion.copy() for name in JAW_BONES})
    return poses


def at_rest(armature, jaw=None):
    """Every bone at rest (the pose the file places them in), the jaw as `jaw` says."""
    for bone in armature.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_quaternion = (1, 0, 0, 0)
        bone.scale = (1, 1, 1)
    for name, rotation in (jaw or {}).items():
        armature.pose.bones[name].rotation_quaternion = rotation
    bpy.context.view_layer.update()


def deformed(obj):
    """The mesh's points as its armature poses them, in its own space."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    points = [vertex.co.copy() for vertex in mesh.vertices]
    evaluated.to_mesh_clear()
    return points


def opening(closed, opened, world):
    """How far down the moving points go in the world (positive when the mouth opens)."""
    moved = [(world @ p).z - (world @ q).z for p, q in zip(opened, closed) if (p - q).length > STILL]
    return -sum(moved) / len(moved) if moved else 0.0


def freeze(obj, closed, opened):
    """Leaves the mesh posed with the mouth shut, the open mouth as a shape key, and no skeleton."""
    for modifier in [m for m in obj.modifiers if m.type == "ARMATURE"]:
        obj.modifiers.remove(modifier)
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = world
    for vertex, point in zip(obj.data.vertices, closed):
        vertex.co = point
    obj.shape_key_add(name="Basis")
    key = obj.shape_key_add(name="MouthOpen")
    for data, shut, point in zip(key.data, closed, opened):
        data.co = shut + (point - shut) * OPEN_MORE
    obj.vertex_groups.clear()


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    source = os.path.abspath(args[0])
    output = os.path.abspath(args[1]) if len(args) > 1 else DEFAULT_OUTPUT
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Rest is then the pose the bones are placed in, as Aquaria shows the model.
    bpy.ops.import_scene.gltf(filepath=source, guess_original_bind_pose=False)

    armature = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    # The body is the mesh with the most points; the jaw is part of it.
    body = max(meshes, key=lambda obj: len(obj.data.vertices))
    jaws = jaw_poses(armature)
    armature.animation_data_clear()
    at_rest(armature)
    resting = deformed(body)

    def body_opening(jaw):
        at_rest(armature, jaw)
        return opening(resting, deformed(body), body.matrix_world)

    shut = min(jaws, key=body_opening)
    widest = max(jaws, key=body_opening)
    print(f"Jaw opens by {body_opening(widest) - body_opening(shut):.4f} on average")
    at_rest(armature, shut)
    closed = {obj.name: deformed(obj) for obj in meshes}
    at_rest(armature, widest)
    opened = {obj.name: deformed(obj) for obj in meshes}

    for obj in meshes:
        freeze(obj, closed[obj.name], opened[obj.name])
    bpy.data.objects.remove(armature)

    os.makedirs(output, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(output, "model.glb"),
        export_format="GLB",
        export_yup=True,
        export_skins=False,
        export_morph=True,
        export_animations=False,
        export_apply=False,
    )
    print(f"Seabream written to {output}")


main()
