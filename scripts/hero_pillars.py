"""Carves the Hero scene's reef pillars and mounds into its block rock.

The Hero scene's rock is blocks, like the scene editor's (scene/blocks):
eroded pillars, the tallest up to the surface, worn into ledges and
hollows, with a rubbly foot; low reef mounds; a reef bank winding
across the middle of the tank, where corals and algae grow side by side;
and on the right a lone outcrop in terraces, crowded with corals, sponges
and anemones as on the poster. This
script writes them into the scene's `blocks`, keeping its `growth`, so the
layout can be changed here and regenerated instead of drawn by hand:

    python scripts/hero_pillars.py public/scenes/hero.json
    pnpm exec prettier --write public/scenes/hero.json
"""

import json
import math
import sys

# Edge of one block, m: small enough for ledges a few centimetres deep.
BLOCK_SIZE = 0.06
ROCK_COLOR = "#6f7468"
MATERIAL = {"id": "reef-rock", "tileSize": 0.6, "displacement": 0.04}

# (x, z, base radius, top radius, height or None for the surface, lean, seed), m.
PILLARS = [
    (-0.55, -2.45, 0.30, 0.2, None, 0.08, 1.0),
    (1.35, -2.75, 0.32, 0.22, 2.1, -0.1, 2.0),
    (-3.05, -2.2, 0.55, 0.32, 2.9, 0.12, 3.0),
    (3.1, -2.0, 0.5, 0.3, 2.2, -0.1, 4.0),
]
# (x, z, radius, height, seed), m: low reef mounds the corals grow on.
MOUNDS = [
    (-2.0, -1.2, 0.6, 0.35, 5.0),
    (0.5, -1.7, 0.7, 0.3, 6.0),
    (2.3, -1.1, 0.5, 0.28, 7.0),
    (-0.4, -2.6, 0.8, 0.45, 8.0),
    (1.5, -2.7, 0.7, 0.4, 9.0),
]
# The reef bank: from x_min to x_max, its crest winding around z, m.
BANK = {"x_min": -2.9, "x_max": 2.9, "z": -1.55, "width": 0.55, "height": 0.42, "seed": 10.0}
# The lone outcrop on the right: terraces from the sand up, each (top, radius), m.
OUTCROP = {"x": 2.15, "z": -1.05, "tiers": [(0.4, 0.62), (0.78, 0.46), (1.15, 0.3)], "seed": 11.0}
# A pillar to the surface goes a little beyond it, so no gap shows.
ABOVE_SURFACE = 0.2


def noise(a, b, c):
    """A smooth, repeatable wobble in about -1.8..1.8 from three sines."""
    value = 0.0
    for octave, frequency in enumerate((1.0, 2.3, 5.1)):
        value += (
            math.sin(a * frequency * 1.7 + octave * 1.3 + b * frequency * 2.1)
            * math.cos(b * frequency * 1.3 - c * frequency * 1.9 + octave)
            / (octave + 1)
        )
    return value


def in_pillar(x, y, z, pillar, surface):
    px, pz, base, top, height, lean, seed = pillar
    height = surface + ABOVE_SURFACE if height is None else height
    if y > height:
        return False
    t = y / height
    cx = px + lean * t + 0.05 * noise(y * 2, seed, 0)
    dx, dz = x - cx, z - pz
    angle = math.atan2(dz, dx)
    radius = base + (top - base) * t
    radius *= 1 + 0.22 * noise(angle * 2, y * 3, seed) + 0.08 * noise(angle * 6, y * 9, seed + 1)
    # Strata: the rock wore away in layers, leaving ledges and grooves.
    strata = math.sin(y * 9.0 + 2.0 * noise(angle, y, seed + 2) + seed)
    radius *= 1 + 0.12 * strata + 0.1 * max(0.0, strata) ** 6
    # Hollows bored into the sides.
    if noise(angle * 3 + seed, y * 4, seed + 3) > 0.75:
        radius *= 0.75
    # A wider, rubbly foot where the pillar meets the sand.
    radius += 0.25 * max(0.0, 1 - y / 0.35) ** 2
    return dx * dx + dz * dz < radius * radius


def in_mound(x, y, z, mound):
    mx, mz, radius, height, seed = mound
    dx, dz = x - mx, z - mz
    reach = radius * (1 + 0.25 * noise(math.atan2(dz, dx) * 3, seed, 0))
    share = math.hypot(dx, dz) / reach
    return share < 1 and y < height * (1 - share * share) * (1 + 0.3 * noise(x * 4, z * 4, seed))


def in_bank(x, y, z):
    if not BANK["x_min"] <= x <= BANK["x_max"]:
        return False
    seed = BANK["seed"]
    crest = BANK["z"] + 0.35 * noise(x * 0.8, seed, 0)
    half = BANK["width"] * (1 + 0.35 * noise(x * 1.7, seed + 1, 0))
    across = abs(z - crest) / max(half, 0.1)
    # Lower towards both ends, lumpy along its length, with a few dips.
    ends = min(1.0, (x - BANK["x_min"]) / 0.6, (BANK["x_max"] - x) / 0.6)
    top = BANK["height"] * ends * (1 + 0.35 * noise(x * 3, z * 3, seed + 2))
    return across < 1 and y < top * (1 - across * across)


def in_outcrop(x, y, z):
    seed = OUTCROP["seed"]
    dx, dz = x - OUTCROP["x"], z - OUTCROP["z"]
    angle = math.atan2(dz, dx)
    for top, radius in OUTCROP["tiers"]:
        # Each terrace's rim wavers and its top is a little uneven.
        reach = radius * (1 + 0.18 * noise(angle * 2, top * 5, seed) + 0.06 * noise(angle * 7, y * 9, seed + 1))
        height = top + 0.06 * noise(dx * 6, dz * 6, seed + 2)
        if y < height and dx * dx + dz * dz < reach * reach:
            return True
    return False


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
    width, height, depth = (scene["tank"][key] for key in ("width", "height", "depth"))
    columns, layers, rows = (math.ceil(length / BLOCK_SIZE - 1e-6) for length in (width, height, depth))
    cells = []
    # Across first, then from the back wall to the glass, then layer by layer up.
    for layer in range(layers):
        y = (layer + 0.5) * BLOCK_SIZE
        for row in range(rows):
            z = -depth + (row + 0.5) * BLOCK_SIZE
            for column in range(columns):
                x = -width / 2 + (column + 0.5) * BLOCK_SIZE
                solid = (
                    any(in_pillar(x, y, z, p, height) for p in PILLARS)
                    or any(in_mound(x, y, z, m) for m in MOUNDS)
                    or in_bank(x, y, z)
                    or in_outcrop(x, y, z)
                )
                cells.append(1 if solid else 0)
    blocks = {"size": BLOCK_SIZE, "runs": runs_of(cells), "color": ROCK_COLOR, "material": MATERIAL}
    growth = scene.get("blocks", {}).get("growth")
    if growth is not None:
        blocks["growth"] = growth
    scene["blocks"] = blocks
    with open(path, "w", encoding="utf8", newline="\n") as file:
        json.dump(scene, file, indent=2, ensure_ascii=False)
    print(f"{sum(cells)} solid blocks of {len(cells)}")


main()
