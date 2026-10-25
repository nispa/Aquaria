"""Builds Aquaria's red cherry shrimp (Neocaridina davidi) in Blender.

    blender --background --python scripts/blender/shrimp.py -- <output folder>

Writes model.glb to the output folder (by default
public/assets/species/red-cherry-shrimp). Everything is generated here, so
the model is the project's own work (CC0, like the code that made it):

- a curved body: a smooth carapace with a pointed rostrum, then six
  abdominal segments arching up and bending down to the tail, each ending
  in a slight groove;
- a fan of a tail spread sideways (telson and uropods);
- black eyes on short stalks;
- two long antennae that arch up and sweep back over the body (so the
  model's length, snout to tail, is the shrimp's own), two short
  antennules, five pairs of walking legs and small swimmerets;
- light and shade only in the vertex colors (darker on the back and in
  specks, paler underneath), appendages see-through: the color comes from
  the colorings in model.json (cherry red, blue, yellow, black), which tint
  the Shell and Limbs materials, so one model makes every strain. Without
  a coloring the shrimp is grey, like a glass shrimp.

- a skeleton, a bone for each walking leg, antenna, antennule and
  swimmeret, and a one-second "Walk" clip: the legs step in a wave running
  from the tail to the head, the two sides half a stride apart, the
  antennae sway, the antennules flick and the swimmerets beat. Aquaria
  plays it in step with the shrimp's pace (model.json `animations`).

No mouth: on the bottom a shrimp is a few pixels tall. The shared pieces
are in fishkit.py; docs/FISH_MODELS.md tells what Aquaria expects of a
model.
"""

import math
import os
import sys

import bpy
from mathutils import Quaternion, Vector

sys.path.insert(0, os.path.dirname(__file__))
from fishkit import (  # noqa: E402
    curve,
    export,
    make_object,
    material,
    membrane,
    mix,
    rounded,
    smoothstep,
)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUTPUT = os.path.join(ROOT, "public", "assets", "species", "red-cherry-shrimp")

# Light and shade, as a share of the color a coloring gives the material.
SIDE = 0.8
BACK = 0.3
BELLY = 1.0
FAN_EDGE = 1.0
FAN_OVERLAP = 0.35
EYE = 0.02

# The walk: one stride a second, at Blender's 24 frames a second.
STRIDE_FRAMES = 24
# How far a leg swings forward and back, and lifts as it comes forward, radians.
LEG_SWING = 0.35
LEG_LIFT = 0.25
# The stride runs from the back leg to the front one, this share of it apart.
LEG_WAVE = 0.2
ANTENNA_SWAY = 0.08
ANTENNA_NOD = 0.06
ANTENNULE_FLICK = 0.15
SWIMMERET_BEAT = 0.4
# Each swimmeret beats this much of a turn after the one in front of it, radians.
SWIMMERET_WAVE = 0.8
LEG_XS = (0.3, 0.24, 0.18, 0.12, 0.06)
SWIMMERET_XS = (0.0, -0.08, -0.16, -0.23)

# The body runs from the front of the carapace to the start of the tail fan.
FRONT_X = 0.36
BACK_X = -0.38
# The midline's height along x: level under the carapace, arching over the
# third segment and bending down to the tail.
MIDLINE = [(0.36, 0.0), (0.2, 0.005), (0.05, 0.022), (-0.1, 0.048), (-0.22, 0.022), (-0.32, -0.03), (-0.38, -0.07)]
# Half the body's height and half its width along x.
HALF_HEIGHT = [(0.36, 0.035), (0.3, 0.06), (0.15, 0.068), (0.05, 0.064), (-0.1, 0.055), (-0.25, 0.04), (-0.38, 0.022)]
HALF_WIDTH = [(0.36, 0.025), (0.3, 0.045), (0.15, 0.05), (0.05, 0.046), (-0.1, 0.038), (-0.25, 0.027), (-0.38, 0.016)]
# Where the abdominal segments meet: a slight groove runs round the body.
SEGMENTS = [0.05, -0.04, -0.12, -0.2, -0.27, -0.33]
GROOVE = 0.08
GROOVE_WIDTH = 0.012


