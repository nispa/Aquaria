"""Builds Aquaria's sea lettuce: rosettes of broad, ruffled green sheets.

Sea lettuce (Ulva) grows in loose clumps of thin sheets, two cells thick,
so light shines through them: bright lime green, lighter at the frilled
margins, a little darker where the sheets gather at the holdfast. Each
clump is a variant, laid side by side so Aquaria picks one per plant
(docs/OBJECTS.md); `_SWAY` runs from 0 at the holdfast to 1 at the edges.

Run with Blender 5.2 in the background, from the repository root:

    blender --background --python scripts/blender/sea_lettuce.py

then compress public/assets/objects/sea-lettuce/model.glb with glTF
Transform (meshopt, --join false --flatten false).
"""

import math
import os
import random
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(__file__))
from plantkit import VARIANT_SPACING, export, leaf_material, linear, mix, plant_object  # noqa: E402

OUTPUT = "public/assets/objects/sea-lettuce/model.glb"
SEED = 20261018
VARIANTS = 4
# Points from the holdfast to the tip of a sheet, and across it.
ALONG = 18
ACROSS = 10
BASE = "#2f6a1f"
BLADE = "#5fae2e"
MARGIN = "#a6d85a"


def sheet_color(t, edge):
    color = mix(linear(BASE), linear(BLADE), t / 0.35)
    return mix(color, linear(MARGIN), edge**3 * min(t / 0.3, 1.0))


def add_sheet(mesh, colors, sway, rng, root, heading):
    """One sheet rising from the holdfast, opening out and frilled at its margin."""
    length = rng.uniform(0.6, 1.0)
    width = length * rng.uniform(0.45, 0.7)
    rise = rng.uniform(0.2, 0.5)
    frills = rng.uniform(9, 14)
    frill = width * rng.uniform(0.16, 0.26)
    phase = rng.uniform(0, math.tau)
    cup = rng.uniform(0.04, 0.14)
    rows = []
    for i in range(ALONG + 1):
        t = i / ALONG
        # The midline leans out from the holdfast and curls up.
        lean = (1 - rise) * t
        x = root[0] + math.cos(heading) * lean * length
        y = root[1] + math.sin(heading) * lean * length
        z = length * rise * math.sin(t * math.pi / 2)
        # Narrow stalk, wide oval blade.
        half = 0.5 * width * math.sin(math.pi * min(t * 0.95 + 0.05, 1.0)) ** 0.8 * min(t / 0.15, 1.0)
        row = []
        for j in range(ACROSS + 1):
            s = j / ACROSS * 2 - 1
            edge = abs(s)
            across = heading + math.pi / 2
            # The sheet cups a little and its margin frills in and out.
            wave = frill * edge**2 * math.sin(frills * (t + 0.3 * s) + phase) * t
            up = cup * width * s * s + wave
            vertex = mesh.verts.new(
                (
                    x + math.cos(across) * s * half - math.cos(heading) * up * 0.5,
                    y + math.sin(across) * s * half - math.sin(heading) * up * 0.5,
                    z + up,
                )
            )
            colors[vertex] = sheet_color(t, edge)
            sway[vertex] = min(t * (0.6 + 0.4 * edge), 1.0) ** 1.3
            row.append(vertex)
        rows.append(row)
    for i in range(ALONG):
        for j in range(ACROSS):
            mesh.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))


def build_clump(rng, offset, material):
    mesh = bmesh.new()
    colors = {}
    sway = {}
    count = rng.randint(5, 9)
    for index in range(count):
        heading = index / count * math.tau + rng.uniform(-0.4, 0.4)
        root = (offset + rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03))
        add_sheet(mesh, colors, sway, rng, root, heading)
    clump = plant_object("sea-lettuce", mesh, colors, sway, material)
    mesh.free()
    return clump


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(SEED)
    material = leaf_material("sea-lettuce", 0.4)
    for index in range(VARIANTS):
        build_clump(rng, index * VARIANT_SPACING, material)
    export(OUTPUT)
    print("SEA LETTUCE written", OUTPUT)


main()
