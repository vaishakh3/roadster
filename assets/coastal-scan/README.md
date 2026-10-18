# Coastal photogrammetry experiment

This is **Poly Haven Coastal Cliff 01**, a real photographed 92 m wide rock face
by Rob Tuytel and Rico Cilliers, released under CC0. The runtime derivative
retains the scan's UV coordinates and matching maps. The two route-conforming
formations share one material and one texture set. They add no lights.

The original glTF binary is 13.18 MB and is deliberately retained outside Git.
`source-report.json` records its official URL, size, MD5 and SHA256. The official
API responses are saved alongside the report, so the inputs are pinned.

To reproduce from the repository root (Python requires Pillow and NumPy):

```sh
python3 scripts/prepare-coastal-scan-textures.py --source /tmp/roadster-cliff-source
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/prepare-coastal-scan-geometry.py -- /tmp/roadster-cliff-source
```

The game only imports `coastal-cliff-data.js` and three WebP files from
`assets/runtime`. Blender and Python are authoring tools, never runtime dependencies.

Near geometry: 9,999 triangles; far: 1,500. Binary geometry is 170,953 bytes.
Matching textures total 676,482 bytes. Combined raw runtime payload: 847,435 bytes;
base64 embedding is approximately 1.13 MB. GPU texture memory with RGBA8 mipmaps:
8,388,604 bytes. Each visible formation is one additional draw call. These
figures describe resources; they are not measurements of phone frame rate.
