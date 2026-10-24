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
- pearly white skin with a faint pink blush at the gills, a sheen and a
  hint of scales, painted into a texture (an atlas: the body unrolled,
  each fin in its own rectangle; see paintkit.py); red eyes (vertex colors);
- an armature: "Root" holds the body, "Eye.L" and "Eye.R" hold the eyeballs
  (their heads at the eyeballs' centres), so Aquaria can turn the eyes;
- a "MouthOpen" shape key that drops the lower jaw.

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
    polyline_point,
    rig,
    rounded,
    smoothstep,
    tail_fin,
    textured_material,
)
import paintkit as paint  # noqa: E402

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


# How round the body's cross-section is (Body.mesh); the pectoral fins sit on its skin.
ROUNDNESS = 1.4
BODY = Body(TOP, BOTTOM, thickness, linear(BLUSH), linear(PEARL))
PEDUNCLE_X = BODY.peduncle_x


# The texture: its size in texels, and a rectangle for each part. The
# angelfish has one look; it wears it as its only coloring, "albino".
TEXTURE_SIZE = 1024
# The model's own texture is small: the species wears its coloring, which Aquaria
# brings down to the screen's needs as it loads.
OWN_TEXTURE_STEP = 8
ATLAS = paint.Atlas(TEXTURE_SIZE)
ATLAS.place("body", 0.0, 0.0, 0.62, 0.50)
ATLAS.place("dorsal", 0.0, 0.52, 0.48, 0.24)
ATLAS.place("anal", 0.0, 0.78, 0.48, 0.22)
ATLAS.place("caudal", 0.64, 0.0, 0.36, 0.40)
ATLAS.place("pelvic", 0.64, 0.42, 0.20, 0.06)
ATLAS.place("pectoral", 0.64, 0.50, 0.14, 0.12)

SCALE_SIZE = 0.016
SCALE_RIM = 0.06

SICKLES = {
    True: dict(start_x=0.03, outline=[(-0.10, 0.52), (-0.30, 0.62), (-0.50, 0.68), (-0.66, 0.70), (-0.52, 0.52), (-0.40, 0.33), (-0.31, 0.14)]),
    False: dict(start_x=0.0, outline=[(-0.12, -0.44), (-0.30, -0.54), (-0.46, -0.60), (-0.60, -0.63), (-0.48, -0.45), (-0.37, -0.27), (-0.30, -0.11)]),
}
CAUDAL_ROOT = Vector((PEDUNCLE_X + 0.006, 0, 0))
CAUDAL_BASE_HEIGHT = 0.09
CAUDAL_OUTLINE = [
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
PECTORAL_ROOT = Vector((0.15, 0, -0.02))


def pectoral_base(u):
    return PECTORAL_ROOT + Vector((-0.008 * u, 0, 0.06 * (u - 0.5)))


def body_color(s, a):
    x, z, up, side = paint.body_points(BODY, ROUNDNESS, s, a)
    color = paint.mix(paint.fill(x.shape, paint.srgb(PEARL)), paint.srgb(SHADE), paint.smoothstep(0.55, 1.0, abs(up)) * 0.6)
    # A faint blush where the blood shows through: behind the gill cover and at the throat.
    gill = 1.0 - paint.smoothstep(0.0, 0.05, abs(x - (0.155 - 0.05 * up * up)))
    throat = paint.smoothstep(0.1, 0.32, x) * paint.smoothstep(-0.2, -0.75, up)
    color = paint.mix(color, paint.srgb(BLUSH), np.maximum(gill * 0.55, throat * 0.45))
    # A pearly sheen that comes and goes over the flank.
    sheen = paint.fbm(x * 12, z * 12, 9, octaves=3)
    color = paint.mix(color, paint.srgb("#e6eef4"), paint.smoothstep(0.55, 0.8, sheen) * 0.35)
    return paint.with_scales(color, x, z, SCALE_SIZE, SCALE_RIM)


def milky(rays):
    """Milky, see-through fins, more so towards the edge, with soft white rays.

    The rays stay faint: fine, high-contrast stripes flicker into a moire
    pattern once the fish is small on screen.
    """
    return paint.rayed(FIN_WEB, "#d4dade", FIN_RAY, 0.72, 0.38, rays, root_share=0.1)


def paint_texture():
    return ATLAS.paint(
        {
            "body": body_color,
            "dorsal": milky(26),
            "anal": milky(26),
            "caudal": milky(22),
            "pelvic": paint.rayed(FIN_RAY, FIN_WEB, FIN_RAY, 0.85, 0.6, 1),
            "pectoral": milky(10),
        },
        paint.srgb("#000000", 0.0),
    )


def sickle(upper):
    """The dorsal (upper) or anal fin: a long sickle swept far back past the tail."""
    fin = SICKLES[upper]
    return body_fin(
        BODY, fin["start_x"], PEDUNCLE_X + 0.01, fin["outline"], upper, None, uv=ATLAS.uv("dorsal" if upper else "anal")
    )


def caudal():
    return tail_fin(CAUDAL_ROOT, CAUDAL_BASE_HEIGHT, CAUDAL_OUTLINE, None, ruffle=0.006, uv=ATLAS.uv("caudal"))


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

    # Along the filament is u here: its texture runs across the rectangle.
    return membrane(base, edge, None, steps_u=40, steps_v=2, uv=lambda u, v: ATLAS.uv("pelvic")(v, u))


def pectoral(side):
    return pectoral_fin(
        BODY, ROUNDNESS, side, pectoral_base, fan_edge(PECTORAL_ROOT, 0.12, 20, -40), None, steps_u=40, steps_v=8, uv=ATLAS.uv("pectoral")
    )


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

    pixels = paint_texture()
    paint.save_webp(pixels, os.path.join(output, "colorings", "albino.webp"))
    texture = paint.image("Angelfish", pixels[::OWN_TEXTURE_STEP, ::OWN_TEXTURE_STEP])
    body = make_object(
        "Body", [BODY.mesh(None, roundness=ROUNDNESS, uv=ATLAS.uv("body"))], textured_material("Skin", texture, 0.32, 0.12, False)
    )
    BODY.mouth_shape_key(body)
    left_pectoral = pectoral(1)
    fin_parts = [sickle(True), sickle(False), caudal(), pelvic(1, 0.42), pelvic(-1, 0.34), left_pectoral, pectoral(-1)]
    fins = make_object("Fins", fin_parts, textured_material("Fins", texture, 0.4, 0.0, True))

    left = eyeball(eye_centre(1), EYE_RADIUS, 1, eye_color)
    right = eyeball(eye_centre(-1), EYE_RADIUS, -1, eye_color)
    eyes = make_object("Eyes", [left, right], material("Eyes", 0.06, 0.0, False))

    paint.print_manifest_values([body, fins, eyes], BODY, ROUNDNESS, left_pectoral, pectoral_base)
    rig([body, fins], eyes, len(left[0]), eye_centre(1), eye_centre(-1))
    export(output)
    print(f"Angelfish written to {output}")


main()
