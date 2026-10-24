"""Builds Aquaria's royal gramma (Gramma loreto) in Blender.

    blender --background --python scripts/blender/royal_gramma.py -- <output folder>

Writes model.glb to the output folder (by default
public/assets/species/royal-gramma). Everything is generated here, so the
model is the project's own work (CC0, like the code that made it):

- a small, oval body with a blunt head and a big eye;
- the front half violet-magenta, the back half yellow, the two meeting in
  a soft, slanted band; a thin black line through the eye and a black spot
  at the front of the long dorsal fin; painted into a texture (an atlas:
  the body unrolled, each fin in its own rectangle; see paintkit.py) with
  faint scales and soft rays;
- a long dorsal fin, an anal fin, a rounded tail and long violet pelvic
  fins, all a little see-through;
- an armature ("Root", "Eye.L", "Eye.R") so Aquaria can turn the eyes, and
  a "MouthOpen" shape key.

The shared pieces are in fishkit.py and paintkit.py; docs/FISH_MODELS.md tells what
Aquaria expects of a model.
"""

import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from fishkit import (  # noqa: E402
    Body,
    body_fin,
    body_fin_curves,
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
    tail_fin_curves,
    textured_material,
)
import paintkit as paint  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUTPUT = os.path.join(ROOT, "public", "assets", "species", "royal-gramma")

HALF_THICKNESS = 0.07
EYE = Vector((0.27, 0.0, 0.035))
EYE_RADIUS = 0.034

# Colors, sRGB.
VIOLET = "#8a2bd8"
MAGENTA = "#b23ad0"
PALE_VIOLET = "#ecc8ff"
YELLOW = "#ffc21a"
GOLD = "#f2a40c"
BLACK = "#121212"
IRIS = "#d9b23a"
PUPIL = "#070707"

# The body's outline: (x, height) along the top and the bottom, snout to peduncle.
TOP = [
    (0.36, 0.0),
    (0.34, 0.05),
    (0.30, 0.09),
    (0.22, 0.13),
    (0.10, 0.15),
    (-0.02, 0.145),
    (-0.12, 0.12),
    (-0.20, 0.085),
    (-0.25, 0.065),
]
BOTTOM = [
    (0.36, -0.015),
    (0.34, -0.05),
    (0.30, -0.085),
    (0.22, -0.12),
    (0.10, -0.135),
    (-0.02, -0.13),
    (-0.12, -0.11),
    (-0.20, -0.08),
    (-0.25, -0.06),
]


def thickness(s):
    return max(HALF_THICKNESS * (min(s / 0.25, 1.0) ** 0.5) * (1 - 0.6 * smoothstep(0.35, 1.0, s)), 0.014)


# How round the body's cross-section is (Body.mesh); the pectoral fins sit on its skin.
ROUNDNESS = 0.9
BODY = Body(TOP, BOTTOM, thickness, linear(MAGENTA), linear(YELLOW))
PEDUNCLE_X = BODY.peduncle_x


# The texture: its size in texels, and a rectangle for each part. The
# gramma has one look; it wears it as its only coloring, "classic".
TEXTURE_SIZE = 1024
# The model's own texture is small: the species wears its coloring, which Aquaria
# brings down to the screen's needs as it loads.
OWN_TEXTURE_STEP = 8
ATLAS = paint.Atlas(TEXTURE_SIZE)
ATLAS.place("body", 0.0, 0.0, 1.0, 0.42)
ATLAS.place("caudal", 0.0, 0.44, 0.36, 0.30)
ATLAS.place("dorsal", 0.38, 0.44, 0.62, 0.30)
ATLAS.place("anal", 0.38, 0.76, 0.40, 0.20)
ATLAS.place("pelvic", 0.80, 0.76, 0.10, 0.16)
ATLAS.place("pectoral", 0.0, 0.76, 0.12, 0.10)

SCALE_SIZE = 0.02
SCALE_RIM = 0.07

DORSAL = dict(start_x=0.2, end_x=PEDUNCLE_X + 0.01, outline=[(0.17, 0.19), (0.02, 0.2), (-0.14, 0.19), (-0.24, 0.15), (-0.27, 0.10)], upper=True)
ANAL = dict(start_x=0.02, end_x=PEDUNCLE_X + 0.01, outline=[(-0.04, -0.19), (-0.16, -0.2), (-0.25, -0.15), (-0.27, -0.09)], upper=False)
CAUDAL_ROOT = Vector((PEDUNCLE_X + 0.006, 0, 0))
CAUDAL_BASE_HEIGHT = 0.1
CAUDAL_OUTLINE = [
    (PEDUNCLE_X - 0.01, 0, 0.06),
    (-0.37, 0, 0.11),
    (-0.46, 0, 0.12),
    (-0.44, 0, 0.0),
    (-0.46, 0, -0.12),
    (-0.37, 0, -0.11),
    (PEDUNCLE_X - 0.01, 0, -0.06),
]
# The black spot at the front of the dorsal fin: x, height, radius.
DORSAL_SPOT = (0.15, 0.17, 0.022)
PECTORAL_ROOT = Vector((0.2, 0, -0.01))


def pectoral_base(u):
    return PECTORAL_ROOT + Vector((-0.005 * u, 0, 0.05 * (u - 0.5)))


def split(x, z):
    """0 on the violet front, 1 on the yellow back: a soft, slightly ragged band slanting back towards the belly."""
    ragged = 0.012 * (paint.fbm(z * 30, x * 8, 5) - 0.5)
    return paint.smoothstep(0.02, -0.06, x + 0.25 * z + ragged)


