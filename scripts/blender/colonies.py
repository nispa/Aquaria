"""Builds Aquaria's coral colonies, the living corals that replace the scans.

The scans are bleached museum skeletons; a living colony is tissue over the
skeleton, with colour running from base to tip and polyps all over. Three
kinds, one object each, every colour morph a variant laid side by side so
Aquaria picks one per colony (docs/OBJECTS.md):

- acropora (Acropora), the staghorn and bush corals of a reef tank: a few
  thick branches from the base, forking two or three times, each one
  carrying its colour to a paler or brighter tip. Its corallites, the
  little cups the polyps sit in, are a grey texture painted here and
  multiplied by the colours;

- a brain coral (Platygyra): a low dome whose surface folds into
  meandering ridges and valleys, the valleys one colour, the ridges another;

- a tube sponge: a few tubes rising from the rock, each open at the top
  with a darker inside, their skin dotted with pores;

- a torch coral (Euphyllia glabrescens): a few short stalks of skeleton,
  each crowned by long tentacles with round tips that sway one by one, as
  the anemones' do (`_STRAND`, one value per tentacle), so it is a plant
  to Aquaria: it has a height and sways.

Run with Blender 5.2 in the background, from the repository root:

    blender --background --python scripts/blender/colonies.py [-- acropora ...]

then compress each model.glb with glTF Transform 4.5.1 (meshopt, --join
false --flatten false, --texture-compress webp).
"""

import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(__file__))
from paintkit import fbm, image, smoothstep  # noqa: E402
from plantkit import VARIANT_SPACING, export, leaf_material, leaf_mesh, leaf_spot, linear, mix, plant_object  # noqa: E402

SEED = 20261026
OBJECTS = os.path.join("public", "assets", "objects")

ACRO_SIDES = 7
ACRO_SEGMENTS = 5
# Corallites along a branch per metre of its length, and around it.
CUPS_ALONG = 120
CUPS_AROUND = 8
# Branching corals, m. Each: trunks from the base (starting `stalk` m up,
# leaning from the vertical by `lean` radians), their length and radius,
# how often they fork and how far apart (`fork`, radians), how much they
# turn up as they grow (`rise`; the last forks by `tip_rise` when it is
# set), how far the tip colour reaches (`tip`),
# how much the last forks narrow to a point (`taper`, 0 blunt), and the
# morphs: base, body and tip.
BRANCHING = {
    # Staghorn and bush acropora: a colony about 30 cm across.
    "acropora": {
        "trunks": 6, "stalk": 0.0, "lean": (0.6, 1.05), "length": 0.09, "radius": 0.011,
        "forks": 3, "fork": (0.45, 0.75), "rise": 0.1, "tip": 0.03,
        "morphs": [
            {"base": "#5a4a6a", "body": "#7a62a8", "tip": "#5ac0f0"},
            {"base": "#4a5a3a", "body": "#6f9a58", "tip": "#d48ae8"},
            {"base": "#7a5a48", "body": "#c49a7a", "tip": "#f4a0c0"},
        ],
    },
    # Cauliflower coral (Pocillopora): a compact, rounded bush of short, stubby branches.
    "pocillopora": {
        "trunks": 9, "stalk": 0.0, "lean": (0.15, 1.0), "length": 0.035, "radius": 0.008,
        "forks": 3, "fork": (0.35, 0.6), "rise": 0.15, "tip": 0.012,
        "morphs": [
            {"base": "#8a5a6a", "body": "#d880a0", "tip": "#f8c0d8"},
            {"base": "#5a6a48", "body": "#9ab878", "tip": "#e0f0a0"},
            {"base": "#8a7058", "body": "#d8b090", "tip": "#f8e0c0"},
        ],
    },
    # Finger coral (Montipora digitata): short, thick, blunt fingers rising from the base.
    "finger-montipora": {
        "trunks": 7, "stalk": 0.0, "lean": (0.1, 0.6), "length": 0.06, "radius": 0.012,
        "forks": 2, "fork": (0.3, 0.5), "rise": 0.25, "tip": 0.015, "taper": 0.15,
        "morphs": [
            {"base": "#6a4a3a", "body": "#c87a4a", "tip": "#f0b080"},
            {"base": "#4a5a48", "body": "#7aa088", "tip": "#c0e8c0"},
            {"base": "#5a4a5a", "body": "#a080a8", "tip": "#e0c0e8"},
        ],
    },
    # Table acropora: a short stalk, then branches spreading flat all round, their tips turned up.
    "table-acropora": {
        "trunks": 26, "stalk": 0.05, "lean": (1.38, 1.5), "length": 0.055, "radius": 0.0085,
        "forks": 3, "fork": (0.2, 0.4), "rise": 0.0, "tip_rise": 0.9, "tip": 0.012,
        "morphs": [
            {"base": "#6a6a58", "body": "#9ab4a0", "tip": "#d0f0c8"},
            {"base": "#5a5068", "body": "#9a8ab8", "tip": "#c8e0ff"},
            {"base": "#6a5a48", "body": "#b8a080", "tip": "#e8d0a0"},
        ],
    },
}

