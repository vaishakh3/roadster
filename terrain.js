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
    // Talus at the verge, then a steep cut and eroded shelves. Slow variations
    // establish whole canyon walls; fine gullies interrupt their silhouette.
    const setback = 28 + noise(d * 0.006, side * 7) * 7;
    const t = Math.max(0, offset - setback);
    const cliff = smooth(Math.min(1, t / 34));
    const ridge = 45 + fbm(d * 0.006, side * 13) * 27;
    const channel = Math.pow(Math.abs(noise(d * 0.024, offset * 0.012)), 2.2);
    const gullies = channel * 17 + noise(d * 0.072, offset * 0.047) * 2;
    const bench = Math.sin(t * 0.1 + noise(d * 0.012, side) * 0.8) * 2.2;
    const talus = Math.min(t, 10) * 0.2;
    return (
      roadY(d) -
      0.38 +
      talus +
      cliff * (ridge - gullies + bench) +
      Math.max(0, offset - 110) * 0.037
    );
  }
  const t = Math.max(0, offset - 57);
  const rise = Math.sin(Math.min(1, t / 620) * Math.PI * 0.85);
  const ridge = 70 + fbm(d * 0.0035, side * 5) * 85;
  const detail = fbm(d * 0.021, offset * 0.021) * 16;
  const drainage = Math.pow(Math.abs(noise(d * 0.013, offset * 0.012)), 2) * 18;
  return (
    -10 +
    rise * (ridge + detail - drainage) * (side === 1 ? 0.6 : 1) +
    smooth(Math.min(1, t / 25)) * 6
  );
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
      : Math.min(1, 0.78 / Math.max(0.78, Math.abs(x * 0.8 + z * 0.6)));
    p.setXYZ(
      i,
      x * n * strata * cut,
      y + (mesa ? 0.07 : 0.12) * Math.sin(x * 4 + z * 3),
      z * n * strata * cut,
    );
    const shade = 0.91 + 0.09 * Math.sin(y * 17 + Math.sin(angle * 3));
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
  const cols = low ? 24 : 44,
    rows = low ? 24 : 48,
    width = canyon ? 550 : 900,
    origin = canyon ? 26 : 57;
  const pos = [],
    colors = [],
    normals = [],
    idx = [];
  const base = new THREE.Color(canyon ? 0x8c6048 : 0x293c2d),
    top = new THREE.Color(canyon ? 0xc69d78 : 0x62734a);
  const sample = (d, o) => terrainHeight(d, o, side, canyon, roadY);
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) {
      const d = mix(start, end, j / rows),
        offset = origin + Math.pow(i / cols, 1.7) * width;
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
        ? 0.48 +
          0.16 * Math.sin(y * 0.37) +
          noise(d * 0.08, offset * 0.07) * 0.12
        : Math.max(
            0.05,
            Math.min(
              0.95,
              0.14 + 0.65 * n.y + fbm(d * 0.025, offset * 0.028) * 0.35,
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
