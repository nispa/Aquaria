"""Gives the barramundi a protrusible mouth, a MouthOpen shape key, in Blender.

    blender --background --python scripts/blender/barramundi.py -- <BarramundiFish.glb> <output folder>

<BarramundiFish.glb> is Khronos' glTF sample (CC0, see ASSETS.md); the
output folder defaults to public/assets/species/barramundi. The model is a
single mesh without bones, so the open mouth is shaped here, as a
barramundi opens it to suck in its prey: the lower jaw swings down about
its hinge, the upper jaw slides forward and down, and a dark throat fills
the gape (folded away inside the head while the mouth is shut). Places are
in the fish frame (one body length along x, snout at +0.5, back up), as
read off /model-viewer.html; compress the result as docs/FISH_MODELS.md says.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUTPUT = os.path.join(ROOT, "public", "assets", "species", "barramundi")

# The corner of the mouth, where the lower jaw hinges, and the tip of the lips.
HINGE = Vector((0.39, -0.088))
TIP = Vector((0.497, -0.052))
# How far the lower jaw swings down, degrees.
JAW_SWING = 24
# The upper jaw slides this far forward and down at the tip, body lengths.
UPPER_REACH = 0.022
UPPER_DROP = 0.008
# The upper jaw is the lips' band this high above the mouth's line, body lengths.
UPPER_BAND = 0.035
# Blends the moving jaws into the still head over this distance, body lengths.
BLEND = 0.025
# The lips part along the mouth's line within this distance of it, body lengths.
LIP_SEAM = 0.003
THROAT_COLOR = (0.09, 0.03, 0.03, 1)


def smoothstep(edge0, edge1, x):
    t = min(max((x - edge0) / (edge1 - edge0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


class Frame:
    """Between Blender's world (Z up, the snout towards -Y, as glTF +Z imports) and the fish frame."""

    def __init__(self, points):
        along = [-p.y for p in points]
        up = [p.z for p in points]
        self.length = max(along) - min(along)
        self.middle = Vector(((max(along) + min(along)) / 2, (max(up) + min(up)) / 2))

    def to_fish(self, p):
        return (Vector((-p.y, p.z)) - self.middle) / self.length

    def to_world(self, fish, side):
        along, up = fish * self.length + self.middle
        return Vector((side, -along, up))


def below_line(point):
    """How far below the mouth's line (corner to tip) a fish-frame point is."""
    direction = (TIP - HINGE).normalized()
    offset = point - HINGE
    return -(direction.x * offset.y - direction.y * offset.x)


def opened(point):
    """Where a fish-frame point of the head goes when the mouth is wide open."""
    ahead = smoothstep(HINGE.x - BLEND, HINGE.x + BLEND, point.x)
    if ahead == 0:
        return point
    depth = below_line(point)
    if depth > 0:
        # The lower jaw: swings down about the hinge, its back blending in.
        angle = -math.radians(JAW_SWING) * ahead * smoothstep(0, LIP_SEAM, depth)
        offset = point - HINGE
        return HINGE + Vector((
            offset.x * math.cos(angle) - offset.y * math.sin(angle),
            offset.x * math.sin(angle) + offset.y * math.cos(angle),
        ))
    # The upper jaw: the band of the lips slides forward and down, most at the tip.
    band = 1 - smoothstep(UPPER_BAND / 2, UPPER_BAND, -depth)
    tip = smoothstep(HINGE.x, TIP.x, point.x)
    return point + Vector((UPPER_REACH, -UPPER_DROP)) * tip * band


def throat(frame):
    """A dark sheet in the fish's middle plane, from the hinge to the lips' tips."""
    shut_upper = frame.to_world(TIP, 0)
    shut_lower = frame.to_world(TIP + Vector((0, -0.004)), 0)
    hinge = frame.to_world(HINGE + Vector((-0.01, 0.01)), 0)
    open_upper = frame.to_world(opened(TIP + Vector((0, 0.002))), 0)
    open_lower = frame.to_world(opened(TIP + Vector((0, -0.006))), 0)
    # Shut, it lies folded inside the head, behind the lips.
    inside = (hinge * 2 + shut_upper + shut_lower) / 4
    mesh = bpy.data.meshes.new("Throat")
    mesh.from_pydata([hinge, inside, inside], [], [(0, 1, 2)])
    obj = bpy.data.objects.new("Throat", mesh)
    bpy.context.collection.objects.link(obj)
    obj.shape_key_add(name="Basis")
    key = obj.shape_key_add(name="MouthOpen")
    key.data[1].co = open_upper
    key.data[2].co = open_lower
    material = bpy.data.materials.new("Throat")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = THROAT_COLOR
    shader.inputs["Roughness"].default_value = 0.8
    material.use_backface_culling = False
    mesh.materials.append(material)
    return obj


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    source = os.path.abspath(args[0])
    output = os.path.abspath(args[1]) if len(args) > 1 else DEFAULT_OUTPUT
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)

    fish = next(obj for obj in bpy.data.objects if obj.type == "MESH")
    # Work in world space: the node's turn goes into the points.
    fish.data.transform(fish.matrix_world)
    fish.matrix_world = Matrix.Identity(4)
    points = [vertex.co.copy() for vertex in fish.data.vertices]
    frame = Frame(points)

    fish.shape_key_add(name="Basis")
    key = fish.shape_key_add(name="MouthOpen")
    for data, point in zip(key.data, points):
        moved = opened(frame.to_fish(point))
        data.co = frame.to_world(moved, point.x)
    throat(frame)

    os.makedirs(output, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(output, "model.glb"),
        export_format="GLB",
        export_yup=True,
        export_morph=True,
        export_animations=False,
        export_apply=False,
    )
    print(f"Barramundi written to {output}")


main()
