"""Painting a fish's texture in Blender, for the fish scripts that make colorings.

A fish built with fishkit can be laid out on one square texture, an atlas:
each part (the body, each fin) gets a rectangle, and its own parameters
(the body's s and a, a fin's u and v) run across it. A painter is a
function of those parameters, written with numpy so a whole rectangle is
painted at once; it returns sRGB colors with alpha, as the image stores
them. One fish script paints the same atlas once per coloring (a strain)
and saves each as a WebP image that Aquaria lays on the model.
"""

import math
import os

import bpy
import numpy as np
from mathutils import Vector

from fishkit import curve


def srgb(hex_color, alpha=1.0):
    """An sRGB hex color with alpha, as the texture stores it."""
    value = hex_color.lstrip("#")
    return np.array([int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)] + [alpha], dtype=np.float32)


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    """a to b by t, for colors (…, 4) or (4,) and shares (…)."""
    t = np.clip(np.asarray(t, dtype=np.float32), 0.0, 1.0)[..., None]
    return a + (b - a) * t


def fill(shape, color):
    return np.broadcast_to(color, shape + (4,)).astype(np.float32)


def with_alpha(color, alpha):
    """The color with its alpha set to `alpha` (a number or an array of shares)."""
    alpha = np.asarray(alpha, dtype=np.float32)
    out = np.array(np.broadcast_to(color, np.broadcast_shapes(np.shape(color)[:-1], alpha.shape) + (4,)), dtype=np.float32)
    out[..., 3] = alpha
    return out


def _hash(ix, iy, seed):
    """A repeatable random number in 0..1 for each lattice point."""
    h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFF) / float(0xFFFFFF)


def value_noise(x, y, seed):
    """Smooth noise in 0..1, one bump per unit."""
    ix, iy = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    fx, fy = x - ix, y - iy
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = _hash(ix, iy, seed), _hash(ix + 1, iy, seed)
    c, d = _hash(ix, iy + 1, seed), _hash(ix + 1, iy + 1, seed)
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy


def fbm(x, y, seed, octaves=4):
    """Noise with detail at several sizes, 0..1."""
    total, weight, norm = 0.0, 1.0, 0.0
    for octave in range(octaves):
        total = total + weight * value_noise(x * 2**octave, y * 2**octave, seed + octave * 31)
        norm += weight
        weight *= 0.5
    return total / norm


def dots(x, y, cell, radius, seed, chance=1.0):
    """Coverage 0..1 of round dots scattered one per `cell`-sized square (some left out by `chance`)."""
    gx, gy = x / cell, y / cell
    ix, iy = np.floor(gx).astype(np.int64), np.floor(gy).astype(np.int64)
    # Each dot sits somewhere in the middle of its square and has its own size.
    cx = ix + 0.25 + 0.5 * _hash(ix, iy, seed)
    cy = iy + 0.25 + 0.5 * _hash(ix, iy, seed + 7)
    size = radius / cell * (0.6 + 0.4 * _hash(ix, iy, seed + 13))
    present = _hash(ix, iy, seed + 19) < chance
    distance = np.hypot(gx - cx, gy - cy)
    return np.where(present, 1 - smoothstep(size * 0.6, size, distance), 0.0)


def scales(x, z, size):
    """A reticulation of scales: 0 in the middle of each scale, 1 on its rim, rows offset by half a scale."""
    row = np.floor(z / (size * 0.8))
    shifted = x / size + 0.5 * (row % 2)
    cx = np.floor(shifted) + 0.5
    cz = (row + 0.5) * size * 0.8
    # Scales overlap from the head back: the rim is a crescent on the rear edge.
    dx = (shifted - cx) * size
    dz = z - cz
    distance = np.hypot(dx + size * 0.15, dz * 1.15) / (size * 0.55)
    return smoothstep(0.75, 1.0, distance)


