"""Builds Aquaria's platy (Xiphophorus maculatus) in Blender, with its strains.

    blender --background --python scripts/blender/platy.py -- <output folder>

Writes model.glb and colorings/<strain>.webp to the output folder (by
default public/assets/species/platy), and prints the fish-frame values
model.json needs. Everything is generated here, so the model and its
colorings are the project's own work (CC0, like the code that made them).
The platy is a classic of planted tanks:

- a short, deep, chunky body with a small upturned mouth and a round belly;
- a rounded fan of a tail, a rounded dorsal fin and a small anal fin;
- the colors are a texture (an atlas: the body unrolled, each fin in its
  own rectangle; see paintkit.py), painted once per strain: Red Wagtail
  (red with black fins, the model's own), Mickey Mouse (golden, with the
  black mark at the root of the tail that gives it its name) and Blue
  (silvery blue). Scales, rays and soft fin edges are painted in;
- a golden eye with a black pupil (vertex colors, untouched by strains);
- an armature: "Root" holds the body, "Eye.L" and "Eye.R" hold the eyeballs
  (their heads at the eyeballs' centres), so Aquaria can turn the eyes;
- a "MouthOpen" shape key that drops the lower jaw.

The shared pieces are in fishkit.py and paintkit.py; docs/FISH_MODELS.md
tells what Aquaria expects of a model.
"""

import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from fishkit import (  # noqa: E402
    Body,
    body_fin,
    export,
    eyeball,
    fan_edge,
    linear,
    make_object,
    material,
    membrane,
    mix,
    pectoral_fin,
    rig,
    smoothstep,
    tail_fin,
    textured_material,
)
import paintkit as paint  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUTPUT = os.path.join(ROOT, "public", "assets", "species", "platy")

HALF_THICKNESS = 0.06
EYE = Vector((0.235, 0.0, 0.03))
EYE_RADIUS = 0.027

# The eye's colors, sRGB (vertex colors).
EYE_RIM = "#3a2a20"
IRIS = "#e0a830"
PUPIL = "#080808"

# The body's outline: (x, height) along the top and the bottom, from the
# snout to the caudal peduncle. Short and deep, the mouth a little upturned.
TOP = [
    (0.30, 0.018),
    (0.285, 0.04),
    (0.25, 0.07),
    (0.19, 0.105),
    (0.11, 0.128),
    (0.03, 0.128),
    (-0.05, 0.105),
    (-0.11, 0.075),
    (-0.16, 0.058),
]
BOTTOM = [
    (0.30, 0.004),
    (0.285, -0.022),
    (0.25, -0.058),
    (0.18, -0.10),
    (0.09, -0.125),
    (0.0, -0.118),
    (-0.06, -0.092),
    (-0.11, -0.066),
    (-0.16, -0.052),
]


def thickness(s):
    """Chunky behind the head, flattening towards the peduncle."""
    return max(HALF_THICKNESS * (min(s / 0.3, 1.0) ** 0.5) * (1 - 0.55 * smoothstep(0.35, 1.0, s)), 0.014)


# How round the body's cross-section is (Body.mesh); the pectoral fins sit on its skin.
ROUNDNESS = 0.8
BODY = Body(TOP, BOTTOM, thickness, linear(EYE_RIM), linear(EYE_RIM))
PEDUNCLE_X = BODY.peduncle_x

# Where the gill cover ends and how far it reaches, Blender coordinates;
# printed in the fish frame for model.json.
GILL_EDGE_X = 0.165
GILL_TOP = 0.072
GILL_BOTTOM = -0.035
# Where the lips are dark, x.
LIPS_X = 0.285

# The texture: its size in texels, and a rectangle for each part.
TEXTURE_SIZE = 1024
ATLAS = paint.Atlas(TEXTURE_SIZE)
ATLAS.place("body", 0.0, 0.0, 1.0, 0.42)
ATLAS.place("caudal", 0.0, 0.44, 0.5, 0.56)
ATLAS.place("dorsal", 0.52, 0.44, 0.30, 0.28)
ATLAS.place("anal", 0.84, 0.44, 0.16, 0.16)
ATLAS.place("pelvic", 0.84, 0.62, 0.12, 0.10)
ATLAS.place("pectoral", 0.52, 0.74, 0.12, 0.10)
# The model's own texture is small: the species wears its colorings.
OWN_TEXTURE_STEP = 4

SCALE_SIZE = 0.018
SCALE_RIM = 0.08

