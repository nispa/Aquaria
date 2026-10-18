"""Builds Aquaria's guppy (Poecilia reticulata) in Blender.

    blender --background --python scripts/blender/guppy.py -- <output folder>

Writes model.glb to the output folder (by default
public/assets/species/guppy). Everything is generated here, so the model is
the project's own work (CC0, like the code that made it). It is a male
"fancy" guppy, the one aquariums keep:

- a small, slender body with an upturned mouth and a big eye;
- a huge delta tail, as long as the body and fanned wide, and a long
  flag of a dorsal fin, both see-through, red-orange with black dots;
- an olive back, silver flanks with a sky-blue sheen, orange patches and a
  black spot, painted as vertex colors; a silver eye with a black pupil;
- an armature: "Root" holds the body, "Eye.L" and "Eye.R" hold the eyeballs
  (their heads at the eyeballs' centres), so Aquaria can turn the eyes;
- a "MouthOpen" shape key that drops the lower jaw.

The shared pieces are in fishkit.py; docs/FISH_MODELS.md tells what
Aquaria expects of a model.
"""

import math
import os
import random
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
    mix,
    pectoral_fin,
    rig,
    smoothstep,
    tail_fin,
)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUTPUT = os.path.join(ROOT, "public", "assets", "species", "guppy")

HALF_THICKNESS = 0.05
EYE = Vector((0.285, 0.0, 0.025))
EYE_RADIUS = 0.03

# Colors, sRGB.
OLIVE = "#8d9468"
SILVER = "#c9ccc4"
BELLY = "#ecebe2"
SKY = "#4aa3e6"
ORANGE = "#ff7a26"
BLACK = "#151515"
TAIL = "#ff5a1e"
TAIL_EDGE = "#d8261c"
IRIS = "#d9d7c8"
PUPIL = "#080808"

# The body's outline: (x, height) along the top and the bottom, from the
# snout to the caudal peduncle. The mouth points up, the belly is round.
TOP = [
    (0.36, 0.02),
    (0.34, 0.038),
    (0.30, 0.058),
    (0.25, 0.078),
    (0.18, 0.095),
    (0.08, 0.10),
    (0.0, 0.088),
    (-0.06, 0.066),
    (-0.10, 0.05),
]
BOTTOM = [
    (0.36, 0.008),
    (0.34, -0.018),
    (0.30, -0.045),
    (0.25, -0.075),
    (0.16, -0.10),
    (0.06, -0.10),
    (0.0, -0.082),
    (-0.06, -0.058),
    (-0.10, -0.045),
]

# Where the flank's colors sit: (x, height share, radius) for the orange
# patches and the black spot; the blue sheen covers the middle of the flank.
ORANGE_PATCHES = [(0.12, -0.2, 0.04), (0.02, 0.3, 0.035), (-0.06, -0.25, 0.03)]
BLACK_SPOT = (0.05, 0.05, 0.018)
# Black dots on the tail: (u, v) on the fin, radius; scattered by a fixed
# seed, so every build of the model is the same.
DOT_SEED = 7
TAIL_DOT_COUNT = 42


def scattered_dots(count, seed):
    rng = random.Random(seed)
    return [(rng.uniform(0.06, 0.94), rng.uniform(0.3, 0.95), rng.uniform(0.008, 0.016)) for _ in range(count)]


TAIL_DOTS = scattered_dots(TAIL_DOT_COUNT, DOT_SEED)


def thickness(s):
    """Round behind the head, flattening towards the peduncle."""
    return max(HALF_THICKNESS * (min(s / 0.25, 1.0) ** 0.5) * (1 - 0.6 * smoothstep(0.3, 1.0, s)), 0.012)


# How round the body's cross-section is (Body.mesh); the pectoral fins sit on its skin.
ROUNDNESS = 0.9
BODY = Body(TOP, BOTTOM, thickness, linear(OLIVE), linear(TAIL))
PEDUNCLE_X = BODY.peduncle_x


def blob(x, height, centre_x, centre_height, radius):
    """1 inside a soft round patch on the flank, 0 outside; heights count double."""
    distance = math.hypot(x - centre_x, (height - centre_height) * 0.1)
    # A ragged edge, so patches look painted by nature rather than stamped.
    ragged = radius * (1 + 0.25 * math.sin(x * 140 + height * 9))
    return (1.0 - smoothstep(ragged * 0.5, ragged, distance)) * 0.8


def skin(x, z, top, bottom):
    height = (z - (top + bottom) / 2) / max((top - bottom) / 2, 1e-4)
    color = mix(linear(SILVER), linear(OLIVE), smoothstep(0.2, 0.85, height))
    color = mix(color, linear(BELLY), smoothstep(-0.25, -0.85, height))
    # A sky-blue sheen along the middle of the flank, behind the gills.
    sheen = smoothstep(0.2, 0.1, x) * (1 - smoothstep(0.25, 0.7, abs(height)))
    color = mix(color, linear(SKY), sheen * 0.75)
    for patch in ORANGE_PATCHES:
        color = mix(color, linear(ORANGE), blob(x, height, *patch))
    return mix(color, linear(BLACK), blob(x, height, *BLACK_SPOT))


