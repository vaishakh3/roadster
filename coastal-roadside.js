import * as THREE from "./vendor/three.module.js";

// A small, route-conforming hardware set. Geometry is assembled once into two
// material batches per 100 m, including fasteners and folded steel profiles.
// No textures, runtime shadows or per-frame geometry allocations are added.
export function createCoastalRoadside({
  root,
  roadX,
  roadY,
  start = 760,
  end = 1260,
}) {
  const group = new THREE.Group();
  group.name = "Coastal galvanized W-beam guardrails";
  root.add(group);
  const tiles = [],
    geometries = new Set();
  const metal = new THREE.MeshStandardMaterial({
    color: 0xb4bec0,
    vertexColors: true,
    metalness: 0.66,
    roughness: 0.58,
    envMapIntensity: 0.37,
    side: THREE.DoubleSide,
  });
  const reflector = new THREE.MeshStandardMaterial({
    color: 0xe99136,
    vertexColors: true,
    roughness: 0.52,
    metalness: 0.08,
    emissive: 0x6a2405,
    emissiveIntensity: 0.13,
    envMapIntensity: 0.25,
  });
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const bolt = new THREE.CylinderGeometry(0.022, 0.022, 0.018, 6, 1);
  const object = new THREE.Object3D();
  const normalMatrix = new THREE.Matrix3();
  const p = new THREE.Vector3(),
    n = new THREE.Vector3();
  const tint = new THREE.Color();
  let postCount = 0,
    reflectorCount = 0;

  class Batch {
    constructor() {
      this.positions = [];
      this.normals = [];
      this.colors = [];
    }
    addGeometry(geometry, matrix, color = 0xffffff) {
      const position = geometry.attributes.position,
        normal = geometry.attributes.normal,
        indices = geometry.index;
      tint.set(color);
      normalMatrix.getNormalMatrix(matrix);
      for (let i = 0; i < (indices?.count || position.count); i++) {
        const index = indices ? indices.getX(i) : i;
        p.fromBufferAttribute(position, index).applyMatrix4(matrix);
        n.fromBufferAttribute(normal, index)
          .applyMatrix3(normalMatrix)
          .normalize();
        this.positions.push(p.x, p.y, p.z);
        this.normals.push(n.x, n.y, n.z);
        this.colors.push(tint.r, tint.g, tint.b);
      }
    }
    quad(a, b, c, e, normalA, normalB, shade) {
      for (const [point, normal] of [
        [a, normalA],
        [b, normalA],
        [c, normalB],
        [b, normalA],
        [e, normalB],
        [c, normalB],
      ]) {
        this.positions.push(point.x, point.y, point.z);
        this.normals.push(normal.x, normal.y, normal.z);
        this.colors.push(shade, shade * 1.015, shade * 1.02);
      }
    }
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(this.positions, 3),
      );
      g.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(this.normals, 3),
      );
      g.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
      g.computeBoundingSphere();
      geometries.add(g);
      return g;
    }
  }

  // A folded W-profile, 0.32 m high and 0.09 m deep, sits 0.54–0.86 m
  // above the road. Positive depth is away from traffic. Fold shading is
  // deliberately subtle: it survives small screens without white light bars.
  const section = [
    [0.014, 0.54, 0.65],
    [0.019, 0.558, 0.77],
    [-0.062, 0.602, 0.89],
    [-0.069, 0.624, 0.83],
    [0.021, 0.697, 0.6],
    [-0.069, 0.77, 0.89],
    [-0.062, 0.792, 0.91],
    [0.019, 0.838, 0.76],
    [0.014, 0.86, 0.67],
  ];
  function railPoint(d, side, row) {
    const [depth, height] = section[row];
    return new THREE.Vector3(
      roadX(d) + side * (10.8 + depth),
      roadY(d) + height,
      -d,
    );
  }
  function railNormal(d, side, row) {
    const a = section[row],
      b = section[row + 1];
    const tangent = new THREE.Vector3(
      (roadX(d + 0.05) - roadX(d - 0.05)) / 0.1,
      (roadY(d + 0.05) - roadY(d - 0.05)) / 0.1,
      -1,
    );
    const across = new THREE.Vector3(side * (b[0] - a[0]), b[1] - a[1], 0);
    const normal = new THREE.Vector3()
      .crossVectors(across, tangent)
      .normalize();
    if (normal.x * side > 0) normal.negate();
    return normal;
  }
  function place(batch, geometry, d, x, y, sx, sy, sz, color, rotateZ = 0) {
    object.position.set(roadX(d) + x, roadY(d) + y, -d);
    object.rotation.set(
      0,
      -Math.atan((roadX(d + 0.05) - roadX(d - 0.05)) / 0.1),
      rotateZ,
    );
    object.scale.set(sx, sy, sz);
    object.updateMatrix();
    batch.addGeometry(geometry, object.matrix, color);
  }
  function box(batch, d, x, y, sx, sy, sz, color) {
    place(batch, cube, d, x, y, sx, sy, sz, color);
  }

  for (let first = start; first < end; first += 100) {
    const last = Math.min(end, first + 100),
      steel = new Batch(),
      markers = new Batch();
    for (const side of [-1, 1]) {
      for (let d = first; d < last; d += 1.25) {
        const next = Math.min(last, d + 1.25);
        const weathering =
          0.95 + 0.035 * Math.sin(d * 0.071) + 0.025 * Math.sin(d * 0.39);
        for (let row = 0; row < section.length - 1; row++) {
          const a = railPoint(d, side, row),
            b = railPoint(d, side, row + 1),
            c = railPoint(next, side, row),
            e = railPoint(next, side, row + 1),
            na = railNormal(d, side, row),
            nb = railNormal(next, side, row);
          // Keep triangle winding traffic-facing on both sides; supplied
          // analytic normals remain continuous at every station/tile border.
          const shade = section[row][2] * weathering;
          if (side === 1) steel.quad(a, b, c, e, na, nb, shade);
          else steel.quad(b, a, e, c, na, nb, shade);
        }
      }
      // U-channel uprights have an open back and visible flange thickness.
      // The front flange is tucked behind the W-beam, not planted in traffic.
      for (let d = Math.ceil(first / 4) * 4; d < last; d += 4) {
        const x = side * 10.94;
        const weather = Math.round(d) % 12 === 0 ? 0x9da7a8 : 0xabb3b3;
        box(steel, d, x, 0.4, 0.026, 1.0, 0.13, weather);
        box(
          steel,
          d - 0.059,
          x + side * 0.057,
          0.4,
          0.14,
          1.0,
          0.012,
          0x929b9c,
        );
        box(
          steel,
          d + 0.059,
          x + side * 0.057,
          0.4,
          0.14,
          1.0,
          0.012,
          0x929b9c,
        );
        box(steel, d, x + side * 0.025, -0.02, 0.23, 0.036, 0.23, 0x747e80);
        // A bracket and a hex head seat the beam against the post.
        box(steel, d, side * 10.86, 0.697, 0.17, 0.08, 0.11, 0x7d898b);
        place(
          steel,
          bolt,
          d,
          side * 10.719,
          0.697,
          1,
          1,
          1,
          0xc0c5c3,
          Math.PI / 2,
        );
        postCount++;
        if (Math.round(d) % 12 === 0) {
          // Recessed amber marker on a dark steel bracket: enough to read
          // at speed without adding another glowing lane boundary.
          box(steel, d, side * 10.86, 0.93, 0.095, 0.16, 0.09, 0x414b4d);
          box(
            markers,
            d + 0.047,
            side * 10.86,
            0.93,
            0.073,
            0.12,
            0.009,
            0xffffff,
          );
          reflectorCount++;
        }
      }
    }
    const tile = new THREE.Group();
    tile.name = `W-beam rail ${first}–${last} m`;
    for (const [batch, material, name] of [
      [steel, metal, "Folded galvanized steel and fasteners"],
      [markers, reflector, "Recessed amber reflectors"],
    ]) {
      if (!batch.positions.length) continue;
      const mesh = new THREE.Mesh(batch.geometry(), material);
      mesh.name = name;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      tile.add(mesh);
    }
    group.add(tile);
    tiles.push({ tile, center: (first + last) / 2 });
  }
  cube.dispose();
  bolt.dispose();
  let disposed = false;
  function update(d, low = false) {
    if (disposed) return;
    for (const { tile, center } of tiles) {
      const delta = center - d;
      tile.visible = delta > -170 && delta < (low ? 600 : 780);
    }
  }
  update(0);
  const stats = {
    sectionMeters: end - start,
    tiles: tiles.length,
    posts: postCount,
    reflectors: reflectorCount,
    drawCallsAllTiles: tiles.reduce((n, t) => n + t.tile.children.length, 0),
    triangles: [...geometries].reduce(
      (n, g) => n + g.attributes.position.count / 3,
      0,
    ),
    ownedGeometryBytes: [...geometries].reduce(
      (n, g) =>
        n +
        Object.values(g.attributes).reduce((a, b) => a + b.array.byteLength, 0),
      0,
    ),
    newTextures: 0,
    newLights: 0,
    shadowDraws: 0,
    minRoadOffset: 10.719,
    railTopAboveRoad: 0.86,
  };
  return {
    root: group,
    update,
    stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      metal.dispose();
      reflector.dispose();
    },
  };
}
