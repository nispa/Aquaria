"""Builds a fish from its recipe, in Blender.

    blender --background --python scripts/blender/fishbuild.py -- <fish.json> [<output folder>]

A recipe (`public/assets/species/<id>/fish.json`, explained in
docs/FISH_MODELS.md) is a fish as data: its body and fins traced in body
lengths (Blender's +X the snout, +Z the back), its eye and mouth, and its
strains, each a stack of paint layers (fishpaint.py). This script writes
model.glb and colorings/<strain>.webp to the output folder (by default the
recipe's own), and model-values.json: the gills, pectoral fins and
colorings that model.json needs, in Aquaria's fish frame.

The shared pieces are in fishkit.py, paintkit.py and fishpaint.py.
"""

import json
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from fishkit import (  # noqa: E402
    Body,
    body_fin,
    body_fin_curves,
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
    tail_fin_curves,
    textured_material,
)
import fishpaint  # noqa: E402
import paintkit as paint  # noqa: E402

# Body and fin colors come from the texture; these only fill the snout and tail tips of an untextured body.
UNUSED_TIP_COLOR = linear("#808080")


def thickness_of(spec):
    """Half the body's thickness at s: rising behind the head, then tapering to the peduncle, never below `min`."""

    def thickness(s):
        rise = min(s / spec["rise"], 1.0) ** spec["power"]
        taper = 1 - spec["taper"] * smoothstep(spec["taperFrom"], 1.0, s)
        return max(spec["half"] * rise * taper, spec["min"])

    return thickness


def point(values):
    return Vector((values[0], 0.0, values[1]))