def spotted(dots):
    """Red-orange fins, see-through, deeper red towards the edge, with black dots."""

    def color(u, v, p):
        fin = mix(linear(TAIL, 0.82), linear(TAIL_EDGE, 0.7), smoothstep(0.5, 1.0, v))
        # Soft rays fanning out, a little darker between them.
        ray = (0.5 + 0.5 * math.cos(u * 30 * 2 * math.pi)) ** 3
        fin = mix(fin, linear(TAIL_EDGE, 0.85), (1 - ray) * 0.25 * smoothstep(0.1, 0.4, v))
        # Near the body the fin keeps a little of the flank's blue.
        fin = mix(fin, linear(SKY, 0.8), (1 - smoothstep(0.0, 0.18, v)) * 0.5)
        dot = max((1 - smoothstep(r * 0.4, r, math.hypot(u - du, (v - dv) * 0.3))) for du, dv, r in dots)
        return mix(fin, linear(BLACK, 0.9), dot)

    return color


def caudal():
    """The delta tail: as long as the body, fanning out to a straight, wide edge."""
    outline = [
        (PEDUNCLE_X - 0.005, 0, 0.04),
        (-0.30, 0, 0.17),
        (-0.52, 0, 0.30),
        (-0.62, 0, 0.32),
        (-0.66, 0, 0.12),
        (-0.665, 0, 0.0),
        (-0.66, 0, -0.12),
        (-0.62, 0, -0.32),
        (-0.52, 0, -0.30),
        (-0.30, 0, -0.17),
        (PEDUNCLE_X - 0.005, 0, -0.04),
    ]
    return tail_fin(
        Vector((PEDUNCLE_X + 0.006, 0, 0)), 0.07, outline, spotted(TAIL_DOTS), steps_u=240, steps_v=72, bulge=0.01
    )


def dorsal():
    """A long flag swept back over the tail."""
    outline = [(-0.02, 0.17), (-0.14, 0.24), (-0.28, 0.25), (-0.22, 0.16), (-0.13, 0.09)]
    dots = scattered_dots(12, DOT_SEED + 1)
    return body_fin(BODY, 0.05, -0.08, outline, True, spotted(dots), steps_u=120)


def gonopodium():
    """The male's anal fin: a short, pointed rod under the belly."""
    outline = [(-0.03, -0.12), (-0.075, -0.13), (-0.055, -0.095)]
    return body_fin(
        BODY, -0.01, -0.045, outline, False, lambda u, v, p: linear(SILVER, 0.6), steps_u=40, bulge=0.0
    )


def pectoral(side):
    root = Vector((0.2, 0, -0.03))

    def base(u):
        return root + Vector((-0.004 * u, 0, 0.04 * (u - 0.5)))

    def edge(u):
        return root + Vector((-0.08, 0, 0.05 * (u - 0.5) - 0.015))

    return pectoral_fin(BODY, ROUNDNESS, side, base, edge, lambda u, v, p: linear(BELLY, 0.3))


def eye_centre(side):
    # Set into the head, so only the front of the eyeball shows.
    return Vector((EYE.x, side * BODY.profile(BODY.s(EYE.x))[2] * 0.45, EYE.z))


def eye_color(degrees):
    """A silver eye with a big black pupil."""
    color = mix(linear(SILVER), linear(IRIS), 1 - smoothstep(55, 65, degrees))
    return mix(color, linear(PUPIL), 1 - smoothstep(30, 36, degrees))


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    output = os.path.abspath(args[0]) if args else DEFAULT_OUTPUT
    bpy.ops.wm.read_factory_settings(use_empty=True)

    body = make_object("Body", [BODY.mesh(skin, roundness=ROUNDNESS)], material("Skin", 0.3, 0.2, False))
    BODY.mouth_shape_key(body, reach=0.05, drop=0.02)
    fin_parts = [caudal(), dorsal(), gonopodium(), pectoral(1), pectoral(-1)]
    fins = make_object("Fins", fin_parts, material("Fins", 0.4, 0.0, True))

    left = eyeball(eye_centre(1), EYE_RADIUS, 1, eye_color)
    right = eyeball(eye_centre(-1), EYE_RADIUS, -1, eye_color)
    eyes = make_object("Eyes", [left, right], material("Eyes", 0.05, 0.0, False))

    rig([body, fins], eyes, len(left[0]), eye_centre(1), eye_centre(-1))
    export(output)
    print(f"Guppy written to {output}")


main()
