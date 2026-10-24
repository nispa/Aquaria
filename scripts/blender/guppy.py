"""Builds Aquaria's guppy (Poecilia reticulata) in Blender, with its strains.

    blender --background --python scripts/blender/guppy.py -- <output folder>

Writes model.glb and colorings/<strain>.webp to the output folder (by
default public/assets/species/guppy), and prints the fish-frame values
model.json needs. Everything is generated here, so the model and its
colorings are the project's own work (CC0, like the code that made them).
It is a male "fancy" guppy, the one aquariums keep:

- a small, slender body with an upturned mouth and a big eye;
- a delta tail fanned wide, nearly as long as the body, its edge
  fluttering, and a long dorsal flag swept back;
- the colors are a texture (an atlas: the body unrolled, each fin in its
  own rectangle), painted once per strain, so one model wears them all:
  Half Black Red (the "tuxedo", the model's own), Blue Grass, Full Red and
  Yellow Cobra. Scales, rays and soft, see-through fin edges are painted
  in, so the fish does not look like a plastic toy;
- a silver eye with a black pupil (vertex colors, untouched by strains);
- an armature: "Root" holds the body, "Eye.L" and "Eye.R" hold the eyeballs
  (their heads at the eyeballs' centres), so Aquaria can turn the eyes;
- a "MouthOpen" shape key that drops the lower jaw.

The shared pieces are in fishkit.py and paintkit.py; docs/FISH_MODELS.md
tells what Aquaria expects of a model.
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
DEFAULT_OUTPUT = os.path.join(ROOT, "public", "assets", "species", "guppy")

HALF_THICKNESS = 0.05
EYE = Vector((0.285, 0.0, 0.025))
EYE_RADIUS = 0.03

# The eye's colors, sRGB (vertex colors).
SILVER = "#c9ccc4"
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


def thickness(s):
    """Round behind the head, flattening towards the peduncle."""
    return max(HALF_THICKNESS * (min(s / 0.25, 1.0) ** 0.5) * (1 - 0.6 * smoothstep(0.3, 1.0, s)), 0.012)


# How round the body's cross-section is (Body.mesh); the pectoral fins sit on its skin.
ROUNDNESS = 0.9
BODY = Body(TOP, BOTTOM, thickness, linear(SILVER), linear(SILVER))
PEDUNCLE_X = BODY.peduncle_x

# Where the gill cover ends, Blender coordinates; printed in the fish frame for model.json.
GILL_EDGE_X = 0.182
GILL_HALF_HEIGHT = 0.062

# The texture: its size in texels, and a rectangle for each part.
TEXTURE_SIZE = 1024
ATLAS = paint.Atlas(TEXTURE_SIZE)
ATLAS.place("body", 0.0, 0.0, 1.0, 0.42)
ATLAS.place("caudal", 0.0, 0.44, 0.62, 0.56)
ATLAS.place("dorsal", 0.64, 0.44, 0.36, 0.30)
ATLAS.place("gonopodium", 0.64, 0.76, 0.12, 0.10)
ATLAS.place("pectoral", 0.78, 0.76, 0.10, 0.10)
# The model's own texture is small: the species wears its colorings.
OWN_TEXTURE_STEP = 4

# How big a scale is, body lengths, and how dark its rim.
SCALE_SIZE = 0.016
SCALE_RIM = 0.07
# Where the tuxedo's black starts, x, and how wide its ragged edge is.
TUXEDO_X = 0.08
TUXEDO_EDGE = 0.03


def caudal_outline():
    return [
        (PEDUNCLE_X - 0.005, 0, 0.04),
        (-0.24, 0, 0.13),
        (-0.40, 0, 0.225),
        (-0.47, 0, 0.25),
        (-0.50, 0, 0.12),
        (-0.505, 0, 0.0),
        (-0.50, 0, -0.12),
        (-0.47, 0, -0.25),
        (-0.40, 0, -0.225),
        (-0.24, 0, -0.13),
        (PEDUNCLE_X - 0.005, 0, -0.04),
    ]


CAUDAL_ROOT = Vector((PEDUNCLE_X + 0.006, 0, 0))
CAUDAL_BASE_HEIGHT = 0.07
DORSAL = dict(start_x=0.05, end_x=-0.08, outline=[(-0.02, 0.15), (-0.12, 0.21), (-0.24, 0.215), (-0.20, 0.15), (-0.12, 0.09)])
GONOPODIUM = dict(start_x=-0.01, end_x=-0.045, outline=[(-0.03, -0.12), (-0.075, -0.13), (-0.055, -0.095)])
PECTORAL_ROOT = Vector((0.2, 0, -0.03))


def pectoral_base(u):
    return PECTORAL_ROOT + Vector((-0.004 * u, 0, 0.04 * (u - 0.5)))


PECTORAL_EDGE = fan_edge(PECTORAL_ROOT, 0.075, 20, -40)


# Painting. Every painter returns sRGB colors with alpha for arrays of its part's parameters.


def gill_sheen(skin, x, z):
    """The gill cover and the cheek: silvery, a touch of light."""
    cheek = paint.smoothstep(GILL_EDGE_X - 0.02, GILL_EDGE_X + 0.02, x) * (1 - paint.smoothstep(0.03, 0.08, np.abs(z)))
    return paint.mix(skin, paint.srgb("#e8ecef"), cheek * 0.35)


def tuxedo(skin, x, z, color):
    """The rear half black (Half Black, Blue Grass), its front edge ragged as on a real fish."""
    ragged = TUXEDO_X + TUXEDO_EDGE * (paint.fbm(z * 40, x * 10, 3) - 0.5) - 0.25 * np.clip(-z, 0, None)
    share = paint.smoothstep(ragged + TUXEDO_EDGE * 0.5, ragged - TUXEDO_EDGE * 0.5, x)
    return paint.mix(skin, paint.srgb(color), share)


def vermiculated(skin, x, z, color, scale, seed, coverage=1.0):
    """The snakeskin of the cobra strains: winding dark lines."""
    noise = paint.fbm(x * scale, z * scale, seed, octaves=2)
    line = 1 - paint.smoothstep(0.012, 0.03, np.abs(noise - 0.5))
    return paint.mix(skin, paint.srgb(color), line * coverage)


def body_points(s, a):
    return paint.body_points(BODY, ROUNDNESS, s, a)


def caudal_points(u, v):
    points = rounded(caudal_outline())
    return paint.sheet_points(
        lambda t: CAUDAL_ROOT + Vector((0, 0, (0.5 - t) * CAUDAL_BASE_HEIGHT)),
        lambda t: polyline_point(points, t),
        u,
        v,
    )


# The strains: how each paints the body and the fins. Colors are sRGB.


def half_black_red():
    skin = paint.countershaded("#a8a296", "#d8d2ca", "#efe9e2")

    def body(s, a):
        x, z, up, side = body_points(s, a)
        out = gill_sheen(skin(x, z, up, side), x, z)
        out = paint.mix(out, paint.srgb("#e6c3bd"), paint.smoothstep(0.3, 0.1, x) * 0.25)
        out = tuxedo(out, x, z, "#141117")
        return paint.with_scales(out, x, z, SCALE_SIZE, SCALE_RIM)

    red = paint.rayed("#cf1820", "#8e0c12", "#2a0a0e", 0.9, 0.72, 34)
    return body, red, red, paint.rayed("#3a3438", "#24202a", "#141117", 0.75, 0.6, 6)


def blue_grass():
    skin = paint.countershaded("#7f8c96", "#b8c4cc", "#e6eaec")

    def body(s, a):
        x, z, up, side = body_points(s, a)
        out = gill_sheen(skin(x, z, up, side), x, z)
        out = paint.mix(out, paint.srgb("#6fa8d8"), paint.smoothstep(0.25, 0.05, x) * 0.35)
        out = tuxedo(out, x, z, "#1a2438")
        return paint.with_scales(out, x, z, SCALE_SIZE, SCALE_RIM)

    web = paint.rayed("#86bde6", "#5f93c4", "#1a2438", 0.82, 0.58, 30)

    def grass(points, seed):
        def color(u, v):
            out = web(u, v)
            x, z = points(u, v)
            # Fine black dots, denser towards the edge: the "grass".
            speckle = paint.dots(x, z, 0.014, 0.0045, seed, chance=0.55 + 0.4 * v)
            return paint.mix(out, paint.with_alpha(paint.srgb("#0c0c10"), out[..., 3]), speckle * paint.smoothstep(0.08, 0.2, v))

        return color

    dorsal_points = lambda u, v: paint.sheet_points(*dorsal_curves(), u, v)  # noqa: E731
    return body, grass(caudal_points, 3), grass(dorsal_points, 5), paint.rayed("#9aa6b0", "#7f8c96", "#1a2438", 0.7, 0.55, 6)


def full_red():
    skin = paint.countershaded("#a8161c", "#d4262c", "#e8705e")

    def body(s, a):
        x, z, up, side = body_points(s, a)
        out = skin(x, z, up, side)
        # A pale, silvery head; red from the gills back.
        head = paint.smoothstep(GILL_EDGE_X - 0.04, GILL_EDGE_X + 0.04, x)
        out = paint.mix(out, paint.srgb("#e6d6cf"), head * 0.85)
        out = gill_sheen(out, x, z)
        return paint.with_scales(out, x, z, SCALE_SIZE, SCALE_RIM)

    red = paint.rayed("#e0222a", "#a8121a", "#b8161c", 0.9, 0.72, 34)
    return body, red, red, paint.rayed("#d4262c", "#a8161c", "#a8161c", 0.75, 0.6, 6)


def yellow_cobra():
    skin = paint.countershaded("#8d8a34", "#c9b84a", "#ece2a8")

    def body(s, a):
        x, z, up, side = body_points(s, a)
        out = gill_sheen(skin(x, z, up, side), x, z)
        # The snakeskin covers the back and the flank, fading on the belly.
        out = vermiculated(out, x, z, "#3a3416", 60, 11, paint.smoothstep(-0.7, -0.2, up) * 0.75)
        return paint.with_scales(out, x, z, SCALE_SIZE, SCALE_RIM)

    web = paint.rayed("#ecc838", "#c49a1c", "#6e5c14", 0.88, 0.66, 30)

    def snakeskin(points, seed):
        def color(u, v):
            out = web(u, v)
            x, z = points(u, v)
            noise = paint.fbm(x * 40, z * 40, seed, octaves=2)
            line = 1 - paint.smoothstep(0.015, 0.035, np.abs(noise - 0.5))
            return paint.mix(out, paint.with_alpha(paint.srgb("#2a2410"), out[..., 3]), line * 0.8)

        return color

    dorsal_points = lambda u, v: paint.sheet_points(*dorsal_curves(), u, v)  # noqa: E731
    return body, snakeskin(caudal_points, 21), snakeskin(dorsal_points, 23), paint.rayed("#d8c860", "#b4a040", "#6e5c14", 0.7, 0.55, 6)


STRAINS = [
    ("half-black-red", "Half Black Red", half_black_red),
    ("blue-grass", "Blue Grass", blue_grass),
    ("full-red", "Full Red", full_red),
    ("yellow-cobra", "Yellow Cobra", yellow_cobra),
]


def dorsal_curves():
    """The dorsal fin's base and edge, as body_fin traces them."""
    start_x, end_x, outline = DORSAL["start_x"], DORSAL["end_x"], DORSAL["outline"]
    points = rounded(
        [tuple(BODY.edge(start_x, True))] + [(x, 0.0, z) for x, z in outline] + [tuple(BODY.edge(end_x, True))]
    )
    return (lambda t: BODY.edge(start_x + (end_x - start_x) * t, True)), (lambda t: polyline_point(points, t))


