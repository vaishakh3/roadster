"""Regenerate the original, seamless packed material detail texture.

Run with Python + NumPy + Pillow. These are authoring tools only; the game and
its build have no new dependencies. R: broad mineral/wear variation, G: mottled
medium detail, B: fine porous aggregate. All channels are linear data.
"""
from pathlib import Path
import numpy as np
from PIL import Image

SIZE = 256
rng = np.random.default_rng(76342)


def noise(period):
    grid = rng.random((period, period))
    p = np.arange(SIZE) * period / SIZE
    i = np.floor(p).astype(int)
    f = p - i
    f = f * f * (3 - 2 * f)
    a = grid[i[:, None] % period, i[None, :] % period]
    b = grid[i[:, None] % period, (i[None, :] + 1) % period]
    c = grid[(i[:, None] + 1) % period, i[None, :] % period]
    d = grid[(i[:, None] + 1) % period, (i[None, :] + 1) % period]
    return (a * (1-f)[None, :] + b * f[None, :]) * (1-f)[:, None] + (c * (1-f)[None, :] + d * f[None, :]) * f[:, None]


def contrast(a, amount=1.5):
    return np.clip((a-.5)*amount+.5, 0, 1)


broad = contrast(noise(4)*.6 + noise(9)*.27 + noise(21)*.13)
medium = contrast(noise(17)*.52 + noise(37)*.31 + noise(79)*.17, 1.7)
pores = contrast(noise(47)*.26 + noise(101)*.39 + noise(256)*.35, 1.5)
image = np.uint8(np.stack([broad, medium, pores], axis=2)*255+.5)
destination = Path(__file__).resolve().parents[1] / 'assets/runtime/surface_detail.webp'
Image.fromarray(image, 'RGB').save(destination, 'WEBP', lossless=True, method=6)
print(f'{destination.name}: {destination.stat().st_size} bytes; 256 × 256, RGB linear')