# Brain coral, m: a dome about 22 cm across and 9 cm high.
BRAIN_RADIUS = 0.11
BRAIN_HEIGHT = 0.09
BRAIN_RINGS = 48
BRAIN_SEGMENTS = 120
# How tightly the ridges meander, and how deep the valleys are, m.
BRAIN_FOLDS = 15.0
BRAIN_DEPTH = 0.007
# Each morph: valley, ridge.
BRAIN_MORPHS = [
    {"valley": "#3f8a5a", "ridge": "#b8a86a"},
    {"valley": "#7a4a2e", "ridge": "#c8c27a"},
    {"valley": "#5a5a8a", "ridge": "#d0a0a8"},
]

# Torch coral, m: about 15 cm high.
TORCH_STALKS = 5
TORCH_STALK = (0.03, 0.05)
TORCH_CROWN = 0.022
TORCH_TENTACLES = 26
TORCH_LENGTH = (0.06, 0.09)
TORCH_THICKNESS = 0.0032
TORCH_SIDES = 6
TORCH_SEGMENTS = 10
# Each morph: stalk, tentacle, tip.
TORCH_MORPHS = [
    {"stalk": "#6a5a48", "tentacle": "#8a9a5a", "tip": "#e8f070"},
    {"stalk": "#6a5040", "tentacle": "#b8945a", "tip": "#9af07a"},
    {"stalk": "#5a4a52", "tentacle": "#9a7aa8", "tip": "#80f0ff"},
]
TEXTURE_SIZE = 512

# Tube sponge, m: tubes up to 14 cm tall from a base 8 cm across.
SPONGE_TUBES = (3, 6)
SPONGE_HEIGHT = (0.07, 0.14)
SPONGE_RADIUS = (0.012, 0.02)
SPONGE_SIDES = 14
SPONGE_RINGS = 10
# How thick a tube's wall is, as a share of its radius.
SPONGE_WALL = 0.25
# Each morph: skin, and the darker inside of the tubes.
SPONGE_MORPHS = [
    {"skin": "#7a4a9a", "inside": "#3a2050"},
    {"skin": "#d8a838", "inside": "#7a5018"},
    {"skin": "#d86a3a", "inside": "#6a2a18"},
]


def ring_around(mesh, centre, axis, radius, sides):
    """Points in a circle of `radius` round `axis` at `centre`, and their angles."""
    helper = Vector((1, 0, 0)) if abs(axis.x) < 0.9 else Vector((0, 1, 0))
    side = axis.cross(helper).normalized()
    other = axis.cross(side).normalized()
    points = []
    for step in range(sides):
        angle = 2 * math.pi * step / sides
        points.append(mesh.verts.new(centre + (side * math.cos(angle) + other * math.sin(angle)) * radius))
    return points


def join_rings(mesh, lower, upper):
    sides = len(lower)
    for step in range(sides):
        following = (step + 1) % sides
        mesh.faces.new((lower[step], lower[following], upper[following], upper[step]))


def cap(mesh, ring, tip):
    for step in range(len(ring)):
        mesh.faces.new((ring[step], ring[(step + 1) % len(ring)], tip))


