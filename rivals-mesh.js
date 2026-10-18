import * as THREE from "./vendor/three.module.js";
import { roadSlope } from "./run.js";
import { RIVAL_DRIVERS } from "./rivals.js";

// Static details are merged by material before instancing. All three opponents
// share these batches; labels add one inexpensive sprite per visible driver.
function merge(parts) {
  const positions = [],
    normals = [],
    indices = [];
  let offset = 0;
  for (const g of parts) {
    positions.push(...g.attributes.position.array);
    normals.push(...g.attributes.normal.array);
    const count = g.index?.count || g.attributes.position.count;
    for (let i = 0; i < count; i++)
      indices.push(offset + (g.index ? g.index.getX(i) : i));
    offset += g.attributes.position.count;
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(indices);
  return g;
}
const box = (w, h, l, x, y, z) =>
  new THREE.BoxGeometry(w, h, l).translate(x, y, z);
function loft(rows, canopy = false) {
  const p = [],
    indices = [],
    n = 24;
  for (let j = 0; j < rows.length; j++) {
    const [z, w, base, rise] = rows[j];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * (canopy ? 1 : 2);
      p.push(
        canopy ? -Math.cos(a) * w : Math.sin(a) * w,
        base + (canopy ? Math.pow(Math.sin(a), 0.7) : Math.cos(a)) * rise,
        z,
      );
      if (j < rows.length - 1 && i < n) {
        const k = j * (n + 1) + i;
        indices.push(k, k + n + 1, k + 1, k + 1, k + n + 1, k + n + 2);
      }
    }
  }
  if (!canopy)
    for (const j of [0, rows.length - 1]) {
      const c = p.length / 3;
      p.push(0, rows[j][2], rows[j][0]);
      for (let i = 0; i < n; i++) {
        const k = j * (n + 1) + i;
        if (j === 0) indices.push(c, k + 1, k);
        else indices.push(c, k, k + 1);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
function strut(a, b, r = 0.025) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b),
    axis = end.clone().sub(start);
  const g = new THREE.CylinderGeometry(r, r, axis.length(), 6);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      axis.normalize(),
    ),
  );
  return g.translate(...start.add(end).multiplyScalar(0.5).toArray());
}
export function createRivalField(scene) {
  const root = new THREE.Group();
  root.name = "Solid race opponents";
  scene.add(root);
  const paintParts = [
    loft([
      [-2.34, 0.72, 0.48, 0.08],
      [-2.15, 0.92, 0.52, 0.14],
      [-1.65, 1.04, 0.56, 0.21],
      [-1.1, 1.02, 0.58, 0.2],
      [-0.45, 0.96, 0.56, 0.18],
      [0.5, 0.99, 0.57, 0.2],
      [1.3, 1.07, 0.58, 0.22],
      [1.95, 1.01, 0.56, 0.17],
      [2.27, 0.91, 0.52, 0.13],
    ]),
    box(1.88, 0.055, 0.25, 0, 0.91, 1.87),
  ];
  const trimParts = [
    box(1.63, 0.15, 0.12, 0, 0.36, -2.27),
    box(1.58, 0.17, 0.13, 0, 0.35, 2.24),
    box(1.86, 0.035, 0.22, 0, 0.24, -2.23),
    box(1.85, 0.05, 0.4, 0, 0.23, 2.1),
  ];
  for (const side of [-1, 1]) {
    paintParts.push(box(0.2, 0.1, 0.31, side * 1.04, 0.79, -0.6));
    paintParts.push(
      strut([side * 0.68, 0.77, -1.07], [side * 0.74, 1.18, -0.36], 0.032),
    );
    paintParts.push(
      strut([side * 0.72, 1.2, 0.46], [side * 0.57, 0.8, 1.12], 0.04),
    );
    trimParts.push(box(0.055, 0.08, 2.2, side * 0.975, 0.32, 0.04));
    trimParts.push(box(0.025, 0.022, 0.2, side * 0.99, 0.69, 0.38));
    trimParts.push(box(0.045, 0.15, 0.055, side * 0.64, 0.82, 1.86));
    for (const x of [0.23, 0.52, 0.8])
      trimParts.push(box(0.035, 0.11, 0.36, side * x, 0.26, 2.14));
    for (const z of [-1.45, 1.44]) {
      const arch = new THREE.TorusGeometry(0.406, 0.027, 5, 24, Math.PI)
        .rotateY(Math.PI / 2)
        .rotateX(Math.PI / 2)
        .translate(side * 1.025, 0.385, z);
      trimParts.push(arch);
    }
  }
  const paint = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.55,
    roughness: 0.25,
    envMapIntensity: 1.1,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x182b39,
    metalness: 0.5,
    roughness: 0.15,
    envMapIntensity: 1.25,
    side: THREE.DoubleSide,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x111418,
    roughness: 0.86,
  });
  const alloy = new THREE.MeshStandardMaterial({
    color: 0xa2acb4,
    metalness: 0.88,
    roughness: 0.28,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0x10191f,
    metalness: 0.3,
    roughness: 0.55,
  });
  const head = new THREE.MeshStandardMaterial({
    color: 0xd5f4ff,
    emissive: 0xa5dfff,
    emissiveIntensity: 2,
  });
  const tail = new THREE.MeshStandardMaterial({
    color: 0xff3b24,
    emissive: 0xff2b13,
    emissiveIntensity: 2.4,
  });
  const vapor = new THREE.MeshBasicMaterial({
    color: 0xcce5e7,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const batches = [];
  function batch(geometry, material, count, shadows = true) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    root.add(mesh);
    batches.push(mesh);
    return mesh;
  }
  const bodies = batch(merge(paintParts), paint, 3);
  const cabins = batch(
    loft(
      [
        [-1.1, 0.68, 0.76, 0.015],
        [-0.75, 0.73, 0.78, 0.24],
        [-0.35, 0.76, 0.79, 0.43],
        [0.4, 0.74, 0.79, 0.44],
        [0.8, 0.65, 0.79, 0.29],
        [1.17, 0.52, 0.76, 0.02],
      ],
      true,
    ),
    glass,
    3,
  );
  const details = batch(merge(trimParts), trim, 3);
  const tires = batch(
    new THREE.TorusGeometry(0.3, 0.085, 7, 24).rotateY(Math.PI / 2),
    rubber,
    12,
  );
  const rimParts = [
    new THREE.TorusGeometry(0.244, 0.021, 5, 24).rotateY(Math.PI / 2),
    new THREE.CylinderGeometry(0.077, 0.077, 0.16, 12).rotateZ(Math.PI / 2),
  ];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    rimParts.push(
      new THREE.BoxGeometry(0.045, 0.032, 0.24)
        .translate(0, 0, 0.12)
        .rotateX(a),
    );
  }
  const rims = batch(merge(rimParts), alloy, 12);
  const headParts = [],
    tailParts = [];
  for (const side of [-1, 1]) {
    headParts.push(
      box(0.53, 0.055, 0.07, side * 0.61, 0.59, -2.18),
      box(0.11, 0.025, 0.19, side * 0.85, 0.61, -2.06),
    );
    tailParts.push(box(0.73, 0.055, 0.07, side * 0.51, 0.61, 2.255));
  }
  tailParts.push(box(0.2, 0.025, 0.06, 0, 0.73, 2.02));
  const headlights = batch(merge(headParts), head, 3, false),
    taillights = batch(merge(tailParts), tail, 3, false);
  const jets = batch(
    new THREE.ConeGeometry(0.14, 0.8, 8).translate(0, -0.4, 0),
    vapor,
    12,
    false,
  );
  const labels = RIVAL_DRIVERS.map((driver) => {
    let map = new THREE.Texture(),
      updateHealth = () => {};
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 80;
      const c = canvas.getContext("2d");
      c.fillStyle = "#07141cdd";
      c.fillRect(0, 0, 256, 80);
      c.fillStyle = "#" + driver.color.toString(16).padStart(6, "0");
      c.fillRect(0, 0, 5, 80);
      c.font = "600 32px sans-serif";
      c.textAlign = "center";
      c.fillStyle = "#f1f6f7";
      c.fillText(driver.name, 128, 43);
      map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      let previous = -1;
      updateHealth = (hp) => {
        if (hp === previous) return;
        previous = hp;
        for (let j = 0; j < 3; j++) {
          c.fillStyle =
            j < hp
              ? "#" + driver.color.toString(16).padStart(6, "0")
              : "#23333e";
          c.fillRect(44 + j * 58, 59, 52, 6);
        }
        map.needsUpdate = true;
      };
      updateHealth(3);
    }
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map,
        transparent: true,
        depthWrite: false,
        opacity: 0.9,
      }),
    );
    sprite.scale.set(2.4, 0.75, 1);
    sprite.userData.updateHealth = updateHealth;
    sprite.name = driver.name + " driver marker";
    root.add(sprite);
    return sprite;
  });
  const matrix = new THREE.Matrix4(),
    carMatrix = new THREE.Matrix4(),
    dummy = new THREE.Object3D(),
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
  let visibleCount = 0;
  const reset = () => {
    for (const b of batches) b.count = 0;
    for (const label of labels) label.visible = false;
    visibleCount = 0;
    root.visible = false;
  };
  reset();
  return {
    root,
    reset,
    get visibleCount() {
      return visibleCount;
    },
    get batchCount() {
      return batches.length;
    },
    update(run, coast, dt) {
      for (const b of batches) b.count = 0;
      for (const label of labels) label.visible = false;
      visibleCount = 0;
      root.visible = !!run?.rivals?.length;
      if (!root.visible) return;
      for (const [i, r] of run.rivals.entries()) {
        if (
          (r.failed && r.crashAge > 1.1) ||
          r.exitDistance > 18 ||
          r.d < run.d - 45 ||
          r.d > run.d + 480
        )
          continue;
        visibleCount++;
        car.position.copy(
          coast.worldPos(r.d + (r.exitDistance || 0), r.x, r.y),
        );
        car.rotation.order = "YXZ";
        const grade = Math.atan(
          (coast.roadY(r.d + 2) - coast.roadY(r.d - 2)) / 4,
        );
        car.rotation.set(
          (r.airborne ? 0 : grade) +
            r.rampPitch +
            r.flightPitch +
            (r.stuntKind === "flip" ? r.stuntAngle : 0),
          -Math.atan(roadSlope(r.d, run.course)) - r.slipAngle,
          r.bodyRoll + (r.stuntKind === "roll" ? r.stuntAngle : 0),
        );
        if (r.crashAge < 1.1) {
          const impact = Math.max(0, 1 - r.crashAge / 1.1);
          car.rotation.y +=
            Math.sin(r.crashAge * 19) * impact * 0.18 * r.crashDirection;
          car.rotation.z += Math.sin(r.crashAge * 16) * impact * 0.06;
        }
        if (r.failed) {
          const slide = Math.min(1, r.crashAge);
          car.position.x += r.crashDirection * slide * 1.3;
          car.rotation.y += r.crashDirection * slide * 0.4;
        }
        car.scale.setScalar(1);
        car.updateMatrix();
        carMatrix.copy(car.matrix);
        const slot = bodies.count;
        part(bodies, 0, 0, 0);
        bodies.setColorAt(slot, colors[i]);
        part(cabins, 0, 0, 0);
        part(details, 0, 0, 0);
        part(headlights, 0, 0, 0);
        part(taillights, 0, 0, 0);
        for (const side of [-1, 1])
          for (const z of [-1.43, 1.44]) {
            part(tires, side * 1.025, 0.385, z, 1, 1, 1, r.d / 0.385);
            part(rims, side * 1.086, 0.385, z, 1, 1, 1, r.d / 0.385);
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
        const label = labels[i],
          distance = Math.abs(r.d - run.d);
        label.visible = !r.failed && r.d > run.d - 3 && distance < 160;
        if (label.visible) label.userData.updateHealth(r.hull);
        label.position.copy(car.position);
        label.position.y += 2.05;
        label.material.opacity =
          0.92 * (1 - THREE.MathUtils.smoothstep(distance, 100, 160));
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
      for (const label of labels) {
        label.material.map.dispose();
        label.material.dispose();
      }
    },
  };
}
