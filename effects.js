import * as THREE from "./vendor/three.module.js";
import { PathHistory } from "./stunts.js";

/** Reused world-space ribbons and pooled impact debris: no per-impact mesh allocation. */
export function createRaceEffects(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const capacity = 64,
    emitter = new THREE.Vector3(),
    rearDirection = new THREE.Vector3(),
    sideDirection = new THREE.Vector3(),
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
  // Keep all 36 original event slots available to crashes. Tire spray shares
  // this same draw call but has its own 24-slot ring, capped at 28 particles/s
  // and two emissions/frame. Sustained driving cannot evict impact clouds.
  const eventCloudCount = 36,
    wheelCloudCount = 24,
    cloudCount = eventCloudCount + wheelCloudCount,
    smokeGeo = new THREE.BufferGeometry(),
    smokePositions = new Float32Array(cloudCount * 3),
    smokeSize = new Float32Array(cloudCount),
    smokeAlpha = new Float32Array(cloudCount),
    smokeTint = new Float32Array(cloudCount * 3);
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
  smokeGeo.setAttribute(
    "tint",
    new THREE.BufferAttribute(smokeTint, 3).setUsage(THREE.DynamicDrawUsage),
  );
  const smoke = new THREE.Points(
    smokeGeo,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader:
        "attribute float size;attribute float fade;attribute vec3 tint;varying float a;varying vec3 c;void main(){a=fade;c=tint;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(size*480./max(1.,-p.z),1.,110.);gl_Position=projectionMatrix*p;}",
      fragmentShader:
        "varying float a;varying vec3 c;void main(){vec2 p=gl_PointCoord-.5;float f=(1.-smoothstep(.08,.5,length(p)));gl_FragColor=vec4(c,f*f*a*.5);}",
    }),
  );
  smoke.frustumCulled = false;
  root.add(smoke);
  const clouds = Array.from({ length: cloudCount }, () => ({
    life: 0,
    total: 1,
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    size: 1,
    red: 0.24,
    green: 0.27,
    blue: 0.28,
    opacity: 1,
    growth: 1.8,
    gravity: 0,
    drag: 0,
  }));
  let cloudCursor = 0,
    wheelCursor = 0,
    wheelDebt = 0;
  // 0 = dry asphalt, 1 = wet terminal, 2 = dusty canyon, 3 = sea-spray zone.
  // The sheltered storm gallery stays dry; coastal spray occurs only around
  // exposed broken-bridge approaches and their landing decks.
  function surfaceType(s) {
    if (s.course?.theme === "port") return 1;
    if (s.course?.theme === "canyon") return 2;
    const gaps = s.course?.gaps;
    if (gaps)
      for (let i = 0; i < gaps.length; i++) {
        const gap = gaps[i];
        if (
          (s.d > gap.start - 150 && s.d < gap.start) ||
          (s.d >= gap.end && s.d < gap.end + 130)
        )
          return 3;
      }
    return 0;
  }
  function tintCloud(p, type) {
    p.red = type === 2 ? 0.62 : type === 1 ? 0.62 : 0.55;
    p.green = type === 2 ? 0.48 : type === 1 ? 0.71 : 0.67;
    p.blue = type === 2 ? 0.32 : type === 1 ? 0.77 : 0.7;
  }
  function reset() {
    for (const r of ribbons) {
      r.history.clear();
      r.g.setDrawRange(0, 0);
    }
    for (const p of parts) p.life = 0;
    for (const p of clouds) p.life = 0;
    debris.count = 0;
    smoke.visible = false;
    wheelDebt = 0;
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
    const surface = surfaceType(s);
    const n = type === "hit" ? 18 : type === "land" ? (surface ? 9 : 0) : 4;
    for (let i = 0; i < n; i++) {
      const p = clouds[cloudCursor++ % eventCloudCount],
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
      p.red = 0.24;
      p.green = 0.27;
      p.blue = 0.28;
      p.opacity = 1;
      p.growth = 1.8;
      p.gravity = 0;
      p.drag = 0;
      if (type === "land" && surface) {
        tintCloud(p, surface);
        p.opacity = surface === 3 ? 0.24 : 0.48;
        p.size = surface === 2 ? 0.48 : 0.35;
      }
    }
    if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
  }
  function update(car, s, dt, active, reduced) {
    time += dt;
    car.updateMatrixWorld(true);
    const ground =
      active &&
      !reduced &&
      !s.failed &&
      !s.flight &&
      !s.airborne &&
      s.y < 0.25 &&
      !(s.attachedRamp >= 0) &&
      s.speed > 25;
    const surface = ground ? surfaceType(s) : 0;
    const speedWeight = Math.max(0, Math.min(1, (s.speed - 25) / 45));
    const slide = Math.max(0, Math.min(1, (s.drift || 0) * 1.6));
    const shoulder = Math.max(0, Math.min(1, (Math.abs(s.x) - 7.1) / 1.2));
    const rate =
      surface === 1
        ? 12 + 16 * speedWeight
        : surface === 2
          ? slide > 0.12 || shoulder > 0.05
            ? (slide * 20 + shoulder * 16) * speedWeight
            : 0
          : surface === 3
            ? 7 * speedWeight
            : 0;
    wheelDebt =
      rate > 0
        ? Math.min(2, wheelDebt + Math.min(dt, 0.05) * Math.min(28, rate))
        : 0;
    if (wheelDebt >= 1) {
      // Car-local wheel points and rear axis keep mist on the actual path when
      // the camera, road heading, suspension or drift angle changes.
      rearDirection.set(0, 0, 1).transformDirection(car.matrixWorld);
      sideDirection.set(1, 0, 0).transformDirection(car.matrixWorld);
      for (let count = 0; count < 2 && wheelDebt >= 1; count++) {
        wheelDebt--;
        const index = wheelCursor++,
          side = index % 2 ? 1 : -1;
        const p = clouds[eventCloudCount + (index % wheelCloudCount)];
        emitter.set(side * 1.02, 0.13, 1.65);
        car.localToWorld(emitter);
        p.p.copy(emitter);
        const spread = 1 + (index % 5) * 0.12;
        p.v.copy(rearDirection).multiplyScalar(1.4 + s.speed * 0.055);
        p.v.addScaledVector(sideDirection, side * spread + (s.vx || 0) * 0.08);
        p.v.y += surface === 2 ? 0.2 : 0.42;
        p.life = p.total = surface === 2 ? 0.62 : 0.46;
        p.size = surface === 2 ? 0.2 : 0.16;
        p.growth = surface === 2 ? 1.1 : 0.85;
        p.gravity = surface === 2 ? 0 : 1.5;
        p.drag = 1.7;
        p.opacity = surface === 2 ? 0.3 : surface === 3 ? 0.16 : 0.38;
        tintCloud(p, surface);
      }
    }
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
        p.v.y -= p.gravity * dt;
        if (p.drag) p.v.multiplyScalar(Math.exp(-dt * p.drag));
        p.p.addScaledVector(p.v, dt);
        p.size += dt * p.growth;
      }
      smokePositions[i * 3] = p.p.x;
      smokePositions[i * 3 + 1] = p.p.y;
      smokePositions[i * 3 + 2] = p.p.z;
      smokeSize[i] = p.size;
      smokeAlpha[i] = (p.life / p.total) * p.opacity;
      smokeTint[i * 3] = p.red;
      smokeTint[i * 3 + 1] = p.green;
      smokeTint[i * 3 + 2] = p.blue;
    }
    smoke.visible = visible;
    smokeGeo.attributes.position.needsUpdate = true;
    smokeGeo.attributes.size.needsUpdate = true;
    smokeGeo.attributes.fade.needsUpdate = true;
    smokeGeo.attributes.tint.needsUpdate = true;
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
