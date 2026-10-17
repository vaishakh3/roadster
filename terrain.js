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
    const t = Math.max(0, offset - 26);
    const cliff = smooth(Math.min(1, t / 45));
    const ridge = 44 + fbm(d * 0.009, side * 13) * 23;
    const flutes =
      noise(d * 0.047, offset * 0.026) * 8 +
      noise(d * 0.14, offset * 0.09) * 2.2;
    const shelf = Math.sin(t * 0.065 + noise(d * 0.018, side) * 0.6) * 3;
    return (
      roadY(d) -
      0.38 +
      cliff * (ridge + flutes + shelf) +
      Math.max(0, offset - 100) * 0.042
    );
  }
  const t = Math.max(0, offset - 57);
  const rise = Math.sin(Math.min(1, t / 620) * Math.PI * 0.85);
  const ridge = 65 + fbm(d * 0.004, side * 5) * 85;
  const detail = fbm(d * 0.027, offset * 0.029) * 17;
  return (
    -10 +
    rise * (ridge + detail) * (side === 1 ? 0.6 : 1) +
    smooth(Math.min(1, t / 25)) * 6
  );
}
// Curved, stratified boulders use shared indexed vertices: normals stay smooth.
export function boulderGeometry(segments = 28, rings = 20, mesa = false) {
  const g = mesa
    ? new THREE.CylinderGeometry(0.48, 1, 2, segments, rings)
    : new THREE.SphereGeometry(1, segments, rings);
  const p = g.attributes.position,
    colors = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      angle = Math.atan2(z, x);
    const n =
      1 +
      0.1 * Math.sin(angle * 5 + y * 3) +
      0.055 * Math.cos(angle * 9 - y * 5) +
      0.035 * Math.sin(angle * 13 + y * 11);
    const strata = mesa
      ? 1 + 0.065 * Math.sin(y * 22 + Math.sin(angle * 3) * 0.4)
      : 1;
    p.setXYZ(
      i,
      x * n * strata,
      y + (mesa ? 0.07 : 0.12) * Math.sin(x * 4 + z * 3),
      z * n * strata,
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
  const base = new THREE.Color(canyon ? 0x916046 : 0x424f43),
    top = new THREE.Color(canyon ? 0xc99969 : 0x83917a);
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
        : 0.2 + 0.7 * n.y;
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
