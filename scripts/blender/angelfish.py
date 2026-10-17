"""Builds Aquaria's freshwater angelfish (Pterophyllum scalare) in Blender.

    blender --background --python scripts/blender/angelfish.py -- <output folder>

Writes model.glb to the output folder (by default
public/assets/species/freshwater-angelfish). Everything is generated here,
so the model is the project's own work (CC0, like the code that made it):

- a tall, flat disc of a body with a steep forehead and a small mouth;
- sail-like dorsal and anal fins swept back, a caudal fin with long lobes,
  clear pectoral fins and the two long pelvic filaments;
- silver skin with the four black bars (one through the eye) running on into
  the fins, and red eyes, painted as vertex colors;
- an armature: "Root" holds the body, "Eye.L" and "Eye.R" hold the eyeballs
  (their heads at the eyeballs' centres), so Aquaria can turn the eyes;
- a "MouthOpen" shape key that drops the lower jaw.

Blender's +X is the snout, +Z the dorsal fin; the glTF exporter turns +Z up
into +Y up, so model.json says forward "+x", up "+y". The fish's left is
Blender's +Y. Sizes are in body lengths; Aquaria scales the fish anyway.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUTPUT = os.path.join(ROOT, "public", "assets", "species", "freshwater-angelfish")

# Body: snout at SNOUT_X, caudal peduncle at PEDUNCLE_X.
SNOUT_X = 0.36
PEDUNCLE_X = -0.26
BODY_TOP = 0.40
BODY_BOTTOM = 0.36
HALF_THICKNESS = 0.075
BODY_STEPS = 96
BODY_AROUND = 48

EYE_X = 0.255
EYE_Z = 0.075
EYE_RADIUS = 0.04

# Colors, sRGB.
SILVER = "#d9dee0"
BACK = "#a9a68a"
BELLY = "#f2f4f2"
BAR = "#17181a"
FIN = "#c9ced0"
FIN_EDGE = "#f4f6f6"
IRIS = "#c4281c"
PUPIL = "#050505"


def linear(hex_color, alpha=1.0):
    value = hex_color.lstrip("#")
    channels = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels] + [alpha]


def mix(a, b, t):
    t = min(max(t, 0.0), 1.0)
    return [x + (y - x) * t for x, y in zip(a, b)]


def smoothstep(edge0, edge1, x):
    t = min(max((x - edge0) / (edge1 - edge0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


# The four bars, by x: through the eye, the middle, the rear and the peduncle.
BARS = [(0.255, 0.035), (0.075, 0.05), (-0.115, 0.045), (-0.26, 0.03)]


def bar_amount(x):
    """How dark a point is from the bars at this x, 0..1 (soft-edged bands)."""
    return max(1.0 - smoothstep(width * 0.6, width * 1.25, abs(x - centre)) for centre, width in BARS)


# --- Body profile -----------------------------------------------------------


def hump(s, rise, fall):
    """s^rise (1-s)^fall scaled to peak at 1: rises fast for a small rise, falls slowly for a small fall."""
    peak = rise / (rise + fall)
    return (s**rise) * ((1 - s) ** fall) / ((peak**rise) * ((1 - peak) ** fall))


def profile(s):
    """Half-heights above and below the midline, the midline and the half-thickness at s (0 snout .. 1 peduncle)."""
    # A disc with a steep forehead: rises fast behind the snout, tapers to the peduncle.
    top = BODY_TOP * hump(s, 0.8, 0.85)
    bottom = BODY_BOTTOM * hump(s, 0.85, 0.85)
    peduncle = smoothstep(0.75, 1.0, s)
    top = max(top, 0.045 * peduncle)
    bottom = max(bottom, 0.04 * peduncle)
    # The mouth sits a little above the middle of the snout.
    middle = 0.03 * (1 - smoothstep(0.0, 0.35, s))
    thickness = HALF_THICKNESS * hump(s, 0.45, 0.55)
    thickness = max(thickness, 0.012 * peduncle)
    return top, bottom, middle, thickness


def body_x(s):
    return SNOUT_X + (PEDUNCLE_X - SNOUT_X) * s


def build_body():
    verts, faces, colors = [], [], []
    rings = []
    for i in range(1, BODY_STEPS + 1):
        s = i / BODY_STEPS
        top, bottom, middle, thickness = profile(s)
        ring = []
        for j in range(BODY_AROUND):
            angle = 2 * math.pi * j / BODY_AROUND
            up = math.sin(angle)
            side = math.cos(angle)
            z = middle + (top if up > 0 else bottom) * up
            y = thickness * math.copysign(abs(side) ** 0.75, side)
            x = body_x(s)
            ring.append(len(verts))
            verts.append((x, y, z))
            colors.append(body_color(x, z, middle, top, bottom, s))
        rings.append(ring)
    snout = len(verts)
    verts.append((SNOUT_X + 0.004, 0.0, profile(0.0)[2] + 0.03))
    colors.append(body_color(SNOUT_X, 0.03, 0.03, 0.01, 0.01, 0.0))
    for j in range(BODY_AROUND):
        k = (j + 1) % BODY_AROUND
        faces.append((snout, rings[0][k], rings[0][j]))
    for a, b in zip(rings, rings[1:]):
        for j in range(BODY_AROUND):
            k = (j + 1) % BODY_AROUND
            faces.append((a[j], a[k], b[k], b[j]))
    tail = len(verts)
    verts.append((PEDUNCLE_X - 0.004, 0.0, profile(1.0)[2]))
    colors.append(linear(BAR))
    last = rings[-1]
    for j in range(BODY_AROUND):
        k = (j + 1) % BODY_AROUND
        faces.append((tail, last[j], last[k]))
    return verts, faces, colors


def body_color(x, z, middle, top, bottom, s):
    height = (z - middle) / (top if z > middle else max(bottom, 1e-4))
    base = mix(linear(SILVER), linear(BACK), smoothstep(0.35, 1.0, height))
    base = mix(base, linear(BELLY), smoothstep(-0.2, -0.9, height))
    # The gill cover's edge: a faint darker arc behind the eye.
    gill = 1.0 - smoothstep(0.0, 0.012, abs(x - (0.205 - 0.04 * height * height)))
    base = mix(base, linear(BACK), gill * 0.5 * (1 - smoothstep(0.7, 1.0, abs(height))))
    return mix(base, linear(BAR), bar_amount(x) * 0.92)


# --- Fins -------------------------------------------------------------------


def polyline_point(points, t):
    """A point at share t of the way along a polyline (by length)."""
    lengths = [(Vector(b) - Vector(a)).length for a, b in zip(points, points[1:])]
    total = sum(lengths)
    goal = t * total
    last = len(lengths) - 1
    for index, ((a, b), length) in enumerate(zip(zip(points, points[1:]), lengths)):
        if goal <= length or index == last:
            f = 0 if length == 0 else min(goal / length, 1.0)
            return Vector(a).lerp(Vector(b), f)
        goal -= length
    return Vector(points[-1])


def membrane(base, edge, steps_u=48, steps_v=32, color=None):
    """A fin: a sheet between a base curve and its outer edge, both functions of u in 0..1."""
    verts, faces, colors = [], [], []
    for i in range(steps_u + 1):
        u = i / steps_u
        a, b = base(u), edge(u)
        for j in range(steps_v + 1):
            v = j / steps_v
            p = a.lerp(b, v)
            verts.append((p.x, p.y, p.z))
            colors.append(color(p, u, v))
    row = steps_v + 1
    for i in range(steps_u):
        for j in range(steps_v):
            q = i * row + j
            faces.append((q, q + row, q + row + 1, q + 1))
    return verts, faces, colors


def fin_color(p, u, v, rays=14):
    base = mix(linear(FIN, 0.55), linear(FIN_EDGE, 0.35), smoothstep(0.75, 1.0, v))
    ray = 0.5 + 0.5 * math.cos(u * rays * 2 * math.pi)
    base = mix(base, linear(BACK, 0.7), ray**6 * 0.12)
    return mix(base, linear(BAR, 0.8), bar_amount(p.x) * 0.85 * (1 - smoothstep(0.8, 1.0, v)))


def body_edge(s, upper):
    top, bottom, middle, _ = profile(s)
    return Vector((body_x(s), 0.0, middle + (top if upper else -bottom) * 0.97))


def dorsal(upper):
    sign = 1 if upper else -1
    start, end = (0.26, 0.97) if upper else (0.32, 0.97)
    reach = 0.88 if upper else 0.82
    # A long sickle: a steep leading edge up to the tip, swept back, and a
    # concave trailing edge down to the peduncle.
    outline = [
        (body_x(start), 0, sign * 0.0),
        (0.02, 0, sign * 0.52),
        (-0.24, 0, sign * (reach - 0.06)),
        (-0.42, 0, sign * reach),
        (-0.45, 0, sign * (reach - 0.1)),
        (-0.36, 0, sign * 0.45),
        (-0.29, 0, sign * 0.18),
        (body_x(end), 0, sign * 0.06),
    ]
    outline[0] = tuple(body_edge(start, upper))
    outline[-1] = tuple(body_edge(end, upper))

    def base(u):
        return body_edge(start + (end - start) * u, upper)

    def edge(u):
        return polyline_point(outline, u)

    return membrane(base, edge, steps_u=96, color=fin_color)


def caudal():
    centre = Vector((PEDUNCLE_X + 0.005, 0, profile(1.0)[2]))
    outline = [
        (PEDUNCLE_X - 0.02, 0, 0.13),
        (-0.48, 0, 0.30),
        (-0.66, 0, 0.36),
        (-0.52, 0, 0.12),
        (-0.50, 0, 0.0),
        (-0.52, 0, -0.12),
        (-0.66, 0, -0.36),
        (-0.48, 0, -0.30),
        (PEDUNCLE_X - 0.02, 0, -0.13),
    ]

    def base(u):
        return centre + Vector((0, 0, (0.5 - u) * 0.1))

    def edge(u):
        return polyline_point(outline, u)

    return membrane(base, edge, steps_u=56, steps_v=14, color=lambda p, u, v: fin_color(p, u, v, rays=18))


def pelvic(side):
    """A long, thin filament hanging from the throat, one on each side."""
    root = Vector((0.15, side * 0.03, -0.27))
    path = [root, Vector((0.10, side * 0.05, -0.55)), Vector((0.0, side * 0.06, -0.86)), Vector((-0.08, side * 0.06, -1.02))]

    def base(u):
        return polyline_point([tuple(p) for p in path], u)

    def edge(u):
        width = 0.03 * (1 - u) + 0.004
        return base(u) + Vector((-width, 0, 0))

    def color(p, u, v):
        return mix(linear(FIN, 0.8), linear(FIN_EDGE, 0.6), u)

    return membrane(base, edge, steps_u=32, steps_v=2, color=color)


def pectoral(side):
    root = Vector((0.17, side * 0.06, -0.05))

    def base(u):
        return root + Vector((-0.01 * u, 0, 0.07 * (u - 0.5)))

    def edge(u):
        return root + Vector((-0.13, side * 0.035, 0.09 * (u - 0.5) - 0.02))

    return membrane(base, edge, steps_u=12, steps_v=6, color=lambda p, u, v: linear(FIN_EDGE, 0.25))


# --- Eyes -------------------------------------------------------------------


def eye_centre(side):
    s = (SNOUT_X - EYE_X) / (SNOUT_X - PEDUNCLE_X)
    thickness = profile(s)[3]
    return Vector((EYE_X, side * (thickness * 0.8), EYE_Z))


def eyeball(side):
    """A sphere with a red iris and a black pupil looking out to its side."""
    centre = eye_centre(side)
    verts, faces, colors = [], [], []
    rings, segments = 16, 24
    for i in range(rings + 1):
        theta = math.pi * i / rings
        for j in range(segments):
            phi = 2 * math.pi * j / segments
            # The pole (theta = 0) looks out to the side.
            local = Vector((math.sin(theta) * math.cos(phi), math.cos(theta), math.sin(theta) * math.sin(phi)))
            local.y *= side
            p = centre + local * EYE_RADIUS
            verts.append((p.x, p.y, p.z))
            out = math.degrees(theta)
            color = linear(SILVER)
            color = mix(color, linear(IRIS), 1 - smoothstep(48, 58, out))
            color = mix(color, linear(PUPIL), 1 - smoothstep(22, 28, out))
            colors.append(color)
    for i in range(rings):
        for j in range(segments):
            k = (j + 1) % segments
            a, b = i * segments + j, i * segments + k
            c, d = a + segments, b + segments
            faces.append((a, b, d, c) if side > 0 else (a, c, d, b))
    return verts, faces, colors, centre


# --- Assembly ---------------------------------------------------------------


def make_object(name, parts, material):
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


def bind(obj, armature, groups):
    """Weights the whole object to one bone, or each vertex range to its bone."""
    for name, indices in groups:
        group = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
        group.add(indices, 1.0, "REPLACE")
    modifier = obj.modifiers.new("Armature", "ARMATURE")
    modifier.object = armature
    obj.parent = armature


def mouth_shape_key(obj):
    """MouthOpen: the lower lip and chin drop, most at the tip of the snout."""
    obj.shape_key_add(name="Basis")
    key = obj.shape_key_add(name="MouthOpen")
    _, _, middle, _ = profile(0.0)
    for index, vertex in enumerate(obj.data.vertices):
        x, _, z = vertex.co
        s = (SNOUT_X - x) / (SNOUT_X - PEDUNCLE_X)
        if s < 0.09 and z < middle + 0.03:
            drop = 0.035 * (1 - s / 0.09)
            key.data[index].co = Vector((x - drop * 0.3, vertex.co.y, z - drop))


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    output = os.path.abspath(args[0]) if args else DEFAULT_OUTPUT
    os.makedirs(output, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)

    skin = material("Skin", 0.32, 0.25, False)
    fins = material("Fins", 0.45, 0.0, True)
    eyes = material("Eyes", 0.08, 0.0, False)

    body = make_object("Body", [build_body()], skin)
    mouth_shape_key(body)
    fin_parts = [dorsal(True), dorsal(False), caudal(), pelvic(1), pelvic(-1), pectoral(1), pectoral(-1)]
    fin_object = make_object("Fins", fin_parts, fins)

    left = eyeball(1)
    right = eyeball(-1)
    eye_object = make_object("Eyes", [left[:3], right[:3]], eyes)
    left_count = len(left[0])

    armature_data = bpy.data.armatures.new("Armature")
    armature = bpy.data.objects.new("Armature", armature_data)
    bpy.context.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    root = armature_data.edit_bones.new("Root")
    root.head, root.tail = Vector((0.1, 0, 0)), Vector((-0.2, 0, 0))
    for name, centre, side in (("Eye.L", left[3], 1), ("Eye.R", right[3], -1)):
        bone = armature_data.edit_bones.new(name)
        bone.head = centre
        bone.tail = centre + Vector((0, side * 0.04, 0))
        bone.parent = root
    bpy.ops.object.mode_set(mode="OBJECT")

    bind(body, armature, [("Root", list(range(len(body.data.vertices))))])
    bind(fin_object, armature, [("Root", list(range(len(fin_object.data.vertices))))])
    total = len(eye_object.data.vertices)
    bind(eye_object, armature, [("Eye.L", list(range(left_count))), ("Eye.R", list(range(left_count, total)))])

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
    print(f"Angelfish written to {output}")


main()
