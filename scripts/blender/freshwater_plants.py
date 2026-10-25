"""Builds Aquaria's freshwater aquarium plants.

Four plants of a planted tank, each a folder in public/assets/objects/:

- rotala: a bunch of stems, whorls of narrow leaves up each one, green at
  the base and red at the tips, where the light is strongest.
- hairgrass: a dense tuft of thin, arching blades, the carpet's leaflets.
- cryptocoryne: a rosette of ovate leaves with ruffled edges on long
  petioles, olive green or bronze, with a pale midrib and darker veins.
- vallisneria: tall ribbons that twist and fall over at the surface.

Each plant is a variant, laid side by side so Aquaria picks one per plant
(docs/OBJECTS.md). Leaves carry their colors in the points, and the veins
in a texture painted by leafpaint.py: a pale midrib, side veins, a lighter
rim where light shines through.
`_SWAY` runs from 0 at the base to 1 at the tips. Sizes are in plant
heights: Aquaria scales a plant to its height in the scene.

Run with Blender 5.2 in the background, from the repository root:

    blender --background --python scripts/blender/freshwater_plants.py

then compress each model.glb with glTF Transform (meshopt, --join false
--flatten false --simplify false). With `-- preview.png` it also renders
every plant to a picture next to that name (rotala-preview.png...).
"""

import math
import os
import random
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from leafpaint import LEAF_U, LEAVES, leaf_texture  # noqa: E402
from paintkit import image  # noqa: E402
from plantkit import VARIANT_SPACING, export, leaf_material, leaf_mesh, leaf_spot, linear, mix, plant_object, ramp  # noqa: E402

OUTPUT = "public/assets/objects/{}/model.glb"
SEED = 20261026
VARIANTS = 4
# Points across a leaf: the edges, the midrib and halfway between.
ACROSS = (-1.0, -0.5, 0.0, 0.5, 1.0)
# The leaf texture is a little grey on the blade (leafpaint.BLADE, sRGB): the
# points are that much brighter, so the leaf keeps its brightness.
BRIGHTEN = 1 / 0.92 ** 2.2


def leaf_profile(t, shape):
    """The leaf's half width at t (0 base .. 1 tip), as a share of its widest."""
    if shape == "strap":
        return 1.0 if t < 0.9 else math.sqrt(max(1 - ((t - 0.9) / 0.1) ** 2, 0.02))
    if shape == "lanceolate":
        return max(math.sin(math.pi * min(t, 1.0) ** 0.8), 0.05) ** 0.8
    # ovate: widest low, pointed tip, heart-shaped base
    return max(math.sin(math.pi * t ** 0.7), 0.04) ** 0.9


def add_leaf(mesh, colors, sway, origin, heading, pitch, length, width, shape, stops, curl=0.0, ruffle=0.0, twist=0.0, along=8, sway_from=0.0, droop=0.0, rng=None, plain=False):
    """One leaf from `origin`, leaving at `heading` (around Z) and `pitch` (up from flat).

    It lies across the leaf tile of the texture, unless `plain` (a petiole).
    """
    rows = []
    direction = Vector((math.cos(heading), math.sin(heading), 0.0))
    side = Vector((-math.sin(heading), math.cos(heading), 0.0))
    point = Vector(origin)
    angle = pitch
    step = length / along
    for i in range(along + 1):
        t = i / along
        if i > 0:
            angle -= (curl + droop * t) * step / max(length, 1e-6)
            point = point + (direction * math.cos(angle) + Vector((0, 0, math.sin(angle)))) * step
        half = 0.5 * width * leaf_profile(t, shape)
        roll = twist * t
        base = ramp(stops, t)
        row = []
        for s in ACROSS:
            wave = ruffle * math.sin(t * 14.0 + s * 2.0) * abs(s) ** 1.5
            lateral = side * math.cos(roll) * s * half
            lift = Vector((0, 0, 1)) * (math.sin(roll) * s * half + wave * width + (1 - abs(s)) * width * 0.04)
            vertex = mesh.verts.new(point + lateral + lift)
            if plain:
                colors[vertex] = base
            else:
                colors[vertex] = [min(c * BRIGHTEN, 1.0) for c in base]
                leaf_spot(mesh, vertex, (s + 1) / 2 * LEAF_U, t)
            sway[vertex] = sway_from + (1.0 - sway_from) * t**1.3
            row.append(vertex)
        rows.append(row)
    for i in range(along):
        for j in range(len(ACROSS) - 1):
            mesh.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))