def pectoral_color(u, v):
    """Pectoral fins are nearly clear in every strain."""
    streak = (0.5 + 0.5 * np.cos(u * 7 * 2 * np.pi)) ** 3
    out = paint.mix(paint.fill(u.shape, paint.srgb("#efe8e0")), paint.srgb("#ffffff"), streak * 0.4)
    alpha = 0.45 - 0.3 * paint.smoothstep(0.2, 1.0, v)
    return paint.with_alpha(out, alpha * (1 - 0.7 * paint.smoothstep(0.85, 1.0, v)))


def paint_strain(strain):
    body, caudal, dorsal, gonopodium = strain()
    return ATLAS.paint(
        {"body": body, "caudal": caudal, "dorsal": dorsal, "gonopodium": gonopodium, "pectoral": pectoral_color},
        paint.srgb("#000000", 0.0),
    )


# Geometry.


def caudal():
    return tail_fin(
        CAUDAL_ROOT,
        CAUDAL_BASE_HEIGHT,
        caudal_outline(),
        None,
        steps_u=200,
        steps_v=48,
        bulge=0.01,
        ruffle=0.012,
        uv=ATLAS.uv("caudal"),
    )


def dorsal():
    return body_fin(BODY, DORSAL["start_x"], DORSAL["end_x"], DORSAL["outline"], True, None, steps_u=120, uv=ATLAS.uv("dorsal"))


