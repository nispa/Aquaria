"""Builds Aquaria's small and encrusting corals, the cover of a mature reef tank.

The coral scans are museum skeletons and look dead in a tank; living
corals are tissue: colour, polyps, a growing edge. Two kinds, one object
each, every colour morph a variant laid side by side so Aquaria picks one
per colony (docs/OBJECTS.md):

- zoanthids (Zoanthus, Palythoa): a colony of short polyps standing close
  together on a thin mat, each a little column topped by an oral disc with
  a scalloped rim of short tentacles. Their colours are the point: a disc
  with a mouth of one colour, a ring of another, a rim of a third;

- encrusting montipora (Montipora): a thin plate that spreads over the rock
  in lobes, its surface pitted with tiny polyps and its growing edge paler.
  The pits are a grey texture painted here (`texture`), which Aquaria
  multiplies by the points' colours.

Colours live in the points, so the `tint` trait can shift a colony a little
and make it glow under actinic light, as live corals do.

Run with Blender 5.2 in the background, from the repository root:

    blender --background --python scripts/blender/corals.py

then compress each model.glb with glTF Transform (meshopt, --join false
--flatten false, --texture-compress webp).
"""

import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from paintkit import fbm, image, smoothstep  # noqa: E402
from plantkit import VARIANT_SPACING, export, leaf_material, leaf_mesh, leaf_spot, linear, mix, plant_object  # noqa: E402

SEED = 20261026
OBJECTS = os.path.join("public", "assets", "objects")

# Zoanthids, m: a colony about 12 cm across.
ZOA_COLONY = 0.06
ZOA_POLYPS = 46
ZOA_RADIUS = (0.0045, 0.0065)
ZOA_HEIGHT = (0.008, 0.02)
ZOA_SIDES = 10
# Bumps around a disc's rim: its short tentacles.
ZOA_TENTACLES = 14
# Each morph: column, mat, then the disc from the mouth out to the rim.
ZOA_MORPHS = [
    {"column": "#5d5a2e", "mat": "#4a452c", "mouth": "#f2a33a", "disc": "#38b84a", "ring": "#f07a28", "rim": "#9be04a"},
    {"column": "#7a5a48", "mat": "#5a4438", "mouth": "#f5d0e0", "disc": "#e070a8", "ring": "#b04ac8", "rim": "#f0a0d0"},
    {"column": "#4a5040", "mat": "#3c4034", "mouth": "#ffe04a", "disc": "#2a8ad0", "ring": "#40e0c0", "rim": "#7ad0ff"},
]

# Encrusting montipora, m: a plate about 25 cm across, a few mm thick.
MONTI_RADIUS = 0.12
MONTI_THICKNESS = 0.006
MONTI_RINGS = 22
MONTI_SEGMENTS = 72
# Each morph: the plate and its paler growing edge.
MONTI_MORPHS = [
    {"plate": "#a65a34", "edge": "#d8a878"},
    {"plate": "#5e4064", "edge": "#a088ac"},
    {"plate": "#4c6640", "edge": "#9cb878"},
]
TEXTURE_SIZE = 512
# Polyps across the texture, which spans the whole plate.
POLYP_CELLS = 70


def zoa_polyp(mesh, colors, morph, x, y, radius, height, lean):
    """One polyp: a column, then a disc rising a little to its scalloped rim, the mouth sunk in the middle."""
    column, mouth, disc, ring, rim = (linear(morph[key]) for key in ("column", "mouth", "disc", "ring", "rim"))
    rings = []
    # The column, swelling a little under the disc.
    for level, share in enumerate((0.0, 0.6, 1.0)):
        loop = []
        for step in range(ZOA_SIDES):
            angle = 2 * math.pi * step / ZOA_SIDES
            r = radius * (0.85 + 0.15 * share)
            point = mesh.verts.new((x + lean[0] * share * height + r * math.cos(angle),
                                    y + lean[1] * share * height + r * math.sin(angle),
                                    height * share))
            colors[point] = mix(column, disc, 0.25 * share) if level < 2 else rim
            loop.append(point)
        rings.append(loop)
    top_x, top_y = x + lean[0] * height, y + lean[1] * height
    # The disc: from the rim in, scalloped at the edge, dipping to the mouth.
    for share, color in ((1.35, rim), (1.1, ring), (0.75, disc), (0.35, disc)):
        loop = []
        for step in range(ZOA_SIDES):
            angle = 2 * math.pi * step / ZOA_SIDES
            scallop = 1 + (0.12 * math.cos(angle * ZOA_TENTACLES / 2) if share > 1.3 else 0.0)
            r = radius * share * scallop
            dip = 0.15 * radius * (1 - min(share, 1.0))
            point = mesh.verts.new((top_x + r * math.cos(angle), top_y + r * math.sin(angle),
                                    height + 0.08 * radius * share - dip))
            colors[point] = color
            loop.append(point)
        rings.append(loop)
    centre = mesh.verts.new((top_x, top_y, height - 0.2 * radius))
    colors[centre] = mouth
    for lower, upper in zip(rings, rings[1:]):
        for step in range(ZOA_SIDES):
            following = (step + 1) % ZOA_SIDES
            mesh.faces.new((lower[step], lower[following], upper[following], upper[step]))
    last = rings[-1]
    for step in range(ZOA_SIDES):
        mesh.faces.new((last[step], last[(step + 1) % ZOA_SIDES], centre))