class Fish:
    """The recipe's shapes, ready to build and to paint."""

    def __init__(self, recipe):
        self.recipe = recipe
        body = recipe["body"]
        self.roundness = body["roundness"]
        self.body = Body(
            [tuple(p) for p in body["top"]],
            [tuple(p) for p in body["bottom"]],
            thickness_of(body["thickness"]),
            UNUSED_TIP_COLOR,
            UNUSED_TIP_COLOR,
        )
        atlas = recipe["texture"]
        self.atlas = paint.Atlas(atlas["size"])
        for name, rect in atlas["parts"].items():
            self.atlas.place(name, *rect)
        self.fins = recipe["fins"]

    # Fin shapes: each gives its part (verts, faces, colors, uvs) and, for painting, its base and edge.

    def fin_curves(self, fin, side=1):
        kind = fin["type"]
        if kind == "body":
            return body_fin_curves(self.body, fin["start"], fin["end"], fin["outline"], fin["upper"])
        if kind == "tail":
            root = Vector((self.body.peduncle_x + fin["root"], 0, 0))
            outline = [(x, 0, z) for x, z in fin["outline"]]
            return tail_fin_curves(root, fin["baseHeight"], outline)
        if kind == "pectoral":
            return self.pectoral_base(fin), self.pectoral_edge(fin)
        if kind == "pelvic":
            return self.pelvic_curves(fin, side)
        if kind == "filament":
            return self.filament_curves(fin, side)
        raise ValueError(f"Unknown fin type {kind!r}.")

    def pectoral_base(self, fin):
        root = point(fin["root"])
        dx, dz = fin["base"]
        return lambda u: root + Vector((dx * u, 0, dz * (u - 0.5)))

    def pectoral_edge(self, fin):
        top, bottom = fin["angles"]
        return fan_edge(point(fin["root"]), fin["length"], top, bottom, fin.get("roundness", 0.45))

    def pelvic_curves(self, fin, side):
        x, y, z = fin["root"]
        root = Vector((x, side * y, z))
        dx, dz = fin["base"]
        out = Vector((0, side * fin.get("out", 0.0), 0))

        def base(u):
            return root + Vector((dx * u, 0, dz * u))

        edge_spec = fin["edge"]
        if "fan" in edge_spec:
            fan = edge_spec["fan"]
            top, bottom = fan["angles"]
            curve_edge = fan_edge(root, fan["length"], top, bottom, roundness=fan.get("roundness", 0.45))
        else:
            (x0, z0), (x1, z1) = edge_spec["line"]
            curve_edge = lambda u: root + Vector((x0 + (x1 - x0) * u, 0, z0 + (z1 - z0) * u))  # noqa: E731

        return base, lambda u: curve_edge(u) + out

    def filament_curves(self, fin, side):
        points = [(x, side * y, z) for x, y, z in fin["points"]["left" if side > 0 else "right"]]
        path = rounded(points)
        start, end = fin["width"]

        def base(u):
            return polyline_point(path, u)

        return base, lambda u: base(u) + Vector((-(start * (1 - u) + end), 0, 0))

    def fin_parts(self, fin):
        """The fin's sheets: one, or one per side."""
        kind, uv = fin["type"], self.atlas.uv(fin["id"])
        steps = fin.get("steps")
        if kind == "body":
            return [
                body_fin(
                    self.body,
                    fin["start"],
                    fin["end"],
                    fin["outline"],
                    fin["upper"],
                    None,
                    steps_u=steps[0] if steps else 240,
                    bulge=fin.get("bulge", 0.006),
                    uv=uv,
                )
            ]
        if kind == "tail":
            root = Vector((self.body.peduncle_x + fin["root"], 0, 0))
            outline = [(x, 0, z) for x, z in fin["outline"]]
            return [
                tail_fin(
                    root,
                    fin["baseHeight"],
                    outline,
                    None,
                    steps_u=steps[0] if steps else 200,
                    steps_v=steps[1] if steps else 24,
                    bulge=fin.get("bulge", 0.004),
                    ruffle=fin.get("ruffle", 0.0),
                    uv=uv,
                )
            ]
        if kind == "pectoral":
            return [
                pectoral_fin(
                    self.body,
                    self.roundness,
                    side,
                    self.pectoral_base(fin),
                    self.pectoral_edge(fin),
                    None,
                    lean=fin.get("lean", 30),
                    steps_u=steps[0] if steps else 24,
                    steps_v=steps[1] if steps else 6,
                    uv=uv,
                )
                for side in (1, -1)
            ]
        if kind == "pelvic":
            return [
                membrane(*self.pelvic_curves(fin, side), None, steps_u=steps[0], steps_v=steps[1], uv=uv)
                for side in (1, -1)
            ]
        if kind == "filament":
            # Along the filament is u: its texture runs across the rectangle.
            across = lambda u, v: uv(v, u)  # noqa: E731
            return [
                membrane(*self.filament_curves(fin, side), None, steps_u=steps[0], steps_v=steps[1], uv=across)
                for side in (1, -1)
            ]
        raise ValueError(f"Unknown fin type {kind!r}.")

    # Painting.

    def painters(self, strain):
        eye = self.recipe["eye"]
        painters = {"body": fishpaint.body_painter(self.body, self.roundness, strain["body"], eye)}
        fin_paint = {**self.recipe.get("finPaint", {}), **strain.get("fins", {})}
        for fin in self.fins:
            spec = fin_paint[fin["id"]]
            base, edge = self.fin_curves(fin)
            painters[fin["id"]] = fishpaint.fin_painter(
                spec, lambda u, v, base=base, edge=edge: paint.sheet_points(base, edge, u, v)
            )
        return painters

    def paint_strain(self, strain):
        return self.atlas.paint(self.painters(strain), paint.srgb("#000000", 0.0))

    # The eye.

    def eye_centre(self, side):
        eye = self.recipe["eye"]
        half = self.body.profile(self.body.s(eye["x"]))[2]
        return Vector((eye["x"], side * half * eye["depth"], eye["z"]))

    def eye_color(self, degrees):
        eye = self.recipe["eye"]
        iris_from, iris_to = eye["irisEdge"]
        pupil_from, pupil_to = eye["pupilEdge"]
        color = mix(linear(eye["rim"]), linear(eye["iris"]), 1 - smoothstep(iris_from, iris_to, degrees))
        return mix(color, linear(eye["pupil"]), 1 - smoothstep(pupil_from, pupil_to, degrees))


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if not args:
        raise SystemExit("Usage: blender --background --python fishbuild.py -- <fish.json> [<output folder>]")
    recipe_path = os.path.abspath(args[0])
    with open(recipe_path, encoding="utf-8") as file:
        recipe = json.load(file)
    output = os.path.abspath(args[1]) if len(args) > 1 else os.path.dirname(recipe_path)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    fish = Fish(recipe)

    atlases = [(strain, fish.paint_strain(strain)) for strain in recipe["strains"]]
    for strain, pixels in atlases:
        paint.save_webp(pixels, os.path.join(output, "colorings", f"{strain['id']}.webp"))
        print(f"Coloring {strain['name']} written")
    step = recipe["texture"].get("ownStep", 4)
    own = paint.image(recipe["name"], atlases[0][1][::step, ::step])

    materials = recipe["materials"]
    skin, fins_material, eyes_material = materials["skin"], materials["fins"], materials["eyes"]
    body = make_object(
        "Body",
        [fish.body.mesh(None, roundness=fish.roundness, uv=fish.atlas.uv("body"))],
        textured_material("Skin", own, skin["roughness"], skin["metallic"], False),
    )
    mouth = recipe["mouth"]
    fish.body.mouth_shape_key(body, reach=mouth["reach"], drop=mouth["drop"])
    fin_parts = []
    left_pectoral = None
    for fin in recipe["fins"]:
        parts = fish.fin_parts(fin)
        if fin["type"] == "pectoral":
            left_pectoral = parts[0]
        fin_parts += parts
    fins = make_object("Fins", fin_parts, textured_material("Fins", own, fins_material["roughness"], fins_material["metallic"], True))

    radius = recipe["eye"]["radius"]
    left = eyeball(fish.eye_centre(1), radius, 1, fish.eye_color)
    right = eyeball(fish.eye_centre(-1), radius, -1, fish.eye_color)
    eyes = make_object("Eyes", [left, right], material("Eyes", eyes_material["roughness"], eyes_material["metallic"], False))

    values = {"colorings": {s["id"]: {"name": s["name"], "texture": f"colorings/{s['id']}.webp"} for s in recipe["strains"]}}
    gills = recipe.get("gills")
    pectoral = next((fin for fin in recipe["fins"] if fin["type"] == "pectoral"), None)
    if pectoral is not None:
        values.update(
            paint.manifest_values(
                [body, fins, eyes],
                fish.body,
                fish.roundness,
                left_pectoral,
                fish.pectoral_base(pectoral),
                *([gills["edge"], gills["top"], gills["bottom"]] if gills else []),
            )
        )
    with open(os.path.join(output, "model-values.json"), "w", encoding="utf-8", newline="\n") as file:
        json.dump(values, file, indent=2)
        file.write("\n")
    print(json.dumps(values))

    rig([body, fins], eyes, len(left[0]), fish.eye_centre(1), fish.eye_centre(-1))
    export(output)
    print(f"{recipe['name']} written to {output}")


main()
