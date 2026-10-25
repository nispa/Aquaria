"""Shared pieces for the Blender scripts that build Aquaria's plants.

Each plant script (kelp.py, seagrass.py) builds its leaves point by point
in a bmesh, giving every point a color and a sway weight, and calls these
helpers to turn them into objects and export them. A point may also carry
where it lies on a leaf (`leaf_spot`), for a texture painted by
leafpaint.py; the others take its plain strip. docs/OBJECTS.md tells
what Aquaria expects: one plant per top-level object, side by side, with
`_SWAY` from 0 at the base to 1 at the tips. Blender's Z is up; sizes are
in plant heights (Aquaria scales a plant to its height in the scene).
"""

import os

import bmesh
import bpy

# Variants stand this far apart, so Aquaria sees them as separate plants.
VARIANT_SPACING = 3.0
# Where on the texture a point that is not on a leaf takes its color: the plain strip.
PLAIN_UV = (0.975, 0.5)


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


def leaf_material(name, roughness, image=None):
    """Double-sided, colored by the points: leaves are seen from both sides.

    With an `image` (leafpaint.py), it is the base color texture: Aquaria
    multiplies it by the points' colors, so the points keep the hue and
    the texture draws the veins.
    """
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = False
    nodes = material.node_tree.nodes
    principled = nodes["Principled BSDF"]
    principled.inputs["Roughness"].default_value = roughness
    if image is None:
        attribute = nodes.new("ShaderNodeVertexColor")
        attribute.layer_name = "Col"
        material.node_tree.links.new(attribute.outputs["Color"], principled.inputs["Base Color"])
    else:
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = image
        material.node_tree.links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    return material


def leaf_mesh():
    """An empty bmesh whose points can say where they lie on a leaf.

    The layers are made first: adding one later frees the points already made.
    """
    mesh = bmesh.new()
    mesh.verts.layers.float.new("leaf_u")
    mesh.verts.layers.float.new("leaf_v")
    mesh.verts.layers.int.new("on_leaf")
    return mesh


def leaf_spot(mesh, vertex, u, v):
    """Marks a point as lying at (u, v) on the leaf texture."""
    vertex[mesh.verts.layers.float["leaf_u"]] = u
    vertex[mesh.verts.layers.float["leaf_v"]] = v
    vertex[mesh.verts.layers.int["on_leaf"]] = 1


def plant_object(name, mesh, colors, sway, material, extra=None):
    """An object from a bmesh whose points carry a color (RGB) and a sway weight.

    `extra` names more per-point values to export, e.g. {"_STRAND": {point: 0.3}}:
    glTF keeps custom attributes whose names start with an underscore.
    """
    u_layer = mesh.verts.layers.float.get("leaf_u")
    v_layer = mesh.verts.layers.float.get("leaf_v")
    on_leaf = mesh.verts.layers.int.get("on_leaf")
    if on_leaf is not None:
        uv = mesh.loops.layers.uv.verify()
        for face in mesh.faces:
            for loop in face.loops:
                point = loop.vert
                loop[uv].uv = (point[u_layer], point[v_layer]) if point[on_leaf] else PLAIN_UV
    data = bpy.data.meshes.new(name)
    mesh.to_mesh(data)
    color_layer = data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    sway_layer = data.attributes.new("_SWAY", "FLOAT", "POINT")
    for vertex in mesh.verts:
        color_layer.data[vertex.index].color = list(colors[vertex]) + [1.0]
        sway_layer.data[vertex.index].value = sway[vertex]
    for attribute, values in (extra or {}).items():
        layer = data.attributes.new(attribute, "FLOAT", "POINT")
        for vertex in mesh.verts:
            layer.data[vertex.index].value = values.get(vertex, 0.0)
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