def body_color(s, a):
    x, z, up, side = paint.body_points(BODY, ROUNDNESS, s, a)
    front = paint.mix(paint.srgb(VIOLET), paint.srgb(MAGENTA), paint.smoothstep(0.3, -0.7, up))
    back = paint.mix(paint.srgb(YELLOW), paint.srgb(GOLD), paint.smoothstep(0.2, 0.9, up) * 0.5)
    color = paint.mix(front, back, split(x, z))
    # A thin black line from the snout through the eye.
    line = 1 - paint.smoothstep(0.004, 0.012, abs(z - (EYE.z + (x - EYE.x) * 0.35)))
    color = paint.mix(color, paint.srgb(BLACK), line * paint.smoothstep(0.19, 0.24, x) * 0.85)
    return paint.with_scales(color, x, z, SCALE_SIZE, SCALE_RIM)


def body_fin_color(curves, spot=None):
    """Fins take the body's colors where they grow, with soft rays, fading out towards their edge."""
    web_and_rays = paint.rayed("#ffffff", "#d8d8d8", "#ffffff", 0.85, 0.4, 26, root_share=0.01)

    def color(u, v):
        x, z = paint.sheet_points(*curves, u, v)
        tint = paint.mix(paint.fill(u.shape, paint.srgb(VIOLET)), paint.srgb(YELLOW), split(x, z * 0))
        out = web_and_rays(u, v)
        out[..., :3] *= tint[..., :3]
        if spot is not None:
            out = paint.mix(out, paint.with_alpha(paint.srgb(BLACK), 0.95), paint.round_mark(x, z, *spot))
        return out

    return color


def paint_texture():
    return ATLAS.paint(
        {
            "body": body_color,
            "dorsal": body_fin_color(body_fin_curves(BODY, **DORSAL), DORSAL_SPOT),
            "anal": body_fin_color(body_fin_curves(BODY, **ANAL)),
            "caudal": body_fin_color(tail_fin_curves(CAUDAL_ROOT, CAUDAL_BASE_HEIGHT, CAUDAL_OUTLINE)),
            "pelvic": paint.rayed(VIOLET, "#6a1cb0", VIOLET, 0.85, 0.5, 4),
            "pectoral": paint.rayed(PALE_VIOLET, "#ffffff", PALE_VIOLET, 0.45, 0.12, 8),
        },
        paint.srgb("#000000", 0.0),
    )


def dorsal():
    return body_fin(BODY, **DORSAL, color=None, steps_u=160, uv=ATLAS.uv("dorsal"))


def anal():
    return body_fin(BODY, **ANAL, color=None, steps_u=120, uv=ATLAS.uv("anal"))


def caudal():
    return tail_fin(CAUDAL_ROOT, CAUDAL_BASE_HEIGHT, CAUDAL_OUTLINE, None, ruffle=0.004, uv=ATLAS.uv("caudal"))


def pelvic(side):
    """Long, narrow pelvic fins under the throat, violet."""
    root = Vector((0.2, side * 0.02, -0.11))

    def base(u):
        return root + Vector((-0.04 * u, 0, 0.01 * u))

    fan = fan_edge(root, 0.13, -38, -62, roundness=0.6)

    def edge(u):
        return fan(u) + Vector((0, side * 0.015, 0))

    return membrane(base, edge, None, steps_u=16, steps_v=12, uv=ATLAS.uv("pelvic"))


def pectoral(side):
    return pectoral_fin(BODY, ROUNDNESS, side, pectoral_base, fan_edge(PECTORAL_ROOT, 0.1, 20, -40), None, uv=ATLAS.uv("pectoral"))


def eye_centre(side):
    return Vector((EYE.x, side * BODY.profile(BODY.s(EYE.x))[2] * 0.5, EYE.z))


def eye_color(degrees):
    color = mix(linear(BLACK), linear(IRIS), 1 - smoothstep(55, 65, degrees))
    return mix(color, linear(PUPIL), 1 - smoothstep(30, 36, degrees))


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    output = os.path.abspath(args[0]) if args else DEFAULT_OUTPUT
    bpy.ops.wm.read_factory_settings(use_empty=True)

    pixels = paint_texture()
    paint.save_webp(pixels, os.path.join(output, "colorings", "classic.webp"))
    texture = paint.image("Royal gramma", pixels[::OWN_TEXTURE_STEP, ::OWN_TEXTURE_STEP])
    body = make_object(
        "Body", [BODY.mesh(None, roundness=ROUNDNESS, uv=ATLAS.uv("body"))], textured_material("Skin", texture, 0.4, 0.05, False)
    )
    BODY.mouth_shape_key(body, reach=0.05, drop=0.025)
    left_pectoral = pectoral(1)
    fin_parts = [dorsal(), anal(), caudal(), pelvic(1), pelvic(-1), left_pectoral, pectoral(-1)]
    fins = make_object("Fins", fin_parts, textured_material("Fins", texture, 0.5, 0.0, True))

    left = eyeball(eye_centre(1), EYE_RADIUS, 1, eye_color)
    right = eyeball(eye_centre(-1), EYE_RADIUS, -1, eye_color)
    eyes = make_object("Eyes", [left, right], material("Eyes", 0.05, 0.0, False))

    paint.print_manifest_values([body, fins, eyes], BODY, ROUNDNESS, left_pectoral, pectoral_base)
    rig([body, fins], eyes, len(left[0]), eye_centre(1), eye_centre(-1))
    export(output)
    print(f"Royal gramma written to {output}")


main()
