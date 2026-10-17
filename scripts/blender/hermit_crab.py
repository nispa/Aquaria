"""Gives the downloaded hermit crab a walk, in Blender.

    blender --background --python scripts/blender/hermit_crab.py -- <scene.gltf> <output folder>

<scene.gltf> is kenchoo's "Hermit Crab" (CC-BY-4.0, see ASSETS.md),
unzipped; the output folder defaults to public/assets/species/hermit-crab.
The model comes with a slow ten-second idle in which a leg hardly moves, so
it gets a one-second "Walk" clip of its own: the four walking legs step in
diagonal pairs, each foot lifted as it comes forward, and the claws sway a
little; and a "Hide" pose, head, legs and claws pulled back into the shell,
for when it is frightened. Its bones are left in the pose the file places
them in; the idle is dropped. Compress the result as docs/FISH_MODELS.md says.
"""

import math
import os
import sys

import bpy
from mathutils import Quaternion, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUTPUT = os.path.join(ROOT, "public", "assets", "species", "hermit-crab")

STRIDE_FRAMES = 24
# The first bone of each walking leg, as the glTF importer names it, and its
# share of a stride: diagonal pairs step together.
LEGS = {
    "Bone.002_3": 0.0,
    "Bone.003_7": 0.5,
    "Bone.006_14": 0.5,
    "Bone.009_17": 0.0,
}
CLAWS = ("Bone.016_10", "Bone.012_21")
# How far a leg swings forward and back, and lifts as it comes forward, radians.
LEG_SWING = 0.4
LEG_LIFT = 0.3
CLAW_SWAY = 0.08
# The bones that carry the head, the legs and the claws out of the shell.
ROOTS = ("Bone.001_11", "Bone.005_22", "Bone.025_25")
# Hiding, they pull back into the shell by this much (model units, the
# shell is about 3 long) along BACK, in Blender's world, and shrink to TUCK.
WITHDRAW = 0.7
BACK = (0, 1, 0.15)
TUCK = 0.75


def world_turn(axis, angle, armature):
    """A turn about a direction of the world, as a turn in the armature's own space."""
    local = (armature.matrix_world.to_3x3().normalized().inverted() @ Vector(axis)).normalized()
    return Quaternion(local, angle)


def side_of(bone, armature):
    """1 for a limb reaching out on the world's +X side, -1 for one on the other: where its tip is."""
    tips = [armature.matrix_world @ child.tail_local for child in (bone.bone, *bone.bone.children_recursive)]
    return 1 if max(tips, key=lambda tip: abs(tip.x)).x > 0 else -1


def turn(bone, armature, frame):
    """How a leg or claw is turned at `frame` of the stride (Blender's world: -Y forward, +Z up)."""
    t = 2 * math.pi * frame / STRIDE_FRAMES
    side = side_of(bone, armature)
    if bone.name in LEGS:
        step = t + 2 * math.pi * LEGS[bone.name]
        # The foot comes forward lifted and goes back on the ground.
        swing = world_turn((0, 0, 1), -side * LEG_SWING * math.sin(step), armature)
        lift = world_turn((0, side, 0), -LEG_LIFT * max(math.cos(step), 0.0), armature)
        return swing @ lift
    return world_turn((0, 0, 1), side * CLAW_SWAY * math.sin(t), armature)


def walk(armature):
    """Keys one looping stride as the "Walk" clip, in place of the file's idle."""
    armature.animation_data_clear()
    for frame in range(STRIDE_FRAMES + 1):
        for name in (*LEGS, *CLAWS):
            bone = armature.pose.bones[name]
            rest = bone.bone.matrix_local.to_quaternion()
            bone.rotation_mode = "QUATERNION"
            bone.rotation_quaternion = rest.inverted() @ turn(bone, armature, frame) @ rest
            bone.keyframe_insert("rotation_quaternion", frame=frame)
    armature.animation_data.action.name = "Walk"
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, STRIDE_FRAMES


def hide(armature):
    """Keys the "Hide" pose: head, legs and claws pulled back into the shell, a little smaller."""
    action = bpy.data.actions.new("Hide")
    armature.animation_data.action = action
    for frame in (0, STRIDE_FRAMES):
        for name in ROOTS:
            bone = armature.pose.bones[name]
            bone.location = Vector()
            bone.rotation_quaternion = Quaternion()
            bone.scale = Vector((1, 1, 1))
        bpy.context.view_layer.update()
        back = armature.matrix_world.to_3x3().normalized().inverted() @ Vector(BACK)
        for name in ROOTS:
            bone = armature.pose.bones[name]
            moved = bone.matrix.copy()
            moved.translation += back * WITHDRAW
            bone.matrix = moved
            bone.scale = Vector((TUCK,) * 3)
            for path in ("location", "rotation_quaternion", "scale"):
                bone.keyframe_insert(path, frame=frame)
    armature.animation_data.action = None


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    source = os.path.abspath(args[0])
    output = os.path.abspath(args[1]) if len(args) > 1 else DEFAULT_OUTPUT
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Rest is then the pose the bones are placed in, as Aquaria shows the model.
    bpy.ops.import_scene.gltf(filepath=source, guess_original_bind_pose=False)
    armature = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    walk(armature)
    walk_action = armature.animation_data.action
    hide(armature)
    # Both clips go into the file, each as its own animation.
    for action in (walk_action, bpy.data.actions["Hide"]):
        track = armature.animation_data.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, 0, action)
    armature.animation_data.action = None

    os.makedirs(output, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(output, "model.glb"),
        export_format="GLB",
        export_yup=True,
        export_skins=True,
        export_morph=True,
        export_animations=True,
        export_apply=False,
    )
    print(f"Hermit crab written to {output}")


main()
