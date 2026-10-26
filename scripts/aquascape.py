"""Builds the live rock of the home reef tanks out of blocks.

A reef tank's rock is an aquascape: a few islands of stacked live rock
with arches to swim through, ledges that stick out over the sand, caves
underneath, and open sand between them. The scenes' rock is blocks, like
the scene editor's (scene/blocks); this script carves each scene's layout
into its `blocks`, keeping its colour, growth and pores, so the layout can
be changed here and regenerated instead of drawn by hand:

    python scripts/aquascape.py public/scenes/home-reef.json
    pnpm exec prettier --write public/scenes/home-reef.json

Coordinates are m: x across (0 in the middle), y up from the floor, z from
the glass (0) to the back (-depth).
"""

import json
import math
import os
import sys

# A smooth, repeatable wobble in about -1.8..1.8 from three sines.
def noise(a, b, c):
    value = 0.0
    for octave, frequency in enumerate((1.0, 2.3, 5.1)):
        value += (
            math.sin(a * frequency * 1.7 + octave * 1.3 + b * frequency * 2.1)
            * math.cos(b * frequency * 1.3 - c * frequency * 1.9 + octave)
            / (octave + 1)
        )
    return value


def lumpy(x, y, z, seed, scale):
    """Rock is never smooth: a share by which a shape's edge moves in or out."""
    return 0.22 * noise(x * scale, y * scale, z * scale + seed) + 0.08 * noise(
        x * scale * 3, z * scale * 3, y * scale * 3 + seed
    )


def mound(shape, x, y, z):
    """A heap of stacked rock: wide at the foot, rounded on top."""
    dx, dz = (x - shape["x"]) / shape["across"], (z - shape["z"]) / shape["along"]
    reach = 1 + lumpy(x, y, z, shape["seed"], 6)
    top = shape["height"] * (1 + 0.25 * noise(x * 5, z * 5, shape["seed"]))
    return y < top and dx * dx + dz * dz + (y / top) ** 2 < reach * reach


def arch(shape, x, y, z):
    """A bridge of rock from one foot to the other, high enough to swim under."""
    (x0, z0), (x1, z1) = shape["from"], shape["to"]
    span = math.hypot(x1 - x0, z1 - z0)
    along = ((x - x0) * (x1 - x0) + (z - z0) * (z1 - z0)) / (span * span)
    if not 0 <= along <= 1:
        return False
    side = abs((x - x0) * (z1 - z0) - (z - z0) * (x1 - x0)) / span
    crest = shape["height"] * math.sin(math.pi * along)
    thick = shape["thickness"] * (1 + lumpy(x, y, z, shape["seed"], 7))
    # The bridge is a band around its curve, wider at its feet.
    feet = 1 + 1.5 * (1 - math.sin(math.pi * along)) ** 4
    return abs(y - crest) < thick * feet and side < shape["width"] * (1 + 0.5 * (feet - 1))


def ledge(shape, x, y, z):
    """A flat slab sticking out, its top where corals sit and fish shelter below."""
    dx, dz = (x - shape["x"]) / shape["across"], (z - shape["z"]) / shape["along"]
    reach = 1 + lumpy(x, y, z, shape["seed"], 5)
    low = shape["y"] + 0.02 * noise(x * 9, z * 9, shape["seed"])
    return low < y < low + shape["thickness"] and dx * dx + dz * dz < reach * reach


def cave(shape, x, y, z):
    """A hollow carved out of the rock, open towards the glass."""
    dx = (x - shape["x"]) / shape["across"]
    dy = (y - shape["y"]) / shape["up"]
    dz = (z - shape["z"]) / shape["along"]
    return dx * dx + dy * dy + dz * dz < (1 + 0.5 * lumpy(x, y, z, shape["seed"], 8)) ** 2


SOLID = {"mound": mound, "arch": arch, "ledge": ledge}

