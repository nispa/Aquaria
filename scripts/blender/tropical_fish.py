"""Gives the four tropical fish their own swim clip back, in Blender.

    blender --background --python scripts/blender/tropical_fish.py -- <scene.gltf> <output folder>

<scene.gltf> is LasquetiSpice's "Animated Swimming Tropical Fish School Loop"
(CC-BY-4.0, see ASSETS.md), unzipped; the output folder defaults to
public/assets/species, one folder per species. The file is a single school:
two or three fish of each species on one skeleton, swimming a 41-second loop
along a path. For each species the first fish is kept, as Aquaria already
shows it (the points that follow its bones, in the rest pose the file binds
them in), now with its own bones and a short looping "Swim" clip.

Each fish's root bone stays still; under it the head and the first spine bone
carry the fish along the path, turning with it, and the rest of the spine,
the tail and the fins beat and bend under them. So that the clip swims in
place, the two carriers keep only their sway about where the fish is heading
(their turn averaged over one tail beat), and do not move along the path:
Aquaria moves and turns the fish itself.

The clip is the stretch of the loop, a whole number of tail beats long, where
the fish swims straightest and its last pose comes back to its first; what
mismatch is left is spread evenly over the stretch, so it loops without a
jump. The script prints, for each fish, the stretch it took and how fast the
fish went along the path meanwhile, in body lengths a second: the pace at
which the clip plays at its own speed (`animations.speed` in model.json).
Compress the result as docs/FISH_MODELS.md says, with `--simplify false`.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Quaternion

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUTPUT = os.path.join(ROOT, "public", "assets", "species")

# The species folder each fish goes to, and the prefix of its bones in the
# school (the first fish of each species, the one Aquaria shows).
FISH = {
    "clownfish": "Clown1",
    "blue-tang": "blue_tang1",
    "moorish-idol": "moorish1",
    "yellow-tang": "Yellow1",
}
# The school's animation is keyed thirty times a second.
FPS = 30
CLIP_NAME = "Swim"
# Where to look for the tail beat, seconds.
SHORTEST_BEAT = 0.5
LONGEST_BEAT = 2.0
# How long the clip itself may be, seconds.
SHORTEST_CLIP = 0.7
LONGEST_CLIP = 2.5
# A beat is the shortest dip in pose error within this share of the best.
BEAT_TOLERANCE = 1.25
# How many beats the clip may hold.
MOST_BEATS = 3
# How many frames either side of a whole number of beats the clip may end.
SEAM_SLACK = 3
# How much a stretch is penalised for turning (radians the heading changes)
# and for bending to one side on average, against how well its ends meet.
TURN_WEIGHT = 2.0
LEAN_WEIGHT = 2.0
# How much the ends' motion (one frame on) counts against their poses.
MOTION_WEIGHT = 0.5


def angle_between(a, b):
    """The angle of the turn from one rotation to another, radians."""
    return 2 * math.acos(min(abs(a.dot(b)), 1.0))


def hemisphere(rotation):
    """The same rotation with w >= 0, so that averages and comparisons hold."""
    return rotation if rotation.w >= 0 else -rotation


def average(rotations):
    """The mean of rotations that lie close together."""
    mean = Quaternion((0, 0, 0, 0))
    for rotation in rotations:
        mean += rotation if mean.dot(rotation) >= 0 else -rotation
    mean.normalize()
    return mean


def fish_bones(armature, prefix):
    """The bones of one fish, by name."""
    return [bone.name for bone in armature.data.bones if bone.name.startswith(prefix + ":")]


def keep_fish(armature, prefix):
    """Leaves the armature with one fish's bones and the scene with the mesh of its points only."""
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    for bone in list(armature.data.edit_bones):
        if not bone.name.startswith(prefix + ":"):
            armature.data.edit_bones.remove(bone)
    bpy.ops.object.mode_set(mode="OBJECT")
    kept = set(fish_bones(armature, prefix))
    body = None
    # Every mesh holds groups for all the school's bones: the points decide.
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        others = points_of_others(obj, kept)
        if len(others) == len(obj.data.vertices):
            bpy.data.objects.remove(obj)
            continue
        body = obj
        leave_points_of(obj, kept, others)
    for obj in [o for o in bpy.data.objects if o.type == "EMPTY" and o.name.startswith("_")]:
        bpy.data.objects.remove(obj)
    return body


