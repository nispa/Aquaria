"""Turns the Smithsonian's coral and sponge scans into Aquaria objects.

The National Museum of Natural History scanned dried specimens of its
collection and released the scans as CC0 (3d.si.edu). They are bleached
skeletons: this script stands each one up, thins it to a few ten thousand
triangles and brings it back to life. The texture becomes a light grey
where living tissue softens the pores, and the vertex colors darken the
base and lighten the growing tips, as on a healthy colony. Aquaria then
tints it with the object's color (the `tint` trait), so the same scan can be
a living orange staghorn or a purple one.

Run with Blender 5.2 in the background, from the repository root:

    blender --background --python scripts/blender/coral_scans.py -- downloads/smithsonian

The scans are the "Medium" glb files of each record, saved in that folder
under the names in SCANS. Each object then goes through glTF Transform
(meshopt and KTX2), see docs/OBJECTS.md.
"""

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Euler, Vector

OUTPUT = "public/assets/objects"
TEXTURE_SIZE = 1024
# Light grey the texture is brought to, so the tint decides the color.
TARGET_BRIGHTNESS = 0.86
# How much of the scan's own light and dark is kept around that grey.
CONTRAST = 1.15
# The darkest the scan's ambient occlusion makes a crevice.
OCCLUSION_FLOOR = 0.35
NORMAL_SIZE = 512
# Living tissue covers the skeleton's pores: the texture's detail is blurred
# over this many pixels and only part of it kept.
TISSUE_BLUR = 2
TISSUE_DETAIL = 0.6
# Brightness of the base and of the growing tips (vertex colors).
BASE_SHADE = 0.7
TIP_SHADE = 1.0

# id, scan file, turn (degrees around X, Y, Z of Blender, Z up), triangles,
# copies grouped into one colony (staghorn branches grow in thickets), and
# the share of the height cut off at the bottom (a museum mount).
SCANS = [
    ("grooved-brain-coral", "Diploria_labyrinthiformis.glb", (-90, 0, 0), 24000, 1, 0),
    ("maze-coral", "Meandrina_meandrites.glb", (0, 0, 0), 24000, 1, 0),
    ("cauliflower-coral", "Pocillopora_damicornis.glb", (0, 0, 0), 30000, 1, 0),
    ("finger-coral", "Porites_compressa.glb", (0, 0, 0), 30000, 1, 0),
    ("staghorn-coral", "Acropora_cervicornis.glb", (0, -90, 0), 16000, 5, 0),
    ("sheet-coral", "Agaricia_lamarcki.glb", (-70, 0, 0), 16000, 1, 0),
    ("tabletop-coral", "Madrepora_cytherea.glb", (-90, 0, 0), 24000, 1, 0.12),
    ("glove-sponge", "Spongia_graminea.glb", (0, 0, 0), 20000, 1, 0),
]
# Loose pieces smaller than this share of the largest are left out: the
# museum's scale bars and crumbs scanned with the specimen.
CRUMB_SHARE = 0.35
# Vertices closer than this share of the scan's size are one.
WELD_SHARE = 1e-5


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_scan(path):
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    scan = bpy.context.view_layer.objects.active
    # Keep the world transform in the mesh: parents and import scale go away.
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return scan


def drop_crumbs(scan):
    """Keeps the specimen, leaving out scale bars and crumbs scanned with it."""
    low, high = bounds([scan])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    # glTF splits vertices along texture seams: weld them first, or every
    # patch of texture would count as a loose piece. UVs stay per corner.
    bpy.ops.mesh.remove_doubles(threshold=(high - low).length * WELD_SHARE)
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    pieces = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    largest = max(len(p.data.vertices) for p in pieces)
    bpy.ops.object.select_all(action="DESELECT")
    kept = []
    for piece in pieces:
        if len(piece.data.vertices) < largest * CRUMB_SHARE:
            bpy.data.objects.remove(piece, do_unlink=True)
        else:
            kept.append(piece)
    for piece in kept:
        piece.select_set(True)
    bpy.context.view_layer.objects.active = kept[0]
    if len(kept) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def trim(scan, share):
    """Cuts off the bottom `share` of the scan's height, such as a museum mount."""
    if share <= 0:
        return
    low, high = bounds([scan])
    cut = low.z + (high.z - low.z) * share
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for vertex in scan.data.vertices:
        vertex.select = (scan.matrix_world @ vertex.co).z < cut
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")


def thin(scan, triangles):
    count = sum(len(p.vertices) - 2 for p in scan.data.polygons)
    if count <= triangles:
        return
    modifier = scan.modifiers.new("thin", "DECIMATE")
    modifier.ratio = triangles / count
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def bounds(objects):
    low = Vector((math.inf,) * 3)
    high = Vector((-math.inf,) * 3)
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            low = Vector(map(min, low, point))
            high = Vector(map(max, high, point))
    return low, high


def stand(scan, turn):
    """Turns the scan as it grows and sets its base on the origin."""
    # glTF objects come in turned by quaternions, which ignore Euler angles.
    scan.rotation_mode = "XYZ"
    scan.rotation_euler = Euler([math.radians(a) for a in turn])
    bpy.ops.object.transform_apply(rotation=True)
    low, high = bounds([scan])
    scan.location -= Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
    bpy.ops.object.transform_apply(location=True)