CAUDAL_ROOT = Vector((PEDUNCLE_X + 0.006, 0, 0))
CAUDAL_BASE_HEIGHT = 0.09
CAUDAL_OUTLINE = [
    (PEDUNCLE_X - 0.005, 0, 0.045),
    (-0.24, 0, 0.115),
    (-0.31, 0, 0.14),
    (-0.37, 0, 0.115),
    (-0.40, 0, 0.05),
    (-0.405, 0, 0.0),
    (-0.40, 0, -0.05),
    (-0.37, 0, -0.115),
    (-0.31, 0, -0.14),
    (-0.24, 0, -0.115),
    (PEDUNCLE_X - 0.005, 0, -0.045),
]
DORSAL = dict(start_x=0.07, end_x=-0.085, outline=[(0.05, 0.19), (0.0, 0.215), (-0.06, 0.205), (-0.10, 0.15), (-0.105, 0.095)])
ANAL = dict(start_x=-0.005, end_x=-0.075, outline=[(-0.02, -0.16), (-0.06, -0.17), (-0.09, -0.12)])
PECTORAL_ROOT = Vector((0.19, 0, -0.035))


def pectoral_base(u):
    return PECTORAL_ROOT + Vector((-0.004 * u, 0, 0.04 * (u - 0.5)))


PECTORAL_EDGE = fan_edge(PECTORAL_ROOT, 0.072, 20, -40)


# Painting. Every painter returns sRGB colors with alpha for arrays of its part's parameters.


def body_points(s, a):
    return paint.body_points(BODY, ROUNDNESS, s, a)


def finished(skin, x, z, lips):
    """Dark lips, a silvery cheek, faint scales: what every strain's body has."""
    cheek = paint.smoothstep(GILL_EDGE_X - 0.02, GILL_EDGE_X + 0.02, x) * (1 - paint.smoothstep(0.03, 0.09, abs(z - 0.01)))
    out = paint.mix(skin, paint.srgb("#f0e6dc"), cheek * 0.25)
    out = paint.mix(out, paint.srgb(lips), paint.smoothstep(LIPS_X, LIPS_X + 0.015, x))
    return paint.with_scales(out, x, z, SCALE_SIZE, SCALE_RIM)


def red_wagtail():
    skin = paint.countershaded("#c8300c", "#ff4f14", "#ffa060")

    def body(s, a):
        x, z, up, side = body_points(s, a)
        out = skin(x, z, up, side)
        # The wagtail's black creeps onto the peduncle.
        out = paint.mix(out, paint.srgb("#121212"), paint.smoothstep(-0.10, -0.155, x) * 0.85)
        return finished(out, x, z, "#2a120c")

    black = paint.rayed("#141212", "#3a2a26", "#e8401a", 0.92, 0.6, 22, root_share=0.12, edge_color="#3a2a26")
    clear = paint.rayed("#ffb080", "#ffd0a8", "#ff8a50", 0.55, 0.25, 6)
    return body, black, black, black, clear


def mickey_mouse():
    skin = paint.countershaded("#d68a18", "#f6b83a", "#fde6a8")

    def body(s, a):
        x, z, up, side = body_points(s, a)
        out = skin(x, z, up, side)
        # The mark: a round black spot at the root of the tail, two smaller "ears" behind it.
        mark = paint.round_mark(x, z, -0.1, 0.0, 0.026)
        ears = paint.round_mark(x, z, -0.132, 0.03, 0.015) + paint.round_mark(x, z, -0.132, -0.03, 0.015)
        out = paint.mix(out, paint.srgb("#111111"), (mark + ears) * 0.95)
        return finished(out, x, z, "#4a2a10")

    fin = paint.rayed("#f8c860", "#e0a030", "#f0a030", 0.7, 0.35, 22, root_share=0.12)
    clear = paint.rayed("#ffe0a0", "#fff0c8", "#f6b83a", 0.5, 0.2, 6)
    return body, fin, fin, fin, clear


def blue():
    skin = paint.countershaded("#36506e", "#7f9fbe", "#d6e2ec")

    def body(s, a):
        x, z, up, side = body_points(s, a)
        out = skin(x, z, up, side)
        # A metallic blue band along the flank, brightest behind the gills.
        band = (1 - paint.smoothstep(0.15, 0.6, abs(up))) * paint.smoothstep(0.2, 0.05, x)
        out = paint.mix(out, paint.srgb("#5f9de0"), band * 0.55)
        return finished(out, x, z, "#2a3442")

    fin = paint.rayed("#b8cfe0", "#8aa8c4", "#9ab8d0", 0.55, 0.25, 22, root_share=0.12)
    clear = paint.rayed("#dbe7f0", "#ffffff", "#9ab8d0", 0.45, 0.18, 6)
    return body, fin, fin, fin, clear


