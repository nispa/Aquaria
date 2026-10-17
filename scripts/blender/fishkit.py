"""Shared pieces for the Blender scripts that build Aquaria's fish.

Each fish script (angelfish.py, guppy.py) traces its body and fins and
calls these helpers to color, rig and export it; docs/FISH_MODELS.md
tells what Aquaria expects of a model. Blender's +X is the snout, +Z the
dorsal fin, +Y the fish's left; sizes are in body lengths.
"""

import math
import os

import bpy
from mathutils import Vector


def linear(hex_color, alpha=1.0):
    """An sRGB hex color as linear RGBA, as vertex colors are stored."""
    value = hex_color.lstrip("#")
    channels = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels] + [alpha]


def mix(a, b, t):
    t = min(max(t, 0.0), 1.0)
    return [x + (y - x) * t for x, y in zip(a, b)]


def smoothstep(edge0, edge1, x):
    t = min(max((x - edge0) / (edge1 - edge0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def curve(points, x):
    """The height of a traced outline at x: a smooth (Catmull-Rom) curve through (x, height) points, x falling."""
    xs = [p[0] for p in points]
    for i in range(len(points) - 1):
        if xs[i] >= x >= xs[i + 1]:
            p0 = points[max(i - 1, 0)][1]
            p1, p2 = points[i][1], points[i + 1][1]
            p3 = points[min(i + 2, len(points) - 1)][1]
            t = (xs[i] - x) / (xs[i] - xs[i + 1])
            return 0.5 * (
                2 * p1
                + (-p0 + p2) * t
                + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
            )
    return points[-1][1] if x < xs[-1] else points[0][1]


def rounded(points, passes=3):
    """Chaikin's corner cutting: a smooth outline through the corners, ends kept."""
    for _ in range(passes):
        smooth = [points[0]]
        for a, b in zip(points, points[1:]):
            a, b = Vector(a), Vector(b)
            smooth += [tuple(a.lerp(b, 0.25)), tuple(a.lerp(b, 0.75))]
        smooth.append(points[-1])
        points = smooth
    return points


def polyline_point(points, t):
    """A point at share t of the way along a polyline (by length)."""
    lengths = [(Vector(b) - Vector(a)).length for a, b in zip(points, points[1:])]
    goal = t * sum(lengths)
    last = len(lengths) - 1
    for index, ((a, b), length) in enumerate(zip(zip(points, points[1:]), lengths)):
        if goal <= length or index == last:
            f = 0 if length == 0 else min(goal / length, 1.0)
            return Vector(a).lerp(Vector(b), f)
        goal -= length
    return Vector(points[-1])


class Body:
    """A fish body lofted along x from a traced top and bottom outline and a thickness."""

    def __init__(self, top, bottom, thickness, snout_color, tail_color):
        self.top, self.bottom = top, bottom
        self.snout_x, self.peduncle_x = top[0][0], top[-1][0]
        self.thickness = thickness
        self.snout_color, self.tail_color = snout_color, tail_color

    def x(self, s):
        """The x at s, from 0 at the snout to 1 at the caudal peduncle."""
        return self.snout_x + (self.peduncle_x - self.snout_x) * s

    def s(self, x):
        return (self.snout_x - x) / (self.snout_x - self.peduncle_x)

    def profile(self, s):
        """The top, the bottom and the half-thickness at s."""
        x = self.x(s)
        return curve(self.top, x), curve(self.bottom, x), self.thickness(s)

    def edge(self, x, upper):
        """A point on the body's outline at x, a hair inside it, where a fin grows."""
        top, bottom, _ = self.profile(self.s(x))
        return Vector((x, 0.0, (top if upper else bottom) - (0.006 if upper else -0.006)))

    def mesh(self, color, steps=120, around=64, roundness=1.4):
        """Rings of vertices from snout to peduncle; color(x, z, top, bottom) paints them."""
        verts, faces, colors = [], [], []
        rings = []
        for i in range(1, steps + 1):
            s = i / steps
            x = self.x(s)
            top, bottom, thickness = self.profile(s)
            middle, half = (top + bottom) / 2, (top - bottom) / 2
            ring = []
            for j in range(around):
                angle = 2 * math.pi * j / around
                up, side = math.sin(angle), math.cos(angle)
                z = middle + half * up
                # A lens: full at the middle, sharp at the back and the belly.
                y = thickness * math.copysign(abs(side) ** roundness, side)
                ring.append(len(verts))
                verts.append((x, y, z))
                colors.append(color(x, z, top, bottom))
            rings.append(ring)
        snout = len(verts)
        tip = (curve(self.top, self.snout_x) + curve(self.bottom, self.snout_x)) / 2
        verts.append((self.snout_x + 0.008, 0.0, tip))
        colors.append(self.snout_color)
        for j in range(around):
            faces.append((snout, rings[0][(j + 1) % around], rings[0][j]))
        for a, b in zip(rings, rings[1:]):
            for j in range(around):
                k = (j + 1) % around
                faces.append((a[j], a[k], b[k], b[j]))
        tail = len(verts)
        end = (curve(self.top, self.peduncle_x) + curve(self.bottom, self.peduncle_x)) / 2
        verts.append((self.peduncle_x - 0.004, 0.0, end))
        colors.append(self.tail_color)
        for j in range(around):
            faces.append((tail, rings[-1][j], rings[-1][(j + 1) % around]))
        return verts, faces, colors

    def mouth_shape_key(self, obj, reach=0.06, drop=0.03):
        """MouthOpen: the lower jaw drops, most at the tip of the snout."""
        obj.shape_key_add(name="Basis")
        key = obj.shape_key_add(name="MouthOpen")
        middle = (curve(self.top, self.snout_x) + curve(self.bottom, self.snout_x)) / 2
        for index, vertex in enumerate(obj.data.vertices):
            x, y, z = vertex.co
            share = (x - (self.snout_x - reach)) / reach
            if share > 0 and z < middle + 0.005:
                amount = drop * min(share, 1.0)
                key.data[index].co = Vector((x - amount * 0.4, y, z - amount))


def membrane(base, edge, color, steps_u=240, steps_v=24, bulge=0.0):
    """A fin: a sheet from a base curve out to its edge, both functions of u in 0..1; v runs along the rays."""
    verts, faces, colors = [], [], []
    for i in range(steps_u + 1):
        u = i / steps_u
        a, b = base(u), edge(u)
        for j in range(steps_v + 1):
            v = j / steps_v
            p = a.lerp(b, v)
            # Fins are not flat: a slight wave across the rays.
            p.y += bulge * math.sin(u * math.pi * 3) * v
            verts.append((p.x, p.y, p.z))
            colors.append(color(u, v, p))
    row = steps_v + 1
    for i in range(steps_u):
        for j in range(steps_v):
            q = i * row + j
            faces.append((q, q + row, q + row + 1, q + 1))
    return verts, faces, colors


def body_fin(body, start_x, end_x, outline, upper, color, steps_u=240, bulge=0.006):
    """A fin along the body's top or bottom from start_x back to end_x, out to a traced, rounded outline."""
    points = rounded(
        [tuple(body.edge(start_x, upper))] + [(x, 0.0, z) for x, z in outline] + [tuple(body.edge(end_x, upper))]
    )

    def base(u):
        return body.edge(start_x + (end_x - start_x) * u, upper)

    def edge(u):
        return polyline_point(points, u)

    return membrane(base, edge, color, steps_u=steps_u, bulge=bulge)


def tail_fin(root, base_height, outline, color, steps_u=200, steps_v=24, bulge=0.004):
    """The caudal fin: from a short vertical base at root out to a traced, rounded outline."""
    points = rounded(outline)

    def base(u):
        return root + Vector((0, 0, (0.5 - u) * base_height))

    def edge(u):
        return polyline_point(points, u)

    return membrane(base, edge, color, steps_u=steps_u, steps_v=steps_v, bulge=bulge)


def eyeball(centre, radius, side, color):
    """A sphere looking out to its side; color(degrees from its pupil) paints it."""
    verts, faces, colors = [], [], []
    rings, segments = 16, 24
    for i in range(rings + 1):
        theta = math.pi * i / rings
        for j in range(segments):
            phi = 2 * math.pi * j / segments
            local = Vector((math.sin(theta) * math.cos(phi), side * math.cos(theta), math.sin(theta) * math.sin(phi)))
            p = centre + local * radius
            verts.append((p.x, p.y, p.z))
            colors.append(color(math.degrees(theta)))
    for i in range(rings):
        for j in range(segments):
            k = (j + 1) % segments
            a, b = i * segments + j, i * segments + k
            c, d = a + segments, b + segments
            faces.append((a, b, d, c) if side > 0 else (a, c, d, b))
    return verts, faces, colors


def make_object(name, parts, material):
    """One mesh object from parts (verts, faces, colors), its colors a vertex color attribute."""
    verts, faces, colors = [], [], []
    for part_verts, part_faces, part_colors in parts:
        offset = len(verts)
        verts += part_verts
        faces += [tuple(i + offset for i in face) for face in part_faces]
        colors += part_colors
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    attribute = mesh.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
    for index, color in enumerate(colors):
        attribute.data[index].color = color
    mesh.color_attributes.active_color = attribute
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def material(name, roughness, metallic, blend):
    """A Principled BSDF colored by the vertex colors; blended ones take their alpha too."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    shader = nodes.get("Principled BSDF")
    attribute = nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = "Color"
    mat.node_tree.links.new(attribute.outputs["Color"], shader.inputs["Base Color"])
    if blend:
        mat.node_tree.links.new(attribute.outputs["Alpha"], shader.inputs["Alpha"])
        mat.surface_render_method = "BLENDED"
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    mat.use_backface_culling = False
    return mat


def rig(body_objects, eye_object, left_count, left_centre, right_centre):
    """An armature: Root holds the body objects, Eye.L and Eye.R the two eyeballs (the first left_count vertices are the left one)."""
    data = bpy.data.armatures.new("Armature")
    armature = bpy.data.objects.new("Armature", data)
    bpy.context.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    root = data.edit_bones.new("Root")
    root.head, root.tail = Vector((0.1, 0, 0)), Vector((-0.2, 0, 0))
    for name, centre, side in (("Eye.L", left_centre, 1), ("Eye.R", right_centre, -1)):
        bone = data.edit_bones.new(name)
        bone.head = centre
        bone.tail = centre + Vector((0, side * 0.04, 0))
        bone.parent = root
    bpy.ops.object.mode_set(mode="OBJECT")

    def bind(obj, groups):
        for name, indices in groups:
            group = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
            group.add(indices, 1.0, "REPLACE")
        modifier = obj.modifiers.new("Armature", "ARMATURE")
        modifier.object = armature
        obj.parent = armature

    for obj in body_objects:
        bind(obj, [("Root", list(range(len(obj.data.vertices))))])
    total = len(eye_object.data.vertices)
    bind(eye_object, [("Eye.L", list(range(left_count))), ("Eye.R", list(range(left_count, total)))])


def export(output):
    """Writes model.glb to the output folder, as docs/FISH_MODELS.md says."""
    os.makedirs(output, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(output, "model.glb"),
        export_format="GLB",
        export_yup=True,
        export_skins=True,
        export_morph=True,
        export_animations=False,
        export_vertex_color="ACTIVE",
        export_apply=False,
    )