def zoa_mat(mesh, colors, morph, spots, rng):
    """The thin mat the polyps grow from, a little wider than the colony."""
    reach = max(math.hypot(x, y) for x, y in spots) + ZOA_RADIUS[1] * 1.5
    mat = linear(morph["mat"])
    sides = 24
    centre = mesh.verts.new((0, 0, 0.002))
    colors[centre] = mat
    loop = []
    for step in range(sides):
        angle = 2 * math.pi * step / sides
        r = reach * (0.9 + 0.2 * rng.random())
        point = mesh.verts.new((r * math.cos(angle), r * math.sin(angle), 0.0))
        colors[point] = mat
        loop.append(point)
    for step in range(sides):
        mesh.faces.new((loop[step], loop[(step + 1) % sides], centre))


def zoanthids(morph, offset, rng):
    mesh = bmesh.new()
    colors = {}
    spots = []
    # Polyps packed close, no two overlapping: tried at random, kept when there is room.
    while len(spots) < ZOA_POLYPS:
        angle, share = rng.uniform(0, 2 * math.pi), math.sqrt(rng.random())
        x, y = ZOA_COLONY * share * math.cos(angle), ZOA_COLONY * share * math.sin(angle)
        if all(math.hypot(x - a, y - b) > ZOA_RADIUS[1] * 2.1 for a, b in spots):
            spots.append((x, y))
        elif rng.random() < 0.002:
            break
    for x, y in spots:
        middle = 1 - math.hypot(x, y) / ZOA_COLONY
        radius = rng.uniform(*ZOA_RADIUS)
        # Taller in the middle of the colony, leaning out at its edge.
        height = ZOA_HEIGHT[0] + (ZOA_HEIGHT[1] - ZOA_HEIGHT[0]) * (0.4 + 0.6 * middle) * rng.uniform(0.8, 1.1)
        out = 0.35 * (1 - middle)
        reach = max(math.hypot(x, y), 1e-6)
        zoa_polyp(mesh, colors, morph, x, y, radius, height, (out * x / reach, out * y / reach))
    zoa_mat(mesh, colors, morph, spots, rng)
    bmesh.ops.translate(mesh, verts=mesh.verts, vec=(offset, 0, 0))
    return mesh, colors


def monti_outline(seed):
    """The plate's outline, as a share of its radius by angle: lobes of every size, none alike."""
    rng = random.Random(seed)
    waves = [(k, 0.16 / k**0.8 * rng.uniform(0.4, 1.0), rng.uniform(0, 2 * math.pi)) for k in range(2, 14)]
    return lambda angle: 0.7 + sum(size * math.cos(k * angle + phase) for k, size, phase in waves)


