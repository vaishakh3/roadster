import * as THREE from "./vendor/three.module.js";
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const hash = (x, y) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
export function noise(x, y) {
  const a = Math.floor(x),
    b = Math.floor(y),
    u = smooth(x - a),
    v = smooth(y - b);
  return (
    mix(
      mix(hash(a, b), hash(a + 1, b), u),
      mix(hash(a, b + 1), hash(a + 1, b + 1), u),
      v,
    ) *
      2 -
    1
  );
}
function fbm(x, y) {
  return (
    noise(x, y) * 0.58 +
    noise(x * 2.03, y * 2.03) * 0.27 +
    noise(x * 4.09, y * 4.09) * 0.15
  );
}
export function terrainHeight(d, offset, side, canyon, roadY) {
  if (canyon) {
    // Erosion works at three scales: broad buttresses, a steep stratified face,
    // and narrow gullies. Shared sampling keeps LOD/chunk borders watertight.
    const buttress = noise(d * 0.01, side * 7);
    const setback = 31 + buttress * 9;
    const t = Math.max(0, offset - setback);
    const cliff = smooth(Math.min(1, t / (19 + 6 * buttress)));
    const ridge =
      45 +
      fbm(d * 0.003, side * 13) * 27 +
      Math.pow(0.5 + 0.5 * noise(d * 0.01, side * 21), 2) * 38;
    const channel = Math.pow(1 - Math.abs(noise(d * 0.019, offset * 0.006)), 9);
    const gullies = channel * 24 * smooth(Math.min(1, t / 9));
    const raw = cliff * Math.max(18, ridge - gullies);
    const terrace = raw / 10.5,
      band = Math.floor(terrace),
      fraction = terrace - band;
    const stepped = (band + smooth(Math.min(1, fraction / 0.68))) * 10.5;
    const talus = Math.min(t, 7) * 0.33;
    return (
      roadY(d) -
      0.38 +
      talus +
      mix(raw, stepped, 0.55) +
      cliff * noise(d * 0.066, offset * 0.044) * 1.4 +
      Math.max(0, offset - 110) * 0.025 +
      smooth(Math.min(1, Math.max(0, offset - 95) / 150)) *
        (26 + fbm(d * 0.003 + 8, offset * 0.004) * 34)
    );
  }
  // The right bank opens onto the Atlantic. Left-bank promontories sit close
  // enough to establish scale, then rise into forested ridges behind the road.
  const shore =
    side === 1 ? 360 + noise(d * 0.003, 8) * 60 : 47 + noise(d * 0.007, 4) * 7;
  const t = Math.max(0, offset - shore);
  const headland = 0.62 + 0.38 * smooth((noise(d * 0.004, side * 5) + 1) * 0.5);
  const cliff = smooth(
    Math.min(1, t / (side === 1 ? 90 : 26 + noise(d * 0.013, 9) * 8)),
  );
  const ridge = Math.sin(Math.min(1, t / 650) * Math.PI * 0.82);
  const height = 48 + fbm(d * 0.0035, side * 5) * 54;
  const fissure = Math.pow(1 - Math.abs(noise(d * 0.025, offset * 0.012)), 7);
  const detail = fbm(d * 0.018, offset * 0.018) * 12;
  return (
    -8 +
    cliff * (side === 1 ? 8 : 48 * headland) +
    ridge * (height + detail) * (side === 1 ? 0.72 : 1.35) -
    cliff * fissure * (side === 1 ? 4 : 9)
  );
}