# Each scene's layout: solid shapes, then caves carved out of them.
LAYOUTS = {
    "home-reef": {
        "size": 0.05,
        "shapes": [
            # The left island, the larger one, with a cave at its foot.
            {"kind": "mound", "x": -0.62, "z": -0.6, "across": 0.48, "along": 0.3, "height": 0.52, "seed": 1.0},
            {"kind": "mound", "x": -0.3, "z": -0.72, "across": 0.3, "along": 0.22, "height": 0.66, "seed": 2.0},
            {"kind": "mound", "x": -0.95, "z": -0.45, "across": 0.24, "along": 0.2, "height": 0.3, "seed": 3.0},
            # An arch from the left island over open sand, to swim through.
            {"kind": "arch", "from": (-0.15, -0.62), "to": (0.32, -0.7), "height": 0.42,
             "thickness": 0.07, "width": 0.11, "seed": 4.0},
            # The right island, lower, with a ledge out over the sand.
            {"kind": "mound", "x": 0.62, "z": -0.66, "across": 0.36, "along": 0.26, "height": 0.42, "seed": 5.0},
            {"kind": "mound", "x": 0.86, "z": -0.5, "across": 0.2, "along": 0.18, "height": 0.24, "seed": 6.0},
            {"kind": "ledge", "x": 0.44, "z": -0.42, "across": 0.28, "along": 0.17, "y": 0.26,
             "thickness": 0.07, "seed": 7.0},
            # A low stone in front of the left island.
            {"kind": "mound", "x": -0.5, "z": -0.26, "across": 0.14, "along": 0.1, "height": 0.1, "seed": 8.0},
        ],
        "caves": [
            {"x": -0.55, "y": 0.1, "z": -0.38, "across": 0.16, "up": 0.11, "along": 0.2, "seed": 9.0},
            {"x": 0.62, "y": 0.08, "z": -0.46, "across": 0.12, "up": 0.09, "along": 0.16, "seed": 10.0},
        ],
    },
    "clownfish-lagoon": {
        "size": 0.05,
        "shapes": [
            # A low bank along the back, higher on the left.
            {"kind": "mound", "x": -0.3, "z": -0.38, "across": 0.3, "along": 0.12, "height": 0.26, "seed": 1.0},
            {"kind": "mound", "x": 0.28, "z": -0.4, "across": 0.24, "along": 0.1, "height": 0.18, "seed": 2.0},
            # A small arch between them.
            {"kind": "arch", "from": (-0.06, -0.38), "to": (0.14, -0.4), "height": 0.17,
             "thickness": 0.045, "width": 0.06, "seed": 3.0},
            # A ledge on the left, the coral garden's top shelf.
            {"kind": "ledge", "x": -0.42, "z": -0.26, "across": 0.15, "along": 0.08, "y": 0.13,
             "thickness": 0.05, "seed": 4.0},
        ],
        "caves": [
            {"x": -0.3, "y": 0.06, "z": -0.28, "across": 0.08, "up": 0.06, "along": 0.08, "seed": 5.0},
        ],
    },
}


def runs_of(cells):
    """Lengths of alternating empty and solid stretches, the first one empty."""
    runs, current, count = [], 0, 0
    for cell in cells:
        if cell == current:
            count += 1
        else:
            runs.append(count)
            current, count = cell, 1
    runs.append(count)
    return runs


def main():
    path = sys.argv[1]
    with open(path, encoding="utf8") as file:
        scene = json.load(file)
    layout = LAYOUTS[os.path.splitext(os.path.basename(path))[0]]
    size = layout["size"]
    width, height, depth = (scene["tank"][key] for key in ("width", "height", "depth"))
    columns, layers, rows = (math.ceil(length / size - 1e-6) for length in (width, height, depth))
    cells = []
    # Across first, then from the back wall to the glass, then layer by layer up.
    for layer in range(layers):
        y = (layer + 0.5) * size
        for row in range(rows):
            z = -depth + (row + 0.5) * size
            for column in range(columns):
                x = -width / 2 + (column + 0.5) * size
                solid = any(SOLID[shape["kind"]](shape, x, y, z) for shape in layout["shapes"]) and not any(
                    cave(hollow, x, y, z) for hollow in layout["caves"]
                )
                cells.append(1 if solid else 0)
    old = scene.get("blocks", {})
    blocks = {"size": size, "runs": runs_of(cells)}
    for key in ("color", "material", "growth", "pores"):
        if key in old:
            blocks[key] = old[key]
    blocks.setdefault("color", "#6f7468")
    scene["blocks"] = blocks
    with open(path, "w", encoding="utf8", newline="\n") as file:
        json.dump(scene, file, indent=2, ensure_ascii=False)
    print(f"{sum(cells)} solid blocks of {len(cells)}")


main()