# Acropora


def acro_branch(mesh, colors, kind, morph, rng, start, direction, length, radius, depth, travelled):
    """One branch, bending a little upwards as it grows, forking until its last fork ends in a tip."""
    base, body, tip = (linear(morph[key]) for key in ("base", "body", "tip"))
    terminal = depth == kind["forks"]
    rise = kind.get("tip_rise", kind["rise"]) if terminal else kind["rise"]
    rings = []
    point = start.copy()
    heading = direction.normalized()
    for segment in range(ACRO_SEGMENTS + 1):
        share = segment / ACRO_SEGMENTS
        r = radius * (1 - 0.3 * share) * (1 - (kind.get("taper", 0.75) * share**3 if terminal else 0.0))
        ring = ring_around(mesh, point, heading, r, ACRO_SIDES)
        along = travelled + length * share
        to_tip = length * (1 - share) if terminal else kind["tip"] * 10
        color = mix(base, body, min(along / 0.06, 1.0))
        color = mix(color, tip, 1 - to_tip / kind["tip"])
        for step, vertex in enumerate(ring):
            colors[vertex] = color
            leaf_spot(mesh, vertex, step / ACRO_SIDES, along * CUPS_ALONG / CUPS_AROUND / 4)
        rings.append(ring)
        if segment < ACRO_SEGMENTS:
            # Branches turn towards the light as they grow, and wander a little.
            heading = (heading + Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), rise))).normalized()
            point = point + heading * (length / ACRO_SEGMENTS)
    for lower, upper in zip(rings, rings[1:]):
        join_rings(mesh, lower, upper)
    if terminal:
        end = mesh.verts.new(point + heading * radius * 0.4)
        colors[end] = tip
        leaf_spot(mesh, end, 0.5, (travelled + length) * CUPS_ALONG / CUPS_AROUND / 4)
        cap(mesh, rings[-1], end)
        return
    end = mesh.verts.new(point)
    colors[end] = colors[rings[-1][0]]
    leaf_spot(mesh, end, 0.5, (travelled + length) * CUPS_ALONG / CUPS_AROUND / 4)
    cap(mesh, rings[-1], end)
    children = 2 if rng.random() < 0.7 else 3
    spin = rng.uniform(0, 2 * math.pi)
    for child in range(children):
        angle = spin + 2 * math.pi * child / children
        fork = rng.uniform(*kind["fork"])
        side = heading.cross(Vector((math.cos(angle), math.sin(angle), 0.0)))
        if side.length < 1e-3:
            side = Vector((1, 0, 0))
        turned = (heading * math.cos(fork) + side.normalized().cross(heading) * math.sin(fork)).normalized()
        # Every branch ends above its base: none grows down into the rock.
        turned.z = max(turned.z, 0.25)
        acro_branch(mesh, colors, kind, morph, rng, point - heading * radius * 0.5, turned,
                    length * rng.uniform(0.7, 0.85), radius * 0.72, depth + 1, travelled + length)


def branching(kind, morph, offset, rng):
    """A branching colony: trunks from the base (or from the top of a stalk), each forking to its tips."""
    mesh = leaf_mesh()
    colors = {}
    stalk = kind["stalk"]
    if stalk > 0:
        base = linear(morph["base"])
        lower = ring_around(mesh, Vector((0, 0, -0.004)), Vector((0, 0, 1)), kind["radius"] * 1.6, ACRO_SIDES)
        upper = ring_around(mesh, Vector((0, 0, stalk)), Vector((0, 0, 1)), kind["radius"] * 1.3, ACRO_SIDES)
        for step, vertex in enumerate(lower + upper):
            colors[vertex] = base
            leaf_spot(mesh, vertex, (step % ACRO_SIDES) / ACRO_SIDES, 0.0 if step < ACRO_SIDES else 0.5)
        join_rings(mesh, lower, upper)
    spin = rng.uniform(0, 2 * math.pi)
    trunks = kind["trunks"]
    for trunk in range(trunks):
        angle = spin + 2 * math.pi * (trunk + rng.uniform(-0.3, 0.3)) / trunks
        lean = rng.uniform(*kind["lean"])
        direction = Vector((math.sin(lean) * math.cos(angle), math.sin(lean) * math.sin(angle), math.cos(lean)))
        start = Vector((0.012 * math.cos(angle), 0.012 * math.sin(angle), stalk - 0.004))
        acro_branch(mesh, colors, kind, morph, rng, start, direction, kind["length"] * rng.uniform(0.85, 1.15),
                    kind["radius"], 0, 0.0)
    bmesh.ops.translate(mesh, verts=mesh.verts, vec=(offset, 0, 0))
    return mesh, colors


