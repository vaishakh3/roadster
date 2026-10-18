import * as THREE from "./vendor/three.module.js";
import { concreteMaterial } from "./surfaces.js";

/** Hero districts use real silhouettes and recognizable civil infrastructure.
 * Rigid pieces join the venue's existing material/district batches. Only the
 * freighter moves; its local parts are merged once by the venue builder. */
export function addLandmarks({
  course,
  mesh,
  box,
  beamBetween,
  groupAt,
  worldPos,
  root,
  materials: m,
}) {
  const moving = [];
  const v = (...a) => new THREE.Vector3(...a);
  const beam = (a, b, r, parent, material = m.metal) =>
    beamBetween(v(...a), v(...b), r, material, parent);
  const coast = course.theme === "coast",
    canyon = course.theme === "canyon";
  const roughStone = concreteMaterial(canyon ? 0x9b795b : 0x6e7e77);
  const weathered = concreteMaterial(coast ? 0x8c9690 : 0x5a6570);
  const glass = new THREE.MeshStandardMaterial({
    color: 0x203b48,
    roughness: 0.2,
    metalness: 0.68,
  });
  function quay(d, side, span = 100) {
    const g = groupAt(d, side * 18);
    box(13, 9, span, weathered, side * 5, -4.8, 0, g);
    box(13.6, 0.4, span, m.edge, side * 5, -0.2, 0, g);
    for (let z = -span / 2 + 4; z < span / 2; z += 12) {
      box(0.8, 9.3, 0.8, m.dark, -side * 1.8, -4.4, z, g);
      box(0.35, 0.9, 0.35, m.metal, side * 2, 0.3, z, g);
      box(1.5, 0.2, 0.45, m.metal, side * 2, 0.65, z, g);
    }
  }
  function retainingCut(start, end, side, height = 8) {
    for (let d = start; d < end; d += 14) {
      const g = groupAt(d + 7, side * 14.7);
      box(1.5, height, 14.1, roughStone, 0, height / 2 - 0.2, 0, g);
      box(1.75, 0.3, 14.1, m.edge, 0, height, 0, g);
      for (let z = -5; z <= 5; z += 5) {
        box(0.14, height + 0.1, 0.3, weathered, -side * 0.8, height / 2, z, g);
        box(0.18, 0.2, 0.3, m.dark, -side * 0.85, 0.8, z, g);
      }
      for (let y = 2; y < height; y += 2)
        box(0.08, 0.06, 14, m.dark, -side * 0.77, y, 0, g);
    }
  }
  function viaduct(d, span = 100) {
    const g = groupAt(d);
    for (const side of [-1, 1]) {
      box(0.8, 2.4, span, weathered, side * 10.7, -1.5, 0, g);
      for (let z = -span / 2 + 8; z < span / 2; z += 20) {
        box(3.2, 28, 3.2, weathered, side * 8, -16, z, g);
        box(18, 0.8, 3.8, weathered, 0, -3, z, g);
        beam([side * 8, -12, z], [side * 2, -3, z], 0.45, g, weathered);
      }
    }
  }
  if (coast) {
    retainingCut(385, 550, -1, 7);
    retainingCut(1700, 1930, -1, 10);
    retainingCut(4730, 4920, -1, 8);
    for (const d of [865, 1600, 2370, 3180, 4650]) viaduct(d, 110);
    for (const [d, side] of [
      [960, 1],
      [2420, -1],
      [4810, 1],
    ])
      quay(d, side, 110);
    // Enclosed storm portal, salt-worn buttresses, vents and service catwalks.
    for (const d of [182, 378]) {
      const g = groupAt(d);
      box(31, 2.4, 5, weathered, 0, 13.3, 0, g);
      for (const side of [-1, 1]) {
        box(4.5, 14.5, 5, weathered, side * 13, 6.2, 0, g);
        box(0.14, 9, 0.14, m.glow, side * 10.6, 5.5, 2.6, g);
        for (let k = 0; k < 5; k++)
          box(2.6, 0.16, 0.3, m.dark, side * 13, 9 + k * 0.55, 2.6, g);
      }
    }
    for (let d = 204; d < 360; d += 24) {
      const g = groupAt(d);
      box(1.1, 0.5, 23, m.metal, -10.7, 7.9, 0, g);
      box(0.16, 0.16, 23, m.amber, -10.1, 8.8, 0, g);
      for (const side of [-1, 1])
        box(1.2, 0.12, 2.5, m.edge, side * 7.5, 10.9, 0, g);
    }
    // Recognizable bow/chine hull, bridge windows, stacked containers and deck rails.
    const ship = groupAt(1505);
    ship.rotation.y = Math.PI / 2 + 0.12;
    ship.position.y = -4;
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-12, -59);
    hullShape.lineTo(12, -59);
    hullShape.lineTo(13, 40);
    hullShape.quadraticCurveTo(12, 60, 0, 72);
    hullShape.quadraticCurveTo(-12, 60, -13, 40);
    hullShape.closePath();
    const hullGeometry = new THREE.ExtrudeGeometry(hullShape, {
      depth: 8,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 1,
      bevelThickness: 1,
      curveSegments: 12,
    });
    const hull = mesh(hullGeometry, m.dark, ship);
    hull.rotation.x = Math.PI / 2;
    hull.position.y = 6;
    box(23, 1, 106, weathered, 0, 6.2, 0, ship);
    box(20, 10, 21, m.edge, 0, 11, -43, ship);
    box(24, 3, 17, weathered, 0, 17, -43, ship);
    box(23.8, 1.7, 0.12, glass, 0, 17.3, -34.4, ship);
    for (const side of [-1, 1]) {
      box(0.12, 1.7, 15, glass, side * 12.1, 17.3, -43, ship);
      box(0.12, 0.12, 104, m.edge, side * 11.5, 7.8, 0, ship);
      for (let z = -50; z <= 50; z += 8)
        box(0.12, 1.5, 0.12, m.edge, side * 11.5, 7.1, z, ship);
    }
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 3; col++) {
        const x = (col - 1) * 6.6,
          z = row * 16 - 20,
          h = 2.8 + (row % 2) * 2.8;
        box(
          6.2,
          h,
          14.5,
          row % 3 === 0 ? m.orange : row % 3 === 1 ? m.teal : weathered,
          x,
          6.8 + h / 2,
          z,
          ship,
        );
        for (let j = 0; j < 4; j++)
          box(
            0.08,
            h - 0.2,
            0.1,
            m.edge,
            x - 2.4 + j * 1.6,
            6.8 + h / 2,
            z + 7.3,
            ship,
          );
      }
    box(0.4, 9, 0.4, m.metal, 0, 23, -43, ship);
    box(8, 0.2, 0.3, m.edge, 0, 26, -43, ship);
    const shipBase = ship.position.clone();
    moving.push({
      group: ship,
      d: 1505,
      update(time) {
        ship.position.x = shipBase.x + Math.sin(time * 0.055) * 46;
        ship.position.y = -4 + Math.sin(time * 0.25) * 0.3;
        ship.rotation.z = Math.sin(time * 0.21) * 0.008;
      },
    });
  } else if (canyon) {
    retainingCut(1270, 1510, 1, 5.5);
    retainingCut(4180, 4460, -1, 7.5);
    // Cut-stone terraces, protective netting and drainage make the quarry read as
    // a landscape that has been excavated, not scattered primitive meshes.
    for (const d of [1310, 2410, 4260]) {
      const g = groupAt(d, -31);
      for (let tier = 0; tier < 4; tier++) {
        box(11, 3.8, 125, roughStone, -tier * 7, 2 + tier * 5.5, 0, g);
        box(12, 0.25, 126, m.edge, -tier * 7, 4 + tier * 5.5, 0, g);
      }
      for (let z = -54; z <= 54; z += 12) {
        beam([5, 0, z], [1, 12, z], 0.12, g, m.metal);
        for (let y = 2; y < 12; y += 2)
          box(0.06, 0.06, 12, m.metal, 5 - y * 0.33, y, z + 6, g);
      }
      for (let j = 0; j < 6; j++) {
        const fallen = mesh(
          new THREE.DodecahedronGeometry(1.5 + (j % 3) * 0.5, 1),
          roughStone,
          g,
        );
        fallen.position.set(8 + (j % 2) * 2, 1.1, j * 12 - 30);
        fallen.scale.set(1.7, 0.7, 1.2);
        fallen.rotation.set(j * 0.2, j * 0.7, 0);
      }
    }
    // A conveyor passes above the mine lane, comfortably above flight clearance.
    const g = groupAt(4340);
    for (const side of [-1, 1]) {
      box(1.2, 23, 1.5, m.metal, side * 23, 11, 0, g);
      beam([side * 23, 0, -6], [side * 23, 22, 5], 0.25, g);
      box(2, 1.4, 78, weathered, side * 32, 20, 0, g);
    }
    box(68, 2, 5.5, weathered, 0, 23, 0, g);
    for (let x = -30; x < 32; x += 4) {
      beam([x, 22, 3], [x + 4, 25, 3], 0.12, g);
      box(0.12, 3, 0.12, m.metal, x, 23.5, 3, g);
    }
  } else {
    // The roadway becomes the roof of a low freight terminal after the large
    // dock jump. The deck remains the existing road, so collision cannot drift.
    for (const [start, end] of [
      [2570, 2670],
      [5170, 5300],
    ]) {
      for (let d = start; d < end; d += 20) {
        const g = groupAt(d + 10);
        box(30, 13, 20.1, weathered, 0, -7, 0, g);
        box(31, 0.7, 20.2, m.edge, 0, -0.65, 0, g);
        for (const side of [-1, 1]) {
          box(0.5, 1, 20, m.dark, side * 15.2, -0.25, 0, g);
          box(0.08, 0.12, 20, m.violet, side * 14.9, 0.35, 0, g);
          box(7, 1.8, 6, m.metal, side * 19, -0.1, 0, g);
          for (let y = -10; y < -2; y += 3)
            box(0.1, 1.5, 14, glass, side * 15.05, y, 0, g);
        }
      }
    }
    for (const d of [1680, 2850, 5490]) {
      quay(d, -1, 140);
      const g = groupAt(d, 34);
      box(28, 17, 110, weathered, 0, 8, 0, g);
      box(30, 0.65, 113, m.metal, 0, 16.8, 0, g);
      for (let z = -44; z <= 44; z += 22) {
        box(0.15, 10, 16, m.dark, -14.1, 5, z, g);
        box(0.16, 0.2, 15, m.amber, -14.2, 10.2, z, g);
        for (let y = 2; y < 10; y += 1.5)
          box(0.17, 0.06, 15, m.metal, -14.2, y, z, g);
        box(2, 0.35, 17, m.edge, -15, 0.1, z, g);
      }
      for (let z = -40; z <= 40; z += 20) {
        box(5, 1.8, 7, m.dark, 4, 18, z, g);
        box(12, 0.16, 0.2, m.amber, -8, 17.2, z, g);
      }
    }
    // High cables and narrow poles layer the city without creating road hazards.
    for (let d = 420; d < course.length; d += 370) {
      const g = groupAt(d);
      for (const side of [-1, 1]) {
        box(0.22, 17, 0.22, m.metal, side * 15, 8.5, 0, g);
        beam([side * 15, 16, 0], [side * 19, 15, -100], 0.035, g, m.dark);
      }
      beam([-15, 15, 0], [0, 13, 0], 0.04, g, m.dark);
      beam([0, 13, 0], [15, 15, 0], 0.04, g, m.dark);
    }
  }
  return {
    moving,
    update(time, d) {
      for (const item of moving) {
        item.group.visible = Math.abs(item.d - d) < 1500;
        if (item.group.visible) item.update(time);
      }
    },
  };
}
