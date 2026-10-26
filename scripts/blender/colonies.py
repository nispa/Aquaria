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

- a torch coral (Euphyllia glabrescens): a few short stalks of skeleton,
  each crowned by long tentacles with round tips that sway one by one, as
  the anemones' do (`_STRAND`, one value per tentacle), so it is a plant
  to Aquaria: it has a height and sways.

Run with Blender 5.2 in the background, from the repository root:

    blender --background --python scripts/blender/colonies.py

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

# Acropora, m: a colony about 30 cm across.
ACRO_TRUNKS = 6
ACRO_LENGTH = 0.09
ACRO_RADIUS = 0.011
ACRO_FORKS = 3
ACRO_SIDES = 7
ACRO_SEGMENTS = 5
# Branches lean from the vertical this much at the base, radians, and fork this far apart.
ACRO_LEAN = (0.6, 1.05)
ACRO_FORK = (0.45, 0.75)
# How far from a tip the tip colour reaches, m.
ACRO_TIP = 0.03
# Corallites along a branch per metre of its length, and around it.
CUPS_ALONG = 120
CUPS_AROUND = 8
# Each morph: base, body and tip.
ACRO_MORPHS = [
    {"base": "#5a4a6a", "body": "#7a62a8", "tip": "#5ac0f0"},
    {"base": "#4a5a3a", "body": "#6f9a58", "tip": "#d48ae8"},
    {"base": "#7a5a48", "body": "#c49a7a", "tip": "#f4a0c0"},
]

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


def acro_branch(mesh, colors, morph, rng, start, direction, length, radius, depth, travelled):
    """One branch, bending a little upwards as it grows, forking until its last fork ends in a tip."""
    base, body, tip = (linear(morph[key]) for key in ("base", "body", "tip"))
    terminal = depth == ACRO_FORKS
    rings = []
    point = start.copy()
    heading = direction.normalized()
    for segment in range(ACRO_SEGMENTS + 1):
        share = segment / ACRO_SEGMENTS
        r = radius * (1 - 0.3 * share) * (1 - (0.75 * share**3 if terminal else 0.0))
        ring = ring_around(mesh, point, heading, r, ACRO_SIDES)
        along = travelled + length * share
        to_tip = length * (1 - share) if terminal else ACRO_TIP * 10
        color = mix(base, body, min(along / 0.06, 1.0))
        color = mix(color, tip, 1 - to_tip / ACRO_TIP)
        for step, vertex in enumerate(ring):
            colors[vertex] = color
            leaf_spot(mesh, vertex, step / ACRO_SIDES, along * CUPS_ALONG / CUPS_AROUND / 4)
        rings.append(ring)
        if segment < ACRO_SEGMENTS:
            # Branches turn towards the light as they grow, and wander a little.
            heading = (heading + Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), 0.1))).normalized()
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
        fork = rng.uniform(*ACRO_FORK)
        side = heading.cross(Vector((math.cos(angle), math.sin(angle), 0.0)))
        if side.length < 1e-3:
            side = Vector((1, 0, 0))
        turned = (heading * math.cos(fork) + side.normalized().cross(heading) * math.sin(fork)).normalized()
        # Every branch ends above its base: none grows down into the rock.
        turned.z = max(turned.z, 0.25)
        acro_branch(mesh, colors, morph, rng, point - heading * radius * 0.5, turned,
                    length * rng.uniform(0.7, 0.85), radius * 0.72, depth + 1, travelled + length)


def acropora(morph, offset, rng):
    mesh = leaf_mesh()
    colors = {}
    spin = rng.uniform(0, 2 * math.pi)
    for trunk in range(ACRO_TRUNKS):
        angle = spin + 2 * math.pi * trunk / ACRO_TRUNKS + rng.uniform(-0.3, 0.3)
        lean = rng.uniform(*ACRO_LEAN)
        direction = Vector((math.sin(lean) * math.cos(angle), math.sin(lean) * math.sin(angle), math.cos(lean)))
        start = Vector((0.012 * math.cos(angle), 0.012 * math.sin(angle), -0.004))
        acro_branch(mesh, colors, morph, rng, start, direction, ACRO_LENGTH * rng.uniform(0.85, 1.15),
                    ACRO_RADIUS, 0, 0.0)
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


def build_acropora():
    rng = random.Random(SEED)
    material = leaf_material("acropora", 0.5, image("acropora-corallites", corallite_texture()))
    for index, morph in enumerate(ACRO_MORPHS):
        mesh, colors = acropora(morph, index * VARIANT_SPACING * 0.2, rng)
        plant_object(f"acropora-{index}", mesh, colors, {point: 0.0 for point in mesh.verts}, material)
        mesh.free()


def build_brain():
    material = leaf_material("platygyra", 0.45)
    for index, morph in enumerate(BRAIN_MORPHS):
        mesh, colors = brain(morph, index * VARIANT_SPACING * 0.2, index * 1.3 + 0.4)
        plant_object(f"platygyra-{index}", mesh, colors, {point: 0.0 for point in mesh.verts}, material)
        mesh.free()


def build_torch():
    rng = random.Random(SEED)
    material = leaf_material("torch-coral", 0.35)
    for index, morph in enumerate(TORCH_MORPHS):
        mesh, colors, sway, strands = torch(morph, index * VARIANT_SPACING * 0.2, rng)
        plant_object(f"torch-coral-{index}", mesh, colors, sway, material, extra={"_STRAND": strands})
        mesh.free()


build("acropora", build_acropora)
build("platygyra", build_brain)
build("torch-coral", build_torch)