class Atlas:
    """Where each part of a fish lies on its square texture: a rectangle in uv space per part."""

    def __init__(self, size, padding=6):
        self.size, self.padding = size, padding
        self.rects = {}

    def place(self, name, left, bottom, width, height):
        self.rects[name] = (left, bottom, width, height)

    def uv(self, name):
        """The part's (u, v) or (s, a) parameters to texture coordinates."""
        left, bottom, width, height = self.rects[name]
        return lambda u, v: (left + u * width, bottom + v * height)

    def paint(self, painters, background):
        """The atlas painted by a painter per part, each a function of its own parameters (numpy arrays).

        Each rectangle is painted a few texels beyond its edge, with the
        parameters held at the edge, so mipmaps do not bleed the next part in.
        """
        size = self.size
        image = fill((size, size), background).copy()
        for name, painter in painters.items():
            left, bottom, width, height = self.rects[name]
            x0, x1 = int(left * size) - self.padding, int(math.ceil((left + width) * size)) + self.padding
            y0, y1 = int(bottom * size) - self.padding, int(math.ceil((bottom + height) * size)) + self.padding
            x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, size), min(y1, size)
            columns = (np.arange(x0, x1) + 0.5) / size
            rows = (np.arange(y0, y1) + 0.5) / size
            u = np.clip((columns - left) / width, 0.0, 1.0)
            v = np.clip((rows - bottom) / height, 0.0, 1.0)
            uu, vv = np.meshgrid(u, v)
            image[y0:y1, x0:x1] = painter(uu, vv)
        return np.clip(image, 0.0, 1.0)


def body_points(body, roundness, s, a):
    """Where (s, a) of Body.mesh lies: x, z, the height share (-1 belly .. 1 back) and the side share."""
    samples = np.linspace(0.0, 1.0, 512)
    xs = body.snout_x + (body.peduncle_x - body.snout_x) * samples
    tops = np.array([curve(body.top, x) for x in xs])
    bottoms = np.array([curve(body.bottom, x) for x in xs])
    x = body.snout_x + (body.peduncle_x - body.snout_x) * s
    top, bottom = np.interp(s, samples, tops), np.interp(s, samples, bottoms)
    angle = 2 * np.pi * a
    up, side = np.sin(angle), np.cos(angle)
    z = (top + bottom) / 2 + (top - bottom) / 2 * up
    return x, z, up, side


def sheet_points(base, edge, u, v):
    """Where (u, v) of a fishkit membrane lies, x and z: base(u) towards edge(u) by v."""
    samples = np.linspace(0.0, 1.0, 512)
    bases = [base(t) for t in samples]
    edges = [edge(t) for t in samples]
    bx, bz = np.interp(u, samples, [p.x for p in bases]), np.interp(u, samples, [p.z for p in bases])
    ex, ez = np.interp(u, samples, [p.x for p in edges]), np.interp(u, samples, [p.z for p in edges])
    return bx + (ex - bx) * v, bz + (ez - bz) * v


def image(name, pixels):
    """A Blender image holding the painted atlas (rows from the bottom, as Blender keeps them)."""
    size = pixels.shape[0]
    picture = bpy.data.images.new(name, size, size, alpha=True)
    picture.pixels.foreach_set(pixels.astype(np.float32).ravel())
    picture.pack()
    return picture


def save_webp(pixels, path, quality=90):
    """Writes the painted atlas as a WebP image, the file a model.json coloring names."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    picture = image(os.path.basename(path), pixels)
    picture.filepath_raw = path
    picture.file_format = "WEBP"
    picture.save(quality=quality)
    return path


def fish_frame(objects):
    """Blender points to Aquaria's fish frame (x along the body, one body length, y up), as model.json measures them."""
    points = [obj.matrix_world @ v.co for obj in objects for v in obj.data.vertices]
    low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    centre, length = (low + high) / 2, high.x - low.x

    def to_frame(x, z):
        return round((x - centre.x) / length, 3), round((z - centre.z) / length, 3)

    return to_frame, length
