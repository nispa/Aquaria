"""Builds Aquaria's sardine (Sardina pilchardus) in Blender.

    blender --background --python scripts/blender/sardine.py -- <output folder>

Writes model.glb to the output folder (by default
public/assets/species/sardine). Everything is generated here, so the model
is the project's own work (CC0, like the code that made it):

- a slender, streamlined body, round in section, with a pointed head, a big
  eye and a deep, forked tail;
- a dark blue-green back, bright silver flanks and a white belly, a row of
  dark spots along the upper flank and faint radiating lines on the gill
  cover;
- one small dorsal fin in the middle of the back, small pelvic and anal
  fins, clear pectoral fins;
- an armature ("Root", "Eye.L", "Eye.R") so Aquaria can turn the eyes, and
  a "MouthOpen" shape key.

The shared pieces are in fishkit.py; docs/FISH_MODELS.md tells what
Aquaria expects of a model.
"""

import math
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
    linear,
    make_object,
    material,
    membrane,
    mix,
    rig,
    smoothstep,
    tail_fin,
)

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


def skin(x, z, top, bottom):
    height = (z - (top + bottom) / 2) / max((top - bottom) / 2, 1e-4)
    color = mix(linear(SILVER), linear(TEAL), smoothstep(0.2, 0.5, height))
    color = mix(color, linear(BACK), smoothstep(0.45, 0.85, height))
    color = mix(color, linear(BELLY), smoothstep(-0.2, -0.8, height))
    # A row of dark spots where the silver meets the blue.
    for index, spot_x in enumerate(SPOTS):
        radius = 0.016 if index == 0 else 0.011
        distance = math.hypot(x - spot_x, (height - 0.32) * 0.06)
        color = mix(color, linear(SPOT), (1 - smoothstep(radius * 0.5, radius, distance)) * 0.85)
    # Faint lines radiating across the gill cover.
    if 0.19 < x < 0.26 and abs(height) < 0.6:
        lines = 0.5 + 0.5 * math.cos(math.atan2(z, x - 0.26) * 22)
        color = mix(color, linear(TEAL), lines**6 * 0.35 * smoothstep(0.19, 0.22, x))
    return color


def clear(alpha):
    def color(u, v, p):
        return mix(linear(FIN, alpha), linear(FIN, alpha * 0.5), v)

    return color


def dorsal():
    outline = [(0.07, 0.14), (0.0, 0.13), (-0.04, 0.085)]
    return body_fin(BODY, 0.1, -0.05, outline, True, clear(0.75), steps_u=60)


def anal():
    outline = [(-0.13, -0.075), (-0.19, -0.07), (-0.21, -0.035)]
    return body_fin(BODY, -0.1, -0.21, outline, False, clear(0.6), steps_u=40)


def caudal():
    """A deep fork, the lobes darker towards their tips."""
    outline = [
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

    def color(u, v, p):
        return mix(linear(FIN, 0.8), linear(TAIL, 0.85), smoothstep(0.2, 0.9, v))

    return tail_fin(Vector((PEDUNCLE_X + 0.006, 0, 0)), 0.04, outline, color)


def pelvic(side):
    root = Vector((0.02, side * 0.02, -0.07))

    def base(u):
        return root + Vector((-0.02 * u, 0, 0))

    def edge(u):
        return root + Vector((-0.07, side * 0.01, -0.025 + 0.01 * u))

    return membrane(base, edge, clear(0.55), steps_u=8, steps_v=6)


def pectoral(side):
    root = Vector((0.22, side * 0.045, -0.035))

    def base(u):
        return root + Vector((-0.004 * u, 0, 0.03 * (u - 0.5)))

    def edge(u):
        return root + Vector((-0.09, side * 0.02, 0.03 * (u - 0.5) - 0.02))

    return membrane(base, edge, clear(0.35), steps_u=16, steps_v=6)


def eye_centre(side):
    return Vector((EYE.x, side * BODY.profile(BODY.s(EYE.x))[2] * 0.55, EYE.z))


def eye_color(degrees):
    color = mix(linear(SILVER), linear(IRIS), 1 - smoothstep(55, 65, degrees))
    return mix(color, linear(PUPIL), 1 - smoothstep(30, 36, degrees))


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    output = os.path.abspath(args[0]) if args else DEFAULT_OUTPUT
    bpy.ops.wm.read_factory_settings(use_empty=True)

    body = make_object("Body", [BODY.mesh(skin, roundness=0.7)], material("Skin", 0.22, 0.45, False))
    BODY.mouth_shape_key(body, reach=0.05, drop=0.022)
    fin_parts = [dorsal(), anal(), caudal(), pelvic(1), pelvic(-1), pectoral(1), pectoral(-1)]
    fins = make_object("Fins", fin_parts, material("Fins", 0.4, 0.0, True))

    left = eyeball(eye_centre(1), EYE_RADIUS, 1, eye_color)
    right = eyeball(eye_centre(-1), EYE_RADIUS, -1, eye_color)
    eyes = make_object("Eyes", [left, right], material("Eyes", 0.05, 0.0, False))

    rig([body, fins], eyes, len(left[0]), eye_centre(1), eye_centre(-1))
    export(output)
    print(f"Sardine written to {output}")


main()
