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
- deep cherry red, darker in specks, appendages paler and see-through.

No bones and no mouth: on the bottom a shrimp is a few pixels tall. The
shared pieces are in fishkit.py; docs/FISH_MODELS.md tells what Aquaria
expects of a model.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from fishkit import (  # noqa: E402
    curve,
    export,
    linear,
    make_object,
    material,
    membrane,
    mix,
    rounded,
    smoothstep,
)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUTPUT = os.path.join(ROOT, "public", "assets", "species", "red-cherry-shrimp")

# Colors, sRGB.
CHERRY = "#c0141e"
DARK = "#7a0a12"
PALE = "#e8606a"
LIMB = "#e04a52"
EYE = "#0a0606"

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
            color = mix(linear(CHERRY), linear(DARK), back * 0.45 + speckle(x, z) * 0.5)
            colors.append(mix(color, linear(PALE), smoothstep(-0.3, -0.95, up) * 0.6))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for j in range(around):
            k = (j + 1) % around
            faces.append((a[j], b[j], b[k], a[k]))
    for ring, x, flip in ((rings[0], FRONT_X + 0.01, False), (rings[-1], BACK_X - 0.005, True)):
        cap = len(verts)
        verts.append((x, 0.0, curve(MIDLINE, x)))
        colors.append(linear(CHERRY))
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
    return lambda t: linear(LIMB, alpha * (1 - 0.4 * t))


def rostrum():
    """The pointed beak over the eyes."""
    return tube([(0.33, 0, 0.04), (0.42, 0, 0.045), (0.5, 0, 0.05)], tapering(0.012, 0.002), lambda t: linear(CHERRY), smooth=2)


def antenna(side):
    """Long, from under the eyes up in an arch and back over the body."""
    points = [(0.37, side * 0.02, 0.0), (0.46, side * 0.05, 0.05), (0.4, side * 0.08, 0.13), (0.15, side * 0.1, 0.15), (-0.1, side * 0.12, 0.12), (-0.3, side * 0.13, 0.08)]
    return tube(points, tapering(0.005, 0.0015), limb_color(0.85), sides=6)


def antennule(side, spread):
    points = [(0.37, side * 0.015, 0.02), (0.43, side * (0.03 + spread), 0.05), (0.47, side * (0.04 + spread), 0.09)]
    return tube(points, tapering(0.004, 0.0015), limb_color(0.85), sides=6, smooth=2)


def leg(side, x):
    """A walking leg: out from under the carapace, a knee, down to the ground."""
    top = curve(MIDLINE, x) - curve(HALF_HEIGHT, x) * 0.6
    points = [(x, side * 0.03, top), (x + 0.015, side * 0.08, top - 0.02), (x - 0.01, side * 0.1, top - 0.085)]
    return tube(points, tapering(0.006, 0.0025), limb_color(0.9), sides=6, smooth=1)


def swimmeret(side, x):
    """A small paddle under the abdomen."""
    bottom = curve(MIDLINE, x) - curve(HALF_HEIGHT, x) * 1.05
    points = [(x, side * 0.015, bottom), (x - 0.015, side * 0.025, bottom - 0.03)]
    return tube(points, tapering(0.005, 0.002), limb_color(0.7), sides=5, smooth=1)


def eye(side):
    """A black eye on a short stalk, looking out and forward."""
    stalk = tube([(0.34, side * 0.02, 0.025), (0.37, side * 0.045, 0.032)], tapering(0.008, 0.008), lambda t: linear(CHERRY), sides=8, smooth=1)
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
            colors.append(linear(EYE))
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
        fan = mix(linear(CHERRY, 0.95), linear(PALE, 0.6), smoothstep(0.5, 1.0, v))
        return mix(fan, linear(DARK, 0.95), blade * 0.3 * (1 - v))

    return membrane(base, edge, color, steps_u=60, steps_v=12, bulge=0.004)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    output = os.path.abspath(args[0]) if args else DEFAULT_OUTPUT
    bpy.ops.wm.read_factory_settings(use_empty=True)

    stalks, eyeballs = zip(*(eye(side) for side in (1, -1)))
    make_object("Body", [body(), rostrum(), *stalks, *eyeballs], material("Shell", 0.3, 0.1, False))
    limbs = [antenna(1), antenna(-1)]
    limbs += [antennule(side, spread) for side in (1, -1) for spread in (0.0, 0.02)]
    limbs += [leg(side, x) for side in (1, -1) for x in (0.3, 0.24, 0.18, 0.12, 0.06)]
    limbs += [swimmeret(side, x) for side in (1, -1) for x in (0.0, -0.08, -0.16, -0.23)]
    limbs.append(tail_fan())
    make_object("Limbs", limbs, material("Limbs", 0.4, 0.0, True))
    export(output)
    print(f"Red cherry shrimp written to {output}")


main()
