"""Paint layers as data, for fish recipes (see fishbuild.py).

A strain paints the body with a stack of layers, each a color laid where
its pattern says, and each fin with a rayed web and layers of its own. The
layer types are the patterns the hand-written fish scripts used (the
guppy's tuxedo and grass, the platy's Mickey Mouse mark, the gramma's
split, the sardine's spots…), with their numbers taken out into the
recipe. Every pattern is a share 0..1 per texel, computed with numpy over a
whole rectangle of the atlas.

Coordinates: on the body x along it (snout positive), z height, `up` the
height share (-1 belly .. 1 back) and `side`; on a fin u along its base,
v from base to edge, and x, z where that point of the fin lies.
"""

import numpy as np

import paintkit as paint


def _band(values, spec):
    """One band of a patch: smoothstep over [from, to] (a falling one if from > to), inverted if asked."""
    low, high = spec["range"]
    share = paint.smoothstep(low, high, values)
    return 1 - share if spec.get("invert", False) else share


def _axis(spec, coords):
    x, z, up = coords["x"], coords["z"], coords["up"]
    axis = spec["axis"]
    offset = spec.get("offset", 0.0)
    if axis == "x":
        return x
    if axis == "z":
        return z
    if axis == "up":
        return up
    if axis == "absUp":
        return np.abs(up)
    if axis == "absZ":
        return abs(z - offset)
    raise ValueError(f"Unknown patch axis {axis!r}.")


def _where(bands, coords):
    """The product of a patch's bands, in their order."""
    share = None
    for spec in bands:
        band = _band(_axis(spec, coords), spec)
        share = band if share is None else share * band
    return share


def _edge(spec, x, z):
    """Behind an edge across the body (0 in front, 1 behind), slanted and ragged as the recipe says."""
    value = x + spec.get("slant", 0.0) * z + spec.get("below", 0.0) * np.clip(-z, 0, None)
    noise = spec.get("noise")
    if noise is not None:
        value = value + noise["amount"] * (paint.fbm(z * noise["z"], x * noise["x"], noise["seed"]) - 0.5)
    at, width = spec["at"], spec["width"]
    return paint.smoothstep(at + width * 0.5, at - width * 0.5, value)


def _marks(spec, x, y):
    """The marks of a layer, added up: round, soft-edged, `ySquash` flattening them across."""
    softness = spec.get("softness", 0.15)
    squash = spec.get("ySquash", 1.0)
    share = 0.0
    for centre_x, centre_y, radius in spec["marks"]:
        distance = np.hypot(x - centre_x, (y - centre_y) * squash)
        share = share + (1 - paint.smoothstep(radius * (1 - softness), radius, distance))
    return share


def _noise_lines(spec, x, z):
    noise = paint.fbm(x * spec["scale"], z * spec["scale"], spec["seed"], octaves=spec.get("octaves", 2))
    low, high = spec["width"]
    return 1 - paint.smoothstep(low, high, np.abs(noise - 0.5))


def _pattern(layer, coords, eye):
    """How much of the layer's color goes where, before its amount and its `where` bands."""
    kind = layer["type"]
    x, z, up = coords["x"], coords["z"], coords["up"]
    if kind == "patch":
        return _where(layer["bands"], coords)
    if kind == "edge":
        return _edge(layer, x, z)
    if kind == "marks":
        return _marks(layer, x, up if layer.get("axis", "z") == "up" else z)
    if kind == "noise":
        noise = paint.fbm(x * layer["scale"], z * layer["scale"], layer["seed"], octaves=layer.get("octaves", 4))
        low, high = layer["range"]
        return paint.smoothstep(low, high, noise)
    if kind == "noiseLines":
        return _noise_lines(layer, x, z)
    if kind == "eyeLine":
        low, high = layer["width"]
        line = 1 - paint.smoothstep(low, high, abs(z - (eye["z"] + (x - eye["x"]) * layer["slope"])))
        start, end = layer["x"]
        return line * paint.smoothstep(start, end, x)
    if kind == "rays":
        centre_x, centre_z = layer["centre"]
        return (0.5 + 0.5 * np.cos(np.arctan2(z - centre_z, x - centre_x) * layer["count"])) ** layer["power"]
    if kind == "gillCurve":
        low, high = layer["width"]
        return 1.0 - paint.smoothstep(low, high, np.abs(x - (layer["x"] - layer["curve"] * up * up)))
    raise ValueError(f"Unknown paint layer {kind!r}.")