def points_of_others(obj, kept):
    """The points of the mesh whose strongest bone is not one of `kept`."""
    names = {group.index: group.name for group in obj.vertex_groups}
    others = set()
    for vertex in obj.data.vertices:
        strongest = max(vertex.groups, key=lambda group: group.weight, default=None)
        if strongest is None or names[strongest.group] not in kept:
            others.add(vertex.index)
    return others


def leave_points_of(obj, kept, others):
    """Deletes the `others` points of the mesh, and the bone groups of the other fish."""
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    mesh.verts.ensure_lookup_table()
    bmesh.ops.delete(mesh, geom=[mesh.verts[index] for index in others], context="VERTS")
    mesh.to_mesh(obj.data)
    mesh.free()
    for group in [g for g in obj.vertex_groups if g.name not in kept]:
        obj.vertex_groups.remove(group)


def sample(armature, carriers, beaters):
    """
    Every frame of the loop: each carrier's turn away from its rest, in the
    armature's space, and each beating bone's own rotation; and where the
    first carrier is in the world.
    """
    scene = bpy.context.scene
    action = armature.animation_data.action
    start, end = (round(frame) for frame in action.frame_range)
    rests = {name: armature.data.bones[name].matrix_local.to_quaternion() for name in carriers}
    turns, beats, places = [], [], []
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bones = armature.pose.bones
        turns.append(
            {
                name: hemisphere(bones[name].matrix.to_quaternion() @ rests[name].inverted())
                for name in carriers
            }
        )
        beats.append({name: hemisphere(bones[name].matrix_basis.to_quaternion()) for name in beaters})
        places.append((armature.matrix_world @ bones[carriers[0]].matrix).translation.copy())
    return turns, beats, places


def beat_frames(beats, beaters):
    """How many frames one tail beat lasts: the first dip in pose error."""
    lags = range(round(SHORTEST_BEAT * FPS), round(LONGEST_BEAT * FPS) + 1)
    errors = {}
    for lag in lags:
        pairs = range(0, len(beats) - lag)
        errors[lag] = sum(mismatch(beats[t], beats[t + lag], beaters) for t in pairs) / len(pairs)
    dips = [
        lag
        for lag in lags
        if lag - 1 in errors
        and lag + 1 in errors
        and errors[lag] <= errors[lag - 1]
        and errors[lag] <= errors[lag + 1]
    ]
    candidates = dips or list(lags)
    best = min(errors[lag] for lag in candidates)
    return next(lag for lag in candidates if errors[lag] <= best * BEAT_TOLERANCE)


def headings(turns, lead, beat):
    """Where the fish heads at each frame: its lead carrier's turn averaged over one beat."""
    half = beat // 2
    last = len(turns) - 1
    return [
        average(turns[t][lead] for t in range(max(frame - half, 0), min(frame + half, last) + 1))
        for frame in range(len(turns))
    ]


def in_place(turns, beats, heading, armature, carriers):
    """
    The poses of the fish swimming in place: each carrier keeps only its
    sway about the heading, as a rotation from its rest; beating bones as
    they were.
    """
    rests = {name: armature.data.bones[name].matrix_local.to_quaternion() for name in carriers}
    poses = []
    for turn, beat, ahead in zip(turns, beats, heading):
        pose = dict(beat)
        for name in carriers:
            sway = ahead.inverted() @ turn[name]
            pose[name] = hemisphere(rests[name].inverted() @ sway @ rests[name])
        poses.append(pose)
    return poses


def mismatch(first, second, bones):
    """How far apart two poses are: the bones' angles summed, radians."""
    return sum(angle_between(first[name], second[name]) for name in bones)


def lean(poses, bones):
    """How far the body bends to one side over a stretch, on average: a turn, not a beat."""
    return sum(angle_between(average(pose[name] for pose in poses), Quaternion()) for name in bones)


