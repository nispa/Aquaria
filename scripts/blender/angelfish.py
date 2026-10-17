"""Builds Aquaria's freshwater angelfish (Pterophyllum scalare) in Blender.

    blender --background --python scripts/blender/angelfish.py -- <output folder>

Writes model.glb to the output folder (by default
public/assets/species/freshwater-angelfish). Everything is generated here,
so the model is the project's own work (CC0, like the code that made it).
It is an albino angelfish, after photographs of the Altum form:

- a flat, rhomboid body: a small pointed snout set high, a steep concave
  forehead up to the dorsal fin, the belly sloping down to the anal fin;
- huge sickle-shaped dorsal and anal fins swept far back, a fan of a caudal
  fin with long lobes, all see-through between fine white rays; clear
  pectoral fins and the two long pelvic filaments;
- pearly white skin with a faint pink blush at the gills and a hint of
  scales, and red eyes, painted as vertex colors;
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

SNOUT_X = 0.36
PEDUNCLE_X = -0.27
HALF_THICKNESS = 0.06
BODY_STEPS = 120
BODY_AROUND = 64

EYE = Vector((0.205, 0.0, 0.16))
EYE_RADIUS = 0.04

# Colors, sRGB.
PEARL = "#f3f1ec"
SHADE = "#ddd9d2"
BLUSH = "#f0cfc8"
FIN_RAY = "#fbfbf8"
FIN_WEB = "#e8ecee"
IRIS = "#d0221c"
PUPIL = "#5a0a08"

# The body's outline, traced from photographs: (x, height) along the top and
# along the bottom, from the snout to the caudal peduncle.
TOP = [
    (0.36, 0.165),
    (0.33, 0.21),
    (0.27, 0.27),
    (0.18, 0.34),
    (0.08, 0.40),
    (0.0, 0.42),
    (-0.08, 0.38),
    (-0.16, 0.25),
    (-0.22, 0.12),
    (-0.27, 0.055),
]
BOTTOM = [
    (0.36, 0.135),
    (0.33, 0.09),
    (0.27, 0.02),
    (0.18, -0.09),
    (0.08, -0.22),
    (0.0, -0.31),
    (-0.06, -0.33),
    (-0.14, -0.24),
    (-0.21, -0.11),
    (-0.27, -0.05),
]


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


def curve(points, x):
    """The height of a traced outline at x: a smooth (Catmull-Rom) curve through its points."""
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


def body_x(s):
    return SNOUT_X + (PEDUNCLE_X - SNOUT_X) * s


def profile(s):
    """The top, the bottom and the half-thickness of the body at s (0 snout .. 1 peduncle)."""
    x = body_x(s)
    top, bottom = curve(TOP, x), curve(BOTTOM, x)
    # Thickest just behind the head, thin as a leaf towards the fins' bases.
    thickness = HALF_THICKNESS * (min(s / 0.22, 1.0) ** 0.5) * (1 - 0.75 * smoothstep(0.25, 1.0, s))
    return top, bottom, max(thickness, 0.006)


# --- Body -------------------------------------------------------------------


def body_color(x, z, top, bottom):
    height = (z - (top + bottom) / 2) / max((top - bottom) / 2, 1e-4)
    color = mix(linear(PEARL), linear(SHADE), smoothstep(0.55, 1.0, abs(height)) * 0.6)
    # A faint blush where the blood shows through: behind the gill cover and at the throat.
    gill = 1.0 - smoothstep(0.0, 0.05, abs(x - (0.155 - 0.05 * height * height)))
    throat = smoothstep(0.1, 0.32, x) * smoothstep(-0.2, -0.75, height)
    color = mix(color, linear(BLUSH), max(gill * 0.55, throat * 0.45))
    # A hint of scales: a fine diamond lattice, barely there, behind the head.
    scales = math.sin(x * 160 + z * 90) * math.sin(x * 160 - z * 90)
    return mix(color, linear(SHADE), max(scales, 0.0) * 0.18 * smoothstep(0.2, 0.0, x - 0.1))


def build_body():
    verts, faces, colors = [], [], []
    rings = []
    for i in range(1, BODY_STEPS + 1):
        s = i / BODY_STEPS
        x = body_x(s)
        top, bottom, thickness = profile(s)
        middle = (top + bottom) / 2
        half = (top - bottom) / 2
        ring = []
        for j in range(BODY_AROUND):
            angle = 2 * math.pi * j / BODY_AROUND
            up, side = math.sin(angle), math.cos(angle)
            z = middle + half * up
            # A lens: full at the middle, sharp at the back and the belly.
            y = thickness * math.copysign(abs(side) ** 1.4, side)
            ring.append(len(verts))
            verts.append((x, y, z))
            colors.append(body_color(x, z, top, bottom))
        rings.append(ring)
    snout = len(verts)
    tip = (curve(TOP, SNOUT_X) + curve(BOTTOM, SNOUT_X)) / 2
    verts.append((SNOUT_X + 0.008, 0.0, tip))
    colors.append(linear(BLUSH))
    for j in range(BODY_AROUND):
        faces.append((snout, rings[0][(j + 1) % BODY_AROUND], rings[0][j]))
    for a, b in zip(rings, rings[1:]):
        for j in range(BODY_AROUND):
            k = (j + 1) % BODY_AROUND
            faces.append((a[j], a[k], b[k], b[j]))
    tail = len(verts)
    verts.append((PEDUNCLE_X - 0.004, 0.0, 0.0))
    colors.append(linear(PEARL))
    for j in range(BODY_AROUND):
        faces.append((tail, rings[-1][j], rings[-1][(j + 1) % BODY_AROUND]))
    return verts, faces, colors


# --- Fins -------------------------------------------------------------------


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
            colors.append(color(u, v))
    row = steps_v + 1
    for i in range(steps_u):
        for j in range(steps_v):
            q = i * row + j
            faces.append((q, q + row, q + row + 1, q + 1))
    return verts, faces, colors


def rayed(rays):
    """Milky, see-through fins, more so towards the edge, with soft white rays.

    The rays stay faint: fine, high-contrast stripes flicker into a moire
    pattern once the fish is small on screen.
    """

    def color(u, v):
        ray = (0.5 + 0.5 * math.cos(u * rays * 2 * math.pi)) ** 3
        web = mix(linear(FIN_WEB, 0.72), linear(FIN_WEB, 0.42), smoothstep(0.35, 1.0, v))
        return mix(web, linear(FIN_RAY, 0.85 - 0.25 * v), ray * 0.35)

    return color


def body_edge(x, upper):
    s = (SNOUT_X - x) / (SNOUT_X - PEDUNCLE_X)
    top, bottom, _ = profile(s)
    return Vector((x, 0.0, (top if upper else bottom) - (0.006 if upper else -0.006)))


def sickle(upper):
    """The dorsal (upper) or anal fin: a long sickle swept far back past the tail."""
    if upper:
        start_x = 0.03
        outline = [(-0.10, 0.52), (-0.30, 0.62), (-0.50, 0.68), (-0.66, 0.70), (-0.52, 0.52), (-0.40, 0.33), (-0.31, 0.14)]
    else:
        start_x = 0.0
        outline = [(-0.12, -0.44), (-0.30, -0.54), (-0.46, -0.60), (-0.60, -0.63), (-0.48, -0.45), (-0.37, -0.27), (-0.30, -0.11)]
    end_x = PEDUNCLE_X + 0.01
    points = rounded(
        [tuple(body_edge(start_x, upper))] + [(x, 0.0, z) for x, z in outline] + [tuple(body_edge(end_x, upper))]
    )

    def base(u):
        return body_edge(start_x + (end_x - start_x) * u, upper)

    def edge(u):
        return polyline_point(points, u)

    return membrane(base, edge, rayed(26), bulge=0.006)


def caudal():
    root = Vector((PEDUNCLE_X + 0.006, 0, 0))
    points = rounded([
        (PEDUNCLE_X - 0.01, 0, 0.06),
        (-0.42, 0, 0.22),
        (-0.60, 0, 0.26),
        (-0.55, 0, 0.10),
        (-0.56, 0, 0.0),
        (-0.55, 0, -0.10),
        (-0.60, 0, -0.26),
        (-0.42, 0, -0.22),
        (PEDUNCLE_X - 0.01, 0, -0.06),
    ])

    def base(u):
        return root + Vector((0, 0, (0.5 - u) * 0.09))

    def edge(u):
        return polyline_point(points, u)

    return membrane(base, edge, rayed(22), steps_u=200, bulge=0.004)


def pelvic(side, length):
    """A long, thin filament hanging from the throat, one on each side."""
    root = Vector((0.14, side * 0.025, -0.15))
    path = rounded(
        [tuple(root), (0.135, side * 0.04, -0.40), (0.11, side * 0.05, -0.40 - length * 0.5), (0.06, side * 0.05, -0.40 - length)]
    )

    def base(u):
        return polyline_point(path, u)

    def edge(u):
        return base(u) + Vector((-(0.022 * (1 - u) + 0.004), 0, 0))

    return membrane(base, edge, lambda u, v: linear(FIN_RAY, 0.85 - 0.3 * u), steps_u=40, steps_v=2)


def pectoral(side):
    root = Vector((0.15, side * 0.045, -0.02))

    def base(u):
        return root + Vector((-0.008 * u, 0, 0.06 * (u - 0.5)))

    def edge(u):
        return root + Vector((-0.12, side * 0.03, 0.08 * (u - 0.5) - 0.025))

    return membrane(base, edge, rayed(10), steps_u=40, steps_v=8)


# --- Eyes -------------------------------------------------------------------


def eye_centre(side):
    s = (SNOUT_X - EYE.x) / (SNOUT_X - PEDUNCLE_X)
    return Vector((EYE.x, side * profile(s)[2] * 0.72, EYE.z))


def eyeball(side):
    """A sphere, red all over as in an albino, darker at the pupil, looking out to its side."""
    centre = eye_centre(side)
    verts, faces, colors = [], [], []
    rings, segments = 16, 24
    for i in range(rings + 1):
        theta = math.pi * i / rings
        for j in range(segments):
            phi = 2 * math.pi * j / segments
            local = Vector((math.sin(theta) * math.cos(phi), side * math.cos(theta), math.sin(theta) * math.sin(phi)))
            p = centre + local * EYE_RADIUS
            verts.append((p.x, p.y, p.z))
            out = math.degrees(theta)
            color = mix(linear(PEARL), linear(IRIS), 1 - smoothstep(55, 70, out))
            colors.append(mix(color, linear(PUPIL), 1 - smoothstep(20, 30, out)))
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
    """Weights each range of vertices fully to its bone."""
    for name, indices in groups:
        group = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
        group.add(indices, 1.0, "REPLACE")
    modifier = obj.modifiers.new("Armature", "ARMATURE")
    modifier.object = armature
    obj.parent = armature


def mouth_shape_key(obj):
    """MouthOpen: the lower jaw drops, most at the tip of the snout."""
    obj.shape_key_add(name="Basis")
    key = obj.shape_key_add(name="MouthOpen")
    middle = (curve(TOP, SNOUT_X) + curve(BOTTOM, SNOUT_X)) / 2
    for index, vertex in enumerate(obj.data.vertices):
        x, y, z = vertex.co
        reach = (x - (SNOUT_X - 0.06)) / 0.06
        if reach > 0 and z < middle + 0.005:
            drop = 0.03 * min(reach, 1.0)
            key.data[index].co = Vector((x - drop * 0.4, y, z - drop))


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    output = os.path.abspath(args[0]) if args else DEFAULT_OUTPUT
    os.makedirs(output, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)

    skin = material("Skin", 0.28, 0.12, False)
    fins = material("Fins", 0.35, 0.0, True)
    eyes = material("Eyes", 0.06, 0.0, False)

    body = make_object("Body", [build_body()], skin)
    mouth_shape_key(body)
    fin_parts = [sickle(True), sickle(False), caudal(), pelvic(1, 0.42), pelvic(-1, 0.34), pectoral(1), pectoral(-1)]
    fin_object = make_object("Fins", fin_parts, fins)

    left, right = eyeball(1), eyeball(-1)
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
