"""Builds Aquaria's anemones, the clownfish's hosts.

Two species, one object each:

- the magnificent anemone (Heteractis magnifica): a tall column, often
  pink or magenta, and long, slender, finger-like tentacles that flow in
  the current, sparse enough for a clownfish to swim through;

- the bubble-tip anemone (Entacmaea quadricolor): a short column flaring
into an oral disc crowded with tentacles; each tentacle swells into a
bulb below its tip when the anemone is healthy and fed. The column is
orange to red, the tentacles come in colour morphs: green with pink tips,
rose, or brown with green tips. Each morph is a variant, laid side by side
so Aquaria picks one per anemone (docs/OBJECTS.md). `_SWAY` is 0 on the
column and disc and grows along each tentacle, so only tentacles move.

Run with Blender 5.2 in the background, from the repository root:

    blender --background --python scripts/blender/anemone.py

then compress each model.glb with glTF Transform (meshopt, --join false
--flatten false).
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

SEED = 20261018
# Sizes in disc radii; Aquaria scales the anemone to its height in the scene.
COLUMN_RADIUS = 0.36
DISC_RADIUS = 0.55
TENTACLE_SIDES = 8
TENTACLE_SEGMENTS = 12
# Where along a tentacle its end starts to round off.
ROUNDING = 0.82

# Each species: where it goes, how its tentacles grow (length, thickness at
# the root and swelling of the bulb as ranges; how far the outer ones lean
# out, how much they rise and curl up, how much they wave), and its colour
# morphs, one variant each: column, tentacle base, middle (the bulb), tip.
SPECIES = [
    {
        "output": "public/assets/objects/bubble-tip-anemone/model.glb",
        "column_height": 0.16,
        "tentacles": 90,
        "length": (0.38, 0.6),
        "thickness": (0.045, 0.058),
        "bulb": (1.45, 1.8),
        "lean": (0.5, 1.1),
        "rise": (0.7, 0.2),
        "wave": 0.0,
        "morphs": [
            ("#c4472f", "#7d8a4a", "#9aa65a", "#e46aa0"),
            ("#b8342e", "#c46a7c", "#e08a9a", "#f2b2c4"),
            ("#c85a2a", "#7a6040", "#94784a", "#9ccf5a"),
        ],
    },
    {
        "output": "public/assets/objects/magnificent-anemone/model.glb",
        "column_height": 0.34,
        "tentacles": 120,
        "length": (0.95, 1.4),
        "thickness": (0.022, 0.03),
        "bulb": (1.0, 1.08),
        "lean": (0.35, 0.95),
        "rise": (1.0, 0.3),
        "wave": 0.35,
        "morphs": [
            ("#c0386e", "#e08aa4", "#f0a0b8", "#ffe0ea"),
            ("#a8205a", "#e6b0b8", "#f2c4c8", "#fff0e8"),
            ("#b02860", "#f094b0", "#f8b0c8", "#fff4f0"),
        ],
    },
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


def column_and_disc(mesh, colors, sway, morph, column_height):
    """The column flaring into the oral disc, with the mouth in the middle."""
    column = linear(morph[0])
    disc = mix(linear(morph[1]), column, 0.35)
    profile = [
        (0.0, COLUMN_RADIUS, column),
        (column_height * 0.6, COLUMN_RADIUS * 0.92, column),
        (column_height, DISC_RADIUS * 0.85, mix(column, disc, 0.5)),
        (column_height * 1.05, DISC_RADIUS, disc),
        (column_height * 1.08, DISC_RADIUS * 0.5, disc),
        (column_height * 1.02, 0.06, column),
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


def tentacle(mesh, colors, sway, rng, species, morph, root, out):
    """A tapering tube, swollen into a bulb below its tip (if any), curving up and out."""
    stops = [
        (0.0, linear(morph[1])),
        (0.6, linear(morph[2])),
        (0.82, linear(morph[2])),
        (1.0, linear(morph[3])),
    ]
    length = rng.uniform(*species["length"])
    base_radius = rng.uniform(*species["thickness"])
    bulb = rng.uniform(*species["bulb"])
    # Outer tentacles lean further out; all of them curl up towards the light.
    lean = species["lean"][0] + species["lean"][1] * out
    rise, curl = species["rise"]
    wiggle = Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), 0))
    wave = species["wave"]
    phase = rng.uniform(0, math.tau) if wave > 0 else 0.0
    side = Vector((-root.y, root.x, 0)).normalized() if root.length > 1e-6 else Vector((0, 1, 0))
    direction = Vector((root.x, root.y, 0)).normalized() if root.length > 1e-6 else Vector((1, 0, 0))
    previous = None
    position = root.copy()
    for i in range(TENTACLE_SEGMENTS + 1):
        t = i / TENTACLE_SEGMENTS
        # Long tentacles wave gently from side to side along their length.
        waving = side * (wave * math.sin(t * 5.0 + phase) * t)
        heading = (
            direction * lean * (1 - 0.6 * t) + Vector((0, 0, 1)) * (rise + curl * t) + wiggle * t + waving
        ).normalized()
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


def build_anemone(rng, offset, species, morph, material, name):
    mesh = bmesh.new()
    colors = {}
    sway = {}
    column_height = species["column_height"]
    column_and_disc(mesh, colors, sway, morph, column_height)
    count = species["tentacles"]
    for index in range(count):
        # Spread over the disc like sunflower seeds, leaving the mouth bare.
        share = (index + 0.5) / count
        distance = DISC_RADIUS * (0.25 + 0.72 * math.sqrt(share))
        angle = index * 2.39996 + rng.uniform(-0.1, 0.1)
        root = Vector((math.cos(angle) * distance, math.sin(angle) * distance, column_height * 1.05))
        tentacle(mesh, colors, sway, rng, species, morph, root, out=math.sqrt(share))
    bmesh.ops.translate(mesh, verts=mesh.verts, vec=Vector((offset, 0, 0)))
    anemone = plant_object(name, mesh, colors, sway, material)
    mesh.free()
    return anemone


def main():
    for species in SPECIES:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        name = os.path.basename(os.path.dirname(species["output"]))
        rng = random.Random(SEED)
        material = leaf_material(name, 0.35)
        for index, morph in enumerate(species["morphs"]):
            build_anemone(rng, index * VARIANT_SPACING, species, morph, material, name)
        export(species["output"])
        print("ANEMONE written", species["output"])


main()
