"""Builds the surface materials in public/assets/materials/ from CC0 sources.

For each material this downloads the 2K maps from Poly Haven, packs them into
two textures and encodes both as KTX2 (UASTC + Zstandard, with mipmaps):

- normal.ktx2:  the OpenGL normal map.
- surface.ktx2: R = displacement (0..1), G = roughness, B = the diffuse map's
                luminance normalized to 0.5, so scenes keep choosing the hue.

Requirements: Python 3 with Pillow and NumPy, and KTX-Software's `ktx` tool,
either on PATH or extracted into tools/ktx/bin/ (see README, "Materials").

Usage: python scripts/build_materials.py [material-id ...]
"""

import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "public" / "assets" / "materials"
SOURCE_URL = "https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/{asset}/{asset}_{map}_2k.png"

# Material id -> (Poly Haven asset, output size in pixels).
MATERIALS = {
    "fine-sand": ("dense_sand", 2048),
    "reef-rock": ("rock_boulder_dry", 1024),
}

# UASTC quality 0..4 (higher is slower and better) and Zstandard level 1..22.
UASTC_QUALITY = "3"
ZSTD_LEVEL = "18"
# Rate-distortion optimization makes UASTC blocks compress far better with
# Zstandard. Lower lambda = higher quality; normals need the gentler setting.
RDO_LAMBDA = {"normal": "0.5", "surface": "1.0"}
# Average brightness detail stored at mid-grey, so the shader can scale by 2x.
DETAIL_MEAN = 0.5


def ktx_tool() -> str:
    local = ROOT / "tools" / "ktx" / "bin" / "ktx.exe"
    found = shutil.which("ktx") or (str(local) if local.exists() else None)
    if found is None:
        sys.exit("KTX-Software's `ktx` tool was not found on PATH or in tools/ktx/bin/.")
    return found


def download(asset: str, map_name: str, folder: Path) -> Image.Image:
    target = folder / f"{asset}_{map_name}.png"
    if not target.exists():
        request = urllib.request.Request(
            SOURCE_URL.format(asset=asset, map=map_name), headers={"User-Agent": "aquaria-build"}
        )
        with urllib.request.urlopen(request) as response:
            target.write_bytes(response.read())
    Image.MAX_IMAGE_PIXELS = None
    return Image.open(target)


def resized(image: Image.Image, size: int, mode: str) -> np.ndarray:
    return np.asarray(image.convert(mode).resize((size, size), Image.LANCZOS), dtype=np.float64)


def pack_surface(asset: str, size: int, folder: Path) -> Image.Image:
    diffuse = resized(download(asset, "diff", folder), size, "RGB") / 255
    luminance = diffuse @ np.array([0.2126, 0.7152, 0.0722])
    detail = np.clip(luminance / luminance.mean() * DETAIL_MEAN, 0, 1)
    height = resized(download(asset, "disp", folder), size, "F")
    height = (height - height.min()) / max(height.max() - height.min(), 1e-6)
    roughness = resized(download(asset, "rough", folder), size, "L") / 255
    packed = np.stack([height, roughness, detail], axis=-1)
    return Image.fromarray((packed * 255 + 0.5).astype(np.uint8), "RGB")


def encode(ktx: str, source: Path, target: Path, rdo_lambda: str) -> None:
    subprocess.run(
        [
            ktx, "create",
            "--format", "R8G8B8_UNORM",
            "--assign-tf", "linear",
            "--generate-mipmap",
            "--encode", "uastc",
            "--uastc-quality", UASTC_QUALITY,
            "--uastc-rdo",
            "--uastc-rdo-l", rdo_lambda,
            "--zstd", ZSTD_LEVEL,
            str(source), str(target),
        ],
        check=True,
    )


def build(material: str, ktx: str, folder: Path) -> None:
    asset, size = MATERIALS[material]
    out = OUTPUT / material
    out.mkdir(parents=True, exist_ok=True)
    normal = folder / f"{material}_normal.png"
    surface = folder / f"{material}_surface.png"
    download(asset, "nor_gl", folder).convert("RGB").resize((size, size), Image.LANCZOS).save(normal)
    pack_surface(asset, size, folder).save(surface)
    encode(ktx, normal, out / "normal.ktx2", RDO_LAMBDA["normal"])
    encode(ktx, surface, out / "surface.ktx2", RDO_LAMBDA["surface"])
    print(f"{material}: {sum(f.stat().st_size for f in out.glob('*.ktx2')) // 1024} KiB")


def main() -> None:
    ktx = ktx_tool()
    materials = sys.argv[1:] or list(MATERIALS)
    with tempfile.TemporaryDirectory() as temporary:
        for material in materials:
            build(material, ktx, Path(temporary))


if __name__ == "__main__":
    main()