def add_stem(mesh, colors, sway, base, top, color_stops, radius=0.006, jitter=None):
    """A thin stem as two crossed strips from base to top (both Vector)."""
    segments = 10
    for axis in (Vector((1, 0, 0)), Vector((0, 1, 0))):
        previous = None
        for i in range(segments + 1):
            t = i / segments
            centre = base.lerp(top, t)
            if jitter is not None:
                centre += jitter(t)
            pair = [mesh.verts.new(centre - axis * radius), mesh.verts.new(centre + axis * radius)]
            for vertex in pair:
                colors[vertex] = ramp(color_stops, t)
                sway[vertex] = t**1.3
            if previous is not None:
                mesh.faces.new((previous[0], previous[1], pair[1], pair[0]))
            previous = pair


def build_rotala(rng, offset, material, red_tips):
    mesh = leaf_mesh()
    colors, sway = {}, {}
    green = linear("#3f8a35")
    olive = linear("#7aa840")
    orange = linear("#e8803a")
    red = linear("#d8403a")
    stem_stops = [(0.0, linear("#5a7a3a")), (0.7, linear("#7a8a40")), (1.0, linear("#b0503a"))]
    for _ in range(rng.randint(7, 9)):
        x = offset + rng.uniform(-0.12, 0.12)
        y = rng.uniform(-0.12, 0.12)
        height = rng.uniform(0.8, 1.0)
        lean = Vector((rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), 0.0))
        base = Vector((x, y, 0.0))
        nodes = 14
        add_stem(mesh, colors, sway, base, base + Vector((0, 0, height * (nodes - 1) / nodes)) + lean, stem_stops)
        for node in range(2, nodes - 1):
            t = node / nodes
            centre = base + Vector((0, 0, height * t)) + lean * t
            body = mix(green, olive, t * 0.6)
            blush = 1.5 if red_tips else 3.5
            stops = [(0.0, body), (0.35, body), (1.0, mix(body, mix(orange, red, t), min(t**blush * (1.6 if red_tips else 0.5), 1.0)))]
            length = 0.24 * (1.0 - 0.45 * t)
            turn = node * 2.4 + rng.uniform(-0.2, 0.2)
            for k in range(3):
                add_leaf(
                    mesh,
                    colors,
                    sway,
                    centre,
                    turn + k * math.tau / 3,
                    0.7 - 0.3 * t,
                    length,
                    0.09,
                    "lanceolate",
                    stops,
                    curl=0.5,
                    along=4,
                    sway_from=t,
                )
    plant = plant_object("rotala", mesh, colors, sway, material)
    mesh.free()
    return plant


def build_hairgrass(rng, offset, material):
    mesh = leaf_mesh()
    colors, sway = {}, {}
    root_color = linear("#a8b870")
    green = linear("#4fa63a")
    tip = linear("#9ed060")
    stops = [(0.0, root_color), (0.15, green), (0.7, mix(green, tip, 0.4)), (1.0, tip)]
    for _ in range(rng.randint(60, 90)):
        angle = rng.uniform(0, math.tau)
        distance = rng.uniform(0.0, 0.35) ** 1.2
        origin = (offset + math.cos(angle) * distance, math.sin(angle) * distance, 0.0)
        shade = rng.uniform(0.85, 1.1)
        scaled = [(p, [c * shade for c in color]) for p, color in stops]
        add_leaf(
            mesh,
            colors,
            sway,
            origin,
            angle + rng.uniform(-0.6, 0.6),
            rng.uniform(1.0, 1.35),
            rng.uniform(0.6, 1.0),
            0.014,
            "strap",
            scaled,
            curl=rng.uniform(0.6, 1.8),
            along=6,
        )
    plant = plant_object("hairgrass", mesh, colors, sway, material)
    mesh.free()
    return plant