def shade(value, alpha=1.0):
    """A grey vertex color: the material's color, from the coloring, times this."""
    return [value, value, value, alpha]


def speckle(x, z):
    """Dark specks, the cherry's mottling: a fixed pattern, so every build is the same."""
    return smoothstep(0.55, 0.95, math.sin(x * 210 + 1.7) * math.sin(z * 260 + x * 40))


def body():
    """The body lofted as rings along x, from the carapace back to the tail."""
    verts, faces, colors = [], [], []
    steps, around = 140, 40
    rings = []
    for i in range(steps + 1):
        x = FRONT_X + (BACK_X - FRONT_X) * i / steps
        middle = curve(MIDLINE, x)
        groove = 1 - GROOVE * max(max(1 - abs(x - s) / GROOVE_WIDTH, 0.0) for s in SEGMENTS)
        half_height = curve(HALF_HEIGHT, x) * groove
        half_width = curve(HALF_WIDTH, x) * groove
        ring = []
        for j in range(around):
            angle = 2 * math.pi * j / around
            up, side = math.sin(angle), math.cos(angle)
            # The side plates of the abdomen hang a little lower than the back rises.
            drop = 1.15 if up < 0 and x < 0.05 else 1.0
            z = middle + half_height * up * drop
            ring.append(len(verts))
            verts.append((x, half_width * side, z))
            back = smoothstep(-0.2, 0.9, up)
            color = mix(shade(SIDE), shade(BACK), back * 0.45 + speckle(x, z) * 0.5)
            colors.append(mix(color, shade(BELLY), smoothstep(-0.3, -0.95, up) * 0.6))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for j in range(around):
            k = (j + 1) % around
            faces.append((a[j], b[j], b[k], a[k]))
    for ring, x, flip in ((rings[0], FRONT_X + 0.01, False), (rings[-1], BACK_X - 0.005, True)):
        cap = len(verts)
        verts.append((x, 0.0, curve(MIDLINE, x)))
        colors.append(shade(SIDE))
        for j in range(around):
            k = (j + 1) % around
            faces.append((cap, ring[k], ring[j]) if flip else (cap, ring[j], ring[k]))
    return verts, faces, colors


def tube(points, radius, color, sides=8, smooth=3):
    """A thin tube along a polyline, smoothed; radius(t) and color(t) for t from 0 at its root to 1 at its tip."""
    path = [Vector(p) for p in rounded(points, smooth)]
    verts, faces, colors = [], [], []
    count = len(path)
    for i, point in enumerate(path):
        t = i / (count - 1)
        ahead = path[min(i + 1, count - 1)] - path[max(i - 1, 0)]
        ahead.normalize()
        helper = Vector((0, 0, 1)) if abs(ahead.z) < 0.9 else Vector((0, 1, 0))
        u = ahead.cross(helper).normalized()
        v = ahead.cross(u).normalized()
        for j in range(sides):
            angle = 2 * math.pi * j / sides
            p = point + (u * math.cos(angle) + v * math.sin(angle)) * radius(t)
            verts.append((p.x, p.y, p.z))
            colors.append(color(t))
    for i in range(count - 1):
        for j in range(sides):
            k = (j + 1) % sides
            a, b = i * sides, (i + 1) * sides
            faces.append((a + j, a + k, b + k, b + j))
    return verts, faces, colors


def tapering(root, tip):
    return lambda t: root + (tip - root) * t


def limb_color(alpha):
    return lambda t: shade(1.0, alpha * (1 - 0.4 * t))


def rostrum():
    """The pointed beak over the eyes."""
    return tube([(0.33, 0, 0.04), (0.42, 0, 0.045), (0.5, 0, 0.05)], tapering(0.012, 0.002), lambda t: shade(SIDE), smooth=2)


def antenna(side):
    """Long, from under the eyes up in an arch and back over the body."""
    points = [(0.37, side * 0.02, 0.0), (0.46, side * 0.05, 0.05), (0.4, side * 0.08, 0.13), (0.15, side * 0.1, 0.15), (-0.1, side * 0.12, 0.12), (-0.3, side * 0.13, 0.08)]
    return tube(points, tapering(0.005, 0.0015), limb_color(0.85), sides=6)