def gonopodium():
    """The male's anal fin: a short, pointed rod under the belly."""
    return body_fin(
        BODY,
        GONOPODIUM["start_x"],
        GONOPODIUM["end_x"],
        GONOPODIUM["outline"],
        False,
        None,
        steps_u=40,
        bulge=0.0,
        uv=ATLAS.uv("gonopodium"),
    )


def pectoral(side):
    return pectoral_fin(BODY, ROUNDNESS, side, pectoral_base, PECTORAL_EDGE, None, uv=ATLAS.uv("pectoral"))


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

    atlases = [(strain_id, name, paint_strain(strain)) for strain_id, name, strain in STRAINS]
    for strain_id, name, pixels in atlases:
        paint.save_webp(pixels, os.path.join(output, "colorings", f"{strain_id}.webp"))
        print(f"Coloring {name} written")
    own = paint.image("Guppy", atlases[0][2][::OWN_TEXTURE_STEP, ::OWN_TEXTURE_STEP])

    body = make_object(
        "Body", [BODY.mesh(None, roundness=ROUNDNESS, uv=ATLAS.uv("body"))], textured_material("Skin", own, 0.42, 0.1, False)
    )
    BODY.mouth_shape_key(body, reach=0.05, drop=0.02)
    left_pectoral = pectoral(1)
    fin_parts = [caudal(), dorsal(), gonopodium(), left_pectoral, pectoral(-1)]
    fins = make_object("Fins", fin_parts, textured_material("Fins", own, 0.5, 0.0, True))

    left = eyeball(eye_centre(1), EYE_RADIUS, 1, eye_color)
    right = eyeball(eye_centre(-1), EYE_RADIUS, -1, eye_color)
    eyes = make_object("Eyes", [left, right], material("Eyes", 0.05, 0.0, False))

    paint.print_manifest_values([body, fins, eyes], BODY, ROUNDNESS, left_pectoral, pectoral_base, GILL_EDGE_X, GILL_HALF_HEIGHT, -GILL_HALF_HEIGHT)
    rig([body, fins], eyes, len(left[0]), eye_centre(1), eye_centre(-1))
    export(output)
    print(f"Guppy written to {output}")


main()
