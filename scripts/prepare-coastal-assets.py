"""Prepare compact, unpainted derivatives of the CC0 Seaside Rock scan.

Only format/resolution change. Color stays sRGB; normal/ARM stay linear data.
The downloaded originals are retained and checked against Poly Haven metadata.
Authoring-only dependencies: Pillow and NumPy; no game runtime dependency.
"""
from hashlib import md5, sha256
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/realism"
RUNTIME = ROOT / "assets/runtime"
EXPECTED = {
    "diff": "d719765f07b7e5ec40ef7acb9b718df5",
    "nor_gl": "6a4f25d9acbf0376611f5e4c33a779d2",
    "arm": "d3844d383ed08d29337378e6b488a4cc",
}
report = {"source": {}, "runtime": {}, "gpu_rgba8_mip_bytes": 0}
for kind, expected in EXPECTED.items():
    path = SOURCE / f"seaside_rock_{kind}_1k.jpg"
    data = path.read_bytes()
    assert md5(data).hexdigest() == expected, f"Source checksum mismatch: {path}"
    report["source"][path.name] = {
        "bytes": len(data), "sha256": sha256(data).hexdigest(),
        "size": Image.open(path).size, "md5": expected,
    }

Image.open(SOURCE / "seaside_rock_diff_1k.jpg").convert("RGB").resize(
    (768, 768), Image.Resampling.LANCZOS
).save(RUNTIME / "coastal_rock_color.webp", quality=90, method=6, exact=True)

# Average the 1024px vector normal in linear vector space, normalize, then
# encode losslessly. This avoids compression bias and keeps subdued relief.
normal = np.asarray(Image.open(SOURCE / "seaside_rock_nor_gl_1k.jpg").convert("RGB"), dtype=np.float32)
assert normal.shape == (1024, 1024, 3)
vectors = normal / 127.5 - 1
vectors = vectors.reshape(512, 2, 512, 2, 3).mean(axis=(1, 3))
vectors /= np.maximum(np.linalg.norm(vectors, axis=2, keepdims=True), 1e-6)
encoded = np.rint(np.clip((vectors + 1) * 127.5, 0, 255)).astype(np.uint8)
Image.fromarray(encoded).save(
    RUNTIME / "coastal_rock_normal.webp", lossless=True, quality=100, method=6, exact=True
)

Image.open(SOURCE / "seaside_rock_arm_1k.jpg").convert("RGB").resize(
    (384, 384), Image.Resampling.LANCZOS
).save(RUNTIME / "coastal_rock_arm.webp", quality=91, method=6, exact=True)

for name in ["coastal_rock_color.webp", "coastal_rock_normal.webp", "coastal_rock_arm.webp"]:
    path = RUNTIME / name
    data = path.read_bytes()
    width, height = Image.open(path).size
    report["runtime"][name] = {"bytes": len(data), "sha256": sha256(data).hexdigest(), "size": [width, height]}
    # Exact full chain, including non-power-of-two dimensions.
    while True:
        report["gpu_rgba8_mip_bytes"] += width * height * 4
        if width == 1 and height == 1:
            break
        width, height = max(1, width // 2), max(1, height // 2)
report["runtime_bytes"] = sum(item["bytes"] for item in report["runtime"].values())
assert report["runtime_bytes"] < 700_000
print(json.dumps(report, indent=2))
