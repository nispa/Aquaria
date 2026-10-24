"""Builds Aquaria's platy (Xiphophorus maculatus) in Blender.

    blender --background --python scripts/blender/platy.py -- <output folder>

Writes model.glb to the output folder (by default
public/assets/species/platy). Everything is generated here, so the model is
the project's own work (CC0, like the code that made it). It is a red
"wagtail" platy, a classic of planted tanks:

- a short, deep, chunky body with a small upturned mouth and a round belly;
- a rounded fan of a tail, a rounded dorsal fin and a small anal fin, all
  black (the wagtail's mark), see-through towards their edges;
- a red-orange body, darker on the back and paler on the belly, painted as
  vertex colors, and black lips; a golden eye with a black pupil;
- an armature: "Root" holds the body, "Eye.L" and "Eye.R" hold the eyeballs
  (their heads at the eyeballs' centres), so Aquaria can turn the eyes;
- a "MouthOpen" shape key that drops the lower jaw.

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
    fan_edge,
    linear,
    make_object,
    material,
    membrane,
    mix,
    pectoral_fin,
    rayed_fin,
    rig,
    smoothstep,
    tail_fin,
)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUTPUT = os.path.join(ROOT, "public", "assets", "species", "platy")

HALF_THICKNESS = 0.06
EYE = Vector((0.235, 0.0, 0.03))
EYE_RADIUS = 0.027

# Colors, sRGB.
BACK = "#c8300c"
RED = "#ff4f14"
BELLY = "#ffa060"
LIPS = "#2a120c"
BLACK = "#121212"
FIN_EDGE = "#3a2a26"
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
BODY = Body(TOP, BOTTOM, thickness, linear(LIPS), linear(BLACK))
PEDUNCLE_X = BODY.peduncle_x


def skin(x, z, top, bottom):
    height = (z - (top + bottom) / 2) / max((top - bottom) / 2, 1e-4)
    color = mix(linear(RED), linear(BACK), smoothstep(0.3, 0.95, height))
    color = mix(color, linear(BELLY), smoothstep(-0.2, -0.85, height))
    # The wagtail's black creeps onto the peduncle.
    color = mix(color, linear(BLACK), smoothstep(-0.10, -0.155, x) * 0.85)
    # Dark lips at the tip of the snout.
    return mix(color, linear(LIPS), smoothstep(0.285, 0.30, x))


def black_fin(u, v, p):
    """Black, with soft rays, turning see-through and a little brown at the edge."""
    fin = mix(linear(BLACK, 0.92), linear(FIN_EDGE, 0.55), smoothstep(0.55, 1.0, v))
    ray = (0.5 + 0.5 * math.cos(u * 22 * 2 * math.pi)) ** 3
    fin = mix(fin, linear(FIN_EDGE, 0.6), (1 - ray) * 0.3 * smoothstep(0.2, 0.6, v))
    # Near the body the fin keeps a little of the flank's red.
    return mix(fin, linear(RED, 0.95), (1 - smoothstep(0.0, 0.12, v)) * 0.6)


def caudal():
    """A rounded fan, a little shorter than the body is deep."""
    outline = [
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
    return tail_fin(Vector((PEDUNCLE_X + 0.006, 0, 0)), 0.09, outline, black_fin, steps_u=180, steps_v=40, bulge=0.006)


def dorsal():
    """Rounded, set over the middle of the back."""
    outline = [(0.05, 0.19), (0.0, 0.215), (-0.06, 0.205), (-0.10, 0.15), (-0.105, 0.095)]
    return body_fin(BODY, 0.07, -0.085, outline, True, black_fin, steps_u=120)


def anal():
    """A small fan under the belly, behind the vent."""
    outline = [(-0.02, -0.16), (-0.06, -0.17), (-0.09, -0.12)]
    return body_fin(BODY, -0.005, -0.075, outline, False, black_fin, steps_u=60, bulge=0.003)


def pelvic(side):
    root = Vector((0.08, side * 0.025, -0.115))

    def base(u):
        return root + Vector((-0.02 * u, 0, 0))

    fan = fan_edge(root, 0.05, -20, -70)

    def edge(u):
        return fan(u) + Vector((0, side * 0.012, 0))

    return membrane(base, edge, rayed_fin(BELLY, 5, 0.6, 0.3), steps_u=16, steps_v=6)


def pectoral(side):
    root = Vector((0.19, 0, -0.035))

    def base(u):
        return root + Vector((-0.004 * u, 0, 0.04 * (u - 0.5)))

    return pectoral_fin(BODY, ROUNDNESS, side, base, fan_edge(root, 0.072, 20, -40), rayed_fin(BELLY, 7, 0.55, 0.18))


def eye_centre(side):
    # Set into the head, so only the front of the eyeball shows.
    return Vector((EYE.x, side * BODY.profile(BODY.s(EYE.x))[2] * 0.5, EYE.z))


def eye_color(degrees):
    """A golden eye with a big black pupil."""
    color = mix(linear(BACK), linear(IRIS), 1 - smoothstep(55, 65, degrees))
    return mix(color, linear(PUPIL), 1 - smoothstep(28, 34, degrees))


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    output = os.path.abspath(args[0]) if args else DEFAULT_OUTPUT
    bpy.ops.wm.read_factory_settings(use_empty=True)

    body = make_object("Body", [BODY.mesh(skin, roundness=ROUNDNESS)], material("Skin", 0.35, 0.15, False))
    BODY.mouth_shape_key(body, reach=0.04, drop=0.018)
    fin_parts = [caudal(), dorsal(), anal(), pelvic(1), pelvic(-1), pectoral(1), pectoral(-1)]
    fins = make_object("Fins", fin_parts, material("Fins", 0.45, 0.0, True))

    left = eyeball(eye_centre(1), EYE_RADIUS, 1, eye_color)
    right = eyeball(eye_centre(-1), EYE_RADIUS, -1, eye_color)
    eyes = make_object("Eyes", [left, right], material("Eyes", 0.05, 0.0, False))

    rig([body, fins], eyes, len(left[0]), eye_centre(1), eye_centre(-1))
    export(output)
    print(f"Platy written to {output}")


main()