def antennule(side, spread):
    points = [(0.37, side * 0.015, 0.02), (0.43, side * (0.03 + spread), 0.05), (0.47, side * (0.04 + spread), 0.09)]
    return tube(points, tapering(0.004, 0.0015), limb_color(0.85), sides=6, smooth=2)


def leg_root(side, x):
    return Vector((x, side * 0.03, curve(MIDLINE, x) - curve(HALF_HEIGHT, x) * 0.6))


def leg(side, x):
    """A walking leg: out from under the carapace, a knee, down to the ground."""
    top = leg_root(side, x).z
    points = [(x, side * 0.03, top), (x + 0.015, side * 0.08, top - 0.02), (x - 0.01, side * 0.1, top - 0.085)]
    return tube(points, tapering(0.006, 0.0025), limb_color(0.9), sides=6, smooth=1)


def swimmeret_root(side, x):
    return Vector((x, side * 0.015, curve(MIDLINE, x) - curve(HALF_HEIGHT, x) * 1.05))


def swimmeret(side, x):
    """A small paddle under the abdomen."""
    bottom = swimmeret_root(side, x).z
    points = [(x, side * 0.015, bottom), (x - 0.015, side * 0.025, bottom - 0.03)]
    return tube(points, tapering(0.005, 0.002), limb_color(0.7), sides=5, smooth=1)


def eye(side):
    """A black eye on a short stalk, looking out and forward."""
    stalk = tube([(0.34, side * 0.02, 0.025), (0.37, side * 0.045, 0.032)], tapering(0.008, 0.008), lambda t: shade(SIDE), sides=8, smooth=1)
    centre = Vector((0.375, side * 0.05, 0.034))
    radius = 0.017
    verts, faces, colors = [], [], []
    rings, segments = 10, 16
    for i in range(rings + 1):
        theta = math.pi * i / rings
        for j in range(segments):
            phi = 2 * math.pi * j / segments
            p = centre + Vector((math.sin(theta) * math.cos(phi), math.sin(theta) * math.sin(phi), math.cos(theta))) * radius
            verts.append((p.x, p.y, p.z))
            colors.append(shade(EYE))
    for i in range(rings):
        for j in range(segments):
            k = (j + 1) % segments
            a, b = i * segments, (i + 1) * segments
            faces.append((a + j, b + j, b + k, a + k))
    return stalk, (verts, faces, colors)


def tail_fan():
    """Telson and uropods: a fan spread sideways behind the last segment, tilted down with it."""
    root_z = curve(MIDLINE, BACK_X)
    edge_points = rounded([(-0.42, -0.08, root_z - 0.04), (-0.48, -0.055, root_z - 0.065), (-0.5, 0.0, root_z - 0.075), (-0.48, 0.055, root_z - 0.065), (-0.42, 0.08, root_z - 0.04)])

    def base(u):
        return Vector((BACK_X + 0.01, 0.03 * (u - 0.5) * 2, root_z))

    def edge(u):
        index = u * (len(edge_points) - 1)
        low = int(min(index, len(edge_points) - 2))
        return Vector(edge_points[low]).lerp(Vector(edge_points[low + 1]), index - low)

    def color(u, v, p):
        # Five blades: darker where they overlap, paler and clearer at the edge.
        blade = (0.5 + 0.5 * math.cos(u * 5 * 2 * math.pi)) ** 2
        fan = mix(shade(SIDE, 0.95), shade(FAN_EDGE, 0.6), smoothstep(0.5, 1.0, v))
        return mix(fan, shade(FAN_OVERLAP, 0.95), blade * 0.3 * (1 - v))

    return membrane(base, edge, color, steps_u=60, steps_v=12, bulge=0.004)


def side_name(side):
    return "L" if side > 0 else "R"


