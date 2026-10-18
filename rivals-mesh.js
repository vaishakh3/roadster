import * as THREE from "./vendor/three.module.js";
import { roadSlope } from "./run.js";
import { RIVAL_DRIVERS } from "./rivals.js";

/** Three opponents, eight shared draw batches, no texture downloads or lights. */
export function createRivalField(scene) {
  const root = new THREE.Group();
  root.name = "Race field";
  scene.add(root);
  const bodyPoints = [
    [-2.34, 0.72, 0.49, 0.1],
    [-1.9, 0.99, 0.53, 0.18],
    [-1.2, 1.03, 0.57, 0.24],
    [-0.5, 0.97, 0.58, 0.21],
    [0.4, 1.0, 0.59, 0.23],
    [1.3, 1.06, 0.6, 0.25],
    [2.17, 0.96, 0.55, 0.16],
    [2.32, 0.78, 0.52, 0.1],
  ];
  const cross = new THREE.CatmullRomCurve3(
    bodyPoints.map((p) => new THREE.Vector3(p[1], p[2], p[3])),
  );
  const position = [],
    indices = [];
  for (let row = 0; row <= 48; row++) {
    const u = row / 48,
      p = cross.getPoint(u),
      z = -2.34 + u * 4.66;
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      position.push(Math.sin(a) * p.x, p.y + Math.cos(a) * p.z, z);
      if (row < 48 && i < 24) {
        const n = row * 25 + i;
        indices.push(n, n + 25, n + 1, n + 1, n + 25, n + 26);
      }
    }
  }
  const bodyGeometry = new THREE.BufferGeometry();
  bodyGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(position, 3),
  );
  bodyGeometry.setIndex(indices);
  bodyGeometry.computeVertexNormals();
  const paint = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.48,
    roughness: 0.22,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x182a36,
    metalness: 0.48,
    roughness: 0.13,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x101416,
    roughness: 0.88,
  });
  const alloy = new THREE.MeshStandardMaterial({
    color: 0x8a979f,
    metalness: 0.9,
    roughness: 0.3,
  });
  const head = new THREE.MeshStandardMaterial({
    color: 0xd5f4ff,
    emissive: 0xa5dfff,
    emissiveIntensity: 2.5,
  });
  const tail = new THREE.MeshStandardMaterial({
    color: 0xff3b24,
    emissive: 0xff2b13,
    emissiveIntensity: 2.2,
  });
  const vapor = new THREE.MeshBasicMaterial({
    color: 0xcce5e7,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const batches = [];
  function batch(geometry, material, count) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = material !== vapor;
    mesh.receiveShadow = true;
    root.add(mesh);
    batches.push(mesh);
    return mesh;
  }
  const bodies = batch(bodyGeometry, paint, 3);
  const cabins = batch(
    new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    glass,
    3,
  );
  const tires = batch(
    new THREE.CylinderGeometry(0.385, 0.385, 0.24, 20).rotateZ(Math.PI / 2),
    rubber,
    12,
  );
  const rims = batch(
    new THREE.CylinderGeometry(0.27, 0.27, 0.253, 5).rotateZ(Math.PI / 2),
    alloy,
    12,
  );
  const headlights = batch(new THREE.BoxGeometry(0.63, 0.065, 0.06), head, 6);
  const taillights = batch(new THREE.BoxGeometry(0.76, 0.075, 0.06), tail, 6);
  const wings = batch(new THREE.BoxGeometry(1.95, 0.06, 0.3), paint, 3);
  const jets = batch(
    new THREE.ConeGeometry(0.14, 0.8, 8).translate(0, -0.4, 0),
    vapor,
    12,
  );
  const matrix = new THREE.Matrix4(),
    carMatrix = new THREE.Matrix4();
  const dummy = new THREE.Object3D(),
    car = new THREE.Object3D();
  const colors = RIVAL_DRIVERS.map((r) => new THREE.Color(r.color));
  function part(mesh, x, y, z, sx = 1, sy = 1, sz = 1, spin = 0) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(spin, 0, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    matrix.multiplyMatrices(carMatrix, dummy.matrix);
    mesh.setMatrixAt(mesh.count++, matrix);
  }
  const reset = () => {
    for (const b of batches) b.count = 0;
    root.visible = false;
  };
  reset();
  return {
    root,
    reset,
    update(run, coast, dt) {
      for (const b of batches) b.count = 0;
      root.visible = !!run?.rivals?.length && !run.failed;
      if (!root.visible) return;
      for (const [i, r] of run.rivals.entries()) {
        if (
          r.failed ||
          r.exitDistance > 18 ||
          r.d < run.d - 40 ||
          r.d > run.d + 480
        )
          continue;
        car.position.copy(
          coast.worldPos(r.d + (r.exitDistance || 0), r.x, r.y),
        );
        car.rotation.order = "YXZ";
        car.rotation.set(
          r.rampPitch +
            r.flightPitch +
            (r.stuntKind === "flip" ? r.stuntAngle : 0),
          -Math.atan(roadSlope(r.d, run.course)) - r.slipAngle,
          r.bodyRoll + (r.stuntKind === "roll" ? r.stuntAngle : 0),
        );
        car.scale.set(1, 1, 1);
        car.updateMatrix();
        carMatrix.copy(car.matrix);
        const slot = bodies.count;
        part(bodies, 0, 0, 0);
        bodies.setColorAt(slot, colors[i]);
        part(cabins, 0, 0.74, 0.12, 0.78, 0.51, 1.22);
        part(wings, 0, 0.9, 1.86);
        wings.setColorAt(wings.count - 1, colors[i]);
        for (const side of [-1, 1]) {
          part(headlights, side * 0.61, 0.6, -2.18);
          part(taillights, side * 0.55, 0.6, 2.22);
          for (const z of [-1.43, 1.44]) {
            part(tires, side * 1.015, 0.385, z, 1, 1, 1, r.d / 0.385);
            part(rims, side * 1.02, 0.385, z, 1, 1, 1, r.d / 0.385);
            if (
              r.airborne &&
              Math.cos(r.stuntAngle) > 0.5 &&
              (r.lifting || r.flight)
            )
              part(
                jets,
                side * 0.72,
                0.28,
                z,
                1,
                0.8 + Math.sin(r.time * 29 + i) * 0.16,
                1,
              );
          }
        }
      }
      for (const mesh of batches) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    },
    dispose() {
      root.removeFromParent();
      const materials = new Set();
      for (const b of batches) {
        b.geometry.dispose();
        materials.add(b.material);
      }
      for (const m of materials) m.dispose();
    },
  };
}