def colony(scan, copies):
    """Copies of a branch around a centre, each turned and leaning outwards."""
    if copies <= 1:
        return scan
    low, high = bounds([scan])
    spread = max(high.x - low.x, high.y - low.y) * 0.22
    parts = [scan]
    for index in range(1, copies):
        copy = scan.copy()
        copy.data = scan.data.copy()
        bpy.context.scene.collection.objects.link(copy)
        angle = index * 2.39996
        copy.rotation_mode = "XYZ"
        copy.rotation_euler = Euler((math.radians(8 * index % 15), 0, angle))
        copy.location = Vector((math.cos(angle) * spread, math.sin(angle) * spread, 0))
        scale = 0.75 + 0.25 * ((index * 7) % 3) / 2
        copy.scale = (scale, scale, scale)
        parts.append(copy)
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = scan
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    low, high = bounds([scan])
    scan.location -= Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
    bpy.ops.object.transform_apply(location=True)
    return scan


def images_feeding(material, socket_name):
    """The images that feed an input of the material's principled shader."""
    principled = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if principled is None:
        return []
    images = []
    pending = [link.from_node for link in principled.inputs[socket_name].links]
    while pending:
        node = pending.pop()
        if node.type == "TEX_IMAGE" and node.image is not None:
            images.append(node.image)
        for socket in node.inputs:
            pending.extend(link.from_node for link in socket.links)
    return images


def blurred(values, size, radius):
    """A box blur of a square image's values, `radius` pixels each way."""
    grid = values.reshape(size, size)
    for axis in (0, 1):
        total = np.zeros_like(grid)
        for shift in range(-radius, radius + 1):
            total += np.roll(grid, shift, axis=axis)
        grid = total / (2 * radius + 1)
    return grid.ravel()


def growing_tips(scan):
    """Vertex colors from a darker base to lighter tips, as healthy coral grows."""
    mesh = scan.data
    heights = np.array([v.co.z for v in mesh.vertices], dtype=np.float32)
    top = float(heights.max()) or 1.0
    rise = np.clip(heights / top, 0.0, 1.0)
    shade = BASE_SHADE + (TIP_SHADE - BASE_SHADE) * rise * rise * (3 - 2 * rise)
    colors = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    values = np.repeat(shade, 4)
    values[3::4] = 1.0
    colors.data.foreach_set("color", values)
    mesh.color_attributes.active_color = colors


def pixels_of(image, size):
    if tuple(image.size) != (size, size):
        image.scale(size, size)
    return np.array(image.pixels[:], dtype=np.float32).reshape(-1, 4)


def bleach(scan):
    """
    A light grey copy of the scan's color texture that keeps its relief,
    with the scan's ambient occlusion baked in: one texture less to load.
    The normal map is kept, smaller.
    """
    for material in scan.data.materials:
        colors = images_feeding(material, "Base Color")
        normals = images_feeding(material, "Normal")
        others = [
            node
            for node in material.node_tree.nodes
            if node.type == "TEX_IMAGE"
            and node.image is not None
            and node.image not in colors
            and node.image not in normals
        ]
        occlusion = pixels_of(others[0].image, TEXTURE_SIZE)[:, 0] if others else None
        for image in colors:
            pixels = pixels_of(image, TEXTURE_SIZE)
            luminance = pixels[:, :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
            covered = pixels[:, 3] > 0.5
            mean = float(luminance[covered].mean()) if covered.any() else 0.5
            tissue = blurred(luminance, TEXTURE_SIZE, TISSUE_BLUR)
            detail = tissue + (luminance - tissue) * TISSUE_DETAIL
            grey = np.clip(TARGET_BRIGHTNESS + (detail - mean) * CONTRAST, 0.0, 1.0)
            if occlusion is not None:
                grey *= OCCLUSION_FLOOR + (1 - OCCLUSION_FLOOR) * occlusion
            pixels[:, 0] = grey
            pixels[:, 1] = grey
            pixels[:, 2] = grey
            image.pixels[:] = pixels.ravel()
            image.update()
        for image in normals:
            pixels_of(image, NORMAL_SIZE)
        for node in others:
            material.node_tree.nodes.remove(node)
        # Living tissue is wet: a soft sheen, not the chalk of a skeleton.
        principled = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if principled is not None:
            principled.inputs["Roughness"].default_value = 0.55
            principled.inputs["Metallic"].default_value = 0.0


def export(scan, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    scan.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_image_format="JPEG",
        export_yup=True,
        export_vertex_color="ACTIVE",
    )


def main():
    source = sys.argv[sys.argv.index("--") + 1]
    only = set(sys.argv[sys.argv.index("--") + 2 :])
    for object_id, file_name, turn, triangles, copies, mount in SCANS:
        if only and object_id not in only:
            continue
        clear()
        scan = drop_crumbs(import_scan(os.path.join(source, file_name)))
        thin(scan, triangles / copies)
        stand(scan, turn)
        trim(scan, mount)
        stand(scan, (0, 0, 0))
        scan = colony(scan, copies)
        bleach(scan)
        growing_tips(scan)
        export(scan, os.path.join(OUTPUT, object_id, "model.glb"))
        print(f"CORAL {object_id}: {sum(len(p.vertices) - 2 for p in scan.data.polygons)} triangles")


main()
