"""Builds Aquaria's Seiryu stones, the rocks of an iwagumi.

Seiryu stone is a hard, angular limestone, blue-grey with pale calcite
veins, worn into ridges that follow its layers. Each stone here starts as a
tapered, leaning block, is broken by flat cuts into facets, then gets the
grooves of its layers, a rough skin, small pits and its colors (in the
points, as the plants have them). The stones differ in size and shape: one
tall and leaning to stand as the main stone of a composition, others
squat or flat to lay around it. Each is a variant, side by side, so
Aquaria picks one per stone (docs/OBJECTS.md).

Run with Blender 5.2 in the background, from the repository root:

    blender --background --python scripts/blender/seiryu.py

then compress public/assets/objects/seiryu-stone/model.glb with glTF
Transform (meshopt), as the other objects. With `-- preview.png` it also
renders the stones to that picture, to look at them without Aquaria.
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(__file__))
from plantkit import export, linear, mix  # noqa: E402

OUTPUT = "public/assets/objects/seiryu-stone/model.glb"
SEED = 20261024
# Stones stand this far apart (m), so Aquaria sees them as separate variants.
SPACING = 0.5
# (width, depth, height, taper towards the top, lean, cuts): meters.
STONES = [
    (0.30, 0.22, 0.44, 0.55, 0.16, 16),  # the main stone: tall, leaning
    (0.26, 0.20, 0.26, 0.35, 0.05, 14),
    (0.24, 0.18, 0.17, 0.30, -0.04, 13),
    (0.28, 0.22, 0.12, 0.25, 0.02, 13),  # flat, to lie at the feet
    (0.16, 0.14, 0.14, 0.40, -0.06, 12),
    (0.12, 0.10, 0.07, 0.20, 0.0, 10),  # a pebble-sized chip
]
# Points of the surface per meter after remeshing; triangles kept at the end.
VOXELS_PER_METER = 260
TRIANGLES = 14000
# Layers: how far apart (m), how steep (radians) and how deep their grooves cut.
LAYER_SPACING = 0.034
LAYER_TILT = 0.3
GROOVE_DEPTH = 0.011
GROOVE_WIDTH = 0.14
ROUGHNESS = 0.0025
PIT_DEPTH = 0.004
DARK_STONE = linear("#58626a")
STONE = linear("#7d888f")
LIGHT_STONE = linear("#9ba5aa")
VEIN = linear("#d4d6d1")
CREVICE = linear("#2f363c")


def broken_block(rng, width, depth, height, taper, lean, cuts):
    """A tapered, leaning block broken by flat cuts into an angular stone."""
    mesh = bmesh.new()
    bmesh.ops.create_cube(mesh, size=1.0)
    for vertex in mesh.verts:
        x, y, z = vertex.co
        up = z + 0.5
        narrow = 1.0 - taper * up
        vertex.co = Vector((x * width * narrow + lean * up * height, y * depth * narrow, up * height))
    center = Vector((lean * height * 0.4, 0.0, height * 0.45))
    # Tall stones are cut mostly from the sides, so they keep their height.
    upward = min(1.0, max(width, depth) / height)
    for _ in range(cuts):
        # Mostly sideways and up: the base stays flat to stand on the floor.
        normal = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.15, upward))).normalized()
        reach = max((vertex.co - center).dot(normal) for vertex in mesh.verts)
        point = center + normal * reach * rng.uniform(0.45, 0.8)
        cut = bmesh.ops.bisect_plane(
            mesh, geom=mesh.verts[:] + mesh.edges[:] + mesh.faces[:], plane_co=point, plane_no=normal, clear_outer=True
        )
        edges = [item for item in cut["geom_cut"] if isinstance(item, bmesh.types.BMEdge)]
        bmesh.ops.holes_fill(mesh, edges=edges, sides=0)
    return mesh


def remeshed(name, mesh, size):
    """The stone as an object with even, dense points, so grooves can be carved."""
    data = bpy.data.meshes.new(name)
    mesh.to_mesh(data)
    mesh.free()
    stone = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(stone)
    remesh = stone.modifiers.new("remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = max(size / VOXELS_PER_METER, 0.0012)
    bpy.context.view_layer.objects.active = stone
    bpy.ops.object.modifier_apply(modifier="remesh")
    return stone


def layer_of(point, layer_axis, warp_seed):
    """Where a point lies across the layers, in layers, slightly wavy."""
    warp = noise.noise(point * 4.0 + warp_seed) * 1.1 + noise.noise(point * 15.0 - warp_seed) * 0.25
    return point.dot(layer_axis) / LAYER_SPACING + warp


def groove(layer, depth_seed):
    """0 on a layer's face, up to 1 in the groove between two layers."""
    offset = layer - math.floor(layer) - 0.5
    strength = max(0.0, 0.35 + 0.8 * noise.noise(Vector((layer * 0.37, depth_seed, 0.0))))
    return math.exp(-((offset / GROOVE_WIDTH) ** 2)) * strength