def build_cryptocoryne(rng, offset, material, bronze):
    mesh = leaf_mesh()
    colors, sway = {}, {}
    if bronze:
        upper = linear("#7a5a2e")
        lower = linear("#5a3a24")
        petiole = linear("#8a6a3a")
    else:
        upper = linear("#4f8a30")
        lower = linear("#2f6a28")
        petiole = linear("#a8b868")
    for index in range(rng.randint(9, 13)):
        heading = index * 2.4 + rng.uniform(-0.2, 0.2)
        shade = rng.uniform(0.85, 1.1)
        tall = rng.uniform(0.6, 1.0)
        # The petiole, then the blade continuing from it.
        petiole_length = 0.38 * tall
        direction = Vector((math.cos(heading), math.sin(heading), 0.0))
        origin = Vector((offset, 0.0, 0.0)) + direction * 0.02
        add_leaf(mesh, colors, sway, origin, heading, 1.05, petiole_length, 0.025, "strap", [(0.0, petiole), (1.0, petiole)], curl=0.15, along=4, rng=rng, plain=True)
        stalk_top = origin + direction * (petiole_length * 0.55) + Vector((0, 0, petiole_length * 0.84))
        stops = [(0.0, [c * shade for c in petiole]), (0.15, [c * shade for c in upper]), (0.85, [c * shade for c in lower]), (1.0, [c * shade for c in lower])]
        add_leaf(
            mesh,
            colors,
            sway,
            stalk_top,
            heading,
            1.0,
            0.5 * tall,
            0.26 * tall,
            "ovate",
            stops,
            curl=0.5,
            ruffle=0.07,
            twist=rng.uniform(-0.3, 0.3),
            along=12,
            sway_from=0.35,
            droop=0.1,
            rng=rng,
        )
    plant = plant_object("cryptocoryne", mesh, colors, sway, material)
    mesh.free()
    return plant


def build_vallisneria(rng, offset, material):
    mesh = leaf_mesh()
    colors, sway = {}, {}
    base_color = linear("#c8d090")
    green = linear("#3f9a3a")
    tip = linear("#8cc860")
    for _ in range(rng.randint(9, 13)):
        angle = rng.uniform(0, math.tau)
        distance = rng.uniform(0.0, 0.18)
        origin = (offset + math.cos(angle) * distance, math.sin(angle) * distance, 0.0)
        shade = rng.uniform(0.85, 1.1)
        stops = [(0.0, base_color), (0.08, [c * shade for c in green]), (0.8, [c * shade for c in mix(green, tip, 0.4)]), (1.0, tip)]
        add_leaf(
            mesh,
            colors,
            sway,
            origin,
            rng.uniform(0, math.tau),
            rng.uniform(1.3, 1.55),
            rng.uniform(0.85, 1.25),
            0.022,
            "strap",
            stops,
            curl=rng.uniform(0.3, 0.9),
            twist=rng.uniform(-1.2, 1.2),
            along=22,
            droop=rng.uniform(0.2, 0.8),
        )
    plant = plant_object("vallisneria", mesh, colors, sway, material)
    mesh.free()
    return plant


def render_preview(path, count):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "VERTEX"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.show_backface_culling = False
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 700
    camera_data = bpy.data.cameras.new("camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = VARIANT_SPACING * 2.0
    camera = bpy.data.objects.new("camera", camera_data)
    camera.location = (VARIANT_SPACING * 0.5, -4.0, 0.5)
    camera.rotation_euler = (math.radians(86), 0.0, 0.0)
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera)


def clear():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)


def main():
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(SEED)
    plants = [
        ("rotala", lambda i, m: build_rotala(rng, i * VARIANT_SPACING, m, i % 2 == 0), 0.45),
        ("hairgrass", lambda i, m: build_hairgrass(rng, i * VARIANT_SPACING, m), 0.5),
        ("cryptocoryne", lambda i, m: build_cryptocoryne(rng, i * VARIANT_SPACING, m, i % 2 == 1), 0.4),
        ("vallisneria", lambda i, m: build_vallisneria(rng, i * VARIANT_SPACING, m), 0.4),
    ]
    for name, build, roughness in plants:
        clear()
        material = leaf_material(name, roughness, image(f"{name}-leaf", leaf_texture(LEAVES[name])))
        for index in range(VARIANTS):
            build(index, material)
        if arguments:
            render_preview(arguments[0].replace(".png", f"-{name}.png"), VARIANTS)
        export(OUTPUT.format(name))
        print("PLANT written", name)


if __name__ == "__main__":
    main()
