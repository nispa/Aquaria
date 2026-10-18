"""Builds Aquaria's bubble-tip anemone, the clownfish's host.

The bubble-tip anemone (Entacmaea quadricolor) is a short column flaring
into an oral disc crowded with tentacles; each tentacle swells into a
bulb below its tip when the anemone is healthy and fed. The column is
orange to red, the tentacles come in colour morphs: green with pink tips,
rose, or brown with green tips. Each morph is a variant, laid side by side
so Aquaria picks one per anemone (docs/OBJECTS.md). `_SWAY` is 0 on the
column and disc and grows along each tentacle, so only tentacles move.

Run with Blender 5.2 in the background, from the repository root:

    blender --background --python scripts/blender/anemone.py

then compress public/assets/objects/bubble-tip-anemone/model.glb with glTF
Transform (meshopt, --join false --flatten false).
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from plantkit import VARIANT_SPACING, export, leaf_material, linear, mix, plant_object, ramp  # noqa: E402

OUTPUT = "public/assets/objects/bubble-tip-anemone/model.glb"
SEED = 20261018
# Sizes in disc radii; Aquaria scales the anemone to its height in the scene.
COLUMN_RADIUS = 0.36
COLUMN_HEIGHT = 0.16
DISC_RADIUS = 0.55
TENTACLES = 90
TENTACLE_SIDES = 8
TENTACLE_SEGMENTS = 12
# Where along a tentacle its end starts to round off.
ROUNDING = 0.82
# The colour morphs, one variant each: column, tentacle base, bulb, tip.
MORPHS = [
    ("#c4472f", "#7d8a4a", "#9aa65a", "#e46aa0"),
    ("#b8342e", "#c46a7c", "#e08a9a", "#f2b2c4"),
    ("#c85a2a", "#7a6040", "#94784a", "#9ccf5a"),
]


def ring(mesh, center, axis, radius, sides, phase=0.0):
    """Points around `center` in the plane across `axis`."""
    side = axis.orthogonal().normalized()
    lift = axis.cross(side).normalized()
    points = []
    for k in range(sides):
        angle = phase + k / sides * math.tau
        offset = side * math.cos(angle) * radius + lift * math.sin(angle) * radius
        points.append(mesh.verts.new(center + offset))
    return points


def bridge(mesh, lower, upper):
    count = len(lower)
    for k in range(count):
        mesh.faces.new((lower[k], lower[(k + 1) % count], upper[(k + 1) % count], upper[k]))


def column_and_disc(mesh, colors, sway, morph):
    """The column flaring into the oral disc, with the mouth in the middle."""
    column = linear(morph[0])
    disc = mix(linear(morph[1]), column, 0.35)
    profile = [
        (0.0, COLUMN_RADIUS, column),
        (COLUMN_HEIGHT * 0.6, COLUMN_RADIUS * 0.92, column),
        (COLUMN_HEIGHT, DISC_RADIUS * 0.85, mix(column, disc, 0.5)),
        (COLUMN_HEIGHT * 1.05, DISC_RADIUS, disc),
        (COLUMN_HEIGHT * 1.08, DISC_RADIUS * 0.5, disc),
        (COLUMN_HEIGHT * 1.02, 0.06, column),
    ]
    rings = []
    for height, radius, color in profile:
        points = ring(mesh, Vector((0, 0, height)), Vector((0, 0, 1)), radius, 24)
        for point in points:
            colors[point] = color
            sway[point] = 0.0
        rings.append(points)
    for lower, upper in zip(rings, rings[1:]):
        bridge(mesh, lower, upper)


def tentacle(mesh, colors, sway, rng, morph, root, out):
    """A tapering tube, swollen into a bulb below its tip, curving up and out."""
    stops = [
        (0.0, linear(morph[1])),
        (0.6, linear(morph[2])),
        (0.82, linear(morph[2])),
        (1.0, linear(morph[3])),
    ]
    length = rng.uniform(0.38, 0.6)
    base_radius = rng.uniform(0.045, 0.058)
    bulb = rng.uniform(1.45, 1.8)
    # Outer tentacles lean further out; all of them curl up towards the light.
    lean = 0.5 + 1.1 * out
    wiggle = Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), 0))
    direction = Vector((root.x, root.y, 0)).normalized() if root.length > 1e-6 else Vector((1, 0, 0))
    previous = None
    position = root.copy()
    for i in range(TENTACLE_SEGMENTS + 1):
        t = i / TENTACLE_SEGMENTS
        heading = (direction * lean * (1 - 0.6 * t) + Vector((0, 0, 1)) * (0.7 + 0.2 * t) + wiggle * t).normalized()
        # Slim at the root, a bulb around 75 %, then a rounded, blunt end.
        swell = 1 + (bulb - 1) * math.exp(-(((t - 0.75) / 0.12) ** 2))
        end = math.sqrt(max(1 - ((t - ROUNDING) / (1 - ROUNDING)) ** 2, 0.0)) if t > ROUNDING else 1.0
        radius = base_radius * swell * (1.0 - 0.2 * t) * max(end, 0.25)
        points = ring(mesh, position, heading, radius, TENTACLE_SIDES, phase=i * 0.4)
        color = ramp(stops, t)
        for point in points:
            colors[point] = color
            sway[point] = t**1.2
        if previous is not None:
            bridge(mesh, previous, points)
        previous = points
        position = position + heading * (length / TENTACLE_SEGMENTS)
    cap = mesh.verts.new(position - heading * (length / TENTACLE_SEGMENTS) * 0.6)
    colors[cap] = ramp(stops, 1.0)
    sway[cap] = 1.0
    for k in range(TENTACLE_SIDES):
        mesh.faces.new((previous[k], previous[(k + 1) % TENTACLE_SIDES], cap))


def build_anemone(rng, offset, morph, material):
    mesh = bmesh.new()
    colors = {}
    sway = {}
    column_and_disc(mesh, colors, sway, morph)
    for index in range(TENTACLES):
        # Spread over the disc like sunflower seeds, leaving the mouth bare.
        share = (index + 0.5) / TENTACLES
        distance = DISC_RADIUS * (0.25 + 0.72 * math.sqrt(share))
        angle = index * 2.39996 + rng.uniform(-0.1, 0.1)
        root = Vector((math.cos(angle) * distance, math.sin(angle) * distance, COLUMN_HEIGHT * 1.05))
        tentacle(mesh, colors, sway, rng, morph, root, out=math.sqrt(share))
    bmesh.ops.translate(mesh, verts=mesh.verts, vec=Vector((offset, 0, 0)))
    anemone = plant_object("bubble-tip-anemone", mesh, colors, sway, material)
    mesh.free()
    return anemone


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(SEED)
    material = leaf_material("bubble-tip-anemone", 0.35)
    for index, morph in enumerate(MORPHS):
        build_anemone(rng, index * VARIANT_SPACING, morph, material)
    export(OUTPUT)
    print("ANEMONE written", OUTPUT)


main()