def corallite_texture():
    """Grey cups in staggered rows: a pale rim round a dark mouth, on a faintly mottled skin."""
    u = (np.arange(TEXTURE_SIZE, dtype=np.float32) + 0.5) / TEXTURE_SIZE
    uu, vv = np.meshgrid(u, u)
    gx, gy = uu * CUPS_AROUND, vv * CUPS_AROUND
    row = np.floor(gy)
    fx = (gx + 0.5 * (row % 2)) % 1.0 - 0.5
    fy = gy % 1.0 - 0.5
    distance = np.hypot(fx, fy * 1.3)
    mouth = 1 - smoothstep(0.08, 0.16, distance)
    rim = smoothstep(0.14, 0.2, distance) * (1 - smoothstep(0.26, 0.36, distance))
    mottle = fbm(uu * 5, vv * 5, 23)
    value = 0.78 + 0.14 * mottle + 0.2 * rim - 0.45 * mouth
    pixels = np.ones((TEXTURE_SIZE, TEXTURE_SIZE, 4), dtype=np.float32)
    pixels[..., 0] = pixels[..., 1] = pixels[..., 2] = np.clip(value, 0.0, 1.0)
    return pixels


# Brain coral


def brain(morph, offset, seed):
    """A dome folded into meanders: the ridges stand out from it, the valleys sink in."""
    mesh = bmesh.new()
    colors = {}
    valley, ridge = linear(morph["valley"]), linear(morph["ridge"])
    shift = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    rings = []
    for ring in range(1, BRAIN_RINGS + 1):
        share = ring / BRAIN_RINGS
        polar = share * math.pi / 2 * 1.08
        loop = []
        for step in range(BRAIN_SEGMENTS):
            angle = 2 * math.pi * step / BRAIN_SEGMENTS
            outward = Vector((math.sin(polar) * math.cos(angle), math.sin(polar) * math.sin(angle), math.cos(polar)))
            # Meanders: where a warped noise crosses whole numbers, a valley.
            place = outward * 2.2 + shift
            warped = noise.noise(place) + 0.5 * noise.noise(place * 2.3 + Vector((5, 1, 3)))
            fold = abs(math.sin(BRAIN_FOLDS * warped * 0.5 * math.pi / 2))
            height = BRAIN_DEPTH * (fold - 0.5) * (1 - 0.8 * share**8)
            surface = Vector((outward.x * BRAIN_RADIUS, outward.y * BRAIN_RADIUS,
                              max(outward.z, -0.05) * BRAIN_HEIGHT))
            point = mesh.verts.new(surface + outward * height)
            colors[point] = mix(valley, ridge, smoothstep_scalar(0.25, 0.75, fold))
            loop.append(point)
        rings.append(loop)
    top = mesh.verts.new((0, 0, BRAIN_HEIGHT))
    colors[top] = mix(valley, ridge, 0.5)
    cap(mesh, list(reversed(rings[0])), top)
    for upper, lower in zip(rings, rings[1:]):
        join_rings(mesh, lower, upper)
    bmesh.ops.translate(mesh, verts=mesh.verts, vec=(offset, 0, 0))
    return mesh, colors


