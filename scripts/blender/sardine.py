"""Builds Aquaria's sardine (Sardina pilchardus) in Blender.

    blender --background --python scripts/blender/sardine.py -- <output folder>

Writes model.glb to the output folder (by default
public/assets/species/sardine). Everything is generated here, so the model
is the project's own work (CC0, like the code that made it):

- a slender, streamlined body, round in section, with a pointed head, a big
  eye and a deep, forked tail;
- a dark blue-green back, bright silver flanks and a white belly, a row of
  dark spots along the upper flank, faint radiating lines on the gill
  cover and silver scales, painted into a texture (an atlas: the body
  unrolled, each fin in its own rectangle; see paintkit.py);
- one small dorsal fin in the middle of the back, small pelvic and anal
  fins, clear pectoral fins that beat (their base on the skin);
- an armature ("Root", "Eye.L", "Eye.R") so Aquaria can turn the eyes, and
  a "MouthOpen" shape key.

The shared pieces are in fishkit.py and paintkit.py; docs/FISH_MODELS.md tells what
Aquaria expects of a model.
"""

import os
import sys

import bpy
import numpy as np
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
DEFAULT_OUTPUT = os.path.join(ROOT, "public", "assets", "species", "sardine")

HALF_THICKNESS = 0.055
EYE = Vector((0.29, 0.0, 0.012))
EYE_RADIUS = 0.026

# Colors, sRGB.
BACK = "#1f4f5f"
TEAL = "#3f8c96"
SILVER = "#d5dde2"
BELLY = "#f4f6f7"
SPOT = "#24323a"
FIN = "#c2ccd2"
TAIL = "#5e7480"
IRIS = "#e2e6e8"
PUPIL = "#060606"

# The body's outline: (x, height) along the top and the bottom, snout to peduncle.
TOP = [
    (0.38, 0.004),
    (0.35, 0.03),
    (0.30, 0.052),
    (0.20, 0.072),
    (0.08, 0.078),
    (-0.04, 0.07),
    (-0.14, 0.05),
    (-0.21, 0.03),
    (-0.25, 0.022),
]
BOTTOM = [
    (0.38, -0.008),
    (0.35, -0.03),
    (0.30, -0.05),
    (0.20, -0.07),
    (0.08, -0.078),
    (-0.04, -0.068),
    (-0.14, -0.046),
    (-0.21, -0.028),
    (-0.25, -0.02),
]

# Dark spots along the upper flank: x positions; the first is the largest.
SPOTS = [0.17, 0.11, 0.05, -0.01, -0.07]


def thickness(s):
    """Round in section: as thick as it is tall at the middle, then tapering."""
    return max(HALF_THICKNESS * (min(s / 0.3, 1.0) ** 0.6) * (1 - 0.65 * smoothstep(0.4, 1.0, s)), 0.012)


BODY = Body(TOP, BOTTOM, thickness, linear(BACK), linear(TAIL))
PEDUNCLE_X = BODY.peduncle_x


# How round the body's cross-section is (Body.mesh); the pectoral fins sit on its skin.
ROUNDNESS = 0.7

# The texture: its size in texels, and a rectangle for each part. The
# sardine has one look; it wears it as its only coloring, "silver".
TEXTURE_SIZE = 1024
# The model's own texture is small: the species wears its coloring, which Aquaria
# brings down to the screen's needs as it loads.
OWN_TEXTURE_STEP = 8
ATLAS = paint.Atlas(TEXTURE_SIZE)
ATLAS.place("body", 0.0, 0.0, 1.0, 0.46)
ATLAS.place("caudal", 0.0, 0.48, 0.40, 0.30)
ATLAS.place("dorsal", 0.42, 0.48, 0.16, 0.14)
ATLAS.place("anal", 0.60, 0.48, 0.16, 0.10)
ATLAS.place("pelvic", 0.78, 0.48, 0.10, 0.08)
ATLAS.place("pectoral", 0.42, 0.64, 0.12, 0.10)

SCALE_SIZE = 0.014
SCALE_RIM = 0.1

DORSAL = dict(start_x=0.1, end_x=-0.05, outline=[(0.07, 0.14), (0.0, 0.13), (-0.04, 0.085)], upper=True)
ANAL = dict(start_x=-0.1, end_x=-0.21, outline=[(-0.13, -0.075), (-0.19, -0.07), (-0.21, -0.035)], upper=False)
CAUDAL_ROOT = Vector((PEDUNCLE_X + 0.006, 0, 0))
CAUDAL_BASE_HEIGHT = 0.04
CAUDAL_OUTLINE = [
    (PEDUNCLE_X - 0.01, 0, 0.03),
    (-0.42, 0, 0.13),
    (-0.52, 0, 0.17),
    (-0.42, 0, 0.06),
    (-0.37, 0, 0.0),
    (-0.42, 0, -0.06),
    (-0.52, 0, -0.17),
    (-0.42, 0, -0.13),
    (PEDUNCLE_X - 0.01, 0, -0.03),
]
PECTORAL_ROOT = Vector((0.22, 0, -0.035))


