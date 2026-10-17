import * as THREE from "./vendor/three.module.js";
import { PathHistory } from "./stunts.js";

/** Reused world-space ribbons and pooled impact debris: no per-impact mesh allocation. */
export function createRaceEffects(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const capacity = 64,
    emitter = new THREE.Vector3(),
    object = new THREE.Object3D();
  let time = 0,
    cursor = 0;
  const ribbons = [-1, 1].map((side) => {
    const g = new THREE.BufferGeometry(),
      positions = new Float32Array(capacity * 6),
      alpha = new Float32Array(capacity * 2),
      edges = new Float32Array(capacity * 2),
      indices = [];
    for (let i = 0; i < capacity; i++) {
      edges[i * 2] = 0;
      edges[i * 2 + 1] = 1;
      if (i < capacity - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    g.setAttribute(
      "fade",
      new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage),
    );
    g.setAttribute("edge", new THREE.BufferAttribute(edges, 1));
    g.setIndex(indices);
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader:
        "attribute float fade;attribute float edge;varying float a;varying float e;void main(){a=fade;e=edge;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying float a;varying float e;void main(){gl_FragColor=vec4(.57,.79,1.,a*(1.-abs(e*2.-1.))*.55);}",
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    root.add(mesh);
    return {
      side,
      g,
      positions,
      alpha,
      mesh,
      history: new PathHistory(capacity, 0.68),
    };
  });
  const debris = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12, 0.045, 0.26),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.65,
      roughness: 0.4,
    }),
    48,
  );
  debris.frustumCulled = false;
  root.add(debris);
  const parts = Array.from({ length: 48 }, () => ({
    life: 0,
    total: 1,
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    floor: 0,
    spin: 0,
  }));
  const smokeGeo = new THREE.BufferGeometry(),
    smokePositions = new Float32Array(36 * 3),
    smokeSize = new Float32Array(36),
    smokeAlpha = new Float32Array(36);
  smokeGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(smokePositions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  smokeGeo.setAttribute(
    "size",
    new THREE.BufferAttribute(smokeSize, 1).setUsage(THREE.DynamicDrawUsage),
  );
  smokeGeo.setAttribute(
    "fade",
    new THREE.BufferAttribute(smokeAlpha, 1).setUsage(THREE.DynamicDrawUsage),
  );
  const smoke = new THREE.Points(
    smokeGeo,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader:
        "attribute float size;attribute float fade;varying float a;void main(){a=fade;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(size*480./max(1.,-p.z),1.,110.);gl_Position=projectionMatrix*p;}",
      fragmentShader:
        "varying float a;void main(){vec2 p=gl_PointCoord-.5;float f=(1.-smoothstep(.08,.5,length(p)));gl_FragColor=vec4(.24,.27,.28,f*f*a*.5);}",
    }),
  );
  smoke.frustumCulled = false;
  root.add(smoke);
  const clouds = Array.from({ length: 36 }, () => ({
    life: 0,
    total: 1,
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    size: 1,
  }));
  let cloudCursor = 0;
  function reset() {
    for (const r of ribbons) {
      r.history.clear();
      r.g.setDrawRange(0, 0);
    }
    for (const p of parts) p.life = 0;
    for (const p of clouds) p.life = 0;
    debris.count = 0;
    smoke.visible = false;
  }
  function emit(type, origin, s) {
    if (!["hit", "land", "launch"].includes(type)) return;
    if (type === "hit")
      for (let i = 0; i < 28; i++) {
        const index = cursor++ % parts.length,
          p = parts[index],
          a = i * 2.399;
        p.p.copy(origin);
        p.p.y += 0.5;
        p.p.x += Math.sin(a) * 0.8;
        p.v.set(
          Math.sin(a) * 7 + s.crashDirection * 3,
          3 + (i % 5) * 0.9,
          Math.cos(a) * 4 - s.speed * 0.32,
        );
        p.life = p.total = 0.7 + (i % 7) * 0.11;
        p.floor = origin.y - Math.max(0, s.y);
        p.spin = a;
        debris.setColorAt(
          index,
          new THREE.Color(
            i % 4 === 0 ? 0xffb351 : i % 3 === 0 ? 0xaebcc2 : 0x1d282d,
          ),
        );
      }
    const n = type === "hit" ? 18 : type === "land" ? 9 : 4;
    for (let i = 0; i < n; i++) {
      const p = clouds[cloudCursor++ % clouds.length],
        a = i * 2.399;
      p.p.copy(origin);
      p.p.y += 0.25;
      p.p.x += Math.sin(a);
      p.v.set(
        Math.sin(a) * 1.8,
        0.7 + (i % 3) * 0.2,
        Math.cos(a) - s.speed * 0.14,
      );
      p.life = p.total = type === "hit" ? 1.3 : 0.55;
      p.size = type === "hit" ? 1.2 : 0.6;
    }
    if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
  }
  function update(car, s, dt, active, reduced) {
    time += dt;
    car.updateMatrixWorld(true);
    for (const r of ribbons) {
      if (active && !reduced && !s.failed && (s.boosting || s.padTime > 0)) {
        emitter.set(r.side * 0.64, 0.43, 2.6);
        car.localToWorld(emitter);
        r.history.push(emitter.x, emitter.y, emitter.z, time);
      } else r.history.expire(time);
      const list = r.history.points;
      for (let i = 0; i < list.length; i++) {
        const p = list[i],
          q = list[Math.min(i + 1, list.length - 1)],
          before = list[Math.max(0, i - 1)];
        const dx = q.x - before.x,
          dz = q.z - before.z,
          len = Math.hypot(dx, dz) || 1,
          fade = Math.max(0, 1 - (time - p.time) / r.history.lifetime),
          w = 0.025 + fade * 0.065;
        for (let k = 0; k < 2; k++) {
          const side = k ? 1 : -1,
            o = (i * 2 + k) * 3;
          r.positions[o] = p.x + (dz / len) * w * side;
          r.positions[o + 1] = p.y;
          r.positions[o + 2] = p.z - (dx / len) * w * side;
          r.alpha[i * 2 + k] = fade * fade;
        }
      }
      r.g.setDrawRange(0, Math.max(0, list.length - 1) * 6);
      r.g.attributes.position.needsUpdate = true;
      r.g.attributes.fade.needsUpdate = true;
    }
    debris.count = parts.length;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.life = Math.max(0, p.life - dt);
      if (p.life) {
        p.v.y -= 14 * dt;
        p.p.addScaledVector(p.v, dt);
        if (p.p.y < p.floor + 0.05) {
          p.p.y = p.floor + 0.05;
          p.v.y = Math.abs(p.v.y) * 0.3;
          p.v.x *= 0.75;
          p.v.z *= 0.75;
        }
        object.position.copy(p.p);
        object.rotation.set(time * 8 + p.spin, time * 6 + p.spin, p.spin);
        object.scale.setScalar(Math.min(1, p.life / 0.25));
      } else object.scale.setScalar(0);
      object.updateMatrix();
      debris.setMatrixAt(i, object.matrix);
    }
    debris.instanceMatrix.needsUpdate = true;
    let visible = false;
    for (let i = 0; i < clouds.length; i++) {
      const p = clouds[i];
      p.life = Math.max(0, p.life - dt);
      if (p.life) {
        visible = true;
        p.p.addScaledVector(p.v, dt);
        p.size += dt * 1.8;
      }
      smokePositions[i * 3] = p.p.x;
      smokePositions[i * 3 + 1] = p.p.y;
      smokePositions[i * 3 + 2] = p.p.z;
      smokeSize[i] = p.size;
      smokeAlpha[i] = p.life / p.total;
    }
    smoke.visible = visible;
    for (const a of Object.values(smokeGeo.attributes)) a.needsUpdate = true;
  }
  reset();
  return {
    reset,
    emit,
    update,
    get trails() {
      return ribbons.map((r) => r.history.points.map((p) => ({ ...p })));
    },
  };
}
