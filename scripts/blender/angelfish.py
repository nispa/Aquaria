"""Builds Aquaria's freshwater angelfish (Pterophyllum scalare) in Blender.

    blender --background --python scripts/blender/angelfish.py -- <output folder>

Writes model.glb to the output folder (by default
public/assets/species/freshwater-angelfish). Everything is generated here,
so the model is the project's own work (CC0, like the code that made it).
It is an albino angelfish, after photographs of the Altum form:

- a flat, rhomboid body: a small pointed snout set high, a steep concave
  forehead up to the dorsal fin, the belly sloping down to the anal fin;
- huge sickle-shaped dorsal and anal fins swept far back, a fan of a caudal
  fin with long lobes, milky and see-through, with soft white rays; clear
  pectoral fins and the two long pelvic filaments;
- pearly white skin with a faint pink blush at the gills and a hint of
  scales, and red eyes, painted as vertex colors;
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
    linear,
    make_object,
    material,
    membrane,
    mix,
    polyline_point,
    rig,
    rounded,
    smoothstep,
    tail_fin,
)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUTPUT = os.path.join(ROOT, "public", "assets", "species", "freshwater-angelfish")

HALF_THICKNESS = 0.06
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


def thickness(s):
    """Thickest just behind the head, thin as a leaf towards the fins' bases."""
    return max(HALF_THICKNESS * (min(s / 0.22, 1.0) ** 0.5) * (1 - 0.75 * smoothstep(0.25, 1.0, s)), 0.006)


BODY = Body(TOP, BOTTOM, thickness, linear(BLUSH), linear(PEARL))
PEDUNCLE_X = BODY.peduncle_x


def skin(x, z, top, bottom):
    height = (z - (top + bottom) / 2) / max((top - bottom) / 2, 1e-4)
    color = mix(linear(PEARL), linear(SHADE), smoothstep(0.55, 1.0, abs(height)) * 0.6)
    # A faint blush where the blood shows through: behind the gill cover and at the throat.
    gill = 1.0 - smoothstep(0.0, 0.05, abs(x - (0.155 - 0.05 * height * height)))
    throat = smoothstep(0.1, 0.32, x) * smoothstep(-0.2, -0.75, height)
    color = mix(color, linear(BLUSH), max(gill * 0.55, throat * 0.45))
    # A hint of scales: a fine diamond lattice, barely there, behind the head.
    scales = math.sin(x * 160 + z * 90) * math.sin(x * 160 - z * 90)
    return mix(color, linear(SHADE), max(scales, 0.0) * 0.18 * smoothstep(0.2, 0.0, x - 0.1))


def rayed(rays):
    """Milky, see-through fins, more so towards the edge, with soft white rays.

    The rays stay faint: fine, high-contrast stripes flicker into a moire
    pattern once the fish is small on screen.
    """

    def color(u, v, p):
        ray = (0.5 + 0.5 * math.cos(u * rays * 2 * math.pi)) ** 3
        web = mix(linear(FIN_WEB, 0.72), linear(FIN_WEB, 0.42), smoothstep(0.35, 1.0, v))
        return mix(web, linear(FIN_RAY, 0.85 - 0.25 * v), ray * 0.35)

    return color


def sickle(upper):
    """The dorsal (upper) or anal fin: a long sickle swept far back past the tail."""
    if upper:
        start_x = 0.03
        outline = [(-0.10, 0.52), (-0.30, 0.62), (-0.50, 0.68), (-0.66, 0.70), (-0.52, 0.52), (-0.40, 0.33), (-0.31, 0.14)]
    else:
        start_x = 0.0
        outline = [(-0.12, -0.44), (-0.30, -0.54), (-0.46, -0.60), (-0.60, -0.63), (-0.48, -0.45), (-0.37, -0.27), (-0.30, -0.11)]
    return body_fin(BODY, start_x, PEDUNCLE_X + 0.01, outline, upper, rayed(26))


def caudal():
    outline = [
        (PEDUNCLE_X - 0.01, 0, 0.06),
        (-0.42, 0, 0.22),
        (-0.60, 0, 0.26),
        (-0.55, 0, 0.10),
        (-0.56, 0, 0.0),
        (-0.55, 0, -0.10),
        (-0.60, 0, -0.26),
        (-0.42, 0, -0.22),
        (PEDUNCLE_X - 0.01, 0, -0.06),
    ]
    return tail_fin(Vector((PEDUNCLE_X + 0.006, 0, 0)), 0.09, outline, rayed(22))


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

    return membrane(base, edge, lambda u, v, p: linear(FIN_RAY, 0.85 - 0.3 * u), steps_u=40, steps_v=2)


def pectoral(side):
    root = Vector((0.15, side * 0.045, -0.02))

    def base(u):
        return root + Vector((-0.008 * u, 0, 0.06 * (u - 0.5)))

    def edge(u):
        return root + Vector((-0.12, side * 0.03, 0.08 * (u - 0.5) - 0.025))

    return membrane(base, edge, rayed(10), steps_u=40, steps_v=8)


def eye_centre(side):
    return Vector((EYE.x, side * BODY.profile(BODY.s(EYE.x))[2] * 0.72, EYE.z))


def eye_color(degrees):
    """Red all over, as in an albino, darker at the pupil."""
    color = mix(linear(PEARL), linear(IRIS), 1 - smoothstep(55, 70, degrees))
    return mix(color, linear(PUPIL), 1 - smoothstep(20, 30, degrees))


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    output = os.path.abspath(args[0]) if args else DEFAULT_OUTPUT
    bpy.ops.wm.read_factory_settings(use_empty=True)

    body = make_object("Body", [BODY.mesh(skin)], material("Skin", 0.28, 0.12, False))
    BODY.mouth_shape_key(body)
    fin_parts = [sickle(True), sickle(False), caudal(), pelvic(1, 0.42), pelvic(-1, 0.34), pectoral(1), pectoral(-1)]
    fins = make_object("Fins", fin_parts, material("Fins", 0.35, 0.0, True))

    left = eyeball(eye_centre(1), EYE_RADIUS, 1, eye_color)
    right = eyeball(eye_centre(-1), EYE_RADIUS, -1, eye_color)
    eyes = make_object("Eyes", [left, right], material("Eyes", 0.06, 0.0, False))

    rig([body, fins], eyes, len(left[0]), eye_centre(1), eye_centre(-1))
    export(output)
    print(f"Angelfish written to {output}")


main()