def carve_and_paint(stone, rng):
    """Grooves, rough skin and pits; then the colors, veins and dark crevices."""
    tilt = rng.uniform(-LAYER_TILT, LAYER_TILT)
    turn = rng.uniform(0, math.tau)
    layer_axis = Vector((math.sin(tilt) * math.cos(turn), math.sin(tilt) * math.sin(turn), math.cos(tilt)))
    seed = Vector((rng.uniform(0, 100), rng.uniform(0, 100), rng.uniform(0, 100)))
    data = stone.data
    normals = [vertex.normal.copy() for vertex in data.vertices]
    shades = []
    for vertex, normal in zip(data.vertices, normals):
        point = vertex.co.copy()
        # Grooves show on the sides; the tops are worn smooth.
        side = 1.0 - abs(normal.dot(layer_axis)) ** 2
        layer = layer_of(point, layer_axis, seed)
        # Runnels: rain wore channels down the sides, across the layers.
        stretched = Vector((point.x * 34.0, point.y * 34.0, point.z * 4.0)) + seed
        runnel = max(0.0, 1.0 - abs(noise.noise(stretched)) / 0.16) * side * 0.7
        cut = max(groove(layer, seed.x) * side, runnel)
        rough = noise.fractal(point * 60.0 + seed, 0.6, 2.0, 4) * ROUGHNESS
        distances, _ = noise.voronoi(point * 70.0 + seed)
        sparse = max(0.0, noise.noise(point * 12.0 + seed))
        pit = max(0.0, 1.0 - distances[0] / 0.35) * sparse * PIT_DEPTH
        floor = point.z < 0.002
        if not floor:
            vertex.co = point + normal * (rough - cut * GROOVE_DEPTH - pit)
        shades.append((point, cut, pit, layer))

    colors = data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    for vertex, (point, cut, pit, layer) in zip(data.vertices, shades):
        broad = 0.5 + 0.5 * noise.noise(point * 7.0 + seed)
        fine = 0.5 + 0.5 * noise.noise(point * 18.0 - seed)
        color = mix(DARK_STONE, STONE, 0.3 + broad)
        color = mix(color, LIGHT_STONE, (fine - 0.5) * 1.2)
        # Calcite veins: thin lines that wander across the layers.
        vein_line = abs(noise.noise(point * 11.0 + seed * 2.0))
        vein = max(0.0, 1.0 - vein_line / 0.035) * (0.6 + 0.4 * fine)
        # Some layers are paler throughout.
        pale_layer = max(0.0, noise.noise(Vector((math.floor(layer) * 0.71, seed.y, 1.0))) - 0.35)
        color = mix(color, VEIN, vein * 0.85 + pale_layer * 0.5)
        color = mix(color, CREVICE, cut * 0.6 + pit / PIT_DEPTH * 0.5)
        colors.data[vertex.index].color = list(color) + [1.0]
    data.color_attributes.active_color = colors


def finish(stone, offset, material):
    """Fewer triangles, sharp facets kept, standing on the origin at its place."""
    decimate = stone.modifiers.new("decimate", "DECIMATE")
    decimate.ratio = min(1.0, TRIANGLES / max(len(stone.data.polygons), 1))
    bpy.context.view_layer.objects.active = stone
    bpy.ops.object.modifier_apply(modifier="decimate")
    stone.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))
    stone.select_set(False)
    stone.data.materials.append(material)
    stone.location.x = offset


def stone_material():
    material = bpy.data.materials.new("seiryu-stone")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    principled = nodes["Principled BSDF"]
    principled.inputs["Roughness"].default_value = 0.85
    attribute = nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = "Col"
    material.node_tree.links.new(attribute.outputs["Color"], principled.inputs["Base Color"])
    return material


def preview(path):
    """Renders the stones from the front, lit from above, as a quick look."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "VERTEX"
    scene.display.shading.light = "STUDIO"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 420
    camera_data = bpy.data.cameras.new("camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = SPACING * len(STONES)
    camera = bpy.data.objects.new("camera", camera_data)
    camera.location = (SPACING * (len(STONES) - 1) / 2, -3.0, 0.75)
    camera.rotation_euler = (math.radians(78), 0.0, 0.0)
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(SEED)
    material = stone_material()
    for index, (width, depth, height, taper, lean, cuts) in enumerate(STONES):
        name = f"seiryu-{index}"
        stone = remeshed(name, broken_block(rng, width, depth, height, taper, lean, cuts), max(width, height))
        carve_and_paint(stone, rng)
        finish(stone, index * SPACING, material)
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if arguments:
        preview(arguments[0])
    export(OUTPUT)
    print("SEIRYU written", OUTPUT)


main()