def pectoral_base(u):
    return PECTORAL_ROOT + Vector((-0.004 * u, 0, 0.03 * (u - 0.5)))


def body_color(s, a):
    x, z, up, side = paint.body_points(BODY, ROUNDNESS, s, a)
    color = paint.mix(paint.fill(x.shape, paint.srgb(SILVER)), paint.srgb(TEAL), paint.smoothstep(0.2, 0.5, up))
    color = paint.mix(color, paint.srgb(BACK), paint.smoothstep(0.45, 0.85, up))
    color = paint.mix(color, paint.srgb(BELLY), paint.smoothstep(-0.2, -0.8, up))
    # A row of dark spots where the silver meets the blue.
    for index, spot_x in enumerate(SPOTS):
        radius = 0.016 if index == 0 else 0.011
        distance = np.hypot(x - spot_x, (up - 0.32) * 0.06)
        color = paint.mix(color, paint.srgb(SPOT), (1 - paint.smoothstep(radius * 0.5, radius, distance)) * 0.85)
    # Faint lines radiating across the gill cover.
    cover = paint.smoothstep(0.19, 0.22, x) * (1 - paint.smoothstep(0.25, 0.27, x)) * (1 - paint.smoothstep(0.5, 0.6, abs(up)))
    lines = (0.5 + 0.5 * np.cos(np.arctan2(z, x - 0.26) * 22)) ** 6
    color = paint.mix(color, paint.srgb(TEAL), lines * 0.35 * cover)
    # Silver scales, each catching the light its own way.
    return paint.with_scales(color, x, z, SCALE_SIZE, SCALE_RIM)


def paint_texture():
    clear = paint.rayed(FIN, "#a8b4bc", FIN, 0.7, 0.35, 10)
    return ATLAS.paint(
        {
            "body": body_color,
            "dorsal": clear,
            "anal": clear,
            "caudal": paint.rayed(FIN, "#8a9ca6", FIN, 0.8, 0.8, 24, edge_color=TAIL),
            "pelvic": clear,
            "pectoral": paint.rayed(FIN, "#ffffff", FIN, 0.4, 0.15, 8),
        },
        paint.srgb("#000000", 0.0),
    )


def dorsal():
    return body_fin(BODY, **DORSAL, color=None, steps_u=60, uv=ATLAS.uv("dorsal"))


def anal():
    return body_fin(BODY, **ANAL, color=None, steps_u=40, uv=ATLAS.uv("anal"))


def caudal():
    """A deep fork, the lobes darker towards their tips."""
    return tail_fin(CAUDAL_ROOT, CAUDAL_BASE_HEIGHT, CAUDAL_OUTLINE, None, uv=ATLAS.uv("caudal"))


def pelvic(side):
    root = Vector((0.02, side * 0.02, -0.07))

    def base(u):
        return root + Vector((-0.02 * u, 0, 0))

    def edge(u):
        return root + Vector((-0.07, side * 0.01, -0.025 + 0.01 * u))

    return membrane(base, edge, None, steps_u=8, steps_v=6, uv=ATLAS.uv("pelvic"))


def pectoral(side):
    return pectoral_fin(BODY, ROUNDNESS, side, pectoral_base, fan_edge(PECTORAL_ROOT, 0.085, 15, -35), None, uv=ATLAS.uv("pectoral"))


def eye_centre(side):
    return Vector((EYE.x, side * BODY.profile(BODY.s(EYE.x))[2] * 0.55, EYE.z))


def eye_color(degrees):
    color = mix(linear(SILVER), linear(IRIS), 1 - smoothstep(55, 65, degrees))
    return mix(color, linear(PUPIL), 1 - smoothstep(30, 36, degrees))


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    output = os.path.abspath(args[0]) if args else DEFAULT_OUTPUT
    bpy.ops.wm.read_factory_settings(use_empty=True)

    pixels = paint_texture()
    paint.save_webp(pixels, os.path.join(output, "colorings", "silver.webp"))
    texture = paint.image("Sardine", pixels[::OWN_TEXTURE_STEP, ::OWN_TEXTURE_STEP])
    body = make_object(
        "Body", [BODY.mesh(None, roundness=ROUNDNESS, uv=ATLAS.uv("body"))], textured_material("Skin", texture, 0.25, 0.45, False)
    )
    BODY.mouth_shape_key(body, reach=0.05, drop=0.022)
    left_pectoral = pectoral(1)
    fin_parts = [dorsal(), anal(), caudal(), pelvic(1), pelvic(-1), left_pectoral, pectoral(-1)]
    fins = make_object("Fins", fin_parts, textured_material("Fins", texture, 0.4, 0.0, True))

    left = eyeball(eye_centre(1), EYE_RADIUS, 1, eye_color)
    right = eyeball(eye_centre(-1), EYE_RADIUS, -1, eye_color)
    eyes = make_object("Eyes", [left, right], material("Eyes", 0.05, 0.0, False))

    paint.print_manifest_values([body, fins, eyes], BODY, ROUNDNESS, left_pectoral, pectoral_base)
    rig([body, fins], eyes, len(left[0]), eye_centre(1), eye_centre(-1))
    export(output)
    print(f"Sardine written to {output}")


main()
