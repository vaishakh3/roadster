import * as THREE from "./vendor/three.module.js";

// Authored roadside architecture. The world builder merges these rigid parts
// into its existing material/district batches, keeping detail off the hot path.
export function addSetpieces({
  course,
  mesh,
  box,
  beamBetween,
  groupAt,
  materials: m,
}) {
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const beam = (a, b, r, parent, material = m.metal) =>
    beamBetween(v(...a), v(...b), r, material, parent);
  function truss(d, height, span, tint) {
    const g = groupAt(d);
    for (const side of [-1, 1]) {
      box(0.55, height, 0.6, m.metal, (side * span) / 2, height / 2, 0, g);
      box(2.3, 0.5, 2.3, m.concrete, (side * span) / 2, 0.25, 0, g);
      beam(
        [(side * span) / 2, height - 5, 0],
        [side * (span / 2 - 4), height, 0],
        0.17,
        g,
      );
    }
    box(span, 0.4, 0.4, m.metal, 0, height, 0, g);
    box(span, 0.3, 0.3, m.metal, 0, height + 1.8, 0, g);
    for (let x = -span / 2; x < span / 2; x += 3)
      beam(
        [x, height, 0],
        [Math.min(span / 2, x + 3), height + 1.8, 0],
        0.09,
        g,
      );
    box(span - 3, 0.065, 0.16, tint, 0, height - 0.26, 0, g);
    return g;
  }
  if (course.theme === "coast") {
    // Open storm galleries: repeated angled ribs cast long moving shadows.
    for (const [start, end] of [
      [210, 355],
      [1670, 1790],
      [2600, 2735],
    ]) {
      for (let d = start; d <= end; d += 18) {
        const g = truss(d, 16, 27, m.edge);
        for (const side of [-1, 1]) {
          box(0.2, 0.3, 18, m.metal, side * 13.5, 12, -9, g);
          beam([side * 13.5, 2, 0], [side * 13.5, 12, -18], 0.1, g);
          box(4, 0.14, 17.5, m.concrete, side * 11.2, 16.8, -9, g);
        }
      }
    }
    for (const d of [430, 1230, 2530, 3250]) {
      const g = groupAt(d, -35);
      box(26, 1, 38, m.concrete, 0, -1, 0, g);
      box(17, 6, 14, m.edge, 0, 3, -5, g);
      box(19, 0.5, 16, m.dark, 0, 6, -5, g);
      for (let x = -6; x <= 6; x += 3) {
        box(2.2, 3.3, 0.1, m.teal, x, 3.4, 2.1, g);
        box(0.1, 3.5, 0.2, m.metal, x + 1.1, 3.4, 2.2, g);
      }
      const dish = mesh(
        new THREE.SphereGeometry(1.8, 16, 8, 0, Math.PI * 2, 0, 0.7),
        m.edge,
        g,
      );
      dish.position.set(4, 8, -5);
      dish.rotation.z = -0.7;
      box(0.18, 7, 0.18, m.metal, -4, 9, -5, g);
      for (const side of [-1, 1]) {
        box(0.13, 0.13, 36, m.metal, side * 12, 0.7, 0, g);
        for (let z = -16; z <= 16; z += 4)
          box(0.13, 1.4, 0.13, m.metal, side * 12, 0, z, g);
      }
    }
  } else if (course.theme === "canyon") {
    for (const t of course.tunnels) {
      for (let d = t.start - 8; d <= t.end + 8; d += 20) {
        const g = truss(d, 10.3, 25, m.amber);
        for (const side of [-1, 1])
          box(0.16, 0.25, 20, m.dark, side * 12.5, 7.5, -10, g);
      }
    }
    for (const d of [1450, 2510, 3300]) {
      const g = groupAt(d, -42);
      for (let x = 0; x < 3; x++) {
        const tank = mesh(
          new THREE.CylinderGeometry(3.5, 3.5, 16, 16),
          m.edge,
          g,
        );
        tank.position.set(x * 9, 8, 0);
        box(1.2, 18, 0.18, m.dark, x * 9, 9, 3.6, g);
        for (let y = 1; y < 17; y += 1.3)
          box(1.3, 0.1, 0.3, m.metal, x * 9, y, 3.8, g);
      }
      box(25, 0.4, 4, m.metal, 9, 16.3, 0, g);
      for (let i = 0; i < 5; i++) {
        const panel = box(6, 0.12, 9, m.teal, i * 7 - 7, 2, 17, g);
        panel.rotation.x = -0.4;
        box(0.2, 2, 0.2, m.metal, i * 7 - 7, 1, 17, g);
      }
    }
  } else {
    // Dock gantries and overhead conveyors frame the wet terminal straight.
    for (const [start, end] of [
      [145, 340],
      [1970, 2110],
      [3830, 3980],
    ]) {
      for (let d = start; d <= end; d += 26) {
        const g = truss(d, 18, 30, m.violet);
        for (const side of [-1, 1]) {
          box(0.3, 0.3, 26, m.metal, side * 15, 18, -13, g);
          beam([side * 15, 12, 0], [side * 15, 18, -26], 0.13, g);
        }
      }
    }
    for (const d of [480, 1540, 2180, 3100]) {
      const g = truss(d, 21, 48, m.amber);
      box(48, 2.5, 5, m.teal, 0, 23.3, 0, g);
      for (let x = -21; x < 23; x += 3) {
        box(0.12, 1.3, 0.12, m.edge, x, 25.3, 2.7, g);
        box(2.7, 0.1, 0.12, m.edge, x + 1.4, 25.9, 2.7, g);
      }
      for (const side of [-1, 1]) {
        const tower = box(8, 28, 8, m.dark, side * 27, 14, 0, g);
        tower.castShadow = true;
        for (let y = 5; y < 28; y += 5)
          box(8.1, 0.18, 8.1, m.amber, side * 27, y, 0, g);
      }
    }
  }
  // Drainage, expansion covers and directional chevrons ground the roadway in
  // recognizable road engineering. Each group joins the existing rigid batches.
  for (let d = 85; d < course.length; d += 80) {
    if (course.gaps.some((g) => d > g.start - 15 && d < g.end + 15)) continue;
    const g = groupAt(d);
    for (const side of [-1, 1]) {
      box(0.7, 0.018, 1.9, m.dark, side * 9.65, 0.132, 0, g);
      for (let z = -0.75; z < 0.9; z += 0.25)
        box(0.62, 0.022, 0.055, m.metal, side * 9.65, 0.145, z, g);
    }
  }
  for (let d = 150; d < course.length; d += 210) {
    if (course.gaps.some((g) => d > g.start - 100 && d < g.end + 100)) continue;
    const [a, b, c, e] = course.curve;
    const curvature =
      (-a * Math.sin(d / b)) / (b * b) - (c * Math.sin(d / e)) / (e * e);
    if (Math.abs(curvature) < 0.00035) continue;
    const side = curvature > 0 ? -1 : 1;
    for (let k = 0; k < 3; k++) {
      const g = groupAt(d + k * 17, side * 11.6);
      box(0.12, 2.4, 0.12, m.metal, 0, 1.2, 0, g);
      box(1.25, 1.1, 0.12, m.dark, 0, 2.3, 0, g);
      for (const vertical of [-1, 1]) {
        const stripe = box(
          0.14,
          0.7,
          0.04,
          m.amber,
          -side * 0.12,
          2.3 + vertical * 0.21,
          0.09,
          g,
        );
        stripe.rotation.z = side * vertical * 0.7;
      }
    }
  }
  // Recessed roadside reflectors make corner direction legible at speed.
  for (let d = 120; d < course.length; d += 95) {
    if (course.gaps.some((g) => d > g.start && d < g.end)) continue;
    const g = groupAt(d);
    for (const side of [-1, 1]) {
      box(0.14, 0.65, 0.18, m.dark, side * 10.7, 0.6, 0, g);
      box(
        0.16,
        0.15,
        0.05,
        side === 1 ? m.amber : m.glow,
        side * 10.7,
        0.85,
        0.11,
        g,
      );
    }
  }
}