def _share(layer, coords, eye):
    """The layer's share per texel: its pattern (or the largest of `any`), times its amount, within its bands."""
    if "any" in layer:
        share = None
        for part in layer["any"]:
            value = _pattern(part, coords, eye) * part.get("amount", 1.0)
            share = value if share is None else np.maximum(share, value)
    else:
        share = _pattern(layer, coords, eye) * layer.get("amount", 1.0)
    if "where" in layer:
        share = share * _where(layer["where"], coords)
    return share


def body_painter(body, roundness, layers, eye):
    """A painter of the body's (s, a) from a stack of layers; the first is a `fill`."""

    def color(s, a):
        x, z, up, side = paint.body_points(body, roundness, s, a)
        coords = {"x": x, "z": z, "up": up}
        out = None
        for layer in layers:
            kind = layer["type"]
            if kind == "fill":
                out = paint.fill(x.shape, paint.srgb(layer["color"]))
                continue
            if kind == "scales":
                out = paint.with_scales(out, x, z, layer["size"], layer.get("rim", 0.07))
                continue
            target = paint.srgb(layer["color"])
            if kind == "edge" and "behind" in layer:
                # Behind the edge another coloring: its own color, shaded by its bands.
                behind = layer["behind"]
                target = paint.mix(target, paint.srgb(behind["color"]), _where(behind["bands"], coords) * behind.get("amount", 1.0))
            out = paint.mix(out, target, _share(layer, coords, eye))
        return out

    return color


def fin_painter(spec, points):
    """A painter of a fin's (u, v): a rayed web (paintkit.rayed) and layers over it, `points` giving x, z."""
    rayed = spec["rayed"]
    web = paint.rayed(
        rayed["web"],
        rayed["ray"],
        rayed["root"],
        rayed["alphaRoot"],
        rayed["alphaEdge"],
        rayed["rays"],
        root_share=rayed.get("rootShare", 0.14),
        edge_color=rayed.get("edgeColor"),
    )
    layers = spec.get("layers", [])

    def color(u, v):
        out = web(u, v)
        if not layers:
            return out
        x, z = points(u, v)
        for layer in layers:
            kind = layer["type"]
            if kind == "tint":
                # The web's colors multiplied by a tint: one color, or two across an edge.
                share = _edge(layer["edge"], x, z * 0) if "edge" in layer else 0.0
                tint = paint.mix(paint.fill(u.shape, paint.srgb(layer["color"])), paint.srgb(layer.get("colorTo", layer["color"])), share)
                out[..., :3] *= tint[..., :3]
                continue
            if kind == "dots":
                low, high = layer["chance"]
                share = paint.dots(x, z, layer["cell"], layer["radius"], layer["seed"], chance=low + high * v)
                start, end = layer["fade"]
                share = share * paint.smoothstep(start, end, v)
            elif kind == "noiseLines":
                share = _noise_lines(layer, x, z) * layer.get("amount", 1.0)
            elif kind == "marks":
                share = _marks(layer, x, z) * layer.get("amount", 1.0)
            else:
                raise ValueError(f"Unknown fin layer {kind!r}.")
            alpha = out[..., 3] if layer.get("alpha") is None else layer["alpha"]
            out = paint.mix(out, paint.with_alpha(paint.srgb(layer["color"]), alpha), share)
        return out

    return color