STRAINS = [
    ("red-wagtail", "Red Wagtail", red_wagtail),
    ("mickey-mouse", "Mickey Mouse", mickey_mouse),
    ("blue", "Blue", blue),
]


def paint_strain(strain):
    body, caudal, dorsal, anal, small = strain()
    return ATLAS.paint(
        {"body": body, "caudal": caudal, "dorsal": dorsal, "anal": anal, "pelvic": small, "pectoral": small},
        paint.srgb("#000000", 0.0),
    )


# Geometry.


def caudal():
    """A rounded fan, a little shorter than the body is deep."""
    return tail_fin(
        CAUDAL_ROOT, CAUDAL_BASE_HEIGHT, CAUDAL_OUTLINE, None, steps_u=180, steps_v=40, bulge=0.006, ruffle=0.004, uv=ATLAS.uv("caudal")
    )


def dorsal():
    """Rounded, set over the middle of the back."""
    return body_fin(BODY, DORSAL["start_x"], DORSAL["end_x"], DORSAL["outline"], True, None, steps_u=120, uv=ATLAS.uv("dorsal"))


def anal():
    """A small fan under the belly, behind the vent."""
    return body_fin(
        BODY, ANAL["start_x"], ANAL["end_x"], ANAL["outline"], False, None, steps_u=60, bulge=0.003, uv=ATLAS.uv("anal")
    )


def pelvic(side):
    root = Vector((0.08, side * 0.025, -0.115))

    def base(u):
        return root + Vector((-0.02 * u, 0, 0))

    fan = fan_edge(root, 0.05, -20, -70)

    def edge(u):
        return fan(u) + Vector((0, side * 0.012, 0))

    return membrane(base, edge, None, steps_u=16, steps_v=6, uv=ATLAS.uv("pelvic"))


def pectoral(side):
    return pectoral_fin(BODY, ROUNDNESS, side, pectoral_base, PECTORAL_EDGE, None, uv=ATLAS.uv("pectoral"))


def eye_centre(side):
    # Set into the head, so only the front of the eyeball shows.
    return Vector((EYE.x, side * BODY.profile(BODY.s(EYE.x))[2] * 0.5, EYE.z))


def eye_color(degrees):
    """A golden eye with a big black pupil."""
    color = mix(linear(EYE_RIM), linear(IRIS), 1 - smoothstep(55, 65, degrees))
    return mix(color, linear(PUPIL), 1 - smoothstep(28, 34, degrees))


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    output = os.path.abspath(args[0]) if args else DEFAULT_OUTPUT
    bpy.ops.wm.read_factory_settings(use_empty=True)

    atlases = [(strain_id, name, paint_strain(strain)) for strain_id, name, strain in STRAINS]
    for strain_id, name, pixels in atlases:
        paint.save_webp(pixels, os.path.join(output, "colorings", f"{strain_id}.webp"))
        print(f"Coloring {name} written")
    own = paint.image("Platy", atlases[0][2][::OWN_TEXTURE_STEP, ::OWN_TEXTURE_STEP])

    body = make_object(
        "Body", [BODY.mesh(None, roundness=ROUNDNESS, uv=ATLAS.uv("body"))], textured_material("Skin", own, 0.4, 0.1, False)
    )
    BODY.mouth_shape_key(body, reach=0.04, drop=0.018)
    left_pectoral = pectoral(1)
    fin_parts = [caudal(), dorsal(), anal(), pelvic(1), pelvic(-1), left_pectoral, pectoral(-1)]
    fins = make_object("Fins", fin_parts, textured_material("Fins", own, 0.5, 0.0, True))

    left = eyeball(eye_centre(1), EYE_RADIUS, 1, eye_color)
    right = eyeball(eye_centre(-1), EYE_RADIUS, -1, eye_color)
    eyes = make_object("Eyes", [left, right], material("Eyes", 0.05, 0.0, False))

    paint.print_manifest_values([body, fins, eyes], BODY, ROUNDNESS, left_pectoral, pectoral_base, GILL_EDGE_X, GILL_TOP, GILL_BOTTOM)
    rig([body, fins], eyes, len(left[0]), eye_centre(1), eye_centre(-1))
    export(output)
    print(f"Platy written to {output}")


main()
