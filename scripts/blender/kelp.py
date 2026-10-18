"""Builds Aquaria's ribbon kelp: a holdfast with long, ruffled blades.

The blades are the broad, wavy ribbons of kelp forests: narrow at the
holdfast, widest past the middle, their edges ruffled, olive brown at the
base and golden green towards the tips, where the light comes through.
Each plant is a variant, laid side by side so Aquaria picks one per plant
(docs/OBJECTS.md). Every point carries `_SWAY`, from 0 at the holdfast to
1 at the tips, so the current moves the blades and not the base.

Run with Blender 5.2 in the background, from the repository root:

    blender --background --python scripts/blender/kelp.py

then compress public/assets/objects/ribbon-kelp/model.glb with glTF
Transform (meshopt), as the other objects.
"""

import math
import os
import random

import bpy
import bmesh

OUTPUT = "public/assets/objects/ribbon-kelp/model.glb"
SEED = 20261018
VARIANTS = 3
# Variants stand this far apart, so Aquaria sees them as separate plants.
VARIANT_SPACING = 3.0
# Points along a blade and across it.
ALONG = 64
ACROSS = 6
BASE_COLOR = "#4b4a1c"
MIDDLE_COLOR = "#7f9a2c"
TIP_COLOR = "#c9c454"
# The thin margin of a blade lets more light through: lighter.
MARGIN_LIGHT = 0.18


def linear(hex_color):
    value = hex_color.lstrip("#")
    channels = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]


def mix(a, b, t):
    return [x + (y - x) * t for x, y in zip(a, b)]


def blade_color(t, edge):
    base, middle, tip = linear(BASE_COLOR), linear(MIDDLE_COLOR), linear(TIP_COLOR)
    color = mix(base, middle, t / 0.45) if t < 0.45 else mix(middle, tip, (t - 0.45) / 0.55)
    color = [min(c * (1 + MARGIN_LIGHT * edge), 1.0) for c in color]
    return color + [1.0]


def add_blade(mesh, colors, sway, rng, origin, height):
    """One ribbon rising from the holdfast, leaning and twisting as it goes."""
    length = height * rng.uniform(0.65, 1.0)
    width = height * rng.uniform(0.05, 0.085)
    lean = rng.uniform(0.05, 0.3)
    heading = rng.uniform(0, math.tau)
    twist = rng.uniform(-1.2, 1.2)
    ruffle = width * rng.uniform(0.25, 0.4)
    waves = rng.uniform(14, 22)
    phase = rng.uniform(0, math.tau)
    rows = []
    for i in range(ALONG + 1):
        t = i / ALONG
        # The midrib: up, bending over a little with height.
        bend = lean * t * t
        cx = origin[0] + math.cos(heading) * bend * length
        cy = origin[1] + math.sin(heading) * bend * length
        cz = origin[2] + length * t * (1 - 0.25 * lean * t)
        half = 0.5 * width * math.sin(math.pi * min(t * 1.15, 1.0)) ** 0.6 + width * 0.04
        angle = heading + math.pi / 2 + twist * t
        row = []
        for j in range(ACROSS + 1):
            s = j / ACROSS * 2 - 1
            edge = abs(s)
            # The edges ruffle in and out of the blade's plane.
            out = ruffle * edge**2 * math.sin(waves * t + phase + s) * math.sin(math.pi * t)
            x = cx + math.cos(angle) * s * half + math.cos(angle + math.pi / 2) * out
            y = cy + math.sin(angle) * s * half + math.sin(angle + math.pi / 2) * out
            vertex = mesh.verts.new((x, y, cz))
            colors[vertex] = blade_color(t, edge)
            sway[vertex] = t**1.2
            row.append(vertex)
        rows.append(row)
    for i in range(ALONG):
        for j in range(ACROSS):
            mesh.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))


def build_plant(rng, offset):
    mesh = bmesh.new()
    colors = {}
    sway = {}
    height = 1.0
    for _ in range(rng.randint(4, 7)):
        spot = (offset + rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), 0.0)
        add_blade(mesh, colors, sway, rng, spot, height)
    data = bpy.data.meshes.new("ribbon-kelp")
    mesh.to_mesh(data)
    color_layer = data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    sway_layer = data.attributes.new("_SWAY", "FLOAT", "POINT")
    for vertex in mesh.verts:
        color_layer.data[vertex.index].color = colors[vertex]
        sway_layer.data[vertex.index].value = sway[vertex]
    data.color_attributes.active_color = color_layer
    mesh.free()
    for polygon in data.polygons:
        polygon.use_smooth = True
    plant = bpy.data.objects.new("ribbon-kelp", data)
    bpy.context.scene.collection.objects.link(plant)
    return plant


def blade_material():
    material = bpy.data.materials.new("ribbon-kelp")
    material.use_nodes = True
    material.use_backface_culling = False
    nodes = material.node_tree.nodes
    principled = nodes["Principled BSDF"]
    principled.inputs["Roughness"].default_value = 0.45
    attribute = nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = "Col"
    material.node_tree.links.new(attribute.outputs["Color"], principled.inputs["Base Color"])
    return material


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(SEED)
    material = blade_material()
    for index in range(VARIANTS):
        plant = build_plant(rng, index * VARIANT_SPACING)
        plant.data.materials.append(material)
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT,
        export_format="GLB",
        export_yup=True,
        export_vertex_color="ACTIVE",
        export_attributes=True,
    )
    print("KELP written", OUTPUT)


main()