def limbs():
    """Every limb as (part, bone, root): the part moves with its bone, which turns about the root."""
    parts = []
    for side in (1, -1):
        name = side_name(side)
        parts.append((antenna(side), f"Antenna.{name}", Vector((0.37, side * 0.02, 0.0))))
        for spread in (0.0, 0.02):
            parts.append((antennule(side, spread), f"Antennule.{name}", Vector((0.37, side * 0.015, 0.02))))
        for index, x in enumerate(LEG_XS):
            parts.append((leg(side, x), f"Leg.{name}{index}", leg_root(side, x)))
        for index, x in enumerate(SWIMMERET_XS):
            parts.append((swimmeret(side, x), f"Swimmeret.{name}{index}", swimmeret_root(side, x)))
    parts.append((tail_fan(), "Root", None))
    return parts


def skeleton(roots):
    """An armature: Root holds the body, a bone pointing down from each limb's root holds the limb."""
    data = bpy.data.armatures.new("Armature")
    armature = bpy.data.objects.new("Armature", data)
    bpy.context.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    root = data.edit_bones.new("Root")
    root.head, root.tail = Vector((0.1, 0, 0)), Vector((-0.2, 0, 0))
    for name, head in roots.items():
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = head, head + Vector((0, 0, -0.03))
        bone.parent = root
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def bind(obj, armature, groups):
    """Each of `groups` (bone, vertex indices) moves rigidly with its bone."""
    for name, indices in groups:
        group = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
        group.add(list(indices), 1.0, "REPLACE")
    modifier = obj.modifiers.new("Armature", "ARMATURE")
    modifier.object = armature
    obj.parent = armature


def turn(name, frame):
    """How a limb is turned at `frame` of the stride, in the shrimp's own axes (+X snout, +Z up, +Y left)."""
    t = 2 * math.pi * frame / STRIDE_FRAMES
    side = 1 if ".L" in name else -1
    index = int(name[-1]) if name[-1].isdigit() else 0
    if name.startswith("Leg"):
        step = t + 2 * math.pi * (LEG_WAVE * (len(LEG_XS) - 1 - index) + (0 if side > 0 else 0.5))
        # The foot comes forward lifted and goes back on the ground.
        swing = Quaternion((0, 0, 1), -side * LEG_SWING * math.sin(step))
        return swing @ Quaternion((1, 0, 0), side * LEG_LIFT * max(math.cos(step), 0.0))
    if name.startswith("Antennule"):
        return Quaternion((0, 1, 0), ANTENNULE_FLICK * math.sin(2 * t))
    if name.startswith("Antenna"):
        sway = Quaternion((0, 0, 1), side * ANTENNA_SWAY * math.sin(t))
        return sway @ Quaternion((0, 1, 0), ANTENNA_NOD * math.sin(t + 1))
    return Quaternion((0, 1, 0), SWIMMERET_BEAT * math.sin(t + index * SWIMMERET_WAVE))


def walk(armature):
    """Keys one looping stride as the "Walk" clip; the body stays put, Aquaria moves it."""
    for frame in range(STRIDE_FRAMES + 1):
        for bone in armature.pose.bones:
            if bone.name == "Root":
                continue
            rest = bone.bone.matrix_local.to_quaternion()
            bone.rotation_mode = "QUATERNION"
            bone.rotation_quaternion = rest.inverted() @ turn(bone.name, frame) @ rest
            bone.keyframe_insert("rotation_quaternion", frame=frame)
    armature.animation_data.action.name = "Walk"
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, STRIDE_FRAMES


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    output = os.path.abspath(args[0]) if args else DEFAULT_OUTPUT
    bpy.ops.wm.read_factory_settings(use_empty=True)

    stalks, eyeballs = zip(*(eye(side) for side in (1, -1)))
    shell = make_object("Body", [body(), rostrum(), *stalks, *eyeballs], material("Shell", 0.3, 0.1, False))
    parts = limbs()
    limb_object = make_object("Limbs", [part for part, _, _ in parts], material("Limbs", 0.4, 0.0, True))

    armature = skeleton({name: root for _, name, root in parts if root is not None})
    bind(shell, armature, [("Root", list(range(len(shell.data.vertices))))])
    groups, start = {}, 0
    for part, name, _ in parts:
        groups.setdefault(name, []).extend(range(start, start + len(part[0])))
        start += len(part[0])
    bind(limb_object, armature, groups.items())
    walk(armature)

    export(output, animations=True)
    print(f"Red cherry shrimp written to {output}")


main()