def montipora(morph, offset, seed):
    """The plate: a disc of rings rising to a low dome, its rim curling up; a thin edge band down to the rock."""
    mesh = leaf_mesh()
    colors = {}
    plate, edge = linear(morph["plate"]), linear(morph["edge"])
    outline = monti_outline(seed)
    rings = []
    for ring in range(1, MONTI_RINGS + 1):
        share = ring / MONTI_RINGS
        loop = []
        for step in range(MONTI_SEGMENTS):
            angle = 2 * math.pi * step / MONTI_SEGMENTS
            r = MONTI_RADIUS * share * outline(angle)
            ripple = 0.004 * math.sin(r * 90 + angle * 3 + seed) * share
            curl = 0.01 * share**6
            height = MONTI_THICKNESS + 0.012 * (1 - share**2) + ripple + curl
            point = mesh.verts.new((offset + r * math.cos(angle), r * math.sin(angle), height))
            colors[point] = mix(plate, edge, (share - 0.8) / 0.2)
            leaf_spot(mesh, point, 0.5 + r * math.cos(angle) / (2 * MONTI_RADIUS), 0.5 + r * math.sin(angle) / (2 * MONTI_RADIUS))
            loop.append(point)
        rings.append(loop)
    centre = mesh.verts.new((offset, 0, MONTI_THICKNESS + 0.012))
    colors[centre] = plate
    leaf_spot(mesh, centre, 0.5, 0.5)
    for step in range(MONTI_SEGMENTS):
        mesh.faces.new((centre, rings[0][step], rings[0][(step + 1) % MONTI_SEGMENTS]))
    for inner, outer in zip(rings, rings[1:]):
        for step in range(MONTI_SEGMENTS):
            following = (step + 1) % MONTI_SEGMENTS
            mesh.faces.new((inner[step], outer[step], outer[following], inner[following]))
    # The edge band, down to the rock, in the growing edge's colour.
    rim = rings[-1]
    foot = []
    for point in rim:
        lower = mesh.verts.new((point.co.x, point.co.y, 0.0))
        colors[lower] = edge
        leaf_spot(mesh, lower, 0.99, 0.5)
        foot.append(lower)
    for step in range(MONTI_SEGMENTS):
        following = (step + 1) % MONTI_SEGMENTS
        mesh.faces.new((rim[step], foot[step], foot[following], rim[following]))
    return mesh, colors


def montipora_texture():
    """Grey pits of tiny polyps, each with a pale rim, over a faint mottle: Aquaria multiplies it by the colours."""
    u = (np.arange(TEXTURE_SIZE, dtype=np.float32) + 0.5) / TEXTURE_SIZE
    uu, vv = np.meshgrid(u, u)
    gx, gy = uu * POLYP_CELLS, vv * POLYP_CELLS
    # A polyp in every cell of a grid shaken a little: its pit dark, its rim pale.
    jitter_x = fbm(gx * 0.3, gy * 0.3, 3) - 0.5
    jitter_y = fbm(gx * 0.3, gy * 0.3, 7) - 0.5
    fx = (gx + 0.4 * jitter_x) % 1.0 - 0.5
    fy = (gy + 0.4 * jitter_y) % 1.0 - 0.5
    distance = np.hypot(fx, fy)
    pit = 1 - smoothstep(0.12, 0.22, distance)
    rim = smoothstep(0.18, 0.26, distance) * (1 - smoothstep(0.3, 0.42, distance))
    mottle = fbm(uu * 6, vv * 6, 11)
    value = 0.8 + 0.16 * mottle + 0.14 * rim - 0.5 * pit
    pixels = np.ones((TEXTURE_SIZE, TEXTURE_SIZE, 4), dtype=np.float32)
    pixels[..., 0] = pixels[..., 1] = pixels[..., 2] = np.clip(value, 0.0, 1.0)
    return pixels


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build_zoanthids():
    clear_scene()
    rng = random.Random(SEED)
    material = leaf_material("zoanthids", 0.45)
    for index, morph in enumerate(ZOA_MORPHS):
        mesh, colors = zoanthids(morph, index * VARIANT_SPACING * 0.1, rng)
        plant_object(f"zoanthids-{index}", mesh, colors, {point: 0.0 for point in mesh.verts}, material)
        mesh.free()
    export(os.path.join(OBJECTS, "zoanthids", "model.glb"))


def build_montipora():
    clear_scene()
    material = leaf_material("montipora", 0.55, image("montipora-polyps", montipora_texture()))
    for index, morph in enumerate(MONTI_MORPHS):
        mesh, colors = montipora(morph, index * VARIANT_SPACING * 0.2, index * 1.7 + 0.5)
        plant_object(f"montipora-{index}", mesh, colors, {point: 0.0 for point in mesh.verts}, material)
        mesh.free()
    export(os.path.join(OBJECTS, "encrusting-montipora", "model.glb"))


build_zoanthids()
build_montipora()
