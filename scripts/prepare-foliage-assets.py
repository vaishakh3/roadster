"""Encode game foliage + original bark, without game/build dependencies.

Authoring dependencies: NumPy and Pillow. The generated branch image is kept
unchanged in assets/foliage; only size and encoding change in its runtime copy.
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / 'assets/runtime'
source = Image.open(ROOT / 'assets/foliage/branches-original.png').convert('RGBA')
source.resize((768, 768), Image.Resampling.LANCZOS).save(
    RUNTIME / 'foliage_branches.webp', quality=87, method=6, exact=True, alpha_quality=100)

# Deterministic tileable bark: displaced vertical ridges, fissures, mottled
# raised scales and weathered gray-brown fibers. It doubles as the bump map.
rng = np.random.default_rng(15442)
W, H = 256, 512
y, x = np.mgrid[0:H, 0:W]
def noise(nx, ny):
    grid = rng.random((ny, nx))
    px, py = x / W * nx, y / H * ny
    ix, iy = np.floor(px).astype(int), np.floor(py).astype(int)
    fx, fy = px - ix, py - iy
    fx, fy = fx*fx*(3-2*fx), fy*fy*(3-2*fy)
    return ((grid[iy % ny, ix % nx]*(1-fx)+grid[iy % ny, (ix+1) % nx]*fx)*(1-fy)
            +(grid[(iy+1) % ny, ix % nx]*(1-fx)+grid[(iy+1) % ny, (ix+1) % nx]*fx)*fy)
warp = noise(7, 4)
phase = x/W*18 + (warp-.5)*1.4
ridge = np.abs(np.sin(phase*np.pi))**.38
split = np.clip((ridge-.28)*1.6, 0, 1)
scale = noise(26, 12)*.6+noise(63, 41)*.25+noise(151, 173)*.15
fibre = noise(93, 7)
height = .17+.51*split+.17*scale+.07*fibre
fleck = np.clip((noise(34, 59)-.5)*.7, -.16, .16)
rgb = np.stack([(height+fleck)*136+32,(height+fleck)*124+32,(height+fleck)*102+31],axis=2)
Image.fromarray(np.uint8(np.clip(rgb,0,255)), 'RGB').save(RUNTIME / 'bark_color.webp', quality=87, method=6)

# The original CC0 scan already includes a physical normal map. Preserve its
# vector directions when resampling into the compact runtime texture.
normal = Image.open(ROOT / 'assets/realism/sandstone_cracks_nor_gl_1k.jpg').resize((384,384),Image.Resampling.LANCZOS)
v = np.asarray(normal).astype(float)/127.5-1
v /= np.maximum(np.linalg.norm(v,axis=2,keepdims=True),1e-5)
Image.fromarray(np.uint8(np.clip((v+1)*127.5,0,255)), 'RGB').save(RUNTIME / 'sandstone_normal.webp',quality=88,method=6)
for file in ['foliage_branches.webp','bark_color.webp','sandstone_normal.webp']:
    print(file, (RUNTIME/file).stat().st_size, 'bytes')
