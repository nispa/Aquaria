"""Shared pieces for the Blender scripts that build Aquaria's plants.

Each plant script (kelp.py, seagrass.py) builds its leaves point by point
in a bmesh, giving every point a color and a sway weight, and calls these
helpers to turn them into objects and export them. docs/OBJECTS.md tells
what Aquaria expects: one plant per top-level object, side by side, with
`_SWAY` from 0 at the base to 1 at the tips. Blender's Z is up; sizes are
in plant heights (Aquaria scales a plant to its height in the scene).
"""

import os

import bpy

# Variants stand this far apart, so Aquaria sees them as separate plants.
VARIANT_SPACING = 3.0


def linear(hex_color):
    """An sRGB hex color as linear RGB, as vertex colors are stored."""
    value = hex_color.lstrip("#")
    channels = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]


def mix(a, b, t):
    t = min(max(t, 0.0), 1.0)
    return [x + (y - x) * t for x, y in zip(a, b)]


def ramp(stops, t):
    """A color along (position, linear color) stops, positions rising from 0 to 1."""
    for (start, low), (end, high) in zip(stops, stops[1:]):
        if t <= end:
            return mix(low, high, (t - start) / (end - start))
    return stops[-1][1]


def leaf_material(name, roughness):
    """Double-sided, colored by the points: leaves are seen from both sides."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = False
    nodes = material.node_tree.nodes
    principled = nodes["Principled BSDF"]
    principled.inputs["Roughness"].default_value = roughness
    attribute = nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = "Col"
    material.node_tree.links.new(attribute.outputs["Color"], principled.inputs["Base Color"])
    return material


def plant_object(name, mesh, colors, sway, material):
    """An object from a bmesh whose points carry a color (RGB) and a sway weight."""
    data = bpy.data.meshes.new(name)
    mesh.to_mesh(data)
    color_layer = data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    sway_layer = data.attributes.new("_SWAY", "FLOAT", "POINT")
    for vertex in mesh.verts:
        color_layer.data[vertex.index].color = list(colors[vertex]) + [1.0]
        sway_layer.data[vertex.index].value = sway[vertex]
    data.color_attributes.active_color = color_layer
    for polygon in data.polygons:
        polygon.use_smooth = True
    data.materials.append(material)
    plant = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(plant)
    return plant


def export(path):
    """Writes the plants as a .glb. Compress it keeping them apart (docs/OBJECTS.md)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_vertex_color="ACTIVE",
        export_attributes=True,
    )