// Stratified fracture planes, not scaled spheres: 340 triangles form a crag
// with ledges, an asymmetric crown and angular sides. Reused by instancing.
export function buttressGeometry() {
  const positions = [],
    colors = [],
    uvs = [];
  const levels = [0, 0.09, 0.24, 0.35, 0.51, 0.66, 0.81, 0.91, 1],
    sides = 20;
  function point(i, j) {
    const a = (i / sides) * Math.PI * 2,
      y = levels[j],
      radius =
        (1 - y * 0.3) *
          (1 + 0.12 * Math.sin(i * 2.71) + 0.07 * Math.sin(j * 1.9 + i * 0.8)) +
        (j === 3 || j === 6 ? 0.055 : 0);
    return [
      Math.cos(a) * radius + 0.08 * Math.sin(y * 3),
      y + (j === levels.length - 1 ? 0.06 * Math.sin(i * 1.3) : 0),
      Math.sin(a) * radius,
    ];
  }
  function triangle(a, b, c) {
    for (const p of [a, b, c]) {
      positions.push(...p);
      uvs.push(p[0] * 0.5 + 0.5, p[1]);
      const shade = 0.76 + 0.18 * p[1] + 0.08 * Math.sin(p[1] * 39);
      colors.push(shade, shade * 0.98, shade * 0.95);
    }
  }
  for (let j = 0; j < levels.length - 1; j++)
    for (let i = 0; i < sides; i++) {
      const a = point(i, j),
        b = point((i + 1) % sides, j),
        c = point(i, j + 1),
        e = point((i + 1) % sides, j + 1);
      triangle(a, c, b);
      triangle(b, c, e);
    }
  for (let i = 0; i < sides; i++)
    triangle(
      point(i, levels.length - 1),
      [0.02, 1, 0],
      point((i + 1) % sides, levels.length - 1),
    );
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
// Curved, stratified boulders use shared indexed vertices: normals stay smooth.
export function boulderGeometry(segments = 28, rings = 20, mesa = false) {
  const g = mesa
    ? new THREE.CylinderGeometry(0.74, 1, 2, segments, rings)
    : new THREE.SphereGeometry(1, segments, rings);
  const p = g.attributes.position,
    colors = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      angle = Math.atan2(z, x);
    const fracture = noise(x * 3.1 + y * 0.7, z * 3.6 - y * 0.9);
    const n =
      1 +
      0.12 * Math.sin(angle * 3 + y * 1.7) +
      0.075 * Math.cos(angle * 7 - y * 3) +
      fracture * 0.11;
    const strata = mesa
      ? 1 + 0.045 * Math.sin(y * 18 + Math.sin(angle * 3) * 0.4)
      : 1 + 0.045 * Math.sin(y * 13 + x * 2);
    // Fractured planes keep rubble from reading as rounded balloons, while
    // shared smooth normals retain detail at the silhouette and in side light.
    const cut = mesa
      ? 1
      : Math.min(
          1,
          0.71 / Math.max(0.71, Math.abs(x * 0.8 + z * 0.6)),
          0.76 / Math.max(0.76, Math.abs(x * 0.45 - z * 0.9)),
        );
    p.setXYZ(
      i,
      x * n * strata * cut,
      (mesa ? y : Math.min(0.72, y) * 1.08) +
        (mesa ? 0.07 : 0.065) * Math.sin(x * 4 + z * 3),
      z * n * strata * cut,
    );
    const contact =
      0.78 + 0.22 * smooth(Math.max(0, Math.min(1, (y + 0.8) / 0.7)));
    const shade =
      (0.91 + 0.09 * Math.sin(y * 17 + Math.sin(angle * 3))) * contact;
    colors.push(shade, shade, shade);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  // Merge normal seams/poles by position, without removing UV/index topology.
  const groups = new Map(),
    normal = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)]
      .map((v) => Math.round(v * 1e5))
      .join(",");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  const n = new THREE.Vector3();
  for (const ids of groups.values())
    if (ids.length > 1) {
      n.set(0, 0, 0);
      for (const i of ids)
        n.add(new THREE.Vector3().fromBufferAttribute(normal, i));
      n.normalize();
      for (const i of ids) normal.setXYZ(i, n.x, n.y, n.z);
    }
  return g;
}
export function createTerrainChunk({
  start,
  end,
  side,
  canyon,
  roadX,
  roadY,
  low = false,
}) {
  const cols = low ? 24 : 48,
    rows = low ? 24 : 56,
    width = canyon ? 550 : 900,
    origin = canyon ? 26 : 38;
  const pos = [],
    colors = [],
    normals = [],
    idx = [];
  const base = new THREE.Color(canyon ? 0x79503b : 0x566057),
    top = new THREE.Color(canyon ? 0xd0ad87 : 0x6d7b47);
  const sample = (d, o) => terrainHeight(d, o, side, canyon, roadY);
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) {
      const d = mix(start, end, j / rows),
        offset = origin + Math.pow(i / cols, 1.85) * width;
      const y = sample(d, offset),
        x = roadX(d) + side * offset;
      pos.push(x, y, -d);
      const dyx =
        ((sample(d, offset + 0.2) - sample(d, offset - 0.2)) / 0.4) * side;
      const dyd = (sample(d + 0.2, offset) - sample(d - 0.2, offset)) / 0.4;
      const dx = (roadX(d + 0.2) - roadX(d - 0.2)) / 0.4;
      const n = new THREE.Vector3(-dyx, 1, dyd - dyx * dx).normalize();
      normals.push(n.x, n.y, n.z);
      const band = canyon
        ? 0.42 +
          0.16 * Math.sin(y * 0.37 + noise(d * 0.007, offset * 0.01)) +
          noise(d * 0.08, offset * 0.07) * 0.1
        : Math.max(
            0.05,
            Math.min(
              0.95,
              -0.2 + 0.95 * n.y + fbm(d * 0.025, offset * 0.028) * 0.24,
            ),
          );
      const c = base
        .clone()
        .lerp(top, band)
        .multiplyScalar(0.78 + 0.22 * n.y);
      colors.push(c.r, c.g, c.b);
    }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i,
        b = a + 1,
        c = a + cols + 1,
        e = c + 1;
      if (side === 1) idx.push(a, b, c, b, e, c);
      else idx.push(a, c, b, b, c, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
