import * as THREE from "./vendor/three.module.js";

// Unit-height trees: one shared geometry per species/LOD, instanced in forest
// districts. Crowns use alpha-tested branch cards, never transparent sorting.
export function treeCrownGeometry(broadleaf = false, low = false) {
  const positions = [],
    normals = [],
    uvs = [],
    colors = [],
    indices = [];
  function card(cx, cy, cz, width, height, angle, tilt, tile, shade) {
    const tangent = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    const up = new THREE.Vector3(
      Math.sin(angle) * Math.sin(tilt),
      Math.cos(tilt),
      Math.cos(angle) * Math.sin(tilt),
    );
    const face = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const left = tile % 2 ? 0.512 : 0.012,
      bottom = tile < 2 ? 0.512 : 0.012;
    const start = positions.length / 3;
    for (const [x, y] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [0.5, 0.5],
    ]) {
      positions.push(
        cx + tangent.x * x * width + up.x * y * height,
        cy + up.y * y * height,
        cz + tangent.z * x * width + up.z * y * height,
      );
      // Soft outward/upward normals stop each card reading as a flat rectangle.
      const normal = face
        .clone()
        .multiplyScalar(0.55)
        .add(
          new THREE.Vector3(
            (cx + x * width * 0.2) * 1.6,
            0.65 + y * 0.35,
            cz * 1.6,
          ),
        )
        .normalize();
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(left + (x + 0.5) * 0.476, bottom + (y + 0.5) * 0.476);
      const light = shade + (y + 0.5) * 0.13;
      colors.push(light, light, light);
    }
    indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
  }
  if (broadleaf) {
    // Offset branch fans form a wind-shaped crown, with gaps revealing limbs.
    const count = low ? 9 : 30;
    for (let i = 0; i < count; i++) {
      const a = i * 2.399963,
        t = i / (count - 1),
        ring = Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.5) * 1.8, 2))),
        radius = (0.12 + 0.18 * ring) * (i % 3 === 0 ? 0.7 : 1),
        y = 0.46 + t * 0.43,
        width = low ? 0.44 : 0.29 + (i % 4) * 0.025,
        height = low ? 0.31 : 0.23 + (i % 3) * 0.025;
      card(
        Math.sin(a) * radius,
        y,
        Math.cos(a) * radius,
        width,
        height,
        a + (i % 2) * 0.4,
        ((i % 3) - 1) * 0.35,
        2 + (i % 2),
        0.83 + t * 0.08,
      );
    }
  } else {
    const tiers = low ? 4 : 8,
      rays = low ? 3 : 5;
    for (let tier = 0; tier < tiers; tier++) {
      const t = tier / (tiers - 1),
        y = 0.23 + t * 0.67 + Math.sin(tier * 2.7) * 0.018,
        radius = Math.pow(1 - t, 0.72) * 0.24 + 0.035;
      for (let ray = 0; ray < rays; ray++) {
        const a = (ray * Math.PI * 2) / rays + tier * 2.399963;
        const asym = 0.88 + 0.14 * Math.sin(tier * 2.11 + ray * 3.7);
        card(
          Math.sin(a) * radius * 0.42,
          y + Math.sin(ray * 3.2 + tier) * 0.018,
          Math.cos(a) * radius * 0.42,
          radius * (low ? 2.5 : 2.3) * asym,
          low ? 0.36 : 0.29 - t * 0.075,
          a,
          0.18 + (ray % 3) * 0.18,
          (tier + ray) % 2,
          0.78 + t * 0.13,
        );
      }
    }
    for (let i = 0; i < (low ? 2 : 3); i++)
      card(
        Math.sin(i * 2.1) * 0.025,
        0.92,
        Math.cos(i * 2.1) * 0.025,
        0.17,
        0.2,
        i * 2.1,
        0.25,
        0,
        1,
      );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function treeTrunkGeometry(broadleaf = false) {
  const positions = [],
    normals = [],
    uvs = [];
  const direction = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0),
    q = new THREE.Quaternion();
  function branch(a, b, r1, r2, sides = 6) {
    direction.subVectors(b, a);
    q.setFromUnitVectors(up, direction.clone().normalize());
    const g = new THREE.CylinderGeometry(
      r2,
      r1,
      direction.length(),
      sides,
      1,
    ).toNonIndexed();
    g.applyQuaternion(q);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    positions.push(...g.attributes.position.array);
    normals.push(...g.attributes.normal.array);
    uvs.push(...g.attributes.uv.array);
    g.dispose();
  }
  branch(
    new THREE.Vector3(0, -0.04, 0),
    new THREE.Vector3(0.015, 0.56, 0),
    0.022,
    0.009,
    8,
  );
  branch(
    new THREE.Vector3(0.015, 0.56, 0),
    new THREE.Vector3(0.045, broadleaf ? 0.83 : 1, 0.018),
    0.009,
    0.002,
    6,
  );
  for (let i = 0; i < (broadleaf ? 7 : 5); i++) {
    const a = i * 2.399963,
      y = 0.3 + i * 0.055,
      r = broadleaf ? 0.24 : 0.19 - i * 0.018;
    branch(
      new THREE.Vector3(0.012, y, 0),
      new THREE.Vector3(
        Math.sin(a) * r,
        y + (broadleaf ? 0.2 : 0.06),
        Math.cos(a) * r,
      ),
      0.008,
      0.002,
      5,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return geometry;
}
