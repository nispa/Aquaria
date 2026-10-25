"""Painting the veins of Aquaria's plant leaves, as a texture in shades of grey.

A leaf built by freshwater_plants.add_leaf runs across a tile of the
texture: `s` from -1 (one edge) to 1 (the other) through the midrib at 0,
`t` from 0 (base) to 1 (tip). The leaf's points keep its colors (green at
the base, red at the tips...); the texture only lightens and darkens them,
since Aquaria multiplies the two: a pale midrib, side veins, a lighter rim
where light comes through, a little mottling. Stems and petioles sit on
the plain strip at the right of the texture, which leaves them as they are.

    leaf_texture(LEAVES["cryptocoryne"])  # → pixels for paintkit.image
"""

import numpy as np

from paintkit import fbm, smoothstep

SIZE = 512
# The leaf tile runs across this share of the texture; the plain strip starts after a gap.
LEAF_U = 0.86
PLAIN_U = 0.95
# The texture's grey on the blade: below 1, so the midrib and rim can be lighter.
# freshwater_plants brightens the leaf's colors by its inverse.
BLADE = 0.92

# How each plant's leaves are veined. pinnate: side veins leaving the midrib
# towards the tip; parallel: veins running the length of the blade.
LEAVES = {
    "rotala": dict(midrib=1.0, veins="pinnate", count=5, vein=0.84, slope=0.35, mottle=0.03, rim=0.04),
    "hairgrass": dict(midrib=1.0, veins="parallel", count=2, vein=0.9, mottle=0.02, rim=0.0),
    "cryptocoryne": dict(midrib=1.0, veins="pinnate", count=7, vein=0.72, slope=0.5, mottle=0.08, rim=0.05),
    "vallisneria": dict(midrib=0.97, veins="parallel", count=5, vein=0.84, mottle=0.03, rim=0.03, streaks=0.18),
    "anubias": dict(midrib=1.0, veins="pinnate", count=10, vein=0.74, slope=0.6, mottle=0.03, rim=0.03),
    "java-fern": dict(midrib=1.0, veins="pinnate", count=9, vein=0.62, slope=0.45, mottle=0.05, rim=0.04, network=0.12),
    "moss-cushion": dict(midrib=1.0, veins="parallel", count=1, vein=1.0, mottle=0.06, rim=0.0),
}


def line(distance, width):
    """1 on a line `distance` away, fading out over `width`."""
    return 1 - smoothstep(width * 0.4, width, np.abs(distance))


def leaf_value(s, t, midrib, veins, count, vein, mottle, rim, slope=0.4, streaks=0.0, network=0.0):
    """The grey of a leaf at (s, t), arrays of the same shape."""
    across = np.abs(s)
    value = np.full(s.shape, BLADE, dtype=np.float32)
    # Side veins first, so the midrib lies over them.
    if veins == "pinnate":
        # Each leaves the midrib and bends towards the tip as it nears the edge.
        phase = (t - slope * across - 0.15 * across**2) * count
        distance = (phase - np.round(phase)) / count
        width = 0.012 * (1 - 0.6 * across)
        strength = smoothstep(0.02, 0.1, across) * (1 - smoothstep(0.8, 0.97, across)) * smoothstep(0.03, 0.12, t)
        value = value + (vein - BLADE) * line(distance, width) * strength
    else:
        phase = (s + 1) / 2 * (count + 1)
        distance = (phase - np.round(phase)) / (count + 1)
        value = value + (vein - BLADE) * line(distance, 0.02) * (np.round(phase) > 0) * (np.round(phase) <= count)
    if network:
        # The fine net between the veins of a fern.
        ridges = 1 - np.abs(2 * fbm(s * 9, t * 22, 41, octaves=3) - 1)
        value = value - network * smoothstep(0.82, 0.97, ridges)
    if streaks:
        # Short dark dashes along the blade, as on Vallisneria.
        dashes = fbm(s * 14, t * 3, 53, octaves=2)
        value = value - streaks * smoothstep(0.62, 0.72, dashes)
    value = value + (midrib - value) * line(s, 0.035 * (1 - 0.6 * t))
    value = value + rim * smoothstep(0.82, 1.0, across)
    value = value + mottle * (fbm(s * 6, t * 18, 17) - 0.5) * 2
    return np.clip(value, 0.0, 1.0)


def leaf_texture(leaf):
    """The whole texture for one plant: its leaf tile and the plain strip, sRGB RGBA rows from the bottom."""
    u = (np.arange(SIZE, dtype=np.float32) + 0.5) / SIZE
    v = (np.arange(SIZE, dtype=np.float32) + 0.5) / SIZE
    uu, vv = np.meshgrid(u, v)
    s = np.clip(uu / LEAF_U, 0.0, 1.0) * 2 - 1
    value = leaf_value(s, vv, **leaf)
    value = np.where(uu > LEAF_U, 1.0, value)
    pixels = np.ones((SIZE, SIZE, 4), dtype=np.float32)
    pixels[..., 0] = pixels[..., 1] = pixels[..., 2] = value
    return pixels
