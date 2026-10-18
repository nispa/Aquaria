"""Builds Aquaria's turtle grass: tufts of strap-like seagrass blades.

Turtle grass (Thalassia testudinum) carpets the sand around reefs: short
shoots, each with a few flat blades folded a little along the midrib,
rising and arching outwards. The sheath at the base is pale, the blade
green, lighter towards the tip; older blades have yellowed, worn tips.
Each tuft is a variant, laid side by side so Aquaria picks one per plant
(docs/OBJECTS.md); `_SWAY` runs from 0 at the sand to 1 at the tips.

Run with Blender 5.2 in the background, from the repository root:

    blender --background --python scripts/blender/seagrass.py

then compress public/assets/objects/turtle-grass/model.glb with glTF
Transform (meshopt, --join false --flatten false).
"""

import math
import os
import random
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(__file__))
from plantkit import VARIANT_SPACING, export, leaf_material, linear, mix, plant_object, ramp  # noqa: E402

OUTPUT = "public/assets/objects/turtle-grass/model.glb"
SEED = 20261018
VARIANTS = 4
# Points along a blade; across it the blade is folded on its midrib.
ALONG = 14
SHEATH = "#cfc79a"
GREEN = "#3f7a2a"
LIGHT_GREEN = "#78b048"
TIP = "#aac862"
WORN_TIP = "#9a8442"
# Share of the blades with old, yellowed tips.
WORN_SHARE = 0.35
# How deep the fold along the midrib is, as a share of the blade's width.
FOLD = 0.18


def blade_colors(rng):
    """Color stops from the sheath to the tip, a little different per blade."""
    shade = rng.uniform(0.85, 1.12)
    green = [c * shade for c in linear(GREEN)]
    light = [c * shade for c in linear(LIGHT_GREEN)]
    tip = linear(WORN_TIP) if rng.random() < WORN_SHARE else [c * shade for c in linear(TIP)]
    return [(0.0, linear(SHEATH)), (0.1, green), (0.6, light), (0.9, mix(light, tip, 0.6)), (1.0, tip)]


def add_blade(mesh, colors, sway, rng, root, heading, length, width):
    """One blade rising from a shoot and arching outwards, folded on its midrib."""
    arch = rng.uniform(0.25, 0.75)
    twist = rng.uniform(-0.6, 0.6)
    stops = blade_colors(rng)
    rows = []
    for i in range(ALONG + 1):
        t = i / ALONG
        # Up, then over: the blade leans out more and more towards its tip.
        out = arch * length * t * t
        x = root[0] + math.cos(heading) * out
        y = root[1] + math.sin(heading) * out
        z = length * t * (1 - 0.35 * arch * t * t)
        # A strap with a rounded tip.
        half = 0.5 * width * (1.0 if t < 0.85 else math.sqrt(max(1 - ((t - 0.85) / 0.15) ** 2, 0.04)))
        across = heading + math.pi / 2 + twist * t
        color = ramp(stops, t)
        row = []
        for s in (-1.0, 0.0, 1.0):
            # The midrib stands a little proud of the edges: the fold.
            lift = FOLD * width * (1 - abs(s))
            vertex = mesh.verts.new(
                (
                    x + math.cos(across) * s * half - math.cos(heading) * lift,
                    y + math.sin(across) * s * half - math.sin(heading) * lift,
                    z,
                )
            )
            colors[vertex] = color
            sway[vertex] = t**1.5
            row.append(vertex)
        rows.append(row)
    for i in range(ALONG):
        for j in range(2):
            mesh.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))


def build_tuft(rng, offset, material):
    mesh = bmesh.new()
    colors = {}
    sway = {}
    for _ in range(rng.randint(5, 9)):
        angle = rng.uniform(0, math.tau)
        distance = rng.uniform(0.0, 0.22)
        shoot = (offset + math.cos(angle) * distance, math.sin(angle) * distance)
        facing = rng.uniform(0, math.tau)
        for blade in range(rng.randint(3, 6)):
            heading = facing + (blade - 1.5) * rng.uniform(0.3, 0.7)
            add_blade(
                mesh,
                colors,
                sway,
                rng,
                shoot,
                heading,
                length=rng.uniform(0.5, 1.0),
                width=rng.uniform(0.028, 0.04),
            )
    tuft = plant_object("turtle-grass", mesh, colors, sway, material)
    mesh.free()
    return tuft


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(SEED)
    material = leaf_material("turtle-grass", 0.5)
    for index in range(VARIANTS):
        build_tuft(rng, index * VARIANT_SPACING, material)
    export(OUTPUT)
    print("SEAGRASS written", OUTPUT)


main()
