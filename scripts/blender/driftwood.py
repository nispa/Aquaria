"""Builds Aquaria's driftwood: branching roots with grooved bark.

Aquarium driftwood is the root or crown of a dead shrub, sanded by water:
spider wood throws thin, twisting branches up and out from a knot, a
fallen branch lies on the floor with twigs rising from it. Each piece here
grows as a skeleton of branches that wander, taper and fork; Blender's
skin modifier wraps it in wood, fused at the forks, and the bark gets
grooves running along each branch, worn pale ridges and dark cracks (colors
in the points, as the plants have them). Each piece is a variant, side by
side, so Aquaria picks one per piece (docs/OBJECTS.md).

Run with Blender 5.2 in the background, from the repository root:

    blender --background --python scripts/blender/driftwood.py

then compress public/assets/objects/branching-driftwood/model.glb with glTF
Transform (meshopt), as the other objects. With `-- preview.png` it also
renders the pieces to that picture, to look at them without Aquaria.
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector, kdtree, noise

sys.path.insert(0, os.path.dirname(__file__))
from plantkit import export, linear, mix  # noqa: E402

OUTPUT = "public/assets/objects/branching-driftwood/model.glb"
SEED = 20261025
# Pieces stand this far apart (m), so Aquaria sees them as separate variants.
SPACING = 1.4
# Length of one step of a branch (m), and how much it may turn at each step.
STEP = 0.02
WANDER = 0.3
# Branches thinner than this (m) stop growing.
THINNEST = 0.004
# How a branch thins along its length (1 is a cone), and a fork's share of its parent.
TAPER = 0.7
FORK_SHARE = (0.55, 0.85)
FORK_ANGLE = (0.45, 0.95)
VOXEL = 0.0025
TRIANGLES = 30000
BARK_DEPTH = 0.0022
# The pieces: where their trunks start, which way, how thick and how long.
# (x, y, z, direction, radius, length, fork chance per step, upward pull)
PIECES = [
    # Spider wood: a knot on the floor, thin branches up and out.
    [
        (0.0, 0.0, 0.03, (0.3, 0.1, 1.0), 0.022, 0.75, 0.14, 0.12),
        (0.0, 0.0, 0.03, (-0.8, 0.2, 0.6), 0.02, 0.7, 0.14, 0.1),
        (0.0, 0.0, 0.03, (0.2, -0.9, 0.3), 0.016, 0.5, 0.14, 0.08),
        (0.0, 0.0, 0.03, (0.9, 0.3, 0.2), 0.018, 0.6, 0.14, 0.08),
        (0.0, 0.0, 0.03, (-0.3, 0.9, 0.5), 0.016, 0.55, 0.14, 0.1),
    ],
    # A fallen branch along the floor, twigs rising from it.
    [
        (-0.45, 0.0, 0.035, (1.0, 0.1, 0.05), 0.035, 0.95, 0.12, 0.06),
    ],
    # A stump with roots spreading on the floor and two arms up.
    [
        (0.0, 0.0, 0.03, (0.4, 0.0, 1.0), 0.035, 0.32, 0.14, 0.06),
        (0.0, 0.0, 0.03, (1.0, 0.3, -0.05), 0.024, 0.5, 0.12, -0.02),
        (0.0, 0.0, 0.03, (-0.9, 0.5, -0.05), 0.022, 0.48, 0.12, -0.02),
        (0.0, 0.0, 0.03, (-0.2, -1.0, -0.05), 0.02, 0.4, 0.12, -0.02),
        (0.0, 0.0, 0.03, (-0.6, -0.6, 0.6), 0.02, 0.4, 0.14, 0.04),
    ],
]
DARK_WOOD = linear("#4a3727")
WOOD = linear("#82654a")
WORN_WOOD = linear("#b49a7a")
CRACK = linear("#1f1610")


def grow(rng, skeleton, parent, start, direction, radius, length, fork, pull):
    """Adds a branch to the skeleton step by step, forking now and then."""
    point = Vector(start)
    heading = Vector(direction).normalized()
    index = parent
    travelled = 0.0
    start_radius = radius
    while travelled < length and radius > THINNEST:
        wobble = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))) * WANDER
        heading = (heading + wobble + Vector((0, 0, pull))).normalized()
        point = point + heading * STEP
        # Branches do not dig into the floor.
        point.z = max(point.z, radius * 0.7)
        travelled += STEP
        # Thinner towards the tip, which ends in a point instead of a stump.
        radius = max(start_radius * (1.0 - travelled / length) ** TAPER, THINNEST * 0.8)
        skeleton.append((point.copy(), radius, heading.copy(), index))
        index = len(skeleton) - 1
        if rng.random() < fork and length - travelled > 0.06:
            side = heading.cross(Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)))).normalized()
            angle = rng.uniform(*FORK_ANGLE)
            branch = (heading * math.cos(angle) + side * math.sin(angle)).normalized()
            share = rng.uniform(*FORK_SHARE)
            grow(rng, skeleton, index, point, branch, radius * share, (length - travelled) * share, fork, pull)


def skinned(name, rng, trunks):
    """The skeleton of a piece wrapped in wood, as an even, dense mesh."""
    # Every trunk starts from one knot, so the skin wraps a single piece of wood.
    x, y, z = trunks[0][:3]
    knot = max(trunk[4] for trunk in trunks) * 1.35
    skeleton = [(Vector((x, y, z)), knot, Vector(trunks[0][3]).normalized(), None)]
    for _, _, _, direction, radius, length, fork, pull in trunks:
        grow(rng, skeleton, 0, (x, y, z), direction, radius, length, fork, pull)
    mesh = bmesh.new()
    verts = [mesh.verts.new(point) for point, _, _, _ in skeleton]
    for vertex, (_, _, _, parent) in zip(verts, skeleton):
        if parent is not None:
            mesh.edges.new((verts[parent], vertex))
    data = bpy.data.meshes.new(name)
    mesh.to_mesh(data)
    mesh.free()
    wood = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(wood)
    wood.modifiers.new("skin", "SKIN")
    for (_, radius, _, _), skin in zip(skeleton, data.skin_vertices[0].data):
        skin.radius = (radius, radius)
    data.skin_vertices[0].data[0].use_root = True
    subsurf = wood.modifiers.new("subsurf", "SUBSURF")
    subsurf.levels = 1
    remesh = wood.modifiers.new("remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = VOXEL
    bpy.context.view_layer.objects.active = wood
    for modifier in ("skin", "subsurf", "remesh"):
        bpy.ops.object.modifier_apply(modifier=modifier)
    keep_largest_part(wood.data)
    return wood, skeleton


def keep_largest_part(data):
    """Drops the crumbs the skin leaves at tight forks: only the main piece stays."""
    mesh = bmesh.new()
    mesh.from_mesh(data)
    parts = []
    seen = set()
    for start in mesh.verts:
        if start.index in seen:
            continue
        part = []
        stack = [start]
        seen.add(start.index)
        while stack:
            vertex = stack.pop()
            part.append(vertex)
            for edge in vertex.link_edges:
                other = edge.other_vert(vertex)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
        parts.append(part)
    parts.sort(key=len, reverse=True)
    bmesh.ops.delete(mesh, geom=[vertex for part in parts[1:] for vertex in part], context="VERTS")
    mesh.to_mesh(data)
    mesh.free()


def carve_and_paint(wood, skeleton, rng):
    """Bark grooves along each branch, worn ridges, cracks; then the colors."""
    tree = kdtree.KDTree(len(skeleton))
    for index, (point, _, _, _) in enumerate(skeleton):
        tree.insert(point, index)
    tree.balance()
    seed = Vector((rng.uniform(0, 100), rng.uniform(0, 100), rng.uniform(0, 100)))
    data = wood.data
    shades = []
    for vertex in data.vertices:
        point = vertex.co.copy()
        _, index, _ = tree.find(point)
        along = skeleton[index][2]
        across = along.orthogonal().normalized()
        around = along.cross(across)
        # Noise stretched along the branch: long grooves, as in sanded wood.
        local = Vector((point.dot(across) * 140.0, point.dot(around) * 140.0, point.dot(along) * 9.0)) + seed
        groove = max(0.0, 1.0 - abs(noise.noise(local)) / 0.22)
        crack = max(0.0, 1.0 - abs(noise.noise(local * 0.6 + seed)) / 0.05)
        ridge = 0.5 + 0.5 * noise.noise(point * 25.0 + seed)
        on_floor = point.z < 0.003
        if not on_floor:
            vertex.co = point - vertex.normal * (groove * 0.6 + crack) * BARK_DEPTH
        shades.append((point, groove, crack, ridge, vertex.normal.z))
    colors = data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    for vertex, (point, groove, crack, ridge, facing_up) in zip(data.vertices, shades):
        broad = 0.5 + 0.5 * noise.noise(point * 6.0 - seed)
        color = mix(DARK_WOOD, WOOD, 0.4 + broad)
        # Water and sand wear the upper sides pale.
        color = mix(color, WORN_WOOD, max(0.0, facing_up) * ridge * 0.6 * (1.0 - groove))
        color = mix(color, DARK_WOOD, groove * 0.5)
        color = mix(color, CRACK, crack * 0.8)
        colors.data[vertex.index].color = list(color) + [1.0]
    data.color_attributes.active_color = colors


def finish(wood, offset, material):
    """Fewer triangles, smooth wood, standing on the origin at its place."""
    decimate = wood.modifiers.new("decimate", "DECIMATE")
    decimate.ratio = min(1.0, TRIANGLES / max(len(wood.data.polygons), 1))
    bpy.context.view_layer.objects.active = wood
    bpy.ops.object.modifier_apply(modifier="decimate")
    for polygon in wood.data.polygons:
        polygon.use_smooth = True
    wood.data.materials.append(material)
    wood.location.x = offset


def wood_material():
    material = bpy.data.materials.new("driftwood")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    principled = nodes["Principled BSDF"]
    principled.inputs["Roughness"].default_value = 0.8
    attribute = nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = "Col"
    material.node_tree.links.new(attribute.outputs["Color"], principled.inputs["Base Color"])
    return material


def preview(path):
    """Renders the pieces from the front and slightly above, as a quick look."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "VERTEX"
    scene.display.shading.light = "STUDIO"
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 600
    camera_data = bpy.data.cameras.new("camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = SPACING * len(PIECES) * 0.8
    camera = bpy.data.objects.new("camera", camera_data)
    camera.location = (SPACING * (len(PIECES) - 1) / 2, -3.0, 1.15)
    camera.rotation_euler = (math.radians(75), 0.0, 0.0)
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(SEED)
    material = wood_material()
    for index, trunks in enumerate(PIECES):
        wood, skeleton = skinned(f"driftwood-{index}", rng, trunks)
        carve_and_paint(wood, skeleton, rng)
        finish(wood, index * SPACING, material)
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if arguments:
        preview(arguments[0])
    export(OUTPUT)
    print("DRIFTWOOD written", OUTPUT)


main()
