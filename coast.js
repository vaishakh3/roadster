import * as THREE from "./vendor/three.module.js";
import {
  LENGTH,
  GAPS,
  GATES,
  OBSTACLES,
  inGap,
  roadX,
  roadSlope,
} from "./run.js";
const ROAD_Y = 22;
export function createCoast(scene, renderer) {
  const root = new THREE.Group();
  scene.add(root);
  scene.fog = new THREE.FogExp2(0xa3c8ca, 0.00125);
  const mat = (color, roughness = 0.8) =>
    new THREE.MeshStandardMaterial({ color, roughness });
  const asphalt = mat(0x283a40),
    edge = mat(0xe9e3cc),
    orange = mat(0xf56735),
    teal = mat(0x177c7a),
    concrete = mat(0xc9d1c7),
    dark = mat(0x172c34);
  const glow = new THREE.MeshBasicMaterial({ color: 0x88ffee });
  const materials = { asphalt, edge, orange, teal, concrete, dark, glow };
  const up = new THREE.Vector3(0, 1, 0),
    object = new THREE.Object3D();
  function mesh(g, m, parent = root) {
    const o = new THREE.Mesh(g, m);
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function box(w, h, d, m, x, y, z, parent = root) {
    const o = mesh(new THREE.BoxGeometry(w, h, d), m, parent);
    o.position.set(x, y, z);
    return o;
  }
  function worldPos(d, x = 0, y = 0) {
    return new THREE.Vector3(roadX(d) + x, ROAD_Y + y, -d);
  }
  function roadRibbon(
    x1,
    x2,
    y,
    material,
    start = -100,
    end = LENGTH + 230,
    skipGaps = true,
  ) {
    if (x1 > x2) [x1, x2] = [x2, x1];
    const p = [],
      idx = [];
    let n = 0;
    for (let d = start; d < end; d += 5) {
      const next = Math.min(end, d + 5);
      if (skipGaps && (inGap(d + 0.1) || inGap(next - 0.1))) continue;
      p.push(
        roadX(d) + x1,
        ROAD_Y + y,
        -d,
        roadX(d) + x2,
        ROAD_Y + y,
        -d,
        roadX(next) + x1,
        ROAD_Y + y,
        -next,
        roadX(next) + x2,
        ROAD_Y + y,
        -next,
      );
      idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      n += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return mesh(g, material);
  }
  roadRibbon(-11, 11, -0.08, concrete);
  roadRibbon(-10, 10, 0, asphalt);
  for (const side of [-1, 1]) {
    roadRibbon(side * 9.15, side * 9.27, 0.025, edge);
    roadRibbon(side * 10.25, side * 10.8, 0.04, orange);
  }
  // Quiet seams and runway-like edge studs communicate speed without clutter.
  const studs = [];
  const dashed = [];
  for (let d = -60; d < LENGTH + 180; d += 12)
    if (!inGap(d)) {
      for (const side of [-1, 1]) studs.push({ d, x: side * 9.7, y: 0.12 });
      if (!inGap(d + 4)) dashed.push({ d, x: 0, y: 0.018 });
    }
  function instances(geometry, material, items, scale = () => [1, 1, 1]) {
    const inst = new THREE.InstancedMesh(geometry, material, items.length);
    items.forEach((a, i) => {
      object.position.copy(worldPos(a.d, a.x, a.y));
      object.rotation.set(0, -Math.atan(roadSlope(a.d)), 0);
      object.scale.set(...scale(a, i));
      object.updateMatrix();
      inst.setMatrixAt(i, object.matrix);
    });
    inst.computeBoundingSphere();
    inst.receiveShadow = true;
    root.add(inst);
    return inst;
  }
  instances(new THREE.BoxGeometry(0.18, 0.16, 0.55), glow, studs);
  instances(new THREE.BoxGeometry(0.07, 0.01, 3.5), edge, dashed);
  const railItems = [];
  for (let d = -50; d < LENGTH + 200; d += 8)
    if (!inGap(d) && !inGap(d + 8))
      for (const side of [-1, 1])
        railItems.push({ d: d + 4, x: side * 10.8, y: 0.48 });
  instances(new THREE.BoxGeometry(0.15, 0.17, 8.1), concrete, railItems);
  const supportItems = [];
  for (let d = 0; d < LENGTH; d += 60)
    if (!inGap(d))
      for (const side of [-1, 1]) supportItems.push({ d, x: side * 7, y: -12 });
  instances(new THREE.BoxGeometry(1.8, 24, 3.8), concrete, supportItems);
  const gateMeshes = [];
  GATES.forEach((g, i) => {
    const group = new THREE.Group();
    group.position.copy(worldPos(g.d, g.x, g.y ? 6.3 : 3.3));
    root.add(group);
    group.rotation.y = -Math.atan(roadSlope(g.d));
    const rim = mesh(new THREE.TorusGeometry(3.25, 0.18, 5, 6), teal, group);
    rim.rotation.z = Math.PI / 6;
    const light = mesh(new THREE.TorusGeometry(3.22, 0.055, 4, 6), glow, group);
    light.rotation.z = Math.PI / 6;
    light.position.z = 0.2;
    const pips = [];
    for (let j = 0; j < 3; j++) {
      const p = box(0.3, 0.12, 0.16, glow, (j - 1) * 0.52, 3.12, 0.18, group);
      pips.push(p);
    }
    gateMeshes.push({ group, light, index: i });
  });
  const barrierMeshes = [];
  OBSTACLES.forEach((o) => {
    const group = new THREE.Group();
    group.position.copy(worldPos(o.d, o.x));
    group.rotation.y = -Math.atan(roadSlope(o.d));
    root.add(group);
    const slab = box(o.w, 1.65, 2.7, orange, 0, 0.825, 0, group);
    slab.castShadow = true;
    box(o.w + 0.2, 0.18, 2.85, edge, 0, 1.7, 0, group);
    for (let x = -o.w / 2 + 0.4; x < o.w / 2; x += 1.05) {
      const stripe = box(0.28, 1.4, 0.035, dark, x, 0.85, 1.37, group);
      stripe.rotation.z = -0.42;
    }
    for (const side of [-1, 1]) {
      box(0.1, 0.75, 0.1, dark, side * (o.w / 2 - 0.3), 2, 0, group);
      box(0.23, 0.16, 0.23, glow, side * (o.w / 2 - 0.3), 2.4, 0, group);
    }
    barrierMeshes.push(group);
  });
  // Orange runway bands mark every takeoff. No invisible jump triggers.
  for (const gap of GAPS) {
    for (let n = 0; n < 5; n++) {
      const d = gap.start - 8 - n * 9;
      roadRibbon(-8.5, 8.5, 0.035, orange, d, d + 1, false);
    }
    for (const side of [-1, 1]) {
      const p = worldPos(gap.start - 2, side * 11.4);
      box(0.5, 6, 0.6, orange, p.x, ROAD_Y + 3, p.z);
      box(1.1, 0.3, 1, glow, p.x, ROAD_Y + 6, p.z);
    }
  }
  // Sculptural sea-bridge portals: the route has a changing silhouette, not a flat runway.
  const portalMaterial = mat(0xe7ddd0);
  for (const d of [100, 830, 1250, 1640, 2070, 2420, 2820, 3210, 3610]) {
    const group = new THREE.Group();
    group.position.copy(worldPos(d));
    group.rotation.y = -Math.atan(roadSlope(d));
    root.add(group);
    for (const side of [-1, 1]) {
      const col = box(1.25, 35, 2.8, portalMaterial, side * 17, 8, 0, group);
      col.rotation.z = side * 0.17;
      col.castShadow = true;
      box(0.45, 24, 0.7, orange, side * 17.1, 8, 1.6, group).rotation.z =
        side * 0.17;
    }
    const arc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-14, 25, 0),
      new THREE.Vector3(-7, 30, 0),
      new THREE.Vector3(0, 31, 0),
      new THREE.Vector3(7, 30, 0),
      new THREE.Vector3(14, 25, 0),
    ]);
    mesh(
      new THREE.TubeGeometry(arc, 20, 0.9, 5, false),
      portalMaterial,
      group,
    ).castShadow = true;
  }
  // Deterministic layered basalt islands, capped with warm sunlit stone.
  let seed = 247;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const rockMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    flatShading: true,
  });
  const rockBase = new THREE.Color(0x3d7379),
    rockTop = new THREE.Color(0xb5b69a);
  for (let i = 0; i < 38; i++) {
    const d = i * 108 - 150,
      side = i % 2 ? -1 : 1,
      offset = side * (115 + rand() * 230),
      h = 22 + rand() * 58;
    // Irregular triangulated island silhouettes; the middle section opens onto ocean.
    if (d > 1350 && d < 2280 && i % 3 !== 0) continue;
    const geom = new THREE.IcosahedronGeometry(1, 1);
    const positions = geom.attributes.position,
      colors = [];
    for (let j = 0; j < positions.count; j++) {
      const x = positions.getX(j),
        y = positions.getY(j),
        z = positions.getZ(j),
        rough = 0.9 + rand() * 0.16;
      positions.setXYZ(
        j,
        x * (45 + rand() * 6) * rough,
        y * h * 0.8,
        z * (70 + rand() * 9) * rough,
      );
      const col = rockBase.clone().lerp(rockTop, Math.max(0, y) * 0.9);
      colors.push(col.r, col.g, col.b);
    }
    geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geom.computeVertexNormals();
    const rock = mesh(geom, rockMaterial);
    rock.position.set(roadX(d) + offset, h * 0.18, -d);
    rock.rotation.y = rand() * Math.PI;
    // Low outcrops break the shoreline into smaller readable forms.
    const outcrop = mesh(new THREE.DodecahedronGeometry(16, 0), teal);
    outcrop.scale.set(1.8, 0.7, 2.8);
    outcrop.position.set(rock.position.x - side * 45, 1, -d + 35);
    outcrop.rotation.y = rand() * 3;
  }
  // White offshore turbines, with lightweight animated rotors.
  const turbines = [];
  for (let i = 0; i < 16; i++) {
    const d = i * 235 + 180,
      side = i % 2 ? -1 : 1,
      x = roadX(d) + side * (135 + (i % 3) * 55),
      h = 58 + (i % 4) * 7;
    const tower = mesh(new THREE.CylinderGeometry(0.65, 2, h, 7), edge);
    tower.position.set(x, h / 2, -d);
    const rotor = new THREE.Group();
    rotor.position.set(x, h, -d);
    root.add(rotor);
    mesh(new THREE.SphereGeometry(1.5, 8, 6), orange, rotor);
    for (let j = 0; j < 3; j++) {
      const arm = new THREE.Group();
      arm.rotation.z = (j * Math.PI * 2) / 3;
      rotor.add(arm);
      const blade = box(1.5, 23, 0.35, edge, 0, 12, 0, arm);
      blade.rotation.z = 0.06;
    }
    turbines.push(rotor);
  }
  const sky = mesh(
    new THREE.SphereGeometry(9000, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader:
        "varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying vec3 vPos;void main(){float h=normalize(vPos).y;vec3 low=vec3(.77,.85,.81);vec3 high=vec3(.24,.50,.60);vec3 color=mix(low,high,smoothstep(0.,.8,h));vec3 dir=normalize(vPos);float sun=pow(max(dot(dir,normalize(vec3(-.6,.23,-1.))),0.),220.);color+=vec3(.8,.47,.17)*sun*.75;gl_FragColor=vec4(color,1.);}",
    }),
  );
  const sunDisk = mesh(
    new THREE.CircleGeometry(120, 48),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false }),
  );
  sunDisk.position.set(-1800, 1050, -6500);
  const water = mesh(
    new THREE.PlaneGeometry(24000, 24000),
    new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader:
        "varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}",
      fragmentShader: `varying vec3 vWorld;uniform float time;
    void main(){vec2 p=vWorld.xz;float a=sin(p.x*.09+p.y*.045+time*.6);float b=sin(p.y*.24-p.x*.12-time*.9);float wave=pow(max(0.,a*b),5.);vec3 c=mix(vec3(.055,.27,.32),vec3(.23,.54,.54),.45+.22*a);c+=vec3(.38,.46,.36)*wave*.4;float dist=distance(cameraPosition.xz,p);float fog=1.-exp(-dist*.0015);c=mix(c,vec3(.67,.79,.77),fog);gl_FragColor=vec4(c,1.);}`,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1;
  // Sun + sky lighting, with a tightly fitted shadow map that follows the car.
  scene.add(new THREE.HemisphereLight(0xd4f4ff, 0x637069, 1.3));
  const sun = new THREE.DirectionalLight(0xffe3b6, 2.5);
  sun.position.set(-90, 130, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -42,
    right: 42,
    top: 65,
    bottom: -35,
    near: 1,
    far: 300,
  });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  const finish = new THREE.Group();
  finish.position.copy(worldPos(LENGTH));
  root.add(finish);
  box(24, 1.4, 1, orange, 0, 10, 0, finish);
  for (const side of [-1, 1])
    box(1.2, 10, 1.2, orange, side * 12, 5, 0, finish);
  for (let i = 0; i < 24; i++)
    roadRibbon(
      -10 + (i * 20) / 24,
      -10 + ((i + 1) * 20) / 24,
      0.045,
      i % 2 ? edge : dark,
      LENGTH,
      LENGTH + 2.5,
      false,
    );
  // The last light is a real destination: a beacon on a rocky sea platform.
  const beaconD = LENGTH + 140,
    beaconX = roadX(beaconD);
  const base = mesh(new THREE.CylinderGeometry(72, 120, 38, 12), concrete);
  base.position.set(beaconX, -2, -beaconD);
  const tower = mesh(new THREE.CylinderGeometry(6, 12, 105, 16), edge);
  tower.position.set(beaconX, 68, -beaconD);
  tower.castShadow = true;
  for (const y of [46, 69, 92]) {
    const band = mesh(
      new THREE.CylinderGeometry(
        12 - (y - 15) * 0.057,
        12 - (y - 15) * 0.057,
        7,
        16,
      ),
      orange,
    );
    band.position.set(beaconX, y, -beaconD);
  }
  const lantern = mesh(new THREE.CylinderGeometry(8.5, 8.5, 8, 12), glow);
  lantern.position.set(beaconX, 124, -beaconD);
  const roof = mesh(new THREE.ConeGeometry(11, 9, 12), dark);
  roof.position.set(beaconX, 132, -beaconD);
  const beamGroup = new THREE.Group();
  beamGroup.position.set(beaconX, 124, -beaconD);
  root.add(beamGroup);
  const beam = mesh(
    new THREE.ConeGeometry(18, 380, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffe5a0,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
    beamGroup,
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.x = 190;
  // Soft contact shadow keeps the car grounded without an expensive reflection pass.
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 128;
  const ctx = shadowCanvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  gradient.addColorStop(0, "rgba(0,10,14,.6)");
  gradient.addColorStop(1, "rgba(0,10,14,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const shadow = mesh(
    new THREE.PlaneGeometry(4.2, 6.7),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(shadowCanvas),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  const trails = [];
  for (const side of [-1, 1]) {
    const t = mesh(
      new THREE.PlaneGeometry(0.18, 11),
      new THREE.MeshBasicMaterial({
        color: 0x9ffff0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    t.rotation.x = -Math.PI / 2;
    trails.push({ mesh: t, side });
  }
  const excluded = new Set([
    sky,
    water,
    sunDisk,
    shadow,
    beamGroup,
    ...turbines,
    ...gateMeshes.map((g) => g.group),
    ...trails.map((t) => t.mesh),
  ]);
  const batches = new Map();
  function gather(o) {
    if (excluded.has(o) || o.isInstancedMesh) return;
    if (o.isMesh && !o.material.isShaderMaterial && !o.material.vertexColors) {
      if (!batches.has(o.material)) batches.set(o.material, []);
      batches.get(o.material).push(o);
    }
    for (const child of o.children) gather(child);
  }
  root.updateMatrixWorld(true);
  gather(root);
  for (const [material, parts] of batches) {
    if (parts.length < 2) continue;
    const geometries = [];
    let count = 0;
    for (const part of parts) {
      const g = part.geometry.index
        ? part.geometry.toNonIndexed()
        : part.geometry.clone();
      g.applyMatrix4(part.matrixWorld);
      count += g.attributes.position.count;
      geometries.push(g);
    }
    const positions = new Float32Array(count * 3),
      normals = new Float32Array(count * 3);
    let offset = 0;
    for (const g of geometries) {
      positions.set(g.attributes.position.array, offset);
      normals.set(g.attributes.normal.array, offset);
      offset += g.attributes.position.array.length;
      g.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.computeBoundingSphere();
    for (const part of parts) {
      part.removeFromParent();
      part.geometry.dispose();
    }
    const combined = mesh(geometry, material);
    combined.castShadow = true;
  }
  function update(s, dt, time) {
    const x = roadX(s.d) + s.x;
    water.material.uniforms.time.value = time;
    sky.position.set(x, 0, -s.d);
    sunDisk.position.z = -s.d - 6500;
    turbines.forEach(
      (r, i) => (r.rotation.z = time * (0.17 + (i % 3) * 0.025)),
    );
    beamGroup.rotation.y = time * 0.17;
    sun.position.set(x - 70, ROAD_Y + 100, -s.d + 35);
    sun.target.position.set(x, ROAD_Y, -s.d - 20);
    shadow.position.set(x, ROAD_Y + 0.055, -s.d);
    shadow.visible = !inGap(s.d);
    shadow.material.opacity = Math.max(0.12, 1 - s.y / 10);
    shadow.scale.setScalar(1 + s.y * 0.06);
    for (const t of trails) {
      t.mesh.visible = s.boosting;
      t.mesh.material.opacity = 0.35;
      t.mesh.position.set(x + t.side * 0.9, ROAD_Y + s.y + 0.5, -s.d + 8);
    }
    gateMeshes.forEach(({ group, light, index }) => {
      group.visible = !s.processed.has("g" + index);
      light.material = glow;
      group.rotation.z = Math.sin(time * 1.3 + index) * 0.025;
    });
  }
  return {
    root,
    update,
    worldPos,
    sun,
    materials,
    gateMeshes,
    ROAD_Y,
    setQuality: (low) => {
      renderer.shadowMap.enabled = !low;
      sun.castShadow = !low;
    },
  };
}