def best_stretch(poses, heading, bones, beat):
    """The first frame and the length of the stretch that loops best, swimming straightest."""
    shortest, longest = round(SHORTEST_CLIP * FPS), round(LONGEST_CLIP * FPS)
    best = None
    for beats in range(1, MOST_BEATS + 1):
        for length in range(beats * beat - SEAM_SLACK, beats * beat + SEAM_SLACK + 1):
            if not (shortest <= length <= longest):
                continue
            for start in range(0, len(poses) - length - 1):
                end = start + length
                cost = mismatch(poses[start], poses[end], bones)
                cost += MOTION_WEIGHT * mismatch(poses[start + 1], poses[end + 1], bones)
                cost += TURN_WEIGHT * angle_between(heading[start], heading[end])
                if best is not None and cost >= best[0]:
                    continue
                cost += LEAN_WEIGHT * lean(poses[start:end], bones)
                if best is None or cost < best[0]:
                    best = (cost, start, length)
    return best[1], best[2]


def at_rest(armature):
    """Every bone back in its rest pose."""
    for bone in armature.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.matrix_basis.identity()


def key_clip(armature, poses, bones, start, length):
    """Keys the stretch as the looping clip, its seam spread evenly across it."""
    armature.animation_data_clear()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    at_rest(armature)
    for frame in range(length + 1):
        share = frame / length
        for name in bones:
            seam = poses[start][name] @ poses[start + length][name].inverted()
            fix = Quaternion().slerp(seam, share)
            bone = armature.pose.bones[name]
            bone.rotation_quaternion = fix @ poses[start + frame][name]
            bone.keyframe_insert("rotation_quaternion", frame=frame)
    action = armature.animation_data.action
    action.name = CLIP_NAME
    track = armature.animation_data.nla_tracks.new()
    track.name = CLIP_NAME
    track.strips.new(CLIP_NAME, 0, action)
    armature.animation_data.action = None
    at_rest(armature)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, length


def body_length(obj):
    """The fish's length in the world: the longest side of its box."""
    corners = [obj.matrix_world @ point.co for point in obj.data.vertices]
    return max(max(c[axis] for c in corners) - min(c[axis] for c in corners) for axis in range(3))


def extract(source, species, prefix, output):
    """Writes one fish, with its bones and its swim clip, to `output`/`species`/model.glb."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    # Rest is then the pose the bones are placed in, as Aquaria shows the model.
    bpy.ops.import_scene.gltf(filepath=source, guess_original_bind_pose=False)
    armature = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
    for obj in [o for o in bpy.data.objects if o.type == "MESH" and o.parent is None]:
        bpy.data.objects.remove(obj)  # The importer's bone shape, not part of the school.
    body = keep_fish(armature, prefix)
    root = next(bone for bone in armature.data.bones if bone.parent is None)
    # The spine first: it leads, the head follows it.
    carriers = sorted((child.name for child in root.children), key=lambda name: "Spine" not in name)
    beaters = [name for name in fish_bones(armature, prefix) if name != root.name and name not in carriers]
    turns, beats, places = sample(armature, carriers, beaters)
    beat = beat_frames(beats, beaters)
    heading = headings(turns, carriers[0], beat)
    poses = in_place(turns, beats, heading, armature, carriers)
    moving = carriers + beaters
    start, length = best_stretch(poses, heading, moving, beat)
    key_clip(armature, poses, moving, start, length)
    seconds = length / FPS
    pace = (places[start + length] - places[start]).length / seconds / body_length(body)
    print(
        f"{species}: {len(body.data.vertices)} points, {len(moving) + 1} bones, "
        f"a beat every {beat / FPS:.2f} s, clip from {start / FPS:.2f} s, {seconds:.2f} s long, "
        f"swimming {pace:.2f} body lengths a second"
    )
    folder = os.path.join(output, species)
    os.makedirs(folder, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(folder, "model.glb"),
        export_format="GLB",
        export_yup=True,
        export_skins=True,
        export_morph=False,
        export_animations=True,
        export_apply=False,
    )


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    source = os.path.abspath(args[0])
    output = os.path.abspath(args[1]) if len(args) > 1 else DEFAULT_OUTPUT
    for species, prefix in FISH.items():
        extract(source, species, prefix, output)
    print(f"Tropical fish written to {output}")


main()
