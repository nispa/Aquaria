"""Builds Aquaria's royal gramma (Gramma loreto) in Blender.

    blender --background --python scripts/blender/royal_gramma.py -- <output folder>

Writes model.glb to the output folder (by default
public/assets/species/royal-gramma). Everything is generated here, so the
model is the project's own work (CC0, like the code that made it):

- a small, oval body with a blunt head and a big eye;
- the front half violet-magenta, the back half yellow, the two meeting in
  a soft, slanted band; a thin black line through the eye and a black spot
  at the front of the long dorsal fin;
- a long dorsal fin, an anal fin, a rounded tail and long violet pelvic
  fins, all a little see-through;
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
DEFAULT_OUTPUT = os.path.join(ROOT, "public", "assets", "species", "royal-gramma")

HALF_THICKNESS = 0.07
EYE = Vector((0.27, 0.0, 0.035))
EYE_RADIUS = 0.034

# Colors, sRGB.
VIOLET = "#8a2bd8"
MAGENTA = "#b23ad0"
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


BODY = Body(TOP, BOTTOM, thickness, linear(MAGENTA), linear(YELLOW))
PEDUNCLE_X = BODY.peduncle_x


def split(x, z):
    """0 on the violet front, 1 on the yellow back: a soft band slanting back towards the belly."""
    return smoothstep(0.02, -0.06, x + 0.25 * z)


def skin(x, z, top, bottom):
    height = (z - (top + bottom) / 2) / max((top - bottom) / 2, 1e-4)
    front = mix(linear(VIOLET), linear(MAGENTA), smoothstep(0.3, -0.7, height))
    back = mix(linear(YELLOW), linear(GOLD), smoothstep(0.2, 0.9, height) * 0.5)
    color = mix(front, back, split(x, z))
    # A thin black line from the snout through the eye.
    line = 1 - smoothstep(0.008, 0.018, abs(z - (EYE.z + (x - EYE.x) * 0.35)))
    return mix(color, linear(BLACK), line * smoothstep(0.19, 0.24, x) * 0.85)


def fin_colors(spot):
    """Fins take the body's colors where they grow, fading out towards their edge."""

    def color(u, v, p):
        base = mix(linear(VIOLET, 0.85), linear(YELLOW, 0.85), split(p.x, 0.0))
        base = mix(base, [c for c in base[:3]] + [0.45], smoothstep(0.5, 1.0, v))
        if spot is None:
            return base
        dot = 1 - smoothstep(spot[2] * 0.7, spot[2], math.hypot(u - spot[0], (v - spot[1]) * 0.3))
        return mix(base, linear(BLACK, 0.95), dot)

    return color


def dorsal():
    outline = [(0.17, 0.19), (0.02, 0.2), (-0.14, 0.19), (-0.24, 0.15), (-0.27, 0.10)]
    return body_fin(BODY, 0.2, PEDUNCLE_X + 0.01, outline, True, fin_colors((0.09, 0.6, 0.1)), steps_u=160)


def anal():
    outline = [(-0.04, -0.19), (-0.16, -0.2), (-0.25, -0.15), (-0.27, -0.09)]
    return body_fin(BODY, 0.02, PEDUNCLE_X + 0.01, outline, False, fin_colors(None), steps_u=120)


def caudal():
    outline = [
        (PEDUNCLE_X - 0.01, 0, 0.06),
        (-0.37, 0, 0.11),
        (-0.46, 0, 0.12),
        (-0.44, 0, 0.0),
        (-0.46, 0, -0.12),
        (-0.37, 0, -0.11),
        (PEDUNCLE_X - 0.01, 0, -0.06),
    ]
    return tail_fin(Vector((PEDUNCLE_X + 0.006, 0, 0)), 0.1, outline, fin_colors(None))


def pelvic(side):
    """Long, narrow pelvic fins under the throat, violet."""
    root = Vector((0.2, side * 0.02, -0.11))

    def base(u):
        return root + Vector((-0.04 * u, 0, 0.01 * u))

    def edge(u):
        return root + Vector((-0.09 - 0.03 * u, side * 0.015, -0.1 + 0.04 * u))

    return membrane(base, edge, lambda u, v, p: linear(VIOLET, 0.8 - 0.3 * v), steps_u=12, steps_v=12)


def pectoral(side):
    root = Vector((0.2, side * 0.05, -0.01))

    def base(u):
        return root + Vector((-0.005 * u, 0, 0.05 * (u - 0.5)))

    def edge(u):
        return root + Vector((-0.1, side * 0.03, 0.06 * (u - 0.5) - 0.02))

    return membrane(base, edge, lambda u, v, p: linear(MAGENTA, 0.3), steps_u=24, steps_v=6)


def eye_centre(side):
    return Vector((EYE.x, side * BODY.profile(BODY.s(EYE.x))[2] * 0.5, EYE.z))


def eye_color(degrees):
    color = mix(linear(BLACK), linear(IRIS), 1 - smoothstep(55, 65, degrees))
    return mix(color, linear(PUPIL), 1 - smoothstep(30, 36, degrees))


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    output = os.path.abspath(args[0]) if args else DEFAULT_OUTPUT
    bpy.ops.wm.read_factory_settings(use_empty=True)

    body = make_object("Body", [BODY.mesh(skin, roundness=0.9)], material("Skin", 0.35, 0.05, False))
    BODY.mouth_shape_key(body, reach=0.05, drop=0.025)
    fin_parts = [dorsal(), anal(), caudal(), pelvic(1), pelvic(-1), pectoral(1), pectoral(-1)]
    fins = make_object("Fins", fin_parts, material("Fins", 0.45, 0.0, True))

    left = eyeball(eye_centre(1), EYE_RADIUS, 1, eye_color)
    right = eyeball(eye_centre(-1), EYE_RADIUS, -1, eye_color)
    eyes = make_object("Eyes", [left, right], material("Eyes", 0.05, 0.0, False))

    rig([body, fins], eyes, len(left[0]), eye_centre(1), eye_centre(-1))
    export(output)
    print(f"Royal gramma written to {output}")


main()
