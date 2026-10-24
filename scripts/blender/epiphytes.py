"""Builds Aquaria's plants that grow on stone and wood: Anubias, Java fern, moss.

They share the leaf builder of freshwater_plants.py. Anubias is a compact
rosette of broad, leathery, dark green leaves on short petioles; Java fern a
fan of long, narrow, ribbed blades; the moss a cushion of fine, curling
strands, pale green at the base and bright at the tips. Each plant is a
variant, side by side (docs/OBJECTS.md); `_SWAY` runs from 0 at the base to
1 at the tips, most gently on the Anubias.

Run with Blender 5.2 in the background, from the repository root:

    blender --background --python scripts/blender/epiphytes.py

then compress each model.glb with glTF Transform (meshopt, --join false
--flatten false --simplify false). With `-- preview.png` it also renders
every plant to a picture next to that name (anubias-preview.png...).
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from freshwater_plants import OUTPUT, VARIANTS, add_leaf, clear, render_preview  # noqa: E402
from plantkit import VARIANT_SPACING, export, leaf_material, linear, mix, plant_object  # noqa: E402

SEED = 20261027


def build_anubias(rng, offset, material):
    mesh = bmesh.new()
    colors, sway = {}, {}
    petiole = linear("#6a8a48")
    upper = linear("#2f6a2c")
    lower = linear("#1f4f22")
    for index in range(rng.randint(7, 10)):
        heading = index * 2.4 + rng.uniform(-0.2, 0.2)
        shade = rng.uniform(0.85, 1.12)
        direction = Vector((math.cos(heading), math.sin(heading), 0.0))
        origin = Vector((offset, 0.0, 0.0)) + direction * 0.03
        petiole_length = rng.uniform(0.3, 0.5)
        add_leaf(mesh, colors, sway, origin, heading, 1.1, petiole_length, 0.04, "strap", [(0.0, petiole), (1.0, petiole)], curl=0.1, along=3)
        top = origin + direction * (petiole_length * 0.5) + Vector((0, 0, petiole_length * 0.88))
        stops = [(0.0, [c * shade for c in petiole]), (0.12, [c * shade for c in upper]), (1.0, [c * shade for c in lower])]
        add_leaf(mesh, colors, sway, top, heading, 0.5, 0.55, 0.36, "ovate", stops, curl=0.4, ruffle=0.01, along=10, sway_from=0.5, droop=0.1)
    plant = plant_object("anubias", mesh, colors, sway, material)
    mesh.free()
    return plant


def build_java_fern(rng, offset, material):
    mesh = bmesh.new()
    colors, sway = {}, {}
    base = linear("#7a8a40")
    green = linear("#3f6a2a")
    tip = linear("#6a9a3a")
    for index in range(rng.randint(12, 17)):
        heading = rng.uniform(0, math.tau)
        shade = rng.uniform(0.85, 1.12)
        origin = Vector((offset + rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), 0.0))
        stops = [(0.0, [c * shade for c in base]), (0.2, [c * shade for c in green]), (1.0, [c * shade for c in tip])]
        add_leaf(
            mesh, colors, sway, origin, heading, rng.uniform(0.9, 1.3), rng.uniform(0.7, 1.0), 0.13, "lanceolate", stops,
            curl=rng.uniform(0.4, 1.0), ruffle=0.025, twist=rng.uniform(-0.4, 0.4), along=10, droop=0.2,
        )
    plant = plant_object("java-fern", mesh, colors, sway, material)
    mesh.free()
    return plant


def build_moss(rng, offset, material):
    mesh = bmesh.new()
    colors, sway = {}, {}
    base = linear("#3f5a28")
    green = linear("#5fa030")
    tip = linear("#9ad050")
    for _ in range(rng.randint(140, 200)):
        angle = rng.uniform(0, math.tau)
        distance = rng.uniform(0.0, 0.45) ** 1.3
        origin = Vector((offset + math.cos(angle) * distance, math.sin(angle) * distance, 0.0))
        shade = rng.uniform(0.85, 1.15)
        stops = [(0.0, [c * shade for c in base]), (0.5, [c * shade for c in green]), (1.0, [c * shade for c in tip])]
        add_leaf(
            mesh, colors, sway, origin, angle + rng.uniform(-1.0, 1.0), rng.uniform(0.9, 1.4), rng.uniform(0.3, 0.55), 0.012, "strap",
            stops, curl=rng.uniform(0.3, 1.2), twist=rng.uniform(-1.0, 1.0), along=5,
        )
    plant = plant_object("moss", mesh, colors, sway, material)
    mesh.free()
    return plant


def main():
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(SEED)
    plants = [
        ("anubias", lambda i, m: build_anubias(rng, i * VARIANT_SPACING, m), 0.35),
        ("java-fern", lambda i, m: build_java_fern(rng, i * VARIANT_SPACING, m), 0.5),
        ("moss-cushion", lambda i, m: build_moss(rng, i * VARIANT_SPACING, m), 0.9),
    ]
    for name, build, roughness in plants:
        clear()
        material = leaf_material(name, roughness)
        for index in range(VARIANTS):
            build(index, material)
        if arguments:
            render_preview(arguments[0].replace(".png", f"-{name}.png"), VARIANTS)
        export(OUTPUT.format(name))
        print("PLANT written", name)


main()
