# Original branch atlas

Generated with the built-in image generation tool on 18 October 2026 for this
game. `branches-original.png` retains the original generated pixels and alpha.
The runtime WebP is resized and encoded by `scripts/prepare-foliage-assets.py`.

Atlas layout: upper-left dense pine, upper-right loose coastal pine,
lower-left oak branch, lower-right oak foliage cluster. No third-party reference
image was used. The bark texture is generated deterministically by the same
preparation script. Neither preparation tool is required by the game/build.

## Runtime budget

The original PNG is authoring-only and is not included in the standalone game.
The new runtime assets total 432,426 encoded bytes (approximately 576,568 bytes
when embedded as base64). RGBA8 allocation including mipmaps is about 4.42 MiB.

| Asset | Dimensions | Encoded bytes |
| --- | --- | ---: |
| `foliage_branches.webp` | 768 × 768 | 358,302 |
| `bark_color.webp` | 256 × 512 | 14,668 |
| `sandstone_normal.webp` | 384 × 384 | 59,456 |

Foliage is opaque with alpha testing and shares one atlas across tree species.
Bark reuses one texture for color and bump. The rock shader adds one dominant-axis
normal-map lookup. These material changes add no draw calls or geometry; the
tree geometry module manages shared instanced near/far cohorts. The distant
whole-tree texture retains its existing 256 × 512 canvas size.

## Generation prompt

Use case: photorealistic-natural. Asset type: one professional game foliage texture atlas, square, 2 by 2 equal tiles on genuinely transparent background with alpha. Primary request: Four photorealistic botanical BRANCH CLUSTERS, not whole trees, for layering on 3D crossed branch cards in a realistic coastal racing game. Upper left quadrant: a mature Scots pine branch spray, dense irregular clusters of long olive needles on several fine branching brown twigs; broad horizontal/diagonal fan silhouette. Upper right: a loose wind-shaped coastal Monterey pine bough, broken asymmetric sprays, visible twisting branch structure with substantial transparent gaps. Lower left: an oak branch fan, 45–70 small lifelike irregular lobed leaves and thin fine twigs, desaturated natural greens, varied leaf orientation. Lower right: a rounded irregular oak foliage cluster, small overlapping real leaves in separated bunches, visible air gaps and fine twigs. Composition: each branch cluster isolated and centered within its own equal square quadrant, each occupying about 80 percent of the quadrant, generous transparent gutter between tiles, none overlapping tile boundaries. View: orthographic near frontal view with subtle natural depth, branch base near the lower center of each quadrant so the sprays extend outward/up. Lighting: soft neutral overcast botanical photography, broad diffuse illumination, natural leaf texture and needle detail, moderate contrast, no strong shadows, not dramatic backlighting, not glossy. Mature believable vegetation with messy branching and porous silhouettes, no perfect symmetry, not geometric Christmas-tree triangles. Exact constraints: transparent pixels around and through the branches; no ground, sky, horizon, room, backdrop, plant pots, labels, letters, borders, grid lines, watermarks or decorative elements. Single coherent texture sheet, no layout text.