def smoothstep_scalar(edge0, edge1, x):
    t = min(max((x - edge0) / (edge1 - edge0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


# Tube sponge


def sponge_tube(mesh, colors, morph, rng, foot, axis, height, radius):
    """A tube: its wall bulging a little as it rises, open at the top, its inside darker."""
    skin, inside = linear(morph["skin"]), linear(morph["inside"])
    outer, inner = [], []
    for ring in range(SPONGE_RINGS + 1):
        share = ring / SPONGE_RINGS
        centre = foot + axis * (height * share)
        r = radius * (1 + 0.15 * math.sin(share * math.pi * rng.uniform(1.5, 2.5)) + 0.1 * share)
        ring_points = ring_around(mesh, centre, axis, r, SPONGE_SIDES)
        for vertex in ring_points:
            # Pores: darker specks scattered over the skin.
            speck = noise.noise(vertex.co * 900) > 0.45
            colors[vertex] = mix(skin, inside, 0.45 if speck else 0.0)
        outer.append(ring_points)
    # The inside wall, from the lip down a third of the tube.
    for ring in range(SPONGE_RINGS, int(SPONGE_RINGS * 0.6), -1):
        share = ring / SPONGE_RINGS
        centre = foot + axis * (height * share)
        r = radius * (1 - SPONGE_WALL) * (1 + 0.1 * share)
        ring_points = ring_around(mesh, centre, axis, r, SPONGE_SIDES)
        for vertex in ring_points:
            colors[vertex] = mix(inside, skin, 0.3 * (share - 0.6) / 0.4)
        inner.append(ring_points)
    for lower, upper in zip(outer, outer[1:]):
        join_rings(mesh, lower, upper)
    # The lip joins the outside to the inside; the inside goes down to a dark floor.
    join_rings(mesh, outer[-1], inner[0])
    for upper, lower in zip(inner, inner[1:]):
        join_rings(mesh, upper, lower)
    bottom = mesh.verts.new(foot + axis * (height * 0.6))
    colors[bottom] = inside
    cap(mesh, inner[-1], bottom)


def sponge(morph, offset, rng):
    mesh = bmesh.new()
    colors = {}
    tubes = rng.randint(*SPONGE_TUBES)
    spin = rng.uniform(0, 2 * math.pi)
    for tube in range(tubes):
        angle = spin + 2 * math.pi * tube / tubes
        reach = 0.0 if tube == 0 else rng.uniform(0.015, 0.03)
        lean = 0.0 if tube == 0 else rng.uniform(0.1, 0.35)
        foot = Vector((reach * math.cos(angle), reach * math.sin(angle), -0.004))
        axis = Vector((math.sin(lean) * math.cos(angle), math.sin(lean) * math.sin(angle), math.cos(lean)))
        sponge_tube(mesh, colors, morph, rng, foot, axis, rng.uniform(*SPONGE_HEIGHT), rng.uniform(*SPONGE_RADIUS))
    bmesh.ops.translate(mesh, verts=mesh.verts, vec=(offset, 0, 0))
    return mesh, colors


# Torch coral


def torch_tentacle(mesh, colors, sway, strands, strand, morph, root, direction, length):
    """One tentacle: rising from the crown, bending out, ending in a round tip of another colour."""
    tentacle, tip = linear(morph["tentacle"]), linear(morph["tip"])
    rings = []
    point = root.copy()
    heading = direction.normalized()
    for segment in range(TORCH_SEGMENTS + 1):
        share = segment / TORCH_SEGMENTS
        r = TORCH_THICKNESS * (1 - 0.35 * share)
        if share > 0.85:
            r = TORCH_THICKNESS * 1.4 * math.sqrt(max(1 - ((share - 0.85) / 0.15 - 0.4) ** 2, 0.05))
        ring = ring_around(mesh, point, heading, r, TORCH_SIDES)
        for vertex in ring:
            colors[vertex] = mix(tentacle, tip, (share - 0.8) / 0.12)
            sway[vertex] = share**1.5
            strands[vertex] = strand
        rings.append(ring)
        # Out and over, as tentacles droop under their own weight.
        heading = (heading + Vector((direction.x, direction.y, -0.35)) * 0.12).normalized()
        point = point + heading * (length / TORCH_SEGMENTS)
    for lower, upper in zip(rings, rings[1:]):
        join_rings(mesh, lower, upper)
    end = mesh.verts.new(point)
    colors[end], sway[end], strands[end] = tip, 1.0, strand
    cap(mesh, rings[-1], end)


def torch(morph, offset, rng):
    mesh = bmesh.new()
    colors, sway, strands = {}, {}, {}
    stalk_color = linear(morph["stalk"])
    count = 0
    for stalk in range(TORCH_STALKS):
        angle = 2 * math.pi * stalk / TORCH_STALKS + rng.uniform(-0.4, 0.4)
        reach = 0.0 if stalk == 0 else rng.uniform(0.02, 0.04)
        lean = rng.uniform(0.1, 0.4) if stalk else 0.0
        height = rng.uniform(*TORCH_STALK)
        foot = Vector((reach * math.cos(angle), reach * math.sin(angle), 0.0))
        axis = Vector((math.sin(lean) * math.cos(angle), math.sin(lean) * math.sin(angle), math.cos(lean)))
        lower = ring_around(mesh, foot, axis, 0.009, TORCH_SIDES)
        crown = foot + axis * height
        upper = ring_around(mesh, crown, axis, 0.011, TORCH_SIDES)
        for vertex in lower + upper:
            colors[vertex], sway[vertex], strands[vertex] = stalk_color, 0.0, 0.0
        join_rings(mesh, lower, upper)
        for index in range(TORCH_TENTACLES):
            share = (index + 0.5) / TORCH_TENTACLES
            spread = index * 2.39996
            distance = TORCH_CROWN * math.sqrt(share)
            out = Vector((math.cos(spread), math.sin(spread), 0.0))
            root = crown + out * distance
            direction = (axis * (1.2 - share) + out * (0.4 + share)).normalized()
            strand = (count * 0.6180339887) % 1.0
            count += 1
            torch_tentacle(mesh, colors, sway, strands, strand, morph, root, direction, rng.uniform(*TORCH_LENGTH))
    bmesh.ops.translate(mesh, verts=mesh.verts, vec=(offset, 0, 0))
    return mesh, colors, sway, strands


def build(name, builder):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    builder()
    export(os.path.join(OBJECTS, name, "model.glb"))
    print("COLONY written", name)


def build_branching(name):
    def builder():
        rng = random.Random(SEED)
        kind = BRANCHING[name]
        material = leaf_material(name, 0.5, image(f"{name}-corallites", corallite_texture()))
        for index, morph in enumerate(kind["morphs"]):
            mesh, colors = branching(kind, morph, index * VARIANT_SPACING * 0.2, rng)
            plant_object(f"{name}-{index}", mesh, colors, {point: 0.0 for point in mesh.verts}, material)
            mesh.free()

    return builder


def build_brain():
    material = leaf_material("platygyra", 0.45)
    for index, morph in enumerate(BRAIN_MORPHS):
        mesh, colors = brain(morph, index * VARIANT_SPACING * 0.2, index * 1.3 + 0.4)
        plant_object(f"platygyra-{index}", mesh, colors, {point: 0.0 for point in mesh.verts}, material)
        mesh.free()


def build_sponge():
    rng = random.Random(SEED)
    material = leaf_material("tube-sponge", 0.7)
    for index, morph in enumerate(SPONGE_MORPHS):
        mesh, colors = sponge(morph, index * VARIANT_SPACING * 0.2, rng)
        plant_object(f"tube-sponge-{index}", mesh, colors, {point: 0.0 for point in mesh.verts}, material)
        mesh.free()


def build_torch():
    rng = random.Random(SEED)
    material = leaf_material("torch-coral", 0.35)
    for index, morph in enumerate(TORCH_MORPHS):
        mesh, colors, sway, strands = torch(morph, index * VARIANT_SPACING * 0.2, rng)
        plant_object(f"torch-coral-{index}", mesh, colors, sway, material, extra={"_STRAND": strands})
        mesh.free()


# Only the colonies named after `--`, or all of them.
ONLY = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
for name in BRANCHING:
    if not ONLY or name in ONLY:
        build(name, build_branching(name))
if not ONLY or "platygyra" in ONLY:
    build("platygyra", build_brain)
if not ONLY or "tube-sponge" in ONLY:
    build("tube-sponge", build_sponge)
if not ONLY or "torch-coral" in ONLY:
    build("torch-coral", build_torch)
